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

use anyhow::anyhow;
use db::UserContent;
use get_auth::AuthStatus;
use msg::IMessage;
use neon::types::extract::{Boxed, Error, Json};
use serde::Serialize;
use sqlx_type::query;
use state::State;
use std::{collections::HashSet, sync::Arc};

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
) -> Result<Json<AuthStatus>, Error> {
    Ok(Json(
        get_auth::get_auth(&state, host.as_deref(), sid.as_deref()).await?,
    ))
}

#[neon::export(name = "noAccess")]
fn no_access() -> Json<AuthStatus> {
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

#[neon::export(name = "setSessionOtp")]
async fn set_session_otp(
    Boxed(state): Boxed<Arc<State>>,
    sid: String,
    otp: Option<f64>,
) -> Result<(), Error> {
    let otp = otp.map(|v| v as i64);
    query!("UPDATE `sessions` SET `otp`=? WHERE `sid`=?", otp, sid)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[neon::export(name = "setSessionPwd")]
async fn set_session_pwd(
    Boxed(state): Boxed<Arc<State>>,
    sid: String,
    pwd: Option<f64>,
) -> Result<(), Error> {
    let pwd = pwd.map(|v| v as i64);
    query!("UPDATE `sessions` SET `pwd`=? WHERE `sid`=?", pwd, sid)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[neon::export(name = "setSessionPwdAndOtp")]
async fn set_session_pwd_and_otp(
    Boxed(state): Boxed<Arc<State>>,
    sid: String,
    pwd: Option<f64>,
    otp: Option<f64>,
) -> Result<(), Error> {
    let otp = otp.map(|v| v as i64);
    let pwd = pwd.map(|v| v as i64);
    query!(
        "UPDATE `sessions` SET `pwd`=?, `otp`=? WHERE `sid`=?",
        pwd,
        otp,
        sid
    )
    .execute(&state.db)
    .await?;
    Ok(())
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
        "INSERT INTO messages (`host`,`type`,`subtype`,`message`,`url`, `time`, `dismissed`) VALUES (?, ?, ?, ?, ?,?, false)",
        host,
        r#type,
        subtype,
        message,
        url,
        time).execute(&state.db).await?.last_insert_rowid();
    Ok(id as f64)
}

#[neon::export(name = "setDismissed")]
async fn set_dismissed(
    Boxed(state): Boxed<Arc<State>>,
    ids: Vec<f64>,
    dismissed: bool,
    time: Option<f64>,
) -> Result<(), Error> {
    let ids: Vec<_> = ids.iter().map(|v| *v as i64).collect();
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
    ids: Option<f64>,
) -> Result<Json<Vec<(f64, String)>>, Error> {
    let ids: Vec<_> = ids.iter().map(|v| *v as i64).collect();
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
    name: Option<String>,
    content: String,
    r#type: f64,
    title: String,
    host: f64,
}

#[neon::export(name = "getDeployedFileLike")]
async fn get_deployed_file_like(
    Boxed(state): Boxed<Arc<State>>,
) -> Result<Json<Vec<DeployedContent>>, Error> {
    let res = query!("SELECT `name`, `content`, `type`, `title`, `host` FROM `deployments` WHERE `type` in (?, ?, ?)",
            FILE_ID,
            CRON_ID,
            SYSTEMD_SERVICE_ID).map(|r| DeployedContent{
                name: r.name,
                content: r.content,
                r#type: r.r#type as f64,
                title: r.title,
                host: r.host as f64,
            }).fetch_all(&state.db).await?;
    Ok(Json(res))
}

#[neon::export(name = "findObjectId")]
async fn find_object_id(
    Boxed(state): Boxed<Arc<State>>,
    r#type: f64,
    name: String,
) -> Result<Option<f64>, Error> {
    let r#type = r#type as i64;
    let res = query!("SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`",
        r#type,
        name).fetch_optional(&state.db).await?;
    Ok(res.map(|row| row.id as f64))
}



// #[derive(Serialize)]
// struct History {
//     version: f64,
//     time: f64,
//     author: Option<String>
// }

// #[neon::export(name = "getObjectHistory")]
// async fn get_object_history(
//     Boxed(state): Boxed<Arc<State>>,
//     id: f64,
// ) -> Result<Json<Vec<History>>, Error> {
//     let id = id as i64;
//     let res = query!("SELECT `version`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
//         id).map(|row| History { version: row.version as f64, time: row.time, author: row.author })
//         .fetch_all(&state.db).await?;
//     Ok(Json(res))
// }
