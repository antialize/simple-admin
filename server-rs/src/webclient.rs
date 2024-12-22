use anyhow::{bail, Context, Result};
use log::{error, info, warn};
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
        IAction, IAuthStatus, IGenerateKey, IGenerateKeyRes, IGetObjectHistoryRes,
        IGetObjectHistoryResHistory, IGetObjectId, IGetObjectIdRes, ILogin, IObject2,
        IObjectChanged, ISearch, ISearchRes, ISearchResObject,
    },
    crt,
    crypt::{self, random_fill},
    db,
    get_auth::get_auth,
    state::State,
    type_types::TYPE_ID,
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

    async fn get_object_id_inner(
        &self,
        state: &State,
        act: &IGetObjectId,
    ) -> Result<i64, anyhow::Error> {
        let (type_name, object_name) = act.path.split_once("/").context("Missing /")?;
        let type_id = query!(
            "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`",
            TYPE_ID,
            type_name
        )
        .fetch_one(&state.db)
        .await?
        .id;
        let object_id = query!(
            "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`",
            type_id,
            object_name
        )
        .fetch_one(&state.db)
        .await?
        .id;
        Ok(object_id)
    }

    pub async fn handle_message(&self, state: &State, act: IAction) -> Result<()> {
        match act {
            IAction::RequestAuthStatus(act) => {
                let host = self.get_host().await?;
                let auth = get_auth(state, Some(&host), act.session.as_deref()).await?;
                self.set_auth(auth.clone()).await?;
                self.send_message(IAction::AuthStatus(auth)).await?;
            }
            IAction::Login(act) => {
                if let Err(e) = self.handle_login_inner(state, act).await {
                    error!("Error in handle_login: {:?}", e);
                    self.send_message(IAction::AuthStatus(IAuthStatus {
                        message: Some("Internal error".to_string()),
                        ..Default::default()
                    }))
                    .await?
                }
            }
            IAction::Logout(act) => {
                let host = self.get_host().await?;
                let auth = self.get_auth().await?;
                if !self.get_auth().await?.auth {
                    self.close(403).await?;
                    return Ok(());
                };
                let session = auth.session.context("Missing session")?;
                info!(
                    "logout host:{}, user: {:?}, session: {:?}, forgetPwd: {}, forgetOtp: {}",
                    host, auth.user, session, act.forget_pwd, act.forget_otp,
                );
                if act.forget_pwd {
                    query!("UPDATE `sessions` SET `pwd`=NULL WHERE `sid`=?", session)
                        .execute(&state.db)
                        .await?;
                }
                if act.forget_otp {
                    query!("UPDATE `sessions` SET `otp`=NULL WHERE `sid`=?", session)
                        .execute(&state.db)
                        .await?;
                }
                let auth = get_auth(state, Some(&host), Some(&session)).await?;
                self.set_auth(auth.clone()).await?;
                self.send_message(IAction::AuthStatus(auth)).await?;
            }
            IAction::FetchObject(act) => {
                if !self.get_auth().await?.admin {
                    self.close(403).await?;
                    return Ok(());
                };
                let rows = query!(
                    "SELECT `id`, `version`, `type`, `name`, `content`, `category`, `comment`,
                    strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
                    act.id
                )
                .fetch_all(&state.db)
                .await?;
                let mut object = Vec::new();
                for row in rows {
                    object.push(IObject2 {
                        id: act.id,
                        version: Some(row.version),
                        r#type: row.r#type.try_into()?,
                        name: row.name,
                        content: serde_json::from_str(&row.content)?,
                        category: row.category.unwrap_or_default(),
                        comment: row.comment,
                        time: Some(row.time.parse()?),
                        author: row.author,
                    });
                }
                self.send_message(IAction::ObjectChanged(IObjectChanged {
                    id: act.id,
                    object,
                }))
                .await?;
            }
            IAction::GetObjectId(act) => {
                if !self.get_auth().await?.admin {
                    self.close(403).await?;
                    return Ok(());
                };
                let id = match self.get_object_id_inner(state, &act).await {
                    Ok(v) => Some(v),
                    Err(e) => {
                        error!("Failure in getObjectId {:?}", e);
                        None
                    }
                };
                self.send_message(IAction::GetObjectIdRes(IGetObjectIdRes {
                    r#ref: act.r#ref,
                    id,
                }))
                .await?;
            }
            IAction::GetObjectHistory(act) => {
                if !self.get_auth().await?.admin {
                    self.close(403).await?;
                    return Ok(());
                };
                let rows = query!(
                    "SELECT `version`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
                    act.id
                )
                .fetch_all(&state.db)
                .await?;
                let mut history: Vec<_> = Vec::new();
                for row in rows {
                    history.push(IGetObjectHistoryResHistory {
                        version: row.version,
                        time: row.time.parse()?,
                        author: row.author,
                    });
                }
                self.send_message(IAction::GetObjectHistoryRes(IGetObjectHistoryRes {
                    r#ref: act.r#ref,
                    id: act.id,
                    history,
                }))
                .await?;
            }
            IAction::Search(act) => {
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
            }
            IAction::GenerateKey(act) => {
                self.handle_generate_key(state, act).await?;
            }
            _ => {
                warn!("Unhandled message {:?}", act)
            }
        }
        Ok(())
    }
}

#[neon::export(context, name = "webclientHandleMessage")]
async fn handle_message(
    ch: Channel,
    Boxed(state): Boxed<Arc<State>>,
    obj: Root<JsObject>,
    Json(act): Json<IAction>,
) -> Result<(), Error> {
    let wc = WebClient {
        obj: Arc::new(obj),
        channel: ch,
    };
    match wc.handle_message(&state, act).await {
        Ok(()) => Ok(()),
        Err(e) => {
            error!("Error in handle_message: {:?}", e);
            Err(e.into())
        }
    }
}
