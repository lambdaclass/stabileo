/// Validation: Superposition Principle
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 4 (Principle of superposition)
///   - Ghali & Neville, "Structural Analysis", Ch. 4
///
/// Tests verify linear superposition for various load combinations:
///   1. Two point loads: combined = sum of individual
///   2. UDL + point: combined = sum
///   3. Multiple thermal loads: additive
///   4. Scaling: 2P → 2δ
///   5. Sign reversal: -P → -δ
///   6. Three-load superposition on continuous beam
///   7. Frame: lateral + gravity = sum of individual
///   8. 3D superposition: Y-load + Z-load
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two Point Loads: Superposition
// ================================================================

#[test]
fn validation_superposition_two_points() {
    let l = 8.0;
    let n = 8;
    let p1 = 10.0;
    let p2 = 5.0;
    let node_a = 3; // L/4
    let node_b = 7; // 3L/4
    let check_node = 5; // midspan

    // Load 1 only
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fz: -p1, my: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == check_node).unwrap().uz;

    // Load 2 only
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fz: -p2, my: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == check_node).unwrap().uz;

    // Combined
    let loads_c = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_a, fx: 0.0, fz: -p1, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_b, fx: 0.0, fz: -p2, my: 0.0 }),
    ];
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let d_c = linear::solve_2d(&input_c).unwrap()
        .displacements.iter().find(|d| d.node_id == check_node).unwrap().uz;

    assert_close(d_c, d1 + d2, 0.01, "Superposition: two point loads");
}

// ================================================================
// 2. UDL + Point Load
// ================================================================

#[test]
fn validation_superposition_udl_plus_point() {
    let l = 6.0;
    let n = 6;
    let q = -5.0;
    let p = 10.0;
    let mid = n / 2 + 1;

    // UDL only
    let loads_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_udl = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_udl);
    let d_udl = linear::solve_2d(&input_udl).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Point only
    let loads_pt = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_pt = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_pt);
    let d_pt = linear::solve_2d(&input_pt).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Combined
    let mut loads_c: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads_c.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    }));
    let input_c = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_c);
    let d_c = linear::solve_2d(&input_c).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    assert_close(d_c, d_udl + d_pt, 0.01, "Superposition: UDL + point");
}

// ================================================================
// 3. Scaling: 2P → 2δ
// ================================================================

#[test]
fn validation_superposition_scaling() {
    let l = 6.0;
    let n = 6;
    let p = 10.0;
    let mid = n / 2 + 1;

    let get_defl = |load: f64| -> f64 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -load, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == mid).unwrap().uz
    };

    let d1 = get_defl(p);
    let d2 = get_defl(2.0 * p);
    let d3 = get_defl(3.0 * p);

    assert_close(d2, 2.0 * d1, 0.01, "Scaling: 2P → 2δ");
    assert_close(d3, 3.0 * d1, 0.01, "Scaling: 3P → 3δ");
}

// ================================================================
// 4. Sign Reversal: -P → -δ
// ================================================================

#[test]
fn validation_superposition_sign_reversal() {
    let l = 6.0;
    let n = 6;
    let p = 10.0;
    let mid = n / 2 + 1;

    let get_defl = |load: f64| -> f64 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: load, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == mid).unwrap().uz
    };

    let d_down = get_defl(-p);
    let d_up = get_defl(p);

    assert_close(d_down, -d_up, 0.01, "Sign reversal: -P → -δ");
}

// ================================================================
// 5. Reaction Superposition
// ================================================================
//
// Reactions should also superpose.

#[test]
fn validation_superposition_reactions() {
    let l = 6.0;
    let n = 6;
    let p1 = 10.0;
    let p2 = 8.0;

    let get_r1 = |loads: Vec<SolverLoad>| -> f64 {
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
            .reactions.iter().find(|r| r.node_id == 1).unwrap().rz
    };

    let r_a = get_r1(vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p1, my: 0.0,
    })]);
    let r_b = get_r1(vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fz: -p2, my: 0.0,
    })]);
    let r_c = get_r1(vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p1, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p2, my: 0.0 }),
    ]);

    assert_close(r_c, r_a + r_b, 0.01, "Reaction superposition");
}

// ================================================================
// 6. Three-Load Superposition on Continuous Beam
// ================================================================

#[test]
fn validation_superposition_continuous() {
    let span = 5.0;
    let n = 5;
    let q = -8.0;
    let p1 = 10.0;
    let p2 = 5.0;
    let mid1 = n / 2 + 1;
    let mid2 = n + n / 2 + 1;

    // UDL only
    let loads_u: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_u = make_continuous_beam(&[span, span], n, E, A, IZ, loads_u);
    let d_u = linear::solve_2d(&input_u).unwrap()
        .displacements.iter().find(|d| d.node_id == mid1).unwrap().uz;

    // Point load 1 only
    let loads_p1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid1, fx: 0.0, fz: -p1, my: 0.0,
    })];
    let input_p1 = make_continuous_beam(&[span, span], n, E, A, IZ, loads_p1);
    let d_p1 = linear::solve_2d(&input_p1).unwrap()
        .displacements.iter().find(|d| d.node_id == mid1).unwrap().uz;

    // Point load 2 only
    let loads_p2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid2, fx: 0.0, fz: -p2, my: 0.0,
    })];
    let input_p2 = make_continuous_beam(&[span, span], n, E, A, IZ, loads_p2);
    let d_p2 = linear::solve_2d(&input_p2).unwrap()
        .displacements.iter().find(|d| d.node_id == mid1).unwrap().uz;

    // All combined
    let mut loads_all: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads_all.push(SolverLoad::Nodal(SolverNodalLoad { node_id: mid1, fx: 0.0, fz: -p1, my: 0.0 }));
    loads_all.push(SolverLoad::Nodal(SolverNodalLoad { node_id: mid2, fx: 0.0, fz: -p2, my: 0.0 }));
    let input_all = make_continuous_beam(&[span, span], n, E, A, IZ, loads_all);
    let d_all = linear::solve_2d(&input_all).unwrap()
        .displacements.iter().find(|d| d.node_id == mid1).unwrap().uz;

    assert_close(d_all, d_u + d_p1 + d_p2, 0.01,
        "3-load superposition on continuous beam");
}

// ================================================================
// 7. Frame: Lateral + Gravity Superposition
// ================================================================

#[test]
fn validation_superposition_frame() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;
    let f_grav = -30.0;

    // Lateral only
    let input_lat = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let d_lat = linear::solve_2d(&input_lat).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Gravity only
    let input_grav = make_portal_frame(h, w, E, A, IZ, 0.0, f_grav);
    let d_grav = linear::solve_2d(&input_grav).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Combined
    let input_both = make_portal_frame(h, w, E, A, IZ, f_lat, f_grav);
    let d_both = linear::solve_2d(&input_both).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    assert_close(d_both, d_lat + d_grav, 0.01,
        "Frame superposition: lateral + gravity");
}

// ================================================================
// 8. 3D Superposition: Y + Z Loads
// ================================================================

#[test]
fn validation_superposition_3d() {
    let l = 5.0;
    let n = 8;
    let py = 10.0;
    let pz = 5.0;

    let fixed = vec![true, true, true, true, true, true];

    // Y load only
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_y = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 3e-4, fixed.clone(), None, loads_y);
    let tip_y = linear::solve_3d(&input_y).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    // Z load only
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_z = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 3e-4, fixed.clone(), None, loads_z);
    let tip_z = linear::solve_3d(&input_z).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;

    // Both
    let loads_both = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_both = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 3e-4, fixed, None, loads_both);
    let res = linear::solve_3d(&input_both).unwrap();
    let tip = res.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip.uy, tip_y, 0.01, "3D superposition: uy");
    assert_close(tip.uz, tip_z, 0.01, "3D superposition: uz");
}
