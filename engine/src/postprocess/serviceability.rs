//! Serviceability limit state checks for deflection and vibration.
//!
//! Checks member deflections against code-specified limits (L/xxx)
//! and floor vibration criteria.

use serde::{Deserialize, Serialize};

use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};

// ==================== Types ====================

/// Deflection limit criterion.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeflectionCriterion {
    /// L/ratio (e.g., L/360 for live load, L/240 for total)
    SpanRatio(f64),
    /// Absolute limit in meters
    Absolute(f64),
}

/// Member data for serviceability check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceabilityMember {
    pub element_id: usize,
    /// Span length L (m)
    pub span: f64,
    /// Maximum deflection from analysis (m, absolute value)
    pub max_deflection: f64,
    /// Deflection limit criterion
    pub criterion: DeflectionCriterion,
    /// Optional: natural frequency from modal analysis (Hz)
    #[serde(default)]
    pub natural_frequency: Option<f64>,
    /// Optional: minimum frequency limit (Hz, default 3.0 for floors)
    #[serde(default)]
    pub min_frequency: Option<f64>,
    /// Optional description
    #[serde(default)]
    pub description: Option<String>,
}

/// Input for serviceability check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceabilityInput {
    pub members: Vec<ServiceabilityMember>,
}

/// Result of serviceability check for one member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceabilityResult {
    pub element_id: usize,
    /// Deflection unity ratio (actual/allowable)
    pub deflection_ratio: f64,
    /// Allowable deflection (m)
    pub allowable_deflection: f64,
    /// Actual deflection (m)
    pub actual_deflection: f64,
    /// Pass/fail for deflection
    pub deflection_ok: bool,
    /// Vibration unity ratio (min_freq / actual_freq), if applicable
    pub vibration_ratio: Option<f64>,
    /// Pass/fail for vibration, if applicable
    pub vibration_ok: Option<bool>,
    /// Overall pass/fail
    pub pass: bool,
    /// Checks that could not be evaluated.
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

/// Run serviceability checks.
pub fn check_serviceability(input: &ServiceabilityInput) -> Vec<ServiceabilityResult> {
    let mut results = Vec::new();

    for m in &input.members {
        let allowable = match m.criterion {
            DeflectionCriterion::SpanRatio(ratio) => {
                if ratio > 0.0 {
                    m.span / ratio
                } else {
                    f64::INFINITY
                }
            }
            DeflectionCriterion::Absolute(limit) => limit,
        };

        let mut ledger = CheckLedger::new();
        let actual = m.max_deflection.abs();
        let deflection_ratio = ledger.ratio("Deflection", actual, allowable);
        let deflection_ok = ledger.all_evaluated() && deflection_ratio <= 1.0;

        // A frequency that was requested but is unusable (a modal solve that
        // produced nothing) is an unevaluated check, not an absent one — the
        // previous `unwrap_or(true)` turned it into a pass.
        let (vibration_ratio, vibration_ok) = match (m.natural_frequency, m.min_frequency) {
            (Some(freq), min) if freq > 0.0 && freq.is_finite() => {
                let min_freq = min.unwrap_or(3.0); // default floor criterion
                let ratio = min_freq / freq;
                (Some(ratio), Some(ratio <= 1.0))
            }
            (Some(_), _) => {
                ledger.flag("Vibration");
                (None, Some(false))
            }
            (None, _) => (None, None),
        };

        let pass = ledger.all_evaluated() && deflection_ok && vibration_ok.unwrap_or(true);

        results.push(ServiceabilityResult {
            element_id: m.element_id,
            deflection_ratio,
            allowable_deflection: allowable,
            actual_deflection: actual,
            deflection_ok,
            vibration_ratio,
            vibration_ok,
            pass,
            unevaluated: ledger.into_unevaluated(),
        });
    }

    results.sort_by_key(|r| r.element_id);
    results
}
