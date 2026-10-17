//! Certified response-spectrum results. See "Response spectrum" in
//! `docs/verification/CERTIFY.md`.
//!
//! The certified quantity is the spectral response (SRSS or CQC, as the solver
//! combines) of the **exact lowest `m` modes** of the pencil `(K, M)` — `m` the
//! number of modes given — with the spectrum evaluated at the exact periods.
//! Nothing the input says about frequencies, participation factors or
//! effective masses is trusted; the given mode shapes and ω are candidates.
//!
//! Per mode, with `C = K^{-1/2}MK^{-1/2}`, `y = K^{1/2}φ`, `b = K^{-1/2}Mr`
//! (`r` the influence vector), the exact peak modal displacement is
//!
//! `u* = φ (φᵀMr)/(φᵀMφ) · Sa(T)/ω² = K^{-1/2} Π b · Sa(T)`,
//!
//! `Π = yyᵀ/‖y‖²` the eigenprojector (λν = 1). For the computed φ̃ (Π̃ from
//! ỹ = K^{1/2}φ̃), `K^{-1/2}Π̃b = φ̃ (φ̃ᵀMr)/(φ̃ᵀKφ̃)`, so
//!
//! `‖u* − α φ̃‖ ≤ sinθ ‖Mr‖ |Sa| / σ_K`,  `α = (φ̃ᵀMr)/(φ̃ᵀKφ̃) · Sa(T)`,
//!
//! with `sinθ = ‖Π − Π̃‖₂ ≤ ρ/δ` (Davis–Kahan, single vector: residual ρ, gap δ
//! from the certified isolation of each mode, `modal::isolate_modes`).

// `!(x > 0.0)` is deliberate throughout: it also rejects NaN.
#![allow(clippy::neg_cmp_op_on_partial_ord)]

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::forces::{force_bounds_2d, force_bounds_3d};
use super::interval::Interval;
use super::modal::isolate_modes;
use super::sparse::certify_lambda_min_lower;
use crate::linalg::sparse::CscMatrix;
use crate::solver::assembly::assemble_stiffness_sparse_3d;
use crate::solver::dof::DofNumbering;
use crate::solver::linear::{compute_internal_forces_2d_with_loads, compute_internal_forces_3d_with_loads};
use crate::solver::mass_matrix::{assemble_mass_matrix_2d_sparse, assemble_mass_matrix_3d_sparse};
use crate::solver::sparse_assembly::assemble_stiffness_sparse_2d;
use crate::solver::spectral::{solve_spectral_2d, solve_spectral_3d, SpectralResult, SpectralResult3D};
use crate::types::*;

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

#[inline]
fn down(x: f64) -> f64 {
    x.next_down()
}

/// A certified real interval `[lo, hi]`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Enclosure {
    pub lo: f64,
    pub hi: f64,
}

impl Enclosure {
    fn of(i: Interval) -> Self {
        Enclosure { lo: i.lo, hi: i.hi }
    }

    /// Upper bound on |exact − x| for every exact value in the enclosure.
    pub fn error_of(&self, x: f64) -> f64 {
        up(up(self.hi - x).max(up(x - self.lo))).max(0.0)
    }

    pub fn contains(&self, x: f64) -> bool {
        self.lo <= x && x <= self.hi
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralModeBound {
    /// Position of the mode in the input (1-based).
    pub mode: usize,
    pub omega2: Enclosure,
    pub period: Enclosure,
    /// Spectral acceleration with the g / importance / reduction factors applied.
    pub sa: Enclosure,
    /// Bound on sin∠(φ̃, φ) in the K-inner product (= ‖Π − Π̃‖₂).
    pub sin_theta: f64,
    /// `‖u* − αφ̃‖₂` bound for the peak modal displacement vector.
    pub shape_error: f64,
}

/// Enclosures of one node's (2D: ux, uz, ry; 3D: ux, uy, uz, rx, ry, rz) or one
/// element's (2D: N, V, M; 3D: N, Vy, Vz, Mx, My, Mz) combined values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemEnclosure {
    pub id: usize,
    pub values: Vec<Enclosure>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum SpectralCertificate {
    Certified {
        modes: Vec<SpectralModeBound>,
        displacements: Vec<ItemEnclosure>,
        element_forces: Vec<ItemEnclosure>,
        base_shear: Enclosure,
        /// Upper bounds on |exact − reported| over all displacement components,
        /// element force components, and for the base shear.
        max_displacement_error: f64,
        max_force_error: f64,
        base_shear_error: f64,
        /// Every reported value lies inside its enclosure.
        reported_within: bool,
    },
    Uncertified { reason: String },
}

impl SpectralCertificate {
    fn uncertified(reason: impl Into<String>) -> Self {
        SpectralCertificate::Uncertified { reason: reason.into() }
    }

    pub fn is_certified(&self) -> bool {
        matches!(self, SpectralCertificate::Certified { .. })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedSpectral2D {
    pub results: SpectralResult,
    pub certificate: SpectralCertificate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedSpectral3D {
    pub results: SpectralResult3D,
    pub certificate: SpectralCertificate,
}

/// Solve 2D spectral analysis and certify it.
pub fn certify_spectral_2d(input: &SpectralInput) -> Result<CertifiedSpectral2D, String> {
    let results = solve_spectral_2d(input)?;
    let certificate = certify_spectral_results_2d(input, &results);
    Ok(CertifiedSpectral2D { results, certificate })
}

/// Solve 3D spectral analysis and certify it.
pub fn certify_spectral_3d(input: &SpectralInput3D) -> Result<CertifiedSpectral3D, String> {
    let results = solve_spectral_3d(input)?;
    let certificate = certify_spectral_results_3d(input, &results);
    Ok(CertifiedSpectral3D { results, certificate })
}

/// The data the certificate needs, dimension-independent.
struct Problem<'a> {
    k: CscMatrix,
    m: CscMatrix,
    /// Computed (λ̃ = ω̃², φ̃ on free DOFs), in input order.
    modes: Vec<(f64, Vec<f64>)>,
    /// Influence vector on free DOFs.
    r: Vec<f64>,
    spectrum: &'a DesignSpectrum,
    /// (9.81 if in g)·importance/reduction, enclosed.
    scale: Interval,
    /// CQC damping ratio, None for SRSS.
    cqc_xi: Option<f64>,
}

/// Certified per-mode quantities.
struct ModeCore {
    bound: SpectralModeBound,
    /// u* ∈ α φ̃ + B(e).
    alpha: Interval,
    e: f64,
    omega: Interval,
    sa: Interval,
    /// Exact effective mass enclosure.
    meff: Interval,
}

fn certify_2d_inner(input: &SpectralInput, results: &SpectralResult) -> Result<SpectralCertificate, String> {
    let solver = &input.solver;
    if !solver.constraints.is_empty() {
        return Err("unsupported: constraints".into());
    }
    let dof = DofNumbering::build_2d(solver);
    let nf = dof.n_free;
    let stiff = assemble_stiffness_sparse_2d(solver, &dof);
    if !stiff.inclined_transforms_2d.is_empty() {
        return Err("unsupported: inclined supports".into());
    }
    let m = assemble_mass_matrix_2d_sparse(solver, &dof, &input.densities);
    let modes = input
        .modes
        .iter()
        .map(|md| {
            let mut phi = vec![0.0; nf];
            for d in &md.displacements {
                for (local, v) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
                    if let Some(&g) = dof.map.get(&(d.node_id, local)) {
                        if g < nf {
                            phi[g] = v;
                        }
                    }
                }
            }
            (md.omega * md.omega, phi)
        })
        .collect();
    let dir = if input.direction == "X" { 0 } else { 1 };
    let p = Problem {
        k: stiff.k_ff,
        m,
        modes,
        r: influence(&dof, dir),
        spectrum: &input.spectrum,
        scale: scale(&input.spectrum, input.importance_factor, input.reduction_factor),
        cqc_xi: cqc_xi(input.rule.as_deref(), input.xi),
    };
    let cores = mode_cores(&p)?;
    let n_comp = 3;
    let full = |u: &[f64]| {
        let mut v = vec![0.0; dof.n_total];
        v[..nf].copy_from_slice(u);
        v
    };
    let forces = |u: &[f64]| -> Vec<(usize, Vec<f64>)> {
        compute_internal_forces_2d_with_loads(solver, &[], &dof, &full(u))
            .iter()
            .map(|f| {
                (
                    f.element_id,
                    vec![
                        f.n_start.abs().max(f.n_end.abs()),
                        f.v_start.abs().max(f.v_end.abs()),
                        f.m_start.abs().max(f.m_end.abs()),
                    ],
                )
            })
            .collect()
    };
    let bounds = |b: f64| -> HashMap<usize, Vec<f64>> {
        force_bounds_2d(solver, b).into_iter().map(|f| (f.element_id, vec![f.n, f.v, f.m])).collect()
    };
    let reported_disp: HashMap<usize, Vec<f64>> =
        results.displacements.iter().map(|d| (d.node_id, vec![d.ux, d.uz, d.ry])).collect();
    let reported_forces: HashMap<usize, Vec<f64>> =
        results.element_forces.iter().map(|f| (f.element_id, vec![f.n_max, f.v_max, f.m_max])).collect();
    finish(&p, &dof, &cores, n_comp, &forces, &bounds, &reported_disp, &reported_forces, results.base_shear)
}

fn certify_3d_inner(input: &SpectralInput3D, results: &SpectralResult3D) -> Result<SpectralCertificate, String> {
    let solver = &input.solver;
    if !solver.constraints.is_empty() {
        return Err("unsupported: constraints".into());
    }
    if !solver.curved_beams.is_empty() {
        return Err("unsupported: curved beams".into());
    }
    let dof = DofNumbering::build_3d(solver);
    if dof.dofs_per_node > 6 {
        return Err("unsupported: warping DOFs (spectral modes carry no warping)".into());
    }
    let nf = dof.n_free;
    let stiff = assemble_stiffness_sparse_3d(solver, &dof, false);
    if !stiff.inclined_transforms.is_empty() {
        return Err("unsupported: inclined supports".into());
    }
    let m = assemble_mass_matrix_3d_sparse(solver, &dof, &input.densities);
    let modes = input
        .modes
        .iter()
        .map(|md| {
            let mut phi = vec![0.0; nf];
            for d in &md.displacements {
                for (local, v) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].into_iter().enumerate() {
                    if let Some(&g) = dof.map.get(&(d.node_id, local)) {
                        if g < nf {
                            phi[g] = v;
                        }
                    }
                }
            }
            (md.omega * md.omega, phi)
        })
        .collect();
    let dir = match input.direction.as_str() {
        "X" => 0,
        "Y" => 1,
        _ => 2,
    };
    let p = Problem {
        k: stiff.k_ff,
        m,
        modes,
        r: influence(&dof, dir),
        spectrum: &input.spectrum,
        scale: scale(&input.spectrum, input.importance_factor, input.reduction_factor),
        cqc_xi: cqc_xi(input.rule.as_deref(), input.xi),
    };
    let cores = mode_cores(&p)?;
    let full = |u: &[f64]| {
        let mut v = vec![0.0; dof.n_total];
        v[..nf].copy_from_slice(u);
        v
    };
    let forces = |u: &[f64]| -> Vec<(usize, Vec<f64>)> {
        compute_internal_forces_3d_with_loads(solver, &[], &dof, &full(u))
            .iter()
            .map(|f| {
                let mx = |a: f64, b: f64| a.abs().max(b.abs());
                (
                    f.element_id,
                    vec![
                        mx(f.n_start, f.n_end),
                        mx(f.vy_start, f.vy_end),
                        mx(f.vz_start, f.vz_end),
                        mx(f.mx_start, f.mx_end),
                        mx(f.my_start, f.my_end),
                        mx(f.mz_start, f.mz_end),
                    ],
                )
            })
            .collect()
    };
    let bounds = |b: f64| -> HashMap<usize, Vec<f64>> {
        force_bounds_3d(solver, b).into_iter().map(|f| (f.element_id, vec![f.n, f.vy, f.vz, f.t, f.my, f.mz])).collect()
    };
    let reported_disp: HashMap<usize, Vec<f64>> =
        results.displacements.iter().map(|d| (d.node_id, vec![d.ux, d.uy, d.uz, d.rx, d.ry, d.rz])).collect();
    let reported_forces: HashMap<usize, Vec<f64>> = results
        .element_forces
        .iter()
        .map(|f| (f.element_id, vec![f.n_max, f.vy_max, f.vz_max, f.mx_max, f.my_max, f.mz_max]))
        .collect();
    finish(&p, &dof, &cores, 6, &forces, &bounds, &reported_disp, &reported_forces, results.base_shear)
}

/// Certify given 2D spectral results of `input`.
pub fn certify_spectral_results_2d(input: &SpectralInput, results: &SpectralResult) -> SpectralCertificate {
    certify_2d_inner(input, results).unwrap_or_else(SpectralCertificate::uncertified)
}

/// Certify given 3D spectral results of `input`.
pub fn certify_spectral_results_3d(input: &SpectralInput3D, results: &SpectralResult3D) -> SpectralCertificate {
    certify_3d_inner(input, results).unwrap_or_else(SpectralCertificate::uncertified)
}

fn influence(dof: &DofNumbering, dir: usize) -> Vec<f64> {
    let mut r = vec![0.0; dof.n_free];
    for &node in &dof.node_order {
        if let Some(&d) = dof.map.get(&(node, dir)) {
            if d < dof.n_free {
                r[d] = 1.0;
            }
        }
    }
    r
}

fn scale(spectrum: &DesignSpectrum, importance: Option<f64>, reduction: Option<f64>) -> Interval {
    let g = if spectrum.in_g.unwrap_or(true) { 9.81 } else { 1.0 };
    let i = importance.unwrap_or(1.0);
    let r = reduction.unwrap_or(1.0);
    (Interval::point(g) * Interval::point(i)).div(Interval::point(r))
}

fn cqc_xi(rule: Option<&str>, xi: Option<f64>) -> Option<f64> {
    match rule.unwrap_or("CQC") {
        "SRSS" => None,
        _ => Some(xi.unwrap_or(0.05)),
    }
}

/// Exact range of the piecewise-linear spectrum (constant beyond its ends, as
/// `interpolate_spectrum`) over the periods `[t.lo, t.hi]`.
pub(crate) fn spectrum_range(points: &[SpectrumPoint], t: Interval) -> Result<Interval, String> {
    if points.is_empty() {
        return Ok(Interval::ZERO);
    }
    if !points.iter().all(|p| p.period.is_finite() && p.sa.is_finite())
        || points.windows(2).any(|w| !(w[0].period < w[1].period))
    {
        return Err("spectrum periods must be finite and strictly increasing".into());
    }
    if !t.is_finite() {
        return Err("non-finite period".into());
    }
    let eval = |x: f64| -> Interval {
        let first = &points[0];
        let last = &points[points.len() - 1];
        if x <= first.period {
            return Interval::point(first.sa);
        }
        if x >= last.period {
            return Interval::point(last.sa);
        }
        let i = points.windows(2).position(|w| x >= w[0].period && x <= w[1].period).expect("bracketed");
        let (a, b) = (&points[i], &points[i + 1]);
        let p = Interval::point;
        p(a.sa) + (p(x) - p(a.period)).div(p(b.period) - p(a.period)) * (p(b.sa) - p(a.sa))
    };
    let (ea, eb) = (eval(t.lo), eval(t.hi));
    let mut lo = ea.lo.min(eb.lo);
    let mut hi = ea.hi.max(eb.hi);
    for p in points.iter().filter(|p| t.lo < p.period && p.period < t.hi) {
        lo = lo.min(p.sa);
        hi = hi.max(p.sa);
    }
    let r = Interval::new(lo, hi);
    if r.is_finite() { Ok(r) } else { Err("non-finite spectral ordinate".into()) }
}

/// Interval `y = A x` for symmetric A stored as its lower triangle (f64 exact).
fn sym_mul(a: &CscMatrix, x: &[f64]) -> Vec<Interval> {
    let p = Interval::point;
    let mut y = vec![Interval::ZERO; a.n];
    for j in 0..a.n {
        for q in a.col_ptr[j]..a.col_ptr[j + 1] {
            let i = a.row_idx[q];
            y[i] = y[i] + p(a.values[q]) * p(x[j]);
            if i != j {
                y[j] = y[j] + p(a.values[q]) * p(x[i]);
            }
        }
    }
    y
}

fn dot(x: &[f64], y: &[Interval]) -> Interval {
    x.iter().zip(y).fold(Interval::ZERO, |s, (&a, &b)| s + Interval::point(a) * b)
}

fn norm_up(v: &[Interval]) -> Option<f64> {
    super::pdelta::norm_up(v)
}

/// The certified per-mode quantities, in input order.
fn mode_cores(p: &Problem) -> Result<Vec<ModeCore>, String> {
    let n = p.k.n;
    if p.modes.is_empty() {
        return Err("no modes".into());
    }
    if p.m.n != n || p.r.len() != n {
        return Err("dimension mismatch".into());
    }
    let kv: Vec<Interval> = p.k.values.iter().map(|&x| Interval::point(x)).collect();
    let mv: Vec<Interval> = p.m.values.iter().map(|&x| Interval::point(x)).collect();
    if !kv.iter().chain(&mv).all(|x| x.is_finite()) {
        return Err("non-finite K or M entry".into());
    }
    let sigma_k = certify_lambda_min_lower(&p.k, &kv).map_err(|e| format!("K not certified positive definite: {e}"))?;

    // Isolation in ascending order of ω̃².
    let mut order: Vec<usize> = (0..p.modes.len()).collect();
    order.sort_by(|&a, &b| p.modes[a].0.total_cmp(&p.modes[b].0));
    let sorted: Vec<(f64, Vec<f64>)> = order.iter().map(|&i| p.modes[i].clone()).collect();
    let iso = isolate_modes(&p.k, &kv, &p.m, &mv, sigma_k, &sorted)?;

    let mr = sym_mul(&p.m, &p.r);
    let mr_norm = norm_up(&mr).ok_or("non-finite M·r")?;
    let two_pi = Interval::new(2.0 * std::f64::consts::PI, up(2.0 * std::f64::consts::PI));
    let mut out: Vec<Option<ModeCore>> = (0..p.modes.len()).map(|_| None).collect();
    for (&idx, is) in order.iter().zip(&iso) {
        let phi = &p.modes[idx].1;
        // λ: the bracket (μ_{i−1}, μ_i), tightened by the Bauer–Fike ball when
        // that ball lies inside the bracket's ν-range.
        let nu_lo = down(is.nu_hat - is.nu_radius);
        let nu_hi = up(is.nu_hat + is.nu_radius);
        let cut_nu_hi = if is.lower_cut > 0.0 { down(1.0 / is.lower_cut) } else { f64::INFINITY };
        let cut_nu_lo = up(1.0 / is.upper_cut);
        let mut lam = Interval::new(is.lower_cut, is.upper_cut);
        if nu_lo > cut_nu_lo && nu_hi < cut_nu_hi && nu_lo > 0.0 {
            lam = Interval::new(down(1.0 / nu_hi).max(lam.lo), up(1.0 / nu_lo).min(lam.hi));
        }
        if !(lam.lo > 0.0) || !lam.is_finite() {
            return Err(format!("mode {}: ω² not bounded away from 0", idx + 1));
        }
        // Davis–Kahan: every other eigenvalue ν_k is ≥ 1/μ_{i−1} or ≤ 1/μ_i.
        let gap = down(cut_nu_hi - is.nu_hat).min(down(is.nu_hat - cut_nu_lo));
        let sin_theta = if gap > 0.0 { up(is.nu_radius / gap).min(1.0) } else { 1.0 };

        let omega = lam.sqrt();
        let period = two_pi.div(omega);
        let sa = spectrum_range(&p.spectrum.points, period)? * p.scale;
        let kphi = sym_mul(&p.k, phi);
        let pkp = dot(phi, &kphi);
        if !(pkp.lo > 0.0) {
            return Err(format!("mode {}: φᵀKφ not certified positive", idx + 1));
        }
        let pmr = dot(phi, &mr);
        let alpha = pmr.div(pkp) * sa;
        let e = up(up(up(sin_theta * mr_norm) * sa.mag()) / sigma_k);
        // meff = λ‖Πb‖², ‖Πb‖ ∈ |φ̃ᵀMr|/√(φ̃ᵀKφ̃) ± sinθ‖Mr‖/√σ_K.
        let abs_pmr = if pmr.contains_zero() {
            Interval::new(0.0, pmr.mag())
        } else {
            Interval::new(pmr.lo.abs().min(pmr.hi.abs()), pmr.mag())
        };
        let pm = abs_pmr.div(pkp.sqrt());
        let slack = up(up(sin_theta * mr_norm) / down(sigma_k.sqrt()));
        let pi = Interval::new(down(pm.lo - slack).max(0.0), up(pm.hi + slack));
        let meff = lam * pi.square();
        if !alpha.is_finite() || !e.is_finite() || !meff.is_finite() {
            return Err(format!("mode {}: non-finite modal quantity", idx + 1));
        }
        out[idx] = Some(ModeCore {
            bound: SpectralModeBound {
                mode: idx + 1,
                omega2: Enclosure::of(lam),
                period: Enclosure::of(period),
                sa: Enclosure::of(sa),
                sin_theta,
                shape_error: e,
            },
            alpha,
            e,
            omega,
            sa,
            meff,
        });
    }
    Ok(out.into_iter().map(|c| c.expect("every mode isolated")).collect())
}

/// CQC correlation coefficients on the ω enclosures (ρ_ii = 1 exactly).
fn cqc_matrix(cores: &[ModeCore], xi: f64) -> Result<Vec<Vec<Interval>>, String> {
    let p = Interval::point;
    let x2 = p(xi) * p(xi);
    let nm = cores.len();
    let mut rho = vec![vec![Interval::ZERO; nm]; nm];
    for i in 0..nm {
        for j in 0..nm {
            if i == j {
                rho[i][j] = p(1.0);
                continue;
            }
            let r = cores[j].omega.div(cores[i].omega);
            let one_r = p(1.0) + r;
            let num = p(8.0) * x2 * one_r * (r * r.sqrt());
            let den = (p(1.0) - r.square()).square() + p(4.0) * x2 * r * one_r.square();
            let v = num.div(den);
            if !v.is_finite() {
                return Err("CQC coefficient not enclosed (coincident frequencies?)".into());
            }
            rho[i][j] = v;
        }
    }
    Ok(rho)
}

/// SRSS (`rho = None`) or CQC combination of per-mode enclosures.
fn combine(vals: &[Interval], rho: Option<&Vec<Vec<Interval>>>) -> Interval {
    let s = match rho {
        None => vals.iter().fold(Interval::ZERO, |s, v| s + v.square()),
        Some(rho) => {
            let mut s = Interval::ZERO;
            for (i, vi) in vals.iter().enumerate() {
                for (j, vj) in vals.iter().enumerate() {
                    s = s + if i == j { vi.square() } else { *vi * rho[i][j] * *vj };
                }
            }
            s
        }
    };
    if !s.is_finite() {
        return Interval::NAN;
    }
    let abs = if s.contains_zero() { Interval::new(0.0, s.mag()) } else if s.lo > 0.0 { s } else { -s };
    abs.sqrt()
}

/// Per-member force components (max |start|, |end|) at a modal displacement.
type ForcesFn<'a> = dyn Fn(&[f64]) -> Vec<(usize, Vec<f64>)> + 'a;
/// Per-member force error bounds for a displacement error bound.
type BoundsFn<'a> = dyn Fn(f64) -> HashMap<usize, Vec<f64>> + 'a;

#[allow(clippy::too_many_arguments)]
fn finish(
    p: &Problem,
    dof: &DofNumbering,
    cores: &[ModeCore],
    n_comp: usize,
    forces: &ForcesFn,
    bounds: &BoundsFn,
    reported_disp: &HashMap<usize, Vec<f64>>,
    reported_forces: &HashMap<usize, Vec<f64>>,
    reported_base_shear: f64,
) -> Result<SpectralCertificate, String> {
    let nf = dof.n_free;
    let rho = match p.cqc_xi {
        Some(xi) => Some(cqc_matrix(cores, xi)?),
        None => None,
    };
    let mut within = true;

    // Displacements: u*_ik ∈ α_i φ̃_ik ± e_i.
    let mut disp_comb = vec![Interval::ZERO; nf];
    for (k, slot) in disp_comb.iter_mut().enumerate() {
        let vals: Vec<Interval> = cores
            .iter()
            .zip(&p.modes)
            .map(|(c, (_, phi))| c.alpha * Interval::point(phi[k]) + Interval::new(-c.e, c.e))
            .collect();
        *slot = combine(&vals, rho.as_ref());
        if !slot.is_finite() {
            return Err(format!("non-finite displacement enclosure at DOF {k}"));
        }
    }
    let mut displacements = Vec::new();
    let mut max_disp_err = 0.0f64;
    let mut nodes: Vec<usize> = dof.node_order.clone();
    nodes.sort_unstable();
    for node in nodes {
        let mut values = Vec::with_capacity(n_comp);
        for local in 0..n_comp {
            let iv = match dof.map.get(&(node, local)) {
                Some(&g) if g < nf => disp_comb[g],
                _ => Interval::ZERO,
            };
            values.push(Enclosure::of(iv));
        }
        if let Some(rep) = reported_disp.get(&node) {
            for (e, &x) in values.iter().zip(rep) {
                max_disp_err = max_disp_err.max(e.error_of(x));
                within &= e.contains(x);
            }
        } else {
            return Err(format!("no reported displacement for node {node}"));
        }
        displacements.push(ItemEnclosure { id: node, values });
    }

    // Element forces: per mode at ũ_i = mid(α_i)·φ̃ with ‖u* − ũ_i‖ ≤ b_i.
    let mut per_elem: HashMap<usize, Vec<Vec<Interval>>> = HashMap::new();
    for (c, (_, phi)) in cores.iter().zip(&p.modes) {
        let a_mid = 0.5 * c.alpha.lo + 0.5 * c.alpha.hi;
        let u_mid: Vec<f64> = phi.iter().map(|&x| a_mid * x).collect();
        let diff: Vec<Interval> = phi
            .iter()
            .zip(&u_mid)
            .map(|(&x, &um)| c.alpha * Interval::point(x) - Interval::point(um))
            .collect();
        let b = up(c.e + norm_up(&diff).ok_or("non-finite modal displacement")?);
        let fb = bounds(b);
        for (id, vals) in forces(&u_mid) {
            let Some(db) = fb.get(&id) else {
                return Err(format!("no force bound for element {id}"));
            };
            let encl: Vec<Interval> = vals
                .iter()
                .zip(db)
                .map(|(&v, &d)| Interval::new(down(v - d).max(0.0), up(v + d)))
                .collect();
            per_elem.entry(id).or_default().push(encl);
        }
    }
    let mut element_forces = Vec::new();
    let mut max_force_err = 0.0f64;
    let mut ids: Vec<usize> = per_elem.keys().copied().collect();
    ids.sort_unstable();
    for id in ids {
        let modes = &per_elem[&id];
        if modes.len() != cores.len() {
            return Err(format!("element {id} missing in some mode"));
        }
        let mut values = Vec::with_capacity(n_comp);
        for comp in 0..n_comp {
            let vals: Vec<Interval> = modes.iter().map(|m| m[comp]).collect();
            let iv = combine(&vals, rho.as_ref());
            if !iv.is_finite() {
                return Err(format!("non-finite force enclosure for element {id}"));
            }
            values.push(Enclosure::of(iv));
        }
        let Some(rep) = reported_forces.get(&id) else {
            return Err(format!("no reported forces for element {id}"));
        };
        for (e, &x) in values.iter().zip(rep) {
            max_force_err = max_force_err.max(e.error_of(x));
            within &= e.contains(x);
        }
        element_forces.push(ItemEnclosure { id, values });
    }

    // Base shear: SRSS of meff_i·Sa_i (the solver always uses SRSS here).
    let shear_vals: Vec<Interval> = cores.iter().map(|c| c.meff * c.sa).collect();
    let bs = combine(&shear_vals, None);
    if !bs.is_finite() {
        return Err("non-finite base shear enclosure".into());
    }
    let base_shear = Enclosure::of(bs);
    within &= base_shear.contains(reported_base_shear);
    Ok(SpectralCertificate::Certified {
        modes: cores.iter().map(|c| c.bound.clone()).collect(),
        displacements,
        element_forces,
        base_shear,
        max_displacement_error: max_disp_err,
        max_force_error: max_force_err,
        base_shear_error: base_shear.error_of(reported_base_shear),
        reported_within: within,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pts(v: &[(f64, f64)]) -> Vec<SpectrumPoint> {
        v.iter().map(|&(period, sa)| SpectrumPoint { period, sa }).collect()
    }

    #[test]
    fn spectrum_range_covers_breakpoints_and_ends() {
        let s = pts(&[(0.0, 1.0), (0.2, 2.5), (0.6, 2.5), (2.0, 0.5)]);
        // Plateau and the rising branch: max 2.5 at the breakpoint.
        let r = spectrum_range(&s, Interval::new(0.1, 0.3)).unwrap();
        assert!(r.lo <= 1.75 && r.lo > 1.74 && r.hi >= 2.5 && r.hi < 2.5 + 1e-12, "{r:?}");
        // Descending branch only.
        let r = spectrum_range(&s, Interval::new(1.0, 1.3)).unwrap();
        let f = |t: f64| 2.5 + (t - 0.6) / 1.4 * (0.5 - 2.5);
        assert!(r.lo <= f(1.3) && f(1.0) <= r.hi && r.hi - r.lo < 0.5, "{r:?}");
        // Beyond the ends: constant.
        let r = spectrum_range(&s, Interval::new(3.0, 4.0)).unwrap();
        assert_eq!((r.lo, r.hi), (0.5, 0.5));
        // Unsorted spectrum refused.
        assert!(spectrum_range(&pts(&[(1.0, 1.0), (0.5, 2.0)]), Interval::new(0.6, 0.7)).is_err());
    }

    #[test]
    fn combine_srss_and_cqc() {
        let v = [Interval::new(3.0, 3.0), Interval::new(-4.0, -4.0)];
        let s = combine(&v, None);
        assert!(s.lo <= 5.0 && 5.0 <= s.hi && s.hi - s.lo < 1e-14);
        // CQC with ρ = identity equals SRSS; with ρ12 = 1 it is |3 − 4| = 1.
        let id = vec![vec![Interval::point(1.0), Interval::ZERO], vec![Interval::ZERO, Interval::point(1.0)]];
        let c = combine(&v, Some(&id));
        assert!(c.lo <= 5.0 && 5.0 <= c.hi);
        let full = vec![vec![Interval::point(1.0); 2]; 2];
        let c = combine(&v, Some(&full));
        assert!(c.lo <= 1.0 && 1.0 <= c.hi && c.hi < 1.0 + 1e-12);
    }
}
