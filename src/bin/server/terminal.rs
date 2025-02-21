use std::sync::{Arc, Weak};

use anyhow::{Context, Result, bail};
use axum::{
    extract::{
        Query, State as WState, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    response::Response,
};
use base64::{Engine, prelude::BASE64_STANDARD};
use futures::{FutureExt, SinkExt, StreamExt, pin_mut, select};
use log::error;
use sadmin2::client_message::{
    ClientHostMessage, DataMessage, HostClientMessage, RunScriptMessage, RunScriptOutType,
    RunScriptStdinType,
};
use serde::Deserialize;

use crate::{
    get_auth::get_auth,
    hostclient::HostClient,
    state::State,
    web_util::{ClientIp, WebError},
};

async fn inner(
    socket: WebSocket,
    host_client: Weak<HostClient>,
    rows: usize,
    cols: usize,
) -> Result<()> {
    let content = r#"
import pty
import os
import sys
import termios
import struct
import fcntl
import select

(pid, fd) = pty.fork()
if pid == 0:
    os.environ['name'] = 'xterm-color'
    os.environ['TERM'] = 'xterm'
    os.execl("/bin/bash", "/bin/bash")

flag = fcntl.fcntl(0, fcntl.F_GETFL)
fcntl.fcntl(0, fcntl.F_SETFL, flag | os.O_NONBLOCK)

flag = fcntl.fcntl(fd, fcntl.F_GETFL)
fcntl.fcntl(fd, fcntl.F_SETFL, flag | os.O_NONBLOCK)

data= b'';
while True:
    r, _, _ = select.select([fd, 0], [] ,[])
    if fd in r:
        os.write(1, os.read(fd, 1024*1024))
    if 0 in r:
        new = os.read(0, 1024*1024)
        data = data + new
        if not new: break
        while True:
            pkg, p, rem = data.partition(b'\0')
            if len(p) == 0: break
            data = rem
            if pkg[0] == ord(b'd'):
                os.write(fd, pkg[1:])
            elif pkg[0] == ord(b'r'):
                rows, cols = pkg[1:].split(b',')
                winsize = struct.pack("HHHH", int(rows), int(cols), 0, 0)
                fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

os.waitpid(pid, 0)"#;
    let (id, jh) = {
        let hc = host_client.upgrade().context("Host disconnected")?;
        let id = hc.next_job_id();
        (
            id,
            hc.start_job(&HostClientMessage::RunScript(RunScriptMessage {
                id,
                name: "shell.py".into(),
                interperter: "/usr/bin/python3".into(),
                content: content.into(),
                args: vec![cols.to_string(), rows.to_string()],
                input_json: None,
                stdin_type: Some(RunScriptStdinType::Binary),
                stdout_type: Some(RunScriptOutType::Binary),
                stderr_type: Some(RunScriptOutType::Binary),
            }))
            .await?,
        )
    };
    let (socket_sink, socket_source) = socket.split();

    let send_to_shell = send_to_shell(host_client, id, socket_source).fuse();
    let read_from_shell = read_from_shell(jh, socket_sink).fuse();

    pin_mut!(send_to_shell);
    pin_mut!(read_from_shell);

    select! {
        read_res = read_from_shell => {
            read_res?
            // Drop send_to_shell without finishing
        },
        send_res = send_to_shell => {
            send_res?;
            read_from_shell.await?;
        }
    }
    Ok(())
}

async fn read_from_shell(
    mut jh: crate::hostclient::JobHandle,
    mut socket_sink: futures::stream::SplitSink<WebSocket, Message>,
) -> Result<(), anyhow::Error> {
    while let Some(m) = jh.next_message().await? {
        match m {
            ClientHostMessage::Failure(failure_message) => {
                bail!("Failed with code {:?}", failure_message.code);
            }
            ClientHostMessage::Success(_) => {
                // TODO make better??
                break;
            }
            ClientHostMessage::Data(data_message) => {
                let data = BASE64_STANDARD
                    .decode(data_message.data.as_str().context("Data is not string")?)?;
                socket_sink.send(Message::Binary(data.into())).await?;
            }
            _ => bail!("Unexpected message"),
        }
    }
    Ok(())
}

async fn send_to_shell(
    host_client: Weak<HostClient>,
    id: u64,
    mut socket_source: futures::stream::SplitStream<WebSocket>,
) -> Result<(), anyhow::Error> {
    while let Some(v) = socket_source.next().await {
        let v = v?;
        let data = match &v {
            Message::Text(utf8_bytes) => utf8_bytes.as_bytes(),
            Message::Binary(bytes) => bytes,
            Message::Ping(_) | Message::Pong(_) | Message::Close(_) => continue,
        };

        let data = BASE64_STANDARD.encode(data);
        let hc = host_client.upgrade().context("Host disconnected")?;
        hc.send_message(&HostClientMessage::Data(DataMessage {
            id,
            source: None,
            data: data.into(),
            eof: None,
        }))
        .await?;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct TerminalQuery {
    server: i64,
    cols: usize,
    rows: usize,
    session: String,
}

pub async fn handler(
    ws: WebSocketUpgrade,
    WState(state): WState<Arc<State>>,
    ClientIp(remote): ClientIp,
    Query(TerminalQuery {
        server,
        cols,
        rows,
        session,
    }): Query<TerminalQuery>,
) -> Result<Response, WebError> {
    let auth = get_auth(&state, Some(&remote), Some(&session)).await?;
    if !auth.admin {
        return Err(WebError::forbidden());
    }
    let Some(host_client) = state
        .host_clients
        .lock()
        .unwrap()
        .get(&server)
        .map(Arc::downgrade)
    else {
        return Err(WebError::not_found());
    };
    Ok(ws.on_upgrade(move |socket| async move {
        if let Err(e) = inner(socket, host_client, cols, rows).await {
            error!("Error in handle_terminal_inner: {e}");
        }
    }))
}
