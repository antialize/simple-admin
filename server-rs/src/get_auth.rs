use crate::{action_types::IAuthStatus, db::get_user_content, state::State};
use anyhow::{Context, Result};
use sqlx_type::query;

pub async fn get_auth(state: &State, host: Option<&str>, sid: Option<&str>) -> Result<IAuthStatus> {
    let Some(sid) = sid else {
        return Ok(Default::default());
    };
    if let Some((user, _)) = sid.split_once(":") {
        let Some(content) = get_user_content(state, user).await? else {
            return Ok(Default::default());
        };
        if content
            .sessions
            .map(|v| v.split(',').any(|v| v == sid))
            .unwrap_or_default()
        {
            Ok(IAuthStatus {
                auth: true,
                user: Some(user.to_string()),
                pwd: true,
                otp: true,
                docker_pull: content.docker_pull,
                docker_push: content.docker_push,
                session: Some(sid.to_string()),
                ..Default::default()
            })
        } else {
            Ok(Default::default())
        }
    } else {
        let row = query!(
            "SELECT `pwd`, `otp`, `user`, `host` FROM `sessions` WHERE `sid`=?",
            sid
        )
        .fetch_optional(&state.db)
        .await
        .context("Runnig query in get_auth")?;
        let Some(row) = row else {
            return Ok(Default::default());
        };

        if host.is_some() && row.host != host.unwrap() {
            return Ok(Default::default());
        }

        let user = row.user;
        if user == "docker_client" {
            let now = std::time::SystemTime::now();
            let now = now
                .duration_since(std::time::UNIX_EPOCH)
                .context("Bad unix time")?
                .as_secs() as i64;
            let pwd = row.pwd.map(|v| v + 60 * 60 > now).unwrap_or_default();
            let otp = row.otp.map(|v| v + 60 * 60 > now).unwrap_or_default();
            return Ok(IAuthStatus {
                docker_pull: pwd && otp,
                docker_push: pwd && otp,
                auth: pwd && otp,
                user: Some(user),
                pwd,
                otp,
                session: Some(sid.to_string()),
                ..Default::default()
            });
        } else {
            for u in &state.config.users {
                if u.name == user {
                    let now = std::time::SystemTime::now();
                    let now = now
                        .duration_since(std::time::UNIX_EPOCH)
                        .context("Bad unix time")?
                        .as_secs() as i64;
                    let pwd = row.pwd.map(|v| v + 60 * 60 > now).unwrap_or_default();
                    let otp = row.otp.map(|v| v + 60 * 60 > now).unwrap_or_default();
                    return Ok(IAuthStatus {
                        docker_pull: true,
                        docker_push: true,
                        docker_deploy: true,
                        admin: true,
                        auth: true,
                        pwd,
                        otp,
                        session: None,
                        user: Some(user.to_string()),
                        ..Default::default()
                    });
                }
            }
        }

        let Some(content) = get_user_content(state, &user).await? else {
            return Ok(Default::default());
        };

        let auth_days = content.auth_days.and_then(|v| v.parse::<u32>().ok());
        let pwd_expiration: i64 = if &user == "docker_client" {
            60 * 60
        } else if let Some(auth_days) = auth_days {
            auth_days as i64 * 60 * 60 * 24
        } else {
            12 * 60 * 60 //Passwords time out after 12 hours
        };

        let otp_expiration: i64 = if &user == "docker_client" {
            60 * 60
        } else {
            64 * 24 * 60 * 60
        }; //otp time out after 2 months

        let now = std::time::SystemTime::now();
        let now = now
            .duration_since(std::time::UNIX_EPOCH)
            .context("Bad unix time")?
            .as_secs() as i64;
        let pwd = row
            .pwd
            .map(|v| v + pwd_expiration > now)
            .unwrap_or_default();
        let otp = row
            .otp
            .map(|v| v + i64::max(otp_expiration, pwd_expiration) > now)
            .unwrap_or_default();

        Ok(IAuthStatus {
            auth: pwd && otp,
            user: Some(user),
            pwd,
            otp,
            admin: content.admin && pwd && otp,
            docker_pull: pwd
                && otp
                && (content.admin || content.docker_deploy || content.docker_pull),
            docker_push: pwd
                && otp
                && (content.admin || content.docker_deploy || content.docker_push),
            docker_deploy: pwd && otp && (content.admin || content.docker_deploy),
            sslname: if pwd && otp { content.sslname } else { None },
            session: Some(sid.to_string()),
            auth_days,
            message: None,
        })
    }
}
