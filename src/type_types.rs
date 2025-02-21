use serde::{Deserialize, Serialize, Serializer, de, ser::SerializeMap};
use serde_json::Value;
use ts_rs::TS;
pub type ValueMap = serde_json::Map<String, Value>;

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IBoolTypeProp {
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub default: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub variable: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct ITextTypeProp {
    #[serde(default)]
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub default: String,
    #[serde(default)]
    pub template: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub variable: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub deploy_title: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub lines: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IPasswordTypeProp {
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IDocumentTypeProp {
    #[serde(default)]
    pub title: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub lang_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub lang: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub template: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub variable: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
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
    #[ts(optional)]
    pub variable: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct INumberTypeProp {
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub default: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct ITypeContentTypeProp {
    pub name: String,
}

// This should be integer tagged
// see https://stackoverflow.com/questions/65575385/deserialization-of-json-with-serde-by-a-numerical-value-as-type-identifier/65576570#65576570
#[derive(Debug, Clone)]
pub enum ITypeProp {
    None,
    Bool(IBoolTypeProp),
    Text(ITextTypeProp),
    Password(IPasswordTypeProp),
    Document(IDocumentTypeProp),
    Choice(IChoiceTypeProp),
    TypeContent(ITypeContentTypeProp),
    Number(INumberTypeProp),
    Monitor,
}

impl TS for ITypeProp {
    type WithoutGenerics = ITypeProp;
    fn ident() -> String {
        "ITypeProp".to_owned()
    }
    fn name() -> String {
        "ITypeProp".to_owned()
    }
    fn decl_concrete() -> String {
        todo!();
    }
    fn decl() -> String {
        "type ITypeProp = | { type: TypePropType.none }\
            | ({ type: TypePropType.bool } & IBoolTypeProp)\
            | ({ type: TypePropType.text } & ITextTypeProp)\
            | ({ type: TypePropType.password } & IPasswordTypeProp)\
            | ({ type: TypePropType.document } & IDocumentTypeProp)\
            | ({ type: TypePropType.choice } & IChoiceTypeProp)\
            | ({ type: TypePropType.typeContent } & ITypeContentTypeProp)\
            | ({ type: TypePropType.number } & INumberTypeProp)\
            | { type: TypePropType.monitor };"
            .to_string()
    }
    fn inline() -> String {
        todo!()
    }
    fn inline_flattened() -> String {
        todo!()
    }
    fn output_path() -> Option<&'static std::path::Path> {
        Some(std::path::Path::new("ITypeProp.ts"))
    }
    fn visit_dependencies(_: &mut impl ::ts_rs::TypeVisitor)
    where
        Self: 'static,
    {
    }
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
            ITypeProp::Monitor => {
                s.serialize_entry("type", &8)?;
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
        // Work around old objects with empty content
        if value.as_object().map(|v| v.is_empty()).unwrap_or_default() {
            return Ok(ITypeProp::None);
        }
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
                8 => ITypeProp::Monitor,
                type_ => return Err(D::Error::custom(format!("Unsupported type {}", type_))),
            },
        )
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
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
    Docker,
    Monitor, // Deprecated
}

#[derive(Serialize, Deserialize, Debug, Default, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IType {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub plural: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub kind: Option<KindType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub deploy_order: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub script: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub has_category: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub has_variables: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub has_contains: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub has_sudo_on: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub has_triggers: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub has_depends: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub contains_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub content: Option<Vec<ITypeProp>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name_variable: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct IVariable {
    pub key: String,
    pub value: String,
}

pub trait IContainsIter {
    type Iter<'a>: Iterator<Item = i64>
    where
        Self: 'a;
    fn contains_iter(&self) -> Self::Iter<'_>;
}

pub trait IDependsIter {
    type Iter<'a>: Iterator<Item = i64>
    where
        Self: 'a;
    fn depends_iter(&self) -> Self::Iter<'_>;
}

pub trait ISudoOnIter {
    type Iter<'a>: Iterator<Item = i64>
    where
        Self: 'a;
    fn sudo_on_iter(&self) -> Self::Iter<'_>;
}

pub struct I64Extractor<'a>(std::slice::Iter<'a, serde_json::Value>);

impl Iterator for I64Extractor<'_> {
    type Item = i64;
    fn next(&mut self) -> Option<Self::Item> {
        for v in self.0.by_ref() {
            if let Some(v) = v.as_i64() {
                return Some(v);
            }
        }
        None
    }
}

impl IContainsIter for ValueMap {
    type Iter<'a> = I64Extractor<'a>;
    fn contains_iter(&self) -> I64Extractor<'_> {
        if let Some(serde_json::Value::Array(v)) = self.get("contains") {
            I64Extractor(v.iter())
        } else {
            I64Extractor([].iter())
        }
    }
}

impl IDependsIter for ValueMap {
    type Iter<'a> = I64Extractor<'a>;
    fn depends_iter(&self) -> I64Extractor<'_> {
        if let Some(serde_json::Value::Array(v)) = self.get("depends") {
            I64Extractor(v.iter())
        } else {
            I64Extractor([].iter())
        }
    }
}

impl ISudoOnIter for ValueMap {
    type Iter<'a> = I64Extractor<'a>;
    fn sudo_on_iter(&self) -> I64Extractor<'_> {
        if let Some(serde_json::Value::Array(v)) = self.get("sudo_on") {
            I64Extractor(v.iter())
        } else {
            I64Extractor([].iter())
        }
    }
}

pub struct VariableExtractor<'a>(std::slice::Iter<'a, serde_json::Value>);
impl<'a> Iterator for VariableExtractor<'a> {
    type Item = (&'a str, &'a str);
    fn next(&mut self) -> Option<Self::Item> {
        for v in self.0.by_ref() {
            if let serde_json::Value::Object(o) = v {
                if let (Some(serde_json::Value::String(k)), Some(serde_json::Value::String(v))) =
                    (o.get("key"), o.get("value"))
                {
                    return Some((k.as_str(), v.as_str()));
                }
            }
        }
        None
    }
}

pub trait IVariablesIter {
    type Iter<'a>: Iterator<Item = (&'a str, &'a str)>
    where
        Self: 'a;
    fn variables_iter(&self) -> Self::Iter<'_>;
    fn secrets_iter(&self) -> Self::Iter<'_>;
}

impl IVariablesIter for ValueMap {
    type Iter<'a> = VariableExtractor<'a>;

    fn variables_iter(&self) -> Self::Iter<'_> {
        if let Some(serde_json::Value::Array(v)) = self.get("variables") {
            VariableExtractor(v.iter())
        } else {
            VariableExtractor([].iter())
        }
    }

    fn secrets_iter(&self) -> Self::Iter<'_> {
        if let Some(serde_json::Value::Array(v)) = self.get("secrets") {
            VariableExtractor(v.iter())
        } else {
            VariableExtractor([].iter())
        }
    }
}

pub trait ITriggersIter {
    type Iter<'a>: Iterator<Item = (i64, &'a ValueMap)>
    where
        Self: 'a;
    fn triggers_iter(&self) -> Self::Iter<'_>;
}

pub struct TriggersExtractor<'a>(std::slice::Iter<'a, serde_json::Value>);
impl<'a> Iterator for TriggersExtractor<'a> {
    type Item = (i64, &'a ValueMap);
    fn next(&mut self) -> Option<Self::Item> {
        for v in self.0.by_ref() {
            if let serde_json::Value::Object(o) = v {
                if let (Some(serde_json::Value::Number(k)), Some(serde_json::Value::Object(v))) =
                    (o.get("id"), o.get("values"))
                {
                    return Some((k.as_i64().unwrap_or_default(), v));
                }
            }
        }
        None
    }
}

impl ITriggersIter for ValueMap {
    type Iter<'a> = TriggersExtractor<'a>;

    fn triggers_iter(&self) -> Self::Iter<'_> {
        if let Some(serde_json::Value::Array(v)) = self.get("triggers") {
            TriggersExtractor(v.iter())
        } else {
            TriggersExtractor([].iter())
        }
    }
}

pub const TYPE_ID: i64 = 1;
pub const HOST_ID: i64 = 2;
pub const ROOT_ID: i64 = 3;
pub const USER_ID: i64 = 4;
pub const COLLECTION_ID: i64 = 7;
pub const COMPLEX_COLLECTION_ID: i64 = 8;
pub const HOST_VARIABLE_ID: i64 = 10840;
pub const PACKAGE_ID: i64 = 10;
pub const ROOT_INSTANCE_ID: i64 = 100;

pub fn export_ts() -> Vec<String> {
    vec![
        format!("export const {} = {};", "TYPE_ID", TYPE_ID),
        format!("export const {} = {};", "HOST_ID", HOST_ID),
        format!("export const {} = {};", "ROOT_ID", ROOT_ID),
        format!("export const {} = {};", "USER_ID", USER_ID),
        format!("export const {} = {};", "COLLECTION_ID", COLLECTION_ID),
        format!(
            "export const {} = {};",
            "COMPLEX_COLLECTION_ID", COMPLEX_COLLECTION_ID
        ),
        format!(
            "export const {} = {};",
            "HOST_VARIABLE_ID", HOST_VARIABLE_ID
        ),
        format!("export const {} = {};", "PACKAGE_ID", PACKAGE_ID),
        format!(
            "export const {} = {};",
            "ROOT_INSTANCE_ID", ROOT_INSTANCE_ID
        ),
        "export enum TypePropType {\
            none = 0,\
            bool = 1,\
            text = 2,\
            password = 3,\
            document = 4,\
            choice = 5,\
            typeContent = 6,\
            number = 7,\
            monitor = 8,\
        }"
        .to_string(),
        IBoolTypeProp::export_to_string().unwrap(),
        ITextTypeProp::export_to_string().unwrap(),
        IPasswordTypeProp::export_to_string().unwrap(),
        IDocumentTypeProp::export_to_string().unwrap(),
        IChoiceTypeProp::export_to_string().unwrap(),
        INumberTypeProp::export_to_string().unwrap(),
        ITypeContentTypeProp::export_to_string().unwrap(),
        ITypeProp::export_to_string().unwrap(),
        KindType::export_to_string().unwrap(),
        IType::export_to_string().unwrap(),
        IVariable::export_to_string().unwrap(),
    ]
}
