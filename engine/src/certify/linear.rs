//! Certified a posteriori error bound for a dense linear system `K u = f`.
//! Implements `docs/verification/CERTIFY.md` literally:
//!
//! 1. `M = S − σI`, `S = (K + Kᵀ)/2`, formed in interval arithmetic.
//! 2. Interval Cholesky of `M`; every pivot (before the square root) must have
//!    a strictly positive lower bound ⇒ `M ≻ 0` ⇒ `‖Kx‖ ≥ σ‖x‖`.
//! 3. `r = f − Kũ` in interval arithmetic, `ρ = ‖r‖₂` rounded up.
//! 4. `bound = ρ/σ` rounded up; `rel = bound / ‖ũ‖₂` rounded up.
//!
//! `σ` is chosen heuristically by `certify_linear_system_auto`; soundness does
//! not depend on the choice.

use super::interval::Interval;
use serde::{Deserialize, Serialize};

/// Largest system the dense O(n³) interval Cholesky accepts.
pub const MAX_CERTIFY_N: usize = 3000;

/// Outcome of a certification attempt. `Certified` means: the exact real
/// solution `u*` of `K u = f` exists, is unique, and `‖u* − ũ‖₂ ≤ abs_bound`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Certificate {
    Certified {
        /// Upper bound on ‖u* − ũ‖₂ (rounded up).
        abs_bound: f64,
        /// Upper bound on ‖u* − ũ‖₂ / ‖ũ‖₂ (rounded up). 0 when the bound is
        /// 0; +∞ (serialized as null) when ũ = 0 but the bound is not.
        rel_bound: f64,
        /// The σ > 0 for which S − σI was certified positive definite
        /// (0 only for the vacuous n = 0 system).
        sigma: f64,
        /// Upper bound on ‖f − Kũ‖₂.
        residual_norm: f64,
    },
    Uncertified { reason: String },
}

impl Certificate {
    pub fn is_certified(&self) -> bool {
        matches!(self, Certificate::Certified { .. })
    }

    pub fn abs_bound(&self) -> Option<f64> {
        match self {
            Certificate::Certified { abs_bound, .. } => Some(*abs_bound),
            _ => None,
        }
    }

    pub(crate) fn uncertified(reason: impl Into<String>) -> Self {
        Certificate::Uncertified { reason: reason.into() }
    }
}

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

#[inline]
fn down(x: f64) -> f64 {
    x.next_down()
}

/// Certify `ũ = u` for `K u = f` (K row-major n×n) with the given σ.
pub fn certify_linear_system(k: &[f64], n: usize, f: &[f64], u: &[f64], sigma: f64) -> Certificate {
    let fi: Vec<Interval> = f.iter().map(|&x| Interval::point(x)).collect();
    certify_linear_system_interval_rhs(k, n, &fi, u, sigma)
}

/// As `certify_linear_system`, with `f` known only as an interval vector
/// (e.g. `f_F − K_FR·u_R` evaluated in interval arithmetic). The bound then
/// holds for the exact solution with every real `f` inside the intervals.
pub fn certify_linear_system_interval_rhs(
    k: &[f64],
    n: usize,
    f: &[Interval],
    u: &[f64],
    sigma: f64,
) -> Certificate {
    if let Err(reason) = check_inputs(k, n, f, u) {
        return Certificate::uncertified(reason);
    }
    if n == 0 {
        return Certificate::Certified { abs_bound: 0.0, rel_bound: 0.0, sigma: 0.0, residual_norm: 0.0 };
    }
    if !(sigma > 0.0 && sigma.is_finite()) {
        return Certificate::uncertified(format!("sigma must be positive and finite, got {sigma}"));
    }
    if let Err(reason) = certify_shifted_spd(k, n, sigma) {
        return Certificate::uncertified(reason);
    }
    finish(k, n, f, u, sigma)
}

/// Certify with σ chosen heuristically: 0.9·λ̂ where λ̂ estimates λ_min(S)
/// by inverse iteration on the f64 Cholesky factor of S, backing off to
/// 0.5, 0.1, 0.01 × λ̂ if the interval Cholesky cannot certify S − σI ≻ 0.
pub fn certify_linear_system_auto(k: &[f64], n: usize, f: &[f64], u: &[f64]) -> Certificate {
    let fi: Vec<Interval> = f.iter().map(|&x| Interval::point(x)).collect();
    certify_linear_system_auto_interval_rhs(k, n, &fi, u)
}

/// `certify_linear_system_auto` with an interval right-hand side.
pub fn certify_linear_system_auto_interval_rhs(k: &[f64], n: usize, f: &[Interval], u: &[f64]) -> Certificate {
    if let Err(reason) = check_inputs(k, n, f, u) {
        return Certificate::uncertified(reason);
    }
    if n == 0 {
        return Certificate::Certified { abs_bound: 0.0, rel_bound: 0.0, sigma: 0.0, residual_norm: 0.0 };
    }
    match certify_sigma_auto(k, n) {
        Ok(sigma) => finish(k, n, f, u, sigma),
        Err(reason) => Certificate::uncertified(reason),
    }
}

/// A σ > 0 with `S − σI` certified positive definite (interval Cholesky), σ
/// chosen as in `certify_linear_system_auto`. `k` must be n×n and finite.
pub fn certify_sigma_auto(k: &[f64], n: usize) -> Result<f64, String> {
    let lambda = estimate_lambda_min(k, n)?;
    let mut last_err = String::new();
    for factor in [0.9, 0.5, 0.1, 0.01] {
        let sigma = factor * lambda;
        if !(sigma > 0.0 && sigma.is_finite()) {
            break;
        }
        match shifted_cholesky(k, n, sigma) {
            Ok(()) => return Ok(sigma),
            Err(fail) => {
                last_err = fail.message;
                // Performance heuristic only (never affects soundness): when the
                // failing pivot's enclosure is wider than λ̂ itself, the failure
                // is interval overestimation, not σ, and backing off won't help.
                if fail.pivot_width > lambda {
                    break;
                }
            }
        }
    }
    Err(format!("could not certify S − σI positive definite (λ̂ = {lambda:.3e}): {last_err}"))
}

/// Residual certificate for `K ũ = f` given a σ that the caller has ALREADY
/// certified (`S − σI ≻ 0`, e.g. by `certify_sigma_auto` on this same `k`).
/// Used to certify several right-hand sides against one stiffness.
pub(crate) fn certify_with_certified_sigma(k: &[f64], n: usize, f: &[Interval], u: &[f64], sigma: f64) -> Certificate {
    if let Err(reason) = check_inputs(k, n, f, u) {
        return Certificate::uncertified(reason);
    }
    if n == 0 {
        return Certificate::Certified { abs_bound: 0.0, rel_bound: 0.0, sigma: 0.0, residual_norm: 0.0 };
    }
    if !(sigma > 0.0 && sigma.is_finite()) {
        return Certificate::uncertified(format!("sigma must be positive and finite, got {sigma}"));
    }
    finish(k, n, f, u, sigma)
}

fn check_inputs(k: &[f64], n: usize, f: &[Interval], u: &[f64]) -> Result<(), String> {
    if n > MAX_CERTIFY_N {
        return Err(format!("too large: n = {n} exceeds the dense certification cap {MAX_CERTIFY_N}"));
    }
    if k.len() != n * n || f.len() != n || u.len() != n {
        return Err(format!(
            "dimension mismatch: k.len()={}, f.len()={}, u.len()={}, n={n}",
            k.len(), f.len(), u.len()
        ));
    }
    if !k.iter().all(|x| x.is_finite()) {
        return Err("non-finite entry in K".into());
    }
    if !f.iter().all(|x| x.is_finite()) {
        return Err("non-finite entry in f".into());
    }
    if !u.iter().all(|x| x.is_finite()) {
        return Err("non-finite entry in ũ".into());
    }
    Ok(())
}

/// Residual, bound and relative bound once S − σI ≻ 0 is certified.
fn finish(k: &[f64], n: usize, f: &[Interval], u: &[f64], sigma: f64) -> Certificate {
    // r = f − K ũ in interval arithmetic
    let mut rho2 = 0.0f64;
    for i in 0..n {
        let row = &k[i * n..(i + 1) * n];
        let mut acc = f[i];
        for j in 0..n {
            acc = acc - Interval::point(row[j]) * Interval::point(u[j]);
        }
        if !acc.is_finite() {
            return Certificate::uncertified(format!("non-finite residual at row {i}"));
        }
        let m = acc.mag();
        rho2 = up(rho2 + up(m * m));
    }
    let rho = up(rho2.sqrt());
    let abs_bound = up(rho / sigma);
    if !abs_bound.is_finite() {
        return Certificate::uncertified("non-finite residual norm or bound");
    }
    // ‖ũ‖₂ rounded down, so bound/‖ũ‖ rounded up is an upper bound.
    let mut un2 = 0.0f64;
    for &x in u {
        un2 = down(un2 + down(x * x)).max(0.0);
    }
    let unorm = down(un2.sqrt()).max(0.0);
    let rel_bound = if abs_bound == 0.0 {
        0.0
    } else if unorm > 0.0 {
        up(abs_bound / unorm)
    } else {
        f64::INFINITY
    };
    Certificate::Certified { abs_bound, rel_bound, sigma, residual_norm: rho }
}

/// Interval Cholesky of M = S − σI. Ok iff every pivot interval has a strictly
/// positive lower bound (and every intermediate is finite).
pub fn certify_shifted_spd(k: &[f64], n: usize, sigma: f64) -> Result<(), String> {
    shifted_cholesky(k, n, sigma).map_err(|f| f.message)
}

struct ShiftFail {
    message: String,
    /// Width of the failing pivot interval (+∞ for non-finite failures).
    pivot_width: f64,
}

impl From<String> for ShiftFail {
    fn from(message: String) -> Self {
        ShiftFail { message, pivot_width: f64::INFINITY }
    }
}

fn shifted_cholesky(k: &[f64], n: usize, sigma: f64) -> Result<(), ShiftFail> {
    // Packed lower triangle, row i at offset i(i+1)/2. Entry (i, j), j ≤ i,
    // first holds M_ij, then is overwritten by L_ij.
    let off = |i: usize| i * (i + 1) / 2;
    let mut l: Vec<Interval> = Vec::with_capacity(off(n));
    let s = Interval::point(sigma);
    for i in 0..n {
        for j in 0..i {
            let m = (Interval::point(k[i * n + j]) + Interval::point(k[j * n + i])).div_scalar(2.0);
            l.push(m);
        }
        l.push(Interval::point(k[i * n + i]) - s);
    }
    // Row-oriented (Cholesky–Banachiewicz): row i uses rows j < i, already final.
    for i in 0..n {
        let oi = off(i);
        for j in 0..=i {
            let oj = off(j);
            if i == j {
                // pivot: M_ii − Σ L_ip²  (square is the tighter enclosure)
                let mut d = l[oi + i];
                for p in 0..i {
                    d = d - l[oi + p].square();
                }
                if !d.is_finite() {
                    return Err(format!("non-finite pivot at DOF {i}").into());
                }
                if !(d.lo > 0.0) {
                    return Err(ShiftFail {
                        message: format!(
                            "pivot {i} not certified positive at σ = {sigma:.3e} (interval [{:.3e}, {:.3e}])",
                            d.lo, d.hi
                        ),
                        pivot_width: d.hi - d.lo,
                    });
                }
                l[oi + i] = d.sqrt();
            } else {
                let mut acc = l[oi + j];
                for p in 0..j {
                    acc = acc - l[oi + p] * l[oj + p];
                }
                let v = acc.div(l[oj + j]);
                if !v.is_finite() {
                    return Err(format!("non-finite Cholesky entry ({i}, {j})").into());
                }
                l[oi + j] = v;
            }
        }
    }
    Ok(())
}

/// Heuristic estimate λ̂ of λ_min(S) (S = (K+Kᵀ)/2) by inverse iteration on the
/// f64 Cholesky factor of S. Err if S is not numerically positive definite.
pub fn estimate_lambda_min(k: &[f64], n: usize) -> Result<f64, String> {
    use crate::linalg::{back_solve, cholesky_decompose, forward_solve};
    let mut s = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            s[i * n + j] = 0.5 * (k[i * n + j] + k[j * n + i]);
        }
    }
    let s_orig = s.clone();
    if !cholesky_decompose(&mut s, n) {
        return Err(
            "stiffness matrix is not positive definite (f64 Cholesky of (K+Kᵀ)/2 failed): \
             mechanism or unstable structure"
                .into(),
        );
    }
    // Deterministic, non-degenerate start vector.
    let mut x: Vec<f64> = (0..n).map(|i| 1.0 + ((i * 7919) % 101) as f64 / 101.0).collect();
    normalize(&mut x);
    let mut mu = 0.0;
    for _ in 0..30 {
        let y = back_solve(&s, &forward_solve(&s, &x, n), n);
        mu = dot(&x, &y); // xᵀ S⁻¹ x with ‖x‖ = 1
        x = y;
        if !normalize(&mut x) {
            return Err("inverse iteration produced a non-finite vector".into());
        }
    }
    // Rayleigh quotient of S at the final vector; both estimates are ≥ λ_min
    // in exact arithmetic, take the smaller.
    let mut sx = vec![0.0; n];
    for i in 0..n {
        sx[i] = dot(&s_orig[i * n..(i + 1) * n], &x);
    }
    let rq = dot(&x, &sx);
    let inv = if mu > 0.0 { 1.0 / mu } else { f64::INFINITY };
    let lambda = if rq > 0.0 { rq.min(inv) } else { inv };
    if lambda > 0.0 && lambda.is_finite() {
        Ok(lambda)
    } else {
        Err(format!("λ_min estimate not positive (λ̂ = {lambda:e})"))
    }
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn normalize(x: &mut [f64]) -> bool {
    let nrm = dot(x, x).sqrt();
    if !(nrm > 0.0 && nrm.is_finite()) {
        return false;
    }
    for v in x.iter_mut() {
        *v /= nrm;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_exact_solution() {
        let k = vec![2.0, 0.0, 0.0, 2.0];
        let c = certify_linear_system(&k, 2, &[2.0, 4.0], &[1.0, 2.0], 1.0);
        assert!(c.abs_bound().unwrap() < 1e-14, "{c:?}"); // exact, up to outward-rounding slack
    }

    #[test]
    fn perturbed_solution_bound_holds() {
        // K = [[4,1],[1,3]], f = [1,2] → u* = [1/11, 7/11]
        let k = vec![4.0, 1.0, 1.0, 3.0];
        let f = [1.0, 2.0];
        let ustar = [1.0 / 11.0, 7.0 / 11.0];
        let ut = [ustar[0] + 1e-6, ustar[1] - 2e-6];
        let c = certify_linear_system_auto(&k, 2, &f, &ut);
        let b = c.abs_bound().expect("certified");
        let err = ((ut[0] - ustar[0]).powi(2) + (ut[1] - ustar[1]).powi(2)).sqrt();
        assert!(err <= b && b < 1e-4, "err {err} bound {b}");
    }

    #[test]
    fn sigma_too_large_rejected() {
        // λ_min(S) = 1; σ = 1.5 must not certify.
        let k = vec![1.0, 0.0, 0.0, 5.0];
        let c = certify_linear_system(&k, 2, &[1.0, 1.0], &[1.0, 0.2], 1.5);
        assert!(!c.is_certified());
    }

    #[test]
    fn singular_rejected() {
        let k = vec![1.0, -1.0, -1.0, 1.0];
        assert!(!certify_linear_system_auto(&k, 2, &[0.0, 0.0], &[0.0, 0.0]).is_certified());
        assert!(!certify_linear_system(&k, 2, &[0.0, 0.0], &[0.0, 0.0], 1e-300).is_certified());
    }

    #[test]
    fn indefinite_rejected() {
        let k = vec![1.0, 0.0, 0.0, -1.0];
        assert!(!certify_linear_system_auto(&k, 2, &[1.0, 1.0], &[1.0, -1.0]).is_certified());
        assert!(!certify_linear_system(&k, 2, &[1.0, 1.0], &[1.0, -1.0], 1e-3).is_certified());
    }

    #[test]
    fn nonsymmetric_k_uses_symmetric_part() {
        // S = [[2,0],[0,2]] even though K is not symmetric.
        let k = vec![2.0, 1.0, -1.0, 2.0];
        // K u = f with u = [1,1] → f = [3,1]
        let c = certify_linear_system(&k, 2, &[3.0, 1.0], &[1.0, 1.0], 1.9);
        assert!(c.abs_bound().unwrap() < 1e-14, "{c:?}"); // exact, up to outward-rounding slack
    }

    #[test]
    fn too_large_and_bad_input() {
        let n = MAX_CERTIFY_N + 1;
        match certify_linear_system(&[], n, &[], &[], 1.0) {
            Certificate::Uncertified { reason } => assert!(reason.contains("too large")),
            c => panic!("{c:?}"),
        }
        let c = certify_linear_system(&[1.0], 1, &[f64::NAN], &[1.0], 0.5);
        assert!(!c.is_certified());
    }
}
