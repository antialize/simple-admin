use anyhow::{bail, Context, Result};
use log::{error, info};
use neon::{
    event::Channel,
    handle::{Handle, Root},
    object::Object,
    result::ResultExt,
    types::{
        extract::{Boxed, Error, Json},
        JsArray, JsFuture, JsObject, JsPromise, JsString
    },
};
use sqlx_type::query;
use std::{sync::Arc, time::Duration};

use crate::{
    action_types::{
        IAction, IAuthStatus, IGenerateKey, IGenerateKeyRes, ILogin, ISearch, ISearchRes,
        ISearchResObject,
    },
    crt,
    crypt::{self, random_fill},
    db,
    get_auth::get_auth,
    state::State,
};

struct WebClient {
    obj: Arc<Root<JsObject>>,
    channel: Channel,
}

impl WebClient {
    async fn send_message(&self, msg: IAction) -> Result<()> {
        let obj = self.obj.clone();
        self.channel
            .try_send(move |mut cx| {
                let h = obj.to_inner(&mut cx);
                let mut m = h.method(&mut cx, "sendMessage")?;
                m.this(h)?;
                m.arg_with(|cx| Json(msg).try_into_js(cx))?;
                m.call()?;
                Ok(())
            })?
            .await?;
        Ok(())
    }

    async fn get_auth(&self) -> Result<IAuthStatus> {
        let obj = self.obj.clone();
        let auth = self
            .channel
            .try_send(move |mut cx| {
                let h = obj.to_inner(&mut cx);
                let Json(auth): Json<IAuthStatus> = h.prop(&mut cx, "auth").get()?;
                Ok(auth)
            })?
            .await?;
        Ok(auth)
    }

    async fn set_auth(&self, auth: IAuthStatus) -> Result<()> {
        let obj = self.obj.clone();
        self.channel
            .try_send(move |mut cx| {
                let h = obj.to_inner(&mut cx);
                h.prop(&mut cx, "auth").set(Json(auth))?;
                Ok(())
            })?
            .await?;
        Ok(())
    }

    async fn get_host(&self) -> Result<String> {
        let obj = self.obj.clone();
        let host = self
            .channel
            .try_send(move |mut cx| {
                let h = obj.to_inner(&mut cx);
                let h = h.prop(&mut cx, "host").get()?;
                Ok(h)
            })?
            .await?;
        Ok(host)
    }

    async fn close(&self, code: u16) -> Result<()> {
        let obj = self.obj.clone();
        self.channel
            .try_send(move |mut cx| {
                let h = obj.to_inner(&mut cx);
                let c: Handle<JsObject> = h.prop(&mut cx, "connection").get()?;
                let mut m = c.method(&mut cx, "close")?;
                m.this(c)?;
                m.arg(code)?;
                m.exec()?;
                Ok(())
            })?
            .await?;
        todo!()
    }

    async fn get_ca_key_crt(&self) -> Result<(String, String)> {
        let obj = self.obj.clone();
        let res: JsFuture<(String, String)> = self
            .channel
            .try_send(move |mut cx| {
                let h = obj.to_inner(&mut cx);
                let mut m = h.method(&mut cx, "getCaKeyCrt")?;
                m.this(h)?;
                let p: Handle<JsPromise> = m.call()?;
                let f = p.to_future(&mut cx, |mut cx, result| {
                    let value = result.or_throw(&mut cx)?;
                    let value: Handle<JsArray> = value.downcast_or_throw(&mut cx)?;
                    let a: Handle<JsString> = value.prop(&mut cx, 0).get()?;
                    let b: Handle<JsString> = value.prop(&mut cx, 1).get()?;
                    let a = a.value(&mut cx);
                    let b = b.value(&mut cx);
                    Ok((a, b))
                })?;
                Ok(f)
            })?
            .await?;
        let res = res.await?;
        Ok(res)
    }

    async fn handle_generate_key(&self, state: &State, act: IGenerateKey) -> Result<()> {
        let auth = self.get_auth().await?;
        let Some(sslname) = auth.sslname else {
            self.close(403).await?;
            return Ok(());
        };
        let (_uname, rem) = sslname.split_once(".").context("Missing . in sslname")?;
        let (_uid, caps_string) = rem.split_once(".").unwrap_or_default();
        let has_ssh_caps = caps_string.split("~").any(|v| v == "ssh");
        let (ca_key, ca_crt) = self.get_ca_key_crt().await?;
        let key = crt::generate_key().await?;
        let srs = crt::generate_srs(&key, &format!("{}.user", sslname)).await?;
        let crt =
            crt::generate_crt(&ca_key, &ca_crt, &srs, &[], auth.auth_days.unwrap_or(1)).await?;
        let mut res = IGenerateKeyRes {
            r#ref: act.r#ref,
            ca_pem: ca_crt,
            key,
            crt,
            ssh_crt: None,
            ssh_host_ca: None,
        };
        if let (Some(ssh_public_key), true) = (act.ssh_public_key, has_ssh_caps) {
            let root_variabels = db::get_root_variables(&state).await?;

            if let (Some(ssh_host_ca_pub), Some(ssh_host_ca_key), Some(user)) = (
                root_variabels.get("sshHostCaPub"),
                root_variabels.get("sshHostCaKey"),
                auth.user,
            ) {
                res.ssh_crt = Some(
                    crt::generate_ssh_crt(
                        &format!("{} sadmin user", user),
                        &user,
                        &ssh_host_ca_key,
                        &ssh_public_key,
                        1,
                        crt::Type::User,
                    )
                    .await?,
                );
                res.ssh_host_ca = Some(ssh_host_ca_pub.clone());
            }
        }
        self.send_message(IAction::GenerateKeyRes(res)).await?;
        Ok(())
    }

    pub async fn handle_login_inner(&self, state: &State, act: ILogin) -> Result<()> {
        let mut session = self.get_auth().await?.session;
        let host: String = self.get_host().await?;
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
                found = true;
            }
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .context("Bad unix time")?
            .as_secs() as i64;

        if !found {
            self.set_auth(IAuthStatus::default()).await?;
            self.send_message(IAction::AuthStatus(IAuthStatus {
                session: session,
                user: Some(act.user),
                message: Some("Invalid user name".to_string()),
                ..Default::default()
            }))
            .await?;
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
            self.set_auth(IAuthStatus {
                session: session.clone(),
                otp,
                ..Default::default()
            })
            .await?;
            self.send_message(IAction::AuthStatus(IAuthStatus {
                session: session,
                user: Some(act.user),
                otp: otp,
                message: Some("Invalid password or one time password".to_string()),
                ..Default::default()
            }))
            .await?;
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
            self.set_auth(auth.clone()).await?;
            self.send_message(IAction::AuthStatus(auth)).await?;
        }
        Ok(())
    }

    pub async fn handle_login(&self, state: &State, act: ILogin) -> Result<()> {
        if let Err(e) = self.handle_login_inner(state, act).await {
            error!("Error in handle_login: {:?}", e);
            self.send_message(IAction::AuthStatus(IAuthStatus {
                message: Some("Internal error".to_string()),
                ..Default::default()
            }))
            .await?
        }
        Ok(())
    }

    pub async fn handle_search(&self, state: &State, act: ISearch) -> Result<()> {
        if !self.get_auth().await?.admin {
            self.close(403).await?;
            return Ok(());
        };
        let rows = query!(
            "SELECT `id`, `version`, `type`, `name`, `content`, `comment`
            FROM `objects`
            WHERE (`name` LIKE ? OR `content` LIKE ? OR `comment` LIKE ?) AND `newest`",
            act.pattern,
            act.pattern,
            act.pattern,
        )
        .fetch_all(&state.db)
        .await?;
        let mut objects = Vec::new();
        for row in rows {
            objects.push(ISearchResObject {
                r#type: row.r#type.try_into()?,
                id: row.id,
                version: row.version,
                name: row.name,
                comment: row.comment,
                content: row.content,
            });
        }
        self.send_message(IAction::SearchRes(ISearchRes {
            r#ref: act.r#ref,
            objects,
        }))
        .await?;
        Ok(())
    }
}

#[neon::export(context, name = "webclientHandleGenerateKey")]
async fn _handle_generate_key(
    ch: Channel,
    Boxed(state): Boxed<Arc<State>>,
    obj: Root<JsObject>,
    Json(act): Json<IGenerateKey>,
) -> Result<(), Error> {
    let wc = WebClient {
        obj: Arc::new(obj),
        channel: ch,
    };
    Ok(wc.handle_generate_key(&state, act).await?)
}

#[neon::export(name = "webClientHandleLogin")]
async fn _handle_login(
    ch: Channel,
    Boxed(state): Boxed<Arc<State>>,
    obj: Root<JsObject>,
    Json(act): Json<ILogin>,
) -> Result<(), Error> {
    let wc = WebClient {
        obj: Arc::new(obj),
        channel: ch,
    };
    wc.handle_login(&state, act).await?;
    Ok(())
}

#[neon::export(name = "handleSearch")]
async fn _handle_search(
    ch: Channel,
    Boxed(state): Boxed<Arc<State>>,
    obj: Root<JsObject>,
    Json(act): Json<ISearch>,
) -> Result<(), Error> {
    let wc = WebClient {
        obj: Arc::new(obj),
        channel: ch,
    };
    wc.handle_search(&state, act).await?;
    Ok(())
}
