mod action_types;
mod config;
mod crt;
mod crypt;
mod db;
mod docker;
mod get_auth;
mod msg;
mod state;
mod type_types;
mod webclient;

use action_types::{
    DockerImageTag, IAction, IAuthStatus, IDockerImageTagsChargedImageTagPin, ILogin, IObject2,
    ISearchResObject, ObjectType,
};
use anyhow::anyhow;
use db::UserContent;
use docker::DeploymentInfo;
use msg::IMessage;
use neon::types::extract::{Boxed, Error, Json};
use serde::Serialize;
use sqlx_type::{query, query_as};
use state::State;
use std::{collections::HashMap, sync::Arc};
use type_types::HOST_ID;

#[neon::export(name = "cryptHash")]
fn crypt_hash(key: String) -> Result<String, Error> {
    Ok(crypt::hash(&key)?)
}

#[neon::export(name = "cryptValidatePassword")]
fn crypt_validate_password(provided: String, hash: String) -> Result<bool, Error> {
    Ok(crypt::validate_password(&provided, &hash)?)
}

#[neon::export(name = "cryptValidateOtp")]
fn crypt_validate_otp(token: String, base32_secret: String) -> Result<bool, Error> {
    Ok(crypt::validate_otp(&token, &base32_secret)?)
}

#[neon::export(name = "cryptGenerateOtpSecret")]
fn crypt_generate_otp_secret(name: String) -> Result<Json<(String, String)>, Error> {
    Ok(Json(crypt::generate_otp_secret(name)?))
}

#[neon::export(name = "dbGetUserContent")]
async fn db_get_user_content(
    Boxed(state): Boxed<Arc<State>>,
    name: String,
) -> Result<Json<Option<UserContent>>, Error> {
    Ok(Json(db::get_user_content(&state, &name).await?))
}

#[neon::export(name = "getAuth")]
async fn get_auth(
    Boxed(state): Boxed<Arc<State>>,
    host: Option<String>,
    sid: Option<String>,
) -> Result<Json<IAuthStatus>, Error> {
    Ok(Json(
        get_auth::get_auth(&state, host.as_deref(), sid.as_deref()).await?,
    ))
}

#[neon::export(name = "noAccess")]
fn no_access() -> Json<IAuthStatus> {
    Json(Default::default())
}

#[neon::export(name = "msgGetResent")]
async fn msg_get_resent(Boxed(state): Boxed<Arc<State>>) -> Result<Json<Vec<IMessage>>, Error> {
    Ok(Json(msg::get_resent(&state).await?))
}

#[neon::export(name = "msgGetFullText")]
async fn msg_get_full_text(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
) -> Result<Option<String>, Error> {
    Ok(msg::get_full_text(&state, id as i64).await?)
}

#[neon::export(name = "msgGetCount")]
async fn msg_get_count(Boxed(state): Boxed<Arc<State>>) -> Result<f64, Error> {
    Ok(msg::get_count(&state).await? as f64)
}

#[neon::export(name = "crtGenerateKey")]
async fn crt_generate_key() -> Result<String, Error> {
    Ok(crt::generate_key().await?)
}

#[neon::export(name = "crtGenerateCaCrt")]
async fn crt_generate_ca_crt(key: String) -> Result<String, Error> {
    Ok(crt::generate_ca_crt(&key).await?)
}

#[neon::export(name = "crtGenerateSrs")]
async fn crt_generate_srs(key: String, cn: String) -> Result<String, Error> {
    Ok(crt::generate_srs(&key, &cn).await?)
}

#[neon::export(name = "crtGenerateCrt")]
async fn crt_generate_crt(
    ca_key: String,
    ca_crt: String,
    srs: String,
    Json(subcerts): Json<Vec<String>>,
    timout_days: f64,
) -> Result<String, Error> {
    Ok(crt::generate_crt(&ca_key, &ca_crt, &srs, &subcerts, timout_days as u32).await?)
}

#[neon::export(name = "crtGenerateSshCrt")]
async fn crt_generate_ssh_crt(
    key_id: String,
    principal: String,
    ca_private_key: String,
    client_public_key: String,
    validity_days: f64,
    r#type: String,
) -> Result<String, Error> {
    let t = match r#type.as_str() {
        "host" => crt::Type::Host,
        "user" => crt::Type::User,
        _ => Err(anyhow!("Invalid type"))?,
    };
    Ok(crt::generate_ssh_crt(
        &key_id,
        &principal,
        &ca_private_key,
        &client_public_key,
        validity_days as u32,
        t,
    )
    .await?)
}

#[neon::export(name = "crtStrip")]
fn crt_strip(crt: String) -> Result<String, Error> {
    Ok(crt::strip(&crt).to_string())
}

#[neon::export(name = "dockerPrune")]
async fn docker_prune(Boxed(state): Boxed<Arc<State>>) -> () {
    docker::prune(&state).await
}

#[neon::export]
async fn init() -> Result<Boxed<Arc<State>>, Error> {
    Ok(Boxed(State::new().await?))
}


#[neon::export(name = "insertSession")]
async fn insert_session(
    Boxed(state): Boxed<Arc<State>>,
    user: String,
    host: String,
    pwd: Option<f64>,
    otp: Option<f64>,
    sid: String,
) -> Result<(), Error> {
    let otp = otp.map(|v| v as i64);
    let pwd = pwd.map(|v| v as i64);

    let row = query!(
        "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)",
        user,
        host,
        pwd,
        otp,
        sid
    )
    .execute(&state.db)
    .await?;
    if row.rows_affected() == 0 {
        Err(anyhow!("Unable to insert session"))?
    }
    Ok(())
}

#[neon::export(name = "deleteSession")]
async fn delete_session(
    Boxed(state): Boxed<Arc<State>>,
    sid: String,
    user: String,
) -> Result<(), Error> {
    query!(
        "DELETE FROM `sessions` WHERE `user`=? AND `sid`=?",
        user,
        sid
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

#[neon::export(name = "insertMessage")]
async fn insert_message(
    Boxed(state): Boxed<Arc<State>>,
    host: f64,
    r#type: String,
    message: String,
    subtype: Option<String>,
    url: Option<String>,
    time: f64,
) -> Result<f64, Error> {
    let host = host as i64;
    let id = query!(
        "INSERT INTO messages (`host`,`type`,`subtype`,`message`,`url`, `time`, `dismissed`)
        VALUES (?, ?, ?, ?, ?,?, false)",
        host,
        r#type,
        subtype,
        message,
        url,
        time
    )
    .execute(&state.db)
    .await?
    .last_insert_rowid();
    Ok(id as f64)
}

#[neon::export(name = "setDismissed")]
async fn set_dismissed(
    Boxed(state): Boxed<Arc<State>>,
    Json(ids): Json<Vec<i64>>,
    dismissed: bool,
    time: Option<f64>,
) -> Result<(), Error> {
    query!(
        "UPDATE `messages` SET `dismissed`=?, `dismissedTime`=? WHERE `id` IN (_LIST_)",
        dismissed,
        time,
        ids
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

#[neon::export(name = "getObjectsContent")]
async fn get_objects_content(
    Boxed(state): Boxed<Arc<State>>,
    Json(ids): Json<Vec<i64>>,
) -> Result<Json<Vec<(f64, String)>>, Error> {
    let res = query!(
        "SELECT `id`, `content` FROM `objects` WHERE `newest` AND `id` in (_LIST_)",
        ids
    )
    .map(|row| (row.id as f64, row.content))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(res))
}

const FILE_ID: i64 = 6;
const CRON_ID: i64 = 10240;
const SYSTEMD_SERVICE_ID: i64 = 10240;

#[derive(Serialize)]
struct DeployedContent {
    name: String,
    content: String,
    r#type: f64,
    title: String,
    host: f64,
}

#[neon::export(name = "getDeployedFileLike")]
async fn get_deployed_file_like(
    Boxed(state): Boxed<Arc<State>>,
) -> Result<Json<Vec<DeployedContent>>, Error> {
    let res = query!(
        "SELECT `name`, `content`, `type`, `title`, `host`
            FROM `deployments` WHERE `type` in (?, ?, ?)",
        FILE_ID,
        CRON_ID,
        SYSTEMD_SERVICE_ID
    )
    .map(|r| DeployedContent {
        name: r.name,
        content: r.content,
        r#type: r.r#type as f64,
        title: r.title,
        host: r.host as f64,
    })
    .fetch_all(&state.db)
    .await?;
    Ok(Json(res))
}

#[neon::export(name = "findObjectId")]
async fn find_object_id(
    Boxed(state): Boxed<Arc<State>>,
    Json(r#type): Json<ObjectType>,
    name: String,
) -> Result<Option<f64>, Error> {
    let r#type: i64 = r#type.into();
    let res = query!(
        "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`",
        r#type,
        name
    )
    .fetch_optional(&state.db)
    .await?;
    Ok(res.map(|row| row.id as f64))
}

#[derive(Serialize)]
struct History {
    version: f64,
    time: f64,
    author: Option<String>,
}

#[neon::export(name = "getObjectHistory")]
async fn get_object_history(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
) -> Result<Json<Vec<History>>, Error> {
    let id = id as i64;
    let rows = query!(
        "SELECT `version`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
        id
    )
    .fetch_all(&state.db)
    .await?;
    let mut res = Vec::new();
    for row in rows {
        res.push(History {
            version: row.version as f64,
            time: row.time.parse()?,
            author: row.author,
        })
    }
    Ok(Json(res))
}

#[neon::export(name = "getIdNamePairsForType")]
async fn get_id_name_pairs_for_type(
    Boxed(state): Boxed<Arc<State>>,
    Json(r#type): Json<ObjectType>,
) -> Result<Json<Vec<(f64, String)>>, Error> {
    let t: i64 = r#type.into();
    let res = query!(
        "SELECT `id`, `name` FROM `objects` WHERE `type` = ? AND `newest`",
        t
    )
    .map(|r| (r.id as f64, r.name))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(res))
}

#[derive(Serialize)]
struct FullObject {
    id: i64,
    version: i64,
    r#type: ObjectType,
    name: String,
    content: String,
    category: Option<String>,
    comment: String,
    time: i64,
    author: Option<String>,
}

#[neon::export(name = "getObjectById")]
async fn get_object_by_id(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
) -> Result<Json<Vec<FullObject>>, Error> {
    let id = id as i64;
    let rows = query!(
        "SELECT `id`, `version`, `type`, `name`, `content`, `category`, `comment`,
        strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
        id
    )
    .fetch_all(&state.db)
    .await?;
    let mut res = Vec::new();
    for r in rows {
        res.push(FullObject {
            id: r.id,
            version: r.version,
            r#type: r.r#type.try_into()?,
            name: r.name,
            content: r.content,
            category: r.category,
            comment: r.comment,
            time: r.time.parse()?,
            author: r.author,
        });
    }
    Ok(Json(res))
}

#[neon::export(name = "getNewestObjectByID")]
async fn get_newest_object_by_id(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
) -> Result<Json<FullObject>, Error> {
    let id = id as i64;
    let r = query!(
        "SELECT `id`, `version`, `type`, `name`, `content`, `category`, `comment`,
        strftime('%s', `time`) AS `time`, `author` FROM `objects`
        WHERE `id`=? AND `newest`",
        id
    )
    .fetch_one(&state.db)
    .await?;
    Ok(Json(FullObject {
        id: r.id,
        version: r.version,
        r#type: r.r#type.try_into()?,
        name: r.name,
        content: r.content,
        category: r.category,
        comment: r.comment,
        time: r.time.parse()?,
        author: r.author,
    }))
}

#[neon::export(name = "getObjectByNameAndType")]
async fn get_object_by_name_and_type(
    Boxed(state): Boxed<Arc<State>>,
    name: String,
    r#type: f64,
) -> Result<Json<Option<FullObject>>, Error> {
    let r#type = r#type as i64;
    let row = query!(
        "SELECT `id`, `type`, `content`, `version`, `name`, `category`, `comment`,
        strftime('%s', `time`) AS `time`, `author` FROM `objects`
        WHERE `type` = ? AND `name`=? AND `newest`",
        r#type,
        name
    )
    .fetch_optional(&state.db)
    .await?;
    let res = match row {
        Some(r) => Some(FullObject {
            id: r.id,
            version: r.version,
            r#type: r.r#type.try_into()?,
            name: r.name,
            content: r.content,
            category: r.category,
            comment: r.comment,
            time: r.time.parse()?,
            author: r.author,
        }),
        None => None,
    };
    Ok(Json(res))
}

#[neon::export(name = "getAllObjectsFull")]
async fn get_all_objects_full(
    Boxed(state): Boxed<Arc<State>>,
) -> Result<Json<Vec<FullObject>>, Error> {
    let rows = query!(
        "SELECT `id`, `type`, `name`, `content`, `category`, `version`, `comment`,
        strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `newest` ORDER BY `id`"
    )
    .fetch_all(&state.db)
    .await?;
    let mut res = Vec::new();
    for r in rows {
        res.push(FullObject {
            id: r.id,
            version: r.version,
            r#type: r.r#type.try_into()?,
            name: r.name,
            content: r.content,
            category: r.category,
            comment: r.comment,
            time: r.time.parse()?,
            author: r.author,
        });
    }
    Ok(Json(res))
}

#[neon::export(name = "getKvp")]
async fn get_kvp(Boxed(state): Boxed<Arc<State>>, key: String) -> Result<Option<String>, Error> {
    let r = query!("SELECT `value` FROM `kvp` WHERE `key` = ?", key)
        .fetch_optional(&state.db)
        .await?;
    Ok(r.map(|r| r.value))
}

#[neon::export(name = "setKvp")]
async fn set_kvp(Boxed(state): Boxed<Arc<State>>, key: String, value: String) -> Result<(), Error> {
    query!("REPLACE INTO kvp (`key`, `value`) VALUES (?,?)", key, value)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[neon::export(name = "markImageUsed")]
async fn mark_image_used(
    Boxed(state): Boxed<Arc<State>>,
    hash: String,
    time: f64,
) -> Result<(), Error> {
    query!(
        "UPDATE `docker_images` SET `used`=? WHERE `hash`=?",
        time,
        hash
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

#[derive(Serialize)]
struct ObjectContent {
    id: i64,
    name: String,
    content: String,
}

#[neon::export(name = "getObjectContentByType")]
async fn get_object_content_by_type(
    Boxed(state): Boxed<Arc<State>>,
    Json(r#type): Json<ObjectType>,
) -> Result<Json<Vec<ObjectContent>>, Error> {
    let t: i64 = r#type.into();
    let r = query_as!(
        ObjectContent,
        "SELECT `id`, `name`, `content` FROM `objects` WHERE `type` = ? AND `newest`",
        t
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(r))
}

#[neon::export(name = "resetServer")]
async fn reset_server(Boxed(state): Boxed<Arc<State>>, host: f64) -> Result<(), Error> {
    let host = host as i64;
    query!("DELETE FROM `deployments` WHERE `host`=?", host)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[neon::export(name = "getObjectContentByIdAndType")]
async fn get_object_content_by_id_and_type(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
    Json(r#type): Json<ObjectType>,
) -> Result<Json<ObjectContent>, Error> {
    let id = id as i64;
    let t: i64 = r#type.into();
    let r = query_as!(
        ObjectContent,
        "SELECT `id`, `name`, `content` FROM `objects` WHERE `id`=? AND `newest` AND `type`=?",
        id,
        t
    )
    .fetch_one(&state.db)
    .await?;
    Ok(Json(r))
}

#[neon::export(name = "insertDockerImage")]
async fn insert_docker_image(
    Boxed(state): Boxed<Arc<State>>,
    project: String,
    tag: String,
    manifest: String,
    hash: String,
    user: String,
    time: f64,
    labels: String,
) -> Result<f64, Error> {
    query!(
        "DELETE FROM `docker_images` WHERE `project`=? AND `tag`=? AND `hash`=?",
        project,
        tag,
        hash,
    )
    .execute(&state.db)
    .await?;
    let id = query!(
        "INSERT INTO `docker_images` (`project`, `tag`, `manifest`, `hash`,
        `user`, `time`, `pin`, `labels`)
        VALUES (?, ?, ?, ?, ?, ?, false, ?)",
        project,
        tag,
        manifest,
        hash,
        user,
        time,
        labels,
    )
    .execute(&state.db)
    .await?
    .last_insert_rowid();
    Ok(id as f64)
}

#[neon::export(name = "insertDockerDeployment")]
async fn insert_docker_deployment(
    Boxed(state): Boxed<Arc<State>>,
    host: f64,
    project: String,
    name: String,
    start: f64,
    hash: String,
    user: String,
    description: String,
) -> Result<f64, Error> {
    let host = host as i64;
    let start = start as i64;
    let old_deployment = query!(
        "SELECT `id`, `endTime` FROM `docker_deployments`
        WHERE `host`=? AND `project`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1",
        host,
        project,
        name,
    )
    .fetch_optional(&state.db)
    .await?;

    if let Some(old_deployment) = old_deployment {
        if old_deployment.endTime.is_none() {
            query!(
                "UPDATE `docker_deployments` SET `endTime` = ? WHERE `id`=?",
                start,
                old_deployment.id,
            )
            .execute(&state.db)
            .await?;
        }
    }
    let id = query!(
        "INSERT INTO `docker_deployments` (
        `project`, `container`, `host`, `startTime`, `hash`, `user`, `description`)
        VALUES (?, ?, ?, ?, ?, ?, ?)",
        project,
        name,
        host,
        start,
        hash,
        user,
        description,
    )
    .execute(&state.db)
    .await?
    .last_insert_rowid();
    Ok(id as f64)
}

#[neon::export(name = "forgetContainer")]
async fn forget_container(
    Boxed(state): Boxed<Arc<State>>,
    host: f64,
    container: String,
) -> Result<(), Error> {
    let host = host as i64;
    query!(
        "DELETE FROM `docker_deployments` WHERE `host`=? AND `container`=?",
        host,
        container
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

#[allow(non_snake_case)]
#[derive(Serialize)]
struct DockerDeployment {
    id: i64,
    project: String,
    container: String,
    host: i64,
    startTime: i64,
    endTime: Option<i64>,
    config: Option<String>,
    hash: String,
    user: Option<String>,
    setup: Option<String>,
    postSetup: Option<String>,
    timeout: Option<i64>,
    softTakeover: bool,
    startMagic: Option<String>,
    stopTimeout: i64,
    usePodman: bool,
    userService: bool,
    deployUser: Option<String>,
    serviceFile: Option<String>,
    description: Option<String>,
}

#[neon::export(name = "getDockerDeployment")]
async fn get_docker_deployment(
    Boxed(state): Boxed<Arc<State>>,
    host: f64,
    container: String,
) -> Result<Json<Option<DockerDeployment>>, Error> {
    let host = host as i64;
    let res = query_as!(
        DockerDeployment,
        "SELECT * FROM `docker_deployments`
        WHERE `host`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1",
        host,
        container
    )
    .fetch_optional(&state.db)
    .await?;
    Ok(Json(res))
}

#[neon::export(name = "getDockerDeploymentById")]
async fn get_docker_deployment_by_id(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
) -> Result<Json<Option<DockerDeployment>>, Error> {
    let id = id as i64;
    let res = query_as!(
        DockerDeployment,
        "SELECT * FROM `docker_deployments` WHERE `id`=?",
        id
    )
    .fetch_optional(&state.db)
    .await?;
    Ok(Json(res))
}

#[neon::export(name = "getDockerDeployments")]
async fn get_docker_deployments(
    Boxed(state): Boxed<Arc<State>>,
    host: f64,
    container: String,
) -> Result<Json<Vec<DockerDeployment>>, Error> {
    let host = host as i64;
    let res = query_as!(
        DockerDeployment,
        "SELECT * FROM `docker_deployments` WHERE `host`=? AND `container`=?",
        host,
        container
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(res))
}

#[derive(Serialize)]
struct Deployment {
    name: Option<String>,
    content: String,
    r#type: i64,
    title: String,
}

#[neon::export(name = "getDeployments")]
async fn get_deployments(
    Boxed(state): Boxed<Arc<State>>,
    host: f64,
) -> Result<Json<Vec<Deployment>>, Error> {
    let host = host as i64;
    let res = query_as!(
        Deployment,
        "SELECT `name`, `content`, `type`, `title` FROM `deployments` WHERE `host`=?",
        host
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(res))
}

#[neon::export(name = "setDeployment")]
async fn set_deployment(
    Boxed(state): Boxed<Arc<State>>,
    host: f64,
    name: String,
    content: Option<String>,
    r#type: f64,
    title: String,
) -> Result<(), Error> {
    let host = host as i64;
    let r#type = r#type as i64;
    if let Some(content) = content {
        if !content.is_empty() {
            query!(
                "REPLACE INTO `deployments`
                (`host`, `name`, `content`, `time`, `type`, `title`)
                VALUES (?, ?, ?, datetime('now'), ?, ?)",
                host,
                name,
                content,
                r#type,
                title
            )
            .execute(&state.db)
            .await?;
            return Ok(());
        }
    }
    query!(
        "DELETE FROM `deployments` WHERE `host`=? AND `name`=?",
        host,
        name
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

#[neon::export(name = "imageSetPin")]
async fn image_set_pin(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
    pin: bool,
) -> Result<Json<Vec<DockerImageTag>>, Error> {
    let id = id as i64;
    query!("UPDATE `docker_images` SET pin=? WHERE `id`=?", pin, id)
        .execute(&state.db)
        .await?;

    let rows = query!(
        "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`,
        `pin`, `labels`, `removed` FROM `docker_images` WHERE `id`=?",
        id
    )
    .fetch_all(&state.db)
    .await?;

    let mut res = Vec::new();
    for row in rows {
        res.push(DockerImageTag {
            id: row.id,
            image: row.project,
            tag: row.tag,
            hash: row.hash,
            time: row.time,
            user: row.user,
            pin: row.pin,
            labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
            removed: row.removed,
            pinned_image_tag: false,
        });
    }

    Ok(Json(res))
}

#[neon::export(name = "imageTagSetPin")]
async fn image_tag_set_pin(
    Boxed(state): Boxed<Arc<State>>,
    image: String,
    tag: String,
    pin: bool,
) -> Result<(), Error> {
    if pin {
        query!(
            "INSERT INTO `docker_image_tag_pins` (`project`, `tag`) VALUES (?, ?)",
            image,
            tag
        )
        .execute(&state.db)
        .await?;
    } else {
        query!(
            "DELETE FROM `docker_image_tag_pins` WHERE `project`=? AND `tag`=?",
            image,
            tag
        )
        .execute(&state.db)
        .await?;
    }
    Ok(())
}

#[neon::export(name = "handleDeployment")]
async fn handle_depoyment_(
    Boxed(state): Boxed<Arc<State>>,
    Json(o): Json<DeploymentInfo>,
) -> Result<f64, Error> {
    let id = docker::handle_deployment(&state, o).await?;
    Ok(id as f64)
}

#[neon::export(name = "getTagsByHash")]
async fn get_tags_by_hash(
    Boxed(state): Boxed<Arc<State>>,
    Json(hashes): Json<Vec<String>>,
) -> Result<Json<Vec<DockerImageTag>>, Error> {
    let rows = query!(
        "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`,
        `labels`, `removed` FROM `docker_images` WHERE `hash` IN (_LIST_)",
        &hashes
    )
    .fetch_all(&state.db)
    .await?;

    let mut res = Vec::new();
    for row in rows {
        res.push(DockerImageTag {
            id: row.id,
            image: row.project,
            tag: row.tag,
            hash: row.hash,
            time: row.time,
            user: row.user,
            pin: row.pin,
            labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
            removed: row.removed,
            pinned_image_tag: false,
        });
    }
    Ok(Json(res))
}

#[neon::export(name = "getImageTagsByProject")]
async fn get_image_tags_by_project(
    Boxed(state): Boxed<Arc<State>>,
    project: String,
) -> Result<Json<Vec<DockerImageTag>>, Error> {
    let rows = query!(
        "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`,
        `removed` FROM `docker_images` WHERE `project` = ? ORDER BY `time`",
        project
    )
    .fetch_all(&state.db)
    .await?;

    let mut res = Vec::new();
    for row in rows {
        res.push(DockerImageTag {
            id: row.id,
            image: row.project,
            tag: row.tag,
            hash: row.hash,
            time: row.time,
            user: row.user,
            pin: row.pin,
            labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
            removed: row.removed,
            pinned_image_tag: false,
        });
    }
    Ok(Json(res))
}

#[neon::export(name = "listImageTags")]
async fn list_image_tags(
    Boxed(state): Boxed<Arc<State>>,
    time: f64,
) -> Result<Json<(Vec<DockerImageTag>, Vec<IDockerImageTagsChargedImageTagPin>)>, Error> {
    let rows = query!(
        "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed`
        FROM `docker_images`
        WHERE `id` IN (
            SELECT MAX(`d`.`id`) FROM `docker_images` AS `d` GROUP BY `d`.`project`, `d`.`tag`
        ) AND (`removed` > ? OR `removed` IS NULL)",
        time
    )
    .fetch_all(&state.db)
    .await?;

    let mut res = Vec::new();
    for row in rows {
        res.push(DockerImageTag {
            id: row.id,
            image: row.project,
            tag: row.tag,
            hash: row.hash,
            time: row.time,
            user: row.user,
            pin: row.pin,
            labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
            removed: row.removed,
            pinned_image_tag: false,
        });
    }

    let rows = query!("SELECT `project`, `tag` FROM `docker_image_tag_pins`")
        .map(|r| IDockerImageTagsChargedImageTagPin {
            image: r.project,
            tag: r.tag,
            pin: true,
        })
        .fetch_all(&state.db)
        .await?;
    Ok(Json((res, rows)))
}

#[derive(Serialize)]
struct ImageHash {
    image: String,
    hash: Option<String>,
}

#[neon::export(name = "findImage")]
async fn find_image(Boxed(state): Boxed<Arc<State>>, id: String) -> Result<Json<ImageHash>, Error> {
    if let Some((image, reference)) = id.split_once('@') {
        let hash = query!(
            "SELECT `hash`, `time` FROM `docker_images`
            WHERE `project`=? AND `hash`=? ORDER BY `time` DESC LIMIT 1",
            image,
            reference
        )
        .fetch_optional(&state.db)
        .await?
        .map(|v| v.hash);

        Ok(Json(ImageHash {
            image: image.to_string(),
            hash,
        }))
    } else {
        let (image, reference) = id.split_once(":").unwrap_or((&id, "latest"));

        let hash = query!(
            "SELECT `hash`, `time` FROM `docker_images`
            WHERE `project`=? AND `tag`=? ORDER BY `time` DESC LIMIT 1",
            image,
            reference
        )
        .fetch_optional(&state.db)
        .await?
        .map(|v| v.hash);

        Ok(Json(ImageHash {
            image: image.to_string(),
            hash,
        }))
    }
}

#[neon::export(name = "listImageTagHistory")]
async fn list_image_tag_history(
    Boxed(state): Boxed<Arc<State>>,
    image: String,
    tag: String,
) -> Result<Json<Vec<DockerImageTag>>, Error> {
    let rows = query!(
        "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`,
        `removed` FROM `docker_images` WHERE `tag` = ? AND `project`= ?",
        tag,
        image
    )
    .fetch_all(&state.db)
    .await?;

    let mut res = Vec::new();
    for row in rows {
        res.push(DockerImageTag {
            id: row.id,
            image: row.project,
            tag: row.tag,
            hash: row.hash,
            time: row.time,
            user: row.user,
            pin: row.pin,
            labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
            removed: row.removed,
            pinned_image_tag: false,
        });
    }
    Ok(Json(res))
}

#[neon::export(name = "getDockerImageManifest")]
async fn get_docker_image_manifest(
    Boxed(state): Boxed<Arc<State>>,
    project: String,
    ident: String,
) -> Result<Option<String>, Error> {
    Ok(query!(
        "SELECT `manifest` FROM `docker_images`
        WHERE `project`=? AND (`tag`=? OR `hash`=?) ORDER BY `time` DESC LIMIT 1",
        project,
        ident,
        ident
    )
    .map(|r| r.manifest)
    .fetch_optional(&state.db)
    .await?)
}

#[neon::export(name = "listDeployments")]
async fn list_deployments(
    Boxed(state): Boxed<Arc<State>>,
) -> Result<Json<Vec<DockerDeployment>>, Error> {
    let res = query_as!(
        DockerDeployment,
        "SELECT * FROM `docker_deployments`
        WHERE `id` IN (
            SELECT MAX(`d`.`id`) FROM `docker_deployments` as `d`
            GROUP BY `d`.`host`, `d`.`project`, `d`.`container`)"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(res))
}

#[neon::export(name = "setupDb")]
async fn setup_db(Boxed(state): Boxed<Arc<State>>) -> Result<(), Error> {
    db::setup(&state).await?;
    Ok(())
}

#[neon::export(name = "changeObject")]
async fn _change_object(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
    Json(object): Json<Option<IObject2<serde_json::Value>>>,
    author: String,
) -> Result<Json<db::IV>, Error> {
    Ok(Json(
        db::change_object(&state, id as i64, object.as_ref(), &author).await?,
    ))
}

#[neon::export(name = "getHostContentByName")]
async fn get_host_content_by_name(
    Boxed(state): Boxed<Arc<State>>,
    hostname: String,
) -> Result<Json<Option<IObject2<serde_json::Value>>>, Error> {
    let r = db::get_object_by_name_and_type(&state, hostname, HOST_ID).await?;
    Ok(Json(r))
}

#[neon::export(name = "getRootVariables")]
async fn _get_root_variables(
    Boxed(state): Boxed<Arc<State>>,
) -> Result<Json<HashMap<String, String>>, Error> {
    let r = db::get_root_variables(&state).await?;
    Ok(Json(r))
}

#[neon::export(name = "getHostVariables")]
async fn _get_host_variables(
    Boxed(state): Boxed<Arc<State>>,
    id: f64,
) -> Result<Json<Option<HashMap<String, String>>>, Error> {
    let r = db::get_host_variables(&state, id as i64).await?;
    Ok(Json(r))
}
