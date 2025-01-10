use crate::config::{read_config, Config};
use crate::docker::{docker_prune, Docker};
use crate::modified_files::{modified_files_scan, ModifiedFiles};
use anyhow::{Context, Result};
use log::LevelFilter;
use neon::event::Channel;
use neon::handle::Root;
use neon::types::{Finalize, JsObject};
use simple_logger::SimpleLogger;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::ConnectOptions;
use sqlx::SqlitePool;
use std::str::FromStr;
use std::sync::atomic::AtomicI64;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct State {
    pub db: SqlitePool,
    pub config: Config,
    pub next_object_id: AtomicI64,
    pub modified_files: Mutex<ModifiedFiles>,
    pub ch: Channel,
    pub instances: Arc<Root<JsObject>>,
    pub docker: Docker,
}

impl State {
    pub async fn new(ch: Channel, instances: Root<JsObject>) -> Result<Arc<State>> {
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

            ch,
            instances: Arc::new(instances),
            docker,
        });

        tokio::spawn(modified_files_scan(state.clone()));
        tokio::spawn(docker_prune(state.clone()));

        Ok(state)
    }
}

impl Finalize for State {}
