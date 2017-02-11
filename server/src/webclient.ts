import * as WebSocket from 'websocket';
import * as http from 'http';
import {IAction} from '../../shared/actions'

export let webclients = new Set<WebClient>();
let socketServer: WebSocket.server;
let httpServer: http.Server;

export class WebClient {
    connection: WebSocket.connection;
    constructor(socket: WebSocket.connection) {
        this.connection = socket;
        this.connection.on('close', ()=>this.onClose());
        this.connection.on('message', (msg)=>this.onMessage(msg));  
    } 

    onClose() {
        webclients.delete(this);
    }

    onMessage(str) {
        const obj = JSON.parse(str);
        console.log(obj);
    }

    sendMessage(obj:IAction) {
        this.connection.send(JSON.stringify(obj))
    }
}

export function startServer() {
    httpServer = http.createServer((request, response)=>{
        response.writeHead(404);
        response.end();
    });
    httpServer.listen(8000);
    socketServer = new WebSocket.server({
        httpServer: httpServer,
        // You should not use autoAcceptConnections for production 
        // applications, as it defeats all standard cross-origin protection 
        // facilities built into the protocol and the browser.  You should 
        // *always* verify the connection's origin and decide whether or not 
        // to accept it. 
        autoAcceptConnections: false
    });
    socketServer.on('request', (request)=>{
        //TODO check request.origin;
        webclients.add(new WebClient(request.accept("sysadmin", request.origin)));
    });
}