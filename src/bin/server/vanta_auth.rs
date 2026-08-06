use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug)]
struct VantaTokenRequest<'a> {
    client_id: &'a str,
    client_secret: &'a str,
    scope: &'a str,
    grant_type: &'a str,
}

#[derive(Deserialize, Debug)]
struct VantaTokenResponse {
    access_token: String,
}

#[derive(Deserialize, Debug)]
struct VantaSyncResponse {
    success: bool,
}

/// Requests an OAuth access token from Vanta using client credentials, returning the bearer token.
pub async fn get_vanta_token(
    client: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
    scope: &str,
) -> Result<String> {
    let r = client
        .post("https://api.vanta.com/oauth/token")
        .json(&VantaTokenRequest {
            client_id,
            client_secret,
            scope,
            grant_type: "client_credentials",
        })
        .build()
        .context("Failed building token request")?;

    let r = client
        .execute(r)
        .await
        .context("Failed executing token request")?;

    if let Err(e) = r.error_for_status_ref() {
        let text = r.text().await?;
        return Err(e).context(format!("Failed token request: {text}"));
    }

    let token: VantaTokenResponse = r.json().await.context("Failed getting token")?;
    Ok(token.access_token)
}

/// Checks a Vanta resource-sync response for HTTP and application level errors, `action` is used in error messages.
pub async fn check_vanta_sync(r: reqwest::Response, action: &str) -> Result<()> {
    if let Err(e) = r.error_for_status_ref() {
        let text = r.text().await?;
        return Err(e).context(format!("Failed {action}: {text}"));
    }

    let response: VantaSyncResponse = r
        .json()
        .await
        .context("Failed deserializing sync response")?;

    if !response.success {
        bail!("Vanta reported failure for {action}");
    }

    Ok(())
}
