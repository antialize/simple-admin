use anyhow::{Context, Result, bail};
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use chrono::prelude::*;
use chrono::{DateTime, TimeZone};
use nix::libc::SIGPIPE;
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, Write, stderr, stdout},
    os::unix::process::ExitStatusExt,
    path::PathBuf,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::client_daemon::CONTROL_SOCKET_PATH;
use sadmin2::service_description::ServiceDescription;

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
    /// If set, do not allocate a pseudo-TTY for the shell. See the
    /// `--tty, -t` flag in the podman-exec(1) man page.
    #[clap(long)]
    pub no_tty: bool,

    /// Name of the service to start shell in
    pub service: String,

    #[clap(default_value = "/bin/sh")]
    pub shell: String,

    /// Command line arguments given to the shell
    #[clap(trailing_var_arg = true)]
    pub shell_args: Vec<String>,
}

/// Run command inside container
#[derive(clap::Parser, Serialize, Deserialize)]
pub struct Exec {
    /// Name of the service to start shell in
    pub service: String,

    /// Command to run
    pub command: String,

    /// Command line arguments given to the shell
    #[clap(trailing_var_arg = true)]
    pub args: Vec<String>,
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
    Exec(Exec),
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
        .with_context(|| format!("Connecting to client daemon at {CONTROL_SOCKET_PATH}"))?;
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
                status.extend_from_slice(&BASE64_STANDARD.decode(data)?);
            }
            DaemonControlMessage::Stderr { data } => {
                let mut o = stderr().lock();
                o.write_all(&BASE64_STANDARD.decode(data)?)?;
                o.flush()?;
            }
            DaemonControlMessage::Finished { code: 0 } => break,
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

    let mut cmd = std::process::Command::new("/usr/bin/sudo");
    cmd.arg("-iu")
        .arg(status.run_user)
        .arg("podman")
        .arg("exec")
        .arg("-i");
    if !args.no_tty {
        cmd.arg("-t");
    }
    let status = cmd
        .arg(pod_name)
        .arg(args.shell)
        .args(args.shell_args)
        .status()?;
    if let Some(code) = status.code() {
        std::process::exit(code);
    }
    bail!("Unable to run shell {}", status)
}

pub async fn run_exec(args: Exec) -> Result<()> {
    let msg = serde_json::to_vec(&DaemonControlMessage::Status(Status {
        service: Some(args.service),
        porcelain: Some(Porcelain::V1),
    }))?;
    let mut socket = tokio::net::UnixStream::connect(CONTROL_SOCKET_PATH)
        .await
        .with_context(|| format!("Connecting to client daemon at {CONTROL_SOCKET_PATH}"))?;
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
                status.extend_from_slice(&BASE64_STANDARD.decode(data)?);
            }
            DaemonControlMessage::Stderr { data } => {
                let mut o = stderr().lock();
                o.write_all(&BASE64_STANDARD.decode(data)?)?;
                o.flush()?;
            }
            DaemonControlMessage::Finished { code: 0 } => break,
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

    let mut cmd = std::process::Command::new("/usr/bin/sudo");
    let status = cmd
        .arg("-iu")
        .arg(status.run_user)
        .arg("podman")
        .arg("exec")
        .arg(pod_name)
        .arg(args.command)
        .args(args.args)
        .status()?;
    if let Some(code) = status.code() {
        std::process::exit(code);
    }
    bail!("Unable to run command {}", status)
}

#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
struct LogLine<'a> {
    message: Option<std::borrow::Cow<'a, str>>,
    instance: Option<&'a str>,
    __realtime_timestamp: Option<&'a str>,
}

pub async fn run_logs(args: Logs) -> Result<()> {
    let mut cmd = std::process::Command::new("/usr/bin/journalctl");
    cmd.arg(format!("UNIT={}", args.service));
    if args.follow {
        cmd.arg("--follow");
    }
    if let Some(lines) = &args.lines {
        cmd.arg(format!("--lines={lines}"));
    }
    if let Some(since) = &args.since {
        cmd.arg(format!("--since={since}"));
    }
    if let Some(until) = &args.until {
        cmd.arg(format!("--until={until}"));
    }
    cmd.arg("--output-fields=INSTANCE,MESSAGE,__REALTIME_TIMESTAMP");
    cmd.arg("--output=json");
    cmd.stdout(std::process::Stdio::piped());
    let mut child = cmd.spawn()?;
    let stdout = child.stdout.take().unwrap();
    let mut stdout = std::io::BufReader::new(stdout);
    let mut line = String::new();
    let mut instances = std::collections::HashMap::new();
    let mut print_date = None;
    let now: DateTime<Local> = Local::now();
    while stdout.read_line(&mut line)? != 0 {
        let l: LogLine = serde_json::from_str(line.trim())
            .with_context(|| format!("Parsing log line {line}"))?;
        let t: DateTime<Local> = match l.__realtime_timestamp {
            Some(v) => {
                let t: i64 = v
                    .parse()
                    .with_context(|| format!("Parsing time stamp {v}"))?;
                Utc.timestamp_nanos(t * 1000).into()
            }
            None => {
                line.clear();
                continue;
            }
        };
        let print_date = match print_date {
            Some(v) => v,
            None => {
                let v = t.year() != now.year() || t.month() != now.month() || t.day() != now.day();
                print_date = Some(v);
                v
            }
        };
        let instance = match l.instance {
            Some(v) => match instances.get(v) {
                Some(v) => *v,
                None => {
                    let id = instances.len() as u32 + 1;
                    instances.insert(v.to_string(), id);
                    id
                }
            },
            None => 0,
        };
        let message = l.message.unwrap_or_default();
        if print_date {
            println!(
                "{:02}/{:02} {:02}:{:02}:{:02}.{:03} {:2}: {}",
                t.month(),
                t.day(),
                t.hour(),
                t.minute(),
                t.second(),
                t.nanosecond() / 1_000_000,
                instance,
                message
            );
        } else {
            println!(
                "{:02}:{:02}:{:02}.{:03} {:2}: {}",
                t.hour(),
                t.minute(),
                t.second(),
                t.nanosecond() / 1_000_000,
                instance,
                message
            );
        }
        line.clear();
    }
    let status = child.wait()?;
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
        Action::Exec(exec) => return run_exec(exec).await,
    };
    let msg = serde_json::to_vec(&msg)?;
    let mut socket = tokio::net::UnixStream::connect(CONTROL_SOCKET_PATH)
        .await
        .with_context(|| format!("Connecting to client daemon at {CONTROL_SOCKET_PATH}"))?;
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
                o.write_all(&BASE64_STANDARD.decode(data)?)?;
                o.flush()?;
            }
            DaemonControlMessage::Stderr { data } => {
                let mut o = stderr().lock();
                o.write_all(&BASE64_STANDARD.decode(data)?)?;
                o.flush()?;
            }
            DaemonControlMessage::Finished { code } => {
                std::process::exit(code);
            }
            _ => {}
        }
    }
}
