import * as sqlite from 'sqlite3'
import { IHostContent, IObject } from '../../shared/state'
import { ErrorType, SAError} from './error'
type IV = { id: number, version: number };

export class DB {
    db: sqlite.Database = null
    nextObjectId = 10000;

    async init() {
        this.db = new sqlite.Database("sysadmin.db");
        let db = this.db;

        const r = (stmt: string) => {
            return new Promise<void>((cb, cbe) =>
                db.run(stmt, [], (err) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else
                        cb();
                }));
        };

        const q = () => {
            return new Promise<void>((cb, cbe) => {
                db.get("SELECT max(`id`) as `id` FROM `objects`",
                    (err, row) => {
                        if (err) {
                            cbe(new SAError(ErrorType.Database, err));
                        } else if (row !== undefined) {
                            this.nextObjectId = Math.max(row['id'] + 1, this.nextObjectId);
                            cb();
                        }
                    })
            })
        };

        await r("CREATE TABLE IF NOT EXISTS `objects` (`id` INTEGER, `version` INTEGER, `type` INTEGER, `name` TEXT, `content` TEXT, `comment` TEXT, `time` INTEGER, `newest` INTEGER)");
        await r("CREATE UNIQUE INDEX IF NOT EXISTS `id_version` ON `objects` (id, version)");
        await r("CREATE TABLE IF NOT EXISTS `messages` (`id` INTEGER PRIMARY KEY, `host` INTEGER, `type` TEXT, `subtype` TEXT, `message` TEXT, `url` TEXT, `time` INTEGER, `dismissed` INTEGER)");
        await r("CREATE INDEX IF NOT EXISTS `messagesIdx` ON `messages` (dismissed, time)");
        await r("CREATE TABLE IF NOT EXISTS `deployments` (`id` INTEGER, `host` INTEGER, `name` TEXT, `content` TEXT, `time` INTEGER, `object` INTEGER, `type` TEXT, `title` TEXT)");
        await r("CREATE UNIQUE INDEX IF NOT EXISTS `deployments_host_name` ON `deployments` (host, name)");
        await r("CREATE TABLE IF NOT EXISTS `installedPackages` (`id` INTEGER, `host` INTEGR, `name` TEXT)");
        await r("UPDATE `objects` SET `newest`=0 WHERE `id`<10000");
        await r("REPLACE INTO objects (`id`, `version`, `type`, `name`, `content`, `comment`, `time`, `newest`) VALUES " +
            "(1, 1, null, 'User', '{}', 'Users', datetime('now'), 1), " +
            "(2, 1, null, 'Group', '{}', 'Group', datetime('now'), 1), " +
            "(3, 1, null, 'Collection', '{}', 'Collection', datetime('now'), 1), " +
            "(4, 1, null, 'File', '{}', 'File', datetime('now'), 1), " +
            "(5, 1, null, 'Package', '{}', 'Package', datetime('now'), 1), " +
            "(6, 1, null, 'Host', '{}', 'Hosts', datetime('now'), 1)");
        await q();
    }

    getDeployments() {
        let db = this.db;
        return new Promise<{ host: number, name: string, content: string, type: string, title: string }[]>((cb, cbe) => {
            db.all("SELECT `host`, `name`, `content`, `type`, `title` FROM `deployments`", [],
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

    setDeployment(host: number, name: string, content: string, object: number, type: string, title: string) {
        let db = this.db;
        if (content) {
            return new Promise<{}[]>((cb, cbe) => {
                db.run("REPLACE INTO `deployments` (`host`, `name`, `content`, `time`, `object`, `type`, `title`) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)", [host, name, content, object, type, title],
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
            db.get("SELECT `content` FROM `objects` WHERE `type`='user' AND `name`=? AND `newest`=1", [name],
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
        return new Promise<{ id: number, type: string, name: string }[]>((cb, cbe) => {
            db.all("SELECT `id`, `type`, `name` FROM `objects` WHERE `newest`=1 ORDER BY `id`",
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
        return new Promise<{ id: number, type: string, name: string, content: string }[]>((cb, cbe) => {
            db.all("SELECT `id`, `type`, `name`, `content` FROM `objects` WHERE `newest`=1 ORDER BY `id`",
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
        return new Promise<{ version: number, type: string, name: string, content: string }[]>((cb, cbe) => {
            db.all("SELECT `version`, `type`, `name`, `content` FROM `objects` WHERE `id`=?", [id],
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

    changeObject(id: number, object: IObject) {
        let db = this.db;
        let ins = ({ id, version }: IV) => (cb: (res: IV) => void, cbe: (error:SAError) => void) => {
            db.run("INSERT INTO `objects` (`id`, `version`, `type`, `name`, `content`, `comment`, `time`, `newest`) VALUES (?, ?, ?, ?, ?, '', datetime('now'), 1)", [id, version, object.class, object.name, JSON.stringify(object.content)], (err) => {
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
                                cb({id, version});
                        });
                    }
                });
        });
    }

    getHostContentByName(hostname: string) {
        let db = this.db;
        return new Promise<{ id: number, content: IHostContent }>((cb, cbe) => {
            db.get("SELECT `id`, `content` FROM `objects` WHERE `type` = 'host' AND `name`=? AND `newest`=1", [hostname],
                (err, row) => {
                    if (err)
                        cbe(new SAError(ErrorType.Database, err));
                    else if (row === undefined)
                        cb(null);
                    else
                        cb({ id: row['id'], content: JSON.parse(row['content']) })
                })
        });
    }
}
