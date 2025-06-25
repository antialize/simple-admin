use std::{
    collections::{BTreeMap, HashMap},
    future::Future,
    io::Write,
    net::{SocketAddr, ToSocketAddrs},
    ops::DerefMut,
    os::unix::{
        fs::PermissionsExt,
        prelude::{AsRawFd, BorrowedFd, OwnedFd},
        process::ExitStatusExt,
    },
    path::Path,
    process::Stdio,
    sync::{Arc, Mutex, atomic::AtomicU64},
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail, ensure};
use base64::{Engine, prelude::BASE64_STANDARD};
use bytes::BytesMut;
use futures::{future, pin_mut};
use log::{debug, error, info, warn};
use nix::{sys::signal::Signal, unistd::Pid};
use reqwest::Url;
use serde::Deserialize;
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt, ReadHalf, WriteHalf},
    net::{
        TcpStream, UnixStream,
        unix::{OwnedReadHalf, OwnedWriteHalf},
    },
    pin,
    process::{Child, ChildStdin},
    select,
    sync::{
        Notify,
        mpsc::{UnboundedReceiver, UnboundedSender},
    },
    time::timeout,
};
use tokio_rustls::{TlsConnector, client::TlsStream, rustls};
use tokio_tasks::{CancelledError, RunToken, Task, TaskBase, TaskBuilder, cancelable};

use sadmin2::client_message::{
    ClientHostMessage, CommandSpawnMessage, DataMessage, DataSource, DeployServiceMessage,
    FailureMessage, FailureType, HostClientMessage, RunInstantMessage, RunInstantStdinOutputType,
    RunScriptMessage, RunScriptOutType, RunScriptStdinType, SuccessMessage,
};

use sadmin2::service_description::ServiceDescription;

use crate::{
    client_daemon_service::RemoteLogTarget,
    connection::Config,
    persist_daemon,
    service_control::DaemonControlMessage,
    tokio_passfd::{self},
};
use sdnotify::SdNotify;

pub const CONTROL_SOCKET_PATH: &str = "/run/simpleadmin/control.socket";

pub const JOB_ORDER: i32 = -20;
pub const CONTROL_ORDER: i32 = -15;
pub const SERVICE_ORDER: i32 = -0;
pub const UPSTREAM_ORDER: i32 = 10;
pub const PERSIST_ORDER: i32 = 20;

/// Return result from fut, unless run_token is canceled before fut is done
pub async fn cancelable_delay<T, F: Future<Output = T>>(
    run_token: &RunToken,
    delay: Duration,
    fut: F,
) -> Result<T, CancelledError> {
    let c = run_token.cancelled();
    pin_mut!(fut, c);
    let f = future::select(c, &mut fut).await;
    if let future::Either::Right((v, _)) = f {
        return Ok(v);
    }
    let s = tokio::time::sleep(delay);
    pin_mut!(s);
    let f = future::select(s, fut).await;
    match f {
        future::Either::Right((v, _)) => Ok(v),
        future::Either::Left(_) => Err(CancelledError {}),
    }
}

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

pub type PersistMessageSender =
    tokio::sync::oneshot::Sender<(persist_daemon::Message, Option<OwnedFd>)>;

enum SocketWrite {
    Unix(tokio::net::unix::OwnedWriteHalf),
    Tcp(tokio::net::tcp::OwnedWriteHalf),
}

enum SocketRead {
    Unix(tokio::net::unix::OwnedReadHalf),
    Tcp(tokio::net::tcp::OwnedReadHalf),
}

pub struct Socket {
    task: Arc<Task<(), anyhow::Error>>,
    write: tokio::sync::Mutex<Option<SocketWrite>>,
}

pub struct Client {
    connector: TlsConnector,
    pub config: Config,
    command_tasks: Mutex<HashMap<u64, Arc<dyn TaskBase>>>,
    send_failure_notify: Notify,
    sender_clear: Notify,
    new_send_notify: Notify,
    sender: tokio::sync::Mutex<
        Option<WriteHalf<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>>,
    >,
    script_stdin: Mutex<HashMap<u64, UnboundedSender<DataMessage>>>,
    persist_responses: Mutex<HashMap<u64, PersistMessageSender>>,
    persist_idc: AtomicU64,
    persist_sender: tokio::sync::Mutex<OwnedWriteHalf>,
    password: String,
    metrics_token: Option<String>,
    sockets: Mutex<HashMap<u64, Arc<Socket>>>,

    command_pids: Mutex<HashMap<u64, u32>>,
    command_stdins: Mutex<HashMap<u64, Arc<tokio::sync::Mutex<ChildStdin>>>>,

    pub db: Mutex<rusqlite::Connection>,
    pub dead_process_handlers: Mutex<HashMap<String, tokio::sync::oneshot::Sender<i32>>>,

    pub services: Mutex<HashMap<String, Arc<crate::client_daemon_service::Service>>>,
    pub journal_socket: tokio::net::UnixDatagram,
}

async fn write_all_and_flush(v: &mut WriteHalf<TlsStream<TcpStream>>, data: &[u8]) -> Result<()> {
    v.write_all(data).await?;
    v.flush().await?;
    Ok(())
}

impl Client {
    pub async fn send_message(self: &Arc<Self>, message: ClientHostMessage) {
        let mut message = serde_json::to_vec(&message).unwrap();
        if message.contains(&30) {
            panic!("Failed to encode message, it contains 30");
        }
        message.push(30);
        loop {
            let mut s = self.sender.lock().await;
            if let Some(v) = s.deref_mut() {
                let write_all = write_all_and_flush(v, &message);
                let sender_clear = self.sender_clear.notified();
                let sleep = tokio::time::sleep(Duration::from_secs(40));
                tokio::select!(
                    val = write_all => {
                        if let Err(e) = val {
                            // The send errored out, notify the recv half so we can try to initiate a new connection
                            error!("Failed sending message to backend: {}", e);
                            self.send_failure_notify.notify_one();
                            *s = None
                        }
                        break
                    }
                    _ = sender_clear => {},
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
            info!("We do not currently have a send socket so lets wait for one");
            std::mem::drop(s);
            self.new_send_notify.notified().await;
        }
    }

    async fn handle_ping(self: Arc<Self>, id: u64) {
        debug!("Ping from server {}", id);
        self.send_message(ClientHostMessage::Pong { id }).await;
    }

    async fn handle_run_instant_inner(
        self: &Arc<Self>,
        run_token: &RunToken,
        msg: RunInstantMessage,
    ) -> Result<ClientHostMessage> {
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
        run_token.set_location(file!(), line!());
        let output = cmd.output().await?;
        run_token.set_location(file!(), line!());
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
            return Ok(ClientHostMessage::Failure(FailureMessage {
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
            RunInstantStdinOutputType::Base64 => BASE64_STANDARD.encode(&output.stdout).into(),
            RunInstantStdinOutputType::Json => serde_json::from_slice(&output.stdout)?,
            RunInstantStdinOutputType::Utf8 => String::from_utf8(output.stdout)?.into(),
        };
        Ok(ClientHostMessage::Success(SuccessMessage {
            id: msg.id,
            code: None,
            data: Some(data),
        }))
    }

    async fn handle_run_instant(
        self: Arc<Self>,
        run_token: RunToken,
        msg: RunInstantMessage,
    ) -> Result<()> {
        debug!("Start instant command {}: {}", msg.id, msg.name);
        let id = msg.id;
        run_token.set_location(file!(), line!());
        let m = match self.handle_run_instant_inner(&run_token, msg).await {
            Ok(v) => v,
            Err(e) => {
                error!("Error in instant command {}: {}", id, e);
                ClientHostMessage::Failure(FailureMessage {
                    id,
                    failure_type: Some(FailureType::Exception),
                    message: Some(e.to_string()),
                    ..Default::default()
                })
            }
        };
        run_token.set_location(file!(), line!());
        self.send_message(m).await;
        run_token.set_location(file!(), line!());
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
                    self.send_message(ClientHostMessage::Data(DataMessage {
                        id,
                        source: Some(source),
                        data: BASE64_STANDARD.encode(&buf).into(),
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
                        self.send_message(ClientHostMessage::Data(DataMessage {
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
                        self.send_message(ClientHostMessage::Data(DataMessage {
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
                Some(v) => BASE64_STANDARD.decode(v)?,
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
    ) -> Result<ClientHostMessage> {
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
            return Ok(ClientHostMessage::Failure(FailureMessage {
                id: msg.id,
                code,
                failure_type: Some(FailureType::Script),
                ..Default::default()
            }));
        }
        stdout_result.unwrap()?;
        stderr_result.unwrap()?;
        Ok(ClientHostMessage::Success(SuccessMessage {
            id: msg.id,
            code: Some(0),
            data: None,
        }))
    }

    async fn handle_run_script(
        self: Arc<Self>,
        run_token: RunToken,
        msg: RunScriptMessage,
        recv: UnboundedReceiver<DataMessage>,
    ) -> Result<()> {
        debug!("Start run script {}: {}", msg.id, msg.name);
        let id = msg.id;
        let m = match cancelable_delay(
            &run_token,
            std::time::Duration::from_secs(30),
            self.handle_run_script_inner(msg, recv),
        )
        .await
        {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => ClientHostMessage::Failure(FailureMessage {
                id,
                failure_type: Some(FailureType::Exception),
                message: Some(e.to_string()),
                ..Default::default()
            }),
            Err(_) => ClientHostMessage::Failure(FailureMessage {
                id,
                failure_type: Some(FailureType::Exception),
                message: Some("Timeout".to_string()),
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
    ) -> Result<ClientHostMessage> {
        let d: ServiceDescription = serde_yaml::from_str(&msg.description)
            .with_context(|| format!("Parsing description: '{}'", msg.description))?;

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

        Ok(ClientHostMessage::Success(SuccessMessage {
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
                self.send_message(ClientHostMessage::Data(DataMessage {
                    id,
                    source: Some(DataSource::Stderr),
                    data: BASE64_STANDARD
                        .encode(format!("Error deploying service: {e:?}"))
                        .into(),
                    eof: Some(true),
                }))
                .await;
                ClientHostMessage::Failure(FailureMessage {
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
                self.send_message(ClientHostMessage::Failure(FailureMessage {
                    id,
                    failure_type: Some(FailureType::UnknownTask),
                    message: Some("Unknown task".to_string()),
                    ..Default::default()
                }))
                .await
            }
        }
    }

    async fn handle_read_file(self: Arc<Self>, id: u64, path: String) {
        match tokio::fs::read(&path).await {
            Ok(v) => {
                self.send_message(ClientHostMessage::ReadFileResult {
                    id,
                    content: BASE64_STANDARD.encode(v),
                })
                .await;
            }
            Err(e) => {
                self.send_message(ClientHostMessage::Failure(FailureMessage {
                    id,
                    failure_type: Some(FailureType::UnknownTask),
                    message: Some(format!("Unable to read file {}: {:?}", path, e)),
                    ..Default::default()
                }))
                .await;
            }
        }
    }

    async fn handle_write_file_inner(
        &self,
        path: &str,
        content: &str,
        mode: Option<u32>,
    ) -> Result<()> {
        let content = BASE64_STANDARD.decode(content)?;
        tokio::fs::write(path, content).await?;
        if let Some(mode) = mode {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))?;
        }
        Ok(())
    }

    async fn handle_write_file(
        self: Arc<Self>,
        id: u64,
        path: String,
        content: String,
        mode: Option<u32>,
    ) {
        match self.handle_write_file_inner(&path, &content, mode).await {
            Ok(()) => {
                self.send_message(ClientHostMessage::Success(SuccessMessage {
                    id,
                    code: None,
                    data: None,
                }))
                .await;
            }
            Err(e) => {
                self.send_message(ClientHostMessage::Failure(FailureMessage {
                    id,
                    failure_type: Some(FailureType::UnknownTask),
                    message: Some(format!("Unable to write file {}: {:?}", path, e)),
                    ..Default::default()
                }))
                .await;
            }
        }
    }

    async fn send_result(self: Arc<Self>, id: u64, r: Result<()>) {
        match r {
            Ok(_) => {
                self.send_message(ClientHostMessage::Success(SuccessMessage {
                    id,
                    ..Default::default()
                }))
                .await;
            }
            Err(e) => {
                self.send_message(ClientHostMessage::Failure(FailureMessage {
                    id,
                    message: Some(format!("{:?}", e)),
                    ..Default::default()
                }))
                .await;
            }
        }
    }

    async fn handle_socket(
        self: Arc<Self>,
        socket_id: u64,
        rt: RunToken,
        mut r: SocketRead,
    ) -> Result<()> {
        let mut buf = BytesMut::with_capacity(1024 * 64);
        loop {
            let r = match &mut r {
                SocketRead::Unix(r) => cancelable(&rt, r.read_buf(&mut buf)).await,
                SocketRead::Tcp(r) => cancelable(&rt, r.read_buf(&mut buf)).await,
            };
            match r {
                Ok(Ok(0)) => break,
                Ok(Ok(_)) => (),
                Ok(Err(_)) => break,
                Err(_) => {
                    self.sockets.lock().unwrap().remove(&socket_id);
                    return Ok(());
                }
            }
            let data = BASE64_STANDARD.encode(&buf);
            self.send_message(ClientHostMessage::SocketRecv {
                socket_id,
                data: Some(data),
            })
            .await;
            buf.clear();
        }
        self.send_message(ClientHostMessage::SocketRecv {
            socket_id,
            data: None,
        })
        .await;
        self.sockets.lock().unwrap().remove(&socket_id);
        Ok(())
    }

    async fn handle_socket_connect_inner(
        self: &Arc<Self>,
        socket_id: u64,
        dst: String,
    ) -> Result<()> {
        if self.sockets.lock().unwrap().contains_key(&socket_id) {
            bail!("socket_id already in use");
        }
        let (r, w) = if dst.contains(':') && !dst.contains("/") {
            let s = tokio::net::TcpStream::connect(&dst)
                .await
                .with_context(|| format!("Unable to connect to {}", dst))?;
            let (r, w) = s.into_split();
            (SocketRead::Tcp(r), SocketWrite::Tcp(w))
        } else {
            let s = tokio::net::UnixStream::connect(&dst)
                .await
                .with_context(|| format!("Unable to connect to {}", dst))?;
            let (r, w) = s.into_split();
            (SocketRead::Unix(r), SocketWrite::Unix(w))
        };
        let s2 = self.clone();
        let task = TaskBuilder::new(format!("handle_tcp_socket_{}", socket_id))
            .shutdown_order(-99)
            .create(|rt| async move { s2.handle_socket(socket_id, rt, r).await });

        self.sockets.lock().unwrap().insert(
            socket_id,
            Arc::new(Socket {
                task,
                write: tokio::sync::Mutex::new(Some(w)),
            }),
        );
        Ok(())
    }

    async fn handle_socket_connect(self: Arc<Self>, id: u64, socket_id: u64, dst: String) {
        let r = self.handle_socket_connect_inner(socket_id, dst).await;
        self.send_result(id, r).await;
    }

    async fn handle_socket_close_inner(self: &Arc<Self>, socket_id: u64) -> Result<()> {
        let conn = self
            .sockets
            .lock()
            .unwrap()
            .remove(&socket_id)
            .with_context(|| format!("Unknown socket {}", socket_id))?;
        conn.task.run_token().cancel();
        if let Err(e) = conn.task.clone().wait().await {
            match e {
                tokio_tasks::WaitError::HandleUnset(e) => bail!("Handle unset {}", e),
                tokio_tasks::WaitError::JoinError(e) => bail!("Join error {:?}", e),
                tokio_tasks::WaitError::TaskFailure(_) => (),
            }
        }
        Ok(())
    }

    async fn handle_socket_close(self: Arc<Self>, id: u64, socket_id: u64) {
        let r = self.handle_socket_close_inner(socket_id).await;
        self.send_result(id, r).await;
    }

    async fn handle_socket_send_inner(
        self: &Arc<Self>,
        socket_id: u64,
        data: Option<String>,
    ) -> Result<()> {
        let conn = self
            .sockets
            .lock()
            .unwrap()
            .get(&socket_id)
            .with_context(|| format!("Unknown socket {}", socket_id))?
            .clone();
        if let Some(data) = data {
            let mut conn = conn.write.lock().await;
            let Some(w) = &mut *conn else {
                bail!("Write half closed");
            };
            match w {
                SocketWrite::Unix(w) => {
                    w.write_all(&BASE64_STANDARD.decode(&data)?).await?;
                    w.flush().await?;
                }
                SocketWrite::Tcp(w) => {
                    w.write_all(&BASE64_STANDARD.decode(&data)?).await?;
                    w.flush().await?;
                }
            }
        } else {
            let w = conn.write.lock().await.take();
            if let Some(mut w) = w {
                match &mut w {
                    SocketWrite::Unix(w) => w.shutdown().await?,
                    SocketWrite::Tcp(w) => w.shutdown().await?,
                }
            }
        }
        Ok(())
    }

    async fn handle_socket_send(self: Arc<Self>, id: u64, socket_id: u64, data: Option<String>) {
        let r = self.handle_socket_send_inner(socket_id, data).await;
        self.send_result(id, r).await;
    }

    pub async fn handle_command(
        self: Arc<Self>,
        rt: RunToken,
        mut child: Child,
        command_id: u64,
    ) -> Result<()> {
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let mut do_handle_stdout = true;
        let s2: Arc<Client> = self.clone();
        let handle_stdout = async move {
            let Some(mut fd) = stdout else {
                return Ok::<_, anyhow::Error>(());
            };
            let mut buf = BytesMut::with_capacity(64 * 1024);
            loop {
                buf.clear();
                match fd.read_buf(&mut buf).await {
                    Ok(0) => break,
                    Ok(_) => {
                        s2.send_message(ClientHostMessage::CommandStdout {
                            command_id,
                            data: Some(BASE64_STANDARD.encode(&buf)),
                        })
                        .await;
                    }
                    Err(e) => bail!("Failed to read from child {:?}", e),
                }
            }
            s2.send_message(ClientHostMessage::CommandStdout {
                command_id,
                data: None,
            })
            .await;
            Ok(())
        };

        let mut do_handle_stderr = true;
        let s2: Arc<Client> = self.clone();
        let handle_stderr = async move {
            let Some(mut fd) = stderr else {
                return Ok::<_, anyhow::Error>(());
            };
            let mut buf = BytesMut::with_capacity(64 * 1024);
            loop {
                buf.clear();
                match fd.read_buf(&mut buf).await {
                    Ok(0) => break,
                    Ok(_) => {
                        s2.send_message(ClientHostMessage::CommandStderr {
                            command_id,
                            data: Some(BASE64_STANDARD.encode(&buf)),
                        })
                        .await;
                    }
                    Err(e) => bail!("Failed to read from child {:?}", e),
                }
            }
            s2.send_message(ClientHostMessage::CommandStderr {
                command_id,
                data: None,
            })
            .await;
            Ok(())
        };

        pin!(handle_stdout, handle_stderr);

        while do_handle_stdout || do_handle_stderr {
            select! {
                _ = rt.cancelled() => {
                    return Ok(())
                },
                r = &mut handle_stdout, if do_handle_stdout => {
                    r?;
                    do_handle_stdout = false;
                },
                r = &mut handle_stderr, if do_handle_stderr => {
                    r?;
                    do_handle_stderr = false;
                }
            }
        }

        let r = cancelable(&rt, child.wait()).await;
        self.command_pids.lock().unwrap().remove(&command_id);
        self.command_stdins.lock().unwrap().remove(&command_id);
        let w = r??;
        let code = w.code().unwrap_or_default();
        let signal = w.signal();

        self.send_message(ClientHostMessage::CommandFinished {
            command_id,
            code,
            signal,
        })
        .await;
        Ok(())
    }

    pub async fn handle_command_spawn_inner(
        self: &Arc<Self>,
        msg: CommandSpawnMessage,
    ) -> Result<()> {
        if self
            .command_pids
            .lock()
            .unwrap()
            .contains_key(&msg.command_id)
        {
            bail!("command_id is is use");
        }
        let mut cmd = tokio::process::Command::new(msg.program);
        cmd.args(msg.args);
        if let Some(env) = msg.env {
            cmd.envs(env);
        }
        if let Some(cwd) = msg.cwd {
            cmd.current_dir(cwd);
        }

        if msg.forward_stdin {
            cmd.stdin(Stdio::piped());
        } else {
            cmd.stdin(Stdio::null());
        }
        if msg.forward_stdout {
            cmd.stdout(Stdio::piped());
        } else {
            cmd.stdout(Stdio::null());
        }
        if msg.forward_stderr {
            cmd.stderr(Stdio::piped());
        } else {
            cmd.stderr(Stdio::null());
        }
        cmd.kill_on_drop(true);

        let mut child = cmd.spawn().context("Failed to spawn command")?;

        self.command_pids
            .lock()
            .unwrap()
            .insert(msg.command_id, child.id().context("missing pid")?);
        if let Some(stdin) = child.stdin.take() {
            self.command_stdins
                .lock()
                .unwrap()
                .insert(msg.command_id, Arc::new(tokio::sync::Mutex::new(stdin)));
        }

        let s2 = self.clone();
        TaskBuilder::new(format!("handle_command_{}", msg.command_id))
            .shutdown_order(0)
            .create(|rt| async move { s2.handle_command(rt, child, msg.command_id).await });

        Ok(())
    }

    pub async fn handle_command_spawn(self: Arc<Self>, msg: CommandSpawnMessage) {
        let id = msg.id;
        let r = self.handle_command_spawn_inner(msg).await;
        self.send_result(id, r).await;
    }

    pub async fn handle_command_stdin_inner(
        self: &Arc<Self>,
        command_id: u64,
        data: Option<String>,
    ) -> Result<()> {
        if let Some(data) = data {
            let data = BASE64_STANDARD.decode(&data)?;
            let Some(stdin) = self
                .command_stdins
                .lock()
                .unwrap()
                .get(&command_id)
                .cloned()
            else {
                bail!("Stdin is closed");
            };
            let mut stdin = stdin.lock().await;
            stdin.write_all(&data).await?;
            stdin.flush().await?;
        } else {
            self.command_stdins.lock().unwrap().remove(&command_id);
        }
        Ok(())
    }

    pub async fn handle_command_stdin(
        self: Arc<Self>,
        id: u64,
        command_id: u64,
        data: Option<String>,
    ) {
        let r = self.handle_command_stdin_inner(command_id, data).await;
        self.send_result(id, r).await;
    }

    pub async fn handle_command_signal_inner(
        self: &Arc<Self>,
        command_id: u64,
        signal: i32,
    ) -> Result<()> {
        let Some(pid) = self.command_pids.lock().unwrap().get(&command_id).copied() else {
            bail!("Command not found");
        };
        let signal = Signal::try_from(signal)?;
        let pid = Pid::from_raw(pid as nix::libc::pid_t);
        nix::sys::signal::kill(pid, signal).context("Kill failed")?;
        Ok(())
    }

    pub async fn handle_command_signal(self: Arc<Self>, id: u64, command_id: u64, signal: i32) {
        let r = self.handle_command_signal_inner(command_id, signal).await;
        self.send_result(id, r).await;
    }

    fn handle_message(self: &Arc<Self>, message: HostClientMessage) {
        match message {
            HostClientMessage::Data(d) => {
                if let Some(v) = self.script_stdin.lock().unwrap().get(&d.id) {
                    let _ = v.send(d);
                }
            }
            HostClientMessage::RunInstant(ri) => {
                let id = ri.id;

                let task = TaskBuilder::new(format!("run_instant_{id}"))
                    .shutdown_order(JOB_ORDER)
                    .create(|run_token| self.clone().handle_run_instant(run_token, ri));

                self.command_tasks.lock().unwrap().insert(id, task);
            }
            HostClientMessage::RunScript(ri) => {
                let (send, recv) = tokio::sync::mpsc::unbounded_channel();
                let id = ri.id;
                if let Some(input_json) = &ri.input_json {
                    send.send(DataMessage {
                        id,
                        source: None,
                        data: BASE64_STANDARD
                            .encode(serde_json::to_string(input_json).unwrap())
                            .into(),
                        eof: Some(true),
                    })
                    .unwrap();
                } else {
                    self.script_stdin.lock().unwrap().insert(id, send);
                }

                let task = TaskBuilder::new(format!("run_script_{id}"))
                    .shutdown_order(JOB_ORDER)
                    .create(|run_token| self.clone().handle_run_script(run_token, ri, recv));

                self.command_tasks.lock().unwrap().insert(id, task);
            }
            HostClientMessage::DeployService(ds) => {
                let id = ds.id;
                TaskBuilder::new(format!("deploy_service_{id}"))
                    .shutdown_order(JOB_ORDER)
                    .create(|run_token| self.clone().handle_deploy_service(run_token, ds));
            }
            HostClientMessage::Ping { id } => {
                tokio::spawn(self.clone().handle_ping(id));
            }
            HostClientMessage::Kill { id } => {
                tokio::spawn(self.clone().handle_kill(id));
            }
            HostClientMessage::ReadFile { id, path } => {
                tokio::spawn(self.clone().handle_read_file(id, path));
            }
            HostClientMessage::WriteFile {
                id,
                path,
                content,
                mode,
            } => {
                tokio::spawn(self.clone().handle_write_file(id, path, content, mode));
            }
            HostClientMessage::SocketConnect { id, socket_id, dst } => {
                tokio::spawn(self.clone().handle_socket_connect(id, socket_id, dst));
            }
            HostClientMessage::SocketClose { id, socket_id } => {
                tokio::spawn(self.clone().handle_socket_close(id, socket_id));
            }
            HostClientMessage::SocketSend {
                id,
                socket_id,
                data,
            } => {
                tokio::spawn(self.clone().handle_socket_send(id, socket_id, data));
            }
            HostClientMessage::CommandSpawn(msg) => {
                tokio::spawn(self.clone().handle_command_spawn(msg));
            }
            HostClientMessage::CommandStdin {
                id,
                command_id,
                data,
            } => {
                tokio::spawn(self.clone().handle_command_stdin(id, command_id, data));
            }
            HostClientMessage::CommandSignal {
                id,
                command_id,
                signal,
            } => {
                tokio::spawn(self.clone().handle_command_signal(id, command_id, signal));
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

    pub async fn persist_put_fd(&self, key: String, fd: BorrowedFd<'_>, loc: &str) -> Result<()> {
        info!("persist_put_fd {}: {} @ {}", key, fd.as_raw_fd(), loc);
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

    pub async fn persist_close_fd(&self, key: &str, loc: &str) -> Result<()> {
        info!("persist_close_fd {} @ {}", key, loc);
        self.send_persist_request_success(
            persist_daemon::Message::CloseFd {
                id: self.next_persist_idc(),
                key: key.to_string(),
            },
            None,
        )
        .await
        .with_context(|| format!("Close fd {key}"))
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
        let domain = rustls::pki_types::ServerName::try_from(server_host.as_str())?.to_owned();
        let (read, mut write) = tokio::io::split(self.connector.connect(domain, stream).await?);

        let mut auth_message = serde_json::to_vec(&ClientHostMessage::Auth {
            hostname: self.config.hostname.as_ref().unwrap().clone(),
            password: self.password.clone(),
        })?;
        auth_message.push(30);
        write_all_and_flush(&mut write, &auth_message).await?;

        *self.sender.lock().await = Some(write);
        self.new_send_notify.notify_one();
        Ok(read)
    }

    async fn run(self: Arc<Self>, run_token: RunToken) -> Result<()> {
        let notifier = SdNotify::from_env().ok();
        let mut first = true;
        loop {
            run_token.set_location(file!(), line!());
            let mut read = match cancelable(
                &run_token,
                timeout(Duration::from_secs(60), self.connect_to_upstream()),
            )
            .await
            {
                Ok(Ok(Ok(read))) => {
                    if let Some(notifier) = &notifier {
                        if first {
                            notifier.notify_ready()?;
                            first = false;
                        }
                        notifier.set_status("Connected".to_string())?;
                    }
                    read
                }
                Ok(Ok(Err(e))) => {
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
                Ok(Err(_)) => {
                    info!("Timeout connecting to upstream");
                    continue;
                }
                Err(_) => return Ok(()),
            };
            run_token.set_location(file!(), line!());
            info!("Connected to server");
            let mut last_ping_time = Instant::now();
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
                run_token.set_location(file!(), line!());
                tokio::select! {
                    val = read => {
                        match val {
                            Ok(0) => {
                                error!("Connection to server closed cleanly");
                                break
                            }
                            Ok(_) => {}
                            Err(e) => {
                                error!("Failure reading from server: {}", e);
                                break
                            }
                        }
                    }
                    _ = send_failure => {
                        break
                    }
                    _ = sleep => {
                        error!("Timoutout receiving message from server");
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
                            Ok(msg) => {
                                if matches!(msg, HostClientMessage::Ping { .. }) {
                                    last_ping_time = Instant::now();
                                }
                                self.handle_message(msg)
                            }
                            Err(e) => warn!("Invalid message: {}\n{}", e, std::str::from_utf8(o)?),
                        }
                        continue;
                    }
                    break;
                }
                if buffer.capacity() == buffer.len() {
                    buffer.reserve(buffer.capacity());
                }
                if last_ping_time.elapsed().as_secs_f32() > 200.0 {
                    error!("Timout receivivg ping from server");
                    break;
                }
            }
            info!("Trying to take sender for disconnect");
            run_token.set_location(file!(), line!());
            {
                let f = async {
                    loop {
                        self.sender_clear.notify_waiters();
                        self.sender_clear.notify_one();
                        tokio::time::sleep(Duration::from_millis(1)).await
                    }
                };
                tokio::select! {
                    mut l = self.sender.lock() => {
                        let _sender = l.take();
                    }
                    () = f => {panic!()}
                }
            }
            run_token.set_location(file!(), line!());
            info!("Took sender for disconnect");
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
        let mut buf = vec![0; len.try_into()?];
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
                            data: BASE64_STANDARD.encode(serde_json::to_string_pretty(&status)?),
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
                            data: BASE64_STANDARD.encode(serde_json::to_string_pretty(&status)?),
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
                    data: BASE64_STANDARD.encode(format!("fatal error: {e:?}\n")),
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

    async fn get_metrics(self: &Arc<Self>) -> Result<String> {
        let services = self.services.lock().unwrap().clone();

        let res = futures_util::future::join_all(
            services.into_values().map(|service| service.get_metrics()),
        )
        .await;
        let res: Vec<_> = res.into_iter().flatten().collect();
        Ok(res.join(""))
    }

    async fn handle_web_request(
        self: Arc<Self>,
        r: hyper::Request<hyper::body::Incoming>,
    ) -> Result<hyper::Response<http_body_util::Full<bytes::Bytes>>> {
        if r.uri().path() == "/metrics" {
            if let Some(token) = &self.metrics_token {
                let url = match Url::parse(&r.uri().to_string()) {
                    Ok(v) => v,
                    Err(e) => {
                        return Ok(hyper::Response::builder()
                            .status(500)
                            .body(format!("Invalid url:\n{e:?}").into())?);
                    }
                };
                if !url
                    .query_pairs()
                    .any(|(k, v)| k == "token" && v.as_ref() == token)
                {
                    return Ok(hyper::Response::builder()
                        .status(403)
                        .body("Invalid token".into())?);
                }
            }
            match self.get_metrics().await {
                Ok(v) => Ok(hyper::Response::builder().status(200).body(v.into())?),
                Err(e) => Ok(hyper::Response::builder()
                    .status(500)
                    .body(format!("Failed producing metrics:\n{e:?}").into())?),
            }
        } else {
            Ok(hyper::Response::builder()
                .status(404)
                .body("Not found".into())?)
        }
    }

    async fn handle_web_connection(
        self: Arc<Self>,
        socket: tokio::net::TcpStream,
        addr: SocketAddr,
        run_token: RunToken,
    ) -> Result<()> {
        if let Ok(Err(e)) = cancelable(
            &run_token,
            hyper_util::server::conn::auto::Builder::new(hyper_util::rt::TokioExecutor::new())
                .serve_connection(
                    hyper_util::rt::TokioIo::new(socket),
                    hyper::service::service_fn(|r: hyper::Request<hyper::body::Incoming>| {
                        self.clone().handle_web_request(r)
                    }),
                ),
        )
        .await
        {
            error!("Error handeling web request from {addr:?}: {e:?}");
        }
        Ok(())
    }

    async fn webserver(self: Arc<Self>, run_token: RunToken) -> Result<()> {
        let port = match std::env::var("WEB_PORT") {
            Ok(v) => v.parse()?,
            Err(_) => 674,
        };

        let addr: SocketAddr = ([127, 0, 0, 1], port).into();
        let listener = tokio::net::TcpListener::bind(addr).await?;

        loop {
            let (sock, addr) = match cancelable(&run_token, listener.accept()).await {
                Ok(v) => v?,
                Err(_) => break,
            };

            TaskBuilder::new("web_connection")
                .create(|run_token| self.clone().handle_web_connection(sock, addr, run_token));
        }

        Ok(())
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
        let mut buf = vec![0; len.try_into()?];
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
        std::fs::create_dir_all(parent).with_context(|| format!("Unable to create {parent:?}"))?;
    }

    let db = rusqlite::Connection::open(DB_PATH)
        .with_context(|| format!("Unable to open database {DB_PATH}"))?;

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

async fn handle_usr2(client: Arc<Client>) -> Result<()> {
    let mut usr2 = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::user_defined2())?;
    while usr2.recv().await.is_some() {
        info!("=======> Debug output triggered <======");
        info!("Tasks:");
        for task in tokio_tasks::list_tasks() {
            if let Some((file, line)) = task.run_token().location() {
                info!(
                    "  {} id={} @{}:{} start_time={} shutdown_order={}",
                    task.name(),
                    task.id(),
                    file,
                    line,
                    task.start_time(),
                    task.shutdown_order()
                );
            } else {
                info!(
                    "  {} id={} start_time={} shutdown_order={}",
                    task.name(),
                    task.id(),
                    task.start_time(),
                    task.shutdown_order()
                );
            }
        }

        info!("Script stdin:");
        for k in client.script_stdin.lock().unwrap().keys() {
            info!("  {}", k);
        }

        info!("persist_responses:");
        for k in client.persist_responses.lock().unwrap().keys() {
            info!("  {}", k);
        }

        info!("Command_tasks:");
        for (k, v) in client.command_tasks.lock().unwrap().iter() {
            info!("  {}: {}", k, v.name());
        }

        info!("dead_process_handlers:");
        for k in client.dead_process_handlers.lock().unwrap().keys() {
            info!("  {}", k);
        }

        info!("services:");
        for (k, v) in client.services.lock().unwrap().iter() {
            info!("  {}:", k);
            v.debug();
        }
    }
    Ok(())
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

    root_cert_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().map(|v| v.to_owned()));

    let client_config = rustls::ClientConfig::builder()
        .with_root_certificates(root_cert_store)
        .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(client_config));

    let idc = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)?
        .as_micros() as u64;

    let auth_path = "/etc/sadmin_client_auth.json";
    let (password, metrics_token) = match std::fs::read(auth_path) {
        Ok(v) => {
            #[derive(Deserialize)]
            struct AuthConfig {
                password: String,
                metrics_token: Option<String>,
            }
            let c: AuthConfig = serde_json::from_slice(&v)
                .with_context(|| format!("Error parsing '{auth_path}'"))?;
            (c.password, c.metrics_token)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let password = config.password.clone().with_context(|| {
                format!("Could not find '{auth_path}', so we expect a password in the config file")
            })?;
            warn!(
                "Having the password in the config file is insecure, consider moving it to '{}'",
                auth_path
            );
            (password, None)
        }
        Err(e) => {
            bail!("Unable to read '{}': {:?}", auth_path, e);
        }
    };

    let client = Arc::new(Client {
        connector,
        config,
        db,
        command_tasks: Default::default(),
        send_failure_notify: Default::default(),
        sender_clear: Default::default(),
        new_send_notify: Default::default(),
        sender: Default::default(),
        script_stdin: Default::default(),
        persist_responses: Default::default(),
        persist_idc: AtomicU64::new(idc),
        persist_sender: tokio::sync::Mutex::new(persist_write),
        dead_process_handlers: Default::default(),
        services: Default::default(),
        journal_socket,
        password,
        metrics_token,
        sockets: Default::default(),
        command_pids: Default::default(),
        command_stdins: Default::default(),
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

    TaskBuilder::new("webserver")
        .shutdown_order(CONTROL_ORDER)
        .main()
        .create(|run_token| client.clone().webserver(run_token));

    tokio::spawn(async {
        tokio::signal::ctrl_c().await.unwrap();
        tokio_tasks::shutdown("ctrl+c".to_string());
    });

    TaskBuilder::new("user2")
        .main()
        .abort()
        .shutdown_order(99)
        .create(|_| handle_usr2(client.clone()));

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
