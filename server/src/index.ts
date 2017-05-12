import {WebClients} from './webclient';
import {HostClients} from './hostclient';
import {DB} from './db'
import {Msg} from './msg'
import {Deployment} from './deployment'
import * as instances from './instances';

console.log("STARTING SERVER");

async function setup() {
    instances.setMsg(new Msg());
    instances.setDeployment(new Deployment());
    instances.setDb(new DB());
    await instances.db.init()
    instances.setWebClients(new WebClients());
    instances.webClients.startServer();
    instances.setHostClients(new HostClients());
    instances.hostClients.start();
}

setup();