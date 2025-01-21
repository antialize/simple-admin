use serde::{ser::SerializeMap, Deserialize, Serialize, Serializer};
use ts_rs::TS;

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IObjectDigest {
    pub name: String,
    pub comment: String,
    pub id: i64,
    pub r#type: i64,
    pub category: String,
}

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
    pub id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
#[derive(Debug, Clone, TS)]
pub enum IPage {
    Dashbord,
    Deployment(IDeploymentDetailsPage),
    DeploymentDetails,
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
            IPage::Deployment(t) => {
                s.serialize_entry("type", &1)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            IPage::DeploymentDetails => {
                s.serialize_entry("type", &2)?;
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
                1 => IPage::Deployment(Deserialize::deserialize(value).map_err(D::Error::custom)?),
                2 => IPage::DeploymentDetails,
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
                type_ => return Err(D::Error::custom(format!("Unsupported type {}", type_))),
            },
        )
    }
}
