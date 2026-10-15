use dedaliano_backend::capabilities::explain_diagnostic::{
    explain_diagnostic, parse_response, ExplainDiagnosticRequest,
};
use dedaliano_backend::error::ProviderError;
use dedaliano_backend::providers::traits::{AiResponse, Provider, StubProvider};

fn valid_explain_json() -> &'static str {
    r#"{
        "title": "High Diagonal Ratio in Stiffness Matrix",
        "explanation": "The ratio between the largest and smallest diagonal entries in the stiffness matrix exceeds 1e8, indicating poor conditioning.",
        "cause": "Mixing very stiff and very flexible elements, or having nearly-zero stiffness in some DOFs.",
        "fixSteps": ["Check for missing supports", "Verify material properties", "Look for near-duplicate nodes"],
        "severityMeaning": "Results may be numerically unreliable. Displacements in poorly-conditioned DOFs could be inaccurate."
    }"#
}

fn test_request() -> ExplainDiagnosticRequest {
    ExplainDiagnosticRequest {
        code: "high_diagonal_ratio".into(),
        severity: "warning".into(),
        message: Some("Diagonal ratio 2.3e9 exceeds threshold 1e8".into()),
        value: Some(2.3e9),
        threshold: Some(1e8),
        element_ids: vec![3, 7],
        node_ids: vec![5],
        context: None,
        locale: Some("en".into()),
    }
}

// ---- Parse contract tests ----

#[test]
fn parse_valid_json() {
    let resp = AiResponse {
        content: valid_explain_json().into(),
        model: "test-model".into(),
        input_tokens: 80,
        output_tokens: 150,
        latency_ms: 30,
        tool_calls: vec![],
    };

    let result = parse_response(resp, "req-1".into()).unwrap();
    assert_eq!(result.title, "High Diagonal Ratio in Stiffness Matrix");
    assert!(!result.explanation.is_empty());
    assert!(!result.cause.is_empty());
    assert_eq!(result.fix_steps.len(), 3);
    assert!(!result.severity_meaning.is_empty());
    assert_eq!(result.meta.model_used, "test-model");
    assert_eq!(result.meta.request_id, "req-1");
}

#[test]
fn parse_json_wrapped_in_markdown_fences() {
    let content = format!("```json\n{}\n```", valid_explain_json());
    let resp = AiResponse {
        content,
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        tool_calls: vec![],
    };

    let result = parse_response(resp, "req-2".into()).unwrap();
    assert_eq!(result.fix_steps.len(), 3);
}

#[test]
fn parse_empty_fix_steps() {
    let content = r#"{
        "title": "Info diagnostic",
        "explanation": "This is informational.",
        "cause": "Normal solver behavior.",
        "fixSteps": [],
        "severityMeaning": "No action needed."
    }"#;

    let resp = AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        tool_calls: vec![],
    };

    let result = parse_response(resp, "req-3".into()).unwrap();
    assert!(result.fix_steps.is_empty());
}

#[test]
fn parse_empty_string_fails() {
    let resp = AiResponse {
        content: "".into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        tool_calls: vec![],
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
        tool_calls: vec![],
    };

    assert!(parse_response(resp, "req-err".into()).is_err());
}

#[test]
fn parse_plain_text_refusal_fails() {
    let resp = AiResponse {
        content: "I cannot help with that.".into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        tool_calls: vec![],
    };

    assert!(parse_response(resp, "req-err".into()).is_err());
}

// ---- Stub provider integration tests ----

#[tokio::test]
async fn explain_diagnostic_with_stub_returns_parsed_response() {
    let provider = Provider::Stub(StubProvider::ok(valid_explain_json()));
    let req = test_request();

    let result = explain_diagnostic(&provider, req, "req-stub-1".into())
        .await
        .unwrap();

    assert_eq!(result.title, "High Diagonal Ratio in Stiffness Matrix");
    assert_eq!(result.fix_steps.len(), 3);
    assert_eq!(result.meta.model_used, "stub-model");
}

#[tokio::test]
async fn explain_diagnostic_with_provider_error_propagates() {
    let provider = Provider::Stub(StubProvider::err(ProviderError::Api {
        status: 429,
        body: "rate limited".into(),
    }));
    let req = test_request();

    let err = explain_diagnostic(&provider, req, "req-stub-2".into())
        .await
        .unwrap_err();

    assert!(err.to_string().contains("provider error"));
}

#[tokio::test]
async fn response_serializes_to_camel_case() {
    let provider = Provider::Stub(StubProvider::ok(valid_explain_json()));
    let req = test_request();

    let result = explain_diagnostic(&provider, req, "req-ser".into())
        .await
        .unwrap();

    let json = serde_json::to_value(&result).unwrap();
    assert!(json.get("fixSteps").is_some());
    assert!(json.get("severityMeaning").is_some());

    let meta = json.get("meta").unwrap();
    assert!(meta.get("modelUsed").is_some());
    assert!(meta.get("requestId").is_some());
}
