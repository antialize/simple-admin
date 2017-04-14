import * as sqlite from 'sqlite3'
import {IHostContent} from '../../shared/state'

export let db:sqlite.Database = null;

export async function init() {
    db = new sqlite.Database("sysadmin.db");

    const r = (stmt:string) => {
        return new Promise<void>(cb =>
            db.run(stmt, [], (err) => {
                if (err) {
                    console.log(stmt, err);
                    process.exit(1);
                } else
                    cb();
            }));
    };

    await r("CREATE TABLE IF NOT EXISTS `objects` (`id` INTEGER, `version` INTEGER, `type` INTEGER, `name` TEXT, `content` TEXT, `comment` TEXT, `time` INTEGER, `newest` INTEGER)");
    await r("CREATE UNIQUE INDEX IF NOT EXISTS `id_version` ON `objects` (id, version)");
    await r("CREATE TABLE IF NOT EXISTS `messages` (`id` INTEGER PRIMARY KEY, `host` INTEGER, `type` TEXT, `subtype` TEXT, `message` TEXT, `url` TEXT, `time` INTEGER, `dismissed` INTEGER)");
    await r("CREATE INDEX IF NOT EXISTS `messagesIdx` ON `messages` (dismissed, time)");
    await r("CREATE TABLE IF NOT EXISTS depends (`id` INTEGER, `version` INTEGER, `on` INTEGER)");
    await r("UPDATE `objects` SET `newest`=0 WHERE `id`<10000");
    await r("REPLACE INTO objects (`id`, `version`, `type`, `name`, `content`, `comment`, `time`, `newest`) VALUES "+
            "(1, 1, null, 'User', '{}', 'Users', datetime('now'), 1), "+
            "(2, 1, null, 'Group', '{}', 'Group', datetime('now'), 1), "+
            "(3, 1, null, 'Collection', '{}', 'Collection', datetime('now'), 1), "+
            "(4, 1, null, 'File', '{}', 'File', datetime('now'), 1), "+
            "(5, 1, null, 'Package', '{}', 'Package', datetime('now'), 1), "+
            "(6, 1, null, 'Host', '{}', 'Hosts', datetime('now'), 1)");
}

export function getAllObjects() {
    return new Promise<{id:number, type:string, name:string}[]>(cb => {
        db.all("SELECT `id`, `type`, `name` FROM `objects` WHERE `newest`=1 ORDER BY `id`", 
            (err, rows) => {
                if (rows === undefined)
                    cb([]);
                else
                    cb(rows);
            })});
}

export function getObjectByID(id:number) {
    return new Promise<{version:number, type:string, name:string, content:string}[]>(cb => {
        db.all("SELECT `version`, `type`, `name`, `content` FROM `objects` WHERE `id`=?", [id],
            (err, rows) => {
                if (rows === undefined)
                    cb([]);
                else
                    cb(rows)
            })});
}

export function getHostContentByName(hostname:string) {
    return new Promise<{id: number, content: IHostContent}>(cb => {
        db.get("SELECT `id`, `content` FROM `objects` WHERE `type` = 'host' AND `name`=? AND `newest`=1", [hostname], 
            (err, row) => {
                if (row === undefined)
                    cb(null);
                else
                    cb({id: row['id'], content: JSON.parse(row['content'])})
            })});
}