use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Signal {
    Usr1,
    Usr2,
    Kill,
    Term,
    Abort,
    Hub,
}

#[derive(Clone, Copy, Debug)]
pub enum Duration {
    MS(f64),
    S(f64),
    M(f64),
    H(f64),
    D(f64),
}

impl From<std::time::Duration> for Duration {
    fn from(v: std::time::Duration) -> Self {
        Self::S(v.as_secs_f64())
    }
}

impl From<Duration> for std::time::Duration {
    fn from(v: Duration) -> Self {
        match v {
            Duration::MS(v) => std::time::Duration::from_secs_f64(v / 1000.0),
            Duration::S(v) => std::time::Duration::from_secs_f64(v),
            Duration::M(v) => std::time::Duration::from_secs_f64(v * 60.0),
            Duration::H(v) => std::time::Duration::from_secs_f64(v * 60.0 * 60.0),
            Duration::D(v) => std::time::Duration::from_secs_f64(v * 60.0 * 60.0 * 24.0),
        }
    }
}

impl Serialize for Duration {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Duration::MS(v) => serializer.serialize_str(&format!("{}ms", v)),
            Duration::S(v) => serializer.serialize_str(&format!("{}s", v)),
            Duration::M(v) => serializer.serialize_str(&format!("{}m", v)),
            Duration::H(v) => serializer.serialize_str(&format!("{}h", v)),
            Duration::D(v) => serializer.serialize_str(&format!("{}d", v)),
        }
    }
}

impl<'de> Deserialize<'de> for Duration {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let v = String::deserialize(deserializer)?;
        for p in ["ms"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Duration::MS(v));
            }
        }
        for p in ["s"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Duration::S(v));
            }
        }
        for p in ["m"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Duration::M(v));
            }
        }
        for p in ["h"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Duration::H(v));
            }
        }
        for p in ["d"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Duration::D(v));
            }
        }
        Err(serde::de::Error::invalid_value(
            serde::de::Unexpected::Str(&v),
            &"duration",
        ))
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Size {
    B(u64),
    KB(f64),
    MB(f64),
    GB(f64),
    TB(f64),
}

impl From<u64> for Size {
    fn from(v: u64) -> Self {
        Self::B(v)
    }
}

impl From<Size> for u64 {
    fn from(v: Size) -> Self {
        match v {
            Size::B(v) => v,
            Size::KB(v) => (v * 1024.0) as u64,
            Size::MB(v) => (v * 1024.0 * 1024.0) as u64,
            Size::GB(v) => (v * 1024.0 * 1024.0 * 1024.0) as u64,
            Size::TB(v) => (v * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64,
        }
    }
}

impl Serialize for Size {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Size::B(v) => serializer.serialize_str(&format!("{}B", v)),
            Size::KB(v) => serializer.serialize_str(&format!("{}Kb", v)),
            Size::MB(v) => serializer.serialize_str(&format!("{}Mb", v)),
            Size::GB(v) => serializer.serialize_str(&format!("{}Gb", v)),
            Size::TB(v) => serializer.serialize_str(&format!("{}Tb", v)),
        }
    }
}

impl<'de> Deserialize<'de> for Size {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let v = String::deserialize(deserializer)?;
        for p in ["kb", "KB", "Kb", "k", "K"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Size::KB(v));
            }
        }
        for p in ["mb", "MB", "Mb", "m", "M"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Size::MB(v));
            }
        }
        for p in ["gb", "GB", "Gb", "g", "G"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Size::GB(v));
            }
        }
        for p in ["tb", "TB", "Tb", "t", "T"] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Size::TB(v));
            }
        }
        for p in ['b', 'B'] {
            if let Some(v) = v.strip_suffix(p) {
                let v = v.parse().map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Str(v), &"number")
                })?;
                return Ok(Size::B(v));
            }
        }
        Err(serde::de::Error::invalid_value(
            serde::de::Unexpected::Str(&v),
            &"size",
        ))
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct ExtractFile {
    pub src: String,
    pub dst: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy)]
pub enum BindType {
    Tcp,
    UnixStream,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Bind {
    Tcp {
        bind: String,
        fd: u16,
    },
    UnixStream {
        path: String,
        fd: u16,
        user: String,
        umask: u32,
    },
}

fn is_false(v: &bool) -> bool {
    !v
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceType {
    Notify,
    Plain,
}
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct ServiceDescription {
    pub name: String,
    pub service_type: ServiceType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enable_linger: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssl_service: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssl_identity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssl_subcert: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pre_deploy: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pre_start: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_memory: Option<Size>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extract_files: Vec<ExtractFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service_executable: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bind: Vec<Bind>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub overlap: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub watchdog_timeout: Option<Duration>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_timeout: Option<Duration>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_timeout: Option<Duration>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pod_mount: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pod_options: Vec<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub pod_env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub cgroup_delegation: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overlap_stop_signal: Option<Signal>,
}
