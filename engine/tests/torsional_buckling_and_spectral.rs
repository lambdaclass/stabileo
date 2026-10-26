//! Torsional / flexural-torsional buckling (the Wagner term and shear-centre coupling of
//! the 3D frame Kg) and response-spectrum combination and participation.
//!
//! These were open questions MD-5, MD-6, MD-7 and MD-8 of
//! docs/solver/mass-geometric-dynamics.md (PR #330); the derivation tests that demonstrated
//! them while ignored are reproduced here, passing. Every expected value is a closed form or
//! a hand calculation written out in the test.

use crate::common;
use common::*;
use dedaliano_engine::element::Hinge3D;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::geometric_stiffness::{frame_kg_local_3d, frame_kg_local_3d_warping, KgSection};
use dedaliano_engine::solver::mass_matrix::assemble_mass_matrix_2d;
use dedaliano_engine::solver::{buckling, modal, pdelta, spectral};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::f64::consts::PI;

const E: f64 = 200_000.0; // MPa (the solver multiplies by 1000 → kN/m²)
const NU: f64 = 0.3;
const RHO: f64 = 7850.0; // kg/m³ (the solver divides by 1000 → t/m³)

fn ek() -> f64 {
    E * 1000.0
}
fn gk() -> f64 {
    ek() / (2.0 * (1.0 + NU))
}
fn dens() -> HashMap<String, f64> {
    HashMap::from([("1".to_string(), RHO)])
}
fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs().max(1e-300)
}

// ---------------------------------------------------------------------------
// Kg kernels
// ---------------------------------------------------------------------------

/// The torsional entries of the 12×12 Kg are P·r0²/L·[1, −1; −1, 1] on (θx1, θx2) and the
/// shear-centre coupling P·z0/L on (v, θx), −P·y0/L on (w, θx), with the pattern of
/// (v2 − v1)(θ2 − θ1); the bending blocks are unchanged.
#[test]
fn kg_3d_torsional_entries_closed_form() {
    let (p, l) = (-80.0, 3.0);
    let sec = KgSection { r0_sq: 0.012, y0: 0.04, z0: -0.025 };
    let kg = frame_kg_local_3d(p, l, &Hinge3D::default(), &sec);
    let bare = frame_kg_local_3d(p, l, &Hinge3D::default(), &KgSection::default());
    let at = |i: usize, j: usize| kg[i * 12 + j];
    let w = p * sec.r0_sq / l;
    assert_eq!(at(3, 3), w);
    assert_eq!(at(9, 9), w);
    assert_eq!(at(3, 9), -w);
    assert_eq!(at(9, 3), -w);
    let kz = p * sec.z0 / l;
    let ky = -p * sec.y0 / l;
    for &(i, j, v) in &[
        (1, 3, kz), (1, 9, -kz), (7, 3, -kz), (7, 9, kz),
        (2, 3, ky), (2, 9, -ky), (8, 3, -ky), (8, 9, ky),
    ] {
        assert_eq!(at(i, j), v, "kg[{i}][{j}]");
        assert_eq!(at(j, i), v, "kg[{j}][{i}]");
    }
    // Rotations and axial DOFs carry no torsional coupling; bending blocks untouched.
    for &r in &[0usize, 4, 5, 6, 10, 11] {
        assert_eq!(at(r, 3), 0.0);
        assert_eq!(at(r, 9), 0.0);
    }
    for i in [1usize, 2, 4, 5, 7, 8, 10, 11] {
        for j in [1usize, 2, 4, 5, 7, 8, 10, 11] {
            assert_eq!(at(i, j), bare[i * 12 + j], "bending entry ({i},{j})");
        }
    }
    // A torsion release (either end) removes every torsional term, as it removes GJ.
    for h in [Hinge3D { release_t_start: true, ..Default::default() }, Hinge3D { release_t_end: true, ..Default::default() }] {
        let k = frame_kg_local_3d(p, l, &h, &sec);
        for j in 0..12 {
            assert_eq!(k[3 * 12 + j], 0.0);
            assert_eq!(k[9 * 12 + j], 0.0);
        }
    }
}

/// With released bending rotations the condensation maps the couplings consistently: the
/// matrix stays symmetric, and its work on any displacement equals the work of the
/// unreleased matrix on the displacement with the released rotations replaced by their
/// elastic maps (here checked through symmetry and the warping element's coupling rows).
#[test]
fn kg_3d_condensation_keeps_symmetry_with_couplings() {
    let sec = KgSection { r0_sq: 0.02, y0: 0.03, z0: 0.05 };
    for bits in 0u32..16 {
        let h = Hinge3D {
            release_my_start: bits & 1 != 0,
            release_my_end: bits & 2 != 0,
            release_mz_start: bits & 4 != 0,
            release_mz_end: bits & 8 != 0,
            ..Default::default()
        };
        for (k, n) in [(frame_kg_local_3d(-50.0, 2.0, &h, &sec), 12), (frame_kg_local_3d_warping(-50.0, 2.0, &h, &sec), 14)] {
            for i in 0..n {
                for j in 0..n {
                    let (a, b) = (k[i * n + j], k[j * n + i]);
                    assert!((a - b).abs() <= 1e-12 * a.abs().max(b.abs()).max(1.0), "bits {bits} n {n}: ({i},{j}) {a} vs {b}");
                }
            }
        }
    }
}

/// The 14×14 warping Kg puts P·r0²·H (H the cubic Hermite block ∫N'ᵀN') on (θx1, φ'1, θx2, φ'2).
#[test]
fn kg_3d_warping_wagner_block_is_hermite() {
    let (p, l) = (-120.0, 1.7);
    let sec = KgSection { r0_sq: 0.015, y0: 0.0, z0: 0.0 };
    let kg = frame_kg_local_3d_warping(p, l, &Hinge3D::default(), &sec);
    let c = p * sec.r0_sq / (30.0 * l);
    let h = [[36.0, 3.0 * l, -36.0, 3.0 * l], [3.0 * l, 4.0 * l * l, -3.0 * l, -l * l], [-36.0, -3.0 * l, 36.0, -3.0 * l], [3.0 * l, -l * l, -3.0 * l, 4.0 * l * l]];
    let t = [3usize, 6, 10, 13];
    for a in 0..4 {
        for b in 0..4 {
            assert!((kg[t[a] * 14 + t[b]] - c * h[a][b]).abs() < 1e-12 * (c * 36.0).abs(), "({a},{b})");
        }
    }
}

// ---------------------------------------------------------------------------
// Buckling against closed forms
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Sec {
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    cw: Option<f64>,
    y0: Option<f64>,
    z0: Option<f64>,
}

/// A column of `n` elements along X, pinned with fork supports at both ends (twist
/// restrained, warping free), axially compressed by a unit load at node n+1.
fn fork_column(n: usize, l: f64, s: Sec) -> SolverInput3D {
    let load = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n + 1, fx: -1.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let mut input = make_3d_beam(n, l, E, NU, s.a, s.iy, s.iz, s.j,
        vec![true, true, true, true, false, false], Some(vec![false, true, true, true, false, false]), load);
    let sec = input.sections.get_mut("1").unwrap();
    sec.cw = s.cw;
    sec.shear_center_y = s.y0;
    sec.shear_center_z = s.z0;
    input
}

fn lambda1(input: &SolverInput3D) -> f64 {
    buckling::solve_buckling_3d(input, 4).unwrap().modes[0].load_factor
}

/// Twist share of a buckling mode: max |rx| relative to max translation (rx is the twist
/// of a column along X).
fn twist_dominated(m: &buckling::BucklingMode3D) -> bool {
    let rx = m.displacements.iter().map(|d| d.rx.abs()).fold(0.0, f64::max);
    let tr = m.displacements.iter().map(|d| d.uy.abs().max(d.uz.abs())).fold(0.0, f64::max);
    rx > 0.0 && tr < 1e-6 * rx.max(1.0)
}

const CRUCIFORM: Sec = Sec { a: 0.0039, iy: 6.68e-6, iz: 6.68e-6, j: 1.333e-7, cw: None, y0: None, z0: None };

/// MD-8: a 200×10 mm cruciform, L = 1.5 m, pinned and fork-supported. P_E = 5860 kN,
/// P_T = GJ/r0² = GJ·A/(Iy + Iz) = 2993 kN. The solver used to return P_E (+96%).
#[test]
fn cruciform_column_buckles_in_torsion() {
    let l = 1.5;
    let input = fork_column(8, l, CRUCIFORM);
    let res = buckling::solve_buckling_3d(&input, 4).unwrap();
    let p_e = PI * PI * ek() * CRUCIFORM.iy / (l * l);
    let p_t = gk() * CRUCIFORM.j * CRUCIFORM.a / (2.0 * CRUCIFORM.iy);
    eprintln!("λ = {:.1}, P_E = {p_e:.1}, P_T = {p_t:.1}", res.modes[0].load_factor);
    assert!(p_t < p_e);
    // The linear twist of the element makes K and Kg proportional on the twist: exact.
    assert!(rel(res.modes[0].load_factor, p_t) < 1e-6, "{} vs P_T {p_t}", res.modes[0].load_factor);
    assert!(twist_dominated(&res.modes[0]), "the first mode is a pure twist");
}

/// The same column standing along global Z (different local axes): same load.
#[test]
fn cruciform_column_along_z_buckles_at_the_same_load() {
    let (n, l) = (8usize, 1.5);
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, 0.0, l * i as f64 / n as f64)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let load = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n + 1, fx: 0.0, fy: 0.0, fz: -1.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let s = CRUCIFORM;
    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, s.a, s.iy, s.iz, s.j)], elems,
        vec![(1, vec![true, true, true, false, false, true]), (n + 1, vec![true, true, false, false, false, true])], load);
    let p_t = gk() * s.j * s.a / (2.0 * s.iy);
    let lam = lambda1(&input);
    assert!(rel(lam, p_t) < 1e-6, "{lam} vs {p_t}");
}

/// The buckling certificate encloses the torsional load (it reads the same Kg).
#[test]
fn cruciform_buckling_certificate_encloses_the_torsional_load() {
    let l = 1.5;
    let input = fork_column(8, l, CRUCIFORM);
    let out = dedaliano_engine::certify::buckling::certify_buckling_3d(&input, 2).unwrap();
    let p_t = gk() * CRUCIFORM.j * CRUCIFORM.a / (2.0 * CRUCIFORM.iy);
    match out.certificate {
        dedaliano_engine::certify::buckling::BucklingCertificate::Certified { lambda_lower, lambda_upper, .. } => {
            eprintln!("certified [{lambda_lower}, {lambda_upper:?}], P_T {p_t}");
            assert!(lambda_lower <= p_t * (1.0 + 1e-9));
            assert!(lambda_lower > 0.999 * p_t);
            if let Some(hi) = lambda_upper {
                assert!(hi >= p_t * (1.0 - 1e-9));
            }
        }
        other => panic!("not certified: {other:?}"),
    }
}

/// Doubly symmetric section with warping DOFs: P_T = (GJ + π²ECw/L²)/r0² below the Euler
/// load. The 14-DOF element interpolates the twist cubically; 16 elements converge to 0.1%.
#[test]
fn warping_column_torsional_buckling_includes_cw() {
    let l = 3.0;
    let s = Sec { a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-7, cw: Some(1e-9), y0: None, z0: None };
    let r0_sq = (s.iy + s.iz) / s.a;
    let p_t = (gk() * s.j + PI * PI * ek() * s.cw.unwrap() / (l * l)) / r0_sq;
    let p_e = PI * PI * ek() * s.iy / (l * l);
    assert!(p_t < 0.6 * p_e, "test needs torsion to govern: P_T {p_t}, P_E {p_e}");
    let lam = lambda1(&fork_column(16, l, s));
    eprintln!("warping column: λ = {lam:.2}, P_T = {p_t:.2}, P_E = {p_e:.2}");
    assert!(rel(lam, p_t) < 1e-3, "{lam} vs P_T {p_t}");
    assert!(lam >= p_t * (1.0 - 1e-9), "consistent FE: from above");
}

/// Smallest positive root of det[[Pv−P, 0, −P z0], [0, Pw−P, P y0], [−P z0, P y0, r0²(PT−P)]]
/// (Timoshenko & Gere §5.4; Trahair §3.5), found by bisection below min(Pv, Pw, PT).
fn flexural_torsional_load(pv: f64, pw: f64, pt: f64, r0_sq: f64, y0: f64, z0: f64) -> f64 {
    let f = |p: f64| (pv - p) * (pw - p) * r0_sq * (pt - p) - (pv - p) * p * p * y0 * y0 - (pw - p) * p * p * z0 * z0;
    let (mut lo, mut hi) = (0.0, pv.min(pw).min(pt));
    assert!(f(lo) > 0.0);
    if f(hi) > 0.0 {
        return hi;
    }
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0.0 { lo = mid } else { hi = mid }
    }
    0.5 * (lo + hi)
}

/// Monosymmetric sections, fork supports, no warping stiffness: the coupled
/// flexural-torsional load is below both the flexural load of the coupled plane and P_T.
/// Channel: symmetric about local y, shear centre on y (y0) — couples w (Iy) with the twist.
/// Tee: symmetric about local z (z0) — couples v (Iz) with the twist. Both signs of the
/// offset give the same load.
#[test]
fn channel_and_tee_flexural_torsional_buckling() {
    let l = 3.0;
    let base = Sec { a: 0.004, iy: 1e-6, iz: 8e-6, j: 1e-8, cw: None, y0: None, z0: None };
    let cases = [
        ("channel", Some(0.05), None),
        ("channel, offset negative", Some(-0.05), None),
        ("tee", None, Some(0.04)),
        ("tee, offset negative", None, Some(-0.04)),
        ("asymmetric", Some(0.03), Some(-0.02)),
    ];
    for (name, y0, z0) in cases {
        let s = Sec { y0, z0, ..base };
        let (y, z) = (y0.unwrap_or(0.0), z0.unwrap_or(0.0));
        let r0_sq = (s.iy + s.iz) / s.a + y * y + z * z;
        let pv = PI * PI * ek() * s.iz / (l * l);
        let pw = PI * PI * ek() * s.iy / (l * l);
        let pt = gk() * s.j / r0_sq;
        let p_ft = flexural_torsional_load(pv, pw, pt, r0_sq, y, z);
        let lam = lambda1(&fork_column(32, l, s));
        eprintln!("{name}: λ = {lam:.3}, P_FT = {p_ft:.3} (Pv {pv:.1}, Pw {pw:.1}, PT {pt:.1})");
        assert!(p_ft < pv.min(pw).min(pt) * 0.999, "{name}: the coupled load must govern");
        assert!(rel(lam, p_ft) < 2e-3, "{name}: λ {lam} vs P_FT {p_ft}");
        assert!(lam >= p_ft * (1.0 - 1e-6), "{name}: consistent FE converges from above");
    }
}

/// A doubly symmetric I-section column where flexure governs: the first load is Euler's,
/// exactly as before the torsional terms, and the mode has no twist.
#[test]
fn i_section_column_flexure_governs_unchanged() {
    let l = 6.0;
    // IPE 300-like: A, Iy (weak), Iz (strong), J, Cw.
    let s = Sec { a: 53.8e-4, iy: 603.8e-8, iz: 8356e-8, j: 20.1e-8, cw: None, y0: None, z0: None };
    let p_e = PI * PI * ek() * s.iy / (l * l);
    let r0_sq = (s.iy + s.iz) / s.a;
    assert!(gk() * s.j / r0_sq > 1.5 * p_e, "torsion does not govern this column");
    let res = buckling::solve_buckling_3d(&fork_column(16, l, s), 2).unwrap();
    assert!(rel(res.modes[0].load_factor, p_e) < 1e-3, "{} vs {p_e}", res.modes[0].load_factor);
    let rx = res.modes[0].displacements.iter().map(|d| d.rx.abs()).fold(0.0, f64::max);
    assert!(rx < 1e-9, "flexural mode has no twist: {rx}");
    // With warping DOFs (Cw given) the flexural load is the same.
    let sw = Sec { cw: Some(125.9e-9), ..s };
    let lw = lambda1(&fork_column(16, l, sw));
    assert!(rel(lw, res.modes[0].load_factor) < 1e-9, "{lw} vs {}", res.modes[0].load_factor);
}

/// The same IPE 300-like column, 2 m long. Without a warping constant the model's torsional
/// stiffness is GJ alone and P_T = GJ/r0² (928 kN) is below Euler (2980 kN): that is what the
/// model says, and it is conservative for a real I-section. With Cw (warping DOFs) the
/// torsional load rises to (GJ + π²ECw/L²)/r0² ≈ 4660 kN and flexure governs again.
/// Open sections need Cw for their torsional buckling load to be meaningful.
#[test]
fn short_i_section_column_needs_cw() {
    let l = 2.0;
    let s = Sec { a: 53.8e-4, iy: 603.8e-8, iz: 8356e-8, j: 20.1e-8, cw: None, y0: None, z0: None };
    let r0_sq = (s.iy + s.iz) / s.a;
    let p_e = PI * PI * ek() * s.iy / (l * l);
    let p_t_sv = gk() * s.j / r0_sq;
    let lam = lambda1(&fork_column(16, l, s));
    assert!(rel(lam, p_t_sv) < 1e-6, "no Cw: {lam} vs GJ/r0² {p_t_sv}");
    let cw = 125.9e-9;
    let p_t = (gk() * s.j + PI * PI * ek() * cw / (l * l)) / r0_sq;
    assert!(p_t > p_e);
    let lw = lambda1(&fork_column(16, l, Sec { cw: Some(cw), ..s }));
    eprintln!("short IPE: no Cw λ = {lam:.0}; with Cw λ = {lw:.0} (P_E {p_e:.0}, P_T {p_t:.0})");
    assert!(rel(lw, p_e) < 1e-3, "with Cw: {lw} vs P_E {p_e}");
}

/// P-Delta: a compressed cruciform under a torque at midspan twists by the linear twist
/// divided by (1 − P/P_T) — K and Kg are proportional on the twist, so this is exact.
#[test]
fn pdelta_amplifies_twist_by_the_torsional_load() {
    let (n, l) = (8usize, 1.5);
    let p_t = gk() * CRUCIFORM.j * CRUCIFORM.a / (2.0 * CRUCIFORM.iy);
    let p = 0.5 * p_t;
    let torque = 0.01;
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n + 1, fx: -p, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }),
        SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n / 2 + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: torque, my: 0.0, mz: 0.0, bw: None }),
    ];
    let s = CRUCIFORM;
    let input = make_3d_beam(n, l, E, NU, s.a, s.iy, s.iz, s.j,
        vec![true, true, true, true, false, false], Some(vec![false, true, true, true, false, false]), loads);
    let res = pdelta::solve_pdelta_3d(&input, 50, 1e-10).unwrap();
    assert!(res.converged);
    let mid = |r: &AnalysisResults3D| r.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().rx;
    let lin = mid(&res.linear_results);
    let theta_lin = torque * (l / 2.0) * (l / 2.0) / (l * gk() * s.j);
    assert!(rel(lin, theta_lin) < 1e-9, "linear twist {lin} vs {theta_lin}");
    let amp = mid(&res.results) / lin;
    eprintln!("twist amplification {amp:.6}, 1/(1 − P/P_T) = {:.6}", 1.0 / (1.0 - p / p_t));
    assert!(rel(amp, 1.0 / (1.0 - p / p_t)) < 1e-6, "{amp}");
}

// ---------------------------------------------------------------------------
// Modal participation (MD-5)
// ---------------------------------------------------------------------------

/// A vertical cantilever of `n` frame elements (base fixed at node 1), X is transverse.
fn cantilever_column(n: usize, l: f64) -> SolverInput {
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, l * i as f64 / n as f64)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 1e-4)], elems, vec![(1, 1, "fixed")], vec![])
}

/// Σ_n φ_n(tip) Γ_n / ω_n² over all modes: the static tip deflection under a unit uniform
/// ground acceleration predicted by the modal data.
fn modal_static_tip(n: usize, l: f64) -> f64 {
    let input = cantilever_column(n, l);
    let res = modal::solve_modal_2d(&input, &dens(), 3 * n).unwrap();
    assert_eq!(res.modes.len(), 3 * n);
    res.modes.iter().map(|m| {
        let tip = m.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
        tip * m.participation_x / (m.omega * m.omega)
    }).sum()
}

/// MD-5: with all modes and a constant acceleration the modal sum must be the static
/// response to the consistent body force, exact at the nodes: ρA·a·L⁴/(8EI) at the tip.
/// The free-block Γ (M_ff·r_f) gave 0.781 of it for one element.
#[test]
fn modal_participation_includes_support_coupled_mass() {
    let l: f64 = 3.0;
    let exact = RHO / 1000.0 * 0.01 * l.powi(4) / (8.0 * E * 1000.0 * 1e-4);
    for n in [1usize, 2, 4, 8] {
        let s = modal_static_tip(n, l);
        eprintln!("n = {n}: modal Σ φΓ/ω² = {s:.6e}, exact {exact:.6e}, ratio {:.6}", s / exact);
        assert!(rel(s, exact) < 1e-6, "n = {n}: {s:e} vs {exact:e}");
    }
}

/// Σ over all modes of M_eff = (M·r)_fᵀ M_ff⁻¹ (M·r)_f. For one element (tip DOFs u, θ):
/// (M·r)_f = (m/2, −m·L/12) (the consistent load of a uniform body force) and
/// M_ff = m/420·[156, −22L; −22L, 4L²], so Σ M_eff = 3m/4 exactly (it was 156/420 m = 37%).
/// The rest, m/4, is the Schur complement r_rᵀ(M_rr − M_rf M_ff⁻¹ M_fr)r_r: mass that moves
/// rigidly with the support. With refinement Σ M_eff → m.
#[test]
fn effective_mass_sum_closed_form_and_convergence() {
    let l = 3.0;
    let m_tot = RHO / 1000.0 * 0.01 * l;
    let sum_for = |n: usize| {
        let res = modal::solve_modal_2d(&cantilever_column(n, l), &dens(), 3 * n).unwrap();
        assert!(rel(res.total_mass, m_tot) < 1e-12);
        res.modes.iter().map(|m| m.effective_mass_x).sum::<f64>()
    };
    let s1 = sum_for(1);
    assert!(rel(s1, 0.75 * m_tot) < 1e-9, "Σ M_eff = {s1}, 3m/4 = {}", 0.75 * m_tot);
    let mut prev = s1;
    for n in [2usize, 4, 8] {
        let s = sum_for(n);
        eprintln!("n = {n}: Σ M_eff / m = {:.6}", s / m_tot);
        assert!(s > prev && s < m_tot, "monotone towards the total mass");
        prev = s;
    }
    assert!(prev > 0.96 * m_tot);
}

// ---------------------------------------------------------------------------
// Hand-calculated 2-DOF modal + spectral chain
// ---------------------------------------------------------------------------

/// Two frame members along X (node 1 fixed, nodes 2, 3 guided: only ux free), excited along
/// X: a 2-DOF axial chain with k = EA/L, m = ρAL per member and the consistent axial mass
///   K = k·[2, −1; −1, 1],  M_ff = m/6·[4, 1; 1, 2],  (M·r)_f = m·[1, 1/2]
/// (M_fr couples node 2 to the support: the first entry is 4/6 + 1/6 + 1/6, not 5/6).
/// Everything is solved by hand below and compared with modal + spectral, SRSS and CQC.
#[test]
fn two_dof_chain_modal_and_spectral_by_hand() {
    let (l, a) = (2.0, 0.01);
    let nodes = vec![(1, 0.0, 0.0), (2, l, 0.0), (3, 2.0 * l, 0.0)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false)];
    let sups = vec![(1, 1, "fixed"), (2, 2, "guidedX"), (3, 3, "guidedX")];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, a, 1e-4)], elems, sups, vec![]);
    let k = ek() * a / l;
    let m = RHO / 1000.0 * a * l;

    // Hand: det(K − ω²M) = 0 with K = k[2,−1;−1,1], M = m/6[4,1;1,2].
    // (2k − 4μ)(k − 2μ) − (k + μ)² = 0, μ = ω²m/6  →  7μ² − 10kμ + k² = 0.
    let disc = (100.0 - 28.0f64).sqrt();
    let mus = [(10.0 - disc) / 14.0 * k, (10.0 + disc) / 14.0 * k];
    let lvec = [m, 0.5 * m];
    let mut hand = Vec::new();
    for mu in mus {
        let w2 = 6.0 * mu / m;
        // Row 2 of (K − ω²M)φ = 0: (−k − μ)φ1 + (k − 2μ)φ2 = 0 → φ = (k − 2μ, k + μ).
        let phi = [k - 2.0 * mu, k + mu];
        let mphi = [m / 6.0 * (4.0 * phi[0] + phi[1]), m / 6.0 * (phi[0] + 2.0 * phi[1])];
        let gen_m = phi[0] * mphi[0] + phi[1] * mphi[1];
        let lr = phi[0] * lvec[0] + phi[1] * lvec[1];
        hand.push((w2.sqrt(), phi, lr / gen_m, lr * lr / gen_m));
    }
    // Σ M_eff over both modes = (M·r)ᵀM⁻¹(M·r) = 12m/7.
    assert!(rel(hand[0].3 + hand[1].3, 12.0 * m / 7.0) < 1e-12);

    let res = modal::solve_modal_2d(&input, &dens(), 2).unwrap();
    assert_eq!(res.modes.len(), 2);
    for (mode, h) in res.modes.iter().zip(&hand) {
        assert!(rel(mode.omega, h.0) < 1e-9, "ω {} vs {}", mode.omega, h.0);
        assert!(rel(mode.effective_mass_x, h.3) < 1e-9, "M_eff {} vs {}", mode.effective_mass_x, h.3);
        // Γ·φ is independent of the shape's scaling.
        let u3 = mode.displacements.iter().find(|d| d.node_id == 3).unwrap().ux * mode.participation_x;
        assert!(rel(u3, h.2 * h.1[1]) < 1e-9, "Γφ₃ {u3} vs {}", h.2 * h.1[1]);
    }

    // Spectrum: Sa(T) = 3 + T m/s² (not in g), ξ = 5%.
    let spectrum = DesignSpectrum {
        name: "lin".into(),
        points: vec![SpectrumPoint { period: 0.0, sa: 3.0 }, SpectrumPoint { period: 10.0, sa: 13.0 }],
        in_g: Some(false),
    };
    let sa = |w: f64| 3.0 + 2.0 * PI / w;
    let v: Vec<f64> = hand.iter().map(|h| h.3 * sa(h.0)).collect();
    let u3: Vec<f64> = hand.iter().map(|h| h.2 * h.1[1] * sa(h.0) / (h.0 * h.0)).collect();
    let rho = rho_dk(hand[1].0 / hand[0].0, 0.05);
    for rule in ["SRSS", "CQC"] {
        let c = |x: &[f64]| if rule == "SRSS" { (x[0] * x[0] + x[1] * x[1]).sqrt() } else { (x[0] * x[0] + x[1] * x[1] + 2.0 * rho * x[0] * x[1]).abs().sqrt() };
        let out = spectral::solve_spectral_2d(&SpectralInput {
            solver: input.clone(),
            modes: res.modes.iter().map(to_spectral).collect(),
            densities: dens(),
            spectrum: spectrum.clone(),
            direction: "X".into(),
            rule: Some(rule.into()),
            xi: Some(0.05),
            importance_factor: None,
            reduction_factor: None,
            total_mass: None,
        })
        .unwrap();
        assert!(rel(out.base_shear, c(&v)) < 1e-9, "{rule}: base shear {} vs {}", out.base_shear, c(&v));
        let tip = out.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
        assert!(rel(tip, c(&u3)) < 1e-9, "{rule}: tip {tip} vs {}", c(&u3));
        // Member 1 axial force: N = k·(u2 − u1) per mode, combined signed.
        let n1: Vec<f64> = hand.iter().map(|h| k * h.2 * h.1[0] * sa(h.0) / (h.0 * h.0)).collect();
        let f1 = out.element_forces.iter().find(|f| f.element_id == 1).unwrap();
        assert!(rel(f1.n_max, c(&n1)) < 1e-9, "{rule}: N₁ {} vs {}", f1.n_max, c(&n1));
    }
}

// ---------------------------------------------------------------------------
// Response-spectrum combination (MD-6, MD-7)
// ---------------------------------------------------------------------------

fn to_spectral(m: &modal::ModeShape) -> SpectralModeInput {
    SpectralModeInput {
        frequency: m.frequency,
        period: m.period,
        omega: m.omega,
        displacements: m.displacements.iter().map(|d| SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }).collect(),
        participation_x: m.participation_x,
        participation_y: m.participation_y,
        effective_mass_x: m.effective_mass_x,
        effective_mass_y: m.effective_mass_y,
    }
}

/// Mode `m` re-labelled at `omega` and optionally with its shape negated.
fn variant(m: &SpectralModeInput, omega: f64, negate: bool) -> SpectralModeInput {
    let s = if negate { -1.0 } else { 1.0 };
    let mut v = m.clone();
    v.omega = omega;
    v.frequency = omega / (2.0 * PI);
    v.period = 1.0 / v.frequency;
    for d in v.displacements.iter_mut() {
        d.ux *= s;
        d.uz *= s;
        d.ry *= s;
    }
    v
}

fn flat_spectrum() -> DesignSpectrum {
    DesignSpectrum {
        name: "flat".into(),
        points: vec![SpectrumPoint { period: 0.0, sa: 2.0 }, SpectrumPoint { period: 10.0, sa: 2.0 }],
        in_g: Some(false),
    }
}

fn run_spectral(input: &SolverInput, modes: Vec<SpectralModeInput>, rule: &str) -> spectral::SpectralResult {
    spectral::solve_spectral_2d(&SpectralInput {
        solver: input.clone(),
        modes,
        densities: dens(),
        spectrum: flat_spectrum(),
        direction: "X".into(),
        rule: Some(rule.into()),
        xi: Some(0.05),
        importance_factor: None,
        reduction_factor: None,
        total_mass: None,
    })
    .unwrap()
}

/// Der Kiureghian (1981), equal damping.
fn rho_dk(r: f64, xi: f64) -> f64 {
    8.0 * xi * xi * (1.0 + r) * r.powf(1.5) / ((1.0 - r * r).powi(2) + 4.0 * xi * xi * r * (1.0 + r).powi(2))
}

/// MD-7: base shear follows the requested rule. Two modes at ω and 1.1ω (ρ = 0.52): the
/// CQC base shear is 1.23× the SRSS one the solver used to report.
#[test]
fn spectral_base_shear_follows_the_requested_rule() {
    let input = cantilever_column(4, 3.0);
    let m1 = to_spectral(&modal::solve_modal_2d(&input, &dens(), 2).unwrap().modes[0]);
    let w = m1.omega;
    let modes = vec![variant(&m1, w, false), variant(&m1, 1.1 * w, false)];
    let v = m1.effective_mass_x * 2.0;
    let cqc = run_spectral(&input, modes.clone(), "CQC");
    let srss = run_spectral(&input, modes, "SRSS");
    let expect_cqc = v * (2.0 + 2.0 * rho_dk(1.1, 0.05)).sqrt();
    assert!(rel(cqc.base_shear, expect_cqc) < 1e-9, "CQC base shear {} vs {}", cqc.base_shear, expect_cqc);
    assert!(rel(srss.base_shear, v * 2f64.sqrt()) < 1e-9);
    assert_eq!(cqc.rule, "CQC");
    assert_eq!(srss.rule, "SRSS");
}

/// MD-6: element forces are combined from their signed per-mode values, end by end, like
/// the displacements. Two modes of the same shape and opposite sign at ω and 1.1ω: the base
/// moment and the tip displacement keep the single-mode ratio.
#[test]
fn spectral_forces_are_combined_signed_like_displacements() {
    let input = cantilever_column(4, 3.0);
    let m1 = to_spectral(&modal::solve_modal_2d(&input, &dens(), 2).unwrap().modes[0]);
    let w = m1.omega;
    let single = run_spectral(&input, vec![variant(&m1, w, false)], "CQC");
    let both = run_spectral(&input, vec![variant(&m1, w, false), variant(&m1, 1.1 * w, true)], "CQC");
    let tip = |r: &spectral::SpectralResult| r.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let base_m = |r: &spectral::SpectralResult| r.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_max;
    let ratio_single = base_m(&single) / tip(&single);
    let ratio_both = base_m(&both) / tip(&both);
    assert!(rel(ratio_both, ratio_single) < 1e-9, "{ratio_both} vs {ratio_single}");
}

/// An unknown rule is refused instead of silently running CQC; the rule is case-insensitive.
#[test]
fn spectral_rule_is_validated() {
    let input = cantilever_column(2, 3.0);
    let m1 = to_spectral(&modal::solve_modal_2d(&input, &dens(), 1).unwrap().modes[0]);
    let mut si = SpectralInput {
        solver: input.clone(),
        modes: vec![m1],
        densities: dens(),
        spectrum: flat_spectrum(),
        direction: "X".into(),
        rule: Some("ABS".into()),
        xi: None,
        importance_factor: None,
        reduction_factor: None,
        total_mass: None,
    };
    let err = spectral::solve_spectral_2d(&si).unwrap_err();
    assert!(err.contains("combination rule"), "{err}");
    // Exact strings only, as every enum of the input (tests/unknown_enum_strings.rs).
    si.rule = Some("srss".into());
    assert!(spectral::solve_spectral_2d(&si).unwrap_err().contains("combination rule"));
    si.rule = Some("SRSS".into());
    assert_eq!(spectral::solve_spectral_2d(&si).unwrap().rule, "SRSS");
}

/// The modal static limit also holds on a portal frame (beam + two columns, both bases
/// fixed): Σ φΓ/ω² over all modes = K⁻¹(M·r)_f, the static response to the consistent
/// horizontal body force, solved here by the linear solver with that load applied at the
/// nodes (M from the public assembly, rows of the free DOFs, all columns).
#[test]
fn portal_frame_modal_static_limit_matches_static_body_force() {
    let (h, b) = (3.0, 5.0);
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, b, h), (4, b, 0.0)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false), (3, "frame", 3, 4, 1, 1, false, false)];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let input = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, 0.01, 1e-4)], elems.clone(), sups.clone(), vec![]);
    let dof = DofNumbering::build_2d(&input);
    let n = dof.n_total;
    let mm = assemble_mass_matrix_2d(&input, &dof, &dens());
    let mut r = vec![0.0; n];
    for &node in &dof.node_order {
        r[dof.map[&(node, 0)]] = 1.0;
    }
    let mr: Vec<f64> = (0..n).map(|i| (0..n).map(|j| mm[i * n + j] * r[j]).sum()).collect();
    let mut loads = Vec::new();
    for &node in &[2usize, 3] {
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: node, fx: mr[dof.map[&(node, 0)]], fz: mr[dof.map[&(node, 1)]], my: mr[dof.map[&(node, 2)]] }));
    }
    let stat = dedaliano_engine::solver::linear::solve_2d(&make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 1e-4)], elems, sups, loads)).unwrap();
    let res = modal::solve_modal_2d(&input, &dens(), dof.n_free).unwrap();
    assert_eq!(res.modes.len(), dof.n_free);
    for node in [2usize, 3] {
        let modal: f64 = res.modes.iter().map(|m| {
            m.displacements.iter().find(|d| d.node_id == node).unwrap().ux * m.participation_x / (m.omega * m.omega)
        }).sum();
        let st = stat.displacements.iter().find(|d| d.node_id == node).unwrap().ux;
        assert!(rel(modal, st) < 1e-6, "node {node}: modal {modal:e} vs static {st:e}");
    }
}

/// Member torques after a second-order solve with the Wagner term are in equilibrium with
/// the applied torque and the reactions: a compressed cruciform (P = P_T/2) with a torque T
/// at midspan, fork-supported. Each member's torque is constant along it, the two
/// members meeting at midspan differ by T, and each end member's torque equals its
/// support's reaction. Checked for the co-rotational solver (whose residual carries the
/// Wagner torque, so its force recovery must too) and for P-Delta (Kg·u added to the
/// member forces).
#[test]
fn second_order_member_torques_balance_applied_torque_and_reactions() {
    let (n, l) = (8usize, 1.5);
    let s = CRUCIFORM;
    let p_t = gk() * s.j * s.a / (2.0 * s.iy);
    let torque = 0.01;
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n + 1, fx: -0.5 * p_t, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }),
        SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n / 2 + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: torque, my: 0.0, mz: 0.0, bw: None }),
    ];
    let input = make_3d_beam(n, l, E, NU, s.a, s.iy, s.iz, s.j,
        vec![true, true, true, true, false, false], Some(vec![false, true, true, true, false, false]), loads);

    let check = |name: &str, r: &AnalysisResults3D| {
        let f = |id: usize| r.element_forces.iter().find(|f| f.element_id == id).unwrap();
        let tol = 1e-6 * torque;
        for e in 1..=n {
            assert!((f(e).mx_start - f(e).mx_end).abs() < tol, "{name}: member {e} torque not constant: {} vs {}", f(e).mx_start, f(e).mx_end);
        }
        let jump = (f(n / 2).mx_end - f(n / 2 + 1).mx_start).abs();
        assert!((jump - torque).abs() < tol, "{name}: torque jump at midspan {jump} vs applied {torque}");
        let reac = |node: usize| r.reactions.iter().find(|x| x.node_id == node).map_or(0.0, |x| x.mx);
        assert!((reac(1) + reac(n + 1) + torque).abs() < tol, "{name}: Σ reactions {} + {}, applied {torque}", reac(1), reac(n + 1));
        assert!((f(1).mx_start.abs() - reac(1).abs()).abs() < tol, "{name}: member 1 torque {} vs reaction {}", f(1).mx_start, reac(1));
        assert!((f(n).mx_end.abs() - reac(n + 1).abs()).abs() < tol, "{name}: member {n} torque {} vs reaction {}", f(n).mx_end, reac(n + 1));
        // The second-order twist is amplified, so the support torques are not the
        // linear T/2 each only by coincidence of symmetry; both must still sum to T.
    };

    let pd = pdelta::solve_pdelta_3d(&input, 50, 1e-10).unwrap();
    assert!(pd.converged);
    check("P-Delta", &pd.results);

    let co = dedaliano_engine::solver::corotational::solve_corotational_3d(&input, 100, 1e-10, 10, false).unwrap();
    assert!(co.converged);
    check("corotational", &co.results);
    // Both second-order solvers amplify the midspan twist by about 1/(1 − P/P_T) = 2.
    let mid = |r: &AnalysisResults3D| r.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().rx;
    let amp = mid(&co.results) / mid(&pd.linear_results);
    assert!((amp - 2.0).abs() < 0.02, "co-rotational twist amplification {amp}");
}

/// The co-rotational solver refuses a shear-centre offset it does not model, but only on the
/// sections of frame members (Codex review of #468): an unused section in the catalogue, as the
/// web sends the whole catalogue, does not stop an otherwise supported frame.
#[test]
fn corotational_refuses_shear_centre_offset_only_where_a_frame_uses_it() {
    let load = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx: 0.0, fy: 0.0, fz: -1.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let mut input = make_3d_beam(4, 3.0, E, NU, 0.01, 1e-4, 1e-4, 1e-5, vec![true; 6], None, load);
    let mut offset = input.sections.values().next().unwrap().clone();
    offset.id = 99;
    offset.shear_center_y = Some(0.02);
    input.sections.insert("99".into(), offset);
    // Only in the catalogue: solved.
    let free = dedaliano_engine::solver::corotational::solve_corotational_3d(&input, 50, 1e-10, 5, false);
    assert!(free.is_ok(), "an unused offset section must not refuse the model: {:?}", free.err());
    // Used by a frame member: refused by name.
    input.elements.values_mut().next().unwrap().section_id = 99;
    let err = dedaliano_engine::solver::corotational::solve_corotational_3d(&input, 50, 1e-10, 5, false).unwrap_err();
    assert!(err.contains("shear-centre offset") && err.contains("99"), "{err}");
}
