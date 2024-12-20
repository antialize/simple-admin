use crate::state::State;
use anyhow::{Context, Result};
use futures::future::join_all;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use sqlx_type::query;
use std::collections::HashSet;

const DOCKER_BLOBS_PATH: &str = "/var/simpleadmin_docker_blobs/";

#[derive(Deserialize)]
struct ManifestConfig {
    digest: String,
}

#[derive(Deserialize)]
struct ManifestLayer {
    digest: String,
}

#[derive(Deserialize)]
struct Manifest {
    config: ManifestConfig,
    layers: Vec<ManifestLayer>,
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
                && 2.0 * (row.used.unwrap() as f64 - row.time) + grace
                    > now - row.used.unwrap() as f64)
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

pub async fn prune(state: &State) {
    if let Err(e) = prune_inner(state).await {
        error!("Error pruning docker blobs: {:?}", e);
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentInfo {
    pub restore: Option<i64>,
    pub host: i64,
    pub image: String,
    pub container: String,
    pub hash: String,
    pub user: String,
    pub config: String,
    pub timeout: i64,
    pub start: i64,
    pub end: Option<i64>,
    pub id: Option<i64>,
    pub setup: Option<String>,
    pub post_setup: Option<String>,
    pub deployment_timeout: i64,
    #[serde(default)]
    pub soft_takeover: bool,
    pub start_magic: Option<String>,
    #[serde(default)]
    pub use_podman: bool,
    pub stop_timeout: i64,
    pub user_service: bool,
    pub deploy_user: Option<String>,
    pub service_file: Option<String>,
    pub description: Option<String>,
}

pub async fn handle_deployment(state: &State, o: DeploymentInfo) -> Result<i64> {
    if let Some(restore) = o.restore {
        query!(
            "DELETE FROM `docker_deployments`
            WHERE `id` > ? AND `host`=? AND `project`=? AND `container`=?",
            restore,
            o.host,
            o.image,
            o.container,
        )
        .execute(&state.db)
        .await?;
        query!(
            "UPDATE `docker_deployments` SET `endTime` = null WHERE `id`=?",
            restore,
        )
        .execute(&state.db)
        .await?;
        Ok(restore)
    } else {
        let old_deploy = query!(
            "SELECT `id`, `endTime` FROM `docker_deployments`
            WHERE `host`=? AND `project`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1",
            o.host,
            o.image,
            o.container,
        )
        .fetch_optional(&state.db)
        .await?;

        if let Some(old_deploy) = old_deploy {
            if old_deploy.endTime.is_none() {
                query!(
                    "UPDATE `docker_deployments` SET `endTime` = ? WHERE `id`=?",
                    o.start,
                    old_deploy.id,
                )
                .execute(&state.db)
                .await?;
            }
        }
        Ok(query!(
            "INSERT INTO `docker_deployments` (
            `project`, `container`, `host`, `startTime`, `config`, `setup`, `hash`,
            `user`, `postSetup`, `timeout`, `softTakeover`, `startMagic`, `stopTimeout`,
            `usePodman`, `userService`, `deployUser`, `serviceFile`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            o.image,
            o.container,
            o.host,
            o.start,
            o.config,
            o.setup,
            o.hash,
            o.user,
            o.post_setup,
            o.timeout,
            o.soft_takeover,
            o.start_magic,
            o.stop_timeout,
            o.use_podman,
            o.user_service,
            o.deploy_user,
            o.service_file,
        )
        .execute(&state.db)
        .await?
        .last_insert_rowid())
    }
}
