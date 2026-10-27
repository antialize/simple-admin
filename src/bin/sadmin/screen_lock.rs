use std::fs::File;
use std::io::{self, Read};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result, bail};
use ini::Ini;
use nix::fcntl::OFlag;

use crate::command::try_run;
use crate::report::ScreenLockResult;

mod idle;

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

/// What a probe learned about one lock mechanism it found running.
struct Finding {
    method: &'static str,
    locks: bool,
    timeout_ms: Option<i64>,
    details: String,
}

type ScreenLockProbe = fn(&UserSession) -> Result<Option<Finding>>;

/// Runs every desktop-specific probe applicable to a single user's session
/// and combines what they found.
fn check_session(session: &UserSession) -> ScreenLockResult {
    let mut candidates: Vec<ScreenLockProbe> = vec![check_gnome, check_kde];
    match session.session_type.as_str() {
        "x11" => {
            candidates.push(check_xscreensaver);
            candidates.push(check_light_locker);
        }
        "wayland" => {
            candidates.push(idle::check_hypridle);
            candidates.push(idle::check_swaylock);
        }
        _ => {}
    }

    let mut findings = Vec::new();
    let mut notes = Vec::new();
    for check in candidates {
        match check(session) {
            Ok(Some(finding)) => findings.push(finding),
            Ok(None) => {}
            Err(err) => notes.push(format!("{err:#}")),
        }
    }
    combine(&session.session_type, findings, notes)
}

/// The session locks if any mechanism found locks; the reported timeout is
/// the shortest among those. Without a locking mechanism, method and
/// timeout describe whatever was found instead.
fn combine(session_type: &str, findings: Vec<Finding>, notes: Vec<String>) -> ScreenLockResult {
    let enabled = findings.iter().any(|f| f.locks);
    let relevant: Vec<&Finding> = findings.iter().filter(|f| f.locks || !enabled).collect();
    let mut details: Vec<String> = findings
        .iter()
        .map(|f| format!("{}: {}", f.method, f.details))
        .collect();
    if findings.is_empty() {
        details.push(format!(
            "no supported screen lock mechanism detected (session type: {session_type})"
        ));
    }
    details.extend(notes);
    ScreenLockResult {
        enabled,
        method: if relevant.is_empty() {
            None
        } else {
            Some(
                relevant
                    .iter()
                    .map(|f| f.method)
                    .collect::<Vec<_>>()
                    .join(", "),
            )
        },
        details: Some(details.join("; ")),
        timeout_ms: relevant.iter().filter_map(|f| f.timeout_ms).min(),
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

fn check_gnome(session: &UserSession) -> Result<Option<Finding>> {
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

    Ok(Some(Finding {
        method: "gnome-screensaver",
        locks: enabled,
        timeout_ms,
        details: format!("lock-enabled={text}"),
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

fn check_kde(session: &UserSession) -> Result<Option<Finding>> {
    if !process_running(session.uid, "plasmashell")? {
        return Ok(None);
    }
    let path = Path::new(&session.home).join(".config/kscreenlockerrc");
    let Some(content) = read_config(&path)? else {
        return Ok(None);
    };
    let conf = Ini::load_from_str(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
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
    Ok(Some(Finding {
        method: "kscreenlocker",
        locks: enabled,
        timeout_ms,
        details: format!(
            "plasmashell running, Autolock={autolock}, RequirePassword={require_password}"
        ),
    }))
}

fn check_xscreensaver(session: &UserSession) -> Result<Option<Finding>> {
    if !process_running(session.uid, "xscreensaver")? {
        return Ok(None);
    }
    let path = Path::new(&session.home).join(".xscreensaver");
    let Some(content) = read_config(&path)? else {
        return Ok(None);
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
    Ok(Some(Finding {
        method: "xscreensaver",
        locks: enabled,
        timeout_ms,
        details: format!("xscreensaver running, lock={enabled}"),
    }))
}

fn check_light_locker(session: &UserSession) -> Result<Option<Finding>> {
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
    Ok(Some(Finding {
        method: "light-locker",
        locks: true,
        timeout_ms,
        details: "light-locker process running".to_string(),
    }))
}

/// Largest config file [`read_config`] will read.
const MAX_CONFIG_BYTES: u64 = 1 << 20;

/// Reads a user-controlled config file, returning `None` if it is missing.
/// This runs as root, so only regular files of at most [`MAX_CONFIG_BYTES`]
/// are read: a FIFO, device or huge file could otherwise hang the check or
/// exhaust memory. The file is opened non-blocking so that opening a FIFO
/// doesn't wait for a writer.
fn read_config(path: &Path) -> Result<Option<String>> {
    let file = match File::options()
        .read(true)
        .custom_flags(OFlag::O_NONBLOCK.bits())
        .open(path)
    {
        Ok(file) => file,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err).with_context(|| format!("failed to open {}", path.display())),
    };
    let metadata = file
        .metadata()
        .with_context(|| format!("failed to stat {}", path.display()))?;
    if !metadata.is_file() {
        bail!("{} is not a regular file", path.display());
    }
    let mut content = Vec::new();
    file.take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut content)
        .with_context(|| format!("failed to read {}", path.display()))?;
    if content.len() as u64 > MAX_CONFIG_BYTES {
        bail!("{} is larger than {MAX_CONFIG_BYTES} bytes", path.display());
    }
    Ok(Some(String::from_utf8_lossy(&content).into_owned()))
}

/// Returns whether `uid` has a process named exactly `name` running, using
/// `pgrep -u -x`, so e.g. `gnome-shell-calendar-server` doesn't count as
/// `gnome-shell`. Missing `pgrep` itself is treated as "not running" rather
/// than an error; other spawn failures still propagate with context.
fn process_running(uid: u32, name: &str) -> Result<bool> {
    let Some(output) = try_run(Command::new("pgrep").args(["-u", &uid.to_string(), "-x", name]))?
    else {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn finding(method: &'static str, locks: bool, timeout_ms: Option<i64>) -> Finding {
        Finding {
            method,
            locks,
            timeout_ms,
            details: String::new(),
        }
    }

    #[test]
    fn combined_findings() {
        let r = combine(
            "wayland",
            vec![
                finding("hyprlock/hypridle", false, None),
                finding("swaylock/swayidle", true, Some(300_000)),
            ],
            vec![],
        );
        assert!(r.enabled);
        assert_eq!(r.method.as_deref(), Some("swaylock/swayidle"));
        assert_eq!(r.timeout_ms, Some(300_000));

        let r = combine(
            "wayland",
            vec![
                finding("a", true, Some(600_000)),
                finding("b", true, Some(300_000)),
                finding("c", false, Some(60_000)),
            ],
            vec![],
        );
        assert_eq!(r.timeout_ms, Some(300_000));
        assert_eq!(r.method.as_deref(), Some("a, b"));

        let r = combine(
            "x11",
            vec![finding("gnome-screensaver", false, Some(1))],
            vec![],
        );
        assert!(!r.enabled);
        assert_eq!(r.method.as_deref(), Some("gnome-screensaver"));

        let r = combine("x11", vec![], vec!["oops".into()]);
        assert!(!r.enabled);
        assert_eq!(r.method, None);
        assert!(r.details.unwrap().contains("oops"));
    }

    #[test]
    fn config_files() {
        let dir = std::env::temp_dir().join(format!("sadmin-screen-lock-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("config");
        std::fs::write(&file, "timeout 300 swaylock").unwrap();
        assert_eq!(
            read_config(&file).unwrap().as_deref(),
            Some("timeout 300 swaylock")
        );
        assert_eq!(read_config(&dir.join("missing")).unwrap(), None);
        assert!(read_config(&dir).is_err());
        let fifo = dir.join("fifo");
        nix::unistd::mkfifo(&fifo, nix::sys::stat::Mode::S_IRWXU).unwrap();
        assert!(read_config(&fifo).is_err());
        std::fs::write(&file, vec![b'x'; MAX_CONFIG_BYTES as usize + 1]).unwrap();
        assert!(read_config(&file).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
