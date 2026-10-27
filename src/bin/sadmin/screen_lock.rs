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
            candidates.push(check_hypridle);
            candidates.push(check_swaylock);
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

fn check_swaylock(session: &UserSession) -> Result<Option<Finding>> {
    let procs = user_processes(session.uid, "swayidle")?;
    if procs.is_empty() {
        return Ok(None);
    }
    // swayidle events (`timeout <secs> <cmd>`) come from its config file
    // and/or its command line, e.g. `swayidle -w timeout 300 'swaylock -f'`.
    let mut timeout_secs: Option<i64> = None;
    for proc in &procs {
        let config_path = option_value(&proc.args, &["-C"])
            .unwrap_or_else(|| format!("{}/swayidle/config", config_home(session, proc)));
        let mut tokens: Vec<String> = read_optional(&config_path)?
            .lines()
            .flat_map(shell_words)
            .collect();
        tokens.extend(proc.args.iter().skip(1).cloned());
        if let Some(secs) = swayidle_lock_timeout(&tokens) {
            timeout_secs = Some(timeout_secs.map_or(secs, |b| b.min(secs)));
        }
    }
    Ok(Some(lock_daemon_finding(
        "swaylock/swayidle",
        "swayidle",
        timeout_secs,
    )))
}

/// The finding for an idle daemon whose configuration locks after
/// `timeout_secs`, if a locking command was recognized at all.
fn lock_daemon_finding(method: &'static str, daemon: &str, timeout_secs: Option<i64>) -> Finding {
    Finding {
        method,
        locks: timeout_secs.is_some(),
        timeout_ms: timeout_secs.map(|s| s * 1000),
        details: match timeout_secs {
            Some(secs) => format!("{daemon} running, locks after {secs}s"),
            None => format!("{daemon} running, no recognized locking command"),
        },
    }
}

/// Returns the shortest swayidle `timeout <secs> <cmd>` whose command runs
/// swaylock, or asks logind to lock while a `lock` event runs swaylock.
/// `tokens` are whole arguments, so each command is a single token.
fn swayidle_lock_timeout(tokens: &[String]) -> Option<i64> {
    let mut timeouts: Vec<(i64, &str)> = Vec::new();
    let mut lock_event_locks = false;
    let mut i = 0;
    while i < tokens.len() {
        let arg = |n: usize| tokens.get(i + n).map(String::as_str);
        match tokens[i].as_str() {
            "timeout" => {
                if let (Some(secs), Some(cmd)) = (arg(1).and_then(|s| s.parse().ok()), arg(2)) {
                    timeouts.push((secs, cmd));
                }
                let step = if arg(3) == Some("resume") { 5 } else { 3 };
                i += step;
            }
            "lock" => {
                lock_event_locks |= arg(1).is_some_and(|cmd| runs(cmd, "swaylock"));
                i += 2;
            }
            "before-sleep" | "after-resume" | "unlock" | "idlehint" | "-C" | "-S" => i += 2,
            _ => i += 1,
        }
    }
    timeouts
        .into_iter()
        .filter(|(_, cmd)| {
            runs(cmd, "swaylock") || (cmd.contains("lock-session") && lock_event_locks)
        })
        .map(|(secs, _)| secs)
        .min()
}

/// Whether shell command `cmd` invokes `program`, as opposed to merely
/// mentioning it (e.g. `pgrep swaylock` or `pidof hyprlock`). Wrappers such
/// as `sh -c` or `env` are not looked through.
fn runs(cmd: &str, program: &str) -> bool {
    cmd.split([';', '&', '|']).any(|part| {
        part.split_whitespace()
            .find(|w| !matches!(*w, "then" | "else" | "do" | "exec" | "!"))
            .is_some_and(|w| w.rsplit('/').next() == Some(program))
    })
}

fn check_hypridle(session: &UserSession) -> Result<Option<Finding>> {
    let procs = user_processes(session.uid, "hypridle")?;
    if procs.is_empty() {
        return Ok(None);
    }
    let mut timeout_secs: Option<i64> = None;
    for proc in &procs {
        let path = option_value(&proc.args, &["-c", "--config"])
            .unwrap_or_else(|| format!("{}/hypr/hypridle.conf", config_home(session, proc)));
        if let Some(secs) = hypridle_lock_timeout(&read_optional(&path)?) {
            timeout_secs = Some(timeout_secs.map_or(secs, |b| b.min(secs)));
        }
    }
    Ok(Some(lock_daemon_finding(
        "hyprlock/hypridle",
        "hypridle",
        timeout_secs,
    )))
}

/// Returns the shortest `timeout` of a hypridle `listener { }` block whose
/// `on-timeout` runs hyprlock directly, or runs `loginctl lock-session` while
/// `general { lock_cmd }` runs hyprlock. A mere `pidof hyprlock` check does
/// not count as locking.
fn hypridle_lock_timeout(content: &str) -> Option<i64> {
    let mut block: Option<String> = None;
    let mut lock_cmd_locks = false;
    let mut listeners: Vec<(i64, String)> = Vec::new();
    let (mut timeout, mut on_timeout) = (None, None);
    for line in content.lines() {
        let line = strip_hyprlang_comment(line);
        let line = line.trim();
        if let Some(name) = line.strip_suffix('{') {
            block = Some(name.trim().to_string());
            (timeout, on_timeout) = (None, None);
        } else if line == "}" {
            if block.as_deref() == Some("listener")
                && let (Some(t), Some(cmd)) = (timeout, on_timeout.take())
            {
                listeners.push((t, cmd));
            }
            block = None;
        } else if let Some((key, value)) = line.split_once('=') {
            let value = value.trim();
            match (block.as_deref(), key.trim()) {
                (Some("listener"), "timeout") => timeout = value.parse::<i64>().ok(),
                (Some("listener"), "on-timeout") => on_timeout = Some(value.to_string()),
                (Some("general"), "lock_cmd") => lock_cmd_locks = runs(value, "hyprlock"),
                _ => {}
            }
        }
    }
    listeners
        .into_iter()
        .filter(|(_, cmd)| {
            runs(cmd, "hyprlock") || (cmd.contains("lock-session") && lock_cmd_locks)
        })
        .map(|(t, _)| t)
        .min()
}

/// Removes a hyprlang `#` comment; `##` is an escaped literal `#`.
fn strip_hyprlang_comment(line: &str) -> String {
    let mut out = String::new();
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '#' {
            if chars.peek() != Some(&'#') {
                break;
            }
            chars.next();
        }
        out.push(c);
    }
    out
}

/// Splits one line into words like a POSIX shell (quotes, backslashes and
/// `#` comments), which is how swayidle reads its config file.
fn shell_words(line: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut word: Option<String> = None;
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        match c {
            c if c.is_whitespace() => words.extend(word.take()),
            '#' if word.is_none() => break,
            '\'' => {
                let w = word.get_or_insert_default();
                w.extend(chars.by_ref().take_while(|&c| c != '\''));
            }
            '"' => {
                let w = word.get_or_insert_default();
                while let Some(c) = chars.next() {
                    match c {
                        '"' => break,
                        '\\' => w.extend(chars.next()),
                        c => w.push(c),
                    }
                }
            }
            '\\' => word.get_or_insert_default().extend(chars.next()),
            c => word.get_or_insert_default().push(c),
        }
    }
    words.extend(word);
    words
}

/// A running process's argv and environment, read from `/proc`.
struct UserProcess {
    args: Vec<String>,
    env: Vec<(String, String)>,
}

/// Lists `uid`'s processes named exactly `name`. Processes that exit or
/// can't be read in the meantime are skipped.
fn user_processes(uid: u32, name: &str) -> Result<Vec<UserProcess>> {
    let Some(output) = try_run(Command::new("pgrep").args(["-u", &uid.to_string(), "-x", name]))?
    else {
        return Ok(Vec::new());
    };
    let split = |bytes: Vec<u8>| -> Vec<String> {
        bytes
            .split(|&b| b == 0)
            .filter(|s| !s.is_empty())
            .map(|s| String::from_utf8_lossy(s).into_owned())
            .collect()
    };
    Ok(String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .filter_map(|pid| {
            let args = split(std::fs::read(format!("/proc/{pid}/cmdline")).ok()?);
            let env = split(std::fs::read(format!("/proc/{pid}/environ")).ok()?)
                .into_iter()
                .filter_map(|kv| kv.split_once('=').map(|(k, v)| (k.into(), v.into())))
                .collect();
            Some(UserProcess { args, env })
        })
        .collect())
}

/// The process's `$XDG_CONFIG_HOME`, falling back to `~/.config`.
fn config_home(session: &UserSession, proc: &UserProcess) -> String {
    proc.env
        .iter()
        .find(|(k, v)| k == "XDG_CONFIG_HOME" && !v.is_empty())
        .map(|(_, v)| v.clone())
        .unwrap_or_else(|| format!("{}/.config", session.home))
}

/// The value of the first of `names` in `args`, as `-c x`, `--config x` or
/// `--config=x`.
fn option_value(args: &[String], names: &[&str]) -> Option<String> {
    args.iter().enumerate().find_map(|(i, arg)| {
        names.iter().find_map(|name| {
            if arg == name {
                args.get(i + 1).cloned()
            } else {
                arg.strip_prefix(name)?
                    .strip_prefix('=')
                    .map(str::to_string)
            }
        })
    })
}

/// Reads `path`, treating a missing file as empty.
fn read_optional(path: &str) -> Result<String> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(String::new()),
        Err(err) => Err(err).with_context(|| format!("failed to read {path}")),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sway(text: &str) -> Option<i64> {
        let tokens: Vec<String> = text.lines().flat_map(shell_words).collect();
        swayidle_lock_timeout(&tokens)
    }

    #[test]
    fn swayidle_timeouts() {
        assert_eq!(
            sway("timeout 600 'swaylock -f'\ntimeout 300 'swaylock -f'"),
            Some(300)
        );
        assert_eq!(sway("timeout 300 'pgrep swaylock && swaymsg x'"), None);
        assert_eq!(
            sway("timeout 300 'pgrep swaylock || swaylock -f'"),
            Some(300)
        );
        assert_eq!(sway("timeout 300 'loginctl lock-session'"), None);
        assert_eq!(
            sway("timeout 300 'loginctl lock-session'\nlock 'swaylock -f' # comment"),
            Some(300)
        );
        assert_eq!(
            sway(r#"timeout 290 'notify-send "will lock"' timeout 300 'swaylock -f'"#),
            Some(300)
        );
        assert_eq!(
            sway("timeout 290 'notify-send lock' resume 'swaylock' timeout 600 swaylock"),
            Some(600)
        );
    }

    #[test]
    fn hypridle_timeouts() {
        let conf = "general {\n  lock_cmd = pidof hyprlock || hyprlock # lock\n}\n\
            listener {\n  timeout = 300 # 5 min\n  on-timeout = loginctl lock-session\n} # end\n\
            listener {\n  timeout = 120\n  on-timeout = brightnessctl -s set 10\n}\n";
        assert_eq!(hypridle_lock_timeout(conf), Some(300));
        let no_lock_cmd = "listener {\n timeout = 300\n on-timeout = loginctl lock-session\n}";
        assert_eq!(hypridle_lock_timeout(no_lock_cmd), None);
        let direct = "listener {\n timeout = 200\n on-timeout = hyprlock\n}";
        assert_eq!(hypridle_lock_timeout(direct), Some(200));
    }

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
    fn options() {
        let args: Vec<String> = ["hypridle", "--config=/x"].map(String::from).into();
        assert_eq!(
            option_value(&args, &["-c", "--config"]).as_deref(),
            Some("/x")
        );
        let args: Vec<String> = ["swayidle", "-C", "/y"].map(String::from).into();
        assert_eq!(option_value(&args, &["-C"]).as_deref(), Some("/y"));
    }
}
