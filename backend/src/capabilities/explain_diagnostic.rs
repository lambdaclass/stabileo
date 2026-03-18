use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::providers::traits::{AiRequest, AiResponse, Provider};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainDiagnosticRequest {
    pub code: String,
    pub severity: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub value: Option<f64>,
    #[serde(default)]
    pub threshold: Option<f64>,
    #[serde(default)]
    pub element_ids: Vec<usize>,
    #[serde(default)]
    pub node_ids: Vec<usize>,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainDiagnosticResponse {
    pub title: String,
    pub explanation: String,
    pub cause: String,
    pub fix_steps: Vec<String>,
    pub severity_meaning: String,
    pub meta: super::review_model::ReviewMeta,
}

pub async fn explain_diagnostic(
    provider: &Provider,
    req: ExplainDiagnosticRequest,
    request_id: String,
) -> Result<ExplainDiagnosticResponse, AppError> {
    let locale = req.locale.as_deref().unwrap_or("en");

    let system_prompt = build_system_prompt(locale);

    let mut details = format!("Diagnostic code: {}\nSeverity: {}", req.code, req.severity);
    if let Some(msg) = &req.message {
        details.push_str(&format!("\nMessage: {msg}"));
    }
    if let Some(v) = req.value {
        details.push_str(&format!("\nValue: {v}"));
    }
    if let Some(t) = req.threshold {
        details.push_str(&format!("\nThreshold: {t}"));
    }
    if !req.element_ids.is_empty() {
        details.push_str(&format!("\nAffected elements: {:?}", req.element_ids));
    }
    if !req.node_ids.is_empty() {
        details.push_str(&format!("\nAffected nodes: {:?}", req.node_ids));
    }
    if let Some(ctx) = &req.context {
        details.push_str(&format!("\n\nUser context: {ctx}"));
    }

    let ai_req = AiRequest {
        system_prompt,
        user_message: details,
        messages: vec![],
        max_tokens: 1024,
        temperature: 0.1,
        tools: vec![],
    };

    let ai_resp: AiResponse = provider.complete(ai_req).await?;
    parse_response(ai_resp, request_id)
}

fn build_system_prompt(locale: &str) -> String {
    format!(
        r#"You are a structural engineering assistant for the Dedaliano analysis engine. A user clicked on a diagnostic warning/error and wants to understand it.

## Output Language
Respond in locale: {locale}

## Diagnostic Codes Reference
- **Solver path**: sparse_cholesky, dense_lu, sparse_fallback_dense_lu, diagonal_regularization, sparse_fill_ratio
- **Conditioning**: high_diagonal_ratio (>1e8), extremely_high_diagonal_ratio (>1e12), near_zero_diagonal
- **Residual/equilibrium**: residual_ok, residual_high, equilibrium_ok, equilibrium_violation
- **Element quality**: high_aspect_ratio, negative_jacobian, high_warping, poor_jacobian_ratio, small_min_angle
- **Pre-solve model quality**: no_free_dofs, local_mechanism, singular_matrix, disconnected_node, near_duplicate_nodes, instability_risk, shell_distortion, suspicious_local_axis
- **Constraint quality**: conflicting_constraints, circular_constraint, over_constrained_dof

## Output Format
Respond with ONLY a JSON object (no markdown fences):

{{
  "title": "short descriptive title of the issue",
  "explanation": "clear explanation of what this diagnostic means, written for a structural engineer",
  "cause": "most common cause of this issue",
  "fixSteps": ["step 1", "step 2", "step 3"],
  "severityMeaning": "what this severity level means for the analysis results"
}}

## Guidelines
- Be concise but precise
- Use structural engineering terminology
- Focus on practical causes and fixes, not theoretical background
- If the diagnostic is informational (info severity), reassure the user
- Fix steps should be actionable and ordered by likelihood"#
    )
}

pub fn parse_response(
    ai_resp: AiResponse,
    request_id: String,
) -> Result<ExplainDiagnosticResponse, AppError> {
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
        title: String,
        explanation: String,
        cause: String,
        fix_steps: Vec<String>,
        severity_meaning: String,
    }

    let raw: Raw = serde_json::from_str(json_str).map_err(|e| {
        tracing::warn!("failed to parse explain-diagnostic response: {e}\nraw: {content}");
        AppError::Internal(format!("failed to parse AI response: {e}"))
    })?;

    Ok(ExplainDiagnosticResponse {
        title: raw.title,
        explanation: raw.explanation,
        cause: raw.cause,
        fix_steps: raw.fix_steps,
        severity_meaning: raw.severity_meaning,
        meta: super::review_model::ReviewMeta {
            model_used: ai_resp.model,
            input_tokens: ai_resp.input_tokens,
            output_tokens: ai_resp.output_tokens,
            latency_ms: ai_resp.latency_ms,
            request_id,
        },
    })
}
