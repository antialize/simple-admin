use crate::{action_types::IObject2, state::State};
use anyhow::{Context, Result};
use log::info;
use neon::object;
use serde::{Deserialize, Serialize};
use sqlx::Executor;
use sqlx_type::query;

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
    pub auth_days: Option<String>,
    pub password: String,
    #[serde(rename = "otp_base32")]
    pub otp_base32: String,
}

const USER_ID: i64 = 4;

pub async fn get_user_content(state: &State, name: &str) -> Result<Option<UserContent>> {
    let row = query!(
        "SELECT `content` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=true",
        USER_ID,
        name
    )
    .fetch_optional(&state.db)
    .await
    .context("Runing query in get_user_content")?;
    match row {
        Some(row) => Ok(Some(
            serde_json::from_str(&row.content).context("Parsing user content")?,
        )),
        None => Ok(None),
    }
}

pub async fn setup(state: &State) -> Result<()> {
    let mut con = state.db.acquire().await?;

    con.execute(
        "CREATE TABLE IF NOT EXISTS `objects` (`id` INTEGER, `version` INTEGER, `type` INTEGER, `name` TEXT, `content` TEXT, `comment` TEXT, `time` INTEGER, `newest` INTEGER)",
    ).await?;

    let _ = con
        .execute("ALTER TABLE `objects` ADD COLUMN `category` TEXT")
        .await;
    let _ = con
        .execute("ALTER TABLE `objects` ADD COLUMN `author` TEXT")
        .await;
    con.execute("CREATE UNIQUE INDEX IF NOT EXISTS `id_version` ON `objects` (id, version)")
        .await?;
    con.execute(
        "CREATE TABLE IF NOT EXISTS `messages` (`id` INTEGER PRIMARY KEY, `host` INTEGER, `type` TEXT, `subtype` TEXT, `message` TEXT, `url` TEXT, `time` INTEGER, `dismissed` INTEGER)",
    ).await?;
    // //await i("ALTER TABLE `messages` ADD COLUMN `dismissedTime` INTEGER");
    con.execute("CREATE INDEX IF NOT EXISTS `messagesIdx` ON `messages` (dismissed, time)")
        .await?;
    con.execute(
        "CREATE INDEX IF NOT EXISTS `messagesIdx2` ON `messages` (dismissed, dismissedTime)",
    )
    .await?;
    con.execute(
        "CREATE TABLE IF NOT EXISTS `deployments` (`id` INTEGER, `host` INTEGER, `name` TEXT, `content` TEXT, `time` INTEGER, `type` INTEGER, `title` TEXT)",
    ).await?;
    con.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS `deployments_host_name` ON `deployments` (host, name)",
    )
    .await?;
    con.execute(
        "CREATE TABLE IF NOT EXISTS `installedPackages` (`id` INTEGER, `host` INTEGR, `name` TEXT)",
    )
    .await?;

    // //await r('DROP TABLE `docker_images`');
    con.execute(
        "CREATE TABLE IF NOT EXISTS `docker_images` (`id` INTEGER PRIMARY KEY, `project` TEXT, `tag` TEXT, `manifest` TEXT, `hash` TEXT, `user` INTEGER, `time` INTEGER)",
    ).await?;
    let _ = con
        .execute("ALTER TABLE `docker_images` ADD COLUMN `pin` INTEGER")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_images` ADD COLUMN `labels` TEXT")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_images` ADD COLUMN `removed` INTEGER")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_images` ADD COLUMN `used` INTEGER")
        .await;

    con.execute("CREATE INDEX IF NOT EXISTS `docker_images_hash` ON `docker_images` (`hash`)")
        .await?;

    con.execute(
        "CREATE TABLE IF NOT EXISTS `docker_deployments` (`id` INTEGER PRIMARY KEY, `project` TEXT, `container` TEXT, `host` INTEGER, `startTime` INTEGER, `endTime` INTEGER, `config` TEXT, `hash` TEXT, `user` INTEGER)",
    ).await?;

    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `setup` TEXT")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `postSetup` TEXT")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `timeout` INTEGER DEFAULT 120")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `softTakeover` INTEGER DEFAULT 0")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `startMagic` TEXT")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `stopTimeout` INTEGER DEFAULT 10")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `usePodman` INTEGER DEFAULT 0")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `userService` INTEGER DEFAULT 0")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `userService` INTEGER DEFAULT 0")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `deployUser` TEXT")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `serviceFile` TEXT")
        .await;
    let _ = con
        .execute("ALTER TABLE `docker_deployments` ADD COLUMN `description` TEXT")
        .await;

    con.execute(
        "CREATE TABLE IF NOT EXISTS `docker_image_tag_pins` (`id` INTEGER PRIMARY KEY, `project` TEXT, `tag` TEXT)",
    ).await?;
    con.execute(
         "CREATE UNIQUE INDEX IF NOT EXISTS `docker_image_tag_pins_u` ON `docker_image_tag_pins` (`project`, `tag`)",
    ).await?;

    con.execute("CREATE TABLE IF NOT EXISTS `kvp` (`key` TEXT PRIMARY KEY, `value` TEXT)")
        .await?;

    con.execute(
         "CREATE TABLE IF NOT EXISTS `sessions` (`id` INTEGER PRIMARY KEY, `user` TEXT, `host` TEXT, `sid` TEXT NOT NULL, `pwd` INTEGER, `otp` INTEGER)",
    ).await?;
    con.execute("DELETE FROM `sessions` WHERE `user`='docker_client'")
        .await?;
    con.execute("CREATE UNIQUE INDEX IF NOT EXISTS `sessions_sid` ON `sessions` (`sid`)")
        .await?;

    // for ((name, value) in &[
    //     ("host", hostId),
    //     ("user", userId),
    //     ("group", groupId),
    //     ("file", fileId),
    //     ("collection", collectionId),
    //     ("ufwallow", ufwAllowId),
    //     ("package", packageId),
    // ]) {
    //     await r("UPDATE `objects` SET `type`=?  WHERE `type`=?", [pair[1], pair[0]]);
    // }

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

    let id = query!("SELECT max(`id`) as `id` FROM `objects`")
        .fetch_optional(&state.db)
        .await?;
    let next_object_id = i64::max(
        10000,
        id.and_then(|v| v.id).map(|v| v + 1).unwrap_or_default(),
    );
    info!("Db inited next_object_id = {}", next_object_id);
    state
        .next_object_id
        .store(next_object_id, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[derive(Serialize)]
pub struct IV {
    pub id: i64,
    pub version: i64,
}

pub async fn change_object<T: Serialize + Clone>(
    state: &State,
    id: i64,
    object: Option<&IObject2<T>>,
    author: &str,
) -> Result<IV> {
    let (id, version) = if id < 0 {
        (
            state
                .next_object_id
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst),
            1,
        )
    } else {
        let row = query!(
            "SELECT max(`version`) as `version` FROM `objects` WHERE `id` = ?",
            id
        )
        .fetch_one(&state.db)
        .await?;
        let version = row.version.context("Unable to find row")?;
        query!("UPDATE `objects` SET `newest`=false WHERE `id` = ?", id)
            .execute(&state.db)
            .await?;
        (id, version)
    };
    if let Some(object) = object {
        let content = serde_json::to_string(&object.content)?;
        let r#type: i64 = object.r#type.into();
        query!("INSERT INTO `objects` (
            `id`, `version`, `type`, `name`, `content`, `time`, `newest`, `category`, `comment`, `author`)
            VALUES (?, ?, ?, ?, ?, datetime('now'), true, ?, ?, ?)",
            id, version,
            r#type,
            object.name,
            content,
            object.category,
            object.comment,
            author
            ).execute(&state.db).await?;
    }
    Ok(IV { id, version })
}

// #[cfg(test)]
// mod tests {
//     use std::str::FromStr;
//     use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
//     use super::*;

//     #[tokio::test]
//     async fn db() -> Result<()> {
//         let opt = SqliteConnectOptions::from_str("sqlite://../server/sysadmin.db")?
//         .journal_mode(SqliteJournalMode::Wal);

//         let db = sqlx::SqlitePool::connect_with(opt)
//             .await
//             .context("Unable to connect to sysadmin.db")?;

//         println!("messages");
//         query!("SELECT * FROM `messages`").fetch_all(&db).await.context("messages")?;
//         println!("deployments");
//         query!("SELECT * FROM `deployments`").fetch_all(&db).await.context("deployments")?;
//         println!("docker_images");
//         query!("SELECT * FROM `docker_images`").fetch_all(&db).await.context("docker_images")?;
//         println!("docker_deployments");
//         query!("SELECT * FROM `docker_deployments`").fetch_all(&db).await.context("docker_deployments")?;
//         println!("docker_image_tag_pins");
//         query!("SELECT * FROM `docker_image_tag_pins`").fetch_all(&db).await.context("docker_image_tag_pins")?;
//         println!("kvp");
//         query!("SELECT * FROM `kvp`").fetch_all(&db).await.context("kvp")?;
//         println!("sessions");
//         query!("SELECT * FROM `sessions`").fetch_all(&db).await.context("sessions")?;
//         println!("objects");

//         let rows =  query!("SELECT * FROM `objects`").fetch_all(&db).await.context("objects")?;
//         let mut err = false;
//         for row in rows {
//             let v: Result<serde_json::Value, _> = serde_json::from_str(&row.content);
//             if let Err(e) = v  {
//                 println!("Invalid object content {}: {:?}", row.id, e);
//                 err = true;
//             }
//         }
//         if err {
//             panic!();
//         }
//         Ok(())
//     }
// }
