use std::io;
use std::process::{Command, Output};

use anyhow::{Context, Result};

/// Runs `cmd` and returns its output.
///
/// If the executable itself cannot be found (`io::ErrorKind::NotFound`),
/// this returns `Ok(None)` so callers can treat "tool not installed" as a
/// normal, non-fatal outcome. Any other failure (e.g. permission denied) is
/// returned as an `Err` with context describing which command failed.
pub fn try_run(cmd: &mut Command) -> Result<Option<Output>> {
    match cmd.output() {
        Ok(output) => Ok(Some(output)),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err).with_context(|| format!("failed to execute {cmd:?}")),
    }
}
