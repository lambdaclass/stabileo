use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::actions::{validate_action, ActionResponse, BuildAction};
use super::generators::execute_action;
use crate::error::AppError;
use crate::providers::traits::{AiRequest, AiResponse, Provider};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildModelRequest {
    pub description: String,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub analysis_mode: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildModelResponse {
    /// The generated model snapshot. Null when the request is out of scope.
    pub snapshot: Option<Value>,
    /// AI's explanation of what was built, or a scope-refusal message.
    pub message: String,
    /// Short summary of what changed (e.g. "Created 2-span continuous beam with 10 kN/m load").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change_summary: Option<String>,
    /// When true, the AI declined to build — message explains why.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope_refusal: Option<bool>,
    /// Raw AI response for debugging / transparency.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_ai_response: Option<String>,
    pub meta: super::review_model::ReviewMeta,
}

pub async fn build_model(
    provider: &Provider,
    req: BuildModelRequest,
    request_id: String,
) -> Result<BuildModelResponse, AppError> {
    let locale = req.locale.as_deref().unwrap_or("en");
    let analysis_mode = req.analysis_mode.as_deref().unwrap_or("2d");

    let system_prompt = build_system_prompt(locale, analysis_mode);

    let ai_req = AiRequest {
        system_prompt,
        user_message: req.description,
        max_tokens: 2048,
        temperature: 0.1,
    };

    let ai_resp: AiResponse = provider.complete(ai_req).await?;
    parse_response(ai_resp, request_id)
}

fn build_system_prompt(locale: &str, analysis_mode: &str) -> String {
    let capabilities = super::registry::prompt_text(analysis_mode);

    format!(
        r#"You are a helpful assistant embedded in Stabileo, a structural analysis app. You can chat about anything and also build structural models.

Respond in locale: {locale}

ONLY when the user explicitly wants to BUILD or CREATE a structure, output a JSON action (no markdown fences):
{{ "action": "<name>", "params": {{ ... }}, "interpretation": "..." }}

{capabilities}
Defaults: support_left="pinned", support_right="rollerX", base_support="fixed", section="IPE 300", n_panels=4, pattern="pratt"
Truss patterns: "pratt", "warren", "howe"

For EVERYTHING else — greetings, questions, explanations, advice, opinions, any topic — just reply in plain text. Never output JSON unless the user is asking you to build a structure."#
    )
}

pub fn parse_response(
    ai_resp: AiResponse,
    request_id: String,
) -> Result<BuildModelResponse, AppError> {
    let raw_content = ai_resp.content.trim().to_string();
    let content = raw_content.as_str();
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    let meta = super::review_model::ReviewMeta {
        model_used: ai_resp.model,
        input_tokens: ai_resp.input_tokens,
        output_tokens: ai_resp.output_tokens,
        latency_ms: ai_resp.latency_ms,
        request_id,
    };

    // Try action-based parsing first
    if let Ok(action_resp) = serde_json::from_str::<ActionResponse>(json_str) {
        // Handle scope refusal — return message, no model
        if matches!(action_resp.action, BuildAction::Unsupported { .. }) {
            return Ok(BuildModelResponse {
                snapshot: None,
                message: action_resp.interpretation,
                change_summary: None,
                scope_refusal: Some(true),
                raw_ai_response: Some(raw_content),
                meta,
            });
        }

        validate_action(&action_resp.action)?;
        let snapshot = execute_action(&action_resp.action)?;

        return Ok(BuildModelResponse {
            snapshot: Some(snapshot),
            message: action_resp.interpretation,
            change_summary: Some(action_summary(&action_resp.action)),
            scope_refusal: None,
            raw_ai_response: Some(raw_content),
            meta,
        });
    }

    // Fallback: try legacy { snapshot, interpretation } format
    #[derive(Deserialize)]
    struct LegacyRaw {
        snapshot: Value,
        interpretation: String,
    }

    if let Ok(raw) = serde_json::from_str::<LegacyRaw>(json_str) {
        let snapshot = &raw.snapshot;
        if snapshot.is_object()
            && snapshot.get("nodes").is_some()
            && snapshot.get("elements").is_some()
        {
            return Ok(BuildModelResponse {
                snapshot: Some(raw.snapshot),
                message: raw.interpretation,
                change_summary: None,
                scope_refusal: None,
                raw_ai_response: Some(raw_content),
                meta,
            });
        }
    }

    // Not JSON at all — plain text conversational response
    Ok(BuildModelResponse {
        snapshot: None,
        message: raw_content.clone(),
        change_summary: None,
        scope_refusal: None,
        raw_ai_response: Some(raw_content),
        meta,
    })
}

/// Generate a short change summary from the action.
fn action_summary(action: &BuildAction) -> String {
    match action {
        BuildAction::CreateBeam { span, q, .. } => {
            let load = q.map(|v| format!(", {v} kN/m")).unwrap_or_default();
            format!("Beam {span}m{load}")
        }
        BuildAction::CreateCantilever { length, p_tip, q, .. } => {
            let load = p_tip
                .map(|v| format!(", P={v} kN"))
                .or_else(|| q.map(|v| format!(", q={v} kN/m")))
                .unwrap_or_default();
            format!("Cantilever {length}m{load}")
        }
        BuildAction::CreateContinuousBeam { spans, q, .. } => {
            let s: Vec<String> = spans.iter().map(|v| format!("{v}")).collect();
            let load = q.map(|v| format!(", {v} kN/m")).unwrap_or_default();
            format!("Continuous beam [{}]{load}", s.join("+"))
        }
        BuildAction::CreatePortalFrame { width, height, .. } => {
            format!("Portal frame {width}x{height}m")
        }
        BuildAction::CreateTruss { span, height, pattern, .. } => {
            let pat = pattern.as_deref().unwrap_or("pratt");
            format!("{} truss {span}x{height}m", capitalize(pat))
        }
        BuildAction::CreateMultiStoryFrame { n_bays, n_floors, bay_width, floor_height, .. } => {
            format!("{n_floors}-story frame, {n_bays} bays @ {bay_width}m x {floor_height}m")
        }
        BuildAction::CreateMultiStoryFrame3d { n_bays_x, n_bays_z, n_floors, bay_width, floor_height, .. } => {
            format!("{n_floors}-story 3D frame, {n_bays_x}x{n_bays_z} bays @ {bay_width}m x {floor_height}m")
        }
        BuildAction::CreatePortalFrame3d { width, depth, height, .. } => {
            format!("3D frame {width}x{depth}x{height}m")
        }
        BuildAction::Unsupported { .. } => String::new(),
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().chain(c).collect(),
    }
}
