use crate::cmpref::CmpRef;
use crate::config::Config;
use crate::deployment::Deployment;
use crate::docker::Docker;
use crate::docker_web;
use crate::hostclient::HostClient;
use crate::modified_files::ModifiedFiles;
use crate::webclient::WebClient;
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
