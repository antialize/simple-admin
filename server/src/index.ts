//import { errorHandler } from "./error";
import * as instances from "./instances";

const serverRs = require("simple_admin_server_rs");

console.log("STARTING SERVER");

async function setup() {
    instances.setRs(await serverRs.init(instances));
    try {
        await serverRs.setupDb(instances.rs);
    } catch (err) {
        //errorHandler("db")(err);
        process.exit(42);
    }
}

setup();
