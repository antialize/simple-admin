use anyhow::{Context, Result, bail};
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use bytes::BytesMut;
use futures_util::{SinkExt, StreamExt};
use sadmin2::action_types::{
    IClientAction, ICommandSignal, ICommandSpawn, ICommandStdin, IRequestInitialState,
    IServerAction, ObjectType,
};
use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::signal;
use tokio::{pin, select};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite};

use crate::connection::{Config, Connection, ConnectionRecvRes};

/// Deauthenticate your user
#[derive(clap::Parser)]
pub struct Shell {
    host: String,
}

/// Deauthenticate your user
#[derive(clap::Parser)]
pub struct Run {
    host: String,
    /// Run Command with this env format is k=v can be specified multiple times
    /// if the value is omitted copy it from the env of this process
    #[clap(long)]
    env: Vec<String>,
    /// Run command with this work dir
    #[clap(long)]
    cwd: Option<String>,
    /// Do not forward stdout
    #[clap(long)]
    no_stdout: bool,
    /// Do not forward stderr
    #[clap(long)]
    no_stderr: bool,
    // Do not forward stdin
    #[clap(long)]
    no_stdin: bool,

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

    c.send(&IClientAction::RequestInitialState(IRequestInitialState {}))
        .await?;

    let state = loop {
        if let IServerAction::SetInitialState(s) = c.recv().await? {
            break s;
        }
    };

    let mut host_id = None;
    if let Some(v) = state.object_names_and_ids.get(&ObjectType::Id(2)) {
        for obj in v {
            if obj.name == host {
                host_id = Some(obj.id);
                break;
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
        use nix::libc::{STDIN_FILENO, TIOCGWINSZ, ioctl, winsize};
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
    send.send(tungstenite::Message::text(format!(
        "dexport LINES={} COLUMNS={}\n\0",
        lines, cols
    )))
    .await?;

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
    let mut c = Connection::open(config, false).await?;
    c.prompt_auth().await?;
    let (send, mut recv) = c.split();

    let send = send.into2();
    const SPAWN_MSG_ID: u64 = 1;
    let next_msg_id = AtomicU64::new(SPAWN_MSG_ID + 1);
    let next_msg_id = &next_msg_id;
    let command_id = 0;

    let env = if args.env.is_empty() {
        None
    } else {
        let mut env = HashMap::new();
        for v in args.env {
            match v.split_once("=") {
                Some((k, v)) => {
                    env.insert(k.to_string(), v.to_string());
                }
                None => {
                    if let Ok(w) = std::env::var(&v) {
                        env.insert(v, w);
                    }
                }
            }
        }
        Some(env)
    };

    // Send spawn message
    let msg = IClientAction::CommandSpawn(ICommandSpawn {
        msg_id: SPAWN_MSG_ID,
        command_id,
        host: args.host,
        program: args.command,
        args: args.args,
        forward_stdin: !args.no_stdin,
        forward_stdout: !args.no_stdout,
        forward_stderr: !args.no_stdout,
        env,
        cwd: args.cwd,
    });
    let mut do_send_spawn = true;
    let send_spawn = send.send_message_with_response(&msg);
    pin!(send_spawn);

    let mut stdout = tokio::io::stdout();
    let mut stderr = tokio::io::stdout();

    let send2 = send.clone();
    let mut do_process_stdin = false;
    let process_stdin = async move {
        let mut stdin_buf = BytesMut::with_capacity(64 * 1024);
        let mut stdin = tokio::io::stdin();
        loop {
            let r = stdin.read_buf(&mut stdin_buf).await?;
            let data = if r == 0 {
                None
            } else {
                let data = BASE64_STANDARD.encode(&stdin_buf);
                stdin_buf.clear();
                Some(data)
            };
            let msg_id = next_msg_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let stop = data.is_none();
            send2
                .send_message_with_response(&IClientAction::CommandStdin(ICommandStdin {
                    msg_id,
                    command_id,
                    data,
                }))
                .await
                .context("Failed sending stdin to remote command")?;
            if stop {
                return Ok::<_, anyhow::Error>(());
            }
        }
    };
    pin!(process_stdin);

    let send2 = send.clone();
    let mut do_process_ctrl_c: bool = true;
    let process_ctrl_c = async move {
        signal::ctrl_c().await.context("Reading ctrl+c")?;
        let msg_id = next_msg_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        send2
            .send_message_with_response(&IClientAction::CommandSignal(ICommandSignal {
                msg_id,
                command_id,
                signal: 2,
            }))
            .await
            .context("Failed sending sigint to remote command")?;
        Ok::<_, anyhow::Error>(())
    };
    pin!(process_ctrl_c);

    loop {
        select! {
            r = &mut send_spawn, if do_send_spawn => {
                r.context("Unable to spawn remote process")?;
                do_send_spawn = false;
            }
            r = &mut process_stdin, if do_process_stdin => {
                r.context("Process stdin failed")?;
                do_process_stdin = false;
            }
            r = recv.recv() => {
                match r.context("Failed to recv message from backend")? {
                    ConnectionRecvRes::Message(IServerAction::Response(r)) => {
                        if r.msg_id == SPAWN_MSG_ID {
                            if let Some(e) = r.error {
                                bail!("Failed to spawn process: {}", e);
                            }
                            do_process_stdin = !args.no_stdin;
                        } else {
                            send.handle_response(r.msg_id, IServerAction::Response(r));
                        }
                    },
                    ConnectionRecvRes::Message(IServerAction::CommandFinished(a)) => {
                        if let Some(signal) = a.signal {
                            if signal != 2 || do_process_ctrl_c {
                                eprintln!("Command finished with signal: {}", signal);
                            }
                        }
                        std::process::exit(a.code);
                    }
                    ConnectionRecvRes::Message(IServerAction::CommandStdout(a)) => {
                        if let Some(d) = a.data {
                            stdout.write_all(&BASE64_STANDARD.decode(&d)?).await?;
                            stdout.flush().await?;
                        } else {
                            //let _ = close(1).context("Closing stdout");
                        }
                    }
                    ConnectionRecvRes::Message(IServerAction::CommandStderr(a)) => {
                        if let Some(d) = a.data {
                            stderr.write_all(&BASE64_STANDARD.decode(&d)?).await?;
                            stderr.flush().await?;
                        } else {
                            //let _ = close(2).context("Closing stderr");
                        }
                    }
                    ConnectionRecvRes::Message(_) => (),
                    ConnectionRecvRes::SendPong(v) => send.pong(v).await?,
                }
            }
            r = &mut process_ctrl_c, if do_process_ctrl_c => {
                r?;
                do_process_ctrl_c = false;
            }
        }
    }
}
