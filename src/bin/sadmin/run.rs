use anyhow::{bail, Result};
use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::signal;
use tokio_tungstenite::{tungstenite, MaybeTlsStream, WebSocketStream};

use crate::{
    connection::{Config, Connection},
    message::Message,
};

/// Deauthenticate your user
#[derive(clap::Parser)]
pub struct Shell {
    host: String,
}

/// Deauthenticate your user
#[derive(clap::Parser)]
pub struct Run {
    host: String,
    command: String,
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    args: Vec<String>,
}

async fn connect(
    config: Config,
    host: String,
    lines: i32,
    cols: i32,
) -> Result<WebSocketStream<MaybeTlsStream<TcpStream>>> {
    let protocol = if config.server_insecure == Some(true) {
        "ws://"
    } else {
        "wss://"
    };
    let server_port = config.server_port;

    let mut c = Connection::open(config, false).await?;
    c.prompt_auth().await?;

    c.send(&Message::RequestInitialState {}).await?;

    let state = loop {
        if let Message::SetInitialState(s) = c.recv().await? {
            break s;
        }
    };

    let mut host_id = None;
    if let Some(v) = state.object_names_and_ids.get("2") {
        for obj in v {
            if let Some(name) = &obj.name {
                if name == &host {
                    host_id = Some(obj.id);
                    break;
                }
            }
        }
    }
    let host_id = match host_id {
        Some(v) => v,
        None => bail!("Unable to find host"),
    };
    let url = format!(
        "{}{}:{}/terminal?server={}&cols={}&rows={}&session={}",
        protocol, c.server_host, server_port, host_id, cols, lines, c.session
    );
    let (stream, _) = tokio_tungstenite::connect_async(url)
        .await
        .expect("Failed to connect");
    Ok(stream)
}

pub async fn shell(config: Config, args: Shell) -> Result<()> {
    let mut lines = 60;
    let mut cols = 120;

    #[cfg(feature = "nix")]
    unsafe {
        use nix::libc::{STDIN_FILENO, ioctl, winsize, TIOCGWINSZ};
        let mut res: winsize = std::mem::zeroed();
        if ioctl(STDIN_FILENO, TIOCGWINSZ, &mut res) != -1 {
            lines = res.ws_row.into();
            cols = res.ws_col.into();
        }
    }
    if let Ok(v) = std::env::var("LINES") {
        lines = v.parse()?;
    }
    if let Ok(v) = std::env::var("COLUMNS") {
        cols = v.parse()?;
    }

    let (mut send, mut recv) = connect(config, args.host, lines, cols).await?.split();
    send.send(tungstenite::Message::text(format!("dexport LINES={} COLUMNS={}\n\0", lines, cols))).await?;

    #[cfg(feature = "nix")]
    let old = {
        use nix::sys::termios::LocalFlags;
        let old = nix::sys::termios::tcgetattr(unsafe { std::os::fd::BorrowedFd::borrow_raw(0) })?;
        let mut new = old.clone();
        new.local_flags.remove(LocalFlags::ICANON);
        new.local_flags.remove(LocalFlags::ECHO);

        nix::sys::termios::tcsetattr(
            unsafe { std::os::fd::BorrowedFd::borrow_raw(0) },
            nix::sys::termios::SetArg::TCSANOW,
            &new,
        )?;

        old
    };

    let handle_input = async {
        let mut stdin = tokio::io::stdin();
        loop {
            let mut buf: Vec<u8> = Vec::with_capacity(1024);
            let ctrlc = signal::ctrl_c();
            let use_buf = tokio::select!(
                v = stdin.read_buf(&mut buf) => {
                    v?;
                    true
                }
                _ = ctrlc => {
                    false
                }
            );
            if use_buf {
                send.send(tungstenite::Message::text(format!(
                    "d{}\0",
                    String::from_utf8(buf)?
                )))
                .await?;
            } else {
                send.send(tungstenite::Message::text("d\x03\0".to_string()))
                    .await?;
            }
        }
        #[allow(unreachable_code)]
        Ok::<_, anyhow::Error>(())
    };

    let handle_stdout = async {
        while let Some(data) = recv.next().await {
            match data? {
                tungstenite::Message::Text(t) => {
                    let mut stdout = tokio::io::stdout();
                    stdout.write_all(t.as_bytes()).await?;
                    stdout.flush().await?;
                }
                tungstenite::Message::Close(_) => break,
                _ => (),
            }
        }
        Ok::<(), anyhow::Error>(())
    };

    tokio::select! {
        _ = handle_input => {},
        _ = handle_stdout => {}
    };

    #[cfg(feature = "nix")]
    nix::sys::termios::tcsetattr(
        unsafe { std::os::fd::BorrowedFd::borrow_raw(0) },
        nix::sys::termios::SetArg::TCSANOW,
        &old,
    )?;
    Ok(())
}

pub async fn run(config: Config, args: Run) -> Result<()> {
    let (mut send, mut recv) = connect(config, args.host, 60, 100).await?.split();

    let mut cmd = String::new();
    for arg in [args.command].iter().chain(&args.args) {
        if cmd.is_empty() {
            cmd.push('d');
        } else {
            cmd.push(' ');
        }
        for c in arg.chars() {
            if matches!(c, '$' | '`' | '\\' | '\"') {
                cmd.push('\\');
            }
            cmd.push(c);
        }
    }
    cmd.push('\n');
    cmd.push('\0');

    let send_command = async {
        send.send(tungstenite::Message::text(cmd)).await?;
        send.send(tungstenite::Message::text("d\x04\0")).await?;
        tokio::time::sleep(Duration::from_secs(100000000)).await;
        Ok::<_, anyhow::Error>(())
    };

    let handle_stdout = async {
        while let Some(data) = recv.next().await {
            match data? {
                tungstenite::Message::Text(t) => {
                    let mut stdout = tokio::io::stdout();
                    stdout.write_all(t.as_bytes()).await?;
                    stdout.flush().await?;
                }
                tungstenite::Message::Close(_) => break,
                _ => (),
            }
        }
        Ok::<(), anyhow::Error>(())
    };

    tokio::select! {
        _ = send_command => {},
        _ = handle_stdout => {}
    };

    Ok(())
}
