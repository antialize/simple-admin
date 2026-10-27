//! Screen lock detection for standalone Wayland idle daemons (swayidle,
//! hypridle), which is done by reading their configuration and recognizing
//! commands that run the locker.

use std::path::Path;
use std::process::Command;

use anyhow::Result;

use super::{Finding, UserSession, read_config};
use crate::command::try_run;

pub(super) fn check_swaylock(session: &UserSession) -> Result<Option<Finding>> {
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
        let mut tokens: Vec<String> = read_config(Path::new(&config_path))?
            .unwrap_or_default()
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

pub(super) fn check_hypridle(session: &UserSession) -> Result<Option<Finding>> {
    let procs = user_processes(session.uid, "hypridle")?;
    if procs.is_empty() {
        return Ok(None);
    }
    let mut timeout_secs: Option<i64> = None;
    for proc in &procs {
        let path = option_value(&proc.args, &["-c", "--config"])
            .unwrap_or_else(|| format!("{}/hypr/hypridle.conf", config_home(session, proc)));
        if let Some(secs) =
            hypridle_lock_timeout(&read_config(Path::new(&path))?.unwrap_or_default())
        {
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
