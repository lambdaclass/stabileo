use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tracing_subscriber::EnvFilter;

use dedaliano_backend::app::{build_router, AppOptions};
use dedaliano_backend::config::{Config, LogFormat};
use dedaliano_backend::routes::review_model::AppState;

#[tokio::main]
async fn main() {
    // `backend healthcheck` probes the running server. The runtime image has
    // no curl, and the compose healthcheck needs something to call.
    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        let port = std::env::var("PORT").unwrap_or_else(|_| "3001".into());
        let ok = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/health"))
            .timeout(Duration::from_secs(4))
            .send()
            .await
            .is_ok_and(|r| r.status().is_success());
        std::process::exit(if ok { 0 } else { 1 });
    }

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
        provider_timeout: Duration::from_secs(config.provider_timeout_secs),
    });

    let app = build_router(
        state,
        AppOptions {
            api_key: config.dedaliano_api_key,
            allowed_origins: config.allowed_origins,
            rate_limit: config.rate_limit,
            max_body_bytes: config.max_body_bytes,
        },
    );

    let listener = tokio::net::TcpListener::bind(config.addr).await.unwrap();
    tracing::info!("listening on {}", config.addr);
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .unwrap();
}
