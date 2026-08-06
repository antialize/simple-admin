use std::io;
use std::os::unix::process::CommandExt;
use std::process::Command;

use anyhow::{Context, Result};
use ini::Ini;

use crate::command::try_run;
use crate::report::ScreenLockResult;

/// An active, local graphical login session for a real user, resolved via
/// `loginctl`. This is invoked as root from a systemd timer, which has no
/// logged-in user's `$HOME`/`$XDG_SESSION_TYPE`/D-Bus session of its own, so
/// every desktop-specific probe below runs in the *session's* user context
/// (uid/gid, home directory) instead of the calling process's environment.
struct UserSession {
    user: String,
    uid: u32,
    gid: u32,
    home: String,
    session_type: String,
}

/// Probes desktop-environment-specific settings and known lock-screen
/// daemons, for every active local graphical user session, to determine
/// whether an automatic lock screen is configured.
///
/// Individual probes that fail unexpectedly don't abort the whole check;
/// their error context is recorded and the next candidate is tried instead.
/// A machine is only considered compliant if every currently active local
/// user has a lock screen configured.
pub fn check_screen_lock() -> Result<ScreenLockResult> {
    let sessions = active_graphical_sessions().context("Listing active graphical sessions")?;
    if sessions.is_empty() {
        return Ok(ScreenLockResult {
            enabled: true,
            method: None,
            details: Some("no active local graphical user session detected".to_string()),
            timeout_ms: Some(0),
        });
    }

    let mut all_enabled = true;
    let mut methods = Vec::new();
    let mut timeout_ms: Option<i64> = None;
    let mut details = Vec::new();
    for session in &sessions {
        let result = check_session(session);
        all_enabled &= result.enabled;
        if let Some(method) = &result.method {
            methods.push(method.clone());
        }
        timeout_ms = match (timeout_ms, result.timeout_ms) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (a, None) => a,
            (None, b) => b,
        };
        details.push(format!(
            "{} ({}): enabled={}, {}",
            session.user,
            session.session_type,
            result.enabled,
            result.details.unwrap_or_default()
        ));
    }

    Ok(ScreenLockResult {
        enabled: all_enabled,
        method: if methods.is_empty() {
            None
        } else {
            Some(methods.join(", "))
        },
        details: Some(details.join("; ")),
        timeout_ms,
    })
}

type ScreenLockProbe = fn(&UserSession) -> Result<Option<ScreenLockResult>>;

/// Runs the desktop-specific probes applicable to a single user's session.
fn check_session(session: &UserSession) -> ScreenLockResult {
    let mut candidates: Vec<ScreenLockProbe> = vec![check_gnome, check_kde];
    match session.session_type.as_str() {
        "x11" => {
            candidates.push(check_xscreensaver);
            candidates.push(check_light_locker);
        }
        "wayland" => candidates.push(check_swaylock),
        _ => {}
    }

    let mut notes = Vec::new();
    for check in candidates {
        match check(session) {
            Ok(Some(result)) => return result,
            Ok(None) => {}
            Err(err) => notes.push(format!("{err:#}")),
        }
    }

    notes.insert(
        0,
        format!(
            "no supported screen lock mechanism detected (session type: {})",
            session.session_type
        ),
    );
    ScreenLockResult {
        enabled: false,
        method: None,
        details: Some(notes.join("; ")),
        timeout_ms: None,
    }
}

/// Lists active, local (non-remote) graphical login sessions via `loginctl`,
/// deduplicated by user. Returns an empty list (rather than an error) when
/// `loginctl`/systemd-logind isn't available.
fn active_graphical_sessions() -> Result<Vec<UserSession>> {
    let Some(output) = try_run(Command::new("loginctl").args(["list-sessions", "--no-legend"]))?
    else {
        return Ok(Vec::new());
    };
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let list = String::from_utf8_lossy(&output.stdout).into_owned();

    let mut sessions = Vec::new();
    for line in list.lines() {
        let Some(session_id) = line.split_whitespace().next() else {
            continue;
        };
        let Some(props_output) = try_run(Command::new("loginctl").args([
            "show-session",
            session_id,
            "--property=Name",
            "--property=Type",
            "--property=State",
            "--property=Remote",
        ]))?
        else {
            continue;
        };
        if !props_output.status.success() {
            continue;
        }
        let props = String::from_utf8_lossy(&props_output.stdout);
        let mut name = None;
        let mut session_type = None;
        let mut state = None;
        let mut remote = None;
        for l in props.lines() {
            if let Some((k, v)) = l.split_once('=') {
                match k {
                    "Name" => name = Some(v.to_string()),
                    "Type" => session_type = Some(v.to_string()),
                    "State" => state = Some(v.to_string()),
                    "Remote" => remote = Some(v.to_string()),
                    _ => {}
                }
            }
        }
        // Only local, currently active graphical sessions represent a real
        // user sitting in front of this machine right now.
        if state.as_deref() != Some("active") || remote.as_deref() != Some("no") {
            continue;
        }
        let (Some(name), Some(session_type)) = (name, session_type) else {
            continue;
        };
        if session_type != "x11" && session_type != "wayland" {
            continue;
        }
        let Some(user) = nix::unistd::User::from_name(&name)
            .with_context(|| format!("Looking up user {name}"))?
        else {
            continue;
        };
        sessions.push(UserSession {
            user: name,
            uid: user.uid.as_raw(),
            gid: user.gid.as_raw(),
            home: user.dir.to_string_lossy().into_owned(),
            session_type,
        });
    }

    sessions.sort_by(|a, b| a.user.cmp(&b.user));
    sessions.dedup_by(|a, b| a.user == b.user);
    Ok(sessions)
}

fn check_gnome(session: &UserSession) -> Result<Option<ScreenLockResult>> {
    // gsettings returns compiled-in schema defaults even when no GNOME
    // session is running (e.g. on KDE with gnome schemas installed), so
    // require an actual GNOME session process before trusting its output.
    if !process_running(session.uid, "gnome-shell")? {
        return Ok(None);
    }
    let Some(output) = try_run(&mut gsettings_cmd(
        session,
        ["get", "org.gnome.desktop.screensaver", "lock-enabled"],
    ))?
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
    let idle_secs = try_run(&mut gsettings_cmd(
        session,
        ["get", "org.gnome.desktop.session", "idle-delay"],
    ))?;
    // lock-delay: additional seconds after blank before locking
    let lock_delay_secs = try_run(&mut gsettings_cmd(
        session,
        ["get", "org.gnome.desktop.screensaver", "lock-delay"],
    ))?;

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

/// Builds a `gsettings` invocation that runs as `session`'s user (dropping
/// root privileges) so it reads that user's dconf database, not root's.
fn gsettings_cmd<const N: usize>(session: &UserSession, args: [&str; N]) -> Command {
    let mut cmd = Command::new("gsettings");
    cmd.args(args)
        .uid(session.uid)
        .gid(session.gid)
        .env("HOME", &session.home)
        .env("XDG_RUNTIME_DIR", format!("/run/user/{}", session.uid))
        .env(
            "DBUS_SESSION_BUS_ADDRESS",
            format!("unix:path=/run/user/{}/bus", session.uid),
        );
    cmd
}

fn check_kde(session: &UserSession) -> Result<Option<ScreenLockResult>> {
    if !process_running(session.uid, "plasmashell")? {
        return Ok(None);
    }
    let path = format!("{}/.config/kscreenlockerrc", session.home);
    let conf = match Ini::load_from_file(&path) {
        Ok(conf) => conf,
        Err(ini::Error::Io(err)) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err).with_context(|| format!("failed to read {path}")),
    };
    let daemon = conf.section(Some("Daemon"));
    // KDE defaults Autolock and RequirePassword to true when absent from the file
    let autolock = daemon
        .and_then(|s| s.get("Autolock"))
        .map(|v| v.trim() == "true")
        .unwrap_or(true);
    let require_password = daemon
        .and_then(|s| s.get("RequirePassword"))
        .map(|v| v.trim() == "true")
        .unwrap_or(true);
    // Without a required password the lock provides no real security
    let enabled = autolock && require_password;
    // KDE Timeout is in minutes
    let timeout_ms = daemon
        .and_then(|s| s.get("Timeout"))
        .and_then(|v| v.trim().parse::<i64>().ok())
        .map(|mins| mins * 60 * 1000);
    Ok(Some(ScreenLockResult {
        enabled,
        method: Some("kscreenlocker".to_string()),
        details: Some(format!(
            "plasmashell running, Autolock={autolock}, RequirePassword={require_password}"
        )),
        timeout_ms,
    }))
}

fn check_xscreensaver(session: &UserSession) -> Result<Option<ScreenLockResult>> {
    if !process_running(session.uid, "xscreensaver")? {
        return Ok(None);
    }
    let path = format!("{}/.xscreensaver", session.home);
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

fn check_light_locker(session: &UserSession) -> Result<Option<ScreenLockResult>> {
    if !process_running(session.uid, "light-locker")? {
        return Ok(None);
    }
    // light-locker fires when X screensaver idles; read timeout from `xset
    // q`, run as the user since it queries their X display.
    let mut xset_cmd = Command::new("xset");
    xset_cmd
        .arg("q")
        .uid(session.uid)
        .gid(session.gid)
        .env("HOME", &session.home);
    let timeout_ms = try_run(&mut xset_cmd)?
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

fn check_swaylock(session: &UserSession) -> Result<Option<ScreenLockResult>> {
    if !process_running(session.uid, "swayidle")? {
        return Ok(None);
    }
    // Parse swayidle config for: timeout <secs> 'swaylock ...'
    let config_path = format!("{}/.config/swayidle/config", session.home);
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

/// Returns whether `uid` has a process named `name` running, using `pgrep
/// -u`. Missing `pgrep` itself is treated as "not running" rather than an
/// error; other spawn failures still propagate with context.
fn process_running(uid: u32, name: &str) -> Result<bool> {
    let Some(output) = try_run(Command::new("pgrep").args(["-u", &uid.to_string(), name]))? else {
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
