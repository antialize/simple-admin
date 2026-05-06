use crate::cmpref::CmpRef;
use crate::config::Config;
use crate::deployment::Deployment;
use crate::docker::Docker;
use crate::docker_web;
use crate::hostclient::HostClient;
use crate::modified_files::ModifiedFiles;
use crate::webclient::WebClient;
use log::info;
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicI64;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use uuid::Uuid;

/// Per-IP login rate-limiting state.
/// After each failed password attempt the delay doubles (1 s -> 2 -> 4 ... <= 300 s).
/// A successful login clears the entry immediately.
pub struct LoginAttempts {
    /// Earliest time the next login attempt from this IP is allowed.
    pub next_allowed: Instant,
    /// Delay that will be applied after the *next* failure.
    pub delay: Duration,
}

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
    pub read_only: bool,
    /// IP-address -> rate-limit state, used to enforce exponential backoff on
    /// failed login attempts without locking accounts (which would allow DoS).
    pub login_attempts: Mutex<HashMap<String, LoginAttempts>>,
    /// Session-id -> consecutive wrong-OTP count. After 5 wrong submissions the
    /// pwd bit of that session is revoked, forcing a full re-authentication.
    pub otp_failures: Mutex<HashMap<String, u32>>,
}

impl State {
    pub fn debug(&self) {
        info!("=======> Debug output triggered <======");
        info!("Tasks:");
        for task in tokio_tasks::list_tasks() {
            if let Some((file, line)) = task.run_token().location() {
                info!(
                    "  {} id={} @{}:{} start_time={} shutdown_order={}",
                    task.name(),
                    task.id(),
                    file,
                    line,
                    task.start_time(),
                    task.shutdown_order()
                );
            } else {
                info!(
                    "  {} id={} start_time={} shutdown_order={}",
                    task.name(),
                    task.id(),
                    task.start_time(),
                    task.shutdown_order()
                );
            }
        }
        info!("Host cliests:");
        for host in self.host_clients.lock().unwrap().values() {
            host.debug();
        }
        info!("Web clients:");
        for wc in self.web_clients.lock().unwrap().iter() {
            wc.debug();
        }
        info!("===========================================");
    }
}
