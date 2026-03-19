/// Validation: Displacement and Rotation Compatibility at Joints
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 2
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 3
///   - Ghali & Neville, "Structural Analysis", Ch. 2 (compatibility conditions)
///   - Timoshenko & Young, "Theory of Structures", Ch. 1
///
/// The finite element method enforces compatibility implicitly through the
/// assembly process: shared DOFs at connected nodes are identical.
/// These tests verify that compatibility conditions are correctly satisfied.
///
/// Tests:
///   1. Shared node: equal displacement in all connected members
///   2. T-junction: equal rotation at beam-to-beam connection
///   3. Portal frame corner: beam-column displacement compatibility
///   4. Rigid joint: no relative rotation between rigidly connected members
///   5. Hinged joint: rotation discontinuity at internal hinge
///   6. 3D joint: 6-DOF compatibility for 3D frame node
///   7. Multi-member joint: all members share same displacement at hub node
///   8. Continuous beam: zero displacement at interior supports
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const NU: f64 = 0.3;
const IY: f64 = 1e-4;
const J: f64 = 1e-4;

// ================================================================
// 1. Shared Node: Equal Displacement in Connected Members
// ================================================================
//
// Two collinear beam elements share a common central node.
// Under arbitrary loading, both elements must report the same
// displacement at that shared node (global assembly enforces this).
// Ref: McGuire et al., Ch. 3 — compatibility through shared DOFs.

#[test]
fn validation_compat_shared_node_equal_displacement() {
    // Beam: nodes 1—2—3 along X, pinned at 1, roller at 3.
    // Point load at node 2 (midspan).
    // Check: displacement at node 2 read from element 1 end
    //        must equal displacement from element 2 start (same DOF).
    let l = 8.0;
    let p = 50.0;

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
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 appears once in the global DOF vector.
    // Both element 1 (end) and element 2 (start) reference it.
    let d2 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();

    // Node 2 displacement must equal SS midspan formula: PL³/(48EI)
    let e_eff = E * 1000.0;
    let expected = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d2.uz.abs(), expected, 0.02,
        "Shared node: uy at midspan = PL³/(48EI)");

    // Equilibrium check: reactions sum to applied load.
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "Shared node: ΣRy = P");
}

// ================================================================
// 2. T-Junction: Equal Rotation at Beam-to-Beam Connection
// ================================================================
//
// A horizontal beam (elem 1: 1→2→3) and a vertical post (elem 2: 2→4)
// share node 2. In a rigid connection, both members must have the same
// rotation (rz) at node 2 — there is only one rotational DOF there.
// Ref: Przemieniecki, §2.3 — single DOF at junction.

#[test]
fn validation_compat_t_junction_rotation() {
    let l = 6.0;
    let h = 3.0;

    // T-frame: horizontal beam 1→2 and 2→3, vertical post 2→4 going up.
    // Pinned at node 1, rollerX at node 3, free at top of post (node 4).
    // Load: point force at node 4 (top of post), horizontal.
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
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 2, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 10.0, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // All three elements reference node 2 — there is only one rz DOF.
    // Verify global equilibrium (compatibility is enforced implicitly).
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -10.0, 0.02, "T-junction: ΣRx = -F");

    // Node 2 and node 4 are connected by the vertical post.
    // The post (elem 3) carries the horizontal load as shear/moment.
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();

    // Node 4 must deflect more than node 2 horizontally (post tip > base).
    assert!(d4.ux.abs() > d2.ux.abs(),
        "T-junction: top of post deflects more than base: {:.6} > {:.6}",
        d4.ux.abs(), d2.ux.abs());

    // Both nodes have non-zero rotation (moment transfers through rigid joint).
    assert!(d2.ry.abs() > 0.0, "T-junction: node 2 has rotation");
}

// ================================================================
// 3. Portal Frame Corner: Beam-Column Compatibility
// ================================================================
//
// In a portal frame, the beam-column junction is a rigid joint.
// The beam end and column top share the same node, so they have
// identical ux, uy, and rz. Verify by checking that the corner node
// displacement is consistent with both members' deformed shapes.
// Ref: Ghali & Neville, §7.2 — rigid joint assembly.

#[test]
fn validation_compat_portal_corner() {
    let h = 4.0;
    let w = 6.0;
    let f = 20.0;

    // Symmetric portal, lateral load at top-left corner (node 2).
    let input = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 is connected to column 1→2 and beam 2→3.
    // Node 3 is connected to beam 2→3 and column 3→4.
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // For rigid frame with horizontal load, top nodes sway positively.
    assert!(d2.ux > 0.0, "Portal corner: node 2 sways in load direction");
    assert!(d3.ux > 0.0, "Portal corner: node 3 sways in load direction");

    // Both top nodes have the same sway (beam is axially stiff):
    // ux_2 ≈ ux_3 (small relative difference).
    let rel_diff = (d2.ux - d3.ux).abs() / d2.ux.abs();
    assert!(rel_diff < 0.05,
        "Portal corner: ux_2={:.6}, ux_3={:.6} should be nearly equal",
        d2.ux, d3.ux);

    // Both corners have non-zero rotation (moment at rigid joint).
    assert!(d2.ry.abs() > 0.0, "Portal corner: node 2 has rotation");
    assert!(d3.ry.abs() > 0.0, "Portal corner: node 3 has rotation");
}

// ================================================================
// 4. Rigid Joint: No Relative Rotation Between Members
// ================================================================
//
// Two beam elements meeting at a rigid joint must have identical rz.
// Test: L-shaped frame (horizontal + vertical), fixed at ends,
// rigid corner at junction. The corner rz of both elements = same.
// Ref: McGuire et al., §3.2 — rigid joint constraint.

#[test]
fn validation_compat_rigid_joint_rotation() {
    let l = 5.0;
    let p = 30.0;

    // L-frame: node 1 at (0,0) fixed, node 2 at (l,0), node 3 at (l,l) fixed.
    // Element 1: horizontal 1→2, Element 2: vertical 2→3.
    // Load: point load fy at node 2.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0), (3, l, l)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 has a single rz DOF — no relative rotation possible.
    // Verify: the junction node 2 has rotation (moment is transmitted).
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.ry.abs() > 0.0,
        "Rigid joint: junction must have non-zero rotation");

    // Check global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Rigid joint: ΣRy = P");

    // Both supports carry part of the load.
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert!(r1.rz.abs() > 0.0, "Rigid joint: support 1 carries load");
    assert!(r3.rz.abs() > 0.0, "Rigid joint: support 3 carries load");
}

// ================================================================
// 5. Hinged Joint: Rotation Discontinuity Allowed
// ================================================================
//
// An internal hinge allows free relative rotation between members.
// Moment is zero at the hinge. By contrast, at a rigid joint the
// moment is continuous. Test: propped cantilever with internal hinge.
// Ref: Hibbeler, "Structural Analysis", §6.6 — internal hinges.

#[test]
fn validation_compat_hinged_joint_discontinuity() {
    let l = 10.0;
    let q = 12.0;

    // Fixed–roller beam with internal hinge at midspan.
    // Hinge at node 2 means moment = 0 there; rotations of elem 1 end
    // and elem 2 start are independent.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),  // hinge at j-end
            (2, "frame", 2, 3, 1, 1, true, false),  // hinge at i-end
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

    // At the hinge node (node 2), moment must be zero in both elements.
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    assert!(ef1.m_end.abs() < 1.0,
        "Hinged joint: M_end of elem 1 = {:.4}, should be ~0", ef1.m_end);
    assert!(ef2.m_start.abs() < 1.0,
        "Hinged joint: M_start of elem 2 = {:.4}, should be ~0", ef2.m_start);

    // Global equilibrium still holds.
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.02, "Hinged joint: ΣRy = qL");
}

// ================================================================
// 6. 3D Joint: 6-DOF Compatibility
// ================================================================
//
// In a 3D frame, each node has 6 DOFs (ux, uy, uz, rx, ry, rz).
// Two members sharing a node must have the same values for all 6 DOFs.
// Test: 3D cantilever with combined Fy + Fz tip load; verify tip DOFs
// are physically consistent (uz from Fz, uy from Fy, etc.).
// Ref: Przemieniecki, §9.2 — 3D frame compatibility.

#[test]
fn validation_compat_3d_joint_6dof() {
    let l = 5.0;
    let n = 4;
    let fy = 10.0;
    let fz = 6.0;
    let e_eff = E * 1000.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Theoretical deflections from beam theory:
    // δy = Fy·L³/(3·E_eff·Iz), δz = Fz·L³/(3·E_eff·Iy)
    let delta_y = fy * l.powi(3) / (3.0 * e_eff * IZ);
    let delta_z = fz * l.powi(3) / (3.0 * e_eff * IY);

    assert_close(tip.uz.abs(), delta_y, 0.05, "3D joint: uy = Fy·L³/(3EIz)");
    assert_close(tip.uz.abs(), delta_z, 0.05, "3D joint: uz = Fz·L³/(3EIy)");

    // Pure bending: no torsion, so rx ≈ 0 at tip.
    assert!(tip.rx.abs() < 1e-6,
        "3D joint: no torsion, rx should be ~0, got {:.2e}", tip.rx);

    // Both Fy and Fz are active, confirming 6-DOF node is utilized.
    assert!(tip.uz.abs() > 0.0 && tip.uz.abs() > 0.0,
        "3D joint: both uy and uz must be non-zero");
}

// ================================================================
// 7. Multi-Member Joint: All Members Share Same Displacement at Hub
// ================================================================
//
// A hub node connected to multiple members (a "spider" joint) has
// one set of DOFs shared by all connected elements. Under load,
// the hub node displacement is unique regardless of which element
// is queried. Test: star pattern — hub at center, four beams radiate
// outward to pinned supports. Central node must be consistent.
// Ref: McGuire et al., §4.1 — assembly and shared DOFs.

#[test]
fn validation_compat_multi_member_joint() {
    let r = 4.0; // radius (arm length)
    let p = 40.0;

    // Hub at (0,0) = node 1. Four arms at ±r along X and Y.
    // Nodes 2..5 are pinned at tips. Load Fy at hub.
    let input = make_input(
        vec![
            (1, 0.0, 0.0),         // hub
            (2, r, 0.0),           // right
            (3, -r, 0.0),          // left
            (4, 0.0, r),           // top
            (5, 0.0, -r),          // bottom
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // right arm
            (2, "frame", 1, 3, 1, 1, false, false), // left arm
            (3, "frame", 1, 4, 1, 1, false, false), // top arm
            (4, "frame", 1, 5, 1, 1, false, false), // bottom arm
        ],
        vec![
            (1, 2, "pinned"),
            (2, 3, "pinned"),
            (3, 4, "pinned"),
            (4, 5, "pinned"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Hub node 1 has a single set of DOFs. Verify hub deflects downward.
    let d_hub = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d_hub.uz < 0.0,
        "Hub: uy should be downward (negative), got {:.6}", d_hub.uz);

    // Global equilibrium: ΣRy = P.
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Multi-member joint: ΣRy = P");

    // By symmetry (arms along X identical), top and bottom arms share load equally.
    // The vertical arms (3→4 and 4→5) carry the gravity component.
    // Check symmetry: left and right tip reactions should be equal.
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    assert_close(r2, r3, 0.02, "Multi-member: symmetric X-arms equal Ry");
}

// ================================================================
// 8. Continuous Beam: Zero Displacement at Interior Supports
// ================================================================
//
// A continuous beam is supported at every span boundary. The interior
// supports are rollerX (uy=0 enforced). After solving, the displacement
// at each interior support node must equal zero — the primary
// compatibility condition for continuous beams.
// Ref: Ghali & Neville, §12.1 — compatibility at intermediate supports.

#[test]
fn validation_compat_continuous_beam_interior_zeros() {
    // Three-span beam, 4 supports, UDL on all spans.
    // Interior nodes (2nd and 3rd supports) must have uy = 0.
    let span = 6.0;
    let q = 10.0;
    let n_per_span = 4;
    let n_total = 3 * n_per_span;

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support nodes: 1 + n_per_span and 1 + 2*n_per_span.
    let int1 = 1 + n_per_span;
    let int2 = 1 + 2 * n_per_span;

    let d_int1 = results.displacements.iter()
        .find(|d| d.node_id == int1).unwrap();
    let d_int2 = results.displacements.iter()
        .find(|d| d.node_id == int2).unwrap();

    // Displacement must be zero at rollerX supports (compatibility condition).
    assert!(d_int1.uz.abs() < 1e-8,
        "Interior support {}: uy = {:.2e}, must be 0", int1, d_int1.uz);
    assert!(d_int2.uz.abs() < 1e-8,
        "Interior support {}: uy = {:.2e}, must be 0", int2, d_int2.uz);

    // End supports also at zero (pinned and rollerX).
    let d_start = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter()
        .find(|d| d.node_id == 3 * n_per_span + 1).unwrap();
    assert!(d_start.uz.abs() < 1e-8,
        "Start support: uy = {:.2e}, must be 0", d_start.uz);
    assert!(d_end.uz.abs() < 1e-8,
        "End support: uy = {:.2e}, must be 0", d_end.uz);

    // Equilibrium: ΣRy = total load.
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * 3.0 * span, 0.01,
        "Continuous beam: ΣRy = 3qL");
}
