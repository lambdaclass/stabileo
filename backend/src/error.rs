use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,

    #[error("invalid request: {0}")]
    BadRequest(String),

    #[error("provider error: {0}")]
    Provider(#[from] ProviderError),

    #[error("provider timed out")]
    ProviderTimeout,

    #[error("too many requests")]
    RateLimited { retry_after: u64 },

    #[error("server busy")]
    Busy,

    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("HTTP error: {0}")]
    Http(reqwest::Error),

    #[error("API error (status {status}): {body}")]
    Api { status: u16, body: String },

    #[error("failed to parse provider response: {0}")]
    Parse(String),
}

impl From<reqwest::Error> for ProviderError {
    /// Drop the request URL: some providers authenticate with a query
    /// parameter, and reqwest prints the full URL in its error message, which
    /// then lands in the logs.
    fn from(e: reqwest::Error) -> Self {
        ProviderError::Http(e.without_url())
    }
}

/// Longest provider error body kept for logging. Provider error pages can be
/// large and can echo the request back, which carries user model data.
pub const MAX_LOGGED_PROVIDER_BODY: usize = 512;

/// Truncate `s` to at most `max` bytes on a char boundary, for logging.
pub fn truncate_for_log(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}... ({} bytes total)", &s[..end], s.len())
}

impl ProviderError {
    /// A non-200 provider reply, with the body truncated for logging.
    pub fn api(status: u16, body: &str) -> Self {
        ProviderError::Api {
            status,
            body: truncate_for_log(body, MAX_LOGGED_PROVIDER_BODY),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Provider(e) => {
                tracing::error!("provider error: {e}");
                (
                    StatusCode::BAD_GATEWAY,
                    "AI provider request failed".to_string(),
                )
            }
            AppError::ProviderTimeout => (
                StatusCode::GATEWAY_TIMEOUT,
                "AI provider timed out".to_string(),
            ),
            AppError::RateLimited { retry_after } => {
                let body = axum::Json(json!({ "error": self.to_string() }));
                let mut resp = (StatusCode::TOO_MANY_REQUESTS, body).into_response();
                resp.headers_mut().insert(
                    axum::http::header::RETRY_AFTER,
                    axum::http::HeaderValue::from(*retry_after),
                );
                return resp;
            }
            AppError::Busy => (StatusCode::SERVICE_UNAVAILABLE, self.to_string()),
            AppError::Internal(msg) => {
                tracing::error!("internal error: {msg}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_string(),
                )
            }
        };

        let body = axum::Json(json!({ "error": message }));
        (status, body).into_response()
    }
}
