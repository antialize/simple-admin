mod action_types;
mod arena;
mod client_message;
mod config;
mod crt;
mod crypt;
mod db;
mod deployment;
mod docker;
mod get_auth;
mod hostclient;
mod modified_files;
mod msg;
mod mustache;
mod ocell;
mod ordered_json;
mod page_types;
mod service_description;
mod state;
mod type_types;
mod variabels;
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

#[neon::export]
async fn init(ch: Channel, instances: Root<JsObject>) -> Result<Boxed<Arc<State>>, Error> {
    Ok(Boxed(State::new(ch, instances).await?))
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
