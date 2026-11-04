//! Checks written while documenting the geometric stiffness, mass matrices and the
//! dynamics / eigen solvers (docs/solver/mass-geometric-dynamics.md).
//!
//! Each test pins a formula or a convention the document states. Tests marked
//! `#[ignore = "open question MD-n: ..."]` demonstrate a discrepancy that is left
//! for review; run them with `--include-ignored` to see them fail.

use crate::common;
use common::*;
use dedaliano_engine::element::Hinge3D;
use dedaliano_engine::solver::geometric_stiffness::{frame_kg_local_2d, frame_kg_local_3d, truss_kg_3d, KgSection};
use dedaliano_engine::solver::mass_matrix::{
    assemble_mass_matrix_2d, frame_consistent_mass, frame_consistent_mass_3d, frame_consistent_mass_3d_warping,
};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::{buckling, modal, spectral, time_integration};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::f64::consts::PI;

const E: f64 = 200_000.0; // MPa (the solver multiplies by 1000 → kN/m²)
const RHO: f64 = 7850.0; // kg/m³ (the solver divides by 1000 → t/m³)

fn dens() -> HashMap<String, f64> {
    HashMap::from([("1".to_string(), RHO)])
}

fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs().max(1e-300)
}

// ---------------------------------------------------------------------------
// Geometric stiffness kernels
// ---------------------------------------------------------------------------

/// Kg 2D: P/(30L)·[36, 3L, −36, 3L; 3L, 4L², −3L, −L²; …] on (v1, θ1, v2, θ2), zero on the
/// axial DOFs, symmetric; with both ends released the transverse block is the string P/L.
#[test]
fn kg_2d_closed_form_symmetry_and_string_limit() {
    let (p, l) = (-150.0, 2.5);
    let kg = frame_kg_local_2d(p, l, false, false);
    let c = p / (30.0 * l);
    let expect = [
        (1, 1, 36.0), (1, 2, 3.0 * l), (1, 4, -36.0), (1, 5, 3.0 * l),
        (2, 2, 4.0 * l * l), (2, 4, -3.0 * l), (2, 5, -l * l),
        (4, 4, 36.0), (4, 5, -3.0 * l), (5, 5, 4.0 * l * l),
    ];
    for &(i, j, v) in &expect {
        assert!((kg[i * 6 + j] - c * v).abs() < 1e-12 * c.abs() * 36.0, "kg[{i}][{j}]");
        assert!((kg[j * 6 + i] - c * v).abs() < 1e-12 * c.abs() * 36.0, "kg[{j}][{i}]");
    }
    for k in 0..6 {
        assert_eq!(kg[k], 0.0, "axial row 0 is zero");
        assert_eq!(kg[3 * 6 + k], 0.0, "axial row 3 is zero");
    }
    let s = frame_kg_local_2d(p, l, true, true);
    let pl = p / l;
    assert!((s[1 * 6 + 1] - pl).abs() < 1e-12 * pl.abs());
    assert!((s[1 * 6 + 4] + pl).abs() < 1e-12 * pl.abs());
    assert!((s[4 * 6 + 4] - pl).abs() < 1e-12 * pl.abs());
    for &(i, j) in &[(2, 2), (5, 5), (1, 2), (2, 5)] {
        assert!(s[i * 6 + j].abs() < 1e-12 * pl.abs() * l * l, "released rotation ({i},{j}) carries no Kg");
    }
}

/// MD-1: the 3D frame Kg has no axial (P/L on u) entries and no end-moment terms. Its two
/// bending blocks are the 2D block, with the θy coupling sign flipped (θy = −w'). The Wagner
/// term P·r0²/L on the twist is there since #434 (MD-1 PARTLY FIXED): with r0 = 0 (an empty
/// `KgSection`) the twist rows stay empty, with r0 > 0 they carry exactly that term.
#[test]
fn kg_3d_has_bending_blocks_only() {
    let (p, l) = (-80.0, 3.0);
    let kg = frame_kg_local_3d(p, l, &Hinge3D::default(), &KgSection::default());
    for &d in &[0usize, 3, 6, 9] {
        for k in 0..12 {
            assert_eq!(kg[d * 12 + k], 0.0, "row {d} (axial/torsion) must be empty");
        }
    }
    let k2 = frame_kg_local_2d(p, l, false, false);
    let yz = [1usize, 5, 7, 11];
    let xz = [2usize, 4, 8, 10];
    let d2 = [1usize, 2, 4, 5];
    let sgn = [1.0, -1.0, 1.0, -1.0];
    for a in 0..4 {
        for b in 0..4 {
            let v2 = k2[d2[a] * 6 + d2[b]];
            assert!((kg[yz[a] * 12 + yz[b]] - v2).abs() < 1e-12 * v2.abs().max(1.0));
            assert!((kg[xz[a] * 12 + xz[b]] - sgn[a] * sgn[b] * v2).abs() < 1e-12 * v2.abs().max(1.0));
        }
    }
    // The Wagner term on the linear twist, θx at DOFs 3 and 9: P·r0²/L·[1, −1; −1, 1].
    let r0_sq = 0.0125;
    let kw = frame_kg_local_3d(p, l, &Hinge3D::default(), &KgSection { r0_sq, y0: 0.0, z0: 0.0 });
    let w = p * r0_sq / l;
    for &(i, j, v) in &[(3usize, 3usize, w), (9, 9, w), (3, 9, -w), (9, 3, -w)] {
        assert!((kw[i * 12 + j] - v).abs() < 1e-12 * w.abs(), "Wagner ({i},{j}): {} vs {v}", kw[i * 12 + j]);
    }
    for k in 0..144 {
        if ![3 * 12 + 3, 9 * 12 + 9, 3 * 12 + 9, 9 * 12 + 3].contains(&k) {
            assert_eq!(kw[k], kg[k], "only the twist entries change with r0 (entry {k})");
        }
    }
    // Truss: (P/L)(I − e eᵀ) — transverse only.
    let t = truss_kg_3d(p / l, &[1.0, 0.0, 0.0]);
    assert_eq!(t[0], 0.0);
    assert!((t[1 * 6 + 1] - p / l).abs() < 1e-12);
}

// ---------------------------------------------------------------------------
// Mass kernels
// ---------------------------------------------------------------------------

/// 2D and 3D consistent masses agree: the 3D (v, θz) block is the 2D transverse block,
/// the (w, θy) block is it with the θy coupling sign flipped, the axial block is
/// ρAL/6·[2,1;1,2], torsion is ρ(Iy+Iz)L/6·[2,1;1,2]. A rigid translation carries the
/// whole ρAL in every direction; no rotary (ρI) term is present in the bending blocks.
#[test]
fn consistent_mass_2d_and_3d_agree() {
    let (rho_a, a, iy, iz, l) = (0.0785, 0.01, 2e-5, 8e-5, 2.0);
    let m2 = frame_consistent_mass(rho_a, l, false, false);
    let m3 = frame_consistent_mass_3d(rho_a, a, iy, iz, l, Hinge3D::default());
    let d2 = [1usize, 2, 4, 5];
    let yz = [1usize, 5, 7, 11];
    let xz = [2usize, 4, 8, 10];
    let sgn = [1.0, -1.0, 1.0, -1.0];
    for i in 0..4 {
        for j in 0..4 {
            let v = m2[d2[i] * 6 + d2[j]];
            assert!((m3[yz[i] * 12 + yz[j]] - v).abs() < 1e-15);
            assert!((m3[xz[i] * 12 + xz[j]] - sgn[i] * sgn[j] * v).abs() < 1e-15);
        }
    }
    let m = rho_a * l;
    assert!((m3[0] - m / 3.0).abs() < 1e-15 && (m3[6] - m / 6.0).abs() < 1e-15);
    let mt = rho_a * (iy + iz) / a * l;
    assert!((m3[3 * 12 + 3] - mt / 3.0).abs() < 1e-15 && (m3[3 * 12 + 9] - mt / 6.0).abs() < 1e-15);
    // rᵀ M r = ρAL for a unit translation along each local axis.
    for dir in 0..3 {
        let r: Vec<f64> = (0..12).map(|k| if k == dir || k == dir + 6 { 1.0 } else { 0.0 }).collect();
        let s: f64 = (0..12).map(|i| (0..12).map(|j| r[i] * m3[i * 12 + j] * r[j]).sum::<f64>()).sum();
        assert!(rel(s, m) < 1e-14, "direction {dir}: {s} vs {m}");
    }
    // Euler–Bernoulli: the rotation diagonal is ρAL³/105 exactly, with no ρI·L/... added.
    assert!(rel(m2[2 * 6 + 2], rho_a * l.powi(3) / 105.0) < 1e-14);
}

/// MD-2 (DOCUMENTED-CHOICE): a member with ANY release (bending or torsion) gets the lumped
/// mass ρAL/2 on each translation and nothing on any rotation — in 2D and 3D, warping or not.
#[test]
fn released_members_are_lumped_translations_only() {
    let (rho_a, l) = (0.05, 3.0);
    let m2 = frame_consistent_mass(rho_a, l, true, false);
    for k in 0..6 {
        for q in 0..6 {
            let expect = if k == q && [0, 1, 3, 4].contains(&k) { rho_a * l / 2.0 } else { 0.0 };
            assert_eq!(m2[k * 6 + q], expect);
        }
    }
    let h = Hinge3D { release_t_end: true, ..Default::default() };
    let m3 = frame_consistent_mass_3d(rho_a, 0.01, 1e-5, 2e-5, l, h);
    for k in 0..12 {
        let expect = if [0, 1, 2, 6, 7, 8].contains(&k) { rho_a * l / 2.0 } else { 0.0 };
        assert_eq!(m3[k * 12 + k], expect, "torsion release lumps the whole member");
    }
    let m14 = frame_consistent_mass_3d_warping(rho_a, 0.01, 1e-5, 2e-5, 1e-8, l, h);
    for &k in &[3usize, 4, 5, 6, 10, 11, 12, 13] {
        assert_eq!(m14[k * 14 + k], 0.0, "rotation/warping DOF {k} massless when lumped");
    }
}

/// Quantifies MD-2: a pinned-pinned beam whose two end members carry a (redundant) hinge at
/// the support is the same structure, but those members are lumped. The fundamental frequency
/// moves by the discretisation error of the lumped members only.
#[test]
fn lumped_end_members_change_the_fundamental_little() {
    let (l, a, iz) = (6.0, 0.01, 1e-4);
    let n = 6;
    let mut consistent = make_beam(n, l, E, a, iz, "pinned", Some("pinned"), vec![]);
    let mut hinged = consistent.clone();
    for e in hinged.elements.values_mut() {
        if e.id == 1 { e.hinge_start = true; }
        if e.id == n { e.hinge_end = true; }
    }
    consistent.loads.clear();
    let w_exact = (PI / l).powi(2) * (E * 1000.0 * iz / (RHO / 1000.0 * a)).sqrt();
    let w_c = modal::solve_modal_2d(&consistent, &dens(), 3).unwrap().modes[0].omega;
    let w_h = modal::solve_modal_2d(&hinged, &dens(), 3).unwrap().modes[0].omega;
    eprintln!("ω1 exact {w_exact:.4}, consistent {w_c:.4} ({:+.3}%), end members lumped {w_h:.4} ({:+.3}%)",
        100.0 * (w_c / w_exact - 1.0), 100.0 * (w_h / w_exact - 1.0));
    assert!(rel(w_c, w_exact) < 1e-3);
    assert!(rel(w_h, w_exact) < 2e-2);
}

/// MD-3 (DOCUMENTED-CHOICE): no rotary inertia. A deep simply supported beam (L/h = 5) meshed
/// finely reproduces the Euler–Bernoulli frequencies; a Rayleigh beam would be lower by
/// 1/√(1 + (nπr/L)²) — 1.6%, 6.0%, 12.0% for modes 1–3 — and a Timoshenko beam lower still.
#[test]
fn modal_frequencies_are_euler_bernoulli_without_rotary_inertia() {
    let (l, b, h): (f64, f64, f64) = (5.0, 0.3, 1.0);
    let (a, iz) = (b * h, b * h.powi(3) / 12.0);
    let input = make_beam(40, l, E, a, iz, "pinned", Some("pinned"), vec![]);
    let res = modal::solve_modal_2d(&input, &dens(), 8).unwrap();
    // Bending modes: the ones dominated by transverse motion.
    let bending: Vec<f64> = res.modes.iter().filter(|m| {
        let uz = m.displacements.iter().fold(0.0f64, |s, d| s.max(d.uz.abs()));
        let ux = m.displacements.iter().fold(0.0f64, |s, d| s.max(d.ux.abs()));
        uz > ux
    }).map(|m| m.omega).collect();
    let r = (iz / a).sqrt();
    for n in 1..=3 {
        let k = n as f64 * PI / l;
        let w_eb = k * k * (E * 1000.0 * iz / (RHO / 1000.0 * a)).sqrt();
        let rayleigh = 1.0 / (1.0 + (k * r).powi(2)).sqrt();
        eprintln!("mode {n}: FE {:.2} rad/s, EB {:.2}, Rayleigh-beam factor {:.4} ({:.1}% lower)",
            bending[n - 1], w_eb, rayleigh, 100.0 * (1.0 - rayleigh));
        assert!(rel(bending[n - 1], w_eb) < 5e-3, "mode {n} follows EB: {} vs {}", bending[n - 1], w_eb);
    }
}

// ---------------------------------------------------------------------------
// Modal participation
// ---------------------------------------------------------------------------

/// A vertical cantilever of `n` frame elements (base fixed at node 1), X is transverse.
fn cantilever_column(n: usize, l: f64) -> SolverInput {
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, l * i as f64 / n as f64)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 1e-4)], elems, vec![(1, 1, "fixed")], vec![])
}

/// MD-4: since #434 the participation factors use (M·r)_f, the free rows of the full product
/// (MD-5), so Σ over ALL modes of the effective mass is (M·r)_fᵀ·M_ff⁻¹·(M·r)_f. For a one-element
/// cantilever, M_ff = m/420·[156, −22L; −22L, 4L²] and (M·r)_f = m/420·[210, −35L] give
/// 315/420·m = 75% of the member mass (it was r_fᵀ·M_ff·r_f = 156/420 = 37% before). Mass
/// ratios still divide by the total ρAL; refining the mesh takes the sum to the total.
#[test]
fn effective_mass_sums_to_free_mass_not_total_mass() {
    let input = cantilever_column(1, 3.0);
    let res = modal::solve_modal_2d(&input, &dens(), 3).unwrap();
    let m_tot = RHO / 1000.0 * 0.01 * 3.0;
    let sum: f64 = res.modes.iter().map(|m| m.effective_mass_x).sum();
    assert!(rel(res.total_mass, m_tot) < 1e-12);
    assert!(rel(sum, 315.0 / 420.0 * m_tot) < 1e-8, "Σ meff = {sum}, 315/420·m = {}", 315.0 / 420.0 * m_tot);
    assert!(rel(res.cumulative_mass_ratio_x, 315.0 / 420.0) < 1e-8);
}

/// Σ_n φ_n(tip) Γ_n / ω_n² over all modes for a cantilever of `n` elements: the static tip
/// deflection under a unit uniform ground acceleration predicted by the modal data.
fn modal_static_tip(n: usize, l: f64) -> f64 {
    let input = cantilever_column(n, l);
    let res = modal::solve_modal_2d(&input, &dens(), 3 * n).unwrap();
    assert_eq!(res.modes.len(), 3 * n);
    res.modes.iter().map(|m| {
        let tip = m.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
        tip * m.participation_x / (m.omega * m.omega)
    }).sum()
}

/// MD-5 (FIXED, #434): the participation factor used M_ff·r_f, the free-DOF block only. For a
/// uniform ground motion the effective load is −(M·r)_f·a_g = −(M_ff·r_f + M_fr·r_r)·a_g
/// (Chopra §9.7, the m_g term); the time-history path uses that full product. With all modes
/// and a rigid (constant) acceleration the modal sum must give the static response to the
/// consistent body force, which is exact at the nodes: ρA·a_g·L⁴/(8EI) at the tip of a
/// cantilever. The free-block Γ gives 0.781 of it for one element per column.
#[test]
fn modal_participation_includes_support_coupled_mass() {
    let l: f64 = 3.0;
    let exact = RHO / 1000.0 * 0.01 * l.powi(4) / (8.0 * E * 1000.0 * 1e-4);
    for n in [1usize, 2, 4, 8] {
        let s = modal_static_tip(n, l);
        eprintln!("n = {n}: modal Σ φΓ/ω² = {s:.6e}, exact {exact:.6e}, ratio {:.4}", s / exact);
    }
    let s1 = modal_static_tip(1, l);
    assert!(rel(s1, exact) < 1e-6, "modal static limit {s1:e} vs exact {exact:e} (ratio {:.4})", s1 / exact);
}

/// The product the participation factor uses: (M·r) on the free rows, the consistent UDL load.
#[test]
fn support_coupled_mass_row_is_the_consistent_udl_load() {
    let l: f64 = 3.0;
    let input = cantilever_column(1, l);
    let dof = DofNumbering::build_2d(&input);
    let m = assemble_mass_matrix_2d(&input, &dof, &dens());
    let n = dof.n_total;
    let tip_ux = dof.map[&(2, 0)];
    let mr: f64 = (0..n).filter(|&j| dof.map.iter().any(|(&(_, loc), &g)| g == j && loc == 0)).map(|j| m[tip_ux * n + j]).sum();
    let m_tot = RHO / 1000.0 * 0.01 * l;
    assert!(rel(mr, m_tot / 2.0) < 1e-12, "(M·r)_tip = ρAL/2 = consistent UDL load, got {mr}");
}

// ---------------------------------------------------------------------------
// Response spectrum
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

/// Der Kiureghian (1981), equal damping: ρ = 8ξ²(1+r)r^{3/2} / ((1−r²)² + 4ξ²r(1+r)²).
fn rho_dk(r: f64, xi: f64) -> f64 {
    8.0 * xi * xi * (1.0 + r) * r.powf(1.5) / ((1.0 - r * r).powi(2) + 4.0 * xi * xi * r * (1.0 + r).powi(2))
}

/// The CQC coefficient the solver applies is Der Kiureghian's, symmetric in the mode order.
/// Two copies of one shape at ω and 1.1ω: the combined tip displacement u satisfies
/// u² = u₁² + u₂² + 2ρ·u₁u₂.
#[test]
fn cqc_coefficient_is_der_kiureghian_1981() {
    let input = cantilever_column(4, 3.0);
    let m1 = to_spectral(&modal::solve_modal_2d(&input, &dens(), 2).unwrap().modes[0]);
    let w = m1.omega;
    for ratio in [1.05, 1.1, 1.5, 3.0] {
        let a = variant(&m1, w, false);
        let b = variant(&m1, ratio * w, false);
        let tip = |r: &spectral::SpectralResult| r.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
        let ua = tip(&run_spectral(&input, vec![a.clone()], "SRSS"));
        let ub = tip(&run_spectral(&input, vec![b.clone()], "SRSS"));
        let u = tip(&run_spectral(&input, vec![a.clone(), b.clone()], "CQC"));
        let u_rev = tip(&run_spectral(&input, vec![b, a], "CQC"));
        let rho = (u * u - ua * ua - ub * ub) / (2.0 * ua * ub);
        assert!((rho - rho_dk(ratio, 0.05)).abs() < 1e-9, "r = {ratio}: ρ = {rho}, DK = {}", rho_dk(ratio, 0.05));
        assert!(rel(u, u_rev) < 1e-12, "CQC symmetric in mode order");
    }
}

/// MD-6 (OPEN, conservative): element forces are combined from per-mode ABSOLUTE values,
/// max(|start|, |end|), so the CQC cross terms ρ_ij·|r_i|·|r_j| are never negative. The
/// displacements are combined signed. Two modes with the same shape and opposite sign at ω
/// and 1.1ω give responses r and −0.826r: CQC gives |r|·√(1 + c² − 2ρc) for the tip displacement
/// but |M|·√(1 + c² + 2ρc) for the base moment, although the two are proportional.
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
    eprintln!("M/u single mode {ratio_single:.6e}, two modes {ratio_both:.6e} ({:.2}×)", ratio_both / ratio_single);
    assert!(rel(ratio_both, ratio_single) < 1e-9);
}

/// MD-7 (OPEN, unconservative): `base_shear` is always the SRSS of meff_n·Sa_n, also when CQC
/// is requested. Modal base shears in one direction are all positive, so CQC ≥ SRSS: for two
/// modes at ω and 1.1ω (ρ = 0.52) the CQC base shear is 1.23× the reported one.
#[test]
fn spectral_base_shear_follows_the_requested_rule() {
    let input = cantilever_column(4, 3.0);
    let m1 = to_spectral(&modal::solve_modal_2d(&input, &dens(), 2).unwrap().modes[0]);
    let w = m1.omega;
    let res = run_spectral(&input, vec![variant(&m1, w, false), variant(&m1, 1.1 * w, false)], "CQC");
    let v = m1.effective_mass_x * 2.0;
    let cqc = v * (2.0 + 2.0 * rho_dk(1.1, 0.05)).sqrt();
    eprintln!("reported {:.6}, SRSS {:.6}, CQC {:.6}", res.base_shear, v * 2f64.sqrt(), cqc);
    assert!(rel(res.base_shear, cqc) < 1e-9, "base shear {} vs CQC {}", res.base_shear, cqc);
}

// ---------------------------------------------------------------------------
// Buckling
// ---------------------------------------------------------------------------

/// MD-8 (OPEN, unconservative): without the Wagner term P·Ip/A in Kg, a column whose pure
/// torsional buckling load P_T = GJ·A/Ip is below the Euler load is reported at the Euler
/// load. A 200×10 mm cruciform, L = 1.5 m, pinned and fork-supported: P_E = 5860 kN,
/// P_T = 2993 kN; the solver returns P_E (+96%).
#[test]
fn cruciform_column_buckles_in_torsion() {
    let (l, nu) = (1.5, 0.3);
    let (a, iy, j) = (0.0039, 6.68e-6, 1.333e-7);
    let load = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 9, fx: -1.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let input = make_3d_beam(8, l, E, nu, a, iy, iy, j,
        vec![true, true, true, true, false, false], Some(vec![false, true, true, true, false, false]), load);
    let res = buckling::solve_buckling_3d(&input, 4).unwrap();
    let e = E * 1000.0;
    let g = e / (2.0 * (1.0 + nu));
    let p_e = PI * PI * e * iy / (l * l);
    let p_t = g * j * a / (2.0 * iy);
    eprintln!("λ = {:.1}, P_E = {p_e:.1}, P_T = {p_t:.1}", res.modes[0].load_factor);
    assert!(rel(res.modes[0].load_factor, p_t.min(p_e)) < 0.02);
}

/// MD-9 (DOCUMENTED-CHOICE): Kg is built from axial forces only — no lateral-torsional
/// buckling. A beam under pure end moments is refused rather than analysed.
#[test]
fn beam_in_pure_bending_has_no_buckling_problem() {
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 50.0, mz: 0.0, bw: None }),
        SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx: 0.0, fy: 0.0, fz: 0.0, mx: 0.0, my: -50.0, mz: 0.0, bw: None }),
    ];
    let input = make_3d_beam(4, 6.0, E, 0.3, 5e-3, 8e-5, 2e-6, 1e-7,
        vec![true, true, true, true, false, false], Some(vec![false, true, true, true, false, false]), loads);
    let err = buckling::solve_buckling_3d(&input, 2).unwrap_err();
    assert!(err.contains("No compressed elements"), "{err}");
}

// ---------------------------------------------------------------------------
// Time integration
// ---------------------------------------------------------------------------

fn th_input(alpha: Option<f64>, method: &str) -> TimeHistoryInput {
    let solver = make_beam(2, 2.0, E, 0.01, 8.33e-6, "fixed", None, vec![]);
    TimeHistoryInput {
        solver,
        densities: dens(),
        time_step: 1e-3,
        n_steps: 5,
        method: method.into(),
        beta: 0.25,
        gamma: 0.5,
        alpha,
        damping_xi: None,
        ground_accel: None,
        ground_direction: None,
        force_history: Some(vec![TimeForceRecord { time: 0.0, loads: vec![SolverNodalLoad { node_id: 3, fx: 0.0, fz: -1.0, my: 0.0 }] }]),
    }
}

/// HHT-α parameters: γ = ½ − α, β = (1 − α)²/4; Newmark defaults β = ¼, γ = ½.
#[test]
fn hht_and_newmark_parameters() {
    let (_, t) = time_integration::solve_time_history_2d_traced(&th_input(Some(-0.1), "hht")).unwrap();
    // α is stored after a round trip through the scheme's parameters, so compare to round-off.
    assert!((t.alpha.unwrap() + 0.1).abs() < 1e-15, "{:?}", t.alpha);
    assert!((t.gamma - 0.6).abs() < 1e-15);
    assert!((t.beta - 1.1f64 * 1.1 / 4.0).abs() < 1e-15);
    let (_, t) = time_integration::solve_time_history_2d_traced(&th_input(None, "newmark")).unwrap();
    assert_eq!((t.beta, t.gamma, t.alpha), (0.25, 0.5, None));
}

/// MD-10 (OPEN, API): the `method` field is not read. `method = "hht"` without `alpha` runs
/// plain Newmark, and `method = "newmark"` with `alpha` runs HHT.
#[test]
fn time_history_method_field_selects_the_scheme() {
    let r = time_integration::solve_time_history_2d(&th_input(None, "hht"));
    match r {
        Err(_) => {}
        Ok(res) => assert!(res.method.contains("HHT"), "method 'hht' ran as {}", res.method),
    }
}
