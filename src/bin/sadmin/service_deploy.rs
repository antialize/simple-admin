use anyhow::{bail, Context, Result};
use sadmin2::action_types::{
    HostEnum, IClientAction, IDockerDeployEnd, IDockerDeployLog, IServerAction,
    IServiceDeployStart, IServiceRedeployStart, Ref,
};
use std::path::PathBuf;

use crate::connection::{Config, Connection};

/// Deploy a service to a remote host
#[derive(clap::Parser)]
pub struct ServiceDeploy {
    /// The server to deploy on
    server: String,

    /// Description file to use
    description: PathBuf,

    /// The image to deploy
    image: Option<String>,
}

/// Redeploy a service to a remote host
#[derive(clap::Parser)]
pub struct ServiceRedeploy {
    /// Id of old deployment to redeploy
    deployment_id: i64,
}

pub async fn deploy(config: Config, args: ServiceDeploy) -> Result<()> {
    let mut c = Connection::open(config, true).await?;
    let msg_ref = Ref::random();
    println!("{:=^42}", format!("> {} <", args.server));

    let description = std::fs::read_to_string(&args.description)?;
    let mut parts = Vec::new();
    for part in description.split("{{{") {
        if let Some((key, rem)) = part.split_once("}}}") {
            parts.push("key_");
            parts.push(key);
            parts.push(rem);
        } else {
            parts.push(part);
        }
    }
    let _: serde_yaml::Value = serde_yaml::from_str(&parts.concat()).context("Invalid yaml")?;

    c.send(&IClientAction::ServiceDeployStart(IServiceDeployStart {
        host: HostEnum::Name(args.server),
        image: args.image,
        description,
        r#ref: msg_ref.clone(),
    }))
    .await?;
    loop {
        match c.recv().await? {
            IServerAction::DockerDeployLog(IDockerDeployLog { r#ref, message })
                if r#ref == msg_ref =>
            {
                print!("{message}");
            }
            IServerAction::DockerDeployEnd(IDockerDeployEnd {
                r#ref,
                message,
                status,
                ..
            }) if r#ref == msg_ref => {
                println!("{message}");
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

pub async fn redeploy(config: Config, args: ServiceRedeploy) -> Result<()> {
    let mut c = Connection::open(config, true).await?;
    let msg_ref = Ref::random();
    c.send(&IClientAction::ServiceRedeployStart(
        IServiceRedeployStart {
            deployment_id: args.deployment_id,
            r#ref: msg_ref.clone(),
        },
    ))
    .await?;
    loop {
        match c.recv().await? {
            IServerAction::DockerDeployLog(IDockerDeployLog { r#ref, message })
                if r#ref == msg_ref =>
            {
                print!("{message}");
            }
            IServerAction::DockerDeployEnd(IDockerDeployEnd {
                r#ref,
                message,
                status,
                ..
            }) if r#ref == msg_ref => {
                println!("{message}");
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
