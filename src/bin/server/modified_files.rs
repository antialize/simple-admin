use crate::{
    action_types::{
        IModifiedFilesChanged, IModifiedFilesList, IModifiedFilesResolve, IObject2, IObjectChanged,
        IServerAction, ModifiedFile,
    },
    db::{change_object, IV},
    hostclient::HostClient,
    msg,
    state::State,
    webclient::{self, WebClient},
};
use anyhow::{anyhow, bail, Context, Result};
use futures::future::join_all;
use log::{error, info};
use sadmin2::{
    client_message::{
        ClientHostMessage, DataSource, FailureMessage, HostClientMessage, RunScriptMessage,
        RunScriptOutType, RunScriptStdinType, SuccessMessage,
    },
    finite_float::ToFinite,
};
use serde::Deserialize;
use sqlx_type::query;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio_tasks::{cancelable, RunToken};

const FILE_ID: i64 = 6;
const CRON_ID: i64 = 10240;
const SYSTEMD_SERVICE_ID: i64 = 10206;

#[derive(Deserialize)]
struct DeploymentContentFile {
    #[serde(default)]
    data: Option<String>,
    #[serde(default)]
    path: Option<String>,
}

#[derive(Deserialize)]
struct DeploymentContentSystemdService {
    #[serde(default)]
    unit: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
struct DeploymentContentCron {
    #[serde(default)]
    script: Option<String>,
    #[serde(default)]
    path: Option<String>,
}

#[derive(Deserialize)]
struct DeploymentContent<T> {
    object: i64,
    content: T,
}

struct Prop {
    dead: bool,
    updated: bool,
}

#[derive(Default)]
pub struct ModifiedFiles {
    last_scan: Option<f64>,
    scanning: bool,
    idc: i64,
    modified_files: Vec<(ModifiedFile, Prop)>,
}

#[derive(Deserialize)]
struct FileContent<'a> {
    data: &'a str,
}

struct Obj {
    path: String,
    r#type: i64,
    data: String,
    object: i64,
}

async fn broadcast_changes(state: &State) -> Result<()> {
    let msg = {
        let mut content = state.modified_files.lock().unwrap();
        let mut changed = Vec::new();
        let mut removed = Vec::new();
        for (f, p) in &mut content.modified_files {
            if !p.updated {
                continue;
            }
            if p.dead {
                removed.push(f.id);
            } else {
                changed.push(f.clone());
            }
            p.updated = false;
        }
        content.modified_files.retain(|(_, p)| !p.dead);

        IServerAction::ModifiedFilesChanged(IModifiedFilesChanged {
            full: false,
            scanning: content.scanning,
            last_scan_time: content.last_scan.to_finite()?,
            changed,
            removed,
        })
    };
    webclient::broadcast(state, msg)?;
    Ok(())
}

pub async fn scan(state: &State) -> Result<()> {
    let orig_last_scan_time = {
        let mut content = state.modified_files.lock().unwrap();
        if content.scanning {
            return Ok(());
        }

        let orig_last_scan_time = content.last_scan;
        content.scanning = true;

        content.last_scan = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .context("Bad unix time")?
                .as_secs_f64(),
        );
        orig_last_scan_time
    };
    match scan_inner(state).await {
        Ok(v) => Ok(v),
        Err(e) => {
            {
                let mut inner = state.modified_files.lock().unwrap();
                inner.scanning = false;
                inner.last_scan = orig_last_scan_time;
            }
            broadcast_changes(state).await?;
            Err(e)
        }
    }
}

pub async fn scan_inner(state: &State) -> Result<()> {
    info!("Scanning for modified files");
    broadcast_changes(state).await?;

    let rows = query!(
        "SELECT `name`, `content`, `type`, `title`, `host`
            FROM `deployments` WHERE `type` in (?, ?, ?)",
        FILE_ID,
        CRON_ID,
        SYSTEMD_SERVICE_ID
    )
    .fetch_all(&state.db)
    .await?;

    // TODO(jakobt) the types should them selves handle modified content
    // this could be done by adding a modified file path and modified file data template
    // to the type somehow
    let mut objects: HashMap<_, Vec<_>> = HashMap::new();
    for row in rows {
        let (data, path, object) = match row.r#type {
            FILE_ID => {
                let content: DeploymentContent<Option<DeploymentContentFile>> =
                    serde_json::from_str(&row.content)
                        .with_context(|| format!("Unable to parse file content {}", row.content))?;
                let Some(c) = content.content else { continue };
                (c.data, c.path, content.object)
            }
            SYSTEMD_SERVICE_ID => {
                let content: DeploymentContent<Option<DeploymentContentSystemdService>> =
                    serde_json::from_str(&row.content)
                        .context("Unable to parse service content")?;
                let Some(c) = content.content else { continue };
                (
                    c.unit,
                    c.name.map(|v| format!("/etc/systemd/system/{}.service", v)),
                    content.object,
                )
            }
            CRON_ID => {
                let content: DeploymentContent<Option<DeploymentContentCron>> =
                    serde_json::from_str(&row.content).context("Unable to parse cron content")?;
                let Some(c) = content.content else { continue };
                (c.script, c.path, content.object)
            }
            _ => {
                continue;
            }
        };
        let (Some(data), Some(path)) = (data, path) else {
            continue;
        };
        objects.entry(row.host).or_default().push(Obj {
            path,
            r#type: row.r#type,
            data,
            object,
        });
    }

    let mut futures = Vec::new();

    for (host_id, objs) in &objects {
        let paths: Vec<_> = objs.iter().map(|v| v.path.clone()).collect();
        let Some(host) = state.host_clients.lock().unwrap().get(host_id).cloned() else {
            bail!("Host {} not up", host_id)
        };
        futures.push(run_host_scan_job(*host_id, host, paths));
    }

    let results = join_all(futures).await;
    let mut messages = Vec::new();
    let oids = {
        let mut inner = state.modified_files.lock().unwrap();
        for (host, content) in results {
            let content = match content {
                Ok(v) => v,
                Err(e) => {
                    return Err(e)
                        .with_context(|| format!("Failed getting host content on {}", host));
                }
            };
            let content: Vec<FileContent> =
                serde_json::from_str(&content).context("Failed reading host content")?;
            let objs = objects
                .remove(&host)
                .context("Got content from unknown host")?;
            if objs.len() != content.len() {
                bail!("Not all files there")
            }
            let mut modified = HashMap::new();
            for (obj, content) in objs.into_iter().zip(content.iter()) {
                if obj.data == content.data {
                    continue;
                }
                modified.insert(
                    obj.path,
                    (obj.data, obj.r#type, obj.object, content.data.to_string()),
                );
            }
            for (m, p) in &mut inner.modified_files {
                if m.host != host {
                    continue;
                }
                let Some((deployed, r#type, object, actual)) = modified.remove(&m.path) else {
                    alter(&mut p.dead, true, &mut p.updated);
                    continue;
                };
                alter(&mut p.dead, false, &mut p.updated);
                alter(&mut m.actual, actual, &mut p.updated);
                alter(&mut m.deployed, deployed, &mut p.updated);
                alter(&mut m.object, object, &mut p.updated);
                alter(&mut m.r#type, r#type, &mut p.updated);
            }
            for (path, (deployed, r#type, object, actual)) in modified.into_iter() {
                messages.push((
                    host,
                    format!("The file {} has been modified since it was deployed", path),
                ));
                let id = inner.idc;
                inner.idc += 1;
                inner.modified_files.push((
                    ModifiedFile {
                        id,
                        r#type,
                        host,
                        object,
                        deployed,
                        actual,
                        current: None,
                        path,
                    },
                    Prop {
                        dead: false,
                        updated: true,
                    },
                ));
            }
        }
        let oids: Vec<_> = inner.modified_files.iter().map(|(f, _)| f.object).collect();
        oids
    };

    for (host, message) in messages {
        msg::emit(state, host, "Modified file".to_string(), message).await?;
    }

    {
        let m: HashMap<_, _> = query!(
            "SELECT `id`, `content` FROM `objects` WHERE `newest` AND `id` in (_LIST_)",
            oids
        )
        .map(|r| (r.id, r.content))
        .fetch_all(&state.db)
        .await?
        .into_iter()
        .collect();

        let mut inner = state.modified_files.lock().unwrap();
        for (f, _) in &mut inner.modified_files {
            let Some(c) = m.get(&f.object) else { continue };
            f.current = match f.r#type {
                FILE_ID => {
                    let c: DeploymentContentFile = serde_json::from_str(c)?;
                    c.data
                }
                SYSTEMD_SERVICE_ID => {
                    let c: DeploymentContentSystemdService = serde_json::from_str(c)?;
                    c.unit
                }
                CRON_ID => {
                    let c: DeploymentContentCron = serde_json::from_str(c)?;
                    c.script
                }
                _ => None,
            };
        }

        inner.scanning = false;
    }
    broadcast_changes(state).await?;

    Ok(())
}

pub async fn resolve(state: &State, client: &WebClient, act: IModifiedFilesResolve) -> Result<()> {
    let Some(f) = state
        .modified_files
        .lock()
        .unwrap()
        .modified_files
        .iter()
        .find(|(f, _)| f.id == act.id)
        .map(|(f, _)| f)
        .cloned()
    else {
        bail!("Unable to find object with that id")
    };

    match act.action {
        crate::action_types::IModifiedFilesResolveAction::Redeploy => {
            let Some(host) = state.host_clients.lock().unwrap().get(&f.host).cloned() else {
                bail!("Host is not up");
            };

            let script = "
import sys
o = ${JSON.stringify({ path: f2.path, content: f2.deployed })}
with open(o['path'], 'w', encoding='utf-8') as f:
f.write(o['content'])
";

            let mut jh = host
                .start_job(&HostClientMessage::RunScript(RunScriptMessage {
                    id: host.next_job_id(),
                    name: "revert.py".to_string(),
                    interperter: "/usr/bin/python3".to_string(),
                    content: script.to_string(),
                    args: Vec::new(),
                    input_json: None,
                    stdin_type: Some(RunScriptStdinType::None),
                    stdout_type: Some(RunScriptOutType::None),
                    stderr_type: Some(RunScriptOutType::Text),
                }))
                .await?;

            match jh.next_message().await? {
                Some(ClientHostMessage::Success(SuccessMessage { code, .. })) => {
                    jh.done();
                    if let Some(code) = code {
                        if code != 0 {
                            bail!("Resolve job failed with code {}", code);
                        }
                    }
                }
                Some(ClientHostMessage::Failure(FailureMessage { .. })) => {
                    jh.done();
                    bail!("Failure in resolve job")
                }
                Some(_) => {
                    bail!("Got unknown message in resolve");
                }
                None => {
                    bail!("Host dissapeared")
                }
            }

            for (f, p) in &mut state.modified_files.lock().unwrap().modified_files {
                if f.id == act.id {
                    p.dead = true;
                    p.updated = true;
                }
            }
            broadcast_changes(state).await?;
        }
        crate::action_types::IModifiedFilesResolveAction::UpdateCurrent => {
            let r = query!(
                "SELECT `id`, `version`, `type`, `name`, `content`, `category`, `comment`,
                strftime('%s', `time`) AS `time`, `author` FROM `objects`
                WHERE `id`=? AND `newest`",
                f.object
            )
            .fetch_one(&state.db)
            .await?;

            let mut obj = IObject2::<serde_json::Value> {
                id: f.object,
                r#type: r.r#type.try_into()?,
                name: r.name,
                category: r.category.unwrap_or_default(),
                content: serde_json::from_str(&r.content)?,
                version: Some(r.version),
                comment: r.comment,
                author: r.author,
                time: Some(r.time.parse()?),
            };

            let key = match f.r#type {
                FILE_ID => "data",
                SYSTEMD_SERVICE_ID => "unit",
                CRON_ID => "script",
                _ => bail!("Unknown object type"),
            };
            obj.content
                .as_object_mut()
                .context("Expected object")?
                .insert(
                    key.to_string(),
                    serde_json::Value::String(act.new_current.context("Missing new current")?),
                );

            let IV { id, version } = change_object(
                state,
                f.object,
                Some(&obj),
                client.get_auth().user.as_deref().context("Missing user")?,
            )
            .await?;
            obj.version = Some(version);
            webclient::broadcast(
                state,
                IServerAction::ObjectChanged(IObjectChanged {
                    id,
                    object: vec![obj],
                }),
            )?;
        }
    }

    Ok(())
}

pub async fn list(
    rt: &RunToken,
    state: &State,
    client: &WebClient,
    _: IModifiedFilesList,
) -> Result<()> {
    let msg = {
        let inner = state.modified_files.lock().unwrap();
        IServerAction::ModifiedFilesChanged(IModifiedFilesChanged {
            full: true,
            scanning: inner.scanning,
            last_scan_time: inner.last_scan.to_finite()?,
            changed: inner
                .modified_files
                .iter()
                .filter(|(_, p)| !p.dead)
                .map(|(m, _)| m.clone())
                .collect(),
            removed: Vec::new(),
        })
    };
    client.send_message(rt, msg).await?;
    Ok(())
}

fn alter<T: Eq>(a: &mut T, b: T, up: &mut bool) {
    if a == &b {
        return;
    }
    *a = b;
    *up = true;
}

async fn run_host_scan_job(
    host_id: i64,
    host: Arc<HostClient>,
    paths: Vec<String>,
) -> (i64, Result<String>) {
    match tokio::time::timeout(
        Duration::from_secs(30),
        run_host_scan_job_inner(host, paths),
    )
    .await
    {
        Ok(v) => (host_id, v),
        Err(_) => (host_id, Err(anyhow!("Timeout running host scan job"))),
    }
}

async fn run_host_scan_job_inner(host: Arc<HostClient>, paths: Vec<String>) -> Result<String> {
    let script = "
import sys, base64, json
ans = {'content': []}
for path in sys.argv[1:]:
    data = None
    try:
        with open(path, 'rb') as f:
            data = f.read().decode('utf-8')
    except OSError:
        pass
    ans['content'].append({'path': path, 'data': data})
sys.stdout.write(json.dumps(ans))
sys.stdout.flush()";
    let mut jh = host
        .start_job(&HostClientMessage::RunScript(RunScriptMessage {
            id: host.next_job_id(),
            name: "read_files.py".to_string(),
            interperter: "/usr/bin/python3".to_string(),
            content: script.to_string(),
            args: paths,
            input_json: None,
            stdin_type: Some(RunScriptStdinType::None),
            stdout_type: Some(RunScriptOutType::Text),
            stderr_type: Some(RunScriptOutType::None),
        }))
        .await?;
    let mut out = String::new();
    loop {
        match jh.next_message().await? {
            Some(ClientHostMessage::Data(m)) => {
                if matches!(m.source, Some(DataSource::Stdout)) {
                    out.push_str(m.data.as_str().context("Expected str")?);
                }
            }
            Some(ClientHostMessage::Success(m)) => {
                jh.done();
                if let Some(code) = m.code {
                    if code != 0 {
                        bail!("Script returned {}", code);
                    }
                }
                break;
            }
            Some(ClientHostMessage::Failure(m)) => {
                jh.done();
                bail!("Script failure {:?}", m)
            }
            Some(m) => {
                bail!("Unknown message for job {:?}", m)
            }
            None => {
                bail!("Client went away")
            }
        }
    }
    Ok(out)
}

pub async fn modified_files_scan(state: Arc<State>, run_token: RunToken) -> Result<()> {
    if cancelable(&run_token, tokio::time::sleep(Duration::from_secs(2 * 60)))
        .await
        .is_err()
    {
        return Ok(());
    }
    loop {
        match cancelable(&run_token, scan(&state)).await {
            Ok(Ok(())) => (),
            Ok(Err(e)) => {
                error!("Error in modified_files.scan {:?}", e);
            }
            Err(_) => break,
        }
        if cancelable(
            &run_token,
            tokio::time::sleep(Duration::from_secs(60 * 60 * 12)),
        )
        .await
        .is_err()
        {
            break;
        }
    }
    Ok(())
}
