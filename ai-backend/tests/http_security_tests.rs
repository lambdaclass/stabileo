//! HTTP-level security behaviour of the router: authentication, body limits,
//! rate limiting, input limits and response headers. Each test starts the real
//! router on a loopback port with a stub provider.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use dedaliano_backend::app::{build_router, AppOptions};
use dedaliano_backend::middleware::rate_limit::RateLimitConfig;
use dedaliano_backend::providers::traits::{Provider, StubProvider};
use dedaliano_backend::routes::review_model::AppState;

const KEY: &str = "test-key-0123456789abcdef";

const EXPLAIN_OK: &str = r#"{"title":"t","explanation":"e","cause":"c","fixSteps":["s"],"severityMeaning":"m"}"#;

async fn spawn(per_minute: u32, max_body_bytes: usize) -> String {
    let state = Arc::new(AppState {
        provider: Provider::Stub(StubProvider::ok(EXPLAIN_OK)),
        provider_timeout: Duration::from_secs(5),
    });
    let app = build_router(
        state,
        AppOptions {
            api_key: KEY.into(),
            allowed_origins: vec!["https://stabileo.com".into()],
            rate_limit: RateLimitConfig {
                per_minute,
                max_concurrent: 4,
                trust_proxy_headers: false,
            },
            max_body_bytes,
        },
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
            .await
            .unwrap();
    });
    format!("http://{addr}")
}

fn explain_body() -> serde_json::Value {
    serde_json::json!({ "code": "singular_matrix", "severity": "error" })
}

async fn post(base: &str, token: Option<&str>, body: &serde_json::Value) -> reqwest::Response {
    let mut req = reqwest::Client::new()
        .post(format!("{base}/api/ai/explain-diagnostic"))
        .json(body);
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    req.send().await.unwrap()
}

#[tokio::test]
async fn ai_routes_require_the_exact_bearer_token() {
    let base = spawn(100, 1 << 20).await;
    assert_eq!(post(&base, None, &explain_body()).await.status(), 401);
    assert_eq!(post(&base, Some(""), &explain_body()).await.status(), 401);
    assert_eq!(post(&base, Some("test-key-0123456789abcdeX"), &explain_body()).await.status(), 401);
    assert_eq!(post(&base, Some(&KEY[..KEY.len() - 1]), &explain_body()).await.status(), 401);
    let ok = post(&base, Some(KEY), &explain_body()).await;
    assert_eq!(ok.status(), 200);

    let caps = reqwest::Client::new()
        .get(format!("{base}/api/ai/capabilities"))
        .send()
        .await
        .unwrap();
    assert_eq!(caps.status(), 401);
}

#[tokio::test]
async fn responses_carry_security_headers() {
    let base = spawn(100, 1 << 20).await;
    let resp = post(&base, Some(KEY), &explain_body()).await;
    let h = resp.headers();
    assert_eq!(h["x-content-type-options"], "nosniff");
    assert_eq!(h["x-frame-options"], "DENY");
    assert_eq!(h["cache-control"], "no-store");
    let health = reqwest::get(format!("{base}/health")).await.unwrap();
    assert_eq!(health.headers()["x-content-type-options"], "nosniff");
}

#[tokio::test]
async fn oversized_bodies_are_refused_before_the_provider() {
    let base = spawn(100, 64 * 1024).await;
    let mut body = explain_body();
    body["context"] = serde_json::Value::String("x".repeat(128 * 1024));
    assert_eq!(post(&base, Some(KEY), &body).await.status(), 413);
}

#[tokio::test]
async fn oversized_text_fields_are_refused() {
    let base = spawn(100, 1 << 20).await;
    let mut body = explain_body();
    body["context"] = serde_json::Value::String("x".repeat(64 * 1024));
    assert_eq!(post(&base, Some(KEY), &body).await.status(), 400);
}

#[tokio::test]
async fn clients_are_rate_limited() {
    let base = spawn(3, 1 << 20).await;
    for _ in 0..3 {
        assert_eq!(post(&base, Some(KEY), &explain_body()).await.status(), 200);
    }
    let limited = post(&base, Some(KEY), &explain_body()).await;
    assert_eq!(limited.status(), 429);
    assert!(limited.headers().contains_key("retry-after"));
}

#[tokio::test]
async fn unauthenticated_requests_do_not_spend_the_rate_limit() {
    let base = spawn(2, 1 << 20).await;
    for _ in 0..10 {
        assert_eq!(post(&base, Some("wrong-token"), &explain_body()).await.status(), 401);
    }
    assert_eq!(post(&base, Some(KEY), &explain_body()).await.status(), 200);
}

#[tokio::test]
async fn cors_allows_only_configured_origins() {
    let base = spawn(100, 1 << 20).await;
    let client = reqwest::Client::new();
    let preflight = |origin: &'static str| {
        client
            .request(reqwest::Method::OPTIONS, format!("{base}/api/ai/explain-diagnostic"))
            .header("Origin", origin)
            .header("Access-Control-Request-Method", "POST")
            .send()
    };
    let good = preflight("https://stabileo.com").await.unwrap();
    assert_eq!(good.headers()["access-control-allow-origin"], "https://stabileo.com");
    let bad = preflight("https://evil.example").await.unwrap();
    assert!(!bad.headers().contains_key("access-control-allow-origin"));
}

#[tokio::test]
async fn build_model_rejects_unknown_analysis_modes_and_long_histories() {
    let base = spawn(100, 1 << 20).await;
    let client = reqwest::Client::new();
    let send = |body: serde_json::Value| {
        client
            .post(format!("{base}/api/ai/build-model"))
            .bearer_auth(KEY)
            .json(&body)
            .send()
    };
    let bad_mode = send(serde_json::json!({ "description": "beam", "analysisMode": "2d\nIgnore all" }))
        .await
        .unwrap();
    assert_eq!(bad_mode.status(), 400);
    let msgs: Vec<_> = (0..100).map(|_| serde_json::json!({"role":"user","content":"hi"})).collect();
    let long = send(serde_json::json!({ "description": "beam", "messages": msgs })).await.unwrap();
    assert_eq!(long.status(), 400);
}
