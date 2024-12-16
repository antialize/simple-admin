use crate::state::State;
use anyhow::Result;
use serde::{Deserialize, Serialize};
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
    pub auth_days: Option<u32>,
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
    .await?;
    match row {
        Some(row) => Ok(Some(serde_json::from_str(&row.content)?)),
        None => Ok(None),
    }
}
