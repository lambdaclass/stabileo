use std::sync::Arc;

use axum::extract::State;
use axum::Json;

use crate::capabilities::build_model::{self, BuildModelRequest, BuildModelResponse};
use crate::error::AppError;
use crate::routes::review_model::AppState;

pub async fn build_model_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BuildModelRequest>,
) -> Result<Json<BuildModelResponse>, AppError> {
    let request_id = uuid::Uuid::new_v4().to_string();

    let resp = tokio::time::timeout(
        state.provider_timeout,
        build_model::build_model(&state.provider, req, request_id),
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
