use crate::{
    action_types::{IAddMessage, IMessage, IServerAction},
    state::State,
    webclient,
};
use anyhow::{Context, Result};
use sadmin2::finite_float::ToFinite;
use sqlx_type::query;

pub async fn get_resent(state: &State) -> Result<Vec<IMessage>> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs_f64();
    let time = now - 60.0 * 60.0 * 24.0 * 2.0; //Two dayes ago;

    query!("SELECT `id`, `host`, `type`, `subtype`, `message`, `url`, `time`, `dismissed`, `dismissedTime` FROM `messages` WHERE NOT `dismissed` OR `dismissedTime`>?", time)
        .map(|row| {
                let mut message = row.message.unwrap_or_default();
                let full_message = message.len() < 1000;
                message.truncate(1000);
                IMessage {
                    id: row.id,
                    host: row.host,
                    r#type: row.r#type.unwrap_or_else(|| "missing".to_string()),
                    subtype: row.subtype,
                    message,
                    full_message,
                    url: row.url,
                    time: row.time.to_finite().ok().flatten().unwrap_or_default(),
                    dismissed: row.dismissed
                }
            }).fetch_all(&state.db).await.context("query failed in get_resent")
}

pub async fn get_full_text(state: &State, id: i64) -> Result<Option<String>> {
    let row = query!("SELECT `message` FROM `messages` WHERE `id`=?", id)
        .fetch_optional(&state.db)
        .await
        .context("Query failed in get_full_text")?;
    Ok(row.and_then(|v| v.message))
}

pub async fn get_count(state: &State) -> Result<i64> {
    let row = query!(
        "SELECT count(*) as `count` FROM `messages` WHERE NOT `dismissed` AND `message` IS NOT NULL"
    )
    .fetch_one(&state.db)
    .await
    .context("Query failed in get_count")?;
    Ok(row.count)
}

pub async fn emit(state: &State, host: i64, r#type: String, mut message: String) -> Result<()> {
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs_f64();

    let id = query!(
        "INSERT INTO messages (`host`,`type`,`message`, `time`, `dismissed`)
        VALUES (?, ?, ?, ?, false)",
        host,
        r#type,
        message,
        time
    )
    .execute(&state.db)
    .await?
    .last_insert_rowid();

    let full_message = message.len() < 1000;
    message.truncate(1000);

    webclient::broadcast(
        state,
        IServerAction::AddMessage(IAddMessage {
            message: IMessage {
                id,
                host: Some(host),
                r#type,
                message,
                full_message,
                subtype: None,
                time: time.to_finite()?,
                url: None,
                dismissed: false,
            },
        }),
    )?;

    Ok(())
}
