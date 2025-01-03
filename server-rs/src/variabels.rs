use anyhow::{Context, Result};
use mustache::Data;
use std::{borrow::Cow, ops::Deref};

fn json_to_data(v: serde_json::Value) -> Data {
    match v {
        serde_json::Value::Null => Data::Null,
        serde_json::Value::Bool(v) => Data::Bool(v),
        serde_json::Value::Number(number) => Data::String(number.to_string()),
        serde_json::Value::String(v) => Data::String(v),
        serde_json::Value::Array(vec) => Data::Vec(vec.into_iter().map(json_to_data).collect()),
        serde_json::Value::Object(map) => {
            Data::Map(map.into_iter().map(|(k, v)| (k, json_to_data(v))).collect())
        }
    }
}

pub struct Variables {
    data: Data,
    stack: Vec<Vec<(String, Option<Data>)>>,
}

impl Variables {
    pub fn add_str<'a>(&'a mut self, k: &'a str, v: impl Into<Cow<'a, str>>) -> Result<()> {
        let Data::Map(m) = &mut self.data else {
            panic!("Should be map");
        };
        let v: Cow<'a, str> = v.into();
        let ov = if let Some(v) = v.strip_prefix("json:") {
            let v: serde_json::Value = serde_json::from_str(v)?;
            m.insert(k.to_owned(), json_to_data(v))
        } else {
            m.insert(k.to_owned(), Data::String(v.into_owned()))
        };
        self.stack
            .last_mut()
            .context("Empty stack")?
            .push((k.to_owned(), ov));
        Ok(())
    }

    pub fn add_bool(&mut self, k: &str, v: bool) -> Result<()> {
        let Data::Map(m) = &mut self.data else {
            panic!("Should be map");
        };
        let ov = m.insert(
            k.to_owned(),
            Data::String(if v {
                "true".to_string()
            } else {
                "false".to_string()
            }),
        );
        self.stack
            .last_mut()
            .context("Empty stack")?
            .push((k.to_owned(), ov));
        Ok(())
    }

    pub fn has_vars(&self) -> bool {
        self.stack.last().map(|v| !v.is_empty()).unwrap_or_default()
    }

    pub fn push(&mut self) {
        self.stack.push(Vec::new());
    }

    pub fn pop(&mut self) -> Result<()> {
        let Data::Map(m) = &mut self.data else {
            panic!("Should be map");
        };
        let mut undo = self.stack.pop().context("Empty stack")?;
        undo.reverse();
        for (k, v) in undo {
            if let Some(v) = v {
                m.insert(k, v);
            } else {
                m.remove(&k);
            }
        }
        Ok(())
    }
}

impl Default for Variables {
    fn default() -> Self {
        Self {
            data: Data::Map(Default::default()),
            stack: Default::default(),
        }
    }
}

impl Deref for Variables {
    type Target = Data;

    fn deref(&self) -> &Self::Target {
        &self.data
    }
}
