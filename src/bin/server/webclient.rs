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
use sadmin2::message::{AuthStatus, DockerListImageByHashRes, DockerListImageTagsRes, GenerateKeyRes, LogOut, Message, State, StateNameAndId};
use tokio::net::TcpListener;
use tokio::sync::Mutex as TMutex;
use tokio_tasks::{cancelable, RunToken};
use tokio_tungstenite::tungstenite::Message as TMessage;
use tokio_tungstenite::WebSocketStream;

use crate::config::{self, Config};
use crate::crt::Type;
use crate::db::Db;
use crate::docker::Docker;
use crate::get_auth::get_auth;
use crate::msg::{msg_get_full_text, msg_get_resent, msg_set_dismissed};
use sadmin2::r#type::{IObject, IType, TYPE_ID};

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

struct WebClient {
    host: String,
    sink: TMutex<SplitSink<WebSocketStream<TokioIo<Upgraded>>, TMessage>>,
    db: Arc<Db>,
    docker: Arc<Docker>,
    config: &'static Config,
    auth: Mutex<AuthStatus>,
}

impl WebClient {
    fn new(
        db: Arc<Db>,
        docker: Arc<Docker>,
        config: &'static Config,
        host: String,
        sink: SplitSink<WebSocketStream<TokioIo<Upgraded>>, TMessage>,
    ) -> Self {
        Self {
            host,
            sink: TMutex::new(sink),
            db,
            docker,
            config,
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
        let auth = get_auth(&self.db, self.config, Some(&self.host), Some(&sid)).await;
        let auth = auth?;
        *self.auth.lock().unwrap() = auth.clone();
        self.send_message(&Message::AuthStatus(AuthStatus {
            message: None,
            ..auth
        }))
        .await?;
        Ok(())
    }

    async fn send_initial_state(&self) -> Result<()> {
        let rows = self.db.get_all_objects_full().context("get_all_objects_full")?;
        let messages = msg_get_resent(&self.db).context("msg_get_resent")?;

        let hosts_up = Vec::new();
        // TODO(jakobt)
        // for (const id in hostClients.hostClients) hostsUp.push(+id);

        let mut state = State {
            object_names_and_ids: Default::default(),
            messages,
            // deploymentObjects: deployment.getView(), TODO(jakobt)
            deployment_message: "".to_string(), // TODO(jakobt) deployment.message || "",
            deployment_log: Vec::new(),         // TODO(jakobt) deployment.log,
            hosts_up,
            used_by: Default::default(),
            types: Default::default(),
        };

        for row in rows {
            let content: serde_json::Value = serde_json::from_str(&row.content).context("Parsing row")?;

            if row.r#type == TYPE_ID {
                state.types.insert(
                    row.id,
                    IObject {
                        id: row.id,
                        r#type: row.r#type,
                        name: row.name.clone(),
                        category: row.category.clone(),
                        content: serde_json::from_value(content)?,
                        version: Some(row.version),
                        comment: row.comment.clone(),
                        author: row.author,
                        time: Some(row.time),
                    },
                );
            }

            state
                .object_names_and_ids
                .entry(row.r#type)
                .or_default()
                .push(StateNameAndId {
                    name: Some(row.name),
                    id: row.id,
                    r#type: Some(row.r#type), // TODO(jakobt) is this right?
                    category: row.category,
                    comment: Some(row.comment),
                });

            // TODO(jakobt)
            //     for (const o of getReferences(content)) {
            //         action.usedBy.push([o, row.id]);
            //     }
        }

        self.send_message(&Message::SetInitialState(state)).await?;
        Ok(())
    }

    async fn close_forbiddern(self: &Self) -> Result<()> {
        todo!()
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
            Message::Login { user, pwd, otp } => self.handle_login(user, pwd, otp).await?,
            Message::GenerateKey {
                r#ref,
                ssh_public_key,
            } => self.handle_generate_key(r#ref, ssh_public_key).await?,
            Message::DockerListImageByHash { r#ref, hash } => {
                if !self.auth.lock().unwrap().docker_pull {
                    return self.close_forbiddern().await;
                }               
                let res = 
                    DockerListImageByHashRes {
                        r#ref,
                        tags: self.docker.get_tags_by_hash( &hash, &self.db).await?,
                    };
                self.send_message(&Message::DockerListImageByHashRes(res))
                .await
                .context("Send message")?;
            }
            Message::DockerListImageTags { r#ref } => {
                if !self.auth.lock().unwrap().docker_pull {
                    return self.close_forbiddern().await;
                }   
                let res = self.docker.list_image_tags(r#ref, &self.db).await?;
                self.send_message(&Message::DockerListImageTagsRes(res)).await.context("Send message")?;
            }
            Message::LogOut(LogOut {
                forget_pwd,
                forget_otp,
            }) => self.handle_logout(forget_pwd, forget_otp).await?,
            Message::RequestInitialState {} => {
                if !self.auth.lock().unwrap().auth {
                    return self.close_forbiddern().await;
                }
                self.send_initial_state().await.context("send_initial_state")?;
            }
            Message::DockerListDeployments { r#ref, host, image } => {
                if !self.auth.lock().unwrap().docker_push {
                    return self.close_forbiddern().await;
                }   
                //await docker.listDeployments(this, act);
            }
            Message::DockerListDeploymentHistory { r#ref, host, name } => {
                if !self.auth.lock().unwrap().docker_push {
                    return self.close_forbiddern().await;
                }   
                //await docker.listDeploymentHistory(this, act);
            },
            Message::ServiceDeployStart(service_deploy_start) => {
                if !self.auth.lock().unwrap().docker_push {
                    return self.close_forbiddern().await;
                }   
                //await docker.deployService(this, act);
            }
            Message::ServiceRedeployStart(service_redeploy_start) => {
                if !self.auth.lock().unwrap().docker_push {
                    return self.close_forbiddern().await;
                }   
                // await docker.redeployService(this, act);
                todo!()
            }
            Message::CancelDeployment => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // deployment.cancel();
                todo!()
            }
            Message::ClearDeploymentLog => todo!(),
            Message::DeleteObject => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }
                // {
                //     const objects = await db.getAllObjectsFull();
                //     const conflicts: string[] = [];
                //     for (const object of objects) {
                //         const content = JSON.parse(object.content);
                //         if (!content) continue;
                //         if (object.type === act.id)
                //             conflicts.push(`* ${object.name} (${object.type}) type`);
                //         for (const val of ["sudoOn", "depends", "contains"]) {
                //             if (!(val in content)) continue;
                //             for (const id of content[val] as number[]) {
                //                 if (id !== act.id) continue;
                //                 conflicts.push(`* ${object.name} (${object.type}) ${val}`);
                //             }
                //         }
                //     }
                //     if (conflicts.length > 0) {
                //         const res: IAlert = {
                //             type: ACTION.Alert,
                //             title: "Cannot delete object",
                //             message: `The object can not be delete as it is in use by:\n${conflicts.join("\n")}`,
                //         };
                //         this.sendMessage(res);
                //     } else {
                //         console.log("Web client delete object", { id: act.id });
                //         await db.changeObject(act.id, null, nullCheck(this.auth.user));
                //         const res2: IObjectChanged = {
                //             type: ACTION.ObjectChanged,
                //             id: act.id,
                //             object: [],
                //         };
                //         webClients.broadcast(res2);
                //         const res3: ISetPageAction = {
                //             type: ACTION.SetPage,
                //             page: { type: PAGE_TYPE.Dashbord },
                //         };
                //         this.sendMessage(res3);
                //     }
                //     break;
                // }
                todo!()
            }
            Message::DeployObject => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // deployment
                //     .deployObject(act.id, act.redeploy)
                //     .catch(errorHandler("Deployment::deployObject", this));
                todo!()
            }
            Message::DockerContainerForget => {
                if !self.auth.lock().unwrap().docker_push {
                    return self.close_forbiddern().await;
                }   
                // await docker.forgetContainer(this, act.host, act.container);
                todo!()
            }
            Message::DockerImageSetPin{id, pin} => {
                if !self.auth.lock().unwrap().docker_push {
                    return self.close_forbiddern().await;
                }
                self.docker.image_set_pin(id, pin, &self.db).await?;
            }
            Message::DockerImageTagSetPin{image, tag , pin} => {
                if !self.auth.lock().unwrap().docker_push {
                    return self.close_forbiddern().await;
                }
                self.docker.image_tag_set_pin(&image, &tag, pin, &self.db).await?;
            }
            Message::DockerListImageTagHistory => {
                if !self.auth.lock().unwrap().docker_push {
                    return self.close_forbiddern().await;
                }   
                // await docker.listImageTagHistory(this, act);
                todo!()
            }
            Message::EndLog => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // if (act.id in this.logJobs) this.logJobs[act.id].kill();
                todo!()
            }
            Message::FetchObject => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // const rows = await db.getObjectByID(act.id);
                // const res: IObjectChanged = { type: ACTION.ObjectChanged, id: act.id, object: [] };
                // for (const row of rows) {
                //     res.object.push({
                //         id: act.id,
                //         version: row.version,
                //         type: row.type,
                //         name: row.name,
                //         content: JSON.parse(row.content),
                //         category: row.category,
                //         comment: row.comment,
                //         time: row.time,
                //         author: row.author,
                //     });
                // }
                // this.sendMessage(res);
                todo!()
            }
            Message::GetObjectHistory => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // const history: {
                //     version: number;
                //     time: number;
                //     author: string | null;
                // }[] = [];
                // for (const row of await db.all(
                //     "SELECT `version`, strftime('%s', `time`) AS `time`, `author` FROM `objects` WHERE `id`=?",
                //     act.id,
                // )) {
                //     history.push({ version: row.version, time: row.time, author: row.author });
                // }
                // this.sendMessage({
                //     type: ACTION.GetObjectHistoryRes,
                //     ref: act.ref,
                //     history,
                //     id: act.id,
                // });
                todo!()
            }
            Message::GetObjectId => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // let id = null;
                // try {
                //     const parts = act.path.split("/", 2);
                //     if (parts.length !== 2) break;
                //     const typeRow = await db.get(
                //         "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1",
                //         typeId,
                //         parts[0],
                //     );
                //     if (!typeRow || !typeRow.id) break;
                //     const objectRow = await db.get(
                //         "SELECT `id` FROM `objects` WHERE `type`=? AND `name`=? AND `newest`=1",
                //         typeRow.id,
                //         parts[1],
                //     );
                //     if (objectRow) id = objectRow.id;
                // } finally {
                //     this.sendMessage({ type: ACTION.GetObjectIdRes, ref: act.ref, id });
                // }
                todo!()
            }
            Message::MessageTextReq{id} => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }
                let message: String = msg_get_full_text(&self.db, id)?.unwrap_or_else(|| "missing".to_string());
                self.send_message(&Message::MessageTextRep{
                    id,
                    message
                }).await?;
            }
            Message::ModifiedFilesList => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // await modifiedFiles.list(this, act);
                todo!()
            }
            Message::ModifiedFilesResolve => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // await modifiedFiles.resolve(this, act);
                todo!()
            }
            Message::ModifiedFilesScan => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // await modifiedFiles.scan(this, act);
                todo!()
            }
            Message::ResetServerState => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // await db.resetServer(act.host);
                todo!()
            }
            Message::SaveObject => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // {
                //     // HACK HACK HACK crypt passwords that does not start with $6$, we belive we have allready bcrypt'ed it
                //     if (!act.obj) throw Error("Missing object in action");
                //     const c = act.obj.content;
                //     const typeRow = await db.getNewestObjectByID(act.obj.type);
                //     const type = JSON.parse(typeRow.content) as IType;
                //     for (const r of type.content || []) {
                //         if (r.type !== TypePropType.password) continue;
                //         if (!(r.name in c) || c[r.name].startsWith("$6$")) continue;
                //         c[r.name] = await crypt.hash(c[r.name]);
                //     }

                //     if (act.obj.type === userId && (!c.otp_base32 || !c.otp_url)) {
                //         const secret = speakeasy.generateSecret({
                //             name: `Simple Admin:${act.obj.name}`,
                //         });
                //         c.otp_base32 = secret.base32;
                //         c.otp_url = secret.otpauth_url;
                //     }

                //     const { id, version } = await db.changeObject(
                //         act.id,
                //         act.obj,
                //         nullCheck(this.auth.user),
                //     );
                //     act.obj.version = version;
                //     const res2: IObjectChanged = {
                //         type: ACTION.ObjectChanged,
                //         id: id,
                //         object: [act.obj],
                //     };
                //     webClients.broadcast(res2);
                //     const res3: ISetPageAction = {
                //         type: ACTION.SetPage,
                //         page: { type: PAGE_TYPE.Object, objectType: act.obj.type, id, version },
                //     };
                //     this.sendMessage(res3);
                // }
                todo!()
            }
            Message::Search => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }

                // const objects: {
                //     type: number;
                //     id: number;
                //     version: number;
                //     name: string;
                //     comment: string;
                //     content: string;
                // }[] = [];
                // for (const row of await db.all(
                //     "SELECT `id`, `version`, `type`, `name`, `content`, `comment` FROM `objects` WHERE (`name` LIKE ? OR `content` LIKE ? OR `comment` LIKE ?) AND `newest`=1",
                //     act.pattern,
                //     act.pattern,
                //     act.pattern,
                // )) {
                //     objects.push({
                //         id: row.id,
                //         type: row.type,
                //         name: row.name,
                //         content: row.content,
                //         comment: row.comment,
                //         version: row.version,
                //     });
                // }
                // const res4: ISearchRes = {
                //     type: ACTION.SearchRes,
                //     ref: act.ref,
                //     objects,
                // };
                // this.sendMessage(res4);
                todo!()
            }
            Message::SetMessageDismissed{ids, dismissed} => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }
                msg_set_dismissed(&self.db, &ids, dismissed).await?;
                todo!()
            }
            Message::StartDeployment => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // await deployment.start().catch(errorHandler("Deployment::start", this));
                todo!()
            }
            Message::StartLog => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // if (act.host in hostClients.hostClients) {
                //     new LogJob(
                //         hostClients.hostClients[act.host],
                //         this,
                //         act.id,
                //         act.logtype,
                //         act.unit,
                //     );
                // }
                todo!()
            }
            Message::StopDeployment => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // await deployment.stop();
                todo!()
            }
            Message::ToggleDeploymentObject => {
                if !self.auth.lock().unwrap().admin {
                    return self.close_forbiddern().await;
                }   
                // await deployment.toggleObject(act.index, act.enabled);
                todo!()
            }
            Message::AuthStatus(_) |
            Message::GenerateKeyRes(_) |
            Message::DockerDeployLog { ..} |
            Message::DockerDeployEnd { ..} |
            Message::HostDown { ..} |
            Message::HostUp { ..} |
            Message::Alert { ..} |
            Message::ModifiedFilesChanged { .. } |
            Message::AddDeploymentLog |
            Message::AddLogLines |
            Message::AddMessage |
            Message::DockerContainerRemove |
            Message::DockerContainerStart |
            Message::DockerContainerStop |
            Message::DockerDeploymentsChanged |
            Message::GetObjectHistoryRes |
            Message::GetObjectIdRes |
            Message::ListModifiedFiles |
            Message::MessageTextRep{..} |
            Message::ObjectChanged |
            Message::SearchRes |
            Message::SetDeploymentMessage |
            Message::SetDeploymentObjects |
            Message::SetDeploymentObjectStatus |
            Message::SetDeploymentStatus |
            Message::SetPage |
            Message::StatValueChanges |
            Message::DockerListImageTagsRes(_) |
            Message::DockerListImageByHashRes(_) |
            Message::UpdateStatus |
            Message::SetInitialState(_) |
            Message::DockerListDeploymentsRes {..} |
            Message::DockerListDeploymentHistoryRes {..} |
            Message::DockerDeployStart(_) |
            Message::DockerListImageTagsChanged { .. } |
            Message::DockerListImageTagHistoryRes |
            Message::SubscribeStatValues => todo!()
        }
        Ok(())
    }

    async fn handle_generate_key(self: &Arc<Self>, r#ref: u64, ssh_public_key: Option<String>) -> Result<(), Error> {
        let (ssl_name, auth_days, user) = {
            let auth = self.auth.lock().unwrap();
            (auth.sslname.clone(), auth.auth_days, auth.user.clone())
        };
        let Some(ssl_name) = ssl_name else {
            self.sink.lock().await.close().await?;
            return Ok(());
        };
        let (_uname, rem) = ssl_name.split_once('.').context("Bad ssl_name")?;
        let (_uid, mut caps) = if let Some((_uid, caps_string)) = rem.split_once('.') {
            (_uid, caps_string.split('~'))
        } else {
            (rem, "".split('~'))
        };
        let (ca_key, ca_crt) = self.docker.ensure_ca_key_crt(&self.db).await?;
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
        let mut res = GenerateKeyRes {
            r#ref: r#ref,
            key: my_srs,
            crt: my_crt,
            ca_pem: ca_crt,
            ssh_host_ca: None,
            ssh_crt: None,
        };
        if caps.contains(&"ssh") {
            if let Some(ssh_public_key) = &ssh_public_key {
                let root_vars =
                    self.db.get_root_valiabels().context("get_root_valiabels")?;
    
                if let (Some(ssh_host_ca_key), Some(ssh_host_ca_pub), Some(user)) = (
                    root_vars.get("sshHostCaKey"),
                    root_vars.get("sshHostCaPub"),
                    &user,
                ) {
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
                    res.ssh_host_ca = Some(ssh_host_ca_pub.clone());
                    res.ssh_crt = Some(ssh_crt);
                }
            }
        }
        self.send_message(&Message::GenerateKeyRes(res))
            .await
            .context("Send message")?;
        Ok(())
    }
    
    async fn handle_login(self: &Arc<Self>, user: String, pwd: String, otp: Option<String>) -> Result<(), Error> {
        let session = self.auth.lock().unwrap().session.clone();
        let auth = if let Some(session) = &session {
            get_auth(&self.db, self.config, Some(&self.host), Some(session)).await?
        } else {
            Default::default()
        };
        let mut found = false;
        let mut new_otp = false;
        let mut otp_correct = auth.otp;
        let mut pwd_correct = auth.pwd;
        for u in &self.config.users {
            if u.name == user {
                found = true;
                if u.password == pwd {
                    otp_correct = true;
                    pwd_correct = true;
                    new_otp = true;
                }
            }
        }
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
                    // TODO (jakobt)
                    otp_correct = true || totp.check_current(&otp)?;
                    new_otp = true;
                }
            }
        }
        Ok(if !found {
            *self.auth.lock().unwrap() = Default::default();
            self.send_message(&Message::AuthStatus(AuthStatus {
                session,
                user: Some(user),
                message: Some("Invalid user name".to_string()),
                ..Default::default()
            }))
            .await?;
        } else if !pwd_correct || !otp_correct {
            info!("A");
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
                //user: Some(user), // TODO(jakobt)
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
            info!("B");
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
    
            let auth = get_auth(&self.db, self.config, Some(&self.host), Some(&session)).await?;
            *self.auth.lock().unwrap() = auth.clone();
            if !auth.auth {
                bail!("Internal auth error");
            }
            self.send_message(&Message::AuthStatus(auth)).await?;
        })
    }
    
    async fn handle_logout(self: &Arc<Self>, forget_pwd: bool, forget_otp: bool) -> Result<(), Error> {
        if !self.auth.lock().unwrap().auth {
            return self.close_forbiddern().await;
        }
        let session = {
            let auth = self.auth.lock().unwrap();
            info!(
                "logout host={} user={} session={} forgetPwd={} forgetOtp={}",
                self.host,
                auth.user.as_deref().unwrap_or_default(),
                auth.session.as_deref().unwrap_or_default(),
                forget_pwd,
                forget_otp
            );
            auth.session.clone().context("Missing session")?
        };
        if forget_pwd {
            self.db.run(
                "UPDATE `sessions` SET `pwd`=null WHERE `sid`=?",
                (&session,),
            )?;
            let mut auth = self.auth.lock().unwrap();
            auth.pwd = false;
            auth.auth = false;
        }
        if forget_otp {
            self.db.run(
                "UPDATE `sessions` SET `otp`=null WHERE `sid`=?",
                (&session,),
            )?;
            *self.auth.lock().unwrap() = Default::default();
        }
        self.send_auth_status(session).await?;
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
    config: &'static Config,
    remote: String,
    rt: RunToken,
) -> Result<()> {
    let websocket = match cancelable(&rt, websocket).await {
        Ok(v) => v?,
        Err(_) => return Ok(()),
    };
    let (sink, source) = websocket.split();
    let webclient = Arc::new(WebClient::new(db, docker, config, remote, sink));
    webclient.handle_messages(rt, source).await?;
    Ok(())
}

async fn handle_request(
    mut req: Request<hyper::body::Incoming>,
    db: Arc<Db>,
    docker: Arc<Docker>,
    config: &'static Config,
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

                        if let Err(e) = handle_webclient(websocket, db, docker, config, remote, rt).await {
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

pub async fn run(run_token: RunToken, db: Arc<Db>, docker: Arc<Docker>, config: &'static Config) -> Result<()> {
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
                            async move { handle_request(req, db, docker, config, address, rt).await }
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
