import * as net from 'net';
import * as fs from 'fs';
import * as webclient from './webclient'
import {IUpdateStatusAction, ACTION} from '../../shared/actions'
import {IStatus, IStatusUpdate, applyStatusUpdate} from '../../shared/status'
import * as message from './messages'
import * as WebSocket from 'ws';
import * as tls from 'tls';
import * as crypto from 'crypto';
import * as db from './db'

export const hostClients:{[id:number]:HostClient} = {};
let hostServer: net.Server;


export class JobOwner {
    jobs: {[id:number]: Job} = {};

    addJob(job:Job) {
        this.jobs[job.id] = job;
    }

    removeJob(job:Job, msg: message.Failure|message.Success|null) {
        delete this.jobs[job.id];
    }

    kill() {
        for (const id in this.jobs) {
            const job = this.jobs[+id] 
            if (this instanceof HostClient && job.client === this) job.client = null;
            if (job.owner == this) job.owner = null;
            job.kill();
        }
    }
}

export abstract class Job {
    id: number;
    running: boolean = false;

    constructor(public client: HostClient, id:number = null, public owner:JobOwner = null) {
        if (id === null)
            this.id = client.nextJobId++;
        else
            this.id = id;
        this.client.jobs[this.id] = this;
        if (this.owner !== null) this.owner.jobs[this.id] = this;
    }
    
   handleMessage(obj: message.Incomming) {
        switch(obj.type) {
        case 'success':
            this.running = false;
            this.kill(obj);
            break;    
        case 'failure':
            this.running = false;
            this.kill(obj);
            break;
        }
    }

    kill(msg: message.Failure|message.Success|null = null) {
        if (this.client !== null) {
            if (this.running) {
                let msg: message.Kill = {'type': 'kill', 'id': this.id}
                this.client.sendMessage(msg);
            }
            this.client.removeJob(this, msg);
            this.client = null;
        }
        if (this.owner !== null) {
            this.owner.removeJob(this, msg);
            this.owner = null;
        }
    }
}

class StatusJob extends Job {
    constructor(client: HostClient) {
        super(client, 0, null);
        let msg: message.RunScript = {
            'type': 'run_script', 
            'id': 0, 
            'name': 'status.py', 
            'interperter': '/usr/bin/python3', 
            'content': fs.readFileSync('status.py', 'utf-8'),
            'args': [],
            'stdin_type': 'none',
            'stdout_type': 'blocked_json'
        };
        this.client.sendMessage(msg);
        this.running = true;
    }

    handleMessage(obj: message.Incomming) {
        switch(obj.type) {
        case 'data':
            if (obj.source == 'stdout') this.client.updateStatus(obj.data as IStatusUpdate);
            break;
        default:
            super.handleMessage(obj);
        }
    }
};

export class ShellJob extends Job {
    constructor(client: HostClient, public sock:WebSocket, cols:number, rows:number) {
        super(client, null, null);

        let msg: message.RunScript = {
            'type': 'run_script',
            'id': this.id,
            'name': 'shell.py',
            'interperter': '/usr/bin/python3',
            'content': fs.readFileSync('shell.py', 'utf-8'),
            'args': [""+cols, ""+rows],
            'stdin_type': 'binary',
            'stdout_type': 'binary',
            'stderr_type': 'binary'
        }
        this.client.sendMessage(msg);
        this.running = true;
        sock.on('message',(data:any)=>{
            let msg: message.Data = {
                'type': 'data',
                'id': this.id,
                'data': Buffer.from(data).toString('base64'),         
            }
            this.client.sendMessage(msg);
        });
        sock.on('close', (code:number, message:string) => {this.sock = null; this.kill();});
    }

    kill() {
        if (this.sock !== null) {
            this.sock.close();
            this.sock = null;
        }
        super.kill();
    }

    handleMessage(obj: message.Incomming) {
        switch(obj.type) {
        case 'data':
            if (obj.source == 'stdout') {
                this.sock.send(
                    Buffer.from(obj.data, 'base64').toString('binary')
                );
            };
        default:
            super.handleMessage(obj);
        }
    }
};

function delay(time:number) {
  return new Promise<void>(resolve => {
    setTimeout(() => { resolve();
    }, time);
  });
}

export class HostClient extends JobOwner {
    private socket: tls.ClearTextStream; 
    private buff = Buffer.alloc(4*1024*1024);
    private used = 0;
    nextJobId = 100;

    auth = null;
    hostname:string = null;
    id: number = null;

    status: IStatus = null;

    constructor(socket: tls.ClearTextStream) {
        super();
        this.socket = socket;
        this.socket.on('close', ()=>this.onClose());
        this.socket.on('data', (data)=>this.onData(data as Buffer));
    }

    onClose() {
        if (!this.auth) return;
        console.log("Client", this.hostname, "disconnected");
        if (this.id in hostClients)
            delete hostClients[this.id];
        this.kill();
    }

    async validateAuth(obj:message.Auth) {
        let res = await db.getHostContentByName(obj.hostname);
        if (res === null) return null;
        const hash1 = crypto.createHash('sha256')
        hash1.update(obj.password);
        const hash2 = crypto.createHash('sha256')
        hash2.update((res && res.content)?res.content.password:"theemptystring");
        if (crypto.timingSafeEqual(hash1.digest(), hash2.digest()) && res !== null) {
            return res.id;
        }
        return null;
    }

    async onMessage(obj:message.Incomming) {
        if (this.auth === false) return;
        if (this.auth === null) {
            if (obj.type != "auth") {
                console.log("Client from", this.socket.remoteAddress, this.socket.remotePort, "invalid auth", obj);
                this.socket.end();
                this.auth = false;
                return;
            }

            let [id,_] = await Promise.all<number, void>([this.validateAuth(obj), delay(1000)]);
            if (id !== null) {
                console.log("Client", obj['hostname'], "connected from", this.socket.remoteAddress, this.socket.remotePort);
                this.hostname = obj['hostname'];
                this.auth = true;
                this.id = id;
                new StatusJob(this);
                hostClients[this.id] = this;
            } else {
                console.log("Client from", this.socket.remoteAddress, this.socket.remotePort, "invalid auth", obj);
                this.auth = false;
            }
            return;
        }
        const id = obj['id'];
        if (id in this.jobs)
            this.jobs[id].handleMessage(obj);
    }

    onData(data:Buffer) {
        let start = 0;
        while (true) {
            const idx = data.indexOf('\x1e', start);
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
        this.socket.write(JSON.stringify(obj)+'\x1e');
    }

    updateStatus(update: IStatusUpdate) {
        this.status = applyStatusUpdate(this.status, update);
        webclient.webclients.forEach(c=>{
            let msg: IUpdateStatusAction = {
                type: ACTION.UpdateStatus,
                host: this.id,
                update: update
            };
            c.sendMessage(msg);
        });
    }
};

export function startServer() {
    const privateKey  = fs.readFileSync('key.pem', 'utf8');
    const certificate = fs.readFileSync('cert.pem', 'utf8');
    const options = {key: privateKey, cert: certificate};

    hostServer = tls.createServer(options, socket=>{
        console.log("Client connected from", socket.remoteAddress, socket.remotePort);
        new HostClient(socket);
    });
    hostServer.listen(8888, '127.0.0.1');
}