import * as crypto from "node:crypto";
import * as http from "node:http";
import * as url from "node:url";
import * as bodyParser from "body-parser";
import * as express from "express";
import helmet from "helmet";
import * as WebSocket from "ws";
import { config } from "./config";
import { docker } from "./docker";
import { errorHandler } from "./error";
import type { AuthInfo } from "./getAuth";
import { hostClients, rs, webClients } from "./instances";
import type { Job } from "./job";
import { JobOwner } from "./jobowner";
import { ShellJob } from "./jobs/shellJob";
import setup from "./setup";
import {
    ACTION,
    type IAction,
    IAddLogLines,
    type IAlert,
    type IGenerateKeyRes,
    type IObjectChanged,
    type ISearchRes,
    type ISetInitialState,
    type ISetPageAction,
} from "./shared/actions";
import { getReferences } from "./shared/getReferences";
import nullCheck from "./shared/nullCheck";
import { PAGE_TYPE } from "./shared/state";
import {
    type Host,
    IContains,
    IDepends,
    ISudoOn,
    type IType,
    IVariables,
    TypePropType,
    hostId,
    rootId,
    rootInstanceId,
    typeId,
    userId,
} from "./shared/type";
const serverRs = require("simple_admin_server_rs");
interface EWS extends express.Express {
    ws(s: string, f: (ws: WebSocket, req: express.Request) => void): void;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebClient extends JobOwner {
    connection: WebSocket;
    auth: AuthInfo;
    host: string;

    constructor(socket: WebSocket, host: string) {
        super();
        this.auth = serverRs.noAccess();
        this.connection = socket;
        this.host = host;
        this.connection.on("close", () => this.onClose());
        this.connection.on("message", (msg: string) =>
            this.onMessage(msg).catch(errorHandler("WebClient::message", this)),
        );
        this.connection.on("error", (err) => {
            console.warn("Web client error", { err });
        });
    }

    onClose() {
        this.kill();
        webClients.webclients.delete(this);
    }

    get_hosts_up(): number[] {
        const hostsUp: number[] = [];
        for (const id in hostClients.hostClients) hostsUp.push(+id);
        return hostsUp;
    }

    get_docker() {
        return docker;
    }

    async onMessage(str: string) {
        const act = JSON.parse(str) as IAction;
        await serverRs.webclientHandleMessage(rs, this, act);
    }

    sendMessage(obj: IAction) {
        this.connection.send(JSON.stringify(obj), (err?: Error) => {
            if (err) {
                if (Object.getOwnPropertyNames(err).length !== 0)
                    console.warn("Web client error sending message", { err, host: this.host });
                this.connection.terminate();
                this.onClose();
            }
        });
    }

    broadcastMessage(obj: IAction) {
        webClients.broadcast(obj);
    }
}


export class WebClients {
    httpApp = express();
    webclients = new Set<WebClient>();
    httpServer: http.Server;
    wss: WebSocket.Server;

    broadcast(act: IAction) {
        for (const client of this.webclients) {
            if (client.auth.admin) client.sendMessage(act);
        }
    }

    async countMessages(req: express.Request, res: express.Response) {
        let downHosts = 0;
        for (const row of await serverRs.getObjectContentByType(rs, hostId)) {
            if (hostClients.hostClients[row.id]?.auth || !row.content) continue;
            const content: Host = JSON.parse(row.content);
            if (content.messageOnDown) downHosts += 1;
        }
        res.header("Content-Type", "application/json; charset=utf-8")
            .json({ count: downHosts + (await serverRs.msgGetCount(rs)) })
            .end();
    }

    async status(req: express.Request, res: express.Response) {
        const token = req.query.token;
        if (!token || token !== config.statusToken) {
            res.status(403).end();
            return;
        }
        const ans: { [key: string]: boolean } = {};
        for (const [id, name] of await serverRs.getIdNamePairsForType(rs, hostId)) {
            ans[name] = hostClients.hostClients[id]?.auth || false;
        }
        res.header("Content-Type", "application/json; charset=utf-8").json(ans).end();
    }

    async metrics(req: express.Request, res: express.Response) {
        res.header("Content-Type", "text/plain; version=0.0.4")
            .send(`simpleadmin_messages ${await serverRs.msgGetCount(rs)}\n`)
            .end();
    }

    constructor() {
        this.httpApp.use(helmet());
        this.httpServer = http.createServer(this.httpApp);
        this.wss = new WebSocket.Server({ server: this.httpServer });
        this.httpApp.get("/setup.sh", (req, res) => setup(req, res));
        this.httpApp.get("/v2/*", docker.get.bind(docker));
        this.httpApp.put("/v2/*", docker.put.bind(docker));
        this.httpApp.post("/v2/*", docker.post.bind(docker));
        this.httpApp.delete("/v2/*", docker.delete.bind(docker));
        this.httpApp.patch("/v2/*", docker.patch.bind(docker));
        this.httpApp.get("/docker/*", docker.images.bind(docker));
        this.httpApp.post("/usedImages", bodyParser.json(), docker.usedImages.bind(docker));
        this.httpApp.get("/messages", this.countMessages.bind(this));
        this.httpApp.get("/status", this.status.bind(this));
        this.httpApp.get("/metrics", this.metrics.bind(this));
        this.wss.on("connection", (ws, request) => {
            const rawAddresses = request.socket.address();
            const address =
                (request.headers["x-forwarded-for"] as string) ||
                (typeof rawAddresses === "string" ? rawAddresses : (rawAddresses as any).address);
            if (!request.url) {
                ws.close();
                return;
            }
            const u = url.parse(request.url, true);
            if (u.pathname === "/sysadmin") {
                const wc = new WebClient(ws, address);
                this.webclients.add(wc);
            } else if (u.pathname === "/terminal") {
                const server = +u.query!.server!;
                const cols = +u.query!.cols!;
                const rows = +u.query!.rows!;
                const session = u.query.session as string;
                serverRs
                    .getAuth(rs, address, session)
                    .then((a: any) => {
                        if (a.auth && server in hostClients.hostClients)
                            new ShellJob(hostClients.hostClients[server], ws, cols, rows);
                        else ws.close();
                    })
                    .catch(() => {
                        ws.close();
                    });
            } else {
                ws.close();
            }
        });
    }

    startServer() {
        this.httpServer.listen(8182, "localhost", () => {
            console.log("Web server started on port 8182");
        });
        this.httpServer.on("close", () => {
            console.log("Web server stopped");
        });
    }
}
