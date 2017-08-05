import * as sqlite from 'sqlite3'
import { IObject2 } from '../../shared/state'
import { Host, hostId } from '../../shared/type'

import { ErrorType, SAError } from './error'
type IV = { id: number, version: number };
import { defaults, userId, groupId, fileId, collectionId, ufwAllowId, packageId } from './default';



export class DB {
    db: sqlite.Database = null
    nextObjectId = 10000;

    async init() {
        this.db = new sqlite.Database("sysadmin.db");
        let db = this.db;

        const i = (stmt: string, args: any[] = []) => {
            return new Promise<void>((cb, cbe) =>
                db.run(stmt, args, (err) => {
                    cb();
                }));
        };
        const r = (stmt: string, args: any[] = []) => {
            return new Promise<void>((cb, cbe) =>
                db.run(stmt, args, (err) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else
                        cb();
                }));
        };

        const q = (stmt: string, args: any[] = []) => {
            return new Promise<any>((cb, cbe) => {
                db.get(stmt, args,
                    (err, row) => {
                        if (err) {
                            cbe(new SAError(ErrorType.Database, err));
                        } else if (row !== undefined) {
                            cb(row);
                        } else {
                            cb(null);
                        }
                    })
            })
        };

        await r("CREATE TABLE IF NOT EXISTS `objects` (`id` INTEGER, `version` INTEGER, `type` INTEGER, `name` TEXT, `content` TEXT, `comment` TEXT, `time` INTEGER, `newest` INTEGER)");
        await i("ALTER TABLE `objects` ADD COLUMN `catagory` TEXT");
        await r("CREATE UNIQUE INDEX IF NOT EXISTS `id_version` ON `objects` (id, version)");
        await r("CREATE TABLE IF NOT EXISTS `messages` (`id` INTEGER PRIMARY KEY, `host` INTEGER, `type` TEXT, `subtype` TEXT, `message` TEXT, `url` TEXT, `time` INTEGER, `dismissed` INTEGER)");
        await i("ALTER TABLE `messages` ADD COLUMN `dismissedTime` INTEGER");
        await r("CREATE INDEX IF NOT EXISTS `messagesIdx` ON `messages` (dismissed, time)");
        await r("CREATE INDEX IF NOT EXISTS `messagesIdx2` ON `messages` (dismissed, dismissedTime)");
        await r("CREATE TABLE IF NOT EXISTS `deployments` (`id` INTEGER, `host` INTEGER, `name` TEXT, `content` TEXT, `time` INTEGER, `type` INTEGER, `title` TEXT)");
        await r("CREATE UNIQUE INDEX IF NOT EXISTS `deployments_host_name` ON `deployments` (host, name)");
        await r("CREATE TABLE IF NOT EXISTS `installedPackages` (`id` INTEGER, `host` INTEGR, `name` TEXT)");

        for (let pair of [['host', hostId], ['user', userId], ['group', groupId], ['file', fileId], ['collection', collectionId], ['ufwallow', ufwAllowId], ['package', packageId]]) {
            await r("UPDATE `objects` SET `type`=?  WHERE `type`=?", [pair[1], pair[0]]);
        }

        for (let d of defaults) {
            await r("REPLACE INTO `objects` (`id`, `version`, `type`, `name`, `content`, `time`, `newest`, `catagory`, `comment`) VALUES (?, 1, ?, ?, ?, datetime('now'), 0, ?, ?)", [
                d.id, d.type, d.name, JSON.stringify(d.content), d.catagory, d.comment
            ]);
            let mv = await q("SELECT max(`version`) AS `version` FROM `objects` WHERE `id` = ?", [d.id]);
            await r("UPDATE `objects` SET `newest`=(`version`=?)  WHERE `id`=?", [mv['version'], d.id]);
        }
        this.nextObjectId = Math.max((await q("SELECT max(`id`) as `id` FROM `objects`"))['id'], this.nextObjectId);
    }

    getDeployments(host: number) {
        let db = this.db;
        return new Promise<{ name: string, type: number, title: string, content: string }[]>((cb, cbe) => {
            db.all("SELECT `name`, `content`, `type`, `title` FROM `deployments` WHERE `host`=?", [host],
                (err, rows) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else if (rows === undefined)
                        cb([]);
                    else
                        cb(rows);
                })
        });
    }

    setDeployment(host: number, name: string, content: string, type: number, title: string) {
        let db = this.db;
        if (content) {
            return new Promise<{}[]>((cb, cbe) => {
                db.run("REPLACE INTO `deployments` (`host`, `name`, `content`, `time`, `type`, `title`) VALUES (?, ?, ?, datetime('now'), ?, ?)", [host, name, content, type, title],
                    (err) => {
                        if (err)
                            cbe(new SAError(ErrorType.Database, err));
                        else
                            cb();
                    })
            });
        } else {
            return new Promise<{}[]>((cb, cbe) => {
                db.all("DELETE FROM `deployments` WHERE `host`=? AND `name`=?", [host, name],
                    (err) => {
                        if (err)
                            cbe(new SAError(ErrorType.Database, err));
                        else
                            cb();
                    })
            });
        }
    }

    getUserContent(name: string) {
        let db = this.db;
        return new Promise<string>((cb, cbe) => {
            db.get("SELECT `content` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1", [userId, name],
                (err, row) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else if (row)
                        cb(row.content)
                    else
                        cb(null);
                })
        });
    }

    getPackages(host: number) {
        let db = this.db;
        return new Promise<string[]>((cb, cbe) => {
            db.all("SELECT `name` FROM `installedPackages` WHERE `host` = ?", [host],
                (err, rows) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else {
                        let ans = [];
                        if (rows !== undefined)
                            for (const row of rows)
                                ans.push(row['name'])
                        cb(ans);
                    }
                })
        });
    }

    removePackages(host: number, packages: string[]) {
        let db = this.db;
        return new Promise<{}>((cb, ecb) => {
            db.run("DELETE FROM `installedPackages` WHERE `host` = ? AND `name` IN (" + packages.map(_ => "?").join(",") + ")",
                ([host] as any[]).concat(packages),
                (err) => {
                    if (err) ecb(new SAError(ErrorType.Database, err));
                    else cb()
                })
        });
    }

    addPackages(host: number, packages: string[]) {
        let db = this.db;
        return new Promise<{}>((cb, cbe) => {
            let args: any[] = [];
            for (let pkg of packages) {
                args.push(host);
                args.push(pkg);
            }
            db.run("REPLACE INTO `installedPackages` (`host`, `name`) VALUES " + packages.map(_ => "(?, ?)").join(", "), args,
                (err) => {
                    if (err) cbe(new SAError(ErrorType.Database, err));
                    else cb()
                })
        });
    }

    getAllObjects() {
        let db = this.db;
        return new Promise<{ id: number, type: number, name: string, catagory: string }[]>((cb, cbe) => {
            db.all("SELECT `id`, `type`, `name`, `catagory` FROM `objects` WHERE `newest`=1 ORDER BY `id`",
                (err, rows) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else if (rows === undefined)
                        cb([]);
                    else
                        cb(rows);
                })
        });
    }

    getAllObjectsFull() {
        let db = this.db;
        return new Promise<{ id: number, type: number, name: string, content: string, catagory: string, version: number, comment: string }[]>((cb, cbe) => {
            db.all("SELECT `id`, `type`, `name`, `content`, `catagory`, `version`, `comment` FROM `objects` WHERE `newest`=1 ORDER BY `id`",
                (err, rows) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else if (rows === undefined)
                        cb([]);
                    else
                        cb(rows);
                })
        });
    }

    getObjectByID(id: number) {
        let db = this.db;
        return new Promise<{ version: number, type: number, name: string, content: string, catagory: string, comment: string }[]>((cb, cbe) => {
            db.all("SELECT `version`, `type`, `name`, `content`, `catagory`, `comment` FROM `objects` WHERE `id`=?", [id],
                (err, rows) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else if (rows === undefined)
                        cb([]);
                    else
                        cb(rows)
                })
        });
    }

    getNewestObjectByID(id: number) {
        let db = this.db;
        return new Promise<{ version: number, type: number, name: string, content: string, catagory: string }>((cb, cbe) => {
            db.get("SELECT `version`, `type`, `name`, `content`, `catagory`, `comment` FROM `objects` WHERE `id`=? AND `newest`=1", [id],
                (err, row) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else
                        cb(row)
                })
        });
    }

    changeObject(id: number, object: IObject2<any>) {
        let db = this.db;
        let ins = ({ id, version }: IV) => (cb: (res: IV) => void, cbe: (error: SAError) => void) => {
            db.run("INSERT INTO `objects` (`id`, `version`, `type`, `name`, `content`, `time`, `newest`, `catagory`, `comment`) VALUES (?, ?, ?, ?, ?, datetime('now'), 1, ?, ?)", [id, version, object.type, object.name, JSON.stringify(object.content), object.catagory, object.comment], (err) => {
                if (err)
                    cbe(new SAError(ErrorType.Database, err));
                else
                    cb({ id, version });
            })
        };
        if (id < 0) {
            return new Promise<IV>(ins({ id: this.nextObjectId++, version: 1 }));
        }
        return new Promise<IV>((cb, cbe) => {
            db.get("SELECT max(`version`) as `version` FROM `objects` WHERE `id` = ?", [id],
                (err, row) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else if (row == undefined)
                        cbe(new SAError(ErrorType.Database, "Unable to find row"));
                    else {
                        let version = row['version'] + 1;
                        db.run("UPDATE `objects` SET `newest`=0 WHERE `id` = ?", [id], (err) => {

                            if (err)
                                cbe(new SAError(ErrorType.Database, err));
                            else if (object)
                                ins({ id, version })(cb, cbe);
                            else
                                cb({ id, version });
                        });
                    }
                });
        });
    }

    getHostContentByName(hostname: string) {
        let db = this.db;
        return new Promise<{ id: number, content: Host, version: number, type:number, name: string, catagory:string, comment: string }>((cb, cbe) => {
            db.get("SELECT `id`, `content`, `version`, `name`, `catagory`, `comment` FROM `objects` WHERE `type` = ? AND `name`=? AND `newest`=1", [hostId, hostname],
                (err, row) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else if (row === undefined)
                        cb(null);
                    else
                        cb({ id: row['id'], content: JSON.parse(row['content']), version: row['version'], type: hostId, name: hostname, catagory: row['catagory'], comment: row['comment'] })
                })
        });
    }
}
