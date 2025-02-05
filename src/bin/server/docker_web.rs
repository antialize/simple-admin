use std::borrow::Cow;
use std::collections::HashMap;
use std::os::unix::fs::MetadataExt;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use anyhow::{anyhow, Context};
use axum::body::Body;
use axum::extract::{FromRequestParts, Query, Request, State as WState};
use axum::http::request::Parts;
use axum::http::{Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Router;
use axum::{extract::Path, Json};
use base64::prelude::BASE64_STANDARD;
use base64::Engine;
use futures::StreamExt;
use log::info;
use sadmin2::finite_float::ToFinite;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use sha2::Sha256;
use sqlx_type::query;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex as TMutex;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::action_types::{
    DockerImageTag, DockerImageTagRow, IAuthStatus, IDockerListImageTagsCharged, IServerAction,
};
use crate::crypt::cost_time_compare;
use crate::docker::DOCKER_BLOBS_PATH;
use crate::get_auth::get_auth;
use crate::state::State;
use crate::web_util::{ContentLength, ContentRange, WebError, WrappedError};
use crate::webclient;

const DOCKER_UPLOAD_PATH: &str = "/var/tmp/simpleadmin_docker_uploads/";

#[derive(Serialize, Clone)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[allow(dead_code)]
enum RegistryErrorCode {
    BlobUnknown,
    BlobUploadInvalid,
    BlobUploadUnknown,
    DigestInvalid,
    ManifestBlobUnknown,
    ManifestInvalid,
    ManifestUnknown,
    SizeInvalid,
    TagInvalid,
    Unauthorized,
    Denied,
    Unsupported,
    Unknown,
}

#[derive(Serialize, Clone)]
struct RegistryError {
    code: RegistryErrorCode,
    message: Cow<'static, str>,
    detail: Option<serde_json::Value>,
}

#[derive(Serialize, Clone)]
struct RegistryErrors {
    errors: Vec<RegistryError>,
}

struct ApiError {
    status_code: StatusCode,
    errors: RegistryErrors,
    internal_error: Option<anyhow::Error>,
}

impl ApiError {
    fn simple(
        status_code: StatusCode,
        code: RegistryErrorCode,
        message: Cow<'static, str>,
    ) -> ApiError {
        let internal_error = anyhow!("api error: {}", message);
        ApiError {
            status_code,
            errors: RegistryErrors {
                errors: vec![RegistryError {
                    code,
                    message,
                    detail: None,
                }],
            },
            internal_error: Some(internal_error),
        }
    }
}

trait ToApiError {
    type R;
    fn to_api_error(self, message: impl Into<Cow<'static, str>>) -> Self::R;
}

impl<T, E: Into<anyhow::Error>> ToApiError for Result<T, E> {
    type R = Result<T, ApiError>;

    fn to_api_error(self, message: impl Into<Cow<'static, str>>) -> Self::R {
        match self {
            Ok(v) => Ok(v),
            Err(e) => {
                let e: anyhow::Error = e.into();
                let message = message.into();
                let e = e.context(message.clone());
                Err(ApiError {
                    status_code: StatusCode::INTERNAL_SERVER_ERROR,
                    errors: RegistryErrors {
                        errors: vec![RegistryError {
                            code: RegistryErrorCode::Unknown,
                            message,
                            detail: None,
                        }],
                    },
                    internal_error: Some(e),
                })
            }
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut res = (self.status_code, Json(self.errors)).into_response();
        if let Some(err) = self.internal_error {
            res.extensions_mut().insert(WrappedError(Arc::new(err)));
        }
        res
    }
}

macro_rules! api_error {
    ($status_code:ident, $registry_code:ident, $msg:literal $(,)?) => {
        return Err(ApiError::simple(StatusCode::$status_code, RegistryErrorCode::$registry_code, $msg.into()));
    };
    ($status_code:ident, $registry_code:ident, $fmt:expr, $($arg:tt)*) => {
        return Err(ApiError::simple(StatusCode::$status_code, RegistryErrorCode::$registry_code, format!($fmt, $($arg)*).into()));
    };
}

pub async fn init_upload() -> Result<(), anyhow::Error> {
    tokio::fs::remove_dir_all(DOCKER_UPLOAD_PATH)
        .await
        .with_context(|| format!("Failure removing {}", DOCKER_UPLOAD_PATH))?;
    tokio::fs::create_dir(DOCKER_UPLOAD_PATH)
        .await
        .with_context(|| format!("Failure creating {}", DOCKER_UPLOAD_PATH))?;
    match tokio::fs::create_dir(DOCKER_BLOBS_PATH).await {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(e) => return Err(e).context(format!("Failure creating {}", DOCKER_BLOBS_PATH)),
    }
    Ok(())
}
struct UploadInner {
    count: u64,
    hash: Sha256,
    file: tokio::fs::File,
}

pub struct Upload {
    shadow_range: AtomicU64,
    inner: TMutex<Option<UploadInner>>,
}

fn is_docker_hash(v: &str) -> bool {
    v.strip_prefix("sha256:")
        .map(|v| {
            v.as_bytes()
                .iter()
                .all(|v| matches!(v, b'0'..=b'9' | b'A'..=b'Z' | b'a'..=b'z' ))
        })
        .unwrap_or_default()
}

async fn check_docker_path<T: Sync, F: FnOnce(IAuthStatus) -> Option<T>>(
    parts: &Parts,
    state: &Arc<State>,
    cb: F,
) -> Result<T, Response> {
    let Some(auth_header) = parts.headers.get("Authorization") else {
        return Err((
            StatusCode::UNAUTHORIZED,
            [(
                "WWW-Authenticate",
                "Basic realm=\"User Visible Realm\", charset=\"UTF-8\"",
            )],
            Json(RegistryErrors {
                errors: vec![RegistryError {
                    code: RegistryErrorCode::Unauthorized,
                    message: "authentication required".into(),
                    detail: None,
                }],
            }),
        )
            .into_response());
    };
    if let Some(auth) = auth_header
        .to_str()
        .ok()
        .and_then(|v| {
            v.strip_prefix("Basic ")
                .or_else(|| v.strip_prefix("token "))
                .or_else(|| v.strip_prefix("Bearer "))
        })
        .and_then(|v| BASE64_STANDARD.decode(v).ok())
        .and_then(|v| String::from_utf8(v).ok())
    {
        if let Some((user, sid)) = auth.split_once(":") {
            if let Ok(a) = get_auth(state, None, Some(sid)).await {
                if a.user.as_deref() == Some(user) {
                    if let Some(v) = cb(a) {
                        return Ok(v);
                    }
                }
            }
        }
    }
    Err((
        StatusCode::FORBIDDEN,
        [(
            "WWW-Authenticate",
            "Basic realm=\"User Visible Realm\", charset=\"UTF-8\"",
        )],
        Json(RegistryErrors {
            errors: vec![RegistryError {
                code: RegistryErrorCode::Denied,
                message: "Invalid token".into(),
                detail: None,
            }],
        }),
    )
        .into_response())
}

pub struct DockerAuthPull;

impl FromRequestParts<Arc<State>> for DockerAuthPull {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &Arc<State>) -> Result<Self, Response> {
        check_docker_path(
            parts,
            state,
            |a| if a.docker_pull { Some(()) } else { None },
        )
        .await?;
        Ok(Self)
    }
}

pub struct DockerAuthPush {
    user: String,
}
impl FromRequestParts<Arc<State>> for DockerAuthPush {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &Arc<State>) -> Result<Self, Response> {
        let user = check_docker_path(parts, state, |a| {
            if a.docker_push {
                if a.user.as_deref() == Some("docker_client") {
                    None
                } else {
                    a.user
                }
            } else {
                None
            }
        })
        .await?;
        Ok(Self { user })
    }
}

async fn handle_upload(
    body: Body,
    inner: &mut UploadInner,
    shadow_range: &AtomicU64,
) -> Result<(), anyhow::Error> {
    use sha2::Digest;
    let mut body = body.into_data_stream();
    while let Some(frame) = body.next().await {
        let frame = frame.context("Reading frame failed")?;
        inner
            .file
            .write_all(&frame)
            .await
            .context("File write failed")?;
        inner.hash.update(&frame);
        shadow_range.fetch_add(frame.len() as u64, std::sync::atomic::Ordering::SeqCst);
        inner.count += frame.len() as u64;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ImagesResult {
    images: Vec<DockerImageTag>,
}

pub async fn images_handler(
    _: DockerAuthPull,
    WState(state): WState<Arc<State>>,
    Path(project): Path<String>,
) -> Result<Json<ImagesResult>, WebError> {
    let rows = sqlx_type::query_as!(
        DockerImageTagRow,
        "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`,
        `removed` FROM `docker_images` WHERE `project` = ? ORDER BY `time`",
        project
    )
    .fetch_all(&state.db)
    .await?;
    let mut images = Vec::new();
    for row in rows {
        images.push(row.try_into()?);
    }
    Ok(Json(ImagesResult { images }))
}

#[derive(Deserialize)]
pub struct UsedImagesQuery {
    token: String,
}

#[derive(Deserialize)]
pub struct UsedImagesBody {
    images: Vec<String>,
}

pub async fn used_images(
    WState(state): WState<Arc<State>>,
    Query(UsedImagesQuery { token }): Query<UsedImagesQuery>,
    Json(body): Json<UsedImagesBody>,
) -> Result<(), WebError> {
    if !state
        .config
        .used_images_token
        .as_ref()
        .map(|v| cost_time_compare(v.as_bytes(), token.as_bytes()))
        .unwrap_or_default()
    {
        return Err(WebError::forbidden());
    }
    if state.read_only {
        return Err(WebError::forbidden());
    }
    let mut images = Vec::new();
    for image in body.images {
        let Some((_, image)) = image.split_once("@") else {
            continue;
        };
        let image = image.to_ascii_lowercase();
        let Some(tail) = image.strip_prefix("sha256:") else {
            continue;
        };
        if !tail
            .as_bytes()
            .iter()
            .all(|c| matches!(c, b'0'..=b'9' | b'a'..=b'z'))
        {
            continue;
        };
        images.push(image);
    }
    let now = std::time::SystemTime::now();
    let now = now
        .duration_since(std::time::UNIX_EPOCH)
        .context("Bad unix time")?
        .as_secs_f64();
    query!(
        "UPDATE `docker_images` SET `used`=? WHERE `hash` IN (_LIST_)",
        now,
        images
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

// GET /v2/ Base Check that the endpoint implements Docker Registry API V2.
async fn basic_check(_: DockerAuthPull) -> StatusCode {
    StatusCode::OK
}

// GET /v2/<name>/blobs/uploads/<uuid> Blob Upload Retrieve status of upload identified by uuid. The primary purpose of this endpoint is to resolve the current status of a resumable upload.
async fn get_blob_upload_status(
    _: DockerAuthPull,
    WState(state): WState<Arc<State>>,
    Path((_, uuid)): Path<(String, Uuid)>,
    req: Request,
) -> Result<Response, ApiError> {
    let range = state
        .docker_uploads
        .lock()
        .unwrap()
        .get(&uuid)
        .map(|v| v.shadow_range.load(std::sync::atomic::Ordering::SeqCst));
    let Some(range) = range else {
        api_error!(NOT_FOUND, BlobUploadUnknown, "Missing uuid={}", uuid);
    };
    Ok((
        StatusCode::ACCEPTED,
        [
            ("Location", req.uri().to_string()),
            ("Range", format!("0-{}", range - 1)),
            ("Docker-Upload-UUID", uuid.to_string()),
        ],
    )
        .into_response())
}

// GET /v2/<name>/blobs/<digest> Blob Retrieve the blob from the registry identified by digest. A HEAD request can also be issued to this endpoint to obtain resource information without receiving all data.
async fn get_blob(
    _: DockerAuthPull,
    Path((_, digest)): Path<(String, String)>,
    method: Method,
) -> Result<Response, ApiError> {
    if !is_docker_hash(&digest) {
        api_error!(BAD_REQUEST, Unknown, "Bad name {}", digest);
    }
    let path = std::path::Path::new(DOCKER_BLOBS_PATH).join(&digest);
    let file = match tokio::fs::File::open(path).await {
        Ok(v) => v,
        Err(e) => {
            api_error!(NOT_FOUND, BlobUnknown, "Not found {} {:?}", digest, e);
        }
    };
    let length = file
        .metadata()
        .await
        .to_api_error("Failed to get metadata")?
        .len();
    if method == Method::HEAD {
        return Ok((
            StatusCode::OK,
            [
                ("Docker-Content-Digest", digest),
                ("Content-Type", "application/octet-stream".to_string()),
                ("Content-Length", length.to_string()),
            ],
            (),
        )
            .into_response());
    }

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok((
        StatusCode::OK,
        [
            ("Docker-Content-Digest", digest),
            ("Content-Type", "application/octet-stream".to_string()),
            ("Content-Length", length.to_string()),
        ],
        body,
    )
        .into_response())
}

// GET /v2/<name>/manifests/<reference> Manifest Fetch the manifest identified by name and reference where reference can be a tag or digest. A HEAD request can also be issued to this endpoint to obtain resource information without receiving all data.
async fn get_manifest(
    _: DockerAuthPull,
    WState(state): WState<Arc<State>>,
    Path((name, reference)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let row = query!(
        "SELECT `manifest` FROM `docker_images`
        WHERE `project`=? AND (`tag`=? OR `hash`=?) ORDER BY `time` DESC LIMIT 1",
        name,
        reference,
        reference
    )
    .fetch_optional(&state.db)
    .await
    .to_api_error("Query failed")?;
    let Some(row) = row else {
        api_error!(
            NOT_FOUND,
            ManifestUnknown,
            "Docker get manifest: not found project: {}, identifer: {}"
        );
    };
    Ok((
        StatusCode::OK,
        [(
            "Content-Type",
            "application/vnd.docker.distribution.manifest.v2+json",
        )],
        row.manifest,
    )
        .into_response())
}

#[derive(Deserialize)]
struct PutBlobUploadQuery {
    digest: String,
}

// PUT /v2/<name>/blobs/uploads/<uuid> Blob Upload Complete the upload specified by uuid, optionally appending the body as the final chunk.
async fn put_blob_upload(
    _: DockerAuthPush,
    WState(state): WState<Arc<State>>,
    Path((name, uuid)): Path<(String, Uuid)>,
    Query(PutBlobUploadQuery { digest }): Query<PutBlobUploadQuery>,
    content_length: Option<ContentLength>,
    content_range: Option<ContentRange>,
    body: Body,
) -> Result<Response, ApiError> {
    let u = state.docker_uploads.lock().unwrap().get(&uuid).cloned();
    let Some(u) = u else {
        api_error!(NOT_FOUND, BlobUploadUnknown, "Missing uuid={}", uuid);
    };

    let Ok(mut inner) = u.inner.try_lock() else {
        api_error!(
            BAD_REQUEST,
            Unknown,
            "Concurrent operation on uuidd={}",
            uuid
        );
    };
    let Some(mut inner) = inner.take() else {
        api_error!(
            BAD_REQUEST,
            Unknown,
            "Concurrent operation on uuidd={}",
            uuid
        );
    };

    let start_size = inner.count;
    let mut expected_size = content_length.map(|v| v.0);

    if let Some(ContentRange { start, end }) = content_range {
        if start != start_size {
            api_error!(
                BAD_REQUEST,
                SizeInvalid,
                "Uploaded chunk not at end of uuid={}, start={}, start_size={}",
                uuid,
                start,
                start_size
            );
        }
        if let Some(expected_size) = &expected_size {
            if end - start != *expected_size {
                api_error!(BAD_REQUEST, SizeInvalid,
                    "Inconsistent content-range and content-length uuid={}, start={}, end={}, expected_size={}",
                    uuid, start, end, expected_size);
            }
        } else {
            expected_size = Some(end - start);
        }
    }

    handle_upload(body, &mut inner, &u.shadow_range)
        .await
        .to_api_error("Upload failed")?;

    if let Some(expected_size) = expected_size {
        if inner.count != start_size + expected_size {
            api_error!(
                BAD_REQUEST,
                SizeInvalid,
                "Inconsistent size uuid={}, got={}, expected_size={}",
                uuid,
                inner.count - start_size,
                expected_size
            );
        }
    }
    state.docker_uploads.lock().unwrap().remove(&uuid);

    let UploadInner {
        hash,
        mut file,
        count,
    } = inner;
    let actual_digest = format!("sha256:{}", hex::encode(hash.finalize()));
    file.flush().await.to_api_error("Flush failed")?;
    std::mem::drop(file);

    if actual_digest != digest {
        api_error!(
            BAD_REQUEST,
            DigestInvalid,
            "Invalid digest of uploaded chunk uuid={} digest={} actual_digets={}",
            uuid,
            digest,
            actual_digest
        );
    }

    info!(
        "Docker put blob uuid={} total_size={} digest={}",
        uuid, count, actual_digest
    );
    tokio::fs::rename(
        std::path::Path::new(DOCKER_UPLOAD_PATH).join(uuid.to_string()),
        std::path::Path::new(DOCKER_BLOBS_PATH).join(&actual_digest),
    )
    .await
    .to_api_error("Rename failed")?;

    Ok((
        StatusCode::CREATED,
        [
            ("ContentLength", "0".to_string()),
            ("Location", format!("/v2/{}/blobs/{}", name, actual_digest)),
            ("Docker-Content-Digest", actual_digest),
        ],
        "Created",
    )
        .into_response())
}

// PUT /v2/<name>/manifests/<reference> Manifest Put the manifest identified by name and reference where reference can be a tag or digest.
async fn put_manifest(
    DockerAuthPush { user }: DockerAuthPush,
    WState(state): WState<Arc<State>>,
    Path((name, reference)): Path<(String, String)>,
    body: String,
) -> Result<Response, ApiError> {
    if state.read_only {
        api_error!(SERVICE_UNAVAILABLE, Unsupported, "Service read only",);
    }
    info!("Docker put manifest name={} tag={}", name, reference);

    // Validate that manifest is JSON.
    let manifest: crate::docker::Manifest = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            api_error!(BAD_REQUEST, ManifestInvalid, "Invalid manifest {:?}", e);
        }
    };

    for layer in manifest.layers {
        if !is_docker_hash(&layer.digest) {
            api_error!(
                BAD_REQUEST,
                ManifestInvalid,
                "Bad layer digest {}",
                layer.digest
            );
        }
        if layer.media_type != "application/vnd.docker.image.rootfs.diff.tar.gzip" {
            api_error!(
                BAD_REQUEST,
                ManifestInvalid,
                "Layer has invalid media type media type {}",
                layer.media_type
            );
        }

        let size =
            match tokio::fs::metadata(std::path::Path::new(DOCKER_BLOBS_PATH).join(&layer.digest))
                .await
            {
                Ok(v) => v.size(),
                Err(e) => {
                    api_error!(
                        NOT_FOUND,
                        ManifestBlobUnknown,
                        "Blob error {:?} for {}",
                        e,
                        layer.digest
                    );
                }
            };
        if size != layer.size {
            api_error!(
                BAD_REQUEST,
                ManifestInvalid,
                "Blob has wrong size {} vs {} for {}",
                size,
                layer.size,
                layer.digest
            );
        }
    }

    // Read config
    if !is_docker_hash(&manifest.config.digest) {
        api_error!(
            BAD_REQUEST,
            ManifestInvalid,
            "Bad config digest {}",
            manifest.config.digest
        );
    }
    let config = match tokio::fs::read_to_string(
        std::path::Path::new(DOCKER_BLOBS_PATH).join(&manifest.config.digest),
    )
    .await
    {
        Ok(v) => v,
        Err(e) => {
            api_error!(
                NOT_FOUND,
                ManifestBlobUnknown,
                "Unable to read config {}: {:?}",
                manifest.config.digest,
                e
            );
        }
    };
    #[derive(Deserialize)]
    struct ConfigConfig {
        #[serde(default, alias = "Labels")]
        labels: HashMap<String, String>,
    }

    #[derive(Deserialize)]
    struct Config {
        config: ConfigConfig,
    }
    let config: Config = match serde_json::from_str(&config) {
        Ok(v) => v,
        Err(e) => {
            api_error!(
                BAD_REQUEST,
                ManifestBlobUnknown,
                "Docker put manifest: Unable to read config {}: {:?}",
                manifest.config.digest,
                e
            );
        }
    };
    let labels_string = serde_json::to_string(&config.config.labels)
        .to_api_error("Unable to convert labels to string")?;
    let digest = sha2::Sha256::digest(&body);
    let hash = format!("sha256:{}", hex::encode(digest));

    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .to_api_error("Invalid unix time")?
        .as_secs_f64();

    query!(
        "DELETE FROM `docker_images` WHERE `project`=? AND `tag`=? AND `hash`=?",
        name,
        reference,
        hash,
    )
    .execute(&state.db)
    .await
    .to_api_error("Database query failed")?;
    let id = query!(
        "INSERT INTO `docker_images` (`project`, `tag`, `manifest`, `hash`,
        `user`, `time`, `pin`, `labels`)
        VALUES (?, ?, ?, ?, ?, ?, false, ?)",
        name,
        reference,
        body,
        hash,
        user,
        time,
        labels_string,
    )
    .execute(&state.db)
    .await
    .to_api_error("Database query failed")?
    .last_insert_rowid();

    webclient::broadcast(
        &state,
        IServerAction::DockerListImageTagsChanged(IDockerListImageTagsCharged {
            changed: vec![DockerImageTag {
                id,
                image: name.clone(),
                tag: reference,
                hash: hash.clone(),
                time: time.to_finite().to_api_error("Invalid float")?,
                user,
                pin: false,
                labels: config.config.labels,
                removed: None,
                pinned_image_tag: false,
            }],
            removed: Vec::new(),
            image_tag_pin_changed: None,
        }),
    )
    .to_api_error("Broadcast failed")?;

    Ok((
        StatusCode::CREATED,
        [
            ("ContentLength", "0".to_string()),
            ("Location", format!("/v2/{}/manifests/{}", name, hash)),
            ("Docker-Content-Digest", hash),
        ],
        (),
    )
        .into_response())
}

// PATCH /v2/<name>/blobs/uploads/<uuid> Blob Upload Upload a chunk of data for the specified upload.
async fn patch_blob_upload(
    _: DockerAuthPush,
    WState(state): WState<Arc<State>>,
    Path((name, uuid)): Path<(String, Uuid)>,
    content_length: Option<ContentLength>,
    content_range: Option<ContentRange>,
    body: Body,
) -> Result<Response, ApiError> {
    if state.read_only {
        api_error!(SERVICE_UNAVAILABLE, Unsupported, "Service read only",);
    }
    let u = state.docker_uploads.lock().unwrap().get(&uuid).cloned();
    let Some(u) = u else {
        api_error!(NOT_FOUND, BlobUploadUnknown, "missing uuid={}", uuid);
    };

    let Ok(mut inner) = u.inner.try_lock() else {
        api_error!(
            BAD_REQUEST,
            Unknown,
            "Concurrent operation on uuid={}",
            uuid
        );
    };
    let Some(inner) = inner.as_mut() else {
        api_error!(
            BAD_REQUEST,
            Unknown,
            "Concurrent operation on uuid={}",
            uuid
        );
    };

    let start_size = inner.count;
    let mut expected_size = content_length.map(|v| v.0);

    if let Some(ContentRange { start, end }) = content_range {
        if start != start_size {
            api_error!(
                NOT_FOUND,
                SizeInvalid,
                "Uploaded chunk not at end of uuid={}, start={}, start_size={}",
                uuid,
                start,
                start_size
            );
        }
        if let Some(expected_size) = &expected_size {
            if end - start != *expected_size {
                api_error!(NOT_FOUND, SizeInvalid, "Inconsistent content-range and content-length uuid={}, start={}, end={}, expected_size={}", uuid, start, end, expected_size);
            }
        } else {
            expected_size = Some(end - start);
        }
    }
    handle_upload(body, inner, &u.shadow_range)
        .await
        .to_api_error("Upload failed")?;
    if let Some(expected_size) = expected_size {
        if inner.count != start_size + expected_size {
            api_error!(
                BAD_REQUEST,
                SizeInvalid,
                "Uploaded bytes does not match expected size uuid={} recieved={} expected={}",
                uuid,
                inner.count - start_size,
                expected_size
            );
        }
    }
    info!(
        "Docker patch uuid={} uploaded={} end={}",
        uuid,
        inner.count - start_size,
        inner.count
    );
    Ok((
        StatusCode::ACCEPTED,
        [
            ("Location", format!("/v2/{}/blobs/uploads/{}", name, uuid)),
            ("Range", format!("0-{}", inner.count - 1)),
            ("Content-Length", "0".to_string()),
            ("Docker-Upload-UUID", uuid.to_string()),
        ],
        (),
    )
        .into_response())
}

// POST /v2/<name>/blobs/uploads/ Initiate Blob Upload Initiate a resumable blob upload.
// If successful, an upload location will be provided to complete the upload.
// Optionally, if the digest parameter is present, the request body will be used to complete the upload in a single request.
async fn post_blob_upload(
    _: DockerAuthPush,
    WState(state): WState<Arc<State>>,
    Path(name): Path<String>,
) -> Result<Response, ApiError> {
    if state.read_only {
        api_error!(SERVICE_UNAVAILABLE, Unsupported, "Service read only",);
    }
    let uuid = uuid::Uuid::new_v4();
    let path = std::path::Path::new(DOCKER_UPLOAD_PATH).join(uuid.to_string());
    let file = tokio::fs::File::create_new(&path)
        .await
        .with_context(|| format!("Unable to create file {:?}", path))
        .to_api_error("File creation failed")?;

    // TODO(jakobt) we should add some timeout here to not have the file there forever

    state.docker_uploads.lock().unwrap().insert(
        uuid,
        Arc::new(Upload {
            shadow_range: Default::default(),
            inner: TMutex::new(Some(UploadInner {
                count: 0,
                hash: Default::default(),
                file,
            })),
        }),
    );

    Ok((
        StatusCode::ACCEPTED,
        [
            ("Content-Length", "0".to_string()),
            ("Location", format!("/v2/{}/blobs/uploads/{}", name, uuid)),
            ("Range", "0-0".to_string()),
            ("Docker-Upload-UUID", uuid.to_string()),
        ],
        (),
    )
        .into_response())
}

async fn docker_api_middleware(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        "Docker-Distribution-Api-Version",
        "registry/2.0".try_into().unwrap(),
    );
    response
}

pub fn docker_api_routes() -> Result<Router<Arc<State>>, anyhow::Error> {
    use axum::routing::{get, post};
    let router = Router::new()
        .route("/", get(basic_check))
        .route(
            "/{name}/blobs/uploads/{uuid}",
            get(get_blob_upload_status)
                .patch(patch_blob_upload)
                .put(put_blob_upload),
        )
        .route("/{name}/blobs/{digist}", get(get_blob))
        .route(
            "/{name}/manifests/{reference}",
            get(get_manifest).put(put_manifest),
        )
        .route("/{name}/blobs/uploads/", post(post_blob_upload))
        .layer(axum::middleware::from_fn(docker_api_middleware));
    Ok(router)
}
