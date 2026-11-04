use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::Json;

use crate::capabilities::review_model::{self, ReviewModelRequest, ReviewModelResponse};
use crate::error::AppError;
use crate::providers::traits::Provider;

pub struct AppState {
    pub provider: Provider,
    pub provider_timeout: Duration,
}

pub async fn review_model_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ReviewModelRequest>,
) -> Result<Json<ReviewModelResponse>, AppError> {
    let request_id = uuid::Uuid::new_v4().to_string();

    let resp = tokio::time::timeout(
        state.provider_timeout,
        review_model::review_model(&state.provider, req, request_id),
    )
    .await
    .map_err(|_| {
        tracing::warn!(
            "provider call timed out after {}s",
            state.provider_timeout.as_secs()
        );
        AppError::ProviderTimeout
    })??;

    Ok(Json(resp))
}
