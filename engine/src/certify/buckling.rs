//! Certified enclosure of the critical load factor of linear buckling,
//! `K φ = λ N φ` with `N = −K_G` (the matrices `solve_buckling_{2d,3d}` build).
//!
//! The stability matrix `A(λ) = K − λ N` is affine in λ. The critical load factor
//! is where it stops being positive definite:
//! `λ_cr = sup { λ ≥ 0 : A(λ') ≻ 0 for all 0 ≤ λ' ≤ λ }`.
//!
//! * Lower bound: if `A(0) ≻ 0` and `A(λ̲) ≻ 0` (both certified by the sparse Gram
//!   residual + Gershgorin check, `sparse.rs`), then every `A(λ)` on `[0, λ̲]` is a
//!   convex combination of the two and is positive definite, so `λ_cr ≥ λ̲`.
//! * Upper bound: for the computed mode φ, `φᵀ A(λ̄) φ = φᵀKφ − λ̄ φᵀNφ ≤ 0` with
//!   `λ̄ = φᵀKφ / φᵀNφ` (interval-evaluated, rounded up), so `A(λ̄)` is not positive
//!   definite and `λ_cr ≤ λ̄`.
//!
//! The certificate is about the f64 `K` and `K_G` as assembled (with `K_G` from
//! the computed linear axial forces), not about rounding-free versions of them.
//! With constraints it is about the reduced pencil `(Cᵀ K C, Cᵀ N C)` the solver
//! solves, both matrices enclosed entrywise in intervals (`constrained.rs`).

use serde::{Deserialize, Serialize};

use super::constrained::{reduce_symmetric_enclosed, ConstraintMap};
use super::interval::Interval;
use super::solver::{gather_u_2d, gather_u_3d};
use super::sparse::certify_lambda_min_lower;
use crate::linalg::sparse::CscMatrix;
use crate::solver::assembly::{rotate_inclined_f_2d, rotate_inclined_f_3d};
use crate::solver::constraints::{build_constraint_transform, inclined_dofs_2d, inclined_dofs_3d};
use crate::solver::buckling::{
    buckling_system_2d, buckling_system_3d, solve_buckling_2d, solve_buckling_3d, BucklingResult,
    BucklingResult3D,
};
use crate::types::*;

/// Outcome of certifying the critical load factor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum BucklingCertificate {
    Certified {
        /// The structure is certified stable (K − λN ≻ 0) for all 0 ≤ λ ≤ lambda_lower.
        lambda_lower: f64,
        /// K − λN is certified not positive definite at λ = lambda_upper
        /// (None when the computed mode gave no usable Rayleigh quotient).
        lambda_upper: Option<f64>,
        /// The solver's computed critical load factor.
        lambda_computed: f64,
    },
    Uncertified {
        /// English, for logs; the UI translates `refusal` when present.
        reason: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        refusal: Option<BucklingRefusal>,
    },
}

/// A refusal the UI can state in the reader's language; its `code` is stable across releases.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum BucklingRefusal {
    ComputedAboveUpperBound { lambda_computed: f64, lambda_upper: f64 },
}

impl super::finite::Guarded for BucklingCertificate {
    fn claims(&self) -> bool {
        self.is_certified()
    }
    fn downgrade(&mut self, reason: String) {
        *self = BucklingCertificate::uncertified(reason);
    }
}

impl BucklingCertificate {
    fn uncertified(reason: impl Into<String>) -> Self {
        BucklingCertificate::Uncertified { reason: reason.into(), refusal: None }
    }

    pub fn is_certified(&self) -> bool {
        matches!(self, BucklingCertificate::Certified { .. })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedBuckling2D {
    pub results: BucklingResult,
    pub certificate: BucklingCertificate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedBuckling3D {
    pub results: BucklingResult3D,
    pub certificate: BucklingCertificate,
}

/// Solve 2D linear buckling and certify the first critical load factor.
pub fn certify_buckling_2d(input: &SolverInput, num_modes: usize) -> Result<CertifiedBuckling2D, String> {
    super::finite::check_input(input)?;
    let results = solve_buckling_2d(input, num_modes.max(1))?;
    super::finite::check_results(&results)?;
    let sys = buckling_system_2d(input)?;
    let mode = &results.modes[0];
    let certificate = match gather_u_2d(&sys.dof_num, &mode.displacements) {
        Ok(mut phi) => {
            // The published mode is in global axes; K and Kg are in the
            // inclined-roller frames.
            for it in &sys.inclined_transforms_2d {
                rotate_inclined_f_2d(&mut phi, &it.dofs, &it.r);
            }
            let phi = &phi[..sys.dof_num.n_free];
            if input.constraints.is_empty() {
                certify_critical_factor(&sys.k_ff, &sys.neg_kg_csc, mode.load_factor, phi)
            } else {
                match build_constraint_transform(&input.constraints, &sys.dof_num, Some(&input.nodes), None, &inclined_dofs_2d(input, &sys.dof_num)) {
                    Err(e) => BucklingCertificate::uncertified(e),
                    Ok(ct) => { let cm = ConstraintMap::from_transform(&ct, sys.dof_num.n_free);
                certify_constrained_factor(&sys.k_ff, &sys.neg_kg_csc, &cm, mode.load_factor, phi) }
                }
            }
        }
        Err(c) => BucklingCertificate::uncertified(format!("mode shape: {c:?}")),
    };
    let mut certificate = certificate;
    super::finite::guard(&mut certificate);
    Ok(CertifiedBuckling2D { results, certificate })
}

/// Solve 3D linear buckling and certify the first critical load factor.
pub fn certify_buckling_3d(input: &SolverInput3D, num_modes: usize) -> Result<CertifiedBuckling3D, String> {
    super::finite::check_input(input)?;
    let results = solve_buckling_3d(input, num_modes.max(1))?;
    super::finite::check_results(&results)?;
    let sys = buckling_system_3d(input)?;
    let mode = &results.modes[0];
    let certificate = match gather_u_3d(&sys.dof_num, &mode.displacements) {
        Ok(mut phi) => {
            // Global axes to the inclined-support frames of K and Kg.
            for it in &sys.inclined_transforms {
                rotate_inclined_f_3d(&mut phi, &it.dofs, &it.r);
            }
            let phi = &phi[..sys.dof_num.n_free];
            if input.constraints.is_empty() {
                certify_critical_factor(&sys.k_ff, &sys.neg_kg_csc, mode.load_factor, phi)
            } else {
                match build_constraint_transform(&input.constraints, &sys.dof_num, None, Some(&input.nodes), &inclined_dofs_3d(input, &sys.dof_num)) {
                    Err(e) => BucklingCertificate::uncertified(e),
                    Ok(ct) => { let cm = ConstraintMap::from_transform(&ct, sys.dof_num.n_free);
                certify_constrained_factor(&sys.k_ff, &sys.neg_kg_csc, &cm, mode.load_factor, phi) }
                }
            }
        }
        Err(c) => BucklingCertificate::uncertified(format!("mode shape: {c:?}")),
    };
    let mut certificate = certificate;
    super::finite::guard(&mut certificate);
    Ok(CertifiedBuckling3D { results, certificate })
}

/// The constrained pencil the solver reduces to, `Cᵀ K C φ_q = λ Cᵀ N C φ_q`,
/// with both reduced matrices enclosed entrywise in intervals from the f64
/// `K`, `N` and `C` (no rounded reduced matrix is trusted). `phi` is the mode
/// on the free DOFs; its independent DOFs give the reduced Rayleigh vector.
fn certify_constrained_factor(
    k: &CscMatrix,
    n_mat: &CscMatrix,
    cm: &ConstraintMap,
    lambda_hat: f64,
    phi: &[f64],
) -> BucklingCertificate {
    if cm.c.len() != k.n {
        return BucklingCertificate::uncertified("constraint map does not match K");
    }
    if cm.p == 0 {
        return BucklingCertificate::uncertified("no free independent DOFs");
    }
    let (kr, kv) = reduce_symmetric_enclosed(k, cm);
    let (nr, nv) = reduce_symmetric_enclosed(n_mat, cm);
    let q: Vec<f64> = cm.indep_dof.iter().map(|&d| phi[d]).collect();
    certify_critical_factor_enclosed(&kr, &kv, &nr, &nv, lambda_hat, &q)
}

/// Enclose the critical load factor of `K φ = λ N φ` (both symmetric, lower
/// triangle CSC of the same dimension) given the computed `lambda_hat` and
/// mode `phi`.
pub fn certify_critical_factor(k: &CscMatrix, n_mat: &CscMatrix, lambda_hat: f64, phi: &[f64]) -> BucklingCertificate {
    let points = |m: &CscMatrix| m.values.iter().map(|&x| Interval::point(x)).collect::<Vec<_>>();
    certify_critical_factor_enclosed(k, &points(k), n_mat, &points(n_mat), lambda_hat, phi)
}

/// As `certify_critical_factor` for exact real `K`, `N` known only through
/// entry enclosures `kv`, `nv` (aligned with the lower-triangle patterns of
/// `k`, `n_mat`, whose values are approximations used only for factoring).
pub fn certify_critical_factor_enclosed(
    k: &CscMatrix,
    kv: &[Interval],
    n_mat: &CscMatrix,
    nv: &[Interval],
    lambda_hat: f64,
    phi: &[f64],
) -> BucklingCertificate {
    if k.n != n_mat.n || phi.len() != k.n || kv.len() != k.values.len() || nv.len() != n_mat.values.len() {
        return BucklingCertificate::uncertified("dimension mismatch");
    }
    if !(lambda_hat > 0.0 && lambda_hat.is_finite()) {
        return BucklingCertificate::uncertified(format!("computed load factor not positive: {lambda_hat}"));
    }
    if !phi.iter().all(|x| x.is_finite()) {
        return BucklingCertificate::uncertified("non-finite mode shape");
    }
    if !kv.iter().chain(nv).all(|x| x.is_finite()) {
        return BucklingCertificate::uncertified("non-finite matrix entry");
    }
    let Some(pattern) = union_pattern(k, n_mat) else {
        return BucklingCertificate::uncertified("unsorted CSC column");
    };
    let mats = Pencil { k, kv, n_mat, nv, pattern: &pattern };

    // A(0) = K ≻ 0: needed for the lower bound and for the upper bound's meaning.
    let (a0, v0) = mats.stability_matrix(0.0);
    if let Err(reason) = certify_lambda_min_lower(&a0, &v0) {
        return BucklingCertificate::uncertified(format!("K not certified positive definite: {reason}"));
    }

    // Tightest λ̲ = λ̂(1 − δ) that certifies.
    let mut lambda_lower = None;
    let mut last = String::new();
    for delta in [1e-6, 1e-4, 1e-3, 1e-2, 0.05, 0.2, 0.5] {
        let lam = lambda_hat * (1.0 - delta);
        let (a, v) = mats.stability_matrix(lam);
        match certify_lambda_min_lower(&a, &v) {
            Ok(_) => {
                lambda_lower = Some(lam);
                break;
            }
            Err(reason) => last = reason,
        }
    }
    let Some(lambda_lower) = lambda_lower else {
        return BucklingCertificate::uncertified(format!(
            "could not certify K − λN ≻ 0 even at λ = λ̂/2 (λ̂ = {lambda_hat:.6e}): {last}"
        ));
    };

    let lambda_upper = rayleigh_upper(k, kv, n_mat, nv, phi);
    if let Some(upper) = lambda_upper {
        if lambda_hat > upper {
            return BucklingCertificate::Uncertified {
                reason: format!("computed load factor {lambda_hat} exceeds certified upper bound {upper}"),
                refusal: Some(BucklingRefusal::ComputedAboveUpperBound {
                    lambda_computed: lambda_hat,
                    lambda_upper: upper,
                }),
            };
        }
    }

    BucklingCertificate::Certified {
        lambda_lower,
        lambda_upper,
        lambda_computed: lambda_hat,
    }
}

/// `K`, `N` with entry enclosures and their union lower pattern.
struct Pencil<'a> {
    k: &'a CscMatrix,
    kv: &'a [Interval],
    n_mat: &'a CscMatrix,
    nv: &'a [Interval],
    pattern: &'a Pattern,
}

/// `λ̄ = φᵀKφ / φᵀNφ` rounded up, if φᵀNφ is certified positive.
fn rayleigh_upper(k: &CscMatrix, kv: &[Interval], n_mat: &CscMatrix, nv: &[Interval], phi: &[f64]) -> Option<f64> {
    let num = quad_form(k, kv, phi)?;
    let den = quad_form(n_mat, nv, phi)?;
    if !(den.lo > 0.0) {
        return None;
    }
    let ub = (num.hi / den.lo).next_up();
    (ub.is_finite() && ub > 0.0).then_some(ub)
}

/// Interval enclosure of φᵀAφ for symmetric A stored as its lower triangle,
/// with entry enclosures `vals`.
fn quad_form(a: &CscMatrix, vals: &[Interval], phi: &[f64]) -> Option<Interval> {
    let mut acc = Interval::ZERO;
    for j in 0..a.n {
        for p in a.col_ptr[j]..a.col_ptr[j + 1] {
            let i = a.row_idx[p];
            let t = vals[p] * Interval::point(phi[i]) * Interval::point(phi[j]);
            acc = if i == j { acc + t } else { acc + t + t };
        }
    }
    acc.is_finite().then_some(acc)
}

/// Lower-triangle union pattern of K and N: per column, sorted
/// (row, index into K or None, index into N or None).
type Pattern = Vec<Vec<(usize, Option<usize>, Option<usize>)>>;

fn union_pattern(k: &CscMatrix, n_mat: &CscMatrix) -> Option<Pattern> {
    let sorted = |m: &CscMatrix| {
        (0..m.n).all(|j| m.row_idx[m.col_ptr[j]..m.col_ptr[j + 1]].windows(2).all(|w| w[0] < w[1]))
    };
    if !sorted(k) || !sorted(n_mat) {
        return None;
    }
    let mut cols = Vec::with_capacity(k.n);
    for j in 0..k.n {
        let (mut p, pe) = (k.col_ptr[j], k.col_ptr[j + 1]);
        let (mut q, qe) = (n_mat.col_ptr[j], n_mat.col_ptr[j + 1]);
        let mut col = Vec::with_capacity(pe - p + qe - q);
        while p < pe || q < qe {
            let rk = if p < pe { k.row_idx[p] } else { usize::MAX };
            let rn = if q < qe { n_mat.row_idx[q] } else { usize::MAX };
            if rk == rn {
                col.push((rk, Some(p), Some(q)));
                p += 1;
                q += 1;
            } else if rk < rn {
                col.push((rk, Some(p), None));
                p += 1;
            } else {
                col.push((rn, None, Some(q)));
                q += 1;
            }
        }
        cols.push(col);
    }
    Some(cols)
}

impl Pencil<'_> {
    /// `A = K − λN` on the union pattern: f64 approximation (for factoring)
    /// and enclosures of the exact entries.
    fn stability_matrix(&self, lam: f64) -> (CscMatrix, Vec<Interval>) {
        let n = self.k.n;
        let mut col_ptr = Vec::with_capacity(n + 1);
        let mut row_idx = Vec::new();
        let mut values = Vec::new();
        let mut vals = Vec::new();
        col_ptr.push(0);
        for col in self.pattern {
            for &(r, pk, pn) in col {
                let kv = pk.map_or(0.0, |p| self.k.values[p]);
                let nv = pn.map_or(0.0, |q| self.n_mat.values[q]);
                let ki = pk.map_or(Interval::ZERO, |p| self.kv[p]);
                let ni = pn.map_or(Interval::ZERO, |q| self.nv[q]);
                row_idx.push(r);
                values.push(kv - lam * nv);
                vals.push(ki - Interval::point(lam) * ni);
            }
            col_ptr.push(row_idx.len());
        }
        (CscMatrix { n, col_ptr, row_idx, values }, vals)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn diag(d: &[f64]) -> CscMatrix {
        let idx: Vec<usize> = (0..d.len()).collect();
        CscMatrix::from_triplets(d.len(), &idx, &idx, d)
    }

    #[test]
    fn diagonal_pencil_encloses_smallest_ratio() {
        // λ_i = k_i / n_i = [4, 2, 10] → λ_cr = 2
        let k = diag(&[4.0, 6.0, 10.0]);
        let n = diag(&[1.0, 3.0, 1.0]);
        let phi = [0.0, 1.0, 0.0];
        let c = certify_critical_factor(&k, &n, 2.0, &phi);
        let BucklingCertificate::Certified { lambda_lower, lambda_upper, .. } = c else { panic!("{c:?}") };
        let ub = lambda_upper.unwrap();
        assert!(lambda_lower <= 2.0 && 2.0 <= ub, "[{lambda_lower}, {ub}]");
        assert!(lambda_lower > 1.99 && ub < 2.0 + 1e-12, "[{lambda_lower}, {ub}]");
    }

    /// K = diag(4, 6, 10), N = diag(1, 3, 1) with u2 = u0 tied: reduced
    /// K = diag(14, 6), N = diag(2, 3), so λ = {7, 2} and λ_cr = 2 (the free
    /// pencil's 2 as well; tying lifts the λ = 4 and 10 modes to 7).
    fn tied() -> (CscMatrix, CscMatrix, ConstraintMap) {
        let cm = ConstraintMap {
            c: vec![vec![(0, 1.0)], vec![(1, 1.0)], vec![(0, 1.0)]],
            c_r: vec![vec![]; 3],
            p: 2,
            indep_dof: vec![0, 1],
        };
        (diag(&[4.0, 6.0, 10.0]), diag(&[1.0, 3.0, 1.0]), cm)
    }

    #[test]
    fn constrained_pencil_enclosure() {
        let (k, n, cm) = tied();
        let c = certify_constrained_factor(&k, &n, &cm, 2.0, &[0.0, 1.0, 0.0]);
        let BucklingCertificate::Certified { lambda_lower, lambda_upper, .. } = c else { panic!("{c:?}") };
        let ub = lambda_upper.unwrap();
        assert!(lambda_lower <= 2.0 && 2.0 <= ub && lambda_lower > 1.99, "[{lambda_lower}, {ub}]");
        // The tie matters: with the u0 mode (λ = 14/2 = 7 reduced, 4 free) only.
        let (k2, n2) = (diag(&[4.0, 60.0, 10.0]), diag(&[1.0, 3.0, 1.0]));
        let c = certify_constrained_factor(&k2, &n2, &cm, 7.0, &[1.0, 0.0, 1.0]);
        let BucklingCertificate::Certified { lambda_lower, lambda_upper, .. } = c else { panic!("{c:?}") };
        assert!(lambda_lower <= 7.0 && 7.0 <= lambda_upper.unwrap() && lambda_lower > 6.9);
    }

    #[test]
    fn constrained_wrong_factor_and_map_refused() {
        let (k, n, cm) = tied();
        assert_refused_above_upper(certify_constrained_factor(&k, &n, &cm, 3.0, &[0.0, 1.0, 0.0]), 3.0);
        let bad = ConstraintMap { c: vec![vec![(0, 1.0)]], c_r: vec![vec![]], p: 1, indep_dof: vec![0] };
        assert!(!certify_constrained_factor(&k, &n, &bad, 2.0, &[0.0, 1.0, 0.0]).is_certified());
    }

    #[test]
    fn overestimated_factor_is_not_certified() {
        let k = diag(&[4.0, 6.0, 10.0]);
        let n = diag(&[1.0, 3.0, 1.0]);
        for factor in [3.0, 2.0 + 1e-12] {
            assert_refused_above_upper(certify_critical_factor(&k, &n, factor, &[0.0, 1.0, 0.0]), factor);
        }
    }

    fn assert_refused_above_upper(c: BucklingCertificate, factor: f64) {
        let BucklingCertificate::Uncertified {
            reason,
            refusal: Some(BucklingRefusal::ComputedAboveUpperBound { lambda_computed, lambda_upper }),
        } = &c
        else {
            panic!("{c:?}")
        };
        assert!(reason.contains("exceeds certified upper bound"), "{reason}");
        assert_eq!(*lambda_computed, factor);
        assert!(*lambda_upper < factor, "{c:?}");
        let wire = serde_json::to_value(&c).unwrap();
        assert_eq!(wire["status"], "uncertified");
        assert_eq!(wire["refusal"]["code"], "computedAboveUpperBound");
        assert_eq!(wire["refusal"]["lambdaComputed"], factor);
        assert_eq!(wire["refusal"]["lambdaUpper"], *lambda_upper);
        assert_eq!(serde_json::from_value::<BucklingCertificate>(wire).unwrap(), c);
    }

    #[test]
    fn refusal_without_a_code_serializes_without_one() {
        let wire = serde_json::to_value(BucklingCertificate::uncertified("dimension mismatch")).unwrap();
        assert_eq!(wire, serde_json::json!({ "status": "uncertified", "reason": "dimension mismatch" }));
    }
}
