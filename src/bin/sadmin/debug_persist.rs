use crate::persist_daemon;
use anyhow::{Result, bail};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Debug persist daemon
#[derive(clap::Parser)]
pub struct DebugPersist {}

pub async fn run(_: DebugPersist) -> Result<()> {
    simple_logger::SimpleLogger::new().init().unwrap();

    let mut socket = tokio::net::UnixStream::connect(persist_daemon::SOCKET_PATH).await?;

    let mut v = serde_json::to_vec(&persist_daemon::Message::ListFds {
        id: 0,
        key_prefix: None,
    })?;
    socket.write_u32(v.len().try_into()?).await?;
    socket.write_all(&v).await?;
    socket.flush().await?;

    let l = socket.read_u32().await?;
    v.resize(l.try_into()?, 0);
    socket.read_exact(&mut v).await?;
    let msg: persist_daemon::Message = serde_json::from_slice(&v)?;

    let mut fd_keys = match msg {
        persist_daemon::Message::ListFdsResult { id: _, fd_keys } => fd_keys,
        _ => bail!("Unexpected message"),
    };

    fd_keys.sort_unstable();
    println!(
        "======================================> fds <============================================"
    );
    for fd in fd_keys {
        println!("{fd}");
    }

    Ok(())
}
