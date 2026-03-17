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

fn make_resp(content: &str) -> AiResponse {
    AiResponse {
        content: content.into(),
        model: "m".into(),
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        tool_calls: vec![],
    }
}

// ---- Legacy parse contract tests ----

#[test]
fn parse_legacy_valid_json() {
    let resp = AiResponse {
        content: valid_build_json().into(),
        model: "test-model".into(),
        input_tokens: 200,
        output_tokens: 400,
        latency_ms: 100,
        tool_calls: vec![],
    };

    let result = parse_response(resp, "req-1".into()).unwrap();
    assert!(result.snapshot.is_some());
    let snap = result.snapshot.unwrap();
    assert!(snap.get("nodes").is_some());
    assert!(snap.get("elements").is_some());
    assert!(!result.message.is_empty());
    assert_eq!(result.meta.model_used, "test-model");
    assert!(result.scope_refusal.is_none());
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
        tool_calls: vec![],
    };

    let result = parse_response(resp, "req-2".into()).unwrap();
    assert!(result.snapshot.unwrap().get("nodes").is_some());
}

// ---- Conversational fallback tests ----
// Invalid/incomplete JSON or plain text → treated as conversational response (no snapshot)

#[test]
fn parse_missing_nodes_returns_conversational() {
    let resp = make_resp(r#"{"snapshot": {"elements": [[1, {"id":1}]]}, "interpretation": "test"}"#);
    let result = parse_response(resp, "req-conv".into()).unwrap();
    assert!(result.snapshot.is_none());
    assert!(!result.message.is_empty());
}

#[test]
fn parse_missing_elements_returns_conversational() {
    let resp = make_resp(r#"{"snapshot": {"nodes": [[1, {"id":1,"x":0,"y":0}]]}, "interpretation": "test"}"#);
    let result = parse_response(resp, "req-conv".into()).unwrap();
    assert!(result.snapshot.is_none());
}

#[test]
fn parse_empty_string_returns_conversational() {
    let resp = make_resp("");
    let result = parse_response(resp, "req-conv".into()).unwrap();
    assert!(result.snapshot.is_none());
}

#[test]
fn parse_wrong_schema_returns_conversational() {
    let resp = make_resp(r#"{"answer": "42"}"#);
    let result = parse_response(resp, "req-conv".into()).unwrap();
    assert!(result.snapshot.is_none());
    assert!(result.message.contains("42"));
}

#[test]
fn parse_plain_text_returns_conversational() {
    let resp = make_resp("A simply supported beam transfers loads to its supports through bending and shear.");
    let result = parse_response(resp, "req-conv".into()).unwrap();
    assert!(result.snapshot.is_none());
    assert!(result.message.contains("simply supported"));
}

#[test]
fn parse_snapshot_not_object_returns_conversational() {
    let resp = make_resp(r#"{"snapshot": "not an object", "interpretation": "test"}"#);
    let result = parse_response(resp, "req-conv".into()).unwrap();
    assert!(result.snapshot.is_none());
}

// ---- Action-based parsing tests ----

#[test]
fn parse_action_beam_produces_snapshot() {
    let resp = make_resp(r#"{"action":"create_beam","params":{"span":6,"q":-10},"interpretation":"Viga biapoyada de 6m"}"#);
    let result = parse_response(resp, "action-1".into()).unwrap();

    assert!(result.scope_refusal.is_none());
    let snap = result.snapshot.unwrap();
    assert!(snap.get("nodes").is_some());
    assert!(snap.get("elements").is_some());
    assert!(snap.get("supports").is_some());
    assert_eq!(snap["nodes"].as_array().unwrap().len(), 2);
    assert_eq!(result.message, "Viga biapoyada de 6m");
    assert!(result.change_summary.is_some());
}

#[test]
fn parse_action_cantilever() {
    let resp = make_resp(r#"{"action":"create_cantilever","params":{"length":3,"p_tip":-15},"interpretation":"Cantilever 3m"}"#);
    let result = parse_response(resp, "action-2".into()).unwrap();

    let snap = result.snapshot.unwrap();
    let supports = snap["supports"].as_array().unwrap();
    assert_eq!(supports.len(), 1);
    assert_eq!(supports[0][1]["type"].as_str().unwrap(), "fixed");
}

#[test]
fn parse_action_continuous_beam() {
    let resp = make_resp(r#"{"action":"create_continuous_beam","params":{"spans":[4,6,4],"q":-12},"interpretation":"Viga continua"}"#);
    let result = parse_response(resp, "action-3".into()).unwrap();

    let snap = result.snapshot.unwrap();
    assert_eq!(snap["nodes"].as_array().unwrap().len(), 4);
    assert_eq!(snap["elements"].as_array().unwrap().len(), 3);
    assert_eq!(snap["supports"].as_array().unwrap().len(), 4);
}

#[test]
fn parse_action_portal_frame() {
    let resp = make_resp(r#"{"action":"create_portal_frame","params":{"width":8,"height":5,"q_beam":-15,"h_lateral":10},"interpretation":"Portal frame"}"#);
    let result = parse_response(resp, "action-4".into()).unwrap();

    let snap = result.snapshot.unwrap();
    assert_eq!(snap["nodes"].as_array().unwrap().len(), 4);
    assert_eq!(snap["elements"].as_array().unwrap().len(), 3);
}

#[test]
fn parse_action_truss() {
    let resp = make_resp(r#"{"action":"create_truss","params":{"span":12,"height":2,"n_panels":4,"pattern":"pratt","top_load":-10},"interpretation":"Pratt truss"}"#);
    let result = parse_response(resp, "action-5".into()).unwrap();
    assert!(result.snapshot.unwrap()["nodes"].as_array().unwrap().len() >= 8);
}

#[test]
fn parse_action_portal_frame_3d() {
    let resp = make_resp(r#"{"action":"create_portal_frame_3d","params":{"width":6,"depth":4,"height":4,"q_beam":-10},"interpretation":"3D frame"}"#);
    let result = parse_response(resp, "action-6".into()).unwrap();

    let snap = result.snapshot.unwrap();
    assert_eq!(snap["analysisMode"].as_str().unwrap(), "3d");
    assert_eq!(snap["nodes"].as_array().unwrap().len(), 8);
}

#[test]
fn parse_action_multi_story_frame() {
    let resp = make_resp(r#"{"action":"create_multi_story_frame","params":{"n_bays":2,"n_floors":3,"bay_width":6,"floor_height":3,"q_beam":-10},"interpretation":"3-story frame"}"#);
    let result = parse_response(resp, "action-7".into()).unwrap();

    let snap = result.snapshot.unwrap();
    // 4 rows x 3 columns = 12 nodes
    assert_eq!(snap["nodes"].as_array().unwrap().len(), 12);
    // 3 floors * 3 columns (columns) + 3 floors * 2 bays (beams) = 9 + 6 = 15
    assert_eq!(snap["elements"].as_array().unwrap().len(), 15);
    // 3 fixed supports at base
    assert_eq!(snap["supports"].as_array().unwrap().len(), 3);
}

#[test]
fn parse_action_multi_story_frame_3d() {
    let resp = make_resp(r#"{"action":"create_multi_story_frame_3d","params":{"n_bays_x":2,"n_bays_z":2,"n_floors":3,"bay_width":6,"floor_height":3},"interpretation":"3D building"}"#);
    let result = parse_response(resp, "action-8".into()).unwrap();

    let snap = result.snapshot.unwrap();
    assert_eq!(snap["analysisMode"].as_str().unwrap(), "3d");
    // (3+1) floors * 3x3 grid = 36 nodes
    assert_eq!(snap["nodes"].as_array().unwrap().len(), 36);
    // Columns: 3 floors * 9 columns = 27
    // X-beams: 3 floors * 3 rows * 2 bays = 18
    // Z-beams: 3 floors * 3 cols * 2 bays = 18
    // X-bracing: 3 floors * (2 faces * 2 bays * 2 diags + 2 faces * 2 bays * 2 diags) = 3 * 16 = 48
    let n_elems = snap["elements"].as_array().unwrap().len();
    assert!(n_elems > 50, "expected >50 elements, got {n_elems}");
    // 9 supports at base
    assert_eq!(snap["supports"].as_array().unwrap().len(), 9);
}

#[test]
fn parse_action_howe_truss() {
    let resp = make_resp(r#"{"action":"create_truss","params":{"span":12,"height":2,"n_panels":4,"pattern":"howe","top_load":-10},"interpretation":"Howe truss"}"#);
    let result = parse_response(resp, "action-9".into()).unwrap();
    let snap = result.snapshot.unwrap();
    assert!(snap["nodes"].as_array().unwrap().len() >= 8);
    assert!(result.change_summary.unwrap().contains("Howe"));
}

#[test]
fn parse_action_unsupported_returns_scope_refusal() {
    let resp = make_resp(r#"{"action":"unsupported","params":{},"interpretation":"I can build beams, cantilevers, continuous beams, portal frames, trusses, and simple 3D frames."}"#);
    let result = parse_response(resp, "action-ref".into()).unwrap();

    assert!(result.snapshot.is_none());
    assert_eq!(result.scope_refusal, Some(true));
    assert!(result.message.contains("beams"));
}

#[test]
fn parse_action_invalid_span_returns_error() {
    let resp = make_resp(r#"{"action":"create_beam","params":{"span":-5},"interpretation":"test"}"#);
    let err = parse_response(resp, "action-val".into()).unwrap_err();
    assert!(err.to_string().contains("positive number"));
}

#[test]
fn parse_action_with_custom_section() {
    let resp = make_resp(r#"{"action":"create_beam","params":{"span":6,"q":-10,"section":"IPE 400"},"interpretation":"test"}"#);
    let result = parse_response(resp, "action-sec".into()).unwrap();
    let snap = result.snapshot.unwrap();
    let sec_name = snap["sections"].as_array().unwrap()[0][1]["name"]
        .as_str()
        .unwrap();
    assert_eq!(sec_name, "IPE 400");
}

#[test]
fn legacy_fallback_still_works() {
    let resp = AiResponse {
        content: valid_build_json().into(),
        model: "legacy".into(),
        input_tokens: 100,
        output_tokens: 200,
        latency_ms: 50,
        tool_calls: vec![],
    };

    let result = parse_response(resp, "legacy-1".into()).unwrap();
    let snap = result.snapshot.unwrap();
    assert!(snap.get("nodes").is_some());
    assert!(snap.get("elements").is_some());
}

#[test]
fn change_summary_present_for_actions() {
    let resp = make_resp(r#"{"action":"create_portal_frame","params":{"width":8,"height":5},"interpretation":"test"}"#);
    let result = parse_response(resp, "sum-1".into()).unwrap();
    let summary = result.change_summary.unwrap();
    assert!(summary.contains("Portal frame"));
    assert!(summary.contains("8"));
}

#[test]
fn response_serialization_has_correct_fields() {
    let resp = make_resp(r#"{"action":"create_beam","params":{"span":6},"interpretation":"test beam"}"#);
    let result = parse_response(resp, "ser-1".into()).unwrap();
    let json = serde_json::to_value(&result).unwrap();

    // camelCase
    assert!(json.get("snapshot").is_some());
    assert!(json.get("message").is_some());
    assert!(json.get("changeSummary").is_some());
    assert!(json.get("meta").is_some());
    // scopeRefusal should be absent (skip_serializing_if)
    assert!(json.get("scopeRefusal").is_none());
}

#[test]
fn scope_refusal_serialization() {
    let resp = make_resp(r#"{"action":"unsupported","params":{},"interpretation":"nope"}"#);
    let result = parse_response(resp, "ser-2".into()).unwrap();
    let json = serde_json::to_value(&result).unwrap();

    assert!(json["snapshot"].is_null());
    assert_eq!(json["scopeRefusal"], true);
    assert!(json.get("changeSummary").is_none());
}

// ---- Stub provider integration tests ----

#[tokio::test]
async fn build_model_with_stub_returns_parsed_response() {
    let provider = Provider::Stub(StubProvider::ok(valid_build_json()));
    let req = BuildModelRequest {
        description: "Simply supported beam, 6m, IPE 300, 10 kN/m".into(),
        locale: Some("en".into()),
        analysis_mode: None,
    };

    let result = build_model(&provider, req, "req-stub-1".into())
        .await
        .unwrap();

    assert!(result.snapshot.unwrap().get("nodes").is_some());
    assert!(!result.message.is_empty());
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
        analysis_mode: None,
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
        analysis_mode: None,
    };

    let result = build_model(&provider, req, "req-ser".into())
        .await
        .unwrap();

    let json = serde_json::to_value(&result).unwrap();
    assert!(json.get("snapshot").is_some());
    assert!(json.get("message").is_some());

    let meta = json.get("meta").unwrap();
    assert!(meta.get("modelUsed").is_some());
}

// ---- Tool call tests (function calling path) ----

#[tokio::test]
async fn build_model_with_tool_call_produces_snapshot() {
    let provider = Provider::Stub(StubProvider::ok_tool_call(
        "create_beam",
        r#"{"span":6,"q":-10,"interpretation":"Simply supported beam, 6m"}"#,
    ));
    let req = BuildModelRequest {
        description: "beam 6m with 10kN/m load".into(),
        locale: Some("en".into()),
        analysis_mode: None,
    };

    let result = build_model(&provider, req, "tc-1".into())
        .await
        .unwrap();

    let snap = result.snapshot.unwrap();
    assert!(snap.get("nodes").is_some());
    assert!(snap.get("elements").is_some());
    assert_eq!(result.message, "Simply supported beam, 6m");
    assert!(result.change_summary.is_some());
    assert!(result.scope_refusal.is_none());
}

#[tokio::test]
async fn build_model_tool_call_portal_frame() {
    let provider = Provider::Stub(StubProvider::ok_tool_call(
        "create_portal_frame",
        r#"{"width":8,"height":5,"q_beam":-15,"interpretation":"Portal frame 8x5m"}"#,
    ));
    let req = BuildModelRequest {
        description: "portal frame".into(),
        locale: None,
        analysis_mode: None,
    };

    let result = build_model(&provider, req, "tc-2".into())
        .await
        .unwrap();

    let snap = result.snapshot.unwrap();
    assert_eq!(snap["nodes"].as_array().unwrap().len(), 4);
    assert_eq!(snap["elements"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn build_model_tool_call_with_plain_text_fallback() {
    // No tool call, just text — should be conversational
    let provider = Provider::Stub(StubProvider::ok("Hello! How can I help you today?"));
    let req = BuildModelRequest {
        description: "hi".into(),
        locale: None,
        analysis_mode: None,
    };

    let result = build_model(&provider, req, "tc-3".into())
        .await
        .unwrap();

    assert!(result.snapshot.is_none());
    assert!(result.message.contains("Hello"));
    assert!(result.scope_refusal.is_none());
}
