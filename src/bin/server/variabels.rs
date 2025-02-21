use crate::mustache::VarsMap;
use anyhow::{Context, Result, bail};
use std::{borrow::Cow, ops::Deref};

type StackEntry<'a> = (Cow<'a, str>, Option<Cow<'a, str>>);

pub struct Variables<'a> {
    map: VarsMap<'a>,
    stack: Vec<Vec<StackEntry<'a>>>,
}

impl Default for Variables<'_> {
    fn default() -> Self {
        Self {
            map: Default::default(),
            stack: vec![Default::default()],
        }
    }
}

impl<'a> Variables<'a> {
    pub fn add_str(
        &mut self,
        k: impl Into<Cow<'a, str>>,
        v: impl Into<Cow<'a, str>>,
    ) -> Result<()> {
        let k = k.into();
        let v = v.into();
        let ov = if v.strip_prefix("json:").is_some() {
            bail!("json: not supported");
        } else {
            self.map.insert(k.clone(), v)
        };
        self.stack.last_mut().context("Empty stack")?.push((k, ov));
        Ok(())
    }

    pub fn add_bool(&mut self, k: impl Into<Cow<'a, str>>, v: bool) -> Result<()> {
        self.add_str(k, if v { "true" } else { "false" })
    }

    pub fn has_vars(&self) -> bool {
        self.stack.last().map(|v| !v.is_empty()).unwrap_or_default()
    }

    pub fn push(&mut self) {
        self.stack.push(Vec::new());
    }

    pub fn pop(&mut self) -> Result<()> {
        let mut undo = self.stack.pop().context("Empty stack")?;
        undo.reverse();
        for (k, v) in undo {
            if let Some(v) = v {
                self.map.insert(k, v);
            } else {
                self.map.remove(&k);
            }
        }
        Ok(())
    }
}

impl<'a> Deref for Variables<'a> {
    type Target = VarsMap<'a>;

    fn deref(&self) -> &Self::Target {
        &self.map
    }
}
