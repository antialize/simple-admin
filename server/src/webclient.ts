import * as http from 'http';
import * as https from 'https';
import {IAction, ACTION, ISetInitialState, IObjectChanged} from '../../shared/actions'
import * as express from 'express';
import {IObject} from '../../shared/state'

//import * as expressWS from 'express-ws';
import * as WebSocket from 'ws';
import * as url from 'url';
import {ShellJob, hostClients, JobOwner, HostClient} from './hostclient';
import * as fs from 'fs';
import * as db from './db'

interface EWS extends express.Express {
    ws(s:string, f:(ws:WebSocket, req: express.Request) => void);
}

const privateKey  = fs.readFileSync('key.pem', 'utf8');
const certificate = fs.readFileSync('cert.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const app = express();
const server = http.createServer(app);
const server2 = https.createServer(credentials, app);

const wss = new WebSocket.Server({ server: server2 });

export let webclients = new Set<WebClient>();

export class WebClient extends JobOwner {
    connection: WebSocket;

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

    async onMessage(str) {
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
        default:
            console.log(act);
        }
    }

    sendMessage(obj:IAction) {
        this.connection.send(JSON.stringify(obj))
    }
}

app.get('/', (req, res) => {
    res.send("Hello world");
});

async function sendInitialState(c: WebClient) {
    const rows = await db.getAllObjects();
    let action:ISetInitialState = {
        type: ACTION.SetInitialState,
        objectNamesAndIds: {},
        statuses: {}
    };

    for(const row of rows) {
        if (!(row.type in action.objectNamesAndIds)) action.objectNamesAndIds[row.type] = [];
        action.objectNamesAndIds[row.type].push({id: row.id, name:row.name});
    }

    hostClients.forEach( (c) => {
        if (c.auth === true && c.id !== null)
            action.statuses[c.id] = c.status;
    });

    c.sendMessage(action);
}

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
        let some=null;
        hostClients.forEach((c)=>{some=c;});
        new ShellJob(some, ws, cols, rows);
    } else {
        console.log("Bad socket", u);
        ws.close();
    }
});

export function startServer() {
    server.listen(8000);
    server2.listen(8001, "127.0.0.1", function(){
        console.log("server running at https://localhost:8001/")
    });
}