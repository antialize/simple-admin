import { Deployment } from "./deployment";
import { errorHandler } from "./error";
import { HostClients } from "./hostclient";
import * as instances from "./instances";
import { ModifiedFiles } from "./modifiedfiles";
import { Msg } from "./msg";
import { WebClients } from "./webclient";
const serverRs = require("simple_admin_server_rs");
const exitHook = require("async-exit-hook");

console.log("STARTING SERVER");

async function setup() {
    instances.setRs(await serverRs.init());
    try {
        await serverRs.setupDb(instances.rs);
    } catch (err) {
        errorHandler("db")(err);
        process.exit(42);
    }
    instances.setMsg(new Msg());
    instances.setDeployment(new Deployment());
    instances.setModifiedFiles(new ModifiedFiles());
    instances.setWebClients(new WebClients());
    instances.webClients.startServer();
    instances.setHostClients(new HostClients());
    instances.hostClients.start();
}

setup();
