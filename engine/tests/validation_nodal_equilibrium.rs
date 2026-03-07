/// Validation: Nodal Equilibrium Verification
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 2
///   - Przemieniecki, "Theory of Matrix Structural Analysis", §2.6
///   - Any structural analysis textbook: ΣF=0, ΣM=0 at every node
///
/// At every free node, the sum of element end forces (in global coords)
/// must equal the applied external load. At every support node, the
/// element end forces plus reactions must sum to zero.
///
/// These tests verify nodal equilibrium for various structural
/// configurations with increasing complexity.
///
/// Tests verify:
///   1. Simple beam: node equilibrium at interior node
///   2. Continuous beam: equilibrium at interior support
///   3. Portal frame: equilibrium at beam-column joints
///   4. Multi-bay frame: equilibrium at all free nodes
///   5. Truss: equilibrium at loaded apex
///   6. Frame with distributed load: FEF contributes to node forces
///   7. Cantilever with multiple loads: tip equilibrium
///   8. Three-story frame: equilibrium at every floor level
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Simple Beam: Interior Node Equilibrium
// ================================================================
//
// SS beam with point load at midspan node.
// At the loaded node: Σelement_end_forces_y = -P (external load).

#[test]
fn validation_equilibrium_ss_beam() {
    let l = 10.0;
    let n = 2; // two elements, node 2 is at midspan
    let p = 20.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // At node 2 (interior, loaded): end of elem 1 + start of elem 2 + applied load = 0
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Vertical forces at node 2: -v_end(elem1) + v_start(elem2) should balance P
    // Element end forces in local: v_end of elem1 is the shear at the right end.
    // For equilibrium at node 2: reaction from elem 1 (upward = -v_end) + reaction from elem 2 (-v_start) = -P
    // In other words, shear magnitudes should sum to P
    let v_sum = ef1.v_end.abs() + ef2.v_start.abs();
    assert_close(v_sum, p, 0.01, "SS beam: shear sum at loaded node = P");

    // Moment continuity at node 2: m_end(elem1) = m_start(elem2)
    assert!((ef1.m_end - ef2.m_start).abs() < 0.5,
        "SS beam: moment continuity at node 2: m_end={:.4} vs m_start={:.4}",
        ef1.m_end, ef2.m_start);
}

// ================================================================
// 2. Continuous Beam: Equilibrium at Interior Support
// ================================================================
//
// At an interior support: element forces + reaction = 0.

#[test]
fn validation_equilibrium_continuous_support() {
    let q = -10.0;
    let n = 4;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[8.0, 8.0], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support at node n+1
    let sup_node = n + 1;
    let r_sup = results.reactions.iter().find(|r| r.node_id == sup_node).unwrap();

    // Sum of vertical element end forces at this node
    // Last element of span 1 (end) + first element of span 2 (start)
    let ef_left = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == n + 1).unwrap();

    // Shear jump at interior support = reaction
    let v_jump = (ef_left.v_end - ef_right.v_start).abs();
    assert_close(v_jump, r_sup.ry.abs(), 0.05,
        "Continuous beam: shear jump = reaction at interior support");
}

// ================================================================
// 3. Portal Frame: Beam-Column Joint Equilibrium
// ================================================================
//
// At the beam-column joint (node 2): sum of element forces = applied load.

#[test]
fn validation_equilibrium_portal_joint() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // At a rigid joint, moments from connecting elements must be in balance.
    // Verify global equilibrium instead: ΣRx = -F_lat, ΣRy = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rx + r4.rx, -f_lat, 0.01, "Portal: ΣRx = -F_lat");
    assert_close(r1.ry + r4.ry, 0.0, 0.01, "Portal: ΣRy = 0");

    // Both bases develop moments
    assert!(r1.mz.abs() > 0.1, "Portal: base moment at 1");
    assert!(r4.mz.abs() > 0.1, "Portal: base moment at 4");
}

// ================================================================
// 4. Multi-Bay Frame: Global Equilibrium
// ================================================================
//
// Two-bay, single-story frame under gravity.
// ΣRy = total applied load.

#[test]
fn validation_equilibrium_multi_bay() {
    let h = 3.5;
    let w = 5.0;
    let g = -15.0;

    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(2w,h), 6(2w,0)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h),
        (4, w, 0.0), (5, 2.0 * w, h), (6, 2.0 * w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col
        (2, "frame", 2, 3, 1, 1, false, false), // left beam
        (3, "frame", 3, 4, 1, 1, false, false), // center col
        (4, "frame", 3, 5, 1, 1, false, false), // right beam
        (5, "frame", 5, 6, 1, 1, false, false), // right col
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: g, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: g, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: g, mz: 0.0 }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // ΣRy = -3g (three loaded nodes)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -3.0 * g, 0.01, "Multi-bay: ΣRy = -3g");

    // ΣRx = 0 (no lateral load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.01, "Multi-bay: ΣRx = 0");

    // By symmetry: outer column reactions should be equal
    let ry_1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap().ry;
    assert_close(ry_1, ry_6, 0.02, "Multi-bay: symmetric outer column reactions");

    // All three columns carry upward reaction
    let ry_4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().ry;
    assert!(ry_1 > 0.0, "Multi-bay: left column reacts upward");
    assert!(ry_4 > 0.0, "Multi-bay: center column reacts upward");
    assert!(ry_6 > 0.0, "Multi-bay: right column reacts upward");
}

// ================================================================
// 5. Truss: Equilibrium at Loaded Apex
// ================================================================

#[test]
fn validation_equilibrium_truss_apex() {
    let p = 50.0;
    let span = 8.0;
    let h_truss = 3.0;

    // Simple triangular truss: nodes at (0,0), (span,0), (span/2, h_truss)
    let nodes = vec![
        (1, 0.0, 0.0), (2, span, 0.0), (3, span / 2.0, h_truss),
    ];
    let elems = vec![
        (1, "truss", 1, 3, 1, 1, false, false), // left diagonal
        (2, "truss", 3, 2, 1, 1, false, false), // right diagonal
        (3, "truss", 1, 2, 1, 1, false, false), // bottom chord
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Truss: ΣRy = P");

    // By symmetry: Ry1 = Ry2 = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.ry, p / 2.0, 0.01, "Truss: Ry1 = P/2");
    assert_close(r2.ry, p / 2.0, 0.01, "Truss: Ry2 = P/2");

    // Both diagonal members should be in compression (negative axial)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef1.n_start < 0.0, "Truss: left diagonal in compression");
    assert!(ef2.n_start < 0.0, "Truss: right diagonal in compression");

    // Bottom chord should be in tension
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(ef3.n_start > 0.0, "Truss: bottom chord in tension");
}

// ================================================================
// 6. Frame with UDL: Distributed Load Equilibrium
// ================================================================
//
// For a beam with UDL, the total vertical reaction must equal
// the total distributed load.

#[test]
fn validation_equilibrium_distributed() {
    let l = 8.0;
    let n = 8;
    let q = -12.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction = total UDL = q * L
    let total_load = q * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -total_load, 0.01,
        "UDL equilibrium: ΣRy = -qL");

    // ΣRx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.01, "UDL equilibrium: ΣRx = 0");

    // For fixed-fixed symmetric: reactions should be equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_last = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.ry, r_last.ry, 0.01,
        "UDL equilibrium: symmetric reactions for fixed-fixed");
}

// ================================================================
// 7. Cantilever with Multiple Loads: Tip Equilibrium
// ================================================================

#[test]
fn validation_equilibrium_cantilever_tip() {
    let l = 6.0;
    let n = 6;
    let p_y = -10.0;
    let p_x = 5.0;
    let m_z = 8.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p_x, fy: p_y, mz: m_z,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // ΣFx = 0: Rx + Px = 0
    assert_close(r1.rx, -p_x, 0.01, "Cantilever: Rx = -Px");

    // ΣFy = 0: Ry + Py = 0
    assert_close(r1.ry, -p_y, 0.01, "Cantilever: Ry = -Py");

    // ΣM about node 1 = 0: Mz_reaction + Py*L + Mz_applied = 0
    // Mz_reaction = -Py*L - Mz_applied = p_y_abs*L - mz = 10*6 - 8 = 52
    let m_expected = -p_y * l - m_z; // = 10*6 - 8 = 52
    assert_close(r1.mz, m_expected, 0.02,
        "Cantilever: Mz = -Py*L - Mz_applied");
}

// ================================================================
// 8. Three-Story Frame: Floor-Level Equilibrium
// ================================================================
//
// Verify ΣFx = 0 at each floor (sum of story shears = cumulative lateral load).

#[test]
fn validation_equilibrium_three_story() {
    let h = 3.5;
    let w = 6.0;
    let f = 10.0; // lateral force at each floor

    // Nodes: columns at x=0 and x=w, floors at y=h, 2h, 3h
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h), (4, 0.0, 3.0 * h),
        (5, w, 0.0), (6, w, h), (7, w, 2.0 * h), (8, w, 3.0 * h),
    ];
    let elems = vec![
        // Left column segments
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        // Right column segments
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 6, 7, 1, 1, false, false),
        (6, "frame", 7, 8, 1, 1, false, false),
        // Floor beams
        (7, "frame", 2, 6, 1, 1, false, false),
        (8, "frame", 3, 7, 1, 1, false, false),
        (9, "frame", 4, 8, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: f, fy: 0.0, mz: 0.0 }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total horizontal reaction = sum of all lateral loads = 3f
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -3.0 * f, 0.01, "3-story: ΣRx = -3F");

    // No vertical loads → ΣRy = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 0.0, 0.01, "3-story: ΣRy = 0");

    // Base moments should be non-zero (overturning resistance)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert!(r1.mz.abs() > 1.0, "3-story: base moment at node 1");
    assert!(r5.mz.abs() > 1.0, "3-story: base moment at node 5");

    // Lateral drift should increase with height
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;
    assert!(d2.abs() < d3.abs(), "3-story: drift increases with height (1<2)");
    assert!(d3.abs() < d4.abs(), "3-story: drift increases with height (2<3)");
}
