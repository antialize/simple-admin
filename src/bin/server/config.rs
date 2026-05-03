use anyhow::{Context, Result};
use serde::Deserialize;
use std::os::unix::fs::PermissionsExt;

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct ConfigUser {
    pub name: String,
    pub password: String,
}

#[allow(dead_code)]
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub users: Vec<ConfigUser>,
    pub hostname: String,
    #[serde(default)]
    pub used_images_token: Option<String>,
    #[serde(default)]
    pub status_token: Option<String>,
    #[serde(default)]
    pub vanta_client_id: Option<String>,
    #[serde(default)]
    pub vanta_client_secret: Option<String>,
    #[serde(default)]
    pub vanta_users_resource: Option<String>,
    #[serde(default)]
    pub vanta_hosts_resource: Option<String>,
}

pub fn read_config() -> Result<Config> {
    // We read secrets from config.json rather than environment variables.
    // This server runs from a git checkout on a physical host managed by systemd.
    // Passing secrets via systemd EnvironmentFile or similar would not provide
    // meaningfully better security than a file with restricted permissions, and
    // would add operational complexity. Instead we verify below that the file is
    // only readable by its owner (mode 0o600 or 0o400) so that other local users
    // and group members cannot read the tokens.
    let metadata = std::fs::metadata("config.json").context("Unable to stat config.json")?;
    let mode = metadata.permissions().mode();
    if mode & 0o077 != 0 {
        anyhow::bail!(
            "config.json is readable by group or other (mode {:04o}). \
             Please restrict permissions with: chmod 600 config.json",
            mode & 0o777
        );
    }
    let config = std::fs::read("config.json").context("Unable to read config.json")?;
    serde_json::from_slice(&config).context("Unable to parse config.json")
}
