use crate::message::Message;
use anyhow::{bail, Context, Result};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::{
    fs::OpenOptions,
    io::{BufRead, Write},
    os::unix::prelude::OpenOptionsExt,
    path::PathBuf,
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

pub struct Connection {
    pub cookie_file: PathBuf,
    ca_file: PathBuf,
    key_file: PathBuf,
    crt_file: PathBuf,
    session: String,
    stream: Wss,
    otp: bool,
    pwd: bool,
    pub user: Option<String>,
    server_host: String,
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

        con.send(&Message::RequestAuthStatus {
            session: con.session.clone(),
        })
        .await?;

        match con.recv().await? {
            Message::AuthStatus(s) => {
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

    pub async fn send(&mut self, msg: &Message) -> Result<()> {
        let m = serde_json::to_string(msg)?;
        self.stream.send(WSMessage::text(m)).await?;
        Ok(())
    }

    pub async fn recv(&mut self) -> Result<Message> {
        loop {
            let msg =
                match tokio::time::timeout(std::time::Duration::from_secs(1), self.stream.next())
                    .await
                {
                    Ok(msg) => msg,
                    Err(_) => {
                        self.stream.send(WSMessage::Ping(vec![42, 41])).await?;
                        continue;
                    }
                };
            let msg = match msg.context("Expected package")?? {
                WSMessage::Text(msg) => msg,
                WSMessage::Binary(msg) => String::from_utf8(msg)?,
                WSMessage::Ping(v) => {
                    self.stream.send(WSMessage::Pong(v)).await?;
                    continue;
                }
                WSMessage::Pong(_) => continue,
                WSMessage::Close(_) => continue,
                WSMessage::Frame(_) => continue,
            };
            match serde_json::from_str(&msg) {
                Ok(v) => break Ok(v),
                Err(e) => eprintln!(
                    "Invalid message: {:?} at {}:{}\n{}",
                    e,
                    e.line(),
                    e.column(),
                    msg
                ),
            }
        }
    }

    pub fn authenticated(&self) -> bool {
        self.otp && self.pwd
    }

    pub async fn get_key(&mut self) -> Result<()> {
        let r#ref: u64 = rand::thread_rng().gen_range(0..(1 << 48));
        let home_dir = dirs::home_dir().context("Expected homedir")?;

        let mut key = None;
        for k in [".ssh/id_ed25519", ".ssh/id_rsa"] {
            let private = home_dir.join(k);
            if !private.exists() {
                continue;
            }
            let public = home_dir.join(format!("{}.pub", k));
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
                Message::GenerateKey {
                    r#ref,
                    ssh_public_key: Some(pk),
                },
            ),
            None => {
                println!("No SSH key found - not signing any SSH key");
                (
                    None,
                    Message::GenerateKey {
                        r#ref,
                        ssh_public_key: None,
                    },
                )
            }
        };
        self.send(&msg).await?;
        let res = loop {
            match self.recv().await? {
                Message::GenerateKeyRes(res) if res.r#ref == r#ref => break res,
                _ => continue,
            };
        };

        OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(&self.key_file)?
            .write_all(res.key.as_bytes())?;

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
                let line = format!("@cert-authority * {} {}", ssh_host_ca, marker);
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
                        home_dir.join(format!("{}-cert.pub", ssh_public_key)),
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

        let pwd = rpassword::prompt_password(format!("Password for {}: ", user))?;

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

        self.send(&Message::Login {
            user: user.clone(),
            pwd,
            otp,
        })
        .await?;
        let res = match self.recv().await? {
            Message::AuthStatus(res) => res,
            _ => bail!("Bad result type"),
        };

        if res.session.is_none() || !res.pwd || !res.otp {
            bail!(
                "Could not authenticate: {}",
                res.message.as_deref().unwrap_or_default()
            )
        }
        let session = res.session.unwrap();

        std::fs::create_dir_all(self.cookie_file.parent().context("Expected parent")?)?;
        OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(&self.cookie_file)?
            .write_all(session.as_bytes())?;

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
                auth: base64::engine::general_purpose::STANDARD_NO_PAD
                    .encode(format!("{}:{}", user, session).as_bytes()),
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
}
