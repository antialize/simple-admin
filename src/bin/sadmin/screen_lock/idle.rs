//! Screen lock detection for standalone Wayland idle daemons (swayidle,
//! hypridle), which is done by reading their configuration and recognizing
//! commands that run the locker.
//!
//! Only plain commands in a few common forms are recognized (see
//! [`command_action`]); anything else is reported as not locking rather
//! than interpreted like a shell would.

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::Result;

use super::{Finding, UserSession, read_config};
use crate::command::try_run;

pub(super) fn check_swaylock(session: &UserSession) -> Result<Option<Finding>> {
    let procs = user_processes(session.uid, "swayidle")?;
    if procs.is_empty() {
        return Ok(None);
    }
    let mut timeout_secs: Option<i64> = None;
    let mut notes = Vec::new();
    for proc in &procs {
        // swayidle reads events from its command line, e.g. `swayidle -w
        // timeout 300 'swaylock -f'`, and then one per line from its config
        // file. A config that can't be read is skipped by swayidle too.
        let mut events = SwayidleEvents::default();
        let mut args = &proc.args[1.min(proc.args.len())..];
        while let [arg, rest @ ..] = args {
            args = match arg.as_str() {
                "-C" | "-S" => rest.get(1..).unwrap_or_default(),
                a if a.starts_with('-') => rest,
                _ => args.get(events.parse(args)..).unwrap_or_default(),
            };
        }
        match swayidle_config(session, proc) {
            Ok(Some(content)) => {
                for line in content.lines().filter(|l| !l.starts_with('#')) {
                    events.parse(&config_words(line).unwrap_or_default());
                }
            }
            Ok(None) => {}
            Err(err) => notes.push(format!("{err:#}")),
        }
        let lock_locks = events
            .lock
            .is_some_and(|cmd| command_action(&cmd, "swaylock") == Action::RunsLocker);
        if let Some(secs) = shortest_lock_timeout(events.timeouts, "swaylock", lock_locks) {
            timeout_secs = Some(timeout_secs.map_or(secs, |b| b.min(secs)));
        }
    }
    Ok(Some(lock_daemon_finding(
        "swaylock/swayidle",
        "swayidle",
        timeout_secs,
        notes,
    )))
}

/// The swayidle events that matter for locking.
#[derive(Default)]
struct SwayidleEvents {
    /// `timeout <secs> <cmd>` events.
    timeouts: Vec<(i64, String)>,
    /// The `lock` event's command; a later one replaces an earlier one.
    lock: Option<String>,
}

impl SwayidleEvents {
    /// Parses the event at the start of `args`, returning how many words it
    /// used (at least one).
    fn parse(&mut self, args: &[String]) -> usize {
        let arg = |n: usize| args.get(n).map(String::as_str);
        match arg(0) {
            Some("timeout") => {
                if let (Some(secs), Some(cmd)) = (arg(1).and_then(|s| s.parse().ok()), arg(2)) {
                    self.timeouts.push((secs, cmd.to_string()));
                }
                if arg(3) == Some("resume") { 5 } else { 3 }
            }
            Some("lock") => {
                self.lock = arg(1).map(str::to_string);
                2
            }
            Some("before-sleep" | "after-resume" | "unlock" | "idlehint") => 2,
            _ => 1,
        }
    }
}

/// Reads the config file swayidle uses: the last `-C` argument, or else the
/// first existing one of its default locations.
fn swayidle_config(session: &UserSession, proc: &UserProcess) -> Result<Option<String>> {
    if let Some(path) = option_value(&proc.args, &["-C"]) {
        return read_config(&proc.resolve(&path));
    }
    let candidates = [
        config_home(session, proc).join("swayidle/config"),
        Path::new(&session.home).join(".swayidle/config"),
        PathBuf::from("/etc/swayidle/config"),
    ];
    for path in candidates {
        if let Some(content) = read_config(&path)? {
            return Ok(Some(content));
        }
    }
    Ok(None)
}

/// Splits a swayidle config line into words, honoring the single and
/// double quotes it is typically written with. Returns `None` for an
/// unterminated quote.
fn config_words(line: &str) -> Option<Vec<String>> {
    let mut words = Vec::new();
    let mut word: Option<String> = None;
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        match c {
            c if c.is_whitespace() => words.extend(word.take()),
            '\'' => {
                let w = word.get_or_insert_default();
                loop {
                    match chars.next()? {
                        '\'' => break,
                        c => w.push(c),
                    }
                }
            }
            '"' => {
                let w = word.get_or_insert_default();
                loop {
                    match chars.next()? {
                        '"' => break,
                        '\\' => match chars.next()? {
                            c @ ('$' | '`' | '"' | '\\') => w.push(c),
                            c => w.extend(['\\', c]),
                        },
                        c => w.push(c),
                    }
                }
            }
            '\\' => word.get_or_insert_default().push(chars.next()?),
            c => word.get_or_insert_default().push(c),
        }
    }
    words.extend(word);
    Some(words)
}

pub(super) fn check_hypridle(session: &UserSession) -> Result<Option<Finding>> {
    let procs = user_processes(session.uid, "hypridle")?;
    if procs.is_empty() {
        return Ok(None);
    }
    let mut timeout_secs: Option<i64> = None;
    for proc in &procs {
        let path = match option_value(&proc.args, &["-c", "--config"]) {
            Some(path) => proc.resolve(&path),
            None => config_home(session, proc).join("hypr/hypridle.conf"),
        };
        if let Some(secs) = hypridle_lock_timeout(&read_config(&path)?.unwrap_or_default()) {
            timeout_secs = Some(timeout_secs.map_or(secs, |b| b.min(secs)));
        }
    }
    Ok(Some(lock_daemon_finding(
        "hyprlock/hypridle",
        "hypridle",
        timeout_secs,
        Vec::new(),
    )))
}

/// Returns the shortest `timeout` of a hypridle `listener { }` block whose
/// `on-timeout` locks with hyprlock, directly or through `loginctl
/// lock-session` and `general { lock_cmd }`.
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
                (Some("general"), "lock_cmd") => {
                    lock_cmd_locks = command_action(value, "hyprlock") == Action::RunsLocker
                }
                _ => {}
            }
        }
    }
    shortest_lock_timeout(listeners, "hyprlock", lock_cmd_locks)
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

/// The shortest positive timeout whose command locks with `locker`, given
/// whether the daemon's logind lock handler runs it. Daemons don't fire
/// timeouts of zero or less.
fn shortest_lock_timeout(
    timeouts: Vec<(i64, String)>,
    locker: &str,
    lock_handler_locks: bool,
) -> Option<i64> {
    timeouts
        .into_iter()
        .filter(|(secs, cmd)| {
            *secs > 0
                && match command_action(cmd, locker) {
                    Action::RunsLocker => true,
                    Action::RequestsLogindLock => lock_handler_locks,
                    Action::Other => false,
                }
        })
        .map(|(secs, _)| secs)
        .min()
}

/// The finding for an idle daemon whose configuration locks after
/// `timeout_secs`, if a locking command was recognized at all.
fn lock_daemon_finding(
    method: &'static str,
    daemon: &str,
    timeout_secs: Option<i64>,
    notes: Vec<String>,
) -> Finding {
    let mut details = vec![match timeout_secs {
        Some(secs) => format!("{daemon} running, locks after {secs}s"),
        None => format!("{daemon} running, no recognized locking command"),
    }];
    details.extend(notes);
    Finding {
        method,
        locks: timeout_secs.is_some(),
        timeout_ms: timeout_secs.map(|s| s * 1000),
        details: details.join(", "),
    }
}

/// What a shell command run by an idle daemon does, as far as locking goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Action {
    /// Runs the locker program directly.
    RunsLocker,
    /// Asks logind to lock (`loginctl lock-session`), which only locks if
    /// the daemon's lock handler runs the locker.
    RequestsLogindLock,
    Other,
}

/// Characters that make a command more than a plain list of words and
/// operators. Commands containing them are not recognized.
const SPECIAL_CHARS: &[char] = &[
    '\'', '"', '`', '$', '\\', '#', '(', ')', '{', '}', '<', '>', '\n',
];

/// Classifies a plain shell command. Only these forms are recognized:
///
/// - `[...;|&] <lock>`: the last command, after `;` or `&`, is the lock;
/// - `[...;|&] <guard> || <lock>`;
/// - `if ! <guard>; then [...;|&] <lock>; fi`;
///
/// where `<lock>` runs `locker` (with any arguments) or is exactly `loginctl
/// lock-session`, and `<guard>` is `pgrep [-x] <locker>` or `pidof [-x]
/// <locker>`. Commands containing quotes, expansions, comments, parentheses,
/// braces or redirections are not recognized.
fn command_action(cmd: &str, locker: &str) -> Action {
    if cmd.contains(SPECIAL_CHARS) {
        return Action::Other;
    }
    let tokens = plain_tokens(cmd);
    let mut tokens = &tokens[..];
    if let ["if", "!", rest @ ..] = tokens
        && let Some(then) = rest.iter().position(|t| *t == "then")
        && let [guard @ .., ";"] = &rest[..then]
        && is_guard(guard, locker)
        && let [body @ .., ";", "fi"] = &rest[then + 1..]
    {
        tokens = body;
    }
    let Some(mut last) = tokens
        .split(|t| matches!(*t, ";" | "&"))
        .rfind(|command| !command.is_empty())
    else {
        return Action::Other;
    };
    if let Some(or) = last.iter().position(|t| *t == "||")
        && is_guard(&last[..or], locker)
    {
        last = &last[or + 1..];
    }
    if last.iter().any(|t| matches!(*t, "|" | "||" | "&&")) {
        return Action::Other;
    }
    match last {
        [program, ..] if basename(program) == locker => Action::RunsLocker,
        [program, "lock-session"] if basename(program) == "loginctl" => Action::RequestsLogindLock,
        _ => Action::Other,
    }
}

/// Splits a plain command into words and the operators `;`, `&`, `|`, `&&`
/// and `||`.
fn plain_tokens(cmd: &str) -> Vec<&str> {
    let mut tokens = Vec::new();
    for mut word in cmd.split_whitespace() {
        while !word.is_empty() {
            let len = ["&&", "||", ";", "&", "|"]
                .into_iter()
                .find(|op| word.starts_with(op))
                .map_or_else(
                    || word.find([';', '&', '|']).unwrap_or(word.len()),
                    str::len,
                );
            tokens.push(&word[..len]);
            word = &word[len..];
        }
    }
    tokens
}

/// Whether `argv` checks that `locker` is already running.
fn is_guard(argv: &[&str], locker: &str) -> bool {
    match argv {
        [program, "-x", target] | [program, target] => {
            matches!(basename(program), "pgrep" | "pidof") && *target == locker
        }
        _ => false,
    }
}

fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// A running process's pid, argv and environment, read from `/proc`.
struct UserProcess {
    pid: u32,
    args: Vec<String>,
    env: Vec<(String, String)>,
}

impl UserProcess {
    /// Resolves `path` as the process would, i.e. relative paths against
    /// its working directory.
    fn resolve(&self, path: &str) -> PathBuf {
        resolve_path(Path::new(&format!("/proc/{}/cwd", self.pid)), path)
    }
}

/// `path`, made absolute relative to `cwd` if it isn't already.
fn resolve_path(cwd: &Path, path: &str) -> PathBuf {
    cwd.join(path)
}

/// Splits a NUL-terminated `/proc` list such as `cmdline` or `environ`,
/// keeping empty entries such as an empty argument.
fn split_nul(bytes: &[u8]) -> Vec<String> {
    if bytes.is_empty() {
        return Vec::new();
    }
    bytes
        .strip_suffix(&[0])
        .unwrap_or(bytes)
        .split(|&b| b == 0)
        .map(|s| String::from_utf8_lossy(s).into_owned())
        .collect()
}

/// Lists `uid`'s processes named exactly `name`. Processes that exit or
/// can't be read in the meantime are skipped.
fn user_processes(uid: u32, name: &str) -> Result<Vec<UserProcess>> {
    let Some(output) = try_run(Command::new("pgrep").args(["-u", &uid.to_string(), "-x", name]))?
    else {
        return Ok(Vec::new());
    };
    Ok(String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .filter_map(|pid| {
            let pid: u32 = pid.parse().ok()?;
            let args = split_nul(&std::fs::read(format!("/proc/{pid}/cmdline")).ok()?);
            let env = split_nul(&std::fs::read(format!("/proc/{pid}/environ")).ok()?)
                .into_iter()
                .filter_map(|kv| kv.split_once('=').map(|(k, v)| (k.into(), v.into())))
                .collect();
            Some(UserProcess { pid, args, env })
        })
        .collect())
}

/// The process's `$XDG_CONFIG_HOME`, falling back to `~/.config`.
fn config_home(session: &UserSession, proc: &UserProcess) -> PathBuf {
    proc.env
        .iter()
        .find(|(k, v)| k == "XDG_CONFIG_HOME" && !v.is_empty())
        .map(|(_, v)| proc.resolve(v))
        .unwrap_or_else(|| Path::new(&session.home).join(".config"))
}

/// The value of the last of `names` in `args`, as `-c x`, `-cx`, `--config
/// x` or `--config=x`.
fn option_value(args: &[String], names: &[&str]) -> Option<String> {
    let mut value = None;
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        for name in names {
            if arg == name {
                value = args.next().cloned();
            } else if let Some(rest) = arg.strip_prefix(name) {
                if name.starts_with("--") {
                    value = rest.strip_prefix('=').map(str::to_string).or(value);
                } else {
                    value = Some(rest.to_string());
                }
            }
        }
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sway_config(text: &str) -> Option<i64> {
        let mut events = SwayidleEvents::default();
        for line in text.lines().filter(|l| !l.starts_with('#')) {
            events.parse(&config_words(line).unwrap_or_default());
        }
        let lock_locks = events
            .lock
            .is_some_and(|cmd| command_action(&cmd, "swaylock") == Action::RunsLocker);
        shortest_lock_timeout(events.timeouts, "swaylock", lock_locks)
    }

    #[test]
    fn swayidle_timeouts() {
        assert_eq!(
            sway_config("timeout 600 'swaylock -f'\ntimeout 300 'swaylock -f'"),
            Some(300)
        );
        assert_eq!(sway_config("timeout 300 'loginctl lock-session'"), None);
        assert_eq!(
            sway_config("timeout 300 'loginctl lock-session'\nlock 'swaylock -f'"),
            Some(300)
        );
        // A later lock replaces an earlier one.
        assert_eq!(
            sway_config("lock swaylock\ntimeout 300 'loginctl lock-session'\nlock 'echo x'"),
            None
        );
        // One directive per line.
        assert_eq!(
            sway_config("timeout 60 'notify-send idle' timeout 300 'swaylock -f'"),
            None
        );
        assert_eq!(
            sway_config("timeout 290 'notify-send lock' resume swaylock\ntimeout 600 swaylock"),
            Some(600)
        );
        assert_eq!(
            sway_config("timeout 0 swaylock\ntimeout 300 swaylock"),
            Some(300)
        );
        assert_eq!(sway_config(r#"timeout 300 "echo foo \; swaylock""#), None);
        assert_eq!(sway_config("timeout 300 'swaylock"), None);
        assert_eq!(sway_config("# timeout 300 swaylock"), None);
    }

    #[test]
    fn swayidle_command_line() {
        // As started by sway's `exec swayidle -w timeout ... \ ...` once sway
        // has substituted its variables.
        let args: Vec<String> = [
            "swayidle",
            "-w",
            "timeout",
            "600",
            "if ! pgrep swaylock; then playerctl -a pause & swaylock; fi",
            "timeout",
            "630",
            r#"swaymsg "output * power off""#,
            "timeout",
            "30",
            r#"if pgrep swaylock; then swaymsg "output * power off"; fi"#,
            "resume",
            r#"swaymsg "output * power on""#,
            "before-sleep",
            "playerctl -a pause & swaylock",
        ]
        .map(String::from)
        .into();
        let mut events = SwayidleEvents::default();
        let mut rest = &args[2..];
        while !rest.is_empty() {
            rest = rest.get(events.parse(rest)..).unwrap_or_default();
        }
        assert_eq!(
            shortest_lock_timeout(events.timeouts, "swaylock", false),
            Some(600)
        );
    }

    #[test]
    fn hypridle_timeouts() {
        let conf = r#"general {
  before_sleep_cmd=playerctl -a pause; loginctl lock-session
  lock_cmd=pidof hyprlock || hyprlock # lock
}
listener {
  on-timeout=pidof hyprlock && hyprctl dispatch 'hl.dsp.dpms({ action = "disable" })'
  timeout=30
}
listener {
  on-timeout=playerctl -a pause; loginctl lock-session
  timeout=600
}
listener {
  on-timeout=hyprctl dispatch 'hl.dsp.dpms({ action = "disable" })'
  timeout=630
}"#;
        assert_eq!(hypridle_lock_timeout(conf), Some(600));
        let no_lock_cmd = "listener {\n timeout = 300\n on-timeout = loginctl lock-session\n}";
        assert_eq!(hypridle_lock_timeout(no_lock_cmd), None);
        let direct = "listener {\n timeout = 200\n on-timeout = hyprlock\n}";
        assert_eq!(hypridle_lock_timeout(direct), Some(200));
        let guarded = "listener {\n timeout = 200\n on-timeout = pidof hyprlock && hyprlock\n}";
        assert_eq!(hypridle_lock_timeout(guarded), None);
    }

    #[test]
    fn recognized_commands() {
        let action = |cmd| command_action(cmd, "swaylock");
        for cmd in [
            "swaylock",
            "swaylock -f -c 000000",
            "/nix/store/abc-swaylock/bin/swaylock -f",
            "playerctl -a pause; swaylock",
            "playerctl -a pause & swaylock",
            "playerctl -a pause && true; swaylock &",
            "pgrep swaylock || swaylock -f",
            "pidof -x swaylock||swaylock",
            "if ! pgrep swaylock; then playerctl -a pause & swaylock; fi",
            "if ! pgrep -x swaylock; then swaylock; fi",
        ] {
            assert_eq!(action(cmd), Action::RunsLocker, "{cmd}");
        }
        for cmd in [
            "loginctl lock-session",
            "playerctl -a pause; loginctl lock-session",
        ] {
            assert_eq!(action(cmd), Action::RequestsLogindLock, "{cmd}");
        }
        for cmd in [
            "",
            "pgrep swaylock",
            "swaylock; true",
            "pgrep swaylock && swaylock",
            "pidof hyprlock || swaylock",
            "false || swaylock",
            "swaylock | logger",
            "if pgrep swaylock; then swaylock; fi",
            "if ! pgrep swaylock; then swaylock; fi; true",
            "printf '%s\\n' 'notice; swaylock -f'",
            "notify-send x # ; swaylock",
            "sh -c 'swaylock -f'",
            "echo $(swaylock)",
            "swaylock >/dev/null",
            "loginctl unlock-session",
            "echo lock-session",
            "loginctl lock-session 2",
            "loginctl -H host lock-session",
        ] {
            assert_eq!(action(cmd), Action::Other, "{cmd}");
        }
    }

    #[test]
    fn paths() {
        let cwd = Path::new("/proc/42/cwd");
        assert_eq!(
            resolve_path(cwd, "idle.conf"),
            Path::new("/proc/42/cwd/idle.conf")
        );
        assert_eq!(resolve_path(cwd, "/etc/idle"), Path::new("/etc/idle"));
    }

    #[test]
    fn proc_lists() {
        assert_eq!(
            split_nul(b"swayidle\0timeout\x0060\0\0timeout\x00300\0swaylock -f\0"),
            [
                "swayidle",
                "timeout",
                "60",
                "",
                "timeout",
                "300",
                "swaylock -f"
            ]
        );
        assert_eq!(split_nul(b"a\0b"), ["a", "b"]);
        assert!(split_nul(b"").is_empty());
    }

    #[test]
    fn options() {
        let args = |a: &[&str]| -> Vec<String> { a.iter().map(|s| s.to_string()).collect() };
        let config = ["-c", "--config"];
        assert_eq!(
            option_value(&args(&["hypridle", "--config=/x"]), &config).as_deref(),
            Some("/x")
        );
        assert_eq!(
            option_value(&args(&["swayidle", "-C", "/y"]), &["-C"]).as_deref(),
            Some("/y")
        );
        assert_eq!(
            option_value(&args(&["swayidle", "-Ca", "-C", "b"]), &["-C"]).as_deref(),
            Some("b")
        );
        assert_eq!(option_value(&args(&["swayidle", "-w"]), &["-C"]), None);
    }
}
