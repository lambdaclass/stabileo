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

    // An empty configured key would accept "Authorization: Bearer ". Config
    // refuses to start with one; this is the second line of defence.
    if expected.is_empty() {
        return Err(AppError::Unauthorized);
    }

    let header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Unauthorized)?;

    let token = header
        .strip_prefix("Bearer ")
        .ok_or(AppError::Unauthorized)?;

    if !constant_time_eq(token.as_bytes(), expected.as_bytes()) {
        return Err(AppError::Unauthorized);
    }

    Ok(next.run(req).await)
}

/// Compare two byte strings without an early exit on the first mismatch, so
/// the response time does not reveal how many leading bytes of a guess are
/// right. The length is not secret.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[derive(Clone)]
pub struct ApiKey(pub String);

#[cfg(test)]
mod tests {
    use super::constant_time_eq;

    #[test]
    fn constant_time_eq_matches_equality() {
        assert!(constant_time_eq(b"secret-token", b"secret-token"));
        assert!(!constant_time_eq(b"secret-token", b"secret-tokem"));
        assert!(!constant_time_eq(b"secret", b"secret-token"));
        assert!(constant_time_eq(b"", b""));
    }
}
