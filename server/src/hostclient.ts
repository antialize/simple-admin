import * as net from 'net';
import * as fs from 'fs';
import { IUpdateStatusAction, IHostDown, ACTION } from '../../shared/actions'
import { IStatus, IStatusUpdate, applyStatusUpdate, IStatusCpuinfo, IStatusUname, IStatusLBSRelease, IStatusUptime, IStatusLoadAVG, IStatusMeminfo } from '../../shared/status'
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
        this.pingTimer = setTimeout(() => { this.onPingTimeout() }, 80000);
    }

    onPingTimeout() {
        this.pingTimer = null;
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

    async setReconnectTimeout() {
        if (this.id === null || this.hostname === null) return;
        let c = await db.getHostContentByName(this.hostname);
        if (!c.content.messageOnDown) return;
        hostClients.downMessageTimeouts[this.id] = setTimeout(() => {
            msg.emit(this.id, "Host down", "Has been down for more than 5 minutes.");
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
        this.monitorJob = null;
        this.kill();

        this.setReconnectTimeout();
    }

    removeJob(job: Job, m: message.Failure | message.Success | null) {
        if (this.id == null) throw Error("Missing host id");

        if (job == this.monitorJob) {
            log('warning', "Monitor job died", { hostname: this.hostname });
            msg.emit(this.id, "Monitor job died", this.monitorJob.error);
            this.monitorJob = null;
            setTimeout(() => {
                if (this.monitorJob != null) return;
                log('info', "Restart monitor job", { hostname: this.hostname });
                this.monitorJob = new MonitorJob(this, this.monitorScript);
            }, this.monitorRestartTime);
            this.monitorRestartTime *= 1.5;
        }
        super.removeJob(job, m);
    }

    monitorChanged(script: string | null, content: IMonitor[] | null) {
        this.monitorJob = null;
        log('info', "New monitor", { hostname: this.hostname, /*content*/ });
        this.monitorContent = content;
        this.monitorScript = script;
        this.monitorRestartTime = 1000;

        let msg: message.Kill = {'type': 'kill', 'id': 0};
        this.sendMessage(msg);

        setTimeout(() => {
            this.monitorJob = new MonitorJob(this, script);
        }, 1700); 
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

    async onMessage(msg: Buffer) {
        if (this.auth === false) return;
        const obj: message.Incomming = JSON.parse(msg.toString('utf8'))
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
                const to = hostClients.downMessageTimeouts[this.id];
                if (to) {
                    clearTimeout(to);
                    delete hostClients.downMessageTimeouts[this.id];
                }

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

    async updateStatus(update: IStatusUpdate) {
        if (!update) return;
        if (this.id == null) throw Error("Missing host id");

        if (this.monitorContent) {
            await stat.register(this.id, "up", update.time, 1, 1);
            for (const {name, interval, content} of this.monitorContent) {
                if (!(name in update)) continue;
                let c = (update as any)[name];
                await stat.register(this.id, name+".count", update.time, interval, 1);

                for (const prop of content) {
                    if (prop.type == MonitorPropType.none) continue;
                    let v = c[prop.identifier];
                    if (v === undefined) {
                        log("error", "Missing " + prop.identifier + " in " + name + " in status update from "+this.hostname);
                        continue;
                    }
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

                if (name == "cpuInfo") {
                    let u: IStatusCpuinfo = {
                        name: "",
                        cores: 0,
                        geekbench_multi: 0,
                        geekbench_single: 0
                    };
                    for (const prop of content) {
                        if (prop.type == MonitorPropType.none) continue;
                        let v = c[prop.identifier];
                        if (prop.identifier == "name") u.name = v;
                        if (prop.identifier == "cores") u.cores = v;
                        if (prop.identifier == "geekbench_single") u.geekbench_single = v;
                        if (prop.identifier == "geekbench_multi") u.geekbench_multi = v;
                    }
                    update.cpuinfo = u;
                }

                if (name == "hostInfo") {
                    let u1: IStatusUname = {
                        release: "",
                        sysname: "",
                        machine: "",
                        version: "",
                        nodename: "",
                    };
                    let u2: IStatusLBSRelease = {
                        release: "",
                        codename: "",
                        id: "",
                        description: "",
                    };
                    for (const prop of content) {
                        if (prop.type == MonitorPropType.none) continue;
                        let v = c[prop.identifier];
                        if (prop.identifier == "sysname") u1.sysname = v;
                        if (prop.identifier == "nodename") u1.nodename = v;
                        if (prop.identifier == "kernel_release") u1.release = v;
                        if (prop.identifier == "kernel_version") u1.version = v;
                        if (prop.identifier == "arch") u1.machine = v;
                        if (prop.identifier == "distribution_provider") u2.id = v;
                        if (prop.identifier == "distribution_release") u2.release = v;
                        if (prop.identifier == "distribution_codename") u2.codename = v;
                        if (prop.identifier == "distribution_description") u2.description = v;
                    }
                    update.uname = u1;
                    update.lsb_release = u2;
                }

                if (name == "common") {
                    let u1: IStatusUptime = {
                        idle: 0,
                        total: 0,
                    };
                    let u2: IStatusLoadAVG = {
                        five_minute: 0,
                        total_processes: 0,
                        ten_minute: 0,
                        minute: 0,
                        active_processes: 0
                    };
                    let u3: IStatusMeminfo = {
                        avail: 0,
                        total: 0,
                        free: 0,
                        swap_free: 0,
                        swap_total: 0,
                    };
                    for (const prop of content) {
                        if (prop.type == MonitorPropType.none) continue;
                        let v = c[prop.identifier];
                        if (prop.identifier == "uptime_total") u1.total = v;
                        if (prop.identifier == "uptime_idle") u1.idle = v;
                        if (prop.identifier == "loadavg_minute") u2.minute = v;
                        if (prop.identifier == "loadavg_five_minute") u2.five_minute = v;
                        if (prop.identifier == "loadavg_ten_minute") u2.ten_minute = v;
                        if (prop.identifier == "active_processes") u2.active_processes = v;
                        if (prop.identifier == "total_processes") u2.total_processes = v;
                        if (prop.identifier == "memory") {u3.avail = u3.free = v[1] - v[0]; u3.total = v[1];}
                        if (prop.identifier == "swap") {u3.swap_free = v[1] - v[0]; u3.swap_total = v[1];}
                    }
                    update.uptime = u1;
                    update.loadavg = u2;
                    update.meminfo = u3;
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
                        if (oldVal == entry.raw_value) continue;

                        const row = await db.get("SELECT `count` FROM `smart` WHERE `host`=? AND `dev`=? AND `smart_id`=?", this.id, dev, entry.id)
                        if (row && row['count'] == entry.raw_value) continue;
                        msg.emit(this.id, "S.M.A.R.T",
                            "Disk " + dev + ": " + entry.name + "(" + entry.id + ")"
                            + " increased to " + entry.raw_value + " from " + oldVal);
                        await db.run("REPLACE INTO `smart` (`host`, `dev`, `smart_id`, `count`) VALUES (?, ?, ?, ?)", this.id, dev, entry.id, entry.raw_value);
                    }
                }
            }
        }

        if (this.status && update.mounts) {
            for (const target in update.mounts) {
                if (!(target in this.status.mounts)) continue;
                const gig_bytes = 1024 * 1024 * 1024;
                const block_bytes = 4096;

                const o_mount = this.status.mounts[target];
                const o_total = o_mount.blocks * block_bytes / gig_bytes;
                const o_free = o_mount.free_blocks * block_bytes / gig_bytes;
                const o_t1 = Math.min(o_total * 0.1, 75);
                const o_t2 = Math.min(o_total * 0.01, 8);

                const n_mount = nullCheck(update.mounts[target]);
                const n_total = n_mount.blocks * block_bytes / gig_bytes;
                const n_free = n_mount.free_blocks * block_bytes / gig_bytes;
                const n_t1 = Math.min(n_total * 0.1, 75);
                const n_t2 = Math.min(n_total * 0.01, 8);

                if (n_free < n_t1 && o_free >= o_t1) {
                    msg.emit(this.id, "File system", "Mount " + target + " has less than " + n_t1.toFixed(1)+ " GiB free disk space");
                } else if (n_free < n_t2 && o_free >= o_t2) {
                    msg.emit(this.id, "File system", "Mount " + target + " has less than " + n_t2.toFixed(1)+ " GiB free disk space");
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
