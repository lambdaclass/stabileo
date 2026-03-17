mod capabilities;
mod config;
mod error;
mod middleware;
mod providers;
mod routes;

use std::sync::Arc;

use axum::middleware as axum_mw;
use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use config::{Config, LogFormat};
use middleware::auth::{require_auth, ApiKey};
use routes::review_model::{review_model_handler, AppState};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let config = Config::from_env();

    match config.log_format {
        LogFormat::Pretty => {
            tracing_subscriber::fmt()
                .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
                .init();
        }
        LogFormat::Json => {
            tracing_subscriber::fmt()
                .json()
                .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
                .init();
        }
    }

    let state = Arc::new(AppState {
        provider: config.provider,
    });

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(
            config
                .allowed_origins
                .iter()
                .filter_map(|o| o.parse().ok()),
        ))
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST]);

    let api_routes = Router::new()
        .route("/ai/review-model", post(review_model_handler))
        .layer(axum_mw::from_fn(require_auth));

    let app = Router::new()
        .route("/health", get(routes::health::health))
        .nest("/api", api_routes)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(axum::Extension(ApiKey(config.dedaliano_api_key.clone())))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(config.addr).await.unwrap();
    tracing::info!("listening on {}", config.addr);
    axum::serve(listener, app).await.unwrap();
}
