//! The paper's shallow, inextensible arch (SM §II, Eqs. S14–S17), as a reference for α → 0.
use std::f64::consts::PI;

/// µ = ΔL/(α²L) on a symmetric equilibrium with compressive force τ² (Eq. S15).
pub fn mu(tau: f64) -> f64 {
    let s = (0.5 * tau).sin();
    (tau - tau.sin()) / (4.0 * tau * s * s)
}

/// Midpoint height ζ(0)/α of the symmetric equilibrium (Eq. S14 at x = 0).
pub fn height(tau: f64) -> f64 {
    (0.25 * tau).tan() / tau
}

fn bisect(f: impl Fn(f64) -> f64, mut a: f64, mut b: f64) -> f64 {
    let fa = f(a);
    for _ in 0..200 {
        let m = 0.5 * (a + b);
        if (f(m) > 0.0) == (fa > 0.0) { a = m } else { b = m }
    }
    0.5 * (a + b)
}

/// τ* with tan(τ*/2) = τ*/2 in (2π, 3π): the only force at which asymmetric equilibria exist.
pub fn tau_asymmetric() -> f64 {
    bisect(|t| (0.5 * t).tan() - 0.5 * t, 2.0 * PI + 1e-9, 3.0 * PI - 1e-9)
}

/// The fold of the inverted branch: dµ/dτ = 0 in (2π, 4π).
pub fn fold() -> (f64, f64) {
    let d = |t: f64| (mu(t + 1e-6) - mu(t - 1e-6)) / 2e-6;
    let t = bisect(d, 2.0 * PI + 0.5, 4.0 * PI - 0.5);
    (t, mu(t))
}

/// τ on the natural (0, 2π) or inverted (2π, τ_fold) branch at a given µ.
pub fn tau_at(mu_value: f64, inverted: bool) -> Option<f64> {
    let (lo, hi) = if inverted { (2.0 * PI + 1e-9, fold().0) } else { (1e-6, 2.0 * PI - 1e-9) };
    let residual = |t| mu(t) - mu_value;
    let (a, b) = (residual(lo), residual(hi));
    if a == 0.0 { return Some(lo); }
    if b == 0.0 { return Some(hi); }
    (a.is_finite() && b.is_finite() && a.signum() != b.signum()).then(|| bisect(residual, lo, hi))
}
