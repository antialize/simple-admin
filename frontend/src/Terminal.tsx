import 'xterm/css/xterm.css'
import * as $ from 'jquery'
import * as Cookies from 'js-cookie';
import * as React from "react";
import {FitAddon} from 'xterm-addon-fit';
import Button from "@material-ui/core/Button";
import Chip from "@material-ui/core/Chip";
import { Terminal }  from 'xterm';
import { remoteHost } from './config';
import nullCheck from '../../shared/nullCheck';

interface Props {
    id: number;
}

class Connection {
    connected = false;

    constructor(public hostId: number, public connectionId: number, public nameChanged: (id: number, name: string) => void) {
        this.term = new Terminal({ cursorBlink: true, scrollback: 10000 });
        this.fit = new FitAddon();
        this.term.loadAddon(this.fit);
    }

    connect() {
        if (this.connected) return;
        const term = nullCheck(this.term);
        this.connected = true;
        let protocol = 'wss://';
        if (remoteHost.endsWith("localhost")) protocol = "ws://";
        const socket = new WebSocket(protocol + remoteHost + '/terminal?server=' + this.hostId + '&cols=80&rows=150&session=' + Cookies.get("simple-admin-session"));
        this.socket = socket;
        let buffer: string[] | null = [];

        socket.onmessage = (msg) => {
            term.write(msg.data);
        }

        socket.onopen = () => {
            if (buffer)
                for (const item of buffer) {
                    socket.send(item);
                }
            buffer = null;
        };

        let send = (msg: string) => {
            if (buffer === null)
                socket.send(msg);
            else
                buffer.push(msg);
        }

        term.onData( (data) => {
            send('d' + data + "\0");
        });

        term.onTitleChange( (title) => {
            this.name = title;
            this.nameChanged(this.connectionId, title);
        });
        term.onResize( (size) => {
            if (this.oldsize[0] == size.rows && this.oldsize[1] == size.cols) return;
            this.oldsize = [size.rows, size.cols];
            send('r' + size.rows + "," + size.cols + '\0');
        });
    }

    disconnect() {
        if (this.socket)
            this.socket.close();
        delete this.socket;
        delete this.term;
    }

    reset() {
        this.term && this.term.reset();
    }

    oldsize: [number, number] = [0, 0]
    term?: Terminal;
    fit: FitAddon;
    termDiv?: HTMLDivElement;
    socket?: WebSocket;
    name: string = "";
}

class HostInfo {
    next: number = 1;
    cachedCurrent: number | null = null;
    connections: { [id: number]: Connection } = {}
};

interface State {
    current: number | null;
    names: { [id: number]: string };
}

class HostTerminals extends React.Component<Props, State> {
    outerDiv: HTMLDivElement | null = null;
    termContainerDiv: HTMLDivElement | null = null;
    interval: any = null;
    state: State = { current: null, names: {} }
    info: HostInfo;
    mounted: boolean = false;

    static hostConnections: { [id: number]: HostInfo } = {};

    constructor(props: Props) {
        super(props);
        if (!(props.id in HostTerminals.hostConnections))
            HostTerminals.hostConnections[props.id] = new HostInfo();
        this.info = HostTerminals.hostConnections[props.id];
        if (Object.keys(this.info.connections).length === 0)
            this.newTerminal();
        else {
            const names: { [id: number]: string } = {};
            for (const id in this.info.connections)
                names[id] = this.info.connections[id].name;
            this.state = { current: this.info.cachedCurrent, names: names };
        }
    }

    newTerminal() {
        let id = this.info.next;
        this.info.next++;

        const name = "Terminal " + id;
        const names = Object.assign({}, this.state.names);
        names[id] = name;

        if (this.mounted) {
            this.setState({ names: names });
            this.setCurrent(id);
        } else
            this.state = { names: names, current: id };
    }

    reset() {
        if (this.state.current === null) return;
        const conn = this.info.connections[this.state.current];
        conn.reset();
    }

    setCurrent(id: number | null) {
        if (this.state.current !== null) {
            const conn = this.info.connections[this.state.current];
            if (conn/* && conn.termDiv === this.outerDiv*/) {
                //this.outerDiv.removeChild(conn.termDiv);
                clearInterval(this.interval);
            }
        }
        if (id !== null) {
            if (!(id in this.info.connections))
                this.info.connections[id] = new Connection(this.props.id, id, (id: number, name: string) => {
                    let names = Object.assign({}, this.state.names);
                    names[id] = name;
                    this.setState({ names: names });
                })
            const conn = this.info.connections[id];
            conn.name = "Terminal " + id;
            conn.term && this.outerDiv && conn.term.open(this.outerDiv);
            conn.connect();

            $(window).resize(() => {
                conn.fit.fit();
            });
            this.interval = setInterval(() => {
                conn.fit.fit();
            }, 2000);
        }
        if (id != this.state.current)
            this.setState({ current: id })
    }

    componentDidMount() {
        this.mounted = true;
        this.setCurrent(this.state.current);
    }

    componentWillUnmount() {
        this.info.cachedCurrent = this.state.current;
        this.setCurrent(null);
        this.mounted = false;

    }

    toggleFullScreen() {
        const d = document as any;
        const fse = d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement || d.webkitFullscreenElement;
        const exit = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen || d.webkitExitFullscreen;

        if (!fse) {
            const e = this.outerDiv as any;
            var requestFullScreen = e.requestFullscreen || e.msRequestFullscreen || e.mozRequestFullScreen || e.webkitRequestFullscreen;
            requestFullScreen.call(e);
        } else {
            exit.call(d);
        }
    }

    closeTerminal(id: number) {
        //if (!confirm("Close terminal?")) return;
        const names = Object.assign({}, this.state.names);
        delete names[id];

        let other: number | null = null;
        for (const id2 in names) other = +id2;
        this.setCurrent(other);
        this.setState({ names: names });

        const conn = this.info.connections[id];
        conn.disconnect();
        delete this.info.connections[id];
    }

    render() {
        let ids = Object.keys(this.state.names).map((v) => +v);
        ids.sort((a, b) => a - b);
        let terms: JSX.Element[] = ids.map(id => {
            let style: React.CSSProperties = { margin: 4 };
            if (id == this.state.current)
                style.backgroundColor = 'rgb(0, 188, 212)';

            return <Chip key={id} style={style} onClick={() => this.setCurrent(id)} onDelete={() => this.closeTerminal(id)} label={this.state.names[id]} />
        });

        return (
            <div style={{ height: "700px" }}>
                <div ref={(div) => this.outerDiv = div} style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {terms}
                        <Chip onClick={() => this.newTerminal()} style={{ margin: 4 }} label="+" />
                        <div style={{ marginLeft: 'auto' }} />
                        <Button variant="contained" onClick={() => this.reset()} style={{ margin: 4, alignSelf: 'flex-end' }}>Reset</Button>
                        <Button variant="contained" onClick={() => this.toggleFullScreen()} style={{ margin: 4, alignSelf: 'flex-end' }}>Full screen</Button>
                    </div>
                    <div ref={(div) => this.termContainerDiv = div} style={{ flex: 1 }} />
                </div>
            </div>
        )
    }
}

export default HostTerminals;
