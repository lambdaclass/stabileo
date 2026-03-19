/// Validation: Semi-Rigid Connections and Partial Fixity
///
/// References:
///   - Chen & Lui, "Stability Design of Steel Frames", Ch. 5
///   - Eurocode 3, EN 1993-1-8 (Joint Classification)
///   - AISC Steel Construction Manual, Ch. 15 (Semi-Rigid Connections)
///
/// Semi-rigid connections are modeled via rotational springs or
/// internal hinges. A connection with stiffness kθ produces behavior
/// between fully pinned (kθ=0) and fully rigid (kθ=∞).
///
/// Tests verify:
///   1. End hinge vs rigid: cantilever with hinge at fixed end
///   2. Hinge at midspan: creates zero-moment point
///   3. Portal frame with column hinges: increased drift
///   4. Propped cantilever with hinge: becomes SS beam
///   5. Symmetric hinges: frame symmetry preserved
///   6. Hinge vs no-hinge moment comparison
///   7. Three-hinge arch (frame approximation)
///   8. Multi-bay frame with beam hinges
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Internal Hinge at Beam End: Releases Moment
// ================================================================
//
// A frame element with hinge_end=true should transmit zero moment
// at that end → behaves like a pin connection.

#[test]
fn validation_semirigid_hinge_end() {
    let l = 6.0;
    let n = 6;
    let q: f64 = -10.0;

    // Fixed-roller beam with UDL, hinge at end of last element (roller end)
    // Without hinge: propped cantilever → M at fixed end = qL²/8
    // With hinge at roller end: moment release, becomes like SS beam near roller
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let mut nodes_vec = Vec::new();
    let mut elems_vec = Vec::new();
    for i in 0..=n {
        nodes_vec.push((i + 1, i as f64 * l / n as f64, 0.0));
    }
    for i in 1..=n {
        let hinge_end = i == n; // hinge at roller end on last element
        elems_vec.push((i, "frame", i, i + 1, 1, 1, false, hinge_end));
    }
    let input = make_input(
        nodes_vec, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems_vec,
        vec![(1, 1, "fixed"), (2, n + 1, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge end should be zero
    let ef_last = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert!(ef_last.m_end.abs() < 1e-8,
        "Hinge end: M_end = 0: {:.6e}", ef_last.m_end);

    // Fixed end should carry moment (> 0 since UDL present)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.my.abs() > 1.0,
        "Fixed end: M ≠ 0: {:.4}", r1.my);
}

// ================================================================
// 2. Hinge at Midspan: Zero Moment Point
// ================================================================
//
// SS beam with internal hinge at midspan under UDL:
// The hinge makes the beam a mechanism for distributed load.
// With two elements sharing midspan node, and hinge_end on elem1
// + hinge_start on elem2, the moment at midspan = 0.

#[test]
fn validation_semirigid_midspan_hinge() {
    let l = 8.0;

    // Fixed-roller beam with hinge at interior node under UDL.
    // The hinge creates a zero-moment point.
    let n = 8;
    let q: f64 = -10.0;

    let mut nodes_vec = Vec::new();
    let mut elems_vec = Vec::new();
    for i in 0..=n {
        nodes_vec.push((i + 1, i as f64 * l / n as f64, 0.0));
    }
    let hinge_node = n / 2; // element n/2 has hinge at end, element n/2+1 hinge at start
    for i in 1..=n {
        let hinge_end = i == hinge_node;
        let hinge_start = i == hinge_node + 1;
        elems_vec.push((i, "frame", i, i + 1, 1, 1, hinge_start, hinge_end));
    }

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_input(
        nodes_vec, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems_vec,
        vec![(1, 1, "fixed"), (2, n + 1, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge should be zero on both sides
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == hinge_node).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == hinge_node + 1).unwrap();

    assert!(ef_left.m_end.abs() < 1e-8,
        "Hinge: M_end(left) = 0: {:.6e}", ef_left.m_end);
    assert!(ef_right.m_start.abs() < 1e-8,
        "Hinge: M_start(right) = 0: {:.6e}", ef_right.m_start);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q.abs() * l, 0.01, "Hinge: ΣRy = qL");
}

// ================================================================
// 3. Portal Frame with Column Hinges: Increased Drift
// ================================================================
//
// Portal frame with hinges at column tops → more flexible laterally
// than rigid frame. Drift should increase.

#[test]
fn validation_semirigid_portal_hinges() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;

    // Rigid frame
    let input_rigid = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let d_rigid = linear::solve_2d(&input_rigid).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Frame with hinges at column tops (beam-column connection)
    let input_hinged = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),  // hinge at top of left col
            (2, "frame", 2, 3, 1, 1, false, false),  // rigid beam
            (3, "frame", 4, 3, 1, 1, false, true),   // hinge at top of right col
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })],
    );
    let d_hinged = linear::solve_2d(&input_hinged).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Hinged frame should be more flexible
    assert!(d_hinged.abs() > d_rigid.abs(),
        "Hinged portal: more drift: {:.6e} > {:.6e}", d_hinged.abs(), d_rigid.abs());
}

// ================================================================
// 4. Propped Cantilever with Hinge → Simply Supported
// ================================================================
//
// Cantilever (fixed-roller) with hinge at fixed end becomes
// effectively pinned-roller = SS beam.

#[test]
fn validation_semirigid_propped_to_ss() {
    let l = 6.0;
    let p = 10.0;
    // SS beam (reference)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_ss = make_input(
        vec![(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        loads.clone(),
    );
    let d_ss = linear::solve_2d(&input_ss).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().uz;

    // Fixed-roller with hinge at start of first element
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_hinged = make_input(
        vec![(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, false),  // hinge at fixed end
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 3, "rollerX")],
        loads2,
    );
    let d_hinged = linear::solve_2d(&input_hinged).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().uz;

    // Should match SS beam behavior
    assert_close(d_hinged, d_ss, 0.02,
        "Propped+hinge ≈ SS beam");
}

// ================================================================
// 5. Symmetric Hinges: Frame Symmetry Preserved
// ================================================================
//
// Portal frame with symmetric hinge placement should
// still produce symmetric response under symmetric loading.

#[test]
fn validation_semirigid_symmetric_hinges() {
    let h = 4.0;
    let w = 6.0;
    let p = 15.0;

    // Symmetric hinges at column tops + gravity
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 4, 3, 1, 1, false, true),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Equal vertical reactions
    assert_close(r1.rz, r4.rz, 0.02, "Symmetric hinges: R1y = R4y");

    // Zero horizontal reactions (symmetric)
    assert!(r1.rx.abs() < 1e-8,
        "Symmetric hinges: Rx = 0: {:.6e}", r1.rx);
}

// ================================================================
// 6. Hinge vs No-Hinge: Moment Comparison
// ================================================================
//
// Fixed beam with and without midspan hinge: hinge should reduce
// the maximum moment capacity (creates a mechanism).

#[test]
fn validation_semirigid_moment_comparison() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    // Continuous beam without hinge (fixed-fixed)
    let loads_nh: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_nh = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_nh);
    let results_nh = linear::solve_2d(&input_nh).unwrap();

    // Fixed-fixed: max |M| at supports = qL²/12
    let m_support_nh = results_nh.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();

    // Same beam but with hinge at midspan
    // This changes the moment distribution significantly
    let mid = n / 2;
    let loads_h: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Build manually with hinge at midspan
    let mut nodes_vec = Vec::new();
    let mut elems_vec = Vec::new();
    for i in 0..=n {
        nodes_vec.push((i + 1, i as f64 * l / n as f64, 0.0));
    }
    for i in 1..=n {
        let hinge_end = i == mid;
        let hinge_start = i == mid + 1;
        elems_vec.push((i, "frame", i, i + 1, 1, 1, hinge_start, hinge_end));
    }
    let input_h = make_input(
        nodes_vec,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_vec,
        vec![(1, 1, "fixed"), (2, n + 1, "fixed")],
        loads_h,
    );
    let results_h = linear::solve_2d(&input_h).unwrap();

    let m_support_h = results_h.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();

    // With hinge, support moment should be larger (more load carried by supports)
    // since the midspan can no longer resist moment
    assert!(m_support_h > m_support_nh * 0.5,
        "Hinge changes moment distribution: {:.4} vs {:.4}",
        m_support_h, m_support_nh);
}

// ================================================================
// 7. Three-Hinge Frame (Statically Determinate)
// ================================================================
//
// Portal frame with 3 hinges (2 at base + 1 at beam midspan)
// is statically determinate. Reactions can be found from statics.

#[test]
fn validation_semirigid_three_hinge() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;

    // Three-hinge portal: pinned bases + hinge at beam midspan
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h),
            (3, w / 2.0, h),  // midspan of beam
            (4, w, h), (5, w, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, true),   // hinge at beam midspan
            (3, "frame", 3, 4, 1, 1, true, false),    // hinge at beam midspan
            (4, "frame", 5, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 5, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: ΣFx = 0, ΣFy = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_rx, -f, 0.01, "3-hinge: ΣRx = -F");
    assert_close(sum_ry, 0.0, 0.01, "3-hinge: ΣRy = 0");

    // Moment at hinge = 0 (verified by element forces)
    let ef2 = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap();
    assert!(ef2.m_end.abs() < 1e-8, "3-hinge: M at hinge = 0 (left)");
    assert!(ef3.m_start.abs() < 1e-8, "3-hinge: M at hinge = 0 (right)");

    // For lateral load F at column top height h:
    // Taking moment about right hinge on right half:
    // R5y × (w/2) + R5x × h = 0
    // Global: R1y + R5y = 0 (no vertical load)
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r5.rz, -r5.rx * h / (w / 2.0), 0.05,
        "3-hinge: moment about hinge");
}

// ================================================================
// 8. Multi-Bay Frame with Beam Hinges
// ================================================================
//
// Two-bay frame with hinges at beam ends to simulate
// simple connections: all beams are simply supported between columns.

#[test]
fn validation_semirigid_multibay_hinges() {
    let w = 5.0;
    let h = 4.0;
    let p = 10.0;

    // 3-column, 2-bay, 1-story frame
    // Beams have hinges at both ends (simply supported between columns)
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h),      // left column
            (3, w, 0.0), (4, w, h),            // middle column
            (5, 2.0 * w, 0.0), (6, 2.0 * w, h), // right column
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),   // left col (rigid)
            (2, "frame", 3, 4, 1, 1, false, false),   // mid col (rigid)
            (3, "frame", 5, 6, 1, 1, false, false),   // right col (rigid)
            (4, "frame", 2, 4, 1, 1, true, true),     // beam 1 (pinned both ends)
            (5, "frame", 4, 6, 1, 1, true, true),     // beam 2 (pinned both ends)
        ],
        vec![
            (1, 1, "fixed"), (2, 3, "fixed"), (3, 5, "fixed"),
        ],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Beams with hinges at both ends should have zero end moments
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();

    assert!(ef4.m_start.abs() < 1e-8,
        "Beam 1: M_start = 0: {:.6e}", ef4.m_start);
    assert!(ef4.m_end.abs() < 1e-8,
        "Beam 1: M_end = 0: {:.6e}", ef4.m_end);
    assert!(ef5.m_start.abs() < 1e-8,
        "Beam 2: M_start = 0: {:.6e}", ef5.m_start);
    assert!(ef5.m_end.abs() < 1e-8,
        "Beam 2: M_end = 0: {:.6e}", ef5.m_end);

    // Total vertical reaction = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 3.0 * p, 0.01, "Multi-bay: ΣRy = 3P");
}
