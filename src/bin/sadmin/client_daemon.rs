use std::{
    collections::{BTreeMap, HashMap},
    io::Write,
    net::ToSocketAddrs,
    os::unix::{
        prelude::{BorrowedFd, OwnedFd},
        process::ExitStatusExt,
    },
    path::Path,
    process::Stdio,
    sync::{atomic::AtomicU64, Arc, Mutex},
    time::Duration,
};

use anyhow::{bail, ensure, Context, Result};
use bytes::BytesMut;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt, ReadHalf, WriteHalf},
    net::{
        unix::{OwnedReadHalf, OwnedWriteHalf},
        TcpStream, UnixStream,
    },
    process::ChildStdin,
    select,
    sync::{
        mpsc::{UnboundedReceiver, UnboundedSender},
        Notify,
    },
    time::timeout,
};
use tokio_rustls::{
    rustls::{self, OwnedTrustAnchor},
    TlsConnector,
};
use tokio_tasks::{cancelable, RunToken, TaskBase, TaskBuilder};

use crate::{
    client_daemon_service::RemoteLogTarget,
    connection::Config,
    persist_daemon,
    service_control::DaemonControlMessage,
    service_description::ServiceDescription,
    tokio_passfd::{self},
};
use sdnotify::SdNotify;

pub const CONTROL_SOCKET_PATH: &str = "/run/simpleadmin/control.socket";

pub const JOB_ORDER: i32 = -20;
pub const CONTROL_ORDER: i32 = -15;
pub const SERVICE_ORDER: i32 = -0;
pub const UPSTREAM_ORDER: i32 = 10;
pub const PERSIST_ORDER: i32 = 20;

/// Run the simpleadmin-client daemon (root)
///
/// You should probably not run this manually, instead this should be run through
/// the simpleadmin-client systemd service
///
/// The simpleadmin-client daemon connects to the sadmin backend, and is responsible for deployments,
/// and host management. It also orchestrates services. The simpleadmin-persist daemon must be running
/// for simpleadmin-client to start.
#[derive(clap::Parser)]
pub struct ClientDaemon {
    /// Verbosity of messages to display
    #[clap(long, default_value = "info")]
    log_level: log::LevelFilter,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum RunInstantStdinOutputType {
    Text,
    Base64,
    Json,
    #[serde(rename = "utf-8")]
    Utf8,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum RunInstantStdinType {
    None,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunInstantMessage {
    id: u64,
    name: String,
    interperter: String,
    content: String,
    args: Vec<String>,
    output_type: RunInstantStdinOutputType,
    stdin_type: RunInstantStdinType,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum RunScriptStdinType {
    None,
    Binary,
    GivenJson,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum RunScriptOutType {
    None,
    Binary,
    Text,
    BlockedJson,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunScriptMessage {
    id: u64,
    name: String,
    interperter: String,
    content: String,
    args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    input_json: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stdin_type: Option<RunScriptStdinType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stdout_type: Option<RunScriptOutType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stderr_type: Option<RunScriptOutType>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum DataSource {
    Stdin,
    Stdout,
    Stderr,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DataMessage {
    pub id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<DataSource>,
    pub data: serde_json::Value,
    pub eof: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum FailureType {
    Script,
    UnknownTask,
    Exception,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct FailureMessage {
    id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    failure_type: Option<FailureType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stdout: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stderr: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SuccessMessage {
    id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeployServiceMessage {
    id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image: Option<String>,
    description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    docker_auth: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    extra_env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    user: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Auth { hostname: String, password: String },
    RunInstant(RunInstantMessage),
    RunScript(RunScriptMessage),
    Ping { id: u64 },
    Pong { id: u64 },
    Failure(FailureMessage),
    Success(SuccessMessage),
    Kill { id: u64 },
    Data(DataMessage),
    DeployService(DeployServiceMessage),
}

pub type PersistMessageSender =
    tokio::sync::oneshot::Sender<(persist_daemon::Message, Option<OwnedFd>)>;

pub struct Client {
    connector: TlsConnector,
    pub config: Config,
    command_tasks: Mutex<HashMap<u64, Arc<dyn TaskBase>>>,
    send_failure_notify: Notify,
    recv_failure_notify: Notify,
    new_send_notify: Notify,
    sender: tokio::sync::Mutex<
        Option<WriteHalf<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>>,
    >,
    script_stdin: Mutex<HashMap<u64, UnboundedSender<DataMessage>>>,
    persist_responses: Mutex<HashMap<u64, PersistMessageSender>>,
    persist_idc: AtomicU64,
    persist_sender: tokio::sync::Mutex<OwnedWriteHalf>,
    pub db: Mutex<rusqlite::Connection>,
    pub dead_process_handlers: Mutex<HashMap<String, tokio::sync::oneshot::Sender<i32>>>,

    pub services: Mutex<HashMap<String, Arc<crate::client_daemon_service::Service>>>,
    pub journal_socket: tokio::net::UnixDatagram,
}

impl Client {
    pub async fn send_message(self: &Arc<Self>, message: ClientMessage) {
        let mut message = serde_json::to_vec(&message).unwrap();
        message.push(30);
        loop {
            let mut s = self.sender.lock().await;
            if let Some(v) = &mut *s {
                let write_all = v.write_all(&message);
                let recv_failure = self.recv_failure_notify.notified();
                let sleep = tokio::time::sleep(Duration::from_secs(40));
                tokio::select!(
                    val = write_all => {
                        if let Err(e) = val {
                            // The send errored out, notify the recv half so we can try to initiate a new connection
                            error!("Failed seding message to backend: {}", e);
                            self.send_failure_notify.notify_one();
                            *s = None
                        }
                        break
                    }
                    _ = recv_failure => {
                        *s = None
                    }
                    _ = sleep => {
                        // The send timeouted, notify the recv half so we can try to initiate a new connection
                        error!("Timout sending message to server");
                        self.send_failure_notify.notify_one();
                        *s = None
                    }
                );
                continue;
            }
            // We do not currently have a send socket so lets wait for one
            std::mem::drop(s);
            self.new_send_notify.notified().await;
        }
    }

    async fn handle_ping(self: Arc<Self>, id: u64) {
        debug!("Ping from server {}", id);
        self.send_message(ClientMessage::Pong { id }).await;
    }

    async fn handle_run_instant_inner(
        self: &Arc<Self>,
        msg: RunInstantMessage,
    ) -> Result<ClientMessage> {
        let mut file = tempfile::Builder::new().suffix(&msg.name).tempfile()?;

        file.write_all(msg.content.as_bytes())?;
        file.flush()?;

        let mut cmd = tokio::process::Command::new(&msg.interperter);
        cmd.arg(file.path());
        for arg in &msg.args {
            cmd.arg(arg);
        }
        cmd.stdin(Stdio::null());
        cmd.kill_on_drop(true);
        let output = cmd.output().await?;
        if !output.status.success() {
            let code = output
                .status
                .code()
                .or_else(|| output.status.signal().map(|v| -v));
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            debug!(
                "Instant command failed {} failed with code {:?}",
                msg.id, code
            );
            debug!("stdout: '{}'", stdout);
            debug!("stderr: '{}'", stderr);
            return Ok(ClientMessage::Failure(FailureMessage {
                id: msg.id,
                code,
                failure_type: Some(FailureType::Script),
                stdout: Some(stdout),
                stderr: Some(stderr),
                ..Default::default()
            }));
        }
        let data = match msg.output_type {
            RunInstantStdinOutputType::Text => {
                String::from_utf8_lossy(&output.stdout).to_string().into()
            }
            RunInstantStdinOutputType::Base64 => base64::encode(&output.stdout).into(),
            RunInstantStdinOutputType::Json => serde_json::from_slice(&output.stdout)?,
            RunInstantStdinOutputType::Utf8 => String::from_utf8(output.stdout)?.into(),
        };
        Ok(ClientMessage::Success(SuccessMessage {
            id: msg.id,
            code: None,
            data: Some(data),
        }))
    }

    async fn handle_run_instant(
        self: Arc<Self>,
        _run_token: RunToken,
        msg: RunInstantMessage,
    ) -> Result<()> {
        debug!("Start instant command {}: {}", msg.id, msg.name);
        let id = msg.id;
        let m = match self.handle_run_instant_inner(msg).await {
            Ok(v) => v,
            Err(e) => {
                error!("Error in instant command {}: {}", id, e);
                ClientMessage::Failure(FailureMessage {
                    id,
                    failure_type: Some(FailureType::Exception),
                    message: Some(e.to_string()),
                    ..Default::default()
                })
            }
        };
        self.send_message(m).await;
        self.command_tasks.lock().unwrap().remove(&id);
        debug!("Finished instant command {}", id);
        Ok(())
    }

    async fn handle_script_output(
        self: &Arc<Self>,
        id: u64,
        source: DataSource,
        out: Option<impl AsyncRead + std::marker::Unpin>,
        typ: Option<RunScriptOutType>,
    ) -> Result<()> {
        let mut out = match out {
            Some(v) => v,
            None => return Ok(()),
        };
        match typ {
            None | Some(RunScriptOutType::None) => return Ok(()),
            Some(RunScriptOutType::Binary) => {
                let mut buf = BytesMut::with_capacity(1024 * 1024);
                loop {
                    buf.clear();
                    let s = out.read_buf(&mut buf).await?;
                    self.send_message(ClientMessage::Data(DataMessage {
                        id,
                        source: Some(source),
                        data: base64::encode(&buf).into(),
                        eof: Some(s == 0),
                    }))
                    .await;
                    if s == 0 {
                        break;
                    }
                }
            }
            Some(RunScriptOutType::Text) => {
                let mut buf = BytesMut::with_capacity(1024 * 1024);
                loop {
                    let s = out.read_buf(&mut buf).await?;
                    // Seek back to the first valid utf8 break
                    let mut i = buf.len();
                    while i != 0 && buf[i - 1] > 127 {
                        i -= 1;
                    }
                    if i != 0 {
                        self.send_message(ClientMessage::Data(DataMessage {
                            id,
                            source: Some(source),
                            data: String::from_utf8_lossy(&buf.split_to(i)).into(),
                            eof: Some(s == 0),
                        }))
                        .await;
                    }
                    if s == 0 {
                        break;
                    }
                    if buf.capacity() == buf.len() {
                        bail!("Not valid utf8")
                    }
                }
            }
            Some(RunScriptOutType::BlockedJson) => {
                let mut buf = BytesMut::with_capacity(1024 * 1024);
                loop {
                    let s = out.read_buf(&mut buf).await?;
                    let mut last = 0;
                    for (i, c) in buf.iter().enumerate() {
                        if *c != 0 {
                            continue;
                        }
                        self.send_message(ClientMessage::Data(DataMessage {
                            id,
                            source: Some(source),
                            data: serde_json::from_slice(&buf[last..i])?,
                            eof: Some(s == 0),
                        }))
                        .await;
                        last = i + 1
                    }
                    let _ = buf.split_to(last);
                    if s == 0 {
                        break;
                    }
                    if buf.capacity() == buf.len() {
                        buf.reserve(buf.capacity());
                    }
                }
            }
        };
        Ok(())
    }

    async fn handle_script_input(
        self: &Arc<Self>,
        write: Option<ChildStdin>,
        mut read: UnboundedReceiver<DataMessage>,
    ) -> Result<()> {
        let mut write = match write {
            Some(v) => v,
            None => return Ok(()),
        };
        loop {
            let obj = read.recv().await;
            let data = match obj {
                None => break,
                Some(v) => v,
            };
            let bytes = match data.data.as_str() {
                Some(v) => base64::decode(v)?,
                None => bail!("Expected string data"),
            };
            write.write_all(&bytes).await?;
            if data.eof == Some(true) {
                break;
            }
        }
        write.shutdown().await?;
        Ok(())
    }

    async fn handle_run_script_inner(
        self: &Arc<Self>,
        msg: RunScriptMessage,
        stdin: UnboundedReceiver<DataMessage>,
    ) -> Result<ClientMessage> {
        let mut file = tempfile::Builder::new().suffix(&msg.name).tempfile()?;

        file.write_all(msg.content.as_bytes())?;
        file.flush()?;

        let mut cmd = tokio::process::Command::new(&msg.interperter);
        cmd.arg(file.path());
        for arg in &msg.args {
            cmd.arg(arg);
        }
        cmd.stdin(match msg.stdin_type {
            Some(RunScriptStdinType::None) => Stdio::null(),
            _ => Stdio::piped(),
        });
        cmd.stdout(match msg.stdout_type {
            Some(RunScriptOutType::None) => Stdio::inherit(),
            _ => Stdio::piped(),
        });
        cmd.stderr(match msg.stderr_type {
            Some(RunScriptOutType::None) => Stdio::inherit(),
            _ => Stdio::piped(),
        });
        cmd.kill_on_drop(true);
        let mut child = cmd.spawn()?;

        let handle_in = self.handle_script_input(child.stdin.take(), stdin);
        let handle_stdout = self.handle_script_output(
            msg.id,
            DataSource::Stdout,
            child.stdout.take(),
            msg.stdout_type,
        );
        let handle_stderr = self.handle_script_output(
            msg.id,
            DataSource::Stderr,
            child.stderr.take(),
            msg.stderr_type,
        );
        let wait_child = child.wait();

        tokio::pin!(wait_child);
        tokio::pin!(handle_in);
        tokio::pin!(handle_stdout);
        tokio::pin!(handle_stderr);

        let mut child_result = None;
        let mut stdin_done = false;
        let mut stdout_result = None;
        let mut stderr_result = None;
        while child_result.is_none() || stdout_result.is_none() || stderr_result.is_none() {
            select! {
                val = &mut wait_child, if child_result.is_none() => {
                    child_result = Some(val)
                }
                val = &mut handle_in, if !stdin_done => {
                    val.context("Error handeling stdin")?;
                    stdin_done = true;
                }
                val = &mut handle_stdout, if stdout_result.is_none() => {
                    stdout_result = Some(val)
                }
                val = &mut handle_stderr, if stderr_result.is_none() => {
                    stderr_result = Some(val)
                }
            }
        }

        let status = child_result.unwrap()?;
        if !status.success() {
            let code = status.code().or_else(|| status.signal().map(|v| -v));
            return Ok(ClientMessage::Failure(FailureMessage {
                id: msg.id,
                code,
                failure_type: Some(FailureType::Script),
                ..Default::default()
            }));
        }
        stdout_result.unwrap()?;
        stderr_result.unwrap()?;
        Ok(ClientMessage::Success(SuccessMessage {
            id: msg.id,
            code: Some(0),
            data: None,
        }))
    }

    async fn handle_run_script(
        self: Arc<Self>,
        _run_token: RunToken,
        msg: RunScriptMessage,
        recv: UnboundedReceiver<DataMessage>,
    ) -> Result<()> {
        debug!("Start run script {}: {}", msg.id, msg.name);
        let id = msg.id;
        let m = match self.handle_run_script_inner(msg, recv).await {
            Ok(v) => v,
            Err(e) => ClientMessage::Failure(FailureMessage {
                id,
                failure_type: Some(FailureType::Exception),
                message: Some(e.to_string()),
                ..Default::default()
            }),
        };
        self.send_message(m).await;
        self.command_tasks.lock().unwrap().remove(&id);
        self.script_stdin.lock().unwrap().remove(&id);
        debug!("Finished run script {}", id);
        Ok(())
    }

    async fn handle_deploy_service_inner(
        self: &Arc<Self>,
        msg: DeployServiceMessage,
    ) -> Result<ClientMessage> {
        let d: ServiceDescription =
            serde_yaml::from_str(&msg.description).context("Parsing description")?;

        let service = self
            .services
            .lock()
            .unwrap()
            .entry(d.name.clone())
            .or_insert_with(|| {
                Arc::new(crate::client_daemon_service::Service::new(
                    self.clone(),
                    d.name.clone(),
                ))
            })
            .clone();

        let image = msg.image.map(|i| {
            format!(
                "{}/{}",
                self.config.server_host.as_deref().unwrap_or_default(),
                i
            )
        });
        service
            .deploy(
                image,
                d,
                msg.docker_auth,
                msg.extra_env,
                msg.user.unwrap_or_else(|| "unknown".to_string()),
                &mut RemoteLogTarget::Backend {
                    id: msg.id,
                    client: self.clone(),
                },
            )
            .await?;

        Ok(ClientMessage::Success(SuccessMessage {
            id: msg.id,
            code: Some(0),
            data: None,
        }))
    }

    async fn handle_deploy_service(
        self: Arc<Self>,
        _run_token: RunToken,
        msg: DeployServiceMessage,
    ) -> Result<()> {
        let id = msg.id;
        let m = match self.handle_deploy_service_inner(msg).await {
            Ok(m) => m,
            Err(e) => {
                error!("Error in deploy service: {:?}", e);
                self.send_message(ClientMessage::Data(DataMessage {
                    id,
                    source: Some(DataSource::Stderr),
                    data: base64::encode(&format!("Error deploying service: {:?}", e)).into(),
                    eof: Some(true),
                }))
                .await;
                ClientMessage::Failure(FailureMessage {
                    id,
                    ..Default::default()
                })
            }
        };
        self.send_message(m).await;
        Ok(())
    }

    async fn handle_kill(self: Arc<Self>, id: u64) {
        let task = self.command_tasks.lock().unwrap().remove(&id);
        match task {
            Some(v) => v.cancel().await,
            None => {
                self.send_message(ClientMessage::Failure(FailureMessage {
                    id,
                    failure_type: Some(FailureType::UnknownTask),
                    message: Some("Unknown task".to_string()),
                    ..Default::default()
                }))
                .await
            }
        }
    }

    fn handle_message(self: &Arc<Self>, message: ClientMessage) {
        match message {
            ClientMessage::Auth { .. } => {
                error!("Got unexpected message auth");
            }
            ClientMessage::Pong { .. } => {
                error!("Got unexpected message pong");
            }
            ClientMessage::Failure(_) => {
                error!("Got unexpected message failure");
            }
            ClientMessage::Success(_) => {
                error!("Got unexpected message success");
            }
            ClientMessage::Data(d) => {
                if let Some(v) = self.script_stdin.lock().unwrap().get(&d.id) {
                    let _ = v.send(d);
                }
            }
            ClientMessage::RunInstant(ri) => {
                let id = ri.id;

                let task = TaskBuilder::new(format!("run_instant_{}", id))
                    .shutdown_order(JOB_ORDER)
                    .create(|run_token| self.clone().handle_run_instant(run_token, ri));

                self.command_tasks.lock().unwrap().insert(id, task);
            }
            ClientMessage::RunScript(ri) => {
                let (send, recv) = tokio::sync::mpsc::unbounded_channel();
                let id = ri.id;
                if let Some(input_json) = &ri.input_json {
                    send.send(DataMessage {
                        id,
                        source: None,
                        data: base64::encode(&serde_json::to_string(input_json).unwrap()).into(),
                        eof: Some(true),
                    })
                    .unwrap();
                } else {
                    self.script_stdin.lock().unwrap().insert(id, send);
                }

                let task = TaskBuilder::new(format!("run_script_{}", id))
                    .shutdown_order(JOB_ORDER)
                    .create(|run_token| self.clone().handle_run_script(run_token, ri, recv));

                self.command_tasks.lock().unwrap().insert(id, task);
            }
            ClientMessage::DeployService(ds) => {
                let id = ds.id;
                TaskBuilder::new(format!("deploy_service_{}", id))
                    .shutdown_order(JOB_ORDER)
                    .create(|run_token| self.clone().handle_deploy_service(run_token, ds));
            }
            ClientMessage::Ping { id } => {
                tokio::spawn(self.clone().handle_ping(id));
            }
            ClientMessage::Kill { id } => {
                tokio::spawn(self.clone().handle_kill(id));
            }
        }
    }

    pub async fn send_persist_request(
        &self,
        message: persist_daemon::Message,
        fd: Option<BorrowedFd<'_>>,
    ) -> Result<(persist_daemon::Message, Option<OwnedFd>)> {
        let msg = serde_json::to_vec(&message)?;
        let (send, recv) = tokio::sync::oneshot::channel();
        self.persist_responses
            .lock()
            .unwrap()
            .insert(message.id(), send);
        let mut s = self.persist_sender.lock().await;
        s.write_u32(msg.len().try_into()?).await?;
        s.write_all(&msg).await?;
        if let Some(fd) = fd {
            assert!(message.with_fd());
            tokio_passfd::send_fd(&mut s, &fd).await?;
        } else {
            assert!(!message.with_fd());
        }
        s.flush().await?;
        match recv.await? {
            (persist_daemon::Message::Error { message: msg, .. }, _) => {
                bail!(
                    "Remote error: {}, to message {} of type {}",
                    msg,
                    message.id(),
                    message.message_type()
                )
            }
            v => Ok(v),
        }
    }

    pub async fn send_persist_request_success(
        &self,
        message: persist_daemon::Message,
        fd: Option<BorrowedFd<'_>>,
    ) -> Result<()> {
        let msg = serde_json::to_vec(&message)?;
        let (send, recv) = tokio::sync::oneshot::channel();
        self.persist_responses
            .lock()
            .unwrap()
            .insert(message.id(), send);
        let mut s = self.persist_sender.lock().await;
        s.write_u32(msg.len().try_into()?).await?;
        s.write_all(&msg).await?;
        if let Some(fd) = fd {
            assert!(message.with_fd());
            tokio_passfd::send_fd(&mut s, &fd).await?;
        } else {
            assert!(!message.with_fd());
        }
        s.flush().await?;
        match recv.await? {
            (persist_daemon::Message::Error { message: msg, .. }, _) => {
                bail!(
                    "Remote error: {}, to message {} of type {}",
                    msg,
                    message.id(),
                    message.message_type()
                )
            }
            (persist_daemon::Message::Success { .. }, _) => Ok(()),
            (v, _) => {
                bail!(
                    "Unexpected response {} to mesage {} of type {}",
                    v.message_type(),
                    message.id(),
                    message.message_type()
                );
            }
        }
    }

    pub fn next_persist_idc(&self) -> u64 {
        self.persist_idc
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    pub async fn persist_put_fd(&self, key: String, fd: BorrowedFd<'_>) -> Result<()> {
        let id = self.next_persist_idc();
        self.send_persist_request_success(persist_daemon::Message::PutFd { id, key }, Some(fd))
            .await
    }

    pub async fn persist_get_fd(&self, key: String) -> Result<Option<OwnedFd>> {
        let (res, fd) = self
            .send_persist_request(
                self::persist_daemon::Message::GetFd {
                    id: self.next_persist_idc(),
                    key,
                },
                None,
            )
            .await?;
        match res {
            persist_daemon::Message::SuccessWithFd { .. } => {
                Ok(Some(fd.context("Expected fd here")?))
            }
            persist_daemon::Message::NotFound { .. } => Ok(None),
            m => bail!("Unexpected message: {}", m.message_type()),
        }
    }

    pub async fn persist_has_fd(&self, key: String) -> Result<bool> {
        let (res, _) = self
            .send_persist_request(
                self::persist_daemon::Message::HasFd {
                    id: self.next_persist_idc(),
                    key,
                },
                None,
            )
            .await?;
        match res {
            persist_daemon::Message::Success { .. } => Ok(true),
            persist_daemon::Message::NotFound { .. } => Ok(false),
            m => bail!("Unexpected message: {}", m.message_type()),
        }
    }

    pub async fn persist_close_fd(&self, key: &str) -> Result<()> {
        self.send_persist_request_success(
            persist_daemon::Message::CloseFd {
                id: self.next_persist_idc(),
                key: key.to_string(),
            },
            None,
        )
        .await
        .with_context(|| format!("Close fd {}", key))
    }

    pub async fn persist_list_processes(&self, key_prefix: Option<String>) -> Result<Vec<String>> {
        match self
            .send_persist_request(
                persist_daemon::Message::ListProcesses {
                    id: self.next_persist_idc(),
                    key_prefix,
                },
                None,
            )
            .await?
        {
            (persist_daemon::Message::ListProcessesResult { process_keys, .. }, _) => {
                Ok(process_keys)
            }
            (e, _) => bail!("Unexpected message {}", e.message_type()),
        }
    }

    pub async fn persist_list_fds(&self, key_prefix: Option<String>) -> Result<Vec<String>> {
        match self
            .send_persist_request(
                persist_daemon::Message::ListFds {
                    id: self.next_persist_idc(),
                    key_prefix,
                },
                None,
            )
            .await?
        {
            (persist_daemon::Message::ListFdsResult { fd_keys, .. }, _) => Ok(fd_keys),
            (e, _) => bail!("Unexpected message {}", e.message_type()),
        }
    }

    pub async fn persist_signal_process(&self, key: String, signal: i32) -> Result<bool> {
        match self
            .send_persist_request(
                persist_daemon::Message::SignalProcess {
                    id: self.next_persist_idc(),
                    key,
                    signal,
                },
                None,
            )
            .await?
        {
            (persist_daemon::Message::Success { .. }, _) => Ok(true),
            (persist_daemon::Message::NotFound { .. }, _) => Ok(false),
            (e, _) => bail!("Unexpected message {}", e.message_type()),
        }
    }

    async fn connect_to_upstream(
        self: &Arc<Self>,
    ) -> Result<ReadHalf<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>> {
        let server_host = self
            .config
            .server_host
            .as_ref()
            .context("Expected hostname")?
            .clone();

        let addr = (server_host.as_str(), 8888u16)
            .to_socket_addrs()?
            .next()
            .context("Unable to resolve host")?;

        let stream = TcpStream::connect(&addr).await?;
        let domain = rustls::ServerName::try_from(server_host.as_str())?;
        let (read, mut write) = tokio::io::split(self.connector.connect(domain, stream).await?);

        let auth_path = "/etc/sadmin_client_auth.json";
        let password = match std::fs::read(auth_path) {
            Ok(v) => {
                #[derive(Deserialize)]
                struct AuthConfig {
                    password: String,
                }
                let c: AuthConfig = serde_json::from_slice(&v)
                    .with_context(|| format!("Error parsing '{}'", auth_path))?;
                c.password
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let password = self.config.password.clone().with_context(|| {
                    format!(
                        "Could not find '{}', so we expect a password in the config file",
                        auth_path
                    )
                })?;
                warn!("Having the password in the config file is insecure, consider moving it to '{}'", auth_path);
                password
            }
            Err(e) => {
                bail!("Unable to read '{}': {:?}", auth_path, e);
            }
        };

        let mut auth_message = serde_json::to_vec(&ClientMessage::Auth {
            hostname: self.config.hostname.as_ref().unwrap().clone(),
            password,
        })?;
        auth_message.push(30);
        write.write_all(&auth_message).await?;

        *self.sender.lock().await = Some(write);
        self.new_send_notify.notify_one();
        Ok(read)
    }

    async fn run(self: Arc<Self>, run_token: RunToken) -> Result<()> {
        let notifier = SdNotify::from_env().ok();
        let mut first = true;
        loop {
            let mut read = match cancelable(&run_token, self.connect_to_upstream()).await {
                Ok(Ok(read)) => {
                    if let Some(notifier) = &notifier {
                        if first {
                            notifier.notify_ready()?;
                            first = false;
                        }
                        notifier.set_status("Connected".to_string())?;
                    }
                    read
                }
                Ok(Err(e)) => {
                    info!("Error connecting to upstream: {:?}", e);
                    if let Some(notifier) = &notifier {
                        if first {
                            notifier.notify_ready()?;
                            notifier.set_status("Disconnected".to_string())?;
                            first = false;
                        }
                    }

                    if cancelable(&run_token, tokio::time::sleep(Duration::from_millis(1234)))
                        .await
                        .is_err()
                    {
                        return Ok(());
                    }
                    continue;
                }
                Err(_) => return Ok(()),
            };

            info!("Connected to server");
            let mut buffer = BytesMut::with_capacity(40960);
            let mut last_watchdog = std::time::Instant::now();
            loop {
                if let Some(notifier) = &notifier {
                    let now = std::time::Instant::now();
                    if now.duration_since(last_watchdog).as_secs() > 30 {
                        notifier.ping_watchdog()?;
                        last_watchdog = now;
                    }
                }
                let mut start = buffer.len();
                let read = read.read_buf(&mut buffer);
                let send_failure = self.send_failure_notify.notified();
                let sleep = tokio::time::sleep(Duration::from_secs(120));
                tokio::select! {
                    val = read => {
                        match val {
                            Ok(r) if r == 0 => {
                                error!("Connection to server closed cleanly");
                                self.recv_failure_notify.notify_one();
                                break
                            }
                            Ok(_) => {}
                            Err(e) => {
                                error!("Failure reading from server: {}", e);
                                self.recv_failure_notify.notify_one();
                                break
                            }
                        }
                    }
                    _ = send_failure => {
                        break
                    }
                    _ = sleep => {
                        error!("Timoutout receiving message from server");
                        self.recv_failure_notify.notify_one();
                        break
                    }
                    _ = run_token.cancelled() => {
                        return Ok(())
                    }
                };
                loop {
                    if let Some(p) = buffer[start..].iter().position(|v| *v == 30) {
                        let o = buffer.split_to(start + p + 1);
                        let o = &o[..o.len() - 1];
                        start = 0;
                        match serde_json::from_slice(o) {
                            Ok(msg) => self.handle_message(msg),
                            Err(e) => warn!("Invalid message: {}\n{}", e, std::str::from_utf8(o)?),
                        }
                        continue;
                    }
                    break;
                }
                if buffer.capacity() == buffer.len() {
                    buffer.reserve(buffer.capacity());
                }
            }
            self.sender.lock().await.take();
            if let Some(notifier) = &notifier {
                notifier.set_status("Disconnected".to_string())?;
            }
        }
    }

    async fn read_persist_message(
        self: &Arc<Self>,
        read: &mut OwnedReadHalf,
        buf: &mut Vec<u8>,
    ) -> Result<(persist_daemon::Message, Option<OwnedFd>)> {
        let len = read.read_u32().await?;
        buf.resize(len.try_into()?, 0);
        read.read_exact(buf).await?;

        let message: persist_daemon::Message = serde_json::from_slice(buf)?;
        let fd = if message.with_fd() {
            Some(tokio_passfd::recv_fd(read).await?)
        } else {
            None
        };
        Ok((message, fd))
    }

    async fn handle_persist_input(
        self: Arc<Self>,
        run_token: RunToken,
        mut read: OwnedReadHalf,
    ) -> Result<()> {
        let mut buf = Vec::new();
        loop {
            let (message, fd) = match cancelable(
                &run_token,
                self.read_persist_message(&mut read, &mut buf),
            )
            .await
            {
                Ok(Ok(v)) => v,
                Ok(Err(e)) => return Err(e),
                Err(_) => return Ok(()),
            };
            if let persist_daemon::Message::ProcessDied { key, code } = message {
                info!("Process died {}: {}", key, code);
                if let Some(send) = self.dead_process_handlers.lock().unwrap().remove(&key) {
                    let _ = send.send(code);
                }
                continue;
            }
            let id = message.id();
            match self.persist_responses.lock().unwrap().remove(&id) {
                Some(v) => {
                    let _ = v.send((message, fd));
                }
                None => {
                    warn!("Got unexpected response from persist daemon");
                }
            }
        }
    }

    async fn send_daemon_control_message(
        socket: &mut UnixStream,
        message: DaemonControlMessage,
    ) -> Result<()> {
        let v = serde_json::to_vec(&message)?;
        socket.write_u32(v.len().try_into()?).await?;
        socket.write_all(&v).await?;
        socket.flush().await?;
        Ok(())
    }

    async fn handle_shutdown(self: Arc<Self>, socket: &mut UnixStream) -> Result<()> {
        let services = std::mem::take(&mut *self.services.lock().unwrap());
        let sock_lock = tokio::sync::Mutex::new(socket);
        futures_util::future::join_all(services.into_values().map(|s| {
            let mut lt = RemoteLogTarget::ServiceControlLock(&sock_lock);
            async move { s.stop_inner(&mut lt).await }
        }))
        .await;
        Ok(())
    }

    async fn handle_control_client_inner(
        self: Arc<Self>,
        run_token: &RunToken,
        socket: &mut UnixStream,
    ) -> Result<()> {
        let len = match cancelable(run_token, socket.read_u32()).await {
            Ok(v) => v?,
            Err(_) => return Ok(()),
        };
        let mut buf = Vec::new();
        buf.resize(len.try_into()?, 0);
        match cancelable(run_token, socket.read_exact(&mut buf)).await {
            Ok(v) => v?,
            Err(_) => return Ok(()),
        };
        let msg: DaemonControlMessage = serde_json::from_slice(&buf)?;

        match msg {
            DaemonControlMessage::Deploy(d) => {
                let service = self
                    .services
                    .lock()
                    .unwrap()
                    .entry(d.config.name.clone())
                    .or_insert_with(|| {
                        Arc::new(crate::client_daemon_service::Service::new(
                            self.clone(),
                            d.config.name.clone(),
                        ))
                    })
                    .clone();

                service
                    .deploy(
                        d.image,
                        *d.config,
                        None,
                        Default::default(),
                        "root".to_string(),
                        &mut RemoteLogTarget::ServiceControl(socket),
                    )
                    .await?;
            }
            DaemonControlMessage::Start(m) => {
                let service = self
                    .services
                    .lock()
                    .unwrap()
                    .get(&m.service)
                    .context("Unknown service")?
                    .clone();
                service
                    .start(&mut RemoteLogTarget::ServiceControl(socket))
                    .await?;
            }
            DaemonControlMessage::Stop(m) => {
                let service = self
                    .services
                    .lock()
                    .unwrap()
                    .get(&m.service)
                    .context("Unknown service")?
                    .clone();
                service
                    .stop(&mut RemoteLogTarget::ServiceControl(socket))
                    .await?;
            }
            DaemonControlMessage::Restart(m) => {
                let service = self
                    .services
                    .lock()
                    .unwrap()
                    .get(&m.service)
                    .context("Unknown service")?
                    .clone();
                service
                    .restart(&mut RemoteLogTarget::ServiceControl(socket))
                    .await?;
            }
            DaemonControlMessage::Status(m) => {
                if let Some(service) = m.service {
                    let service = self
                        .services
                        .lock()
                        .unwrap()
                        .get(&service)
                        .context("Unknown service")?
                        .clone();
                    if matches!(m.porcelain, Some(crate::service_control::Porcelain::V1)) {
                        let status = service.status_json().await?;
                        let v = serde_json::to_vec(&DaemonControlMessage::Stdout {
                            data: base64::encode(&serde_json::to_string_pretty(&status)?),
                        })?;
                        socket.write_u32(v.len().try_into()?).await?;
                        socket.write_all(&v).await?;
                        socket.flush().await?;
                    } else {
                        service
                            .status(&mut RemoteLogTarget::ServiceControl(socket), true)
                            .await?;
                    }
                } else {
                    let services: Vec<_> =
                        self.services.lock().unwrap().values().cloned().collect();
                    if matches!(m.porcelain, Some(crate::service_control::Porcelain::V1)) {
                        let mut status = BTreeMap::new();
                        for service in services {
                            status.insert(service.name().to_string(), service.status_json().await?);
                        }
                        let v = serde_json::to_vec(&DaemonControlMessage::Stdout {
                            data: base64::encode(&serde_json::to_string_pretty(&status)?),
                        })?;
                        socket.write_u32(v.len().try_into()?).await?;
                        socket.write_all(&v).await?;
                        socket.flush().await?;
                    } else {
                        let mut log = RemoteLogTarget::ServiceControl(socket);
                        if services.is_empty() {
                            log.stdout(b"No services registered\n").await?;
                        }
                        for service in services {
                            service.status(&mut log, false).await?;
                        }
                    }
                }
            }
            DaemonControlMessage::Remove(m) => {
                let service = self
                    .services
                    .lock()
                    .unwrap()
                    .get(&m.service)
                    .context("Unknown service")?
                    .clone();
                service
                    .remove(&mut RemoteLogTarget::ServiceControl(socket))
                    .await?;
                self.services.lock().unwrap().remove(&m.service);
            }
            DaemonControlMessage::Stdout { .. }
            | DaemonControlMessage::Stderr { .. }
            | DaemonControlMessage::Finished { .. } => bail!("Unsupported command"),
            DaemonControlMessage::Shutdown => {
                self.handle_shutdown(socket).await?;
            }
        }
        Self::send_daemon_control_message(socket, DaemonControlMessage::Finished { code: 0 })
            .await?;
        Ok(())
    }

    async fn handle_control_client(
        self: Arc<Self>,
        run_token: RunToken,
        mut socket: UnixStream,
    ) -> Result<()> {
        if let Err(e) = self
            .handle_control_client_inner(&run_token, &mut socket)
            .await
        {
            error!("Error in handle control client: {:?}", e);
            Self::send_daemon_control_message(
                &mut socket,
                DaemonControlMessage::Stderr {
                    data: base64::encode(format!("fatal error: {:?}\n", e)),
                },
            )
            .await?;

            Self::send_daemon_control_message(
                &mut socket,
                DaemonControlMessage::Finished { code: 1 },
            )
            .await?;
        }
        Ok(())
    }

    async fn run_control(self: Arc<Self>, run_token: RunToken) -> Result<()> {
        let _ = std::fs::remove_file(CONTROL_SOCKET_PATH);
        if let Some(p) = Path::new(CONTROL_SOCKET_PATH).parent() {
            std::fs::create_dir_all(p)?;
        }
        let listen = tokio::net::UnixListener::bind(CONTROL_SOCKET_PATH)?;
        loop {
            let (socket, _) = match cancelable(&run_token, listen.accept()).await {
                Ok(v) => v?,
                Err(_) => return Ok(()),
            };
            TaskBuilder::new("handle_control_client")
                .shutdown_order(CONTROL_ORDER)
                .create(|run_token| self.clone().handle_control_client(run_token, socket));
        }
    }
}

async fn connect_to_persist(retry: usize) -> Result<tokio::net::UnixStream> {
    let mut i = 0;
    let mut socket = loop {
        match tokio::net::UnixStream::connect(persist_daemon::SOCKET_PATH).await {
            Ok(v) => break v,
            Err(e) => {
                if i >= retry {
                    bail!("Unable to connect to persist daemon: {}", e);
                }
                i += 1;
                warn!("Unable to connect to persist daemon: {}, retry", e);
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }
        i += 1
    };

    let v = serde_json::to_vec(&persist_daemon::Message::GetProtocolVersion { id: 1 })?;
    socket.write_u32(v.len().try_into()?).await?;
    socket.write_all(&v).await?;
    loop {
        let len = timeout(Duration::from_secs(10), socket.read_u32()).await??;
        let mut buf = Vec::new();
        buf.resize(len.try_into()?, 0);
        timeout(Duration::from_secs(10), socket.read_exact(&mut buf)).await??;
        let msg: persist_daemon::Message = serde_json::from_slice(&buf)?;
        if msg.with_fd() {
            bail!("Will not read fd");
        }
        if let persist_daemon::Message::GetProtocolVersionResult { id, version } = msg {
            ensure!(id == 1, "Got unexpected protocol version result id {}", id);
            ensure!(
                version == persist_daemon::VERSION,
                "Got unexpected protocol version {}, try to restart the persist daemon",
                version
            );
            break;
        }
    }
    Ok(socket)
}

pub fn get_db() -> Result<rusqlite::Connection> {
    const DB_PATH: &str = "/var/cache/simpleadmin/client.db3";
    if let Some(parent) = Path::new(DB_PATH).parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Unable to create {:?}", parent))?;
    }

    let db = rusqlite::Connection::open(DB_PATH)
        .with_context(|| format!("Unable to open database {}", DB_PATH))?;

    db.execute(
        "CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            state TEXT NOT NULL
        )",
        (), // empty list of parameters.
    )?;
    db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS service_name ON services(name)",
        (),
    )?;
    Ok(db)
}

pub async fn client_daemon(config: Config, args: ClientDaemon) -> Result<()> {
    simple_logger::SimpleLogger::new()
        .with_level(args.log_level)
        .init()
        .unwrap();

    let journal_socket = tokio::net::UnixDatagram::unbound()?;
    journal_socket
        .connect("/run/systemd/journal/socket")
        .context("Unable to open /run/systemd/journal/socket")?;

    let db = Mutex::new(get_db()?);

    let persistent_con = connect_to_persist(10)
        .await
        .context("Unable to connect to persist daemon")?;
    info!("Connected to persist daemon");

    let (persist_read, persist_write) = persistent_con.into_split();
    let mut root_cert_store = rustls::RootCertStore::empty();

    root_cert_store.add_server_trust_anchors(webpki_roots::TLS_SERVER_ROOTS.0.iter().map(|ta| {
        OwnedTrustAnchor::from_subject_spki_name_constraints(
            ta.subject,
            ta.spki,
            ta.name_constraints,
        )
    }));

    let client_config = rustls::ClientConfig::builder()
        .with_safe_defaults()
        .with_root_certificates(root_cert_store)
        .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(client_config));

    let idc = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)?
        .as_micros() as u64;

    let client = Arc::new(Client {
        connector,
        config,
        db,
        command_tasks: Default::default(),
        send_failure_notify: Default::default(),
        recv_failure_notify: Default::default(),
        new_send_notify: Default::default(),
        sender: Default::default(),
        script_stdin: Default::default(),
        persist_responses: Default::default(),
        persist_idc: AtomicU64::new(idc),
        persist_sender: tokio::sync::Mutex::new(persist_write),
        dead_process_handlers: Default::default(),
        services: Default::default(),
        journal_socket,
    });

    TaskBuilder::new("run_control")
        .main()
        .shutdown_order(CONTROL_ORDER)
        .create(|run_token| client.clone().run_control(run_token));

    TaskBuilder::new("load_services")
        .critical()
        .shutdown_order(CONTROL_ORDER)
        .create(|run_token| client.clone().load_services(run_token));

    TaskBuilder::new("handle_persist_input")
        .shutdown_order(PERSIST_ORDER)
        .main()
        .create(|run_token| client.clone().handle_persist_input(run_token, persist_read));

    TaskBuilder::new("run")
        .shutdown_order(UPSTREAM_ORDER)
        .main()
        .create(|run_token| client.clone().run(run_token));

    tokio::spawn(async {
        tokio::signal::ctrl_c().await.unwrap();
        tokio_tasks::shutdown("ctrl+c".to_string());
    });

    tokio::spawn(async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .unwrap()
            .recv()
            .await;
        tokio_tasks::shutdown("terminate".to_string());
    });

    tokio_tasks::run_tasks().await;
    Ok(())
}
