/// Validation: Deformation Compatibility Checks — Extended
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 2–3
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 3–4
///   - Ghali & Neville, "Structural Analysis", Ch. 2 (compatibility conditions)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4–6
///   - Gere & Timoshenko, "Mechanics of Materials", 4th Ed., Ch. 9
///
/// These tests extend the basic compatibility checks with more complex
/// topologies and loading patterns. The direct stiffness method guarantees
/// displacement compatibility at shared nodes. These tests verify that
/// property in configurations not covered by the base test suite.
///
/// Tests:
///   1. Multi-element cantilever: tip deflection matches beam theory
///   2. Asymmetric L-frame: corner node compatibility under combined loads
///   3. K-brace joint: five members at different angles sharing a hub node
///   4. Propped cantilever: deflection at prop equals zero, free end deflects
///   5. Applied moment at shared node: rotation continuity under pure moment
///   6. Trapezoidal load: displacement continuity under non-uniform loading
///   7. Two-bay portal frame: interior column node compatibility
///   8. Overhanging beam: compatibility at interior support with cantilever tip
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Multi-Element Cantilever: Tip Deflection Matches Beam Theory
// ================================================================
//
// A cantilever beam divided into 10 equal elements with a point load
// at the tip. Compatibility at every interior node is enforced by
// the assembly process. We verify that the tip deflection and the
// deflection at each interior node match Euler-Bernoulli theory.
//
// Analytical deflection for cantilever with tip load P at distance x
// from the fixed end:
//   v(x) = P*x^2/(6*E*I) * (3*L - x)
//
// Ref: Gere & Timoshenko, §9.3 — cantilever deflection curves.

#[test]
fn validation_cantilever_chain_displacement_continuity() {
    let n = 10;
    let l = 6.0;
    let p = 25.0;
    let e_eff: f64 = E * 1000.0;
    let elem_len = l / n as f64;

    // Build cantilever: fixed at node 1, free at node n+1, tip load at node n+1
    let input = make_beam(
        n, l, E, A, IZ,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Fixed end (node 1) must have zero displacement
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.uy.abs() < 1e-8,
        "Cantilever fixed end: uy should be 0, got {:.2e}", d1.uy);
    assert!(d1.rz.abs() < 1e-8,
        "Cantilever fixed end: rz should be 0, got {:.2e}", d1.rz);

    // Check deflection at every interior node and at the tip
    for i in 1..=n {
        let node_id = i + 1;
        let x: f64 = i as f64 * elem_len;

        let d = results.displacements.iter()
            .find(|d| d.node_id == node_id)
            .unwrap_or_else(|| panic!("Missing displacement for node {}", node_id));

        // v(x) = P*x^2/(6EI) * (3L - x)
        let v_analytical = p * x.powi(2) / (6.0 * e_eff * IZ) * (3.0 * l - x);

        let tol = 0.02;
        let diff = (d.uy.abs() - v_analytical).abs();
        let denom = v_analytical.max(1e-10);
        assert!(
            diff / denom < tol || diff < 1e-10,
            "Node {}: |uy|={:.8}, expected={:.8}, rel_err={:.4}%",
            node_id, d.uy.abs(), v_analytical, diff / denom * 100.0
        );
    }

    // Tip deflection: PL^3/(3EI)
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_tip = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_tip, 0.02,
        "Cantilever tip: delta = PL^3/(3EI)");
}

// ================================================================
// 2. Asymmetric L-Frame: Corner Compatibility Under Combined Loads
// ================================================================
//
// An L-shaped frame: horizontal member (nodes 1-2) and vertical
// member (nodes 2-3). Fixed at nodes 1 and 3. Apply both a vertical
// load and a horizontal load at the corner (node 2). Compatibility
// requires that the single set of DOFs at node 2 satisfies both
// members simultaneously. Verify that the corner displaces
// consistently and that moment equilibrium holds at the corner.
//
// Ref: McGuire et al., Ch. 4 — rigid joint assembly under combined loads.

#[test]
fn validation_asymmetric_l_frame_corner_compatibility() {
    let lh = 5.0; // horizontal member length
    let lv = 3.0; // vertical member length
    let fx = 15.0;
    let fy = -20.0;

    // L-frame: node 1 (0,0) fixed, node 2 (lh,0) corner, node 3 (lh,lv) fixed
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, lh, 0.0), (3, lh, lv)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // horizontal
            (2, "frame", 2, 3, 1, 1, false, false), // vertical
        ],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx, fy, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 should have exactly one displacement entry
    let count_d2 = results.displacements.iter().filter(|d| d.node_id == 2).count();
    assert_eq!(count_d2, 1, "L-frame corner: node 2 must have exactly one displacement entry");

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Corner must deflect (non-zero ux, uy, rz)
    assert!(d2.ux.abs() > 1e-10,
        "L-frame corner: ux should be non-zero, got {:.2e}", d2.ux);
    assert!(d2.uy.abs() > 1e-10,
        "L-frame corner: uy should be non-zero, got {:.2e}", d2.uy);
    assert!(d2.rz.abs() > 1e-10,
        "L-frame corner: rz should be non-zero, got {:.2e}", d2.rz);

    // Both elements at node 2 carry moment (rigid joint transfers moment)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef1.m_end.abs() > 1e-6,
        "L-frame: elem 1 m_end at corner should be non-zero: {:.6}", ef1.m_end);
    assert!(ef2.m_start.abs() > 1e-6,
        "L-frame: elem 2 m_start at corner should be non-zero: {:.6}", ef2.m_start);

    // Global equilibrium: sum of horizontal reactions = -fx, sum of vertical = -fy
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_rx, -fx, 0.02, "L-frame: sum_Rx = -Fx");
    assert_close(sum_ry, -fy, 0.02, "L-frame: sum_Ry = -Fy");
}

// ================================================================
// 3. K-Brace Joint: Five Members Sharing a Hub Node
// ================================================================
//
// A hub node at the center is connected to 5 members radiating at
// different angles. Each member's far end is pinned. A vertical load
// is applied at the hub. All 5 members must share the same DOFs at
// the hub. Verify that the displacement is unique, and that the
// load is distributed among the members based on their stiffness
// and orientation.
//
// Ref: Przemieniecki, §2.3 — shared DOFs at multi-member joints.

#[test]
fn validation_k_brace_five_member_hub_compatibility() {
    let r = 3.0;
    let p = 50.0;

    // Hub at origin (node 1). Five arms at various angles.
    // Use distinct directions to avoid symmetry.
    let angles: Vec<f64> = vec![0.0, 72.0, 144.0, 216.0, 288.0];
    let mut nodes = vec![(1_usize, 0.0, 0.0)];
    for (i, &deg) in angles.iter().enumerate() {
        let rad: f64 = deg * std::f64::consts::PI / 180.0;
        nodes.push((i + 2, r * rad.cos(), r * rad.sin()));
    }

    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..5)
        .map(|i| (i + 1, "frame", 1_usize, i + 2, 1_usize, 1_usize, false, false))
        .collect();

    let sups: Vec<(usize, usize, &str)> = (0..5)
        .map(|i| (i + 1, i + 2, "pinned"))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Hub node 1 must have exactly one displacement entry
    let hub_entries: Vec<_> = results.displacements.iter()
        .filter(|d| d.node_id == 1).collect();
    assert_eq!(hub_entries.len(), 1,
        "K-brace hub: node 1 must have exactly one displacement entry");

    let d_hub = hub_entries[0];

    // Hub must deflect downward under vertical load
    assert!(d_hub.uy < 0.0,
        "K-brace hub: uy should be negative (downward), got {:.8}", d_hub.uy);

    // All five elements must carry axial force (each arm is loaded
    // through the hub's shared DOFs)
    for elem_id in 1..=5 {
        let ef = results.element_forces.iter().find(|e| e.element_id == elem_id).unwrap();
        // At least one of n_start, v_start, m_start should be non-zero
        let has_force = ef.n_start.abs() > 1e-8 || ef.v_start.abs() > 1e-8
            || ef.m_start.abs() > 1e-8;
        assert!(has_force,
            "K-brace: element {} must carry some force from hub", elem_id);
    }

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "K-brace hub: sum_Ry = P");
}

// ================================================================
// 4. Propped Cantilever: Deflection at Prop Is Zero
// ================================================================
//
// A propped cantilever beam: fixed at the left end, roller support
// at the right end (prop). Under uniform load, the roller constrains
// uy=0 at the right end, while the fixed end constrains all DOFs.
// The maximum deflection occurs inside the span. Verify:
// - uy=0 at both supports
// - rz=0 at fixed end, rz!=0 at roller
// - maximum deflection location and magnitude match theory
//
// For propped cantilever with UDL q:
//   R_roller = 3qL/8, delta_max = qL^4/(185*EI) at x = 0.4215*L (approx)
//
// Ref: Hibbeler, "Structural Analysis", Table B-2.

#[test]
fn validation_propped_cantilever_compatibility() {
    let n = 16;
    let l = 8.0;
    let q = 10.0;
    let e_eff: f64 = E * 1000.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1_usize, 1_usize, false, false))
        .collect();
    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "rollerX")];

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed end (node 1): uy=0, rz=0
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.uy.abs() < 1e-8, "Propped: fixed end uy=0, got {:.2e}", d1.uy);
    assert!(d1.rz.abs() < 1e-8, "Propped: fixed end rz=0, got {:.2e}", d1.rz);

    // Roller end (node n_nodes): uy=0, but rz!=0
    let d_end = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(d_end.uy.abs() < 1e-8, "Propped: roller end uy=0, got {:.2e}", d_end.uy);
    assert!(d_end.rz.abs() > 1e-10, "Propped: roller end rz should be non-zero, got {:.2e}", d_end.rz);

    // Maximum deflection: qL^4/(185*EI) approximately, at x ~ 0.4215*L
    // Use exact formula: delta_max = qL^4/(185*EI) (common approximation)
    let delta_max_approx = q * l.powi(4) / (185.0 * e_eff * IZ);

    // Find the node with maximum |uy|
    let max_disp = results.displacements.iter()
        .max_by(|a, b| a.uy.abs().partial_cmp(&b.uy.abs()).unwrap())
        .unwrap();
    assert_close(max_disp.uy.abs(), delta_max_approx, 0.05,
        "Propped cantilever: max deflection ~ qL^4/(185EI)");

    // Verify reaction at roller: R = 3qL/8
    let r_roller = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    let r_expected = 3.0 * q * l / 8.0;
    assert_close(r_roller.ry, r_expected, 0.02,
        "Propped cantilever: roller reaction = 3qL/8");
}

// ================================================================
// 5. Applied Moment at Shared Node: Rotation Continuity
// ================================================================
//
// A two-element simply-supported beam with a concentrated moment
// applied at the shared interior node. The rotation must be
// continuous at that node (no hinge), and the analytical solution
// is known.
//
// SS beam with moment M0 at point a from left end:
//   theta(a) = M0*(2a-L)*(a-L) / (6*L*E*I)  ... left side slope at load point
// For midspan (a = L/2):
//   theta_left = M0*L/(16*E*I) (checking slope magnitude)
//
// Ref: Gere & Timoshenko, §9.5 — beam with applied moment.

#[test]
fn validation_moment_load_rotation_continuity() {
    let l = 10.0;
    let m0 = 50.0;
    let e_eff: f64 = E * 1000.0;

    // Two-element SS beam, moment at the shared midspan node (node 2)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: 0.0, mz: m0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 must have exactly one displacement entry (continuity)
    let count_d2 = results.displacements.iter().filter(|d| d.node_id == 2).count();
    assert_eq!(count_d2, 1, "Moment load: node 2 must have exactly one displacement entry");

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Node 2 must have non-zero rotation (moment applied directly)
    assert!(d2.rz.abs() > 1e-10,
        "Moment load: node 2 rz should be non-zero, got {:.2e}", d2.rz);

    // Both elements carry moment through the rigid connection at node 2
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef1.m_end.abs() > 1e-6,
        "Moment load: elem 1 m_end should be non-zero: {:.6}", ef1.m_end);
    assert!(ef2.m_start.abs() > 1e-6,
        "Moment load: elem 2 m_start should be non-zero: {:.6}", ef2.m_start);

    // End rotations: for SS beam with midspan moment M0:
    // theta_left = M0*L/(6EI) * (1 - 3*(L/2)^2/L^2 + 2*(L/2)^3/L^3)
    // Using general formula: theta_A = M0*b*(2L-b)*(L-b) / (6*L^2*EI)
    // where a=L/2, b=L/2
    // theta_A = M0*(L/2)*(2L - L/2)*(L - L/2) / (6*L^2*EI)
    //         = M0*(L/2)*(3L/2)*(L/2) / (6*L^2*EI)
    //         = M0*3L^3/8 / (6*L^2*EI) = M0*L/(16EI)
    let theta_a = m0 * l / (16.0 * e_eff * IZ);
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert_close(d1.rz.abs(), theta_a, 0.05,
        "Moment load: left end slope = M0*L/(16EI)");

    // Equilibrium: sum of vertical reactions = 0 (no vertical load applied)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 1e-6,
        "Moment load: sum_Ry should be ~0 (no vertical load), got {:.6}", sum_ry);
}

// ================================================================
// 6. Trapezoidal Load: Displacement Continuity Under Non-Uniform Load
// ================================================================
//
// A multi-element SS beam with trapezoidal (linearly varying)
// distributed load: q_i != q_j on each element (increasing from
// left to right). Displacement and rotation must be continuous
// at every shared interior node.
//
// We verify continuity by checking that the deflected shape is smooth:
// each interior node's uy lies between its neighbors (monotonic
// behavior in each half of the span).
//
// Ref: Ghali & Neville, §2.3 — compatibility under arbitrary loading.

#[test]
fn validation_trapezoidal_load_displacement_continuity() {
    let n = 8;
    let l = 12.0;
    let q_left = 5.0;
    let q_right = 20.0;
    let elem_len = l / n as f64;
    let n_nodes = n + 1;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1_usize, 1_usize, false, false))
        .collect();
    let sups = vec![(1, 1_usize, "pinned"), (2, n_nodes, "rollerX")];

    // Linearly varying load: q increases from q_left to q_right along span
    let mut loads = Vec::new();
    for i in 0..n {
        let xi_start = i as f64 / n as f64;
        let xi_end = (i + 1) as f64 / n as f64;
        let qi = -(q_left + (q_right - q_left) * xi_start);
        let qj = -(q_left + (q_right - q_left) * xi_end);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Support nodes: uy = 0
    let d_start = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(d_start.uy.abs() < 1e-8,
        "Trapezoidal: left support uy=0, got {:.2e}", d_start.uy);
    assert!(d_end.uy.abs() < 1e-8,
        "Trapezoidal: right support uy=0, got {:.2e}", d_end.uy);

    // All interior nodes must deflect downward (negative uy for downward load)
    for i in 1..n {
        let node_id = i + 1;
        let d = results.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        assert!(d.uy < 0.0,
            "Trapezoidal: interior node {} should have negative uy, got {:.8}",
            node_id, d.uy);
    }

    // Verify continuity: the deflection curve should be smooth.
    // Check that no interior node's deflection "jumps" by comparing
    // differences between adjacent nodes. The second difference should
    // be bounded (no sharp discontinuities).
    let uy_values: Vec<f64> = (1..=n_nodes)
        .map(|nid| results.displacements.iter().find(|d| d.node_id == nid).unwrap().uy)
        .collect();
    for i in 1..(n_nodes - 1) {
        let second_diff = (uy_values[i + 1] - 2.0 * uy_values[i] + uy_values[i - 1]).abs();
        let max_uy = uy_values.iter().map(|v| v.abs()).fold(0.0_f64, f64::max);
        // Second difference should be a small fraction of the max deflection
        assert!(second_diff < 0.5 * max_uy,
            "Trapezoidal: discontinuity at node {}: second_diff={:.2e}, max_uy={:.2e}",
            i + 1, second_diff, max_uy);
    }

    // Equilibrium: total load = average intensity * span
    let total_load = (q_left + q_right) / 2.0 * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Trapezoidal: sum_Ry = average_q * L");
}

// ================================================================
// 7. Two-Bay Portal Frame: Interior Column Compatibility
// ================================================================
//
// A two-bay portal frame has three columns and two beams. The interior
// column connects to both beams at the top. At the interior column's
// top node, three elements meet (left beam, right beam, interior column).
// Compatibility requires all three share the same DOFs.
//
// Layout:
//   Node 1 (0,0) -- fixed       Node 4 (w,0) -- fixed       Node 6 (2w,0) -- fixed
//   Node 2 (0,h) -- col top     Node 3 (w,h) -- interior    Node 5 (2w,h) -- col top
//   Beam: 2--3, Beam: 3--5
//   Columns: 1--2, 4--3, 6--5
//
// Ref: McGuire et al., Ch. 5 — multi-bay frames.

#[test]
fn validation_two_bay_portal_interior_column_compatibility() {
    let h = 4.0;
    let w = 5.0;
    let f_lat = 30.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),    // left base
            (2, 0.0, h),      // left top
            (3, w, h),        // interior top
            (4, w, 0.0),      // interior base
            (5, 2.0 * w, h),  // right top
            (6, 2.0 * w, 0.0),// right base
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column
            (2, "frame", 2, 3, 1, 1, false, false), // left beam
            (3, "frame", 4, 3, 1, 1, false, false), // interior column
            (4, "frame", 3, 5, 1, 1, false, false), // right beam
            (5, "frame", 6, 5, 1, 1, false, false), // right column
        ],
        vec![
            (1, 1, "fixed"),
            (2, 4, "fixed"),
            (3, 6, "fixed"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Interior node 3: three elements meet here. Verify unique DOFs.
    let d3_entries: Vec<_> = results.displacements.iter()
        .filter(|d| d.node_id == 3).collect();
    assert_eq!(d3_entries.len(), 1,
        "Two-bay: interior node 3 must have exactly one displacement entry");

    let d3 = d3_entries[0];

    // Interior node must have non-zero rotation (moments transfer from beams to column)
    assert!(d3.rz.abs() > 1e-10,
        "Two-bay: interior node rz must be non-zero, got {:.2e}", d3.rz);

    // All three elements at node 3 carry moment
    // Element 2 (left beam, end at node 3): m_end
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef2.m_end.abs() > 1e-6,
        "Two-bay: left beam m_end at node 3 should be non-zero: {:.6}", ef2.m_end);

    // Element 3 (interior column, end at node 3): m_end
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(ef3.m_end.abs() > 1e-6,
        "Two-bay: interior column m_end at node 3 should be non-zero: {:.6}", ef3.m_end);

    // Element 4 (right beam, start at node 3): m_start
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert!(ef4.m_start.abs() > 1e-6,
        "Two-bay: right beam m_start at node 3 should be non-zero: {:.6}", ef4.m_start);

    // Top nodes should sway in the direction of the applied load
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    assert!(d2.ux > 0.0, "Two-bay: node 2 sways in load direction");
    assert!(d3.ux > 0.0, "Two-bay: node 3 sways in load direction");
    assert!(d5.ux > 0.0, "Two-bay: node 5 sways in load direction");

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_lat, 0.02, "Two-bay portal: sum_Rx = -F_lateral");
}

// ================================================================
// 8. Overhanging Beam: Compatibility at Interior Support
// ================================================================
//
// A beam with an overhang: nodes 1-2-3 along X. Pinned at node 1,
// roller at node 2 (interior), free at node 3 (overhang tip).
// A point load at the overhang tip (node 3) causes the beam to
// deflect upward between nodes 1 and 2, and downward at the tip.
// At the interior support (node 2), uy=0 is enforced. The rotation
// at node 2 must be continuous across both beam segments.
//
// Analytical: For overhang tip load P at distance a from interior
// support (span L between supports):
//   R_interior = P*(L+a)/L  (upward)
//   R_left = -P*a/L          (downward)
//   delta_tip = P*a^2*(L+a)/(3*E*I)
//
// Ref: Hibbeler, "Structural Analysis", Ch. 4 — overhanging beams.

#[test]
fn validation_overhanging_beam_compatibility() {
    let l = 8.0;  // span between supports
    let a = 3.0;  // overhang length
    let p = 20.0;
    let e_eff: f64 = E * 1000.0;
    let n_span = 8; // elements in main span
    let n_over = 3; // elements in overhang
    let n_total = n_span + n_over;
    let n_nodes = n_total + 1;

    let elem_len_span = l / n_span as f64;
    let elem_len_over = a / n_over as f64;

    let mut nodes: Vec<(usize, f64, f64)> = Vec::new();
    for i in 0..=n_span {
        nodes.push((i + 1, i as f64 * elem_len_span, 0.0));
    }
    for i in 1..=n_over {
        nodes.push((n_span + 1 + i, l + i as f64 * elem_len_over, 0.0));
    }

    let elems: Vec<_> = (0..n_total)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1_usize, 1_usize, false, false))
        .collect();

    // Pinned at node 1, roller at node n_span+1 (interior support)
    let interior_sup_node = n_span + 1;
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, interior_sup_node, "rollerX"),
    ];

    // Point load at overhang tip (node n_nodes)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support (node n_span+1): uy must be zero
    let d_int = results.displacements.iter()
        .find(|d| d.node_id == interior_sup_node).unwrap();
    assert!(d_int.uy.abs() < 1e-8,
        "Overhang: interior support uy=0, got {:.2e}", d_int.uy);

    // Left support (node 1): uy must be zero
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.uy.abs() < 1e-8,
        "Overhang: left support uy=0, got {:.2e}", d1.uy);

    // Interior support rotation must be non-zero (roller allows rotation)
    assert!(d_int.rz.abs() > 1e-10,
        "Overhang: interior support rz should be non-zero, got {:.2e}", d_int.rz);

    // Overhang tip (node n_nodes) deflects downward
    let d_tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(d_tip.uy < 0.0,
        "Overhang: tip should deflect downward, got uy={:.8}", d_tip.uy);

    // Analytical tip deflection: P*a^2*(L+a)/(3*E*I)
    let delta_tip_analytical = p * a.powi(2) * (l + a) / (3.0 * e_eff * IZ);
    assert_close(d_tip.uy.abs(), delta_tip_analytical, 0.05,
        "Overhang: tip deflection = P*a^2*(L+a)/(3EI)");

    // Reactions: R_interior = P*(L+a)/L, R_left = -P*a/L
    let r_int = results.reactions.iter().find(|r| r.node_id == interior_sup_node).unwrap();
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_int_expected = p * (l + a) / l;
    let r_left_expected = -p * a / l;
    assert_close(r_int.ry, r_int_expected, 0.02,
        "Overhang: interior reaction = P*(L+a)/L");
    assert_close(r_left.ry, r_left_expected, 0.02,
        "Overhang: left reaction = -P*a/L");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Overhang: sum_Ry = P");
}
