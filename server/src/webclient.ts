import * as crypto from "node:crypto";
import * as http from "node:http";
import * as url from "node:url";
import * as bodyParser from "body-parser";
import * as express from "express";
import helmet from "helmet";
import * as WebSocket from "ws";
import { config } from "./config";
import * as crt from "./crt";
import { docker } from "./docker";
import { errorHandler } from "./error";
import { type AuthInfo, getAuth, noAccess } from "./getAuth";
import { db, deployment, hostClients, modifiedFiles, msg, webClients } from "./instances";
import type { Job } from "./job";
import { JobOwner } from "./jobowner";
import { LogJob } from "./jobs/logJob";
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
    logJobs: { [id: number]: Job } = {};
    host: string;

    constructor(socket: WebSocket, host: string) {
        super();
        this.auth = noAccess;
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

    async sendAuthStatus(sid: string | null) {
        this.auth = await getAuth(this.host, sid);
        this.sendMessage({ type: ACTION.AuthStatus, message: null, ...this.auth });
    }

    async onMessage(str: string) {
        const act = JSON.parse(str) as IAction;

        switch (act.type) {
            case ACTION.RequestAuthStatus:
                console.log("AuthStatus", this.host, this.auth.session, this.auth.user);
                this.sendAuthStatus(act.session || null);
                break;
            case ACTION.Login: {
                let session = this.auth.session;
                const auth = session ? await getAuth(this.host, session) : noAccess;
                let found = false;
                let newOtp = false;
                let otp = auth?.otp;
                let pwd = auth?.pwd;

                if (config.users) {
                    for (const u of config.users) {
                        if (u.name === act.user) {
                            found = true;
                            if (u.password === act.pwd) {
                                otp = true;
                                pwd = true;
                                newOtp = true;
                                break;
                            }
                        }
                    }
                }

                if (!found) {
                    try {
                        const contentStr = await db.getUserContent(act.user);
                        if (contentStr) {
                            const content = JSON.parse(contentStr);
                            found = true;
                            await sleep(1000);
                            pwd = serverRs.cryptValidatePassword(act.pwd, content.password);
                            if (act.otp) {
                                otp = serverRs.cryptValidateOtp(act.otp, content.otp_base32);
                                newOtp = true;
                            }
                        }
                    } catch (e) {}
                }
                if (!found) {
                    this.sendMessage({
                        type: ACTION.AuthStatus,
                        pwd: false,
                        otp: false,
                        session: session,
                        user: act.user,
                        auth: false,
                        admin: false,
                        dockerPull: false,
                        dockerPush: false,
                        message: "Invalid user name",
                    });
                    this.auth = noAccess;
                } else if (!pwd || !otp) {
                    if (otp && newOtp) {
                        const now = (Date.now() / 1000) | 0;
                        if (session) {
                            await db.run(
                                "UPDATE `sessions` SET `otp`=? WHERE `sid`=?",
                                now,
                                session,
                            );
                        } else {
                            session = crypto.randomBytes(64).toString("hex");
                            await db.run(
                                "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)",
                                act.user,
                                this.host,
                                null,
                                now,
                                session,
                            );
                        }
                    }
                    this.sendMessage({
                        type: ACTION.AuthStatus,
                        pwd: false,
                        otp,
                        session: session,
                        user: act.user,
                        auth: false,
                        admin: false,
                        dockerPull: false,
                        dockerPush: false,
                        message: "Invalid password or one time password",
                    });
                    this.auth = {
                        ...noAccess,
                        session,
                        otp,
                    };
                } else {
                    const now = (Date.now() / 1000) | 0;
                    if (session && newOtp) {
                        await db.run(
                            "UPDATE `sessions` SET `pwd`=?, `otp`=? WHERE `sid`=?",
                            now,
                            now,
                            session,
                        );
                    } else if (session) {
                        const eff = await db.run(
                            "UPDATE `sessions` SET `pwd`=? WHERE `sid`=?",
                            now,
                            session,
                        );
                    } else {
                        session = crypto.randomBytes(64).toString("hex");
                        await db.run(
                            "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)",
                            act.user,
                            this.host,
                            now,
                            now,
                            session,
                        );
                    }
                    this.auth = await getAuth(this.host, session);
                    if (!this.auth.auth) throw Error("Internal auth error");
                    this.sendMessage({ type: ACTION.AuthStatus, message: null, ...this.auth });
                }
                break;
            }
            case ACTION.RequestInitialState:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await sendInitialState(this);
                break;
            case ACTION.Logout:
                if (!this.auth.auth) {
                    this.connection.close(403);
                    return;
                }
                console.log(
                    "logout",
                    this.host,
                    this.auth.user,
                    this.auth.session,
                    act.forgetPwd,
                    act.forgetOtp,
                );
                if (act.forgetPwd)
                    await db.run(
                        "UPDATE `sessions` SET `pwd`=null WHERE `sid`=?",
                        this.auth.session,
                    );
                if (act.forgetOtp) {
                    await db.run(
                        "UPDATE `sessions` SET `otp`=null WHERE `sid`=?",
                        this.auth.session,
                    );
                    this.auth = noAccess;
                }
                this.sendAuthStatus(this.auth.session);
                break;
            case ACTION.FetchObject: {
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                const rows = await db.getObjectByID(act.id);
                const res: IObjectChanged = { type: ACTION.ObjectChanged, id: act.id, object: [] };
                for (const row of rows) {
                    res.object.push({
                        id: act.id,
                        version: row.version,
                        type: row.type,
                        name: row.name,
                        content: JSON.parse(row.content),
                        category: row.category,
                        comment: row.comment,
                        time: row.time,
                        author: row.author,
                    });
                }
                this.sendMessage(res);
                break;
            }
            case ACTION.GetObjectId: {
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                let id = null;
                try {
                    const parts = act.path.split("/", 2);
                    if (parts.length !== 2) break;
                    const typeRow = await db.get(
                        "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1",
                        typeId,
                        parts[0],
                    );
                    if (!typeRow || !typeRow.id) break;
                    const objectRow = await db.get(
                        "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1",
                        typeRow.id,
                        parts[1],
                    );
                    if (objectRow) id = objectRow.id;
                } finally {
                    this.sendMessage({ type: ACTION.GetObjectIdRes, ref: act.ref, id });
                }
                break;
            }
            case ACTION.GetObjectHistory: {
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                const history: {
                    version: number;
                    time: number;
                    author: string | null;
                }[] = [];
                for (const row of await db.all(
                    "SELECT `version`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
                    act.id,
                )) {
                    history.push({ version: row.version, time: row.time, author: row.author });
                }
                this.sendMessage({
                    type: ACTION.GetObjectHistoryRes,
                    ref: act.ref,
                    history,
                    id: act.id,
                });
                break;
            }
            case ACTION.StartLog:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                if (act.host in hostClients.hostClients) {
                    new LogJob(
                        hostClients.hostClients[act.host],
                        this,
                        act.id,
                        act.logtype,
                        act.unit,
                    );
                }
                break;
            case ACTION.EndLog:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                if (act.id in this.logJobs) this.logJobs[act.id].kill();
                break;
            case ACTION.SetMessagesDismissed:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await msg.setDismissed(act.ids, act.dismissed);
                break;
            case ACTION.MessageTextReq:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                {
                    const row = await msg.getFullText(act.id);
                    this.sendMessage({
                        type: ACTION.MessageTextRep,
                        id: act.id,
                        message: row ? row.message : "missing",
                    });
                }
                break;
            case ACTION.SaveObject:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                {
                    // HACK HACK HACK crypt passwords that does not start with $6$, we belive we have allready bcrypt'ed it
                    if (!act.obj) throw Error("Missing object in action");
                    const c = act.obj.content;
                    const typeRow = await db.getNewestObjectByID(act.obj.type);
                    const type = JSON.parse(typeRow.content) as IType;
                    for (const r of type.content || []) {
                        if (r.type !== TypePropType.password) continue;
                        if (
                            !(r.name in c) ||
                            c[r.name].startsWith("$6$") ||
                            c[r.name].startsWith("$y$")
                        )
                            continue;
                        c[r.name] = serverRs.cryptHash(c[r.name]);
                    }

                    if (act.obj.type === userId && (!c.otp_base32 || !c.otp_url)) {
                        const [otp_base32, otp_url] = serverRs.cryptGenerateOtpSecret(act.obj.name);
                        c.otp_base32 = otp_base32;
                        c.otp_url = otp_url;
                    }

                    const { id, version } = await db.changeObject(
                        act.id,
                        act.obj,
                        nullCheck(this.auth.user),
                    );
                    act.obj.version = version;
                    const res2: IObjectChanged = {
                        type: ACTION.ObjectChanged,
                        id: id,
                        object: [act.obj],
                    };
                    webClients.broadcast(res2);
                    const res3: ISetPageAction = {
                        type: ACTION.SetPage,
                        page: { type: PAGE_TYPE.Object, objectType: act.obj.type, id, version },
                    };
                    this.sendMessage(res3);
                }
                break;
            case ACTION.Search: {
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                const objects: {
                    type: number;
                    id: number;
                    version: number;
                    name: string;
                    comment: string;
                    content: string;
                }[] = [];
                for (const row of await db.all(
                    "SELECT `id`, `version`, `type`, `name`, `content`, `comment` FROM `objects` WHERE (`name` LIKE ? OR `content` LIKE ? OR `comment` LIKE ?) AND `newest`=1",
                    act.pattern,
                    act.pattern,
                    act.pattern,
                )) {
                    objects.push({
                        id: row.id,
                        type: row.type,
                        name: row.name,
                        content: row.content,
                        comment: row.comment,
                        version: row.version,
                    });
                }
                const res4: ISearchRes = {
                    type: ACTION.SearchRes,
                    ref: act.ref,
                    objects,
                };
                this.sendMessage(res4);
                break;
            }
            case ACTION.ResetServerState:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await db.resetServer(act.host);
                break;
            case ACTION.DeleteObject:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                {
                    const objects = await db.getAllObjectsFull();
                    const conflicts: string[] = [];
                    for (const object of objects) {
                        const content = JSON.parse(object.content);
                        if (!content) continue;
                        if (object.type === act.id)
                            conflicts.push(`* ${object.name} (${object.type}) type`);
                        for (const val of ["sudoOn", "depends", "contains"]) {
                            if (!(val in content)) continue;
                            for (const id of content[val] as number[]) {
                                if (id !== act.id) continue;
                                conflicts.push(`* ${object.name} (${object.type}) ${val}`);
                            }
                        }
                    }
                    if (conflicts.length > 0) {
                        const res: IAlert = {
                            type: ACTION.Alert,
                            title: "Cannot delete object",
                            message: `The object can not be delete as it is in use by:\n${conflicts.join("\n")}`,
                        };
                        this.sendMessage(res);
                    } else {
                        console.log("Web client delete object", { id: act.id });
                        await db.changeObject(act.id, null, nullCheck(this.auth.user));
                        const res2: IObjectChanged = {
                            type: ACTION.ObjectChanged,
                            id: act.id,
                            object: [],
                        };
                        webClients.broadcast(res2);
                        const res3: ISetPageAction = {
                            type: ACTION.SetPage,
                            page: { type: PAGE_TYPE.Dashbord },
                        };
                        this.sendMessage(res3);
                    }
                    break;
                }
            case ACTION.DeployObject:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                deployment
                    .deployObject(act.id, act.redeploy)
                    .catch(errorHandler("Deployment::deployObject", this));
                break;
            case ACTION.CancelDeployment:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                deployment.cancel();
                break;
            case ACTION.StartDeployment:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await deployment.start().catch(errorHandler("Deployment::start", this));
                break;
            case ACTION.StopDeployment:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await deployment.stop();
                break;
            case ACTION.ToggleDeploymentObject:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await deployment.toggleObject(act.index, act.enabled);
                break;
            case ACTION.ServiceDeployStart:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.deployService(this, act);
                break;
            case ACTION.ServiceRedeployStart:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.redeployService(this, act);
                break;
            case ACTION.DockerListDeployments:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.listDeployments(this, act);
                break;
            case ACTION.DockerListImageByHash:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.listImageByHash(this, act);
                break;
            case ACTION.DockerListImageTags:
                if (!this.auth.dockerPull) {
                    this.connection.close(403);
                    return;
                }
                await docker.listImageTags(this, act);
                break;
            case ACTION.DockerImageSetPin:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.imageSetPin(this, act);
                break;
            case ACTION.DockerImageTagSetPin:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.imageTagSetPin(this, act);
                break;
            case ACTION.DockerListDeploymentHistory:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.listDeploymentHistory(this, act);
                break;
            case ACTION.DockerListImageTagHistory:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.listImageTagHistory(this, act);
                break;
            case ACTION.DockerContainerForget:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.forgetContainer(this, act.host, act.container);
                break;
            case ACTION.ModifiedFilesScan:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await modifiedFiles.scan(this, act);
                break;
            case ACTION.ModifiedFilesList:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await modifiedFiles.list(this, act);
                break;
            case ACTION.ModifiedFilesResolve:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                await modifiedFiles.resolve(this, act);
                break;
            case ACTION.GenerateKey: {
                if (!this.auth.sslname) {
                    this.connection.close(403);
                    return;
                }

                const [_uname, _uid, capsString] = this.auth.sslname.split(".");
                const caps = (capsString || "").split("~");

                await docker.ensure_ca();
                const my_key = await crt.generate_key();
                const my_srs = await crt.generate_srs(my_key, `${this.auth.sslname}.user`);
                const my_crt = await crt.generate_crt(
                    docker.ca_key!,
                    docker.ca_crt!,
                    my_srs,
                    [],
                    this.auth.authDays ?? 1,
                );
                const res2: IGenerateKeyRes = {
                    type: ACTION.GenerateKeyRes,
                    ref: act.ref,
                    ca_pem: docker.ca_crt!,
                    key: my_key,
                    crt: my_crt,
                };
                if (act.ssh_public_key != null && caps.includes("ssh")) {
                    const { sshHostCaPub, sshHostCaKey } = await db.getRootVariables();
                    if (sshHostCaKey != null && sshHostCaPub != null && this.auth.user != null) {
                        try {
                            const validityDays = 1;
                            const sshCrt = await crt.generate_ssh_crt(
                                `${this.auth.user} sadmin user`,
                                this.auth.user,
                                sshHostCaKey,
                                act.ssh_public_key,
                                validityDays,
                                "user",
                            );
                            res2.ssh_host_ca = sshHostCaPub;
                            res2.ssh_crt = sshCrt;
                        } catch (e) {
                            errorHandler("ACTION.GenerateKey", this)(e);
                        }
                    }
                }
                this.sendMessage(res2);
                break;
            }
            default:
                console.warn("Web client unknown message", { act });
        }
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
}

async function sendInitialState(c: WebClient) {
    const rows = db.getAllObjectsFull();
    const msgs = msg.getResent();

    const hostsUp: number[] = [];
    for (const id in hostClients.hostClients) hostsUp.push(+id);

    const action: ISetInitialState = {
        type: ACTION.SetInitialState,
        objectNamesAndIds: {},
        messages: await msgs,
        deploymentObjects: deployment.getView(),
        deploymentStatus: deployment.status,
        deploymentMessage: deployment.message || "",
        deploymentLog: deployment.log,
        hostsUp,
        types: {},
        usedBy: [],
    };
    for (const row of await rows) {
        const content = JSON.parse(row.content);
        if (row.type === typeId) {
            action.types[row.id] = {
                id: row.id,
                type: row.type,
                name: row.name,
                category: row.category,
                content: content as IType,
                version: row.version,
                comment: row.comment,
                time: row.time,
                author: row.author,
            };
        }
        if (!(row.type in action.objectNamesAndIds)) action.objectNamesAndIds[row.type] = [];
        action.objectNamesAndIds[row.type].push({
            type: row.type,
            id: row.id,
            name: row.name,
            category: row.category,
            comment: row.comment,
        });
        for (const o of getReferences(content)) {
            action.usedBy.push([o, row.id]);
        }
    }

    const m: { [key: string]: number } = {};
    for (const id in action) {
        const x = JSON.stringify((action as any)[id]);
        if (x) m[id] = x.length;
    }
    console.log("Send initial state", m);
    c.sendMessage(action);
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
        for (const row of await db.all(
            "SELECT `id`, `name`, `content` FROM `objects` WHERE `type` = ? AND `newest`=1",
            hostId,
        )) {
            if (hostClients.hostClients[row.id]?.auth || !row.content) continue;
            const content: Host = JSON.parse(row.content);
            if (content.messageOnDown) downHosts += 1;
        }

        res.header("Content-Type", "application/json; charset=utf-8")
            .json({ count: downHosts + (await msg.getCount()) })
            .end();
    }

    async status(req: express.Request, res: express.Response) {
        const token = req.query.token;
        if (!token || token !== config.statusToken) {
            res.status(403).end();
            return;
        }
        const ans: { [key: string]: boolean } = {};
        for (const row of await db.all(
            "SELECT `id`, `name` FROM `objects` WHERE `type` = ? AND `newest`=1",
            hostId,
        )) {
            ans[row.name] = hostClients.hostClients[row.id]?.auth || false;
        }
        res.header("Content-Type", "application/json; charset=utf-8").json(ans).end();
    }

    async metrics(req: express.Request, res: express.Response) {
        res.header("Content-Type", "text/plain; version=0.0.4")
            .send(`simpleadmin_messages ${await msg.getCount()}\n`)
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
                getAuth(address, session)
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
