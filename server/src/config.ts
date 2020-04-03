import * as fs from 'fs';

interface Config {
    users?: {'name':string, 'password':string}[]
    hostname: string;
    webPort?: number;
    webHost?: string;
}

export let config: Config = JSON.parse(fs.readFileSync("config.json", {encoding:'utf-8'}));
