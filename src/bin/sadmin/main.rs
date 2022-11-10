use anyhow::{bail, Result};
use clap::Parser;
use client_daemon::ClientDaemon;
use connection::{Config, Connection};
use docker_deploy::DockerDeploy;
use list_deployments::ListDeployments;
use list_images::ListImages;
use message::{LogOut, Message};
use persist_daemon::PersistDaemon;
use std::path::PathBuf;
use upgrade::Upgrade;
mod client_daemon;
mod connection;
mod docker_deploy;
mod dyn_format;
mod finite_float;
mod list_deployments;
mod list_images;
mod message;
mod persist_daemon;
mod tokio_passfd;
mod upgrade;

#[derive(clap::Parser)]
struct Args {
    #[clap(subcommand)]
    action: Action,

    #[clap(long)]
    config: Option<PathBuf>,
    #[clap(long)]
    server_host: Option<String>,
    #[clap(long)]
    server_port: Option<u16>,
    #[clap(long)]
    server_cert: Option<String>,
    #[clap(long)]
    server_insecure: bool,
}

#[derive(clap::Parser)]
struct Deauth {
    /// Forget two factor authentication
    #[clap(long)]
    full: bool,
}

#[derive(clap::Subcommand)]
enum Action {
    /// Authenticate your user
    Auth,
    /// Deauthenticate your user
    Deauth(Deauth),
    /// List images
    #[clap(alias("listImages"))]
    ListImages(ListImages),
    /// List deployments
    #[clap(alias("listDeployments"))]
    ListDeployments(ListDeployments),
    /// Deploy image on server
    #[clap(alias("dockerDeploy"))]
    DockerDeploy(DockerDeploy),
    ClientDaemon(ClientDaemon),
    Upgrade(Upgrade),
    PersistDaemon(PersistDaemon),
}

async fn auth(config: Config) -> Result<()> {
    let mut con = Connection::open(config, false).await?;
    if con.authenticated() {
        con.get_key().await?;
        println!("Already authenticated as {}.", &con.user.unwrap())
    } else {
        con.prompt_auth().await?;
        con.get_key().await?;
        println!("Successfully authenticated.");
    }
    Ok(())
}

async fn deauth(config: Config, args: Deauth) -> Result<()> {
    let mut c = Connection::open(config, false).await?;
    if c.authenticated() {
        c.send(&Message::LogOut(LogOut {
            forget_pwd: true,
            forget_otp: args.full,
        }))
        .await?;
    }
    if args.full {
        match std::fs::remove_file(c.cookie_file) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => bail!("Unable to delete cookiefile: {}", e),
        };
    }
    Ok(())
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let mut args = Args::parse();

    let config_path = match &args.config {
        Some(v) => v.as_path(),
        None => std::path::Path::new("/etc/simpleadmin_client.json"),
    };
    let config_data = match std::fs::read(config_path) {
        Ok(v) => v,
        Err(e) => bail!("Unable to read configfile {:?}: {}", config_path, e),
    };
    let mut config: Config = match serde_json::from_slice(&config_data) {
        Ok(v) => v,
        Err(e) => bail!("Invalid configfile {:?}: {}", config_path, e),
    };
    if let Some(v) = args.server_cert.take() {
        config.server_cert = Some(v);
    }
    if let Some(v) = args.server_host.take() {
        config.server_host = Some(v);
    }
    if let Some(v) = &args.server_port {
        config.server_port = *v
    }
    if args.server_insecure {
        config.server_insecure = Some(true);
    }

    match args.action {
        Action::Auth => auth(config).await,
        Action::ListImages(args) => list_images::list_images(config, args).await,
        Action::Deauth(args) => deauth(config, args).await,
        Action::ListDeployments(args) => list_deployments::list_deployments(config, args).await,
        Action::DockerDeploy(args) => docker_deploy::deploy(config, args).await,
        Action::ClientDaemon(args) => client_daemon::client_daemon(config, args).await,
        Action::Upgrade(args) => upgrade::upgrade(args).await,
        Action::PersistDaemon(args) => persist_daemon::persist_daemon(args).await,
    }
}
