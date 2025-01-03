mod action_types;
mod arena;
mod client_message;
mod config;
mod crt;
mod crypt;
mod db;
mod docker;
mod get_auth;
mod hostclient;
mod modified_files;
mod msg;
mod ocell;
mod page_types;
mod service_description;
mod state;
mod type_types;
mod webclient;

use action_types::{DockerImageTag, DockerImageTagRow, IAuthStatus, IObject2, ObjectType};
use anyhow::anyhow;
use neon::{
    event::Channel,
    handle::Root,
    types::{
        extract::{Boxed, Error, Json},
        JsObject,
    },
};
use serde::Serialize;
use sqlx_type::{query, query_as};
use state::State;
use std::{collections::HashMap, sync::Arc};
use type_types::HOST_ID;
mod cmpref;

#[neon::export(name = "cryptHash")]
fn crypt_hash(key: String) -> Result<String, Error> {
    Ok(crypt::hash(&key)?)
}

#[neon::export(name = "cryptValidatePassword")]
fn crypt_validate_password(provided: String, hash: String) -> Result<bool, Error> {
    Ok(crypt::validate_password(&provided, &hash)?)
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

#[neon::export(name = "dockerPrune")]
async fn docker_prune(Boxed(state): Boxed<Arc<State>>) -> () {
    docker::prune(&state).await
}

#[neon::export]
async fn init(
    ch: Channel,
    instances: Root<JsObject>,
    docker: Root<JsObject>,
) -> Result<Boxed<Arc<State>>, Error> {
    Ok(Boxed(State::new(ch, instances, docker).await?))
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

#[neon::export(name = "getImageTagsByProject")]
async fn get_image_tags_by_project(
    Boxed(state): Boxed<Arc<State>>,
    project: String,
) -> Result<Json<Vec<DockerImageTag>>, Error> {
    let rows = query_as!(
        DockerImageTagRow,
        "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`,
        `removed` FROM `docker_images` WHERE `project` = ? ORDER BY `time`",
        project
    )
    .fetch_all(&state.db)
    .await?;

    let mut res = Vec::new();
    for row in rows {
        res.push(row.try_into()?);
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
