import * as fs from "node:fs";
import * as tls from "node:tls";
import { ACTION, type IHostDown, type IHostUp } from "../../shared/actions";
import * as crt from "./crt";
import * as crypt from "./crypt";
import { descript, errorHandler } from "./error";
import { db, hostClients, msg, webClients } from "./instances";
import { Job } from "./job";
import { JobOwner } from "./jobowner";
import type * as message from "./messages";

function delay(time: number) {
    return new Promise<void>((resolve) => {
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
    pingId = 10;
    pingTimer: ReturnType<typeof setTimeout> | null = null;
    closeHandled = false;
    certificateTimer: ReturnType<typeof setTimeout> | null = null;
    authTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(socket: tls.TLSSocket) {
        super();
        this.socket = socket;
        this.socket.on("close", () => this.onClose());
        this.socket.on("data", (data: any) => this.onData(data as Buffer));
        this.socket.on("error", (err: Error) => {
            console.warn("Client socket error", { hostname: this.hostname, error: err });
        });
        this.authTimer = setTimeout(() => this.onAuthTimeout(), 10000);
    }

    runShell(commandLine: string): Promise<string> {
        return new Promise((accept, reject) => {
            class PJob extends Job {
                constructor(host: HostClient) {
                    super(host, null, host);
                    const msg: message.RunInstant = {
                        type: "run_instant",
                        id: this.id,
                        name: "runShell.sh",
                        interperter: "/bin/sh",
                        content: commandLine,
                        args: [],
                        output_type: "text",
                        stdin_type: "none",
                    };
                    host.sendMessage(msg);
                    this.running = true;
                }

                handleMessage(obj: message.Incomming) {
                    super.handleMessage(obj);
                    switch (obj.type) {
                        case "success": {
                            const instantSuccess = obj as any as { type: "success"; data: string };
                            accept(instantSuccess.data);
                            break;
                        }
                        case "failure": {
                            const instantFailure = obj as any as {
                                type: "failure";
                                code: number;
                                stdout: string;
                                stderr: string;
                            };
                            reject(
                                new Error(
                                    `Host instant script exited with code ${instantFailure.code}`,
                                ),
                            );
                            break;
                        }
                    }
                }
            }
            new PJob(this);
        });
    }

    writeSmallFile(path: string, contents: string): Promise<void> {
        return new Promise((accept, reject) => {
            class PJob extends Job {
                constructor(host: HostClient) {
                    super(host, null, host);
                    const msg: message.RunInstant = {
                        type: "run_instant",
                        id: this.id,
                        name: "writeSmallFile.sh",
                        interperter: "/bin/bash",
                        content: 'printf \'%s\' "$2" > "$1"',
                        args: [path, contents],
                        output_type: "text",
                        stdin_type: "none",
                    };
                    host.sendMessage(msg);
                    this.running = true;
                }

                handleMessage(obj: message.Incomming) {
                    super.handleMessage(obj);
                    switch (obj.type) {
                        case "success":
                            accept();
                            break;
                        case "failure": {
                            const instantFailure = obj as any as {
                                type: "failure";
                                code: number;
                                stdout: string;
                                stderr: string;
                            };
                            reject(
                                new Error(
                                    `Host instant script exited with code ${instantFailure.code}`,
                                ),
                            );
                            break;
                        }
                    }
                }
            }
            new PJob(this);
        });
    }

    sendPing() {
        this.pingTimer = null;
        this.sendMessage({ type: "ping", id: this.pingId++ });
        this.pingTimer = setTimeout(() => {
            this.onPingTimeout();
        }, 80000);
    }

    onPingTimeout() {
        this.pingTimer = null;
        this.closeHandled = true;
        console.warn("Client ping timeout", { hostname: this.hostname });
        this.socket.end();
    }

    onAuthTimeout() {
        this.authTimer = null;
        this.closeHandled = true;
        console.warn("Client auth timeout", { hostname: this.hostname });
        this.socket.end();
    }

    onPingResponce(id: number) {
        if (!this.pingTimer) return;
        clearTimeout(this.pingTimer);
        this.pingTimer = setTimeout(() => {
            this.sendPing();
        }, 9000);
    }

    onClose() {
        if (this.pingTimer != null) clearTimeout(this.pingTimer);
        if (this.certificateTimer != null) clearTimeout(this.certificateTimer);
        if (this.authTimer != null) clearTimeout(this.authTimer);

        if (!this.auth) {
            console.log("Bad auth for client", { hostname: this.hostname });
            return;
        }

        if (this.id == null) throw Error("Missing host id");

        console.log("Client disconnected", { hostname: this.hostname });

        if (this.id in hostClients.hostClients) delete hostClients.hostClients[this.id];

        const act: IHostDown = { type: ACTION.HostDown, id: this.id };
        webClients.broadcast(act);
        this.kill();
    }

    removeJob(job: Job, m: message.Failure | message.Success | null) {
        if (this.id == null) throw Error("Missing host id");
        super.removeJob(job, m);
    }

    async validateAuth(obj: message.Auth) {
        const res = await db.getHostContentByName(obj.hostname);
        if (
            res &&
            (await crypt.validate(obj.password, res?.content && (res.content as any).password))
        )
            return res.id;
        return null;
    }

    async onMessage(msg: Buffer) {
        if (this.auth === false) return;
        const obj: message.Incomming = JSON.parse(msg.toString("utf8"));
        if (this.auth === null) {
            if (obj.type !== "auth") {
                console.warn("Client invalid auth", {
                    address: this.socket.remoteAddress,
                    port: this.socket.remotePort,
                });
                this.socket.end();
                this.auth = false;
                return;
            }
            if (this.authTimer !== null) {
                clearTimeout(this.authTimer);
                this.authTimer = null;
            }
            const [id, _] = await Promise.all([this.validateAuth(obj), delay(1000)]);
            if (id !== null) {
                console.log("Client authorized", {
                    hostname: obj.hostname,
                    address: this.socket.remoteAddress,
                    port: this.socket.remotePort,
                });
                this.hostname = obj.hostname;
                this.auth = true;
                this.id = id;
                hostClients.hostClients[id] = this;
                const act: IHostUp = { type: ACTION.HostUp, id: id };
                webClients.broadcast(act);
                this.signHostCertificate();

                this.pingTimer = setTimeout(() => {
                    this.sendPing();
                }, 10000);
            } else {
                console.warn("Client invalid auth", {
                    address: this.socket.remoteAddress,
                    port: this.socket.remotePort,
                });
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
            default: {
                const id = obj.id;
                if (id in this.jobs) this.jobs[id].handleMessage(obj);
            }
        }
    }

    async signHostCertificate() {
        console.log(`Signing SSH host certificate for ${this.hostname}`);
        if (this.certificateTimer != null) {
            clearTimeout(this.certificateTimer);
            this.certificateTimer = null;
        }
        try {
            const hostKey = await this.runShell("cat /etc/ssh/ssh_host_ed25519_key.pub");
            const { sshHostCaPub, sshHostCaKey } = await db.getRootVariables();
            if (sshHostCaKey != null && sshHostCaPub != null && this.hostname != null) {
                const validityDays = 7;
                const sshCrt = await crt.generate_ssh_crt(
                    `${this.hostname} sadmin host`,
                    `${this.hostname},${this.hostname}.scalgo.com,${this.hostname}.emu-buri.ts.net`,
                    sshHostCaKey,
                    hostKey,
                    validityDays,
                    "host",
                );
                await this.writeSmallFile("/etc/ssh/ssh_host_ed25519_key-cert.pub", sshCrt);
                await this.runShell("systemctl reload 'ssh*.service'");
            }
        } catch (e) {
            const d = descript(e);
            console.log(e);
            console.error("An error occured in host ssh certificate generation", {
                typename: d.typeName,
                description: d.description,
                err: e,
            });
        }
        this.certificateTimer = setTimeout(() => this.signHostCertificate(), 24 * 3600 * 1000);
    }

    onData(data: Buffer) {
        let start = 0;
        while (true) {
            const idx = data.indexOf("\x1e", start);
            if (idx === -1) break;
            const part = data.slice(start, idx);

            let messageData: Buffer;
            if (this.used === 0) messageData = part;
            else {
                part.copy(this.buff, this.used);
                messageData = this.buff.slice(0, this.used + part.length);
                this.used = 0;
            }
            this.onMessage(messageData).catch(errorHandler("HostClient::onMessage"));
            start = idx + 1;
        }
        if (start < data.length) this.used += data.copy(this.buff, this.used, start);
    }

    sendMessage(obj: message.Outgoing) {
        this.socket.write(`${JSON.stringify(obj)}\x1e`);
    }
}

export class HostClients {
    hostClients: { [id: number]: HostClient } = {};
    start() {
        const privateKey = fs.readFileSync("domain.key", "utf8");
        const certificate = fs.readFileSync("chained.pem", "utf8");
        const options = { key: privateKey, cert: certificate };

        const hostServer = tls.createServer(options, (socket) => {
            console.log("Client connected", {
                address: socket.remoteAddress,
                port: socket.remotePort,
            });
            new HostClient(socket);
        });

        setInterval(() => {
            console.log("Updating host-server ssl cert");
            hostServer.setSecureContext({
                cert: fs.readFileSync("chained.pem", "utf8"),
                key: fs.readFileSync("domain.key", "utf8"),
            });
        }, 86400000);

        hostServer.on("error", (err) => {
            console.error("Host server error", { err });
        });
        hostServer.listen(8888, "0.0.0.0");
        hostServer.on("listening", () => {
            console.log("Host server started on port 8888");
        });
        hostServer.on("close", () => {
            console.log("Host server stopped");
        });
    }
}
