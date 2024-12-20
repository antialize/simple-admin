use anyhow::{bail, Context, Result};
use sqlx_type::query;
use std::time::Duration;

use crate::{
    action_types::{IAction, IAuthStatus, IGenerateKey, ILogin},
    crypt::{self, random_fill},
    db,
    get_auth::get_auth,
    state::State,
};

pub async fn handle_login(
    state: &State,
    mut session: Option<String>,
    host: String,
    act: ILogin,
) -> Result<(IAction, IAuthStatus)> {
    let auth = if let Some(session) = &session {
        get_auth(&state, Some(&host), Some(&session)).await?
    } else {
        Default::default()
    };

    let mut found = false;
    let mut new_otp = false;
    let mut otp = auth.otp;
    let mut pwd = auth.pwd;

    for u in &state.config.users {
        if u.name == act.user {
            found = true;
            if u.password == act.pwd {
                otp = true;
                pwd = true;
                new_otp = true;
                break;
            }
        }
    }

    if !found {
        let content = db::get_user_content(&state, &act.user).await?;
        if let Some(content) = content {
            tokio::time::sleep(Duration::from_secs(1)).await;
            pwd = crypt::validate_password(&act.pwd, &content.password)?;
            if let Some(otp_token) = &act.otp {
                if !otp_token.is_empty() {
                    otp = crypt::validate_otp(&otp_token, &content.otp_base32)?;
                    new_otp = true;
                }
            }
        }
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs() as i64;

    if !found {
        Ok((
            IAction::AuthStatus(IAuthStatus {
                session: session,
                user: Some(act.user),
                message: Some("Invalid user name".to_string()),
                ..Default::default()
            }),
            IAuthStatus::default(),
        ))
    } else if !pwd || !otp {
        if otp && new_otp {
            if let Some(session) = &session {
                query!("UPDATE `sessions` SET `otp`=? WHERE `sid`=?", now, session)
                    .execute(&state.db)
                    .await?;
            } else {
                let mut buf = [0; 64];
                random_fill(&mut buf)?;
                let sid = hex::encode(buf);
                query!(
                    "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`)
                    VALUES (?, ?, ?, ?, ?)",
                    act.user,
                    host,
                    None::<i64>,
                    now,
                    sid
                )
                .execute(&state.db)
                .await?;
                session = Some(sid)
            }
        }
        Ok((
            IAction::AuthStatus(IAuthStatus {
                session: session.clone(),
                user: Some(act.user),
                otp: otp,
                message: Some("Invalid password or one time password".to_string()),
                ..Default::default()
            }),
            IAuthStatus {
                session,
                otp,
                ..Default::default()
            },
        ))
    } else {
        if let Some(session) = &session {
            if new_otp {
                query!(
                    "UPDATE `sessions` SET `pwd`=?, `otp`=? WHERE `sid`=?",
                    now,
                    now,
                    session
                )
                .execute(&state.db)
                .await?;
            } else {
                query!("UPDATE `sessions` SET `pwd`=? WHERE `sid`=?", now, session)
                    .execute(&state.db)
                    .await?;
            }
        } else {
            let mut buf = [0; 64];
            random_fill(&mut buf)?;
            let sid = hex::encode(buf);
            query!(
                "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`)
                VALUES (?, ?, ?, ?, ?)",
                act.user,
                host,
                now,
                now,
                sid,
            )
            .execute(&state.db)
            .await?;
            session = Some(sid)
        }
        let auth = get_auth(&state, Some(&host), session.as_deref()).await?;
        if !auth.auth {
            bail!("Internal auth error");
        }
        Ok((IAction::AuthStatus(auth.clone()), auth))
    }
}
