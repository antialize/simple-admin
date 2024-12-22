use anyhow::bail;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

use crate::page_types::IPage;

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

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub enum DeploymentStatus {
    Done = 0,
    BuildingTree = 1,
    InvilidTree = 2,
    ComputingChanges = 3,
    ReviewChanges = 4,
    Deploying = 5,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
pub enum DeploymentObjectStatus {
    Normal = 0,
    Deplying = 1,
    Success = 2,
    Failure = 3,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
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
    pub r#type: i64,
    pub category: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDeploymentTrigger {
    type_id: i64,
    script: String,
    content: HashMap<String, serde_json::Value>,
    title: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDeploymentObject {
    pub index: i64,
    pub host: i64,
    pub host_name: String,
    pub title: String,
    pub name: String,
    pub enabled: bool,
    pub status: DeploymentObjectStatus,
    pub action: DeploymentObjectAction,
    pub script: String,
    pub prev_script: Option<String>,
    pub next_content: Option<HashMap<String, serde_json::Value>>,
    pub prev_content: Option<HashMap<String, serde_json::Value>>,
    pub id: Option<i64>,
    pub type_id: Option<i64>,
    pub type_name: String,
    pub triggers: Vec<IDeploymentTrigger>,
    pub deployment_order: i64,
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
    pub time: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(untagged)]
pub enum Ref {
    Number(f64),
    String(String),
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
    pub time: f64,
    pub url: Option<String>,
    pub dismissed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct ISetInitialState {
    pub object_names_and_ids: HashMap<String, Vec<IObjectDigest>>,
    pub messages: Vec<IMessage>,
    pub deployment_objects: Vec<IDeploymentObject>,
    pub deployment_status: DeploymentStatus,
    pub deployment_message: String,
    pub deployment_log: Vec<String>,
    pub types: HashMap<i64, IObject2<serde_json::Value>>, // TODO(jakobt) IType
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

#[derive(Serialize, Deserialize, Clone, Copy, Debug, TS, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FixedObjectType {
    Root,
    Type,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, TS, PartialEq, Eq)]
#[serde(untagged)]
pub enum ObjectType {
    Id(i64),
    Fixed(FixedObjectType),
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
    pub id: i64,
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
    pub index: i64,
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
    pub index: Option<i64>,
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

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IServiceDeployStart {
    pub r#ref: Ref,
    pub host: HostEnum,
    pub description: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
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
pub struct IDockerDeployDone {
    pub r#ref: Ref,
    pub status: bool,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
}
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "snake_case")]
pub struct IGenerateKey {
    pub r#ref: Ref,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
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
    pub time: f64,
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

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageTag {
    pub id: i64,
    pub image: String,
    pub tag: String,
    pub hash: String,
    pub time: f64,
    pub user: String,
    #[serde(default, deserialize_with = "forgiving_bool")]
    pub pin: bool,
    pub labels: HashMap<String, String>,
    pub removed: Option<f64>,
    #[serde(default)]
    pub pinned_image_tag: bool,
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
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned_image_tags: Option<Vec<IDockerListImageTagsResTag>>,
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
pub struct IDockerImageTagsCharged {
    pub changed: Vec<DockerImageTag>,
    pub removed: Vec<IDockerImageTagsChargedRemoved>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_tag_pin_changed: Option<Vec<IDockerImageTagsChargedImageTagPin>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerListDeployments {
    pub r#ref: Ref,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<i64>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct DockerDeployment {
    pub id: i64,
    pub image: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_info: Option<DockerImageTag>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    pub name: String,
    pub user: String,
    pub start: f64,
    pub end: Option<f64>,
    pub host: i64,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    pub config: String,
    pub timeout: f64,
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
    pub last_scan_time: Option<f64>,
    pub scanning: bool,
    pub full: bool,
    pub changed: Vec<ModifiedFile>,
    pub removed: Vec<f64>,
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
#[serde(tag = "type")]
pub enum IAction {
    #[serde(rename = "AddDeploymentLog")]
    AddDeploymentLog(IAddDeploymentLog),
    #[serde(rename = "AddLogLines")]
    AddLogLines(IAddLogLines),
    #[serde(rename = "AddMessage")]
    AddMessage(IAddMessage),
    #[serde(rename = "Alert")]
    Alert(IAlert),
    #[serde(rename = "AuthStatus")]
    AuthStatus(IAuthStatus),
    #[serde(rename = "CancelDeployment")]
    CancelDeployment(ICancelDeployment),
    #[serde(rename = "ClearDeploymentLog")]
    ClearDeploymentLog(IClearDeploymentLog),
    #[serde(rename = "DeleteObject")]
    DeleteObject(IDeleteObject),
    #[serde(rename = "DeployObject")]
    DeployObject(IDeployObject),
    #[serde(rename = "DockerContainerForget")]
    DockerContainerForget(IDockerContainerForget),
    #[serde(rename = "DockerDeployEnd")]
    DockerDeployDone(IDockerDeployDone),
    #[serde(rename = "DockerDeployLog")]
    DockerDeployLog(IDockerDeployLog),
    #[serde(rename = "DockerDeploymentsChanged")]
    DockerDeploymentsChanged(IDockerDeploymentsChanged),
    #[serde(rename = "DockerImageSetPin")]
    DockerImageSetPin(IDockerImageSetPin),
    #[serde(rename = "DockerImageTagsCharged")]
    DockerImageTagsCharged(IDockerImageTagsCharged),
    #[serde(rename = "DockerImageTagSetPin")]
    DockerImageTagSetPin(IDockerImageTagSetPin),
    #[serde(rename = "DockerListDeploymentHistory")]
    DockerListDeploymentHistory(IDockerListDeploymentHistory),
    #[serde(rename = "DockerListDeploymentHistoryRes")]
    DockerListDeploymentHistoryRes(IDockerListDeploymentHistoryRes),
    #[serde(rename = "DockerListDeployments")]
    DockerListDeployments(IDockerListDeployments),
    #[serde(rename = "DockerListDeploymentsRes")]
    DockerListDeploymentsRes(IDockerListDeploymentsRes),
    #[serde(rename = "DockerListImageByHash")]
    DockerListImageByHash(IDockerListImageByHash),
    #[serde(rename = "DockerListImageByHashRes")]
    DockerListImageByHashRes(IDockerListImageByHashRes),
    #[serde(rename = "DockerListImageTagHistory")]
    DockerListImageTagHistory(IDockerListImageTagHistory),
    #[serde(rename = "DockerListImageTagHistoryRes")]
    DockerListImageTagHistoryRes(IDockerListImageTagHistoryRes),
    #[serde(rename = "DockerListImageTags")]
    DockerListImageTags(IDockerListImageTags),
    #[serde(rename = "DockerListImageTagsRes")]
    DockerListImageTagsRes(IDockerListImageTagsRes),
    #[serde(rename = "EndLog")]
    EndLog(IEndLog),
    #[serde(rename = "FetchObject")]
    FetchObject(IFetchObject),
    #[serde(rename = "GenerateKey")]
    GenerateKey(IGenerateKey),
    #[serde(rename = "GenerateKeyRes")]
    GenerateKeyRes(IGenerateKeyRes),
    #[serde(rename = "GetObjectHistory")]
    GetObjectHistory(IGetObjectHistory),
    #[serde(rename = "GetObjectHistoryRes")]
    GetObjectHistoryRes(IGetObjectHistoryRes),
    #[serde(rename = "GetObjectId")]
    GetObjectId(IGetObjectId),
    #[serde(rename = "GetObjectIdRes")]
    GetObjectIdRes(IGetObjectIdRes),
    #[serde(rename = "HostDown")]
    HostDown(IHostDown),
    #[serde(rename = "HostUp")]
    HostUp(IHostUp),
    #[serde(rename = "Login")]
    Login(ILogin),
    #[serde(rename = "LogOut")]
    Logout(ILogout),
    #[serde(rename = "MessageTextRep")]
    MessageTextRep(IMessageTextRepAction),
    #[serde(rename = "MessageTextReq")]
    MessageTextReq(IMessageTextReqAction),
    #[serde(rename = "ModifiedFilesChanged")]
    ModifiedFilesChanged(IModifiedFilesChanged),
    #[serde(rename = "ModifiedFilesList")]
    ModifiedFilesList(IModifiedFilesList),
    #[serde(rename = "ModifiedFilesResolve")]
    ModifiedFilesResolve(IModifiedFilesResolve),
    #[serde(rename = "ModifiedFilesScan")]
    ModifiedFilesScan(IModifiedFilesScan),
    #[serde(rename = "ObjectChanged")]
    ObjectChanged(IObjectChanged),
    #[serde(rename = "RequestAuthStatus")]
    RequestAuthStatus(IRequestAuthStatus),
    #[serde(rename = "RequestInitialState")]
    RequestInitialState(IRequestInitialState),
    #[serde(rename = "ResetServerState")]
    ResetServerState(IResetServerState),
    #[serde(rename = "SaveObject")]
    SaveObject(ISaveObject),
    #[serde(rename = "Search")]
    Search(ISearch),
    #[serde(rename = "SearchRes")]
    SearchRes(ISearchRes),
    #[serde(rename = "ServiceDeployStart")]
    ServiceDeployStart(IServiceDeployStart),
    #[serde(rename = "ServiceRedeployStart")]
    ServiceRedeployStart(IServiceRedeployStart),
    #[serde(rename = "SetDeploymentMessage")]
    SetDeploymentMessage(ISetDeploymentMessage),
    #[serde(rename = "SetDeploymentObjects")]
    SetDeploymentObjects(ISetDeploymentObjects),
    #[serde(rename = "SetDeploymentObjectStatus")]
    SetDeploymentObjectStatus(ISetDeploymentObjectStatus),
    #[serde(rename = "SetDeploymentStatus")]
    SetDeploymentStatus(ISetDeploymentStatus),
    #[serde(rename = "SetInitialState")]
    SetInitialState(ISetInitialState),
    #[serde(rename = "SetMessageDismissed")]
    SetMessagesDismissed(ISetMessagesDismissed),
    #[serde(rename = "SetPage")]
    SetPage(ISetPageAction),
    #[serde(rename = "StartDeployment")]
    StartDeployment(IStartDeployment),
    #[serde(rename = "StartLog")]
    StartLog(IStartLog),
    #[serde(rename = "StatValueChanges")]
    StatValueChanges(IStatValueChanges),
    #[serde(rename = "StopDeployment")]
    StopDeployment(IStopDeployment),
    #[serde(rename = "SubscribeStatValues")]
    SubscribeStatValues(ISubscribeStatValues),
    #[serde(rename = "ToggleDeploymentObject")]
    ToggleDeploymentObject(IToggleDeploymentObject),
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
    }
}
