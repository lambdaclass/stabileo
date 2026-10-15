use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::actions::{validate_action, ActionResponse, BuildAction};
use super::coordinate_system::{VerticalAxis, DEFAULT_HORIZONTAL_PLANE_3D, GRAVITY_DIRECTION_3D, VERTICAL_AXIS_3D};
use super::edit_executor;
use super::generators::execute_action;
use super::registry;
use super::validate_snapshot;
use crate::error::AppError;
use crate::providers::traits::{AiMessage, AiRequest, AiResponse, AiRole, Provider};

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
    /// Multi-turn conversation history for iterative building.
    #[serde(default)]
    pub messages: Option<Vec<ConversationMessage>>,
    /// Solver diagnostics from a previous run, for the AI to fix.
    #[serde(default)]
    pub solver_diagnostics: Option<Vec<SolverDiagnostic>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SolverDiagnostic {
    pub code: String,
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelContext {
    pub node_count: u32,
    pub element_count: u32,
    pub support_count: u32,
    pub load_count: u32,
    pub bounds: Bounds,
    pub vertical_axis: VerticalAxis,
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
    pub z_min: f64,
    pub z_max: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y_max: Option<f64>,
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

    // Build multi-turn messages from conversation history + diagnostics
    let ai_messages = build_ai_messages(
        &req.description,
        req.messages.as_deref(),
        req.solver_diagnostics.as_deref(),
    );

    let ai_req = AiRequest {
        system_prompt,
        user_message: req.description.clone(),
        messages: ai_messages,
        max_tokens: 8192,
        temperature: 0.1,
        tools,
    };

    let ai_resp: AiResponse = provider.complete(ai_req).await?;
    parse_response(ai_resp, request_id, req.current_snapshot.as_ref())
}

/// Build `AiMessage` list from conversation history, solver diagnostics,
/// and the current user description.
fn build_ai_messages(
    description: &str,
    history: Option<&[ConversationMessage]>,
    diagnostics: Option<&[SolverDiagnostic]>,
) -> Vec<AiMessage> {
    let has_history = history.map_or(false, |h| !h.is_empty());
    let has_diagnostics = diagnostics.map_or(false, |d| !d.is_empty());

    // No history and no diagnostics → use single user_message fallback
    if !has_history && !has_diagnostics {
        return vec![];
    }

    let mut messages = Vec::new();

    // Replay conversation history
    if let Some(history) = history {
        for msg in history {
            let role = match msg.role.as_str() {
                "assistant" | "ai" => AiRole::Assistant,
                _ => AiRole::User,
            };
            messages.push(AiMessage {
                role,
                content: msg.content.clone(),
            });
        }
    }

    // Inject solver diagnostics as a user message
    if let Some(diags) = diagnostics {
        if !diags.is_empty() {
            let diag_text: Vec<String> = diags
                .iter()
                .map(|d| format!("- [{}] {}: {}", d.severity, d.code, d.message))
                .collect();
            messages.push(AiMessage {
                role: AiRole::User,
                content: format!(
                    "The solver found these issues with your model:\n{}\n\nPlease fix them by calling create_model again with corrected data.",
                    diag_text.join("\n")
                ),
            });
        }
    }

    // Append the current user description
    messages.push(AiMessage {
        role: AiRole::User,
        content: description.to_string(),
    });

    messages
}

fn build_system_prompt(locale: &str, analysis_mode: &str, ctx: Option<&ModelContext>) -> String {
    let capabilities = registry::prompt_text(analysis_mode);

    let context_section = if let Some(c) = ctx {
        let sections: Vec<&str> = c.sections.iter().map(|s| s.name.as_str()).collect();
        format!(
            r#"

The user has an existing model on canvas:
- {nodes} nodes, {elems} elements, {sups} supports, {loads} loads
- Bounds: X [{x0}, {x1}]{y_bounds}, Z (vertical) [{z0}, {z1}]
- 3D contract: vertical axis = {vertical_axis}, horizontal plane = {horizontal_plane}, gravity = {gravity:?}
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
            z0 = c.bounds.z_min, z1 = c.bounds.z_max,
            y_bounds = match (c.bounds.y_min, c.bounds.y_max) {
                (Some(y0), Some(y1)) => format!(", Y (depth) [{y0}, {y1}]"),
                _ => String::new(),
            },
            vertical_axis = match c.vertical_axis { VerticalAxis::Y => "y", VerticalAxis::Z => VERTICAL_AXIS_3D },
            horizontal_plane = DEFAULT_HORIZONTAL_PLANE_3D,
            gravity = GRAVITY_DIRECTION_3D,
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

When no predefined generator matches the user's request, use the create_model tool to build the structure directly. You can create ANY structure: bridges, towers, arches, domes, irregular frames, trusses, etc.

Rules for create_model:
- Use unique sequential IDs starting from 1 for each entity type
- Every element must reference valid node, section, and material IDs
- At least one support is required for stability
- Default material: Steel A36 (E=200000, nu=0.3, rho=78.5, fy=250)
- Section properties: pick from the available sections list, or use reasonable custom values (a in m², iz in m⁴)
- For 2D: nodes have x, y where y = vertical (up). Nodal loads use fx/fz/my (Z-up convention). Gravity = negative fz. Downward loads use negative fz.
- For 3D: nodes have x, y, z where z = elevation (up). Gravity = negative z. Downward loads use negative fz.
- Generate DETAILED structures with realistic geometry: use 20-60 nodes for complex structures like stadiums, bridges, towers. Don't oversimplify — a stadium needs columns, tiers, roof trusses with diagonals. A bridge needs deck, piers, cables or trusses.
- Use realistic dimensions in meters (e.g. stadium ~60-100m wide, bridge ~30-80m span, tower ~20-50m tall)

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

        let parse_result = serde_json::from_value::<ActionResponse>(action_json.clone());
        if let Err(ref e) = parse_result {
            tracing::warn!("tool call '{}' failed to parse as ActionResponse: {} — raw args: {}", tc.name, e, tc.arguments);
        }
        if let Ok(action_resp) = parse_result {
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
    // CreateModel has its own assembly path
    if let BuildAction::CreateModel {
        analysis_mode,
        nodes,
        elements,
        materials,
        sections,
        supports,
        loads,
    } = action
    {
        return assemble_create_model(
            analysis_mode, nodes, elements, materials, sections, supports, loads.as_deref(),
        );
    }

    if action.is_edit() {
        let snap = current_snapshot.ok_or_else(|| {
            AppError::BadRequest("Edit actions require an existing model (send currentSnapshot)".into())
        })?;
        edit_executor::apply_edit(action, snap)
    } else {
        execute_action(action)
    }
}

/// Assemble raw arrays from `create_model` into the standard snapshot format
/// (same as generators produce: `[id, {data}]` tuples), then validate.
fn assemble_create_model(
    analysis_mode: &str,
    nodes: &[Value],
    elements: &[Value],
    materials: &[Value],
    sections: &[Value],
    supports: &[Value],
    loads: Option<&[Value]>,
) -> Result<Value, AppError> {
    // Convert each array entry from `{id, ...}` to `[id, {id, ...}]` tuples
    let nodes_tuples = to_tuples(nodes);
    let elements_tuples = to_tuples(elements);
    let materials_tuples = to_tuples(materials);
    let sections_tuples = to_tuples(sections);
    let supports_tuples = to_tuples(supports);

    // Loads use a different format: they have type+data at top level
    let loads_arr = loads
        .map(|l| l.to_vec())
        .unwrap_or_default();

    // Compute nextId counters
    let next_node = max_id(&nodes_tuples) + 1;
    let next_elem = max_id(&elements_tuples) + 1;
    let next_mat = max_id(&materials_tuples) + 1;
    let next_sec = max_id(&sections_tuples) + 1;
    let next_sup = max_id(&supports_tuples) + 1;
    let next_load = loads_arr.len() as u32 + 1;

    let snapshot = json!({
        "analysisMode": analysis_mode,
        "nodes": nodes_tuples,
        "elements": elements_tuples,
        "materials": materials_tuples,
        "sections": sections_tuples,
        "supports": supports_tuples,
        "loads": loads_arr,
        "nextId": {
            "node": next_node,
            "element": next_elem,
            "material": next_mat,
            "section": next_sec,
            "support": next_sup,
            "load": next_load,
        }
    });

    // Validate
    let warnings = validate_snapshot::validate_snapshot(&snapshot)?;
    if !warnings.is_empty() {
        tracing::warn!("create_model warnings: {:?}", warnings);
    }

    Ok(snapshot)
}

/// Convert `[{id: 1, ...}, ...]` to `[[1, {id: 1, ...}], ...]` tuples.
/// If already in tuple format `[id, {...}]`, pass through.
fn to_tuples(entries: &[Value]) -> Vec<Value> {
    entries
        .iter()
        .map(|entry| {
            // Already a tuple?
            if let Some(arr) = entry.as_array() {
                if arr.len() >= 2 && arr[1].is_object() {
                    return entry.clone();
                }
            }
            // Object → tuple
            if let Some(obj) = entry.as_object() {
                let id = obj
                    .get("id")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                return json!([id, entry]);
            }
            entry.clone()
        })
        .collect()
}

/// Get the max ID from `[[id, {...}], ...]` tuples.
fn max_id(tuples: &[Value]) -> u32 {
    tuples
        .iter()
        .filter_map(|t| t.as_array().and_then(|a| a.first()).and_then(|v| v.as_u64()))
        .max()
        .unwrap_or(0) as u32
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
        BuildAction::CreateModel { nodes, elements, .. } => {
            format!("Custom model ({} nodes, {} elements)", nodes.len(), elements.len())
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
