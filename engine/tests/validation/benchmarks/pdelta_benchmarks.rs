/// Validation: P-Delta Analysis Benchmarks
///
/// References:
///   - AISC 360-16, Appendix 8 (Approximate Second-Order Analysis)
///   - Wilson, "Static and Dynamic Analysis of Structures", Ch. 7
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2
///   - Chen & Lui, "Structural Stability", Ch. 3
///
/// Tests verify P-delta (geometric nonlinearity) effects:
///   1. Amplification of lateral drift: B2 factor
///   2. Cantilever column with axial + lateral: amplified moment
///   3. P-delta vs linear: stiffer structure shows less amplification
///   4. Leaning column effect
///   5. Gravity load increases lateral displacement
///   6. Below critical load: convergence
///   7. Portal frame P-delta: moment amplification
///   8. Two-story P-delta: inter-story drift amplification
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::pdelta;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.02;
const IZ: f64 = 2e-4;

// ================================================================
// 1. P-Delta Amplification: B2 Factor
// ================================================================
//
// AISC B2 amplification factor: B2 = 1/(1 - α × P_story / P_e)
// where P_e is the elastic critical load.
// Check that P-delta displacement > linear displacement.

#[test]
fn validation_pdelta_amplification() {
    let h = 4.0;
    let w = 6.0;
    let p_lateral = 5.0;
    let p_gravity = -50.0; // gravity at each top node

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p_lateral, fz: p_gravity, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: p_gravity, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);

    // Linear analysis
    let res_linear = linear::solve_2d(&input).unwrap();
    let d_linear = res_linear.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // P-delta analysis
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    let d_pdelta = res_pdelta.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // P-delta should amplify lateral displacement
    assert!(d_pdelta > d_linear,
        "P-delta amplifies drift: {:.6e} > {:.6e}", d_pdelta, d_linear);

    // Amplification should be modest (gravity load well below critical)
    let ratio = d_pdelta / d_linear;
    assert!(ratio > 1.0 && ratio < 2.0,
        "P-delta amplification ratio: {:.3}", ratio);
}

// ================================================================
// 2. Cantilever Column: Amplified Moment
// ================================================================
//
// Cantilever with axial P and lateral H at tip.
// Linear: M_base = H × L
// P-delta: M_base = H × L + P × δ (amplified)

#[test]
fn validation_pdelta_cantilever_moment() {
    let l = 5.0;
    let n = 8;
    let h_force = 2.0;
    let p_axial = -100.0; // compression (downward)

    // Horizontal beam: axial = X, transverse = Y
    // Axial compression (fx < 0) + lateral load (fy) triggers P-delta amplification
    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p_axial, fz: -h_force, my: 0.0,
            }),
        ]);

    let res_linear = linear::solve_2d(&input).unwrap();
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    let m_linear = res_linear.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let m_pdelta = res_pdelta.results.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();

    // P-delta moment should be larger
    assert!(m_pdelta > m_linear,
        "P-delta amplifies moment: {:.4} > {:.4}", m_pdelta, m_linear);

    // Linear moment = H × L = 2 × 5 = 10
    assert_close(m_linear, h_force * l, 0.02,
        "Linear: M_base = H × L");
}

// ================================================================
// 3. Stiffer Column: Less Amplification
// ================================================================
//
// With same loads, a stiffer column should show less P-delta effect.

#[test]
fn validation_pdelta_stiffness_effect() {
    let l = 5.0;
    let n = 8;
    let h_force = 2.0;
    let p_axial = -100.0;

    let get_amplification = |iz: f64| -> f64 {
        // Horizontal beam: axial compression (fx<0) + lateral load (fy)
        let input = make_beam(n, l, E, A, iz, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p_axial, fz: -h_force, my: 0.0,
            })]);

        let d_linear = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();
        let d_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap()
            .results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();
        d_pdelta / d_linear
    };

    let amp_flex = get_amplification(IZ);
    let amp_stiff = get_amplification(IZ * 4.0);

    // Stiffer column should have less amplification
    assert!(amp_stiff < amp_flex,
        "Stiffer = less P-delta: {:.3} < {:.3}", amp_stiff, amp_flex);
}

// ================================================================
// 4. No Gravity = No P-Delta Effect
// ================================================================
//
// Without axial load, P-delta should give same results as linear.

#[test]
fn validation_pdelta_no_gravity() {
    let l = 5.0;
    let n = 6;
    let h_force = 10.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: h_force, fz: 0.0, my: 0.0,
        })]);

    let res_linear = linear::solve_2d(&input).unwrap();
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    let d_linear = res_linear.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let d_pdelta = res_pdelta.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // Without axial load, P-delta = linear
    let err = (d_linear - d_pdelta).abs() / d_linear.abs().max(1e-10);
    assert!(err < 0.01,
        "No gravity: P-delta = linear: {:.6e} vs {:.6e}", d_pdelta, d_linear);
}

// ================================================================
// 5. Gravity Increases Lateral Displacement
// ================================================================
//
// More gravity → more P-delta effect → more lateral displacement.

#[test]
fn validation_pdelta_gravity_effect() {
    let h = 4.0;
    let w = 6.0;
    let p_lateral = 5.0;

    let get_drift = |gravity: f64| -> f64 {
        let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ];
        let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p_lateral, fz: gravity, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: gravity, my: 0.0 }),
        ];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
        pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap()
            .results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs()
    };

    let d_light = get_drift(-20.0);
    let d_heavy = get_drift(-100.0);

    assert!(d_heavy > d_light,
        "More gravity → more drift: {:.6e} > {:.6e}", d_heavy, d_light);
}

// ================================================================
// 6. P-Delta Equilibrium
// ================================================================
//
// Even with P-delta, global equilibrium must hold.

#[test]
fn validation_pdelta_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let px = 5.0;
    let py = -40.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: py, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // ΣRx = -Px
    let sum_rx: f64 = results.results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -px, 0.02, "P-delta: ΣRx = -Px");

    // ΣRy = -2Py
    let sum_ry: f64 = results.results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -2.0 * py, 0.02, "P-delta: ΣRy = total gravity");
}

// ================================================================
// 7. Portal Frame P-Delta: Column Moment Amplification
// ================================================================
//
// Portal frame under combined lateral + gravity.
// Column base moments should be amplified compared to linear.

#[test]
fn validation_pdelta_portal_moment_amplification() {
    let h = 4.0;
    let w = 6.0;
    let px = 5.0;
    let py = -80.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: py, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);

    let res_linear = linear::solve_2d(&input).unwrap();
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Sum of absolute column base moments should be amplified
    let m_linear: f64 = res_linear.reactions.iter().map(|r| r.my.abs()).sum();
    let m_pdelta: f64 = res_pdelta.results.reactions.iter().map(|r| r.my.abs()).sum();

    assert!(m_pdelta > m_linear,
        "P-delta amplifies column moments: {:.4} > {:.4}", m_pdelta, m_linear);
}

// ================================================================
// 8. Two-Story P-Delta: Drift Increases with Height
// ================================================================
//
// Two-story frame: P-delta drift should be larger at upper floor.

#[test]
fn validation_pdelta_two_story_drift() {
    let h = 3.5;
    let w = 6.0;
    let px = 3.0;
    let py = -30.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h),
        (4, w, 0.0), (5, w, h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: px, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: px, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: px, fz: py, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Upper floor should sway more than lower floor
    let d_floor1 = results.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_floor2 = results.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux.abs();

    assert!(d_floor2 > d_floor1,
        "P-delta: upper floor sways more: {:.6e} > {:.6e}", d_floor2, d_floor1);
}
