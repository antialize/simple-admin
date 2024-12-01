use std::sync::{atomic::AtomicI64, Arc, Mutex};

use anyhow::{Context, Result};
use log::info;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{default::{COLLECTION_ID, FILE_ID, GROUP_ID, PACKAGE_ID, UFW_ALLOW_ID}, r#type::{HOST_ID, USER_ID}};

// import * as sqlite from "sqlite3";
// import type { IObject2 } from "./shared/state";
// import {
//     type Host,
//     type IContains,
//     type IDepends,
//     type IVariables,
//     hostId,
//     rootId,
//     rootInstanceId,
//     userId,
// } from "./shared/type";

// import { ErrorType, SAError } from "./error";
// type IV = { id: number; version: number };
// import {
//     collectionId,
//     complexCollectionId,
//     defaults,
//     fileId,
//     groupId,
//     hostVariableId,
//     packageId,
//     ufwAllowId,
// } from "./default";

// import nullCheck from "./shared/nullCheck";
// import Mustache = require("mustache");

// export class DB {

//     nextObjectId = 10000;

//         const i = (stmt: string, args: any[] = []) => {
//             return new Promise<void>((cb, cbe) =>
//                 db.run(stmt, args, (err) => {
//                     cb();
//                 }),
//             );
//         };
//         const r = (stmt: string, args: any[] = []) => {
//             return new Promise<void>((cb, cbe) =>
//                 db.run(stmt, args, (err) => {
//                     if (err) cbe(new SAError(ErrorType.Database, err));
//                     else cb();
//                 }),
//             );
//         };

//         const q = (stmt: string, args: any[] = []) => {
//             return new Promise<any>((cb, cbe) => {
//                 db.get(stmt, args, (err, row) => {
//                     if (err) {
//                         cbe(new SAError(ErrorType.Database, err));
//                     } else if (row !== undefined) {
//                         cb(row);
//                     } else {
//                         cb(null);
//                     }
//                 });
//             });

//         };

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserContent {
    #[serde(default)]
    pub sessions: Option<String>,
    #[serde(default)]
    pub admin: bool,
    #[serde(default)]
    pub docker_pull: bool,
    #[serde(default)]
    pub docker_push: bool,
    #[serde(default)]
    pub docker_deploy: bool,
    #[serde(default)]
    pub sslname: Option<String>,
    #[serde(default)]
    pub auth_days: Option<u32>,
    pub password: String,
    #[serde(rename = "otp_base32")]
    pub otp_base32: String,
}

const DEFAULT_NEXT_OBJECT_ID: i64 = 10000;

pub struct Db {
    conn: Mutex<Connection>,
    next_object_id: AtomicI64,
}

pub fn init() -> Result<Arc<Db>> {
    let db = Connection::open("sysadmin.db").context("Failed to open sysadmin.db")?;
    db.query_row("PRAGMA journal_mode=WAL", (), |_| Ok(()))?;
    db.execute(
            "CREATE TABLE IF NOT EXISTS `objects` (`id` INTEGER, `version` INTEGER, `type` INTEGER, `name` TEXT, `content` TEXT, `comment` TEXT, `time` INTEGER, `newest` INTEGER)", ()
        )?;
    let _ = db.execute("ALTER TABLE `objects` ADD COLUMN `category` TEXT", ());
    let _ = db.execute("ALTER TABLE `objects` ADD COLUMN `author` TEXT", ());
    db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS `id_version` ON `objects` (id, version)",
        (),
    )?;
    db.execute(
             "CREATE TABLE IF NOT EXISTS `messages` (`id` INTEGER PRIMARY KEY, `host` INTEGER, `type` TEXT, `subtype` TEXT, `message` TEXT, `url` TEXT, `time` INTEGER, `dismissed` INTEGER)",
        ())?;
    db.execute(
        "CREATE INDEX IF NOT EXISTS `messagesIdx` ON `messages` (dismissed, time)",
        (),
    )?;
    db.execute(
        "CREATE INDEX IF NOT EXISTS `messagesIdx2` ON `messages` (dismissed, dismissedTime)",
        (),
    )?;
    db.execute(
            "CREATE TABLE IF NOT EXISTS `deployments` (`id` INTEGER, `host` INTEGER, `name` TEXT, `content` TEXT, `time` INTEGER, `type` INTEGER, `title` TEXT)",
         ())?;
    db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS `deployments_host_name` ON `deployments` (host, name)",
        (),
    )?;
    db.execute(
        "CREATE TABLE IF NOT EXISTS `installedPackages` (`id` INTEGER, `host` INTEGR, `name` TEXT)",
        (),
    )?;
    db.execute(
            "CREATE TABLE IF NOT EXISTS `docker_images` (`id` INTEGER PRIMARY KEY, `project` TEXT, `tag` TEXT, `manifest` TEXT, `hash` TEXT, `user` INTEGER, `time` INTEGER)",
         ())?;
    let _ = db.execute("ALTER TABLE `docker_images` ADD COLUMN `pin` INTEGER", ());
    let _ = db.execute("ALTER TABLE `docker_images` ADD COLUMN `labels` TEXT", ());
    let _ = db.execute(
        "ALTER TABLE `docker_images` ADD COLUMN `removed` INTEGER",
        (),
    );
    let _ = db.execute("ALTER TABLE `docker_images` ADD COLUMN `used` INTEGER", ());
    db.execute(
            "CREATE TABLE IF NOT EXISTS `docker_deployments` (`id` INTEGER PRIMARY KEY, `project` TEXT, `container` TEXT, `host` INTEGER, `startTime` INTEGER, `endTime` INTEGER, `config` TEXT, `hash` TEXT, `user` INTEGER)", ()
        )?;
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `setup` TEXT",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `postSetup` TEXT",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `timeout` INTEGER DEFAULT 120",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `softTakeover` INTEGER DEFAULT 0",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `startMagic` TEXT",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `stopTimeout` INTEGER DEFAULT 10",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `usePodman` INTEGER DEFAULT 0",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `userService` INTEGER DEFAULT 0",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `userService` INTEGER DEFAULT 0",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `deployUser` TEXT",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `serviceFile` TEXT",
        (),
    );
    let _ = db.execute(
        "ALTER TABLE `docker_deployments` ADD COLUMN `description` TEXT",
        (),
    );

    db.execute(
             "CREATE TABLE IF NOT EXISTS `docker_image_tag_pins` (`id` INTEGER PRIMARY KEY, `project` TEXT, `tag` TEXT)",
          ())?;
    db.execute(
             "CREATE UNIQUE INDEX IF NOT EXISTS `docker_image_tag_pins_u` ON `docker_image_tag_pins` (`project`, `tag`)",
          ())?;

    db.execute(
        "CREATE TABLE IF NOT EXISTS `kvp` (`key` TEXT PRIMARY KEY, `value` TEXT)",
        (),
    )?;

    db.execute(
             "CREATE TABLE IF NOT EXISTS `sessions` (`id` INTEGER PRIMARY KEY, `user` TEXT, `host` TEXT, `sid` TEXT NOT NULL, `pwd` INTEGER, `otp` INTEGER)",
          ())?;
    db.execute("DELETE FROM `sessions` WHERE `user`=?", ("docker_client",))?;
    db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS `sessions_sid` ON `sessions` (`sid`)",
        (),
    )?;

    for (type_name,type_id) in &[
        ("host", HOST_ID),
        ("user", USER_ID),
        ("group", GROUP_ID),
        ("file", FILE_ID),
        ("collection", COLLECTION_ID),
        ("ufwallow", UFW_ALLOW_ID),
        ("package", PACKAGE_ID),
    ] {
        db.execute("UPDATE `objects` SET `type`=?  WHERE `type`=?", (type_id, type_name))?;
    }

    // for (const d of defaults) {
    //     await r(
    //         "REPLACE INTO `objects` (`id`, `version`, `type`, `name`, `content`, `time`, `newest`, `category`, `comment`) VALUES (?, 1, ?, ?, ?, datetime('now'), 0, ?, ?)",
    //         [d.id, d.type, d.name, JSON.stringify(d.content), d.category, d.comment],
    //     );
    //     const mv = await q("SELECT max(`version`) AS `version` FROM `objects` WHERE `id` = ?", [
    //         d.id,
    //     ]);
    //     await r("UPDATE `objects` SET `newest`=(`version`=?)  WHERE `id`=?", [
    //         mv.version,
    //         d.id,
    //     ]);
    // }
    let next_object_id = i64::max(
        db.query_row("SELECT max(`id`) as `id` FROM `objects`", (), |r| r.get(0))?,
        DEFAULT_NEXT_OBJECT_ID,
    );

    info!("Db inited, nextObjectId={}", next_object_id);

    Ok(Arc::new(Db { conn: Mutex::new(db), next_object_id: AtomicI64::new(next_object_id) }))
}

//     all(sql: string, ...params: any[]) {
//         const db = nullCheck(this.db);
//         return new Promise<any[]>((cb, cbe) => {
//             db.all(sql, params, (err, rows) => {
//                 if (err) cbe(new SAError(ErrorType.Database, err));
//                 else cb(rows);
//             });
//         });
//     }

impl Db {
    #[inline]
    pub fn get<T, F:  FnOnce(&rusqlite::Row<'_>) -> rusqlite::Result<T>>(&self, sql: &str, params: impl rusqlite::Params, f: F) -> Result<Option<T>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.query_row(sql, params, f).optional()?)
    }


//     get(sql: string, ...params: any[]) {
//         const db = nullCheck(this.db);
//         return new Promise<any>((cb, cbe) => {
//             db.get(sql, params, (err, row) => {
//                 if (err) cbe(new SAError(ErrorType.Database, err));
//                 else cb(row);
//             });
//         });
//     }

//     insert(sql: string, ...params: any[]) {
//         const db = nullCheck(this.db);
//         return new Promise<number>((cb, cbe) => {
//             db.run(sql, params, function (err) {
//                 if (err) cbe(new SAError(ErrorType.Database, err));
//                 else cb(this.lastID);
//             });
//         });
//     }

//     insertPrepared(stmt: sqlite.Statement, ...params: any[]) {
//         return new Promise<number>((cb, cbe) => {
//             stmt.run(params, function (err) {
//                 if (err) cbe(new SAError(ErrorType.Database, err));
//                 else cb(this.lastID);
//             });
//         });
//     }

    #[inline]
    pub fn run(&self, sql: &str, params: impl rusqlite::Params) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute(sql, params)?)
    }


//     runPrepared(stmt: sqlite.Statement, ...params: any[]) {
//         return new Promise<void>((cb, cbe) => {
//             stmt.run(params, (err) => {
//                 if (err) cbe(new SAError(ErrorType.Database, err));
//                 else cb();
//             });
//         });
//     }

//     prepare(sql: string) {
//         return nullCheck(this.db).prepare(sql);
//     }

//     getDeployments(host: number) {
//         const db = nullCheck(this.db);
//         return new Promise<{ name: string; type: number; title: string; content: string }[]>(
//             (cb, cbe) => {
//                 db.all<{ name: string; type: number; title: string; content: string }>(
//                     "SELECT `name`, `content`, `type`, `title` FROM `deployments` WHERE `host`=?",
//                     [host],
//                     (err, rows) => {
//                         if (err) cbe(new SAError(ErrorType.Database, err));
//                         else if (rows === undefined) cb([]);
//                         else cb(rows);
//                     },
//                 );
//             },
//         );
//     }

//     setDeployment(host: number, name: string, content: string, type: number, title: string) {
//         const db = nullCheck(this.db);
//         if (content) {
//             return new Promise<void>((cb, cbe) => {
//                 db.run(
//                     "REPLACE INTO `deployments` (`host`, `name`, `content`, `time`, `type`, `title`) VALUES (?, ?, ?, datetime('now'), ?, ?)",
//                     [host, name, content, type, title],
//                     (err) => {
//                         if (err) cbe(new SAError(ErrorType.Database, err));
//                         else cb();
//                     },
//                 );
//             });
//         }
//         return new Promise<void>((cb, cbe) => {
//             db.all("DELETE FROM `deployments` WHERE `host`=? AND `name`=?", [host, name], (err) => {
//                 if (err) cbe(new SAError(ErrorType.Database, err));
//                 else cb();
//             });
//         });
//     }

//     resetServer(host: number) {
//         const db = nullCheck(this.db);
//         return new Promise<void>((cb, cbe) => {
//             db.all("DELETE FROM `deployments` WHERE `host`=?", [host], (err) => {
//                 if (err) cbe(new SAError(ErrorType.Database, err));
//                 else cb();
//             });
//         });
//     }
    pub fn get_user_content(&self, name: &str) -> Result<Option<UserContent>> {
        let conn = self.conn.lock().unwrap();
        let s  : Option<String> = conn.query_row("SELECT `content` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1", (USER_ID, name), |r| Ok(r.get("content")?)).optional()?;
        info!("HI KAT {:?}", s);
        match s {
            Some(v) => Ok(Some(serde_json::from_str(&v)?)),
            None => Ok(None)
        }
    }

//     getAllObjects() {
//         const db = nullCheck(this.db);
//         return new Promise<{ id: number; type: number; name: string; category: string }[]>(
//             (cb, cbe) => {
//                 db.all<{ id: number; type: number; name: string; category: string }>(
//                     "SELECT `id`, `type`, `name`, `category` FROM `objects` WHERE `newest`=1 ORDER BY `id`",
//                     (err, rows) => {
//                         if (err) cbe(new SAError(ErrorType.Database, err));
//                         else if (rows === undefined) cb([]);
//                         else cb(rows);
//                     },
//                 );
//             },
//         );
//     }

//     getAllObjectsFull() {
//         const db = nullCheck(this.db);
//         return new Promise<
//             {
//                 id: number;
//                 type: number;
//                 name: string;
//                 content: string;
//                 category: string;
//                 version: number;
//                 comment: string;
//                 time: number;
//                 author: string | null;
//             }[]
//         >((cb, cbe) => {
//             db.all<{
//                 id: number;
//                 type: number;
//                 name: string;
//                 content: string;
//                 category: string;
//                 version: number;
//                 comment: string;
//                 time: number;
//                 author: string | null;
//             }>(
//                 "SELECT `id`, `type`, `name`, `content`, `category`, `version`, `comment`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `newest`=1 ORDER BY `id`",
//                 (err, rows) => {
//                     if (err) cbe(new SAError(ErrorType.Database, err));
//                     else if (rows === undefined) cb([]);
//                     else cb(rows);
//                 },
//             );
//         });
//     }

//     getObjectByID(id: number) {
//         const db = nullCheck(this.db);
//         return new Promise<
//             {
//                 version: number;
//                 type: number;
//                 name: string;
//                 content: string;
//                 category: string;
//                 comment: string;
//                 time: number;
//                 author: string | null;
//             }[]
//         >((cb, cbe) => {
//             db.all<{
//                 version: number;
//                 type: number;
//                 name: string;
//                 content: string;
//                 category: string;
//                 comment: string;
//                 time: number;
//                 author: string | null;
//             }>(
//                 "SELECT `version`, `type`, `name`, `content`, `category`, `comment`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
//                 [id],
//                 (err, rows) => {
//                     if (err) cbe(new SAError(ErrorType.Database, err));
//                     else if (rows === undefined) cb([]);
//                     else cb(rows);
//                 },
//             );
//         });
//     }

//     getNewestObjectByID(id: number) {
//         const db = nullCheck(this.db);
//         return new Promise<{
//             version: number;
//             type: number;
//             name: string;
//             content: string;
//             category: string;
//             comment: string;
//             time: number;
//             author: string | null;
//         }>((cb, cbe) => {
//             db.get<{
//                 version: number;
//                 type: number;
//                 name: string;
//                 content: string;
//                 category: string;
//                 comment: string;
//                 time: number;
//                 author: string | null;
//             }>(
//                 "SELECT `version`, `type`, `name`, `content`, `category`, `comment`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=? AND `newest`=1",
//                 [id],
//                 (err, row) => {
//                     if (err) cbe(new SAError(ErrorType.Database, err));
//                     else cb(row);
//                 },
//             );
//         });
//     }

//     changeObject(id: number, object: IObject2<any> | null, author: string) {
//         const db = nullCheck(this.db);
//         const ins =
//             ({ id, version }: IV) =>
//             (cb: (res: IV) => void, cbe: (error: SAError) => void) => {
//                 db.run(
//                     "INSERT INTO `objects` (`id`, `version`, `type`, `name`, `content`, `time`, `newest`, `category`, `comment`, `author`) VALUES (?, ?, ?, ?, ?, datetime('now'), 1, ?, ?, ?)",
//                     [
//                         id,
//                         version,
//                         object ? object.type : null,
//                         object ? object.name : null,
//                         object ? JSON.stringify(object.content) : null,
//                         object ? object.category : null,
//                         object ? object.comment : null,
//                         author,
//                     ],
//                     (err) => {
//                         if (err) cbe(new SAError(ErrorType.Database, err));
//                         else cb({ id, version });
//                     },
//                 );
//             };
//         if (id < 0) {
//             return new Promise<IV>(ins({ id: this.nextObjectId++, version: 1 }));
//         }
//         return new Promise<IV>((cb, cbe) => {
//             db.get<{ version: number }>(
//                 "SELECT max(`version`) as `version` FROM `objects` WHERE `id` = ?",
//                 [id],
//                 (err, row) => {
//                     if (err) cbe(new SAError(ErrorType.Database, err));
//                     else if (!row) cbe(new SAError(ErrorType.Database, "Unable to find row"));
//                     else {
//                         const version = row.version + 1;
//                         db.run("UPDATE `objects` SET `newest`=0 WHERE `id` = ?", [id], (err) => {
//                             if (err) cbe(new SAError(ErrorType.Database, err));
//                             else if (object) ins({ id, version })(cb, cbe);
//                             else cb({ id, version });
//                         });
//                     }
//                 },
//             );
//         });
//     }

//     getHostContentByName(hostname: string) {
//         const db = nullCheck(this.db);
//         return new Promise<{
//             id: number;
//             content: Host;
//             version: number;
//             type: number;
//             name: string;
//             category: string;
//             comment: string;
//             time: number;
//             author: string | null;
//         } | null>((cb, cbe) => {
//             db.get<{
//                 id: number;
//                 content: string;
//                 version: number;
//                 category: string;
//                 comment: string;
//                 time: string;
//                 author: string | null;
//             }>(
//                 "SELECT `id`, `content`, `version`, `name`, `category`, `comment`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `type` = ? AND `name`=? AND `newest`=1",
//                 [hostId, hostname],
//                 (err, row) => {
//                     if (err) cbe(new SAError(ErrorType.Database, err));
//                     else if (row === undefined) cb(null);
//                     else
//                         cb({
//                             id: row.id,
//                             content: JSON.parse(row.content),
//                             version: row.version,
//                             type: hostId,
//                             name: hostname,
//                             category: row.category,
//                             comment: row.comment,
//                             time: +row.time,
//                             author: row.author,
//                         });
//                 },
//             );
//         });
//     }

//     async getRootVariables() {
//         const rootRow = await this.get(
//             "SELECT `content` FROM `objects` WHERE `id`=? AND `newest`=1 AND `type`=?",
//             rootInstanceId,
//             rootId,
//         );
//         const variables: { [key: string]: string } = {};
//         const rootVars = JSON.parse(rootRow.content) as IVariables;
//         if (rootVars.variables) for (const v of rootVars.variables) variables[v.key] = v.value;
//         if (rootVars.secrets) for (const v of rootVars.secrets) variables[v.key] = v.value;
//         return variables;
//     }

//     async getHostVariables(id: number): Promise<null | [Host, { [key: string]: string }]> {
//         const hostRow = await this.get(
//             "SELECT `name`, `content` FROM `objects` WHERE `id`=? AND `newest`=1 AND `type`=?",
//             id,
//             hostId,
//         );
//         const rootRow = await this.get(
//             "SELECT `content` FROM `objects` WHERE `id`=? AND `newest`=1 AND `type`=?",
//             rootInstanceId,
//             rootId,
//         );
//         if (!hostRow || !rootRow) return null;
//         const hostInfo = JSON.parse(hostRow.content) as Host;
//         const variables: { [key: string]: string } = {};

//         const rootVars = JSON.parse(rootRow.content) as IVariables;
//         if (rootVars.variables) for (const v of rootVars.variables) variables[v.key] = v.value;
//         if (rootVars.secrets) for (const v of rootVars.secrets) variables[v.key] = v.value;
//         variables.nodename = hostRow.name;

//         const visited = new Set();

//         const visitObject = async (id: number) => {
//             if (visited.has(id)) return;
//             visited.add(id);

//             const objectRow = await this.get(
//                 "SELECT `type`, `content` FROM `objects` WHERE `id`=? AND `newest`=1",
//                 id,
//             );
//             if (!objectRow) return;
//             switch (objectRow.type) {
//                 case collectionId:
//                 case complexCollectionId: {
//                     const o = JSON.parse(objectRow.content) as IContains & IDepends;
//                     if (o.contains) for (const id of o.contains) await visitObject(id);
//                     if (o.depends) for (const id of o.depends) await visitObject(id);
//                     break;
//                 }
//                 case hostVariableId: {
//                     const vs = JSON.parse(objectRow.content) as IVariables;
//                     if (vs.variables)
//                         for (const v of vs.variables)
//                             variables[v.key] = Mustache.render(v.value, variables);
//                     if (vs.secrets)
//                         for (const v of vs.secrets)
//                             variables[v.key] = Mustache.render(v.value, variables);
//                     break;
//                 }
//             }
//         };

//         for (const id of hostInfo.contains) await visitObject(id);

//         if (hostInfo.variables) for (const v of hostInfo.variables) variables[v.key] = v.value;
//         if (hostInfo.secrets) for (const v of hostInfo.secrets) variables[v.key] = v.value;

//         return [hostInfo, variables];
//     }
// }
}