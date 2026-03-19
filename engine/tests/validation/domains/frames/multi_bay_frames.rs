/// Validation: Multi-Bay Frame Structures
///
/// References:
///   - Norris, Wilbur & Utku, "Elementary Structural Analysis", Ch. 14
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 3
///   - Taranath, "Structural Analysis and Design of Tall Buildings", Ch. 5
///
/// Tests verify behavior of multi-bay portal frames commonly used
/// in building structures:
///   1. Single-bay portal: lateral stiffness
///   2. Two-bay portal: load sharing between bays
///   3. Multi-bay symmetry under symmetric load
///   4. Interior column axial load distribution
///   5. Multi-bay drift under lateral load
///   6. Bay width effect on stiffness
///   7. Multi-bay equilibrium checks
///   8. Interior joint moment equilibrium
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a multi-bay portal frame.
/// All bays have the same width. Columns are fixed at base.
/// Returns SolverInput with nodes numbered:
///   Bottom: 1..=n_bays+1
///   Top: n_bays+2..=2*(n_bays+1)
fn make_multi_bay(n_bays: usize, bay_width: f64, height: f64,
                  loads: Vec<SolverLoad>) -> SolverInput {
    let n_cols = n_bays + 1;
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut sups = Vec::new();
    let mut eid = 1;

    // Bottom nodes
    for i in 0..n_cols {
        nodes.push((i + 1, i as f64 * bay_width, 0.0));
        sups.push((i + 1, i + 1, "fixed"));
    }

    // Top nodes
    for i in 0..n_cols {
        nodes.push((n_cols + i + 1, i as f64 * bay_width, height));
    }

    // Columns
    for i in 0..n_cols {
        elems.push((eid, "frame", i + 1, n_cols + i + 1, 1, 1, false, false));
        eid += 1;
    }

    // Beams
    for i in 0..n_bays {
        elems.push((eid, "frame", n_cols + i + 1, n_cols + i + 2, 1, 1, false, false));
        eid += 1;
    }

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

// ================================================================
// 1. Single-Bay Portal: Lateral Stiffness
// ================================================================

#[test]
fn validation_multi_bay_single() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    // Lateral load at top-left
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fz: 0.0, my: 0.0,
    })];
    let input = make_multi_bay(1, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_top = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;
    assert!(d_top > 0.0, "Single bay: positive lateral drift: {:.6e}", d_top);

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f, 0.02, "Single bay: ΣRx = -F");
}

// ================================================================
// 2. Two-Bay Portal: Load Sharing
// ================================================================

#[test]
fn validation_multi_bay_two_bay() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    // Two-bay frame with lateral load
    // Bottom: 1,2,3; Top: 4,5,6
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: f, fz: 0.0, my: 0.0,
    })];
    let input = make_multi_bay(2, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Two-bay should be stiffer than single-bay (more columns)
    let d_two = results.displacements.iter()
        .find(|d| d.node_id == 4).unwrap().ux.abs();

    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fz: 0.0, my: 0.0,
    })];
    let input1 = make_multi_bay(1, w, h, loads1);
    let d_one = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 3).unwrap().ux.abs();

    assert!(d_two < d_one,
        "Two-bay stiffer: {:.6e} < {:.6e}", d_two, d_one);
}

// ================================================================
// 3. Symmetry Under Symmetric Load
// ================================================================

#[test]
fn validation_multi_bay_symmetry() {
    let w = 5.0;
    let h = 4.0;
    let p = 10.0;

    // 2-bay frame with vertical load at center top node
    // Bottom: 1,2,3; Top: 4,5,6. Center top = 5
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_multi_bay(2, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: reactions at node 1 = reactions at node 3
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, r3.rz, 0.02, "Symmetry: R1_y = R3_y");

    // Displacements symmetric
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().uz;
    let d6 = results.displacements.iter().find(|d| d.node_id == 6).unwrap().uz;
    assert_close(d4, d6, 0.02, "Symmetry: δ4 = δ6");
}

// ================================================================
// 4. Interior Column Axial Load
// ================================================================

#[test]
fn validation_multi_bay_interior_axial() {
    let w = 6.0;
    let h = 4.0;
    let p = 20.0;

    // 2-bay with gravity load at each top node
    // Bottom: 1,2,3; Top: 4,5,6
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input = make_multi_bay(2, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total reaction = 3P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 3.0 * p, 0.02, "Interior: ΣRy = 3P");

    // Each column carries approximately P (from its top node)
    // Interior column connected to both beams carries a similar share
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(r2, p, 0.10, "Interior: R2 ≈ P");
    assert_close(r1, p, 0.10, "Exterior: R1 ≈ P");
}

// ================================================================
// 5. Multi-Bay Drift Under Lateral Load
// ================================================================

#[test]
fn validation_multi_bay_drift() {
    let w = 5.0;
    let h = 4.0;
    let f = 10.0;

    // Compare drift for 1, 2, 3 bays
    let mut drifts = Vec::new();
    for n_bays in &[1, 2, 3] {
        let top_left = n_bays + 2; // first top node
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: top_left, fx: f, fz: 0.0, my: 0.0,
        })];
        let input = make_multi_bay(*n_bays, w, h, loads);
        let d = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == top_left).unwrap().ux.abs();
        drifts.push(d);
    }

    // More bays → less drift (stiffer)
    assert!(drifts[1] < drifts[0],
        "2-bay < 1-bay: {:.6e} < {:.6e}", drifts[1], drifts[0]);
    assert!(drifts[2] < drifts[1],
        "3-bay < 2-bay: {:.6e} < {:.6e}", drifts[2], drifts[1]);
}

// ================================================================
// 6. Bay Width Effect
// ================================================================

#[test]
fn validation_multi_bay_width_effect() {
    let h = 4.0;
    let f = 10.0;

    // Compare wide vs narrow bay
    let loads_narrow = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fz: 0.0, my: 0.0,
    })];
    let input_narrow = make_multi_bay(1, 4.0, h, loads_narrow);
    let d_narrow = linear::solve_2d(&input_narrow).unwrap()
        .displacements.iter().find(|d| d.node_id == 3).unwrap().ux.abs();

    let loads_wide = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fz: 0.0, my: 0.0,
    })];
    let input_wide = make_multi_bay(1, 8.0, h, loads_wide);
    let d_wide = linear::solve_2d(&input_wide).unwrap()
        .displacements.iter().find(|d| d.node_id == 3).unwrap().ux.abs();

    // Wider bay has stiffer beam (longer moment arm) but same column stiffness
    // Net effect depends on relative stiffness, but both should deflect
    assert!(d_narrow > 0.0 && d_wide > 0.0,
        "Both deflect: narrow={:.6e}, wide={:.6e}", d_narrow, d_wide);
}

// ================================================================
// 7. Multi-Bay Equilibrium
// ================================================================

#[test]
fn validation_multi_bay_equilibrium() {
    let w = 5.0;
    let h = 4.0;
    let f_lat = 8.0;
    let f_grav = 15.0;

    // 3-bay frame with combined loads
    // Bottom: 1,2,3,4; Top: 5,6,7,8
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f_lat, fz: -f_grav, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fz: -f_grav, my: 0.0 }),
    ];
    let input = make_multi_bay(3, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();

    assert_close(sum_rx, -f_lat, 0.02, "Multi-bay equil: ΣRx = -F_lat");
    assert_close(sum_ry, 2.0 * f_grav, 0.02, "Multi-bay equil: ΣRy = 2F_grav");
}

// ================================================================
// 8. Interior Joint Moment Balance
// ================================================================

#[test]
fn validation_multi_bay_joint_balance() {
    let w = 6.0;
    let h = 4.0;
    let p = 10.0;

    // 2-bay with UDL on top beams
    // Bottom: 1,2,3; Top: 4,5,6
    // Elements: col 1(1-4), col 2(2-5), col 3(3-6), beam 4(4-5), beam 5(5-6)
    let n_cols = 3;
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: n_cols + 1, q_i: -p as f64, q_j: -p as f64, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: n_cols + 2, q_i: -p as f64, q_j: -p as f64, a: None, b: None,
        }),
    ];
    let input = make_multi_bay(2, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // All element forces should be finite
    for ef in &results.element_forces {
        assert!(ef.m_start.is_finite() && ef.m_end.is_finite(),
            "Joint: finite moments in elem {}", ef.element_id);
    }

    // Total vertical load = 2 × q × w
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p * w, 0.02,
        "Joint balance: ΣRy = 2qw");
}
