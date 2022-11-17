use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::{
    dyn_format::{FormatArg, GetFmtArgDict, RelTime},
    finite_float::FiniteF64,
};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub message: Option<String>,
    pub auth: bool,
    pub user: Option<String>,
    pub pwd: bool,
    pub otp: bool,
    pub admin: bool,
    #[serde(default)]
    pub docker_pull: bool,
    #[serde(default)]
    pub docker_push: bool,
    #[serde(default)]
    pub docker_deploy: bool,
    #[serde(default)]
    pub session: Option<String>,
    #[serde(default)]
    pub sslname: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct GenerateKeyRes {
    pub r#ref: u64,
    pub key: String,
    pub crt: String,
    pub ca_pem: String,
    #[serde(default)]
    pub ssh_host_ca: Option<String>,
    #[serde(default)]
    pub ssh_crt: Option<String>,
}

fn forgiving_bool<'de, D: serde::Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    Ok(match serde_json::Value::deserialize(d)? {
        serde_json::Value::Null => false,
        serde_json::Value::Bool(v) => v,
        serde_json::Value::Number(v) => v.as_f64() != Some(0.0),
        serde_json::Value::String(v) => !v.is_empty(),
        serde_json::Value::Array(v) => !v.is_empty(),
        serde_json::Value::Object(v) => !v.is_empty(),
    })
}

#[derive(Deserialize, Serialize, PartialEq, Eq, Clone)]
pub struct ImageInfo {
    pub id: u64,
    pub image: String,
    pub hash: String,
    pub tag: String,
    pub user: String,
    pub time: FiniteF64,
    #[serde(default, deserialize_with = "forgiving_bool")]
    pub pin: bool,
    pub labels: BTreeMap<String, String>,
    pub removed: Option<FiniteF64>,
    #[serde(default)]
    pub pinned_image_tag: bool,
}

impl GetFmtArgDict for ImageInfo {
    fn get_fmt_arg(&self, name: &str) -> FormatArg<'_> {
        match name {
            "id" => FormatArg::Number(self.id),
            "image" => FormatArg::String(&self.image),
            "hash" => FormatArg::String(&self.hash),
            "tag" => FormatArg::String(&self.tag),
            "user" => FormatArg::String(&self.user),
            "time" => FormatArg::Float(self.time),
            "pin" => FormatArg::Bool(self.pin),
            "removed" => match self.removed {
                Some(v) => FormatArg::Float(v),
                None => FormatArg::None,
            },
            "labels" => FormatArg::Dict(&self.labels),
            "rel_time" => FormatArg::RelTime(RelTime(self.time)),
            "pin_suffix" => FormatArg::String(if self.pinned_image_tag {
                "pinned by tag"
            } else {
                ""
            }),
            _ => FormatArg::Missing,
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct DockerPinnedImageTag {
    pub image: String,
    pub tag: String,
}

pub enum Type {
    Id(u64),
    Root,
    Type,
}

impl Serialize for Type {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Type::Id(v) => serializer.serialize_u64(*v),
            Type::Root => serializer.serialize_str("root"),
            Type::Type => serializer.serialize_str("type"),
        }
    }
}

impl<'de> Deserialize<'de> for Type {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Error;
        let value = serde_json::Value::deserialize(deserializer)?;
        match value {
            serde_json::Value::Number(n) => match n.as_u64() {
                Some(v) => Ok(Type::Id(v)),
                None => Err(D::Error::custom("Expected uint or root".to_string())),
            },
            serde_json::Value::String(v) if v == "root" => Ok(Type::Root),
            serde_json::Value::String(v) if v == "type" => Ok(Type::Type),
            v => Err(D::Error::custom(format!(
                "expected uint or root found {:?}",
                v
            ))),
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct StateNameAndId {
    pub name: Option<String>,
    pub id: u64,
    pub r#type: Option<Type>,
    pub category: Option<String>,
    pub comment: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub object_names_and_ids: HashMap<String, Vec<StateNameAndId>>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerListImageTagsRes {
    pub r#ref: u64,
    pub tags: Vec<ImageInfo>,
    pub pinned_image_tags: Vec<DockerPinnedImageTag>,
}

#[derive(Deserialize, Serialize)]
pub struct DockerListImageByHashRes {
    pub r#ref: u64,
    pub tags: HashMap<String, ImageInfo>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogOut {
    pub forget_pwd: bool,
    pub forget_otp: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Deployment {
    pub config: Option<String>,
    pub end: Option<FiniteF64>,
    pub hash: String,
    pub host: u64,
    pub id: u64,
    pub image: String,
    pub image_info: ImageInfo,
    pub name: String,
    pub start: FiniteF64,
    pub stop_timeout: Option<FiniteF64>,
    pub timeout: Option<FiniteF64>,
    pub user: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerDeployStart {
    pub r#ref: u64,
    pub host: String,
    pub image: String,
    pub config: Option<String>,
    pub restore_on_failure: bool,
    pub container: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDeployStart {
    pub r#ref: u64,
    pub host: String,
    pub image: Option<String>,
    /// Description in yaml template form
    pub description: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceRedeployStart {
    pub r#ref: u64,
    pub deployment_id: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum Message {
    RequestAuthStatus {
        session: String,
    },
    AuthStatus(AuthStatus),
    Login {
        user: String,
        pwd: String,
        otp: Option<String>,
    },
    GenerateKey {
        r#ref: u64,
        ssh_public_key: Option<String>,
    },
    GenerateKeyRes(GenerateKeyRes),
    DockerListImageByHash {
        r#ref: u64,
        hash: Vec<String>,
    },
    DockerListImageTags {
        r#ref: u64,
    },
    DockerListImageTagsRes(DockerListImageTagsRes),
    DockerListImageByHashRes(DockerListImageByHashRes),
    LogOut(LogOut),
    RequestInitialState {},
    SetInitialState(State),
    DockerListDeployments {
        r#ref: u64,
        host: Option<u64>,
        image: Option<String>,
    },
    DockerListDeploymentHistory {
        r#ref: u64,
        host: u64,
        name: String,
    },
    DockerListDeploymentsRes {
        r#ref: u64,
        deployments: Vec<Deployment>,
    },
    DockerListDeploymentHistoryRes {
        r#ref: u64,
        deployments: Vec<Deployment>,
    },
    DockerDeployStart(DockerDeployStart),
    ServiceDeployStart(ServiceDeployStart),
    ServiceRedeployStart(ServiceRedeployStart),
    DockerDeployLog {
        r#ref: u64,
        message: String,
    },
    DockerDeployEnd {
        r#ref: u64,
        message: String,
        status: bool,
    },
    DockerListImageTagsChanged {
        removed: Vec<String>,
        changed: Vec<ImageInfo>,
    },
    HostDown {
        id: u64,
    },
    HostUp {
        id: u64,
    },
    Alert {
        message: String,
        title: String,
    },
    ModifiedFilesChanged {
        //lastScanTime: Option<f64>,
        scanning: bool,
        full: bool,
        // changed: ModifiedFile[];
        // removed: number[];
    },
}
