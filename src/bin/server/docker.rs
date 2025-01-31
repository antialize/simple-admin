use crate::{
    action_types::{
        DockerDeployment, DockerImageTag, DockerImageTagRow, IDockerDeployEnd,
        IDockerDeploymentsChanged, IDockerListDeploymentHistory, IDockerListDeploymentHistoryRes,
        IDockerListDeployments, IDockerListDeploymentsRes, IServerAction, IServiceDeployStart,
        IServiceRedeployStart, Ref,
    },
    crt, crypt, db,
    state::State,
    webclient::{self, WebClient},
};

use sadmin2::{
    action_types::IDockerDeployLog,
    client_message::{DataMessage, DeployServiceMessage, FailureMessage, SuccessMessage},
    finite_float::ToFinite,
};
use sadmin2::{
    client_message::{ClientHostMessage, HostClientMessage},
    service_description::{ServiceDescription, Subcert},
};

use anyhow::{bail, Context, Result};
use base64::{prelude::BASE64_STANDARD, Engine};
use futures::future::join_all;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use sqlx_type::{query, query_as};
use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    sync::{atomic::AtomicI64, Arc},
    time::Duration,
};
use tokio_tasks::{cancelable, RunToken};

pub const DOCKER_BLOBS_PATH: &str = "/var/simpleadmin_docker_blobs/";

#[derive(Deserialize)]
pub struct ManifestConfig {
    pub digest: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLayer {
    pub digest: String,
    pub size: u64,
    pub media_type: String,
}

#[derive(Deserialize)]
pub struct Manifest {
    pub config: ManifestConfig,
    pub layers: Vec<ManifestLayer>,
}

async fn prune_inner(state: &State) -> Result<()> {
    info!("Prune started");
    let mut files = HashSet::new();
    let mut reader = tokio::fs::read_dir(DOCKER_BLOBS_PATH).await?;
    while let Some(ent) = reader.next_entry().await? {
        if let Ok(v) = ent.file_name().into_string() {
            files.insert(v);
        }
    }
    info!("Prune found {} files", files.len());

    let mut used = HashSet::new();

    let now = std::time::SystemTime::now();
    let now = now
        .duration_since(std::time::UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs_f64();

    let grace = 60.0 * 60.0 * 24.0 * 14.0; // Number of seconds to keep something around

    let rows = query!("SELECT
              `docker_images`.`manifest`,
              `docker_images`.`id`,
              `docker_images`.`tag`,
              `docker_images`.`time`,
              `docker_images`.`project`,
              MIN(`docker_deployments`.`startTime`) AS `start`,
              MAX(`docker_deployments`.`endTime`) AS `end`,
              COUNT(`docker_deployments`.`startTime`) - COUNT(`docker_deployments`.`endTime`) AS `active`,
              `docker_images`.`pin`,
              `docker_images`.`used`,
              (SELECT MAX(`x`.`id`)
               FROM `docker_images` AS `x`
               WHERE `x`.`project`=`docker_images`.`project` AND `x`.`tag`=`docker_images`.`tag`) AS `newest`,
              EXISTS (SELECT * FROM `docker_image_tag_pins` WHERE `docker_image_tag_pins`.`project`=`docker_images`.`project` AND `docker_image_tag_pins`.`tag`=`docker_images`.`tag`) AS `tagPin`
            FROM `docker_images`
            LEFT JOIN `docker_deployments` ON `docker_images`.`hash` = `docker_deployments`.`hash`
            WHERE `removed` IS NULL
            GROUP BY `docker_images`.`id`").fetch_all(&state.db).await.context("Running query in docker prune")?;

    for row in rows {
        let mut keep = row.pin
            || (row.newest == Some(row.id) && row.tagPin)
            || ((&row.tag == "latest" || &row.tag == "master") && row.newest == Some(row.id))
            || row.active > 0
            || (row.start.is_some()
                && row.end.is_some()
                && 2.0 * (row.end.unwrap() - row.start.unwrap()) as f64 + grace
                    > now - row.start.unwrap() as f64)
            || (row.used.is_some()
                && 2.0 * (row.used.unwrap() - row.time) + grace > now - row.used.unwrap())
            || row.time + grace > now;

        let manifest: Manifest =
            serde_json::from_str(&row.manifest).context("Deserializing manifest")?;

        if !files.contains(&manifest.config.digest) {
            keep = false;
        }

        for layer in &manifest.layers {
            if !files.contains(&layer.digest) {
                keep = false;
                break;
            }
        }

        if keep {
            used.insert(manifest.config.digest);
            for layer in manifest.layers {
                used.insert(layer.digest);
            }
        } else {
            query!(
                "UPDATE `docker_images` SET `removed`=? WHERE `id`=?",
                now,
                row.id
            )
            .execute(&state.db)
            .await?;
        }
    }

    let rem: Vec<_> = files.difference(&used).collect();
    info!(
        "Used: {} total: {} remove: {}",
        used.len(),
        files.len(),
        rem.len()
    );
    let futures: Vec<_> = rem
        .into_iter()
        .map(|p| {
            let path = std::path::Path::new(DOCKER_BLOBS_PATH).join(p);
            async move {
                if let Err(e) = tokio::fs::remove_file(&path).await {
                    warn!("Unable to remove {:?}: {:?}", path, e);
                }
            }
        })
        .collect();
    join_all(futures).await;
    info!("Prune done");
    Ok(())
}

pub async fn docker_prune(state: Arc<State>, run_token: RunToken) -> Result<()> {
    loop {
        if cancelable(
            &run_token,
            tokio::time::sleep(Duration::from_secs(60 * 60 * 12)),
        )
        .await
        .is_err()
        {
            break;
        }
        // TODO(jakobt) make prune_inner cancable
        // prune docker images every 12 houers
        if let Err(e) = prune_inner(&state).await {
            error!("Error pruning docker blobs: {:?}", e);
        }
    }
    Ok(())
}

pub struct Docker {
    idc: AtomicI64,
    pub ca_key: String,
    pub ca_crt: String,
}

impl Docker {
    pub async fn new(db: &SqlitePool) -> Result<Docker> {
        let r = query!("SELECT `value` FROM `kvp` WHERE `key` = ?", "ca_key")
            .fetch_optional(db)
            .await?;
        let ca_key = if let Some(r) = r {
            r.value
        } else {
            info!("Generating ca key");
            let key = crt::generate_key().await?;
            query!(
                "REPLACE INTO kvp (`key`, `value`) VALUES (?,?)",
                "ca_key",
                key
            )
            .execute(db)
            .await?;
            key
        };

        let r = query!("SELECT `value` FROM `kvp` WHERE `key` = ?", "ca_crt")
            .fetch_optional(db)
            .await?;
        let ca_crt = if let Some(r) = r {
            r.value
        } else {
            info!("Generating ca crnt");
            let crt = crt::generate_ca_crt(&ca_key).await?;
            query!(
                "REPLACE INTO kvp (`key`, `value`) VALUES (?,?)",
                "ca_crt",
                crt
            )
            .execute(db)
            .await?;
            crt
        };

        Ok(Docker {
            idc: Default::default(),
            ca_crt,
            ca_key,
        })
    }

    pub fn next_id(&self) -> i64 {
        self.idc.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }
}

fn row_to_deployment(row: DockerDeploymentRow) -> Result<DockerDeployment> {
    let itr = DockerImageTagRow {
        id: row.image_id,
        hash: row.hash.clone(),
        time: row.image_time,
        user: row.image_user,
        tag: row.image_tag,
        pin: row.image_pin,
        labels: row.image_labels,
        project: row.image_project,
        removed: row.image_removed,
    };
    Ok(DockerDeployment {
        id: row.id,
        image: row.project,
        hash: Some(row.hash), // TODO
        name: row.container.clone(),
        host: row.host,
        start: (row.startTime as f64).to_finite()?, // TODO
        end: row.endTime.map(|v| v as f64).to_finite()?, // TODO
        user: row.user.unwrap_or_default(),
        state: None,
        config: row.config.unwrap_or_default(), //TODO
        timeout: row
            .timeout
            .map(|v| v as f64)
            .unwrap_or_default()
            .to_finite()?, // TODO
        use_podman: row.usePodman,
        service: row.service,
        image_info: Some(itr.try_into()?),
    })
}

#[allow(clippy::too_many_arguments)]
async fn deploy_server_inner2(
    state: &State,
    client: &WebClient,
    r#ref: Ref,
    host_id: i64,
    description_template: String,
    image_id: Option<String>,
    image: Option<String>,
    hash: Option<String>,
    project: Option<String>,
    do_template: bool,
) -> Result<(), anyhow::Error> {
    info!("service deploy start ref: {:?}", r#ref);
    let auth = client.get_auth();
    let user = auth.user.context("Missing user")?;
    let host_variables = db::get_host_variables(state, host_id)
        .await?
        .context("Could not find root or host")?;

    let mut variables: HashMap<_, _> = host_variables
        .iter()
        .map(|(k, v)| (k.as_str().into(), v.as_str().into()))
        .collect();
    for i in 0..10 {
        let mut buf = [0; 24];
        crypt::random_fill(&mut buf)?;
        variables.insert(
            format!("token_{}", i).into(),
            BASE64_STANDARD.encode(buf).into(),
        );
    }
    let mut extra_env = HashMap::new();
    if description_template.contains("ssl_service") {
        variables.insert("ca_pem".into(), "TEMP".into());
        variables.insert("ssl_key".into(), "TEMP".into());
        variables.insert("ssl_pem".into(), "TEMP".into());
        let description_str =
            crate::mustache::render(&description_template, None, &variables, true)
                .context("Unable to render description template 1")?;
        let description: ServiceDescription =
            serde_yaml::from_str(&description_str).with_context(|| {
                format!("Deserializing service description 1 '{}'", description_str)
            })?;
        if let (Some(ssl_service), Some(ssl_identity)) =
            (description.ssl_service, description.ssl_identity)
        {
            let ca_key = &state.docker.ca_key;
            let ca_crt = &state.docker.ca_crt;
            let my_key = crt::generate_key().await.context("generate_key")?;
            let my_srs = crt::generate_srs(&my_key, &format!("{}.{}", ssl_identity, ssl_service))
                .await
                .context("generate_srs")?;

            let ssl_subcerts = match description.ssl_subcert {
                Some(Subcert::One(v)) => vec![v],
                Some(Subcert::More(vec)) => vec,
                None => Vec::new(),
            };
            let my_crt = crt::generate_crt(ca_key, ca_crt, &my_srs, &ssl_subcerts, 999)
                .await
                .context("generate_crt")?;
            variables.insert("ca_pem".into(), crt::strip(ca_crt).to_string().into());
            variables.insert("ssl_key".into(), crt::strip(&my_key).to_string().into());
            variables.insert("ssl_pem".into(), crt::strip(&my_crt).to_string().into());
            extra_env.insert("CA_PEM".to_string(), crt::strip(ca_crt).to_string());
            let service_uc = ssl_service.to_uppercase();
            extra_env.insert(
                format!("{}_KEY", service_uc),
                crt::strip(&my_key).to_string(),
            );
            extra_env.insert(
                format!("{}_PEM", service_uc),
                crt::strip(&my_crt).to_string(),
            );
        } else {
            variables.remove("ca_pem");
            variables.remove("ssl_key");
            variables.remove("ssl_pem");
        }
    }
    let description_str = if do_template {
        crate::mustache::render(&description_template, None, &variables, true)
            .context("Unable to render description template 2")?
    } else {
        description_template.into()
    };
    let description: ServiceDescription = serde_yaml::from_str(&description_str)
        .with_context(|| format!("Deserializing service description 2 '{}'", description_str))?;
    let name = description.name;
    let (project, hash, image) = if let Some(project) = project {
        (project, hash, image)
    } else if let Some(image_id) = image_id {
        let (project, hash) = if let Some((image, reference)) = image_id.split_once('@') {
            let hash = query!(
                "SELECT `hash`, `time` FROM `docker_images`
                WHERE `project`=? AND `hash`=? ORDER BY `time` DESC LIMIT 1",
                image,
                reference
            )
            .fetch_optional(&state.db)
            .await
            .context("Running query 1")?
            .map(|v| v.hash);
            (image, hash)
        } else {
            let (image, reference) = image_id.split_once(":").unwrap_or((&image_id, "latest"));
            let hash = query!(
                "SELECT `hash`, `time` FROM `docker_images`
                WHERE `project`=? AND `tag`=? ORDER BY `time` DESC LIMIT 1",
                image,
                reference
            )
            .fetch_optional(&state.db)
            .await
            .context("Running query 2")?
            .map(|v| v.hash);

            (image, hash)
        };
        let hash = hash.context("Could not find image to deploy")?;
        let image = format!("{}@{}", project, hash);

        if let Some(p) = &description.project {
            if p != project {
                bail!("roject and image does not match")
            }
        }
        (project.to_string(), Some(hash), Some(image))
    } else if let Some(project) = description.project {
        (project, None, None)
    } else {
        bail!("Missing project in description");
    };
    let Some(hash) = hash else {
        bail!("Missing hash");
    };
    extra_env.insert("DOCKER_HASH".to_string(), hash.to_string());
    let mut buf = [0; 64];
    crypt::random_fill(&mut buf)?;
    let session = hex::encode(buf);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs() as i64;
    query!(
        "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)",
        "docker_client",
        "",
        now,
        now,
        session
    )
    .execute(&state.db)
    .await
    .context("Running query 3")?;
    let r = deploy_server_inner3(
        state,
        client,
        r#ref,
        host_id,
        user,
        extra_env,
        description_str,
        name,
        project,
        image,
        hash,
        &session,
        now,
    )
    .await;
    query!(
        "DELETE FROM `sessions` WHERE `user`=? AND `sid`=?",
        "docker_client",
        session
    )
    .execute(&state.db)
    .await?;
    r?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn deploy_server_inner3(
    state: &State,
    client: &WebClient,
    r#ref: Ref,
    host_id: i64,
    user: String,
    extra_env: HashMap<String, String>,
    description_str: Cow<'_, str>,
    name: String,
    project: String,
    image: Option<String>,
    hash: String,
    session: &String,
    now: i64,
) -> Result<(), anyhow::Error> {
    let row = query_as!(
        DockerImageTagRow,
        "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`,
`labels`, `removed` FROM `docker_images` WHERE `hash` = ?",
        hash
    )
    .fetch_optional(&state.db)
    .await?
    .context("Unable to find image")?;

    let image_info: DockerImageTag = row.try_into().context("Building DockerImageTag")?;

    let Some(host) = state.host_clients.lock().unwrap().get(&host_id).cloned() else {
        bail!("Host not up");
    };
    let rt = RunToken::new();

    let mut jh = host
        .start_job(&HostClientMessage::DeployService(DeployServiceMessage {
            id: host.next_job_id(),
            description: description_str.to_string(),
            extra_env,
            image,
            docker_auth: Some(BASE64_STANDARD.encode(format!("docker_client:{}", session))),
            user: Some(user.clone()),
        }))
        .await?;
    loop {
        match jh.next_message().await? {
            Some(ClientHostMessage::Data(DataMessage { data, .. })) => {
                let serde_json::Value::String(msg) = data else {
                    continue;
                };
                let msg = BASE64_STANDARD.decode(&msg)?;
                let message = match String::from_utf8(msg) {
                    Ok(v) => v,
                    Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
                };
                client
                    .send_message(
                        &rt,
                        IServerAction::DockerDeployLog(IDockerDeployLog {
                            r#ref: r#ref.clone(),
                            message,
                        }),
                    )
                    .await?;
            }
            Some(ClientHostMessage::Success(SuccessMessage { code, .. })) => {
                jh.done();
                if code == Some(0) {
                    break;
                }
                bail!("Failed with code {:?}", code);
            }
            Some(ClientHostMessage::Failure(FailureMessage { .. })) => {
                jh.done();
                bail!("Failed")
            }
            Some(_) => {
                bail!("Got unexpected message");
            }
            None => {
                bail!("Host went away");
            }
        }
    }

    let id = state.docker.next_id();

    let old_deployment = query!(
        "SELECT `id`, `endTime` FROM `docker_deployments`
                WHERE `host`=? AND `project`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1",
        host_id,
        project,
        name,
    )
    .fetch_optional(&state.db)
    .await
    .context("Query 1")?;
    if let Some(old_deployment) = old_deployment {
        if old_deployment.endTime.is_none() {
            query!(
                "UPDATE `docker_deployments` SET `endTime` = ? WHERE `id`=?",
                now,
                old_deployment.id,
            )
            .execute(&state.db)
            .await
            .context("Query 2")?;
        }
    }
    let id2 = query!(
        "INSERT INTO `docker_deployments` (
                `project`, `container`, `host`, `startTime`, `hash`, `user`, `description`)
                VALUES (?, ?, ?, ?, ?, ?, ?)",
        project,
        name,
        host_id,
        now,
        hash,
        user,
        description_str,
    )
    .execute(&state.db)
    .await
    .context("Query 3")?
    .last_insert_rowid();
    client
        .send_message(
            &rt,
            IServerAction::DockerDeployEnd(IDockerDeployEnd {
                r#ref,
                status: true,
                message: "Success".into(),
                id: Some(id2),
            }),
        )
        .await?;

    let o = DockerDeployment {
        id,
        image: project.clone(),
        image_info: Some(image_info),
        hash: Some(hash),
        name: name.clone(),
        user: user.clone(),
        start: (now as f64).to_finite()?,
        end: None,
        host: host_id,
        state: None,
        config: "".to_string(),    // TODO
        timeout: 0.0.to_finite()?, // TODO
        use_podman: false,
        service: true,
    };

    webclient::broadcast(
        state,
        IServerAction::DockerDeploymentsChanged(IDockerDeploymentsChanged {
            changed: vec![o],
            removed: vec![],
        }),
    )?;

    Ok(())
}

async fn redploy_service_inner(
    state: &State,
    client: &WebClient,
    act: IServiceRedeployStart,
) -> Result<()> {
    let row = query!(
        "SELECT `description`, `host`, `project`, `hash` FROM `docker_deployments` WHERE `id`=?",
        act.deployment_id
    )
    .fetch_optional(&state.db)
    .await?;
    let Some(row) = row else {
        bail!("Could not find deployment")
    };
    let Some(description) = row.description else {
        bail!("Not an service deployment")
    };
    deploy_server_inner2(
        state,
        client,
        act.r#ref,
        row.host,
        description,
        None,
        Some(format!("{}@{}", row.project, row.hash)),
        Some(row.hash),
        Some(row.project),
        false,
    )
    .await?;
    Ok(())
}

pub async fn redploy_service(
    state: &State,
    client: &WebClient,
    act: IServiceRedeployStart,
) -> Result<()> {
    let rt = RunToken::new();
    let r#ref = act.r#ref.clone();
    if let Err(e) = redploy_service_inner(state, client, act).await {
        error!("Service redeployment failed: {:?}", e);
        client
            .send_message(
                &rt,
                IServerAction::DockerDeployEnd(IDockerDeployEnd {
                    r#ref,
                    status: false,
                    message: format!("Deployment failed {}", e),
                    id: None,
                }),
            )
            .await?;
    }
    Ok(())
}

pub async fn deploy_service(
    state: &State,
    client: &WebClient,
    act: IServiceDeployStart,
) -> Result<()> {
    let host_id = match act.host {
        crate::action_types::HostEnum::Id(v) => v,
        crate::action_types::HostEnum::Name(n) => state
            .host_clients
            .lock()
            .unwrap()
            .values()
            .find(|v| v.hostname() == n)
            .map(|v| v.id())
            .context("no such host")?,
    };
    if let Err(e) = deploy_server_inner2(
        state,
        client,
        act.r#ref.clone(),
        host_id,
        act.description,
        act.image,
        None,
        None,
        None,
        true,
    )
    .await
    {
        let rt = RunToken::new();
        error!("Service deployment failed: {:?}", e);
        client
            .send_message(
                &rt,
                IServerAction::DockerDeployEnd(IDockerDeployEnd {
                    r#ref: act.r#ref,
                    status: false,
                    message: format!("Deployment failed {}", e),
                    id: None,
                }),
            )
            .await?;
    }
    Ok(())
}

#[allow(non_snake_case)]
#[derive(Serialize)]
struct DockerDeploymentRow {
    id: i64,
    project: String,
    container: String,
    host: i64,
    startTime: i64,
    endTime: Option<i64>,
    config: Option<String>,
    hash: String,
    user: Option<String>,
    timeout: Option<i64>,
    usePodman: bool,
    service: bool,
    image_id: i64,
    image_time: f64,
    image_project: String,
    image_user: String,
    image_tag: String,
    image_pin: bool,
    image_labels: Option<String>,
    image_removed: Option<f64>,
}

pub async fn list_deployments(
    rt: &RunToken,
    state: &State,
    client: &WebClient,
    act: IDockerListDeployments,
) -> Result<()> {
    let rows = query_as!(
        DockerDeploymentRow,
        "SELECT
        `docker_deployments`.`id`, `docker_deployments`.`hash`, `docker_deployments`.`host`, 
        `docker_deployments`.`project`, `docker_deployments`.`container`,
        `docker_deployments`.`startTime`, `docker_deployments`.`endTime`,
        `docker_deployments`.`user`, `docker_deployments`.`config`,
        `docker_deployments`.`timeout`, `docker_deployments`.`usePodman`,
        `docker_deployments`.`description` IS NOT NULL AS `service`,
        `docker_images`.`id` AS `image_id`,
        `docker_images`.`time` AS `image_time`,
        `docker_images`.`project` AS `image_project`,
        `docker_images`.`user` AS `image_user`,
        `docker_images`.`tag` AS `image_tag`,
        `docker_images`.`pin` AS `image_pin`,
        `docker_images`.`labels` AS `image_labels`,
        `docker_images`.`removed` AS `image_removed`
        FROM `docker_deployments`, `docker_images`
        WHERE `docker_images`.`hash`=`docker_deployments`.`hash`
        AND `docker_deployments`.`id` IN (
            SELECT MAX(`d`.`id`) FROM `docker_deployments` as `d`
            GROUP BY `d`.`host`, `d`.`project`, `d`.`container`)"
    )
    .fetch_all(&state.db)
    .await
    .context("Running main query")?;
    let mut deployments = Vec::new();
    for row in rows {
        if let Some(host) = act.host {
            if host != row.host {
                continue;
            }
        }
        if let Some(image) = &act.image {
            if image != &row.project {
                continue;
            }
        }
        deployments.push(row_to_deployment(row).context("In row_to_deployment")?);
    }

    client
        .send_message(
            rt,
            IServerAction::DockerListDeploymentsRes(IDockerListDeploymentsRes {
                r#ref: act.r#ref,
                deployments,
            }),
        )
        .await?;
    Ok(())
}

pub async fn list_deployment_history(
    rt: &RunToken,
    state: &State,
    client: &WebClient,
    act: IDockerListDeploymentHistory,
) -> Result<()> {
    let rows = query_as!(
        DockerDeploymentRow,
        "SELECT
        `docker_deployments`.`id`, `docker_deployments`.`hash`, `docker_deployments`.`host`, 
        `docker_deployments`.`project`, `docker_deployments`.`container`,
        `docker_deployments`.`startTime`, `docker_deployments`.`endTime`,
        `docker_deployments`.`user`, `docker_deployments`.`config`,
        `docker_deployments`.`timeout`, `docker_deployments`.`usePodman`,
        `docker_deployments`.`description` IS NOT NULL AS `service`,
        `docker_images`.`id` AS `image_id`,
        `docker_images`.`time` AS `image_time`,
        `docker_images`.`project` AS `image_project`,
        `docker_images`.`user` AS `image_user`,
        `docker_images`.`tag` AS `image_tag`,
        `docker_images`.`pin` AS `image_pin`,
        `docker_images`.`labels` AS `image_labels`,
        `docker_images`.`removed` AS `image_removed`
        FROM `docker_deployments`, `docker_images`
        WHERE `docker_images`.`hash`=`docker_deployments`.`hash`
        AND `docker_deployments`.`host`=? AND `docker_deployments`.`container`=?",
        act.host,
        act.name
    )
    .fetch_all(&state.db)
    .await?;
    let mut deployments = Vec::new();
    for row in rows {
        deployments.push(row_to_deployment(row)?);
    }
    client
        .send_message(
            rt,
            IServerAction::DockerListDeploymentHistoryRes(IDockerListDeploymentHistoryRes {
                r#ref: act.r#ref,
                host: act.host,
                name: act.name,
                deployments,
            }),
        )
        .await?;
    Ok(())
}
