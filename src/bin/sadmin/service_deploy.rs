use std::path::PathBuf;

use crate::{
    connection::{Config, Connection},
    message::{Message, ServiceDeployStart},
    service_description::ServiceDescription,
};
use anyhow::{bail, Result};
use rand::Rng;

#[derive(clap::Parser)]
pub struct ServiceDeploy {
    /// The server to deploy on
    server: String,

    /// Description file to use
    description: PathBuf,

    /// The image to deploy
    image: Option<String>,
}

pub async fn deploy(config: Config, args: ServiceDeploy) -> Result<()> {
    let mut c = Connection::open(config, true).await?;
    let msg_ref: u64 = rand::thread_rng().gen_range(0..(1 << 48));
    println!("{:=^42}", format!("> {} <", args.server));

    let description = std::fs::read_to_string(&args.description)?;
    let description: ServiceDescription = serde_yaml::from_str(&description)?;
    let description = serde_json::to_string_pretty(&description)?;

    c.send(&Message::ServiceDeployStart(ServiceDeployStart {
        host: args.server,
        image: args.image,
        description,
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
