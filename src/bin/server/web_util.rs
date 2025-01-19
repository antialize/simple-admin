use std::{net::SocketAddr, sync::Arc};

use axum::{
    extract::{ConnectInfo, FromRequestParts, OptionalFromRequestParts, Request},
    http::{request::Parts, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use log::{error, info};

#[derive(Clone)]
pub struct WrappedError(pub Arc<anyhow::Error>);

pub struct WebError {
    pub code: StatusCode,
    pub message: String,
    pub err: Option<anyhow::Error>,
}

impl WebError {
    pub fn forbidden() -> WebError {
        WebError {
            code: StatusCode::FORBIDDEN,
            message: StatusCode::FORBIDDEN.to_string(),
            err: None,
        }
    }
    pub fn not_found() -> WebError {
        WebError {
            code: StatusCode::NOT_FOUND,
            message: StatusCode::NOT_FOUND.to_string(),
            err: None,
        }
    }
}

impl IntoResponse for WebError {
    fn into_response(self) -> Response {
        let mut res = (self.code, self.message).into_response();
        if let Some(err) = self.err {
            res.extensions_mut().insert(WrappedError(Arc::new(err)));
        }
        res
    }
}

impl<T: Into<anyhow::Error>> From<T> for WebError {
    fn from(value: T) -> Self {
        WebError {
            code: StatusCode::INTERNAL_SERVER_ERROR,
            message: StatusCode::INTERNAL_SERVER_ERROR.to_string(),
            err: Some(value.into()),
        }
    }
}

#[derive(Debug)]
pub struct StringRejection(String);

impl IntoResponse for StringRejection {
    fn into_response(self) -> Response {
        (StatusCode::INTERNAL_SERVER_ERROR, self.0).into_response()
    }
}

impl std::fmt::Display for StringRejection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for StringRejection {}

pub struct ClientIp(pub String);
impl<S: Sync> FromRequestParts<S> for ClientIp {
    type Rejection = StringRejection;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let h = parts
            .headers
            .get("X-Forwarded-For")
            .iter()
            .filter_map(|v| v.to_str().ok())
            .next();
        if let Some(h) = h {
            Ok(ClientIp(
                h.split_once(",")
                    .map(|(l, _)| l)
                    .unwrap_or(h)
                    .trim()
                    .to_string(),
            ))
        } else if let Some(v) = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ConnectInfo(addr)| addr.ip().to_string())
        {
            Ok(ClientIp(v))
        } else {
            Err(StringRejection("Missing Connection info".into()))
        }
    }
}

pub struct ContentLength(pub u64);

impl<S: Sync> OptionalFromRequestParts<S> for ContentLength {
    type Rejection = StringRejection;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Option<Self>, Self::Rejection> {
        let Some(v) = parts.headers.get("Content-Length") else {
            return Ok(None);
        };
        let v = v
            .to_str()
            .map_err(|_| StringRejection("Invalid content-length".into()))?;
        let v = v
            .parse()
            .map_err(|_| StringRejection("Invalid content-length".into()))?;
        Ok(Some(ContentLength(v)))
    }
}

impl<S: Sync> FromRequestParts<S> for ContentLength {
    type Rejection = StringRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match <Self as OptionalFromRequestParts<S>>::from_request_parts(parts, state).await {
            Ok(Some(v)) => Ok(v),
            Ok(None) => Err(StringRejection("Missing header Content-Length".into())),
            Err(e) => Err(e),
        }
    }
}

pub struct ContentRange {
    pub start: u64,
    pub end: u64,
}

impl<S: Sync> OptionalFromRequestParts<S> for ContentRange {
    type Rejection = StringRejection;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Option<Self>, Self::Rejection> {
        let Some(v) = parts.headers.get("Content-Range") else {
            return Ok(None);
        };
        let cr = v
            .to_str()
            .map_err(|_| StringRejection("Invalid Content-Range".into()))?;
        let (start, end) = cr
            .split_once("-")
            .ok_or_else(|| StringRejection("Invalid Content-Range".into()))?;
        let start = start
            .parse()
            .map_err(|_| StringRejection("Invalid Content-Range".into()))?;
        let end = end
            .parse()
            .map_err(|_| StringRejection("Invalid Content-Range".into()))?;
        if end < start {
            return Err(StringRejection("Invalid Content-Range".into()));
        }
        Ok(Some(ContentRange { start, end }))
    }
}

impl<S: Sync> FromRequestParts<S> for ContentRange {
    type Rejection = StringRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match <Self as OptionalFromRequestParts<S>>::from_request_parts(parts, state).await {
            Ok(Some(v)) => Ok(v),
            Ok(None) => Err(StringRejection("Missing header Content-Range".into())),
            Err(e) => Err(e),
        }
    }
}

pub async fn request_logger(request: Request, next: Next) -> Response {
    let start = tokio::time::Instant::now();
    let path = request.uri().path().to_string();
    let method = request.method().clone();
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert("Cache-Control", "no-store".try_into().unwrap());
    let duration = start.elapsed();
    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        info!(
            "{} {} switching protocols {} in {:#?}",
            method,
            path,
            response.status(),
            duration
        );
    } else if response.status().is_success() {
        info!(
            "{} {} succeeded with {} in {:#?}",
            method,
            path,
            response.status(),
            duration
        );
    } else if let Some(WrappedError(e)) = response.extensions().get() {
        error!(
            "{} {} failed with {} in {:#?}: {:?}",
            method,
            path,
            response.status(),
            duration,
            e
        );
    } else {
        error!(
            "{} {} failed with {} in {:#?}",
            method,
            path,
            response.status(),
            duration
        );
    }
    response
}
