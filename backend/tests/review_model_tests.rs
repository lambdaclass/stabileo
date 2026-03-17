use dedaliano_backend::capabilities::review_model::{parse_review_response, review_model, ReviewModelRequest};
use dedaliano_backend::error::ProviderError;
use dedaliano_backend::providers::traits::{AiResponse, Provider, StubProvider};
use dedaliano_engine::types::{
    DiagnosticCode, OutputFingerprint, Severity, SolverRunArtifact, SolverRunMeta,
    StructuredDiagnostic,
};

fn test_artifact() -> SolverRunArtifact {
    SolverRunArtifact {
        meta: SolverRunMeta {
            engine_version: "0.1.0".into(),
            build_timestamp: "2025-01-01T00:00:00Z".into(),
            build_sha: "abc123".into(),
            solver_path: "sparse_cholesky".into(),
            n_free_dofs: 12,
            n_elements: 4,
            n_nodes: 6,
        },
        diagnostics: vec![StructuredDiagnostic {
            code: DiagnosticCode::SparseCholesky,
            severity: Severity::Info,
            message: "Sparse Cholesky used".into(),
            element_ids: vec![],
            node_ids: vec![],
            dof_indices: vec![],
            phase: None,
            value: None,
            threshold: None,
        }],
        equilibrium: None,
        timings: None,
        result_summary: None,
        fingerprint: OutputFingerprint {
            n_displacements: 6,
            n_reactions: 3,
            n_element_forces: 4,
            max_abs_displacement: 0.01,
            max_abs_reaction: 50.0,
        },
    }
}

fn valid_review_json() -> &'static str {
    r#"{
        "findings": [
            {
                "title": "Model looks good",
                "severity": "info",
                "explanation": "No issues detected.",
                "relatedDiagnostics": ["SparseCholesky"],
                "affectedIds": [],
                "recommendation": "No action needed."
            }
        ],
        "riskLevel": "low",
        "reviewOrder": ["Check equilibrium"],
        "riskyAssumptions": [],
        "summary": "Clean run."
    }"#
}

// ---- Contract tests for parse_review_response ----

#[test]
fn parse_valid_json() {
    let resp = AiResponse {
        content: valid_review_json().into(),
        model: "test-model".into(),
        input_tokens: 100,
        output_tokens: 200,
        latency_ms: 50,
    };

    let result = parse_review_response(resp, "req-1".into()).unwrap();
    assert_eq!(result.findings.len(), 1);
    assert_eq!(result.findings[0].title, "Model looks good");
    assert_eq!(result.findings[0].severity, "info");
    assert_eq!(result.risk_level, "low");
    assert_eq!(result.summary, "Clean run.");
    assert_eq!(result.meta.model_used, "test-model");
    assert_eq!(result.meta.request_id, "req-1");
    assert_eq!(result.meta.input_tokens, 100);
    assert_eq!(result.meta.output_tokens, 200);
}

#[test]
fn parse_json_wrapped_in_markdown_fences() {
    let content = format!("```json\n{}\n```", valid_review_json());
    let resp = AiResponse {
        content,
        model: "test-model".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let result = parse_review_response(resp, "req-2".into()).unwrap();
    assert_eq!(result.findings.len(), 1);
    assert_eq!(result.risk_level, "low");
}

#[test]
fn parse_json_wrapped_in_plain_fences() {
    let content = format!("```\n{}\n```", valid_review_json());
    let resp = AiResponse {
        content,
        model: "test-model".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let result = parse_review_response(resp, "req-3".into()).unwrap();
    assert_eq!(result.findings.len(), 1);
}

#[test]
fn parse_multiple_findings() {
    let content = r#"{
        "findings": [
            {
                "title": "High conditioning",
                "severity": "warning",
                "explanation": "Diagonal ratio exceeds 1e8.",
                "relatedDiagnostics": ["HighDiagonalRatio"],
                "affectedIds": [3],
                "recommendation": "Check supports."
            },
            {
                "title": "Disconnected node",
                "severity": "error",
                "explanation": "Node 5 is not connected.",
                "relatedDiagnostics": ["DisconnectedNode"],
                "affectedIds": [5],
                "recommendation": "Remove or connect node 5."
            }
        ],
        "riskLevel": "high",
        "reviewOrder": ["Fix disconnected node", "Check conditioning"],
        "riskyAssumptions": ["Linear analysis on slender frame"],
        "summary": "Two issues found."
    }"#;

    let resp = AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let result = parse_review_response(resp, "req-4".into()).unwrap();
    assert_eq!(result.findings.len(), 2);
    assert_eq!(result.findings[0].severity, "warning");
    assert_eq!(result.findings[1].severity, "error");
    assert_eq!(result.findings[1].affected_ids, vec![5]);
    assert_eq!(result.risk_level, "high");
    assert_eq!(result.risky_assumptions.len(), 1);
}

#[test]
fn parse_empty_findings() {
    let content = r#"{
        "findings": [],
        "riskLevel": "low",
        "reviewOrder": [],
        "riskyAssumptions": [],
        "summary": "No issues."
    }"#;

    let resp = AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let result = parse_review_response(resp, "req-5".into()).unwrap();
    assert!(result.findings.is_empty());
    assert_eq!(result.risk_level, "low");
}

#[test]
fn parse_missing_optional_fields_in_finding() {
    // relatedDiagnostics and affectedIds have #[serde(default)] so they're optional
    let content = r#"{
        "findings": [
            {
                "title": "General note",
                "severity": "info",
                "explanation": "Something to note.",
                "recommendation": "Review manually."
            }
        ],
        "riskLevel": "low",
        "reviewOrder": [],
        "riskyAssumptions": [],
        "summary": "Ok."
    }"#;

    let resp = AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let result = parse_review_response(resp, "req-6".into()).unwrap();
    assert!(result.findings[0].related_diagnostics.is_empty());
    assert!(result.findings[0].affected_ids.is_empty());
}

#[test]
fn parse_with_surrounding_whitespace() {
    let content = format!("  \n\n  {}  \n\n  ", valid_review_json());
    let resp = AiResponse {
        content,
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let result = parse_review_response(resp, "req-7".into()).unwrap();
    assert_eq!(result.findings.len(), 1);
}

// ---- Malformed response tests ----

#[test]
fn parse_empty_string_fails() {
    let resp = AiResponse {
        content: "".into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_review_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("failed to parse AI review response"));
}

#[test]
fn parse_plain_text_refusal_fails() {
    let resp = AiResponse {
        content: "I'm sorry, I can't help with that request.".into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_review_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("failed to parse AI review response"));
}

#[test]
fn parse_incomplete_json_fails() {
    let resp = AiResponse {
        content: r#"{"findings": [{"title": "oops"#.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_review_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("failed to parse AI review response"));
}

#[test]
fn parse_wrong_schema_fails() {
    // Valid JSON but wrong shape — missing required fields
    let resp = AiResponse {
        content: r#"{"answer": "42"}"#.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_review_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("failed to parse AI review response"));
}

#[test]
fn parse_json_array_instead_of_object_fails() {
    let resp = AiResponse {
        content: r#"[{"title": "wrong shape"}]"#.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_review_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("failed to parse AI review response"));
}

#[test]
fn parse_html_error_page_fails() {
    let resp = AiResponse {
        content: "<html><body>502 Bad Gateway</body></html>".into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
    };

    let err = parse_review_response(resp, "req-err".into()).unwrap_err();
    assert!(err.to_string().contains("failed to parse AI review response"));
}

// ---- Stub provider integration tests ----

#[tokio::test]
async fn review_model_with_stub_returns_parsed_response() {
    let provider = Provider::Stub(StubProvider::ok(valid_review_json()));
    let req = ReviewModelRequest {
        artifact: test_artifact(),
        context: None,
        locale: Some("en".into()),
    };

    let result = review_model(&provider, req, "req-stub-1".into())
        .await
        .unwrap();

    assert_eq!(result.findings.len(), 1);
    assert_eq!(result.risk_level, "low");
    assert_eq!(result.meta.model_used, "stub-model");
    assert_eq!(result.meta.request_id, "req-stub-1");
}

#[tokio::test]
async fn review_model_with_user_context() {
    let provider = Provider::Stub(StubProvider::ok(valid_review_json()));
    let req = ReviewModelRequest {
        artifact: test_artifact(),
        context: Some("Check the cantilever tip deflection.".into()),
        locale: Some("es".into()),
    };

    let result = review_model(&provider, req, "req-stub-2".into())
        .await
        .unwrap();

    assert_eq!(result.findings.len(), 1);
}

#[tokio::test]
async fn review_model_with_malformed_ai_response_fails() {
    let provider = Provider::Stub(StubProvider::ok("This is not JSON at all."));
    let req = ReviewModelRequest {
        artifact: test_artifact(),
        context: None,
        locale: None,
    };

    let err = review_model(&provider, req, "req-stub-3".into())
        .await
        .unwrap_err();

    assert!(err.to_string().contains("internal error"));
}

#[tokio::test]
async fn review_model_with_provider_api_error_propagates() {
    let provider = Provider::Stub(StubProvider::err(ProviderError::Api {
        status: 429,
        body: "rate limited".into(),
    }));
    let req = ReviewModelRequest {
        artifact: test_artifact(),
        context: None,
        locale: None,
    };

    let err = review_model(&provider, req, "req-stub-4".into())
        .await
        .unwrap_err();

    assert!(err.to_string().contains("provider error"));
}

#[tokio::test]
async fn review_model_with_provider_parse_error_propagates() {
    let provider = Provider::Stub(StubProvider::err(ProviderError::Parse(
        "unexpected response format".into(),
    )));
    let req = ReviewModelRequest {
        artifact: test_artifact(),
        context: None,
        locale: None,
    };

    let err = review_model(&provider, req, "req-stub-5".into())
        .await
        .unwrap_err();

    assert!(err.to_string().contains("provider error"));
}

// ---- Response serialization contract tests ----

#[tokio::test]
async fn response_serializes_to_camel_case() {
    let provider = Provider::Stub(StubProvider::ok(valid_review_json()));
    let req = ReviewModelRequest {
        artifact: test_artifact(),
        context: None,
        locale: None,
    };

    let result = review_model(&provider, req, "req-ser".into())
        .await
        .unwrap();

    let json = serde_json::to_value(&result).unwrap();
    // Verify camelCase keys in the serialized output
    assert!(json.get("riskLevel").is_some());
    assert!(json.get("reviewOrder").is_some());
    assert!(json.get("riskyAssumptions").is_some());
    assert!(json.get("modelUsed").is_none()); // nested in meta

    let meta = json.get("meta").unwrap();
    assert!(meta.get("modelUsed").is_some());
    assert!(meta.get("inputTokens").is_some());
    assert!(meta.get("outputTokens").is_some());
    assert!(meta.get("latencyMs").is_some());
    assert!(meta.get("requestId").is_some());

    let finding = &json["findings"][0];
    assert!(finding.get("relatedDiagnostics").is_some());
    assert!(finding.get("affectedIds").is_some());
}
