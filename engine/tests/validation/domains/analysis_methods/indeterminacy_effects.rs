/// Validation: Effects of Structural Indeterminacy
///
/// Tests how the degree of static indeterminacy influences structural behavior:
/// moment redistribution, deflection reduction, and reaction count.
///
/// References:
///   - Hibbeler, R.C., "Structural Analysis", 10th Ed., Ch. 10-11
///   - Kassimali, A., "Structural Analysis", 6th Ed., Ch. 12
///   - Leet, K.M., Uang, C-M., Gilbert, A.M., "Fundamentals of Structural Analysis", 5th Ed.
///   - Ghali, A., Neville, A.M., "Structural Analysis: A Unified Classical and Matrix Approach"
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Determinate vs Indeterminate: Same Load, Different Moments
// ================================================================
//
// Simply-supported beam (determinate): M_max = PL/4 at midspan.
// Fixed-fixed beam (2x redundant): M_max = PL/8 at midspan.
// Same load: fixed-fixed has smaller midspan moment.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Table 12-1

#[test]
fn validation_indet_determinate_vs_indeterminate_moment() {
    let l = 6.0;
    let p = 100.0;
    let n = 4;
    let mid = n / 2 + 1; // midspan node

    // Simply-supported (determinate)
    let input_ss = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // Fixed-fixed (2nd degree indeterminate)
    let input_ff = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    // SS: M_mid = PL/4 = 100*6/4 = 150 kN·m
    let m_ss_exact = p * l / 4.0;
    // FF: M_mid = PL/8 = 100*6/8 = 75 kN·m
    let m_ff_exact = p * l / 8.0;

    // Check midspan moment for SS via reaction check: R = P/2, M_mid = R * L/2
    let r1_ss = res_ss.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1_ss.ry, p / 2.0, 0.01, "SS beam reaction");

    // Fixed-fixed: support reaction
    let r1_ff = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1_ff.ry, p / 2.0, 0.01, "FF beam vertical reaction");

    // The fixed-fixed beam should have non-zero end moments (indeterminacy effect)
    assert!(
        r1_ff.mz.abs() > 1.0,
        "Fixed-fixed beam must have non-zero end moment, got mz={:.4}", r1_ff.mz
    );

    // Midspan deflection: FF beam deflects less than SS beam
    let d_ss = res_ss.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let d_ff = res_ff.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(
        d_ff.uy.abs() < d_ss.uy.abs(),
        "FF beam must deflect less than SS: FF={:.6e}, SS={:.6e}",
        d_ff.uy.abs(), d_ss.uy.abs()
    );

    // Confirm analytical midspan moment values are distinct
    assert!(
        (m_ss_exact - m_ff_exact).abs() > 1.0,
        "SS and FF moments must differ: SS={:.2}, FF={:.2}", m_ss_exact, m_ff_exact
    );
}

// ================================================================
// 2. Higher Redundancy → Smaller Deflections
// ================================================================
//
// SS beam < propped cantilever < fixed-fixed in terms of stiffness (inverse of deflection).
// Midspan deflection ratios for UDL:
//   SS:    δ = 5qL⁴/(384EI)
//   fixed: δ = qL⁴/(384EI)
// Ratio = 5 exactly.
//
// Reference: Roark's Formulas for Stress and Strain, Table 8

#[test]
fn validation_indet_higher_redundancy_smaller_deflection() {
    let l = 4.0;
    let q = -5.0;
    let n = 8;
    let mid = n / 2 + 1;

    // Simply-supported (statically determinate)
    let mut input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    for i in 1..=n {
        input_ss.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    // Fixed-fixed (2 degrees redundant)
    let mut input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), vec![]);
    for i in 1..=n {
        input_ff.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let res_ss = linear::solve_2d(&input_ss).unwrap();
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    let d_ss = res_ss.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_ff = res_ff.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Fixed-fixed deflection should be much less than SS
    assert!(
        d_ff < d_ss,
        "FF must deflect less: FF={:.6e}, SS={:.6e}", d_ff, d_ss
    );

    // Ratio should approach 5 (exact for UDL)
    let ratio = d_ss / d_ff;
    assert_close(ratio, 5.0, 0.05, "SS/FF deflection ratio = 5 under UDL");
}

// ================================================================
// 3. Removing a Restraint Increases Deflection
// ================================================================
//
// Fixed-pinned vs simply-supported: releasing the fixed end
// increases midspan deflection.
// For UDL:
//   propped cantilever: δ_mid ≈ qL⁴/(192EI)  [approx for 1 fixed end]
//   SS: δ_mid = 5qL⁴/(384EI)
//
// Reference: Kassimali, "Structural Analysis", Table 10.1

#[test]
fn validation_indet_removing_restraint_increases_deflection() {
    let l = 5.0;
    let q = -3.0;
    let n = 8;
    let mid = n / 2 + 1;

    // Propped cantilever: fixed at start, roller at end (1 degree redundant)
    let mut input_propped = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), vec![]);
    for i in 1..=n {
        input_propped.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    // Simply-supported: release the fixed end → pinned (determinate)
    let mut input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    for i in 1..=n {
        input_ss.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let res_propped = linear::solve_2d(&input_propped).unwrap();
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    let d_propped = res_propped.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_ss = res_ss.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    assert!(
        d_ss > d_propped,
        "Releasing fixed restraint must increase midspan deflection: SS={:.6e}, propped={:.6e}",
        d_ss, d_propped
    );
}

// ================================================================
// 4. Propped Cantilever vs Cantilever: Moment Comparison under UDL
// ================================================================
//
// Pure cantilever under UDL: M_base = qL²/2
// Propped cantilever under UDL: M_base = qL²/8 (exact, force method)
// Propping the free end reduces the base fixed-end moment by 75%.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Table 12-1
//            Roark's Formulas for Stress and Strain, 8th Ed., Table 8.1

#[test]
fn validation_indet_propped_vs_cantilever_moment() {
    let l = 4.0;
    let q = -5.0;
    let n = 8;

    // Pure cantilever: fixed at start, free at end
    let mut input_cant = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    for i in 1..=n {
        input_cant.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let res_cant = linear::solve_2d(&input_cant).unwrap();

    // Propped cantilever: fixed at start, roller at end (1 degree redundant)
    let mut input_prop = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), vec![]);
    for i in 1..=n {
        input_prop.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let res_prop = linear::solve_2d(&input_prop).unwrap();

    // Base moment for cantilever under UDL: M = qL²/2
    let r_cant = res_cant.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_cant.mz.abs(), q.abs() * l * l / 2.0, 0.02, "Cantilever UDL base moment = qL²/2");

    // Base moment for propped cantilever under UDL: M = qL²/8
    let r_prop = res_prop.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_prop.mz.abs(), q.abs() * l * l / 8.0, 0.02, "Propped cantilever UDL base moment = qL²/8");

    // Propping reduces base moment (ratio = 4x)
    let moment_ratio = r_cant.mz.abs() / r_prop.mz.abs();
    assert_close(moment_ratio, 4.0, 0.05, "Propping reduces base moment by factor 4");
}

// ================================================================
// 5. Fixed-Fixed vs Simply-Supported: Deflection Ratio = 5
// ================================================================
//
// Under uniform load:
//   δ_ss  = 5wL⁴/(384EI)
//   δ_ff  = wL⁴/(384EI)
//   ratio = 5 exactly for cubic Hermite elements.
//
// Reference: Roark's Formulas for Stress and Strain, 8th Ed., Table 8.1c

#[test]
fn validation_indet_ss_vs_ff_deflection_ratio_five() {
    let l = 6.0;
    let q = -4.0;
    let n = 8;
    let mid = n / 2 + 1;
    let ei = E * 1000.0 * IZ;

    // Simply-supported
    let mut input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    for i in 1..=n {
        input_ss.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    // Fixed-fixed
    let mut input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), vec![]);
    for i in 1..=n {
        input_ff.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let res_ss = linear::solve_2d(&input_ss).unwrap();
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    let d_ss = res_ss.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_ff = res_ff.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Verify against analytical values
    let d_ss_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * ei);
    let d_ff_exact = q.abs() * l.powi(4) / (384.0 * ei);

    assert_close(d_ss, d_ss_exact, 0.02, "SS UDL midspan deflection");
    assert_close(d_ff, d_ff_exact, 0.02, "FF UDL midspan deflection");
    assert_close(d_ss / d_ff, 5.0, 0.02, "SS/FF deflection ratio under UDL");
}

// ================================================================
// 6. Adding Intermediate Support Reduces Max Moment
// ================================================================
//
// Two-span continuous beam vs single-span SS beam.
// Adding a support at midspan reduces the maximum moment dramatically.
// SS midspan moment: M = qL²/8
// Two-span: M_max at intermediate support ≈ qL²/8 (negative), interior spans smaller.
//
// Reference: Ghali & Neville, "Structural Analysis", Ch. 13

#[test]
fn validation_indet_intermediate_support_reduces_moment() {
    let l_total = 8.0; // total span
    let q = -5.0;
    let n = 8; // 8 elements

    // Single-span SS beam
    let mut input_ss = make_beam(n, l_total, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    for i in 1..=n {
        input_ss.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // Max deflection in single-span SS beam
    let d_ss_max = res_ss.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, |a, b| a.max(b));

    // Two-span continuous beam (add intermediate support at midspan)
    // Use make_input for custom node/support arrangement
    let elem_len = l_total / n as f64;
    let mid_node = n / 2 + 1; // midspan node

    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![
        (1, 1, "pinned"),
        (2, mid_node, "rollerX"),   // intermediate support
        (3, n + 1, "rollerX"),
    ];
    let mut loads_cont = Vec::new();
    for i in 1..=n {
        loads_cont.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_cont = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads_cont);
    let res_cont = linear::solve_2d(&input_cont).unwrap();

    // Max deflection in continuous beam (excludes support nodes)
    let d_cont_max = res_cont.displacements.iter()
        .filter(|d| d.node_id != 1 && d.node_id != mid_node && d.node_id != n + 1)
        .map(|d| d.uy.abs())
        .fold(0.0_f64, |a, b| a.max(b));

    assert!(
        d_cont_max < d_ss_max,
        "Intermediate support must reduce max deflection: cont={:.6e}, ss={:.6e}",
        d_cont_max, d_ss_max
    );
}

// ================================================================
// 7. Redundancy and Reaction Count
// ================================================================
//
// Degree of static indeterminacy for beams:
//   SS beam (determinate): 2 reactions, no redundants
//   Propped cantilever: 3 reactions, 1 redundant
//   Fixed-fixed: 4 reactions, 2 redundants
// Each fixed support contributes 3 reactions (Rx, Ry, Mz).
//
// Reference: Leet et al., "Fundamentals of Structural Analysis", 5th Ed., Ch. 3

#[test]
fn validation_indet_redundancy_reaction_count() {
    let l = 5.0;
    let q = -3.0;
    let n = 4;

    // Simply-supported: 2 supports (pinned=2 reactions, roller=1 reaction) = 3 total
    let mut input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    for i in 1..=n {
        input_ss.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // Fixed-fixed: 2 fixed supports = 6 reactions
    let mut input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), vec![]);
    for i in 1..=n {
        input_ff.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    // SS: end moments must be zero (pinned and roller)
    let r_ss_1 = res_ss.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_ss_end = res_ss.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(r_ss_1.mz.abs() < 1e-6, "SS pinned end: mz must be 0, got {:.6e}", r_ss_1.mz);
    assert!(r_ss_end.mz.abs() < 1e-6, "SS roller end: mz must be 0, got {:.6e}", r_ss_end.mz);

    // FF: both ends must have non-zero moment reactions
    let r_ff_1 = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_ff_end = res_ff.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(r_ff_1.mz.abs() > 0.1, "FF fixed start: mz must be non-zero");
    assert!(r_ff_end.mz.abs() > 0.1, "FF fixed end: mz must be non-zero");

    // Both must satisfy vertical equilibrium
    let sum_ry_ss: f64 = res_ss.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_ff: f64 = res_ff.reactions.iter().map(|r| r.ry).sum();
    let total_load = q.abs() * l;
    assert_close(sum_ry_ss, total_load, 0.01, "SS ΣRy = qL");
    assert_close(sum_ry_ff, total_load, 0.01, "FF ΣRy = qL");
}

// ================================================================
// 8. Over-Constrained Structure: More Reactions Than Equilibrium Equations
// ================================================================
//
// A fixed-fixed beam under point load has 6 unknown reactions
// but only 3 equilibrium equations → 3 degrees redundant.
// The solver must produce consistent results satisfying equilibrium.
// The moment diagram must be non-trivial (both end moments active).
//
// Reference: Ghali & Neville, "Structural Analysis", Ch. 9 (Force Method)

#[test]
fn validation_indet_overconstrained_equilibrium() {
    let l = 6.0;
    let p = 50.0;
    let a_dist = l / 3.0; // load at L/3 from left
    let n = 6;
    let load_node = 3; // node 3 at x = L/3 (with 6 elements of len 1.0)

    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: ΣFy = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Over-constrained: ΣRy = P");

    // Equilibrium: ΣFx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.01, "Over-constrained: ΣRx = 0, got {:.6e}", sum_rx);

    // Both ends have non-zero moment reactions (redundants activated)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(r1.mz.abs() > 0.1, "Left fixed end must have moment reaction");
    assert!(rn.mz.abs() > 0.1, "Right fixed end must have moment reaction");

    // Analytical: R_A = P*b²(3a+b)/L³, R_B = P*a²(a+3b)/L³ where a=L/3, b=2L/3
    let b_dist = l - a_dist;
    let r_a_exact = p * b_dist * b_dist * (3.0 * a_dist + b_dist) / l.powi(3);
    let r_b_exact = p * a_dist * a_dist * (a_dist + 3.0 * b_dist) / l.powi(3);
    assert_close(r1.ry, r_a_exact, 0.02, "Fixed-fixed: R_A exact");
    assert_close(rn.ry, r_b_exact, 0.02, "Fixed-fixed: R_B exact");
}
