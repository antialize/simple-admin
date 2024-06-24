import { DB } from "./db";
import { Deployment } from "./deployment";
import { errorHandler } from "./error";
import { HostClients } from "./hostclient";
import * as instances from "./instances";
import { ModifiedFiles } from "./modifiedfiles";
import { Msg } from "./msg";
import { WebClients } from "./webclient";

const exitHook = require("async-exit-hook");

console.log("STARTING SERVER");

async function setup() {
    instances.setMsg(new Msg());
    instances.setDeployment(new Deployment());
    instances.setDb(new DB());
    instances.setModifiedFiles(new ModifiedFiles());

    try {
        await instances.db.init();
    } catch (err) {
        errorHandler("db")(err);
    }
    instances.setWebClients(new WebClients());
    instances.webClients.startServer();
    instances.setHostClients(new HostClients());
    instances.hostClients.start();
}

setup();
