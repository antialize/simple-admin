// import { config } from "./config";
// import { db } from "./instances";
use anyhow::{Context, Result};
use sadmin2::message::AuthStatus;

use crate::db::Db;

pub async fn get_auth(db: &Db, host: Option<&str>, sid: Option<&str>) -> Result<AuthStatus> {
    let Some(sid) = sid else {
        return Ok(Default::default());
    };
    if let Some((user, _)) = sid.split_once(":") {
        let Some(content) = db.get_user_content(&user)? else {
            return Ok(Default::default());
        };
        if content
            .sessions
            .map(|v| v.split(',').any(|v| v == sid))
            .unwrap_or_default()
        {
            Ok(AuthStatus {
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
        struct Row {
            pwd: Option<u64>,
            otp: Option<u64>,
            user: Option<String>,
            host: Option<String>,
        }
        let row = db.get(
            "SELECT `pwd`, `otp`, `user`, `host` FROM `sessions` WHERE `sid`=?",
            (sid,),
            |r| {
                Ok(Row {
                    pwd: r.get("pwd")?,
                    otp: r.get("otp")?,
                    user: r.get("user")?,
                    host: r.get("host")?,
                })
            },
        )?;
        let Some(row) = row else {
            return Ok(Default::default());
        };
        if host.is_none() && row.host.is_none() {
            return Ok(Default::default());
        }
        let Some(user) = row.user else {
            return Ok(Default::default());
        };
        if user == "docker_client" {
            let now = std::time::SystemTime::now();
            let now = now
                .duration_since(std::time::UNIX_EPOCH)
                .context("Bad unix time")?
                .as_secs();
            let pwd = row.pwd.map(|v| v + 60 * 60 > now).unwrap_or_default();
            let otp = row.otp.map(|v| v + 60 * 60 > now).unwrap_or_default();
            return Ok(AuthStatus {
                docker_pull: true && pwd && otp,
                docker_push: true && pwd && otp,
                auth: pwd && otp,
                pwd,
                otp,
                session: Some(sid.to_string()),
                ..Default::default()
            });
        }

        // if (!found && && config.users) {
        //     for (const u of config.users) {
        //         if (u.name === user) {
        //             found = true;
        //             admin = true;
        //             dockerPull = true;
        //             dockerPush = true;
        //             dockerDeploy = true;
        //             const now = (Date.now() / 1000) | 0;
        //             pwd = row.pwd != null && row.pwd + 12 * 60 * 60 > now;
        //             otp = row.otp != null && row.otp + 64 * 24 * 60 * 60 > now;
        //         }
        //     }
        // }

        let Some(content) = db.get_user_content(&user)? else {
            return Ok(Default::default());
        };

        let pwd_expiration: u64 = if &user == "docker_client" {
            60 * 60
        } else {
            content.auth_days.map(|v| v as u64 * 24).unwrap_or(12) * 60 * 60 //Passwords time out after 12 hours
        };

        let otp_expiration: u64 = if &user == "docker_client" {
            60 * 60
        } else {
            64 * 24 * 60 * 60
        }; //otp time out after 2 months

        let now = std::time::SystemTime::now();
        let now = now
            .duration_since(std::time::UNIX_EPOCH)
            .context("Bad unix time")?
            .as_secs();
        let pwd = row
            .pwd
            .map(|v| v + pwd_expiration > now)
            .unwrap_or_default();
        let otp = row
            .otp
            .map(|v| v + u64::max(otp_expiration, pwd_expiration) > now)
            .unwrap_or_default();

        Ok(AuthStatus {
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
            auth_days: content.auth_days,
            message: None,
        })
    }
}
