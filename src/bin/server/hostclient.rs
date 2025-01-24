use anyhow::{bail, Context, Result};
use bytes::{Buf, BytesMut};
use log::{error, info, warn};
use rand::Rng;
use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer};
use serde::Deserialize;
use serde_json::Value;
use sqlx_type::query;
use std::{
    collections::{hash_map::Entry, HashMap, HashSet},
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
use tokio_tasks::{cancelable, RunToken, TaskBuilder};

use sadmin2::client_message::{
    ClientHostMessage, HostClientMessage, RunInstantMessage, RunInstantStdinOutputType,
    RunInstantStdinType,
};

use crate::{
    action_types::{IHostDown, IHostUp, IServerAction},
    crt, crypt, db,
    state::State,
    webclient,
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
    killed_jobs: Mutex<HashSet<u64>>,
    next_job_id: AtomicU64,
    run_token: RunToken,
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

    pub async fn send_message(&self, msg: &HostClientMessage) -> Result<()> {
        let mut msg = serde_json::to_vec(msg)?;
        msg.push(0x1e);
        let mut writer = cancelable(&self.run_token, self.writer.lock()).await?;

        match cancelable(
            &self.run_token,
            tokio::time::timeout(Duration::from_secs(60), writer.write_all(&msg)),
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
            tokio::spawn(self.kill_job(id));
            true
        } else {
            false
        }
    }

    async fn handle_messages(
        self: Arc<Self>,
        state: Arc<State>,
        mut reader: ReadHalf<TlsStream<TcpStream>>,
        mut buf: BytesMut,
    ) -> Result<()> {
        const PING_INTERVAL: Duration = Duration::from_secs(80);
        const PONG_TIMEOUT: Duration = Duration::from_secs(40);
        const SIGN_INTERVAL: Duration = Duration::from_secs(60 * 60 * 24);
        const FOREVER: Duration = Duration::from_secs(60 * 60 * 24);
        let mut ping_time = tokio::time::Instant::now() + PING_INTERVAL;
        let mut pong_time = ping_time + FOREVER;
        let mut sign_time = tokio::time::Instant::now();
        let mut ping_id: u32 = rand::thread_rng().gen();

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
                            msg => {
                                if let Some(id) = msg.job_id() {
                                    if let Some(job) = self.job_sinks.lock().unwrap().get(&id) {
                                        if let Err(e) = job.send(msg) {
                                            error!("Unable to handle job message: {:?}", e);
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
                    tokio::spawn(async move {
                        if let Err(e) = s.send_message(&HostClientMessage::Ping{
                            id: id as u64
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
                if let Some(code) = msg.code {
                    if code != 0 {
                        bail!("Command failed with code {}", code);
                    }
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

    async fn sign_host_certificate(self: &Arc<Self>, state: &State) -> Result<()> {
        info!("Signing SSH host certificate for {}", self.hostname);
        // TODO(jakobt) ADD  Read file command
        let host_key = self
            .run_shell("cat /etc/ssh/ssh_host_ed25519_key.pub".into())
            .await?;
        let r = db::get_root_variables(state).await?;
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

    info!("Host connected {:?}", peer_address);
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
            warn!("Host auth error for {:?}: {:?}", peer_address, e);
            return Ok(());
        }
        Ok(Err(_)) => {
            warn!("Host auth timeout for {:?}", peer_address);
            return Ok(());
        }
        Err(_) => return Ok(()),
    };
    info!("Host authorized {:?} {} ({})", peer_address, hostname, id);

    let j: u32 = rand::thread_rng().gen();

    let hc = Arc::new(HostClient {
        id,
        hostname,
        writer: TMutex::new(writer),
        job_sinks: Default::default(),
        next_job_id: AtomicU64::new(j as u64),
        run_token: run_token.clone(),
        killed_jobs: Default::default(),
    });
    if let Some(c) = state.host_clients.lock().unwrap().insert(id, hc.clone()) {
        c.run_token.cancel();
    }

    webclient::broadcast(&state, IServerAction::HostUp(IHostUp { id }))?;

    if let Err(e) = hc.clone().handle_messages(state.clone(), reader, buf).await {
        error!(
            "Error handeling host messages from {}: {:?}",
            hc.hostname, e
        );
    }

    if let Entry::Occupied(e) = state.host_clients.lock().unwrap().entry(id) {
        if Arc::as_ptr(e.get()) == Arc::as_ptr(&hc) {
            e.remove();
        }
    }

    webclient::broadcast(&state, IServerAction::HostDown(IHostDown { id }))?;

    info!("Host disconnected {:?}", peer_address);
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
                TaskBuilder::new(format!("host_client_{:?}", peer_address))
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
