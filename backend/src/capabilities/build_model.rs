use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::actions::{validate_action, ActionResponse, BuildAction};
use super::edit_executor;
use super::generators::execute_action;
use super::registry;
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
    /// Compact model context for the AI prompt (when editing).
    pub model_context: Option<ModelContext>,
    /// Full current snapshot, required for edit actions.
    pub current_snapshot: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelContext {
    pub node_count: u32,
    pub element_count: u32,
    pub support_count: u32,
    pub load_count: u32,
    pub bounds: Bounds,
    pub sections: Vec<NameRef>,
    pub materials: Vec<NameRef>,
    pub support_types: Vec<String>,
    pub element_types: Vec<String>,
    #[serde(default)]
    pub floor_heights: Vec<f64>,
    #[serde(default)]
    pub bay_widths: Vec<f64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x_min: f64,
    pub x_max: f64,
    pub y_min: f64,
    pub y_max: f64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct NameRef {
    pub id: u32,
    pub name: String,
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
    let has_model = req.model_context.is_some();

    let system_prompt = build_system_prompt(locale, analysis_mode, req.model_context.as_ref());
    let tools = registry::tool_definitions(analysis_mode, has_model);

    let ai_req = AiRequest {
        system_prompt,
        user_message: req.description,
        max_tokens: 2048,
        temperature: 0.1,
        tools,
    };

    let ai_resp: AiResponse = provider.complete(ai_req).await?;
    parse_response(ai_resp, request_id, req.current_snapshot.as_ref())
}

fn build_system_prompt(locale: &str, analysis_mode: &str, ctx: Option<&ModelContext>) -> String {
    let capabilities = registry::prompt_text(analysis_mode);

    let context_section = if let Some(c) = ctx {
        let sections: Vec<&str> = c.sections.iter().map(|s| s.name.as_str()).collect();
        format!(
            r#"

The user has an existing model on canvas:
- {nodes} nodes, {elems} elements, {sups} supports, {loads} loads
- Bounds: X [{x0}, {x1}], Y [{y0}, {y1}]
- Sections: {secs}
- Support types: {stypes}
- Floor heights: {floors:?}
- Bay widths: {bays:?}

You can EDIT the existing model (add_bay, add_story, change_section, etc.) or CREATE a completely new one.
Prefer edit tools when the user says "add", "change", "make it taller", "more bays", etc.
Use create tools when the user wants something entirely different."#,
            nodes = c.node_count, elems = c.element_count,
            sups = c.support_count, loads = c.load_count,
            x0 = c.bounds.x_min, x1 = c.bounds.x_max,
            y0 = c.bounds.y_min, y1 = c.bounds.y_max,
            secs = sections.join(", "),
            stypes = c.support_types.join(", "),
            floors = c.floor_heights,
            bays = c.bay_widths,
        )
    } else {
        String::new()
    };

    format!(
        r#"You are a helpful assistant embedded in Stabileo, a structural analysis app.

Respond in locale: {locale}

When the user describes a structure they want (beam, frame, truss, building, cantilever, etc.), even vaguely, call the appropriate tool with reasonable defaults. Do NOT ask clarifying questions — just build it.

For everything else (greetings, questions, explanations, advice, any topic), reply in plain text.

{capabilities}{context_section}"#
    )
}

/// Parse the AI response: tool calls first, then text fallbacks.
/// When `current_snapshot` is provided, edit actions can modify it.
pub fn parse_response(
    ai_resp: AiResponse,
    request_id: String,
    current_snapshot: Option<&Value>,
) -> Result<BuildModelResponse, AppError> {
    let raw_content = ai_resp.content.trim().to_string();

    let meta = super::review_model::ReviewMeta {
        model_used: ai_resp.model,
        input_tokens: ai_resp.input_tokens,
        output_tokens: ai_resp.output_tokens,
        latency_ms: ai_resp.latency_ms,
        request_id,
    };

    // ── Priority 1: Native tool call ──────────────────────────
    if let Some(tc) = ai_resp.tool_calls.first() {
        let raw_debug = format!("tool_call: {}({})", tc.name, tc.arguments);

        // Extract interpretation from tool args and build clean params
        let mut args: Value = serde_json::from_str(&tc.arguments).unwrap_or(Value::Object(Default::default()));
        let interpretation = args
            .as_object_mut()
            .and_then(|m| m.remove("interpretation"))
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();

        // Build the action JSON with interpretation at top level, params without it
        let action_json = serde_json::json!({
            "action": tc.name,
            "params": args,
            "interpretation": interpretation,
        });

        if let Ok(action_resp) = serde_json::from_value::<ActionResponse>(action_json) {
            if matches!(action_resp.action, BuildAction::Unsupported { .. }) {
                return Ok(BuildModelResponse {
                    snapshot: None,
                    message: interpretation,
                    change_summary: None,
                    scope_refusal: Some(true),
                    raw_ai_response: Some(raw_debug),
                    meta,
                });
            }

            validate_action(&action_resp.action)?;
            let snapshot = run_action(&action_resp.action, current_snapshot)?;

            return Ok(BuildModelResponse {
                snapshot: Some(snapshot),
                message: if interpretation.is_empty() {
                    action_summary(&action_resp.action)
                } else {
                    interpretation
                },
                change_summary: Some(action_summary(&action_resp.action)),
                scope_refusal: None,
                raw_ai_response: Some(raw_debug),
                meta,
            });
        }

        // Tool call didn't parse — fall through to text parsing
    }

    // ── Priority 2: JSON in text (legacy or fallback) ─────────
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

    // Try action-based JSON parsing
    if let Ok(action_resp) = serde_json::from_str::<ActionResponse>(json_str) {
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
        let snapshot = run_action(&action_resp.action, current_snapshot)?;

        return Ok(BuildModelResponse {
            snapshot: Some(snapshot),
            message: action_resp.interpretation,
            change_summary: Some(action_summary(&action_resp.action)),
            scope_refusal: None,
            raw_ai_response: Some(raw_content),
            meta,
        });
    }

    // Try legacy { snapshot, interpretation } format
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

    // ── Priority 3: Plain text conversational response ────────
    Ok(BuildModelResponse {
        snapshot: None,
        message: raw_content.clone(),
        change_summary: None,
        scope_refusal: None,
        raw_ai_response: Some(raw_content),
        meta,
    })
}

/// Dispatch an action: edit actions use the edit executor, create actions use generators.
fn run_action(action: &BuildAction, current_snapshot: Option<&Value>) -> Result<Value, AppError> {
    if action.is_edit() {
        let snap = current_snapshot.ok_or_else(|| {
            AppError::BadRequest("Edit actions require an existing model (send currentSnapshot)".into())
        })?;
        edit_executor::apply_edit(action, snap)
    } else {
        execute_action(action)
    }
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
        // Edit actions
        BuildAction::AddBay { width, side, .. } => {
            let s = side.as_deref().unwrap_or("right");
            format!("Added bay {width}m ({s})")
        }
        BuildAction::AddStory { height, .. } => {
            format!("Added story {height}m")
        }
        BuildAction::ChangeSection { section, element_filter, .. } => {
            let scope = element_filter.as_deref().unwrap_or("all elements");
            format!("Changed {scope} to {section}")
        }
        BuildAction::SetAllSupports { support_type } => {
            format!("Set all supports to {support_type}")
        }
        BuildAction::SetAllBeamLoads { q } => {
            format!("Set beam loads to {q} kN/m")
        }
        BuildAction::AddLateralLoads { h } => {
            format!("Added {h} kN lateral per floor")
        }
        BuildAction::AddDistributedLoad { element_id, q } => {
            format!("Added {q} kN/m on element {element_id}")
        }
        BuildAction::AddNodalLoad { node_id, .. } => {
            format!("Added load at node {node_id}")
        }
        BuildAction::DeleteElement { element_id } => {
            format!("Deleted element {element_id}")
        }
        BuildAction::DeleteLoad { load_id } => {
            format!("Deleted load {load_id}")
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
