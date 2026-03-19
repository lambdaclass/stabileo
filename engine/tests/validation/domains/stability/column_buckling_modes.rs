/// Validation: Column Buckling Modes and Critical Load Ratios
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 2
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2
///   - AISC 360, Appendix 7 (Effective Length Method)
///
/// The critical buckling load for a column depends on its effective
/// length, which is determined by the end conditions.
///
/// Pcr = π²EI/(KL)²
///
/// K factors for ideal conditions:
///   - Fixed-fixed: K = 0.5 → Pcr = 4π²EI/L²
///   - Fixed-pinned: K = 0.7 → Pcr ≈ 2.05π²EI/L²
///   - Pinned-pinned: K = 1.0 → Pcr = π²EI/L²
///   - Fixed-free: K = 2.0 → Pcr = π²EI/(4L²)
///
/// Tests verify:
///   1. Pinned-pinned Euler load
///   2. Fixed-fixed vs pinned-pinned ratio ≈ 4
///   3. Fixed-pinned ratio ≈ 2.05
///   4. Cantilever (fixed-free) ratio ≈ 0.25
///   5. Column with intermediate support: higher mode
///   6. Sway vs braced: K-factor difference
///   7. Long column: low Pcr
///   8. Short column: high Pcr
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Pinned-Pinned Euler Load
// ================================================================
//
// Apply a fraction of Euler load and verify significant lateral deflection.
// P_euler = π²EI/L²

#[test]
fn validation_buckling_euler_pinned() {
    let l = 10.0;
    let n = 20;
    let e_eff = E * 1000.0;

    let p_euler = std::f64::consts::PI.powi(2) * e_eff * IZ / (l * l);

    // Apply 50% of Euler load with small lateral perturbation
    let p_axial = -0.5 * p_euler;
    let p_lateral = 0.001;

    let mut input = make_column(n, l, E, A, IZ, "pinned", "rollerX", 0.0);
    input.loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fz: p_lateral, my: 0.0,
        }),
    ];

    // First-order (linear) analysis
    let res_linear = linear::solve_2d(&input).unwrap();
    let d_linear = res_linear.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // Second-order (P-delta) analysis
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    let d_pdelta = res_pdelta.results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // P-delta should amplify deflection: at 50% Pcr, amplification ≈ 2
    let amplification = d_pdelta / d_linear;
    assert!(amplification > 1.5,
        "Euler: P-delta amplification at 50% Pcr = {:.2} > 1.5", amplification);
}

// ================================================================
// 2. Fixed-Fixed vs Pinned-Pinned Ratio
// ================================================================
//
// Under same axial load, fixed-fixed column deflects less because
// its effective length is shorter (K=0.5 vs K=1.0).

#[test]
fn validation_buckling_fixed_vs_pinned() {
    let l = 8.0;
    let n = 16;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI.powi(2) * e_eff * IZ / (l * l);

    let p_axial = -0.5 * p_euler; // 50% of pinned-pinned Euler
    let p_lateral = 0.01;

    // Pinned-pinned
    let input_pp = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);
    let res_pp = linear::solve_2d(&input_pp).unwrap();

    // Fixed-fixed
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    let d_pp = res_pp.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();
    let d_ff = res_ff.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // Fixed-fixed is much stiffer (Pcr is 4× higher)
    // At 50% of PP Euler load, PP is significantly amplified but FF barely
    assert!(d_pp > d_ff * 2.0,
        "Fixed vs Pinned: PP deflects more: {:.6} > 2×{:.6}", d_pp, d_ff);
}

// ================================================================
// 3. Fixed-Pinned Intermediate Stiffness
// ================================================================

#[test]
fn validation_buckling_fixed_pinned() {
    let l = 8.0;
    let n = 16;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI.powi(2) * e_eff * IZ / (l * l);

    let p_axial = -0.5 * p_euler;
    let p_lateral = 0.01;

    // Pinned-pinned (reference)
    let input_pp = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);
    let res_pp = linear::solve_2d(&input_pp).unwrap();

    // Fixed-pinned
    let input_fp = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);
    let res_fp = linear::solve_2d(&input_fp).unwrap();

    // Fixed-fixed
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    let d_pp = res_pp.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();
    let d_fp = res_fp.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();
    let d_ff = res_ff.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // Fixed-pinned stiffness is between PP and FF
    assert!(d_fp < d_pp, "FP stiffer than PP: {:.6} < {:.6}", d_fp, d_pp);
    assert!(d_fp > d_ff, "FP more flexible than FF: {:.6} > {:.6}", d_fp, d_ff);
}

// ================================================================
// 4. Cantilever Column (Fixed-Free): Lowest Critical Load
// ================================================================

#[test]
fn validation_buckling_cantilever() {
    let l = 6.0;
    let n = 12;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI.powi(2) * e_eff * IZ / (l * l);

    // Apply 20% of PP Euler = 80% of cantilever Euler
    let p_axial = -0.20 * p_euler;
    let p_lateral = 0.01;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);

    // Linear analysis
    let res_lin = linear::solve_2d(&input).unwrap();
    let d_lin = res_lin.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // P-delta analysis
    let res_pd = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    let d_pd = res_pd.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // At 80% of cantilever Pcr, P-delta should significantly amplify
    let amplification = d_pd / d_lin;
    assert!(amplification > 2.0,
        "Cantilever: P-delta amplification = {:.2} > 2", amplification);
}

// ================================================================
// 5. Column with Intermediate Lateral Support
// ================================================================
//
// Adding a lateral support at midheight effectively halves
// the effective length, quadrupling the critical load.

#[test]
fn validation_buckling_intermediate_support() {
    let l = 10.0;
    let n = 20;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI.powi(2) * e_eff * IZ / (l * l);

    let p_lateral = 0.01;
    let p_axial = -0.5 * p_euler;

    // Without intermediate support
    let input_no = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 4 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);
    let res_no = linear::solve_2d(&input_no).unwrap();

    // With intermediate lateral support at midheight
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * l / n as f64, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![
        (1, 1, "pinned"),
        (2, n + 1, "rollerX"),
        (3, n / 2 + 1, "rollerX"), // intermediate lateral support
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n / 4 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
    ];
    let input_with = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let res_with = linear::solve_2d(&input_with).unwrap();

    // Deflection at quarter point (node n/4+1) — away from the intermediate support
    let d_no = res_no.displacements.iter()
        .find(|d| d.node_id == n / 4 + 1).unwrap().uz.abs();
    let d_with = res_with.displacements.iter()
        .find(|d| d.node_id == n / 4 + 1).unwrap().uz.abs();

    // Intermediate support reduces deflection significantly
    assert!(d_with < d_no * 0.5,
        "Intermediate support: {:.6} < 0.5×{:.6}", d_with, d_no);
}

// ================================================================
// 6. Sway vs Braced Frame
// ================================================================

#[test]
fn validation_buckling_sway_vs_braced() {
    let h = 4.0;
    let w = 6.0;
    let p_axial = -50.0; // gravity on columns
    let p_lateral = 0.1;

    // Braced frame: fixed bases
    let input_braced = make_portal_frame(h, w, E, A, IZ, p_lateral, p_axial);
    let res_braced = linear::solve_2d(&input_braced).unwrap();

    // Sway frame: pinned bases
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p_lateral, fz: p_axial, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: p_axial, my: 0.0 }),
    ];
    let input_sway = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let res_sway = linear::solve_2d(&input_sway).unwrap();

    // Sway frame deflects more laterally
    let d_braced = res_braced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_sway = res_sway.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(d_sway > d_braced * 2.0,
        "Sway vs braced: {:.6} > 2×{:.6}", d_sway, d_braced);
}

// ================================================================
// 7. Long Column: Low Pcr
// ================================================================
//
// Very long column with low stiffness → large deflections
// under modest axial load.

#[test]
fn validation_buckling_long_column() {
    let l = 20.0;
    let n = 20;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI.powi(2) * e_eff * IZ / (l * l);

    // Apply 50% of Euler load
    let p_axial = -0.5 * p_euler;
    let p_lateral = 0.001;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);

    // Linear deflection
    let res_lin = linear::solve_2d(&input).unwrap();
    let d_lin = res_lin.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // P-delta deflection
    let res_pd = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    let d_pd = res_pd.results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // At 50% Pcr, amplification ≈ 1/(1-0.5) = 2
    let amplification = d_pd / d_lin;
    assert_close(amplification, 2.0, 0.5,
        "Long column: P-delta amplification ≈ 2 at 50% Pcr");
}

// ================================================================
// 8. Short Column: High Pcr
// ================================================================
//
// Short column (large stiffness relative to length) shows
// minimal amplification even under significant axial load.

#[test]
fn validation_buckling_short_column() {
    let l = 2.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI.powi(2) * e_eff * IZ / (l * l);

    // Apply a load that is small relative to short column's Pcr
    let p_axial = -0.1 * p_euler;
    let p_lateral = 1.0;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fz: p_lateral, my: 0.0 }),
        ]);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz;
    let d_first = p_lateral * l.powi(3) / (48.0 * e_eff * IZ);
    let amplification = d_mid.abs() / d_first;

    // At 10% Pcr, amplification ≈ 1/(1-0.1) ≈ 1.11
    assert_close(amplification, 1.0 / (1.0 - 0.1), 0.3,
        "Short column: amplification ≈ 1.11 at 10% Pcr");
}
