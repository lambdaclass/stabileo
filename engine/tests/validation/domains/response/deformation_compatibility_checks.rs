/// Validation: Deformation Compatibility Checks
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 2
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 3
///   - Ghali & Neville, "Structural Analysis", Ch. 2 (compatibility conditions)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 6 (internal hinges)
///
/// The direct stiffness method guarantees deformation compatibility at shared
/// nodes: displacements and rotations are continuous (no jumps) unless an
/// internal hinge explicitly releases the rotational DOF.
///
/// Tests:
///   1. Multi-element beam: rotation continuous at shared nodes
///   2. Multi-element beam: displacement continuous at shared nodes
///   3. Portal frame corner compatibility
///   4. T-junction rotation compatibility
///   5. Hinge allows rotation discontinuity (moment zero at hinge)
///   6. Fixed support: zero displacement at both ends
///   7. Pinned support: zero translation but nonzero rotation
///   8. Axial compatibility in portal frame
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Multi-Element Beam: Rotation Continuous at Shared Nodes
// ================================================================
//
// An 8-element simply-supported beam under UDL. Every interior node
// is shared by two adjacent elements. Since there are no hinges, the
// FEM assembly guarantees a single rz DOF per node. We verify that
// the rotation field is smooth and continuous by checking that each
// interior node's rz matches the analytical Euler-Bernoulli slope.
//
// Analytical slope for SS beam with UDL q over span L:
//   theta(x) = q/(24*E*I) * (L^3 - 6*L*x^2 + 4*x^3)
//
// Ref: Przemieniecki, §2.3 — shared DOFs enforce compatibility.

#[test]
fn validation_rotation_continuous_multi_element_beam() {
    let n = 8;
    let l = 10.0;
    let q = 12.0; // downward UDL (positive q_i, q_j in load convention means downward)
    let e_eff = E * 1000.0; // E is in MPa, multiply by 1000 for consistent units

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;

    // Check rotation continuity at every interior node (nodes 2..n).
    // The solver returns one rz per node — continuity is built-in.
    // We verify the rotation varies smoothly and matches beam theory.
    for i in 1..n {
        let node_id = i + 1;
        let x = i as f64 * elem_len;

        let d = results.displacements.iter()
            .find(|d| d.node_id == node_id)
            .unwrap_or_else(|| panic!("Missing displacement for node {}", node_id));

        // Analytical slope: theta = q/(24EI) * (L^3 - 6Lx^2 + 4x^3)
        // For downward load (negative in solver), the rotation sign flips.
        // Compare magnitudes for continuity verification.
        let theta_analytical = q / (24.0 * e_eff * IZ)
            * (l.powi(3) - 6.0 * l * x.powi(2) + 4.0 * x.powi(3));

        let tol = 0.02;
        let diff = (d.rz.abs() - theta_analytical.abs()).abs();
        let denom = theta_analytical.abs().max(1e-6);
        assert!(
            diff / denom < tol || diff < 1e-8,
            "Node {}: |rz|={:.8}, expected |theta|={:.8}, rel_err={:.4}%",
            node_id, d.rz.abs(), theta_analytical.abs(), diff / denom * 100.0
        );
    }
}

// ================================================================
// 2. Multi-Element Beam: Displacement Continuous at Shared Nodes
// ================================================================
//
// Same 8-element SS beam with UDL. Verify uy is continuous and
// matches the analytical deflection at every shared interior node.
//
// Analytical deflection for SS beam with UDL q over span L:
//   v(x) = q*x/(24*E*I) * (L^3 - 2*L*x^2 + x^3)
//
// Ref: Timoshenko & Young, "Theory of Structures", Ch. 1.

#[test]
fn validation_displacement_continuous_multi_element_beam() {
    let n = 8;
    let l = 10.0;
    let q = 12.0;
    let e_eff = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;

    for i in 1..n {
        let node_id = i + 1;
        let x = i as f64 * elem_len;

        let d = results.displacements.iter()
            .find(|d| d.node_id == node_id)
            .unwrap_or_else(|| panic!("Missing displacement for node {}", node_id));

        // Analytical deflection (positive downward in formula, solver gives negative uy for downward)
        let v_analytical = q * x / (24.0 * e_eff * IZ)
            * (l.powi(3) - 2.0 * l * x.powi(2) + x.powi(3));

        // Solver convention: downward load gives negative uy
        let uy_magnitude = d.uy.abs();
        let v_magnitude = v_analytical.abs();

        let tol = 0.02;
        let diff = (uy_magnitude - v_magnitude).abs();
        let denom = v_magnitude.max(1e-10);
        assert!(
            diff / denom < tol || diff < 1e-10,
            "Node {}: |uy|={:.8}, expected={:.8}, rel_err={:.4}%",
            node_id, uy_magnitude, v_magnitude, diff / denom * 100.0
        );
    }
}

// ================================================================
// 3. Portal Frame Corner Compatibility
// ================================================================
//
// Portal frame with lateral load at node 2. At the corner nodes
// (nodes 2 and 3), the column top and beam end share the same node.
// Compatibility demands that ux, uy, and rz are identical for all
// elements meeting at that node. Since the FEM uses a single DOF
// per node, we verify that the displacement is physically consistent:
// both corners sway together (beam is axially rigid compared to columns).
//
// Ref: Ghali & Neville, §7.2 — rigid joint compatibility.

#[test]
fn validation_portal_frame_corner_compatibility() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 = top of left column / left end of beam
    // Node 3 = right end of beam / top of right column
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // The beam (element 2, nodes 2-3) is horizontal and axially very stiff
    // (EA/L >> EI/L^3). So ux at node 2 and node 3 should be nearly equal.
    let ux_diff = (d2.ux - d3.ux).abs();
    let ux_ref = d2.ux.abs().max(d3.ux.abs()).max(1e-10);
    assert!(
        ux_diff / ux_ref < 0.05,
        "Corner compatibility: ux_2={:.8}, ux_3={:.8} should be nearly equal (diff/ref={:.4})",
        d2.ux, d3.ux, ux_diff / ux_ref
    );

    // Both corners must have non-zero rotation (rigid joints transfer moment)
    assert!(d2.rz.abs() > 1e-10,
        "Corner node 2 must have non-zero rotation, got rz={:.2e}", d2.rz);
    assert!(d3.rz.abs() > 1e-10,
        "Corner node 3 must have non-zero rotation, got rz={:.2e}", d3.rz);

    // The displacement at each corner is unique — verify there is only one
    // displacement entry per node (the FEM guarantees this).
    let count_d2 = results.displacements.iter().filter(|d| d.node_id == 2).count();
    let count_d3 = results.displacements.iter().filter(|d| d.node_id == 3).count();
    assert_eq!(count_d2, 1, "Node 2 should have exactly one displacement entry");
    assert_eq!(count_d3, 1, "Node 3 should have exactly one displacement entry");

    // Equilibrium sanity check
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_lat, 0.01, "Portal corner: sum_Rx = -F_lateral");
}

// ================================================================
// 4. T-Junction Rotation Compatibility
// ================================================================
//
// T-shaped frame: horizontal beam (nodes 1-2-3) + vertical member
// (node 2-4). Three elements meet at node 2. Since all connections
// are rigid, there is a single rz DOF at node 2. All three elements
// share the same rotation there. Apply a horizontal force at node 4
// (top of post) and verify that node 2 has a unique, non-zero rotation
// and that all elements connecting at node 2 experience moment transfer.
//
// Ref: McGuire et al., §3.2 — rigid joint, single rotational DOF.

#[test]
fn validation_t_junction_rotation_compatibility() {
    let l = 6.0;
    let h = 4.0;
    let p = 15.0;

    // Node layout:
    //   1 ---- 2 ---- 3  (horizontal beam, pinned at 1, rollerX at 3)
    //          |
    //          4          (vertical post, free tip)
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, l, 0.0),
            (3, 2.0 * l, 0.0),
            (4, l, h),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left beam segment
            (2, "frame", 2, 3, 1, 1, false, false), // right beam segment
            (3, "frame", 2, 4, 1, 1, false, false), // vertical post
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: p, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 has exactly one displacement entry (one set of DOFs)
    let d2_entries: Vec<_> = results.displacements.iter()
        .filter(|d| d.node_id == 2).collect();
    assert_eq!(d2_entries.len(), 1,
        "T-junction: node 2 must have exactly one displacement entry");

    let d2 = d2_entries[0];

    // The rotation at node 2 must be non-zero (moment is transferred
    // through the rigid joint from the post to the beam)
    assert!(d2.rz.abs() > 1e-10,
        "T-junction: node 2 rz must be non-zero, got {:.2e}", d2.rz);

    // All three elements meeting at node 2 must carry moment.
    // Element 1 end (node_j = 2) should have non-zero m_end.
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef1.m_end.abs() > 1e-6,
        "T-junction: elem 1 m_end at node 2 should be non-zero: {:.6}", ef1.m_end);

    // Element 2 start (node_i = 2) should have non-zero m_start.
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef2.m_start.abs() > 1e-6,
        "T-junction: elem 2 m_start at node 2 should be non-zero: {:.6}", ef2.m_start);

    // Element 3 start (node_i = 2) should have non-zero m_start.
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(ef3.m_start.abs() > 1e-6,
        "T-junction: elem 3 m_start at node 2 should be non-zero: {:.6}", ef3.m_start);

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "T-junction: sum_Rx = -P");
}

// ================================================================
// 5. Hinge Allows Rotation Discontinuity
// ================================================================
//
// 2-element beam with hinge at the shared node. The solver reports
// a single displacement per node (no discontinuity in the displacement
// output), but the hinge releases the rotational DOF so the moment
// must be zero at the hinge location in both elements.
//
// Fixed at left, rollerX at right, hinge at midspan node.
// Ref: Hibbeler, §6.6 — internal hinges allow rotation discontinuity.

#[test]
fn validation_hinge_allows_rotation_discontinuity() {
    let l = 8.0;
    let q = 10.0;

    // Two elements with hinge at shared node 2:
    // Element 1: hinge_end = true (releases rz at node 2, j-end)
    // Element 2: hinge_start = true (releases rz at node 2, i-end)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),  // hinge at j-end
            (2, "frame", 2, 3, 1, 1, true, false),   // hinge at i-end
        ],
        vec![(1, 1, "fixed"), (2, 3, "rollerX")],
        vec![
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 1, q_i: -q, q_j: -q, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 2, q_i: -q, q_j: -q, a: None, b: None,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // The moment at the hinge (node 2) must be zero in both elements.
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    assert!(ef1.m_end.abs() < 0.5,
        "Hinge: elem 1 m_end should be ~0 at hinge, got {:.6}", ef1.m_end);
    assert!(ef2.m_start.abs() < 0.5,
        "Hinge: elem 2 m_start should be ~0 at hinge, got {:.6}", ef2.m_start);

    // The solver still reports a single uy and rz at node 2.
    // The node displacement is well-defined even though rotations differ
    // on each side of the hinge (the solver resolves this internally).
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.uy.abs() > 1e-10,
        "Hinge node should have non-zero vertical displacement");

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * l, 0.02, "Hinge beam: sum_Ry = qL");
}

// ================================================================
// 6. Fixed Support: Zero Displacement at Both Ends
// ================================================================
//
// Fixed-fixed beam under UDL. At both fixed supports, all three DOFs
// (ux, uy, rz) must be exactly zero — the boundary conditions enforce
// full compatibility with the rigid wall.
//
// Ref: any structural analysis text — fixed support constrains all DOFs.

#[test]
fn validation_fixed_support_zero_displacement() {
    let n = 6;
    let l = 8.0;
    let q = 15.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "fixed")];

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Node 1 (left fixed support): ux=uy=rz=0
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.ux.abs() < 1e-8,
        "Fixed left: ux should be 0, got {:.2e}", d1.ux);
    assert!(d1.uy.abs() < 1e-8,
        "Fixed left: uy should be 0, got {:.2e}", d1.uy);
    assert!(d1.rz.abs() < 1e-8,
        "Fixed left: rz should be 0, got {:.2e}", d1.rz);

    // Node n_nodes (right fixed support): ux=uy=rz=0
    let d_end = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(d_end.ux.abs() < 1e-8,
        "Fixed right: ux should be 0, got {:.2e}", d_end.ux);
    assert!(d_end.uy.abs() < 1e-8,
        "Fixed right: uy should be 0, got {:.2e}", d_end.uy);
    assert!(d_end.rz.abs() < 1e-8,
        "Fixed right: rz should be 0, got {:.2e}", d_end.rz);

    // Interior nodes should have non-zero uy (beam deflects under load)
    let d_mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert!(d_mid.uy.abs() > 1e-10,
        "Fixed-fixed beam: midspan should deflect, got uy={:.2e}", d_mid.uy);
}

// ================================================================
// 7. Pinned Support: Zero Translation but Nonzero Rotation
// ================================================================
//
// Simply-supported beam (pinned at left, rollerX at right) with UDL.
// At the pinned support: ux=uy=0 but rz != 0 (the support allows rotation).
// At the roller: uy=0 but rz != 0.
// This is a key compatibility check: translation is constrained,
// rotation is free.
//
// Analytical end slope for SS beam with UDL:
//   theta_end = qL^3 / (24EI)
//
// Ref: Timoshenko & Young, "Theory of Structures", beam tables.

#[test]
fn validation_pinned_support_zero_translation_nonzero_rotation() {
    let n = 8;
    let l = 10.0;
    let q = 12.0;
    let e_eff = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let n_nodes = n + 1;

    // Node 1 (pinned): ux = 0, uy = 0
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.ux.abs() < 1e-8,
        "Pinned left: ux should be 0, got {:.2e}", d1.ux);
    assert!(d1.uy.abs() < 1e-8,
        "Pinned left: uy should be 0, got {:.2e}", d1.uy);

    // Node 1 rotation should be non-zero
    // Analytical: theta_left = +qL^3/(24EI) for downward load
    let theta_analytical = q * l.powi(3) / (24.0 * e_eff * IZ);
    assert!(d1.rz.abs() > 1e-10,
        "Pinned left: rz should be non-zero, got {:.2e}", d1.rz);
    assert_close(d1.rz.abs(), theta_analytical, 0.02,
        "Pinned left: rz matches beam theory");

    // Node n_nodes (rollerX): uy = 0, but rz != 0
    let d_end = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(d_end.uy.abs() < 1e-8,
        "Roller right: uy should be 0, got {:.2e}", d_end.uy);
    assert!(d_end.rz.abs() > 1e-10,
        "Roller right: rz should be non-zero, got {:.2e}", d_end.rz);

    // By symmetry of SS beam with symmetric UDL, end slopes are equal in magnitude
    assert_close(d1.rz.abs(), d_end.rz.abs(), 0.01,
        "SS beam symmetric UDL: |rz_left| = |rz_right|");
}

// ================================================================
// 8. Axial Compatibility in Portal Frame
// ================================================================
//
// Portal frame with gravity load at nodes 2 and 3. The beam connects
// nodes 2 and 3 horizontally. The columns connect nodes 1-2 and 3-4.
// Compatibility requires that the vertical displacement at node 2
// (top of left column) equals the vertical displacement at the left
// end of the beam, and similarly for node 3. Since the beam connects
// 2 and 3, the deflection at its ends must equal the column-top
// deflections. Also, the beam deflects between nodes 2 and 3, so
// the midpoint of the beam (if subdivided) would deflect more.
//
// Ref: Ghali & Neville, §7.2 — frame joint compatibility.

#[test]
fn validation_axial_compatibility_portal_frame() {
    let h = 5.0;
    let w = 8.0;
    let p_grav = -30.0; // downward gravity load at each top node

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, p_grav);
    let results = linear::solve_2d(&input).unwrap();

    // Nodes 2 and 3 are the beam-column junctions at the top.
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both top nodes should deflect downward (negative uy) under gravity
    assert!(d2.uy < 0.0,
        "Axial compat: node 2 uy should be negative (downward), got {:.8}", d2.uy);
    assert!(d3.uy < 0.0,
        "Axial compat: node 3 uy should be negative (downward), got {:.8}", d3.uy);

    // By symmetry (equal gravity loads, symmetric geometry), the vertical
    // displacement at nodes 2 and 3 should be equal.
    assert_close(d2.uy, d3.uy, 0.01,
        "Axial compat: uy at node 2 and node 3 should be equal by symmetry");

    // The beam (element 2, nodes 2-3) is horizontal. The vertical displacement
    // at its ends comes from axial shortening of the columns. Since columns
    // are identical and loads are symmetric, the beam should not develop
    // significant bending (no differential settlement).
    //
    // Column axial shortening: delta = P*L/(E_eff*A)
    let e_eff = E * 1000.0;
    let delta_axial = p_grav.abs() * h / (e_eff * A);

    // The vertical displacement at the top should be approximately equal
    // to the column axial shortening (there is also some beam bending
    // contribution, but it's small for equal loads).
    assert_close(d2.uy.abs(), delta_axial, 0.02,
        "Axial compat: uy at top ~ column axial shortening PL/(EA)");

    // The beam's end forces should show consistent behavior:
    // with symmetric loads, the beam should have small or zero shear
    // (no differential vertical movement at ends).
    let ef_beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_beam.v_start.abs() < 1.0,
        "Axial compat: beam shear should be small for symmetric gravity load, got {:.6}",
        ef_beam.v_start);

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p_grav.abs(), 0.01,
        "Axial compat: sum_Ry = 2*P_gravity");
}
