import 'xterm/css/xterm.css'
import Cookies from 'js-cookie';
import {FitAddon} from 'xterm-addon-fit';
import { Terminal }  from 'xterm';
import { Button, Chip } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

class Connection {
    connected = false;

    constructor(public hostId: number, public connectionId: number, public nameChanged: (id: number, name: string) => void) {
        this.term = new Terminal({ cursorBlink: true, scrollback: 10000 });
        this.fit = new FitAddon();
        this.term.loadAddon(this.fit);
    }

    connect() {
        if (this.connected) return;
        const term = this.term;
        this.connected = true;
        const socket = new WebSocket((window.location.protocol == "http:"? "ws://" : "wss://") + window.location.host + '/terminal?server=' + this.hostId + '&cols=80&rows=150&session=' + Cookies.get("simple-admin-session"));
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
        this.term.dispose();
    }

    reset() {
        this.term.reset();
    }

    oldsize: [number, number] = [0, 0]
    term: Terminal;
    fit: FitAddon;
    socket?: WebSocket;
    name: string = "";
}

class HostInfo {
    next: number = 1;
    cachedCurrent: number | null = null;
    connections: { [id: number]: Connection } = {}
};

let hostConnections: { [id: number]: HostInfo } = {}

export default function HostTerminals(props: {id: number}) {
    if (!(props.id in hostConnections))
        hostConnections[props.id] = new HostInfo();
    let info = hostConnections[props.id];
    let termContainerDiv = useRef<HTMLDivElement | null>(null);
    let outerDiv = useRef<HTMLDivElement | null>(null);
    let [names, setNames] = useState<{ [id: number]: string }>(() => {
        const names: { [id: number]: string } = {};
        for (const id in info.connections)
            names[id] = info.connections[id].name;
        return names;
    });
    let [current, setCurrent] = useState(info.cachedCurrent);

    useEffect(() => {
        info.cachedCurrent = current;
        if (current == null) return;
        if (termContainerDiv.current == null) return;
        let div = termContainerDiv.current;
        const conn = info.connections[current];

        if (conn.term.element) {
            div.appendChild(conn.term.element);
        } else {
            conn.term.open(div);
        }

        let interval = window.setInterval(() => {
            conn.fit.fit();
        }, 500);

        return () => {
            if (conn.term.element) {
                div?.removeChild(conn.term.element);
            }
            window.clearInterval(interval);
        }
    }, [current]);


    let closeTerminal = (id: number) => {
        //if (!confirm("Close terminal?")) return;
        const names2 = Object.assign({}, names);
        delete names2[id];

        let other: number | null = null;
        for (const id2 in names2) other = +id2;
        setNames(names2);
        setCurrent(other);

        const conn = info.connections[id];
        conn.disconnect();
        delete info.connections[id];
    };

    let newTerminal = () => {
        let id = info.next;
        info.next++;

        const name = "Terminal " + id;
        const names2 = Object.assign({}, names);
        names2[id] = name;

        if (!(id in info.connections)) {
            let conn = new Connection(props.id, id, (id: number, name: string) => {
                let names2 = Object.assign({}, names);
                names2[id] = name;
                setNames(names2);
            })
            conn.connect();
            conn.name = "Terminal " + id;
            info.connections[id] = conn;
        }
        setNames(names2);
        setCurrent(id);
    };

    useEffect(() => {
        if (Object.keys(info.connections).length ===0)
            newTerminal();
    }, []);

    let reset = () => {
        if (current === null) return;
        const conn = info.connections[current];
        conn.reset();
    };

    let toggleFullScreen = () => {
        if (outerDiv.current == null) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            outerDiv.current.requestFullscreen();
        }
    };


    let ids = Object.keys(names).map((v) => +v);
    ids.sort((a, b) => a - b);
    let terms: JSX.Element[] = ids.map(id => {
        let style: React.CSSProperties = { margin: 4 };
        if (id == current)
            style.backgroundColor = 'rgb(0, 188, 212)';

        return <Chip key={id} style={style} onClick={() => setCurrent(id)} onDelete={() => closeTerminal(id)} label={names[id]} />
    });

    return (
        <div style={{ height: "700px" }}>
            <div ref={outerDiv} style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {terms}
                    <Chip onClick={() => newTerminal()} style={{ margin: 4 }} label="+" />
                    <div style={{ marginLeft: 'auto' }} />
                    <Button variant="contained" onClick={() => reset()} style={{ margin: 4, alignSelf: 'flex-end' }}>Reset</Button>
                    <Button variant="contained" onClick={() => toggleFullScreen()} style={{ margin: 4, alignSelf: 'flex-end' }}>Full screen</Button>
                </div>
                <div ref={termContainerDiv} style={{ flex: 1 }} />
            </div>
        </div>
    )
}




