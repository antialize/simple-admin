use anyhow::Result;
use std::{
    collections::{BTreeMap, HashMap},
    fmt::Display,
};

use crate::finite_float::FiniteF64;

pub enum FormatArg<'a> {
    String(&'a str),
    Float(FiniteF64),
    Number(u64),
    Bool(bool),
    RelTime(RelTime),
    None,
    Missing,
    Dict(&'a dyn GetFmtArgDict),
}

pub struct RelTime(pub FiniteF64);

impl Display for RelTime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs_f64();
        let seconds = now - *self.0;
        let x = [
            ("day", 86400.0),
            ("hour", 3600.0),
            ("minute", 60.0),
            ("second", 1.0),
            ("millisecond", 0.001),
        ];
        for (k, d) in x {
            let v = (seconds / d) as i64;
            return match v {
                1 => write!(f, "{v} {k} ago"),
                v if v > 1 => write!(f, "{v} {k}s ago"),
                _ => continue,
            };
        }
        write!(f, "{seconds} seconds ago")
    }
}

pub trait AsFmtArg {
    fn as_fmt_arg(&self) -> FormatArg<'_>;
}

impl AsFmtArg for String {
    fn as_fmt_arg(&self) -> FormatArg<'_> {
        FormatArg::String(self)
    }
}

impl<T: GetFmtArgDict> AsFmtArg for T {
    fn as_fmt_arg(&self) -> FormatArg<'_> {
        FormatArg::Dict(self)
    }
}

impl<T: AsFmtArg> AsFmtArg for Option<T> {
    fn as_fmt_arg(&self) -> FormatArg<'_> {
        match self {
            Some(v) => v.as_fmt_arg(),
            None => FormatArg::None,
        }
    }
}

impl<T: AsFmtArg> GetFmtArgDict for HashMap<String, T> {
    fn get_fmt_arg(&self, name: &str) -> FormatArg<'_> {
        match self.get(name) {
            Some(v) => v.as_fmt_arg(),
            None => FormatArg::Missing,
        }
    }
}

impl<T: AsFmtArg> GetFmtArgDict for BTreeMap<String, T> {
    fn get_fmt_arg(&self, name: &str) -> FormatArg<'_> {
        match self.get(name) {
            Some(v) => v.as_fmt_arg(),
            None => FormatArg::Missing,
        }
    }
}

pub trait GetFmtArgDict {
    fn get_fmt_arg(&self, name: &str) -> FormatArg<'_>;
}

impl std::fmt::Display for FormatArg<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FormatArg::String(v) => f.write_str(v),
            FormatArg::Float(v) => write!(f, "{v}"),
            FormatArg::Number(v) => write!(f, "{v}"),
            FormatArg::Bool(v) => write!(f, "{v}"),
            FormatArg::RelTime(v) => write!(f, "{v}"),
            FormatArg::Dict(_) => f.write_str("dict"),
            FormatArg::Missing => f.write_str("missing"),
            FormatArg::None => f.write_str("none"),
        }
    }
}

pub fn dyn_format(format: &str, args: &dyn GetFmtArgDict) -> Result<String> {
    use std::fmt::Write;

    let mut res = String::new();
    for p in format.split('{') {
        if let Some((arg, rem)) = p.split_once('}') {
            match arg {
                "bold" => res.push_str("\x1b[1m"),
                "red" => res.push_str("\x1b[31m"),
                "green" => res.push_str("\x1b[32m"),
                "half" => res.push_str("\x1b[2m"),
                "reset" => res.push_str("\x1b[0m"),
                v => {
                    let mut args = args;
                    for v in v.split('[') {
                        let v = v.strip_suffix(']').unwrap_or(v);
                        match args.get_fmt_arg(v) {
                            FormatArg::Dict(a) => args = a,
                            a => write!(res, "{a}")?,
                        }
                    }
                }
            }
            res.push_str(rem);
        } else {
            res.push_str(p);
        }
    }
    Ok(res)
}
