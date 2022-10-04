use std::ops::Deref;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FiniteF64(f64);

impl From<FiniteF64> for f64 {
    fn from(v: FiniteF64) -> Self {
        v.0
    }
}

pub struct NotFiniteFloat;

impl TryInto<FiniteF64> for f64 {
    type Error = NotFiniteFloat;

    fn try_into(self) -> Result<FiniteF64, Self::Error> {
        if self.is_finite() {
            Ok(FiniteF64(self))
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

impl Eq for FiniteF64 {}

impl PartialOrd for FiniteF64 {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

impl Ord for FiniteF64 {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.partial_cmp(other).unwrap()
    }
}
