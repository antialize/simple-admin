import * as fs from 'fs';
import { IHostDown, IHostUp, ACTION } from '../../shared/actions'
import * as message from './messages'
import * as tls from 'tls';
import { JobOwner } from './jobowner'
import * as crypt from './crypt'
import { webClients, msg, hostClients, db } from './instances'
import { errorHandler } from './error';
import { log } from 'winston';
import { Job } from './job';


function delay(time: number) {
    return new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, time);
    });
}

export class HostClient extends JobOwner {
    private socket: tls.TLSSocket;
    private buff = Buffer.alloc(4 * 1024 * 1024);
    private used = 0;
    nextJobId = 100;
    auth: boolean | null = null;
    hostname: string | null = null;
    id: number | null = null;
    pingId: number = 10;
    pingTimer: NodeJS.Timer | null = null;
    pingStart: number | null = null;
    closeHandled = false;

    constructor(socket: tls.TLSSocket) {
        super();
        this.socket = socket;
        this.socket.on('close', () => this.onClose());
        this.socket.on('data', (data: any) => this.onData(data as Buffer));
        this.socket.on('error', (err: Error) => {
            log('warn', "Client socket error", { hostname: this.hostname, error: err });
        });
        this.pingTimer = setTimeout(() => { this.sendPing() }, 10000);;
    }

    sendPing() {
        this.pingTimer = null;
        const time = process.hrtime();
        this.pingStart = time[0] + time[1] * 1e-9;
        this.sendMessage({ type: 'ping', id: this.pingId++ });
        this.pingTimer = setTimeout(() => { this.onPingTimeout() }, 80000);
    }

    onPingTimeout() {
        this.pingTimer = null;
        this.closeHandled = true;
        log('warn', "Client ping timeout", { hostname: this.hostname });
        this.socket.end();
    }

    onPingResponce(id: number) {
        if (!this.pingTimer) return;
        clearTimeout(this.pingTimer);
        const time = process.hrtime();
        const pingEnd = time[0] + time[1] * 1e-9;
        this.pingTimer = setTimeout(() => { this.sendPing() }, 9000);
    }

    async setReconnectTimeout() {
        const id = this.id;
        if (id === null || this.hostname === null) return;
        let c = await db.getHostContentByName(this.hostname);
        if (!c || !c.content || !c.content.messageOnDown) return;
        hostClients.downMessageTimeouts[id] = setTimeout(() => {
            msg.emit(id, "Host down", "Has been down for more than 5 minutes.");
        }, 5*60*60);
    }

    onClose() {
        if (this.pingTimer != null)
            clearTimeout(this.pingTimer);

        if (!this.auth) {
            log('info', "Bad auth for client", { hostname: this.hostname });
            return;
        }

        if (this.id == null) throw Error("Missing host id");

        if (!this.closeHandled)
            msg.emit(this.id, "Host down", "Connection closed.");

        log('info', "Client disconnected", { hostname: this.hostname });

        if (this.id in hostClients.hostClients)
            delete hostClients.hostClients[this.id];

        let act: IHostDown = { type: ACTION.HostDown, id: this.id };
        webClients.broadcast(act);
        this.kill();

        this.setReconnectTimeout();
    }

    removeJob(job: Job, m: message.Failure | message.Success | null) {
        if (this.id == null) throw Error("Missing host id");
        super.removeJob(job, m);
    }

    async validateAuth(obj: message.Auth) {
        let res = await db.getHostContentByName(obj.hostname);
        if (res && await crypt.validate(obj.password, res && res.content && (res.content as any).password))
            return res.id;
        return null;
    }

    async onMessage(msg: Buffer) {
        if (this.auth === false) return;
        const obj: message.Incomming = JSON.parse(msg.toString('utf8'))
        if (this.auth === null) {
            if (obj.type != "auth") {
                log('warn', "Client invalid auth", { address: this.socket.remoteAddress, port: this.socket.remotePort, obj });
                this.socket.end();
                this.auth = false;
                return;
            }

            let [id, _] = await Promise.all<number | null, void>([this.validateAuth(obj), delay(1000)]);
            if (id !== null) {
                log('info', "Client authorized", { hostname: obj['hostname'], address: this.socket.remoteAddress, port: this.socket.remotePort });
                this.hostname = obj['hostname'];
                this.auth = true;
                this.id = id;
                const to = hostClients.downMessageTimeouts[this.id];
                if (to) {
                    clearTimeout(to);
                    delete hostClients.downMessageTimeouts[this.id];
                }
                hostClients.hostClients[this.id] = this;
                let act: IHostUp = { type: ACTION.HostUp, id: this.id };
                webClients.broadcast(act);
            } else {
                log('warn', "Client invalid auth", {address: this.socket.remoteAddress, port: this.socket.remotePort, obj});
                this.socket.end();
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

    onData(data: Buffer) {
        let start = 0;
        while (true) {
            const idx = data.indexOf('\x1e', start);
            if (idx == -1) break;
            const part = data.slice(start, idx);

            let messageData: Buffer;
            if (this.used == 0)
                messageData = part;
            else {
                messageData = this.buff.slice(0, this.used + part.length);
                this.used = 0;
            }
            this.onMessage(messageData).catch(errorHandler("HostClient::onMessage"));
            start = idx + 1;
        }
        if (start < data.length)
            this.used += data.copy(this.buff, this.used, start)
    }

    sendMessage(obj: message.Outgoing) {
        this.socket.write(JSON.stringify(obj) + '\x1e');
    }
}

export class HostClients {
    downMessageTimeouts: {[id:number]: NodeJS.Timer} = {};
    hostClients: { [id: number]: HostClient } = {};
    start() {
        const privateKey = fs.readFileSync('domain.key', 'utf8');
        const certificate = fs.readFileSync('chained.pem', 'utf8');
        const options = { key: privateKey, cert: certificate };

        const hostServer = tls.createServer(options, socket => {
            log('info', "Client connected", {address: socket.remoteAddress, port: socket.remotePort});
            new HostClient(socket);
        });
        hostServer.on('error', (err) => {
            log('error', "Host server error", {err});
        });
        hostServer.listen(8888, '0.0.0.0');
        hostServer.on('listening' , () => {
            log('info', "Host server started on port 8888");
        });
        hostServer.on('close' , () => {
            log('info', "Host server stopped");
        });
    }
}
