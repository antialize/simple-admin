use anyhow::{bail, Context, Result};
use nix::libc::SIGPIPE;
use serde::{Deserialize, Serialize};
use std::{
    io::{stderr, stdout, Write},
    os::unix::process::ExitStatusExt,
    path::PathBuf,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::client_daemon::CONTROL_SOCKET_PATH;
use crate::service_description::ServiceDescription;

/// Start the given stopped service
///
/// Running services will be restarted on reboot
#[derive(clap::Parser, Serialize, Deserialize)]
pub struct Start {
    /// Name of the service to start
    pub service: String,
}

/// Stop the given running service
///
/// Stopped services will not be started on reboot
#[derive(clap::Parser, Serialize, Deserialize)]
pub struct Stop {
    /// Name of the service to stop
    pub service: String,
}

/// Restart the given running service
#[derive(clap::Parser, Serialize, Deserialize)]
pub struct Restart {
    /// Name of the service to restart
    pub service: String,
}

#[derive(clap::ValueEnum, Clone, Serialize, Deserialize)]
pub enum Porcelain {
    V1,
}

/// Print information about all or a specific service
#[derive(clap::Parser, Serialize, Deserialize)]
pub struct Status {
    /// Name of the service to get status of
    pub service: Option<String>,

    /// Give the output in an easy-to-parse format for scripts
    #[clap(value_enum, long)]
    pub porcelain: Option<Porcelain>,
}

/// Remove service
///
/// Stop and remove a given service, it will
/// have to be redeployed to be recreated
#[derive(clap::Parser, Serialize, Deserialize)]
pub struct Remove {
    /// Name of the service to remove
    pub service: String,
}

/// Deploy a new service locally
///
/// Normally a service is deployed though `sadmin service-deploy` but
/// if no information needs to be templated into the description.
/// It can also be deployed locally through this command
#[derive(clap::Parser)]
pub struct Deploy {
    /// Path to the service description yaml file
    description: PathBuf,
    /// Docker image to use for deployment
    image: Option<String>,
}

/// Spawn as shell in the service container
#[derive(clap::Parser, Serialize, Deserialize)]
pub struct Shell {
    /// Name of the service to start shell in
    pub service: String,

    #[clap(default_value = "/bin/sh")]
    pub shell: String,
}

/// View logs for the given service
#[derive(clap::Parser, Serialize, Deserialize)]
pub struct Logs {
    /// Name of the service to start shell in
    pub service: String,

    /// Follow the journal
    #[clap(long, short = 'f')]
    pub follow: bool,

    /// Number of journal entries to show
    #[clap(long, short = 'n')]
    pub lines: Option<usize>,

    /// Show entries not older than the specified date
    #[clap(long, short = 'S')]
    pub since: Option<String>,

    /// Show entries not newer than the specified date
    #[clap(long, short = 'U')]
    pub until: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct DeployMsg {
    pub image: Option<String>,
    pub config: Box<ServiceDescription>,
}

#[derive(clap::Subcommand)]
pub enum Action {
    Start(Start),
    Stop(Stop),
    Restart(Restart),
    Status(Status),
    Remove(Remove),
    Deploy(Deploy),
    Shell(Shell),
    Logs(Logs),
    /// Stop all services without storing the stopped state, in preparation for machine shutdown
    Shutdown,
}

/// Query or manipulate services running on this host (root)
#[derive(clap::Parser)]
pub struct Service {
    #[clap(subcommand)]
    action: Action,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DaemonControlMessage {
    Start(Start),
    Stop(Stop),
    Restart(Restart),
    Status(Status),
    Remove(Remove),
    Deploy(DeployMsg),
    Stdout { data: String }, // Base 64 encoded bytes
    Stderr { data: String }, // Base 64 encoded bytes
    Finished { code: i32 },
    Shutdown,
}

pub async fn run_shell(args: Shell) -> Result<()> {
    let msg = serde_json::to_vec(&DaemonControlMessage::Status(Status {
        service: Some(args.service),
        porcelain: Some(Porcelain::V1),
    }))?;
    let mut socket = tokio::net::UnixStream::connect(CONTROL_SOCKET_PATH)
        .await
        .with_context(|| format!("Connecting to client daemon at {}", CONTROL_SOCKET_PATH))?;
    socket.write_u32(msg.len().try_into()?).await?;
    socket.write_all(&msg).await?;
    let mut buf = Vec::new();

    let mut status = Vec::new();
    loop {
        let len = socket.read_u32().await?;
        buf.resize(len.try_into()?, 0);
        socket.read_exact(&mut buf).await?;
        let msg: DaemonControlMessage = serde_json::from_slice(&buf)?;
        match msg {
            DaemonControlMessage::Stdout { data } => {
                status.extend_from_slice(&base64::decode(data)?);
            }
            DaemonControlMessage::Stderr { data } => {
                let mut o = stderr().lock();
                o.write_all(&base64::decode(data)?)?;
                o.flush()?;
            }
            DaemonControlMessage::Finished { code } if code == 0 => break,
            DaemonControlMessage::Finished { code } => {
                std::process::exit(code);
            }
            _ => {}
        }
    }

    let status: crate::client_daemon_service::StatusJsonV1 = serde_json::from_slice(&status)
        .with_context(|| format!("Invalid status json: {}", String::from_utf8_lossy(&status)))?;
    let pod_name = status
        .pod_name
        .context("Service not running in container")?;

    let status = std::process::Command::new("/usr/bin/sudo")
        .arg("-iu")
        .arg(status.run_user)
        .arg("podman")
        .arg("exec")
        .arg("-it")
        .arg(pod_name)
        .arg(args.shell)
        .status()?;
    if let Some(code) = status.code() {
        std::process::exit(code);
    }
    bail!("Unable to run shell {}", status)
}

pub async fn run_logs(args: Logs) -> Result<()> {
    let mut cmd = std::process::Command::new("/usr/bin/journalctl");
    cmd.arg(format!("UNIT={}", args.service));
    if args.follow {
        cmd.arg("--follow");
    }
    if let Some(lines) = &args.lines {
        cmd.arg(format!("--lines={}", lines));
    }
    if let Some(since) = &args.since {
        cmd.arg(format!("--since={}", since));
    }
    if let Some(until) = &args.until {
        cmd.arg(format!("--until={}", until));
    }

    let status = cmd.status()?;
    if let Some(code) = status.code() {
        std::process::exit(code);
    }
    if status.signal() == Some(SIGPIPE) {
        return Ok(());
    }
    bail!("Unable to run shell {}", status)
}

#[allow(clippy::read_zero_byte_vec)]
pub async fn run(args: Service) -> Result<()> {
    let msg = match args.action {
        Action::Start(v) => DaemonControlMessage::Start(v),
        Action::Stop(v) => DaemonControlMessage::Stop(v),
        Action::Restart(v) => DaemonControlMessage::Restart(v),
        Action::Status(v) => DaemonControlMessage::Status(v),
        Action::Remove(v) => DaemonControlMessage::Remove(v),
        Action::Shutdown => DaemonControlMessage::Shutdown,
        Action::Deploy(v) => {
            let config =
                std::fs::read_to_string(v.description).context("Unable to read config file")?;
            let config: ServiceDescription =
                serde_yaml::from_str(&config).context("Unable to parse config file")?;
            DaemonControlMessage::Deploy(DeployMsg {
                image: v.image,
                config: Box::new(config),
            })
        }
        Action::Shell(s) => return run_shell(s).await,
        Action::Logs(logs) => return run_logs(logs).await,
    };
    let msg = serde_json::to_vec(&msg)?;
    let mut socket = tokio::net::UnixStream::connect(CONTROL_SOCKET_PATH)
        .await
        .with_context(|| format!("Connecting to client daemon at {}", CONTROL_SOCKET_PATH))?;
    socket.write_u32(msg.len().try_into()?).await?;
    socket.write_all(&msg).await?;
    let mut buf = Vec::new();
    loop {
        let len = socket.read_u32().await?;
        buf.resize(len.try_into()?, 0);
        socket.read_exact(&mut buf).await?;
        let msg: DaemonControlMessage = serde_json::from_slice(&buf)?;
        match msg {
            DaemonControlMessage::Stdout { data } => {
                let mut o = stdout().lock();
                o.write_all(&base64::decode(data)?)?;
                o.flush()?;
            }
            DaemonControlMessage::Stderr { data } => {
                let mut o = stderr().lock();
                o.write_all(&base64::decode(data)?)?;
                o.flush()?;
            }
            DaemonControlMessage::Finished { code } => {
                std::process::exit(code);
            }
            _ => {}
        }
    }
}
