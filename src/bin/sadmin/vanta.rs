use std::{
    fs,
    io::Write,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use sadmin2::action_types::{
    IClientAction, IServerAction, IVantaListMachines, IVantaRegisterMachine, IVantaRemoveMachine,
};

use crate::connection::{Config, Connection};

const ETC_CONF: &str = "/etc/simpleadmin/vanta.conf";
const VAR_STATE: &str = "/var/lib/simpleadmin/vanta-last-scan.json";
const TIMER_UNIT: &str = "/etc/systemd/system/simpleadmin-vanta.timer";
const SERVICE_UNIT: &str = "/etc/systemd/system/simpleadmin-vanta.service";

// ── vanta-scan ────────────────────────────────────────────────────────────────

pub async fn scan() -> Result<()> {
    let report = crate::report::collect().context("Collecting compliance report")?;
    let json = serde_json::to_string_pretty(&report)?;
    println!("{json}");
    Ok(())
}

// ── vanta-setup ───────────────────────────────────────────────────────────────

pub async fn setup(config: Config) -> Result<()> {
    let hostname = crate::system_info::hostname().context("Failed to get hostname")?;

    let mut con = Connection::open(config, true).await?;
    if !con.authenticated() {
        con.prompt_auth().await?;
    }

    // Check if already registered
    if Path::new(ETC_CONF).exists() {
        // The conf file is root-owned (chmod 600); if we can't read it the
        // machine was registered by a previous setup run.
        let conf_result = read_conf(ETC_CONF);
        match conf_result {
            Err(_) => {
                bail!(
                    "{ETC_CONF} exists but is not readable (written by a previous setup run). \
                     To re-register, run: sudo rm {ETC_CONF}"
                );
            }
            Ok(conf) => {
                con.send(&IClientAction::VantaListMachines(IVantaListMachines {}))
                    .await?;
                loop {
                    match con.recv().await? {
                        IServerAction::VantaListMachinesRes(res) => {
                            let still_registered =
                                res.machines.iter().any(|m| m.host_uuid == conf.host_uuid);
                            if still_registered {
                                bail!(
                                    "Machine is already registered (host_uuid: {}). \
                                     Use `sadmin vanta-remove {}` first.",
                                    conf.host_uuid,
                                    conf.host_uuid
                                );
                            }
                            eprintln!(
                                "Existing config found but machine is no longer registered. Re-registering."
                            );
                            break;
                        }
                        _ => continue,
                    }
                }
            }
        }
    }

    con.send(&IClientAction::VantaRegisterMachine(
        IVantaRegisterMachine {
            hostname: hostname.clone(),
        },
    ))
    .await?;

    let (host_uuid, secret) = loop {
        match con.recv().await? {
            IServerAction::VantaRegisterMachineRes(res) => {
                break (res.host_uuid, res.secret);
            }
            _ => continue,
        }
    };

    println!("Registered as {host_uuid}");

    // Invoke the privileged install step via sudo
    let exe = std::env::current_exe().context("Failed to get current executable")?;
    let mut sudo_cmd = std::process::Command::new("sudo");
    sudo_cmd
        .arg(&exe)
        .arg("vanta-install-service")
        .arg("--host-uuid")
        .arg(&host_uuid)
        .arg("--secret")
        .arg(&secret)
        .arg("--server-host")
        .arg(con.server_host.as_str())
        .arg("--server-port")
        .arg(con.server_port.to_string());
    if con.server_insecure {
        sudo_cmd.arg("--server-insecure");
    }
    let status = sudo_cmd
        .status()
        .context("Failed to run sudo sadmin vanta-install-service")?;

    if !status.success() {
        bail!("vanta-install-service failed with status {status}");
    }

    println!("Vanta compliance daemon installed and started.");
    Ok(())
}

// ── vanta-install-service (hidden, run as root via sudo) ─────────────────────

#[derive(clap::Parser)]
pub struct InstallServiceArgs {
    #[clap(long)]
    pub host_uuid: String,
    #[clap(long)]
    pub secret: String,
    #[clap(long)]
    pub server_host: String,
    #[clap(long)]
    pub server_port: u16,
    #[clap(long)]
    pub server_insecure: bool,
}

pub fn install_service(args: InstallServiceArgs) -> Result<()> {
    // Check UID via /proc/self/status
    let status = fs::read_to_string("/proc/self/status").unwrap_or_default();
    let uid: u32 = status
        .lines()
        .find(|l| l.starts_with("Uid:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(1);
    if uid != 0 {
        bail!("vanta-install-service must be run as root (via sudo)");
    }

    // Write /etc/simpleadmin/vanta.conf
    let conf_dir = Path::new("/etc/simpleadmin");
    fs::create_dir_all(conf_dir).context("Creating /etc/simpleadmin")?;
    let conf = VantaConf {
        host_uuid: args.host_uuid,
        secret: args.secret,
        server_host: args.server_host,
        server_port: args.server_port,
        server_insecure: args.server_insecure,
    };
    let conf_json = serde_json::to_string_pretty(&conf)?;
    write_file_600(ETC_CONF, conf_json.as_bytes())?;

    // Write /var/lib/simpleadmin (for state file)
    fs::create_dir_all("/var/lib/simpleadmin").context("Creating /var/lib/simpleadmin")?;

    // Write systemd timer
    let timer = r#"[Unit]
Description=SimpleAdmin Vanta compliance scan

[Timer]
OnBootSec=5min
OnUnitActiveSec=1d
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
"#;
    fs::write(TIMER_UNIT, timer).context("Writing timer unit")?;

    // Write systemd service
    let exe = std::env::current_exe()
        .context("Failed to get current executable")?
        .to_string_lossy()
        .into_owned();
    let service = format!(
        r#"[Unit]
Description=SimpleAdmin Vanta compliance scan

[Service]
Type=oneshot
ExecStart={exe} vanta-daemon
"#
    );
    fs::write(SERVICE_UNIT, service).context("Writing service unit")?;

    // Enable and start the timer
    let _ = std::process::Command::new("systemctl")
        .args(["daemon-reload"])
        .status();
    std::process::Command::new("systemctl")
        .args(["enable", "--now", "simpleadmin-vanta.timer"])
        .status()
        .context("Enabling timer")?;

    println!("Installed {TIMER_UNIT}");
    println!("Installed {SERVICE_UNIT}");

    // Trigger an initial scan immediately via systemd so it runs in the
    // right environment (root, with access to /etc/simpleadmin/vanta.conf)
    println!("Running initial scan…");
    let status = std::process::Command::new("systemctl")
        .args(["start", "simpleadmin-vanta.service"])
        .status()
        .context("Triggering initial scan via systemctl start")?;
    if !status.success() {
        eprintln!("Warning: initial scan service failed with status {status}");
    }

    Ok(())
}

// ── vanta-status ──────────────────────────────────────────────────────────────

pub async fn status(config: Config) -> Result<()> {
    let mut con = Connection::open(config, true).await?;
    if !con.authenticated() {
        con.prompt_auth().await?;
    }

    con.send(&IClientAction::VantaListMachines(IVantaListMachines {}))
        .await?;

    loop {
        match con.recv().await? {
            IServerAction::VantaListMachinesRes(res) => {
                if res.machines.is_empty() {
                    println!("No machines registered.");
                    return Ok(());
                }
                for m in &res.machines {
                    println!(
                        "host_uuid: {}\n  user:     {}\n  hostname: {}\n  last_contact: {}",
                        m.host_uuid,
                        m.username,
                        m.hostname,
                        m.last_contact
                            .map(format_unix_ts)
                            .unwrap_or_else(|| "never".to_string()),
                    );
                    if let Some(ref status) = m.last_status {
                        println!("  last_status:\n{}", serde_json::to_string_pretty(status)?);
                    }
                    println!();
                }
                return Ok(());
            }
            _ => continue,
        }
    }
}

// ── vanta-remove ──────────────────────────────────────────────────────────────

#[derive(clap::Parser)]
pub struct RemoveArgs {
    /// UUID of the machine to remove
    pub host_uuid: String,
}

pub async fn remove(config: Config, args: RemoveArgs) -> Result<()> {
    let mut con = Connection::open(config, true).await?;
    if !con.authenticated() {
        con.prompt_auth().await?;
    }

    // Use a fixed msg_id; we wait for the matching Response
    let msg_id = 1u64;
    con.send(&IClientAction::VantaRemoveMachine(IVantaRemoveMachine {
        msg_id,
        host_uuid: args.host_uuid.clone(),
    }))
    .await?;

    loop {
        match con.recv().await? {
            IServerAction::Response(r) if r.msg_id == msg_id => {
                if let Some(e) = r.error {
                    bail!("Server error: {e}");
                }
                println!("Machine {} removed.", args.host_uuid);
                return Ok(());
            }
            _ => continue,
        }
    }
}

// ── vanta-daemon ──────────────────────────────────────────────────────────────

pub async fn daemon() -> Result<()> {
    let conf: VantaConf = read_conf(ETC_CONF)
        .with_context(|| format!("Failed to read {ETC_CONF}. Run `sadmin vanta-setup` first."))?;

    // Collect current scan
    let report = crate::report::collect().context("Collecting compliance report")?;
    let report_json = serde_json::to_string(&report)?;

    // Check if we need to send an update
    let should_send = if Path::new(VAR_STATE).exists() {
        let old = fs::read_to_string(VAR_STATE).unwrap_or_default();
        let old_val: serde_json::Value = serde_json::from_str(&old).unwrap_or_default();
        let new_val: serde_json::Value = serde_json::from_str(&report_json)?;

        if old_val == new_val {
            // Status unchanged — check age
            let age = fs::metadata(VAR_STATE)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.elapsed().ok())
                .unwrap_or(std::time::Duration::MAX);
            age >= std::time::Duration::from_secs(7 * 24 * 3600)
        } else {
            true // Status changed
        }
    } else {
        true // No prior scan
    };

    if !should_send {
        return Ok(());
    }

    let protocol = if conf.server_insecure {
        "http"
    } else {
        "https"
    };
    let url = format!(
        "{}://{}:{}/vanta/scan",
        protocol, conf.server_host, conf.server_port
    );

    let bearer = format!("{}:{}", conf.host_uuid, conf.secret);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(conf.server_insecure)
        .build()?;

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {bearer}"))
        .header("Content-Type", "application/json")
        .body(report_json.clone())
        .send()
        .await
        .context("Sending scan to server")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!("Server returned {status}: {body}");
    }

    // Save state file
    fs::create_dir_all("/var/lib/simpleadmin").ok();
    fs::write(VAR_STATE, &report_json).context("Writing state file")?;

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Format a Unix timestamp (midnight UTC) as a UTC date string.
fn format_unix_ts(ts: i64) -> String {
    let out = std::process::Command::new("date")
        .arg("-u")
        .arg("-d")
        .arg(format!("@{ts}"))
        .arg("+%Y-%m-%d")
        .output();
    match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => format!("{ts}"),
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct VantaConf {
    host_uuid: String,
    secret: String,
    server_host: String,
    server_port: u16,
    #[serde(default)]
    server_insecure: bool,
}

fn read_conf(path: &str) -> Result<VantaConf> {
    let data = fs::read(path).with_context(|| format!("Reading {path}"))?;
    serde_json::from_slice(&data).with_context(|| format!("Parsing {path}"))
}

fn write_file_600(path: &str, data: &[u8]) -> Result<()> {
    // Write to a temp file then rename for atomicity
    let p = PathBuf::from(path);
    let tmp = p.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp).with_context(|| format!("Creating {path}"))?;
        f.write_all(data)
            .with_context(|| format!("Writing {path}"))?;
    }
    fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))
        .with_context(|| format!("Setting permissions on {path}"))?;
    fs::rename(&tmp, &p).with_context(|| format!("Renaming to {path}"))?;
    Ok(())
}
