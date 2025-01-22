use std::sync::Arc;

use anyhow::Context;
use axum::extract::{Query, State as WState};
use axum::response::{IntoResponse, Response};
use base64::{prelude::BASE64_URL_SAFE, Engine};
use log::error;
use serde::Deserialize;
use serde_json::Value;

use crate::{
    action_types::{IObject2, IObjectChanged, IServerAction},
    crypt,
    db::{self, IV},
    state::State,
    web_util::WebError,
    webclient,
};

use sadmin2::type_types::HOST_ID;

#[derive(Deserialize)]
pub struct SetupQuery {
    host: String,
    token: String,
}

pub async fn setup(
    WState(state): WState<Arc<State>>,
    Query(SetupQuery { host, token }): Query<SetupQuery>,
) -> Result<Response, WebError> {
    let ho = db::get_object_by_name_and_type(&state, host.clone(), HOST_ID).await?;
    let Some(ho) = ho else {
        error!("Setup invalid host");
        return Err(WebError::not_found());
    };
    let mut ho: IObject2<Value> = ho;
    if ho.content.get("password").and_then(|v| v.as_str()) != Some(&token) {
        error!("Setup invalid token");
        return Err(WebError::not_found());
    }

    let mut buf = [0; 18];
    crypt::random_fill(&mut buf)?;
    let npw = BASE64_URL_SAFE.encode(buf);
    let cpw = crypt::hash(&npw)?;
    ho.content
        .as_object_mut()
        .context("Logic error")?
        .insert("password".into(), cpw.into());
    let IV { id, version } = db::change_object(&state, ho.id, Some(&ho), "setup").await?;
    ho.id = id;
    ho.version = Some(version);

    webclient::broadcast(
        &state,
        IServerAction::ObjectChanged(IObjectChanged {
            id,
            object: vec![ho],
        }),
    )?;

    let script = format!(
        r#"#!/bin/bash
set -e
if which apt; then
  apt install -y wget unzip
fi
echo '{{"server_host": "{}", "hostname": "{}"}}' > /etc/sadmin.json
echo '{{"password": "{}"}}' > /etc/sadmin_client_auth.json
chmod 0600 /etc/sadmin_client_auth.json
wget https://github.com/antialize/simple-admin/releases/download/v0.0.51/sadmin-client.zip -O /tmp/sadmin-client.zip
cd /usr/local/bin
unzip -o /tmp/sadmin-client.zip
/usr/local/bin/sadmin upgrade
systemctl daemon-reload
systemctl enable simpleadmin-client.service
systemctl restart simpleadmin-client.service
systemctl status simpleadmin-client.service
echo 'Done'"#,
        state.config.hostname, host, npw
    );

    Ok(([("Content-Type", "text/x-shellscript")], script).into_response())
}
