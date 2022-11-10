use std::{
    collections::HashMap,
    io::Write,
    net::ToSocketAddrs,
    os::unix::process::ExitStatusExt,
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::{bail, Context, Result};
use bytes::BytesMut;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt, WriteHalf},
    net::TcpStream,
    process::ChildStdin,
    select,
    sync::{
        mpsc::{UnboundedReceiver, UnboundedSender},
        Notify,
    },
    task::JoinHandle,
};
use tokio_rustls::{
    client::TlsStream,
    rustls::{self, OwnedTrustAnchor},
    TlsConnector,
};

use crate::connection::Config;
use sdnotify::SdNotify;

pub const CONTROL_SOCKET_PATH: &str = "run/simpleadmin/control.socket";

#[derive(clap::Parser)]
pub struct ClientDaemon {
    /// Time to reconnectw
    #[clap(long, default_value_t = 10.0)]
    reconnect_time: f64,

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
struct RunInstantMessage {
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
struct RunScriptMessage {
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
enum DataSource {
    Stdin,
    Stdout,
    Stderr,
}

#[derive(Debug, Serialize, Deserialize)]
struct DataMessage {
    id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<DataSource>,
    data: serde_json::Value,
    eof: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum FailureType {
    Script,
    UnknownTask,
    Exception,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct FailureMessage {
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
struct SuccessMessage {
    id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Auth { hostname: String, password: String },
    RunInstant(RunInstantMessage),
    RunScript(RunScriptMessage),
    Ping { id: u64 },
    Pong { id: u64 },
    Failure(FailureMessage),
    Success(SuccessMessage),
    Kill { id: u64 },
    Data(DataMessage),
}

struct Client {
    connector: TlsConnector,
    config: Config,
    command_tasks: Mutex<HashMap<u64, JoinHandle<()>>>,
    send_failure_notify: Notify,
    recv_failure_notify: Notify,
    new_send_notify: Notify,
    sender: tokio::sync::Mutex<
        Option<WriteHalf<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>>,
    >,
    script_stdin: Mutex<HashMap<u64, UnboundedSender<DataMessage>>>,
}

impl Client {
    async fn send_message(self: &Arc<Self>, message: ClientMessage) {
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

    async fn handle_run_instant(self: Arc<Self>, msg: RunInstantMessage) {
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
        msg: RunScriptMessage,
        recv: UnboundedReceiver<DataMessage>,
    ) {
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
    }

    async fn handle_kill(self: Arc<Self>, id: u64) {
        let task = self.command_tasks.lock().unwrap().remove(&id);
        match task {
            Some(v) => v.abort(),
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
                let task = tokio::spawn(self.clone().handle_run_instant(ri));
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
                let task = tokio::spawn(self.clone().handle_run_script(ri, recv));
                self.command_tasks.lock().unwrap().insert(id, task);
            }
            ClientMessage::Ping { id } => {
                tokio::spawn(self.clone().handle_ping(id));
            }
            ClientMessage::Kill { id } => {
                tokio::spawn(self.clone().handle_kill(id));
            }
        }
    }

    async fn connect(self: &Arc<Self>) -> Result<TlsStream<TcpStream>> {
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
        Ok(self.connector.connect(domain, stream).await?)
    }

    async fn run(self: Arc<Self>) -> Result<()> {
        let notifier = SdNotify::from_env().ok();
        let mut first = true;
        loop {
            let stream = match self.connect().await {
                Ok(stream) => stream,
                Err(e) => {
                    error!("Unable to connect to server: {}, will retry", e);
                    if let Some(notifier) = &notifier {
                        if first {
                            notifier.notify_ready()?;
                            notifier.set_status("Disconnected".to_string())?;
                            first = false;
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(1234)).await;
                    continue;
                }
            };

            let (mut read, mut write) = tokio::io::split(stream);

            let mut auth_message = serde_json::to_vec(&ClientMessage::Auth {
                hostname: self.config.hostname.as_ref().unwrap().clone(),
                password: self.config.password.clone(),
            })?;
            auth_message.push(30);
            if let Err(e) = write.write_all(&auth_message).await {
                error!("Error sending out message {}", e);
                tokio::time::sleep(Duration::from_millis(1234)).await;
                continue;
            }

            *self.sender.lock().await = Some(write);
            self.new_send_notify.notify_one();

            if let Some(notifier) = &notifier {
                if first {
                    notifier.notify_ready()?;
                    first = false;
                }
                notifier.set_status("Connected".to_string())?;
            }
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
}

pub async fn client_daemon(config: Config, args: ClientDaemon) -> Result<()> {
    simple_logger::SimpleLogger::new()
        .with_level(args.log_level)
        .init()
        .unwrap();

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

    let client = Arc::new(Client {
        connector,
        config,
        command_tasks: Default::default(),
        send_failure_notify: Default::default(),
        recv_failure_notify: Default::default(),
        new_send_notify: Default::default(),
        sender: Default::default(),
        script_stdin: Default::default(),
    });

    client.run().await
}
