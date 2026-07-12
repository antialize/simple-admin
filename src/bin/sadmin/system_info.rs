use std::collections::HashMap;
use std::fs;

use anyhow::{Context, Result};

use crate::report::OsRelease;

pub fn hostname() -> Result<String> {
    let content = fs::read_to_string("/proc/sys/kernel/hostname")
        .context("failed to read /proc/sys/kernel/hostname")?;
    Ok(content.trim().to_string())
}

pub fn kernel_version() -> Result<String> {
    let content = fs::read_to_string("/proc/sys/kernel/osrelease")
        .context("failed to read /proc/sys/kernel/osrelease")?;
    Ok(content.trim().to_string())
}

pub fn os_release() -> Result<OsRelease> {
    let content = fs::read_to_string("/etc/os-release")
        .or_else(|_| fs::read_to_string("/usr/lib/os-release"))
        .context("failed to read /etc/os-release or /usr/lib/os-release")?;

    let fields: HashMap<String, String> = content
        .lines()
        .filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            Some((
                key.trim().to_string(),
                value.trim().trim_matches('"').to_string(),
            ))
        })
        .collect();

    Ok(OsRelease {
        id: fields.get("ID").cloned(),
        version_id: fields.get("VERSION_ID").cloned(),
        pretty_name: fields.get("PRETTY_NAME").cloned(),
    })
}
