import * as webclient from './webclient';
import * as hostclient from './hostclient';
import * as db from './db';
console.log("STARTING SERVER");

async function setup() {
    await db.init()
    webclient.startServer();
    hostclient.startServer();
}

setup();