import "xterm/css/xterm.css";
import Cookies from "js-cookie";
import {FitAddon} from "xterm-addon-fit";
import {Terminal} from "xterm";
import {Button, Chip} from "@mui/material";
import {useEffect, useRef, useState} from "react";

class Connection {
    connected = false;

    constructor(
        public hostId: number,
        public connectionId: number,
        public nameChanged: (id: number, name: string) => void,
    ) {
        this.term = new Terminal({cursorBlink: true, scrollback: 10000});
        this.fit = new FitAddon();
        this.term.loadAddon(this.fit);
    }

    connect() {
        if (this.connected) return;
        const term = this.term;
        this.connected = true;
        const socket = new WebSocket(
            (window.location.protocol == "http:" ? "ws://" : "wss://") +
                window.location.host +
                "/terminal?server=" +
                this.hostId +
                "&cols=80&rows=150&session=" +
                Cookies.get("simple-admin-session"),
        );
        this.socket = socket;
        let buffer: string[] | null = [];

        socket.onmessage = msg => {
            term.write(msg.data);
        };

        socket.onopen = () => {
            if (buffer)
                for (const item of buffer) {
                    socket.send(item);
                }
            buffer = null;
        };

        const send = (msg: string) => {
            if (buffer === null) socket.send(msg);
            else buffer.push(msg);
        };

        term.onData(data => {
            send("d" + data + "\0");
        });

        term.onTitleChange(title => {
            this.name = title;
            this.nameChanged(this.connectionId, title);
        });
        term.onResize(size => {
            if (this.oldsize[0] == size.rows && this.oldsize[1] == size.cols) return;
            this.oldsize = [size.rows, size.cols];
            send("r" + size.rows + "," + size.cols + "\0");
        });
    }

    disconnect() {
        if (this.socket) this.socket.close();
        delete this.socket;
        this.term.dispose();
    }

    reset() {
        this.term.reset();
    }

    oldsize: [number, number] = [0, 0];
    term: Terminal;
    fit: FitAddon;
    socket?: WebSocket;
    name: string = "";
}

class HostInfo {
    next: number = 1;
    cachedCurrent: number | null = null;
    connections = new Map<number, Connection>();
}

const hostConnections = new Map<number, HostInfo>();

export default function HostTerminals(props: {id: number}) {
    if (!hostConnections.has(props.id)) hostConnections.set(props.id, new HostInfo());
    const info = hostConnections.get(props.id)!;
    const termContainerDiv = useRef<HTMLDivElement | null>(null);
    const outerDiv = useRef<HTMLDivElement | null>(null);
    const [names, setNames] = useState<Map<number, string>>(() => {
        const names = new Map<number, string>();
        for (const [id, conn] of info.connections) names.set(id, conn.name);
        return names;
    });
    const [current, setCurrent] = useState(info.cachedCurrent);

    useEffect(() => {
        info.cachedCurrent = current;
        if (current == null) return;
        if (termContainerDiv.current == null) return;
        const div = termContainerDiv.current;
        const conn = info.connections.get(current)!;

        if (conn.term.element) {
            div.appendChild(conn.term.element);
        } else {
            conn.term.open(div);
        }

        const interval = window.setInterval(() => {
            conn.fit.fit();
        }, 500);

        return () => {
            if (conn.term.element) {
                div?.removeChild(conn.term.element);
            }
            window.clearInterval(interval);
        };
    }, [current]);

    const closeTerminal = (id: number) => {
        // if (!confirm("Close terminal?")) return;
        const names2 = new Map(names);
        names2.delete(id);

        let other: number | null = null;
        for (const id2 in names2) other = +id2;
        setNames(names2);
        setCurrent(other);

        const conn = info.connections.get(id)!;
        conn.disconnect();
        info.connections.delete(id);
    };

    const newTerminal = () => {
        const id = info.next;
        info.next++;

        const name = "Terminal " + id;
        const names2 = new Map(names);
        names2.set(id, name);

        if (!(id in info.connections)) {
            const conn = new Connection(props.id, id, (id: number, name: string) => {
                const names2 = new Map(names);
                names2.set(id, name);
                setNames(names2);
            });
            conn.connect();
            conn.name = "Terminal " + id;
            info.connections.set(id, conn);
        }
        setNames(names2);
        setCurrent(id);
    };

    useEffect(() => {
        if (Object.keys(info.connections).length === 0) newTerminal();
    }, []);

    const reset = () => {
        if (current === null) return;
        const conn = info.connections.get(current)!;
        conn.reset();
    };

    const toggleFullScreen = () => {
        if (outerDiv.current == null) return;
        if (document.fullscreenElement) {
            document.exitFullscreen().then(
                () => {},
                () => {},
            );
        } else {
            outerDiv.current.requestFullscreen().then(
                () => {},
                () => {},
            );
        }
    };

    const ids = Object.keys(names).map(v => +v);
    ids.sort((a, b) => a - b);
    const terms: JSX.Element[] = ids.map(id => {
        const style: React.CSSProperties = {margin: 4};
        if (id == current) style.backgroundColor = "rgb(0, 188, 212)";

        return (
            <Chip
                key={id}
                style={style}
                onClick={() => {
                    setCurrent(id);
                }}
                onDelete={() => {
                    closeTerminal(id);
                }}
                label={names.get(id)}
            />
        );
    });

    return (
        <div style={{height: "700px"}}>
            <div
                ref={outerDiv}
                style={{display: "flex", flexDirection: "column", width: "100%", height: "100%"}}>
                <div style={{display: "flex", flexWrap: "wrap"}}>
                    {terms}
                    <Chip
                        onClick={() => {
                            newTerminal();
                        }}
                        style={{margin: 4}}
                        label="+"
                    />
                    <div style={{marginLeft: "auto"}} />
                    <Button
                        variant="contained"
                        onClick={() => {
                            reset();
                        }}
                        style={{margin: 4, alignSelf: "flex-end"}}>
                        Reset
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            toggleFullScreen();
                        }}
                        style={{margin: 4, alignSelf: "flex-end"}}>
                        Full screen
                    </Button>
                </div>
                <div ref={termContainerDiv} style={{flex: 1}} />
            </div>
        </div>
    );
}
