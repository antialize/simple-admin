use anyhow::bail;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::collections::HashMap;
use std::str::FromStr;
use ts_rs::TS;

use crate::{
    finite_float::{FiniteF64, ToFinite},
    page_types::IPage,
    type_types::ValueMap,
};

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

#[derive(Serialize_repr, Deserialize_repr, Clone, Debug, PartialEq, Eq, TS)]
#[repr(u8)]
pub enum DeploymentStatus {
    Done = 0,
    BuildingTree = 1,
    InvilidTree = 2,
    ComputingChanges = 3,
    ReviewChanges = 4,
    Deploying = 5,
}

#[derive(Serialize_repr, Deserialize_repr, Clone, Debug, TS)]
#[repr(u8)]
pub enum DeploymentObjectStatus {
    Normal = 0,
    Deplying = 1,
    Success = 2,
    Failure = 3,
}

#[derive(Serialize_repr, Deserialize_repr, Clone, Debug, TS)]
#[repr(u8)]
pub enum DeploymentObjectAction {
    Add = 0,
    Modify = 1,
    Remove = 2,
    Trigger = 3,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IObjectDigest {
    pub name: String,
    pub comment: String,
    pub id: i64,
    pub r#type: ObjectType,
    pub category: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDeploymentTrigger {
    pub type_id: i64,
    pub script: String,
    pub content: ValueMap,
    pub title: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDeploymentObject {
    pub index: usize,
    pub host: i64,
    pub host_name: String,
    pub title: String,
    pub name: String,
    pub enabled: bool,
    pub status: DeploymentObjectStatus,
    pub action: DeploymentObjectAction,
    pub script: String,
    pub prev_script: Option<String>,
    pub next_content: Option<ValueMap>,
    pub prev_content: Option<ValueMap>,
    pub id: Option<i64>,
    pub type_id: i64,
    pub type_name: String,
    pub triggers: Vec<IDeploymentTrigger>,
    pub deployment_order: i64,
}

pub struct ObjectRow {
    pub id: i64,
    pub r#type: i64,
    pub name: String,
    pub category: Option<String>,
    pub content: String,
    pub version: i64,
    pub comment: String,
    pub author: Option<String>,
    pub time: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IObject2<T: Clone> {
    pub id: i64,
    pub r#type: ObjectType,
    pub name: String,
    pub category: String,
    pub content: T,
    pub version: Option<i64>,
    pub comment: String,
    pub author: Option<String>,
    pub time: Option<FiniteF64>,
}

impl<T: Clone + DeserializeOwned> TryFrom<ObjectRow> for IObject2<T> {
    type Error = anyhow::Error;
    fn try_from(row: ObjectRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            version: Some(row.version),
            r#type: row.r#type.try_into()?,
            name: row.name,
            content: serde_json::from_str(&row.content)?,
            category: row.category.unwrap_or_default(),
            comment: row.comment,
            time: Some(row.time.parse()?),
            author: row.author,
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq, Eq)]
#[serde(untagged)]
pub enum Ref {
    Number(i64),
    String(String),
}

impl Ref {
    pub fn random() -> Ref {
        use rand::Rng;
        Ref::Number(rand::thread_rng().gen_range(0..(1 << 48)))
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IFetchObject {
    pub id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IObjectChanged {
    pub id: i64,
    pub object: Vec<IObject2<serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISetPageAction {
    pub page: IPage,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IMessage {
    pub id: i64,
    pub host: Option<i64>,
    pub r#type: String,
    pub subtype: Option<String>,
    pub message: String,
    pub full_message: bool,
    pub time: FiniteF64,
    pub url: Option<String>,
    pub dismissed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISetInitialState {
    pub object_names_and_ids: HashMap<ObjectType, Vec<IObjectDigest>>,
    pub messages: Vec<IMessage>,
    pub deployment_objects: Vec<IDeploymentObject>,
    pub deployment_status: DeploymentStatus,
    pub deployment_message: String,
    pub deployment_log: Vec<String>,
    pub types: HashMap<i64, IObject2<ValueMap>>, // TODO(jakobt) IType
    pub hosts_up: Vec<i64>,
    pub used_by: Vec<(i64, i64)>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub enum IStartLogLogType {
    File,
    Dmesg,
    Journal,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IStartLog {
    pub host: i64,
    pub logtype: IStartLogLogType,
    pub id: i64,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IEndLog {
    pub host: i64,
    pub id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IAddLogLines {
    pub id: i64,
    pub lines: Vec<String>,
}
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IMessageTextReqAction {
    pub id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IMessageTextRepAction {
    pub id: i64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IAddMessage {
    pub message: IMessage,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISetMessagesDismissed {
    pub ids: Vec<i64>,
    pub dismissed: bool,
    pub source: ISource,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISaveObject {
    pub id: i64,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obj: Option<IObject2<serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISearch {
    pub r#ref: Ref,
    pub pattern: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, TS, Eq, PartialEq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum FixedObjectType {
    Root,
    Type,
}

#[derive(Serialize, Clone, Copy, Debug, TS, PartialEq, Eq, Hash)]
#[serde(untagged)]
pub enum ObjectType {
    Id(i64),
    Fixed(FixedObjectType),
}

impl<'de> Deserialize<'de> for ObjectType {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Error;

        let value = serde_json::Value::deserialize(deserializer)?;

        match value {
            serde_json::Value::Number(num) => {
                let Some(id) = num.as_i64() else {
                    return Err(D::Error::custom("unsupported number for ObjectType"));
                };
                Ok(ObjectType::Id(id))
            }
            serde_json::Value::String(s) => {
                if let Ok(id) = i64::from_str(&s) {
                    return Ok(ObjectType::Id(id));
                }
                let Ok(fixed) =
                    serde_json::from_value::<FixedObjectType>(serde_json::Value::String(s))
                else {
                    return Err(D::Error::custom("unsupported string for ObjectType"));
                };
                Ok(ObjectType::Fixed(fixed))
            }
            _ => Err(D::Error::custom("unsupported type for ObjectType")),
        }
    }
}

impl From<ObjectType> for i64 {
    fn from(value: ObjectType) -> Self {
        match value {
            ObjectType::Id(v) => v,
            ObjectType::Fixed(FixedObjectType::Root) => -1,
            ObjectType::Fixed(FixedObjectType::Type) => -2,
        }
    }
}

impl TryFrom<i64> for ObjectType {
    type Error = anyhow::Error;

    fn try_from(value: i64) -> Result<Self, Self::Error> {
        match value {
            -1 => Ok(ObjectType::Fixed(FixedObjectType::Root)),
            -2 => Ok(ObjectType::Fixed(FixedObjectType::Type)),
            i if i > 0 => Ok(ObjectType::Id(i)),
            _ => bail!("Invalid object type"),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISearchResObject {
    pub r#type: ObjectType,
    pub id: i64,
    pub version: i64,
    pub name: String,
    pub comment: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISearchRes {
    pub r#ref: Ref,
    pub objects: Vec<ISearchResObject>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IHostDown {
    pub id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IHostUp {
    pub id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDeployObject {
    pub id: Option<i64>,
    pub redeploy: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDeleteObject {
    pub id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISetDeploymentStatus {
    pub status: DeploymentStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IResetServerState {
    pub host: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISetDeploymentMessage {
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISetDeploymentObjects {
    pub objects: Vec<IDeploymentObject>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IClearDeploymentLog {}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IAddDeploymentLog {
    pub bytes: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISetDeploymentObjectStatus {
    pub index: usize,
    pub status: DeploymentObjectStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub enum ISource {
    Server,
    Webclient,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IToggleDeploymentObject {
    pub index: Option<usize>,
    pub enabled: bool,
    pub source: ISource,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IStopDeployment {}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IStartDeployment {}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct ICancelDeployment {}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IAlert {
    pub message: String,
    pub title: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IRequestAuthStatus {
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub session: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct IAuthStatus {
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
    #[serde(default)]
    pub auth_days: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ILogin {
    pub user: String,
    pub pwd: String,
    pub otp: Option<String>,
}
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ILogout {
    pub forget_pwd: bool,
    pub forget_otp: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IRequestInitialState {}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISubscribeStatValues {
    pub target: i64,
    pub host: i64,
    pub values: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IStatValueChanges {
    pub target: i64,
    pub host: i64,
    pub name: String,
    pub value: i64,
    pub level: i64,
    pub index: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(untagged)]
pub enum HostEnum {
    Id(i64),
    Name(String),
}

impl std::fmt::Display for HostEnum {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HostEnum::Name(v) => f.write_str(v),
            HostEnum::Id(v) => write!(f, "{v}"),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IServiceDeployStart {
    pub r#ref: Ref,
    pub host: HostEnum,
    pub description: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub image: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IServiceRedeployStart {
    pub r#ref: Ref,
    pub deployment_id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerDeployLog {
    pub r#ref: Ref,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerDeployEnd {
    pub r#ref: Ref,
    pub status: bool,
    pub message: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub id: Option<i64>,
}
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "snake_case")]
pub struct IGenerateKey {
    pub r#ref: Ref,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub ssh_public_key: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "snake_case")]
pub struct IGenerateKeyRes {
    pub r#ref: Ref,
    pub ca_pem: String,
    pub key: String,
    pub crt: String,
    pub ssh_host_ca: Option<String>,
    pub ssh_crt: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IGetObjectId {
    pub r#ref: Ref,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IGetObjectIdRes {
    pub r#ref: Ref,
    pub id: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IGetObjectHistory {
    pub r#ref: Ref,
    pub id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IGetObjectHistoryResHistory {
    pub version: i64,
    pub time: FiniteF64,
    pub author: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IGetObjectHistoryRes {
    pub r#ref: Ref,
    pub id: i64,
    pub history: Vec<IGetObjectHistoryResHistory>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListImageTags {
    pub r#ref: Ref,
}

pub struct DockerImageTagRow {
    pub id: i64,
    pub hash: String,
    pub time: f64,
    pub project: String,
    pub user: String,
    pub tag: String,
    pub pin: bool,
    pub labels: Option<String>,
    pub removed: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageTag {
    pub id: i64,
    pub image: String,
    pub tag: String,
    pub hash: String,
    pub time: FiniteF64,
    pub user: String,
    #[serde(default, deserialize_with = "forgiving_bool")]
    pub pin: bool,
    pub labels: HashMap<String, String>,
    pub removed: Option<FiniteF64>,
    #[serde(default)]
    pub pinned_image_tag: bool,
}

impl TryFrom<DockerImageTagRow> for DockerImageTag {
    type Error = anyhow::Error;
    fn try_from(row: DockerImageTagRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            image: row.project,
            tag: row.tag,
            hash: row.hash,
            time: row.time.to_finite()?,
            user: row.user,
            pin: row.pin,
            labels: serde_json::from_str(row.labels.as_deref().unwrap_or("{}"))?,
            removed: row.removed.to_finite()?,
            pinned_image_tag: false,
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListImageTagsResTag {
    pub image: String,
    pub tag: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListImageTagsRes {
    pub r#ref: Ref,
    pub tags: Vec<DockerImageTag>,
    pub pinned_image_tags: Vec<IDockerListImageTagsResTag>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerImageTagsChargedRemoved {
    pub image: String,
    pub hash: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerImageTagsChargedImageTagPin {
    pub image: String,
    pub tag: String,
    pub pin: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListImageTagsCharged {
    pub changed: Vec<DockerImageTag>,
    pub removed: Vec<IDockerImageTagsChargedRemoved>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub image_tag_pin_changed: Option<Vec<IDockerImageTagsChargedImageTagPin>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListDeployments {
    pub r#ref: Ref,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub host: Option<i64>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub image: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct DockerDeployment {
    pub id: i64,
    pub image: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub image_info: Option<DockerImageTag>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hash: Option<String>,
    pub name: String,
    pub user: String,
    pub start: FiniteF64,
    pub end: Option<FiniteF64>,
    pub host: i64,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub state: Option<String>,
    pub config: String,
    pub timeout: FiniteF64,
    pub use_podman: bool,
    pub service: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListDeploymentsRes {
    pub r#ref: Ref,
    pub deployments: Vec<DockerDeployment>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerDeploymentsChangedRemoved {
    pub host: i64,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerDeploymentsChanged {
    pub changed: Vec<DockerDeployment>,
    pub removed: Vec<IDockerDeploymentsChangedRemoved>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerContainerForget {
    pub host: i64,
    pub container: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListImageByHash {
    pub hash: Vec<String>,
    pub r#ref: Ref,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListImageByHashRes {
    pub r#ref: Ref,
    pub tags: HashMap<String, DockerImageTag>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerImageSetPin {
    pub id: i64,
    pub pin: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerImageTagSetPin {
    pub image: String,
    pub tag: String,
    pub pin: bool,
}
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListDeploymentHistory {
    pub host: i64,
    pub name: String,
    pub r#ref: Ref,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListDeploymentHistoryRes {
    pub host: i64,
    pub name: String,
    pub r#ref: Ref,
    pub deployments: Vec<DockerDeployment>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListImageTagHistory {
    pub image: String,
    pub tag: String,
    pub r#ref: Ref,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListImageTagHistoryRes {
    pub image: String,
    pub tag: String,
    pub r#ref: Ref,
    pub images: Vec<DockerImageTag>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModifiedFile {
    pub id: i64,
    pub r#type: i64,
    pub host: i64,
    pub object: i64,
    pub deployed: String,
    pub actual: String,
    pub current: Option<String>,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IModifiedFilesScan {}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IModifiedFilesList {}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IModifiedFilesChanged {
    pub last_scan_time: Option<FiniteF64>,
    pub scanning: bool,
    pub full: bool,
    pub changed: Vec<ModifiedFile>,
    pub removed: Vec<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub enum IModifiedFilesResolveAction {
    Redeploy,
    UpdateCurrent,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IModifiedFilesResolve {
    pub id: i64,
    pub action: IModifiedFilesResolveAction,
    pub new_current: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IDebug {}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IRunCommand {
    pub id: i64,
    pub host: String,
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IRunCommandTerminate {
    pub id: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IRunCommandOutput {
    pub id: i64,
    // Base 64 encoded
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub stdout: Option<String>,
    // Base 64 encoded
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub stderr: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub struct IRunCommandFinished {
    pub id: i64,
    pub status: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(tag = "type", rename_all = "PascalCase")]
pub enum IServerAction {
    AddDeploymentLog(IAddDeploymentLog),
    AddMessage(IAddMessage),
    Alert(IAlert),
    AuthStatus(IAuthStatus),
    ClearDeploymentLog(IClearDeploymentLog),
    DockerDeployEnd(IDockerDeployEnd),
    DockerDeployLog(IDockerDeployLog),
    DockerDeploymentsChanged(IDockerDeploymentsChanged),
    DockerListDeploymentHistoryRes(IDockerListDeploymentHistoryRes),
    DockerListDeploymentsRes(IDockerListDeploymentsRes),
    DockerListImageByHashRes(IDockerListImageByHashRes),
    DockerListImageTagHistoryRes(IDockerListImageTagHistoryRes),
    DockerListImageTagsChanged(IDockerListImageTagsCharged),
    DockerListImageTagsRes(IDockerListImageTagsRes),
    GenerateKeyRes(IGenerateKeyRes),
    GetObjectHistoryRes(IGetObjectHistoryRes),
    GetObjectIdRes(IGetObjectIdRes),
    HostDown(IHostDown),
    HostUp(IHostUp),
    MessageTextRep(IMessageTextRepAction),
    ModifiedFilesChanged(IModifiedFilesChanged),
    ObjectChanged(IObjectChanged),
    RunCommandFinished(IRunCommandFinished),
    RunCommandOutput(IRunCommandOutput),
    SearchRes(ISearchRes),
    SetDeploymentMessage(ISetDeploymentMessage),
    SetDeploymentObjects(ISetDeploymentObjects),
    SetDeploymentObjectStatus(ISetDeploymentObjectStatus),
    SetDeploymentStatus(ISetDeploymentStatus),
    SetInitialState(ISetInitialState),
    SetMessagesDismissed(ISetMessagesDismissed),
    SetPage(ISetPageAction),
    ToggleDeploymentObject(IToggleDeploymentObject),
}

impl IServerAction {
    pub fn tag(&self) -> &'static str {
        match self {
            IServerAction::AddDeploymentLog(_) => "AddDeploymentLog",
            IServerAction::AddMessage(_) => "AddMessage",
            IServerAction::Alert(_) => "Alert",
            IServerAction::AuthStatus(_) => "AuthStatus",
            IServerAction::ClearDeploymentLog(_) => "ClearDeploymentLog",
            IServerAction::DockerDeployEnd(_) => "DockerDeployEnd",
            IServerAction::DockerDeployLog(_) => "DockerDeployLog",
            IServerAction::DockerDeploymentsChanged(_) => "DockerDeploymentsChanged",
            IServerAction::DockerListDeploymentHistoryRes(_) => "DockerListDeploymentHistoryRes",
            IServerAction::DockerListDeploymentsRes(_) => "DockerListDeploymentsRes",
            IServerAction::DockerListImageByHashRes(_) => "DockerListImageByHashRes",
            IServerAction::DockerListImageTagHistoryRes(_) => "DockerListImageTagHistoryRes",
            IServerAction::DockerListImageTagsChanged(_) => "DockerListImageTagsChanged",
            IServerAction::DockerListImageTagsRes(_) => "DockerListImageTagsRes",
            IServerAction::GenerateKeyRes(_) => "GenerateKeyRes",
            IServerAction::GetObjectHistoryRes(_) => "GetObjectHistoryRes",
            IServerAction::GetObjectIdRes(_) => "GetObjectIdRes",
            IServerAction::HostDown(_) => "HostDown",
            IServerAction::HostUp(_) => "HostUp",
            IServerAction::MessageTextRep(_) => "MessageTextRep",
            IServerAction::ModifiedFilesChanged(_) => "ModifiedFilesChanged",
            IServerAction::ObjectChanged(_) => "ObjectChanged",
            IServerAction::RunCommandFinished(_) => "RunCommandFinished",
            IServerAction::RunCommandOutput(_) => "RunCommandOutput",
            IServerAction::SearchRes(_) => "SearchRes",
            IServerAction::SetDeploymentMessage(_) => "SetDeploymentMessage",
            IServerAction::SetDeploymentObjects(_) => "SetDeploymentObjects",
            IServerAction::SetDeploymentObjectStatus(_) => "SetDeploymentObjectStatus",
            IServerAction::SetDeploymentStatus(_) => "SetDeploymentStatus",
            IServerAction::SetInitialState(_) => "SetInitialState",
            IServerAction::SetMessagesDismissed(_) => "SetMessagesDismissed",
            IServerAction::SetPage(_) => "SetPage",
            IServerAction::ToggleDeploymentObject(_) => "ToggleDeploymentObject",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(tag = "type", rename_all = "PascalCase")]
pub enum IClientAction {
    CancelDeployment(ICancelDeployment),
    Debug(IDebug),
    DeleteObject(IDeleteObject),
    DeployObject(IDeployObject),
    DockerContainerForget(IDockerContainerForget),
    DockerImageSetPin(IDockerImageSetPin),
    DockerImageTagSetPin(IDockerImageTagSetPin),
    DockerListDeploymentHistory(IDockerListDeploymentHistory),
    DockerListDeployments(IDockerListDeployments),
    DockerListImageByHash(IDockerListImageByHash),
    DockerListImageTagHistory(IDockerListImageTagHistory),
    DockerListImageTags(IDockerListImageTags),
    FetchObject(IFetchObject),
    GenerateKey(IGenerateKey),
    GetObjectHistory(IGetObjectHistory),
    GetObjectId(IGetObjectId),
    Login(ILogin),
    Logout(ILogout),
    MessageTextReq(IMessageTextReqAction),
    ModifiedFilesList(IModifiedFilesList),
    ModifiedFilesResolve(IModifiedFilesResolve),
    ModifiedFilesScan(IModifiedFilesScan),
    RequestAuthStatus(IRequestAuthStatus),
    RequestInitialState(IRequestInitialState),
    ResetServerState(IResetServerState),
    RunCommand(IRunCommand),
    RunCommandTerminate(IRunCommandTerminate),
    SaveObject(ISaveObject),
    Search(ISearch),
    ServiceDeployStart(IServiceDeployStart),
    ServiceRedeployStart(IServiceRedeployStart),
    SetMessageDismissed(ISetMessagesDismissed),
    StartDeployment(IStartDeployment),
    StopDeployment(IStopDeployment),
    ToggleDeploymentObject(IToggleDeploymentObject),
}

impl IClientAction {
    pub fn tag(&self) -> &'static str {
        match self {
            IClientAction::CancelDeployment(_) => "CancelDeployment",
            IClientAction::Debug(_) => "Debug",
            IClientAction::DeleteObject(_) => "DeleteObject",
            IClientAction::DeployObject(_) => "DeployObject",
            IClientAction::DockerContainerForget(_) => "DockerContainerForget",
            IClientAction::DockerImageSetPin(_) => "DockerImageSetPin",
            IClientAction::DockerImageTagSetPin(_) => "DockerImageTagSetPin",
            IClientAction::DockerListDeploymentHistory(_) => "DockerListDeploymentHistory",
            IClientAction::DockerListDeployments(_) => "DockerListDeployments",
            IClientAction::DockerListImageByHash(_) => "DockerListImageByHash",
            IClientAction::DockerListImageTagHistory(_) => "DockerListImageTagHistory",
            IClientAction::DockerListImageTags(_) => "DockerListImageTags",
            IClientAction::FetchObject(_) => "FetchObject",
            IClientAction::GenerateKey(_) => "GenerateKey",
            IClientAction::GetObjectHistory(_) => "GetObjectHistory",
            IClientAction::GetObjectId(_) => "GetObjectId",
            IClientAction::Login(_) => "Login",
            IClientAction::Logout(_) => "Logout",
            IClientAction::MessageTextReq(_) => "MessageTextReq",
            IClientAction::ModifiedFilesList(_) => "ModifiedFilesList",
            IClientAction::ModifiedFilesResolve(_) => "ModifiedFilesResolve",
            IClientAction::ModifiedFilesScan(_) => "ModifiedFilesScan",
            IClientAction::RequestAuthStatus(_) => "RequestAuthStatus",
            IClientAction::RequestInitialState(_) => "RequestInitialState",
            IClientAction::ResetServerState(_) => "ResetServerState",
            IClientAction::RunCommand(_) => "RunCommand",
            IClientAction::RunCommandTerminate(_) => "RunCommandTerminate",
            IClientAction::SaveObject(_) => "SaveObject",
            IClientAction::Search(_) => "Search",
            IClientAction::ServiceDeployStart(_) => "ServiceDeployStart",
            IClientAction::ServiceRedeployStart(_) => "ServiceRedeployStart",
            IClientAction::SetMessageDismissed(_) => "SetMessageDismissed",
            IClientAction::StartDeployment(_) => "StartDeployment",
            IClientAction::StopDeployment(_) => "StopDeployment",
            IClientAction::ToggleDeploymentObject(_) => "ToggleDeploymentObject",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_object_type() {
        assert_eq!(
            serde_json::to_string(&ObjectType::Fixed(FixedObjectType::Root)).unwrap(),
            "\"root\""
        );
        assert_eq!(
            serde_json::to_string(&ObjectType::Fixed(FixedObjectType::Type)).unwrap(),
            "\"type\""
        );
        assert_eq!(serde_json::to_string(&ObjectType::Id(64)).unwrap(), "64");
        assert_eq!(
            ObjectType::Fixed(FixedObjectType::Root),
            serde_json::from_str("\"root\"").unwrap()
        );
        assert_eq!(
            ObjectType::Fixed(FixedObjectType::Type),
            serde_json::from_str("\"type\"").unwrap()
        );
        assert_eq!(ObjectType::Id(64), serde_json::from_str("64").unwrap());
        let hashmap: HashMap<ObjectType, Vec<IObjectDigest>> = serde_json::from_str(
            r#"{"1":[{"name":"Type","comment":"","id":1,"type":1,"category":""}]}"#,
        )
        .unwrap();
        assert_eq!(
            hashmap.keys().collect::<Vec<&ObjectType>>(),
            vec![&ObjectType::Id(1)]
        );
    }
}
