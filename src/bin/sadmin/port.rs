use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use anyhow::{Context, Result};

use crate::connection::{Config, Connection, ConnectionRecvRes, ConnectionSend2};
use base64::{Engine, prelude::BASE64_STANDARD};
use bytes::BytesMut;
use sadmin2::action_types::{IClientAction, IServerAction, ISocketConnect, ISocketSend};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::tcp::OwnedReadHalf,
    pin, select,
    sync::mpsc::UnboundedSender,
};

/// Proxy a port tcp on a remote machine
#[derive(clap::Parser)]
pub struct ProxySocket {
    host: String,
    local_port: u16,
    /// Either host:port or unix socket path
    destination: String,
}

pub async fn handle_socket_inner(
    mut socket_read: OwnedReadHalf,
    send: Arc<ConnectionSend2>,
    socket_id: u64,
    cmd: &'static ProxySocket,
    writer_shutdown_s: UnboundedSender<(u64, OwnedReadHalf)>,
) -> Result<()> {
    if let Err(e) = send
        .send_message_with_response(&IClientAction::SocketConnect(ISocketConnect {
            msg_id: send.next_id(),
            socket_id,
            host: cmd.host.clone(),
            dst: cmd.destination.clone(),
        }))
        .await
    {
        let _ = writer_shutdown_s.send((socket_id, socket_read));
        return Err(e).context("Unable to open port");
    }

    let mut buf = BytesMut::with_capacity(1024 * 64);
    loop {
        buf.clear();
        let v = match socket_read.read_buf(&mut buf).await {
            Ok(0) => None,
            Ok(_) => Some(BASE64_STANDARD.encode(&buf)),
            Err(_) => None,
        };
        let eof = v.is_none();
        if let Err(e) = send
            .send_message_with_response(&IClientAction::SocketSend(ISocketSend {
                msg_id: send.next_id(),
                socket_id,
                data: v,
            }))
            .await
        {
            let _ = writer_shutdown_s.send((socket_id, socket_read));
            return Err(e).context("Unable send bytes");
        }
        if eof {
            return Ok(());
        }
    }
}

pub async fn handle_socket(
    socket_read: OwnedReadHalf,
    send: Arc<ConnectionSend2>,
    socket_id: u64,
    cmd: &'static ProxySocket,
    writer_shutdown_s: UnboundedSender<(u64, OwnedReadHalf)>,
) {
    if let Err(e) = handle_socket_inner(socket_read, send, socket_id, cmd, writer_shutdown_s).await
    {
        eprintln!("Error in handle socket inner {e:?}");
    }
}

pub async fn proxy(config: Config, cmd: ProxySocket) -> Result<()> {
    let cmd = Box::leak(Box::new(cmd));
    let mut c = Connection::open(config, false).await?;
    c.prompt_auth().await?;
    let (send, mut recv) = c.split();

    let mut socket_id = 1;

    let sock = tokio::net::TcpSocket::new_v4()?;
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), cmd.local_port);
    sock.set_reuseaddr(true)?;
    sock.bind(addr)?;

    let sig = tokio::signal::ctrl_c();
    pin!(sig);
    let mut interval = tokio::time::interval(Duration::from_secs(66));
    let listener = sock.listen(1024)?;

    let (writer_shutdown_s, mut writer_shutdown_r) = tokio::sync::mpsc::unbounded_channel();

    let mut socket_write_halfs = HashMap::new();
    let send = send.into2();
    loop {
        select! {
            _ = &mut sig => {break},
            r = listener.accept() => {
                let (socket, addr) = r?;
                socket_id += 1;
                let (socket_read, socket_write) = socket.into_split();
                socket_write_halfs.insert(socket_id, socket_write);
                tokio::task::spawn(handle_socket(socket_read, send.clone(), socket_id, cmd, writer_shutdown_s.clone()));
                println!("Accepting proxy connection from {addr:?}");
            }
            r = recv.recv() => {
                match r? {
                    ConnectionRecvRes::Message(act) => {
                        match act {
                            IServerAction::Response(act) => {
                                send.handle_response(act.msg_id, IServerAction::Response(act))
                            }
                            IServerAction::SocketRecv(act) => {
                                match act.data {
                                    None => {socket_write_halfs.remove(&act.socket_id);}
                                    Some(data) => {
                                        if let Some(w) = socket_write_halfs.get_mut(&act.socket_id) {
                                            w.write_all(&BASE64_STANDARD.decode(&data)?).await?;
                                            w.flush().await?;
                                        }
                                    }
                                }
                            }
                            _ => ()
                        }
                    }
                    ConnectionRecvRes::SendPong(bytes) => {
                        send.pong(bytes).await?;
                    }
                }
            }
            r = writer_shutdown_r.recv() => {
                if let Some((socket_id, read_half)) = r
                    && let Some(write_half) = socket_write_halfs.remove(&socket_id) {
                        read_half.reunite(write_half)?.shutdown().await?;
                    }
            }
            _ = interval.tick() => {
                send.ping().await?;
            }
        }
    }
    println!("Stopping");
    send.close().await?;

    Ok(())
}
