import * as webclient from './webclient';
import * as hostclient from './hostclient';
import * as db from './db';
console.log("STARTING SERVER");
db.init();
webclient.startServer();
hostclient.startServer();