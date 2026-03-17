use dedaliano_engine::types::ResultSummary;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::providers::traits::{AiRequest, AiResponse, Provider};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretResultsRequest {
    pub result_summary: ResultSummary,
    pub question: String,
    #[serde(default)]
    pub model_info: Option<ModelInfo>,
    #[serde(default)]
    pub locale: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    #[serde(default)]
    pub n_elements: Option<usize>,
    #[serde(default)]
    pub n_nodes: Option<usize>,
    #[serde(default)]
    pub max_span: Option<f64>,
    #[serde(default)]
    pub structure_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretResultsResponse {
    pub answer: String,
    pub assessment: String,
    pub code_references: Vec<String>,
    pub warnings: Vec<String>,
    pub meta: super::review_model::ReviewMeta,
}

pub async fn interpret_results(
    provider: &Provider,
    req: InterpretResultsRequest,
    request_id: String,
) -> Result<InterpretResultsResponse, AppError> {
    let locale = req.locale.as_deref().unwrap_or("en");

    let system_prompt = build_system_prompt(locale);

    let summary_json = serde_json::to_string_pretty(&req.result_summary)
        .map_err(|e| AppError::Internal(format!("serialize result summary: {e}")))?;

    let mut user_message = format!(
        "## Result Summary\n\n```json\n{summary_json}\n```\n\n## Question\n\n{}",
        req.question
    );

    if let Some(info) = &req.model_info {
        user_message.push_str("\n\n## Model Info\n");
        if let Some(n) = info.n_elements {
            user_message.push_str(&format!("- Elements: {n}\n"));
        }
        if let Some(n) = info.n_nodes {
            user_message.push_str(&format!("- Nodes: {n}\n"));
        }
        if let Some(s) = info.max_span {
            user_message.push_str(&format!("- Max span: {s} m\n"));
        }
        if let Some(t) = &info.structure_type {
            user_message.push_str(&format!("- Structure type: {t}\n"));
        }
    }

    let ai_req = AiRequest {
        system_prompt,
        user_message,
        max_tokens: 2048,
        temperature: 0.2,
    };

    let ai_resp: AiResponse = provider.complete(ai_req).await?;
    parse_response(ai_resp, request_id)
}

fn build_system_prompt(locale: &str) -> String {
    format!(
        r#"You are a structural engineering results interpreter for the Dedaliano analysis engine. The user has solver results and a question about them.

## Output Language
Respond in locale: {locale}

## Result Summary Fields
The result summary contains pre-computed extremes:
- displacementX/Y/Z: max/min displacement components with node IDs
- rotation: max/min rotation with node IDs
- displacementResultant: max resultant displacement with node ID
- reactionResultant: max/min reaction resultant with node ID

All values use SI units: meters (m) for displacements, radians for rotations, kilonewtons (kN) for reactions.

## Common Code References
- Eurocode (EN 1990/1993): deflection limits L/250 (general), L/300 (floors), L/500 (brittle finishes)
- CIRSOC 301 (Argentina): follows Eurocode limits adapted for local practice
- AISC 360: L/360 (live load floors), L/240 (total load), L/600 (sensitive equipment)
- General rule of thumb: L/300 for beams, L/500 for cantilevers (relative to cantilever length)

## Output Format
Respond with ONLY a JSON object (no markdown fences):

{{
  "answer": "direct answer to the user's question",
  "assessment": "ok|marginal|excessive — one-word assessment of the result",
  "codeReferences": ["relevant code clause or rule referenced"],
  "warnings": ["any caveats or things the user should be aware of"]
}}

## Guidelines
- Answer the specific question asked, don't give a generic report
- If the user asks about deflection limits, compute the ratio and compare against code
- If span length is not provided, mention that you need it for a ratio check
- Be conservative — when in doubt, flag as marginal
- Include relevant code references when discussing limits
- Warnings should flag things like: second-order effects not considered, dynamic loads, creep in concrete"#
    )
}

pub fn parse_response(
    ai_resp: AiResponse,
    request_id: String,
) -> Result<InterpretResultsResponse, AppError> {
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
    #[serde(rename_all = "camelCase")]
    struct Raw {
        answer: String,
        assessment: String,
        #[serde(default)]
        code_references: Vec<String>,
        #[serde(default)]
        warnings: Vec<String>,
    }

    let raw: Raw = serde_json::from_str(json_str).map_err(|e| {
        tracing::warn!("failed to parse interpret-results response: {e}\nraw: {content}");
        AppError::Internal(format!("failed to parse AI response: {e}"))
    })?;

    Ok(InterpretResultsResponse {
        answer: raw.answer,
        assessment: raw.assessment,
        code_references: raw.code_references,
        warnings: raw.warnings,
        meta: super::review_model::ReviewMeta {
            model_used: ai_resp.model,
            input_tokens: ai_resp.input_tokens,
            output_tokens: ai_resp.output_tokens,
            latency_ms: ai_resp.latency_ms,
            request_id,
        },
    })
}
