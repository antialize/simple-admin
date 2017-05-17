import * as net from 'net';
import * as fs from 'fs';
import { IUpdateStatusAction, IHostDown, ACTION } from '../../shared/actions'
import { IStatus, IStatusUpdate, applyStatusUpdate } from '../../shared/status'
import * as message from './messages'
import * as WebSocket from 'ws';
import * as tls from 'tls';
import * as crypto from 'crypto';
import { JobOwner } from './jobowner'
import { StatusJob } from './jobs/statusJob'
import * as bcrypt from 'bcrypt'
import { webClients, msg, hostClients, db } from './instances'

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

    auth: boolean = null;
    hostname: string = null;
    id: number = null;
    pingId: number = 10;
    status: IStatus = null;
    pingTimer: NodeJS.Timer = null;
    pingStart: number = null;
    closeHandled = false;

    constructor(socket: tls.TLSSocket) {
        super();
        this.socket = socket;
        this.socket.on('close', () => this.onClose());
        this.socket.on('data', (data: any) => this.onData(data as Buffer));
        this.pingTimer = setTimeout(() => { this.sendPing() }, 10000);;
    }

    sendPing() {
        this.pingTimer = null;
        const time = process.hrtime();
        this.pingStart = time[0] + time[1] * 1e-9;
        this.sendMessage({ type: 'ping', id: this.pingId++ });
        this.pingTimer = setTimeout(() => { this.onPingTimeout() }, 20000);
    }

    onPingTimeout() {
        this.pingTimer = null;
        msg.emit(this.id, "Host down", "Did not respond to ping within 20 seconds.");
        this.closeHandled = true;
        console.log("Ping timeout", this.hostname);
        this.socket.end();
    }

    onPingResponce(id: number) {
        clearTimeout(this.pingTimer);
        const time = process.hrtime();
        const pingEnd = time[0] + time[1] * 1e-9;
        // console.log("Ping ", pingEnd - this.pingStart);
        this.pingTimer = setTimeout(() => { this.sendPing() }, 9000);
    }


    onClose() {
        if (this.pingTimer != null)
            clearTimeout(this.pingTimer);

        if (!this.auth) return;
        if (!this.closeHandled)
            msg.emit(this.id, "Host down", "Connection closed.");

        console.log("Client", this.hostname, "disconnected");
        if (this.id in hostClients.hostClients)
            delete hostClients.hostClients[this.id];

        let act: IHostDown = { type: ACTION.HostDown, id: this.id };
        webClients.broadcast(act);
        this.kill();
    }

    async validateAuth(obj: message.Auth) {
        let res = await db.getHostContentByName(obj.hostname);
        if (res === null) return null;
        if (bcrypt.compareSync(obj.password, (res && res.content) ? res.content.password : "theemptystring")
            && res !== null) {
            return res.id;
        }
        return null;
    }

    async onMessage(obj: message.Incomming) {
        if (this.auth === false) return;
        if (this.auth === null) {
            if (obj.type != "auth") {
                console.log("Client from", this.socket.remoteAddress, this.socket.remotePort, "invalid auth", obj);
                this.socket.end();
                this.auth = false;
                return;
            }

            let [id, _] = await Promise.all<number, void>([this.validateAuth(obj), delay(1000)]);
            if (id !== null) {
                console.log("Client", obj['hostname'], "connected from", this.socket.remoteAddress, this.socket.remotePort);
                this.hostname = obj['hostname'];
                this.auth = true;
                this.id = id;
                new StatusJob(this);
                hostClients.hostClients[this.id] = this;
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

    onData(data: Buffer) {
        let start = 0;
        while (true) {
            const idx = data.indexOf('\x1e', start);
            if (idx == -1) break;
            const part = data.slice(start, idx);
            if (this.used == 0)
                this.onMessage(JSON.parse(part.toString('utf8')));
            else {
                part.copy(this.buff, this.used);
                this.onMessage(JSON.parse(this.buff.slice(0, this.used + part.length).toString('utf-8')));
                this.used = 0
            }
            start = idx + 1;
        }
        if (start < data.length)
            this.used += data.copy(this.buff, this.used, start)
    }

    sendMessage(obj: message.Outgoing) {
        this.socket.write(JSON.stringify(obj) + '\x1e');
    }

    updateStatus(update: IStatusUpdate) {
        if (this.status && update.smart) {
            const importantSmart = new Set([5, 103, 171, 172, 175, 176, 181, 182, 184, 187, 188, 191, 197, 198, 200, 221]);
            for (const dev in update.smart) {
                const oldSmart = this.status.smart[dev];
                const newSmart = update.smart[dev];
                if (newSmart == null)
                    msg.emit(this.id, "S.M.A.R.T", "Disk " + dev + " dissapeared");
                else {
                    const oc: { [id: number]: number } = {};
                    for (const entry of oldSmart)
                        oc[entry.id] = entry.raw_value;

                    for (const entry of newSmart) {
                        if (!importantSmart.has(entry.id)) continue;
                        const oldVal = oc[entry.id] ? oc[entry.id] : 0;
                        if (oldVal >= entry.raw_value) continue;
                        msg.emit(this.id, "S.M.A.R.T",
                            "Disk " + dev + ": " + entry.name + "(" + entry.id + ")"
                            + " increased to " + entry.raw_value + " from " + oldVal);
                    }
                }
            }
        }

        if (this.status && update.mounts) {
            for (const target in update.mounts) {
                if (!(target in this.status.mounts)) continue;
                const o_mount = this.status.mounts[target];
                const o_free = o_mount.free_blocks / o_mount.blocks;

                const n_mount = update.mounts[target];
                const n_free = n_mount.free_blocks / n_mount.blocks;

                if (n_free < 0.1 && o_free >= 0.1) {
                    msg.emit(this.id, "File system", "Mount " + target + " has less than 10% free disk space");
                } else if (n_free < 0.01 && o_free >= 0.01) {
                    msg.emit(this.id, "File system", "Mount " + target + " has less than 1% free disk space");
                }
            }
        }

        this.status = applyStatusUpdate(this.status, update);;

        let m: IUpdateStatusAction = {
            type: ACTION.UpdateStatus,
            host: this.id,
            update: update
        };
        webClients.broadcast(m);
    }
}

export class HostClients {
    hostClients: { [id: number]: HostClient } = {};
    private hostServer: net.Server;

    start() {
        const privateKey = fs.readFileSync('domain.key', 'utf8');
        const certificate = fs.readFileSync('chained.pem', 'utf8');
        const options = { key: privateKey, cert: certificate };

        this.hostServer = tls.createServer(options, socket => {
            console.log("Client connected from", socket.remoteAddress, socket.remotePort);
            new HostClient(socket);
        });
        this.hostServer.listen(8888, '0.0.0.0');
    }
}
