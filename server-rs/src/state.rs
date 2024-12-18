use anyhow::{Context, Result};
use neon::types::Finalize;
use simple_logger::SimpleLogger;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::SqlitePool;
use std::str::FromStr;
use std::sync::Arc;

use crate::config::{read_config, Config};

pub struct State {
    pub db: SqlitePool,
    pub config: Config,
}

impl State {
    pub async fn new() -> Result<Arc<State>> {
        SimpleLogger::new().env().init().unwrap();

        let config = read_config()?;

        let opt = SqliteConnectOptions::from_str("sqlite://sysadmin.db")?
            .journal_mode(SqliteJournalMode::Wal);

        let db = sqlx::SqlitePool::connect_with(opt)
            .await
            .context("Unable to connect to sysadmin.db")?;
        Ok(Arc::new(State { db, config }))
    }
}

impl Finalize for State {}
