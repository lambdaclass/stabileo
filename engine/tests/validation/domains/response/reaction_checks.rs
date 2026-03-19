/// Validation: Reaction Force Benchmarks
///
/// References:
///   - Timoshenko & Young, "Engineering Mechanics: Statics"
///   - Hibbeler, "Structural Analysis", 10th Ed.
///   - Beer & Johnston, "Mechanics of Materials", 8th Ed.
///
/// Tests verify equilibrium and exact reaction formulas for:
///   1. SS beam UDL: R = qL/2
///   2. Cantilever point: R = P, M = PL
///   3. Propped cantilever: R_roller = 5qL/8
///   4. Continuous beam: support reactions from three-moment equation
///   5. Frame with lateral load: base shear
///   6. Inclined load: reaction components
///   7. Multiple loads: superposition of reactions
///   8. Overhanging beam: negative and positive reactions
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: R_A = R_B = qL/2
// ================================================================

#[test]
fn validation_reaction_ss_udl() {
    let l = 8.0;
    let n = 8;
    let q = -10.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let r_exact = q.abs() * l / 2.0; // 40 kN each

    for r in &results.reactions {
        let ry = r.rz;
        let error = (ry - r_exact).abs() / r_exact;
        assert!(error < 0.01,
            "SS UDL reaction: node {} Ry={:.4}, exact={:.4}, err={:.2}%",
            r.node_id, ry, r_exact, error * 100.0);
    }
}

// ================================================================
// 2. Cantilever Point Load: R = P, M = PL
// ================================================================

#[test]
fn validation_reaction_cantilever_point() {
    let l = 5.0;
    let n = 4;
    let p = 20.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let r = &results.reactions[0]; // fixed support

    // Vertical reaction = P
    let err_ry = (r.rz - p).abs() / p;
    assert!(err_ry < 0.01,
        "Cantilever Ry={:.4}, expected P={:.1}", r.rz, p);

    // Moment reaction = P × L (counterclockwise to resist clockwise moment)
    let m_exact = p * l;
    let err_m = (r.my.abs() - m_exact).abs() / m_exact;
    assert!(err_m < 0.01,
        "Cantilever Mz={:.4}, expected PL={:.1}", r.my.abs(), m_exact);
}

// ================================================================
// 3. Propped Cantilever UDL: R_roller = 3qL/8
// ================================================================
//
// Fixed at A, roller at B, UDL q.
// R_B = 3qL/8, R_A = 5qL/8

#[test]
fn validation_reaction_propped_cantilever_udl() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // R_B (roller) = 3qL/8
    let r_roller = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap();
    let rb_exact = 3.0 * q.abs() * l / 8.0;
    let err_rb = (r_roller.rz - rb_exact).abs() / rb_exact;
    assert!(err_rb < 0.02,
        "Propped cantilever R_B={:.4}, exact 3qL/8={:.4}, err={:.1}%",
        r_roller.rz, rb_exact, err_rb * 100.0);

    // R_A (fixed) = 5qL/8
    let r_fixed = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let ra_exact = 5.0 * q.abs() * l / 8.0;
    let err_ra = (r_fixed.rz - ra_exact).abs() / ra_exact;
    assert!(err_ra < 0.02,
        "Propped cantilever R_A={:.4}, exact 5qL/8={:.4}, err={:.1}%",
        r_fixed.rz, ra_exact, err_ra * 100.0);
}

// ================================================================
// 4. Continuous Beam: Two Equal Spans UDL
// ================================================================
//
// Pin - roller - roller, two equal spans L, UDL q.
// R_A = R_C = 3qL/8, R_B = 10qL/8 = 5qL/4

#[test]
fn validation_reaction_continuous_beam_udl() {
    let l = 5.0;
    let n_per = 4;
    let n_total = 2 * n_per;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // End reactions: R_A = R_C = 3qL/8
    let r_end = 3.0 * q.abs() * l / 8.0;
    // Middle reaction: R_B = 10qL/8
    let r_mid = 10.0 * q.abs() * l / 8.0;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb = results.reactions.iter().find(|r| r.node_id == n_per + 1).unwrap().rz;
    let rc = results.reactions.iter().find(|r| r.node_id == n_total + 1).unwrap().rz;

    let err_ra = (ra - r_end).abs() / r_end;
    let err_rb = (rb - r_mid).abs() / r_mid;
    let err_rc = (rc - r_end).abs() / r_end;

    assert!(err_ra < 0.02, "R_A={:.4}, exact 3qL/8={:.4}", ra, r_end);
    assert!(err_rb < 0.02, "R_B={:.4}, exact 10qL/8={:.4}", rb, r_mid);
    assert!(err_rc < 0.02, "R_C={:.4}, exact 3qL/8={:.4}", rc, r_end);
}

// ================================================================
// 5. Portal Frame: Base Shear = Applied Lateral Load
// ================================================================

#[test]
fn validation_reaction_portal_base_shear() {
    let h = 4.0;
    let w = 6.0;
    let h_load = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Sum of horizontal reactions = applied lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let err = (sum_rx + h_load).abs() / h_load;
    assert!(err < 0.01,
        "Base shear: ΣRx={:.4}, applied H={:.1}", sum_rx, h_load);

    // Sum of vertical reactions = 0 (no gravity load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.01,
        "No gravity: ΣRy={:.6} should be ≈ 0", sum_ry);
}

// ================================================================
// 6. Inclined Load: Reaction Components
// ================================================================
//
// 45° load at cantilever tip. Both horizontal and vertical reactions.

#[test]
fn validation_reaction_inclined_load() {
    let l = 4.0;
    let n = 4;
    let p = 10.0;
    let angle = std::f64::consts::PI / 4.0; // 45°

    let fx = p * angle.cos();
    let fy = -p * angle.sin();

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx, fz: fy, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let r = &results.reactions[0];

    // Rx = -Fx (equilibrium)
    let err_rx = (r.rx + fx).abs() / fx.abs();
    assert!(err_rx < 0.01,
        "Inclined Rx={:.4}, expected -Fx={:.4}", r.rx, -fx);

    // Ry = -Fy = P·sin(45°)
    let err_ry = (r.rz + fy).abs() / fy.abs();
    assert!(err_ry < 0.01,
        "Inclined Ry={:.4}, expected -Fy={:.4}", r.rz, -fy);
}

// ================================================================
// 7. Multiple Loads: Superposition of Reactions
// ================================================================

#[test]
fn validation_reaction_superposition() {
    let l = 6.0;
    let n = 4;
    let p1 = -10.0;
    let p2 = -5.0;

    // Load at node 2 only
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: p1, my: 0.0,
        })]);

    // Load at node 4 only
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: p2, my: 0.0,
        })]);

    // Combined
    let input_both = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: p1, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: p2, my: 0.0 }),
        ]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();
    let res_both = linear::solve_2d(&input_both).unwrap();

    // R1_A + R2_A ≈ R_combined_A
    let ra1 = res1.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ra2 = res2.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ra_both = res_both.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;

    let err = (ra_both - (ra1 + ra2)).abs() / ra_both.abs().max(1e-12);
    assert!(err < 0.01,
        "Superposition R_A: combined={:.4}, sum={:.4}",
        ra_both, ra1 + ra2);
}

// ================================================================
// 8. Overhanging Beam: Uplift Reaction
// ================================================================
//
// SS beam with overhang. Load on overhang produces negative (downward)
// reaction at the far support — uplift check.

#[test]
fn validation_reaction_overhanging_beam() {
    let span = 6.0;
    let overhang = 3.0;
    let l_total = span + overhang;
    let n = 6;
    let elem_len = l_total / n as f64;
    let p = 20.0;

    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    // Supports at node 1 (x=0) and node at x=span
    // Node at x=6: 6/1.5 = 4, so node 5 is at x=6
    let support_node = (span / elem_len) as usize + 1;
    let sups = vec![
        (1, 1, "pinned"),
        (2, support_node, "rollerX"),
    ];

    // Load at tip of overhang
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);

    let results = linear::solve_2d(&input).unwrap();

    // The left support should have negative (downward) reaction = uplift
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_left.rz < 0.0,
        "Overhanging beam: left support should have uplift, Ry={:.4}", r_left.rz);

    // The right support (at span end) should carry more than P
    let r_right = results.reactions.iter().find(|r| r.node_id == support_node).unwrap();
    assert!(r_right.rz > p,
        "Right support Ry={:.4} should exceed P={:.1}", r_right.rz, p);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let err = (sum_ry - p).abs() / p;
    assert!(err < 0.01,
        "Equilibrium: ΣRy={:.4}, P={:.1}", sum_ry, p);
}
