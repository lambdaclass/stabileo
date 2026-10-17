//! Certified harmonic (steady-state) response. See "Harmonic response" in
//! `docs/verification/CERTIFY.md`.
//!
//! At each frequency the exact steady state solves the complex system
//! `A u = f`, `A = K_d + iωC`, `K_d = K − ω²M`, `C = a₀M + a₁K` (the Rayleigh
//! damping the solver uses). `K`, `M` symmetric real, so for complex `x`
//! `xᴴK_dx` and `xᴴCx` are real and, for any `s ≥ 0`,
//!
//! `Re((1 − is)·xᴴAx) = xᴴ(K_d + sωC)x = xᴴB(s)x`, `B(s) = (1 + sωa₁)K − (ω² − sωa₀)M`.
//!
//! If `λ_min(B(s)) ≥ μ_s > 0` (Gram residual + Gershgorin on the real n×n
//! `B(s)`, enclosed entrywise), then `√(1+s²)·‖x‖‖Ax‖ ≥ |(1 − is)xᴴAx| ≥ μ_s‖x‖²`,
//! so `‖Ax‖ ≥ μ‖x‖`, `μ = μ_s/√(1+s²)`: `A` is invertible and
//! `‖u* − ũ‖₂ ≤ ‖f − Aũ‖₂ / μ` (complex 2-norm). Below the first resonance `s = 0`
//! works (`K_d ≻ 0`); above it damping supplies the coercivity (`s > 0`).
//! No 2n×2n matrix and no normal equations are formed.
//!
//! The candidate `ũ` is computed here (the solver reports only the target DOF,
//! by modal superposition with a static correction): CG on `(I + W²)u = (I − iW)H⁻¹(1 − is)f`,
//! `H = B(s)`, `W = H⁻¹(ωC − sK_d)`, in the H-inner product, plus refinement.
//! The reported target value is then bounded by `‖u* − ũ‖ + |ũ_t − reported|`,
//! which includes the solver's remaining modal truncation error.

// `!(x > 0.0)` is deliberate throughout: it also rejects NaN.
#![allow(clippy::neg_cmp_op_on_partial_ord)]

use std::rc::Rc;

use serde::{Deserialize, Serialize};

use super::interval::Interval;
use super::modal::{union_pattern, Pattern};
use super::pdelta::norm_up;
use super::spectral::Enclosure;
use super::sparse::certify_lambda_min_lower;
use crate::linalg::sparse::CscMatrix;
use crate::linalg::sparse_chol::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky};
use crate::solver::assembly::{assemble_load_vector_2d, assemble_sparse_3d};
use crate::solver::dof::DofNumbering;
use crate::solver::harmonic::{
    solve_harmonic_2d_with_damping, solve_harmonic_3d_with_damping, HarmonicInput, HarmonicInput3D, HarmonicResult,
};
use crate::solver::mass_matrix::{assemble_mass_matrix_2d_sparse, assemble_mass_matrix_3d_sparse};
use crate::solver::sparse_assembly::assemble_stiffness_sparse_2d;

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

#[inline]
fn down(x: f64) -> f64 {
    x.next_down()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonicPointBound {
    pub frequency: f64,
    pub omega: f64,
    /// `‖u* − ũ‖₂` over all free DOFs (complex), ũ the certificate's own solution.
    pub abs_bound: f64,
    /// Certified `‖Ax‖ ≥ mu‖x‖`.
    pub mu: f64,
    /// The rotation `s` used (`0`: plain coercivity of `K − ω²M`).
    pub shift: f64,
    /// Enclosures of the exact target response.
    pub real: Enclosure,
    pub imag: Enclosure,
    pub amplitude: Enclosure,
    /// Bound on `|u*_t − reported_t|` (complex modulus).
    pub reported_error: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum HarmonicCertificate {
    Certified {
        /// Rayleigh coefficients of the certified model, `C = a0·M + a1·K`.
        a0: f64,
        a1: f64,
        points: Vec<HarmonicPointBound>,
        /// Enclosure of the exact peak amplitude over the sampled frequencies.
        peak_amplitude: Enclosure,
        max_reported_error: f64,
        /// Every reported real/imag/amplitude lies inside its enclosure.
        reported_within: bool,
    },
    Uncertified { reason: String },
}

impl HarmonicCertificate {
    pub fn is_certified(&self) -> bool {
        matches!(self, HarmonicCertificate::Certified { .. })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedHarmonic {
    pub results: HarmonicResult,
    pub certificate: HarmonicCertificate,
}

/// Solve 2D harmonic analysis and certify the response at every frequency.
pub fn certify_harmonic_2d(input: &HarmonicInput) -> Result<CertifiedHarmonic, String> {
    let (results, damping) = solve_harmonic_2d_with_damping(input)?;
    let certificate = certify_harmonic_results_2d(input, &results, damping);
    Ok(CertifiedHarmonic { results, certificate })
}

/// Solve 3D harmonic analysis and certify the response at every frequency.
pub fn certify_harmonic_3d(input: &HarmonicInput3D) -> Result<CertifiedHarmonic, String> {
    let (results, damping) = solve_harmonic_3d_with_damping(input)?;
    let certificate = certify_harmonic_results_3d(input, &results, damping);
    Ok(CertifiedHarmonic { results, certificate })
}

fn target(dof: &DofNumbering, node: usize, local: Option<usize>) -> Result<usize, String> {
    let local = local.ok_or("unknown response DOF")?;
    match dof.map.get(&(node, local)) {
        Some(&d) if d < dof.n_free => Ok(d),
        _ => Err("response DOF missing or restrained".into()),
    }
}

/// Certify given 2D harmonic results; `damping = (a₀, a₁)` defines the model.
pub fn certify_harmonic_results_2d(
    input: &HarmonicInput,
    results: &HarmonicResult,
    damping: (f64, f64),
) -> HarmonicCertificate {
    let run = || -> Result<HarmonicCertificate, String> {
        let s = &input.solver;
        if !s.constraints.is_empty() {
            return Err("unsupported: constraints".into());
        }
        let dof = DofNumbering::build_2d(s);
        let stiff = assemble_stiffness_sparse_2d(s, &dof);
        if !stiff.inclined_transforms_2d.is_empty() {
            return Err("unsupported: inclined supports".into());
        }
        let f = assemble_load_vector_2d(s, &s.loads, &dof, &[]);
        let m = assemble_mass_matrix_2d_sparse(s, &dof, &input.densities);
        let local = match input.response_dof.as_str() {
            "x" => Some(0),
            "y" => Some(1),
            "rz" => Some(2),
            _ => None,
        };
        let t = target(&dof, input.response_node_id, local)?;
        Ok(certify_sweep(&stiff.k_ff, &m, &f[..dof.n_free], damping, t, results))
    };
    run().unwrap_or_else(|reason| HarmonicCertificate::Uncertified { reason })
}

/// Certify given 3D harmonic results; `damping = (a₀, a₁)` defines the model.
pub fn certify_harmonic_results_3d(
    input: &HarmonicInput3D,
    results: &HarmonicResult,
    damping: (f64, f64),
) -> HarmonicCertificate {
    let run = || -> Result<HarmonicCertificate, String> {
        // The model the solver analyzed, curved beams expanded.
        let s = &crate::solver::linear::expand_curved_beams_3d(&input.solver);
        if !s.constraints.is_empty() {
            return Err("unsupported: constraints".into());
        }
        let dof = DofNumbering::build_3d(s);
        let asm = assemble_sparse_3d(s, &dof, false);
        if !asm.inclined_transforms.is_empty() {
            return Err("unsupported: inclined supports".into());
        }
        let m = assemble_mass_matrix_3d_sparse(s, &dof, &input.densities);
        let local = ["x", "y", "z", "rx", "ry", "rz", "w"].iter().position(|&d| d == input.response_dof);
        let t = target(&dof, input.response_node_id, local)?;
        Ok(certify_sweep(&asm.k_ff, &m, &asm.f[..dof.n_free], damping, t, results))
    };
    run().unwrap_or_else(|reason| HarmonicCertificate::Uncertified { reason })
}

/// Certify every reported frequency point of `results` for the model
/// `(K − ω²M + iω(a₀M + a₁K)) u = f` at the target DOF `t`.
pub fn certify_sweep(
    k: &CscMatrix,
    m: &CscMatrix,
    f: &[f64],
    (a0, a1): (f64, f64),
    t: usize,
    results: &HarmonicResult,
) -> HarmonicCertificate {
    let uncert = |reason: String| HarmonicCertificate::Uncertified { reason };
    if results.response_points.is_empty() {
        return uncert("no frequency points".into());
    }
    let mut points = Vec::with_capacity(results.response_points.len());
    let mut within = true;
    let mut max_err = 0.0f64;
    let (mut peak_lo, mut peak_hi) = (0.0f64, 0.0f64);
    let mut s_hint = 0.0;
    for p in &results.response_points {
        if p.omega != 2.0 * std::f64::consts::PI * p.frequency {
            return uncert(format!("reported ω {} does not match frequency {}", p.omega, p.frequency));
        }
        let pt = match certify_point(k, m, f, (a0, a1), p.omega, s_hint) {
            Ok(pt) => pt,
            Err(e) => return uncert(format!("f = {} Hz: {e}", p.frequency)),
        };
        s_hint = pt.shift;
        let (ur, ui) = (pt.u_re[t], pt.u_im[t]);
        let b = pt.abs_bound;
        let real = Enclosure { lo: down(ur - b), hi: up(ur + b) };
        let imag = Enclosure { lo: down(ui - b), hi: up(ui + b) };
        let amp = modulus(Interval::point(ur), Interval::point(ui));
        let amplitude = Enclosure { lo: down(amp.lo - b).max(0.0), hi: up(amp.hi + b) };
        // |u*_t − rep| ≤ b + |ũ_t − rep|
        let d = modulus(Interval::point(ur) - Interval::point(p.real), Interval::point(ui) - Interval::point(p.imag));
        let reported_error = up(b + d.hi);
        within &= real.contains(p.real) && imag.contains(p.imag) && amplitude.contains(p.amplitude);
        max_err = max_err.max(reported_error);
        peak_lo = peak_lo.max(amplitude.lo);
        peak_hi = peak_hi.max(amplitude.hi);
        points.push(HarmonicPointBound {
            frequency: p.frequency,
            omega: p.omega,
            abs_bound: b,
            mu: pt.mu,
            shift: pt.shift,
            real,
            imag,
            amplitude,
            reported_error,
        });
    }
    let peak_amplitude = Enclosure { lo: peak_lo, hi: peak_hi };
    within &= peak_amplitude.contains(results.peak_amplitude);
    HarmonicCertificate::Certified { a0, a1, points, peak_amplitude, max_reported_error: max_err, reported_within: within }
}

/// Enclosure of `|re + i·im|`. The sum of squares is ≥ 0 exactly, but its
/// outward rounding takes a zero lower end below 0 (`[0, 0] + [0, 0]` →
/// `[−5e−324, …]`), which `sqrt` rejects as NaN: a zero response, or a
/// reported value equal to the candidate, gave a NaN amplitude enclosure and
/// error bound under a "certified" status. Clamping the lower end at 0 is sound.
fn modulus(re: Interval, im: Interval) -> Interval {
    let s = re.square() + im.square();
    Interval { lo: s.lo.max(0.0), hi: s.hi }.sqrt()
}

/// One certified frequency point.
pub struct PointCertificate {
    pub u_re: Vec<f64>,
    pub u_im: Vec<f64>,
    pub abs_bound: f64,
    pub mu: f64,
    pub shift: f64,
}

/// `B(s) = (1 + sωa₁)K − (ω² − sωa₀)M` on the union pattern: f64 approximation
/// and entry enclosures.
fn rotated(k: &CscMatrix, m: &CscMatrix, pattern: &Pattern, w: f64, a: (f64, f64), s: f64) -> (CscMatrix, Vec<Interval>) {
    let p = Interval::point;
    let wi = p(w);
    let ck = p(1.0) + p(s) * wi * p(a.1);
    let cm = wi * wi - p(s) * wi * p(a.0);
    let (ckf, cmf) = (1.0 + s * w * a.1, w * w - s * w * a.0);
    let (mut col_ptr, mut row_idx, mut values, mut vals) = (vec![0], Vec::new(), Vec::new(), Vec::new());
    for col in pattern {
        for &(r, pk, pm) in col {
            let kv = pk.map_or(0.0, |q| k.values[q]);
            let mv = pm.map_or(0.0, |q| m.values[q]);
            row_idx.push(r);
            values.push(ckf * kv - cmf * mv);
            vals.push(ck * p(kv) - cm * p(mv));
        }
        col_ptr.push(row_idx.len());
    }
    (CscMatrix { n: k.n, col_ptr, row_idx, values }, vals)
}

/// Certify the steady state at angular frequency `w`, computing the candidate.
pub fn certify_point(
    k: &CscMatrix,
    m: &CscMatrix,
    f: &[f64],
    a: (f64, f64),
    w: f64,
    s_hint: f64,
) -> Result<PointCertificate, String> {
    let n = k.n;
    if m.n != n || f.len() != n {
        return Err("dimension mismatch".into());
    }
    if !(w >= 0.0 && w.is_finite() && a.0.is_finite() && a.1.is_finite()) {
        return Err("non-finite frequency or damping".into());
    }
    if !k.values.iter().chain(&m.values).chain(f).all(|x| x.is_finite()) {
        return Err("non-finite K, M or f".into());
    }
    let pattern = union_pattern(k, m).ok_or("unsorted CSC column")?;
    let mut tried = vec![s_hint];
    tried.extend([0.0, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0, 1e3, 1e4, 1e5]);
    let mut last = String::new();
    for &s in &tried {
        let (b, bv) = rotated(k, m, &pattern, w, a, s);
        let mu_s = match certify_lambda_min_lower(&b, &bv) {
            Ok(mu) => mu,
            Err(e) => {
                last = e;
                continue;
            }
        };
        let mu = down(mu_s / up(up(1.0 + up(s * s)).sqrt()));
        let (u_re, u_im) = candidate(k, m, f, a, w, s, &b).ok_or("candidate solve failed")?;
        let r = residual(k, m, f, a, w, &u_re, &u_im);
        let rho = norm_up(&r).ok_or("non-finite residual")?;
        let abs_bound = up(rho / mu);
        if !abs_bound.is_finite() {
            return Err("non-finite bound".into());
        }
        return Ok(PointCertificate { u_re, u_im, abs_bound, mu, shift: s });
    }
    Err(format!("no rotation s made Re((1 − is)A) certified positive definite: {last}"))
}

/// Enclosure of `f − Aũ` as `[re…, im…]` (2n intervals).
fn residual(k: &CscMatrix, m: &CscMatrix, f: &[f64], a: (f64, f64), w: f64, ur: &[f64], ui: &[f64]) -> Vec<Interval> {
    let p = Interval::point;
    let (kr, ki, mr, mi) = (sym_mul(k, ur), sym_mul(k, ui), sym_mul(m, ur), sym_mul(m, ui));
    let wi = p(w);
    let w2 = wi * wi;
    let n = k.n;
    let mut out = Vec::with_capacity(2 * n);
    let mut im = Vec::with_capacity(n);
    for j in 0..n {
        let kd_r = kr[j] - w2 * mr[j];
        let kd_i = ki[j] - w2 * mi[j];
        let c_r = p(a.0) * mr[j] + p(a.1) * kr[j];
        let c_i = p(a.0) * mi[j] + p(a.1) * ki[j];
        // A ũ = (K_d ũ_r − ωC ũ_i) + i(K_d ũ_i + ωC ũ_r)
        out.push(p(f[j]) - (kd_r - wi * c_i));
        im.push(-(kd_i + wi * c_r));
    }
    out.extend(im);
    out
}

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

/// The candidate: solve `(H + iG)u = (1 − is)·rhs` with `H = B(s) ≻ 0`,
/// `G = ωC − sK_d`, by CG on `(I + W²)u = (I − iW)H⁻¹g`, `W = H⁻¹G`, in the
/// H-inner product (`I + W²` is H-self-adjoint and ⪰ I), with two steps of
/// iterative refinement on the complex residual. Never trusted.
fn candidate(
    k: &CscMatrix,
    m: &CscMatrix,
    f: &[f64],
    a: (f64, f64),
    w: f64,
    s: f64,
    h: &CscMatrix,
) -> Option<(Vec<f64>, Vec<f64>)> {
    let n = k.n;
    let sym = Rc::new(symbolic_cholesky(h));
    let factor = numeric_cholesky(&sym, h)?;
    let kd = |x: &[f64]| -> Vec<f64> {
        let (kx, mx) = (k.sym_mat_vec(x), m.sym_mat_vec(x));
        kx.iter().zip(&mx).map(|(a, b)| a - w * w * b).collect()
    };
    let c = |x: &[f64]| -> Vec<f64> {
        let (kx, mx) = (k.sym_mat_vec(x), m.sym_mat_vec(x));
        kx.iter().zip(&mx).map(|(kk, mm)| a.0 * mm + a.1 * kk).collect()
    };
    let apply_a = |ur: &[f64], ui: &[f64]| -> (Vec<f64>, Vec<f64>) {
        let (kdr, kdi, cr, ci) = (kd(ur), kd(ui), c(ur), c(ui));
        let re = (0..n).map(|j| kdr[j] - w * ci[j]).collect();
        let im = (0..n).map(|j| kdi[j] + w * cr[j]).collect();
        (re, im)
    };
    let solve = |rr: &[f64], ri: &[f64]| -> Option<(Vec<f64>, Vec<f64>)> {
        // g = (1 − is)(rr + i ri)
        let gr: Vec<f64> = (0..n).map(|j| rr[j] + s * ri[j]).collect();
        let gi: Vec<f64> = (0..n).map(|j| ri[j] - s * rr[j]).collect();
        let hr = sparse_cholesky_solve(&factor, &gr);
        let hi = sparse_cholesky_solve(&factor, &gi);
        let wop = |x: &[f64]| -> Vec<f64> {
            let (cx, kdx) = (c(x), kd(x));
            let gx: Vec<f64> = (0..n).map(|j| w * cx[j] - s * kdx[j]).collect();
            sparse_cholesky_solve(&factor, &gx)
        };
        let whi = wop(&hi);
        let whr = wop(&hr);
        let br: Vec<f64> = (0..n).map(|j| hr[j] + whi[j]).collect();
        let bi: Vec<f64> = (0..n).map(|j| hi[j] - whr[j]).collect();
        Some((cg_h(h, &wop, &br)?, cg_h(h, &wop, &bi)?))
    };
    let (mut ur, mut ui) = solve(f, &vec![0.0; n])?;
    for _ in 0..2 {
        let (ar, ai) = apply_a(&ur, &ui);
        let rr: Vec<f64> = (0..n).map(|j| f[j] - ar[j]).collect();
        let ri: Vec<f64> = ai.iter().map(|x| -x).collect();
        let (dr, di) = solve(&rr, &ri)?;
        for j in 0..n {
            ur[j] += dr[j];
            ui[j] += di[j];
        }
    }
    (ur.iter().chain(&ui).all(|x| x.is_finite())).then_some((ur, ui))
}

/// CG for `(I + W²)x = b` in the H-inner product.
fn cg_h(h: &CscMatrix, wop: &dyn Fn(&[f64]) -> Vec<f64>, b: &[f64]) -> Option<Vec<f64>> {
    let n = b.len();
    let hdot = |x: &[f64], y: &[f64]| -> f64 { x.iter().zip(&h.sym_mat_vec(y)).map(|(a, b)| a * b).sum() };
    let mut x = vec![0.0; n];
    let mut r = b.to_vec();
    let mut p = r.clone();
    let mut rr = hdot(&r, &r);
    let bb = rr;
    if bb == 0.0 {
        return Some(x);
    }
    for _ in 0..(20 * n).clamp(100, 20_000) {
        let wp = wop(&p);
        let wwp = wop(&wp);
        let q: Vec<f64> = (0..n).map(|j| p[j] + wwp[j]).collect();
        let pq = hdot(&p, &q);
        if !(pq > 0.0) {
            break;
        }
        let alpha = rr / pq;
        for j in 0..n {
            x[j] += alpha * p[j];
            r[j] -= alpha * q[j];
        }
        let rr_new = hdot(&r, &r);
        if rr_new <= 1e-32 * bb {
            break;
        }
        let beta = rr_new / rr;
        rr = rr_new;
        for j in 0..n {
            p[j] = r[j] + beta * p[j];
        }
    }
    x.iter().all(|v| v.is_finite()).then_some(x)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn diag(d: &[f64]) -> CscMatrix {
        let idx: Vec<usize> = (0..d.len()).collect();
        CscMatrix::from_triplets(d.len(), &idx, &idx, d)
    }

    /// Decoupled modes: u_j = f_j / (k_j − ω²m_j + iω(a₀m_j + a₁k_j)).
    fn exact(k: &[f64], m: &[f64], f: &[f64], a: (f64, f64), w: f64) -> Vec<(f64, f64)> {
        (0..k.len())
            .map(|j| {
                let re = k[j] - w * w * m[j];
                let im = w * (a.0 * m[j] + a.1 * k[j]);
                let d = re * re + im * im;
                (f[j] * re / d, -f[j] * im / d)
            })
            .collect()
    }

    #[test]
    fn below_and_above_resonance() {
        let (kd, md, fd) = ([4.0, 9.0, 25.0], [1.0, 1.0, 1.0], [1.0, -2.0, 0.5]);
        let (k, m) = (diag(&kd), diag(&md));
        let a = (0.05, 0.01);
        for w in [0.0, 1.0, 2.5, 2.9, 3.0, 4.0, 7.0] {
            let pc = certify_point(&k, &m, &fd, a, w, 0.0).unwrap_or_else(|e| panic!("ω = {w}: {e}"));
            let ex = exact(&kd, &md, &fd, a, w);
            let err = ex
                .iter()
                .enumerate()
                .map(|(j, (re, im))| (re - pc.u_re[j]).powi(2) + (im - pc.u_im[j]).powi(2))
                .sum::<f64>()
                .sqrt();
            assert!(err <= pc.abs_bound, "ω = {w}: err {err:e} > {:e}", pc.abs_bound);
            assert!(pc.abs_bound < 1e-12, "ω = {w}: {pc_b:e}", pc_b = pc.abs_bound);
            if w < 2.0 {
                assert_eq!(pc.shift, 0.0, "below resonance s = 0 must work");
            }
            if w > 2.0 {
                assert!(pc.shift > 0.0, "above resonance damping must supply coercivity");
            }
        }
    }

    #[test]
    fn zero_response_has_finite_enclosures() {
        // Found by the json_dynamics fuzz target: a DOF the load does not
        // excite (ũ_t = 0) and a reported value equal to the candidate.
        let m0 = modulus(Interval::point(0.0), Interval::point(0.0));
        assert!(m0.lo == 0.0 && m0.hi >= 0.0 && m0.hi.is_finite(), "{m0:?}");
        let m = modulus(Interval::point(3.0), Interval::point(-4.0));
        assert!(m.lo <= 5.0 && 5.0 <= m.hi && m.hi - m.lo < 1e-14, "{m:?}");
    }

    #[test]
    fn undamped_resonance_refused() {
        let (k, m) = (diag(&[4.0, 9.0]), diag(&[1.0, 1.0]));
        // Exactly at ω² = 4 with no damping A is singular.
        assert!(certify_point(&k, &m, &[1.0, 1.0], (0.0, 0.0), 2.0, 0.0).is_err());
        // Undamped, above resonance: K − ω²M indefinite and C = 0: refused.
        assert!(certify_point(&k, &m, &[1.0, 1.0], (0.0, 0.0), 2.5, 0.0).is_err());
    }
}
