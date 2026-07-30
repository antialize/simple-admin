use crate::{action_types::IAuthStatus, db::get_user_content, state::State};
use anyhow::{Context, Result};
use chrono::TimeDelta;
use qusql_sqlx_type::query;

/// How often the user must run 'sadmin auth' to retype their password.
/// This timeout is used for three kinds of authentication expiry:
/// - get_auth(), which checks the session age on every request to the sadmin server
/// - handle_generate_key(), generating the user's SSL certificate (for talking to services)
/// - handle_generate_key(), generating the user's SSH certificate (for connecting to servers)
pub const USER_REAUTH_INTERVAL: TimeDelta = TimeDelta::hours(12);
/// How often the user must run 'sadmin auth' and re-validate with 2nd factor (TOTP).
const USER_REAUTH_OTP_INTERVAL: TimeDelta = TimeDelta::days(64);

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
        let pwd_expiration = if &user == "docker_client" {
            TimeDelta::hours(1)
        } else if let Some(auth_days) = auth_days {
            TimeDelta::days(auth_days as i64)
        } else {
            USER_REAUTH_INTERVAL
        };

        let otp_expiration = if &user == "docker_client" {
            TimeDelta::hours(1)
        } else {
            USER_REAUTH_OTP_INTERVAL
        };

        let now = std::time::SystemTime::now();
        let now = now
            .duration_since(std::time::UNIX_EPOCH)
            .context("Bad unix time")?
            .as_secs() as i64;
        let pwd = row
            .pwd
            .map(|v| v + pwd_expiration.num_seconds() > now)
            .unwrap_or_default();
        let otp = row
            .otp
            .map(|v| v + i64::max(otp_expiration.num_seconds(), pwd_expiration.num_seconds()) > now)
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
            rate_limit_delay: None,
        })
    }
}
