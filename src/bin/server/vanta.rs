use std::{sync::Arc, time::Duration};

use anyhow::{Context, Result, bail};
use futures::future::join_all;
use log::{error, info};
use sadmin2::{
    client_message::{
        ClientHostMessage, HostClientMessage, RunInstantMessage, RunInstantStdinOutputType,
        RunInstantStdinType,
    },
    type_types::{HOST_ID, USER_ID},
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use sqlx_type::query;
use tokio::time::timeout;
use tokio_tasks::{RunToken, cancelable};

use crate::{config::Config, db::UserContent, state::State};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VantaUser {
    display_name: String,
    unique_id: String,
    external_url: String,
    full_name: String,
    account_name: String,
    email: String,
    permission_level: &'static str,
    created_timestamp: String,
    status: &'static str,
    mfa_enabled: bool,
    mfa_methods: &'static [&'static str],
    auth_method: &'static str,
    updated_timestamp: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VantaUserAccounts {
    resource_id: String,
    resources: Vec<VantaUser>,
}

#[derive(Serialize, Debug)]
struct VantaTokenRequest<'a> {
    client_id: &'a str,
    client_secret: &'a str,
    scope: &'a str,
    grant_type: &'a str,
}

#[derive(Deserialize, Debug)]
struct VantaTokenResponse {
    access_token: String,
}

#[derive(Deserialize, Debug)]
struct VantaSyncResponse {
    success: bool,
}

async fn push_users(config: &Config, db: &SqlitePool) -> Result<()> {
    let Some(client_id) = &config.vanta_client_id else {
        return Ok(());
    };
    let Some(client_secret) = &config.vanta_client_secret else {
        return Ok(());
    };
    let Some(resource_id) = &config.vanta_users_resource else {
        return Ok(());
    };
    let rows = query!(
        "SELECT `id`, `name`, `content`, `time`, (SELECT MIN(`o2`.`time`) FROM `objects` AS `o2` WHERE `o2`.`id` = `o`.`id`) AS `created`
             FROM `objects` AS `o` WHERE `type`=? AND `newest`=true",
        USER_ID
    ).fetch_all(db).await?;

    let mut resources = Vec::new();

    for row in rows {
        let content: UserContent = match serde_json::from_str(&row.content) {
            Ok(v) => v,
            Err(e) => {
                error!(
                    "Error parsing user content of user {}({}): {:?}",
                    row.name, row.id, e
                );
                continue;
            }
        };
        if content.system {
            continue;
        }
        let Some(email) = content.email else {
            continue;
        };
        if !email.contains("@") {
            error!("Invalid email '{email}'");
            continue;
        }
        resources.push(VantaUser {
            display_name: row.name.clone(),
            unique_id: row.id.to_string(),
            external_url: format!(
                "https://{}/?page=object&type=4&id={}",
                config.hostname, row.id
            ),
            full_name: format!(
                "{} {}",
                content.first_name.as_deref().unwrap_or_default(),
                content.last_name.as_deref().unwrap_or_default()
            ),
            account_name: row.name,
            email,
            permission_level: if content.admin { "ADMIN" } else { "BASE" },
            created_timestamp: row.created.unwrap().and_utc().to_rfc3339(),
            status: "ACTIVE",
            mfa_enabled: true,
            mfa_methods: &["OTP"],
            auth_method: "PASSWORD",
            updated_timestamp: row.time.and_utc().to_rfc3339(),
        });
    }

    let client = reqwest::Client::new();

    let r = client
        .post("https://api.vanta.com/oauth/token")
        .json(&VantaTokenRequest {
            client_id,
            client_secret,
            scope: "connectors.self:write-resource",
            grant_type: "client_credentials",
        })
        .build()
        .context("Failed building token request")?;

    let r = client
        .execute(r)
        .await
        .context("Faild executing token request")?;

    if let Err(e) = r.error_for_status_ref() {
        let text = r.text().await?;
        return Err(e).context(format!("Faild executing token request: {text}"));
    }

    let token: VantaTokenResponse = r.json().await.context("Failed getting token")?;
    let accounts = VantaUserAccounts {
        resource_id: resource_id.clone(),
        resources,
    };

    let request = client
        .put("https://api.vanta.com/v1/resources/user_account")
        .bearer_auth(token.access_token)
        .json(&accounts)
        .build()
        .context("Failed building users request")?;

    let r = client
        .execute(request)
        .await
        .context("Failed executing users request")?;

    if let Err(e) = r.error_for_status_ref() {
        let text = r.text().await?;
        return Err(e).context(format!("Failed executing users request: {text}"));
    }

    let response: VantaSyncResponse = r
        .json()
        .await
        .context("Failed deserializing sync response")?;

    if !response.success {
        bail!("Failed syncing vanta users");
    }

    info!("Successfully synced vanta users");
    Ok(())
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "snake_case")]
enum Firewall {
    NoUfwStatus,
    Inactive,
    Ok,
    Dirty,
}

#[derive(Deserialize, Debug)]
struct AnalyzeHostResult {
    firewall: Firewall,
    ufw_status: Option<String>,
    distribution: Option<String>,
    uname: Option<String>,
    data_encrypted: Option<bool>,
    root_encrypted: Option<bool>,
}

const VANTA_CHECK_SCRIPT: &str = include_str!("vanta_host_check.py");

#[derive(Serialize, Debug)]
#[serde(rename_all = "snake_case")]
enum HostStatus {
    Ok,
    HostDown,
    Internal,
    Timeout,
    CommandFailed,
    WrongMessage,
    InvalidJson,
}

async fn analyze_host(state: &State, id: i64) -> Result<AnalyzeHostResult, HostStatus> {
    let host = state.host_clients.lock().unwrap().get(&id).cloned();
    let Some(host) = host else {
        return Err(HostStatus::HostDown);
    };

    let mut jh = host
        .start_job(&HostClientMessage::RunInstant(RunInstantMessage {
            id: host.next_job_id(),
            name: "vanta_check.py".into(),
            interperter: "/usr/bin/python3".into(),
            content: VANTA_CHECK_SCRIPT.to_string(),
            args: Vec::new(),
            output_type: RunInstantStdinOutputType::Json,
            stdin_type: RunInstantStdinType::None,
        }))
        .await
        .map_err(|_| HostStatus::Internal)?;

    match timeout(Duration::from_secs(60), jh.next_message()).await {
        Err(_) => Err(HostStatus::Timeout),
        Ok(Err(_)) => Err(HostStatus::HostDown),
        Ok(Ok(Some(ClientHostMessage::Success(msg)))) => {
            if let Some(code) = msg.code {
                if code != 0 {
                    return Err(HostStatus::CommandFailed);
                }
            }
            let Some(data) = msg.data else {
                return Err(HostStatus::InvalidJson);
            };
            let Ok(result) = serde_json::from_value::<AnalyzeHostResult>(data) else {
                return Err(HostStatus::InvalidJson);
            };
            Ok(result)
        }
        Ok(Ok(Some(ClientHostMessage::Failure(_)))) => Err(HostStatus::CommandFailed),
        Ok(Ok(Some(_))) => Err(HostStatus::WrongMessage),
        Ok(Ok(None)) => Err(HostStatus::HostDown),
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VantaHostResourceCustom {
    category: String,
    firewall: bool,
    status: HostStatus,
    ufw_status: Option<String>,
    distribution: Option<String>,
    uname: Option<String>,
    data_encrypted: Option<bool>,
    root_encrypted: Option<bool>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VantaHostResource {
    display_name: String,
    unique_id: String,
    external_url: String,
    custom_properties: VantaHostResourceCustom,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VantaHostResources {
    resource_id: String,
    resources: Vec<VantaHostResource>,
}

pub async fn push_hosts(state: &State) -> Result<()> {
    let config = &state.config;
    let db = &state.db;

    let Some(client_id) = &config.vanta_client_id else {
        return Ok(());
    };
    let Some(client_secret) = &config.vanta_client_secret else {
        return Ok(());
    };
    let Some(resource_id) = &config.vanta_hosts_resource else {
        return Ok(());
    };
    let rows = query!(
        "SELECT `id`, `name`, `content`, `time`, `category`
        FROM `objects` WHERE `type`=? AND `category` != 'Developer' AND `newest`=true",
        HOST_ID
    )
    .fetch_all(db)
    .await?;

    info!("Starting {} analyzing host futures", rows.len());
    let mut futures = Vec::new();
    for row in &rows {
        futures.push(analyze_host(state, row.id));
    }
    let mut resources = Vec::new();
    let results = join_all(futures).await;
    info!("Got all results");
    for (row, result) in rows.into_iter().zip(results) {
        let (host_status, status) = match result {
            Ok(v) => (Some(v), HostStatus::Ok),
            Err(e) => (None, e),
        };
        let external_url = format!(
            "https://{}/?page=object&type=2&id={}",
            config.hostname, row.id
        );
        if let Some(host_status) = host_status {
            resources.push(VantaHostResource {
                display_name: row.name,
                unique_id: row.id.to_string(),
                external_url,
                custom_properties: VantaHostResourceCustom {
                    category: row.category,
                    firewall: matches!(host_status.firewall, Firewall::Ok),
                    status,
                    ufw_status: host_status.ufw_status,
                    distribution: host_status.distribution,
                    uname: host_status.uname,
                    data_encrypted: host_status.data_encrypted,
                    root_encrypted: host_status.root_encrypted,
                },
            });
        } else {
            resources.push(VantaHostResource {
                display_name: row.name,
                unique_id: row.id.to_string(),
                external_url,
                custom_properties: VantaHostResourceCustom {
                    category: row.category,
                    firewall: false,
                    status,
                    ufw_status: None,
                    distribution: None,
                    uname: None,
                    data_encrypted: None,
                    root_encrypted: None,
                },
            });
        }
    }

    let client = reqwest::Client::new();

    let r = client
        .post("https://api.vanta.com/oauth/token")
        .json(&VantaTokenRequest {
            client_id,
            client_secret,
            scope: "connectors.self:write-resource",
            grant_type: "client_credentials",
        })
        .build()
        .context("Failed building token request")?;

    let r = client
        .execute(r)
        .await
        .context("Faild executing token request")?;

    if let Err(e) = r.error_for_status_ref() {
        let text = r.text().await?;
        return Err(e).context(format!("Faild executing token request: {text}"));
    }

    let token: VantaTokenResponse = r.json().await.context("Failed getting token")?;

    let resources = VantaHostResources {
        resource_id: resource_id.clone(),
        resources,
    };

    let request = client
        .put("https://api.vanta.com/v1/resources/custom_resource")
        .bearer_auth(token.access_token)
        .json(&resources)
        .build()
        .context("Failed building hosts request")?;

    let r = client
        .execute(request)
        .await
        .context("Failed executing hosts request")?;

    if let Err(e) = r.error_for_status_ref() {
        let text = r.text().await?;
        return Err(e).context(format!("Failed executing hosts request: {text}"));
    }

    let response: VantaSyncResponse = r
        .json()
        .await
        .context("Failed deserializing sync response")?;

    if !response.success {
        bail!("Failed syncing vanta hosts");
    }

    info!("Successfully synced vanta hosts");

    Ok(())
}

pub async fn run_vanta(state: Arc<State>, run_token: RunToken) -> Result<()> {
    loop {
        if let Err(e) = push_users(&state.config, &state.db).await {
            error!("Failed sending vanta users: {e:?}");
        }

        if let Err(e) = push_hosts(&state).await {
            error!("Failed sending vanta hosts: {e:?}");
        }

        if cancelable(
            &run_token,
            tokio::time::sleep(Duration::from_secs(60 * 60 * 6)),
        )
        .await
        .is_err()
        {
            break;
        }
    }
    Ok(())
}
