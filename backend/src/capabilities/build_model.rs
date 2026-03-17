use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;
use crate::providers::traits::{AiRequest, AiResponse, Provider};

#[derive(Deserialize)]
pub struct BuildModelRequest {
    pub description: String,
    #[serde(default)]
    pub locale: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildModelResponse {
    pub snapshot: Value,
    pub interpretation: String,
    pub meta: super::review_model::ReviewMeta,
}

pub async fn build_model(
    provider: &Provider,
    req: BuildModelRequest,
    request_id: String,
) -> Result<BuildModelResponse, AppError> {
    let locale = req.locale.as_deref().unwrap_or("en");

    let system_prompt = build_system_prompt(locale);

    let ai_req = AiRequest {
        system_prompt,
        user_message: req.description,
        max_tokens: 8192,
        temperature: 0.1,
    };

    let ai_resp: AiResponse = provider.complete(ai_req).await?;
    parse_response(ai_resp, request_id)
}

fn build_system_prompt(locale: &str) -> String {
    format!(
        r#"You are a structural model builder for the Dedaliano analysis engine. The user describes a structure in natural language and you generate the model JSON.

## Output Language
Respond in locale: {locale} (for the interpretation field only — the JSON field names must stay in English)

## Units (strictly SI, metric)
- Distance: meters (m)
- Force: kilonewtons (kN)
- Moment: kN·m
- Stress: MPa
- Density: kN/m³
- Area: m²
- Moment of inertia: m⁴

## Common Materials
- Steel A36: E=200000 MPa, nu=0.3, rho=78.5 kN/m³, fy=250 MPa
- Steel A572-50: E=200000 MPa, nu=0.3, rho=78.5 kN/m³, fy=345 MPa
- Concrete H-25: E=30000 MPa, nu=0.2, rho=25 kN/m³

## Common Steel Sections (approximate properties)
- IPE 200: A=0.00285 m², Iz=1.943e-5 m⁴, h=0.2, b=0.1, tw=0.0056, tf=0.0085, shape="I"
- IPE 300: A=0.00538 m², Iz=8.356e-5 m⁴, h=0.3, b=0.15, tw=0.0071, tf=0.0107, shape="I"
- IPE 400: A=0.00845 m², Iz=2.313e-4 m⁴, h=0.4, b=0.18, tw=0.0086, tf=0.0135, shape="I"
- HEB 200: A=0.00781 m², Iz=5.696e-5 m⁴, h=0.2, b=0.2, tw=0.009, tf=0.015, shape="H"
- HEB 300: A=0.01491 m², Iz=2.517e-4 m⁴, h=0.3, b=0.3, tw=0.011, tf=0.019, shape="H"

## Model JSON Format

The output must be a valid ModelSnapshot. Key rules:
- Nodes, materials, sections, elements, supports are arrays of [id, object] pairs
- Loads are arrays of objects with "type" and "data" fields
- Element types: "frame" (bending+axial) or "truss" (axial only)
- Support types (2D): "fixed", "pinned", "rollerX", "rollerY"
- Support types (3D): "fixed3d", "pinned3d", "rollerXZ", "rollerXY", "rollerYZ"
- Load types (2D): "nodal" (fx, fy, mz), "distributed" (qI, qJ on element), "pointOnElement" (a, p)

## Example (simple beam)

For "simply supported beam, 6m, IPE 300, 10 kN/m distributed load":

```json
{{
  "analysisMode": "2d",
  "nodes": [[1, {{"id":1,"x":0,"y":0}}], [2, {{"id":2,"x":6,"y":0}}]],
  "materials": [[1, {{"id":1,"name":"Steel A36","e":200000,"nu":0.3,"rho":78.5,"fy":250}}]],
  "sections": [[1, {{"id":1,"name":"IPE 300","a":0.00538,"iz":8.356e-5,"h":0.3,"b":0.15,"shape":"I","tw":0.0071,"tf":0.0107}}]],
  "elements": [[1, {{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false}}]],
  "supports": [[1, {{"id":1,"nodeId":1,"type":"pinned"}}], [2, {{"id":2,"nodeId":2,"type":"rollerX"}}]],
  "loads": [{{"type":"distributed","data":{{"id":1,"elementId":1,"qI":-10,"qJ":-10}}}}],
  "nextId": {{"node":3,"material":2,"section":2,"element":2,"support":3,"load":2}}
}}
```

## Output Format
Respond with ONLY a JSON object (no markdown fences):

{{
  "snapshot": {{ the ModelSnapshot object }},
  "interpretation": "brief description of what you built and any assumptions you made"
}}

## Guidelines
- Use 2D mode unless the user explicitly mentions 3D, Z coordinates, or out-of-plane behavior
- Place nodes at logical structural points (supports, load application points, span ends, joints)
- Distributed loads are negative for downward (gravity) in local coords
- For continuous beams, create separate elements per span with shared nodes at intermediate supports
- For frames/portals, create column and beam elements with appropriate node connectivity
- If the user specifies a profile (IPE, HEB, etc.), use the closest match from the common sections above
- If no profile specified, choose a reasonable one for the span and load
- Always include at least one material and one section
- Set nextId correctly (max id + 1 for each entity type)"#
    )
}

pub fn parse_response(
    ai_resp: AiResponse,
    request_id: String,
) -> Result<BuildModelResponse, AppError> {
    let content = ai_resp.content.trim();
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    #[derive(Deserialize)]
    struct Raw {
        snapshot: Value,
        interpretation: String,
    }

    let raw: Raw = serde_json::from_str(json_str).map_err(|e| {
        tracing::warn!("failed to parse build-model response: {e}\nraw: {content}");
        AppError::Internal(format!("failed to parse AI response: {e}"))
    })?;

    // Validate that snapshot has the required fields
    let snapshot = &raw.snapshot;
    if !snapshot.is_object()
        || snapshot.get("nodes").is_none()
        || snapshot.get("elements").is_none()
    {
        return Err(AppError::Internal(
            "AI response missing required model fields (nodes, elements)".into(),
        ));
    }

    Ok(BuildModelResponse {
        snapshot: raw.snapshot,
        interpretation: raw.interpretation,
        meta: super::review_model::ReviewMeta {
            model_used: ai_resp.model,
            input_tokens: ai_resp.input_tokens,
            output_tokens: ai_resp.output_tokens,
            latency_ms: ai_resp.latency_ms,
            request_id,
        },
    })
}
