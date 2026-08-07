//! Tracks which design checks actually produced an answer.
//!
//! Every check module computed its demand/capacity ratios as
//! `if capacity > 0.0 { demand / capacity } else { 0.0 }`. That conflates two
//! very different outcomes: "this check does not apply / there is no demand"
//! and "this check could not be evaluated". The second one silently became the
//! safest possible answer — ratio 0.0, feeding `unity_ratio` and `pass`.
//!
//! A [`CheckLedger`] keeps the numeric ratio (so existing consumers see the
//! same shape) but records the name of every check whose capacity was unusable,
//! so the caller can refuse to report a pass.

/// Names of the checks that could not be evaluated for one member.
pub type Unevaluated = Vec<String>;

/// Accumulates ratios and the names of checks that had no usable capacity.
#[derive(Debug, Default, Clone)]
pub struct CheckLedger {
    unevaluated: Unevaluated,
}

impl CheckLedger {
    pub fn new() -> Self {
        Self { unevaluated: Vec::new() }
    }

    /// Ratio for a check that applies to this member.
    ///
    /// Returns `demand / capacity` when both are finite and the capacity is
    /// positive. Otherwise records `name` as unevaluated and returns 0.0 — the
    /// ratio stays a plain number for serialization, but the caller can no
    /// longer mistake it for a satisfied check.
    pub fn ratio(&mut self, name: &str, demand: f64, capacity: f64) -> f64 {
        if !demand.is_finite() || !capacity.is_finite() || capacity <= 0.0 {
            self.flag(name);
            return 0.0;
        }
        demand / capacity
    }

    /// Ratio for a check that only applies when there is a demand of this kind
    /// (axial tension on a member in compression, say). A zero or absent demand
    /// is "not applicable", not "not evaluated", and is not flagged.
    pub fn ratio_if_loaded(&mut self, name: &str, demand: f64, capacity: f64) -> f64 {
        if demand == 0.0 {
            return 0.0;
        }
        self.ratio(name, demand, capacity)
    }

    /// Record a check as unevaluated for a reason the ratio helpers cannot see.
    pub fn flag(&mut self, name: &str) {
        if !self.unevaluated.iter().any(|n| n == name) {
            self.unevaluated.push(name.to_string());
        }
    }

    /// Record `value` as unevaluated if it is not finite, and pass it through.
    pub fn require_finite(&mut self, name: &str, value: f64) -> f64 {
        if !value.is_finite() {
            self.flag(name);
        }
        value
    }

    /// True when every check produced an answer.
    pub fn all_evaluated(&self) -> bool {
        self.unevaluated.is_empty()
    }

    /// Highest ratio among the checks that were evaluated, with its name.
    ///
    /// Non-finite ratios are excluded rather than fed to a comparator: the
    /// previous `max_by(|a, b| a.partial_cmp(&b).unwrap())` panicked on NaN,
    /// which in WASM aborts the module.
    pub fn governing<'a>(&self, checks: &[(f64, &'a str)]) -> (f64, &'a str) {
        checks
            .iter()
            .filter(|(r, _)| r.is_finite())
            .max_by(|a, b| a.0.total_cmp(&b.0))
            .map(|(r, name)| (*r, *name))
            .unwrap_or((0.0, "Not evaluated"))
    }

    pub fn into_unevaluated(self) -> Unevaluated {
        self.unevaluated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_capacity_is_flagged_not_passed() {
        let mut l = CheckLedger::new();
        assert_eq!(l.ratio("Flexure", 100.0, 0.0), 0.0);
        assert!(!l.all_evaluated());
        assert_eq!(l.into_unevaluated(), vec!["Flexure".to_string()]);
    }

    #[test]
    fn nan_demand_is_flagged() {
        let mut l = CheckLedger::new();
        l.ratio("Shear", f64::NAN, 10.0);
        assert!(!l.all_evaluated());
    }

    #[test]
    fn absent_demand_is_not_flagged() {
        let mut l = CheckLedger::new();
        assert_eq!(l.ratio_if_loaded("Tension", 0.0, 0.0), 0.0);
        assert!(l.all_evaluated());
    }

    #[test]
    fn healthy_ratio_passes_through() {
        let mut l = CheckLedger::new();
        assert!((l.ratio("Flexure", 50.0, 100.0) - 0.5).abs() < 1e-12);
        assert!(l.all_evaluated());
    }

    #[test]
    fn governing_ignores_non_finite() {
        let l = CheckLedger::new();
        let (r, name) = l.governing(&[(0.4, "A"), (f64::NAN, "B"), (0.9, "C")]);
        assert!((r - 0.9).abs() < 1e-12);
        assert_eq!(name, "C");
    }

    #[test]
    fn governing_with_nothing_evaluable() {
        let l = CheckLedger::new();
        let (r, name) = l.governing(&[(f64::NAN, "A")]);
        assert_eq!(r, 0.0);
        assert_eq!(name, "Not evaluated");
    }
}
