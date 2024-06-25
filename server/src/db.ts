import * as sqlite from "sqlite3";
import type { IObject2 } from "./shared/state";
import {
    type Host,
    type IContains,
    type IDepends,
    type IVariables,
    hostId,
    rootId,
    rootInstanceId,
    userId,
} from "./shared/type";

import { ErrorType, SAError } from "./error";
type IV = { id: number; version: number };
import {
    collectionId,
    complexCollectionId,
    defaults,
    fileId,
    groupId,
    hostVariableId,
    packageId,
    ufwAllowId,
} from "./default";

import nullCheck from "./shared/nullCheck";
import Mustache = require("mustache");

export class DB {
    db: sqlite.Database | null = null;
    nextObjectId = 10000;

    async init() {
        const db = new sqlite.Database("sysadmin.db");
        this.db = db;

        const i = (stmt: string, args: any[] = []) => {
            return new Promise<void>((cb, cbe) =>
                db.run(stmt, args, (err) => {
                    cb();
                }),
            );
        };
        const r = (stmt: string, args: any[] = []) => {
            return new Promise<void>((cb, cbe) =>
                db.run(stmt, args, (err) => {
                    if (err) cbe(new SAError(ErrorType.Database, err));
                    else cb();
                }),
            );
        };

        const q = (stmt: string, args: any[] = []) => {
            return new Promise<any>((cb, cbe) => {
                db.get(stmt, args, (err, row) => {
                    if (err) {
                        cbe(new SAError(ErrorType.Database, err));
                    } else if (row !== undefined) {
                        cb(row);
                    } else {
                        cb(null);
                    }
                });
            });
        };

        await r("PRAGMA journal_mode=WAL");
        await r(
            "CREATE TABLE IF NOT EXISTS `objects` (`id` INTEGER, `version` INTEGER, `type` INTEGER, `name` TEXT, `content` TEXT, `comment` TEXT, `time` INTEGER, `newest` INTEGER)",
        );
        await i("ALTER TABLE `objects` ADD COLUMN `category` TEXT");
        await i("ALTER TABLE `objects` ADD COLUMN `author` TEXT");
        await r("CREATE UNIQUE INDEX IF NOT EXISTS `id_version` ON `objects` (id, version)");
        await r(
            "CREATE TABLE IF NOT EXISTS `messages` (`id` INTEGER PRIMARY KEY, `host` INTEGER, `type` TEXT, `subtype` TEXT, `message` TEXT, `url` TEXT, `time` INTEGER, `dismissed` INTEGER)",
        );
        //await i("ALTER TABLE `messages` ADD COLUMN `dismissedTime` INTEGER");
        await r("CREATE INDEX IF NOT EXISTS `messagesIdx` ON `messages` (dismissed, time)");
        await r(
            "CREATE INDEX IF NOT EXISTS `messagesIdx2` ON `messages` (dismissed, dismissedTime)",
        );
        await r(
            "CREATE TABLE IF NOT EXISTS `deployments` (`id` INTEGER, `host` INTEGER, `name` TEXT, `content` TEXT, `time` INTEGER, `type` INTEGER, `title` TEXT)",
        );
        await r(
            "CREATE UNIQUE INDEX IF NOT EXISTS `deployments_host_name` ON `deployments` (host, name)",
        );
        await r(
            "CREATE TABLE IF NOT EXISTS `installedPackages` (`id` INTEGER, `host` INTEGR, `name` TEXT)",
        );
        await r("DROP TABLE IF EXISTS `host_monitor`");

        //await r('DROP TABLE `docker_images`');
        await r(
            "CREATE TABLE IF NOT EXISTS `docker_images` (`id` INTEGER PRIMARY KEY, `project` TEXT, `tag` TEXT, `manifest` TEXT, `hash` TEXT, `user` INTEGER, `time` INTEGER)",
        );
        await i("ALTER TABLE `docker_images` ADD COLUMN `pin` INTEGER");
        await i("ALTER TABLE `docker_images` ADD COLUMN `labels` TEXT");
        await i("ALTER TABLE `docker_images` ADD COLUMN `removed` INTEGER");
        await i("ALTER TABLE `docker_images` ADD COLUMN `used` INTEGER");
        await r(
            "CREATE TABLE IF NOT EXISTS `docker_deployments` (`id` INTEGER PRIMARY KEY, `project` TEXT, `container` TEXT, `host` INTEGER, `startTime` INTEGER, `endTime` INTEGER, `config` TEXT, `hash` TEXT, `user` INTEGER)",
        );
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `setup` TEXT");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `postSetup` TEXT");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `timeout` INTEGER DEFAULT 120");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `softTakeover` INTEGER DEFAULT 0");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `startMagic` TEXT");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `stopTimeout` INTEGER DEFAULT 10");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `usePodman` INTEGER DEFAULT 0");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `userService` INTEGER DEFAULT 0");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `userService` INTEGER DEFAULT 0");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `deployUser` TEXT");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `serviceFile` TEXT");
        await i("ALTER TABLE `docker_deployments` ADD COLUMN `description` TEXT");

        await r(
            "CREATE TABLE IF NOT EXISTS `docker_image_tag_pins` (`id` INTEGER PRIMARY KEY, `project` TEXT, `tag` TEXT)",
        );
        await r(
            "CREATE UNIQUE INDEX IF NOT EXISTS `docker_image_tag_pins_u` ON `docker_image_tag_pins` (`project`, `tag`)",
        );

        await r("CREATE TABLE IF NOT EXISTS `kvp` (`key` TEXT PRIMARY KEY, `value` TEXT)");

        await r(
            "CREATE TABLE IF NOT EXISTS `sessions` (`id` INTEGER PRIMARY KEY, `user` TEXT, `host` TEXT, `sid` TEXT NOT NULL, `pwd` INTEGER, `otp` INTEGER)",
        );
        await r("DELETE FROM `sessions` WHERE `user`=?", ["docker_client"]);
        await r("CREATE UNIQUE INDEX IF NOT EXISTS `sessions_sid` ON `sessions` (`sid`)");

        for (const pair of [
            ["host", hostId],
            ["user", userId],
            ["group", groupId],
            ["file", fileId],
            ["collection", collectionId],
            ["ufwallow", ufwAllowId],
            ["package", packageId],
        ]) {
            await r("UPDATE `objects` SET `type`=?  WHERE `type`=?", [pair[1], pair[0]]);
        }

        for (const d of defaults) {
            await r(
                "REPLACE INTO `objects` (`id`, `version`, `type`, `name`, `content`, `time`, `newest`, `category`, `comment`) VALUES (?, 1, ?, ?, ?, datetime('now'), 0, ?, ?)",
                [d.id, d.type, d.name, JSON.stringify(d.content), d.category, d.comment],
            );
            const mv = await q("SELECT max(`version`) AS `version` FROM `objects` WHERE `id` = ?", [
                d.id,
            ]);
            await r("UPDATE `objects` SET `newest`=(`version`=?)  WHERE `id`=?", [
                mv.version,
                d.id,
            ]);
        }
        this.nextObjectId = Math.max(
            (await q("SELECT max(`id`) as `id` FROM `objects`")).id + 1,
            this.nextObjectId,
        );

        console.log("Db inited", { nextObjectId: this.nextObjectId });
    }

    all(sql: string, ...params: any[]) {
        const db = nullCheck(this.db);
        return new Promise<any[]>((cb, cbe) => {
            db.all(sql, params, (err, rows) => {
                if (err) cbe(new SAError(ErrorType.Database, err));
                else cb(rows);
            });
        });
    }

    get(sql: string, ...params: any[]) {
        const db = nullCheck(this.db);
        return new Promise<any>((cb, cbe) => {
            db.get(sql, params, (err, row) => {
                if (err) cbe(new SAError(ErrorType.Database, err));
                else cb(row);
            });
        });
    }

    insert(sql: string, ...params: any[]) {
        const db = nullCheck(this.db);
        return new Promise<number>((cb, cbe) => {
            db.run(sql, params, function (err) {
                if (err) cbe(new SAError(ErrorType.Database, err));
                else cb(this.lastID);
            });
        });
    }

    insertPrepared(stmt: sqlite.Statement, ...params: any[]) {
        return new Promise<number>((cb, cbe) => {
            stmt.run(params, function (err) {
                if (err) cbe(new SAError(ErrorType.Database, err));
                else cb(this.lastID);
            });
        });
    }

    run(sql: string, ...params: any[]) {
        const db = nullCheck(this.db);
        return new Promise<number | undefined>((cb, cbe) => {
            db.run(sql, params, function (err) {
                if (err) cbe(new SAError(ErrorType.Database, err));
                else cb(this.changes);
            });
        });
    }

    runPrepared(stmt: sqlite.Statement, ...params: any[]) {
        return new Promise<void>((cb, cbe) => {
            stmt.run(params, (err) => {
                if (err) cbe(new SAError(ErrorType.Database, err));
                else cb();
            });
        });
    }

    prepare(sql: string) {
        return nullCheck(this.db).prepare(sql);
    }

    getDeployments(host: number) {
        const db = nullCheck(this.db);
        return new Promise<{ name: string; type: number; title: string; content: string }[]>(
            (cb, cbe) => {
                db.all<{ name: string; type: number; title: string; content: string }>(
                    "SELECT `name`, `content`, `type`, `title` FROM `deployments` WHERE `host`=?",
                    [host],
                    (err, rows) => {
                        if (err) cbe(new SAError(ErrorType.Database, err));
                        else if (rows === undefined) cb([]);
                        else cb(rows);
                    },
                );
            },
        );
    }

    setDeployment(host: number, name: string, content: string, type: number, title: string) {
        const db = nullCheck(this.db);
        if (content) {
            return new Promise<void>((cb, cbe) => {
                db.run(
                    "REPLACE INTO `deployments` (`host`, `name`, `content`, `time`, `type`, `title`) VALUES (?, ?, ?, datetime('now'), ?, ?)",
                    [host, name, content, type, title],
                    (err) => {
                        if (err) cbe(new SAError(ErrorType.Database, err));
                        else cb();
                    },
                );
            });
        }
        return new Promise<void>((cb, cbe) => {
            db.all("DELETE FROM `deployments` WHERE `host`=? AND `name`=?", [host, name], (err) => {
                if (err) cbe(new SAError(ErrorType.Database, err));
                else cb();
            });
        });
    }

    resetServer(host: number) {
        const db = nullCheck(this.db);
        return new Promise<void>((cb, cbe) => {
            db.all("DELETE FROM `deployments` WHERE `host`=?", [host], (err) => {
                if (err) cbe(new SAError(ErrorType.Database, err));
                else cb();
            });
        });
    }

    getUserContent(name: string) {
        const db = nullCheck(this.db);
        return new Promise<string | null>((cb, cbe) => {
            db.get<{ content: string }>(
                "SELECT `content` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1",
                [userId, name],
                (err, row) => {
                    if (err) cbe(new SAError(ErrorType.Database, err));
                    else if (row) cb(row.content);
                    else cb(null);
                },
            );
        });
    }

    getAllObjects() {
        const db = nullCheck(this.db);
        return new Promise<{ id: number; type: number; name: string; category: string }[]>(
            (cb, cbe) => {
                db.all<{ id: number; type: number; name: string; category: string }>(
                    "SELECT `id`, `type`, `name`, `category` FROM `objects` WHERE `newest`=1 ORDER BY `id`",
                    (err, rows) => {
                        if (err) cbe(new SAError(ErrorType.Database, err));
                        else if (rows === undefined) cb([]);
                        else cb(rows);
                    },
                );
            },
        );
    }

    getAllObjectsFull() {
        const db = nullCheck(this.db);
        return new Promise<
            {
                id: number;
                type: number;
                name: string;
                content: string;
                category: string;
                version: number;
                comment: string;
                time: number;
                author: string | null;
            }[]
        >((cb, cbe) => {
            db.all<{
                id: number;
                type: number;
                name: string;
                content: string;
                category: string;
                version: number;
                comment: string;
                time: number;
                author: string | null;
            }>(
                "SELECT `id`, `type`, `name`, `content`, `category`, `version`, `comment`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `newest`=1 ORDER BY `id`",
                (err, rows) => {
                    if (err) cbe(new SAError(ErrorType.Database, err));
                    else if (rows === undefined) cb([]);
                    else cb(rows);
                },
            );
        });
    }

    getObjectByID(id: number) {
        const db = nullCheck(this.db);
        return new Promise<
            {
                version: number;
                type: number;
                name: string;
                content: string;
                category: string;
                comment: string;
                time: number;
                author: string | null;
            }[]
        >((cb, cbe) => {
            db.all<{
                version: number;
                type: number;
                name: string;
                content: string;
                category: string;
                comment: string;
                time: number;
                author: string | null;
            }>(
                "SELECT `version`, `type`, `name`, `content`, `category`, `comment`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
                [id],
                (err, rows) => {
                    if (err) cbe(new SAError(ErrorType.Database, err));
                    else if (rows === undefined) cb([]);
                    else cb(rows);
                },
            );
        });
    }

    getNewestObjectByID(id: number) {
        const db = nullCheck(this.db);
        return new Promise<{
            version: number;
            type: number;
            name: string;
            content: string;
            category: string;
            comment: string;
            time: number;
            author: string | null;
        }>((cb, cbe) => {
            db.get<{
                version: number;
                type: number;
                name: string;
                content: string;
                category: string;
                comment: string;
                time: number;
                author: string | null;
            }>(
                "SELECT `version`, `type`, `name`, `content`, `category`, `comment`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=? AND `newest`=1",
                [id],
                (err, row) => {
                    if (err) cbe(new SAError(ErrorType.Database, err));
                    else cb(row);
                },
            );
        });
    }

    changeObject(id: number, object: IObject2<any> | null, author: string) {
        const db = nullCheck(this.db);
        const ins =
            ({ id, version }: IV) =>
            (cb: (res: IV) => void, cbe: (error: SAError) => void) => {
                db.run(
                    "INSERT INTO `objects` (`id`, `version`, `type`, `name`, `content`, `time`, `newest`, `category`, `comment`, `author`) VALUES (?, ?, ?, ?, ?, datetime('now'), 1, ?, ?, ?)",
                    [
                        id,
                        version,
                        object ? object.type : null,
                        object ? object.name : null,
                        object ? JSON.stringify(object.content) : null,
                        object ? object.category : null,
                        object ? object.comment : null,
                        author,
                    ],
                    (err) => {
                        if (err) cbe(new SAError(ErrorType.Database, err));
                        else cb({ id, version });
                    },
                );
            };
        if (id < 0) {
            return new Promise<IV>(ins({ id: this.nextObjectId++, version: 1 }));
        }
        return new Promise<IV>((cb, cbe) => {
            db.get<{ version: number }>(
                "SELECT max(`version`) as `version` FROM `objects` WHERE `id` = ?",
                [id],
                (err, row) => {
                    if (err) cbe(new SAError(ErrorType.Database, err));
                    else if (!row) cbe(new SAError(ErrorType.Database, "Unable to find row"));
                    else {
                        const version = row.version + 1;
                        db.run("UPDATE `objects` SET `newest`=0 WHERE `id` = ?", [id], (err) => {
                            if (err) cbe(new SAError(ErrorType.Database, err));
                            else if (object) ins({ id, version })(cb, cbe);
                            else cb({ id, version });
                        });
                    }
                },
            );
        });
    }

    getHostContentByName(hostname: string) {
        const db = nullCheck(this.db);
        return new Promise<{
            id: number;
            content: Host;
            version: number;
            type: number;
            name: string;
            category: string;
            comment: string;
            time: number;
            author: string | null;
        } | null>((cb, cbe) => {
            db.get<{
                id: number;
                content: string;
                version: number;
                category: string;
                comment: string;
                time: string;
                author: string | null;
            }>(
                "SELECT `id`, `content`, `version`, `name`, `category`, `comment`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `type` = ? AND `name`=? AND `newest`=1",
                [hostId, hostname],
                (err, row) => {
                    if (err) cbe(new SAError(ErrorType.Database, err));
                    else if (row === undefined) cb(null);
                    else
                        cb({
                            id: row.id,
                            content: JSON.parse(row.content),
                            version: row.version,
                            type: hostId,
                            name: hostname,
                            category: row.category,
                            comment: row.comment,
                            time: +row.time,
                            author: row.author,
                        });
                },
            );
        });
    }

    async getRootVariables() {
        const rootRow = await this.get(
            "SELECT `content` FROM `objects` WHERE `id`=? AND `newest`=1 AND `type`=?",
            rootInstanceId,
            rootId,
        );
        const variables: { [key: string]: string } = {};
        const rootVars = JSON.parse(rootRow.content) as IVariables;
        if (rootVars.variables) for (const v of rootVars.variables) variables[v.key] = v.value;
        if (rootVars.secrets) for (const v of rootVars.secrets) variables[v.key] = v.value;
        return variables;
    }

    async getHostVariables(id: number): Promise<null | [Host, { [key: string]: string }]> {
        const hostRow = await this.get(
            "SELECT `name`, `content` FROM `objects` WHERE `id`=? AND `newest`=1 AND `type`=?",
            id,
            hostId,
        );
        const rootRow = await this.get(
            "SELECT `content` FROM `objects` WHERE `id`=? AND `newest`=1 AND `type`=?",
            rootInstanceId,
            rootId,
        );
        if (!hostRow || !rootRow) return null;
        const hostInfo = JSON.parse(hostRow.content) as Host;
        const variables: { [key: string]: string } = {};

        const rootVars = JSON.parse(rootRow.content) as IVariables;
        if (rootVars.variables) for (const v of rootVars.variables) variables[v.key] = v.value;
        if (rootVars.secrets) for (const v of rootVars.secrets) variables[v.key] = v.value;
        variables.nodename = hostRow.name;

        const visited = new Set();

        const visitObject = async (id: number) => {
            if (visited.has(id)) return;
            visited.add(id);

            const objectRow = await this.get(
                "SELECT `type`, `content` FROM `objects` WHERE `id`=? AND `newest`=1",
                id,
            );
            if (!objectRow) return;
            switch (objectRow.type) {
                case collectionId:
                case complexCollectionId: {
                    const o = JSON.parse(objectRow.content) as IContains & IDepends;
                    if (o.contains) for (const id of o.contains) await visitObject(id);
                    if (o.depends) for (const id of o.depends) await visitObject(id);
                    break;
                }
                case hostVariableId: {
                    const vs = JSON.parse(objectRow.content) as IVariables;
                    if (vs.variables)
                        for (const v of vs.variables)
                            variables[v.key] = Mustache.render(v.value, variables);
                    if (vs.secrets)
                        for (const v of vs.secrets)
                            variables[v.key] = Mustache.render(v.value, variables);
                    break;
                }
            }
        };

        for (const id of hostInfo.contains) await visitObject(id);

        if (hostInfo.variables) for (const v of hostInfo.variables) variables[v.key] = v.value;
        if (hostInfo.secrets) for (const v of hostInfo.secrets) variables[v.key] = v.value;

        return [hostInfo, variables];
    }
}
