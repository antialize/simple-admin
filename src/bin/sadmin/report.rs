use anyhow::{Context, Result};
use serde::Serialize;

use crate::{disk_encryption, firewall, screen_lock, system_info};

#[derive(Serialize)]
pub struct Report {
    pub hostname: String,
    pub kernel_version: String,
    pub os_release: OsRelease,
    pub firewall: CheckResult,
    pub disk_encryption: CheckResult,
    pub screen_lock: ScreenLockResult,
}

#[derive(Serialize)]
pub struct OsRelease {
    pub id: Option<String>,
    pub version_id: Option<String>,
    pub pretty_name: Option<String>,
}

/// Result of probing the host for a particular security control (firewall,
/// disk encryption, screen lock). `method` identifies which mechanism was
/// used to make the determination, if any was found.
#[derive(Serialize)]
pub struct CheckResult {
    pub enabled: bool,
    pub method: Option<String>,
    pub details: Option<String>,
}

/// Like [`CheckResult`] but also carries the lock timeout, only used for screen lock.
#[derive(Serialize)]
pub struct ScreenLockResult {
    pub enabled: bool,
    pub method: Option<String>,
    pub details: Option<String>,
    /// Total time in milliseconds before the screen locks when idle.
    pub timeout_ms: Option<i64>,
}

/// Runs all checks and assembles the full compliance report.
pub fn collect() -> Result<Report> {
    Ok(Report {
        hostname: system_info::hostname().context("Unable to get hostname")?,
        kernel_version: system_info::kernel_version().context("Unable to get kernel version")?,
        os_release: system_info::os_release().context("Unable to get os release")?,
        firewall: firewall::check_firewall().context("Unable to check firewall")?,
        disk_encryption: disk_encryption::check_disk_encryption()
            .context("Unable to check disk encryption")?,
        screen_lock: screen_lock::check_screen_lock().context("Unable to check screen lock")?,
    })
}
