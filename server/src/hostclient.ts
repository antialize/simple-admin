import * as net from 'net';
import * as fs from 'fs';
import { IUpdateStatusAction, IHostDown, ACTION } from '../../shared/actions'
import { IStatus, IStatusUpdate, applyStatusUpdate } from '../../shared/status'
import * as message from './messages'
import * as tls from 'tls';
import * as crypto from 'crypto';
import { JobOwner } from './jobowner'
import { MonitorJob } from './jobs/monitorJob'
import * as crypt from './crypt'
import { webClients, msg, hostClients, db } from './instances'
import { errorHandler } from './error';
import { log } from 'winston';
import { Job } from './job';
import { IMonitor, IMonitorProp, MonitorPropType, MonitorUnit } from '../../shared/monitor'
import * as stat from './stat';
import nullCheck from '../../shared/nullCheck';

enum Interval {
    instante = 0,
    five_minutes = 1,
    hour = 2,
};

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
    monitorRestartTime = 1000;
    reloadingMonitor = false;
    auth: boolean | null = null;
    hostname: string | null = null;
    id: number | null = null;
    pingId: number = 10;
    status: IStatus | null = null;
    pingTimer: NodeJS.Timer | null = null;
    pingStart: number | null = null;
    closeHandled = false;
    private monitorScript: string | null = null;
    private monitorJob: MonitorJob | null = null;
    private monitorContent: IMonitor[] | null = null;

    constructor(socket: tls.TLSSocket) {
        super();
        this.socket = socket;
        this.socket.on('close', () => this.onClose());
        this.socket.on('data', (data: any) => this.onData(data as Buffer));
        this.socket.on('error', (err: Error) => {
            log('warning', "Client socket error", { hostname: this.hostname, error: err });
        });
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
        if (this.id != null)
            msg.emit(this.id, "Host down", "Did not respond to ping within 20 seconds.");
        this.closeHandled = true;
        log('warning', "Client ping timeout", { hostname: this.hostname });
        this.socket.end();
    }

    onPingResponce(id: number) {
        if (!this.pingTimer) return;
        clearTimeout(this.pingTimer);
        const time = process.hrtime();
        const pingEnd = time[0] + time[1] * 1e-9;
        this.pingTimer = setTimeout(() => { this.sendPing() }, 9000);
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
        this.monitorJob = null;
        this.kill();
    }

    removeJob(job: Job, m: message.Failure | message.Success | null) {
        if (this.id == null) throw Error("Missing host id");

        if (job == this.monitorJob) {
            if (this.reloadingMonitor) {
                this.reloadingMonitor = false;
                this.monitorJob = new MonitorJob(this, this.monitorScript);
            } else {
                log('warning', "Monitor job died", { hostname: this.hostname });
                msg.emit(this.id, "Monitor job died", this.monitorJob.error);
                this.monitorJob = null;
                setTimeout(() => {
                    if (this.monitorJob != null) return;
                    log('info', "Restart monitor joxb", { hostname: this.hostname });
                    this.monitorJob = new MonitorJob(this, this.monitorScript);
                }, this.monitorRestartTime);
                this.monitorRestartTime *= 1.5;
            }
        }
        super.removeJob(job, m);
    }

    monitorChanged(script: string | null, content: IMonitor[] | null) {
        let md = this.monitorJob;
        this.monitorJob = null;
        log('info', "New monitor", { hostname: this.hostname, /*content*/ });
        this.monitorContent = content;
        this.monitorScript = script;
        this.monitorRestartTime = 1000;
        if (md) {
            this.reloadingMonitor = true;
            md.kill();
        } else {
            this.monitorJob = new MonitorJob(this, script);
        }
    }

    async setMonitor(script: string, content: IMonitor[]) {
        if (this.id == null) throw Error("Missing host id");

        await db.setHostMonitor(this.id, script, JSON.stringify(content));
        this.monitorChanged(script, content);
    }


    async validateAuth(obj: message.Auth) {
        let res = await db.getHostContentByName(obj.hostname);
        if (res && await crypt.validate(obj.password, res && res.content && (res.content as any).password))
            return res.id;
        return null;
    }

    async onMessage(obj: message.Incomming) {
        if (this.auth === false) return;
        if (this.auth === null) {
            if (obj.type != "auth") {
                log('warning', "Client invalid auth", { address: this.socket.remoteAddress, port: this.socket.remotePort, obj });
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
                hostClients.hostClients[this.id] = this;
                const res = await db.getHostMonitor(id);
                if (res)
                    this.monitorChanged(res.script, JSON.parse(res.content));
                else
                    this.monitorChanged(null, null);
            } else {
                log('warning', "Client invalid auth", {address: this.socket.remoteAddress, port: this.socket.remotePort, obj});
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
            if (this.used == 0)
                this.onMessage(JSON.parse(part.toString('utf8'))).catch(errorHandler("HostClient::onMessage"));
            else {
                part.copy(this.buff, this.used);
                this.onMessage(JSON.parse(this.buff.slice(0, this.used + part.length).toString('utf-8'))).catch(errorHandler("HostClient::onMessage"));;
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

    async updateStatus(update: IStatusUpdate) {
        if (!update) return;
        if (this.id == null) throw Error("Missing host id");

        if (this.hostname == "cccg" && this.monitorContent) {
            await stat.register(this.id, "up", update.time, 1, 1);
            for (const {name, interval, content} of this.monitorContent) {
                if (!(name in update)) continue;
                let c = (update as any)[name];
                await stat.register(this.id, name+".count", update.time, interval, 1);

                for (const prop of content) {
                    if (prop.type == MonitorPropType.none) continue;
                    let v = c[prop.identifier];                    
                    switch (prop.type) {
                    case MonitorPropType.string:
                   /* case MonitorPropType.up:
                        console.log(id,  prop.type, prop.identifier, v);
                        break;*/
                    case MonitorPropType.aOfB:
                        await stat.register(this.id, name+"."+prop.identifier+".a", update.time, interval, v[0]);
                        await stat.register(this.id, name+"."+prop.identifier+".b", update.time, interval, v[1]);
                        break;
                    case MonitorPropType.sumAndCount:
                        await stat.register(this.id, name+"."+prop.identifier+".sum", update.time, interval, v[0]);
                        await stat.register(this.id, name+"."+prop.identifier+".count", update.time, interval, v[1]);
                        break
                    default:
                        await stat.register(this.id, name+"."+prop.identifier, update.time, interval, v);
                        break;
                    }
                }
            }
        }
        
        if (this.status && update.smart) {
            const importantSmart = new Set([5, 103, 171, 172, 175, 176, 181, 182, 184, 187, 188, 197, 198, 200, 221]);
            for (const dev in update.smart) {
                const oldSmart = this.status.smart[dev];
                const newSmart = update.smart[dev];
                if (newSmart == null)
                    msg.emit(this.id, "S.M.A.R.T", "Disk " + dev + " dissapeared");
                else {
                    const oc: { [id: number]: number } = {};
                    if (oldSmart)
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

                const n_mount = nullCheck(update.mounts[target]);
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
