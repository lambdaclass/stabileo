//! Certified P-Delta (second-order) displacements. See "P-Delta" in
//! `docs/verification/CERTIFY.md`.
//!
//! The P-Delta solver iterates `(K + K_G(u)) u = f` with the geometric stiffness
//! built from axial forces read back from the displacements. In the affine form
//! `K_G(u) = Σ_e N_e(u) G_e`, `N_e(u) = e·a·(δ_e(u)/l − α·ΔT)` (`KgAffineTerm`),
//! the free equations are the quadratic map
//!
//! `F(x) = [(K + K_G(u)) u − f]_F`,  `u = [x; u_R]`,
//!
//! and for `x = ũ + δ` exactly `F(ũ + δ) = F(ũ) + J δ + q(δ, δ)` with
//! `J = (K + K_G(ũ))_FF + Σ_e c_e (G_e ũ)_F t_eᵀ` (`c_e = e·a/l`, `t_e` the
//! elongation coefficients) and `q(x, y) = Σ_e c_e (t_eᵀx) (G_e y)_F`.
//!
//! Certificate (Newton–Kantorovich for a quadratic map, see the doc):
//! * `xᵀ J x ≥ μ‖x‖²` — `sym(J)` enclosed entrywise, Gram residual + Gershgorin,
//!   so `‖J⁻¹‖ ≤ 1/μ`;
//! * `‖J⁻¹F(ũ)‖₂ ≤ η = ‖d‖ + ‖F(ũ) − J d‖/μ` for any f64 Newton step `d`
//!   (interval residual; `ρ ≥ ‖F(ũ)‖₂` is reported too);
//! * `‖q(x, y)‖₂ ≤ β‖x‖‖y‖` — `β = max_d Σ_{e∋d} |c_e|‖t_e‖‖G_e‖_F`, `γ = β/μ`.
//!
//! If `4γη < 1`, the model has exactly one solution `u*` with
//! `‖u*_F − ũ_F‖ < 1/(2γ)`, and `‖u*_F − ũ_F‖ ≤ r = 2η/(1 + √(1 − 4γη))`.
//! Optionally `λ_min(sym(K + K_G(ũ))) ≥ μ_A` gives `K + K_G(u*) ≻ 0` when
//! `μ_A − βr > 0` (certified second-order stability of the exact solution).
//!
//! The model is the f64 sparse-assembled `K` and `f` (the triplet assembly the
//! solver's sparse path iterates on) and the f64 element data of the terms,
//! all taken as exact. The solver's iterate `ũ` is only a candidate: an
//! iteration-limited or loosely converged answer gets a correspondingly larger
//! bound on its distance to the true fixed point.

// `!(x > 0.0)` is deliberate throughout: it also rejects NaN.
#![allow(clippy::neg_cmp_op_on_partial_ord)]

use std::collections::BTreeMap;
use std::rc::Rc;

use serde::{Deserialize, Serialize};

use super::interval::Interval;
use super::solver::{gather_u_2d, gather_u_3d};
use super::sparse::certify_lambda_min_lower;
use crate::linalg::sparse::CscMatrix;
use crate::linalg::sparse_chol::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky};
use crate::solver::assembly::{assemble_load_vector_2d, assemble_sparse_3d};
use crate::solver::dof::DofNumbering;
use crate::solver::geometric_stiffness::{geometric_stiffness_terms_2d, geometric_stiffness_terms_3d, KgAffineTerm};
use crate::solver::linear::expand_curved_beams_3d;
use crate::solver::pdelta::{solve_pdelta_2d, solve_pdelta_3d, PDeltaResult, PDeltaResult3D};
use crate::solver::sparse_assembly::assemble_stiffness_sparse_2d;
use crate::types::*;

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

#[inline]
fn down(x: f64) -> f64 {
    x.next_down()
}

/// Outcome of certifying a P-Delta solution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum PDeltaCertificate {
    Certified {
        /// `‖u*_F − ũ_F‖₂ ≤ abs_bound` for the exact solution `u*` of the model.
        abs_bound: f64,
        /// `abs_bound / ‖ũ_F‖₂` rounded up (+∞ when ũ_F = 0 and the bound is not 0).
        rel_bound: f64,
        /// `u*` is the only solution of the model with `‖u_F − ũ_F‖₂ <` this
        /// (+∞ when the model is linear, β = 0).
        uniqueness_radius: f64,
        /// Certified `λ_min(sym J(ũ)) ≥ mu > 0` (J the exact Jacobian at ũ).
        mu: f64,
        /// `‖q(x, y)‖₂ ≤ beta·‖x‖‖y‖` for the quadratic remainder.
        beta: f64,
        /// Upper bound on `‖F(ũ)‖₂`.
        residual_norm: f64,
        /// Upper bound on the Newton step `‖J(ũ)⁻¹F(ũ)‖₂`.
        newton_step: f64,
        /// `λ_min(K + K_G(u*)) ≥ stability_margin > 0` when certified (the exact
        /// second-order state is stable); None when not certified.
        stability_margin: Option<f64>,
    },
    Uncertified { reason: String },
}

impl PDeltaCertificate {
    fn uncertified(reason: impl Into<String>) -> Self {
        PDeltaCertificate::Uncertified { reason: reason.into() }
    }

    pub fn is_certified(&self) -> bool {
        matches!(self, PDeltaCertificate::Certified { .. })
    }

    pub fn abs_bound(&self) -> Option<f64> {
        match self {
            PDeltaCertificate::Certified { abs_bound, .. } => Some(*abs_bound),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedPDelta2D {
    pub results: PDeltaResult,
    pub certificate: PDeltaCertificate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedPDelta3D {
    pub results: PDeltaResult3D,
    pub certificate: PDeltaCertificate,
}

/// Solve 2D P-Delta and certify the returned displacements.
pub fn certify_pdelta_2d(input: &SolverInput, max_iter: usize, tolerance: f64) -> Result<CertifiedPDelta2D, String> {
    let results = solve_pdelta_2d(input, max_iter, tolerance)?;
    let certificate = certify_pdelta_results_2d(input, &results.results);
    Ok(CertifiedPDelta2D { results, certificate })
}

/// Solve 3D P-Delta and certify the returned displacements.
pub fn certify_pdelta_3d(input: &SolverInput3D, max_iter: usize, tolerance: f64) -> Result<CertifiedPDelta3D, String> {
    let results = solve_pdelta_3d(input, max_iter, tolerance)?;
    let certificate = certify_pdelta_results_3d(input, &results.results);
    Ok(CertifiedPDelta3D { results, certificate })
}

/// Certify given P-Delta displacements of `input` (any candidate works).
pub fn certify_pdelta_results_2d(input: &SolverInput, results: &AnalysisResults) -> PDeltaCertificate {
    if !input.constraints.is_empty() {
        return PDeltaCertificate::uncertified("unsupported: constraints");
    }
    let dof_num = DofNumbering::build_2d(input);
    let stiff = assemble_stiffness_sparse_2d(input, &dof_num);
    if !stiff.inclined_transforms_2d.is_empty() {
        return PDeltaCertificate::uncertified("unsupported: inclined supports");
    }
    let f = assemble_load_vector_2d(input, &input.loads, &dof_num, &[]);
    let terms = geometric_stiffness_terms_2d(input, &dof_num);
    match gather_u_2d(&dof_num, &results.displacements) {
        Ok(u) => certify_pdelta_system(&stiff.k_full, dof_num.n_free, &f, &terms, &u),
        Err(c) => PDeltaCertificate::uncertified(format!("displacements: {c:?}")),
    }
}

/// Certify given 3D P-Delta displacements of `input`.
pub fn certify_pdelta_results_3d(input: &SolverInput3D, results: &AnalysisResults3D) -> PDeltaCertificate {
    let input = &expand_curved_beams_3d(input);
    if !input.constraints.is_empty() {
        return PDeltaCertificate::uncertified("unsupported: constraints");
    }
    let dof_num = DofNumbering::build_3d(input);
    let asm = assemble_sparse_3d(input, &dof_num, true);
    if !asm.inclined_transforms.is_empty() {
        return PDeltaCertificate::uncertified("unsupported: inclined supports");
    }
    let Some(k_full) = asm.k_full.as_ref() else {
        return PDeltaCertificate::uncertified("sparse assembly did not build the full K");
    };
    let terms = geometric_stiffness_terms_3d(input, &dof_num);
    match gather_u_3d(&dof_num, &results.displacements) {
        Ok(u) => certify_pdelta_system(k_full, dof_num.n_free, &asm.f, &terms, &u),
        Err(c) => PDeltaCertificate::uncertified(format!("displacements: {c:?}")),
    }
}

/// Interval quantities of one term at ũ.
struct TermAt {
    /// N_e(ũ).
    n: Interval,
    /// c_e = e·a/l.
    c: Interval,
    /// (G_e ũ)_a for every local row a.
    gu: Vec<Interval>,
    /// Elongation coefficients summed per free DOF.
    t_free: Vec<(usize, Interval)>,
}

/// Certify `ũ` (full vector, free DOFs first) for the P-Delta model with the
/// lower-triangle full stiffness `k_full`, load `f` and affine geometric terms.
pub fn certify_pdelta_system(
    k_full: &CscMatrix,
    nf: usize,
    f: &[f64],
    terms: &[KgAffineTerm],
    u: &[f64],
) -> PDeltaCertificate {
    let n = k_full.n;
    if f.len() != n || u.len() != n || nf > n || k_full.col_ptr.len() != n + 1 {
        return PDeltaCertificate::uncertified("dimension mismatch");
    }
    if nf == 0 {
        return PDeltaCertificate::uncertified("no free DOFs");
    }
    if !k_full.values.iter().chain(f).all(|x| x.is_finite()) {
        return PDeltaCertificate::uncertified("non-finite entry in K or f");
    }
    if !u.iter().all(|x| x.is_finite()) {
        return PDeltaCertificate::uncertified("non-finite displacement");
    }
    for t in terms {
        let nd = t.dofs.len();
        let finite = [t.e, t.a, t.l, t.alpha, t.dt].iter().chain(&t.g).all(|x| x.is_finite())
            && t.elongation.iter().all(|(_, c)| c.is_finite());
        if t.g.len() != nd * nd
            || t.dofs.iter().chain(t.elongation.iter().map(|(d, _)| d)).any(|&d| d >= n)
            || !finite
            || !(t.l > 0.0)
        {
            return PDeltaCertificate::uncertified(format!("malformed geometric term of element {}", t.element_id));
        }
    }

    let at: Vec<TermAt> = terms.iter().map(|t| term_at(t, u, nf)).collect();
    if at.iter().any(|a| !a.n.is_finite() || !a.c.is_finite() || !a.gu.iter().all(|x| x.is_finite())) {
        return PDeltaCertificate::uncertified("non-finite axial force or geometric term");
    }

    // ρ ≥ ‖F(ũ)‖₂.
    let mut r: Vec<Interval> = f[..nf].iter().map(|&x| Interval::point(-x)).collect();
    for j in 0..n {
        for p in k_full.col_ptr[j]..k_full.col_ptr[j + 1] {
            let i = k_full.row_idx[p];
            let v = Interval::point(k_full.values[p]);
            if i < nf {
                r[i] = r[i] + v * Interval::point(u[j]);
            }
            if i != j && j < nf {
                r[j] = r[j] + v * Interval::point(u[i]);
            }
        }
    }
    for (t, a) in terms.iter().zip(&at) {
        for (k, &d) in t.dofs.iter().enumerate() {
            if d < nf {
                r[d] = r[d] + a.n * a.gu[k];
            }
        }
    }
    let Some(rho) = norm_up(&r) else {
        return PDeltaCertificate::uncertified("non-finite residual");
    };

    // sym(K + K_G(ũ))_FF and sym(J) on the lower triangle.
    let mut a_map: SymMap = BTreeMap::new();
    for j in 0..nf {
        for p in k_full.col_ptr[j]..k_full.col_ptr[j + 1] {
            let i = k_full.row_idx[p];
            if i < nf {
                add_sym(&mut a_map, i, j, Interval::point(k_full.values[p]));
            }
        }
    }
    let half = Interval::point(0.5);
    for (t, a) in terms.iter().zip(&at) {
        let nd = t.dofs.len();
        for (x, &dx) in t.dofs.iter().enumerate() {
            for (y, &dy) in t.dofs.iter().enumerate() {
                if dx >= nf || dy >= nf || t.g[x * nd + y] == 0.0 {
                    continue;
                }
                let v = a.n * Interval::point(t.g[x * nd + y]);
                add_sym(&mut a_map, dx, dy, if dx == dy { v } else { v * half });
            }
        }
    }
    let mut j_map = a_map.clone();
    for (t, a) in terms.iter().zip(&at) {
        for (x, &dx) in t.dofs.iter().enumerate() {
            if dx >= nf {
                continue;
            }
            for &(dy, ty) in &a.t_free {
                let v = a.c * a.gu[x] * ty;
                add_sym(&mut j_map, dx, dy, if dx == dy { v } else { v * half });
            }
        }
    }
    let (jm, jv) = to_csc(nf, &j_map);
    if !jv.iter().all(|v| v.is_finite()) {
        return PDeltaCertificate::uncertified("non-finite Jacobian entry");
    }
    let mu = match certify_lambda_min_lower(&jm, &jv) {
        Ok(mu) => mu,
        Err(reason) => {
            return PDeltaCertificate::uncertified(format!("Jacobian not certified coercive: {reason}"));
        }
    };

    // β with ‖q(x, y)‖ ≤ β‖x‖‖y‖ (Cauchy–Schwarz with weights w_e).
    let mut load = vec![0.0f64; nf];
    for (t, a) in terms.iter().zip(&at) {
        let nd = t.dofs.len();
        let tn2 = a.t_free.iter().fold(0.0f64, |s, (_, c)| up(s + up(c.mag() * c.mag())));
        let mut gn2 = 0.0f64;
        for (x, &dx) in t.dofs.iter().enumerate() {
            for (y, &dy) in t.dofs.iter().enumerate() {
                if dx < nf && dy < nf {
                    let g = t.g[x * nd + y];
                    gn2 = up(gn2 + up(g * g));
                }
            }
        }
        let w = up(up(a.c.mag() * up(tn2.sqrt())) * up(gn2.sqrt()));
        if w == 0.0 {
            continue;
        }
        for &d in &t.dofs {
            if d < nf {
                load[d] = up(load[d] + w);
            }
        }
    }
    let beta = load.iter().fold(0.0f64, |m, &x| m.max(x));
    if !beta.is_finite() {
        return PDeltaCertificate::uncertified("non-finite quadratic bound β");
    }

    // η ≥ ‖J⁻¹F(ũ)‖: any f64 Newton step d, plus ‖F(ũ) − J d‖/μ (rigorous).
    let d = newton_step(&jm, &r, |x| jac_mul_f64(k_full, nf, terms, &at, x));
    let jd = jac_mul_interval(k_full, nf, terms, &at, &d);
    let e: Vec<Interval> = r.iter().zip(&jd).map(|(a, b)| *a - *b).collect();
    let (Some(dn), Some(en)) = (norm_up(&d.iter().map(|&x| Interval::point(x)).collect::<Vec<_>>()), norm_up(&e))
    else {
        return PDeltaCertificate::uncertified("non-finite Newton step");
    };
    let eta = up(dn + up(en / mu));
    let gamma = up(beta / mu);
    let Some((radius, uniqueness_radius)) = kantorovich_radius(1.0, gamma, eta) else {
        return PDeltaCertificate::uncertified(format!(
            "Kantorovich condition 4γη < 1 not certified (γ = β/μ = {gamma:.3e}, η = {eta:.3e}, μ = {mu:.3e})"
        ));
    };

    // λ_min(K + K_G(u*)) ≥ μ_A − β r.
    let (am, av) = to_csc(nf, &a_map);
    let stability_margin = certify_lambda_min_lower(&am, &av)
        .ok()
        .map(|mu_a| down(mu_a - up(beta * radius)))
        .filter(|&m| m > 0.0);

    let unorm = {
        let s = u[..nf].iter().fold(0.0f64, |s, &x| down(s + down(x * x)).max(0.0));
        down(s.sqrt()).max(0.0)
    };
    let rel_bound = if radius == 0.0 {
        0.0
    } else if unorm > 0.0 {
        up(radius / unorm)
    } else {
        f64::INFINITY
    };
    PDeltaCertificate::Certified {
        abs_bound: radius,
        rel_bound,
        uniqueness_radius,
        mu,
        beta,
        residual_norm: rho,
        newton_step: eta,
        stability_margin,
    }
}

/// Self-validated Kantorovich radius: `r` with `ρ + βr² ≤ μr` and `2βr < μ`
/// (checked with directed rounding), and the uniqueness radius `μ/(2β)`
/// rounded down. None when `4βρ < μ²` cannot be certified.
pub(crate) fn kantorovich_radius(mu: f64, beta: f64, rho: f64) -> Option<(f64, f64)> {
    if !(mu > 0.0 && mu.is_finite() && beta >= 0.0 && beta.is_finite() && rho >= 0.0 && rho.is_finite()) {
        return None;
    }
    if beta == 0.0 {
        let r = up(rho / mu);
        return r.is_finite().then_some((r, f64::INFINITY));
    }
    let disc = down(down(mu * mu) - up(4.0 * up(beta * rho)));
    if !(disc >= 0.0) {
        return None;
    }
    let r = up(up(2.0 * rho) / down(mu + down(disc.sqrt())));
    // ρ + βr² ≤ μr and 2βr < μ, with the left sides rounded up and right down.
    let lhs = up(rho + up(beta * up(r * r)));
    let ok = r.is_finite() && lhs <= down(mu * r) && up(2.0 * up(beta * r)) < mu;
    ok.then(|| (r, down(mu / up(2.0 * beta))))
}

/// f64 Newton step `d ≈ J⁻¹F`: Cholesky of the symmetric part, then a few
/// steps of refinement with the full J. Never trusted (see η).
fn newton_step(sym_j: &CscMatrix, r: &[Interval], jmul: impl Fn(&[f64]) -> Vec<f64>) -> Vec<f64> {
    let rhs: Vec<f64> = r.iter().map(|x| 0.5 * x.lo + 0.5 * x.hi).collect();
    let sym = Rc::new(symbolic_cholesky(sym_j));
    let Some(factor) = numeric_cholesky(&sym, sym_j) else {
        return vec![0.0; rhs.len()];
    };
    let mut d = sparse_cholesky_solve(&factor, &rhs);
    let res_norm = |d: &[f64]| {
        let jd = jmul(d);
        let res: Vec<f64> = rhs.iter().zip(&jd).map(|(a, b)| a - b).collect();
        let n = res.iter().map(|x| x * x).sum::<f64>().sqrt();
        (res, n)
    };
    let (mut res, mut nrm) = res_norm(&d);
    for _ in 0..8 {
        let c = sparse_cholesky_solve(&factor, &res);
        let cand: Vec<f64> = d.iter().zip(&c).map(|(a, b)| a + b).collect();
        let (r2, n2) = res_norm(&cand);
        if !(n2 < nrm) {
            break;
        }
        (d, res, nrm) = (cand, r2, n2);
    }
    if d.iter().all(|x| x.is_finite()) { d } else { vec![0.0; rhs.len()] }
}

/// `J(ũ)·x` in f64 (midpoints), free DOFs only.
fn jac_mul_f64(k_full: &CscMatrix, nf: usize, terms: &[KgAffineTerm], at: &[TermAt], x: &[f64]) -> Vec<f64> {
    let iv: Vec<Interval> = jac_mul_interval(k_full, nf, terms, at, x);
    iv.iter().map(|v| 0.5 * v.lo + 0.5 * v.hi).collect()
}

/// Enclosure of `J(ũ)·x = [K x]_F + Σ_e N_e (G_e x)_F + Σ_e c_e (G_e ũ)_F (t_eᵀx)`.
fn jac_mul_interval(k_full: &CscMatrix, nf: usize, terms: &[KgAffineTerm], at: &[TermAt], x: &[f64]) -> Vec<Interval> {
    let p = Interval::point;
    let mut y = vec![Interval::ZERO; nf];
    for j in 0..nf {
        for q in k_full.col_ptr[j]..k_full.col_ptr[j + 1] {
            let i = k_full.row_idx[q];
            if i < nf {
                let v = p(k_full.values[q]);
                y[i] = y[i] + v * p(x[j]);
                if i != j {
                    y[j] = y[j] + v * p(x[i]);
                }
            }
        }
    }
    for (t, a) in terms.iter().zip(at) {
        let nd = t.dofs.len();
        let tx = a.t_free.iter().fold(Interval::ZERO, |s, &(d, c)| s + c * p(x[d]));
        for (r, &dr) in t.dofs.iter().enumerate() {
            if dr >= nf {
                continue;
            }
            let gx = (0..nd)
                .filter(|&c| t.dofs[c] < nf)
                .fold(Interval::ZERO, |s, c| s + p(t.g[r * nd + c]) * p(x[t.dofs[c]]));
            y[dr] = y[dr] + a.n * gx + a.c * a.gu[r] * tx;
        }
    }
    y
}

fn term_at(t: &KgAffineTerm, u: &[f64], nf: usize) -> TermAt {
    let p = Interval::point;
    let elong = t.elongation.iter().fold(Interval::ZERO, |s, &(d, c)| s + p(c) * p(u[d]));
    let ea = p(t.e) * p(t.a);
    let n = ea * (elong.div(p(t.l)) - p(t.alpha) * p(t.dt));
    let c = ea.div(p(t.l));
    let nd = t.dofs.len();
    let gu = (0..nd)
        .map(|x| (0..nd).fold(Interval::ZERO, |s, y| s + p(t.g[x * nd + y]) * p(u[t.dofs[y]])))
        .collect();
    let mut agg: BTreeMap<usize, Interval> = BTreeMap::new();
    for &(d, coef) in &t.elongation {
        if d < nf {
            let e = agg.entry(d).or_insert(Interval::ZERO);
            *e = *e + p(coef);
        }
    }
    TermAt { n, c, gu, t_free: agg.into_iter().collect() }
}

/// Lower-triangle entries keyed by (column, row), row ≥ column.
type SymMap = BTreeMap<(usize, usize), Interval>;

fn add_sym(m: &mut SymMap, i: usize, j: usize, v: Interval) {
    let key = if i >= j { (j, i) } else { (i, j) };
    let e = m.entry(key).or_insert(Interval::ZERO);
    *e = *e + v;
}

/// CSC (approximate midpoints, for factoring only) and the enclosures.
fn to_csc(n: usize, m: &SymMap) -> (CscMatrix, Vec<Interval>) {
    let mut col_ptr = vec![0usize; n + 1];
    let mut row_idx = Vec::with_capacity(m.len());
    let mut values = Vec::with_capacity(m.len());
    let mut vals = Vec::with_capacity(m.len());
    for (&(j, i), &v) in m {
        col_ptr[j + 1] += 1;
        row_idx.push(i);
        values.push(0.5 * v.lo + 0.5 * v.hi);
        vals.push(v);
    }
    for j in 0..n {
        col_ptr[j + 1] += col_ptr[j];
    }
    (CscMatrix { n, col_ptr, row_idx, values }, vals)
}

/// ‖r‖₂ rounded up, None if non-finite.
pub(crate) fn norm_up(r: &[Interval]) -> Option<f64> {
    let mut s = 0.0f64;
    for x in r {
        if !x.is_finite() {
            return None;
        }
        let m = x.mag();
        s = up(s + up(m * m));
    }
    let v = up(s.sqrt());
    v.is_finite().then_some(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One-DOF quadratic model: F(x) = k x + c·x² − f, i.e. a single term with
    /// G = [1], elongation t = 1, e·a/l = c, no thermal part:
    /// N(x) = c·x, K_G(x) = c·x, F(x) = (k + c x) x − f.
    fn scalar(k: f64, c: f64) -> (CscMatrix, Vec<KgAffineTerm>) {
        let km = CscMatrix { n: 1, col_ptr: vec![0, 1], row_idx: vec![0], values: vec![k] };
        let t = KgAffineTerm {
            element_id: 1,
            dofs: vec![0],
            g: vec![1.0],
            elongation: vec![(0, 1.0)],
            e: c,
            a: 1.0,
            l: 1.0,
            alpha: 0.0,
            dt: 0.0,
        };
        (km, vec![t])
    }

    #[test]
    fn kantorovich_radius_is_self_consistent() {
        let (r, ru) = kantorovich_radius(2.0, 1.0, 0.5).unwrap();
        // root of r² − 2r + 0.5 = 0: 1 − √0.5 ≈ 0.29289
        assert!(r >= 1.0 - 0.5f64.sqrt() && r < 0.2929, "{r}");
        assert!(ru <= 1.0 && ru > 0.999);
        assert!(kantorovich_radius(2.0, 1.0, 1.0).is_none(), "4βρ = μ² must not certify");
        assert!(kantorovich_radius(2.0, 1.0, 1.01).is_none());
        let (r, ru) = kantorovich_radius(2.0, 0.0, 1.0).unwrap();
        assert!((0.5..0.5 + 1e-15).contains(&r) && ru.is_infinite());
        assert!(kantorovich_radius(0.0, 1.0, 0.0).is_none());
        assert!(kantorovich_radius(f64::NAN, 1.0, 0.0).is_none());
    }

    #[test]
    fn scalar_quadratic_root_enclosed() {
        // (4 + x) x = 1  →  x* = −2 + √5.
        let (k, terms) = scalar(4.0, 1.0);
        let exact = -2.0 + 5.0f64.sqrt();
        for guess in [exact, 0.25, 0.2, 0.3] {
            let c = certify_pdelta_system(&k, 1, &[1.0], &terms, &[guess]);
            let PDeltaCertificate::Certified { abs_bound, uniqueness_radius, stability_margin, .. } = c else {
                panic!("{guess}: {c:?}")
            };
            assert!((guess - exact).abs() <= abs_bound, "{guess}: {abs_bound}");
            assert!(abs_bound < 2.0 * (guess - exact).abs() + 1e-14, "{guess}: {abs_bound}");
            // The other root x = −2 − √5 is outside the uniqueness ball.
            assert!(uniqueness_radius <= (guess - (-2.0 - 5.0f64.sqrt())).abs());
            // K + K_G(x*) = 4 + x* > 0
            let m = stability_margin.unwrap();
            assert!(m > 0.0 && m <= 4.0 + exact);
        }
    }

    #[test]
    fn tampered_or_far_candidates_refused() {
        let (k, terms) = scalar(4.0, 1.0);
        // A guess near the unstable root −2 − √5 has J = 4 + 2x < 0: refused.
        let bad = -2.0 - 5.0f64.sqrt();
        assert!(!certify_pdelta_system(&k, 1, &[1.0], &terms, &[bad]).is_certified());
        // Far guesses: refused, or the bound covers the true distance.
        let exact = -2.0 + 5.0f64.sqrt();
        for g in [3.0, 10.0, -1.0, -1.9] {
            if let Some(b) = certify_pdelta_system(&k, 1, &[1.0], &terms, &[g]).abs_bound() {
                assert!((g - exact).abs() <= b, "{g}: {b}");
            }
        }
        // A wrong load: the solution of f = 1 is not certified for f = 2.
        let c = certify_pdelta_system(&k, 1, &[2.0], &terms, &[exact]);
        let exact2 = -2.0 + 6.0f64.sqrt();
        assert!(c.abs_bound().is_none_or(|b| b >= (exact2 - exact).abs()), "{c:?}");
        // Malformed input.
        assert!(!certify_pdelta_system(&k, 1, &[1.0], &terms, &[f64::NAN]).is_certified());
        let mut t2 = terms.clone();
        t2[0].dofs = vec![5];
        assert!(!certify_pdelta_system(&k, 1, &[1.0], &t2, &[0.2]).is_certified());
    }

    #[test]
    fn compression_softens_and_is_bounded() {
        // (4 − x) x = 1 with compression growing with x (c = −1): x* = 2 − √3.
        let (k, terms) = scalar(4.0, -1.0);
        let exact = 2.0 - 3.0f64.sqrt();
        let c = certify_pdelta_system(&k, 1, &[1.0], &terms, &[exact * (1.0 + 1e-9)]);
        let b = c.abs_bound().unwrap_or_else(|| panic!("{c:?}"));
        assert!((exact * 1e-9) <= b * (1.0 + 1e-6) && b < 1e-8, "{b}");
    }
}
