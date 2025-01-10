use crate::cmpref::CmpRef;
use crate::config::{read_config, Config};
use crate::deployment::Deployment;
use crate::docker::{docker_prune, Docker};
use crate::docker_web;
use crate::hostclient::{run_host_server, HostClient};
use crate::modified_files::{modified_files_scan, ModifiedFiles};
use crate::webclient::{run_web_clients, WebClient};
use anyhow::{Context, Result};
use log::LevelFilter;
use neon::event::Channel;
use neon::handle::Root;
use neon::types::{Finalize, JsObject};
use simple_logger::SimpleLogger;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::ConnectOptions;
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::atomic::AtomicI64;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use uuid::Uuid;

pub struct State {
    pub db: SqlitePool,
    pub config: Config,
    pub next_object_id: AtomicI64,
    pub modified_files: Mutex<ModifiedFiles>,
    pub deployment: Mutex<Deployment>,
    pub docker: Docker,
    pub host_clients: Mutex<HashMap<i64, Arc<HostClient>>>,
    pub web_clients: Mutex<HashSet<CmpRef<Arc<WebClient>>>>,
    pub docker_uploads: Mutex<HashMap<Uuid, Arc<docker_web::Upload>>>,
}

impl State {
    pub async fn new(_: Channel, _: Root<JsObject>) -> Result<Arc<State>> {
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

        let docker = Docker::new(&db).await?;

        let state = Arc::new(State {
            db,
            config,
            next_object_id: Default::default(),
            modified_files: Default::default(),
            deployment: Default::default(),
            docker,
            host_clients: Default::default(),
            web_clients: Default::default(),
            docker_uploads: Default::default(),
        });

        docker_web::init_upload().await?;
        tokio::spawn(modified_files_scan(state.clone()));
        tokio::spawn(docker_prune(state.clone()));
        tokio::spawn(run_host_server(state.clone()));
        tokio::spawn(run_web_clients(state.clone()));
        Ok(state)
    }
}

impl Finalize for State {}
