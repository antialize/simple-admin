use anyhow::{bail, Context, Result};
use futures::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use sqlx_type::{query, query_as};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::net::TcpListener;
use tokio_tasks::{cancelable, RunToken, TaskBuilder};

use crate::{
    action_types::{
        DockerImageTag, DockerImageTagRow, IAction, IAlert, IAuthStatus, IDockerDeploymentsChanged,
        IDockerDeploymentsChangedRemoved, IDockerImageTagsCharged,
        IDockerImageTagsChargedImageTagPin, IDockerListImageByHashRes,
        IDockerListImageTagHistoryRes, IDockerListImageTagsRes, IDockerListImageTagsResTag,
        IGenerateKey, IGenerateKeyRes, IGetObjectHistoryRes, IGetObjectHistoryResHistory,
        IGetObjectId, IGetObjectIdRes, ILogin, IMessageTextRepAction, IObject2, IObjectChanged,
        IObjectDigest, ISearchRes, ISearchResObject, ISetInitialState, ISetMessagesDismissed,
        ISetPageAction, ISource, ObjectRow, ObjectType,
    },
    cmpref::CmpRef,
    crt, crypt,
    db::{self, IV},
    deployment,
    docker::{deploy_service, list_deployment_history, list_deployments, redploy_service},
    docker_web,
    get_auth::get_auth,
    modified_files, msg,
    page_types::{IObjectPage, IPage},
    setup,
    state::State,
    terminal,
    type_types::{
        IContainsIter, IDependsIter, ISudoOnIter, IType, ITypeProp, ValueMap, HOST_ID, TYPE_ID,
        USER_ID,
    },
    web_util::{request_logger, ClientIp, WebError},
};
use axum::{
    extract::{ws::CloseFrame, State as WState},
    response::{IntoResponse, Response},
};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, WebSocketUpgrade,
    },
    Json, Router,
};
use tokio::sync::Mutex as TMutex;

pub async fn alert_error(
    state: &State,
    err: anyhow::Error,
    place: &str,
    webclient: Option<&WebClient>,
) -> Result<()> {
    error!("An error occoured in {}: {:?}", place, err);
    let act = IAction::Alert(IAlert {
        message: format!("An error occoured in {}: {:?}", place, err),
        title: format!("Error in {}", place),
    });
    if let Some(webclient) = webclient {
        webclient.send_message(act).await?;
    } else {
        broadcast(state, act)?;
    }
    Ok(())
}

pub struct WebClient {
    sink: TMutex<SplitSink<WebSocket, Message>>,
    remote: String,
    auth: Mutex<IAuthStatus>,
    run_token: RunToken
}

impl WebClient {
    pub async fn send_message_str(&self, msg: &str) -> Result<()> {
        let mut sink = cancelable(&self.run_token, self.sink.lock()).await?;
        cancelable(&self.run_token, tokio::time::timeout(Duration::from_secs(60),sink.send(Message::Text(msg.into())))).await???;
        Ok(())
    }

    pub async fn send_message(&self, msg: IAction) -> Result<()> {
        let msg = serde_json::to_string(&msg)?;
        self.send_message_str(&msg).await
    }

    pub fn get_auth(&self) -> IAuthStatus {
        self.auth.lock().unwrap().clone()
    }

    fn set_auth(&self, auth: IAuthStatus) -> () {
        *self.auth.lock().unwrap() = auth;
    }

    async fn close(&self, code: u16) -> Result<()> {
        if let Ok(Ok(mut sink)) = cancelable(&self.run_token,tokio::time::timeout(Duration::from_secs(10), self.sink.lock())).await {
            let _ = cancelable(&self.run_token, tokio::time::timeout(Duration::from_secs(10),sink.send(Message::Close(Some(CloseFrame{
                code,
                reason: "".into(),
            }))))).await;
            let _ = sink.close().await;
        }
        self.run_token.cancel();
        Ok(())
    }

    async fn handle_generate_key(&self, state: &State, act: IGenerateKey) -> Result<()> {
        let auth = self.get_auth();
        let Some(sslname) = auth.sslname else {
            self.close(403).await?;
            return Ok(());
        };
        let (_uname, rem) = sslname.split_once(".").context("Missing . in sslname")?;
        let (_uid, caps_string) = rem.split_once(".").unwrap_or_default();
        let has_ssh_caps = caps_string.split("~").any(|v| v == "ssh");
        let ca_key = &state.docker.ca_key;
        let ca_crt = &state.docker.ca_crt;
        let key = crt::generate_key().await?;
        let srs = crt::generate_srs(&key, &format!("{}.user", sslname)).await?;
        let crt = crt::generate_crt(ca_key, ca_crt, &srs, &[], auth.auth_days.unwrap_or(1)).await?;
        let mut res = IGenerateKeyRes {
            r#ref: act.r#ref,
            ca_pem: ca_crt.clone(),
            key,
            crt,
            ssh_crt: None,
            ssh_host_ca: None,
        };
        if let (Some(ssh_public_key), true) = (act.ssh_public_key, has_ssh_caps) {
            let root_variabels = db::get_root_variables(state).await?;

            if let (Some(ssh_host_ca_pub), Some(ssh_host_ca_key), Some(user)) = (
                root_variabels.get("sshHostCaPub"),
                root_variabels.get("sshHostCaKey"),
                auth.user,
            ) {
                res.ssh_crt = Some(
                    crt::generate_ssh_crt(
                        &format!("{} sadmin user", user),
                        &user,
                        ssh_host_ca_key,
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
        let mut session = self.get_auth().session;
        let auth = if let Some(session) = &session {
            get_auth(state, Some(&self.remote), Some(session)).await?
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
            let content = db::get_user_content(state, &act.user).await?;
            if let Some(content) = content {
                tokio::time::sleep(Duration::from_secs(1)).await;
                pwd = crypt::validate_password(&act.pwd, &content.password)?;
                if let Some(otp_token) = &act.otp {
                    if !otp_token.is_empty() {
                        otp = crypt::validate_otp(otp_token, &content.otp_base32)?;
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
            self.set_auth(IAuthStatus::default());
            self.send_message(IAction::AuthStatus(IAuthStatus {
                session,
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
                    crypt::random_fill(&mut buf)?;
                    let sid = hex::encode(buf);
                    query!(
                        "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`)
                        VALUES (?, ?, ?, ?, ?)",
                        act.user,
                        self.remote,
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
            });
            self.send_message(IAction::AuthStatus(IAuthStatus {
                session,
                user: Some(act.user),
                otp,
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
                crypt::random_fill(&mut buf)?;
                let sid = hex::encode(buf);
                query!(
                    "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`)
                    VALUES (?, ?, ?, ?, ?)",
                    act.user,
                    self.remote,
                    now,
                    now,
                    sid,
                )
                .execute(&state.db)
                .await?;
                session = Some(sid)
            }
            let auth = get_auth(state, Some(&self.remote), session.as_deref()).await?;
            if !auth.auth {
                bail!("Internal auth error");
            }
            self.set_auth(auth.clone());
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

    pub async fn handle_message(&self, state: &State, _rt: RunToken, act: IAction) -> Result<()> {
        match act {
            IAction::RequestInitialState(_) => {
                if !self.get_auth().auth {
                    self.close(403).await?;
                    return Ok(());
                };
                let rows = query_as!(ObjectRow,
                    "SELECT `id`, `type`, `name`, `content`, `category`, `version`, `comment`,
                    strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `newest` ORDER BY `id`"
                )
                .fetch_all(&state.db)
                .await.context("RequestInitialState query")?;

                let hosts_up: Vec<_> = state.host_clients.lock().unwrap().keys().cloned().collect();

                let messages = msg::get_resent(state).await.context("msg::get_resent")?;
                let mut types = HashMap::new();
                let mut used_by = Vec::new();
                let mut object_names_and_ids: HashMap<_, Vec<_>> = HashMap::new();

                let (deployment_objects, deployment_status, deployment_message, deployment_log) = {
                    let deployment = state.deployment.lock().unwrap();
                    (
                        deployment.deployment_objects.clone(),
                        deployment.status.clone(),
                        deployment.message.clone(),
                        deployment.log.clone(),
                    )
                };

                for row in rows {
                    let object: IObject2<ValueMap> = row.try_into().context("IObject2")?;
                    if object.r#type == ObjectType::Id(TYPE_ID) {
                        types.insert(object.id, object.clone());
                    }
                    object_names_and_ids
                        .entry(object.r#type)
                        .or_default()
                        .push(IObjectDigest {
                            r#type: object.r#type,
                            id: object.id,
                            name: object.name.clone(),
                            category: object.category.clone(),
                            comment: object.comment.clone(),
                        });
                    used_by.extend(object.content.depends_iter().map(|v| (v, object.id)));
                    used_by.extend(object.content.contains_iter().map(|v| (v, object.id)));
                    used_by.extend(object.content.sudo_on_iter().map(|v| (v, object.id)))
                }
                self.send_message(IAction::SetInitialState(ISetInitialState {
                    messages,
                    hosts_up,
                    types,
                    used_by,
                    object_names_and_ids,
                    deployment_objects,
                    deployment_status,
                    deployment_message,
                    deployment_log,
                }))
                .await
                .context("send_message")?;
            }
            IAction::RequestAuthStatus(act) => {
                let auth = get_auth(state, Some(&self.remote), act.session.as_deref()).await?;
                self.set_auth(auth.clone());
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
                let auth = self.get_auth();
                if !auth.auth {
                    self.close(403).await?;
                    return Ok(());
                };
                let session = auth.session.context("Missing session")?;
                info!(
                    "logout host:{}, user: {:?}, session: {:?}, forgetPwd: {}, forgetOtp: {}",
                    self.remote, auth.user, session, act.forget_pwd, act.forget_otp,
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
                let auth = get_auth(state, Some(&self.remote), Some(&session)).await?;
                self.set_auth(auth.clone());
                self.send_message(IAction::AuthStatus(auth)).await?;
            }
            IAction::FetchObject(act) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                let rows = query_as!(
                    ObjectRow,
                    "SELECT `id`, `version`, `type`, `name`, `content`, `category`, `comment`,
                    strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
                    act.id
                )
                .fetch_all(&state.db)
                .await?;
                let mut object = Vec::new();
                for row in rows {
                    object.push(row.try_into()?);
                }
                self.send_message(IAction::ObjectChanged(IObjectChanged {
                    id: act.id,
                    object,
                }))
                .await?;
            }
            IAction::GetObjectId(act) => {
                if !self.get_auth().admin {
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
                if !self.get_auth().admin {
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
            IAction::MessageTextReq(act) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                let t = msg::get_full_text(state, act.id).await?;
                self.send_message(IAction::MessageTextRep(IMessageTextRepAction {
                    id: act.id,
                    message: t.unwrap_or_else(|| "missing".to_string()),
                }))
                .await?;
            }
            IAction::SetMessagesDismissed(act) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                let time = if act.dismissed {
                    Some(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .context("Bad unix time")?
                            .as_secs_f64(),
                    )
                } else {
                    None
                };
                query!(
                    "UPDATE `messages` SET `dismissed`=?, `dismissedTime`=? WHERE `id` IN (_LIST_)",
                    act.dismissed,
                    time,
                    act.ids
                )
                .execute(&state.db)
                .await?;
                broadcast(
                    state,
                    IAction::SetMessagesDismissed(ISetMessagesDismissed {
                        source: ISource::Server,
                        dismissed: act.dismissed,
                        ids: act.ids,
                    }),
                )?;
            }
            IAction::ResetServerState(act) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                query!("DELETE FROM `deployments` WHERE `host`=?", act.host)
                    .execute(&state.db)
                    .await?;
            }
            IAction::Search(act) => {
                if !self.get_auth().admin {
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
            IAction::SaveObject(act) => {
                let auth = self.get_auth();
                if !auth.admin {
                    self.close(403).await?;
                    return Ok(());
                };
                let mut obj = act.obj.context("Missing object in action")?;
                let object_type: i64 = obj.r#type.into();
                let serde_json::Value::Object(ref mut content) = obj.content else {
                    bail!("Content is not object")
                };
                let type_row = query!(
                    "SELECT `content` FROM `objects` WHERE `id`=? AND `newest`",
                    object_type
                )
                .fetch_one(&state.db)
                .await?;
                let type_content: IType = serde_json::from_str(&type_row.content)?;
                if let Some(tcs) = &type_content.content {
                    for r in tcs {
                        let ITypeProp::Password(r) = r else { continue };
                        let Some(serde_json::Value::String(ref mut v)) = content.get_mut(&r.name)
                        else {
                            continue;
                        };
                        // HACK HACK HACK crypt passwords that does not start with $6$, we belive we have allready bcrypt'ed it
                        if v.starts_with("$6$") || v.starts_with("$y$") {
                            continue;
                        }
                        *v = crypt::hash(v)?;
                    }
                }
                if object_type == USER_ID
                    && (!content.contains_key("otp_base32") || !content.contains_key("otp_url"))
                {
                    let (otp_base32, otp_url) = crypt::generate_otp_secret(obj.name.clone())?;
                    content.insert("otp_base32".to_string(), otp_base32.into());
                    content.insert("otp_url".to_string(), otp_url.into());
                }
                let IV { id, version } = db::change_object(
                    state,
                    act.id,
                    Some(&obj),
                    &auth.user.context("Missing user")?,
                )
                .await?;
                obj.version = Some(version);
                broadcast(
                    state,
                    IAction::ObjectChanged(IObjectChanged {
                        id,
                        object: vec![obj],
                    }),
                )?;
                self.send_message(IAction::SetPage(ISetPageAction {
                    page: IPage::Object(IObjectPage {
                        object_type,
                        id: Some(id),
                        version: Some(version),
                    }),
                }))
                .await?;
            }
            IAction::DeleteObject(act) => {
                let auth = self.get_auth();
                if !auth.admin {
                    self.close(403).await?;
                    return Ok(());
                };
                let rows = query!(
                    "SELECT `id`, `type`, `name`, `content` FROM `objects` WHERE `newest` ORDER BY `id`"
                )
                .fetch_all(&state.db)
                .await?;
                let mut conflicts = Vec::new();
                for r in rows {
                    if r.r#type == act.id {
                        conflicts.push(format!("* {} ({}) type", r.name, r.r#type));
                    }
                    let content: ValueMap = serde_json::from_str(&r.content)?;

                    for (n, v) in [
                        ("sudo_on", content.sudo_on_iter()),
                        ("depends", content.depends_iter()),
                        ("contains", content.contains_iter()),
                    ] {
                        for id in v {
                            if id == act.id {
                                conflicts.push(format!("* {} ({}) {}", r.name, r.r#type, n));
                            }
                        }
                    }
                }
                if !conflicts.is_empty() {
                    self.send_message(IAction::Alert(IAlert {
                        title: "Cannot delete object".into(),
                        message: format!(
                            "The object can not be delete as it is in use by:\n{}",
                            conflicts.join("\n")
                        ),
                    }))
                    .await?;
                } else {
                    info!("Web client delete object id={}", act.id);
                    db::change_object::<serde_json::Value>(
                        state,
                        act.id,
                        None,
                        &auth.user.context("Missing user")?,
                    )
                    .await?;
                    broadcast(
                        state,
                        IAction::ObjectChanged(IObjectChanged {
                            id: act.id,
                            object: vec![],
                        }),
                    )?;
                    self.send_message(IAction::SetPage(ISetPageAction {
                        page: IPage::Dashbord,
                    }))
                    .await?;
                }
            }
            IAction::DockerListImageByHash(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                let rows = query!(
                    "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`,
                    `labels`, `removed` FROM `docker_images` WHERE `hash` IN (_LIST_)",
                    &act.hash
                )
                .fetch_all(&state.db)
                .await?;
                let mut tags = HashMap::new();
                for row in rows {
                    tags.insert(
                        row.hash.clone(),
                        DockerImageTag {
                            id: row.id,
                            image: row.project,
                            tag: row.tag,
                            hash: row.hash,
                            time: row.time,
                            user: row.user,
                            pin: row.pin,
                            labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
                            removed: row.removed,
                            pinned_image_tag: false,
                        },
                    );
                }
                self.send_message(IAction::DockerListImageByHashRes(
                    IDockerListImageByHashRes {
                        r#ref: act.r#ref,
                        tags,
                    },
                ))
                .await?;
            }
            IAction::DockerListImageTags(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .context("Bad unix time")?
                    .as_secs_f64();
                let time = now - 14.0 * 24.0 * 60.0 * 60.0;
                let rows = match query_as!(
                    DockerImageTagRow,
                    "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed`
                    FROM `docker_images`
                    WHERE `id` IN (
                        SELECT MAX(`d`.`id`) FROM `docker_images` AS `d` GROUP BY `d`.`project`, `d`.`tag`
                    ) AND (`removed` > ? OR `removed` IS NULL)",
                    time
                )
                .fetch_all(&state.db)
                .await {
                    Ok(v) => v,
                    Err(e) => {
                        error!("ERROR IN QUERY {:?}", e);
                        return Err(e.into())
                    }
                };
                let mut tags = Vec::new();
                for row in rows {
                    tags.push(row.try_into().context("Mapping row")?);
                }
                let pinned_image_tags = query_as!(
                    IDockerListImageTagsResTag,
                    "SELECT `project` as `image`, `tag` FROM `docker_image_tag_pins`"
                )
                .fetch_all(&state.db)
                .await?;
                self.send_message(IAction::DockerListImageTagsRes(IDockerListImageTagsRes {
                    r#ref: act.r#ref,
                    tags,
                    pinned_image_tags: Some(pinned_image_tags),
                }))
                .await
                .context("In send message")?;
            }
            IAction::DockerImageSetPin(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };

                query!(
                    "UPDATE `docker_images` SET pin=? WHERE `id`=?",
                    act.pin,
                    act.id
                )
                .execute(&state.db)
                .await?;

                let rows = query!(
                    "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`,
                    `pin`, `labels`, `removed` FROM `docker_images` WHERE `id`=?",
                    act.id
                )
                .fetch_all(&state.db)
                .await?;

                let mut changed = Vec::new();
                for row in rows {
                    changed.push(DockerImageTag {
                        id: row.id,
                        image: row.project,
                        tag: row.tag,
                        hash: row.hash,
                        time: row.time,
                        user: row.user,
                        pin: row.pin,
                        labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
                        removed: row.removed,
                        pinned_image_tag: false,
                    });
                }
                broadcast(
                    state,
                    IAction::DockerImageTagsCharged(IDockerImageTagsCharged {
                        changed,
                        removed: Default::default(),
                        image_tag_pin_changed: Default::default(),
                    }),
                )?;
            }
            IAction::DockerImageTagSetPin(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                if act.pin {
                    query!(
                        "INSERT INTO `docker_image_tag_pins` (`project`, `tag`) VALUES (?, ?)",
                        act.image,
                        act.tag
                    )
                    .execute(&state.db)
                    .await?;
                } else {
                    query!(
                        "DELETE FROM `docker_image_tag_pins` WHERE `project`=? AND `tag`=?",
                        act.image,
                        act.tag
                    )
                    .execute(&state.db)
                    .await?;
                }
                broadcast(
                    state,
                    IAction::DockerImageTagsCharged(IDockerImageTagsCharged {
                        changed: Default::default(),
                        removed: Default::default(),
                        image_tag_pin_changed: Some(vec![IDockerImageTagsChargedImageTagPin {
                            image: act.image,
                            tag: act.tag,
                            pin: act.pin,
                        }]),
                    }),
                )?;
            }
            IAction::DockerListImageTagHistory(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                let rows = query!(
                    "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`,
                    `removed` FROM `docker_images` WHERE `tag` = ? AND `project`= ?",
                    act.tag,
                    act.image
                )
                .fetch_all(&state.db)
                .await?;
                let mut images = Vec::new();
                for row in rows {
                    images.push(DockerImageTag {
                        id: row.id,
                        image: row.project,
                        tag: row.tag,
                        hash: row.hash,
                        time: row.time,
                        user: row.user,
                        pin: row.pin,
                        labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
                        removed: row.removed,
                        pinned_image_tag: false,
                    });
                }
                self.send_message(IAction::DockerListImageTagHistoryRes(
                    IDockerListImageTagHistoryRes {
                        r#ref: act.r#ref,
                        images,
                        image: act.image,
                        tag: act.tag,
                    },
                ))
                .await?;
            }
            IAction::DockerContainerForget(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                query!(
                    "DELETE FROM `docker_deployments` WHERE `host`=? AND `container`=?",
                    act.host,
                    act.container
                )
                .execute(&state.db)
                .await?;
                broadcast(
                    state,
                    IAction::DockerDeploymentsChanged(IDockerDeploymentsChanged {
                        changed: Default::default(),
                        removed: vec![IDockerDeploymentsChangedRemoved {
                            host: act.host,
                            name: act.container,
                        }],
                    }),
                )?;
            }
            IAction::ServiceDeployStart(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                deploy_service(state, self, act).await?;
            }
            IAction::ServiceRedeployStart(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                redploy_service(state, self, act).await?;
            }
            IAction::DockerListDeployments(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                list_deployments(state, self, act).await?;
            }
            IAction::DockerListDeploymentHistory(act) => {
                if !self.get_auth().docker_push {
                    self.close(403).await?;
                    return Ok(());
                };
                list_deployment_history(state, self, act).await?;
            }
            IAction::ModifiedFilesScan(_) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                modified_files::scan(state).await?;
            }
            IAction::ModifiedFilesList(act) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                modified_files::list(state, self, act).await?;
            }
            IAction::ModifiedFilesResolve(act) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                modified_files::resolve(state, self, act).await?;
            }
            IAction::DeployObject(act) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                // TODO is there a magic no object id
                if let Err(e) = deployment::deploy_object(state, act.id, act.redeploy).await {
                    alert_error(state, e, "Deployment::deployObject", Some(self)).await?;
                }
            }
            IAction::CancelDeployment(_) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                deployment::cancel(state).await?;
            }
            IAction::StartDeployment(_) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                if let Err(e) = deployment::start(state).await {
                    alert_error(state, e, "Deployment::start", Some(self)).await?;
                }
            }
            IAction::StopDeployment(_) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                deployment::stop(state).await?
            }
            IAction::ToggleDeploymentObject(act) => {
                if !self.get_auth().admin {
                    self.close(403).await?;
                    return Ok(());
                };
                deployment::toggle_object(state, act.index, act.enabled).await?;
            }
            _ => {
                warn!("Unhandled message {:?}", act)
            }
        }
        Ok(())
    }

    async fn handle_messages(
        self: &Arc<Self>,
        state: &Arc<State>,
        mut source: SplitStream<WebSocket>,
    ) -> Result<()> {
        // TODO we should timeout none authed clients quite quickly
        loop {
            let msg = match cancelable(&self.run_token, source.next()).await {
                Ok(Some(Ok(v))) => v,
                Ok(Some(Err(e))) => Err(e).context("Failure to read client message")?,
                Ok(None) => break,
                Err(_) => break
            };
            match msg {
                Message::Text(utf8_bytes) => {
                    let Ok(act) = serde_json::from_str(utf8_bytes.as_str()) else {
                        warn!("Invalid message from client {}", self.remote);
                        continue;
                    };
                    let act: IAction = act;
                    let s = self.clone();
                    let state = state.clone();

                    TaskBuilder::new("handle_message")
                        .shutdown_order(0)
                        .create(|rt| async move {
                        s.handle_message(&state, rt, act).await.with_context(|| format!("Error handeling message from {}", s.remote))
                    });
                }
                _ => (), // TODO Should we respond to ping?
            }
        }
        Ok(())
    }
}

async fn handle_webclient(websocket: WebSocket, state: Arc<State>, remote: String) -> Result<()> {
    let (sink, source) = websocket.split();
    let run_token = RunToken::new();
    let webclient = Arc::new(WebClient {
        remote,
        sink: TMutex::new(sink),
        auth: Default::default(),
        run_token
    });
    state
        .web_clients
        .lock()
        .unwrap()
        .insert(CmpRef(webclient.clone()));

    webclient.handle_messages(&state, source).await?;
    info!("Web client disconnected {}", webclient.remote);
    state.web_clients.lock().unwrap().remove(&CmpRef(webclient));

    Ok(())
}

pub fn broadcast(state: &State, msg: IAction) -> Result<()> {
    let msg = Arc::new(serde_json::to_string(&msg)?);
    for c in &*state.web_clients.lock().unwrap() {
        let c = (**c).clone();
        let msg = msg.clone();
        tokio::spawn(async move {
            if let Err(e) = c.send_message_str(&msg).await {
                error!("Failure broadcasting message to {}: {:?}", c.remote, e);
            }
        });
    }
    Ok(())
}

async fn sysadmin_handler(
    ws: WebSocketUpgrade,
    WState(state): WState<Arc<State>>,
    ClientIp(remote): ClientIp,
) -> Response {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_webclient(socket, state, remote).await {
            error!("Error in websocket connection: {:?}", e);
        }
    })
}

#[derive(Deserialize)]
struct StatusHandlerQuery {
    token: String,
}

async fn status_handler(
    WState(state): WState<Arc<State>>,
    query: Query<StatusHandlerQuery>,
) -> Result<Json<HashMap<String, bool>>, WebError> {
    let Some(st) = &state.config.status_token else {
        return Err(WebError::forbidden());
    };
    if !crypt::cost_time_compare(st.as_bytes(), query.token.as_bytes()) {
        return Err(WebError::forbidden());
    };
    let mut ans = HashMap::new();
    let rows = query!(
        "SELECT `id`, `name` FROM `objects` WHERE `type` = ? AND `newest`",
        HOST_ID
    )
    .fetch_all(&state.db)
    .await?;
    let hcs = state.host_clients.lock().unwrap();
    for row in rows {
        ans.insert(row.name, hcs.contains_key(&row.id));
    }
    Ok(Json(ans))
}

async fn metrics_handler(WState(state): WState<Arc<State>>) -> Result<Response, WebError> {
    let v = msg::get_count(&state).await?;
    Ok((
        [("Content-Type", "text/plain; version=0.0.4")],
        format!("simpleadmin_messages {}\n", v),
    )
        .into_response())
}

#[derive(Serialize)]
struct MessagesHandlerResult {
    count: u64,
}
async fn messages_handler(
    WState(state): WState<Arc<State>>,
) -> Result<Json<MessagesHandlerResult>, WebError> {
    let rows = query!(
        "SELECT `id` FROM `objects` WHERE `type` = ? AND `newest`",
        HOST_ID
    )
    .fetch_all(&state.db)
    .await?;
    let down_hosts = {
        let hc = state.host_clients.lock().unwrap();
        rows.into_iter().filter(|r| hc.contains_key(&r.id)).count()
    };
    let msg_cnt = msg::get_count(&state).await?;
    Ok(Json(MessagesHandlerResult {
        count: down_hosts as u64 + msg_cnt as u64,
    }))
}

pub async fn run_web_clients(state: Arc<State>, run_token: RunToken) -> Result<()> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 8182));

    use axum::routing::{any, get, post};
    let app = Router::new()
        .route("/sysadmin", any(sysadmin_handler))
        .route("/terminal", any(terminal::handler))
        .route("/status", get(status_handler))
        .route("/metrics", get(metrics_handler))
        .route("/messages", get(messages_handler))
        .route(
            "/docker/images/{project}",
            get(docker_web::images_handler),
        )
        .route("/usedImages", post(docker_web::used_images))
	.route("/setup.sh", get(setup::setup))
        .nest("/v2/", docker_web::docker_api_routes()?)
        .layer(axum::middleware::from_fn(request_logger))
        .with_state(state.clone());

    info!("Web server started on port 8182");
    let listener = TcpListener::bind(addr).await?;

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async move { run_token.cancelled().await })
    .await?;

    info!("Web server stopped");

    Ok(())
}
