use std::default;
use std::ffi::{CStr, CString};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{bail, Context, Error, Result};
use base64::engine::general_purpose;
use base64::Engine;
use bytes::Bytes;
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use http_body_util::Full;
use hyper::service::{service_fn, HttpService};
use hyper::upgrade::Upgraded;
use hyper::{server::conn::http1, Request};
use hyper::{Method, Response, StatusCode};
use hyper_tungstenite::HyperWebsocket;
use hyper_util::rt::TokioIo;
use itertools::Itertools;
use log::{error, info, warn};
use sadmin2::message::{AuthStatus, GenerateKeyRes, Message};
use tokio::net::TcpListener;
use tokio::sync::Mutex as TMutex;
use tokio_tasks::{cancelable, RunToken};
use tokio_tungstenite::tungstenite::Message as TMessage;
use tokio_tungstenite::WebSocketStream;

use crate::crt::Type;
use crate::db::Db;
use crate::docker::Docker;
use crate::get_auth::get_auth;

extern "C" {
    pub fn crypt_r(
        key: *const ::std::os::raw::c_char,
        salt: *const ::std::os::raw::c_char,
        data: *mut ::std::os::raw::c_char,
    ) -> *mut ::std::os::raw::c_char;
}

fn crypt(key: &str, salt: &str) -> Result<String> {
    let mut data = vec![0i8; 1024 * 256];
    let key = CString::new(key)?;
    let salt = CString::new(salt)?;
    let res = unsafe {
        let res = crypt_r(key.as_ptr(), salt.as_ptr(), data.as_mut_ptr());
        CStr::from_ptr(res)
    };
    Ok(res.to_str()?.to_string())
}

fn validate_password(provided: &str, expected: &str) -> Result<bool> {
    let mut data = vec![0i8; 1024 * 256];
    let provided = CString::new(provided)?;
    let expected = CString::new(expected)?;
    let res = unsafe {
        let res = crypt_r(provided.as_ptr(), expected.as_ptr(), data.as_mut_ptr());
        CStr::from_ptr(res)
    };
    Ok(res == expected.as_c_str())
}

// import * as crypto from "node:crypto";
// import * as http from "node:http";
// import * as url from "node:url";
// import * as bodyParser from "body-parser";
// import * as express from "express";
// import helmet from "helmet";
// import * as speakeasy from "speakeasy";
// import * as WebSocket from "ws";
// import { config } from "./config";
// import * as crt from "./crt";
// import * as crypt from "./crypt";
// import { docker } from "./docker";
// import { errorHandler } from "./error";
// import { type AuthInfo, getAuth, noAccess } from "./getAuth";
// import { db, deployment, hostClients, modifiedFiles, msg, webClients } from "./instances";
// import type { Job } from "./job";
// import { JobOwner } from "./jobowner";
// import { LogJob } from "./jobs/logJob";
// import { ShellJob } from "./jobs/shellJob";
// import setup from "./setup";
// import {
//     ACTION,
//     type IAction,
//     IAddLogLines,
//     type IAlert,
//     type IGenerateKeyRes,
//     type IObjectChanged,
//     type ISearchRes,
//     type ISetInitialState,
//     type ISetPageAction,
// } from "./shared/actions";
// import { getReferences } from "./shared/getReferences";
// import nullCheck from "./shared/nullCheck";
// import { PAGE_TYPE } from "./shared/state";
// import {
//     type Host,
//     IContains,
//     IDepends,
//     ISudoOn,
//     type IType,
//     IVariables,
//     TypePropType,
//     hostId,
//     rootId,
//     rootInstanceId,
//     typeId,
//     userId,
// } from "./shared/type";

// interface EWS extends express.Express {
//     ws(s: string, f: (ws: WebSocket, req: express.Request) => void): void;
// }

// function sleep(ms: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, ms));
// }

// export class WebClient extends JobOwner {
//     connection: WebSocket;
//     auth: AuthInfo;
//     logJobs: { [id: number]: Job } = {};
//     host: string;

//     constructor(socket: WebSocket, host: string) {
//         super();
//         this.auth = noAccess;
//         this.connection = socket;
//         this.host = host;
//         this.connection.on("close", () => this.onClose());
//         this.connection.on("message", (msg: string) =>
//             this.onMessage(msg).catch(errorHandler("WebClient::message", this)),
//         );
//         this.connection.on("error", (err) => {
//             console.warn("Web client error", { err });
//         });
//     }

//     onClose() {
//         this.kill();
//         webClients.webclients.delete(this);
//     }

//     sendMessage(obj: IAction) {
//         this.connection.send(JSON.stringify(obj), (err?: Error) => {
//             if (err) {
//                 if (Object.getOwnPropertyNames(err).length !== 0)
//                     console.warn("Web client error sending message", { err, host: this.host });
//                 this.connection.terminate();
//                 this.onClose();
//             }
//         });
//     }
// }

// async function sendInitialState(c: WebClient) {
//     const rows = db.getAllObjectsFull();
//     const msgs = msg.getResent();

//     const hostsUp: number[] = [];
//     for (const id in hostClients.hostClients) hostsUp.push(+id);

//     const action: ISetInitialState = {
//         type: ACTION.SetInitialState,
//         objectNamesAndIds: {},
//         messages: await msgs,
//         deploymentObjects: deployment.getView(),
//         deploymentStatus: deployment.status,
//         deploymentMessage: deployment.message || "",
//         deploymentLog: deployment.log,
//         hostsUp,
//         types: {},
//         usedBy: [],
//     };
//     for (const row of await rows) {
//         const content = JSON.parse(row.content);
//         if (row.type === typeId) {
//             action.types[row.id] = {
//                 id: row.id,
//                 type: row.type,
//                 name: row.name,
//                 category: row.category,
//                 content: content as IType,
//                 version: row.version,
//                 comment: row.comment,
//                 time: row.time,
//                 author: row.author,
//             };
//         }
//         if (!(row.type in action.objectNamesAndIds)) action.objectNamesAndIds[row.type] = [];
//         action.objectNamesAndIds[row.type].push({
//             type: row.type,
//             id: row.id,
//             name: row.name,
//             category: row.category,
//             comment: row.comment,
//         });
//         for (const o of getReferences(content)) {
//             action.usedBy.push([o, row.id]);
//         }
//     }

//     const m: { [key: string]: number } = {};
//     for (const id in action) {
//         const x = JSON.stringify((action as any)[id]);
//         if (x) m[id] = x.length;
//     }
//     console.log("Send initial state", m);
//     c.sendMessage(action);
// }

struct WebClient {
    host: String,
    sink: TMutex<SplitSink<WebSocketStream<TokioIo<Upgraded>>, TMessage>>,
    db: Arc<Db>,
    docker: Arc<Docker>,
    auth: Mutex<AuthStatus>,
}

impl WebClient {
    fn new(
        db: Arc<Db>,
        docker: Arc<Docker>,
        host: String,
        sink: SplitSink<WebSocketStream<TokioIo<Upgraded>>, TMessage>,
    ) -> Self {
        Self {
            host,
            sink: TMutex::new(sink),
            db,
            docker,
            auth: Mutex::new(Default::default()),
        }
    }

    async fn send_message(&self, obj: &Message) -> Result<()> {
        let msg = serde_json::to_string(&obj)?;
        let mut sink = self.sink.lock().await;
        if let Err(e) = sink.send(TMessage::Text(msg)).await {
            warn!("Web client error sending message to {}: {}", self.host, e);
            sink.close().await?;
            //         this.onClose();
        }
        Ok(())
    }

    async fn send_auth_status(&self, sid: String) -> Result<()> {
        info!("A");
        let auth = get_auth(&self.db, Some(&self.host), Some(&sid)).await;
        info!("B {:?}", auth);
        let auth = auth?;
        *self.auth.lock().unwrap() = auth.clone();
        info!("send_auth_status {:?}", auth);
        self.send_message(&Message::AuthStatus(AuthStatus {
            message: None,
            ..auth
        }))
        .await?;
        Ok(())
    }

    async fn handle_message(self: &Arc<Self>, message: TMessage) -> Result<()> {
        let text = message.to_text()?;
        let msg: Message = serde_json::from_str(text)?;

        match msg {
            Message::RequestAuthStatus { session } => {
                info!(
                    "Auth status {} {:?}",
                    self.host,
                    self.auth.lock().unwrap().user
                );
                self.send_auth_status(session).await?;
            }
            Message::AuthStatus(auth_status) => todo!(),
            Message::Login { user, pwd, otp } => {
                let session = self.auth.lock().unwrap().session.clone();
                let auth = if let Some(session) = &session {
                    get_auth(&self.db, Some(&self.host), Some(session)).await?
                } else {
                    Default::default()
                };

                let mut found = false;
                let mut new_otp = false;
                let mut otp_correct = auth.otp;
                let mut pwd_correct = auth.pwd;

                //                 if (config.users) {
                //                     for (const u of config.users) {
                //                         if (u.name === act.user) {
                //                             found = true;
                //                             if (u.password === act.pwd) {
                //                                 otp = true;
                //                                 pwd = true;
                //                                 newOtp = true;
                //                                 break;
                //                             }
                //                         }
                //                     }
                //                 }

                if !found {
                    let content = self.db.get_user_content(&user)?;
                    if let Some(content) = content {
                        found = true;
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        pwd_correct = validate_password(&pwd, &content.password)?;
                        if let Some(otp) = otp {
                            let otp_secret =
                                general_purpose::STANDARD.decode(&content.otp_base32)?;
                            let totp = totp_rs::Rfc6238::with_defaults(otp_secret)?;
                            let totp = totp_rs::TOTP::from_rfc6238(totp)?;
                            otp_correct = totp.check_current(&otp)?;
                            new_otp = true;
                        }
                    }
                }

                if !found {
                    *self.auth.lock().unwrap() = Default::default();
                    self.send_message(&Message::AuthStatus(AuthStatus {
                        session,
                        user: Some(user),
                        message: Some("Invalid user name".to_string()),
                        ..Default::default()
                    }))
                    .await?;
                } else if !pwd_correct || !otp_correct {
                    let session = if otp_correct && new_otp {
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .context("Bad unix time")?
                            .as_secs();
                        if let Some(session) = session {
                            self.db.run(
                                "UPDATE `sessions` SET `otp`=? WHERE `sid`=?",
                                (now, &session),
                            )?;
                            Some(session)
                        } else {
                            let mut session_bytes = [0; 64];
                            getrandom::getrandom(&mut session_bytes)?;
                            let session = hex::encode(&session_bytes);
                            self.db.run(
                                "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, null, ?, ?)",
                                (&user,
                                &self.host,
                                now,
                                &session,
                                )
                            )?;
                            Some(session)
                        }
                    } else {
                        session
                    };

                    *self.auth.lock().unwrap() = AuthStatus {
                        session: session.clone(),
                        otp: otp_correct,
                        //user: Some(user),
                        ..Default::default()
                    };

                    self.send_message(&Message::AuthStatus(AuthStatus {
                        otp: otp_correct,
                        session,
                        user: Some(user),
                        message: Some("Invalid password or one time password".to_string()),
                        ..Default::default()
                    }))
                    .await?;
                } else {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .context("Bad unix time")?
                        .as_secs();
                    let session = if let Some(session) = session {
                        if new_otp {
                            self.db.run(
                                "UPDATE `sessions` SET `pwd`=?, `otp`=? WHERE `sid`=?",
                                (now, now, &session),
                            )?;
                        } else {
                            self.db.run(
                                "UPDATE `sessions` SET `pwd`=? WHERE `sid`=?",
                                (now, &session),
                            )?;
                        }
                        session
                    } else {
                        let mut session_bytes = [0; 64];
                        getrandom::getrandom(&mut session_bytes)?;
                        let session = hex::encode(&session_bytes);

                        self.db.run(
                            "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)",
                            (user,
                            &self.host,
                            now,
                            now,
                            &session,
                            )
                        )?;
                        session
                    };

                    let auth = get_auth(&self.db, Some(&self.host), Some(&session)).await?;
                    *self.auth.lock().unwrap() = auth.clone();
                    if !auth.auth {
                        bail!("Internal auth error");
                    }
                    self.send_message(&Message::AuthStatus(auth)).await?;
                }
            }
            Message::GenerateKey {
                r#ref,
                ssh_public_key,
            } => {
                let (ssl_name, auth_days, user) = {
                    let auth = self.auth.lock().unwrap();
                    (auth.sslname.clone(), auth.auth_days, auth.user.clone())
                };
                let Some(ssl_name) = ssl_name else {
                    self.sink.lock().await.close().await?;
                    return Ok(());
                };
                info!("10");
                let (_uname, rem) = ssl_name.split_once('.').context("Bad ssl_name")?;
                let (_uid, mut caps) = if let Some((_uid, caps_string)) = rem.split_once('.') {
                    (_uid, caps_string.split('~'))
                } else {
                    (rem, "".split('~'))
                };

                let (ca_key, ca_crt) = self.docker.ensure_ca_key_crt(&self.db).await?;
                info!("20");

                let my_key = crate::crt::generate_key().await?;
                let my_srs =
                    crate::crt::generate_srs(&my_key, &format!("{}.user", ssl_name)).await?;
                let my_crt = crate::crt::generate_crt(
                    &ca_key,
                    &ca_crt,
                    &my_srs,
                    &[],
                    auth_days.unwrap_or(1),
                )
                .await?;

                info!("30");

                let mut res = GenerateKeyRes {
                    r#ref: r#ref,
                    key: my_srs,
                    crt: my_crt,
                    ca_pem: ca_crt,
                    ssh_host_ca: None,
                    ssh_crt: None,
                };

                info!("40");

                if caps.contains(&"ssh") {
                    if let Some(ssh_public_key) = &ssh_public_key {
                        info!("45");
                        let root_vars =
                            self.db.get_root_valiabels().context("get_root_valiabels")?;

                        if let (Some(ssh_host_ca_key), Some(ssh_host_ca_pub), Some(user)) = (
                            root_vars.get("sshHostCaPub"),
                            root_vars.get("sshHostCaKey"),
                            &user,
                        ) {
                            info!("50");
                            let ssh_crt = crate::crt::generate_ssh_crt(
                                &format!("{} sadmin user", user),
                                &user,
                                ssh_host_ca_key,
                                ssh_public_key,
                                1,
                                Type::User,
                            )
                            .await
                            .context("generate_ssh_crt")?;
                            info!("60");
                            res.ssh_host_ca = Some(ssh_host_ca_pub.clone());
                            info!("61");
                            res.ssh_crt = Some(ssh_crt);
                            info!("65");
                        }
                        info!("66");
                    }
                    info!("67");
                }
                info!("70");
                self.send_message(&Message::GenerateKeyRes(res))
                    .await
                    .context("Send message")?;
            }
            Message::GenerateKeyRes(generate_key_res) => todo!(),
            Message::DockerListImageByHash { r#ref, hash } => todo!(),
            Message::DockerListImageTags { r#ref } => todo!(),
            Message::DockerListImageTagsRes(docker_list_image_tags_res) => todo!(),
            Message::DockerListImageByHashRes(docker_list_image_by_hash_res) => todo!(),
            Message::LogOut(log_out) => todo!(),
            Message::RequestInitialState {} => todo!(),
            Message::SetInitialState(state) => todo!(),
            Message::DockerListDeployments { r#ref, host, image } => todo!(),
            Message::DockerListDeploymentHistory { r#ref, host, name } => todo!(),
            Message::DockerListDeploymentsRes { r#ref, deployments } => todo!(),
            Message::DockerListDeploymentHistoryRes { r#ref, deployments } => todo!(),
            Message::DockerDeployStart(docker_deploy_start) => todo!(),
            Message::ServiceDeployStart(service_deploy_start) => todo!(),
            Message::ServiceRedeployStart(service_redeploy_start) => todo!(),
            Message::DockerDeployLog { r#ref, message } => todo!(),
            Message::DockerDeployEnd {
                r#ref,
                message,
                status,
            } => todo!(),
            Message::DockerListImageTagsChanged { removed, changed } => todo!(),
            Message::HostDown { id } => todo!(),
            Message::HostUp { id } => todo!(),
            Message::Alert { message, title } => todo!(),
            Message::ModifiedFilesChanged { scanning, full } => todo!(),
            Message::AddDeploymentLog => todo!(),
            Message::AddLogLines => todo!(),
            Message::AddMessage => todo!(),
            Message::CancelDeployment => todo!(),
            Message::ClearDeploymentLog => todo!(),
            Message::DeleteObject => todo!(),
            Message::DeployObject => todo!(),
            Message::DockerContainerForget => todo!(),
            Message::DockerContainerRemove => todo!(),
            Message::DockerContainerStart => todo!(),
            Message::DockerContainerStop => todo!(),
            Message::DockerDeploymentsChanged => todo!(),
            Message::DockerImageSetPin => todo!(),
            Message::DockerImageTagSetPin => todo!(),
            Message::DockerListImageTagHistory => todo!(),
            Message::DockerListImageTagHistoryRes => todo!(),
            Message::EndLog => todo!(),
            Message::FetchObject => todo!(),
            Message::GetObjectHistory => todo!(),
            Message::GetObjectHistoryRes => todo!(),
            Message::GetObjectId => todo!(),
            Message::GetObjectIdRes => todo!(),
            Message::ListModifiedFiles => todo!(),
            Message::MessageTextRep => todo!(),
            Message::MessageTextReq => todo!(),
            Message::ModifiedFilesList => todo!(),
            Message::ModifiedFilesResolve => todo!(),
            Message::ModifiedFilesScan => todo!(),
            Message::ObjectChanged => todo!(),
            Message::ResetServerState => todo!(),
            Message::SaveObject => todo!(),
            Message::Search => todo!(),
            Message::SearchRes => todo!(),
            Message::SetDeploymentMessage => todo!(),
            Message::SetDeploymentObjects => todo!(),
            Message::SetDeploymentObjectStatus => todo!(),
            Message::SetDeploymentStatus => todo!(),
            Message::SetMessageDismissed => todo!(),
            Message::SetPage => todo!(),
            Message::StartDeployment => todo!(),
            Message::StartLog => todo!(),
            Message::StatValueChanges => todo!(),
            Message::StopDeployment => todo!(),
            Message::SubscribeStatValues => todo!(),
            Message::ToggleDeploymentObject => todo!(),
            Message::UpdateStatus => todo!(),
        }

        //     async onMessage(str: string) {
        //         const act = JSON.parse(str) as IAction;

        //         switch (act.type) {
        //             case ACTION.RequestAuthStatus:

        //             case ACTION.Login: {
        //                 let session = this.auth.session;
        //                 const auth = session ? await getAuth(this.host, session) : noAccess;
        //                 let found = false;
        //                 let newOtp = false;
        //                 let otp = auth?.otp;
        //                 let pwd = auth?.pwd;

        //                 if (config.users) {
        //                     for (const u of config.users) {
        //                         if (u.name === act.user) {
        //                             found = true;
        //                             if (u.password === act.pwd) {
        //                                 otp = true;
        //                                 pwd = true;
        //                                 newOtp = true;
        //                                 break;
        //                             }
        //                         }
        //                     }
        //                 }

        //                 if (!found) {
        //                     try {
        //                         const contentStr = await db.getUserContent(act.user);
        //                         if (contentStr) {
        //                             const content = JSON.parse(contentStr);
        //                             found = true;
        //                             await sleep(1000);
        //                             pwd = await crypt.validate(act.pwd, content.password);
        //                             if (act.otp) {
        //                                 otp = speakeasy.totp.verify({
        //                                     secret: content.otp_base32,
        //                                     encoding: "base32",
        //                                     token: act.otp,
        //                                     window: 1,
        //                                 });
        //                                 newOtp = true;
        //                             }
        //                         }
        //                     } catch (e) {}
        //                 }
        //                 if (!found) {
        //                     this.sendMessage({
        //                         type: ACTION.AuthStatus,
        //                         pwd: false,
        //                         otp: false,
        //                         session: session,
        //                         user: act.user,
        //                         auth: false,
        //                         admin: false,
        //                         dockerPull: false,
        //                         dockerPush: false,
        //                         message: "Invalid user name",
        //                     });
        //                     this.auth = noAccess;
        //                 } else if (!pwd || !otp) {
        //                     if (otp && newOtp) {
        //                         const now = (Date.now() / 1000) | 0;
        //                         if (session) {
        //                             await db.run(
        //                                 "UPDATE `sessions` SET `otp`=? WHERE `sid`=?",
        //                                 now,
        //                                 session,
        //                             );
        //                         } else {
        //                             session = crypto.randomBytes(64).toString("hex");
        //                             await db.run(
        //                                 "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)",
        //                                 act.user,
        //                                 this.host,
        //                                 null,
        //                                 now,
        //                                 session,
        //                             );
        //                         }
        //                     }
        //                     this.sendMessage({
        //                         type: ACTION.AuthStatus,
        //                         pwd: false,
        //                         otp,
        //                         session: session,
        //                         user: act.user,
        //                         auth: false,
        //                         admin: false,
        //                         dockerPull: false,
        //                         dockerPush: false,
        //                         message: "Invalid password or one time password",
        //                     });
        //                     this.auth = {
        //                         ...noAccess,
        //                         session,
        //                         otp,
        //                     };
        //                 } else {
        //                     const now = (Date.now() / 1000) | 0;
        //                     if (session && newOtp) {
        //                         await db.run(
        //                             "UPDATE `sessions` SET `pwd`=?, `otp`=? WHERE `sid`=?",
        //                             now,
        //                             now,
        //                             session,
        //                         );
        //                     } else if (session) {
        //                         const eff = await db.run(
        //                             "UPDATE `sessions` SET `pwd`=? WHERE `sid`=?",
        //                             now,
        //                             session,
        //                         );
        //                     } else {
        //                         session = crypto.randomBytes(64).toString("hex");
        //                         await db.run(
        //                             "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)",
        //                             act.user,
        //                             this.host,
        //                             now,
        //                             now,
        //                             session,
        //                         );
        //                     }
        //                     this.auth = await getAuth(this.host, session);
        //                     if (!this.auth.auth) throw Error("Internal auth error");
        //                     this.sendMessage({ type: ACTION.AuthStatus, message: null, ...this.auth });
        //                 }
        //                 break;
        //             }
        //             case ACTION.RequestInitialState:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await sendInitialState(this);
        //                 break;
        //             case ACTION.Logout:
        //                 if (!this.auth.auth) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 console.log(
        //                     "logout",
        //                     this.host,
        //                     this.auth.user,
        //                     this.auth.session,
        //                     act.forgetPwd,
        //                     act.forgetOtp,
        //                 );
        //                 if (act.forgetPwd)
        //                     await db.run(
        //                         "UPDATE `sessions` SET `pwd`=null WHERE `sid`=?",
        //                         this.auth.session,
        //                     );
        //                 if (act.forgetOtp) {
        //                     await db.run(
        //                         "UPDATE `sessions` SET `otp`=null WHERE `sid`=?",
        //                         this.auth.session,
        //                     );
        //                     this.auth = noAccess;
        //                 }
        //                 this.sendAuthStatus(this.auth.session);
        //                 break;
        //             case ACTION.FetchObject: {
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 const rows = await db.getObjectByID(act.id);
        //                 const res: IObjectChanged = { type: ACTION.ObjectChanged, id: act.id, object: [] };
        //                 for (const row of rows) {
        //                     res.object.push({
        //                         id: act.id,
        //                         version: row.version,
        //                         type: row.type,
        //                         name: row.name,
        //                         content: JSON.parse(row.content),
        //                         category: row.category,
        //                         comment: row.comment,
        //                         time: row.time,
        //                         author: row.author,
        //                     });
        //                 }
        //                 this.sendMessage(res);
        //                 break;
        //             }
        //             case ACTION.GetObjectId: {
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 let id = null;
        //                 try {
        //                     const parts = act.path.split("/", 2);
        //                     if (parts.length !== 2) break;
        //                     const typeRow = await db.get(
        //                         "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1",
        //                         typeId,
        //                         parts[0],
        //                     );
        //                     if (!typeRow || !typeRow.id) break;
        //                     const objectRow = await db.get(
        //                         "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1",
        //                         typeRow.id,
        //                         parts[1],
        //                     );
        //                     if (objectRow) id = objectRow.id;
        //                 } finally {
        //                     this.sendMessage({ type: ACTION.GetObjectIdRes, ref: act.ref, id });
        //                 }
        //                 break;
        //             }
        //             case ACTION.GetObjectHistory: {
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 const history: {
        //                     version: number;
        //                     time: number;
        //                     author: string | null;
        //                 }[] = [];
        //                 for (const row of await db.all(
        //                     "SELECT `version`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
        //                     act.id,
        //                 )) {
        //                     history.push({ version: row.version, time: row.time, author: row.author });
        //                 }
        //                 this.sendMessage({
        //                     type: ACTION.GetObjectHistoryRes,
        //                     ref: act.ref,
        //                     history,
        //                     id: act.id,
        //                 });
        //                 break;
        //             }
        //             case ACTION.StartLog:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 if (act.host in hostClients.hostClients) {
        //                     new LogJob(
        //                         hostClients.hostClients[act.host],
        //                         this,
        //                         act.id,
        //                         act.logtype,
        //                         act.unit,
        //                     );
        //                 }
        //                 break;
        //             case ACTION.EndLog:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 if (act.id in this.logJobs) this.logJobs[act.id].kill();
        //                 break;
        //             case ACTION.SetMessagesDismissed:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await msg.setDismissed(act.ids, act.dismissed);
        //                 break;
        //             case ACTION.MessageTextReq:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 {
        //                     const row = await msg.getFullText(act.id);
        //                     this.sendMessage({
        //                         type: ACTION.MessageTextRep,
        //                         id: act.id,
        //                         message: row ? row.message : "missing",
        //                     });
        //                 }
        //                 break;
        //             case ACTION.SaveObject:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 {
        //                     // HACK HACK HACK crypt passwords that does not start with $6$, we belive we have allready bcrypt'ed it
        //                     if (!act.obj) throw Error("Missing object in action");
        //                     const c = act.obj.content;
        //                     const typeRow = await db.getNewestObjectByID(act.obj.type);
        //                     const type = JSON.parse(typeRow.content) as IType;
        //                     for (const r of type.content || []) {
        //                         if (r.type !== TypePropType.password) continue;
        //                         if (!(r.name in c) || c[r.name].startsWith("$6$")) continue;
        //                         c[r.name] = await crypt.hash(c[r.name]);
        //                     }

        //                     if (act.obj.type === userId && (!c.otp_base32 || !c.otp_url)) {
        //                         const secret = speakeasy.generateSecret({
        //                             name: `Simple Admin:${act.obj.name}`,
        //                         });
        //                         c.otp_base32 = secret.base32;
        //                         c.otp_url = secret.otpauth_url;
        //                     }

        //                     const { id, version } = await db.changeObject(
        //                         act.id,
        //                         act.obj,
        //                         nullCheck(this.auth.user),
        //                     );
        //                     act.obj.version = version;
        //                     const res2: IObjectChanged = {
        //                         type: ACTION.ObjectChanged,
        //                         id: id,
        //                         object: [act.obj],
        //                     };
        //                     webClients.broadcast(res2);
        //                     const res3: ISetPageAction = {
        //                         type: ACTION.SetPage,
        //                         page: { type: PAGE_TYPE.Object, objectType: act.obj.type, id, version },
        //                     };
        //                     this.sendMessage(res3);
        //                 }
        //                 break;
        //             case ACTION.Search: {
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 const objects: {
        //                     type: number;
        //                     id: number;
        //                     version: number;
        //                     name: string;
        //                     comment: string;
        //                     content: string;
        //                 }[] = [];
        //                 for (const row of await db.all(
        //                     "SELECT `id`, `version`, `type`, `name`, `content`, `comment` FROM `objects` WHERE (`name` LIKE ? OR `content` LIKE ? OR `comment` LIKE ?) AND `newest`=1",
        //                     act.pattern,
        //                     act.pattern,
        //                     act.pattern,
        //                 )) {
        //                     objects.push({
        //                         id: row.id,
        //                         type: row.type,
        //                         name: row.name,
        //                         content: row.content,
        //                         comment: row.comment,
        //                         version: row.version,
        //                     });
        //                 }
        //                 const res4: ISearchRes = {
        //                     type: ACTION.SearchRes,
        //                     ref: act.ref,
        //                     objects,
        //                 };
        //                 this.sendMessage(res4);
        //                 break;
        //             }
        //             case ACTION.ResetServerState:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await db.resetServer(act.host);
        //                 break;
        //             case ACTION.DeleteObject:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 {
        //                     const objects = await db.getAllObjectsFull();
        //                     const conflicts: string[] = [];
        //                     for (const object of objects) {
        //                         const content = JSON.parse(object.content);
        //                         if (!content) continue;
        //                         if (object.type === act.id)
        //                             conflicts.push(`* ${object.name} (${object.type}) type`);
        //                         for (const val of ["sudoOn", "depends", "contains"]) {
        //                             if (!(val in content)) continue;
        //                             for (const id of content[val] as number[]) {
        //                                 if (id !== act.id) continue;
        //                                 conflicts.push(`* ${object.name} (${object.type}) ${val}`);
        //                             }
        //                         }
        //                     }
        //                     if (conflicts.length > 0) {
        //                         const res: IAlert = {
        //                             type: ACTION.Alert,
        //                             title: "Cannot delete object",
        //                             message: `The object can not be delete as it is in use by:\n${conflicts.join("\n")}`,
        //                         };
        //                         this.sendMessage(res);
        //                     } else {
        //                         console.log("Web client delete object", { id: act.id });
        //                         await db.changeObject(act.id, null, nullCheck(this.auth.user));
        //                         const res2: IObjectChanged = {
        //                             type: ACTION.ObjectChanged,
        //                             id: act.id,
        //                             object: [],
        //                         };
        //                         webClients.broadcast(res2);
        //                         const res3: ISetPageAction = {
        //                             type: ACTION.SetPage,
        //                             page: { type: PAGE_TYPE.Dashbord },
        //                         };
        //                         this.sendMessage(res3);
        //                     }
        //                     break;
        //                 }
        //             case ACTION.DeployObject:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 deployment
        //                     .deployObject(act.id, act.redeploy)
        //                     .catch(errorHandler("Deployment::deployObject", this));
        //                 break;
        //             case ACTION.CancelDeployment:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 deployment.cancel();
        //                 break;
        //             case ACTION.StartDeployment:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await deployment.start().catch(errorHandler("Deployment::start", this));
        //                 break;
        //             case ACTION.StopDeployment:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await deployment.stop();
        //                 break;
        //             case ACTION.ToggleDeploymentObject:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await deployment.toggleObject(act.index, act.enabled);
        //                 break;
        //             case ACTION.ServiceDeployStart:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.deployService(this, act);
        //                 break;
        //             case ACTION.ServiceRedeployStart:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.redeployService(this, act);
        //                 break;
        //             case ACTION.DockerListDeployments:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.listDeployments(this, act);
        //                 break;
        //             case ACTION.DockerListImageByHash:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.listImageByHash(this, act);
        //                 break;
        //             case ACTION.DockerListImageTags:
        //                 if (!this.auth.dockerPull) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.listImageTags(this, act);
        //                 break;
        //             case ACTION.DockerImageSetPin:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.imageSetPin(this, act);
        //                 break;
        //             case ACTION.DockerImageTagSetPin:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.imageTagSetPin(this, act);
        //                 break;
        //             case ACTION.DockerListDeploymentHistory:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.listDeploymentHistory(this, act);
        //                 break;
        //             case ACTION.DockerListImageTagHistory:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.listImageTagHistory(this, act);
        //                 break;
        //             case ACTION.DockerContainerForget:
        //                 if (!this.auth.dockerPush) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await docker.forgetContainer(this, act.host, act.container);
        //                 break;
        //             case ACTION.ModifiedFilesScan:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await modifiedFiles.scan(this, act);
        //                 break;
        //             case ACTION.ModifiedFilesList:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await modifiedFiles.list(this, act);
        //                 break;
        //             case ACTION.ModifiedFilesResolve:
        //                 if (!this.auth.admin) {
        //                     this.connection.close(403);
        //                     return;
        //                 }
        //                 await modifiedFiles.resolve(this, act);
        //                 break;
        //             case ACTION.GenerateKey: {

        //             }
        //             default:
        //                 console.warn("Web client unknown message", { act });
        //         }
        //     }
        Ok(())
    }

    async fn handle_messages(
        self: Arc<Self>,
        rt: RunToken,
        mut source: SplitStream<WebSocketStream<TokioIo<Upgraded>>>,
    ) -> Result<()> {
        loop {
            let message = match cancelable(&rt, source.next()).await {
                Ok(Some(v)) => v?,
                Ok(None) | Err(_) => break,
            };
            if let Err(e) = self.handle_message(message).await {
                error!("Error in handle message {:?}", e);
            }
        }
        Ok(())
    }
}

// export class WebClients {
//     httpApp = express();
//     webclients = new Set<WebClient>();
//     httpServer: http.Server;
//     wss: WebSocket.Server;

//     broadcast(act: IAction) {
//         for (const client of this.webclients) {
//             if (client.auth.admin) client.sendMessage(act);
//         }
//     }

//     async countMessages(req: express.Request, res: express.Response) {
//         let downHosts = 0;
//         for (const row of await db.all(
//             "SELECT `id`, `name`, `content` FROM `objects` WHERE `type` = ? AND `newest`=1",
//             hostId,
//         )) {
//             if (hostClients.hostClients[row.id]?.auth || !row.content) continue;
//             const content: Host = JSON.parse(row.content);
//             if (content.messageOnDown) downHosts += 1;
//         }

//         res.header("Content-Type", "application/json; charset=utf-8")
//             .json({ count: downHosts + (await msg.getCount()) })
//             .end();
//     }

//     async status(req: express.Request, res: express.Response) {
//         const token = req.query.token;
//         if (!token || token !== config.statusToken) {
//             res.status(403).end();
//             return;
//         }
//         const ans: { [key: string]: boolean } = {};
//         for (const row of await db.all(
//             "SELECT `id`, `name` FROM `objects` WHERE `type` = ? AND `newest`=1",
//             hostId,
//         )) {
//             ans[row.name] = hostClients.hostClients[row.id]?.auth || false;
//         }
//         res.header("Content-Type", "application/json; charset=utf-8").json(ans).end();
//     }

//     async metrics(req: express.Request, res: express.Response) {
//         res.header("Content-Type", "text/plain; version=0.0.4")
//             .send(`simpleadmin_messages ${await msg.getCount()}\n`)
//             .end();
//     }

fn make_response(message: impl Into<Bytes>, status: StatusCode) -> Response<Full<Bytes>> {
    let mut res = Response::new(Full::new(message.into()));
    *res.status_mut() = status;
    res
}

async fn handle_webclient(
    websocket: HyperWebsocket,
    db: Arc<Db>,
    docker: Arc<Docker>,
    remote: String,
    rt: RunToken,
) -> Result<()> {
    let websocket = match cancelable(&rt, websocket).await {
        Ok(v) => v?,
        Err(_) => return Ok(()),
    };
    let (sink, source) = websocket.split();
    let webclient = Arc::new(WebClient::new(db, docker, remote, sink));
    webclient.handle_messages(rt, source).await?;
    Ok(())
}

async fn handle_request(
    mut req: Request<hyper::body::Incoming>,
    db: Arc<Db>,
    docker: Arc<Docker>,
    address: SocketAddr,
    rt: RunToken,
) -> Result<Response<Full<Bytes>>> {
    let remote = if let Some(xf) = req.headers().get("X-Forwarded-For") {
        xf.to_str()?.to_owned()
    } else {
        address.ip().to_string()
    };
    info!("Got request from {} {} {}", remote, req.method(), req.uri());
    if hyper_tungstenite::is_upgrade_request(&req) {
        match req.uri().path() {
            "/sysadmin" => {
                let db = db.clone();
                let docker = docker.clone();
                let (response, websocket) = hyper_tungstenite::upgrade(&mut req, None)?;
                tokio_tasks::TaskBuilder::new("websocket_connection")
                    .shutdown_order(1)
                    .create(|rt| async move {
                        //                 const wc = new WebClient(ws, address);
                        //                 this.webclients.add(wc);

                        if let Err(e) = handle_webclient(websocket, db, docker, remote, rt).await {
                            eprintln!("Error in websocket connection: {e}");
                        }
                        Ok::<_, Error>(())
                    });
                return Ok(response);
            }
            "/terminal" => {
                //                 const server = +u.query!.server!;
                //                 const cols = +u.query!.cols!;
                //                 const rows = +u.query!.rows!;
                //                 const session = u.query.session as string;
                //                 getAuth(address, session)
                //                     .then((a: any) => {
                //                         if (a.auth && server in hostClients.hostClients)
                //                             new ShellJob(hostClients.hostClients[server], ws, cols, rows);
                //                         else ws.close();
                //                     })
                //                     .catch(() => {
                //                         ws.close();
                //                     });
                todo!()
            }
            _ => {
                return Ok(make_response("forbidden", StatusCode::FORBIDDEN));
            }
        }
    }

    let part = req.uri().path();
    if part == "/setup.sh" && req.method() == Method::GET {
        info!("SETUP");
    }

    //     constructor() {
    //         this.httpApp.use(helmet());
    //         this.httpServer = http.createServer(this.httpApp);
    //         this.wss = new WebSocket.Server({ server: this.httpServer });
    //         this.httpApp.get("/setup.sh", (req, res) => setup(req, res));
    //         this.httpApp.get("/v2/*", docker.get.bind(docker));
    //         this.httpApp.put("/v2/*", docker.put.bind(docker));
    //         this.httpApp.post("/v2/*", docker.post.bind(docker));
    //         this.httpApp.delete("/v2/*", docker.delete.bind(docker));
    //         this.httpApp.patch("/v2/*", docker.patch.bind(docker));
    //         this.httpApp.get("/docker/*", docker.images.bind(docker));
    //         this.httpApp.post("/usedImages", bodyParser.json(), docker.usedImages.bind(docker));
    //         this.httpApp.get("/messages", this.countMessages.bind(this));
    //         this.httpApp.get("/status", this.status.bind(this));
    //         this.httpApp.get("/metrics", this.metrics.bind(this));

    //     }

    Ok(Response::new(Full::new(Bytes::from("Hello, World!\n"))))
}

pub async fn run(run_token: RunToken, db: Arc<Db>, docker: Arc<Docker>) -> Result<()> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 8182));
    let listener = TcpListener::bind(addr).await?;

    loop {
        let (stream, _) = match cancelable(&run_token, listener.accept()).await {
            Ok(v) => v?,
            Err(_) => break,
        };

        let mut http = hyper::server::conn::http1::Builder::new();
        http.keep_alive(true);

        let address = stream.peer_addr()?;
        let io = TokioIo::new(stream);

        let db = db.clone();
        let docker = docker.clone();
        tokio_tasks::TaskBuilder::new("web_connection")
            .shutdown_order(1)
            .create(|rt| async move {
                let rt = &rt;
                let db = &db;
                let docker = &docker;
                if let Err(err) = http1::Builder::new()
                    .keep_alive(true)
                    .serve_connection(
                        io,
                        service_fn(|req| {
                            let rt = rt.clone();
                            let db = db.clone();
                            let docker = docker.clone();
                            async move { handle_request(req, db, docker, address, rt).await }
                        }),
                    )
                    .with_upgrades()
                    .await
                {
                    warn!("Error serving connection: {:?}", err);
                }
                Ok::<(), Error>(())
            });
    }

    Ok(())
}
