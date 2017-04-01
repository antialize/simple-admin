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
import {JobOwner} from './job'
import {StatusJob} from './jobs/statusJob'
import {IHostClient} from './interfaces';
import * as msg from './msg';

export const hostClients:{[id:number]:HostClient} = {};
let hostServer: net.Server;

function delay(time:number) {
  return new Promise<void>(resolve => {
    setTimeout(() => { resolve();
    }, time);
  });
}

export class HostClient extends JobOwner implements IHostClient {
    private socket: tls.ClearTextStream;
    private buff = Buffer.alloc(4*1024*1024);
    private used = 0;
    nextJobId = 100;

    auth: boolean = null;
    hostname:string = null;
    id: number = null;
    pingId: number = 10;
    status: IStatus = null;
    pingTimer: NodeJS.Timer = null;
    pingStart: number = null;
    closeHandled = false;

    constructor(socket: tls.ClearTextStream) {
        super();
        this.socket = socket;
        this.socket.on('close', ()=>this.onClose());
        this.socket.on('data', (data)=>this.onData(data as Buffer));
        this.pingTimer = setTimeout(()=>{this.sendPing()}, 10000);;
    }

    sendPing() {
        this.pingTimer = null;
        const time = process.hrtime();
        this.pingStart = time[0] + time[1] * 1e-9;
        this.sendMessage({type: 'ping', id: this.pingId++});
        this.pingTimer = setTimeout(()=>{this.onPingTimeout()}, 20000);
    }

    onPingTimeout() {
        this.pingTimer = null;
        msg.emit(this.id, "Host down", "Did not respond to ping within 20 seconds.");
        this.closeHandled = true;
        console.log("Ping timeout", this.hostname);
        this.socket.end();
    }

    onPingResponce(id:number) {
        clearTimeout(this.pingTimer);
        const time = process.hrtime();
        const pingEnd = time[0] + time[1] * 1e-9;
        console.log("Ping ", pingEnd - this.pingStart);
        this.pingTimer = setTimeout(()=>{this.sendPing()}, 9000);
    }


    onClose() {
        if (this.pingTimer != null)
            clearTimeout(this.pingTimer);

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
        switch (obj.type) {
        case "auth":
            this.socket.end();
            break;
        case "pong":
            this.onPingResponce(obj.id);
            break;
        default:
            const id = obj.id;
            if (id in this.jobs)
                this.jobs[id].handleMessage(obj);
        }
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