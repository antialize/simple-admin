use std::{
    str::FromStr,
    sync::{Arc, atomic::AtomicI64},
    time::Duration,
};

use anyhow::Context;
use config::read_config;
use docker::docker_prune;
use hostclient::run_host_server;
use log::LevelFilter;
use modified_files::modified_files_scan;
use simple_logger::SimpleLogger;
use sqlx::ConnectOptions;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use state::State;
use tokio_tasks::{TaskBuilder, run_tasks, shutdown};

use sadmin2::action_types;
mod arena;
mod cmpref;
mod config;
mod crt;
mod crypt;
mod db;
mod deployment;
mod docker;
mod docker_web;
mod get_auth;
mod hostclient;
mod modified_files;
mod msg;
mod mustache;
mod ocell;
mod ordered_json;
mod setup;
mod state;
mod terminal;
mod variabels;
mod web_util;
mod webclient;

use anyhow::Result;
use clap::Parser;
use webclient::run_web_clients;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(long, default_value_t = LevelFilter::Info)]
    log_level: LevelFilter,
    #[arg(long)]
    read_only: bool,
}

async fn handle_usr2(state: Arc<State>) -> Result<()> {
    let mut usr2 = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::user_defined2())?;
    while usr2.recv().await.is_some() {
        state.debug();
    }
    Ok(())
}

#[tokio::main(flavor = "multi_thread", worker_threads = 10)]
async fn main() -> Result<()> {
    let args = Args::parse();

    tokio_rustls::rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .unwrap();

    SimpleLogger::new()
        .with_level(args.log_level)
        .init()
        .unwrap();

    let config = read_config()?;

    let opt = SqliteConnectOptions::from_str("sqlite://sysadmin.db")?
        .journal_mode(SqliteJournalMode::Wal)
        .log_statements(LevelFilter::Trace)
        .log_slow_statements(LevelFilter::Info, Duration::from_secs(10));

    let db = sqlx::SqlitePool::connect_with(opt)
        .await
        .context("Unable to connect to sysadmin.db")?;

    let next_object_id = db::setup(&db).await?;

    let docker = docker::Docker::new(&db).await?;

    let state = Arc::new(State {
        db,
        config,
        next_object_id: AtomicI64::new(next_object_id),
        modified_files: Default::default(),
        deployment: Default::default(),
        docker,
        host_clients: Default::default(),
        web_clients: Default::default(),
        docker_uploads: Default::default(),
        read_only: args.read_only,
    });

    docker_web::init_upload().await?;

    TaskBuilder::new("modified_files_scan")
        .main()
        .shutdown_order(1)
        .create(|rt| modified_files_scan(state.clone(), rt));

    TaskBuilder::new("docker_prune")
        .main()
        .shutdown_order(1)
        .create(|rt| docker_prune(state.clone(), rt));

    TaskBuilder::new("run_host_server")
        .main()
        .shutdown_order(1)
        .create(|rt| run_host_server(state.clone(), rt));

    TaskBuilder::new("run_web_clients")
        .main()
        .shutdown_order(1)
        .create(|rt| run_web_clients(state.clone(), rt));

    TaskBuilder::new("user2")
        .main()
        .abort()
        .shutdown_order(99)
        .create(|_| handle_usr2(state.clone()));

    tokio::spawn(async {
        tokio::signal::ctrl_c().await.unwrap();
        shutdown("ctrl+c".to_string());
    });

    run_tasks().await;
    Ok(())
}
