import * as net from 'net';
import * as fs from 'fs';
import * as webclient from './webclient'
import {ISetStatusAction, ACTION} from '../../shared/actions'
import {IStatus} from '../../shared/status'
import * as message from './messages'

let hostClients = new Set<HostClient>();
let hostServer: net.Server;

class StatusJob {
    id: number;
    client: HostClient;
    constructor(client: HostClient) {
        this.id = 0;
        this.client = client;
        client.jobs[this.id] = this;
        this.start();
    }
    
    start() {
        let msg: message.RunScript = {
            'type': 'run_script', 
            'id': 0, 
            'name': 'status.sh', 
            'interperter': '/usr/bin/python', 
            'content': fs.readFileSync('status.py', 'utf-8'),
            'args': [],
            'stdin_type': 'none',
            'stdout_type': 'blocked_json'
        };
        this.client.sendMessage(msg);
    }

    handleMessage(obj: message.Incomming) {
        switch(obj.type) {
        case 'data':
            if (obj.source == 'stdout') this.client.setStatus(obj.data as IStatus);
        }
    }
};


class HostClient {
    private socket: net.Socket;
    private buff = Buffer.alloc(4*1024*1024);
    private used = 0;
    private nextJobId = 100;
    jobs = new Map<number, any>();
    status: IStatus;

    constructor(socket: net.Socket) {
        this.socket = socket;
        this.socket.on('close', ()=>this.onClose());
        this.socket.on('data', (data)=>this.onData(data));
        console.log("Client connected");
        new StatusJob(this);
    }

    onClose() {
        console.log("Client disconnected");
        hostClients.delete(this);
    }

    onMessage(obj:message.Incomming) {
        const id = obj['id'];
        if (id in this.jobs)
            this.jobs[id].handleMessage(obj);
    }

    onData(data:Buffer) {
        let start = 0;
        while (true) {
            const idx = data.indexOf(0, start);
            if (idx == -1) break;
            const part = data.slice(start, idx);
            if (this.used == 0)
                this.onMessage(JSON.parse(part.toString('utf8')));
            else {
                part.copy(this.buff, this.used);
                this.onMessage(JSON.parse(this.buff.slice(0, this.used+part.length).toString('utf-8')));
                this.used = 0
            }
            start = idx+1;
        }
        if (start < data.length)
        this.used += data.copy(this.buff, this.used, start)
    }

    sendMessage(obj:message.Outgoing) {
        this.socket.write(JSON.stringify(obj)+'\0');
    }

    setStatus(s: IStatus) {
        this.status = s;
        webclient.webclients.forEach(c=>{
            let msg: ISetStatusAction = {
                type: ACTION.SetStatus,
                name: s.uname.nodename,
                status: s
            };
            c.sendMessage(msg);
        });
    }
};

export function startServer() {
    hostServer = net.createServer(socket=>{hostClients.add(new HostClient(socket));});
    hostServer.listen(8888, '127.0.0.1');
}