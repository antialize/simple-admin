import * as http from 'http';
import * as https from 'https';
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
import { webClients, msg, hostClients, db, deployment } from './instances'
import { errorHandler } from './error'
import { IType, typeId, userId, TypePropType } from '../../shared/type'
import setup from './setup'
import { log } from 'winston';
import * as crypto from 'crypto';
import { config } from './config'
import * as speakeasy from 'speakeasy';
import * as stat from './stat';
import {docker} from './docker';

interface EWS extends express.Express {
    ws(s: string, f: (ws: WebSocket, req: express.Request) => void): void;
}

async function getAuth(host: string, sid: string) {
    try {
        let row = await db.get("SELECT `pwd`, `otp`, `user`, `host` FROM `sessions` WHERE `sid`=?", sid);
        if (row['host'] != host || row['user'] === "docker_client") {
            return { auth: false, pwd: false, otp: false, sid: null, user: null };
        } else {
            const now = Date.now() / 1000 | 0;
            const pwd = (row['pwd'] != null && row['pwd'] + 24 * 60 * 60 > now); //Passwords time out after 24 hours
            const otp = (row[`otp`] != null && row['otp'] + 64 * 24 * 60 * 60 > now); //otp time out after 2 months
            return { auth: otp && pwd, otp, pwd, sid, user: row['user'] };
        }
    } catch (e) {
        return { auth: false, pwd: false, otp: false, sid: null, user: null };
    }
}

export class WebClient extends JobOwner {
    connection: WebSocket;
    auth: boolean;
    session: string | null;
    user: string | null;
    logJobs: { [id: number]: Job } = {};
    host: string;

    constructor(socket: WebSocket, host: string) {
        super()
        this.auth = false;
        this.session = null;
        this.user = null;
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

    async sendAuthStatus(sid: string) {
        this.session = null;
        this.auth = false;
        this.user = null;
        let ans = await getAuth(this.host, sid);
        this.session = ans.sid;
        this.user = ans.user;
        this.auth = ans.auth;
        this.sendMessage({ type: ACTION.AuthStatus, pwd: ans.pwd, otp: ans.otp, session: ans.sid, user: ans.user, message: null });
    }

    async onMessage(str: string) {
        const act = JSON.parse(str) as IAction;
        if (!this.auth && act.type != ACTION.Login && act.type != ACTION.RequestAuthStatus) {
            this.connection.close(403);
            return;
        }

        switch (act.type) {
            case ACTION.RequestStatBucket:
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
                stat.subscribe(this, act);
                break;
            case ACTION.RequestAuthStatus:
                log('info', "AuthStatus", this.host, this.session, this.user);
                this.sendAuthStatus(act.session);
                break;
            case ACTION.Login:
                let otp = false;
                let newOtp = false;
                let pwd = false;
                let session = null;
                if (this.session) {
                    const a = await getAuth(this.host, this.session);
                    if (act.user == a.user) {
                        session = a.sid;
                        otp = a.otp;
                    }
                }

                let found = false;
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
                    this.sendMessage({ type: ACTION.AuthStatus, pwd: false, otp, session: this.session, user: act.user, message: "Invalid user name" });
                    this.auth = false;
                } else if (!pwd || !otp) {
                    this.sendMessage({ type: ACTION.AuthStatus, pwd: false, otp, session: this.session, user: act.user, message: "Invalid password or one time password" });
                    this.auth = false;
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

                    this.sendMessage({ type: ACTION.AuthStatus, pwd: true, otp, session: session, user: act.user, message: null });
                    this.auth = true;
                    this.user = act.user;
                    this.session = session;
                }
                break;
            case ACTION.RequestInitialState:
                await sendInitialState(this);
                break;
            case ACTION.Logout:
                log("info", "logout", this.host, this.user, this.session, act.forgetPwd, act.forgetOtp);
                if (act.forgetPwd) await db.run("UPDATE `sessions` SET `pwd`=null WHERE `sid`=?", this.session);
                if (act.forgetOtp) {
                    await db.run("UPDATE `sessions` SET `otp`=null WHERE `sid`=?", this.session);
                    this.session = null;
                }

                this.sendAuthStatus(this.session);
                break;
            case ACTION.FetchObject:
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
                if (act.host in hostClients.hostClients) {
                    new PokeServiceJob(hostClients.hostClients[act.host], act.poke, act.service);
                }
                break;
            case ACTION.StartLog:
                if (act.host in hostClients.hostClients) {
                    new LogJob(hostClients.hostClients[act.host], this, act.id, act.logtype, act.unit);
                }
                break;
            case ACTION.EndLog:
                if (act.id in this.logJobs)
                    this.logJobs[act.id].kill();
                break;
            case ACTION.SetMessagesDismissed:
                msg.setDismissed(act.ids, act.dismissed);
                break;
            case ACTION.MessageTextReq:
                {
                    let row = await msg.getFullText(act.id);
                    this.sendMessage({ type: ACTION.MessageTextRep, id: act.id, message: row['message'] })
                }
                break;
            case ACTION.SaveObject:
                {
                    // HACK HACK HACK crypt passwords that does not start with $6$, we belive we have allready bcrypt'ed it
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
            case ACTION.DeleteObject:
                {
                    let objects = await db.getAllObjectsFull();
                    let conflicts: string[] = [];
                    for (let object of objects) {
                        let content = JSON.parse(object.content);
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
                }
                break;
            case ACTION.DeployObject:
                deployment.deployObject(act.id, act.redeploy).catch(errorHandler("Deployment::deployObject", this));
                break;
            case ACTION.CancelDeployment:
                deployment.cancel();
                break;
            case ACTION.StartDeployment:
                deployment.start().catch(errorHandler("Deployment::start", this));
                break;
            case ACTION.StopDeployment:
                deployment.stop();
                break;
            case ACTION.ToggleDeploymentObject:
                deployment.toggleObject(act.index, act.enabled);
                break;
            case ACTION.DockerDeployStart:
                docker.deploy(this, act);
                break;
            case ACTION.DockerListDeployments:
                docker.listDeployments(this, act);
                break;
            case ACTION.DockerListImageTags:
                docker.listImageTags(this, act)
                break;
            default:
                log("warning", "Web client unknown message", { act });
        }
    }

    sendMessage(obj: IAction) {
        this.connection.send(JSON.stringify(obj), (err: Error) => {
            if (err) {
                log("warning", "Web client error sending message", { err });
                this.connection.terminate();
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
        deploymentMessage: deployment.message,
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
        action.objectNamesAndIds[row.type].push({ type: row.type, id: row.id, name: row.name, category: row.category });
    }

    for (const id in hostClients.hostClients) {
        const c = hostClients.hostClients[id];
        action.statuses[c.id] = c.status;
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
    privateKey = fs.readFileSync('domain.key', 'utf8');
    certificate = fs.readFileSync('chained.pem', 'utf8');
    credentials = { key: this.privateKey, cert: this.certificate };
    httpsApp = express();
    webclients = new Set<WebClient>();
    httpsServer: https.Server;
    wss: WebSocket.Server;
    httpApp = express();
    httpServer: http.Server;
    interval: NodeJS.Timer;

    broadcast(act: IAction) {
        this.webclients.forEach(client => {
            if (client.auth)
                client.sendMessage(act)
        });
    }

    constructor() {
        this.httpsApp.use(helmet());
        this.httpsServer = https.createServer(this.credentials, this.httpsApp);
        this.wss = new WebSocket.Server({ server: this.httpsServer })
        this.httpsApp.get("/setup.sh", (req, res) => setup(req, res));
        this.httpsApp.get("/v2/*", docker.get.bind(docker));
        this.httpsApp.put("/v2/*", docker.put.bind(docker) );
        this.httpsApp.post("/v2/*", docker.post.bind(docker));
        this.httpsApp.delete("/v2/*", docker.delete.bind(docker));
        this.httpsApp.patch("/v2/*", docker.patch.bind(docker));
        this.httpsApp.use(express.static("../frontend/public"));
        this.wss.on('connection', (ws, request) => {
            const u = url.parse(request.url, true);
            if (u.pathname == '/sysadmin') {
                const wc = new WebClient(ws, request.socket.address()['address']);
                this.webclients.add(wc);
            } else if (u.pathname == '/terminal') {
                const server = +u.query.server;
                const cols = +u.query.cols;
                const rows = +u.query.rows;
                const session = u.query.session as string;
                const addresses = request.socket.address()['address'];
                const address = Array.isArray(addresses) ? address[0] as string : addresses;
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

        this.httpApp.use(helmet())
        this.httpServer = http.createServer(this.httpApp);
        this.httpApp.use('/.well-known/acme-challenge', express.static("/opt/acme-tiny/challenges/"));
        this.httpApp.get("*", function(req, res, next) {
            res.redirect("https://" + req.headers.host + "/" + req.path);
        })
    }

    startServer() {
        this.httpServer.listen(80, "0.0.0.0");
        this.httpsServer.listen(443, "0.0.0.0", function() {
            log('info', "Web server started on port 443");
        });
        this.httpsServer.on('close', () => {
            log('info', "Web server stopped");
        });
    }
}

