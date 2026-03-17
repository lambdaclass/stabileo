use std::sync::Arc;

use axum::extract::State;
use axum::Json;

use crate::capabilities::review_model::{self, ReviewModelRequest, ReviewModelResponse};
use crate::error::AppError;
use crate::providers::traits::Provider;

pub struct AppState {
    pub provider: Provider,
}

pub async fn review_model_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ReviewModelRequest>,
) -> Result<Json<ReviewModelResponse>, AppError> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let resp = review_model::review_model(&state.provider, req, request_id).await?;
    Ok(Json(resp))
}
