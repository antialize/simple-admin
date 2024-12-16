use crate::state::State;
use anyhow::{Context, Result};
use futures::future::join_all;
use log::{error, info, warn};
use serde::Deserialize;
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
    let mut files = HashSet::new();
    let mut reader = tokio::fs::read_dir(DOCKER_BLOBS_PATH).await?;
    while let Some(ent) = reader.next_entry().await? {
        if let Ok(v) = ent.file_name().into_string() {
            files.insert(v);
        }
    }

    let mut used = HashSet::new();

    let now = std::time::SystemTime::now();
    let now = now
        .duration_since(std::time::UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs() as i64;

    let grace = 60 * 60 * 24 * 14; // Number of seconds to keep something around

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
            GROUP BY `docker_images`.`id`").fetch_all(&state.db).await?;

    for row in rows {
        let mut keep = row.pin.unwrap_or_default()
            || (row.newest == Some(row.id) && row.tagPin)
            || ((&row.tag == "latest" || &row.tag == "master") && row.newest == Some(row.id))
            || row.active > 0
            || (row.start.is_some()
                && row.end.is_some()
                && 2 * (row.end.unwrap() - row.start.unwrap()) + grace > now - row.start.unwrap())
            || (row.used.is_some()
                && 2 * (row.used.unwrap() - row.time) + grace > now - row.used.unwrap())
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
    Ok(())
}

pub async fn prune(state: &State) {
    if let Err(e) = prune_inner(state).await {
        error!("Error pruning docker blobs: {:?}", e);
    }
}
