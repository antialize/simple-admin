use serde::{Deserialize, Serialize, Serializer, ser::SerializeMap};
use ts_rs::TS;

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IObjectListPage {
    pub object_type: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IObjectPage {
    pub object_type: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub version: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDeploymentDetailsPage {
    pub index: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerImageHistory {
    pub project: String,
    pub tag: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerContainerDetails {
    pub host: i64,
    pub container: String,
    pub id: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDockerContainerHistory {
    pub host: i64,
    pub container: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IModifiedFilePage {
    pub id: i64,
}

// This should be integer tagged
// see https://stackoverflow.com/questions/65575385/deserialization-of-json-with-serde-by-a-numerical-value-as-type-identifier/65576570#65576570
#[derive(Debug, Clone)]
pub enum IPage {
    Dashbord,
    Deployment,
    DeploymentDetails(IDeploymentDetailsPage),
    DockerContainerDetails(IDockerContainerDetails),
    DockerContainerHistory(IDockerContainerHistory),
    DockerServices,
    DockerImageHistory(IDockerImageHistory),
    DockerImages,
    ModifiedFile(IModifiedFilePage),
    ModifiedFiles,
    Object(IObjectPage),
    ObjectList(IObjectListPage),
    Search,
}
impl ::ts_rs::TS for IPage {
    type WithoutGenerics = IPage;
    type OptionInnerType = Self;

    fn ident() -> String {
        "IPage".to_owned()
    }
    fn name() -> String {
        "IPage".to_owned()
    }
    fn decl_concrete() -> String {
        todo!();
    }
    fn decl() -> String {
        "type IPage = | { type: PAGE_TYPE.Dashbord }\
        | ({ type: PAGE_TYPE.Deployment } \
        | { type: PAGE_TYPE.DeploymentDetails } & IDeploymentDetailsPage)\
        | ({ type: PAGE_TYPE.DockerContainerDetails } & IDockerContainerDetails)\
        | ({ type: PAGE_TYPE.DockerContainerHistory } & IDockerContainerHistory)\
        | { type: PAGE_TYPE.DockerServices }\
        | ({ type: PAGE_TYPE.DockerImageHistory } & IDockerImageHistory)\
        | { type: PAGE_TYPE.DockerImages }\
        | ({ type: PAGE_TYPE.ModifiedFile } & IModifiedFilePage)\
        | { type: PAGE_TYPE.ModifiedFiles }\
        | ({ type: PAGE_TYPE.Object } & IObjectPage)\
        | ({ type: PAGE_TYPE.ObjectList } & IObjectListPage)\
        | { type: PAGE_TYPE.Search };"
            .to_string()
    }

    fn inline() -> String {
        todo!();
    }

    fn inline_flattened() -> String {
        todo!()
    }

    fn visit_generics(_: &mut impl ::ts_rs::TypeVisitor)
    where
        Self: 'static,
    {
    }

    fn output_path() -> Option<std::path::PathBuf> {
        Some(std::path::PathBuf::from("IPage.ts"))
    }

    fn visit_dependencies(_: &mut impl ::ts_rs::TypeVisitor)
    where
        Self: 'static,
    {
    }
}

impl Serialize for IPage {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::__private::ser::FlatMapSerializer;
        let mut s = serializer.serialize_map(None)?;
        match self {
            IPage::Dashbord => {
                s.serialize_entry("type", &0)?;
            }
            IPage::Deployment => {
                s.serialize_entry("type", &1)?;
            }
            IPage::DeploymentDetails(t) => {
                s.serialize_entry("type", &2)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            IPage::DockerContainerDetails(t) => {
                s.serialize_entry("type", &3)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            IPage::DockerContainerHistory(t) => {
                s.serialize_entry("type", &4)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            IPage::DockerServices => {
                s.serialize_entry("type", &5)?;
            }
            IPage::DockerImageHistory(t) => {
                s.serialize_entry("type", &6)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            IPage::DockerImages => {
                s.serialize_entry("type", &7)?;
            }
            IPage::ModifiedFile(t) => {
                s.serialize_entry("type", &8)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            IPage::ModifiedFiles => {
                s.serialize_entry("type", &9)?;
            }
            IPage::Object(t) => {
                s.serialize_entry("type", &10)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            IPage::ObjectList(t) => {
                s.serialize_entry("type", &11)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            IPage::Search => {
                s.serialize_entry("type", &12)?;
            }
        }
        s.end()
    }
}

impl<'de> serde::Deserialize<'de> for IPage {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error>
    where
        D::Error: serde::de::Error,
    {
        use serde::de::Error;
        use serde_json::Value;
        let value = Value::deserialize(d)?;
        Ok(
            match value
                .get("type")
                .and_then(Value::as_u64)
                .ok_or_else(|| D::Error::custom("missing type"))?
            {
                0 => IPage::Dashbord,
                1 => IPage::Deployment,
                2 => IPage::DeploymentDetails(
                    Deserialize::deserialize(value).map_err(D::Error::custom)?,
                ),
                3 => IPage::DockerContainerDetails(
                    Deserialize::deserialize(value).map_err(D::Error::custom)?,
                ),
                4 => IPage::DockerContainerHistory(
                    Deserialize::deserialize(value).map_err(D::Error::custom)?,
                ),
                5 => IPage::DockerServices,
                6 => IPage::DockerImageHistory(
                    Deserialize::deserialize(value).map_err(D::Error::custom)?,
                ),
                7 => IPage::DockerImages,
                8 => {
                    IPage::ModifiedFile(Deserialize::deserialize(value).map_err(D::Error::custom)?)
                }
                9 => IPage::ModifiedFiles,
                10 => IPage::Object(Deserialize::deserialize(value).map_err(D::Error::custom)?),
                11 => IPage::ObjectList(Deserialize::deserialize(value).map_err(D::Error::custom)?),
                12 => IPage::Search,
                type_ => return Err(D::Error::custom(format!("Unsupported type {type_}"))),
            },
        )
    }
}

pub fn export_ts() -> Vec<String> {
    vec![
        "export enum PAGE_TYPE { \
    Dashbord = 0, \
    Deployment = 1, \
    DeploymentDetails = 2, \
    DockerContainerDetails = 3, \
    DockerContainerHistory = 4, \
    DockerServices = 5, \
    DockerImageHistory = 6, \
    DockerImages = 7, \
    ModifiedFile = 8, \
    ModifiedFiles = 9, \
    Object = 10, \
    ObjectList = 11, \
    Search = 12, \
}"
        .to_string(),
        IObjectListPage::export_to_string().unwrap(),
        IObjectPage::export_to_string().unwrap(),
        IDeploymentDetailsPage::export_to_string().unwrap(),
        IDockerImageHistory::export_to_string().unwrap(),
        IDockerContainerDetails::export_to_string().unwrap(),
        IDockerContainerHistory::export_to_string().unwrap(),
        IModifiedFilePage::export_to_string().unwrap(),
        IPage::export_to_string().unwrap(),
    ]
}
