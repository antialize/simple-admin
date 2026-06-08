use std::sync::Arc;

use axum::extract::{Query, State as WState};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use base64::{Engine, prelude::BASE64_URL_SAFE};
use log::error;
use serde::Deserialize;

use crate::{
    action_types::{IObject2, IObjectChanged, IServerAction},
    crypt,
    db::{self, IV},
    state::State,
    web_util::WebError,
    webclient,
};

use sadmin2::type_types::{HOST_ID, ValueMap};

#[derive(Deserialize)]
pub struct SetupQuery {
    host: String,
}

pub async fn setup(
    WState(state): WState<Arc<State>>,
    headers: HeaderMap,
    Query(SetupQuery { host }): Query<SetupQuery>,
) -> Result<Response, WebError> {
    // The setup token is passed in the Authorization header as a Bearer token,
    // not as a URL query parameter, to prevent it appearing in server logs and
    // browser / proxy history.
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(WebError::forbidden)?;

    let ho = db::get_object_by_name_and_type(&state, host.clone(), HOST_ID).await?;
    let Some(ho) = ho else {
        error!("Setup invalid host");
        return Err(WebError::not_found());
    };
    let mut ho: IObject2<ValueMap> = ho;
    let stored_pw = ho
        .content
        .get("password")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let token_valid = crypt::cost_time_compare(token.as_bytes(), stored_pw.as_bytes());
    if !token_valid {
        error!("Setup invalid token");
        return Err(WebError::forbidden());
    }

    let mut buf = [0; 18];
    crypt::random_fill(&mut buf)?;
    let npw = BASE64_URL_SAFE.encode(buf);
    let cpw = crypt::hash(&npw)?;
    ho.content.insert("password".into(), cpw.into());
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
