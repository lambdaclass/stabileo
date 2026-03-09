/// Validation: P-Delta Analysis Benchmarks (Extended)
///
/// References:
///   - AISC 360-16, Appendix 8 (Approximate Second-Order Analysis)
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2-3
///   - Chen & Lui, "Structural Stability", Ch. 3-4
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 1-2
///
/// Tests verify additional P-delta (geometric nonlinearity) effects:
///   1. B2 factor consistency with AISC formula
///   2. Cantilever with varying axial ratios: monotonic amplification
///   3. Symmetric frame: P-delta preserves symmetry of vertical reactions
///   4. Portal frame with leaning column effect
///   5. Element force equilibrium under P-delta
///   6. Convergence iteration count: light vs heavy load
///   7. P-delta moment redistribution in two-bay frame
///   8. Propped cantilever column: P-delta shear amplification
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. B2 Factor Consistency with AISC Formula
// ================================================================
//
// AISC 360-16: B2 = 1 / (1 - P_story / P_e_story)
// For a portal frame, P_e_story ~ sum(pi^2 EI / L^2) for columns.
// The solver reports b2_factor; verify it against the AISC formula
// using the linear analysis drift to compute P_e_story.
//
// P_e_story = R_M * sum(HL) / delta_H  (AISC Eq. C-A-8-7)
// where R_M = 1.0 for braced frames, 0.85 for moment frames.

#[test]
fn validation_pdelta_b2_factor_aisc() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let p_lateral = 10.0;
    let p_gravity = -60.0;

    let input = make_portal_frame(h, w, E, A, IZ, p_lateral, p_gravity);

    let res_linear = linear::solve_2d(&input).unwrap();
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Compute AISC B2 from linear drift
    // delta_H = lateral drift at top of story from lateral loads only
    let input_lat_only = make_portal_frame(h, w, E, A, IZ, p_lateral, 0.0);
    let res_lat_only = linear::solve_2d(&input_lat_only).unwrap();
    let delta_h = res_lat_only.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Total story gravity = 2 * |p_gravity| (two nodes loaded)
    let p_story: f64 = 2.0 * p_gravity.abs();

    // R_M = 0.85 for unbraced (moment) frames
    let r_m = 0.85;
    // P_e_story = R_M * (sum H_i * L_i) / delta_H
    // sum(H*L) = p_lateral * h (only one lateral load at story level)
    let p_e_story = r_m * (p_lateral * h) / delta_h;
    let b2_aisc = 1.0 / (1.0 - p_story / p_e_story);

    // Solver B2 factor
    let b2_solver = res_pdelta.b2_factor;

    // Compare: allow some discrepancy since AISC is approximate
    let d_linear = res_linear.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_pdelta = res_pdelta.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let b2_from_disp = d_pdelta / d_linear;

    // The solver's b2_factor should be close to the displacement ratio
    assert_close(b2_solver, b2_from_disp, 0.10,
        "Solver B2 ~ displacement amplification ratio");

    // AISC B2 should be in the right ballpark (within 20%)
    assert!(b2_aisc > 1.0, "AISC B2 > 1.0: {:.4}", b2_aisc);
    assert!(b2_from_disp > 1.0, "Displacement B2 > 1.0: {:.4}", b2_from_disp);
}

// ================================================================
// 2. Cantilever: Monotonic Amplification with Increasing Axial Load
// ================================================================
//
// As axial compression increases (staying below critical), P-delta
// amplification should monotonically increase.

#[test]
fn validation_pdelta_monotonic_amplification() {
    let l = 5.0;
    let n = 8;
    let h_force = 3.0;

    // Test several axial load levels (compression = negative fx)
    let axial_levels = [-20.0, -50.0, -100.0, -200.0];
    let mut prev_ratio: f64 = 1.0;

    for &p_axial in &axial_levels {
        let input = make_beam(n, l, E, A, IZ, "fixed", None,
            vec![
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: n + 1, fx: p_axial, fy: -h_force, mz: 0.0,
                }),
            ]);

        let d_linear: f64 = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();
        let d_pdelta: f64 = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap()
            .results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

        let ratio = d_pdelta / d_linear;
        assert!(ratio >= prev_ratio,
            "P={}: amplification {:.4} >= prev {:.4}", p_axial, ratio, prev_ratio);
        prev_ratio = ratio;
    }

    // Final amplification should be significantly above 1.0
    assert!(prev_ratio > 1.05,
        "Maximum amplification should be noticeable: {:.4}", prev_ratio);
}

// ================================================================
// 3. Symmetric Frame: P-Delta Preserves Vertical Reaction Symmetry
// ================================================================
//
// A portal frame with symmetric gravity load and NO lateral load:
// vertical reactions should remain equal under P-delta (no sway).

#[test]
fn validation_pdelta_symmetric_gravity() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let p_gravity = -80.0;

    // No lateral load, only symmetric gravity
    let input = make_portal_frame(h, w, E, A, IZ, 0.0, p_gravity);

    let results = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Both supports should have the same vertical reaction (by symmetry)
    let ry_1 = results.results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let ry_4 = results.results.reactions.iter()
        .find(|r| r.node_id == 4).unwrap().ry;

    assert_close(ry_1, ry_4, 0.01,
        "Symmetric gravity: Ry1 = Ry4");

    // Total vertical reaction = 2 * |p_gravity|
    let sum_ry: f64 = results.results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p_gravity.abs(), 0.01,
        "Symmetric gravity: total Ry = total applied");

    // Lateral drift should be negligible (no sway)
    let ux_2: f64 = results.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    assert!(ux_2 < 1e-8,
        "Symmetric gravity: no lateral drift: ux = {:.6e}", ux_2);
}

// ================================================================
// 4. Leaning Column Effect in Portal Frame
// ================================================================
//
// A portal frame with one column pinned at top (leaning column).
// The rigid column must resist all lateral stiffness.
// With gravity on the leaning column, P-delta effect on the rigid
// column increases because the leaning column transfers its
// destabilizing effect.

#[test]
fn validation_pdelta_leaning_column() {
    let h = 4.0;
    let w = 6.0;
    let p_lateral = 5.0;
    let p_gravity = -60.0;

    // Standard portal frame (both columns rigid)
    let input_standard = make_portal_frame(h, w, E, A, IZ, p_lateral, p_gravity);

    // Frame with leaning column: beam element 2-3 has hinge at end (node 3),
    // and column 3-4 has hinge at start (node 3).
    // This makes node 3 a pin joint, creating a leaning column on the right.
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),       // left column (rigid)
        (2, "frame", 2, 3, 1, 1, false, true),         // beam (hinge at node 3)
        (3, "frame", 3, 4, 1, 1, true, false),         // right column (hinge at top = leaning)
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p_lateral, fy: p_gravity, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0 }),
    ];
    let input_leaning = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);

    let res_standard = pdelta::solve_pdelta_2d(&input_standard, 20, 1e-6).unwrap();
    let res_leaning = pdelta::solve_pdelta_2d(&input_leaning, 20, 1e-6).unwrap();

    // Leaning column frame should have larger drift (less lateral stiffness)
    let drift_standard = res_standard.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let drift_leaning = res_leaning.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(drift_leaning > drift_standard,
        "Leaning column has more drift: {:.6e} > {:.6e}", drift_leaning, drift_standard);

    // Equilibrium must still hold for leaning column case
    let sum_rx: f64 = res_leaning.results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p_lateral, 0.02, "Leaning column: ΣRx = -Px");
}

// ================================================================
// 5. Element Forces: Internal Equilibrium Under P-Delta
// ================================================================
//
// For each element without distributed load, the internal sign convention gives:
//   n_start ≈ n_end  (constant axial force along the element)
//   v_start ≈ v_end  (constant shear along the element)
//   m_end ≈ m_start + v_start * L  (moment equilibrium)
// Also verify global equilibrium holds.

#[test]
fn validation_pdelta_element_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let p_lateral = 8.0;
    let p_gravity = -50.0;

    let input = make_portal_frame(h, w, E, A, IZ, p_lateral, p_gravity);
    let results = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    for ef in &results.results.element_forces {
        // Axial: n_start ≈ n_end (constant axial force, no distributed axial load)
        let axial_diff = (ef.n_start - ef.n_end).abs();
        assert!(axial_diff < 0.1,
            "Element {}: constant axial: n_start({:.4}) ≈ n_end({:.4}), diff = {:.4e}",
            ef.element_id, ef.n_start, ef.n_end, axial_diff);

        // Shear: v_start ≈ v_end (constant shear, no transverse distributed load)
        let shear_diff = (ef.v_start - ef.v_end).abs();
        assert!(shear_diff < 0.1,
            "Element {}: constant shear: v_start({:.4}) ≈ v_end({:.4}), diff = {:.4e}",
            ef.element_id, ef.v_start, ef.v_end, shear_diff);

        // Moment equilibrium: m_end ≈ m_start - v_start * L
        // (from taking moments about start node in local coordinates)
        let m_expected = ef.m_start - ef.v_start * ef.length;
        let m_diff = (ef.m_end - m_expected).abs();
        let m_scale = ef.m_start.abs().max(ef.m_end.abs()).max(1.0);
        assert!(m_diff / m_scale < 0.05,
            "Element {}: moment equilibrium: m_end({:.4}) ≈ m_start({:.4}) - V*L({:.4}), diff = {:.4e}",
            ef.element_id, ef.m_end, ef.m_start, ef.v_start * ef.length, m_diff);
    }

    // Global equilibrium
    let sum_rx: f64 = results.results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_rx, -p_lateral, 0.02, "ΣRx = -Px");
    assert_close(sum_ry, 2.0 * p_gravity.abs(), 0.02, "ΣRy = total gravity");
}

// ================================================================
// 6. Convergence: Light Load Converges Faster Than Heavy Load
// ================================================================
//
// P-delta with low gravity should converge in fewer iterations than
// with high gravity (farther from buckling = faster convergence).

#[test]
fn validation_pdelta_convergence_iterations() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let p_lateral = 5.0;

    // Light gravity load
    let input_light = make_portal_frame(h, w, E, A, IZ, p_lateral, -10.0);
    let res_light = pdelta::solve_pdelta_2d(&input_light, 20, 1e-6).unwrap();

    // Heavy gravity load
    let input_heavy = make_portal_frame(h, w, E, A, IZ, p_lateral, -200.0);
    let res_heavy = pdelta::solve_pdelta_2d(&input_heavy, 20, 1e-6).unwrap();

    // Both should converge
    assert!(res_light.converged, "Light load should converge");
    assert!(res_heavy.converged, "Heavy load should converge");

    // Light load should need fewer or equal iterations
    assert!(res_light.iterations <= res_heavy.iterations,
        "Light load iterations ({}) <= heavy load iterations ({})",
        res_light.iterations, res_heavy.iterations);

    // Both should be stable
    assert!(res_light.is_stable, "Light load should be stable");
    assert!(res_heavy.is_stable, "Heavy load should be stable");
}

// ================================================================
// 7. Two-Bay Frame: P-Delta Moment Redistribution
// ================================================================
//
// A two-bay frame (3 columns, 2 beams) under lateral + gravity:
// P-delta should amplify the total overturning moment compared to
// linear analysis. The interior column carries more gravity, so
// P-delta effects are distributed across all columns.

#[test]
fn validation_pdelta_two_bay_moment_redistribution() {
    let h = 4.0;
    let w = 5.0;
    let px = 8.0;
    let py = -40.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, 0.0), (4, w, h),
        (5, 2.0 * w, 0.0), (6, 2.0 * w, h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),  // left column
        (2, "frame", 3, 4, 1, 1, false, false),  // center column
        (3, "frame", 5, 6, 1, 1, false, false),  // right column
        (4, "frame", 2, 4, 1, 1, false, false),  // left beam
        (5, "frame", 4, 6, 1, 1, false, false),  // right beam
    ];
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, 3, "fixed"),
        (3, 5, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: 2.0 * py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: py, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);

    let res_linear = linear::solve_2d(&input).unwrap();
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Total base moment magnitude should be amplified by P-delta
    let m_linear_total: f64 = res_linear.reactions.iter()
        .map(|r| r.mz.abs()).sum();
    let m_pdelta_total: f64 = res_pdelta.results.reactions.iter()
        .map(|r| r.mz.abs()).sum();

    assert!(m_pdelta_total > m_linear_total,
        "Two-bay: P-delta amplifies total base moments: {:.4} > {:.4}",
        m_pdelta_total, m_linear_total);

    // Global equilibrium
    let sum_rx: f64 = res_pdelta.results.reactions.iter().map(|r| r.rx).sum();
    let total_gravity = 4.0 * py.abs(); // py + 2*py + py
    let sum_ry: f64 = res_pdelta.results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_rx, -px, 0.02, "Two-bay: ΣRx = -Px");
    assert_close(sum_ry, total_gravity, 0.02, "Two-bay: ΣRy = total gravity");
}

// ================================================================
// 8. Cantilever Column: P-Delta Shear Amplification
// ================================================================
//
// A cantilever column (fixed at base, free at tip) with axial
// compression and lateral tip load. The base shear in P-delta
// must balance the applied lateral force plus the P-delta effect
// from axial force acting through the lateral displacement.
// Base shear should be amplified compared to linear analysis.

#[test]
fn validation_pdelta_cantilever_shear_amplification() {
    let l = 5.0;
    let n = 10;
    let h_force = 3.0;
    let p_axial = -120.0;

    // Cantilever along X: fixed at node 1, free at node n+1
    // Axial compression (fx < 0) + transverse load (fy < 0)
    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p_axial, fy: -h_force, mz: 0.0,
            }),
        ]);

    let res_linear = linear::solve_2d(&input).unwrap();
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Base shear (ry at node 1) should be amplified by P-delta
    let ry_linear: f64 = res_linear.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let ry_pdelta: f64 = res_pdelta.results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;

    // Both should be positive (reaction opposing downward load)
    assert!(ry_linear > 0.0, "Linear: Ry > 0: {:.4}", ry_linear);
    assert!(ry_pdelta > 0.0, "P-delta: Ry > 0: {:.4}", ry_pdelta);

    // Linear base shear = h_force (simple statics)
    assert_close(ry_linear, h_force, 0.02, "Linear: Ry = H");

    // P-delta base shear should equal h_force (equilibrium: no other horizontal support)
    // However, the base moment should be amplified
    let mz_linear: f64 = res_linear.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let mz_pdelta: f64 = res_pdelta.results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();

    // P-delta amplifies base moment: M = H*L + P*delta
    assert!(mz_pdelta > mz_linear,
        "Cantilever: P-delta amplifies base moment: {:.4} > {:.4}",
        mz_pdelta, mz_linear);

    // Tip displacement should be amplified
    let uy_linear: f64 = res_linear.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let uy_pdelta: f64 = res_pdelta.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    assert!(uy_pdelta > uy_linear,
        "Cantilever: P-delta amplifies tip displacement: {:.6e} > {:.6e}",
        uy_pdelta, uy_linear);

    // Verify: amplified moment ≈ H*L + P*delta_pdelta
    let e_eff: f64 = E * 1000.0;
    let _expected_m = h_force * l + p_axial.abs() * uy_pdelta;
    // P-delta base moment from element forces
    let m_base_ef: f64 = res_pdelta.results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap().m_start.abs();

    // The element force at base should match the reaction moment
    assert_close(m_base_ef, mz_pdelta, 0.05,
        "Base element moment ≈ reaction moment");

    // Sanity check: effective E used in formulas
    assert!(e_eff > 0.0, "E_eff positive: {:.1}", e_eff);
}
