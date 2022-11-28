use std::{
    collections::HashMap,
    os::unix::{
        prelude::{AsFd, AsRawFd, BorrowedFd, OwnedFd, RawFd},
        process::ExitStatusExt,
    },
    path::PathBuf,
    sync::{Arc, Mutex},
};

use anyhow::{bail, Context, Result};
use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use tokio::{
    io::AsyncReadExt,
    io::AsyncWriteExt,
    net::{UnixListener, UnixStream},
};

use crate::tokio_passfd;

pub const VERSION: u64 = 5;
pub const SOCKET_PATH: &str = "/run/simpleadmin/persist.socket";

#[derive(Serialize, Deserialize)]
pub struct StartProcess {
    pub id: u64,
    pub key: String,
    pub path: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    pub current_dir: Option<String>,
    pub cgroup: Option<String>,
    pub umask: Option<u32>,
    pub fds: Vec<(String, RawFd)>,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Message {
    Shutdown { id: u64 },
    ListFds { id: u64, key_prefix: Option<String> },
    HasFd { id: u64, key: String },
    ListFdsResult { id: u64, fd_keys: Vec<String> },
    CloseFd { id: u64, key: String },
    CloseAllFds { id: u64 },
    Error { id: u64, message: String },
    Success { id: u64 },
    SuccessWithFd { id: u64 },
    PutFd { id: u64, key: String },
    GetFd { id: u64, key: String },
    Ping { id: u64 },
    Pong { id: u64 },
    GetProtocolVersion { id: u64 },
    GetProtocolVersionResult { id: u64, version: u64 },
    StartProcess(StartProcess),
    SignalProcess { id: u64, key: String, signal: i32 },
    ProcessDied { key: String, code: i32 },
    ListProcesses { id: u64, key_prefix: Option<String> },
    ListProcessesResult { id: u64, process_keys: Vec<String> },
    NotFound { id: u64 },
}

impl Message {
    pub fn id(&self) -> u64 {
        match self {
            Message::Shutdown { id } => *id,
            Message::ListFds { id, .. } => *id,
            Message::ListFdsResult { id, .. } => *id,
            Message::CloseFd { id, .. } => *id,
            Message::CloseAllFds { id } => *id,
            Message::Error { id, .. } => *id,
            Message::Success { id } => *id,
            Message::PutFd { id, .. } => *id,
            Message::GetFd { id, .. } => *id,
            Message::Ping { id } => *id,
            Message::Pong { id } => *id,
            Message::GetProtocolVersion { id } => *id,
            Message::GetProtocolVersionResult { id, .. } => *id,
            Message::StartProcess(StartProcess { id, .. }) => *id,
            Message::SignalProcess { id, .. } => *id,
            Message::ProcessDied { .. } => 0,
            Message::ListProcesses { id, .. } => *id,
            Message::ListProcessesResult { id, .. } => *id,
            Message::SuccessWithFd { id } => *id,
            Message::NotFound { id } => *id,
            Message::HasFd { id, .. } => *id,
        }
    }

    pub fn message_type(&self) -> &'static str {
        match self {
            Message::Shutdown { .. } => "shutdown",
            Message::ListFds { .. } => "list",
            Message::ListFdsResult { .. } => "list_result",
            Message::CloseFd { .. } => "close",
            Message::CloseAllFds { .. } => "close_all",
            Message::Error { .. } => "error",
            Message::Success { .. } => "success",
            Message::PutFd { .. } => "put",
            Message::GetFd { .. } => "get",
            Message::Ping { .. } => "ping",
            Message::Pong { .. } => "pong",
            Message::GetProtocolVersion { .. } => "get_protocol_version",
            Message::GetProtocolVersionResult { .. } => "get_protocol_result",
            Message::StartProcess(_) => "start_process",
            Message::SignalProcess { .. } => "kill_process",
            Message::ProcessDied { .. } => "process_died",
            Message::ListProcesses { .. } => "list_processes",
            Message::ListProcessesResult { .. } => "list_processes_result",
            Message::SuccessWithFd { .. } => "success_with_fd",
            Message::NotFound { .. } => "not_found",
            Message::HasFd { .. } => "has_fd",
        }
    }

    pub fn with_fd(&self) -> bool {
        matches!(self, Message::PutFd { .. } | Message::SuccessWithFd { .. })
    }
}

/// Run the simpleadmin-persist daemon (root)
///
/// You should probably not run this manually, instead this should be run through
/// the simpleadmin-persist systemd service
///
/// The simpleadmin-persist owns the processes and file descriptions for services
/// managed by simpleadmin-client. This is done such that simpleadmin-client can
/// be restarted without services being affected.
#[derive(clap::Parser)]
pub struct PersistDaemon {
    #[clap(long, default_value = "info")]
    log_level: log::LevelFilter,
}

struct State {
    fds: Mutex<HashMap<String, OwnedFd>>,
    processes: Mutex<HashMap<String, u32>>,
    connections: Mutex<HashMap<u64, Arc<tokio::sync::Mutex<tokio::net::unix::OwnedWriteHalf>>>>,
}

impl State {
    async fn send_message(
        stream: &tokio::sync::Mutex<tokio::net::unix::OwnedWriteHalf>,
        message: Message,
        fd: Option<BorrowedFd<'_>>,
    ) -> Result<()> {
        let m = serde_json::to_vec(&message)?;
        let mut s = stream.lock().await;
        s.write_u32(m.len().try_into()?).await?;
        s.write_all(&m).await?;
        if let Some(fd) = fd {
            assert!(message.with_fd());
            tokio_passfd::send_fd(&mut s, &fd).await?;
        } else {
            assert!(!message.with_fd());
        }
        s.flush().await?;
        Ok(())
    }

    async fn handle_process(self: Arc<Self>, key: String, mut child: tokio::process::Child) {
        let ret = child.wait().await;
        info!("Child process {} finished {:?}", key, ret);
        self.processes.lock().unwrap().remove(&key);
        let cons: Vec<_> = self.connections.lock().unwrap().values().cloned().collect();
        let code = match ret {
            Err(_) => -99,
            Ok(v) => v.into_raw(),
        };
        info!("Child process {} finished with code: {}", key, code);
        for con in cons {
            let _ = Self::send_message(
                &con,
                Message::ProcessDied {
                    key: key.clone(),
                    code,
                },
                None,
            )
            .await;
        }
    }

    async fn start_process(self: &Arc<Self>, sp: StartProcess) -> Result<()> {
        let mut cmd = tokio::process::Command::new(sp.path);
        if let Some(dir) = sp.current_dir {
            cmd.current_dir(dir);
        }
        for arg in sp.args {
            cmd.arg(arg);
        }
        cmd.env_clear();
        for (k, v) in sp.env {
            cmd.env(k, v);
        }
        let mut ofds = Vec::new();
        {
            let fds = self.fds.lock().unwrap();
            for (k, v) in sp.fds {
                match fds.get(&k) {
                    Some(fd) => ofds.push((v, fd.try_clone()?)),
                    None => bail!("No fd with key '{}' registered", k),
                }
            }
        }
        let uid = sp.uid;
        let gid = sp.gid;
        let cgroup = sp.cgroup;
        let umask = sp.umask;
        unsafe {
            cmd.pre_exec(move || {
                if let Some(cgroup) = &cgroup {
                    let pid = nix::unistd::getpid();
                    cgroups_rs::Cgroup::load(Box::new(cgroups_rs::hierarchies::V2::new()), cgroup)
                        .add_task((pid.as_raw() as u64).into())
                        .map_err(|e| {
                            std::io::Error::new(
                                std::io::ErrorKind::AddrNotAvailable,
                                format!("failed to put process into cgroup: {}", e),
                            )
                        })?
                }
                if let Some(umask) = umask {
                    nix::sys::stat::umask(nix::sys::stat::Mode::from_bits_truncate(umask));
                }
                let _ = nix::unistd::close(0);
                let _ = nix::unistd::close(1);
                let _ = nix::unistd::close(2);
                for (newfd, oldfd) in &ofds {
                    nix::unistd::dup2(oldfd.as_raw_fd(), *newfd)?;
                }
                if let Some(uid) = gid {
                    nix::unistd::setgid(nix::unistd::Gid::from_raw(uid))?;
                }
                if let Some(uid) = uid {
                    nix::unistd::setuid(nix::unistd::Uid::from_raw(uid))?;
                }
                Ok(())
            });
        }
        info!("Spawning {:?}", cmd);
        let child = cmd.spawn().context("Unable to spawn")?;
        let pid = child.id().context("Expected pid")?;
        info!("Started process key {}, pid {}", sp.key, pid);
        self.processes.lock().unwrap().insert(sp.key.clone(), pid);
        tokio::task::spawn(self.clone().handle_process(sp.key, child));

        Ok(())
    }

    async fn handle_client_message_inner(
        self: &Arc<Self>,
        message: Message,
        stream: &tokio::sync::Mutex<tokio::net::unix::OwnedWriteHalf>,
        fd: Option<OwnedFd>,
    ) -> Result<()> {
        match message {
            Message::Shutdown { .. } => bail!("Shutdown not implemented"),
            Message::ListFds { id, key_prefix } => {
                let fd_keys = self
                    .fds
                    .lock()
                    .unwrap()
                    .keys()
                    .filter(|v| match &key_prefix {
                        Some(prefix) => v.starts_with(prefix),
                        None => true,
                    })
                    .cloned()
                    .collect();
                Self::send_message(stream, Message::ListFdsResult { id, fd_keys }, None).await?;
            }
            Message::CloseFd { id, key } => {
                let found = self.fds.lock().unwrap().remove(&key).is_none();
                if found {
                    Self::send_message(stream, Message::NotFound { id }, None).await?;
                } else {
                    Self::send_message(stream, Message::Success { id }, None).await?;
                }
            }
            Message::CloseAllFds { id } => {
                self.fds.lock().unwrap().clear();
                Self::send_message(stream, Message::Success { id }, None).await?;
            }
            Message::PutFd { id, key } => {
                let fd = fd.context("Expected fd")?;
                self.fds.lock().unwrap().insert(key, fd);
                Self::send_message(stream, Message::Success { id }, None).await?;
            }
            Message::GetFd { id, key } => {
                let fd = match self.fds.lock().unwrap().get(&key) {
                    Some(fd) => Some(fd.try_clone()?),
                    None => None,
                };
                match fd {
                    Some(fd) => {
                        Self::send_message(stream, Message::SuccessWithFd { id }, Some(fd.as_fd()))
                            .await?
                    }
                    None => Self::send_message(stream, Message::NotFound { id }, None).await?,
                };
                // fd is dropped and closed here, but it is just a dup() of fd in the hashmap
            }
            Message::Ping { id } => {
                Self::send_message(stream, Message::Pong { id }, None).await?;
            }
            Message::GetProtocolVersion { id } => {
                Self::send_message(
                    stream,
                    Message::GetProtocolVersionResult {
                        id,
                        version: VERSION,
                    },
                    None,
                )
                .await?;
            }
            Message::StartProcess(sp) => {
                let id = sp.id;
                self.start_process(sp).await.context("In start process")?;
                Self::send_message(stream, Message::Success { id }, None).await?;
            }
            Message::SignalProcess { id, key, signal } => {
                let pid = self.processes.lock().unwrap().get(&key).cloned();
                if let Some(pid) = pid {
                    let signal =
                        nix::sys::signal::Signal::try_from(signal).context("Invalid signal")?;
                    nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid as i32), signal)?;
                    Self::send_message(stream, Message::Success { id }, None).await?;
                } else {
                    Self::send_message(stream, Message::NotFound { id }, None).await?;
                }
            }
            Message::ListProcesses { id, key_prefix } => {
                let process_keys = self
                    .processes
                    .lock()
                    .unwrap()
                    .keys()
                    .filter(|v| match &key_prefix {
                        Some(prefix) => v.starts_with(prefix),
                        None => true,
                    })
                    .cloned()
                    .collect();
                Self::send_message(
                    stream,
                    Message::ListProcessesResult { id, process_keys },
                    None,
                )
                .await?;
            }
            Message::HasFd { id, key } => {
                let msg = match self.fds.lock().unwrap().contains_key(&key) {
                    true => Message::Success { id },
                    false => Message::NotFound { id },
                };
                Self::send_message(stream, msg, None).await?;
            }
            msg => {
                bail!(
                    "Unhandeled message {} of type {}",
                    msg.id(),
                    msg.message_type()
                );
            }
        }
        Ok(())
    }

    async fn handle_client_message(
        self: Arc<Self>,
        message: Message,
        stream: Arc<tokio::sync::Mutex<tokio::net::unix::OwnedWriteHalf>>,
        fd: Option<OwnedFd>,
    ) {
        let id = message.id();
        if let Err(e) = self.handle_client_message_inner(message, &stream, fd).await {
            error!("Error in handle_client_message info for message: {:?}", e);
            if let Err(e) = Self::send_message(
                &stream,
                Message::Error {
                    id,
                    message: e.to_string(),
                },
                None,
            )
            .await
            {
                error!("Failed to write to stream: {}", e);
            }
        }
    }

    #[allow(clippy::read_zero_byte_vec)]
    async fn handle_client_inner(
        self: &Arc<Self>,
        stream: UnixStream,
        connection_id: u64,
    ) -> Result<()> {
        let (mut r, w) = stream.into_split();
        let w = Arc::new(tokio::sync::Mutex::new(w));
        self.connections
            .lock()
            .unwrap()
            .insert(connection_id, w.clone());
        let mut buf = Vec::new();
        loop {
            let len = match r.read_u32().await {
                Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
                v => v?,
            };
            buf.resize(len as usize, 0);
            r.read_exact(&mut buf).await?;
            let message: Message = serde_json::from_slice(&buf).context("deserializing message")?;
            debug!("Got message {}", message.message_type());
            let fd = if message.with_fd() {
                Some(tokio_passfd::recv_fd(&mut r).await.context("Reading fd")?)
            } else {
                None
            };
            tokio::spawn(self.clone().handle_client_message(message, w.clone(), fd));
        }
        Ok(())
    }

    async fn handle_client(self: Arc<Self>, stream: UnixStream, connection_id: u64) {
        info!("Client connected");
        match self.handle_client_inner(stream, connection_id).await {
            Ok(()) => info!("Client disconnected"),
            Err(e) => error!("Error handeling client: {e:?}"),
        }
        self.connections.lock().unwrap().remove(&connection_id);
    }

    async fn run(self: Arc<Self>, path: PathBuf) -> Result<()> {
        if path.exists() {
            let _ = std::fs::remove_file(&path);
        } else if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Unable to create dir {:?}", parent))?;
        }
        let listener =
            UnixListener::bind(&path).with_context(|| format!("Unable to bind to {:?}", path))?;
        // The socket does not accept connections util listen in called so there is no race here
        nix::sys::stat::fchmodat(
            None,
            &path,
            nix::sys::stat::Mode::from_bits_truncate(0o600),
            nix::sys::stat::FchmodatFlags::NoFollowSymlink,
        )?;

        info!("Listining on {:?}", path);

        if let Ok(notifier) = sdnotify::SdNotify::from_env() {
            notifier.notify_ready()?;
        }

        let mut connection_id_cnt = 0;
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let connection_id = connection_id_cnt;
                    connection_id_cnt += 1;
                    tokio::spawn(self.clone().handle_client(stream, connection_id));
                }
                Err(e) => {
                    error!("Failed to accept connection {}", e);
                }
            }
        }
    }
}
pub async fn persist_daemon(args: PersistDaemon) -> Result<()> {
    // Reserve low numbered fds
    let efd = nix::sys::eventfd::eventfd(0, nix::sys::eventfd::EfdFlags::EFD_CLOEXEC)
        .context("Unable to create event fd")?;
    for fd in efd + 1..20 {
        nix::unistd::dup3(3, fd, nix::fcntl::OFlag::O_CLOEXEC).context("Dupping more")?;
    }
    simple_logger::SimpleLogger::new()
        .with_level(args.log_level)
        .init()
        .unwrap();

    let state = Arc::new(State {
        fds: Default::default(),
        processes: Default::default(),
        connections: Default::default(),
    });
    state.run(SOCKET_PATH.into()).await
}
