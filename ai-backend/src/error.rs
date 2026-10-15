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

    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("API error (status {status}): {body}")]
    Api { status: u16, body: String },

    #[error("failed to parse provider response: {0}")]
    Parse(String),
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
