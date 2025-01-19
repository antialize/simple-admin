use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum RunInstantStdinOutputType {
    Text,
    Base64,
    Json,
    #[serde(rename = "utf-8")]
    Utf8,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunInstantStdinType {
    None,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunInstantMessage {
    pub id: u64,
    pub name: String,
    pub interperter: String,
    pub content: String,
    pub args: Vec<String>,
    pub output_type: RunInstantStdinOutputType,
    pub stdin_type: RunInstantStdinType,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum RunScriptStdinType {
    None,
    Binary,
    GivenJson,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum RunScriptOutType {
    None,
    Binary,
    Text,
    BlockedJson,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunScriptMessage {
    pub id: u64,
    pub name: String,
    pub interperter: String,
    pub content: String,
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_json: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stdin_type: Option<RunScriptStdinType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stdout_type: Option<RunScriptOutType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stderr_type: Option<RunScriptOutType>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum DataSource {
    Stdin,
    Stdout,
    Stderr,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DataMessage {
    pub id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<DataSource>,
    pub data: serde_json::Value,
    pub eof: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum FailureType {
    Script,
    UnknownTask,
    Exception,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct FailureMessage {
    pub id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure_type: Option<FailureType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SuccessMessage {
    pub id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeployServiceMessage {
    pub id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub docker_auth: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub extra_env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Auth { hostname: String, password: String },
    RunInstant(RunInstantMessage),
    RunScript(RunScriptMessage),
    Ping { id: u64 },
    Pong { id: u64 },
    Failure(FailureMessage),
    Success(SuccessMessage),
    Kill { id: u64 },
    Data(DataMessage),
    DeployService(DeployServiceMessage),
}

impl ClientMessage {
    #[allow(dead_code)]
    pub fn job_id(&self) -> Option<u64> {
        match self {
            ClientMessage::Failure(failure_message) => Some(failure_message.id),
            ClientMessage::Success(success_message) => Some(success_message.id),
            ClientMessage::Kill { id } => Some(*id),
            ClientMessage::Data(data_message) => Some(data_message.id),
            ClientMessage::DeployService(deploy_service_message) => Some(deploy_service_message.id),
            ClientMessage::RunInstant(m) => Some(m.id),
            ClientMessage::RunScript(m) => Some(m.id),
            ClientMessage::Auth { .. }
            | ClientMessage::Ping { .. }
            | ClientMessage::Pong { .. } => None,
        }
    }
}
