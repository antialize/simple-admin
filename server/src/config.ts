import * as fs from "node:fs";

interface Config {
    users?: { name: string; password: string }[];
    hostname: string;
    usedImagesToken?: string;
}

export const config: Config = JSON.parse(fs.readFileSync("config.json", { encoding: "utf-8" }));
