use crate::types::*;

pub(crate) fn refusal(code: DiagnosticCode, ids: Vec<usize>, phase: &str, message: &str) -> String {
    let mut d = StructuredDiagnostic::global(code, Severity::Error, message);
    if matches!(phase, "node_to_surface" | "uplift") {
        d.node_ids = ids;
    } else {
        d.element_ids = ids;
    }
    d.phase = Some(phase.into());
    serde_json::json!({"message": message, "structuredDiagnostics": [d]}).to_string()
}

pub(crate) fn require_cable_analysis(ids: impl Iterator<Item = usize>) -> Result<(), String> {
    let mut ids: Vec<_> = ids.collect();
    ids.sort_unstable();
    if ids.is_empty() {
        return Ok(());
    }
    Err(refusal(
        DiagnosticCode::CableAnalysisRequired, ids, "element_validity",
        "Results withheld: this analysis treats cables as bars that can carry compression. Use cable analysis to enforce tension-only behaviour.",
    ))
}

pub(crate) fn contact_tolerance(tolerance: Option<f64>) -> Result<f64, String> {
    let tolerance = tolerance.unwrap_or(1e-10);
    if !tolerance.is_finite() || tolerance <= 0.0 {
        return Err(refusal(
            DiagnosticCode::ContactToleranceInvalid, vec![], "contact_tolerance",
            "Results withheld: contact tolerance must be finite and positive. Set a positive contact tolerance and solve again.",
        ));
    }
    Ok(tolerance)
}

pub(crate) fn check_frozen_contact(id: usize, gap: f64, force_over_stiffness: f64, stiffness: f64, tolerance: f64, active: bool, phase: &str) -> Result<(), String> {
    if !stiffness.is_finite() || stiffness <= 0.0 || !gap.is_finite() || !force_over_stiffness.is_finite() || (!active && (gap < -tolerance || force_over_stiffness.abs() > tolerance)) || force_over_stiffness > tolerance
        || (gap > tolerance && force_over_stiffness < -tolerance) {
        return Err(refusal(
            DiagnosticCode::ContactStateInvalid, vec![id], phase,
            "Results withheld: a frozen contact state does not satisfy the bearing, opening and no-tension conditions within the contact tolerance. Revise the contact model or iteration settings and solve again.",
        ));
    }
    Ok(())
}
