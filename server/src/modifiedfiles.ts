import { fileId } from "./default";
import { db, webClients } from "./instances";
import { IModifiedFilesResolve, IModifiedFilesList, IModifiedFilesScan, ModifiedFile, ACTION } from "../../shared/actions";
import { WebClient } from "./webclient";

export class ModifiedFiles {
    lastScan: number = null;
    scanning: boolean = false;
    idc: number = 0;
    props = new Map<number, {dead: boolean, updated: boolean}>();
    modifiedFiles: ModifiedFile[];

    async broadcast_changes() {
        const changed = [];
        const removed = [];
        for (const f of this.modifiedFiles) {
            const p = this.props.get(f.id);
            if (!p.updated) continue;
            if (p.dead)
                removed.push(f.id);
            else
                changed.push(f);
        }
        webClients.broadcast({
            type: ACTION.ModifiedFilesChanged,
            full: false,
            scanning: this.scanning,
            lastScanTime: this.lastScan,
            changed,
            removed
        })
    }

    async scan(client: WebClient, act:IModifiedFilesScan) {
        if (this.scanning) return;

        this.scanning = true;
        this.lastScan = +new Date() / 1000;
        await this.broadcast_changes();

        /*for (const row of await db.all("SELECT `name`, `content`, `type`, `title`, `host` FROM `deployments` WHERE `type`=?", fileId)) {
            console.log(row):
        }*/
        this.scanning = false;
        await this.broadcast_changes();
    }

    async resolve(client: WebClient, act:IModifiedFilesResolve) {

    }
    
    async list(client: WebClient, act:IModifiedFilesList) {
        client.sendMessage({
            type: ACTION.ModifiedFilesChanged,
            full: true,
            scanning: this.scanning,
            lastScanTime: this.lastScan,
            changed: this.modifiedFiles,
            removed: [],
        })
    }
}