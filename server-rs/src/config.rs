use anyhow::{Context, Result};
use serde::Deserialize;

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
    pub status_token: Option<String>,
}

pub fn read_config() -> Result<Config> {
    let config = std::fs::read("config.json").context("Unable to read config.json")?;
    serde_json::from_slice(&config).context("Unable to parse config.json")
}
