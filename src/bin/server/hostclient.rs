use anyhow::{Context, Result, bail};
use bytes::{Buf, BytesMut};
use log::{error, info, warn};
use qusql_sqlx_type::query;
use rand::RngExt;
use rustls::pki_types::{CertificateDer, PrivateKeyDer, pem::PemObject};
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet, hash_map::Entry},
    net::SocketAddr,
    sync::{Arc, Mutex, Weak, atomic::AtomicU64},
    time::Duration,
};
use tokio::{io::WriteHalf, sync::Mutex as TMutex};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt, ReadHalf},
    net::TcpListener,
};
use tokio::{
    net::TcpStream,
    sync::mpsc::{UnboundedReceiver, UnboundedSender},
};
use tokio_rustls::{TlsAcceptor, server::TlsStream};
use tokio_tasks::{RunToken, TaskBuilder, cancelable, set_location};

use sadmin2::client_message::{
    ClientHostMessage, HostClientMessage, RunInstantMessage, RunInstantStdinOutputType,
    RunInstantStdinType,
};

use crate::{
    action_types::{IHostDown, IHostUp, IServerAction},
    crt, crypt, db,
    state::State,
    webclient::{self},
};
use sadmin2::type_types::HOST_ID;

pub struct JobHandle {
    client: Weak<HostClient>,
    id: u64,
    reciever: UnboundedReceiver<ClientHostMessage>,
    should_kill: bool,
}

impl JobHandle {
    pub async fn next_message(&mut self) -> Result<Option<ClientHostMessage>> {
        Ok(self.reciever.recv().await)
    }

    pub fn done(mut self) {
        self.should_kill = false;
    }
}

impl Drop for JobHandle {
    fn drop(&mut self) {
        if let Some(client) = self.client.upgrade() {
            client.job_sinks.lock().unwrap().remove(&self.id);
            if self.should_kill {
                client.spawn_kill_job(self.id);
            }
        }
    }
}

pub struct HostClient {
    id: i64,
    hostname: String,
    writer: TMutex<tokio::io::WriteHalf<TlsStream<TcpStream>>>,
    job_sinks: Mutex<HashMap<u64, UnboundedSender<ClientHostMessage>>>,
    message_handlers: Mutex<HashMap<u64, tokio::sync::oneshot::Sender<ClientHostMessage>>>,
    killed_jobs: Mutex<HashSet<u64>>,
    next_job_id: AtomicU64,
    run_token: RunToken,
    next_command_id: AtomicU64,
    next_socket_id: AtomicU64,
    pub command_message_handlers:
        Mutex<HashMap<u64, tokio::sync::mpsc::UnboundedSender<ClientHostMessage>>>,
    pub socket_message_handlers:
        Mutex<HashMap<u64, tokio::sync::mpsc::UnboundedSender<ClientHostMessage>>>,
}

async fn write_all_and_flush(v: &mut WriteHalf<TlsStream<TcpStream>>, data: &[u8]) -> Result<()> {
    v.write_all(data).await?;
    v.flush().await?;
    Ok(())
}

impl HostClient {
    pub fn id(&self) -> i64 {
        self.id
    }

    pub fn hostname(&self) -> &str {
        &self.hostname
    }

    pub fn debug(&self) {
        info!(
            "  {} id={} jobs={} cancelled={}",
            self.hostname,
            self.id,
            self.job_sinks.lock().unwrap().len(),
            self.run_token.is_cancelled()
        );
    }

    pub fn next_job_id(&self) -> u64 {
        self.next_job_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    pub fn next_command_id(&self) -> u64 {
        self.next_command_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    pub fn next_socket_id(&self) -> u64 {
        self.next_socket_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    pub async fn send_message(&self, msg: &HostClientMessage) -> Result<()> {
        let mut msg = serde_json::to_vec(msg)?;
        msg.push(0x1e);
        let mut writer = cancelable(&self.run_token, self.writer.lock()).await?;

        match cancelable(
            &self.run_token,
            tokio::time::timeout(
                Duration::from_secs(60),
                write_all_and_flush(&mut writer, &msg),
            ),
        )
        .await
        {
            Ok(Ok(Ok(()))) => (),
            Ok(Ok(Err(e))) => {
                self.run_token.cancel();
                bail!("Failure sending message to {}: {:?}", self.hostname, e);
            }
            Ok(Err(_)) => {
                self.run_token.cancel();
                bail!("Timeout sending message to {}", self.hostname)
            }
            Err(_) => {
                bail!("Host client aborted");
            }
        }
        Ok(())
    }

    pub async fn send_message_with_response(
        &self,
        msg: &HostClientMessage,
    ) -> Result<ClientHostMessage> {
        let id = msg.job_id().context("Missing job id")?;
        let mut msg = serde_json::to_vec(msg)?;
        msg.push(0x1e);
        let mut writer = cancelable(&self.run_token, self.writer.lock()).await?;

        let (send, recv) = tokio::sync::oneshot::channel();
        self.message_handlers.lock().unwrap().insert(id, send);

        match cancelable(
            &self.run_token,
            tokio::time::timeout(
                Duration::from_secs(60),
                write_all_and_flush(&mut writer, &msg),
            ),
        )
        .await
        {
            Ok(Ok(Ok(()))) => (),
            Ok(Ok(Err(e))) => {
                self.run_token.cancel();
                self.message_handlers.lock().unwrap().remove(&id);
                bail!("Failure sending message to {}: {:?}", self.hostname, e);
            }
            Ok(Err(_)) => {
                self.run_token.cancel();
                self.message_handlers.lock().unwrap().remove(&id);
                bail!("Timeout sending message to {}", self.hostname)
            }
            Err(_) => {
                self.message_handlers.lock().unwrap().remove(&id);
                bail!("Host client aborted");
            }
        }
        std::mem::drop(writer);

        match cancelable(
            &self.run_token,
            tokio::time::timeout(Duration::from_secs(60), recv),
        )
        .await
        {
            Ok(Ok(Ok(ClientHostMessage::Failure(f)))) => {
                bail!(
                    "failure on host {}: {}",
                    self.hostname,
                    f.message.as_deref().unwrap_or_default()
                );
            }
            Ok(Ok(Ok(r))) => Ok(r),
            Ok(Ok(Err(e))) => {
                self.run_token.cancel();
                self.message_handlers.lock().unwrap().remove(&id);
                bail!("Failure receiving message from {}: {:?}", self.hostname, e);
            }
            Ok(Err(_)) => {
                self.run_token.cancel();
                self.message_handlers.lock().unwrap().remove(&id);
                bail!("Timeout receiving message from {}", self.hostname)
            }
            Err(_) => {
                self.message_handlers.lock().unwrap().remove(&id);
                bail!("Host client aborted");
            }
        }
    }

    pub async fn start_job(self: &Arc<Self>, msg: &HostClientMessage) -> Result<JobHandle> {
        let Some(id) = msg.job_id() else {
            bail!("Not a job message")
        };
        let (sender, reciever) = tokio::sync::mpsc::unbounded_channel();
        let mut handle = JobHandle {
            client: Arc::downgrade(self),
            id,
            reciever,
            should_kill: false,
        };
        if self.job_sinks.lock().unwrap().insert(id, sender).is_some() {
            bail!("Job id in use");
        }
        handle.should_kill = true;
        self.send_message(msg).await?;
        Ok(handle)
    }

    pub async fn kill_job(self: Arc<Self>, id: u64) -> Result<()> {
        self.send_message(&HostClientMessage::Kill { id }).await?;
        Ok(())
    }

    pub fn spawn_kill_job(self: Arc<Self>, id: u64) -> bool {
        if self.killed_jobs.lock().unwrap().insert(id) {
            TaskBuilder::new("kill_host_client")
                .shutdown_order(0)
                .abort()
                .create(|_| self.kill_job(id));
            true
        } else {
            false
        }
    }

    async fn send_ping(self: Arc<Self>, _rt: RunToken, id: u64) -> Result<()> {
        if let Err(e) = self.send_message(&HostClientMessage::Ping { id }).await {
            error!("Failed sending ping: {e:?}")
        }
        Ok(())
    }

    async fn handle_messages(
        self: Arc<Self>,
        state: Arc<State>,
        reader: &mut ReadHalf<TlsStream<TcpStream>>,
        mut buf: BytesMut,
    ) -> Result<()> {
        const PING_INTERVAL: Duration = Duration::from_secs(80);
        const PONG_TIMEOUT: Duration = Duration::from_secs(40);
        const SIGN_INTERVAL: Duration = Duration::from_secs(60 * 60 * 24);
        const FOREVER: Duration = Duration::from_secs(60 * 60 * 24);
        let mut ping_time = tokio::time::Instant::now() + PING_INTERVAL;
        let mut pong_time = ping_time + FOREVER;
        let mut sign_time = tokio::time::Instant::now();
        let mut ping_id: u32 = rand::rng().random();

        loop {
            let read_fut = reader.read_buf(&mut buf);
            let ping_timeout_fut = tokio::time::sleep_until(ping_time);
            let pong_timeout_fut = tokio::time::sleep_until(pong_time);
            let sign_timeout_fut = tokio::time::sleep_until(sign_time);
            let cancelled = self.run_token.cancelled();
            tokio::select! {
                r = read_fut => {
                    let r = r?;
                    if r == 0 {
                        break
                    }
                    while let Some(i) = buf.iter().position(|v| *v == 0x1e) {
                        let msg: ClientHostMessage =
                            serde_json::from_slice(&buf[..i]).context("Invalid message")?;
                        buf.advance(i + 1);

                        match msg {
                            ClientHostMessage::Auth { .. } => bail!("Unexpected auth"),
                            ClientHostMessage::Pong { id } => {
                                if id != ping_id as u64 {
                                    warn!("Got pong with wrong id {} vs {} on host {}", id, ping_id, self.hostname);
                                } else {
                                    pong_time = ping_time + FOREVER;
                                }
                            }
                            ClientHostMessage::SocketRecv{ socket_id, data } => {
                                match self.socket_message_handlers.lock().unwrap().get(&socket_id) {
                                    None => warn!("Get recv for unknows socket {socket_id}"),
                                    Some(v) => {
                                        if let Err(e) = v.send(ClientHostMessage::SocketRecv{ socket_id, data }) {
                                            warn!("Failed forwarding recv message for socket {socket_id}: {e:?}");
                                        }
                                    }
                                }
                            }
                            ClientHostMessage::CommandStdout{ command_id, data } => {
                                match self.command_message_handlers.lock().unwrap().get(&command_id) {
                                    None => warn!("Get stdout for unknown command {command_id}"),
                                    Some(v) => {
                                        if let Err(e) = v.send(ClientHostMessage::CommandStdout{ command_id, data }) {
                                            warn!("Failed forwarding stdout message to command {command_id}: {e:?}");
                                        }
                                    }
                                }
                            }
                            ClientHostMessage::CommandStderr{ command_id, data } => {
                                match self.command_message_handlers.lock().unwrap().get(&command_id) {
                                    None => warn!("Get stderr for unknown command {command_id}"),
                                    Some(v) => {
                                        if let Err(e) = v.send(ClientHostMessage::CommandStderr{ command_id, data }) {
                                            warn!("Failed forwarding stderr message to command {command_id}: {e:?}");
                                        }
                                    }
                                }
                            }
                            ClientHostMessage::CommandFinished{ command_id, code, signal } => {
                                match self.command_message_handlers.lock().unwrap().get(&command_id) {
                                    None => warn!("Get finished for unknown command {command_id}"),
                                    Some(v) => {
                                        if let Err(e) = v.send(ClientHostMessage::CommandFinished{ command_id, code, signal }) {
                                            warn!("Failed forwarding finished message to command {command_id}: {e:?}");
                                        }
                                    }
                                }
                            }
                            msg => {
                                if let Some(id) = msg.job_id() {
                                    if let Some(job) = self.job_sinks.lock().unwrap().get(&id) {
                                        if let Err(e) = job.send(msg) {
                                            error!("Unable to handle job message: {e:?}");
                                        }
                                    } else if let Some(s) = self.message_handlers.lock().unwrap().remove(&id) {
                                        if let Err(e) = s.send(msg) {
                                            error!("Unable to handle job message: {e:?}");
                                        }
                                    } else if self.clone().spawn_kill_job(id) {
                                        error!("Got message from unknown job {} on host {}", id, self.hostname);
                                    }
                                }
                            }
                        }
                    }
                }
                () = ping_timeout_fut => {
                    ping_id = ping_id.overflowing_add(1).0;
                    pong_time = tokio::time::Instant::now() + PONG_TIMEOUT;
                    ping_time += PING_INTERVAL;
                    let s = self.clone();
                    let id = ping_id;
                    TaskBuilder::new(format!("send_ping_{}_{}", self.hostname, id))
                        .shutdown_order(-1)
                        .create(|rt| s.send_ping(rt, id as u64));
                }
                () = pong_timeout_fut => {
                    bail!("Ping timeout")
                }
                () = sign_timeout_fut => {
                    sign_time += SIGN_INTERVAL;
                    let s = self.clone();
                    let state = state.clone();

                    TaskBuilder::new(format!("sign host certificate {}", self.hostname))
                        .shutdown_order(-1)
                        .create(|rt| async move {
                            let s = s;
                            set_location!(rt);
                            match cancelable(&rt, tokio::time::timeout(Duration::from_secs(60), s.sign_host_certificate(&rt, &state))).await {
                                Ok(Ok(Ok(()))) => (),
                                Ok(Ok(Err(e))) => {
                                    error!("An error occurred in host ssh certificate generation for {}: {:?}", s.hostname, e);
                                },
                                Ok(Err(_)) =>  {
                                    error!("Timeout signing host cert for {}", s.hostname);
                                },
                                Err(_) => ()
                            }
                            Ok::<(),()>(())
                        });
                }
                () = cancelled => {
                    break
                }
            }
        }
        Ok(())
    }

    async fn run_shell(self: &Arc<Self>, cmd: String) -> Result<String> {
        let mut jh = self
            .start_job(&HostClientMessage::RunInstant(RunInstantMessage {
                id: self.next_job_id(),
                name: "runShell.sh".into(),
                interperter: "/bin/sh".into(),
                content: cmd,
                args: Vec::new(),
                output_type: RunInstantStdinOutputType::Text,
                stdin_type: RunInstantStdinType::None,
            }))
            .await?;
        match jh.next_message().await? {
            Some(ClientHostMessage::Success(msg)) => {
                jh.done();
                if let Some(code) = msg.code
                    && code != 0
                {
                    bail!("Command failed with code  {}", code);
                }
                let Some(Value::String(v)) = msg.data else {
                    bail!("Missing data");
                };
                Ok(v)
            }
            Some(ClientHostMessage::Failure(msg)) => {
                jh.done();
                bail!("Command failed with code {}", msg.code.unwrap_or(-43));
            }
            Some(_) => bail!("Got unexpected message"),
            None => bail!("Client went away"),
        }
    }

    async fn write_small_text_file(self: &Arc<Self>, path: String, content: String) -> Result<()> {
        let mut jh = self
            .start_job(&HostClientMessage::RunInstant(RunInstantMessage {
                id: self.next_job_id(),
                name: "writeSmallFile.sh".into(),
                interperter: "/bin/bash".into(),
                content: "printf '%s' \"$2\" > \"$1\"".into(),
                args: vec![path, content],
                output_type: RunInstantStdinOutputType::Text,
                stdin_type: RunInstantStdinType::None,
            }))
            .await?;
        match jh.next_message().await? {
            Some(ClientHostMessage::Success(msg)) => {
                jh.done();
                if let Some(code) = msg.code
                    && code != 0
                {
                    bail!("Command failed with code {}", code);
                }
                Ok(())
            }
            Some(ClientHostMessage::Failure(msg)) => {
                jh.done();
                bail!("Command failed with code {}", msg.code.unwrap_or(-45));
            }
            Some(_) => bail!("Got unexpected message"),
            None => bail!("Client went away"),
        }
    }

    async fn sign_host_certificate(self: &Arc<Self>, rt: &RunToken, state: &State) -> Result<()> {
        info!("Signing SSH host certificate for {}", self.hostname);
        // TODO(jakobt) ADD  Read file command
        set_location!(rt);
        let host_key = self
            .run_shell("cat /etc/ssh/ssh_host_ed25519_key.pub".into())
            .await?;
        set_location!(rt);
        let r = db::get_root_variables(state).await?;
        set_location!(rt);
        if let Some(ssh_host_ca_key) = r.get("sshHostCaKey") {
            const VALIDITY_DAYS: u32 = 7;
            set_location!(rt);
            let ssh_crt: String = crt::generate_ssh_crt(
                &format!("{} sadmin host", self.hostname),
                &format!(
                    "{},{}.scalgo.com,{}.emu-buri.ts.net",
                    self.hostname, self.hostname, self.hostname
                ),
                ssh_host_ca_key,
                &host_key,
                VALIDITY_DAYS,
                crt::Type::Host,
            )
            .await?;
            set_location!(rt);
            self.write_small_text_file("/etc/ssh/ssh_host_ed25519_key-cert.pub".into(), ssh_crt)
                .await?;
            // TODO add exec command
            set_location!(rt);
            self.run_shell("systemctl reload 'ssh*.service'".into())
                .await?;
            set_location!(rt);
        }
        Ok(())
    }
}

async fn auth_client(
    state: &State,
    reader: &mut ReadHalf<TlsStream<TcpStream>>,
    buf: &mut BytesMut,
) -> Result<(i64, String)> {
    let msg = loop {
        let r = reader.read_buf(buf).await?;
        if r == 0 {
            bail!("Disconnected");
        }
        if let Some(i) = buf.iter().position(|v| *v == 0x1e) {
            let msg: ClientHostMessage =
                serde_json::from_slice(&buf[..i]).context("Invalid message")?;
            buf.advance(i + 1);
            break msg;
        }
    };
    let ClientHostMessage::Auth { hostname, password } = msg else {
        bail!("Expected auth message");
    };

    let row = query!(
        "SELECT `id`, `content` FROM `objects` WHERE `type` = ? AND `name`=? AND `newest`",
        HOST_ID,
        hostname
    )
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        bail!("Unknown host {}", hostname)
    };

    #[derive(Deserialize)]
    struct PasswordContent {
        password: String,
    }
    let password_content: PasswordContent =
        serde_json::from_str(&row.content).context("Invalid host content")?;

    let valid = crypt::validate_password(&password, &password_content.password)
        .context("Unable to validate password")?;
    if !valid {
        bail!("Invalid password for {}", hostname)
    }
    Ok((row.id, hostname))
}

async fn handle_host_client(
    state: Arc<State>,
    run_token: RunToken,
    stream: TcpStream,
    peer_address: SocketAddr,
    acceptor: TlsAcceptor,
) -> Result<()> {
    let stream = cancelable(
        &run_token,
        tokio::time::timeout(Duration::from_secs(2), acceptor.accept(stream)),
    )
    .await???;

    info!("Host connected {peer_address:?}");
    let (mut reader, writer) = tokio::io::split(stream);
    let mut buf = BytesMut::with_capacity(1024 * 128);
    let (id, hostname) = match cancelable(
        &run_token,
        tokio::time::timeout(
            Duration::from_secs(2),
            auth_client(&state, &mut reader, &mut buf),
        ),
    )
    .await
    {
        Ok(Ok(Ok(id))) => id,
        Ok(Ok(Err(e))) => {
            warn!("Host auth error for {peer_address:?}: {e:?}");
            reader.unsplit(writer);
            return Ok(());
        }
        Ok(Err(_)) => {
            warn!("Host auth timeout for {peer_address:?}");
            reader.unsplit(writer);
            return Ok(());
        }
        Err(_) => {
            reader.unsplit(writer);
            return Ok(());
        }
    };
    info!("Host authorized {peer_address:?} {hostname} ({id})");

    let j: u32 = rand::rng().random();

    let hc = Arc::new(HostClient {
        id,
        hostname,
        writer: TMutex::new(writer),
        job_sinks: Default::default(),
        message_handlers: Default::default(),
        next_job_id: AtomicU64::new(j as u64),
        run_token: run_token.clone(),
        killed_jobs: Default::default(),
        next_command_id: AtomicU64::new(1),
        next_socket_id: AtomicU64::new(1),
        command_message_handlers: Default::default(),
        socket_message_handlers: Default::default(),
    });
    if let Some(c) = state.host_clients.lock().unwrap().insert(id, hc.clone()) {
        info!(
            "Duplicate host connection for {}, cancelling old host",
            hc.hostname
        );
        c.run_token.cancel();
    }

    webclient::broadcast(&state, IServerAction::HostUp(IHostUp { id }))?;

    if let Err(e) = hc
        .clone()
        .handle_messages(state.clone(), &mut reader, buf)
        .await
    {
        error!(
            "Error handeling host messages from {}: {:?}",
            hc.hostname, e
        );
    }
    run_token.cancel();

    if let Entry::Occupied(e) = state.host_clients.lock().unwrap().entry(id)
        && Arc::as_ptr(e.get()) == Arc::as_ptr(&hc)
    {
        e.remove();
    }

    webclient::broadcast(&state, IServerAction::HostDown(IHostDown { id }))?;
    match Arc::try_unwrap(hc) {
        Ok(hc) => {
            let writer = hc.writer.into_inner();
            reader.unsplit(writer);
            info!(
                "Host disconnected {:?} {}, clean",
                hc.hostname, peer_address
            );
        }
        Err(hc) => {
            let _ = tokio::time::timeout(Duration::from_secs(2), async {
                hc.writer.lock().await.shutdown().await
            })
            .await;
            info!(
                "Host disconnected {:?} {}, references linger",
                hc.hostname, peer_address
            );
        }
    }
    Ok(())
}

fn load_acceptor() -> Result<TlsAcceptor> {
    let certs = CertificateDer::pem_file_iter("chained.pem")
        .context("Unable to load chained.pem")?
        .collect::<Result<Vec<_>, _>>()?;
    let key = PrivateKeyDer::from_pem_file("domain.key").context("Unable to load domain.key")?;
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)?;
    Ok(TlsAcceptor::from(Arc::new(config)))
}

pub async fn run_host_server(state: Arc<State>, run_token: RunToken) -> Result<()> {
    let mut acceptor = load_acceptor()?;
    let listener = TcpListener::bind("0.0.0.0:8888").await?;
    const RELOAD_INTERVAL: Duration = Duration::from_secs(60 * 60 * 24);

    info!("Host server started on port 8888");
    let mut reload_time = tokio::time::Instant::now() + RELOAD_INTERVAL;
    loop {
        let accept_fut = listener.accept();
        let reload_fut = tokio::time::sleep_until(reload_time);
        let cancelled = run_token.cancelled();
        tokio::select! {
            accept_res = accept_fut => {
                let (stream, peer_address) = accept_res?;
                TaskBuilder::new(format!("host_client_{peer_address:?}"))
                    .shutdown_order(2)
                    .create(|rt|handle_host_client(state.clone(), rt, stream, peer_address, acceptor.clone()));
            }
            () = reload_fut => {
                info!("Updating host-server ssl cert");
                acceptor = load_acceptor()?;
                reload_time += RELOAD_INTERVAL;
            }
            () = cancelled => {
                break
            }
        }
    }
    info!("Host server stopped");
    Ok(())
}
