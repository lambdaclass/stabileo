//! Router construction, shared by `main` and the integration tests.

use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Request};
use axum::http::{header, HeaderValue};
use axum::middleware::{self as axum_mw, Next};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::middleware::auth::{require_auth, ApiKey};
use crate::middleware::rate_limit::{rate_limit, RateLimitConfig, RateLimiter};
use crate::routes::build_model::build_model_handler;
use crate::routes::capabilities::capabilities_handler;
use crate::routes::explain_diagnostic::explain_diagnostic_handler;
use crate::routes::interpret_results::interpret_results_handler;
use crate::routes::review_model::{review_model_handler, AppState};

/// Default request body limit. A full model snapshot for `build-model` is the
/// largest legitimate body; this is well above a large building model.
pub const DEFAULT_MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

pub struct AppOptions {
    pub api_key: String,
    pub allowed_origins: Vec<String>,
    pub rate_limit: RateLimitConfig,
    pub max_body_bytes: usize,
}

pub fn build_router(state: Arc<AppState>, opts: AppOptions) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(
            opts.allowed_origins
                .iter()
                .filter(|o| o.as_str() != "*")
                .filter_map(|o| o.parse().ok()),
        ))
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST]);

    let limiter = RateLimiter::new(opts.rate_limit);

    // Layers run bottom-up: auth first, so unauthenticated requests are
    // rejected without consuming a rate-limit slot or a concurrency permit.
    let api_routes = Router::new()
        .route("/ai/review-model", post(review_model_handler))
        .route("/ai/explain-diagnostic", post(explain_diagnostic_handler))
        .route("/ai/build-model", post(build_model_handler))
        .route("/ai/interpret-results", post(interpret_results_handler))
        .route("/ai/capabilities", get(capabilities_handler))
        .layer(axum_mw::from_fn_with_state(limiter, rate_limit))
        .layer(axum_mw::from_fn(require_auth))
        .layer(DefaultBodyLimit::max(opts.max_body_bytes));

    Router::new()
        .route("/health", get(crate::routes::health::health))
        .nest("/api", api_routes)
        .layer(axum_mw::from_fn(security_headers))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(axum::Extension(ApiKey(opts.api_key)))
        .with_state(state)
}

/// Responses are JSON for API clients: never sniffed as HTML, never framed,
/// never cached (they carry model data and AI output).
async fn security_headers(req: Request, next: Next) -> Response {
    let mut resp = next.run(req).await;
    let h = resp.headers_mut();
    h.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    h.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    resp
}
