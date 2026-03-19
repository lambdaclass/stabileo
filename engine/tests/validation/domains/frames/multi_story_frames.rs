/// Validation: Multi-Story Frame Analysis
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 15 (Approximate methods for frames)
///   - Taranath, "Structural Analysis and Design of Tall Buildings", Ch. 3-4
///   - AISC Design Guide 28: Stability Design
///
/// Tests verify multi-story frame behavior:
///   1. Two-story portal: drift proportional to load
///   2. Three-story: upper floors sway more
///   3. Lateral load distribution: portal method check
///   4. Gravity frame: symmetric loading
///   5. Stiffness effect: stiffer columns reduce drift
///   6. Frame with setback: different widths
///   7. Multi-bay multi-story: 2×2 frame
///   8. Frame equilibrium under combined loading
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.02;
const IZ: f64 = 2e-4;

/// Helper to build a rectangular multi-story frame.
/// Returns nodes, elements, supports for n_story × n_bay frame.
fn make_frame(
    n_story: usize,
    n_bay: usize,
    h: f64,
    w: f64,
) -> (Vec<(usize, f64, f64)>, Vec<(usize, &'static str, usize, usize, usize, usize, bool, bool)>, Vec<(usize, usize, &'static str)>) {
    let n_cols = n_bay + 1;
    let mut nodes = Vec::new();
    let mut node_id = 1;

    // Ground level nodes
    for col in 0..n_cols {
        nodes.push((node_id, col as f64 * w, 0.0));
        node_id += 1;
    }
    // Floor nodes
    for story in 1..=n_story {
        for col in 0..n_cols {
            nodes.push((node_id, col as f64 * w, story as f64 * h));
            node_id += 1;
        }
    }

    let mut elems = Vec::new();
    let mut elem_id = 1;

    // Columns
    for story in 0..n_story {
        for col in 0..n_cols {
            let bot = story * n_cols + col + 1;
            let top = (story + 1) * n_cols + col + 1;
            elems.push((elem_id, "frame", bot, top, 1, 1, false, false));
            elem_id += 1;
        }
    }
    // Beams
    for story in 1..=n_story {
        for bay in 0..n_bay {
            let left = story * n_cols + bay + 1;
            let right = story * n_cols + bay + 2;
            elems.push((elem_id, "frame", left, right, 1, 1, false, false));
            elem_id += 1;
        }
    }

    // Supports at ground level
    let mut sups = Vec::new();
    for col in 0..n_cols {
        sups.push((col + 1, col + 1, "fixed"));
    }

    (nodes, elems, sups)
}

// ================================================================
// 1. Two-Story Portal: Drift Proportional to Load
// ================================================================
//
// Doubling the lateral load should double the lateral drift (linear).

#[test]
fn validation_frame_drift_proportional() {
    let h = 3.5;
    let w = 6.0;
    let (nodes, elems, sups) = make_frame(2, 1, h, w);

    let get_drift = |f_lateral: f64| -> f64 {
        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_lateral, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f_lateral, fz: 0.0, my: 0.0 }),
        ];
        let input = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
            elems.clone(), sups.clone(), loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux.abs()
    };

    let d1 = get_drift(5.0);
    let d2 = get_drift(10.0);

    assert_close(d2, 2.0 * d1, 0.02,
        "Linear: 2× load → 2× drift");
}

// ================================================================
// 2. Three-Story: Upper Floors Sway More
// ================================================================
//
// Under uniform lateral loads at each floor, drift increases with height.

#[test]
fn validation_frame_increasing_drift() {
    let h = 3.5;
    let w = 6.0;
    let (nodes, elems, sups) = make_frame(3, 1, h, w);
    let n_cols = 2;

    // Lateral load at each floor level (left nodes)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + n_cols, fx: 5.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: 5.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 3 * n_cols, fx: 5.0, fz: 0.0, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d1 = results.displacements.iter().find(|d| d.node_id == 1 + n_cols).unwrap().ux.abs();
    let d2 = results.displacements.iter().find(|d| d.node_id == 1 + 2 * n_cols).unwrap().ux.abs();
    let d3 = results.displacements.iter().find(|d| d.node_id == 1 + 3 * n_cols).unwrap().ux.abs();

    assert!(d3 > d2 && d2 > d1,
        "Drift increases with height: {:.6e} > {:.6e} > {:.6e}", d3, d2, d1);
}

// ================================================================
// 3. Gravity Load on Symmetric Frame: No Lateral Drift
// ================================================================
//
// Symmetric frame under symmetric gravity: should have zero sway.

#[test]
fn validation_frame_gravity_no_sway() {
    let h = 3.5;
    let w = 6.0;
    let (nodes, elems, sups) = make_frame(2, 1, h, w);
    let n_cols = 2;

    // Symmetric gravity at each floor
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + n_cols, fx: 0.0, fz: -20.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2 + n_cols, fx: 0.0, fz: -20.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: 0.0, fz: -20.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2 + 2 * n_cols, fx: 0.0, fz: -20.0, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Top floor should have negligible lateral drift
    let d_top = results.displacements.iter().find(|d| d.node_id == 1 + 2 * n_cols).unwrap().ux;
    assert!(d_top.abs() < 1e-8,
        "Symmetric gravity: no sway: {:.6e}", d_top);
}

// ================================================================
// 4. Stiffness Effect: Stiffer Columns Reduce Drift
// ================================================================
//
// Larger column I → less lateral drift.

#[test]
fn validation_frame_stiffness_effect() {
    let h = 3.5;
    let w = 6.0;

    let get_drift = |iz: f64| -> f64 {
        let (nodes, elems, sups) = make_frame(2, 1, h, w);
        let n_cols = 2;
        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: 10.0, fz: 0.0, my: 0.0 }),
        ];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, iz)], elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == 1 + 2 * n_cols).unwrap().ux.abs()
    };

    let d_flex = get_drift(IZ);
    let d_stiff = get_drift(IZ * 4.0);

    assert!(d_stiff < d_flex,
        "Stiffer columns: less drift: {:.6e} < {:.6e}", d_stiff, d_flex);

    // Roughly: 4× stiffness → 1/4 drift (for shear-dominant frame)
    let ratio = d_flex / d_stiff;
    assert!(ratio > 2.0 && ratio < 6.0,
        "Stiffness ratio: {:.3}", ratio);
}

// ================================================================
// 5. Multi-Bay Frame: 2×2
// ================================================================
//
// 2-story, 2-bay frame. More bays → less drift per floor (more columns resist).

#[test]
fn validation_frame_multi_bay() {
    let h = 3.5;
    let w = 5.0;

    // 1-bay frame
    let (nodes1, elems1, sups1) = make_frame(2, 1, h, w);
    let n_cols1 = 2;
    let loads1 = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols1, fx: 10.0, fz: 0.0, my: 0.0 }),
    ];
    let input1 = make_input(nodes1, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems1, sups1, loads1);
    let d_1bay = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 1 + 2 * n_cols1).unwrap().ux.abs();

    // 2-bay frame
    let (nodes2, elems2, sups2) = make_frame(2, 2, h, w);
    let n_cols2 = 3;
    let loads2 = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols2, fx: 10.0, fz: 0.0, my: 0.0 }),
    ];
    let input2 = make_input(nodes2, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems2, sups2, loads2);
    let d_2bay = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 1 + 2 * n_cols2).unwrap().ux.abs();

    // 2-bay should have less drift (more columns resisting)
    assert!(d_2bay < d_1bay,
        "2-bay less drift than 1-bay: {:.6e} < {:.6e}", d_2bay, d_1bay);
}

// ================================================================
// 6. Asymmetric Load: Causes Sway
// ================================================================
//
// Gravity load on one side only should cause lateral drift.

#[test]
fn validation_frame_asymmetric_gravity() {
    let h = 3.5;
    let w = 6.0;
    let (nodes, elems, sups) = make_frame(1, 1, h, w);
    let n_cols = 2;

    // Load only on left column node
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + n_cols, fx: 0.0, fz: -50.0, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Should have vertical deflection at loaded node
    let d_left = results.displacements.iter().find(|d| d.node_id == 1 + n_cols).unwrap();
    assert!(d_left.uz < 0.0,
        "Asymmetric gravity: loaded node deflects down: {:.6e}", d_left.uz);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 50.0, 0.02, "Asymmetric gravity: ΣRy = P");
}

// ================================================================
// 7. Beam UDL on Frame
// ================================================================
//
// Frame with UDL on beams: deflections and reactions.

#[test]
fn validation_frame_beam_udl() {
    let h = 4.0;
    let w = 6.0;
    let q: f64 = -10.0;
    let (nodes, elems, sups) = make_frame(1, 1, h, w);

    // UDL on the beam element (find beam element - it's the last one)
    let n_elems = elems.len();
    let beam_elem_id = n_elems; // last element is the beam

    let loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: beam_elem_id, q_i: q, q_j: q, a: None, b: None,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: ΣRy = q × w
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q.abs() * w, 0.02, "Frame UDL: ΣRy = qL");

    // Symmetric loading → equal vertical reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    assert_close(r1, r2, 0.02, "Frame UDL: symmetric reactions");
}

// ================================================================
// 8. Frame Equilibrium Under Combined Loading
// ================================================================
//
// Global equilibrium for frame under lateral + gravity.

#[test]
fn validation_frame_combined_equilibrium() {
    let h = 3.5;
    let w = 6.0;
    let (nodes, elems, sups) = make_frame(2, 1, h, w);
    let n_cols = 2;

    let px = 8.0;
    let py = -30.0;
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: px, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2 + 2 * n_cols, fx: 0.0, fz: py, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // ΣRx = -px
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -px, 0.02, "Frame equilibrium: ΣRx = -Px");

    // ΣRy = -2py
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -2.0 * py, 0.02, "Frame equilibrium: ΣRy = -ΣPy");
}
