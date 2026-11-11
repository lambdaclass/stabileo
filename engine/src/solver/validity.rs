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
        || (gap > tolerance && force_over_stiffness < -tolerance)
        || (active && force_over_stiffness > gap.min(0.0) + tolerance) {
        return Err(refusal(
            DiagnosticCode::ContactStateInvalid, vec![id], phase,
            "Results withheld: a frozen contact state does not satisfy the bearing, opening and no-tension conditions within the contact tolerance. Revise the contact model or iteration settings and solve again.",
        ));
    }
    Ok(())
}

pub(crate) fn check_frozen_member(id: usize, behavior: &str, forces: [f64; 2], inactive_trial_force: Option<f64>, stiffness: f64, tolerance: f64) -> Result<(), String> {
    let sign = if behavior == "tension_only" { -1.0 } else { 1.0 };
    if !stiffness.is_finite() || stiffness <= 0.0 || forces.iter().any(|force| !force.is_finite() || sign * force / stiffness > tolerance)
        || inactive_trial_force.is_some_and(|force| !force.is_finite() || -sign * force / stiffness > tolerance) {
        return Err(refusal(
            DiagnosticCode::ContactStateInvalid, vec![id], "element_behavior",
            "Results withheld: a frozen one-way member does not satisfy recovered axial-force signs and inactive-member activation conditions within the scaled contact tolerance. Revise the contact model or iteration settings and solve again.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frozen_member_rejects_invalid_forces_and_stiffness() {
        for behavior in ["tension_only", "compression_only"] {
            let sign = if behavior == "tension_only" { 1.0 } else { -1.0 };
            for forces in [[sign, -sign], [-sign, sign]] {
                assert!(check_frozen_member(2, behavior, forces, None, 1000.0, 1e-10).is_err());
            }
            assert!(check_frozen_member(2, behavior, [sign; 2], None, 1000.0, 1e-10).is_ok());
            for forces in [[f64::NAN, 0.0], [0.0, f64::INFINITY], [f64::NEG_INFINITY, 0.0]] {
                assert!(check_frozen_member(2, behavior, forces, None, 1000.0, 1e-10).is_err());
            }
            for stiffness in [0.0, -1000.0, f64::NAN, f64::INFINITY] {
                assert!(check_frozen_member(2, behavior, [0.0; 2], None, stiffness, 1e-10).is_err());
            }
        }
    }

    #[test]
    fn frozen_inactive_member_validates_trial_force_and_recovered_forces() {
        for (behavior, sign) in [("tension_only", 1.0), ("compression_only", -1.0)] {
            for trial in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, sign * 1.01e-7] {
                assert!(check_frozen_member(2, behavior, [0.0; 2], Some(trial), 1000.0, 1e-10).is_err());
            }
            for trial in [0.0, -sign, sign * 0.99e-7] {
                assert!(check_frozen_member(2, behavior, [0.0; 2], Some(trial), 1000.0, 1e-10).is_ok());
            }
            for forces in [[-sign, 0.0], [0.0, -sign], [f64::NAN, 0.0], [0.0, f64::INFINITY]] {
                assert!(check_frozen_member(2, behavior, forces, Some(-sign), 1000.0, 1e-10).is_err());
            }
            for stiffness in [0.0, -1000.0, f64::NAN, f64::INFINITY] {
                assert!(check_frozen_member(2, behavior, [0.0; 2], Some(0.0), stiffness, 1e-10).is_err());
            }
        }
    }

    #[test]
    fn frozen_penetration_requires_assembled_compression() {
        let tolerance = 1e-10;
        for force in [0.0, -tolerance / 2.0, tolerance / 2.0] {
            let error = check_frozen_contact(2, -1.0, force, 1e5, tolerance, true, "node_to_surface")
                .expect_err("penetration without consistent assembled compression");
            let error: serde_json::Value = serde_json::from_str(&error).unwrap();
            assert_eq!(error["structuredDiagnostics"][0]["code"], "contact_state_invalid");
            assert_eq!(error["structuredDiagnostics"][0]["nodeIds"], serde_json::json!([2]));
        }
        assert!(check_frozen_contact(2, -1.0, -1.0, 1e5, tolerance, true, "node_to_surface").is_ok());
        assert!(check_frozen_contact(2, -1.0, -2.0, 1e5, tolerance, true, "node_to_surface").is_ok());
    }
}
