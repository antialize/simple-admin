use anyhow::{bail, Context, Result};
use bytes::{Buf, BytesMut};
use log::{error, info, warn};
use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer};
use serde::Deserialize;
use serde_json::Value;
use sqlx_type::query;
use std::{
    collections::{hash_map::Entry, HashMap},
    net::SocketAddr,
    sync::{atomic::AtomicU64, Arc, Mutex, Weak},
    time::Duration,
};
use tokio::sync::Mutex as TMutex;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt, ReadHalf},
    net::TcpListener,
};
use tokio::{
    net::TcpStream,
    sync::mpsc::{UnboundedReceiver, UnboundedSender},
};
use tokio_rustls::{server::TlsStream, TlsAcceptor};

use crate::{
    action_types::{IAction, IHostDown, IHostUp},
    client_message::{
        ClientMessage, RunInstantMessage, RunInstantStdinOutputType, RunInstantStdinType,
    },
    crt, crypt, db,
    state::State,
    type_types::HOST_ID,
    webclient,
};

pub struct JobHandle {
    client: Weak<HostClient>,
    id: u64,
    reciever: UnboundedReceiver<ClientMessage>,
    should_kill: bool,
}

impl JobHandle {
    pub async fn next_message(&mut self) -> Result<Option<ClientMessage>> {
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
    addr: SocketAddr,
    hostname: String,
    writer: TMutex<tokio::io::WriteHalf<TlsStream<TcpStream>>>,
    job_sinks: Mutex<HashMap<u64, UnboundedSender<ClientMessage>>>,
    next_job_id: AtomicU64,
}

impl HostClient {
    pub fn id(&self) -> i64 {
        self.id
    }

    pub fn hostname(&self) -> &str {
        &self.hostname
    }

    pub fn next_job_id(&self) -> u64 {
        self.next_job_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    pub async fn send_message(&self, msg: &ClientMessage) -> Result<()> {
        let mut msg = serde_json::to_vec(msg)?;
        msg.push(0x1e);
        // TODO use cancelation token
        let mut writer = self.writer.lock().await;
        // TODO use cancelation token
        match tokio::time::timeout(Duration::from_secs(60), writer.write_all(&msg)).await {
            Ok(Ok(())) => (),
            Ok(Err(e)) => {
                // TODO set cancelation token
                bail!("Failure sending message to {}: {:?}", self.hostname, e);
            }
            Err(_) => {
                // TODO set cancelation token
                bail!("Timeout sending message to {}", self.hostname)
            }
        }
        Ok(())
    }

    pub async fn start_job(self: &Arc<Self>, msg: &ClientMessage) -> Result<JobHandle> {
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
        self.send_message(&ClientMessage::Kill { id }).await?;
        Ok(())
    }

    pub fn spawn_kill_job(self: Arc<Self>, id: u64) {
        tokio::spawn(self.kill_job(id));
    }

    async fn handle_messages(
        self: Arc<Self>,
        state: Arc<State>,
        mut reader: ReadHalf<TlsStream<TcpStream>>,
        mut buf: BytesMut,
    ) -> Result<()> {
        const PING_INTERVAL: Duration = Duration::from_secs(80);
        const PONG_TIMEOUT: Duration = Duration::from_secs(9);
        const SIGN_INTERVAL: Duration = Duration::from_secs(60 * 60 * 24);
        const FOREVER: Duration = Duration::from_secs(60 * 60 * 24);
        let mut ping_time = tokio::time::Instant::now() + PING_INTERVAL;
        let mut pong_time = ping_time + FOREVER;
        let mut sign_time = tokio::time::Instant::now();
        let mut ping_id: u64 = 0;

        loop {
            let read_fut = reader.read_buf(&mut buf);
            let ping_timeout_fut = tokio::time::sleep_until(ping_time);
            let pong_timeout_fut = tokio::time::sleep_until(pong_time);
            let sign_timeout_fut = tokio::time::sleep_until(sign_time);
            tokio::select! {
                r = read_fut => {
                    let r = r?;
                    if r == 0 {
                        break
                    }
                    while let Some(i) = buf.iter().position(|v| *v == 0x1e) {
                        let msg: ClientMessage =
                            serde_json::from_slice(&buf[..i]).context("Invalid message")?;
                        buf.advance(i + 1);

                        match msg {
                            ClientMessage::Auth { .. } => bail!("Unexpected auth"),
                            ClientMessage::Pong { id } => {
                                if id != ping_id {
                                    bail!("Got pong with wrong id");
                                }
                                pong_time = ping_time + FOREVER;
                            }
                            msg => {
                                if let Some(id) = msg.job_id() {
                                    if let Some(job) = self.job_sinks.lock().unwrap().get(&id) {
                                        if let Err(e) = job.send(msg) {
                                            error!("Unable to handle job message: {:?}", e);
                                        }
                                    } else {
                                        error!("Got message from unknown job {}", id);
                                        self.clone().spawn_kill_job(id);
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
                    tokio::spawn(async move {
                        if let Err(e) = s.send_message(&ClientMessage::Ping{
                            id
                        }).await {
                            error!("Failed sending ping: {:?}", e)
                        }
                    });
                }
                () = pong_timeout_fut => {
                    bail!("Ping timeout")
                }
                () = sign_timeout_fut => {
                    sign_time += SIGN_INTERVAL;
                    let s = self.clone();
                    let state = state.clone();
                    tokio::spawn(async move {
                        let s = s;
                        if let Err(e) = s.sign_host_certificate(&state).await {
                            error!("An error occurred in host ssh certificate generation for {}: {:?}", s.hostname, e);
                        }
                    });
                }
            }
        }
        Ok(())
    }

    async fn run_shell(self: &Arc<Self>, cmd: String) -> Result<String> {
        let mut jh = self
            .start_job(&ClientMessage::RunInstant(RunInstantMessage {
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
            Some(ClientMessage::Success(msg)) => {
                jh.done();
                if let Some(code) = msg.code {
                    if code != 0 {
                        bail!("Command failed with code  {}", code);
                    }
                }
                let Some(Value::String(v)) = msg.data else {
                    bail!("Missing data");
                };
                Ok(v)
            }
            Some(ClientMessage::Failure(msg)) => {
                jh.done();
                bail!("Command failed with code {}", msg.code.unwrap_or(-43));
            }
            Some(_) => bail!("Got unexpected message"),
            None => bail!("Client went away"),
        }
    }

    async fn write_small_text_file(self: &Arc<Self>, path: String, content: String) -> Result<()> {
        let mut jh = self
            .start_job(&ClientMessage::RunInstant(RunInstantMessage {
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
            Some(ClientMessage::Success(msg)) => {
                jh.done();
                if let Some(code) = msg.code {
                    if code != 0 {
                        bail!("Command failed with code {}", code);
                    }
                }
                Ok(())
            }
            Some(ClientMessage::Failure(msg)) => {
                jh.done();
                bail!("Command failed with code {}", msg.code.unwrap_or(-45));
            }
            Some(_) => bail!("Got unexpected message"),
            None => bail!("Client went away"),
        }
    }

    async fn sign_host_certificate(self: &Arc<Self>, state: &State) -> Result<()> {
        info!("Signing SSH host certificate for {}", self.hostname);
        // TODO(jakobt) ADD  Read file command
        let host_key = self
            .run_shell("cat /etc/ssh/ssh_host_ed25519_key.pub".into())
            .await?;
        let r = db::get_root_variables(&state).await?;
        if let Some(ssh_host_ca_key) = r.get("sshHostCaKey") {
            const VALIDITY_DAYS: u32 = 7;
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
            self.write_small_text_file("/etc/ssh/ssh_host_ed25519_key-cert.pub".into(), ssh_crt)
                .await?;
            // TODO add exec command
            self.run_shell("systemctl reload 'ssh*.service'".into())
                .await?;
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
            let msg: ClientMessage =
                serde_json::from_slice(&buf[..i]).context("Invalid message")?;
            buf.advance(i + 1);
            break msg;
        }
    };
    let ClientMessage::Auth { hostname, password } = msg else {
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
    stream: TcpStream,
    peer_address: SocketAddr,
    acceptor: TlsAcceptor,
) -> Result<()> {
    let stream = cancelable(
        &run_token,
        tokio::time::timeout(
            Duration::from_secs(2),acceptor.accept(stream))).await???;

    info!("Client connected {:?}", peer_address);
    let (mut reader, writer) = tokio::io::split(stream);
    let mut buf = BytesMut::with_capacity(1024 * 128);
    let (id, hostname) = match tokio::time::timeout(
        Duration::from_secs(2),
        auth_client(&state, &mut reader, &mut buf),
    )
    .await
    {
        Ok(Ok(id)) => id,
        Ok(Err(e)) => {
            warn!("Client auth error for {:?}: {:?}", peer_address, e);
            return Ok(());
        }
        Err(_) => {
            warn!("Client auth timeout for {:?}", peer_address);
            return Ok(());
        }
    };
    info!("Client authorized {:?} {} ({})", peer_address, hostname, id);

    let hc = Arc::new(HostClient {
        id,
        addr: peer_address,
        hostname,
        writer: TMutex::new(writer),
        job_sinks: Default::default(),
        next_job_id: Default::default(),
    });
    if let Some(_) = state.host_clients.lock().unwrap().insert(id, hc.clone()) {
        // TODO kill old host client
    }

    webclient::broadcast(&state, IAction::HostUp(IHostUp { id })).await?;

    if let Err(e) = hc.clone().handle_messages(state.clone(), reader, buf).await {
        error!("Error handeling host client messages: {:?}", e);
    }

    if let Entry::Occupied(e) = state.host_clients.lock().unwrap().entry(id) {
        if Arc::as_ptr(e.get()) == Arc::as_ptr(&hc) {
            e.remove();
        }
    }

    webclient::broadcast(&state, IAction::HostDown(IHostDown { id })).await?;

    info!("Client disconnected {:?}", peer_address);
    Ok(())
}

fn load_acceptor() -> Result<TlsAcceptor> {
    let certs = CertificateDer::pem_file_iter("chained.pem")?.collect::<Result<Vec<_>, _>>()?;
    let key = PrivateKeyDer::from_pem_file("domain.key")?;
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)?;
    Ok(TlsAcceptor::from(Arc::new(config)))
}

pub async fn run_host_server(state: Arc<State>) -> Result<()> {
    let mut acceptor = load_acceptor()?;
    let listener = TcpListener::bind("0.0.0.0:8888").await?;
    const RELOAD_INTERVAL: Duration = Duration::from_secs(60 * 60 * 24);

    info!("Host server started on port 8888");
    let mut reload_time = tokio::time::Instant::now() + RELOAD_INTERVAL;
    loop {
        let accept_fut = listener.accept();
        let reload_fut = tokio::time::sleep_until(reload_time);
        tokio::select! {
            accept_res = accept_fut => {
                let (stream, peer_address) = accept_res?;
                tokio::spawn(
                    handle_host_client(state.clone(), stream, peer_address, acceptor.clone())
                );
            }
            () = reload_fut => {
                info!("Updating host-server ssl cert");
                acceptor = load_acceptor()?;
                reload_time += RELOAD_INTERVAL;
            }
        }
    }
    // info!("Host server stopped");
    // Ok(())
}
