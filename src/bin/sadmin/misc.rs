use std::collections::HashMap;

use crate::{
    connection::{Config, Connection},
    message::Message,
};
use anyhow::{Context, Result, bail};
use serde::{ser::SerializeMap, Deserialize, Serializer};

/// List deployments of containers and services among all hosts
#[derive(clap::Parser)]
pub struct GetRoot {
    pub key: Option<String>,
}

#[derive(Deserialize)]
pub struct Variable {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize)]
pub struct Root {
    pub variables: Vec<Variable>,
    pub preamble: String,
}

pub async fn get_root(config: Config, args: GetRoot) -> Result<()> {
    let mut c = Connection::open(config, false).await?;
    c.prompt_auth().await?;
    let state = fetch_initial_state(&mut c).await?;
    let root_id = get_root_id(state)?;
    let root_object = fetch_object_by_id(c, root_id).await?;
    if let Some(k) = args.key {
        let x = root_object.variables.into_iter().find(|x| &x.key == &k);
        if let Some(x) = x {
            println!("{}", x.value);
        } else {
			bail!("Root object has no key '{}'", k);
		}
    } else {
        print_variables_as_json(root_object.variables)?;
    }
    Ok(())
}

fn get_root_id(state: crate::message::State) -> Result<u64, anyhow::Error> {
    let type_ids = extract_type_ids(&state);
    let root_type_id = type_ids
        .get("Root")
        .context("Getting root type id in initial state")?;
    let roots = state
        .object_names_and_ids
        .get(&format!("{}", root_type_id))
        .context("Getting root id")?;
    let root = roots.get(0).context("Getting root")?;
    let root_id = root.id;
    Ok(root_id)
}

fn extract_type_ids(state: &crate::message::State) -> HashMap<&str, u64> {
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
    type_ids
}

async fn fetch_initial_state(c: &mut Connection) -> Result<crate::message::State, anyhow::Error> {
    c.send(&Message::RequestInitialState {}).await?;
    let mut state = None;
    while state.is_none() {
        match c.recv().await? {
            Message::SetInitialState(s) => state = Some(s),
            _ => (),
        }
    }
    let state = state.unwrap();
    Ok(state)
}

async fn fetch_object_by_id(mut c: Connection, root_id: u64) -> Result<Root, anyhow::Error> {
    c.send(&Message::FetchObject { id: root_id }).await?;
    let mut root_object: Option<Root> = None;
    while root_object.is_none() {
        match c.recv().await? {
            Message::ObjectChanged { id, object } if id == root_id => {
                let object = object
                    .into_iter()
                    .last()
                    .context("Getting root object details")?;
                root_object = Some(serde_json::from_value(object.content)?);
            }
            _ => (),
        }
    }
    Ok(root_object.unwrap())
}

fn print_variables_as_json(variables: Vec<Variable>) -> Result<(), anyhow::Error> {
    let mut serializer = serde_json::Serializer::pretty(std::io::stdout());
    let mut serializer = serializer.serialize_map(Some(variables.len()))?;
    for x in variables.into_iter() {
        serializer.serialize_entry(&x.key, &x.value)?;
    }
    serializer.end()?;
    println!("");
    Ok(())
}
