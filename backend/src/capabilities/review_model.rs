use dedaliano_engine::types::SolverRunArtifact;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::providers::traits::{AiRequest, AiResponse, Provider};

#[derive(Deserialize)]
pub struct ReviewModelRequest {
    pub artifact: SolverRunArtifact,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewModelResponse {
    pub findings: Vec<Finding>,
    pub risk_level: String,
    pub review_order: Vec<String>,
    pub risky_assumptions: Vec<String>,
    pub summary: String,
    pub meta: ReviewMeta,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub title: String,
    pub severity: String,
    pub explanation: String,
    pub related_diagnostics: Vec<String>,
    pub affected_ids: Vec<usize>,
    pub recommendation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewMeta {
    pub model_used: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub latency_ms: u64,
    pub request_id: String,
}

pub async fn review_model(
    provider: &Provider,
    req: ReviewModelRequest,
    request_id: String,
) -> Result<ReviewModelResponse, AppError> {
    let artifact_json = serde_json::to_string_pretty(&req.artifact)
        .map_err(|e| AppError::Internal(format!("serialize artifact: {e}")))?;

    let locale = req.locale.as_deref().unwrap_or("en");

    let system_prompt = build_system_prompt(locale);

    let user_message = if let Some(ctx) = &req.context {
        format!("## Solver Run Artifact\n\n```json\n{artifact_json}\n```\n\n## User Notes\n\n{ctx}")
    } else {
        format!("## Solver Run Artifact\n\n```json\n{artifact_json}\n```")
    };

    let ai_req = AiRequest {
        system_prompt,
        user_message,
        max_tokens: 4096,
        temperature: 0.2,
    };

    let ai_resp: AiResponse = provider.complete(ai_req).await?;
    parse_review_response(ai_resp, request_id)
}

fn build_system_prompt(locale: &str) -> String {
    format!(
        r#"You are a structural engineering AI reviewer for the Dedaliano analysis engine. Your task is to review a solver run artifact and provide findings about the structural model.

## Output Language
Respond in locale: {locale}

## Diagnostic Codes Reference
The artifact contains structured diagnostics with these codes:
- **Solver path**: sparse_cholesky, dense_lu, sparse_fallback_dense_lu, diagonal_regularization, sparse_fill_ratio
- **Conditioning**: high_diagonal_ratio (>1e8), extremely_high_diagonal_ratio (>1e12), near_zero_diagonal
- **Residual/equilibrium**: residual_ok, residual_high, equilibrium_ok, equilibrium_violation
- **Element quality**: high_aspect_ratio, negative_jacobian, high_warping, poor_jacobian_ratio, small_min_angle
- **Pre-solve model quality**: no_free_dofs, local_mechanism, singular_matrix, disconnected_node, near_duplicate_nodes, instability_risk, shell_distortion, suspicious_local_axis
- **Constraint quality**: conflicting_constraints, circular_constraint, over_constrained_dof

Severity levels: error > warning > info

## Output Format
Respond with ONLY a JSON object (no markdown fences) matching this schema:

{{
  "findings": [
    {{
      "title": "short descriptive title",
      "severity": "error|warning|info",
      "explanation": "detailed explanation of the issue",
      "relatedDiagnostics": ["DiagnosticCode"],
      "affectedIds": [1, 2],
      "recommendation": "what the user should do"
    }}
  ],
  "riskLevel": "low|medium|high|critical",
  "reviewOrder": ["step 1", "step 2"],
  "riskyAssumptions": ["assumption 1"],
  "summary": "overall assessment"
}}

## Guidelines
- Base findings on actual diagnostics present in the artifact, not hypotheticals
- Consider the equilibrium summary and result extremes for context
- Flag conditioning issues, mechanism risks, and element quality problems
- Assess overall risk level based on the combination of diagnostics
- Provide actionable recommendations
- Keep titles concise (under 80 chars)
- Order findings by severity (errors first)"#
    )
}

pub fn parse_review_response(
    ai_resp: AiResponse,
    request_id: String,
) -> Result<ReviewModelResponse, AppError> {
    let content = ai_resp.content.trim();

    // Strip markdown fences if the model wraps its response
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
    struct RawReview {
        findings: Vec<RawFinding>,
        risk_level: String,
        review_order: Vec<String>,
        risky_assumptions: Vec<String>,
        summary: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawFinding {
        title: String,
        severity: String,
        explanation: String,
        #[serde(default)]
        related_diagnostics: Vec<String>,
        #[serde(default)]
        affected_ids: Vec<usize>,
        recommendation: String,
    }

    let raw: RawReview = serde_json::from_str(json_str).map_err(|e| {
        tracing::warn!("failed to parse AI response as JSON: {e}\nraw: {content}");
        AppError::Internal(format!("failed to parse AI review response: {e}"))
    })?;

    Ok(ReviewModelResponse {
        findings: raw
            .findings
            .into_iter()
            .map(|f| Finding {
                title: f.title,
                severity: f.severity,
                explanation: f.explanation,
                related_diagnostics: f.related_diagnostics,
                affected_ids: f.affected_ids,
                recommendation: f.recommendation,
            })
            .collect(),
        risk_level: raw.risk_level,
        review_order: raw.review_order,
        risky_assumptions: raw.risky_assumptions,
        summary: raw.summary,
        meta: ReviewMeta {
            model_used: ai_resp.model,
            input_tokens: ai_resp.input_tokens,
            output_tokens: ai_resp.output_tokens,
            latency_ms: ai_resp.latency_ms,
            request_id,
        },
    })
}
