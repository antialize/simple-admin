// import { db, webClients } from "./instances";
// import * as actions from "./shared/actions";

use std::time::UNIX_EPOCH;

use crate::db::Db;
use anyhow::{Context, Result};
use sadmin2::message::HostMessage;

pub async fn msg_emit(
    db: &Db,
    host: i64,
    r#type: &str,
    message: &str,
    subtype: Option<String>,
    url: Option<String>,
) -> Result<()> {
    // const time = +new Date() / 1000;
    // const id = await db.insert(
    //     "INSERT INTO messages (`host`,`type`,`subtype`,`message`,`url`, `time`, `dismissed`) VALUES (?, ?, ?, ?, ?,?, 0)",
    //     host,
    //     type,
    //     subtype,
    //     message,
    //     url,
    //     time,
    // );
    // if (!message) message = "";
    // const act: actions.IAddMessage = {
    //     type: actions.ACTION.AddMessage,
    //     message: {
    //         id,
    //         host,
    //         type,
    //         message: message.substr(0, 1000),
    //         fullMessage: message.length < 1000,
    //         subtype,
    //         time,
    //         url,
    //         dismissed: false,
    //     },
    // };
    // webClients.broadcast(act);
    todo!()
}

pub async fn msg_set_dismissed(db: &Db, ids: &[i64], dismissed: bool) -> Result<()> {
    // const time = dismissed ? +new Date() / 1000 : null;

    // await db.run(
    //     `UPDATE \`messages\` SET \`dismissed\`=?, \`dismissedTime\`=? WHERE \`id\` IN (${ids.join(",")})`,
    //     dismissed,
    //     time,
    // );

    // const act: actions.ISetMessagesDismissed = {
    //     type: actions.ACTION.SetMessagesDismissed,
    //     ids: ids,
    //     dismissed: dismissed,
    //     source: "server",
    // };

    // webClients.broadcast(act);
    todo!()
}

pub fn msg_get_resent(db: &Db) -> Result<Vec<HostMessage>> {
    let now = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs();
    let time = now - 60 * 60 * 24 * 2; //Two dayes ago
    db.all("SELECT `id`, `host`, `type`, `subtype`, `message`, `url`, `time` FROM `messages`, `dismissed` WHERE `dismissed`=0 OR `dismissedTime`>?", (time,),
    |r| {
        let mut message: String = r.get(4)?;
        let full_message = message.len() < 1000;
        message.truncate(1000);
        Ok(HostMessage {
            id: r.get(0)?,
            host: r.get(1)?,
            r#type: r.get(2)?,
            subtype: r.get(3)?,
            message,
            full_message,
            url: r.get(5)?,
            time: r.get(6)?,
            dismissed: r.get::<_, i64>(7)? == 1,
        })
    })
}

pub fn msg_get_full_text(db: &Db, id: i64) -> Result<Option<String>> {
    Ok(db.get(
        "SELECT `message` FROM `messages` WHERE `id`=?",
        (id,),
        |v| v.get(0),
    )?)
}

pub fn get_all(db: &Db) -> Result<Vec<HostMessage>> {
    db.all("SELECT `id`, `host`, `type`, `subtype`, `message`, `url`, `time`, `dismissed` FROM `messages`", (),
        |r| {
            let mut message: String = r.get(4)?;
            let full_message = message.len() < 1000;
            message.truncate(1000);
            Ok(HostMessage {
                id: r.get(0)?,
                host: r.get(1)?,
                r#type: r.get(2)?,
                subtype: r.get(3)?,
                message,
                full_message,
                url: r.get(5)?,
                time: r.get(6)?,
                dismissed: r.get::<_, i64>(7)? == 1,
            })
        })
}

pub fn get_count(db: &Db) -> Result<i64> {
    Ok(db.get("SELECT count(*) as `count` FROM `messages` WHERE `dismissed` = 0 AND `message` IS NOT NULL", (), |v| v.get(0))?.unwrap_or_default())
}
