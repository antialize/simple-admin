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
///
/// Hack: when the value is the exact string `null` and the placeholder is the
/// entire content of a double quoted string, like `"{{{name}}}"`, the whole
/// string is replaced with a bare `null` instead of the quoted `"null"`, so
/// the document parses it as a JSON null rather than the string "null".
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

/// True if `s` ends with a `"` that opens or closes a JSON string, i.e. is
/// not backslash escaped.
fn ends_with_plain_quote(s: &str) -> bool {
    let Some(rest) = s.strip_suffix('"') else {
        return false;
    };
    rest.bytes().rev().take_while(|&b| b == b'\\').count() % 2 == 0
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
                // See the `render_json` docs: a value of "null" in a
                // placeholder that is the whole JSON string renders the bare
                // JSON null, dropping the surrounding quotes.
                if escape && v == "null" && ends_with_plain_quote(&res) && after.starts_with('"') {
                    res.pop();
                    res.push_str("null");
                    template = &after[1..];
                    continue;
                }
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
    fn render_json_null_value_becomes_json_null() {
        let mut vars = HashMap::new();
        vars.insert("name".into(), "null".into());
        let doc = render_json(
            r#"{"a": "{{{name}}}", "b": "x {{{name}}}", "c": "{{{name}}}y"}"#,
            None,
            &vars,
            false,
        )
        .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&doc).unwrap();
        assert!(parsed["a"].is_null());
        // Not the whole string, so the normal escaping applies.
        assert_eq!(parsed["b"], "x null");
        assert_eq!(parsed["c"], "nully");
    }

    #[test]
    fn render_json_null_quote_detection() {
        let mut vars = HashMap::new();
        vars.insert("name".into(), "null".into());
        // Escaped quote before the placeholder: not a string boundary.
        assert_eq!(
            render_json(r#""\"{{{name}}}\"""#, None, &vars, false).unwrap(),
            r#""\"null\"""#
        );
        // The following quote always ends the string; a value of "null" on a
        // bare placeholder outside of a string is unaffected.
        assert_eq!(
            render_json("{{{name}}}", None, &vars, false).unwrap(),
            "null"
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
