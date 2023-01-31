use crate::connection::Config;
use crate::connection::Connection;
use crate::dyn_format::AsFmtArg;
use crate::dyn_format::GetFmtArgDict;
use crate::dyn_format::RelTime;
use crate::dyn_format::{dyn_format, FormatArg};
use crate::message::Deployment;
use crate::message::ImageInfo;
use crate::message::Message;
use anyhow::bail;
use anyhow::Result;
use itertools::Itertools;
use rand::Rng;
use serde::Serialize;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fmt::Display;
use std::io::Write;

#[derive(clap::ValueEnum, Clone)]
enum Porcelain {
    V1,
}

impl Serialize for Porcelain {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Porcelain::V1 => serializer.serialize_str("v1"),
        }
    }
}

/// List deployments of containers and services among all hosts
#[derive(clap::Parser)]
pub struct ListDeployments {
    /// Give the output in an easy-to-parse format for scripts
    #[clap(value_enum, long)]
    porcelain: Option<Porcelain>,

    /// str.format style string using the keys: id,image,tag,hash,time,user,pin,labels,removed
    #[clap(long, short('e'))]
    format: Option<String>,

    /// Only show deployments for this server
    #[clap(long)]
    host: Option<String>,

    /// Only show deployments for this container
    #[clap(long, short('s'))]
    container: Option<String>,

    /// Only show deployments for this image
    #[clap(long, short)]
    image: Option<String>,

    /// Show historical deployments (requires --host and --container)
    #[clap(long)]
    history: bool,
}

#[derive(Serialize)]
struct PorcelainV1<'a> {
    version: Porcelain,
    host_names: HashMap<u64, &'a str>,
    deployments: Vec<Deployment>,
}

enum NameOrId<'a> {
    Name(&'a str),
    Id(u64),
}

impl<'a> Display for NameOrId<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NameOrId::Name(v) => f.write_str(v),
            NameOrId::Id(v) => write!(f, "{v}"),
        }
    }
}

fn numeric_sort_key(left: &Deployment, right: &Deployment) -> std::cmp::Ordering {
    let mut i1 = left.name.chars().peekable();
    let mut i2 = right.name.chars().peekable();
    loop {
        match (i1.peek(), i2.peek()) {
            (Some(a), Some(b)) if a.is_ascii_digit() && b.is_ascii_digit() => {
                let mut an = 0;
                while let Some(d) = i1.peek().and_then(|v| v.to_digit(10)) {
                    an = an * 10 + d;
                    i1.next();
                }
                let mut bn = 0;
                while let Some(d) = i2.peek().and_then(|v| v.to_digit(10)) {
                    bn = bn * 10 + d;
                    i2.next();
                }
                if an != bn {
                    return an.cmp(&bn);
                }
            }
            (Some(a), Some(b)) if a == b => {
                i1.next();
                i2.next();
                continue;
            }
            (a, b) => return a.cmp(&b),
        }
    }
}

fn group_deployments(
    mut deployments: Vec<Deployment>,
    host_ids: HashMap<u64, &str>,
) -> Vec<(String, Vec<Deployment>)> {
    deployments.sort_unstable_by(|l, r| (&l.image, l.host).cmp(&(&r.image, r.host)));
    let mut groups = Vec::new();
    for (image, image_group) in &deployments.into_iter().group_by(|v| v.image.clone()) {
        let mut by_host = image_group
            .group_by(|i| i.host)
            .into_iter()
            .map(|(host_id, b)| {
                (
                    match host_ids.get(&host_id) {
                        Some(v) => NameOrId::Name(v),
                        None => NameOrId::Id(host_id),
                    },
                    b.collect_vec(),
                )
            })
            .collect_vec();
        let mut names = HashSet::new();
        let mut x = HashSet::new();
        for (_, g) in &by_host {
            for d in g {
                names.insert(d.name.as_str());
            }
            x.insert(g.iter().map(|v| v.name.as_str()).collect_vec());
        }
        let one_per_host = x.iter().all(|v| v.len() == 1);
        if by_host.len() >= 2 * names.len() {
            // This image is deployed to many hosts under the same or few names,
            // as opposed to being deployed under many names to few hosts.
            // Switch the layout from {host: {name: deployment}}
            // to {name: {host: deployment}}
            // by_name: Dict[str, List[Any]] = {}
            let mut by_name: BTreeMap<_, Vec<_>> = BTreeMap::new();
            for (host, deployments) in by_host {
                for mut deployment in deployments {
                    let k = if one_per_host {
                        deployment.name.clone()
                    } else {
                        format!("{} in {}", deployment.name, image)
                    };
                    deployment.name = host.to_string();
                    by_name.entry(k).or_default().push(deployment);
                }
            }
            for y in by_name.values_mut() {
                y.sort_unstable_by(numeric_sort_key);
            }
            groups.extend(by_name.into_iter().collect_vec());
        } else {
            for (_, group) in &mut by_host {
                group.sort_unstable_by(numeric_sort_key);
            }
            groups.extend(
                by_host
                    .into_iter()
                    .map(|(host, group)| (format!("{image} on {host}"), group)),
            );
        }
    }
    groups
}

#[derive(PartialEq, Eq)]
struct Key {
    deploy_time: String,
    deploy_user: String,
    push_time: Option<String>,
    push_user: Option<String>,
    image_info: Option<ImageInfo>,
    removed: Option<String>,
    name: String,
    git: String,
}

struct KeyDeployment(Deployment);

impl KeyDeployment {
    fn key(&self) -> Key {
        Key {
            deploy_time: RelTime(self.0.start).to_string(),
            deploy_user: self.0.user.clone(),
            push_time: self
                .0
                .image_info
                .as_ref()
                .map(|v| RelTime(v.time).to_string()),
            push_user: self.0.image_info.as_ref().map(|v| v.user.clone()),
            image_info: self.0.image_info.clone(),
            removed: self
                .0
                .image_info
                .as_ref()
                .and_then(|v| v.removed)
                .map(|v| RelTime(v).to_string()),
            name: Default::default(),
            git: Default::default(),
        }
    }
}
impl GetFmtArgDict for Key {
    fn get_fmt_arg(&self, name: &str) -> FormatArg<'_> {
        match name {
            "deploy_time" => self.deploy_time.as_fmt_arg(),
            "deploy_user" => self.deploy_user.as_fmt_arg(),
            "push_time" => self.push_time.as_fmt_arg(),
            "push_user" => self.push_user.as_fmt_arg(),
            "image_info" => self.image_info.as_fmt_arg(),
            "removed" => self.removed.as_fmt_arg(),
            "name" => self.name.as_fmt_arg(),
            "git" => self.git.as_fmt_arg(),
            _ => FormatArg::Missing,
        }
    }
}

fn list_deployment_groups(
    groups: Vec<(String, Vec<Deployment>)>,
    format: Option<String>,
    pinned_image_tags: HashSet<(String, String)>,
) -> Result<()> {
    let format = format
        .as_deref()
        .unwrap_or("({labels[GIT_COMMIT]} {labels[GIT_BRANCH]})");
    let mut stdout = std::io::stdout();
    for (name, group) in groups {
        stdout.write_all(b"\n")?;
        stdout.write_all(name.as_bytes())?;
        stdout.write_all(b"\n")?;
        let mut deployments = Vec::new();
        for mut deployment in group {
            if let Some(mut image_info) = deployment.image_info.take() {
                let image_tag = (image_info.image, image_info.tag);
                image_info.pinned_image_tag = pinned_image_tags.contains(&image_tag);
                (image_info.image, image_info.tag) = image_tag;
                deployment.image_info = Some(image_info);
            }
            deployments.push(KeyDeployment(deployment));
        }

        for (mut key, g) in &deployments.into_iter().group_by(|v| v.key()) {
            key.name = g.map(|v| v.0.name).join(", ");

            let mut status_fmt = "- {bold}{red}{name}{reset}".to_string();
            if key.push_time.as_deref() == Some(key.deploy_time.as_str())
                && Some(key.deploy_user.as_str()) == key.push_user.as_deref()
            {
                status_fmt.push_str(" {half}pushed{reset} {green}{bold}{push_time}{reset} {half}by{reset} {push_user}, pushed {green}{bold}{deploy_time}{reset} {half}by{reset} {deploy_user}");
            } else {
                status_fmt
                    .push_str(" {green}{bold}{deploy_time}{reset} {half}by{reset} {deploy_user}");
            }
            if key.removed.is_some() {
                status_fmt.push_str("{half},{reset} {red}removed{reset} {removed}");
            }
            let pin = key.image_info.as_ref().map(|v| v.pin).unwrap_or_default();
            if pin {
                status_fmt.push_str("{half}, hash pinned{reset}");
            }
            if key
                .image_info
                .as_ref()
                .map(|v| v.pinned_image_tag)
                .unwrap_or_default()
            {
                status_fmt.push_str("{half}, tag pinned{reset}");
            }
            if !pin
                && !key
                    .image_info
                    .as_ref()
                    .map(|v| v.pinned_image_tag)
                    .unwrap_or_default()
            {
                status_fmt.push_str("{half}, {reset}no pin");
            }
            let extra = if let Some(info) = &key.image_info {
                dyn_format(format, info)?
            } else {
                "".to_string()
            };
            let extra = extra.trim();
            if !extra.is_empty() {
                key.git = extra.to_string();
                status_fmt.push_str("{reset}{green} {git}{reset}");
            }
            status_fmt.push('\n');
            stdout.write_all(dyn_format(&status_fmt, &key)?.as_bytes())?;
        }
    }
    Ok(())
}

pub async fn list_deployments(config: Config, args: ListDeployments) -> Result<()> {
    let mut c = Connection::open(config, false).await?;
    c.prompt_auth().await?;
    let msg_ref: u64 = rand::thread_rng().gen_range(0..(1 << 48));
    c.send(&Message::RequestInitialState {}).await?;

    let mut got_list = if args.porcelain.is_some() {
        true
    } else {
        c.send(&Message::DockerListImageTags { r#ref: msg_ref })
            .await?;
        false
    };

    let mut state = None;
    let mut pinned_image_tags = HashSet::new();
    while state.is_none() || !got_list {
        match c.recv().await? {
            Message::SetInitialState(s) => state = Some(s),
            Message::DockerListImageTagsRes(res) => {
                for pin in res.pinned_image_tags {
                    pinned_image_tags.insert((pin.image, pin.tag));
                }
                got_list = true;
            }
            _ => (),
        }
    }
    let state = state.unwrap();
    let mut type_ids = HashMap::new();
    for v in state
        .object_names_and_ids
        .get("1")
        .map(|v| v.as_slice())
        .unwrap_or_default()
    {
        if let Some(n) = &v.name {
            type_ids.insert(n.as_str(), v.id);
        }
    }
    let mut host_names = HashMap::new();
    if let Some(host_type_id) = type_ids.get("Host") {
        for v in state
            .object_names_and_ids
            .get(&host_type_id.to_string())
            .map(|v| v.as_slice())
            .unwrap_or_default()
        {
            if let Some(n) = &v.name {
                host_names.insert(v.id, n.as_str());
            }
        }
    }

    let host = if let Some(host) = &args.host {
        let host_id = host_names.iter().find(|v| *v.1 == host);
        match host_id {
            Some(host_id) => Some(*host_id.0),
            None => bail!("Unknown host {}", host),
        }
    } else {
        None
    };
    if args.history {
        let name = match &args.container {
            Some(v) => v.clone(),
            None => bail!("--history requires --container"),
        };
        let host = match host {
            Some(v) => v,
            None => bail!("--history requires --host"),
        };
        c.send(&Message::DockerListDeploymentHistory {
            r#ref: msg_ref,
            host,
            name,
        })
        .await?;
    } else {
        c.send(&Message::DockerListDeployments {
            r#ref: msg_ref,
            host,
            image: args.image.clone(),
        })
        .await?;
    }

    let mut deployments = loop {
        match c.recv().await? {
            Message::DockerListDeploymentHistoryRes { r#ref, deployments } if r#ref == msg_ref => {
                break deployments
            }
            Message::DockerListDeploymentsRes { r#ref, deployments } if r#ref == msg_ref => {
                break deployments
            }
            _ => continue,
        };
    };

    if let Some(Porcelain::V1) = args.porcelain {
        serde_json::to_writer_pretty(
            std::io::stdout(),
            &PorcelainV1 {
                version: Porcelain::V1,
                host_names,
                deployments,
            },
        )?;
        return Ok(());
    }

    // # DockerListDeployments currently doesn't support filtering by container,
    // # and DockerListDeploymentHistory doesn't support filtering by image,
    // # so do the filtering here. Also filter by host for good measure.
    if let Some(host) = &args.host {
        host_names.retain(|_, h| h == host);
    }
    deployments.retain(|d| {
        if !host_names.contains_key(&d.host) {
            return false;
        }
        if let Some(image) = &args.image {
            if &d.image != image {
                return false;
            }
        }
        if let Some(container) = &args.container {
            if &d.name != container {
                return false;
            }
        }
        true
    });
    list_deployment_groups(
        group_deployments(deployments, host_names),
        args.format,
        pinned_image_tags,
    )?;
    Ok(())
}
