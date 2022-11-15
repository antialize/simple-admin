use crate::{
    connection::{Config, Connection},
    message::{DockerDeployStart, Message},
};
use anyhow::{bail, Result};
use rand::Rng;

/// Deploy a container to a remote host
#[derive(clap::Parser)]
pub struct DockerDeploy {
    /// The server to deploy on
    server: String,

    /// The image to deploy
    image: String,

    /// The container to deloy to
    #[clap(long, short('s'))]
    container: Option<String>,

    /// The container to deloy to
    #[clap(long, short)]
    config: Option<String>,

    #[clap(long)]
    no_restore_on_failure: bool,
}

pub async fn deploy(config: Config, args: DockerDeploy) -> Result<()> {
    let mut c = Connection::open(config, true).await?;
    let msg_ref: u64 = rand::thread_rng().gen_range(0..(1 << 48));
    println!("{:=^42}", format!("> {} <", args.server));
    c.send(&Message::DockerDeployStart(DockerDeployStart {
        host: args.server,
        image: args.image,
        config: args.config,
        restore_on_failure: !args.no_restore_on_failure,
        container: args.container,
        r#ref: msg_ref,
    }))
    .await?;
    loop {
        match c.recv().await? {
            Message::DockerDeployLog { r#ref, message } if r#ref == msg_ref => {
                println!("{}", message);
            }
            Message::DockerDeployEnd {
                r#ref,
                message,
                status,
            } if r#ref == msg_ref => {
                println!("{}", message);
                if !status {
                    bail!("Deployment failed");
                }
                break;
            }
            _ => (),
        }
    }
    Ok(())
}
