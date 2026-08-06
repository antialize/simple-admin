use std::process::Command;

use anyhow::{Context, Result};

use crate::command::try_run;
use crate::report::CheckResult;

/// Determines whether the root filesystem lives on top of a LUKS/dm-crypt
/// encrypted block device.
pub fn check_disk_encryption() -> Result<CheckResult> {
    let device = root_source_device()?;
    let chain = block_device_chain(&device)?;
    let encrypted = chain.iter().any(|t| t == "crypt");
    Ok(CheckResult {
        enabled: encrypted,
        method: Some("lsblk".to_string()),
        details: Some(format!(
            "root device {} block chain: {}",
            device,
            chain.join(" -> ")
        )),
    })
}

fn root_source_device() -> Result<String> {
    let output = try_run(Command::new("findmnt").args(["-no", "SOURCE", "/"]))?
        .context("findmnt is not installed; cannot determine root filesystem device")?;
    if !output.status.success() {
        anyhow::bail!(
            "findmnt exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        anyhow::bail!("findmnt returned an empty root filesystem device");
    }
    Ok(text)
}

/// Returns the device itself and all of its dependency ancestors (e.g. an
/// LVM logical volume on top of a LUKS container on top of a partition),
/// via `lsblk -s` (inverse dependency listing).
fn block_device_chain(device: &str) -> Result<Vec<String>> {
    let output =
        try_run(Command::new("lsblk").args(["-no", "TYPE", "-s", device]))?.with_context(|| {
            format!("lsblk is not installed; cannot inspect block device chain for {device}")
        })?;
    if !output.status.success() {
        anyhow::bail!(
            "lsblk exited with {} while inspecting {}: {}",
            output.status,
            device,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let types: Vec<String> = text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    if types.is_empty() {
        anyhow::bail!("lsblk returned no block device information for {device}");
    }
    Ok(types)
}
