use anyhow::{Context, Result, bail};
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
    let mut start_delim = "{{";
    let mut end_delim = "}}";
    while let Some((before, after)) = template.split_once(start_delim) {
        res.push_str(before);

        if let Some(after) = after.strip_prefix('=') {
            let (mid, rem) = after.split_once(end_delim).context("Unbalanced")?;
            let Some(mid) = mid.strip_suffix("=") else {
                bail!("Missing = at end of delim change");
            };
            let (sd, ed) = mid
                .split_once(" ")
                .context("Missing ' ' in delimiter change")?;
            start_delim = sd;
            end_delim = ed;
            template = rem;
            continue;
        }

        let (var, after) = if let Some(after) = after.strip_prefix('{') {
            after.split_once("}}}").context("Unbalanced")?
        } else {
            after.split_once(end_delim).context("Unbalanced")?
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mustash() {
        let mut vars = HashMap::new();
        vars.insert("a".into(), "AA".into());
        vars.insert("b".into(), "BB".into());
        vars.insert("c".into(), "CC".into());
        assert_eq!(
            render(
                "Hello {{{a}}} {{=<% %>=}} <%b%> {{kat}} <%={{ }}=%> {{c}}",
                None,
                &vars,
                true
            )
            .unwrap(),
            "Hello AA  BB {{kat}}  CC"
        );
    }
}
