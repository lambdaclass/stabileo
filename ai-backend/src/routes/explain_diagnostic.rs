use std::sync::Arc;

use axum::extract::State;
use axum::Json;

use crate::capabilities::explain_diagnostic::{self, ExplainDiagnosticRequest, ExplainDiagnosticResponse};
use crate::error::AppError;
use crate::routes::review_model::AppState;

pub async fn explain_diagnostic_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ExplainDiagnosticRequest>,
) -> Result<Json<ExplainDiagnosticResponse>, AppError> {
    let request_id = uuid::Uuid::new_v4().to_string();

    let resp = tokio::time::timeout(
        state.provider_timeout,
        explain_diagnostic::explain_diagnostic(&state.provider, req, request_id),
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
