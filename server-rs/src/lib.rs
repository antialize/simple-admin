mod config;
mod crypt;
mod db;
mod get_auth;
mod msg;
mod state;

use db::UserContent;
use get_auth::AuthStatus;
use msg::IMessage;
use neon::types::extract::{Boxed, Error, Json};
use state::State;
use std::sync::Arc;

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

#[neon::export]
async fn init<'cx>() -> Result<Boxed<Arc<State>>, Error> {
    Ok(Boxed(State::new().await?))
}
