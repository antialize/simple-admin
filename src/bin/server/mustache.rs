use anyhow::{bail, Context, Result};
use std::{borrow::Cow, collections::HashMap};

pub type VarsMap<'b> = HashMap<Cow<'b, str>, Cow<'b, str>>;

pub fn render<'a, 'b, 'c>(
    template: &'a str,
    outer_variables: Option<&'c VarsMap<'b>>,
    inner_variables: &'c VarsMap<'b>,
    allow_unknown: bool,
) -> Result<Cow<'a, str>> {
    if !template.contains("{{") {
        return Ok(template.into());
    }
    let mut template = template;
    let mut res = String::with_capacity(template.len() + 1024);
    while let Some((before, after)) = template.split_once("{{") {
        res.push_str(before);
        // Magic sequency to stop template parsing
        if let Some(after) = after.strip_prefix("={| |}=}}") {
            template = after;
            break;
        }
        let (var, after) = if let Some(after) = after.strip_prefix('{') {
            after.split_once("}}}").context("Unbalanced")?
        } else {
            after.split_once("}}").context("Unbalanced")?
        };
        let v = inner_variables
            .get(var)
            .or_else(|| outer_variables.as_ref().and_then(|v| v.get(var)));
        match v {
            Some(v) => {
                res.push_str(v);
            }
            None => {
                if !allow_unknown {
                    bail!("Unknown variable {}", var)
                }
            }
        }
        template = after;
    }
    res.push_str(template);
    Ok(res.into())
}
