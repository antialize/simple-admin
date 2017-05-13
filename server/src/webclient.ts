import * as http from 'http';
import * as https from 'https';
import {IAction, ACTION, ISetInitialState, IObjectChanged, IAddLogLines, ISetPageAction} from '../../shared/actions'
import * as express from 'express';
import {IObject, IHostContent, IUserContent, PAGE_TYPE} from '../../shared/state'
import * as message from './messages'
import * as WebSocket from 'ws';
import * as url from 'url';
import * as net from 'net';
import {JobOwner} from './jobowner'
import {Job} from './job'
import {ShellJob} from './jobs/shellJob'
import {LogJob} from './jobs/logJob'
import * as fs from 'fs';
import * as basicAuth from 'basic-auth'
import {config} from './config'
import * as bcrypt from 'bcrypt'
import * as helmet from 'helmet'
import {webClients, msg, hostClients, db, deployment} from './instances'

interface EWS extends express.Express {
    ws(s:string, f:(ws:WebSocket, req: express.Request) => void):void;
}

export class WebClient extends JobOwner {
    connection: WebSocket;

    logJobs: {[id: number]: Job} = {};

    constructor(socket: WebSocket) {
        super()
        this.connection = socket;
        this.connection.on('close', ()=>this.onClose());
        this.connection.on('message', (msg)=>this.onMessage(msg));
    } 

    onClose() {
        this.kill();
        webClients.webclients.delete(this);
    }

    async onMessage(str:string) {
        const act = JSON.parse(str) as IAction;
        switch (act.type) {
        case ACTION.FetchObject:
            let rows = await db.getObjectByID(act.id);
            let res: IObjectChanged = {type:ACTION.ObjectChanged, id: act.id, object:[] }
            for (const row of rows) {
                res.object.push(
                    {
                        version: row.version,
                        class: row.type,
                        name: row.name,
                        content: JSON.parse(row.content)
                    }
                );
            }
            this.sendMessage(res);
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
        case ACTION.SetMessageDismissed:
            msg.setDismissed(act.id, act.dismissed);
            break;
        case ACTION.SaveObject:
            {
                if (act.obj.class == 'host') {
                    let c = act.obj.content as IHostContent;
                    // HACK HACK HACK if the string starts with $2 we belive we have allready bcrypt'ed it
                    if (!c.password.startsWith("$2"))
                        c.password = bcrypt.hashSync(c.password, 8);
                } else if (act.obj.class == 'user') {
                    let c = act.obj.content as IUserContent;
                    // HACK HACK HACK if the string starts with $2 we belive we have allready bcrypt'ed it
                    if (!c.password.startsWith("$2"))
                        c.password = bcrypt.hashSync(c.password, 8);
                }
                let {id,version} = await db.changeObject(act.id, act.obj);
                act.obj.version = version;
                let res2: IObjectChanged = {type:ACTION.ObjectChanged, id: id, object:[act.obj] };
                webClients.broadcast(res2);
                let res3: ISetPageAction = {type:ACTION.SetPage, page: {type: PAGE_TYPE.Object, class: act.obj.class, id, version}};
                this.sendMessage(res3);
            }
            break;
        case ACTION.DeployObject:
            deployment.deployObject(act.id);
            break;
        case ACTION.CancelDeployment:
            deployment.cancel();
            break;
        case ACTION.StartDeployment:
            deployment.start();
            break;
        case ACTION.StopDeployment:
            deployment.stop();
            break;
        case ACTION.ToggleDeploymentObject:
            deployment.toggleObject(act.index, act.enabled);
            break;
        default:
            console.log(act);
        }
    }

    sendMessage(obj:IAction) {
        this.connection.send(JSON.stringify(obj))
    }
}

async function sendInitialState(c: WebClient) {
    const rows = db.getAllObjects();
    const msgs = msg.getAll();

    let action:ISetInitialState = {
        type: ACTION.SetInitialState,
        objectNamesAndIds: {},
        statuses: {},
        messages: await msgs,
    };
    for(const row of await rows) {
        if (!(row.type in action.objectNamesAndIds)) action.objectNamesAndIds[row.type] = [];
        action.objectNamesAndIds[row.type].push({id: row.id, name:row.name});
    }

    for (const id in hostClients.hostClients) {
        const c = hostClients.hostClients[id];
        action.statuses[c.id] = c.status;
    }

    c.sendMessage(action);
}

export class WebClients {
    privateKey  = fs.readFileSync('domain.key', 'utf8');
    certificate = fs.readFileSync('chained.pem', 'utf8');
    credentials = {key: this.privateKey, cert: this.certificate};
    httpsApp = express();
    webclients = new Set<WebClient>();
    httpsServer: https.Server;
    wss: WebSocket.Server;
    httpApp = express();
    httpServer: http.Server;

    broadcast(act:IAction) {
        this.webclients.forEach(client => client.sendMessage(act));
    }

    auth(req: http.IncomingMessage) {
        var user = basicAuth(req);

        if (!user || !user.name || !user.pass) {
            return false;
        };

        for (var u of config.users)
            if (u.name == user.name && u.password == user.pass) return true;

        return false;
    }

    constructor() {
        let authHttp = (req: express.Request, res: express.Response, next: ()=>void ) => {
            if (this.auth(req))
                return next();
            else {
                res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
                return res.send(401);
            }
        };

        let socketAuth = (req:express.Request, socket:net.Socket) => {
            if (!this.auth(req)) {
                try {
                    socket.write("HTTP/1.1 401 Unauthorized\r\nContent-type: text/html\r\n\r\n");
                } finally {
                    try {
                        socket.destroy();
                    } catch (_error) {}
                }
            }
        }

        this.httpsApp.use(helmet());
        this.httpsServer = https.createServer(this.credentials, this.httpsApp);
        this.wss = new WebSocket.Server({ server: this.httpsServer })
        this.httpsApp.use(authHttp, express.static("../frontend/public"));
        this.httpsServer.on('upgrade', socketAuth);
        this.wss.on('connection', (ws)=>{
            const u = url.parse(ws.upgradeReq.url, true);
            console.log("Websocket connection", u.hostname, u.pathname)
            if (u.pathname == '/sysadmin') {
                const wc = new WebClient(ws);
                this.webclients.add(wc);
                sendInitialState(wc);
            } else if (u.pathname == '/terminal') {
                const server = u.query.server as number;
                const cols = u.query.cols as number;
                const rows = u.query.rows as number;
                if (server in hostClients.hostClients)
                    new ShellJob(hostClients.hostClients[server], ws, cols, rows);
            } else {
                console.log("Bad socket", u);
                ws.close();
            }
        });

        this.httpApp.use(helmet())
        this.httpServer = http.createServer(this.httpApp); 
        this.httpApp.use('/.well-known/acme-challenge', express.static("/var/www/challenges"));
        this.httpApp.get("*", function (req, res, next) {
            res.redirect("https://" + req.headers.host + "/" + req.path);
        })
    }
    
    startServer() {
        this.httpServer.listen(80, "0.0.0.0");
        this.httpsServer.listen(443, "0.0.0.0", function(){
            console.log("server running at https://localhost:8001/")
        });
    }
}

