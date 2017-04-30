import * as http from 'http';
import * as https from 'https';
import {IAction, ACTION, ISetInitialState, IObjectChanged, IAddLogLines, ISetPageAction} from '../../shared/actions'
import * as express from 'express';
import {IObject, IHostContent, PAGE_TYPE} from '../../shared/state'
import * as message from './messages'

import * as WebSocket from 'ws';
import * as url from 'url';
import * as net from 'net';
import {JobOwner, Job} from './job'
import {ShellJob} from './jobs/shellJob'
import {LogJob} from './jobs/logJob'
import {hostClients, HostClient} from './hostclient';
import * as fs from 'fs';
import * as db from './db'
import * as basicAuth from 'basic-auth'
import {config} from './config'
import * as msg from './msg'
import * as bcrypt from 'bcrypt'
import * as helmet from 'helmet'

interface EWS extends express.Express {
    ws(s:string, f:(ws:WebSocket, req: express.Request) => void):void;
}

const privateKey  = fs.readFileSync('domain.key', 'utf8');
const certificate = fs.readFileSync('chained.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const app = express();
app.use(helmet())
//We might need a http server to implement acmee
const server2 = https.createServer(credentials, app);

const wss = new WebSocket.Server({ server: server2 });
export let webclients = new Set<WebClient>();

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
        webclients.delete(this);
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
            if (act.host in hostClients) {
                new LogJob(hostClients[act.host], this, act.id, act.logtype, act.unit);
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
                }
                let {id,version} = await db.changeObject(act.id, act.obj);
                act.obj.version = version;
                let res2: IObjectChanged = {type:ACTION.ObjectChanged, id: id, object:[act.obj] };
                broadcast(res2);
                let res3: ISetPageAction = {type:ACTION.SetPage, page: {type: PAGE_TYPE.Object, class: act.obj.class, id, version}};
                this.sendMessage(res3);
            }
            break;
        default:
            console.log(act);
        }
    }

    sendMessage(obj:IAction) {
        this.connection.send(JSON.stringify(obj))
    }
}

export function broadcast(act:IAction) {
    webclients.forEach(client => client.sendMessage(act));
}

function auth(req: http.IncomingMessage) {
    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
        return false;
    };

    for (var u of config.users)
        if (u.name == user.name && u.password == user.pass) return true;

    return false;
}


function authHttp(req: express.Request, res: express.Response, next: ()=>void ) {
    if (auth(req))
        return next();
    else {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.send(401);
    }
}

app.use(authHttp, express.static("../frontend/public"));

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

    for (const id in hostClients) {
        const c = hostClients[id];
        action.statuses[c.id] = c.status;
    }

    c.sendMessage(action);
}


function socketAuth(req:express.Request, socket:net.Socket) {
    if (!auth(req)) {
        try {
            socket.write("HTTP/1.1 401 Unauthorized\r\nContent-type: text/html\r\n\r\n");
        } finally {
            try {
                socket.destroy();
            } catch (_error) {}
        }
    }
}

server2.on('upgrade', socketAuth);
    
wss.on('connection', (ws)=>{

    const u = url.parse(ws.upgradeReq.url, true);
    console.log("Websocket connection", u.hostname, u.pathname)
    if (u.pathname == '/sysadmin') {
        const wc = new WebClient(ws);
        webclients.add(wc);
        sendInitialState(wc);
    } else if (u.pathname == '/terminal') {
        const server = u.query.server as number;
        const cols = u.query.cols as number;
        const rows = u.query.rows as number;
        if (server in hostClients)
            new ShellJob(hostClients[server], ws, cols, rows);
    } else {
        console.log("Bad socket", u);
        ws.close();
    }
});

const app2 = express();
const server = http.createServer(app2); 
app2.use(helmet())
app2.use('/.well-known/acme-challenge', express.static("/var/www/challenges"));
app2.get("*", function (req, res, next) {
    res.redirect("https://" + req.headers.host + "/" + req.path);
})



export function startServer() {
    
    server.listen(80, "0.0.0.0");
    server2.listen(443, "0.0.0.0", function(){
        console.log("server running at https://localhost:8001/")
    });
}
