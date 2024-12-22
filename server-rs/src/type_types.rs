use serde::{de, ser::SerializeMap, Deserialize, Serialize, Serializer};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IBoolTypeProp {
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub default: bool,
    pub variable: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ITextTypeProp {
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub default: String,
    #[serde(default)]
    pub template: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variable: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deploy_title: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lines: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IPasswordTypeProp {
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IDocumentTypeProp {
    pub title: String,
    pub name: String,
    pub lang_name: String,
    pub lang: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub template: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variable: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IChoiceTypeProp {
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub default: String,
    pub choices: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variable: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct INumberTypeProp {
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub default: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ITypeContentTypeProp {
    pub name: String,
}

// This should be integer tagged
// see https://stackoverflow.com/questions/65575385/deserialization-of-json-with-serde-by-a-numerical-value-as-type-identifier/65576570#65576570
#[derive(Debug)]
pub enum ITypeProp {
    None,
    Bool(IBoolTypeProp),
    Text(ITextTypeProp),
    Password(IPasswordTypeProp),
    Document(IDocumentTypeProp),
    Choice(IChoiceTypeProp),
    TypeContent(ITypeContentTypeProp),
    Number(INumberTypeProp),
}

impl Serialize for ITypeProp {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::__private::ser::FlatMapSerializer;
        let mut s = serializer.serialize_map(None)?;
        match self {
            ITypeProp::None {} => {
                s.serialize_entry("type", &0)?;
            }
            ITypeProp::Bool(t) => {
                s.serialize_entry("type", &1)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            ITypeProp::Text(t) => {
                s.serialize_entry("type", &2)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            ITypeProp::Password(t) => {
                s.serialize_entry("type", &3)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            ITypeProp::Document(t) => {
                s.serialize_entry("type", &4)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            ITypeProp::Choice(t) => {
                s.serialize_entry("type", &5)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            ITypeProp::TypeContent(t) => {
                s.serialize_entry("type", &6)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
            ITypeProp::Number(t) => {
                s.serialize_entry("type", &7)?;
                t.serialize(FlatMapSerializer(&mut s))?;
            }
        }
        s.end()
    }
}

impl<'de> serde::Deserialize<'de> for ITypeProp {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error>
    where
        D::Error: de::Error,
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
                0 => ITypeProp::None,
                1 => ITypeProp::Bool(IBoolTypeProp::deserialize(value).map_err(D::Error::custom)?),
                2 => ITypeProp::Text(ITextTypeProp::deserialize(value).map_err(D::Error::custom)?),
                3 => ITypeProp::Password(
                    IPasswordTypeProp::deserialize(value).map_err(D::Error::custom)?,
                ),
                4 => ITypeProp::Document(
                    IDocumentTypeProp::deserialize(value).map_err(D::Error::custom)?,
                ),
                5 => ITypeProp::Choice(
                    IChoiceTypeProp::deserialize(value).map_err(D::Error::custom)?,
                ),
                6 => ITypeProp::TypeContent(
                    ITypeContentTypeProp::deserialize(value).map_err(D::Error::custom)?,
                ),
                7 => ITypeProp::Number(
                    INumberTypeProp::deserialize(value).map_err(D::Error::custom)?,
                ),
                type_ => return Err(D::Error::custom(format!("Unsupported type {}", type_))),
            },
        )
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum KindType {
    Host,
    Root,
    Collection,
    Delta,
    Sum,
    Type,
    Trigger,
    Hostvar,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct IType {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plural: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<KindType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deploy_order: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_category: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_variables: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_contains: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_sudo_on: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_triggers: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_depends: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contains_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<ITypeProp>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name_variable: Option<String>,
}
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IVariable {
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IVariables {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variables: Option<Vec<IVariable>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secrets: Option<Vec<IVariable>>,
}

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IHost {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variables: Option<Vec<IVariable>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secrets: Option<Vec<IVariable>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contains: Option<Vec<i64>>,
    #[serde(default)]
    pub message_on_down: bool,
    #[serde(default)]
    pub deb_packages: bool,
    #[serde(default)]
    pub use_podman: bool,
}

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ISudoOnContainsAndDepends {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contains: Option<Vec<Option<i64>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub depends: Option<Vec<Option<i64>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sudo_on: Option<Vec<Option<i64>>>,
}

// export interface IContains {
//     contains: number[];
// }

// export interface ISudoOn {
//     sudoOn: number[];
// }

// export interface ITrigger {
//     id: number;
//     values: Record<string, any>;
// }

// export interface ITriggers {
//     triggers: ITrigger[];
// }

// export interface IDepends {
//     depends: number[];
// }

// export interface Host extends IVariables, IContains {
//     messageOnDown?: boolean;
//     debPackages?: boolean;
//     usePodman?: boolean;
// }

#[derive(Serialize, Deserialize, Debug)]
pub struct IObject<T> {
    pub id: i64,
    pub r#type: i64,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<i64>,
    pub comment: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time: Option<i64>,
    pub content: T,
}

pub const TYPE_ID: i64 = 1;
pub const HOST_ID: i64 = 2;
pub const ROOT_ID: i64 = 3;
pub const USER_ID: i64 = 4;
pub const PACKAGE_ID: i64 = 10;
pub const ROOT_INSTANCE_ID: i64 = 100;
