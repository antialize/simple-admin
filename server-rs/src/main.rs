use std::{
    str::FromStr,
    sync::{atomic::AtomicI64, Arc},
    time::Duration,
};

use anyhow::Context;
use config::read_config;
use docker::docker_prune;
use hostclient::run_host_server;
use log::LevelFilter;
use modified_files::modified_files_scan;
use simple_logger::SimpleLogger;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::ConnectOptions;
use state::State;
use tokio_tasks::{run_tasks, shutdown, TaskBuilder};

mod action_types;
mod arena;
mod client_message;
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
mod page_types;
mod service_description;
mod setup;
mod state;
mod terminal;
mod type_types;
mod variabels;
mod web_util;
mod webclient;

use anyhow::Result;
use webclient::run_web_clients;

#[tokio::main(flavor = "multi_thread", worker_threads = 10)]
async fn main() -> Result<()> {
    SimpleLogger::new()
        .with_level(LevelFilter::Info)
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

    tokio::spawn(async {
        tokio::signal::ctrl_c().await.unwrap();
        shutdown("ctrl+c".to_string());
    });

    run_tasks().await;
    Ok(())
}
