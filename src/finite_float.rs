use std::ops::Deref;

use serde::{Deserialize, Serialize};
use ts_rs::{Config, TS};

#[derive(Debug)]
pub struct NotFiniteFloat;

impl std::fmt::Display for NotFiniteFloat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Not finite float")
    }
}
impl std::error::Error for NotFiniteFloat {}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct FiniteF64(f64);

impl From<FiniteF64> for f64 {
    fn from(v: FiniteF64) -> Self {
        v.0
    }
}

impl TryFrom<f64> for FiniteF64 {
    type Error = NotFiniteFloat;

    fn try_from(value: f64) -> Result<Self, Self::Error> {
        if value.is_finite() {
            Ok(FiniteF64(value))
        } else {
            Err(NotFiniteFloat)
        }
    }
}

impl Deref for FiniteF64 {
    type Target = f64;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Serialize for FiniteF64 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> Deserialize<'de> for FiniteF64 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Error;
        let v = f64::deserialize(deserializer)?;
        if v.is_finite() {
            Ok(FiniteF64(v))
        } else {
            Err(D::Error::custom("not finite"))
        }
    }
}

impl std::fmt::Display for FiniteF64 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl std::str::FromStr for FiniteF64 {
    type Err = NotFiniteFloat;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let v: f64 = s.parse().map_err(|_| NotFiniteFloat)?;
        v.try_into()
    }
}

impl Eq for FiniteF64 {}

impl PartialOrd for FiniteF64 {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for FiniteF64 {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.partial_cmp(other).unwrap()
    }
}

impl TS for FiniteF64 {
    type WithoutGenerics = Self;
    type OptionInnerType = Self;

    fn decl(_config: &Config) -> String {
        panic!("FiniteF64 cannot be declared")
    }

    fn decl_concrete(_config: &Config) -> String {
        panic!("FiniteF64 cannot be declared")
    }

    fn name(_config: &Config) -> String {
        "number".to_owned()
    }

    fn inline(_config: &Config) -> String {
        "number".to_owned()
    }

    fn inline_flattened(_config: &Config) -> String {
        panic!("FiniteF64 cannot be flattened")
    }
}

pub trait ToFinite {
    type Res;
    type Err;
    fn to_finite(self) -> Result<Self::Res, Self::Err>;
}

impl ToFinite for f64 {
    type Res = FiniteF64;
    type Err = NotFiniteFloat;
    fn to_finite(self) -> Result<Self::Res, Self::Err> {
        self.try_into()
    }
}

impl ToFinite for Option<f64> {
    type Res = Option<FiniteF64>;
    type Err = NotFiniteFloat;
    fn to_finite(self) -> Result<Self::Res, Self::Err> {
        match self {
            Some(v) => Ok(Some(v.try_into()?)),
            None => Ok(None),
        }
    }
}
