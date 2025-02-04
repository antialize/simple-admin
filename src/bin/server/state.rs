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
    pub fn debug(&self) {
        info!("=======> Debug output triggered <======");
        info!("Tasks:");
        for task in tokio_tasks::list_tasks() {
            info!(
                "  {} id={} start_time={} shutdown_order={}",
                task.name(),
                task.id(),
                task.start_time(),
                task.shutdown_order()
            );
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
