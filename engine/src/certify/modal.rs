//! Certified modal results for `K φ = λ M φ` (λ = ω²), with `K ≻ 0` and `M ⪰ 0`
//! the sparse free-DOF stiffness and mass (`M` may be singular: lumped masses
//! often carry no rotational inertia).
//!
//! 1. `K ≻ 0` with a certified `λ_min(K) ≥ σ_K` (Gram residual + Gershgorin,
//!    `sparse.rs`).
//! 2. Each computed mode `(λ̂, φ)` encloses a true eigenvalue. With
//!    `C = K^{-1/2} M K^{-1/2}` (symmetric, eigenvalues ν = 1/λ) and
//!    `y = K^{1/2} φ`: `C y − ν̂ y = K^{-1/2} s`, `s = Mφ − ν̂ Kφ`, so some ν
//!    satisfies `|ν − ν̂| ≤ ‖K^{-1/2}s‖/‖y‖ ≤ ‖s‖ / √(σ_K · φᵀKφ)` (Bauer–Fike for
//!    a symmetric matrix). Mapped back, λ lies in `[1/(ν̂+ρ), 1/(ν̂−ρ)]`.
//! 3. No mode below a cutoff μ is missing, for the lowest `j` computed modes:
//!    * at most `j` eigenvalues λ ≤ μ: if `A = K − μM` is positive definite on
//!      a subspace of codimension ≤ j, every subspace on which `xᵀAx ≤ 0` meets
//!      it only in 0, so has dimension ≤ j (min-max). Two certified ways: a
//!      principal submatrix with j rows/columns deleted is positive definite
//!      (sparse; indices by complete pivoting on the mode shapes, any choice
//!      is sound), or `A + c·UUᵀ ≻ 0` with `U = MΦ` (Finsler; dense Gram
//!      residual + Gershgorin, moderate n only);
//!    * at least `j` eigenvalues λ < μ: with `Y = K^{1/2}Φ` (full column rank)
//!      and `R = CY − Y diag(ν̂)`, Kahan's theorem (Lean: kahan_lower_count) gives `j` eigenvalues of C
//!      (with multiplicity) within `‖R‖_F / σ_min(Y)` of the ν̂ᵢ; here
//!      `‖R‖_F² ≤ Σᵢ ‖sᵢ‖²/σ_K` and `σ_min(Y)² = λ_min(ΦᵀKΦ)`, bounded below by
//!      Gershgorin on the interval j×j matrix ΦᵀKΦ. This also covers repeated
//!      frequencies, where single-mode enclosures overlap.
//!    Cutoffs are tried in gaps of the computed spectrum, highest first.
//!
//! Certified with respect to the f64 sparse-assembled `K` and `M`. With
//! constraints, with respect to the reduced pencil `(CᵀKC, CᵀMC)` the solver
//! solves, both matrices enclosed entrywise in intervals (`constrained.rs`),
//! with the modes read at the independent DOFs.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::constrained::{reduce_symmetric_enclosed, ConstraintMap};
use super::interval::Interval;
use super::solver::{gather_u_2d, gather_u_3d};
use super::sparse::certify_lambda_min_lower;
use crate::linalg::sparse::CscMatrix;
use crate::solver::constraints::{build_constraint_transform, inclined_dofs_2d, inclined_dofs_3d};
use crate::solver::dof::DofNumbering;
use crate::solver::mass_matrix::{assemble_mass_matrix_2d_sparse_inclined, assemble_mass_matrix_3d_sparse_inclined};
use crate::solver::modal::{solve_modal_2d, solve_modal_3d, ModalResult, ModalResult3D};
use crate::solver::sparse_assembly::assemble_stiffness_sparse_2d;
use crate::solver::assembly::{assemble_stiffness_sparse_3d, to_inclined_free};
use crate::types::*;

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

#[inline]
fn down(x: f64) -> f64 {
    x.next_down()
}

/// Certified enclosure of one eigenvalue λ = ω² near a computed mode.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeEnclosure {
    pub omega2_computed: f64,
    pub omega2_lower: f64,
    /// +∞ (null) when the residual is too large to bound λ from above.
    pub omega2_upper: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ModalCertificate {
    Certified {
        /// One enclosure per computed mode, in the solver's order.
        modes: Vec<ModeEnclosure>,
        /// The `complete_modes` lowest computed modes are exactly the
        /// eigenvalues below `cutoff_omega2` (with multiplicity): none missed.
        /// 0 when completeness could not be certified.
        complete_modes: usize,
        /// Cutoff μ in ω² units (0 when complete_modes = 0).
        cutoff_omega2: f64,
        /// Why completeness could not be certified for all computed modes.
        count_failure: Option<String>,
    },
    Uncertified { reason: String },
}

super::finite::guarded_enum!(ModalCertificate);

impl ModalCertificate {
    fn uncertified(reason: impl Into<String>) -> Self {
        ModalCertificate::Uncertified { reason: reason.into() }
    }

    pub fn is_certified(&self) -> bool {
        matches!(self, ModalCertificate::Certified { .. })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedModal2D {
    pub results: ModalResult,
    pub certificate: ModalCertificate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedModal3D {
    pub results: ModalResult3D,
    pub certificate: ModalCertificate,
}

/// Solve 2D modal analysis and certify the computed modes.
pub fn certify_modal_2d(
    input: &SolverInput,
    densities: &HashMap<String, f64>,
    num_modes: usize,
) -> Result<CertifiedModal2D, String> {
    super::finite::check_input(&(input, densities))?;
    let results = solve_modal_2d(input, densities, num_modes)?;
    super::finite::check_results(&results)?;
    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;
    // K and M in the inclined-roller frames; the published modes (global
    // axes) are rotated into them.
    let stiff = assemble_stiffness_sparse_2d(input, &dof_num);
    let its = &stiff.inclined_transforms_2d;
    let k = stiff.k_ff;
    let m = assemble_mass_matrix_2d_sparse_inclined(input, &dof_num, densities, its);
    let mut modes = Vec::new();
    let mut err = None;
    for mode in &results.modes {
        match gather_u_2d(&dof_num, &mode.displacements) {
            Ok(u) => modes.push((mode.omega * mode.omega, to_inclined_free(u, its, nf))),
            Err(c) => err = Some(format!("mode shape: {c:?}")),
        }
    }
    let certificate = match err {
        Some(e) => ModalCertificate::uncertified(e),
        None if input.constraints.is_empty() => certify_modes(&k, &m, &modes),
        None => {
            // The reduced pencil (CᵀKC, CᵀMC) the solver solves, enclosed
            // entrywise; modes read at the independent DOFs.
            match build_constraint_transform(&input.constraints, &dof_num, Some(&input.nodes), None, &inclined_dofs_2d(input, &dof_num)) {
                Err(e) => ModalCertificate::uncertified(e),
                Ok(ct) => {
                    let cm = ConstraintMap::from_transform(&ct, nf);
                    let (kr, kv) = reduce_symmetric_enclosed(&k, &cm);
                    let (mr, mv) = reduce_symmetric_enclosed(&m, &cm);
                    let modes_q: Vec<(f64, Vec<f64>)> =
                        modes.iter().map(|(l, p)| (*l, cm.indep_dof.iter().map(|&d| p[d]).collect())).collect();
                    certify_modes_enclosed(&kr, &kv, &mr, &mv, &modes_q)
                }
            }
        }
    };
    let mut certificate = certificate;
    super::finite::guard(&mut certificate);
    Ok(CertifiedModal2D { results, certificate })
}

/// Solve 3D modal analysis and certify the computed modes.
pub fn certify_modal_3d(
    input: &SolverInput3D,
    densities: &HashMap<String, f64>,
    num_modes: usize,
) -> Result<CertifiedModal3D, String> {
    super::finite::check_input(&(input, densities))?;
    let results = solve_modal_3d(input, densities, num_modes)?;
    super::finite::check_results(&results)?;
    // The model the solver analyzed, curved beams expanded.
    let input = &crate::solver::linear::expand_curved_beams_3d(input);
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    // In the inclined-support frames, as in 2D.
    let stiff = assemble_stiffness_sparse_3d(input, &dof_num, false);
    let its = &stiff.inclined_transforms;
    let k = stiff.k_ff;
    let m = assemble_mass_matrix_3d_sparse_inclined(input, &dof_num, densities, its);
    let mut modes = Vec::new();
    let mut err = None;
    for mode in &results.modes {
        match gather_u_3d(&dof_num, &mode.displacements) {
            Ok(u) => modes.push((mode.omega * mode.omega, to_inclined_free(u, its, nf))),
            Err(c) => err = Some(format!("mode shape: {c:?}")),
        }
    }
    let certificate = match err {
        Some(e) => ModalCertificate::uncertified(e),
        None if input.constraints.is_empty() => certify_modes(&k, &m, &modes),
        None => {
            // The reduced pencil (CᵀKC, CᵀMC) the solver solves, enclosed
            // entrywise; modes read at the independent DOFs.
            match build_constraint_transform(&input.constraints, &dof_num, None, Some(&input.nodes), &inclined_dofs_3d(input, &dof_num)) {
                Err(e) => ModalCertificate::uncertified(e),
                Ok(ct) => {
                    let cm = ConstraintMap::from_transform(&ct, nf);
                    let (kr, kv) = reduce_symmetric_enclosed(&k, &cm);
                    let (mr, mv) = reduce_symmetric_enclosed(&m, &cm);
                    let modes_q: Vec<(f64, Vec<f64>)> =
                        modes.iter().map(|(l, p)| (*l, cm.indep_dof.iter().map(|&d| p[d]).collect())).collect();
                    certify_modes_enclosed(&kr, &kv, &mr, &mv, &modes_q)
                }
            }
        }
    };
    let mut certificate = certificate;
    super::finite::guard(&mut certificate);
    Ok(CertifiedModal3D { results, certificate })
}

/// Certify computed modes `(ω̂², φ)` of `K φ = λ M φ` (lower-triangle CSC).
pub fn certify_modes(k: &CscMatrix, m: &CscMatrix, modes: &[(f64, Vec<f64>)]) -> ModalCertificate {
    let points = |a: &CscMatrix| a.values.iter().map(|&x| Interval::point(x)).collect::<Vec<_>>();
    certify_modes_enclosed(k, &points(k), m, &points(m), modes)
}

/// As `certify_modes` for exact real `K`, `M` known only through entry
/// enclosures `kv`, `mv` (aligned with the lower-triangle patterns of `k`,
/// `m`, whose values are approximations used only for factoring).
pub fn certify_modes_enclosed(
    k: &CscMatrix,
    kv: &[Interval],
    m: &CscMatrix,
    mv: &[Interval],
    modes: &[(f64, Vec<f64>)],
) -> ModalCertificate {
    let n = k.n;
    if m.n != n || modes.iter().any(|(_, p)| p.len() != n) || kv.len() != k.values.len() || mv.len() != m.values.len()
    {
        return ModalCertificate::uncertified("dimension mismatch");
    }
    if !kv.iter().chain(mv).all(|x| x.is_finite()) {
        return ModalCertificate::uncertified("non-finite matrix entry");
    }
    let km = Pencil { k, kv, m, mv };
    if modes.is_empty() {
        return ModalCertificate::uncertified("no modes");
    }
    if modes.iter().any(|(l, p)| !(*l > 0.0 && l.is_finite()) || !p.iter().all(|x| x.is_finite())) {
        return ModalCertificate::uncertified("non-finite or non-positive computed mode");
    }
    let sigma_k = match certify_lambda_min_lower(k, kv) {
        Ok(s) => s,
        Err(reason) => return ModalCertificate::uncertified(format!("K not certified positive definite: {reason}")),
    };

    let parts: Vec<ModeParts> = modes.iter().map(|(l, p)| mode_parts(&km, *l, p)).collect();
    let encl: Vec<ModeEnclosure> =
        modes.iter().zip(&parts).map(|((l, _), mp)| enclose(sigma_k, *l, mp)).collect();

    // Modes in ascending order of ω̂²; candidate (j, μ) pairs, highest j first.
    let mut order: Vec<usize> = (0..modes.len()).collect();
    order.sort_by(|&a, &b| modes[a].0.total_cmp(&modes[b].0));
    let lam = |r: usize| modes[order[r]].0;
    let mut candidates = Vec::new();
    for j in (1..=order.len()).rev() {
        if j == order.len() {
            for delta in [1e-6, 1e-3] {
                candidates.push((j, up(lam(j - 1) * (1.0 + delta))));
            }
        } else if lam(j) - lam(j - 1) > 1e-6 * lam(j) {
            candidates.push((j, 0.5 * (lam(j - 1) + lam(j))));
        }
    }
    let Some(pattern) = union_pattern(k, m) else {
        return ModalCertificate::uncertified("unsorted CSC column");
    };
    let mut failure = None;
    for (j, mu) in candidates {
        let idx: Vec<usize> = order[..j].to_vec();
        match completeness(&km, &pattern, sigma_k, modes, &parts, &idx, mu) {
            Ok(()) => {
                return ModalCertificate::Certified {
                    modes: encl,
                    complete_modes: j,
                    cutoff_omega2: mu,
                    count_failure: if j == modes.len() { None } else { failure },
                };
            }
            Err(reason) => {
                if failure.is_none() {
                    failure = Some(format!("{j} modes below {mu:.6e}: {reason}"));
                }
            }
        }
    }
    ModalCertificate::Certified { modes: encl, complete_modes: 0, cutoff_omega2: 0.0, count_failure: failure }
}

/// A computed mode certified to approximate a *simple* eigenvalue, isolated
/// from the rest of the spectrum (used for eigenvector bounds, `spectral.rs`).
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct IsolatedMode {
    /// Cutoffs `μ_{i−1} < λ_i < μ_i`: exactly `i − 1` eigenvalues are `< μ_{i−1}`
    /// (none equal to it) and exactly `i` are `< μ_i` (none equal to it). 0 for
    /// the first mode.
    pub lower_cut: f64,
    pub upper_cut: f64,
    /// `ν̂ = 1/λ̂` (f64) and `ρ ≥ ‖Cy − ν̂y‖/‖y‖`, `C = K^{-1/2}MK^{-1/2}`, `y = K^{1/2}φ`.
    pub nu_hat: f64,
    pub nu_radius: f64,
}

/// Certify that the computed modes (sorted by strictly increasing ω̂²) are the
/// lowest `modes.len()` eigenpairs, each eigenvalue simple and bracketed:
/// for every `i`, at most `i` eigenvalues `λ ≤ μ_i` and at least `i` with
/// `λ < μ_i` (both from `completeness`), so `#{λ < μ_i} = #{λ ≤ μ_i} = i`.
/// `σ_K ≤ λ_min(K)` must be certified by the caller.
#[allow(clippy::neg_cmp_op_on_partial_ord)] // `!(a < b)` also rejects NaN
pub(crate) fn isolate_modes(
    k: &CscMatrix,
    kv: &[Interval],
    m: &CscMatrix,
    mv: &[Interval],
    sigma_k: f64,
    modes: &[(f64, Vec<f64>)],
) -> Result<Vec<IsolatedMode>, String> {
    let n = k.n;
    if modes.is_empty() || m.n != n || modes.iter().any(|(_, p)| p.len() != n) {
        return Err("no modes or dimension mismatch".into());
    }
    if modes.iter().any(|(l, p)| !(*l > 0.0 && l.is_finite()) || !p.iter().all(|x| x.is_finite())) {
        return Err("non-finite or non-positive computed mode".into());
    }
    if modes.windows(2).any(|w| !(w[0].0 < w[1].0)) {
        return Err("computed frequencies not strictly increasing (repeated modes have no unique shape)".into());
    }
    let Some(pattern) = union_pattern(k, m) else {
        return Err("unsorted CSC column".into());
    };
    let km = Pencil { k, kv, m, mv };
    let parts: Vec<ModeParts> = modes.iter().map(|(l, p)| mode_parts(&km, *l, p)).collect();
    let nm = modes.len();
    let mut cuts = Vec::with_capacity(nm);
    for j in 1..=nm {
        let idx: Vec<usize> = (0..j).collect();
        let candidates: Vec<f64> = if j < nm {
            vec![2.0 / (parts[j - 1].nu_hat + parts[j].nu_hat)]
        } else {
            [1.5, 1.2, 1.1, 1.03, 1.01, 1.001].iter().map(|f| modes[j - 1].0 * f).collect()
        };
        let mut last = String::new();
        let mut found = None;
        for mu in candidates {
            match completeness(&km, &pattern, sigma_k, modes, &parts, &idx, mu) {
                Ok(()) => {
                    found = Some(mu);
                    break;
                }
                Err(e) => last = e,
            }
        }
        match found {
            Some(mu) => cuts.push(mu),
            None => return Err(format!("mode {j} not isolated: {last}")),
        }
    }
    let mut out = Vec::with_capacity(nm);
    for (i, mp) in parts.iter().enumerate() {
        let denom = down(down(sigma_k * mp.kphi_dot).sqrt());
        if !(mp.kphi_dot > 0.0) || !(denom > 0.0) || !mp.s2.is_finite() {
            return Err(format!("mode {}: φᵀKφ not certified positive", i + 1));
        }
        out.push(IsolatedMode {
            lower_cut: if i == 0 { 0.0 } else { cuts[i - 1] },
            upper_cut: cuts[i],
            nu_hat: mp.nu_hat,
            nu_radius: up(up(mp.s2.sqrt()) / denom),
        });
    }
    Ok(out)
}

/// Per-mode interval quantities: Kφ, ‖Mφ − ν̂Kφ‖² (rounded up), ν̂ = 1/λ̂.
struct ModeParts {
    kphi: Vec<Interval>,
    /// Lower bound of φᵀKφ.
    kphi_dot: f64,
    s2: f64,
    nu_hat: f64,
}

/// `K`, `M` (lower-triangle patterns with approximate values) and enclosures
/// of their exact entries.
struct Pencil<'a> {
    k: &'a CscMatrix,
    kv: &'a [Interval],
    m: &'a CscMatrix,
    mv: &'a [Interval],
}

fn mode_parts(km: &Pencil, lam: f64, phi: &[f64]) -> ModeParts {
    let kphi = sym_mat_vec(km.k, km.kv, phi);
    let mphi = sym_mat_vec(km.m, km.mv, phi);
    let nu_hat = 1.0 / lam;
    let mut s2 = 0.0f64;
    for (a, b) in mphi.iter().zip(&kphi) {
        let si = *a - Interval::point(nu_hat) * *b;
        let mg = if si.is_finite() { si.mag() } else { f64::INFINITY };
        s2 = up(s2 + up(mg * mg));
    }
    let kphi_dot = dot(phi, &kphi).lo;
    ModeParts { kphi, kphi_dot, s2, nu_hat }
}

/// Certify that the modes `idx` are exactly the eigenvalues below μ.
#[allow(clippy::too_many_arguments)]
fn completeness(
    km: &Pencil,
    pattern: &Pattern,
    sigma_k: f64,
    modes: &[(f64, Vec<f64>)],
    parts: &[ModeParts],
    idx: &[usize],
    mu: f64,
) -> Result<(), String> {
    // At least |idx| eigenvalues below μ (Kahan).
    let j = idx.len();
    let mut gram = vec![Interval::ZERO; j * j];
    for (a, &ia) in idx.iter().enumerate() {
        for (b, &ib) in idx.iter().enumerate() {
            gram[a * j + b] = dot(&modes[ia].1, &parts[ib].kphi);
        }
    }
    let mut g = f64::INFINITY;
    for a in 0..j {
        let mut off = 0.0f64;
        for b in 0..j {
            if b != a {
                off = up(off + gram[a * j + b].mag());
            }
        }
        g = g.min((gram[a * j + a].lo - off).next_down());
    }
    if !(g > 0.0) {
        return Err(format!("mode shapes not certified independent (λ_min(ΦᵀKΦ) bound {g:.3e})"));
    }
    let s2: f64 = idx.iter().fold(0.0, |acc, &i| up(acc + parts[i].s2));
    let rho = up(up(up(s2 / sigma_k).sqrt()) / down(g.sqrt()));
    let nu_min = idx.iter().map(|&i| parts[i].nu_hat).fold(f64::INFINITY, f64::min);
    let nu_lo = down(nu_min - rho);
    if !(nu_lo > 0.0) || !(up(1.0 / nu_lo) < mu) {
        return Err(format!("residuals too large for the gap (ρ = {rho:.3e})"));
    }
    // At most |idx| eigenvalues ≤ μ. Cheap first: a deleted principal
    // submatrix of K − μM positive definite (sparse).
    let phis: Vec<&Vec<f64>> = idx.iter().map(|&i| &modes[i].1).collect();
    let n = km.k.n;
    let del = pivot_indices(&phis, n);
    if del.len() == j {
        let (a, vals) = shifted_deleting(km, pattern, mu, &del);
        if certify_lambda_min_lower(&a, &vals).is_ok() {
            return Ok(());
        }
    }
    // Then Finsler: K − μM + c·UUᵀ ≻ 0 with U = MΦ (dense, moderate n only).
    if n > MAX_DENSE_FINSLER {
        return Err(format!(
            "deleted-DOF test failed and n = {n} exceeds the dense Finsler cap {MAX_DENSE_FINSLER}"
        ));
    }
    finsler_dense(km, mu, &phis)
}

/// Largest model for the dense Finsler completeness check (O(n³)).
pub const MAX_DENSE_FINSLER: usize = 2000;

/// Certify `K − μM + c·UUᵀ ≻ 0`, `U = MΦ` (any real U of j columns): then
/// `xᵀ(K − μM)x > 0` on `{x : Uᵀx = 0}`, of codimension ≤ j, so at most j
/// eigenvalues λ ≤ μ.
fn finsler_dense(km: &Pencil, mu: f64, phis: &[&Vec<f64>]) -> Result<(), String> {
    let (k, m) = (km.k, km.m);
    let n = k.n;
    let u: Vec<Vec<f64>> = phis.iter().map(|p| m.sym_mat_vec(p)).collect();
    // c > (μ − λ̂)/φᵀMφ makes each mode direction positive; take 4× the max.
    let mut c = 0.0f64;
    for (p, up_) in phis.iter().zip(&u) {
        let pmp: f64 = p.iter().zip(up_).map(|(a, b)| a * b).sum();
        let pkp: f64 = p.iter().zip(&k.sym_mat_vec(p)).map(|(a, b)| a * b).sum();
        if !(pmp > 0.0) {
            return Err("mode with non-positive φᵀMφ".into());
        }
        c = c.max(4.0 * (mu - pkp / pmp).max(0.0) / pmp);
    }
    let mut mid = vec![0.0; n * n];
    let mut iv = vec![Interval::ZERO; n * n];
    let add = |a: &CscMatrix, av: &[Interval], scale: f64, mid: &mut [f64], iv: &mut [Interval]| {
        for jj in 0..n {
            for p in a.col_ptr[jj]..a.col_ptr[jj + 1] {
                let ii = a.row_idx[p];
                let v = Interval::point(scale) * av[p];
                for (r, cidx) in [(ii, jj), (jj, ii)] {
                    if r == cidx && ii != jj {
                        continue;
                    }
                    mid[r * n + cidx] += scale * a.values[p];
                    iv[r * n + cidx] = iv[r * n + cidx] + v;
                    if ii == jj {
                        break;
                    }
                }
            }
        }
    };
    add(k, km.kv, 1.0, &mut mid, &mut iv);
    add(m, km.mv, -mu, &mut mid, &mut iv);
    let ci = Interval::point(c);
    for col in &u {
        for r in 0..n {
            if col[r] == 0.0 {
                continue;
            }
            let cr = ci * Interval::point(col[r]);
            for q in 0..n {
                if col[q] != 0.0 {
                    mid[r * n + q] += c * col[r] * col[q];
                    iv[r * n + q] = iv[r * n + q] + cr * Interval::point(col[q]);
                }
            }
        }
    }
    dense_gram_lower(&mid, &iv, n).map(|_| ())
}

/// Dense Gram residual + Gershgorin: certified μ > 0 with λ_min(B) ≥ μ for the
/// exact symmetric B enclosed entrywise by `iv` (`mid` approximates it).
fn dense_gram_lower(mid: &[f64], iv: &[Interval], n: usize) -> Result<f64, String> {
    use crate::linalg::cholesky_decompose;
    let lambda = super::linear::estimate_lambda_min(mid, n)?;
    let prod = |a: f64, b: f64| {
        let p = a * b;
        if a == 0.0 || b == 0.0 { Interval::ZERO } else { Interval::new(down(p), up(p)) }
    };
    let mut last = String::new();
    for frac in [0.9, 0.5, 0.1, 0.01] {
        let t = frac * lambda;
        let mut l = mid.to_vec();
        for i in 0..n {
            l[i * n + i] -= t;
        }
        if !cholesky_decompose(&mut l, n) {
            last = format!("Cholesky of B − {t:.3e}·I failed");
            continue;
        }
        let (mut diag_lo, mut off) = (vec![0.0f64; n], vec![0.0f64; n]);
        for i in 0..n {
            for jj in 0..=i {
                let mut acc = iv[i * n + jj];
                for kk in 0..=jj {
                    acc = acc - prod(l[i * n + kk], l[jj * n + kk]);
                }
                if !acc.is_finite() {
                    return Err(format!("non-finite residual at ({i}, {jj})"));
                }
                if i == jj {
                    diag_lo[i] = acc.lo;
                } else {
                    let mg = acc.mag();
                    off[i] = up(off[i] + mg);
                    off[jj] = up(off[jj] + mg);
                }
            }
        }
        let mu = (0..n).map(|i| down(diag_lo[i] - off[i])).fold(f64::INFINITY, f64::min);
        if mu > 0.0 {
            return Ok(mu);
        }
        last = format!("Gershgorin bound {mu:.3e} not positive");
    }
    Err(format!("dense Finsler matrix not certified positive definite: {last}"))
}

/// Indices to delete: complete pivoting on the mode shapes (Gaussian
/// elimination of the k×n matrix Φᵀ, choosing the largest remaining entry).
fn pivot_indices(phis: &[&Vec<f64>], n: usize) -> Vec<usize> {
    let mut rows: Vec<Vec<f64>> = phis.iter().map(|p| p.to_vec()).collect();
    let mut chosen = Vec::new();
    for r in 0..rows.len() {
        let Some((j, _)) = rows[r]
            .iter()
            .enumerate()
            .filter(|(j, _)| !chosen.contains(j))
            .max_by(|a, b| a.1.abs().total_cmp(&b.1.abs()))
        else {
            break;
        };
        let piv = rows[r][j];
        if piv == 0.0 {
            continue;
        }
        for q in r + 1..rows.len() {
            let f = rows[q][j] / piv;
            for c in 0..n {
                rows[q][c] -= f * rows[r][c];
            }
        }
        chosen.push(j);
    }
    chosen
}

/// `K − μM` on the union pattern with the rows/columns in `del` removed
/// (renumbered): f64 approximation and entry enclosures.
fn shifted_deleting(km: &Pencil, pattern: &Pattern, mu: f64, del: &[usize]) -> (CscMatrix, Vec<Interval>) {
    let (k, m) = (km.k, km.m);
    let n = k.n;
    let mut new_index = vec![usize::MAX; n];
    let mut next = 0;
    for (i, slot) in new_index.iter_mut().enumerate() {
        if !del.contains(&i) {
            *slot = next;
            next += 1;
        }
    }
    let (mut col_ptr, mut row_idx, mut values, mut vals) = (vec![0], Vec::new(), Vec::new(), Vec::new());
    for (j, col) in pattern.iter().enumerate() {
        if new_index[j] == usize::MAX {
            continue;
        }
        for &(r, pk, pm) in col {
            if new_index[r] == usize::MAX {
                continue;
            }
            let kv = pk.map_or(0.0, |p| k.values[p]);
            let mv = pm.map_or(0.0, |q| m.values[q]);
            let ki = pk.map_or(Interval::ZERO, |p| km.kv[p]);
            let mi = pm.map_or(Interval::ZERO, |q| km.mv[q]);
            row_idx.push(new_index[r]);
            values.push(kv - mu * mv);
            vals.push(ki - Interval::point(mu) * mi);
        }
        col_ptr.push(row_idx.len());
    }
    (CscMatrix { n: next, col_ptr, row_idx, values }, vals)
}

/// Interval y = A x for symmetric A stored as its lower triangle, with entry
/// enclosures `av`.
fn sym_mat_vec(a: &CscMatrix, av: &[Interval], x: &[f64]) -> Vec<Interval> {
    let mut y = vec![Interval::ZERO; a.n];
    for j in 0..a.n {
        for p in a.col_ptr[j]..a.col_ptr[j + 1] {
            let i = a.row_idx[p];
            let v = av[p];
            y[i] = y[i] + v * Interval::point(x[j]);
            if i != j {
                y[j] = y[j] + v * Interval::point(x[i]);
            }
        }
    }
    y
}

fn dot(x: &[f64], y: &[Interval]) -> Interval {
    x.iter().zip(y).fold(Interval::ZERO, |acc, (&a, &b)| acc + Interval::point(a) * b)
}

/// Enclosure of the eigenvalue nearest a computed mode (see module docs, 2.).
fn enclose(sigma_k: f64, lam: f64, mp: &ModeParts) -> ModeEnclosure {
    let unbounded = ModeEnclosure { omega2_computed: lam, omega2_lower: 0.0, omega2_upper: f64::INFINITY };
    let phik = mp.kphi_dot;
    if !(phik > 0.0) || !mp.s2.is_finite() {
        return unbounded;
    }
    // ρ = ‖s‖ / √(σ_K · φᵀKφ), rounded up.
    let denom = down(down(sigma_k * phik).sqrt());
    if !(denom > 0.0) {
        return unbounded;
    }
    let rho = up(up(mp.s2.sqrt()) / denom);
    let nu_lo = down(mp.nu_hat - rho);
    let nu_hi = up(mp.nu_hat + rho);
    let omega2_lower = if nu_hi > 0.0 && nu_hi.is_finite() { down(1.0 / nu_hi) } else { 0.0 };
    let omega2_upper = if nu_lo > 0.0 { up(1.0 / nu_lo) } else { f64::INFINITY };
    ModeEnclosure { omega2_computed: lam, omega2_lower, omega2_upper }
}

pub(crate) type Pattern = Vec<Vec<(usize, Option<usize>, Option<usize>)>>;

pub(crate) fn union_pattern(a: &CscMatrix, b: &CscMatrix) -> Option<Pattern> {
    let sorted = |m: &CscMatrix| {
        (0..m.n).all(|j| m.row_idx[m.col_ptr[j]..m.col_ptr[j + 1]].windows(2).all(|w| w[0] < w[1]))
    };
    if !sorted(a) || !sorted(b) {
        return None;
    }
    let mut cols = Vec::with_capacity(a.n);
    for j in 0..a.n {
        let (mut p, pe) = (a.col_ptr[j], a.col_ptr[j + 1]);
        let (mut q, qe) = (b.col_ptr[j], b.col_ptr[j + 1]);
        let mut col = Vec::new();
        while p < pe || q < qe {
            let ra = if p < pe { a.row_idx[p] } else { usize::MAX };
            let rb = if q < qe { b.row_idx[q] } else { usize::MAX };
            if ra == rb {
                col.push((ra, Some(p), Some(q)));
                p += 1;
                q += 1;
            } else if ra < rb {
                col.push((ra, Some(p), None));
                p += 1;
            } else {
                col.push((rb, None, Some(q)));
                q += 1;
            }
        }
        cols.push(col);
    }
    Some(cols)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_eigenvalues_require_independent_modes_for_completeness() {
        let k = CscMatrix::from_triplets(4, &[0, 1, 2, 3], &[0, 1, 2, 3], &[2.0, 2.0, 5.0, 9.0]);
        let m = tridiag(4, 1.0, 0.0);
        let first = (2.0, vec![1.0, 0.0, 0.0, 0.0]);
        let second = (2.0, vec![0.0, 1.0, 0.0, 0.0]);
        let third = (5.0, vec![0.0, 0.0, 1.0, 0.0]);
        let good = vec![first.clone(), second, third.clone()];
        let ModalCertificate::Certified { modes, complete_modes, .. } = certify_modes(&k, &m, &good) else { panic!("certificate refused") };
        assert_eq!(complete_modes, 3);
        for (enclosure, (exact, _)) in modes.iter().zip(&good) {
            assert!(enclosure.omega2_lower <= *exact && *exact <= enclosure.omega2_upper);
        }
        for bad in [vec![first.clone(), first.clone(), third.clone()], vec![first, third]] {
            let ModalCertificate::Certified { complete_modes, .. } = certify_modes(&k, &m, &bad) else { panic!("enclosures refused") };
            assert_eq!(complete_modes, 0);
        }
    }

    fn tridiag(n: usize, d: f64, o: f64) -> CscMatrix {
        let (mut r, mut c, mut v) = (vec![], vec![], vec![]);
        for i in 0..n {
            r.push(i);
            c.push(i);
            v.push(d);
            if i + 1 < n {
                r.push(i + 1);
                c.push(i);
                v.push(o);
            }
        }
        CscMatrix::from_triplets(n, &r, &c, &v)
    }

    /// Mirror constraint u_{29−i} = u_i on the 30-DOF chain: the reduced pencil
    /// (CᵀKC, CᵀMC) has exactly the chain's symmetric modes, j = 1, 3, 5, …
    #[test]
    fn constrained_modes_enclosed_and_gap_detected() {
        let n = 30;
        let k = tridiag(n, 2.0, -1.0);
        let m = tridiag(n, 1.0, 0.0);
        let cm = ConstraintMap {
            c: (0..n).map(|i| vec![(if i < n / 2 { i } else { n - 1 - i }, 1.0)]).collect(),
            c_r: vec![vec![]; n],
            p: n / 2,
            indep_dof: (0..n / 2).collect(),
        };
        let (kr, kv) = reduce_symmetric_enclosed(&k, &cm);
        let (mr, mv) = reduce_symmetric_enclosed(&m, &cm);
        let lam = |j: usize| 2.0 - 2.0 * (j as f64 * std::f64::consts::PI / (n as f64 + 1.0)).cos();
        let q = |j: usize| -> Vec<f64> {
            (1..=n / 2).map(|i| (i as f64 * j as f64 * std::f64::consts::PI / (n as f64 + 1.0)).sin()).collect()
        };
        let all: Vec<(f64, Vec<f64>)> = [1, 3, 5].iter().map(|&j| (lam(j), q(j))).collect();
        let c = certify_modes_enclosed(&kr, &kv, &mr, &mv, &all);
        let ModalCertificate::Certified { modes, complete_modes, .. } = &c else { panic!("{c:?}") };
        assert_eq!(*complete_modes, 3, "{c:?}");
        for (e, j) in modes.iter().zip([1, 3, 5]) {
            assert!(e.omega2_lower <= lam(j) && lam(j) <= e.omega2_upper, "{e:?}");
            assert!((e.omega2_upper - e.omega2_lower) / lam(j) < 1e-8, "{e:?}");
        }
        // Without mode 3 the remaining two cannot be certified complete.
        let missing = vec![all[0].clone(), all[2].clone()];
        let ModalCertificate::Certified { complete_modes, .. } = certify_modes_enclosed(&kr, &kv, &mr, &mv, &missing)
        else {
            panic!()
        };
        assert!(complete_modes < 2, "missing mode not detected: {complete_modes}");
        // Antisymmetric mode 2 is not an eigenpair of the constrained pencil: its
        // reduced vector must not be enclosed near the unconstrained λ_2.
        let c = certify_modes_enclosed(&kr, &kv, &mr, &mv, &[(lam(2), q(2))]);
        if let ModalCertificate::Certified { modes, .. } = &c {
            let e = &modes[0];
            assert!(e.omega2_upper - e.omega2_lower > 1e-3 * lam(2), "wrong mode certified tightly: {e:?}");
        }
    }

    #[test]
    fn modes_enclosed_and_missing_mode_detected() {
        let n = 30;
        let k = tridiag(n, 2.0, -1.0);
        let m = tridiag(n, 1.0, 0.0);
        let lam = |j: usize| 2.0 - 2.0 * (j as f64 * std::f64::consts::PI / (n as f64 + 1.0)).cos();
        let phi = |j: usize| -> Vec<f64> {
            (1..=n).map(|i| (i as f64 * j as f64 * std::f64::consts::PI / (n as f64 + 1.0)).sin()).collect()
        };
        let all: Vec<(f64, Vec<f64>)> = (1..=3).map(|j| (lam(j), phi(j))).collect();
        let c = certify_modes(&k, &m, &all);
        let ModalCertificate::Certified { modes, complete_modes, .. } = &c else { panic!("{c:?}") };
        assert_eq!(*complete_modes, 3, "{c:?}");
        for (j, e) in modes.iter().enumerate() {
            assert!(e.omega2_lower <= lam(j + 1) && lam(j + 1) <= e.omega2_upper, "{e:?}");
        }
        // Drop mode 2: the count must expose the gap.
        let missing = vec![all[0].clone(), all[2].clone()];
        let c = certify_modes(&k, &m, &missing);
        let ModalCertificate::Certified { complete_modes, .. } = c else { panic!() };
        // The missing mode 2 lies below every cutoff the remaining modes offer
        // (above mode 3, and midway between modes 1 and 3), so nothing can be
        // certified complete.
        assert_eq!(complete_modes, 0, "missing mode not detected");
    }

    #[test]
    fn isolated_modes_bracket_exactly_one_eigenvalue() {
        let n = 30;
        let k = tridiag(n, 2.0, -1.0);
        let m = tridiag(n, 1.0, 0.0);
        let lam = |j: usize| 2.0 - 2.0 * (j as f64 * std::f64::consts::PI / (n as f64 + 1.0)).cos();
        let phi = |j: usize| -> Vec<f64> {
            (1..=n).map(|i| (i as f64 * j as f64 * std::f64::consts::PI / (n as f64 + 1.0)).sin()).collect()
        };
        let pts = |a: &CscMatrix| a.values.iter().map(|&x| Interval::point(x)).collect::<Vec<_>>();
        let (kv, mv) = (pts(&k), pts(&m));
        let sigma = certify_lambda_min_lower(&k, &kv).unwrap();
        let modes: Vec<(f64, Vec<f64>)> = (1..=3).map(|j| (lam(j), phi(j))).collect();
        let iso = isolate_modes(&k, &kv, &m, &mv, sigma, &modes).unwrap();
        for (j, im) in iso.iter().enumerate() {
            assert!(im.lower_cut < lam(j + 1) && lam(j + 1) < im.upper_cut, "{im:?}");
            assert!(im.upper_cut < lam(j + 2), "{im:?}");
            assert!(im.nu_radius < 1e-12 * im.nu_hat, "{im:?}");
        }
        // A missing mode, a repeated frequency or unsorted modes are refused.
        assert!(isolate_modes(&k, &kv, &m, &mv, sigma, &[modes[0].clone(), modes[2].clone()]).is_err());
        assert!(isolate_modes(&k, &kv, &m, &mv, sigma, &[modes[0].clone(), modes[0].clone()]).is_err());
        assert!(isolate_modes(&k, &kv, &m, &mv, sigma, &[modes[1].clone(), modes[0].clone()]).is_err());
    }
}
