use std::collections::HashMap;

use serde::{Deserialize, Serialize};


#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IBoolTypeProp {
    pub title: String,
    pub name: String,
    pub description: String,
    pub default: bool,
    pub variable: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ITextTypeProp {
    pub title: String,
    pub name: String,
    pub description: String,
    pub default: String,
    pub template: bool,
    pub variable: String,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub deploy_title: Option<bool>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub lines: Option<u64>,
}


#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IPasswordTypeProp {
    pub title: String,
    pub name: String,
    pub description: String,
}



#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IDocumentTypeProp {
    pub title: String,
    pub name: String,
    pub lang_name: String,
    pub lang: String,
    pub description: String,
    pub template: bool,
    pub variable: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IChoiceTypeProp {
    pub title: String,
    pub name: String,
    pub description: String,
    pub default: String,
    pub choices: Vec<String>,
    pub variable: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct INumberTypeProp {
    pub title: String,
    pub name: String,
    pub description: String,
    pub default: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ITypeContentTypeProp {
    pub name: String,
}


// TODO(jakobt) this should be integer tagged
// see https://stackoverflow.com/questions/65575385/deserialization-of-json-with-serde-by-a-numerical-value-as-type-identifier/65576570#65576570
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum ITypeProp {
    #[serde(rename = "0")]
    None{},
    #[serde(rename = "1")]
    Bool(IBoolTypeProp),
    #[serde(rename = "2")]
    Text(ITextTypeProp),
    #[serde(rename = "3")]
    Password(IPasswordTypeProp),
    #[serde(rename = "4")]
    Document(IDocumentTypeProp),
    #[serde(rename = "5")]
    Choice(IChoiceTypeProp),
    #[serde(rename = "6")]
    TypeContent(ITypeContentTypeProp),
    #[serde(rename = "7")]
    Number(INumberTypeProp),
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
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub plural: Option<String>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub kind: Option<KindType>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub deploy_order: Option<i64>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub script: Option<String>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub has_category: Option<bool>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub has_variables: Option<bool>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub has_contains: Option<bool>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub has_sudo_on: Option<bool>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub has_triggers: Option<bool>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub has_depends: Option<bool>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub contains_name: Option<String>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub content: Option<Vec<ITypeProp>>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub name_variable: Option<String>,
}
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IVariable {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct IVariables {
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub variables: Option<Vec<IVariable>>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub secrets: Option<Vec<IVariable>>,
}

// export interface IVariables {
//     variables?: Array<{ key: string; value: string }>;
//     secrets?: Array<{ key: string; value: string }>;
// }

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

pub const TYPE_ID: i64 = 1;
pub const HOST_ID: i64 = 2;
pub const ROOT_ID: i64 = 3;
pub const USER_ID: i64 = 4;
pub const PACKAGE_ID: i64 = 10;
pub const ROOT_INSTANCE_ID: i64 = 100;
