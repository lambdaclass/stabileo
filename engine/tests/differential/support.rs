use std::fmt::Debug;
use std::ops::{Mul, Neg, Sub};

pub use dedaliano_engine::types::units::{Force, Length, Moment, Ratio};

macro_rules! test_quantity {
    ($name:ident, $new:ident, $get:ident, $unit:literal) => {
        #[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
        pub struct $name(f64);
        impl $name {
            pub const fn $new(v: f64) -> Self {
                Self(v)
            }
            pub const fn $get(self) -> f64 {
                self.0
            }
        }
        impl Sub for $name {
            type Output = Self;
            fn sub(self, o: Self) -> Self {
                Self(self.0 - o.0)
            }
        }
        impl Neg for $name {
            type Output = Self;
            fn neg(self) -> Self {
                Self(-self.0)
            }
        }
        impl Mul<f64> for $name {
            type Output = Self;
            fn mul(self, k: f64) -> Self {
                Self(self.0 * k)
            }
        }
        impl Unit for $name {
            const UNIT: &'static str = $unit;
            fn raw(self) -> f64 {
                self.0
            }
        }
    };
}

pub trait Unit: Copy + PartialOrd + Debug + Sub<Output = Self> + Neg<Output = Self> + Mul<f64, Output = Self> {
    const UNIT: &'static str;
    fn raw(self) -> f64;
}

test_quantity!(Rotation, from_rad, in_rad, "rad");
test_quantity!(Frequency, from_hz, in_hz, "Hz");
test_quantity!(LoadFactor, from_factor, in_factor, "×load");

impl Unit for Length {
    const UNIT: &'static str = "m";
    fn raw(self) -> f64 {
        self.in_m()
    }
}
impl Unit for Force {
    const UNIT: &'static str = "kN";
    fn raw(self) -> f64 {
        self.in_kn()
    }
}
impl Unit for Ratio {
    const UNIT: &'static str = "";
    fn raw(self) -> f64 {
        self.in_ratio()
    }
}
impl Unit for Moment {
    const UNIT: &'static str = "kN·m";
    fn raw(self) -> f64 {
        self.in_kn_m()
    }
}

fn abs<Q: Unit>(q: Q) -> Q {
    if q.raw() < 0.0 { -q } else { q }
}

/// Discrepancies between the two paths; empty when they agree.
#[derive(Debug, Default)]
pub struct Report {
    failures: Vec<String>,
    checked: usize,
}

impl Report {
    pub fn new() -> Self {
        Self::default()
    }

    /// `|a − b| ≤ tol`, the tolerance in the quantity's own unit.
    pub fn close<Q: Unit>(&mut self, what: &str, a: Q, b: Q, tol: Q) {
        self.checked += 1;
        let d = abs(a - b);
        if !(d <= tol) {
            self.failures.push(format!(
                "{what}: {:.9e} vs {:.9e} {} (|diff| {:.3e} > tol {:.3e})",
                a.raw(),
                b.raw(),
                Q::UNIT,
                d.raw(),
                tol.raw()
            ));
        }
    }

    /// Every pair within `rel` of the field's largest reference magnitude.
    pub fn field<Q: Unit>(&mut self, what: &str, pairs: &[(String, Q, Q)], rel: f64) {
        let Some(first) = pairs.first() else { return };
        let scale = pairs.iter().map(|p| abs(p.2)).fold(abs(first.2), |m, x| if x > m { x } else { m });
        for (label, a, b) in pairs {
            self.close(&format!("{what} {label}"), *a, *b, scale * rel);
        }
    }

    pub fn merge(&mut self, prefix: &str, other: Report) {
        self.checked += other.checked;
        self.failures.extend(other.failures.into_iter().map(|f| format!("{prefix}: {f}")));
    }

    pub fn fail(&mut self, msg: String) {
        self.checked += 1;
        self.failures.push(msg);
    }

    pub fn into_result(self) -> Result<usize, String> {
        if self.failures.is_empty() {
            Ok(self.checked)
        } else {
            Err(format!("{} of {} checks disagree:\n  {}", self.failures.len(), self.checked, self.failures.join("\n  ")))
        }
    }
}

/// The two paths must agree.
pub fn agree(pair: &str, outcome: Result<Report, String>) {
    match outcome.and_then(Report::into_result) {
        Ok(n) => assert!(n > 0, "{pair}: nothing was compared"),
        Err(m) => panic!("{pair}: {m}"),
    }
}

/// The two paths are known to disagree because of an open issue. Once the fix lands
/// the pair agrees and this fails, so the marker is removed and the test guards the fix.
/// A path that refuses or errors is not the known disagreement and fails too.
pub fn known_issue(issue: u32, pair: &str, outcome: Result<Report, String>) {
    let report = outcome.unwrap_or_else(|e| panic!("{pair}: a path refused or failed ({e}), which is not the disagreement #{issue} describes"));
    match report.into_result() {
        Ok(n) => panic!(
            "{pair}: expected to fail until #{issue} is fixed, but all {n} checks agree. \
             Replace known_issue({issue}, ..) with agree(..) in engine/tests/differential/"
        ),
        Err(m) => eprintln!("{pair}: still fails, as expected while #{issue} is open: {m}"),
    }
}
