use anyhow::{Context, Result};
use axum::{
    extract::State as WState,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, TimeZone, Utc};
use log::{error};
use qusql_sqlx_type::query;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::Arc;

use crate::{config::Config, crypt::cost_time_compare, state::State, vanta, web_util::WebError};

/// Hash a secret using SHA-256 and return the hex-encoded string.
fn hash_secret(secret: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hex::encode(hasher.finalize())
}

/// Handler for the /scan endpoint, which receives scan reports from developer machines.
pub async fn scan_handler(
    WState(state): WState<Arc<State>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response, WebError> {
    // Parse Authorization: Bearer <host_uuid>:<secret>
    let auth_header = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .context("Missing or invalid Authorization header")?;

    let (host_uuid, raw_secret) = auth_header
        .split_once(':')
        .context("Authorization token must be <host_uuid>:<secret>")?;

    let secret_hash = hash_secret(raw_secret);

    // Look up machine and verify secret
    let row = query!(
        "SELECT `secret_hash` FROM `developer_machines` WHERE `host_uuid` = ?",
        host_uuid
    )
    .fetch_optional(&state.db)
    .await
    .context("DB error looking up machine")?;

    let Some(row) = row else {
        return Ok((StatusCode::UNAUTHORIZED, "Unknown machine").into_response());
    };

    if !cost_time_compare(row.secret_hash.as_bytes(), secret_hash.as_bytes()) {
        return Ok((StatusCode::UNAUTHORIZED, "Invalid secret").into_response());
    }

    // Validate the body is valid JSON
    let _: serde_json::Value =
        serde_json::from_slice(&body).context("Request body is not valid JSON")?;

    let status_str = std::str::from_utf8(&body).context("Body is not valid UTF-8")?;
    // Round to midnight UTC - we deliberately do not store the exact time
    // the machine was on for privacy reasons.
    let today_midnight = Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();

    query!(
        "UPDATE `developer_machines` SET `last_status` = ?, `last_contact` = ? WHERE `host_uuid` = ?",
        status_str,
        today_midnight,
        host_uuid
    )
    .execute(&state.db)
    .await
    .context("DB error updating machine status")?;

    Ok((StatusCode::OK, "{}").into_response())
}

//========================================> Vanta push <========================================
/// Shape of the scan JSON stored in `last_status`.  Only the fields we need
/// for the Vanta push - everything else is ignored.
#[derive(serde::Deserialize, Debug, Default)]
struct StoredReport {
    #[serde(default)]
    hostname: String,
    #[serde(default)]
    kernel_version: String,
    #[serde(default)]
    os_release: StoredOsRelease,
    #[serde(default)]
    firewall: StoredCheck,
    #[serde(default)]
    disk_encryption: StoredCheck,
    #[serde(default)]
    screen_lock: StoredScreenLock,
}

#[derive(serde::Deserialize, Debug, Default)]
struct StoredOsRelease {
    pretty_name: Option<String>,
    version_id: Option<String>,
}

#[derive(serde::Deserialize, Debug, Default)]
struct StoredCheck {
    enabled: bool,
    method: Option<String>,
}

#[derive(serde::Deserialize, Debug, Default)]
struct StoredScreenLock {
    enabled: bool,
    method: Option<String>,
    timeout_ms: Option<i64>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VantaDeveloperResource {
    display_name: String,
    unique_id: String,
    external_url: String,
    custom_properties: VantaDeveloperProperties,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VantaDeveloperProperties {
    firewall_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    firewall_type: Option<String>,
    disk_encrypted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_encryption_type: Option<String>,
    lockscreen_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    lockscreen_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lockscreen_timeout_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    os_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    os_version: Option<String>,
    kernel_version: String,
    collected_timestamp: String,
    user_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_email: Option<String>,
    host_name: String,
    host_uuid: String,
}


/// Truncate a Unix timestamp to midnight UTC (start of day).
fn truncate_to_day(ts: i64) -> String {
    let dt: DateTime<Utc> = Utc.timestamp_opt(ts, 0).single().unwrap_or_else(Utc::now);
    dt.date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .to_rfc3339()
}

pub async fn push_developer_machines(config: &Config, db: &sqlx::SqlitePool) -> Result<()> {
    let Some(client_id) = &config.vanta_client_id else {
        return Ok(());
    };
    let Some(client_secret) = &config.vanta_client_secret else {
        return Ok(());
    };
    let Some(resource_id) = &config.vanta_developer_resource else {
        return Ok(());
    };

    let rows = query!(
        "SELECT `host_uuid`, `username`, `user_email`, `hostname`, `last_status`, `last_contact`
         FROM `developer_machines`
         WHERE `last_status` IS NOT NULL AND `last_contact` IS NOT NULL"
    )
    .fetch_all(db)
    .await
    .context("Fetching developer machines")?;

    let mut resources = Vec::new();

    for row in rows {
        let report: StoredReport = match serde_json::from_str(&row.last_status) {
            Ok(v) => v,
            Err(e) => {
                error!("Failed parsing last_status for {}: {e:?}", row.host_uuid);
                continue;
            }
        };

        let collected_timestamp = truncate_to_day(row.last_contact);

        resources.push(VantaDeveloperResource {
            display_name: row.hostname.clone(),
            unique_id: row.host_uuid.clone(),
            external_url: format!("https://{}/", config.hostname),
            custom_properties: VantaDeveloperProperties {
                firewall_enabled: report.firewall.enabled,
                firewall_type: report.firewall.method,
                disk_encrypted: report.disk_encryption.enabled,
                disk_encryption_type: report.disk_encryption.method,
                lockscreen_enabled: report.screen_lock.enabled,
                lockscreen_type: report.screen_lock.method,
                lockscreen_timeout_ms: report.screen_lock.timeout_ms,
                os_name: report.os_release.pretty_name,
                os_version: report.os_release.version_id,
                kernel_version: report.kernel_version,
                collected_timestamp,
                user_name: row.username,
                user_email: row.user_email,
                host_name: report.hostname,
                host_uuid: row.host_uuid,
            },
        });
    }

    vanta::vanta_sync(client_id, client_secret, "CustomResource", resource_id.clone(), resources).await?;
    Ok(())
}
