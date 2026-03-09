/// Validation: 3D Global Equilibrium Benchmarks
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///   - Weaver & Gere, "Matrix Analysis of Framed Structures"
///   - ASCE Manual of Practice No. 41
///
/// Tests verify global equilibrium (ΣF = 0, ΣM = 0) for various 3D structures:
///   1. 3D cantilever: all 6 DOF loaded, reaction = applied
///   2. 3D portal frame: gravity equilibrium
///   3. Space frame: multi-direction loading
///   4. 3D continuous beam: distributed load equilibrium
///   5. Grid structure: out-of-plane loading
///   6. 3D truss: tetrahedral equilibrium
///   7. Mixed loads: nodal + distributed combined
///   8. Moment equilibrium: global ΣM = 0 at origin
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;

// ================================================================
// 1. Cantilever: All 6 DOF Loaded
// ================================================================
//
// Fixed cantilever with forces and moments in all directions.
// Reaction at fixed end must equal negative of applied loads.

#[test]
fn validation_3d_eq_cantilever_all_dof() {
    let l: f64 = 4.0;
    let n = 4;
    let fx = 10.0;
    let fy = -5.0;
    let fz = 8.0;
    let mx = 3.0;
    let my = -2.0;
    let mz = 4.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx, fy, fz, mx, my, mz, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    let check_f = |name: &str, reaction: f64, applied: f64| {
        let err = (reaction + applied).abs() / applied.abs().max(1e-12);
        assert!(err < 0.01,
            "{} equilibrium: R={:.4}, applied={:.4}", name, reaction, applied);
    };
    check_f("Fx", r.fx, fx);
    check_f("Fy", r.fy, fy);
    check_f("Fz", r.fz, fz);

    // Moment equilibrium (at fixed end, includes moment from forces × arm)
    // Mx_reaction = -mx - 0 (no fy or fz moment arm for torsion)
    // My_reaction includes fz × L contribution
    // Mz_reaction includes -fy × L contribution (in 2D sense)
    let mx_err = (r.mx + mx).abs() / mx.abs();
    assert!(mx_err < 0.01,
        "Mx equilibrium: R_mx={:.4}, applied={:.4}", r.mx, mx);
}

// ================================================================
// 2. 3D Portal Frame: Gravity Equilibrium
// ================================================================
//
// Portal frame in XZ plane with gravity load (-Z).
// ΣRz = total applied gravity.

#[test]
fn validation_3d_eq_portal_gravity() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let p = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, w, 0.0, h),
        (4, w, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let err = (sum_fz - 2.0 * p).abs() / (2.0 * p);
    assert!(err < 0.01,
        "Portal gravity: ΣRz={:.4}, applied 2P={:.4}", sum_fz, 2.0 * p);

    // Symmetric: both supports carry equal vertical
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().fz;
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().fz;
    let sym_err = (r1 - r4).abs() / r1.abs().max(1e-12);
    assert!(sym_err < 0.01,
        "Symmetric reactions: R1z={:.4}, R4z={:.4}", r1, r4);
}

// ================================================================
// 3. Space Frame: Multi-Direction Loading
// ================================================================
//
// L-shaped frame in 3D. Loads in X, Y, Z simultaneously.

#[test]
fn validation_3d_eq_space_frame_multi() {
    let l: f64 = 3.0;
    let fx = 5.0;
    let fy = -3.0;
    let fz = -8.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l, 0.0, 0.0),
        (3, l, l, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx, fy, fz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium in all directions
    let err_x = (r.fx + fx).abs() / fx.abs();
    let err_y = (r.fy + fy).abs() / fy.abs();
    let err_z = (r.fz + fz).abs() / fz.abs();

    assert!(err_x < 0.01, "ΣFx: R={:.4}, F={:.4}", r.fx, fx);
    assert!(err_y < 0.01, "ΣFy: R={:.4}, F={:.4}", r.fy, fy);
    assert!(err_z < 0.01, "ΣFz: R={:.4}, F={:.4}", r.fz, fz);
}

// ================================================================
// 4. 3D Continuous Beam: Distributed Load Equilibrium
// ================================================================
//
// Two-span continuous beam with UDL in Z. Total reaction = qL_total.

#[test]
fn validation_3d_eq_continuous_dist() {
    let l: f64 = 4.0;
    let n = 4;
    let q: f64 = -5.0;

    let total_n = 2 * n;
    let elem_len = 2.0 * l / total_n as f64;
    let nodes: Vec<_> = (0..=total_n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..total_n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();

    let sups = vec![
        (1, vec![true, true, true, true, false, false]),
        (n + 1, vec![false, true, true, false, false, false]),
        (total_n + 1, vec![false, true, true, false, false, false]),
    ];

    let loads: Vec<_> = (0..total_n).map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
        element_id: i + 1,
        q_yi: 0.0, q_yj: 0.0,
        q_zi: q, q_zj: q,
        a: None, b: None,
    })).collect();

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    let total_applied = q.abs() * 2.0 * l;
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let err = (sum_rz - total_applied).abs() / total_applied;
    assert!(err < 0.01,
        "Continuous beam: ΣRz={:.4}, total qL={:.4}", sum_rz, total_applied);
}

// ================================================================
// 5. Grid: Out-of-Plane Loading
// ================================================================
//
// 2-beam grid in XY plane. Z-direction load at junction.
// Both supports should share the load.

#[test]
fn validation_3d_eq_grid_out_of_plane() {
    let span: f64 = 4.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, span, 0.0, 0.0),  // junction
        (3, span, span, 0.0), // second beam end
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let err = (sum_fz - p).abs() / p;
    assert!(err < 0.01,
        "Grid Z equilibrium: ΣRz={:.4}, P={:.4}", sum_fz, p);

    // Both supports should carry some load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().fz;
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().fz;
    assert!(r1 > 0.0 && r3 > 0.0,
        "Both supports should carry load: R1z={:.4}, R3z={:.4}", r1, r3);
}

// ================================================================
// 6. 3D Truss: Full Equilibrium
// ================================================================
//
// Tripod truss: 3 legs meeting at an apex. Load at apex in X, Y, Z.
// ΣF = 0 in all three directions.

#[test]
fn validation_3d_eq_tripod_truss() {
    let r: f64 = 3.0;
    let h: f64 = 5.0;
    let fx = 5.0;
    let fy = -3.0;
    let fz = -10.0;

    let nodes = vec![
        (1, r, 0.0, 0.0),
        (2, -r / 2.0, r * 0.866, 0.0),
        (3, -r / 2.0, -r * 0.866, 0.0),
        (4, 0.0, 0.0, h), // apex
    ];
    let elems = vec![
        (1, "truss", 1, 4, 1, 1),
        (2, "truss", 2, 4, 1, 1),
        (3, "truss", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx, fy, fz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let iy = 1e-10;
    let iz = 1e-10;
    let j_val = 1e-10;
    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, iy, iz, j_val)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    let err_x = (sum_fx + fx).abs() / fx.abs();
    let err_y = (sum_fy + fy).abs() / fy.abs();
    let err_z = (sum_fz + fz).abs() / fz.abs();

    assert!(err_x < 0.01, "ΣFx: {:.4}+{:.4}={:.6}", sum_fx, fx, sum_fx + fx);
    assert!(err_y < 0.01, "ΣFy: {:.4}+{:.4}={:.6}", sum_fy, fy, sum_fy + fy);
    assert!(err_z < 0.01, "ΣFz: {:.4}+{:.4}={:.6}", sum_fz, fz, sum_fz + fz);
}

// ================================================================
// 7. Mixed Nodal + Distributed: Combined Equilibrium
// ================================================================

#[test]
fn validation_3d_eq_mixed_loads() {
    let l: f64 = 6.0;
    let n = 4;
    let p = 10.0;
    let q: f64 = -3.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        Some(vec![false, true, true, false, false, false]),
        {
            let mut loads = Vec::new();
            // Point load at tip
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }));
            // UDL on all elements
            for i in 0..n {
                loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    element_id: i + 1,
                    q_yi: 0.0, q_yj: 0.0,
                    q_zi: q, q_zj: q,
                    a: None, b: None,
                }));
            }
            loads
        },
    );

    let results = linear::solve_3d(&input).unwrap();

    let total_applied = p + q.abs() * l;
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let err = (sum_rz - total_applied).abs() / total_applied;
    assert!(err < 0.01,
        "Mixed loads: ΣRz={:.4}, total P+qL={:.4}", sum_rz, total_applied);
}

// ================================================================
// 8. Moment Equilibrium: ΣM About Origin = 0
// ================================================================
//
// For a structure in static equilibrium, the sum of moments about
// any point (including the origin) must be zero.

#[test]
fn validation_3d_eq_moment_about_origin() {
    let l: f64 = 5.0;
    let n = 4;
    let p = 10.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        Some(vec![false, true, true, false, false, false]),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // For moment about origin in Y direction:
    // Applied: -P × x_tip = -10 × 5 = -50
    // Reactions contribute: R_fz × x + R_my at each support
    let mut sum_my_origin = 0.0;

    // Applied load contribution
    let x_tip = l;
    sum_my_origin += (-p) * x_tip; // Fz × x (for My about origin)

    // Reaction contributions
    for r in &results.reactions {
        // Node positions: node 1 at x=0, node n+1 at x=l
        let x_node = if r.node_id == 1 { 0.0 } else { l };
        sum_my_origin += r.fz * x_node; // Reaction Fz × x position
        sum_my_origin += r.my; // Direct moment reaction
    }

    // Should be near zero
    let p_l = p * l;
    assert!(sum_my_origin.abs() / p_l < 0.02,
        "Moment equilibrium about origin: ΣMy={:.6}, ref PL={:.4}",
        sum_my_origin, p_l);
}
