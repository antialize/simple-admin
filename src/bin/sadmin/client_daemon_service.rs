use std::{
    collections::HashMap,
    io::Write,
    os::unix::prelude::{AsFd, AsRawFd, FromRawFd, OpenOptionsExt, OsStrExt, OwnedFd},
    path::Path,
    process::{ExitStatus, Stdio},
    sync::Arc,
    time::{Duration, Instant, SystemTime},
};

use crate::{
    client_daemon::{self, SERVICE_ORDER},
    persist_daemon,
    service_control::DaemonControlMessage,
    service_description::{Bind, ServiceType},
    tokio_passfd::MyAsFd,
};

use anyhow::{bail, Context, Result};
use bytes::BytesMut;
use cgroups_rs::cgroup_builder::CgroupBuilder;
use log::{debug, error, info};
use nix::{
    sys::memfd::{memfd_create, MemFdCreateFlag},
    unistd::User,
};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{unix::AsyncFd, AsyncReadExt, AsyncWriteExt},
    net::UnixDatagram,
    net::UnixStream,
};
use tokio_tasks::{cancelable, RunToken, Task, TaskBase, TaskBuilder};

use crate::service_description::ServiceDescription;

const SERVICES_BUF_SIZE: usize = 1024 * 64;

#[derive(Serialize)]
pub struct StatusJsonV1 {
    name: String,
    state: ServiceState,
    status: String,
    deploy_user: String,
    deploy_time: SystemTime,
    start_stop_time: SystemTime,
    instance_id: u64,
    pod_name: Option<String>,
    image: Option<String>,
}

#[derive(Serialize)]
struct DockerAuth {
    auth: String,
}

#[derive(Serialize)]
struct DockerConf {
    auths: HashMap<String, DockerAuth>,
}

#[allow(dead_code)]
#[repr(u8)]
pub enum Priority {
    Emergency,
    Alert,
    Critical,
    Error,
    Warning,
    Notice,
    Info,
    Debug,
}

/// Append message to systemd journal
async fn send_journal_message(
    socket: &tokio::net::UnixDatagram,
    priority: Priority,
    message: &[u8],
    unit: &str,
    instance_id: u64,
) -> Result<()> {
    let mut msg = Vec::new();
    match priority {
        Priority::Emergency => msg.extend(b"PRIORITY=0\n"),
        Priority::Alert => msg.extend(b"PRIORITY=1\n"),
        Priority::Critical => msg.extend(b"PRIORITY=2\n"),
        Priority::Error => msg.extend(b"PRIORITY=3\n"),
        Priority::Warning => msg.extend(b"PRIORITY=4\n"),
        Priority::Notice => msg.extend(b"PRIORITY=5\n"),
        Priority::Info => msg.extend(b"PRIORITY=6\n"),
        Priority::Debug => msg.extend(b"PRIORITY=7\n"),
    }
    msg.extend(b"UNIT=");
    msg.extend(unit.as_bytes());
    msg.push(b'\n');
    let _ = writeln!(msg, "INSTANCE={}", instance_id);
    if message.contains(&b'\n') {
        msg.extend(b"MESSAGE\n");
        msg.extend((message.len() as u64).to_le_bytes());
        msg.extend(message);
        msg.push(b'\n');
    } else {
        msg.extend(b"MESSAGE=");
        msg.extend(message);
        msg.push(b'\n');
    }

    // Try to see if we can send the message as a normal socket masseg
    match socket.send(&msg).await {
        Ok(_) => return Ok(()),
        // `EMSGSIZE` (errno code 90) means the message was too long for a UNIX socket,
        Err(e) if e.raw_os_error() == Some(90) => {}
        Err(e) => return Err(e.into()),
    };

    // Slow path, send over memfd
    let name = std::ffi::CString::new("logging")?;
    let memfd = memfd_create(&name, MemFdCreateFlag::MFD_ALLOW_SEALING)?;
    let mut memfd = unsafe { std::fs::File::from_raw_fd(memfd) };
    memfd.write_all(&msg)?;
    nix::fcntl::fcntl(
        memfd.as_raw_fd(),
        nix::fcntl::FcntlArg::F_ADD_SEALS(nix::fcntl::SealFlag::all()),
    )?;
    loop {
        socket.writable().await?;
        match socket.try_io(tokio::io::Interest::WRITABLE, || {
            let fds = &[memfd.as_raw_fd()];
            let cmsgs = [nix::sys::socket::ControlMessage::ScmRights(fds)];
            nix::sys::socket::sendmsg::<()>(
                socket.as_raw_fd(),
                &[],
                &cmsgs,
                nix::sys::socket::MsgFlags::empty(),
                None,
            )
            .map_err(|v| v.into())
        }) {
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                continue;
            }
            Ok(_) => return Ok(()),
            Err(e) => return Err(e.into()),
        }
    }
}

pub enum RemoteLogTarget<'a> {
    ServiceControl(&'a mut UnixStream),
    ServiceControlLock(&'a tokio::sync::Mutex<&'a mut UnixStream>),
    Null,
    Unit {
        socket: &'a UnixDatagram,
        name: String,
        instance_id: u64,
    },
    Backend {
        id: u64,
        client: Arc<client_daemon::Client>,
    },
}

impl<'a> RemoteLogTarget<'a> {
    pub async fn stdout(&mut self, data: &[u8]) -> Result<()> {
        match self {
            RemoteLogTarget::ServiceControl(stream) => {
                let v = serde_json::to_vec(&DaemonControlMessage::Stdout {
                    data: base64::encode(data),
                })?;
                stream.write_u32(v.len().try_into()?).await?;
                stream.write_all(&v).await?;
                stream.flush().await?;
            }
            RemoteLogTarget::Null => (),
            RemoteLogTarget::Unit {
                socket,
                name,
                instance_id,
            } => send_journal_message(socket, Priority::Info, data, name, *instance_id).await?,
            RemoteLogTarget::ServiceControlLock(l) => {
                let v = serde_json::to_vec(&DaemonControlMessage::Stdout {
                    data: base64::encode(data),
                })?;
                let mut stream = l.lock().await;
                stream.write_u32(v.len().try_into()?).await?;
                stream.write_all(&v).await?;
                stream.flush().await?;
            }
            RemoteLogTarget::Backend { id, client } => {
                client
                    .send_message(client_daemon::ClientMessage::Data(
                        client_daemon::DataMessage {
                            id: *id,
                            source: Some(client_daemon::DataSource::Stdout),
                            data: base64::encode(data).into(),
                            eof: None,
                        },
                    ))
                    .await;
            }
        }
        Ok(())
    }

    pub async fn stderr(&mut self, data: &[u8]) -> Result<()> {
        match self {
            RemoteLogTarget::ServiceControl(stream) => {
                let v = serde_json::to_vec(&DaemonControlMessage::Stderr {
                    data: base64::encode(data),
                })?;
                stream.write_u32(v.len().try_into()?).await?;
                stream.write_all(&v).await?;
                stream.flush().await?;
            }
            RemoteLogTarget::Null => (),
            RemoteLogTarget::Unit {
                socket,
                name,
                instance_id,
            } => send_journal_message(socket, Priority::Error, data, name, *instance_id).await?,
            RemoteLogTarget::ServiceControlLock(l) => {
                let v = serde_json::to_vec(&DaemonControlMessage::Stderr {
                    data: base64::encode(data),
                })?;
                let mut stream = l.lock().await;
                stream.write_u32(v.len().try_into()?).await?;
                stream.write_all(&v).await?;
                stream.flush().await?;
            }
            RemoteLogTarget::Backend { id, client } => {
                client
                    .send_message(client_daemon::ClientMessage::Data(
                        client_daemon::DataMessage {
                            id: *id,
                            source: Some(client_daemon::DataSource::Stderr),
                            data: base64::encode(data).into(),
                            eof: None,
                        },
                    ))
                    .await;
            }
        }
        Ok(())
    }
}

async fn run_script(name: String, src: &String, log: &mut RemoteLogTarget<'_>) -> Result<()> {
    let (first, _) = src
        .split_once('\n')
        .with_context(|| format!("Expected two lines in script {}", name))?;
    let interperter = first
        .strip_prefix("#!")
        .with_context(|| format!("Expected interperter in script {}", name))?;
    let mut f = tempfile::Builder::new().prefix(&name).tempfile()?;
    f.write_all(src.as_bytes())?;
    f.flush()?;
    let result = forward_command(
        tokio::process::Command::new(interperter).arg(f.path()),
        &None,
        log,
    )
    .await
    .context("Failed running script")?;
    if !result.success() {
        bail!("Error running script {}: {:?}", name, result);
    }
    Ok(())
}

async fn forward_command(
    cmd: &mut tokio::process::Command,
    user: &Option<User>,
    log: &mut RemoteLogTarget<'_>,
) -> Result<ExitStatus> {
    let mut line = Vec::new();
    write!(
        &mut line,
        "{}$ ",
        user.as_ref().map(|u| u.name.as_str()).unwrap_or("root")
    )?;
    line.extend(cmd.as_std().get_program().as_bytes());
    for arg in cmd.as_std().get_args() {
        line.push(b' ');
        let arg = arg.as_bytes();
        if arg.contains(&b'"') || arg.contains(&b'\'') {
            line.push(b'"');
            line.extend(arg);
            line.push(b'"');
        } else {
            line.extend(arg);
        }
    }
    line.push(b'\n');
    log.stdout(&line).await?;
    let mut cmd = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir("/tmp");

    if let Some(user) = user {
        cmd = cmd
            .uid(user.uid.as_raw())
            .gid(user.gid.as_raw())
            .env("HOME", &user.dir)
            .env("USER", &user.name);
    }
    let mut cmd = cmd.kill_on_drop(true).spawn()?;

    let mut stdout = cmd.stdout.take().unwrap();
    let mut stderr = cmd.stderr.take().unwrap();

    let mut stdout_buf = BytesMut::with_capacity(1024 * 64);
    let mut stderr_buf = BytesMut::with_capacity(1024 * 64);

    let mut stdout_result = None;
    let mut stderr_result = None;
    let mut wait_result = None;

    while stdout_result.is_none() || stderr_result.is_none() || wait_result.is_none() {
        tokio::select! {
            x = cmd.wait(), if wait_result.is_none() => {
                wait_result = Some(x)
            }
            v = stdout.read_buf(&mut stdout_buf), if stdout_result.is_none() => {
                match v {
                    Ok(v) if v == 0 => stdout_result = Some(Ok(())),
                    Ok(_) => {
                        log.stdout(&stdout_buf).await?;
                        stdout_buf.clear();
                    }
                    Err(e) => stdout_result = Some(Err(e))
                }
            }
            v = stderr.read_buf(&mut stderr_buf), if stderr_result.is_none() => {
                match v {
                    Ok(v) if v == 0 => stderr_result = Some(Ok(())),
                    Ok(_) => {
                        log.stderr(&stderr_buf).await?;
                        stderr_buf.clear();
                    }
                    Err(e) => stderr_result = Some(Err(e))
                }
            }
        }
    }
    stdout_result.unwrap()?;
    stderr_result.unwrap()?;
    Ok(wait_result.unwrap()?)
}

fn create_pipe() -> Result<(OwnedFd, OwnedFd), std::io::Error> {
    let (r, w) = nix::unistd::pipe2(nix::fcntl::OFlag::O_CLOEXEC | nix::fcntl::OFlag::O_NONBLOCK)?;
    unsafe { Ok((OwnedFd::from_raw_fd(r), OwnedFd::from_raw_fd(w))) }
}

fn bind_key(bind: &Bind, service: &str) -> String {
    match bind {
        Bind::Tcp { bind, .. } => format!("service.{}.bind.{}", service, bind),
        Bind::UnixStream { path, .. } => format!("service.{}.bind.{}", service, path),
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
enum ServiceState {
    Starting,
    Ready,
    Stopping,
    Reloading,
    Stopped,
    Running,
    New,
}

struct ServiceInstance {
    stdout: AsyncFd<OwnedFd>,
    stderr: AsyncFd<OwnedFd>,
    dead: tokio::sync::oneshot::Receiver<i32>,
    notify_socket: tokio::net::UnixDatagram,
    instance_id: u64,
    watchdog_timout: std::time::Instant,
    #[allow(dead_code)]
    pod_name: Option<String>,
    go_stdout: bool,
    go_stderr: bool,
    buf: Vec<u8>,
    code: Option<i32>,
}

#[derive(Serialize, Deserialize)]
struct ServiceStatus {
    status: String,
    state: ServiceState,
    description: ServiceDescription,
    extra_env: HashMap<String, String>,
    instance_id: u64,
    enabled: bool,
    stdout_key: Option<String>,
    stderr_key: Option<String>,
    notify_key: Option<String>,
    process_key: Option<String>,
    start_stop_time: std::time::SystemTime,
    deploy_time: std::time::SystemTime,
    deploy_user: String,
    image: Option<String>,
    pod_name: Option<String>,
}

enum DeployAction {
    ExtractFile {
        path: String,
        backup: Option<String>,
    },
    StopService,
    CreateService,
    StartPodmanImage {
        name: String,
        user: Option<User>,
    },
}

type ServiceTask = Arc<Task<Option<ServiceInstance>, anyhow::Error>>;

enum ProcessServiceInstanceRes {
    Finished,
    WatchdogTimeout,
    Ready,
    Canceled,
    Timeout,
}

enum StopState {
    Sent15,
    Sent9,
    Finished,
}

struct Stop {
    service: Arc<Service>,
    timeout: Option<std::time::Instant>,
    state: StopState,
    process_key: String,
    instance: ServiceInstance,
}

impl Stop {
    async fn new(
        service: Arc<Service>,
        run_task: &std::sync::Mutex<Option<ServiceTask>>,
        status: &std::sync::Mutex<ServiceStatus>,
        overlap: bool,
        log: &mut RemoteLogTarget<'_>,
    ) -> Result<Option<Stop>> {
        let task = match run_task.lock().unwrap().clone() {
            Some(v) => v,
            None => {
                debug!("No run task for service");
                return Ok(None);
            }
        };
        task.run_token().cancel();
        let instance = match task.wait().await {
            Ok(Some(instance)) => instance,
            Ok(None) => {
                debug!("No instance for service");
                return Ok(None);
            }
            Err(_) => bail!("Failed to wait for task"),
        };

        let (process_key, stop_timeout, user, pod_name, overlap_stop_signal) = {
            let status = status.lock().unwrap();
            let process_key = status.process_key.clone().context("Expected process key")?;
            (
                process_key,
                status.description.stop_timeout,
                status.description.user.clone(),
                status.pod_name.clone(),
                status.description.overlap_stop_signal,
            )
        };
        info!("Stopping {}", service.name);
        let signal = if overlap { overlap_stop_signal } else { None }
            .unwrap_or(crate::service_description::Signal::Term);

        if let Some(pod_name) = pod_name {
            let mut line = Vec::new();
            writeln!(
                &mut line,
                "{}$ podman kill {}",
                user.as_deref().unwrap_or("root"),
                pod_name
            )?;
            log.stdout(&line).await?;

            let mut cmd = tokio::process::Command::new("/usr/bin/podman");
            cmd.arg("kill")
                .arg(pod_name)
                .arg("--signal")
                .arg(signal.name())
                .env_clear()
                .current_dir("/tmp")
                .env(
                    "PATH",
                    "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                )
                .kill_on_drop(true);
            if let Some(user) = &user {
                let user = nix::unistd::User::from_name(user)?
                    .with_context(|| format!("Unknown user {}", user))?;
                cmd.env("USER", user.name)
                    .env("HOME", user.dir)
                    .uid(user.uid.as_raw())
                    .gid(user.gid.as_raw());
            }
            info!("  Running podman kill");
            let output = cmd.output().await.context("Failed running podman kill")?;
            if !output.status.success() {
                bail!(
                    "Failed running podman kill: {}\n{}{}",
                    output.status,
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stdout)
                );
            }
        } else {
            log.stdout("Sending sigterm to process\n".as_bytes())
                .await?;

            info!("  Sending sigterm to {}", service.name);
            // Send sig term
            service
                .client
                .persist_signal_process(process_key.clone(), signal.number())
                .await?;
        }
        let timeout = stop_timeout.map(|v| std::time::Instant::now() + Duration::from(v));
        Ok(Some(Self {
            service,
            timeout,
            state: StopState::Sent15,
            process_key,
            instance,
        }))
    }

    async fn run(
        &mut self,
        rt: &RunToken,
        status: &std::sync::Mutex<ServiceStatus>,
        timeout: Option<std::time::Instant>,
        log: &mut RemoteLogTarget<'_>,
    ) -> Result<bool> {
        if matches!(self.state, StopState::Finished) {
            return Ok(true);
        }
        let (timeout, our_timeout) = match (timeout, self.timeout) {
            (Some(o), None) => (Some(o), true),
            (Some(o), Some(v)) if o < v => (Some(o), true),
            (_, v) => (v, false),
        };
        loop {
            match self
                .service
                .process_service_instance(rt, &mut self.instance, status, log, false, true, timeout)
                .await?
            {
                ProcessServiceInstanceRes::Timeout | ProcessServiceInstanceRes::WatchdogTimeout => {
                    if our_timeout {
                        return Ok(false);
                    }
                    if matches!(self.state, StopState::Sent9) {
                        break;
                    } else {
                        info!(
                            "  Timeout waiting for {} to die, sending sigkill",
                            self.service.name
                        );
                        log.stdout(
                            "Service did not stop within sufficient time. Sending sigkill\n"
                                .as_bytes(),
                        )
                        .await?;
                        self.service
                            .client
                            .persist_signal_process(self.process_key.clone(), 9)
                            .await?;
                        self.state = StopState::Sent9;
                        self.timeout =
                            Some(std::time::Instant::now() + std::time::Duration::from_secs(10));
                    }
                }
                ProcessServiceInstanceRes::Canceled => return Ok(false),
                ProcessServiceInstanceRes::Ready => {
                    bail!("Logic error")
                }
                ProcessServiceInstanceRes::Finished => break,
            }
        }
        let instance_id = {
            let mut status = status.lock().unwrap();
            status.state = ServiceState::Stopped;
            status.instance_id
        };
        self.service.cleanup_instance(instance_id).await?;
        info!("  Stopped {}", self.service.name);
        self.state = StopState::Finished;
        Ok(true)
    }
}

pub struct Service {
    name: String,
    client: Arc<client_daemon::Client>,
    run_task: std::sync::Mutex<Option<ServiceTask>>,
    status: std::sync::Mutex<ServiceStatus>,
}

impl Service {
    pub fn name(&self) -> &str {
        &self.name
    }

    fn persist_status(self: &Arc<Self>) -> Result<()> {
        let state: String = serde_json::to_string_pretty(&*self.status.lock().unwrap())?;
        self.client.db.lock().unwrap().execute(
            "REPLACE INTO `services`(`name`, `state`) VALUES (?, ?)",
            (&self.name, &state),
        )?;
        Ok(())
    }

    fn create_run_service_task(
        self: &Arc<Self>,
        instance: Option<ServiceInstance>,
    ) -> Option<Arc<Task<Option<ServiceInstance>, anyhow::Error>>> {
        let task_builder =
            TaskBuilder::new(format!("service_{}", self.name)).shutdown_order(SERVICE_ORDER);
        let task_id = task_builder.id();
        let task = task_builder.create(|rt| self.clone().run_service(rt, instance, task_id));
        self.run_task.lock().unwrap().replace(task)
    }

    async fn load_from_status(
        self: &Arc<Self>,
        status: ServiceStatus,
        dead: Option<tokio::sync::oneshot::Receiver<i32>>,
        running: bool,
    ) -> Result<()> {
        if running {
            let stdout_key = status.stdout_key.clone().context("Expected stdout key")?;
            let stderr_key = status.stderr_key.clone().context("Expected stderr key")?;
            let notify_key = status.notify_key.clone().context("Expected notify key")?;
            let stdout = self
                .client
                .persist_get_fd(stdout_key)
                .await?
                .context("Unable to fetch stdout fd")?;
            let stderr = self
                .client
                .persist_get_fd(stderr_key)
                .await?
                .context("Unable to fetch stderr fd")?;
            let notify = self
                .client
                .persist_get_fd(notify_key)
                .await?
                .context("Unable to fetch notify fd")?;

            let watchdog_timout = match status.description.watchdog_timeout {
                Some(v) => std::time::Instant::now() + std::time::Duration::from(v),
                None => std::time::Instant::now(),
            };

            let mut buf = Vec::new();
            buf.resize(SERVICES_BUF_SIZE, 0);
            let instance = ServiceInstance {
                stdout: AsyncFd::new(stdout)?,
                stderr: AsyncFd::new(stderr)?,
                dead: dead.context("Expected dead")?,
                notify_socket: UnixDatagram::from_std(notify.into())?,
                instance_id: status.instance_id,
                pod_name: status.pod_name.clone(),
                watchdog_timout,
                buf,
                go_stderr: true,
                go_stdout: true,
                code: None,
            };

            if status.enabled {
                *self.status.lock().unwrap() = status;
                self.create_run_service_task(Some(instance));
            } else {
                todo!("Implement support for stopping running service here");
            }
        } else if status.enabled {
            *self.status.lock().unwrap() = status;
            self.create_run_service_task(None);
        }
        Ok(())
    }

    async fn run_service(
        self: Arc<Self>,
        run_token: RunToken,
        mut instance: Option<ServiceInstance>,
        task_id: usize,
    ) -> Result<Option<ServiceInstance>> {
        while !run_token.is_cancelled() {
            let ins = match &mut instance {
                Some(v) => v,
                None => {
                    let (desc, extra_env, image, deploy_user, deploy_time, instance_id) = {
                        let status = self.status.lock().unwrap();
                        (
                            status.description.clone(),
                            status.extra_env.clone(),
                            status.image.clone(),
                            status.deploy_user.clone(),
                            status.deploy_time,
                            status.instance_id,
                        )
                    };
                    let mut log = RemoteLogTarget::Unit {
                        name: self.name.clone(),
                        instance_id,
                        socket: &self.client.journal_socket,
                    };
                    log.stdout(b"Starting service\n").await?;
                    info!("Starting service {}", self.name);
                    let (ins, mut status) =
                        match self.start_instance(desc, extra_env, image, &mut log).await {
                            Ok(v) => v,
                            Err(e) => {
                                const SLEEP_TIME: u64 = 5;
                                error!(
                                    "Failed starting service {}: {:?}. Will retry in {} secs",
                                    self.name, e, SLEEP_TIME
                                );
                                log.stdout(
                                    format!(
                                        "Failed starting service: {:?}. Will retry in {} secs\n",
                                        e, SLEEP_TIME
                                    )
                                    .as_bytes(),
                                )
                                .await?;
                                if cancelable(
                                    &run_token,
                                    tokio::time::sleep(std::time::Duration::from_secs(SLEEP_TIME)),
                                )
                                .await
                                .is_err()
                                {
                                    break;
                                }
                                continue;
                            }
                        };
                    status.deploy_user = deploy_user;
                    status.deploy_time = deploy_time;
                    *self.status.lock().unwrap() = status;
                    self.persist_status()?;
                    let _ = instance.insert(ins);
                    continue;
                }
            };
            match self
                .process_service_instance(
                    &run_token,
                    ins,
                    &self.status,
                    &mut RemoteLogTarget::Null,
                    false,
                    true,
                    None,
                )
                .await
            {
                Ok(ProcessServiceInstanceRes::Canceled) => break,
                Ok(ProcessServiceInstanceRes::Ready | ProcessServiceInstanceRes::Timeout) => {
                    bail!("Logic error")
                }
                Ok(ProcessServiceInstanceRes::Finished) => {
                    error!("Service {} stopped unexpectily", self.name);
                    let instance_id = self.status.lock().unwrap().instance_id;
                    let mut log = RemoteLogTarget::Unit {
                        name: self.name.clone(),
                        instance_id,
                        socket: &self.client.journal_socket,
                    };
                    instance = None;
                    log.stdout(b"Serivce stop unexpectily").await?;
                }
                Ok(ProcessServiceInstanceRes::WatchdogTimeout) => {
                    error!("Service {} timeouted waiting for watchdog", self.name);
                    let (instance_id, process_key) = {
                        let status = self.status.lock().unwrap();
                        (status.instance_id, status.process_key.clone())
                    };
                    let mut log = RemoteLogTarget::Unit {
                        name: self.name.clone(),
                        instance_id,
                        socket: &self.client.journal_socket,
                    };
                    log.stdout(b"Timouted waiting for watchdog").await?;
                    if let Some(process_key) = process_key {
                        self.client.persist_signal_process(process_key, 9).await?;
                        match self
                            .process_service_instance(
                                &run_token,
                                ins,
                                &self.status,
                                &mut RemoteLogTarget::Null,
                                false,
                                false,
                                Some(Instant::now() + Duration::from_secs(10)),
                            )
                            .await?
                        {
                            ProcessServiceInstanceRes::Finished
                            | ProcessServiceInstanceRes::Canceled => (),
                            ProcessServiceInstanceRes::WatchdogTimeout
                            | ProcessServiceInstanceRes::Ready => {
                                bail!("Result should not happen")
                            }
                            ProcessServiceInstanceRes::Timeout => {
                                error!("Gave up waiting for process to exit")
                            }
                        }
                    }
                    instance = None;
                }
                Err(e) => {
                    let instance_id = self.status.lock().unwrap().instance_id;

                    let mut log = RemoteLogTarget::Unit {
                        name: self.name.clone(),
                        instance_id,
                        socket: &self.client.journal_socket,
                    };
                    error!("Service {} failed: {:?}", self.name, e);
                    log.stdout(format!("Service failed:{}\n", e).as_bytes())
                        .await?;

                    self.cleanup_instance(instance_id).await?;
                }
            }
        }

        let mut run_task = self.run_task.lock().unwrap();
        if run_task
            .as_ref()
            .map(|v| v.id() == task_id)
            .unwrap_or_default()
        {
            *run_task = None;
        }
        Ok(instance)
    }

    pub fn new(client: Arc<client_daemon::Client>, name: String) -> Self {
        Self {
            name: name.clone(),
            client,
            run_task: Default::default(),
            status: std::sync::Mutex::new(ServiceStatus {
                status: Default::default(),
                state: ServiceState::New,
                description: ServiceDescription {
                    name,
                    service_type: ServiceType::Plain,
                    user: Default::default(),
                    enable_linger: Default::default(),
                    ssl_service: Default::default(),
                    ssl_identity: Default::default(),
                    ssl_subcert: Default::default(),
                    pre_deploy: Default::default(),
                    pre_start: Default::default(),
                    max_memory: Default::default(),
                    extract_files: Default::default(),
                    service_executable: Default::default(),
                    args: Default::default(),
                    bind: Default::default(),
                    overlap: Default::default(),
                    watchdog_timeout: Default::default(),
                    start_timeout: Default::default(),
                    stop_timeout: Default::default(),
                    pod_mount: Default::default(),
                    pod_options: Default::default(),
                    env: Default::default(),
                    pod_env: Default::default(),
                    overlap_stop_signal: Default::default(),
                },
                extra_env: Default::default(),
                instance_id: 0,
                enabled: true,
                stdout_key: None,
                stderr_key: None,
                notify_key: None,
                process_key: None,
                start_stop_time: SystemTime::now(),
                deploy_time: SystemTime::now(),
                deploy_user: "unset".to_string(),
                image: None,
                pod_name: None,
            }),
        }
    }

    async fn deploy_inner(
        self: &Arc<Self>,
        image: Option<String>,
        desc: ServiceDescription,
        docker_auth: Option<String>,
        extra_env: HashMap<String, String>,
        log: &mut RemoteLogTarget<'_>,
        actions: &mut Vec<DeployAction>,
    ) -> Result<()> {
        // Find user
        let user = match &desc.user {
            Some(user) => Some(
                nix::unistd::User::from_name(user)?
                    .with_context(|| format!("Unknown user {}", user))?,
            ),
            None => None,
        };

        let mut dc = DockerConf {
            auths: Default::default(),
        };

        if let Some(auth) = docker_auth {
            dc.auths.insert(
                self.client.config.server_host.clone().unwrap_or_default(),
                DockerAuth { auth },
            );
        }

        // Enable linger if required
        if let Some(user) = &user {
            if desc.enable_linger == Some(true) {
                forward_command(
                    tokio::process::Command::new("/usr/bin/loginctl")
                        .arg("enable-linger")
                        .arg(&user.name),
                    &None,
                    log,
                )
                .await?;
            }
        }

        nix::sys::stat::umask(nix::sys::stat::Mode::from_bits_truncate(0o022));
        let t = tempfile::TempDir::new()?;
        let auth_path = t.path().join("docker.conf");
        std::fs::File::options()
            .create_new(true)
            .write(true)
            .mode(0o600)
            .open(&auth_path)?
            .write_all(&serde_json::to_vec(&dc)?)?;
        if let Some(user) = &user {
            nix::unistd::chown(&auth_path, Some(user.uid), Some(user.gid))?;
        }

        // Pull new image
        if let Some(image) = &image {
            let res = forward_command(
                tokio::process::Command::new("/usr/bin/podman")
                    .arg("pull")
                    .arg("--authfile")
                    .arg(&auth_path)
                    .arg(image),
                &user,
                log,
            )
            .await?;
            if !res.success() {
                bail!("Error running podman: {:?}", res);
            }
        }

        if !desc.overlap {
            let state = self.status.lock().unwrap().state;
            match state {
                ServiceState::Stopped | ServiceState::Stopping => (),
                ServiceState::Starting
                | ServiceState::Ready
                | ServiceState::Reloading
                | ServiceState::Running => {
                    self.stop_inner(log).await?;
                    actions.push(DeployAction::StopService);
                }
                ServiceState::New => {
                    actions.push(DeployAction::CreateService);
                }
            }
        }

        // Run pre_deploy
        for (idx, src) in desc.pre_deploy.iter().enumerate() {
            run_script(format!("predeploy {}", idx), src, log).await?;
        }

        // Extract files
        if !desc.extract_files.is_empty() {
            let image = image
                .as_deref()
                .context("Image must be specified for extract_files")?;
            let name = format!(
                "sadmin-extract-files-{}-{}",
                desc.name,
                rand::random::<u64>()
            );
            actions.push(DeployAction::StartPodmanImage {
                name: name.clone(),
                user: user.clone(),
            });
            let res = forward_command(
                tokio::process::Command::new("/usr/bin/podman")
                    .arg("run")
                    .arg("--rm")
                    .arg("--network")
                    .arg("none")
                    .arg("--name")
                    .arg(&name)
                    .arg("--detach")
                    .arg("--entrypoint")
                    .arg("/usr/bin/sleep")
                    .arg(image)
                    .arg("10m"),
                &user,
                log,
            )
            .await?;
            if !res.success() {
                bail!("Error running podman: {:?}", res);
            }
            let t = tempfile::TempDir::new()?;
            if let Some(user) = &user {
                nix::unistd::chown(t.path(), Some(user.uid), Some(user.gid))?;
            }
            for f in &desc.extract_files {
                let tf = t
                    .path()
                    .join(Path::new(&f.dst).file_name().context("Missing name")?);
                let res = forward_command(
                    tokio::process::Command::new("/usr/bin/podman")
                        .arg("cp")
                        .arg(format!("{}:{}", name, f.src))
                        .arg(&tf),
                    &user,
                    log,
                )
                .await?;
                if !res.success() {
                    bail!("Error running podman: {:?}", res);
                }

                let (dir, name) = f.dst.rsplit_once('/').unwrap_or((".", &f.dst));
                let tmp = format!("{}/.sadmin_backup_{}~", dir, name);
                let backup = if std::fs::rename(&f.dst, &tmp).is_ok() {
                    Some(tmp)
                } else {
                    None
                };
                std::fs::rename(&tf, &f.dst)?;
                actions.push(DeployAction::ExtractFile {
                    path: f.dst.clone(),
                    backup,
                })
            }
            forward_command(
                tokio::process::Command::new("/usr/bin/podman")
                    .arg("kill")
                    .arg(&name),
                &user,
                log,
            )
            .await?;
        }

        let (instance, mut status) = self
            .start_instance(desc.clone(), extra_env, image, log)
            .await?;
        std::mem::swap(&mut *self.status.lock().unwrap(), &mut status);

        let old_run_task = self.create_run_service_task(Some(instance));
        self.persist_status()?;

        if !desc.overlap {
            return Ok(());
        }

        let run_task = std::sync::Mutex::new(old_run_task);
        let instance_id = status.instance_id;
        let status = std::sync::Mutex::new(status);

        info!("Atempting to stop old service 1");
        let mut stop = match Stop::new(self.clone(), &run_task, &status, true, log).await? {
            Some(stop) => stop,
            None => return Ok(()),
        };
        let rt = RunToken::new();
        info!("Atempting to stop old service 2");
        if stop
            .run(
                &rt,
                &status,
                Some(Instant::now() + std::time::Duration::from_secs(20)),
                log,
            )
            .await?
        {
            return Ok(());
        }
        log.stdout(b"It is taking a long time for the service to stop. Moving the stopping to a background").await?;
        info!(
            "It is taking long for {}.{} to stop, moving to background",
            self.name, instance_id
        );

        TaskBuilder::new(format!("stop {}.{}", self.name, instance_id))
            .shutdown_order(SERVICE_ORDER)
            .create(move |rt| async move {
                stop.run(&rt, &status, None, &mut RemoteLogTarget::Null)
                    .await?;
                Ok::<(), anyhow::Error>(())
            });
        Ok(())
    }

    pub async fn deploy(
        self: &Arc<Self>,
        image: Option<String>,
        desc: ServiceDescription,
        docker_auth: Option<String>,
        extra_env: HashMap<String, String>,
        log: &mut RemoteLogTarget<'_>,
    ) -> Result<()> {
        let mut actions = Vec::new();
        match self
            .deploy_inner(image, desc, docker_auth, extra_env, log, &mut actions)
            .await
        {
            Ok(()) => {
                for action in actions {
                    match action {
                        DeployAction::ExtractFile { backup, .. } => {
                            if let Some(backup) = backup {
                                let _ = std::fs::remove_file(backup);
                            }
                        }
                        DeployAction::CreateService
                        | DeployAction::StopService
                        | DeployAction::StartPodmanImage { .. } => (),
                    }
                }
            }
            Err(e) => {
                error!(
                    "Deployment failed for {}: {:?}. Restoring state",
                    self.name, e
                );
                log.stderr(format!("Deployment failed: {:?}. Restoring state\n", e).as_bytes())
                    .await?;
                actions.reverse();
                for action in actions {
                    match action {
                        DeployAction::ExtractFile { path, backup } => {
                            let _ = match backup {
                                Some(backup) => std::fs::rename(backup, path),
                                None => std::fs::remove_file(path),
                            };
                        }
                        DeployAction::StopService => {
                            if self.status.lock().unwrap().enabled {
                                self.start(log).await?;
                            }
                        }
                        DeployAction::StartPodmanImage { name, user } => {
                            let _ = forward_command(
                                tokio::process::Command::new("/usr/bin/podman")
                                    .arg("kill")
                                    .arg(&name),
                                &user,
                                log,
                            )
                            .await;
                        }
                        DeployAction::CreateService => {
                            self.remove(log).await?;
                        }
                    }
                }
                bail!("Deployment failed, state restored")
            }
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    async fn process_service_instance(
        self: &Arc<Self>,
        run_token: &RunToken,
        i: &mut ServiceInstance,
        status: &std::sync::Mutex<ServiceStatus>,
        log: &mut RemoteLogTarget<'_>,
        stop_ready: bool,
        with_watchdog_timeout: bool,
        timeout: Option<Instant>,
    ) -> Result<ProcessServiceInstanceRes> {
        let timeout_duration = status.lock().unwrap().description.watchdog_timeout;

        while i.go_stdout || i.go_stderr || i.code.is_none() {
            tokio::select! {
                _ = run_token.cancelled() => {
                    return Ok(ProcessServiceInstanceRes::Canceled)
                },
                _ = tokio::time::sleep_until(i.watchdog_timout.into()), if timeout_duration.is_some() && with_watchdog_timeout => {
                    return Ok(ProcessServiceInstanceRes::WatchdogTimeout)
                }
                _ = tokio::time::sleep_until(timeout.unwrap_or_else(Instant::now).into()), if timeout.is_some() => {
                    return Ok(ProcessServiceInstanceRes::Timeout)
                }
                g = i.stdout.readable(), if i.go_stdout => {
                    match g?.try_io::<usize>(|fd| nix::unistd::read(fd.as_raw_fd(), &mut i.buf).map_err(|v| v.into())){
                    Ok(Ok(v)) => {
                        log.stdout(&i.buf[..v]).await?;

                        send_journal_message(
                            &self.client.journal_socket,
                            Priority::Info,
                            &i.buf[..v],
                            &self.name,
                            i.instance_id
                        ).await?;

                        if v == 0 {
                            i.go_stdout = false;
                            info!("Finished reading from stdout for {}", self.name);

                        }
                    }
                    Err(_) => {continue}
                    Ok(Err(e)) => bail!("Failed reading from stdout: {}", e),
                    }
                },
                g = i.stderr.readable(), if i.go_stderr => {
                    match g?.try_io::<usize>(|fd| nix::unistd::read(fd.as_raw_fd(), &mut i.buf).map_err(|v| v.into())){
                        Ok(Ok(v)) => {
                            log.stderr(&i.buf[..v]).await?;
                            send_journal_message(
                                &self.client.journal_socket,
                                Priority::Error,
                                &i.buf[..v],
                                &self.name,
                                i.instance_id
                            ).await?;

                            if v == 0 {
                                i.go_stderr = false;
                                info!("Finished reading from stderr for {}", self.name);
                            }
                        }
                        Err(_) => {continue}
                        Ok(Err(e)) => bail!("Failed reading from stdout: {}", e),
                        }
                },
                c = &mut i.dead, if i.code.is_none() => {
                    info!("Process died");
                    i.code = Some(c?)
                }
                s = i.notify_socket.recv(&mut i.buf) => {
                    let msg = &i.buf[..s?];
                    let msg = match std::str::from_utf8(msg) {
                        Ok(v) => v.trim(),
                        Err(_) => {
                            info!("Got none utf-8 notify message '{:?}'", msg);
                            continue;
                        }
                    };
                    info!("Got notify message '{}'", msg);
                    if msg == "READY=1" {
                        status.lock().unwrap().state = ServiceState::Ready;
                        if stop_ready {
                            return Ok(ProcessServiceInstanceRes::Ready)
                        }
                    } else if msg == "RELOADING=1" {
                        status.lock().unwrap().state = ServiceState::Reloading;
                    } else if msg == "STOPPING=1" {
                        status.lock().unwrap().state = ServiceState::Stopping;
                    } else if msg == "WATCHDOG=1" {
                        i.watchdog_timout = match timeout_duration {
                            Some(v) => std::time::Instant::now() + std::time::Duration::from(v),
                            None => std::time::Instant::now()
                        };
                    } else if let Some(sts) = msg.strip_prefix("STATUS=") {
                        status.lock().unwrap().status = sts.to_string();
                    } else {
                        info!("Unhandled notify command from {}: '{}'", i.instance_id, msg);
                    }
                }
            }
        }
        Ok(ProcessServiceInstanceRes::Finished)
    }

    async fn start_instance(
        self: &Arc<Self>,
        desc: ServiceDescription,
        extra_env: HashMap<String, String>,
        image: Option<String>,
        log: &mut RemoteLogTarget<'_>,
    ) -> Result<(ServiceInstance, ServiceStatus)> {
        let instance_id: u64 = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis()
            .try_into()?;
        let mut bind_keys = Vec::new();
        let e = match self
            .start_instance_inner(desc, &extra_env, image, log, instance_id, &mut bind_keys)
            .await
        {
            Ok(v) => return Ok(v),
            Err(e) => e,
        };
        // In case of an error we kill all procsess and fds created
        if let Ok(keys) = self
            .client
            .persist_list_processes(Some(format!("service.{}.{}.", self.name, instance_id)))
            .await
        {
            for key in keys {
                let _ = self.client.persist_signal_process(key, 9).await;
            }
        }
        for key in bind_keys {
            let _ = self.client.persist_close_fd(&key).await;
        }
        if let Ok(keys) = self
            .client
            .persist_list_fds(Some(format!("service.{}.{}.", self.name, instance_id)))
            .await
        {
            for key in keys {
                let _ = self.client.persist_close_fd(&key).await;
            }
        }
        let _ = std::fs::remove_dir_all(format!(
            "/run/simpleadmin/services/{}/{}",
            self.name, instance_id
        ));
        Err(e)
    }

    async fn start_instance_inner(
        self: &Arc<Self>,
        desc: ServiceDescription,
        extra_env: &HashMap<String, String>,
        image: Option<String>,
        log: &mut RemoteLogTarget<'_>,
        instance_id: u64,
        bind_keys: &mut Vec<String>,
    ) -> Result<(ServiceInstance, ServiceStatus)> {
        info!("Start instance {}", &desc.name);

        // Find user
        let user = match &desc.user {
            Some(user) => Some(
                nix::unistd::User::from_name(user)?
                    .with_context(|| format!("Unknown user {}", user))?,
            ),
            None => None,
        };

        CgroupBuilder::new("sadmin").build(Box::new(cgroups_rs::hierarchies::V2::new()));
        let cgroup_name = format!("sadmin/{}", desc.name);
        if let Some(v) = desc.max_memory {
            CgroupBuilder::new(&cgroup_name)
                .memory()
                .memory_hard_limit(u64::from(v).try_into()?)
                .done()
                .build(Box::new(cgroups_rs::hierarchies::V2::new()));
        } else {
            CgroupBuilder::new(&cgroup_name)
                .memory()
                .done()
                .build(Box::new(cgroups_rs::hierarchies::V2::new()));
        }

        // Run run prestart
        for (idx, src) in desc.pre_start.iter().enumerate() {
            run_script(format!("prestart {}", idx), src, log).await?;
        }

        let stdout_write_key = format!("service.{}.{}.stdout_write", desc.name, instance_id);
        let stdout_read_key = format!("service.{}.{}.stdout_read", desc.name, instance_id);
        let stderr_write_key = format!("service.{}.{}.stderr_write", desc.name, instance_id);
        let stderr_read_key = format!("service.{}.{}.stderr_read", desc.name, instance_id);
        let notify_key = format!("service.{}.{}.notify", desc.name, instance_id);
        let process_key = format!("service.{}.{}", desc.name, instance_id);
        let (stdout_read, stdout_write) = create_pipe()?;
        let (stderr_read, stderr_write) = create_pipe()?;
        nix::sys::stat::umask(nix::sys::stat::Mode::from_bits_truncate(0o022));
        std::fs::create_dir_all(format!(
            "/run/simpleadmin/services/{}/{}",
            desc.name, instance_id
        ))?;

        let notify_path = format!(
            "/run/simpleadmin/services/{}/{}/notify.socket",
            desc.name, instance_id
        );
        nix::sys::stat::umask(nix::sys::stat::Mode::from_bits_truncate(0o077));
        let notify_socket = UnixDatagram::bind(&notify_path)?;
        if let Some(user) = &user {
            nix::unistd::chown(notify_path.as_str(), Some(user.uid), Some(user.gid))?;
        }
        self.client
            .persist_put_fd(notify_key.to_string(), notify_socket.my_as_fd())
            .await?;
        self.client
            .persist_put_fd(stdout_write_key.clone(), stdout_write.as_fd())
            .await?;
        self.client
            .persist_put_fd(stdout_read_key.clone(), stdout_read.as_fd())
            .await?;
        self.client
            .persist_put_fd(stderr_write_key.clone(), stderr_write.as_fd())
            .await?;
        self.client
            .persist_put_fd(stderr_read_key.clone(), stderr_read.as_fd())
            .await?;
        std::mem::drop(stdout_write);
        std::mem::drop(stderr_write);

        let mut fds = vec![(stdout_write_key.clone(), 1), (stderr_write_key.clone(), 2)];
        for bind in desc.bind.iter() {
            let key = bind_key(bind, &self.name);
            match bind {
                Bind::Tcp { bind, fd } => {
                    if !self.client.persist_has_fd(key.clone()).await? {
                        bind_keys.push(key.clone());
                        let socket = std::net::TcpListener::bind(bind)?;
                        self.client
                            .persist_put_fd(key.clone(), socket.as_fd())
                            .await?;
                    }
                    fds.push((key, *fd as i32));
                }
                Bind::UnixStream {
                    path,
                    fd,
                    user,
                    umask,
                } => {
                    if !self.client.persist_has_fd(key.clone()).await? {
                        bind_keys.push(key.clone());
                        nix::sys::stat::umask(nix::sys::stat::Mode::from_bits_truncate(*umask));
                        let socket = std::os::unix::net::UnixListener::bind(path)?;
                        let user = nix::unistd::User::from_name(user)?
                            .with_context(|| format!("Unknown user {}", user))?;
                        nix::unistd::chown(notify_path.as_str(), Some(user.uid), Some(user.gid))?;
                        self.client
                            .persist_put_fd(key.clone(), socket.as_fd())
                            .await?;
                    }
                    fds.push((key, *fd as i32));
                }
            }
        }

        let (dead_send, dead_recv) = tokio::sync::oneshot::channel();
        self.client
            .dead_process_handlers
            .lock()
            .unwrap()
            .insert(process_key.clone(), dead_send);

        let mut env = vec![(
            "PATH".to_string(),
            "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin".to_string(),
        )];
        if let Some(user) = &user {
            env.push(("USER".to_string(), user.name.to_string()));
            env.push(("HOME".to_string(), user.dir.to_string_lossy().to_string()));
        }
        for (k, v) in extra_env.iter() {
            env.push((k.clone(), v.clone()));
        }
        for (k, v) in desc.env.iter() {
            env.push((k.clone(), v.clone()));
        }
        for (k, v) in desc.pod_env.iter() {
            env.push((k.clone(), v.clone()));
        }
        let (sp, pod_name) = if let Some(exec) = &desc.service_executable {
            env.push(("NOTIFY_SOCKET".to_string(), notify_path.clone()));

            let mut line = Vec::new();
            write!(
                &mut line,
                "{}$ ",
                user.as_ref().map(|u| u.name.as_str()).unwrap_or("root")
            )?;
            line.extend(exec.as_bytes());
            for arg in &desc.args {
                line.push(b' ');
                let arg = arg.as_bytes();
                if arg.contains(&b'"') || arg.contains(&b'\'') {
                    line.push(b'"');
                    line.extend(arg);
                    line.push(b'"');
                } else {
                    line.extend(arg);
                }
            }
            line.push(b'\n');
            log.stdout(&line).await?;

            let sp = persist_daemon::StartProcess {
                id: self.client.next_persist_idc(),
                key: process_key.clone(),
                path: exec.clone(),
                args: desc.args.clone(),
                env,
                uid: user.as_ref().map(|v| v.uid.as_raw()),
                gid: user.as_ref().map(|v| v.gid.as_raw()),
                current_dir: None,
                cgroup: Some(cgroup_name.clone()),
                umask: Some(0o022),
                fds,
            };
            (sp, None)
        } else {
            let pod_name = format!("sa_{}_{}", self.name, instance_id);
            let (notify_dir, notify_name) = notify_path
                .rsplit_once('/')
                .context("Missing / in notify path")?;
            let mut args = vec![
                "run".to_string(),
                "--rm".to_string(),
                "--log-driver=none".to_string(),
                "--name".to_string(),
                pod_name.clone(),
                "--sdnotify=ignore".to_string(),
                "--env".to_string(),
                format!("NOTIFY_SOCKET=/run/sdnotify/{}", notify_name),
                "-v".to_string(),
                format!("{}:/run/sdnotify", notify_dir),
                "--systemd=false".to_string(),
            ];

            for env in desc.pod_env.keys() {
                args.push("--env".to_string());
                args.push(env.clone());
            }
            for env in extra_env.keys() {
                args.push("--env".to_string());
                args.push(env.clone());
            }
            args.extend(desc.pod_options.iter().cloned());
            for m in &desc.pod_mount {
                let (o, v) = match m.split_once(':') {
                    Some((s, _)) => (s, m.clone()),
                    None => (m.as_str(), format!("{}:{}", m, m)),
                };
                if Path::new(o).exists() {
                    args.push("-v".to_string());
                    args.push(v);
                } else {
                    log.stdout(format!("Will not mount '{}' as it does not exist\n", o).as_bytes())
                        .await?;
                }
            }
            args.push(
                image
                    .clone()
                    .context("An image should be specified if there is not service_executable")?,
            );
            args.extend(desc.args.iter().cloned());

            let mut line = Vec::new();
            write!(
                &mut line,
                "{}$ ",
                user.as_ref().map(|u| u.name.as_str()).unwrap_or("root")
            )?;
            line.extend(b"podman");
            for arg in &args {
                line.push(b' ');
                let arg = arg.as_bytes();
                if arg.contains(&b'"') || arg.contains(&b'\'') {
                    line.push(b'"');
                    line.extend(arg);
                    line.push(b'"');
                } else {
                    line.extend(arg);
                }
            }
            line.push(b'\n');
            log.stdout(&line).await?;

            let sp = persist_daemon::StartProcess {
                id: self.client.next_persist_idc(),
                key: process_key.clone(),
                path: "/usr/bin/podman".to_string(),
                args,
                env,
                uid: user.as_ref().map(|v| v.uid.as_raw()),
                gid: user.as_ref().map(|v| v.gid.as_raw()),
                current_dir: None,
                cgroup: Some(cgroup_name.clone()),
                umask: Some(0o022),
                fds,
            };
            (sp, Some(pod_name))
        };

        self.client
            .send_persist_request_success(persist_daemon::Message::StartProcess(sp), None)
            .await
            .context("Failed to start process")?;
        info!("Process started");

        self.client.persist_close_fd(&stdout_write_key).await?;
        self.client.persist_close_fd(&stderr_write_key).await?;
        let stdout =
            tokio::io::unix::AsyncFd::with_interest(stdout_read, tokio::io::Interest::READABLE)?;
        let stderr =
            tokio::io::unix::AsyncFd::with_interest(stderr_read, tokio::io::Interest::READABLE)?;

        let mut status = std::sync::Mutex::new(ServiceStatus {
            status: "".to_string(),
            state: ServiceState::Starting,
            description: desc.clone(),
            extra_env: extra_env.clone(),
            instance_id,
            enabled: true,
            stdout_key: Some(stdout_read_key),
            stderr_key: Some(stderr_read_key),
            notify_key: Some(notify_key),
            process_key: Some(process_key.clone()),
            start_stop_time: SystemTime::now(),
            deploy_time: SystemTime::now(),
            deploy_user: "root".to_string(),
            image,
            pod_name: pod_name.clone(),
        });

        let watchdog_timout = match desc.watchdog_timeout {
            Some(v) => std::time::Instant::now() + std::time::Duration::from(v),
            None => std::time::Instant::now(),
        };
        let mut buf = Vec::new();
        buf.resize(SERVICES_BUF_SIZE, 0);
        let mut instance = ServiceInstance {
            stdout,
            stderr,
            dead: dead_recv,
            notify_socket,
            instance_id,
            pod_name: pod_name.clone(),
            watchdog_timout,
            go_stdout: true,
            go_stderr: true,
            buf,
            code: None,
        };
        info!("Waiting for service to be ready");
        if desc.service_type == ServiceType::Notify {
            let rt = RunToken::new();
            match self
                .process_service_instance(
                    &rt,
                    &mut instance,
                    &self.status,
                    log,
                    true,
                    false,
                    desc.start_timeout
                        .map(|v| Instant::now() + Duration::from(v)),
                )
                .await?
            {
                ProcessServiceInstanceRes::Canceled
                | ProcessServiceInstanceRes::WatchdogTimeout => {
                    bail!("Logic error in start service")
                }
                ProcessServiceInstanceRes::Ready => (),
                ProcessServiceInstanceRes::Finished => {
                    bail!("Service exited before being ready ")
                }
                ProcessServiceInstanceRes::Timeout => {
                    log.stdout("Did not start fast enough. Sending sigkill\n".as_bytes())
                        .await?;
                    self.client.persist_signal_process(process_key, 9).await?;
                    bail!("Timeout wating for {} to start, sending sigkill", self.name)
                }
            }
            info!("Service ready");
            status.get_mut().unwrap().state = ServiceState::Ready;
        } else {
            status.get_mut().unwrap().state = ServiceState::Running;
        }
        Ok((instance, status.into_inner().unwrap()))
    }

    pub async fn cleanup_instance(self: &Arc<Self>, instance_id: u64) -> Result<()> {
        if let Ok(keys) = self
            .client
            .persist_list_processes(Some(format!("service.{}.{}.", self.name, instance_id)))
            .await
        {
            for key in keys {
                let _ = self.client.persist_signal_process(key, 9).await;
            }
        }

        if let Ok(keys) = self
            .client
            .persist_list_fds(Some(format!("service.{}.{}.", self.name, instance_id)))
            .await
        {
            for key in keys {
                let _ = self.client.persist_close_fd(&key).await;
            }
        }
        let _ = std::fs::remove_dir_all(format!(
            "/run/simpleadmin/services/{}/{}",
            self.name, instance_id
        ));
        Ok(())
    }

    pub async fn cleanup(self: &Arc<Self>) -> Result<()> {
        // Cleanup all fds and processes just in case
        for key in self
            .client
            .persist_list_fds(Some(format!("service.{}.", self.name)))
            .await?
        {
            let _ = self.client.persist_close_fd(&key).await;
        }
        for key in self
            .client
            .persist_list_processes(Some(format!("service.{}.", self.name)))
            .await?
        {
            let _ = self.client.persist_signal_process(key, 9).await;
        }
        let _ = std::fs::remove_dir_all(format!("/run/simpleadmin/services/{}", self.name));
        Ok(())
    }

    pub async fn stop_inner(self: &Arc<Self>, log: &mut RemoteLogTarget<'_>) -> Result<()> {
        if let Some(mut stop) =
            Stop::new(self.clone(), &self.run_task, &self.status, false, log).await?
        {
            let rt = RunToken::new();
            stop.run(&rt, &self.status, None, log).await?;
        }
        Ok(())
    }

    pub async fn stop(self: &Arc<Self>, log: &mut RemoteLogTarget<'_>) -> Result<()> {
        if self.run_task.lock().unwrap().is_none() {
            bail!("Service is not running")
        }
        self.stop_inner(log).await?;
        {
            let mut status = self.status.lock().unwrap();
            status.enabled = false;
            status.start_stop_time = SystemTime::now();
        }
        self.cleanup().await?;
        self.persist_status()?;
        Ok(())
    }

    pub async fn start(self: &Arc<Self>, log: &mut RemoteLogTarget<'_>) -> Result<()> {
        if self.run_task.lock().unwrap().is_some() {
            bail!("Service is already running")
        }
        let (desc, extra_env, image, deploy_user, deploy_time) = {
            let s = self.status.lock().unwrap();
            (
                s.description.clone(),
                s.extra_env.clone(),
                s.image.clone(),
                s.deploy_user.clone(),
                s.deploy_time,
            )
        };

        let (instance, mut status) = self.start_instance(desc, extra_env, image, log).await?;
        status.enabled = true;
        status.deploy_user = deploy_user;
        status.deploy_time = deploy_time;
        *self.status.lock().unwrap() = status;
        self.create_run_service_task(Some(instance));
        self.persist_status()?;
        Ok(())
    }

    pub async fn restart(self: &Arc<Self>, log: &mut RemoteLogTarget<'_>) -> Result<()> {
        self.stop_inner(log).await?;
        self.start(log).await?;
        Ok(())
    }

    pub async fn remove(self: &Arc<Self>, log: &mut RemoteLogTarget<'_>) -> Result<()> {
        self.stop_inner(log).await?;
        self.cleanup().await?;
        self.client
            .db
            .lock()
            .unwrap()
            .execute("DELETE FROM `services` WHERE `name`=?", [&self.name])?;
        Ok(())
    }

    pub async fn status(self: &Arc<Self>, log: &mut RemoteLogTarget<'_>, full: bool) -> Result<()> {
        use std::fmt::Write;
        let msg = if full {
            let status = self.status.lock().unwrap();
            let mut msg = format!(
                "name: {}\nstate: {:?}\nstatus: {}\ndeployed by: {}\ndeployed at: {}\ninstance_id: {}\n",
                self.name,
                status.state,
                status.status,
                status.deploy_user,
                chrono::DateTime::<chrono::Utc>::from(status.deploy_time).format("%Y-%m-%d %H:%M:%S"),
                status.instance_id
            );
            if let Some(image) = &status.image {
                writeln!(msg, "image: {}", image)?;
            }
            if let Some(pod) = &status.pod_name {
                writeln!(msg, "pod_name: {}", pod)?;
            }
            writeln!(
                msg,
                "start_stop_time: {}",
                chrono::DateTime::<chrono::Utc>::from(status.start_stop_time)
                    .format("%Y-%m-%d %H:%M:%S")
            )?;
            msg
        } else {
            let status = self.status.lock().unwrap();
            format!("{}: {:?}\n", self.name, status.state)
        };

        log.stdout(msg.as_bytes()).await?;
        Ok(())
    }

    pub async fn status_json(self: &Arc<Self>) -> Result<StatusJsonV1> {
        let status = self.status.lock().unwrap();
        Ok(StatusJsonV1 {
            name: self.name.clone(),
            state: status.state,
            status: status.status.clone(),
            deploy_user: status.deploy_user.clone(),
            deploy_time: status.deploy_time,
            instance_id: status.instance_id,
            pod_name: status.pod_name.clone(),
            image: status.image.clone(),
            start_stop_time: status.start_stop_time,
        })
    }
}

impl client_daemon::Client {
    pub async fn load_services(self: Arc<Self>, _run_token: RunToken) -> Result<()> {
        info!("Loading services from db");
        let services: Result<Vec<(String, String)>, _> = self
            .db
            .lock()
            .unwrap()
            .prepare("SELECT `name`, `state` FROM `services`")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect();

        let mut service_info = Vec::new();

        for (name, state) in services? {
            let status: ServiceStatus = serde_json::from_str(&state)
                .with_context(|| format!("Unable to load state for {}", name))?;
            info!("Restore service {}, {:?}", name, &status.process_key,);
            let dead = if let Some(process_key) = &status.process_key {
                let (dead_send, dead_recv) = tokio::sync::oneshot::channel();
                self.dead_process_handlers
                    .lock()
                    .unwrap()
                    .insert(process_key.clone(), dead_send);
                Some(dead_recv)
            } else {
                None
            };
            service_info.push((name, status, dead));
        }
        info!("Listing persist processes");
        let process_keys = self
            .persist_list_processes(Some("service.".to_string()))
            .await?;
        info!("Process keys {:?}", &process_keys);
        for (name, status, dead) in service_info {
            let running = status
                .process_key
                .as_ref()
                .map(|k| process_keys.contains(k))
                .unwrap_or_default();
            let service = Arc::new(Service::new(self.clone(), name.clone()));
            self.services
                .lock()
                .unwrap()
                .insert(name.clone(), service.clone());
            service
                .load_from_status(status, dead, running)
                .await
                .with_context(|| format!("Unable to load service state {}", name))?;
        }
        Ok(())
    }
}
