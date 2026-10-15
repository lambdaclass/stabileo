use axum::{
    extract::Request,
    http::header::AUTHORIZATION,
    middleware::Next,
    response::Response,
};

use crate::error::AppError;

pub async fn require_auth(req: Request, next: Next) -> Result<Response, AppError> {
    let expected = req
        .extensions()
        .get::<ApiKey>()
        .ok_or(AppError::Internal("missing API key config".into()))?
        .0
        .clone();

    let header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Unauthorized)?;

    let token = header
        .strip_prefix("Bearer ")
        .ok_or(AppError::Unauthorized)?;

    if token != expected {
        return Err(AppError::Unauthorized);
    }

    Ok(next.run(req).await)
}

#[derive(Clone)]
pub struct ApiKey(pub String);
