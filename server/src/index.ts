import { errorHandler } from "./error";
import { HostClients } from "./hostclient";
import * as instances from "./instances";
import { WebClients } from "./webclient";

const serverRs = require("simple_admin_server_rs");

console.log("STARTING SERVER");

async function setup() {
    instances.setRs(await serverRs.init(instances));
    try {
        await serverRs.setupDb(instances.rs);
    } catch (err) {
        errorHandler("db")(err);
        process.exit(42);
    }
    instances.setWebClients(new WebClients());
    instances.webClients.startServer();
    instances.setHostClients(new HostClients());
    instances.hostClients.start();
}

setup();
