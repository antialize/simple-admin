use std::env;
use std::io;
use std::process::Command;

use anyhow::{Context, Result};

use crate::command::try_run;
use crate::report::ScreenLockResult;

/// Probes desktop-environment-specific settings and known lock-screen
/// daemons to determine whether an automatic lock screen is configured.
///
/// Individual probes that fail unexpectedly don't abort the whole check;
/// their error context is recorded and the next candidate is tried instead.
pub fn check_screen_lock() -> Result<ScreenLockResult> {
    let session_type = env::var("XDG_SESSION_TYPE").unwrap_or_default();
    let mut notes = Vec::new();

    let mut candidates: Vec<fn() -> Result<Option<ScreenLockResult>>> =
        vec![check_gnome, check_kde];
    match session_type.as_str() {
        "x11" => {
            candidates.push(check_xscreensaver);
            candidates.push(check_light_locker);
        }
        "wayland" => candidates.push(check_swaylock),
        _ => {}
    }

    for check in candidates {
        match check() {
            Ok(Some(result)) => return Ok(result),
            Ok(None) => {}
            Err(err) => notes.push(format!("{err:#}")),
        }
    }

    notes.insert(
        0,
        format!(
            "no supported screen lock mechanism detected (session type: {})",
            if session_type.is_empty() {
                "unknown".to_string()
            } else {
                session_type
            }
        ),
    );
    Ok(ScreenLockResult {
        enabled: false,
        method: None,
        details: Some(notes.join("; ")),
        timeout_ms: None,
    })
}

fn check_gnome() -> Result<Option<ScreenLockResult>> {
    let Some(output) = try_run(Command::new("gsettings").args([
        "get",
        "org.gnome.desktop.screensaver",
        "lock-enabled",
    ]))?
    else {
        return Ok(None);
    };
    if !output.status.success() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }
    let enabled = text == "true";

    // idle-delay: seconds before screen blanks
    let idle_secs = try_run(Command::new("gsettings").args([
        "get",
        "org.gnome.desktop.session",
        "idle-delay",
    ]))?;
    // lock-delay: additional seconds after blank before locking
    let lock_delay_secs = try_run(Command::new("gsettings").args([
        "get",
        "org.gnome.desktop.screensaver",
        "lock-delay",
    ]))?;

    let parse_uint = |out: Option<std::process::Output>| -> Option<i64> {
        let o = out?;
        if !o.status.success() {
            return None;
        }
        // gsettings output is like "uint32 300"
        let s = String::from_utf8_lossy(&o.stdout);
        s.split_whitespace().last()?.parse().ok()
    };
    let timeout_ms = match (parse_uint(idle_secs), parse_uint(lock_delay_secs)) {
        (Some(idle), Some(delay)) => Some((idle + delay) * 1000),
        (Some(idle), None) => Some(idle * 1000),
        _ => None,
    };

    Ok(Some(ScreenLockResult {
        enabled,
        method: Some("gnome-screensaver".to_string()),
        details: Some(format!("lock-enabled={}", text)),
        timeout_ms,
    }))
}

fn check_kde() -> Result<Option<ScreenLockResult>> {
    if !process_running("plasmashell")? {
        return Ok(None);
    }
    let home = env::var("HOME").context("HOME environment variable is not set")?;
    let path = format!("{home}/.config/kscreenlockerrc");
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err).with_context(|| format!("failed to read {path}")),
    };
    let enabled = content
        .lines()
        .skip_while(|l| l.trim() != "[Daemon]")
        .skip(1)
        .take_while(|l| !l.trim_start().starts_with('['))
        .find_map(|l| {
            l.split_once('=')
                .filter(|(k, _)| k.trim() == "Autolock")
                .map(|(_, v)| v.trim() == "true")
        })
        .unwrap_or(false);
    // KDE Timeout is in minutes
    let timeout_ms = content
        .lines()
        .skip_while(|l| l.trim() != "[Daemon]")
        .skip(1)
        .take_while(|l| !l.trim_start().starts_with('['))
        .find_map(|l| {
            l.split_once('=')
                .filter(|(k, _)| k.trim() == "Timeout")
                .and_then(|(_, v)| v.trim().parse::<i64>().ok())
                .map(|mins| mins * 60 * 1000)
        });
    Ok(Some(ScreenLockResult {
        enabled,
        method: Some("kscreenlocker".to_string()),
        details: Some(format!("plasmashell running, Autolock={enabled}")),
        timeout_ms,
    }))
}

fn check_xscreensaver() -> Result<Option<ScreenLockResult>> {
    if !process_running("xscreensaver")? {
        return Ok(None);
    }
    let home = env::var("HOME").context("HOME environment variable is not set")?;
    let path = format!("{home}/.xscreensaver");
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err).with_context(|| format!("failed to read {path}")),
    };
    let enabled = content
        .lines()
        .find_map(|l| {
            l.trim()
                .strip_prefix("lock:")
                .map(|v| v.trim().eq_ignore_ascii_case("true"))
        })
        .unwrap_or(false);
    // timeout: field is H:MM:SS
    let timeout_ms = content.lines().find_map(|l| {
        let v = l.trim().strip_prefix("timeout:")?.trim();
        parse_hmmss(v)
    });
    Ok(Some(ScreenLockResult {
        enabled,
        method: Some("xscreensaver".to_string()),
        details: Some(format!("xscreensaver running, lock={enabled}")),
        timeout_ms,
    }))
}

fn check_light_locker() -> Result<Option<ScreenLockResult>> {
    if !process_running("light-locker")? {
        return Ok(None);
    }
    // light-locker fires when X screensaver idles; read timeout from `xset q`
    let timeout_ms = try_run(Command::new("xset").arg("q"))?
        .filter(|o| o.status.success())
        .and_then(|o| {
            let text = String::from_utf8_lossy(&o.stdout).into_owned();
            text.lines().find(|l| l.contains("timeout:")).and_then(|l| {
                l.split_whitespace()
                    .skip_while(|w| *w != "timeout:")
                    .nth(1)
                    .and_then(|v| v.parse::<i64>().ok())
                    .map(|s| s * 1000)
            })
        });
    Ok(Some(ScreenLockResult {
        enabled: true,
        method: Some("light-locker".to_string()),
        details: Some("light-locker process running".to_string()),
        timeout_ms,
    }))
}

fn check_swaylock() -> Result<Option<ScreenLockResult>> {
    if !process_running("swayidle")? {
        return Ok(None);
    }
    // Parse swayidle config for: timeout <secs> 'swaylock ...'
    let home = env::var("HOME").unwrap_or_default();
    let config_path = format!("{home}/.config/swayidle/config");
    let timeout_ms = std::fs::read_to_string(&config_path).ok().and_then(|c| {
        c.lines().find_map(|l| {
            let l = l.trim();
            if !l.starts_with("timeout ") {
                return None;
            }
            // timeout <secs> '<cmd>'
            let mut parts = l.splitn(3, ' ');
            let _ = parts.next(); // "timeout"
            let secs: i64 = parts.next()?.parse().ok()?;
            let cmd = parts.next().unwrap_or("");
            // Only count the timeout that fires swaylock
            if cmd.contains("swaylock") {
                Some(secs * 1000)
            } else {
                None
            }
        })
    });
    Ok(Some(ScreenLockResult {
        enabled: true,
        method: Some("swaylock/swayidle".to_string()),
        details: Some("swayidle process running".to_string()),
        timeout_ms,
    }))
}

/// Returns whether a process named `name` is currently running, using
/// `pgrep`. Missing `pgrep` itself is treated as "not running" rather than
/// an error; other spawn failures still propagate with context.
fn process_running(name: &str) -> Result<bool> {
    let Some(output) = try_run(Command::new("pgrep").arg(name))? else {
        return Ok(false);
    };
    Ok(output.status.success())
}

/// Parse xscreensaver's `H:MM:SS` duration into milliseconds.
fn parse_hmmss(s: &str) -> Option<i64> {
    let parts: Vec<&str> = s.split(':').collect();
    match parts.as_slice() {
        [h, m, sec] => {
            let h: i64 = h.parse().ok()?;
            let m: i64 = m.parse().ok()?;
            let s: i64 = sec.parse().ok()?;
            Some((h * 3600 + m * 60 + s) * 1000)
        }
        _ => None,
    }
}
