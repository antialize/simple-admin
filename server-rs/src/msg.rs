use crate::state::State;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx_type::query;

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IMessage {
    pub id: i64,
    pub host: Option<i64>,
    pub r#type: Option<String>,
    pub subtype: Option<String>,
    pub message: String,
    pub full_message: bool,
    pub time: i64,
    pub url: Option<String>,
    pub dismissed: bool,
}

pub async fn get_resent(state: &State) -> Result<Vec<IMessage>> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs() as i64;
    let time = now - 60 * 60 * 24 * 2; //Two dayes ago;

    query!("SELECT `id`, `host`, `type`, `subtype`, `message`, `url`, `time`, `dismissed`, `dismissedTime` FROM `messages` WHERE NOT `dismissed` OR `dismissedTime`>?", time)
        .map(|row| {
                let mut message = row.message.unwrap_or_default();
                let full_message = message.len() < 1000;
                message.truncate(1000);
                IMessage {
                    id: row.id,
                    host: row.host,
                    r#type: row.r#type,
                    subtype: row.subtype,
                    message,
                    full_message,
                    url: row.url,
                    time: row.time.unwrap_or_default(),
                    dismissed: row.dismissed
                }
            }).fetch_all(&state.db).await.context("query failed")
}

pub async fn get_full_text(state: &State, id: i64) -> Result<Option<String>> {
    let row = query!("SELECT `message` FROM `messages` WHERE `id`=?", id)
        .fetch_optional(&state.db)
        .await?;
    Ok(row.and_then(|v| v.message))
}

pub async fn get_count(state: &State) -> Result<i64> {
    let row = query!("SELECT count(*) as `count` FROM `messages` WHERE NOT `dismissed` AND `message` IS NOT NULL").fetch_one(&state.db).await?;
    Ok(row.count)
}
