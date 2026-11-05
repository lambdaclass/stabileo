//! Demand/capacity ratios that cannot fail open.
//!
//! A ratio is either a finite number or a reason it could not be formed. A non-finite demand,
//! a non-finite or non-positive capacity, or a quotient that overflows is [`Outcome::Unevaluated`],
//! never 0 and never a pass.

use crate::certify::interval::Interval;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reason {
    NonFiniteDemand,
    NonFiniteCapacity,
    NonPositiveCapacity,
    NonFiniteRatio,
}

impl Reason {
    pub fn code(self) -> &'static str {
        match self {
            Reason::NonFiniteDemand => "non_finite_demand",
            Reason::NonFiniteCapacity => "non_finite_capacity",
            Reason::NonPositiveCapacity => "non_positive_capacity",
            Reason::NonFiniteRatio => "non_finite_ratio",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Outcome<T = f64> {
    Ratio(T),
    Unevaluated(Reason),
}

impl<T: Copy> Outcome<T> {
    pub fn value(self) -> Option<T> {
        match self {
            Outcome::Ratio(r) => Some(r),
            Outcome::Unevaluated(_) => None,
        }
    }

    pub fn reason(self) -> Option<Reason> {
        match self {
            Outcome::Ratio(_) => None,
            Outcome::Unevaluated(r) => Some(r),
        }
    }
}

impl Outcome<f64> {
    pub fn passes(self) -> bool {
        matches!(self, Outcome::Ratio(r) if r <= 1.0)
    }
}

/// `demand / capacity` for a check that always applies.
pub fn ratio(demand: f64, capacity: f64) -> Outcome {
    if !demand.is_finite() {
        return Outcome::Unevaluated(Reason::NonFiniteDemand);
    }
    if !capacity.is_finite() {
        return Outcome::Unevaluated(Reason::NonFiniteCapacity);
    }
    if capacity <= 0.0 {
        return Outcome::Unevaluated(Reason::NonPositiveCapacity);
    }
    let r = demand / capacity;
    if r.is_finite() { Outcome::Ratio(r) } else { Outcome::Unevaluated(Reason::NonFiniteRatio) }
}

/// [`ratio`] for a check that applies only under load: an exactly zero demand is not
/// applicable (ratio 0) whatever the capacity.
pub fn ratio_if_loaded(demand: f64, capacity: f64) -> Outcome {
    if demand == 0.0 {
        return Outcome::Ratio(0.0);
    }
    ratio(demand, capacity)
}

/// `x` where positive, 0 where not, and NaN for NaN: unlike `x.max(0.0)`, a NaN demand stays one.
pub fn positive_part(x: f64) -> f64 {
    if x > 0.0 || x.is_nan() { x } else { 0.0 }
}

/// Enclosure of `demand / capacity` when the capacity is certified positive.
pub fn enclosure(demand: Interval, capacity: Interval) -> Outcome<Interval> {
    if !demand.is_finite() {
        return Outcome::Unevaluated(Reason::NonFiniteDemand);
    }
    if !capacity.is_finite() {
        return Outcome::Unevaluated(Reason::NonFiniteCapacity);
    }
    if capacity.lo <= 0.0 {
        return Outcome::Unevaluated(Reason::NonPositiveCapacity);
    }
    let r = demand.div(capacity);
    if r.is_finite() { Outcome::Ratio(r) } else { Outcome::Unevaluated(Reason::NonFiniteRatio) }
}

/// [`enclosure`] for a check that applies only under load: an identically zero demand is not
/// applicable (ratio 0).
pub fn enclosure_if_loaded(demand: Interval, capacity: Interval) -> Outcome<Interval> {
    if demand.lo == 0.0 && demand.hi == 0.0 {
        return Outcome::Ratio(Interval::ZERO);
    }
    enclosure(demand, capacity)
}

pub(crate) const NON_FINITE: &str = "non-finite value ";

/// Serializes +∞ (a refused ratio, an unbounded safety factor) as JSON null and refuses NaN and −∞.
pub fn ser_ratio<S: serde::Serializer>(v: &f64, s: S) -> Result<S::Ok, S::Error> {
    if v.is_finite() {
        s.serialize_f64(*v)
    } else if *v == f64::INFINITY {
        s.serialize_none()
    } else {
        Err(serde::ser::Error::custom(format!("{NON_FINITE}{v}")))
    }
}

pub fn de_ratio<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    let v: Option<f64> = Option::deserialize(d)?;
    Ok(v.unwrap_or(f64::INFINITY))
}

/// For a reported intermediate that is not a verdict (a reduction factor, an effective property):
/// a value that could not be computed goes out as null, and the check that needs it is in the ledger.
pub fn ser_known<S: serde::Serializer>(v: &f64, s: S) -> Result<S::Ok, S::Error> {
    if v.is_finite() {
        s.serialize_f64(*v)
    } else {
        s.serialize_none()
    }
}

pub fn de_known<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    let v: Option<f64> = Option::deserialize(d)?;
    Ok(v.unwrap_or(f64::NAN))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn healthy_ratio() {
        assert_eq!(ratio(50.0, 100.0), Outcome::Ratio(0.5));
        assert!(ratio(50.0, 100.0).passes());
        assert!(!ratio(150.0, 100.0).passes());
    }

    #[test]
    fn each_failure_has_its_reason() {
        assert_eq!(ratio(f64::NAN, 1.0), Outcome::Unevaluated(Reason::NonFiniteDemand));
        assert_eq!(ratio(f64::INFINITY, 1.0), Outcome::Unevaluated(Reason::NonFiniteDemand));
        assert_eq!(ratio(1.0, f64::NAN), Outcome::Unevaluated(Reason::NonFiniteCapacity));
        assert_eq!(ratio(1.0, f64::INFINITY), Outcome::Unevaluated(Reason::NonFiniteCapacity));
        assert_eq!(ratio(1.0, 0.0), Outcome::Unevaluated(Reason::NonPositiveCapacity));
        assert_eq!(ratio(1.0, -0.0), Outcome::Unevaluated(Reason::NonPositiveCapacity));
        assert_eq!(ratio(0.0, -5.0), Outcome::Unevaluated(Reason::NonPositiveCapacity));
        assert_eq!(ratio(1e300, 1e-300), Outcome::Unevaluated(Reason::NonFiniteRatio));
    }

    #[test]
    fn unloaded_check_is_not_applicable_whatever_the_capacity() {
        assert_eq!(ratio_if_loaded(0.0, 0.0), Outcome::Ratio(0.0));
        assert_eq!(ratio_if_loaded(0.0, f64::NAN), Outcome::Ratio(0.0));
        assert_eq!(ratio_if_loaded(f64::NAN, 1.0), Outcome::Unevaluated(Reason::NonFiniteDemand));
        assert_eq!(ratio_if_loaded(1.0, 0.0), Outcome::Unevaluated(Reason::NonPositiveCapacity));
    }

    #[test]
    fn positive_part_keeps_nan() {
        assert_eq!(positive_part(3.0), 3.0);
        assert_eq!(positive_part(-3.0), 0.0);
        assert!(positive_part(f64::NAN).is_nan());
        assert!(!ratio_if_loaded(positive_part(f64::NAN), 1.0).passes());
        assert!(!ratio_if_loaded(positive_part(-f64::NAN), 1.0).passes());
    }

    #[test]
    fn enclosure_needs_a_certified_positive_capacity() {
        let d = Interval::new(1.0, 2.0);
        assert_eq!(enclosure(d, Interval::new(-1.0, 4.0)), Outcome::Unevaluated(Reason::NonPositiveCapacity));
        assert_eq!(enclosure(d, Interval::new(0.0, 4.0)), Outcome::Unevaluated(Reason::NonPositiveCapacity));
        assert_eq!(enclosure(d, Interval::NAN), Outcome::Unevaluated(Reason::NonFiniteCapacity));
        assert_eq!(enclosure(Interval::NAN, Interval::point(1.0)), Outcome::Unevaluated(Reason::NonFiniteDemand));
        let r = enclosure(d, Interval::new(4.0, 4.0)).value().unwrap();
        assert!(r.lo <= 0.25 && 0.5 <= r.hi);
        assert_eq!(enclosure_if_loaded(Interval::ZERO, Interval::NAN), Outcome::Ratio(Interval::ZERO));
    }

    fn issue_467_box() -> crate::postprocess::cirsoc301_check::Cirsoc301MemberData {
        serde_json::from_value(serde_json::json!({
            "Fy": 235.0, "Fu": 352.5, "E": 200000.0, "A": 0.004154258317613479, "Iz": 0.00018670605799131143,
            "Iy": 0.00018670373863284803, "h": 0.52128444, "b": 0.5212801394033699, "tw": 0.002,
            "tf": 0.00417027552, "L": 0.5, "Lb": 0.0, "shape": "box", "builtUp": false, "elementId": 1
        }))
        .unwrap()
    }

    #[test]
    fn sa_2026_030_a_nan_slenderness_reaches_the_ratio_as_unevaluated_not_as_a_pass() {
        let (qa, fy, fe): (f64, f64, f64) = (-2.7e-7, 235.0, 1.0e6);
        let lambda = (qa * fy / fe).sqrt();
        assert!(lambda.is_nan() && !(lambda <= 1.5));
        let fcr = qa * 0.658f64.powf(lambda * lambda) * fy;
        let phi_pn = 0.85 * 4154.0 * fcr / 1000.0;
        assert_eq!(ratio(976.0, phi_pn), Outcome::Unevaluated(Reason::NonFiniteCapacity));
        assert!(!ratio(976.0, phi_pn).passes());
        assert_eq!(ratio(976.0, 0.0), Outcome::Unevaluated(Reason::NonPositiveCapacity));
    }

    #[test]
    fn sa_2026_030_cirsoc301_refuses_a_nan_demand_on_each_check_instead_of_passing_it() {
        use crate::postprocess::cirsoc301_check::{check_compression, check_member, Cirsoc301DesignForces};
        let m: crate::postprocess::cirsoc301_check::Cirsoc301MemberData = serde_json::from_value(serde_json::json!({
            "Fy": 235.0, "Fu": 370.0, "E": 200000.0, "A": 0.0076, "Iz": 4.6e-5, "Iy": 4.6e-5,
            "h": 0.2, "b": 0.2, "tw": 0.01, "tf": 0.01, "L": 3.0, "Lb": 0.0, "shape": "box"
        }))
        .unwrap();
        let c = check_compression(&m, f64::NAN);
        assert!(!c.pass);
        assert_eq!(c.not_evaluated.as_ref().map(|r| r.key.as_str()), Some("c301.refuse.capacityUnusable"));
        assert!(c.ratio.is_infinite());
        let r = check_member(&m, &Cirsoc301DesignForces { element_id: 1, nu: 10.0, mu_strong: f64::NAN, mu_weak: 0.0, vu: 0.0 });
        assert!(!r.pass && !r.flexure_strong.pass);
        assert!(r.unevaluated.contains(&"flexureStrong".to_string()), "{:?}", r.unevaluated);
        let held = check_compression(&issue_467_box(), 0.003);
        assert!(!held.pass && held.not_evaluated.is_some());
    }

    fn bad_capacity() -> impl Strategy<Value = f64> {
        prop_oneof![
            Just(0.0),
            Just(-0.0),
            Just(f64::NAN),
            Just(f64::INFINITY),
            Just(f64::NEG_INFINITY),
            Just(-f64::MIN_POSITIVE),
            Just(f64::MIN),
            -1e300f64..0.0,
        ]
    }

    fn any_demand() -> impl Strategy<Value = f64> {
        prop_oneof![
            Just(0.0),
            Just(f64::NAN),
            Just(f64::INFINITY),
            Just(f64::NEG_INFINITY),
            -1e300f64..1e300,
        ]
    }

    proptest! {
        #[test]
        fn a_bad_capacity_never_passes(d in any_demand(), c in bad_capacity()) {
            let o = ratio(d, c);
            prop_assert!(!o.passes());
            prop_assert!(o.value().is_none());
            let loaded = ratio_if_loaded(d, c);
            if d != 0.0 {
                prop_assert!(!loaded.passes());
                prop_assert!(loaded.value().is_none());
            }
            let lo = if c.is_nan() { c } else { c.min(0.0) };
            let e = enclosure_if_loaded(Interval::new(d.min(1.0), d.max(1.0)), Interval::new(lo, c.max(lo)));
            prop_assert!(e.value().is_none());
        }

        #[test]
        fn a_non_finite_demand_never_passes(c in -1e300f64..1e300, nan in any::<bool>(), neg in any::<bool>()) {
            let d = if nan { f64::NAN } else if neg { f64::NEG_INFINITY } else { f64::INFINITY };
            prop_assert!(!ratio(d, c).passes());
            prop_assert!(!ratio_if_loaded(d, c).passes());
            prop_assert!(ratio(d, c).value().is_none());
        }

        #[test]
        fn every_ratio_formed_is_finite(d in any_demand(), c in prop_oneof![bad_capacity(), 1e-300f64..1e300]) {
            if let Some(r) = ratio_if_loaded(d, c).value() {
                prop_assert!(r.is_finite());
            }
        }
    }
}
