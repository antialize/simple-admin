import {WebClients} from './webclient';
import {HostClients} from './hostclient';
import {DB} from './db'
import {Msg} from './msg'
import {Deployment} from './deployment'
import * as instances from './instances';
import {errorHandler} from './error'
import * as stat from './stat';
import {log} from 'winston';
const exitHook = require('async-exit-hook');

log("info", "STARTING SERVER");

async function setup() {
    instances.setMsg(new Msg());
    instances.setDeployment(new Deployment());
    instances.setDb(new DB());

    try {
        await instances.db.init()
    } catch (err) {
        errorHandler("db")(err);
    }
    instances.setWebClients(new WebClients());
    instances.webClients.startServer();
    instances.setHostClients(new HostClients());
    instances.hostClients.start();

    exitHook((cb:any) => {
        log("info", "Flush for shutdown");
        stat.flush().then(cb)
    });
    

    process.once('SIGUSR2', () => {
        log("info", "Nodemon restart");
        stat.flush().then(()=> {
            process.kill(process.pid, 'SIGUSR2');
        });
    });
};

setup();