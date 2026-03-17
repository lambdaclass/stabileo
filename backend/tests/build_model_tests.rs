use dedaliano_backend::capabilities::build_model::{
    build_model, parse_response, BuildModelRequest,
};
use dedaliano_backend::error::ProviderError;
use dedaliano_backend::providers::traits::{AiResponse, Provider, StubProvider};

fn valid_build_json() -> &'static str {
    r#"{
        "snapshot": {
            "analysisMode": "2d",
            "nodes": [[1, {"id":1,"x":0,"y":0}], [2, {"id":2,"x":6,"y":0}]],
            "materials": [[1, {"id":1,"name":"Steel A36","e":200000,"nu":0.3,"rho":78.5,"fy":250}]],
            "sections": [[1, {"id":1,"name":"IPE 300","a":0.00538,"iz":8.356e-5}]],
            "elements": [[1, {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false}]],
            "supports": [[1, {"id":1,"nodeId":1,"type":"pinned"}], [2, {"id":2,"nodeId":2,"type":"rollerX"}]],
            "loads": [{"type":"distributed","data":{"id":1,"elementId":1,"qI":-10,"qJ":-10}}],
            "nextId": {"node":3,"material":2,"section":2,"element":2,"support":3,"load":2}
        },
        "interpretation": "Simply supported beam, 6m span, IPE 300, 10 kN/m uniform load."
    }"#
}

// ---- Parse contract tests ----

#[test]
fn parse_valid_json() {
    let resp = AiResponse {
        content: valid_build_json().into(),
        model: "test-model".into(),
        input_tokens: 200,
        output_tokens: 400,
        latency_ms: 100,
    };

    let result = parse_response(resp, "req-1".into()).unwrap();
    assert!(result.snapshot.is_object());
    assert!(result.snapshot.get("nodes").is_some());
    assert!(result.snapshot.get("elements").is_some());
    assert!(!result.interpretation.is_empty());
    assert_eq!(result.meta.model_used, "test-model");
}

#[test]
fn parse_json_wrapped_in_markdown_fences() {
    let content = format!("```json\n{}\n```", valid_build_json());
    let resp = AiResponse {
        content,
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let result = parse_response(resp, "req-2".into()).unwrap();
    assert!(result.snapshot.get("nodes").is_some());
}

#[test]
fn parse_missing_nodes_fails() {
    let content = r#"{
        "snapshot": {"elements": [[1, {"id":1}]]},
        "interpretation": "test"
    }"#;

    let resp = AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("missing required model fields"));
}

#[test]
fn parse_missing_elements_fails() {
    let content = r#"{
        "snapshot": {"nodes": [[1, {"id":1,"x":0,"y":0}]]},
        "interpretation": "test"
    }"#;

    let resp = AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("missing required model fields"));
}

#[test]
fn parse_empty_string_fails() {
    let resp = AiResponse {
        content: "".into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    assert!(parse_response(resp, "req-err".into()).is_err());
}

#[test]
fn parse_wrong_schema_fails() {
    let resp = AiResponse {
        content: r#"{"answer": "42"}"#.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    assert!(parse_response(resp, "req-err".into()).is_err());
}

#[test]
fn parse_snapshot_not_object_fails() {
    let content = r#"{
        "snapshot": "not an object",
        "interpretation": "test"
    }"#;

    let resp = AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("missing required model fields"));
}

// ---- Stub provider integration tests ----

#[tokio::test]
async fn build_model_with_stub_returns_parsed_response() {
    let provider = Provider::Stub(StubProvider::ok(valid_build_json()));
    let req = BuildModelRequest {
        description: "Simply supported beam, 6m, IPE 300, 10 kN/m".into(),
        locale: Some("en".into()),
    };

    let result = build_model(&provider, req, "req-stub-1".into())
        .await
        .unwrap();

    assert!(result.snapshot.get("nodes").is_some());
    assert!(!result.interpretation.is_empty());
    assert_eq!(result.meta.model_used, "stub-model");
}

#[tokio::test]
async fn build_model_with_provider_error_propagates() {
    let provider = Provider::Stub(StubProvider::err(ProviderError::Api {
        status: 500,
        body: "internal error".into(),
    }));
    let req = BuildModelRequest {
        description: "test".into(),
        locale: None,
    };

    let err = build_model(&provider, req, "req-stub-2".into())
        .await
        .unwrap_err();

    assert!(err.to_string().contains("provider error"));
}

#[tokio::test]
async fn response_serializes_to_camel_case() {
    let provider = Provider::Stub(StubProvider::ok(valid_build_json()));
    let req = BuildModelRequest {
        description: "test beam".into(),
        locale: None,
    };

    let result = build_model(&provider, req, "req-ser".into())
        .await
        .unwrap();

    let json = serde_json::to_value(&result).unwrap();
    assert!(json.get("snapshot").is_some());
    assert!(json.get("interpretation").is_some());

    let meta = json.get("meta").unwrap();
    assert!(meta.get("modelUsed").is_some());
}
