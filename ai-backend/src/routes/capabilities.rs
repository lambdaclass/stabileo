use axum::Json;
use serde_json::Value;

use crate::capabilities::registry::full_registry_json;

pub async fn capabilities_handler() -> Json<Value> {
    Json(full_registry_json())
}
