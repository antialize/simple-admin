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

#[derive(Debug, Serialize, Deserialize, Default)]
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
pub struct CommandSpawnMessage {
    pub id: u64,
    pub command_id: u64,
    pub program: String,
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    pub forward_stdin: bool,
    pub forward_stdout: bool,
    pub forward_stderr: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HostClientMessage {
    RunInstant(RunInstantMessage),
    RunScript(RunScriptMessage),
    Ping {
        id: u64,
    },
    Kill {
        id: u64,
    },
    Data(DataMessage),
    DeployService(DeployServiceMessage),
    ReadFile {
        id: u64,
        path: String,
    },
    WriteFile {
        id: u64,
        path: String,
        // Base64
        content: String,
        mode: Option<u32>,
    },
    SocketConnect {
        id: u64,
        socket_id: u64,
        dst: String,
    },
    SocketClose {
        id: u64,
        socket_id: u64,
    },
    SocketSend {
        id: u64,
        socket_id: u64,
        data: Option<String>,
    },
    CommandSpawn(CommandSpawnMessage),
    CommandStdin {
        id: u64,
        command_id: u64,
        data: Option<String>,
    },
    CommandSignal {
        id: u64,
        command_id: u64,
        signal: i32,
    },
}

impl HostClientMessage {
    pub fn job_id(&self) -> Option<u64> {
        match self {
            HostClientMessage::Kill { id } => Some(*id),
            HostClientMessage::Data(data_message) => Some(data_message.id),
            HostClientMessage::DeployService(deploy_service_message) => {
                Some(deploy_service_message.id)
            }
            HostClientMessage::RunInstant(m) => Some(m.id),
            HostClientMessage::RunScript(m) => Some(m.id),
            HostClientMessage::Ping { .. } => None,
            HostClientMessage::ReadFile { id, .. } => Some(*id),
            HostClientMessage::WriteFile { id, .. } => Some(*id),
            HostClientMessage::SocketConnect { id, .. } => Some(*id),
            HostClientMessage::SocketClose { id, .. } => Some(*id),
            HostClientMessage::SocketSend { id, .. } => Some(*id),
            HostClientMessage::CommandSpawn(msg) => Some(msg.id),
            HostClientMessage::CommandStdin { id, .. } => Some(*id),
            HostClientMessage::CommandSignal { id, .. } => Some(*id),
        }
    }

    pub fn tag(&self) -> &'static str {
        match self {
            HostClientMessage::RunInstant(_) => "run_instant",
            HostClientMessage::RunScript(_) => "run_script",
            HostClientMessage::Ping { .. } => "ping",
            HostClientMessage::Kill { .. } => "pong",
            HostClientMessage::Data(_) => "data",
            HostClientMessage::DeployService(_) => "deploy_service",
            HostClientMessage::ReadFile { .. } => "read_file",
            HostClientMessage::WriteFile { .. } => "read_file",
            HostClientMessage::SocketConnect { .. } => "socket_connect",
            HostClientMessage::SocketClose { .. } => "socket_close",
            HostClientMessage::SocketSend { .. } => "socket_send",
            HostClientMessage::CommandSpawn(_) => "command_run",
            HostClientMessage::CommandStdin { .. } => "command_stdin",
            HostClientMessage::CommandSignal { .. } => "command_signal",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientHostMessage {
    Auth {
        hostname: String,
        password: String,
    },
    Pong {
        id: u64,
    },
    Failure(FailureMessage),
    Success(SuccessMessage),
    Data(DataMessage),
    ReadFileResult {
        id: u64,
        // Base64 encoded
        content: String,
    },
    SocketRecv {
        socket_id: u64,
        // Base64 encoded
        data: Option<String>,
    },
    CommandStdout {
        command_id: u64,
        // Base64 encoded
        data: Option<String>,
    },
    CommandStderr {
        command_id: u64,
        // Base64 encoded
        data: Option<String>,
    },
    CommandFinished {
        command_id: u64,
        code: i32,
        signal: Option<i32>,
    },
}

impl ClientHostMessage {
    pub fn job_id(&self) -> Option<u64> {
        match self {
            ClientHostMessage::Failure(failure_message) => Some(failure_message.id),
            ClientHostMessage::Success(success_message) => Some(success_message.id),
            ClientHostMessage::Data(data_message) => Some(data_message.id),
            ClientHostMessage::Auth { .. } | ClientHostMessage::Pong { .. } => None,
            ClientHostMessage::ReadFileResult { id, .. } => Some(*id),
            ClientHostMessage::SocketRecv { .. } => None,
            ClientHostMessage::CommandStdout { .. } => None,
            ClientHostMessage::CommandStderr { .. } => None,
            ClientHostMessage::CommandFinished { .. } => None,
        }
    }

    pub fn tag(&self) -> &'static str {
        match self {
            ClientHostMessage::Auth { .. } => "auth",
            ClientHostMessage::Pong { .. } => "pong",
            ClientHostMessage::Failure(_) => "failure",
            ClientHostMessage::Success(_) => "success",
            ClientHostMessage::Data(_) => "data",
            ClientHostMessage::ReadFileResult { .. } => "read_file_result",
            ClientHostMessage::SocketRecv { .. } => "socket_recv",
            ClientHostMessage::CommandStdout { .. } => "command_stdout",
            ClientHostMessage::CommandStderr { .. } => "command_stderr",
            ClientHostMessage::CommandFinished { .. } => "command_finished",
        }
    }
}
