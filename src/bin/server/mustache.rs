use anyhow::{Context, Result, bail};
use std::{borrow::Cow, collections::HashMap};

pub type VarsMap<'b> = HashMap<Cow<'b, str>, Cow<'b, str>>;

/// Substitutes the variables into `template`, replacing each value with
/// itself as it is.
pub fn render<'a, 'b, 'c>(
    template: &'a str,
    outer_variables: Option<&'c VarsMap<'b>>,
    inner_variables: &'c VarsMap<'b>,
    allow_unknown: bool,
) -> Result<Cow<'a, str>> {
    render_impl(
        template,
        outer_variables,
        inner_variables,
        allow_unknown,
        false,
    )
}

/// Like `render`, but each substituted value is JSON string escaped (what
/// Python's `json.dumps(value)[1:-1]` produces). For templates that are JSON
/// (or YAML) documents whose double quoted strings contain the placeholders,
/// like service deploy descriptions: the escaping keeps the document valid,
/// and parsing it yields the values exactly, including values with quotes,
/// backslashes or newlines in them, or values that are themselves JSON.
/// A bare `{{{name}}}` outside of a string does not work with this.
pub fn render_json<'a, 'b, 'c>(
    template: &'a str,
    outer_variables: Option<&'c VarsMap<'b>>,
    inner_variables: &'c VarsMap<'b>,
    allow_unknown: bool,
) -> Result<Cow<'a, str>> {
    render_impl(
        template,
        outer_variables,
        inner_variables,
        allow_unknown,
        true,
    )
}

/// The value between the quotes of `json.dumps(value)`.
fn json_escape(value: &str) -> String {
    let mut escaped = serde_json::to_string(value).expect("serializing a str cannot fail");
    escaped.remove(0);
    escaped.pop();
    escaped
}

fn render_impl<'a, 'b, 'c>(
    template: &'a str,
    outer_variables: Option<&'c VarsMap<'b>>,
    inner_variables: &'c VarsMap<'b>,
    allow_unknown: bool,
    escape: bool,
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
                if escape {
                    res.push_str(&json_escape(v));
                } else {
                    res.push_str(v);
                }
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

    #[test]
    fn render_json_escapes() {
        let mut vars = HashMap::new();
        vars.insert("pw".into(), "a\"b\\c\nd".into());
        vars.insert("fs".into(), "[{\"type\": \"fs\"}]".into());
        assert_eq!(
            render_json("\"{{{pw}}}\" \"{{{fs}}}\"", None, &vars, false).unwrap(),
            "\"a\\\"b\\\\c\\nd\" \"[{\\\"type\\\": \\\"fs\\\"}]\""
        );
    }

    #[test]
    fn json_escape_roundtrips() {
        for value in ["plain", "with \"quotes\"", "back\\slash", "line\nbreak"] {
            let parsed =
                serde_json::from_str::<String>(&format!("\"{}\"", json_escape(value))).unwrap();
            assert_eq!(parsed, value);
        }
    }

    #[test]
    fn render_json_keeps_the_document_valid() {
        let mut vars = HashMap::new();
        vars.insert("pw".into(), "p\"w\nx".into());
        let doc = render_json(r#"{"pod_env": {"PW": "{{{pw}}}  x"}}"#, None, &vars, false).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&doc).unwrap();
        assert_eq!(parsed["pod_env"]["PW"], "p\"w\nx  x");
    }
}
