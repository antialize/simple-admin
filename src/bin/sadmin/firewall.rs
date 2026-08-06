use std::process::Command;

use anyhow::Result;

use crate::command::try_run;
use crate::report::CheckResult;

/// Checks known Linux firewall managers in order of preference and returns
/// the status reported by the first one that appears to be installed.
///
/// Individual probes that fail unexpectedly (e.g. permission denied) don't
/// abort the whole check; their error context is recorded and the next
/// candidate is tried instead.
pub fn check_firewall() -> Result<CheckResult> {
    let mut notes = Vec::new();

    for check in [check_ufw, check_firewalld, check_nftables, check_iptables] {
        match check() {
            Ok(Some(result)) => return Ok(result),
            Ok(None) => {}
            Err(err) => notes.push(format!("{err:#}")),
        }
    }

    notes.insert(
        0,
        "no supported firewall manager (ufw, firewalld, nftables, iptables) found".to_string(),
    );
    Ok(CheckResult {
        enabled: false,
        method: None,
        details: Some(notes.join("; ")),
    })
}

fn check_ufw() -> Result<Option<CheckResult>> {
    let Some(output) = try_run(Command::new("ufw").arg("status"))? else {
        return Ok(None);
    };
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }
    let enabled = text
        .lines()
        .next()
        .map(|l| l.trim() == "Status: active")
        .unwrap_or(false);
    Ok(Some(CheckResult {
        enabled,
        method: Some("ufw".to_string()),
        details: Some(text),
    }))
}

fn check_firewalld() -> Result<Option<CheckResult>> {
    let Some(output) = try_run(Command::new("firewall-cmd").arg("--state"))? else {
        return Ok(None);
    };
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }
    let enabled = text == "running";
    Ok(Some(CheckResult {
        enabled,
        method: Some("firewalld".to_string()),
        details: Some(text),
    }))
}

fn check_nftables() -> Result<Option<CheckResult>> {
    let Some(output) = try_run(Command::new("nft").args(["list", "ruleset"]))? else {
        return Ok(None);
    };
    if !output.status.success() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let has_rules = text.lines().any(|l| l.trim_start().starts_with("chain"));
    Ok(Some(CheckResult {
        enabled: has_rules,
        method: Some("nftables".to_string()),
        details: Some(if has_rules {
            "ruleset contains chains/rules".to_string()
        } else {
            "ruleset is empty".to_string()
        }),
    }))
}

fn check_iptables() -> Result<Option<CheckResult>> {
    let Some(output) = try_run(Command::new("iptables").arg("-S"))? else {
        return Ok(None);
    };
    if !output.status.success() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim().is_empty() {
        return Ok(None);
    }
    let has_rules = text.lines().any(|l| l.starts_with("-A"));
    Ok(Some(CheckResult {
        enabled: has_rules,
        method: Some("iptables".to_string()),
        details: Some(if has_rules {
            "custom rules present".to_string()
        } else {
            "no custom rules (default policies only)".to_string()
        }),
    }))
}
