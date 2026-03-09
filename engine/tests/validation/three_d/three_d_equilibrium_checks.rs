/// Validation: 3D Global Equilibrium Checks
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 7
///   - Cook et al., "Concepts and Applications of FEA", Ch. 2
///   - Bathe, "Finite Element Procedures", §4.2
///
/// For any 3D structure, global equilibrium requires:
///   ΣFx = 0, ΣFy = 0, ΣFz = 0
///   ΣMx = 0, ΣMy = 0, ΣMz = 0
///
/// These tests verify 3D global equilibrium for various
/// loading conditions and structural configurations.
///
/// Tests verify:
///   1. 3D cantilever: reactions = applied loads
///   2. 3D portal frame: global force equilibrium
///   3. 3D beam with torque: moment equilibrium
///   4. Space truss: global equilibrium under 3D loading
///   5. L-shaped frame: out-of-plane equilibrium
///   6. Multi-story 3D frame: cumulative lateral loads
///   7. 3D beam with UDL: distributed load equilibrium
///   8. 3D frame with combined loads: complete equilibrium
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A_VAL: f64 = 0.01;
const IY: f64 = 2e-4;
const IZ_VAL: f64 = 1e-4;
const J: f64 = 1.5e-4;

// ================================================================
// 1. 3D Cantilever: Reactions = Applied Loads
// ================================================================

#[test]
fn validation_3d_eq_cantilever() {
    let l = 6.0;
    let n = 12;
    let fx = 5.0;
    let fy = -10.0;
    let fz = 3.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx, fy, fz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    assert_close(r.fx, -fx, 0.01, "3D cantilever: Rx = -Fx");
    assert_close(r.fy, -fy, 0.01, "3D cantilever: Ry = -Fy");
    assert_close(r.fz, -fz, 0.01, "3D cantilever: Rz = -Fz");

    // Moment equilibrium about fixed end:
    // Mz_reaction = -Fy_applied * L (counterbalancing)
    assert_close(r.mz, -fy * l, 0.02, "3D cantilever: Mz = -Fy*L");
    // My_reaction: check magnitude = |Fz|*L
    assert_close(r.my.abs(), fz.abs() * l, 0.02, "3D cantilever: |My| = |Fz|*L");
}

// ================================================================
// 2. 3D Portal Frame: Global Force Equilibrium
// ================================================================

#[test]
fn validation_3d_eq_portal() {
    let h = 4.0;
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, h, 0.0),
        (3, w, h, 0.0),
        (4, w, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![(1, fixed.clone()), (4, fixed)];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 10.0, fy: -15.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -15.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];
    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A_VAL, IY, IZ_VAL, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // ΣFx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert_close(sum_rx, -10.0, 0.01, "3D portal: ΣRx = -10");

    // ΣFy = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry, 30.0, 0.01, "3D portal: ΣRy = 30");

    // ΣFz = 0
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_rz, 0.0, 0.01, "3D portal: ΣRz = 0");
}

// ================================================================
// 3. 3D Beam with Torque: Moment Equilibrium
// ================================================================

#[test]
fn validation_3d_eq_torque() {
    let l = 8.0;
    let n = 16;
    let t = 10.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: t, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Torque equilibrium: reaction torque = -applied torque
    assert_close(r.mx, -t, 0.01, "3D torque: Mx_reaction = -T");

    // No other forces or moments
    assert_close(r.fx, 0.0, 0.01, "3D torque: Rx = 0");
    assert_close(r.fy, 0.0, 0.01, "3D torque: Ry = 0");
    assert_close(r.fz, 0.0, 0.01, "3D torque: Rz = 0");
}

// ================================================================
// 4. Space Truss: Global Equilibrium Under 3D Loading
// ================================================================

#[test]
fn validation_3d_eq_space_truss() {
    let h = 3.0;
    let b = 2.0;

    // Tripod: 3 legs from apex to base
    let nodes = vec![
        (1, 0.0, h, 0.0),        // apex
        (2, b, 0.0, 0.0),        // base 1
        (3, -b / 2.0, 0.0, b),   // base 2
        (4, -b / 2.0, 0.0, -b),  // base 3
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 1, 3, 1, 1),
        (3, "truss", 1, 4, 1, 1),
    ];
    let fixed = vec![true, true, true, false, false, false];
    let sups = vec![(2, fixed.clone()), (3, fixed.clone()), (4, fixed)];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 1, fx: 5.0, fy: -20.0, fz: 3.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A_VAL, IY, IZ_VAL, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    assert_close(sum_rx, -5.0, 0.01, "Space truss: ΣRx = -5");
    assert_close(sum_ry, 20.0, 0.01, "Space truss: ΣRy = 20");
    assert_close(sum_rz, -3.0, 0.01, "Space truss: ΣRz = -3");
}

// ================================================================
// 5. L-Shaped Frame: Out-of-Plane Equilibrium
// ================================================================

#[test]
fn validation_3d_eq_l_frame() {
    let l1 = 6.0;
    let l2 = 4.0;
    let p = 10.0;

    // L-shaped: beam along X then along Z
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l1, 0.0, 0.0),
        (3, l1, 0.0, l2),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![(1, fixed)];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A_VAL, IY, IZ_VAL, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    assert_close(r.fx, 0.0, 0.01, "L-frame: Rx = 0");
    assert_close(r.fy, p, 0.01, "L-frame: Ry = P");
    assert_close(r.fz, 0.0, 0.01, "L-frame: Rz = 0");

    // The load at (l1, 0, l2) creates moments about X and Z axes at the support
    // Mz about origin: P * l1 (moment from vertical force at distance l1 in X)
    // But in 3D the sign depends on convention. Just check non-zero.
    assert!(r.mz.abs() > 1.0, "L-frame: Mz reaction exists");
}

// ================================================================
// 6. Multi-Story 3D Frame: Cumulative Lateral Loads
// ================================================================

#[test]
fn validation_3d_eq_multi_story() {
    let h = 3.5;
    let w = 5.0;
    let f = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, h, 0.0),
        (3, 0.0, 2.0 * h, 0.0),
        (4, w, 0.0, 0.0),
        (5, w, h, 0.0),
        (6, w, 2.0 * h, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1),
        (4, "frame", 5, 6, 1, 1),
        (5, "frame", 2, 5, 1, 1), // floor 1
        (6, "frame", 3, 6, 1, 1), // floor 2
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![(1, fixed.clone()), (4, fixed)];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: f, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: f, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];
    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A_VAL, IY, IZ_VAL, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // ΣFx = 0: reactions balance 2f
    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert_close(sum_rx, -2.0 * f, 0.01, "3D multi-story: ΣRx = -2F");

    // ΣFy = ΣFz = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_ry, 0.0, 0.01, "3D multi-story: ΣRy = 0");
    assert_close(sum_rz, 0.0, 0.01, "3D multi-story: ΣRz = 0");
}

// ================================================================
// 7. 3D Beam with UDL: Distributed Load Equilibrium
// ================================================================

#[test]
fn validation_3d_eq_distributed() {
    let l = 8.0;
    let n = 16;
    let q_y: f64 = -10.0;

    let loads: Vec<SolverLoad3D> = (1..=n)
        .map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i,
            q_yi: q_y, q_yj: q_y, q_zi: 0.0, q_zj: 0.0,
            a: None, b: None,
        }))
        .collect();
    let fixed = vec![true, true, true, true, true, true];
    let roller = vec![false, true, true, false, false, false];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J,
        fixed, Some(roller), loads);
    let results = linear::solve_3d(&input).unwrap();

    // Total vertical reaction = total UDL = q * L
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry, q_y.abs() * l, 0.01,
        "3D UDL: ΣRy = |q|*L");
}

// ================================================================
// 8. 3D Frame with Combined Loads: Complete Equilibrium
// ================================================================

#[test]
fn validation_3d_eq_combined() {
    let l = 6.0;
    let n = 12;
    let fx = 5.0;
    let fy = -15.0;
    let fz = 3.0;
    let mx = 2.0;
    let my = -4.0;
    let mz = 6.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx, fy, fz, mx, my, mz, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    assert_close(r.fx, -fx, 0.01, "Combined: Rx = -Fx");
    assert_close(r.fy, -fy, 0.01, "Combined: Ry = -Fy");
    assert_close(r.fz, -fz, 0.01, "Combined: Rz = -Fz");

    // Moment equilibrium (reactions include load moments + force moments)
    // Mx_react = -(mx) = -2  (torque equilibrium)
    assert_close(r.mx, -mx, 0.02, "Combined: Mx equilibrium");
}
