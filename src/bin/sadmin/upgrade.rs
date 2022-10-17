use anyhow::{ensure, Context, Result};
use bytes::{BufMut, BytesMut};
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde::Deserialize;

#[derive(clap::Parser)]
pub struct Upgrade {
    #[clap(long)]
    version: Option<String>,

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
    let mut out = std::fs::File::create("/usr/local/bin/.sadmin~")?;
    std::io::copy(&mut pb.wrap_read(file), &mut out)?;
    pb.finish();
    std::fs::rename("/usr/local/bin/.sadmin~", "/usr/local/bin/sadmin")?;
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
