use anyhow::{Context, Result};
use neon::types::Finalize;
use sqlx::SqlitePool;
use std::sync::Arc;

use crate::config::{read_config, Config};

pub struct State {
    pub db: SqlitePool,
    pub config: Config,
}

impl State {
    pub async fn new() -> Result<Arc<State>> {
        let config = read_config()?;
        let db = sqlx::SqlitePool::connect("sysadmin.db")
            .await
            .context("Unable to connect to sysadmin.db")?;
        Ok(Arc::new(State { db, config }))
    }
}

impl Finalize for State {}
