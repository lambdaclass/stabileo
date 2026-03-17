use dedaliano_backend::capabilities::interpret_results::{
    interpret_results, parse_response, InterpretResultsRequest, ModelInfo,
};
use dedaliano_backend::error::ProviderError;
use dedaliano_backend::providers::traits::{AiResponse, Provider, StubProvider};
use dedaliano_engine::types::ResultSummary;

fn valid_interpret_json() -> &'static str {
    r#"{
        "answer": "The maximum displacement of 12.3mm at node 5 gives a ratio of L/488, which is within the L/300 limit for general floors.",
        "assessment": "ok",
        "codeReferences": ["EN 1990 Table A1.4 — L/250 general, L/300 floors"],
        "warnings": ["This check assumes simply-supported conditions. Cantilever spans need L/500."]
    }"#
}

fn test_result_summary() -> ResultSummary {
    ResultSummary {
        displacement_x: None,
        displacement_y: None,
        displacement_z: None,
        rotation: None,
        displacement_resultant: None,
        reaction_resultant: None,
    }
}

fn test_request() -> InterpretResultsRequest {
    InterpretResultsRequest {
        result_summary: test_result_summary(),
        question: "Is the maximum deflection acceptable for L/300?".into(),
        model_info: Some(ModelInfo {
            n_elements: Some(4),
            n_nodes: Some(6),
            max_span: Some(6.0),
            structure_type: Some("beam".into()),
        }),
        locale: Some("en".into()),
    }
}

// ---- Parse contract tests ----

#[test]
fn parse_valid_json() {
    let resp = AiResponse {
        content: valid_interpret_json().into(),
        model: "test-model".into(),
        input_tokens: 150,
        output_tokens: 250,
        latency_ms: 60,
        tool_calls: vec![],
    };

    let result = parse_response(resp, "req-1".into()).unwrap();
    assert!(!result.answer.is_empty());
    assert_eq!(result.assessment, "ok");
    assert_eq!(result.code_references.len(), 1);
    assert_eq!(result.warnings.len(), 1);
    assert_eq!(result.meta.model_used, "test-model");
}

#[test]
fn parse_json_wrapped_in_markdown_fences() {
    let content = format!("```json\n{}\n```", valid_interpret_json());
    let resp = AiResponse {
        content,
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        tool_calls: vec![],
    };

    let result = parse_response(resp, "req-2".into()).unwrap();
    assert_eq!(result.assessment, "ok");
}

#[test]
fn parse_empty_optional_arrays() {
    let content = r#"{
        "answer": "Deflection is excessive.",
        "assessment": "excessive",
        "codeReferences": [],
        "warnings": []
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
    assert!(result.code_references.is_empty());
    assert!(result.warnings.is_empty());
    assert_eq!(result.assessment, "excessive");
}

#[test]
fn parse_missing_optional_arrays_uses_defaults() {
    let content = r#"{
        "answer": "Looks fine.",
        "assessment": "ok"
    }"#;

    let resp = AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        tool_calls: vec![],
    };

    let result = parse_response(resp, "req-4".into()).unwrap();
    assert!(result.code_references.is_empty());
    assert!(result.warnings.is_empty());
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
        content: r#"{"findings": []}"#.into(),
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
        content: "I'm sorry, I can't answer that.".into(),
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
async fn interpret_results_with_stub_returns_parsed_response() {
    let provider = Provider::Stub(StubProvider::ok(valid_interpret_json()));
    let req = test_request();

    let result = interpret_results(&provider, req, "req-stub-1".into())
        .await
        .unwrap();

    assert!(!result.answer.is_empty());
    assert_eq!(result.assessment, "ok");
    assert_eq!(result.meta.model_used, "stub-model");
}

#[tokio::test]
async fn interpret_results_without_model_info() {
    let provider = Provider::Stub(StubProvider::ok(valid_interpret_json()));
    let req = InterpretResultsRequest {
        result_summary: test_result_summary(),
        question: "What is the max displacement?".into(),
        model_info: None,
        locale: None,
    };

    let result = interpret_results(&provider, req, "req-stub-2".into())
        .await
        .unwrap();

    assert!(!result.answer.is_empty());
}

#[tokio::test]
async fn interpret_results_with_provider_error_propagates() {
    let provider = Provider::Stub(StubProvider::err(ProviderError::Api {
        status: 503,
        body: "service unavailable".into(),
    }));
    let req = test_request();

    let err = interpret_results(&provider, req, "req-stub-3".into())
        .await
        .unwrap_err();

    assert!(err.to_string().contains("provider error"));
}

#[tokio::test]
async fn response_serializes_to_camel_case() {
    let provider = Provider::Stub(StubProvider::ok(valid_interpret_json()));
    let req = test_request();

    let result = interpret_results(&provider, req, "req-ser".into())
        .await
        .unwrap();

    let json = serde_json::to_value(&result).unwrap();
    assert!(json.get("answer").is_some());
    assert!(json.get("assessment").is_some());
    assert!(json.get("codeReferences").is_some());
    assert!(json.get("warnings").is_some());

    let meta = json.get("meta").unwrap();
    assert!(meta.get("modelUsed").is_some());
    assert!(meta.get("requestId").is_some());
}
