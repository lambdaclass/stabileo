/// Validation: Extended Effects of Structural Indeterminacy
///
/// Additional tests exploring how the degree of static indeterminacy
/// influences structural behavior: moment redistribution in continuous
/// beams, symmetry exploitation, thermal-analogy stiffness comparisons,
/// equilibrium partition in multi-span systems, and end-moment ratios.
///
/// References:
///   - Hibbeler, R.C., "Structural Analysis", 10th Ed., Ch. 10-11
///   - Kassimali, A., "Structural Analysis", 6th Ed., Ch. 12-13
///   - Ghali, A., Neville, A.M., "Structural Analysis: A Unified Classical and Matrix Approach"
///   - Roark's Formulas for Stress and Strain, 8th Ed., Table 8.1
///   - AISC Steel Construction Manual, Table 3-23
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Span Continuous Beam: Interior Support Reaction under UDL
// ================================================================
//
// A two-span continuous beam (equal spans L) under UDL q has interior
// support reaction R_B = 10qL/8 = 1.25qL (by three-moment equation).
// The end reactions are R_A = R_C = 3qL/8 each.
// Total: 3qL/8 + 10qL/8 + 3qL/8 = 16qL/8 = 2qL (correct for two spans).
//
// Reference: Kassimali, "Structural Analysis", Table 13.1

#[test]
fn validation_indet_ext_two_span_interior_reaction() {
    let span: f64 = 6.0;
    let q = -5.0;
    let n_per_span = 8;
    let n_total = 2 * n_per_span;

    let mut loads = Vec::new();
    for i in 1..=n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support node
    let mid_node = 1 + n_per_span;
    let r_int = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();

    // R_B = 10qL/8 = 1.25 * q.abs() * span
    let r_b_exact = 10.0 * q.abs() * span / 8.0;
    assert_close(r_int.ry, r_b_exact, 0.02,
        "Two-span continuous: R_interior = 10qL/8");

    // End reactions: R_A = R_C = 3qL/8
    let r_end_exact = 3.0 * q.abs() * span / 8.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == n_total + 1).unwrap();
    assert_close(r_a.ry, r_end_exact, 0.02, "Two-span continuous: R_A = 3qL/8");
    assert_close(r_c.ry, r_end_exact, 0.02, "Two-span continuous: R_C = 3qL/8");

    // Total equilibrium: sum = 2qL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q.abs() * 2.0 * span, 0.01,
        "Two-span continuous: SumRy = 2qL");
}

// ================================================================
// 2. Fixed-Fixed Beam: End Moment = qL^2/12 under UDL
// ================================================================
//
// The fixed-fixed beam under UDL has fixed-end moments M = qL^2/12
// at each support and a midspan moment M_mid = qL^2/24.
// This differs from SS beam where M_mid = qL^2/8 (no end restraint).
// The ratio of FF midspan to SS midspan moment is (qL^2/24)/(qL^2/8) = 1/3.
//
// Reference: AISC Manual, Table 3-23; Hibbeler, Table 12-1

#[test]
fn validation_indet_ext_ff_end_moment_and_midspan() {
    let l: f64 = 8.0;
    let q = -6.0;
    let n = 8;

    let loads_ff: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    // End moment: M = qL^2/12
    let m_end_exact = q.abs() * l * l / 12.0;
    let r1 = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rn = res_ff.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.mz.abs(), m_end_exact, 0.02,
        "FF UDL: M_end_left = qL^2/12");
    assert_close(rn.mz.abs(), m_end_exact, 0.02,
        "FF UDL: M_end_right = qL^2/12");

    // Now build the SS beam for midspan moment comparison
    let input_ss = make_ss_beam_udl(n, l, E, A, IZ, q);
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // SS midspan deflection > FF midspan deflection (ratio = 5)
    let mid = n / 2 + 1;
    let d_ss = res_ss.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_ff = res_ff.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let ratio = d_ss / d_ff;
    assert_close(ratio, 5.0, 0.02,
        "FF vs SS deflection ratio = 5 under UDL");
}

// ================================================================
// 3. Propped Cantilever: Prop Reaction = 3qL/8
// ================================================================
//
// A propped cantilever (fixed at A, roller at B) under UDL has:
//   R_B = 3qL/8 (at roller end)
//   R_A = 5qL/8 (at fixed end)
//   M_A = qL^2/8 (fixed-end moment)
//
// Reference: Roark's Formulas, Table 8.1; Kassimali, Table 10.1

#[test]
fn validation_indet_ext_propped_cantilever_reactions() {
    let l: f64 = 10.0;
    let q = -4.0;
    let n = 10;

    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B (roller) = 3qL/8
    let r_b_exact = 3.0 * q.abs() * l / 8.0;
    assert_close(r_b.ry, r_b_exact, 0.02,
        "Propped cantilever: R_B = 3qL/8");

    // R_A (fixed) = 5qL/8
    let r_a_exact = 5.0 * q.abs() * l / 8.0;
    assert_close(r_a.ry, r_a_exact, 0.02,
        "Propped cantilever: R_A = 5qL/8");

    // M_A = qL^2/8
    let m_a_exact = q.abs() * l * l / 8.0;
    assert_close(r_a.mz.abs(), m_a_exact, 0.02,
        "Propped cantilever: M_A = qL^2/8");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q.abs() * l, 0.01,
        "Propped cantilever: SumRy = qL");
}

// ================================================================
// 4. Symmetry of Fixed-Fixed Beam under Symmetric Point Load
// ================================================================
//
// A fixed-fixed beam with a midspan point load P has symmetric
// reactions and end moments:
//   R_A = R_B = P/2
//   M_A = M_B = PL/8
//   M_mid = PL/8 (sagging)
//   delta_mid = PL^3/(192EI)
//
// Reference: Hibbeler, Table 12-1

#[test]
fn validation_indet_ext_ff_symmetric_point_load() {
    let l: f64 = 6.0;
    let p = 120.0;
    let n = 8;
    let mid = n / 2 + 1;
    let e_eff: f64 = E * 1000.0;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Symmetric reactions: R_A = R_B = P/2
    assert_close(r1.ry, p / 2.0, 0.02, "FF point load: R_A = P/2");
    assert_close(rn.ry, p / 2.0, 0.02, "FF point load: R_B = P/2");

    // Symmetric end moments: |M_A| = |M_B| = PL/8
    let m_end_exact = p * l / 8.0;
    assert_close(r1.mz.abs(), m_end_exact, 0.02,
        "FF point load: M_A = PL/8");
    assert_close(rn.mz.abs(), m_end_exact, 0.02,
        "FF point load: M_B = PL/8");

    // End moments should be equal due to symmetry
    let moment_diff = (r1.mz.abs() - rn.mz.abs()).abs();
    assert!(moment_diff < 0.01 * m_end_exact,
        "FF point load: M_A and M_B symmetric, diff={:.6}", moment_diff);

    // Midspan deflection: delta = PL^3/(192EI)
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.02,
        "FF point load: delta_mid = PL^3/(192EI)");
}

// ================================================================
// 5. Three-Span Equal Continuous Beam: Interior Reactions under UDL
// ================================================================
//
// A three-span continuous beam (equal spans L) under UDL q has:
//   R_A = R_D = 0.4qL (end reactions)
//   R_B = R_C = 1.1qL (interior reactions)
//   Total = 2*(0.4qL) + 2*(1.1qL) = 3qL (correct)
//
// Reference: Ghali & Neville, Table 13.2

#[test]
fn validation_indet_ext_three_span_reactions() {
    let span: f64 = 5.0;
    let q = -8.0;
    let n_per_span = 8;
    let n_total = 3 * n_per_span;

    let mut loads = Vec::new();
    for i in 1..=n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Support nodes
    let node_a = 1;
    let node_b = 1 + n_per_span;
    let node_c = 1 + 2 * n_per_span;
    let node_d = n_total + 1;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == node_d).unwrap();

    // End reactions: R_A = R_D = 0.4qL
    let r_end_exact = 0.4 * q.abs() * span;
    assert_close(r_a.ry, r_end_exact, 0.02,
        "Three-span: R_A = 0.4qL");
    assert_close(r_d.ry, r_end_exact, 0.02,
        "Three-span: R_D = 0.4qL");

    // Interior reactions: R_B = R_C = 1.1qL
    let r_int_exact = 1.1 * q.abs() * span;
    assert_close(r_b.ry, r_int_exact, 0.02,
        "Three-span: R_B = 1.1qL");
    assert_close(r_c.ry, r_int_exact, 0.02,
        "Three-span: R_C = 1.1qL");

    // Total equilibrium: sum = 3qL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q.abs() * 3.0 * span, 0.01,
        "Three-span: SumRy = 3qL");
}

// ================================================================
// 6. Portal Frame Sway: Antisymmetric Loading and Moment Distribution
// ================================================================
//
// A symmetric portal frame (fixed bases) under lateral load H at
// the beam level has antisymmetric sway. By portal method:
//   Base shear per column = H/2
//   Base moment per column = H*h/4 (for two fixed-base columns)
//   Top nodes sway equally (beam axially stiff).
//
// Reference: Hibbeler, Ch. 7 (Approximate Methods)

#[test]
fn validation_indet_ext_portal_frame_lateral_load() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let f_lateral = 40.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum of horizontal reactions = applied lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_lateral, 0.02,
        "Portal: SumRx = -H (equilibrium)");

    // Each base: shear ~ H/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rx.abs() + r4.rx.abs(), f_lateral, 0.02,
        "Portal: |Rx1| + |Rx4| = H");

    // Both columns carry horizontal reaction (indeterminacy distributes load)
    assert!(r1.rx.abs() > 0.1, "Portal: left column carries shear");
    assert!(r4.rx.abs() > 0.1, "Portal: right column carries shear");

    // Top nodes sway equally (beam connects them rigidly, axially stiff)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let rel_diff = (d2.ux - d3.ux).abs() / d2.ux.abs().max(1e-10);
    assert!(rel_diff < 0.05,
        "Portal: ux_2={:.6}, ux_3={:.6} should be nearly equal", d2.ux, d3.ux);

    // Both bases have non-zero moment (fixed base indeterminacy)
    assert!(r1.mz.abs() > 1.0, "Portal: left base moment non-zero");
    assert!(r4.mz.abs() > 1.0, "Portal: right base moment non-zero");
}

// ================================================================
// 7. Fixed-Fixed vs SS: End Rotation Comparison
// ================================================================
//
// Under UDL:
//   SS beam end rotation: theta = qL^3/(24EI)
//   FF beam end rotation: theta = 0 (fixed boundary condition)
//
// The SS beam has non-zero end rotations while FF beam has zero.
// Also verify analytical end rotation for the SS case.
//
// Reference: Roark's, Table 8.1; Timoshenko & Gere, Ch. 7

#[test]
fn validation_indet_ext_end_rotation_ss_vs_ff() {
    let l: f64 = 6.0;
    let q = -5.0;
    let n = 8;
    let e_eff: f64 = E * 1000.0;

    // Simply-supported
    let input_ss = make_ss_beam_udl(n, l, E, A, IZ, q);
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // Fixed-fixed
    let loads_ff: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    // FF: end rotations must be zero (fixed support constraint)
    let d_ff_start = res_ff.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_ff_end = res_ff.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_ff_start.rz.abs() < 1e-10,
        "FF end rotation at start = {:.6e}, must be 0", d_ff_start.rz);
    assert!(d_ff_end.rz.abs() < 1e-10,
        "FF end rotation at end = {:.6e}, must be 0", d_ff_end.rz);

    // SS: end rotations must be non-zero
    let d_ss_start = res_ss.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_ss_end = res_ss.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_ss_start.rz.abs() > 1e-8,
        "SS end rotation at start must be non-zero");
    assert!(d_ss_end.rz.abs() > 1e-8,
        "SS end rotation at end must be non-zero");

    // SS analytical end rotation: theta = qL^3/(24EI)
    let theta_exact = q.abs() * l.powi(3) / (24.0 * e_eff * IZ);
    assert_close(d_ss_start.rz.abs(), theta_exact, 0.02,
        "SS UDL: end rotation = qL^3/(24EI)");

    // By symmetry, both end rotations have equal magnitude
    let rot_diff = (d_ss_start.rz.abs() - d_ss_end.rz.abs()).abs();
    assert!(rot_diff < 0.01 * theta_exact,
        "SS UDL: end rotations symmetric, diff={:.6e}", rot_diff);
}

// ================================================================
// 8. Cantilever Tip Deflection: Analytical Verification (Point + UDL)
// ================================================================
//
// Combined loading on cantilever (determinate, 0 redundants):
//   Tip point load P:  delta_P = PL^3/(3EI)
//   UDL q:             delta_q = qL^4/(8EI)
//   Total:             delta   = PL^3/(3EI) + qL^4/(8EI) (superposition)
//
// Compare with propped cantilever (1 redundant) under same loads,
// which must deflect less due to the additional roller support.
//
// Reference: Gere & Goodno, Table of Beam Deflections

#[test]
fn validation_indet_ext_cantilever_superposition_vs_propped() {
    let l: f64 = 5.0;
    let p = 20.0;
    let q = -3.0;
    let n = 10;
    let e_eff: f64 = E * 1000.0;

    // Pure cantilever: fixed at start, free at end
    let mut loads_cant = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    for i in 1..=n {
        loads_cant.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_cant = make_beam(n, l, E, A, IZ, "fixed", None, loads_cant);
    let res_cant = linear::solve_2d(&input_cant).unwrap();

    // Propped cantilever: fixed at start, roller at end
    let mut loads_prop = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    for i in 1..=n {
        loads_prop.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_prop = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_prop);
    let res_prop = linear::solve_2d(&input_prop).unwrap();

    // Cantilever tip deflection by superposition
    let delta_p = p * l.powi(3) / (3.0 * e_eff * IZ);
    let delta_q = q.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    let delta_total = delta_p + delta_q;

    let tip_cant = res_cant.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip_cant.uy.abs(), delta_total, 0.02,
        "Cantilever tip: delta = PL^3/(3EI) + qL^4/(8EI)");

    // Propped cantilever: tip (roller) has uy = 0 (constrained)
    let tip_prop = res_prop.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(tip_prop.uy.abs() < 1e-8,
        "Propped cantilever: tip uy = {:.6e}, must be ~0 (roller)", tip_prop.uy);

    // Max deflection of propped cantilever (somewhere interior) must be
    // much less than cantilever tip deflection
    let max_prop_defl = res_prop.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    assert!(max_prop_defl < tip_cant.uy.abs(),
        "Propped max deflection ({:.6e}) < cantilever tip ({:.6e})",
        max_prop_defl, tip_cant.uy.abs());

    // Equilibrium for cantilever: R_A = P + qL (single support)
    let r_cant = res_cant.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_cant.ry, p + q.abs() * l, 0.02,
        "Cantilever: R_A = P + qL");
}
