use anyhow::{bail, ensure, Context, Result};
use bytes::{BufMut, BytesMut};
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::{io::Write, os::unix::prelude::OpenOptionsExt};

use crate::connection::Config;

/// Setup sadmin after installation (root)
///
/// This will create /etc/systemd/system/simpleadmin-client.service,
/// /etc/systemd/system/simpleadmin-persist.service and reload systemd.
///
/// Must be run as root.
#[derive(clap::Parser)]
pub struct Setup {}

/// Upgrade to the latest version of sadmin (root)
///
/// This will download and install the latest version of sadmin from
/// github, and run its setup.
///
/// Must be run as root.
#[derive(clap::Parser)]
pub struct Upgrade {
    /// Install this version of sadmin instead of the latest
    #[clap(long)]
    version: Option<String>,

    /// Restart the simpleadmin-client daemon after upgrading
    #[clap(long)]
    restart_client_daemon: bool,
}

#[derive(Deserialize, Debug)]
struct Asset {
    browser_download_url: String,
    name: String,
    content_type: String,
    size: u64,
}

#[derive(Deserialize, Debug)]
struct Release {
    published_at: String,
    tag_name: String,
    assets: Vec<Asset>,
}

pub async fn upgrade(args: Upgrade) -> Result<()> {
    println!("Finding release");
    let url = match args.version {
        Some(v) => format!(
            "https://api.github.com/repos/antialize/simple-admin/releases/tag/{}",
            v
        ),
        None => "https://api.github.com/repos/antialize/simple-admin/releases/latest".to_string(),
    };

    let mut default_headers = HeaderMap::<HeaderValue>::default();
    default_headers.append(USER_AGENT, HeaderValue::from_static("simple-admin"));
    let client = reqwest::Client::builder()
        .default_headers(default_headers)
        .build()?;
    let release: Release = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    println!(
        "Updating to {} published at {}",
        release.tag_name, release.published_at
    );

    let asset = release
        .assets
        .into_iter()
        .find(|v| v.name == "sadmin-client.zip")
        .context("Unable to find release asset")?;
    ensure!(&asset.content_type == "application/zip", "Asset is not zip");

    let pb = ProgressBar::new(asset.size);
    pb.set_style(
        ProgressStyle::default_bar()
            .template(
                "Downloading [{wide_bar:.cyan/blue}] {bytes}/{total_bytes} ({bytes_per_sec})",
            )?
            .progress_chars("#>-"),
    );
    pb.set_position(0);
    let mut res = client
        .get(asset.browser_download_url)
        .send()
        .await?
        .error_for_status()?;
    let l = res.content_length().unwrap_or(asset.size);
    let mut zip = BytesMut::with_capacity(l as usize);
    pb.set_length(l);
    while let Some(chunk) = res.chunk().await? {
        zip.put(chunk);
        pb.set_position(zip.len() as u64);
    }
    pb.finish();

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip))?;
    let file = archive.by_name("sadmin")?;

    let pb = ProgressBar::new(file.size());
    pb.set_style(
        ProgressStyle::default_bar()
            .template("Extracting [{wide_bar:.cyan/blue}] {bytes}/{total_bytes} ({bytes_per_sec})")?
            .progress_chars("#>-"),
    );
    pb.set_position(0);
    let mut out = std::fs::File::options()
        .truncate(true)
        .mode(0o755)
        .create(true)
        .write(true)
        .open("/usr/local/bin/.sadmin~")?;
    std::io::copy(&mut pb.wrap_read(file), &mut out)?;
    pb.finish();
    std::mem::drop(out);

    std::fs::rename("/usr/local/bin/.sadmin~", "/usr/local/bin/sadmin")?;

    tokio::process::Command::new("/usr/local/bin/sadmin")
        .arg("setup")
        .status()
        .await?;

    if args.restart_client_daemon {
        println!("Restarting client daemon");
        tokio::process::Command::new("/usr/bin/systemctl")
            .arg("restart")
            .arg("simpleadmin-client.service")
            .status()
            .await?;
    }
    println!("Done!");
    Ok(())
}

pub async fn setup(_: Setup) -> Result<()> {
    std::fs::write(
        "/etc/systemd/system/simpleadmin-client.service",
        b"[Unit]
Description=Simple admin client
Requires=simpleadmin-persist.service

[Service]
WatchdogSec=400s
ExecStart=/usr/local/bin/sadmin client-daemon
Restart=always
Type=notify

[Install]
WantedBy=multi-user.target
",
    )?;

    std::fs::write(
        "/etc/systemd/system/simpleadmin-persist.service",
        b"[Unit]
Description=Simple admin persist

[Service]
ExecStart=/usr/local/bin/sadmin persist-daemon
Restart=always
Type=notify
LimitMEMLOCK=infinity
LimitNOFILE=infinity

[Install]
WantedBy=multi-user.target
",
    )?;

    let old_config = std::path::Path::new("/etc/simpleadmin_client.json");
    if old_config.exists() {
        let config_data = match std::fs::read(old_config) {
            Ok(v) => v,
            Err(e) => bail!("Unable to read config file {:?}: {}", old_config, e),
        };
        let mut config: Config = match serde_json::from_slice(&config_data) {
            Ok(v) => v,
            Err(e) => bail!("Invalid config file {:?}: {}", old_config, e),
        };
        if let Some(password) = config.password.take() {
            #[derive(Serialize)]
            struct AuthConfig {
                password: String,
            }
            let mut f = std::fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .mode(0o600)
                .write(true)
                .open("/etc/sadmin_client_auth.json")
                .context("Unable to create /etc/sadmin_client_auth.json")?;
            f.write_all(serde_json::to_string_pretty(&AuthConfig { password })?.as_bytes())?;
        }
        std::fs::write(
            "/etc/sadmin.json",
            serde_json::to_string_pretty(&config)?.as_bytes(),
        )
        .context("Unable to write /etc/sadmin.json")?;

        std::fs::remove_file(old_config)
            .context("Unable to remove /etc/simpleadmin_client.json")?;
    }

    tokio::process::Command::new("/bin/systemctl")
        .arg("daemon-reload")
        .status()
        .await?;

    Ok(())
}
