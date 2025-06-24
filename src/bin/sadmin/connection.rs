use anyhow::{Context, Result, bail};
use base64::{Engine, prelude::BASE64_STANDARD};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use sadmin2::action_types::{
    IClientAction, IGenerateKey, ILogin, IRequestAuthStatus, IServerAction, Ref,
};
use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::os::unix::prelude::OpenOptionsExt;
use std::{
    fs::OpenOptions,
    io::{BufRead, Write},
    path::PathBuf,
    sync::atomic::AtomicU64,
};
use tokio_tungstenite::tungstenite::Message as WSMessage;

fn default_port() -> u16 {
    443
}

#[derive(Deserialize, Serialize)]
pub struct Config {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_host: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(default = "default_port")]
    pub server_port: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_cert: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_insecure: Option<bool>,
}

type Wss =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

pub struct ConnectionSend {
    send: futures::stream::SplitSink<Wss, WSMessage>,
}

impl ConnectionSend {
    pub async fn send_message_str(&mut self, msg: String) -> Result<()> {
        self.send.send(WSMessage::text(msg)).await?;
        Ok(())
    }

    pub async fn ping(&mut self) -> Result<()> {
        self.send
            .send(WSMessage::Ping(([42, 41]).as_slice().into()))
            .await?;
        Ok(())
    }

    pub async fn pong(&mut self, v: Bytes) -> Result<()> {
        self.send.send(WSMessage::Pong(v)).await?;
        Ok(())
    }

    pub async fn close(&mut self) -> Result<()> {
        self.send.close().await?;
        Ok(())
    }

    pub fn into2(self) -> std::sync::Arc<ConnectionSend2> {
        std::sync::Arc::new(ConnectionSend2 {
            idc: AtomicU64::new(2),
            response_handlers: Default::default(),
            send: tokio::sync::Mutex::new(self),
        })
    }
}

pub struct ConnectionSend2 {
    idc: AtomicU64,
    response_handlers: std::sync::Mutex<
        std::collections::HashMap<u64, tokio::sync::oneshot::Sender<IServerAction>>,
    >,
    send: tokio::sync::Mutex<ConnectionSend>,
}

impl ConnectionSend2 {
    pub fn next_id(&self) -> u64 {
        self.idc.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    pub async fn send_message_with_response(&self, msg: &IClientAction) -> Result<IServerAction> {
        let msg_id = msg.msg_id().context("No message id")?;
        let m = serde_json::to_string(msg)?;
        let (s, r) = tokio::sync::oneshot::channel();
        self.response_handlers.lock().unwrap().insert(msg_id, s);
        self.send.lock().await.send_message_str(m).await?;
        let r = r.await.context("r failed")?;
        if let IServerAction::Response(r) = &r {
            if let Some(e) = &r.error {
                bail!("Remote error: {}", e);
            }
        }
        Ok(r)
    }

    pub fn handle_response(&self, msg_id: u64, act: IServerAction) {
        if let Some(v) = self.response_handlers.lock().unwrap().remove(&msg_id) {
            let _ = v.send(act);
        }
    }

    pub async fn ping(&self) -> Result<()> {
        self.send.lock().await.ping().await
    }

    pub async fn pong(&self, v: Bytes) -> Result<()> {
        self.send.lock().await.pong(v).await
    }

    pub async fn close(&self) -> Result<()> {
        self.send.lock().await.close().await
    }
}

#[allow(clippy::large_enum_variant)]
pub enum ConnectionRecvRes {
    Message(IServerAction),
    SendPong(Bytes),
}

pub struct ConnectionRecv {
    recv: futures::stream::SplitStream<Wss>,
}

impl ConnectionRecv {
    pub async fn recv(&mut self) -> Result<ConnectionRecvRes> {
        loop {
            let msg = match self.recv.next().await.context("Expected package")?? {
                WSMessage::Text(msg) => msg.into(),
                WSMessage::Binary(msg) => msg,
                WSMessage::Ping(v) => {
                    return Ok(ConnectionRecvRes::SendPong(v));
                }
                WSMessage::Pong(_) => continue,
                WSMessage::Close(_) => continue,
                WSMessage::Frame(_) => continue,
            };
            match serde_json::from_slice(&msg) {
                Ok(v) => break Ok(ConnectionRecvRes::Message(v)),
                Err(e) => eprintln!(
                    "Invalid message: {:?} at {}:{}\n{}",
                    e,
                    e.line(),
                    e.column(),
                    String::from_utf8_lossy(&msg)
                ),
            }
        }
    }
}

pub struct Connection {
    pub cookie_file: PathBuf,
    ca_file: PathBuf,
    key_file: PathBuf,
    crt_file: PathBuf,
    pub session: String,
    stream: Wss,
    otp: bool,
    pwd: bool,
    pub user: Option<String>,
    pub server_host: String,
}

#[derive(Serialize, Deserialize)]
struct DockerAuth {
    auth: String,
}

#[derive(Serialize, Deserialize, Default)]
struct DockerConfig {
    #[serde(default)]
    auths: std::collections::HashMap<String, DockerAuth>,

    #[serde(flatten)]
    extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Connection {
    pub async fn open(config: Config, require_auth: bool) -> Result<Connection> {
        let home_dir = dirs::home_dir().context("Expected home dir")?;
        let cookie_file = home_dir.join(".cache/simple_admin_cookie");
        let ca_file = home_dir.join(".cache/simple_admin_key.ca");
        let key_file = home_dir.join(".cache/simple_admin_key.key");
        let crt_file = home_dir.join(".cache/simple_admin_key.crt");
        let server_host = config.server_host.context("Missing server host")?;
        let session = match std::fs::read(&cookie_file) {
            Ok(v) => String::from_utf8(v)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(e) => return Err(e.into()),
        };

        let protocol = if config.server_insecure == Some(true) {
            "ws://"
        } else {
            "wss://"
        };
        let url = format!(
            "{}{}:{}/sysadmin",
            protocol, server_host, config.server_port
        );
        let (stream, _) = tokio_tungstenite::connect_async(url)
            .await
            .expect("Failed to connect");

        let mut con = Connection {
            cookie_file,
            ca_file,
            key_file,
            crt_file,
            stream,
            session,
            otp: false,
            pwd: false,
            user: None,
            server_host,
        };

        con.send(&IClientAction::RequestAuthStatus(IRequestAuthStatus {
            session: Some(con.session.clone()),
        }))
        .await?;

        match con.recv().await? {
            IServerAction::AuthStatus(s) => {
                con.user = s.user;
                con.pwd = s.pwd;
                con.otp = s.otp;
            }
            _ => bail!("Expected auth status"),
        }

        if require_auth && !con.authenticated() {
            bail!("Authentication required")
        }
        Ok(con)
    }

    pub async fn send(&mut self, msg: &IClientAction) -> Result<()> {
        let m = serde_json::to_string(msg)?;
        self.stream.send(WSMessage::text(m)).await?;
        Ok(())
    }

    pub async fn recv(&mut self) -> Result<IServerAction> {
        loop {
            let msg =
                match tokio::time::timeout(std::time::Duration::from_secs(1), self.stream.next())
                    .await
                {
                    Ok(msg) => msg,
                    Err(_) => {
                        self.stream
                            .send(WSMessage::Ping(([42, 41]).as_slice().into()))
                            .await?;
                        continue;
                    }
                };
            let msg = match msg.context("Expected package")?? {
                WSMessage::Text(msg) => msg.into(),
                WSMessage::Binary(msg) => msg,
                WSMessage::Ping(v) => {
                    self.stream.send(WSMessage::Pong(v)).await?;
                    continue;
                }
                WSMessage::Pong(_) => continue,
                WSMessage::Close(_) => continue,
                WSMessage::Frame(_) => continue,
            };
            match serde_json::from_slice(&msg) {
                Ok(v) => break Ok(v),
                Err(e) => eprintln!(
                    "Invalid message: {:?} at {}:{}\n{}",
                    e,
                    e.line(),
                    e.column(),
                    String::from_utf8_lossy(&msg)
                ),
            }
        }
    }

    pub fn authenticated(&self) -> bool {
        self.otp && self.pwd
    }

    pub async fn get_key(&mut self) -> Result<()> {
        let r#ref = Ref::random();
        let home_dir = dirs::home_dir().context("Expected homedir")?;

        let mut key = None;
        for k in [".ssh/id_ed25519", ".ssh/id_rsa"] {
            let private = home_dir.join(k);
            if !private.exists() {
                continue;
            }
            let public = home_dir.join(format!("{k}.pub"));
            let pk = match std::fs::read(public) {
                Ok(v) => v,
                Err(_) => continue,
            };
            key = Some((k, String::from_utf8(pk)?));
            break;
        }
        let (ssh_public_key, msg) = match key {
            Some((key, pk)) => (
                Some(key),
                IClientAction::GenerateKey(IGenerateKey {
                    r#ref: r#ref.clone(),
                    ssh_public_key: Some(pk),
                }),
            ),
            None => {
                println!("No SSH key found - not signing any SSH key");
                (
                    None,
                    IClientAction::GenerateKey(IGenerateKey {
                        r#ref: r#ref.clone(),
                        ssh_public_key: None,
                    }),
                )
            }
        };
        self.send(&msg).await?;
        let res = loop {
            match self.recv().await? {
                IServerAction::GenerateKeyRes(res) if res.r#ref == r#ref => break res,
                _ => continue,
            };
        };

        let mut opt = OpenOptions::new();
        opt.create(true).truncate(true).write(true);

        #[cfg(unix)]
        opt.mode(0o600);

        opt.open(&self.key_file)?.write_all(res.key.as_bytes())?;

        std::fs::write(&self.crt_file, res.crt)?;
        std::fs::write(&self.ca_file, res.ca_pem)?;
        if let Some(ssh_public_key) = ssh_public_key {
            if let Some(ssh_host_ca) = res.ssh_host_ca {
                let known_hosts = home_dir.join(".ssh/known_hosts");
                let mut lines = match std::fs::File::open(&known_hosts) {
                    Ok(v) => {
                        let mut lines = Vec::new();
                        for line in std::io::BufReader::new(v).lines() {
                            lines.push(line?);
                        }
                        lines
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Default::default(),
                    Err(e) => return Err(e.into()),
                };
                let marker = "# sadmin sshHostCaPub";
                let line = format!("@cert-authority * {ssh_host_ca} {marker}");
                if !lines.contains(&line) {
                    lines.retain(|v| !v.ends_with(marker) && !v.is_empty());
                    lines.push(line);
                    let mut lines = lines.join("\n");
                    lines.push('\n');
                    std::fs::write(&known_hosts, lines.as_bytes())?;
                }
            }
            match res.ssh_crt {
                Some(v) => {
                    std::fs::write(
                        home_dir.join(format!("{ssh_public_key}-cert.pub")),
                        v.as_bytes(),
                    )?;
                }
                None => {
                    println!("sadmin server did not sign our SSH key!");
                }
            }
        }
        Ok(())
    }

    pub async fn prompt_auth(&mut self) -> Result<()> {
        if self.authenticated() {
            return Ok(());
        }

        let user = match &self.user {
            Some(v) => v.clone(),
            None => {
                let mut err = std::io::stderr();
                err.write_all(b"Username: ")?;
                err.flush()?;
                let mut buffer = String::new();
                std::io::stdin().read_line(&mut buffer)?;
                buffer.trim().to_string()
            }
        };
        if user.is_empty() {
            bail!("No username provided")
        }

        let pwd = if let Ok(v) = std::env::var("SADMIN_PASS") {
            v
        } else {
            rpassword::prompt_password(format!("Password for {user}: "))?
        };

        let otp = if self.otp {
            None
        } else {
            let mut err = std::io::stderr();
            err.write_all(b"One time password: ")?;
            err.flush()?;
            let mut buffer = String::new();
            std::io::stdin().read_line(&mut buffer)?;
            let otp = buffer.trim().to_string();
            if otp.is_empty() {
                bail!("No one time password provided")
            }
            Some(otp)
        };

        self.send(&IClientAction::Login(ILogin {
            user: user.clone(),
            pwd,
            otp,
        }))
        .await?;
        let res = match self.recv().await? {
            IServerAction::AuthStatus(res) => res,
            res => bail!("Expected AuthStatus message got {}", res.tag()),
        };

        if res.session.is_none() || !res.pwd || !res.otp {
            bail!(
                "Could not authenticate: {}",
                res.message.as_deref().unwrap_or_default()
            )
        }
        let session = res.session.unwrap();

        std::fs::create_dir_all(self.cookie_file.parent().context("Expected parent")?)?;
        let mut opt = OpenOptions::new();
        opt.create(true).truncate(true).write(true);

        #[cfg(unix)]
        opt.mode(0o600);

        opt.open(&self.cookie_file)?.write_all(session.as_bytes())?;

        let dockerconfpath = dirs::home_dir()
            .context("Expected homedir")?
            .join(".docker/config.json");

        let mut dockerconfig: DockerConfig = match std::fs::read(&dockerconfpath) {
            Ok(v) => serde_json::from_slice(&v)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Default::default(),
            Err(e) => return Err(e.into()),
        };
        dockerconfig.auths.insert(
            self.server_host.clone(),
            DockerAuth {
                auth: BASE64_STANDARD.encode(format!("{user}:{session}").as_bytes()),
            },
        );
        std::fs::create_dir_all(dockerconfpath.parent().context("Expected parent")?)?;
        std::fs::write(
            &dockerconfpath,
            serde_json::to_string_pretty(&dockerconfig)?,
        )?;

        self.session = session;
        self.otp = res.otp;
        self.pwd = res.pwd;
        self.user = Some(user);

        Ok(())
    }

    pub fn split(self) -> (ConnectionSend, ConnectionRecv) {
        let (send, recv) = self.stream.split();
        (ConnectionSend { send }, ConnectionRecv { recv })
    }
}
