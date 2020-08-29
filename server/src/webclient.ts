import * as http from 'http';
import { IAction, ACTION, ISetInitialState, IObjectChanged, IAddLogLines, ISetPageAction, IAlert, IStatBucket } from '../../shared/actions'
import * as express from 'express';
import { IObject2, PAGE_TYPE } from '../../shared/state'
import * as message from './messages'
import * as WebSocket from 'ws';
import * as url from 'url';
import * as net from 'net';
import { JobOwner } from './jobowner'
import { Job } from './job'
import { ShellJob } from './jobs/shellJob'
import { LogJob } from './jobs/logJob'
import { PokeServiceJob } from './jobs/pokeServiceJob'
import * as fs from 'fs';
import * as crypt from './crypt'
import * as helmet from 'helmet'
import { webClients, msg, hostClients, db, deployment, modifiedFiles } from './instances'
import { errorHandler } from './error'
import { IType, typeId, userId, TypePropType } from '../../shared/type'
import setup from './setup'
import { log } from 'winston';
import * as crypto from 'crypto';
import { config } from './config'
import * as speakeasy from 'speakeasy';
import * as stat from './stat';
import {docker} from './docker';
import nullCheck from '../../shared/nullCheck';
import { getAuth, AuthInfo, noAccess } from './getAuth';
import * as bodyParser from 'body-parser'

interface EWS extends express.Express {
    ws(s: string, f: (ws: WebSocket, req: express.Request) => void): void;
}

export class WebClient extends JobOwner {
    connection: WebSocket;
    auth: AuthInfo;
    logJobs: { [id: number]: Job } = {};
    host: string;

    constructor(socket: WebSocket, host: string) {
        super()
        this.auth = noAccess;
        this.connection = socket;
        this.host = host;
        this.connection.on('close', () => this.onClose());
        this.connection.on('message', (msg: string) => this.onMessage(msg).catch(errorHandler("WebClient::message", this)));
        this.connection.on('error', (err) => {
            log('waring', "Web client error", { err });
        });
    }

    onClose() {
        this.kill();
        webClients.webclients.delete(this);
        stat.subscribe(this, null);
    }

    async sendAuthStatus(sid: string | null) {
        this.auth = await getAuth(this.host, sid);
        this.sendMessage({ type: ACTION.AuthStatus, message: null, ...this.auth });
    }

    async onMessage(str: string) {
        const act = JSON.parse(str) as IAction;


        switch (act.type) {
            case ACTION.RequestStatBucket:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }

                let bucket = await stat.get(act.host, act.name, act.level, act.index);
                let a: IStatBucket = {
                    type: ACTION.StatBucket,
                    target: act.target,
                    host: act.host,
                    name: act.name,
                    level: act.level,
                    index: act.index,
                    values: null
                };
                if (bucket) {
                    a.values = [];
                    for (let i = 0; i < 1024; ++i)
                        a.values[i] = bucket.values.readFloatBE(i * 4);
                }
                this.sendMessage(a);
                break;
            case ACTION.SubscribeStatValues:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                stat.subscribe(this, act);
                break;
            case ACTION.RequestAuthStatus:
                log('info', "AuthStatus", this.host, this.auth.session, this.auth.user);
                this.sendAuthStatus(act.session || null);
                break;
            case ACTION.Login:
                let session = this.auth.session;
                const auth = session? await getAuth(this.host, session) : noAccess;
                let found = false;
                let newOtp = false;
                let otp = auth && auth.otp;
                let pwd = auth && auth.pwd;

                if (config.users) {
                    for (const u of config.users) {
                        if (u.name == act.user) {
                            found = true;
                            if (u.password == act.pwd) {
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
                        let contentStr = await db.getUserContent(act.user);
                        if (contentStr) {
                            let content = JSON.parse(contentStr);
                            found = true;
                            pwd = await crypt.validate(act.pwd, content.password);
                            if (act.otp) {
                                otp = speakeasy.totp.verify({ secret: content.otp_base32, encoding: 'base32', token: act.otp, window: 1 });
                                newOtp = true;
                            }
                        }
                    } catch (e) {
                    }
                }
                if (!found) {
                    this.sendMessage({ type: ACTION.AuthStatus, pwd: false, otp, session: session, user: act.user, auth: false, admin:false, dockerPull: false, dockerPush:false, message: "Invalid user name" });
                    this.auth = noAccess;
                } else if (!pwd || !otp) {
                    this.sendMessage({ type: ACTION.AuthStatus, pwd: false, otp, session: session, user: act.user, auth: false, admin:false, dockerPull: false, dockerPush:false, message: "Invalid password or one time password" });
                    this.auth = noAccess;
                } else {
                    const now = Date.now() / 1000 | 0;
                    if (session && newOtp) {
                        await db.run("UPDATE `sessions` SET `pwd`=?, `otp`=? WHERE `sid`=?", now, now, session);
                    } else if (session) {
                        let eff = await db.run("UPDATE `sessions` SET `pwd`=? WHERE `sid`=?", now, session);
                    } else {
                        session = crypto.randomBytes(64).toString('hex');
                        await db.run("INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)", act.user, this.host, now, now, session);
                    }
                    this.auth = await getAuth(this.host, session);
                    if (!this.auth.auth)
                        throw Error("Internal auth error");
                    this.sendMessage({ type: ACTION.AuthStatus, message: null, ...this.auth });
                }
                break;
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
                log("info", "logout", this.host, this.auth.user, this.auth.session, act.forgetPwd, act.forgetOtp);
                if (act.forgetPwd) await db.run("UPDATE `sessions` SET `pwd`=null WHERE `sid`=?", this.auth.session);
                if (act.forgetOtp) {
                    await db.run("UPDATE `sessions` SET `otp`=null WHERE `sid`=?", this.auth.session);
                    this.auth = noAccess;
                }
                this.sendAuthStatus(this.auth.session);
                break;
            case ACTION.FetchObject:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                let rows = await db.getObjectByID(act.id);
                let res: IObjectChanged = { type: ACTION.ObjectChanged, id: act.id, object: [] }
                for (const row of rows) {
                    res.object.push(
                        {
                            id: act.id,
                            version: row.version,
                            type: row.type,
                            name: row.name,
                            content: JSON.parse(row.content),
                            category: row.category,
                            comment: row.comment,
                        }
                    );
                }
                this.sendMessage(res);
                break;
            case ACTION.GetObjectId:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                let id = null;
                try {
                    const parts = act.path.split("/", 2);
                    if (parts.length != 2) break;
                    const typeRow = await db.get('SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1', typeId, parts[0]);
                    if (!typeRow || !typeRow.id) break;
                    const objectRow = await db.get('SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1', typeRow['id'], parts[1]);
                    if (objectRow) id = objectRow.id;
                } finally {
                    this.sendMessage({type: ACTION.GetObjectIdRes, ref: act.ref, id});
                }
                break;
            case ACTION.PokeService:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                if (act.host in hostClients.hostClients) {
                    new PokeServiceJob(hostClients.hostClients[act.host], act.poke, act.service);
                }
                break;
            case ACTION.StartLog:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                if (act.host in hostClients.hostClients) {
                    new LogJob(hostClients.hostClients[act.host], this, act.id, act.logtype, act.unit);
                }
                break;
            case ACTION.EndLog:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                if (act.id in this.logJobs)
                    this.logJobs[act.id].kill();
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
                    let row = await msg.getFullText(act.id);
                    this.sendMessage({ type: ACTION.MessageTextRep, id: act.id, message: row?row.message:"missing" })
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
                    let c = act.obj.content;
                    const typeRow = await db.getNewestObjectByID(act.obj.type);
                    let type = JSON.parse(typeRow.content) as IType;
                    for (let r of type.content || []) {
                        if (r.type != TypePropType.password) continue;
                        if (!(r.name in c) || c[r.name].startsWith("$6$")) continue;
                        c[r.name] = await crypt.hash(c[r.name]);
                    }

                    if (act.obj.type == userId && (!c['otp_base32'] || !c['otp_url'])) {
                        let secret = speakeasy.generateSecret({ name: "Simple Admin:" + act.obj.name });
                        c['otp_base32'] = secret.base32;
                        c['otp_url'] = secret.otpauth_url;
                    }


                    let { id, version } = await db.changeObject(act.id, act.obj);
                    act.obj.version = version;
                    let res2: IObjectChanged = { type: ACTION.ObjectChanged, id: id, object: [act.obj] };
                    webClients.broadcast(res2);
                    let res3: ISetPageAction = { type: ACTION.SetPage, page: { type: PAGE_TYPE.Object, objectType: act.obj.type, id, version } };
                    this.sendMessage(res3);
                }
                break;
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
                    let objects = await db.getAllObjectsFull();
                    let conflicts: string[] = [];
                    for (let object of objects) {
                        let content = JSON.parse(object.content);
                        if (!content) continue;
                        if (object.type == act.id)
                            conflicts.push("* " + object.name + " (" + object.type + ") type");
                        for (let val of ['sudoOn', 'depends', 'contains']) {
                            if (!(val in content)) continue;
                            for (let id of (content[val]) as number[]) {
                                if (id != act.id) continue;
                                conflicts.push("* " + object.name + " (" + object.type + ") " + val);
                            }
                        }
                    }
                    if (conflicts.length > 0) {
                        let res: IAlert = { type: ACTION.Alert, title: "Cannot delete object", message: "The object can not be delete as it is in use by:\n" + conflicts.join("\n") };
                        this.sendMessage(res);
                    } else {
                        log('info', 'Web client delete object', { id: act.id });
                        await db.changeObject(act.id, null);
                        let res2: IObjectChanged = { type: ACTION.ObjectChanged, id: act.id, object: [] };
                        webClients.broadcast(res2);
                        let res3: ISetPageAction = { type: ACTION.SetPage, page: { type: PAGE_TYPE.Dashbord } };
                        this.sendMessage(res3);
                    }
                    break;
                }
            case ACTION.DeployObject:
                if (!this.auth.admin) {
                    this.connection.close(403);
                    return;
                }
                deployment.deployObject(act.id, act.redeploy).catch(errorHandler("Deployment::deployObject", this));
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
            case ACTION.DockerDeployStart:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.deploy(this, act);
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
            case ACTION.DockerContainerStart:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.containerCommand(this, act.host, act.container, "start");
                break;
            case ACTION.DockerContainerStop:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.containerCommand(this, act.host, act.container, "stop");
                break;
            case ACTION.DockerContainerRemove:
                if (!this.auth.dockerPush) {
                    this.connection.close(403);
                    return;
                }
                await docker.containerCommand(this, act.host, act.container, "rm");
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
            default:
                log("warn", "Web client unknown message", { act });
        }
    }

    sendMessage(obj: IAction) {
        this.connection.send(JSON.stringify(obj), (err?: Error) => {
            if (err) {
                if (Object.getOwnPropertyNames(err).length != 0)
                    log("warn", "Web client error sending message", { err, host:this.host });
                this.connection.terminate();
                this.onClose();
            }
        })
    }
}

async function sendInitialState(c: WebClient) {
    const rows = db.getAllObjectsFull();
    const msgs = msg.getResent();

    let action: ISetInitialState = {
        type: ACTION.SetInitialState,
        objectNamesAndIds: {},
        statuses: {},
        messages: await msgs,
        deploymentObjects: deployment.getView(),
        deploymentStatus: deployment.status,
        deploymentMessage: deployment.message || "",
        deploymentLog: deployment.log,
        types: {},
    };
    for (const row of await rows) {
        if (row.type == typeId) {
            action.types[row.id] = {
                id: row.id,
                type: row.type,
                name: row.name,
                category: row.category,
                content: JSON.parse(row.content) as IType,
                version: row.version,
                comment: row.comment
            };
        }
        if (!(row.type in action.objectNamesAndIds)) action.objectNamesAndIds[row.type] = [];
        action.objectNamesAndIds[row.type].push({ type: row.type, id: row.id, name: row.name, category: row.category, comment: row.comment });
    }

    for (const id in hostClients.hostClients) {
        const c = hostClients.hostClients[id];
        if (c.status) {
            action.statuses[nullCheck(c.id, "Expected id")] = nullCheck(c.status, "Expected status");
        }
    }

    const m: { [key: string]: number } = {};


    for (const id in action) {
        const x = JSON.stringify((action as any)[id]);
        if (x) m[id] = x.length;
    }
    log("info", "Send initial state", m);
    c.sendMessage(action);
}

export class WebClients {
    httpApp = express();
    webclients = new Set<WebClient>();
    httpServer: http.Server;
    wss: WebSocket.Server;

    broadcast(act: IAction) {
        this.webclients.forEach(client => {
            if (client.auth.admin)
                client.sendMessage(act)
        });
    }

    async countMessages(req: express.Request, res: express.Response) {
        res.header('Content-Type', 'application/json; charset=utf-8')
            .json({ 'count': await msg.getCount() }).end();
    }    

    constructor() {
        this.httpApp.use(helmet());
        this.httpServer = http.createServer(this.httpApp);
        this.wss = new WebSocket.Server({ server: this.httpServer })
        this.httpApp.get("/setup.sh", (req, res) => setup(req, res));
        this.httpApp.get("/v2/*", docker.get.bind(docker));
        this.httpApp.put("/v2/*", docker.put.bind(docker) );
        this.httpApp.post("/v2/*", docker.post.bind(docker));
        this.httpApp.delete("/v2/*", docker.delete.bind(docker));
        this.httpApp.patch("/v2/*", docker.patch.bind(docker));
        this.httpApp.get("/docker/*", docker.images.bind(docker));
        this.httpApp.post("/usedImages", bodyParser.json(), docker.usedImages.bind(docker));
        this.httpApp.get('/messages', this.countMessages.bind(this));
        this.wss.on('connection', (ws, request) => {
            const rawAddresses = request.socket.address();
            const address = request.headers['x-forwarded-for'] as string || (typeof rawAddresses == 'string' ? rawAddresses : rawAddresses.address);
            if (!request.url) {
                ws.close();
                return;
            }
            const u = url.parse(request.url, true);
            if (u.pathname == '/sysadmin') {
                const wc = new WebClient(ws,  address);
                this.webclients.add(wc);
            } else if (u.pathname == '/terminal') {
                const server = +u.query!.server!;
                const cols = +u.query!.cols!;
                const rows = +u.query!.rows!;
                const session = u.query.session as string;
                getAuth(address, session).then((a: any) => {
                    if (a.auth && server in hostClients.hostClients)
                        new ShellJob(hostClients.hostClients[server], ws, cols, rows);
                    else
                        ws.close();
                }).catch(() => { ws.close() });
            } else {
                ws.close();
            }
        });

    }

    startServer() {
        this.httpServer.listen(8182, "localhost", function() {
            log('info', "Web server started on port 443");
        });
        this.httpServer.on('close', () => {
            log('info', "Web server stopped");
        });
    }
}

