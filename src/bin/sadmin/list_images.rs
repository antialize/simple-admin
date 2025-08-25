use crate::connection::Config;
use crate::connection::Connection;
use crate::dyn_format::dyn_format;
use anyhow::Result;
use sadmin2::action_types::IClientAction;
use sadmin2::action_types::IDockerListImageByHash;
use sadmin2::action_types::IDockerListImageTags;
use sadmin2::action_types::IServerAction;
use sadmin2::action_types::Ref;
use std::collections::HashSet;
use std::io::Write;

#[derive(clap::ValueEnum, Clone)]
enum Porcelain {
    V1,
}

/// List docker images on server
#[derive(clap::Parser)]
pub struct ListImages {
    // Search by specific hash ('sha256:ab12...')
    #[clap(long, short('s'))]
    hash: Vec<String>,

    /// After listing the available images, list images as they are pushed
    #[clap(long, short)]
    follow: bool,

    /// str.format style string using the keys: id,image,tag,hash,time,user,pin,labels,removed
    #[clap(long, short('e'))]
    format: Option<String>,

    /// Give the output in an easy-to-parse format for scripts
    #[clap(value_enum, long)]
    porcelain: Option<Porcelain>,

    /// Only display the most recent N images
    #[clap(long, short('n'))]
    tail: Option<Vec<usize>>,

    /// Only print tags for this image
    #[clap(long, short)]
    image: Option<String>,
}

pub async fn list_images(config: Config, args: ListImages) -> Result<()> {
    let mut c = Connection::open(config, false).await?;
    c.prompt_auth().await?;

    let format = args.format.as_deref().unwrap_or("{image}:{red}{bold}{tag}{reset} pushed {green}{bold}{rel_time}{reset} by {user} {green}{image}@{hash}{reset}{pin_suffix}");
    let msg_ref = Ref::random();

    if !args.hash.is_empty() {
        c.send(&IClientAction::DockerListImageByHash(
            IDockerListImageByHash {
                r#ref: msg_ref.clone(),
                hash: args.hash.clone(),
            },
        ))
        .await?;
    } else {
        c.send(&IClientAction::DockerListImageTags(IDockerListImageTags {
            r#ref: msg_ref.clone(),
        }))
        .await?;
    }

    let mut got_list = false;
    let mut pinned_image_tags = HashSet::new();
    while args.follow || !got_list {
        let msg = c.recv().await?;
        let (mut images, full) = match msg {
            IServerAction::DockerListImageTagsRes(res) => {
                for pin in res.pinned_image_tags {
                    pinned_image_tags.insert((pin.image, pin.tag));
                }
                (res.tags, true)
            }
            IServerAction::DockerListImageByHashRes(res) => {
                (res.tags.into_values().collect(), true)
            }
            IServerAction::DockerListImageTagsChanged(res) if args.follow => (res.changed, false),
            _ => continue,
        };
        if full {
            got_list = true;
        }
        images.sort_unstable_by(|l, r| l.time.total_cmp(&r.time));
        for i in &mut images {
            let mut k: (String, String) = Default::default();
            std::mem::swap(&mut i.image, &mut k.0);
            std::mem::swap(&mut i.tag, &mut k.1);
            if pinned_image_tags.contains(&k) {
                i.pinned_image_tag = true;
            }
            std::mem::swap(&mut i.image, &mut k.0);
            std::mem::swap(&mut i.tag, &mut k.1);
        }

        if args.porcelain.is_some() {
            let mut stdout = std::io::stdout();
            for i in &images {
                serde_json::to_writer(&mut stdout, i)?;
                stdout.write_all(b"\n")?;
            }
            stdout.flush()?;
            continue;
        }

        // Don't show "removed" images unless we have requested a specific hash.
        if args.hash.is_empty() {
            images.retain(|i| i.removed.is_none());
        }

        if let Some(image) = &args.image {
            images.retain(|i| &i.image == image);
        }
        if full && let Some(tail) = args.tail.as_ref().and_then(|l| l.last().cloned()) {
            images.reverse();
            images.truncate(tail);
            images.reverse();
        }

        let mut stdout = std::io::stdout();
        for i in &images {
            let mut s = dyn_format(format, i)?;
            s.push('\n');
            stdout.write_all(s.as_bytes())?;
        }
        stdout.flush()?;
    }
    Ok(())
}
