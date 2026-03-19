/// Validation: Extended Deformation Compatibility
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 2, 9
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 3-4
///   - Ghali & Neville, "Structural Analysis", Ch. 2, 7, 12
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 6, 14
///   - Timoshenko & Young, "Theory of Structures", Ch. 1, 5
///
/// These tests extend the basic deformation compatibility suite with more
/// demanding scenarios: antisymmetric loading, grillage patterns, moment
/// equilibrium at rigid joints, stiffness-proportional load sharing, mesh
/// refinement convergence, and coupled axial-bending behaviour.
///
/// Tests:
///   1. Antisymmetric loading on symmetric frame: verify antisymmetric response
///   2. Grillage junction: four beams at a hub, vertical load sharing
///   3. Moment equilibrium at rigid joint: sum of member-end moments = 0
///   4. Stiffness-proportional load sharing: two parallel beams via rigid link
///   5. Mesh refinement convergence: finer mesh converges to analytical deflection
///   6. Propped cantilever compatibility: zero deflection at prop, nonzero rotation
///   7. Two-bay frame: sway compatibility under lateral load
///   8. Mixed hinge/rigid: selective moment release at multi-member joint
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Antisymmetric Loading on Symmetric Frame
// ================================================================
//
// A symmetric portal frame (fixed-fixed, equal columns and beam) is
// subjected to equal and opposite lateral loads at the two top nodes.
// For antisymmetric loading on a symmetric structure, the response must
// be antisymmetric: ux at node 2 = -ux at node 3, uy at node 2 = uy
// at node 3, and rz at node 2 = rz at node 3 (same sign due to
// antisymmetric sway pattern).
//
// Ref: Ghali & Neville, ch. 7 -- symmetry and antisymmetry in frames.

#[test]
fn validation_compat_ext_antisymmetric_loading() {
    let h = 4.0;
    let w = 6.0;
    let f = 25.0;

    // Portal frame: nodes 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    // Elements: 1->2 (left col), 2->3 (beam), 3->4 (right col)
    // Fixed at 1 and 4. Antisymmetric lateral loads: +F at node 2, -F at node 3.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: f, fz: 0.0, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3, fx: -f, fz: 0.0, my: 0.0,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Antisymmetric response: ux_2 = -ux_3
    assert_close(d2.ux, -d3.ux, 0.02,
        "Antisymmetric: ux at node 2 should equal -ux at node 3");

    // Vertical displacements should be equal (symmetric about midspan of beam)
    assert_close(d2.uz, d3.uz, 0.02,
        "Antisymmetric: uy at node 2 should equal uy at node 3");

    // Both nodes must sway (non-zero ux)
    assert!(d2.ux.abs() > 1e-10,
        "Antisymmetric: node 2 must sway, got ux={:.2e}", d2.ux);

    // Global horizontal equilibrium: reactions must balance the net zero applied Fx
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 1e-6,
        "Antisymmetric: net applied Fx=0, so sum_Rx should be ~0, got {:.6}", sum_rx);
}

// ================================================================
// 2. Grillage Junction: Four Beams at Hub, Vertical Load Sharing
// ================================================================
//
// Four beams radiating from a central hub at 90-degree intervals.
// All tips are fixed supports. A vertical load is applied at the hub.
// By symmetry, the hub must deflect purely vertically (ux = 0) and
// each arm must carry one quarter of the vertical reaction.
//
// Ref: McGuire et al., ch. 4 -- assembly and load distribution.

#[test]
fn validation_compat_ext_grillage_hub_load_sharing() {
    let r = 5.0;
    let p = 100.0;

    // Hub at (0,0) = node 1. Tips: 2(+x), 3(-x), 4(0,+y), 5(0,-y)
    // All tips are fixed.
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, r, 0.0),
            (3, -r, 0.0),
            (4, 0.0, r),
            (5, 0.0, -r),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 1, 3, 1, 1, false, false),
            (3, "frame", 1, 4, 1, 1, false, false),
            (4, "frame", 1, 5, 1, 1, false, false),
        ],
        vec![
            (1, 2, "fixed"),
            (2, 3, "fixed"),
            (3, 4, "fixed"),
            (4, 5, "fixed"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d_hub = results.displacements.iter().find(|d| d.node_id == 1).unwrap();

    // By fourfold symmetry the hub must not translate horizontally.
    assert!(d_hub.ux.abs() < 1e-8,
        "Grillage hub: ux should be zero by symmetry, got {:.2e}", d_hub.ux);

    // Hub deflects downward under vertical load.
    assert!(d_hub.uz < 0.0,
        "Grillage hub: uy should be negative (downward), got {:.8}", d_hub.uz);

    // Global equilibrium: sum_Ry = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "Grillage hub: sum_Ry = P");

    // By symmetry, left and right arms carry equal vertical reaction.
    let r2_ry = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    let r3_ry = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    assert_close(r2_ry, r3_ry, 0.01,
        "Grillage hub: symmetric X-arm reactions should be equal");

    // Top and bottom arms carry equal vertical reaction.
    let r4_ry = results.reactions.iter().find(|r| r.node_id == 4).unwrap().rz;
    let r5_ry = results.reactions.iter().find(|r| r.node_id == 5).unwrap().rz;
    assert_close(r4_ry, r5_ry, 0.01,
        "Grillage hub: symmetric Y-arm reactions should be equal");
}

// ================================================================
// 3. Moment Equilibrium at Rigid Joint
// ================================================================
//
// At a rigid joint in a frame, the sum of member-end moments arriving
// at the node must equal the externally applied moment (zero if none).
// Test: L-frame (horizontal + vertical member), fixed at both ends,
// point load at the corner. No external moment applied at the corner,
// so the sum of the end moments of both members at the shared node
// must be zero.
//
// Ref: McGuire et al., ch. 3 -- joint equilibrium from member forces.

#[test]
fn validation_compat_ext_moment_equilibrium_at_rigid_joint() {
    let l = 6.0;
    let p = 40.0;

    // L-frame: node 1(0,0)--node 2(l,0)--node 3(l,l)
    // Elem 1: horizontal 1->2, Elem 2: vertical 2->3
    // Fixed at 1 and 3. Load: Fy at node 2.
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

    // At node 2, element 1 contributes m_end and element 2 contributes m_start.
    // No external moment is applied at node 2, so the two must sum to zero.
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Sign convention: m_end uses -f_local[5], m_start uses f_local[2].
    // At a rigid joint, node force equilibrium (f_A[5] + f_B[2] = 0) gives
    // moment continuity: m_end_A = m_start_B, so check their difference.
    let moment_diff = ef1.m_end - ef2.m_start;
    assert!(moment_diff.abs() < 1.0,
        "Moment continuity at joint: M1_end - M2_start = {:.6}, should be ~0", moment_diff);

    // Both members carry moment (load is transmitted through the joint).
    // Note: with a vertical load at the L-frame corner, the vertical column
    // carries most load axially, so moments are small but non-zero.
    assert!(ef1.m_end.abs() > 0.01,
        "L-frame: elem 1 m_end should be non-trivial, got {:.6}", ef1.m_end);
    assert!(ef2.m_start.abs() > 0.01,
        "L-frame: elem 2 m_start should be non-trivial, got {:.6}", ef2.m_start);

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "L-frame moment equil: sum_Ry = P");
}

// ================================================================
// 4. Stiffness-Proportional Load Sharing
// ================================================================
//
// Two parallel cantilevers of different stiffness (different Iz) are
// connected at their tips by a rigid horizontal link (truss-like beam
// element). A vertical load applied at the link node distributes to
// both cantilevers in proportion to their flexural stiffnesses
// (3EI/L^3 for a cantilever). The stiffer beam attracts more load.
//
// Ref: Ghali & Neville, ch. 2 -- compatibility and load distribution.

#[test]
fn validation_compat_ext_stiffness_proportional_sharing() {
    let l = 5.0;
    let p = 60.0;
    let iz1 = 1e-4;       // beam 1 (less stiff)
    let iz2 = 4e-4;       // beam 2 (4x stiffer)
    let e_eff = E * 1000.0;

    // Geometry:
    //   Node 1(0,0) fixed -- elem 1 --> Node 3(l,0) [tip of beam 1]
    //   Node 2(0,1) fixed -- elem 2 --> Node 4(l,1) [tip of beam 2]
    //   Node 3 -- elem 3 (rigid link) --> Node 4
    // Load: Fy = -P at node 3.
    //
    // The link forces both tips to have the same uy. Compatibility
    // distributes the load in proportion to 3EI/L^3.

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, 1.0),
            (3, l, 0.0),
            (4, l, 1.0),
        ],
        vec![(1, E, 0.3)],
        vec![
            (1, A, iz1),  // section for beam 1 (less stiff)
            (2, A, iz2),  // section for beam 2 (stiffer)
        ],
        vec![
            (1, "frame", 1, 3, 1, 1, false, false), // beam 1: section 1
            (2, "frame", 2, 4, 1, 2, false, false), // beam 2: section 2
            (3, "frame", 3, 4, 1, 2, false, false), // rigid link
        ],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Both tip nodes (3 and 4) should have approximately equal uy
    // because they are linked by a rigid element.
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();

    let uy_diff = (d3.uz - d4.uz).abs();
    let uy_ref = d3.uz.abs().max(d4.uz.abs()).max(1e-10);
    // Link is not infinitely rigid (it has finite EI), but EA/L is large
    // so axial deformation of the link is small relative to cantilever deflection.
    assert!(uy_diff / uy_ref < 0.15,
        "Linked tips: uy should be approximately equal, d3.uz={:.8}, d4.uz={:.8}",
        d3.uz, d4.uz);

    // The stiffer beam (beam 2) should attract more shear at its base.
    // Cantilever stiffness: k = 3EI/L^3.
    let k1: f64 = 3.0 * e_eff * iz1 / l.powi(3);
    let k2: f64 = 3.0 * e_eff * iz2 / l.powi(3);
    let ratio_expected = k2 / k1; // should be 4.0

    // Reaction at node 1 (base of beam 1) vs node 2 (base of beam 2).
    let r1_ry = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r2_ry = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;

    // Stiffer beam should carry more load.
    assert!(r2_ry.abs() > r1_ry.abs(),
        "Stiffer beam should carry more load: R2={:.4} > R1={:.4}", r2_ry.abs(), r1_ry.abs());

    // Ratio of reactions should approximately equal ratio of stiffnesses.
    // Some deviation is expected because the link has finite stiffness.
    let ratio_actual = r2_ry.abs() / r1_ry.abs().max(1e-10);
    assert!((ratio_actual - ratio_expected).abs() / ratio_expected < 0.25,
        "Load sharing ratio: actual={:.2}, expected={:.2}", ratio_actual, ratio_expected);

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Stiffness sharing: sum_Ry = P");
}

// ================================================================
// 5. Mesh Refinement Convergence
// ================================================================
//
// A simply-supported beam under UDL solved with increasing numbers of
// elements (2, 4, 8, 16). The midspan deflection must converge toward
// the analytical value 5qL^4/(384EI). With Euler-Bernoulli elements,
// even 2 elements should be close, and further refinement should not
// diverge.
//
// Ref: Przemieniecki, ch. 2 -- convergence of displacement-based FEM.

#[test]
fn validation_compat_ext_mesh_refinement_convergence() {
    let l: f64 = 10.0;
    let q = 15.0;
    let e_eff = E * 1000.0;
    let delta_exact: f64 = 5.0 * q * l.powi(4) / (384.0 * e_eff * IZ);

    let mesh_sizes = [2_usize, 4, 8, 16];
    let mut prev_error = f64::MAX;

    for &n in &mesh_sizes {
        let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
        let results = linear::solve_2d(&input).unwrap();

        // Find the node closest to midspan.
        let mid_node = n / 2 + 1;
        let d_mid = results.displacements.iter()
            .find(|d| d.node_id == mid_node)
            .unwrap();

        let error = (d_mid.uz.abs() - delta_exact).abs() / delta_exact;

        // Error should not grow with refinement (monotone convergence).
        assert!(error <= prev_error + 0.01,
            "Mesh n={}: error={:.6} should not exceed previous error={:.6}",
            n, error, prev_error);

        prev_error = error;
    }

    // With 16 elements, the error should be very small (< 1%).
    assert!(prev_error < 0.01,
        "Mesh n=16: error={:.6} should be < 1%", prev_error);
}

// ================================================================
// 6. Propped Cantilever Compatibility
// ================================================================
//
// Fixed at left, roller (rollerX) at right. Under UDL, the roller
// enforces uy = 0 at the right end while rz is free. The maximum
// deflection occurs at x = 0.4215*L (from beam theory).
//
// Analytical results (propped cantilever, UDL q downward):
//   R_right = 3qL/8
//   delta_max = qL^4 / (185 * EI)  (approx, at x ~ 0.4215L)
//   Slope at right end: theta_right = qL^3 / (48EI)
//
// Ref: Timoshenko & Young, "Theory of Structures", beam tables.

#[test]
fn validation_compat_ext_propped_cantilever_compatibility() {
    let n = 8;
    let l = 10.0;
    let q = 12.0;
    let e_eff = E * 1000.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
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

    // Left fixed support: ux = uy = rz = 0
    let d_left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d_left.uz.abs() < 1e-8,
        "Propped cantilever: fixed end uy should be 0, got {:.2e}", d_left.uz);
    assert!(d_left.ry.abs() < 1e-8,
        "Propped cantilever: fixed end rz should be 0, got {:.2e}", d_left.ry);

    // Right roller: uy = 0 but rz != 0
    let d_right = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(d_right.uz.abs() < 1e-8,
        "Propped cantilever: roller uy should be 0, got {:.2e}", d_right.uz);
    assert!(d_right.ry.abs() > 1e-10,
        "Propped cantilever: roller rz should be non-zero, got {:.2e}", d_right.ry);

    // Analytical slope at right end: theta = qL^3 / (48EI)
    let theta_right_analytical: f64 = q * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_right.ry.abs(), theta_right_analytical, 0.03,
        "Propped cantilever: roller slope matches beam theory");

    // Reaction at roller: R_right = 3qL/8
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    let r_right_analytical = 3.0 * q * l / 8.0;
    assert_close(r_right.rz, r_right_analytical, 0.02,
        "Propped cantilever: roller reaction = 3qL/8");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "Propped cantilever: sum_Ry = qL");
}

// ================================================================
// 7. Two-Bay Frame: Sway Compatibility Under Lateral Load
// ================================================================
//
// A two-bay, single-storey frame with three columns and two beams.
// A lateral load at the left top node. All three column tops (nodes
// 2, 4, 6) are connected by the two beams and must sway together
// (approximately equal ux) because the beams are axially stiff.
//
// Ref: Ghali & Neville, ch. 7 -- multi-bay frame sway analysis.

#[test]
fn validation_compat_ext_two_bay_frame_sway() {
    let h = 4.0;
    let w = 5.0;
    let f = 30.0;

    // Nodes:
    //   1(0,0)  3(w,0)  5(2w,0)   -- column bases, all fixed
    //   2(0,h)  4(w,h)  6(2w,h)   -- column tops
    // Elements:
    //   1: 1->2 (left col)
    //   2: 3->4 (middle col)
    //   3: 5->6 (right col)
    //   4: 2->4 (left beam)
    //   5: 4->6 (right beam)
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h),
            (3, w, 0.0),   (4, w, h),
            (5, 2.0 * w, 0.0), (6, 2.0 * w, h),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 3, 4, 1, 1, false, false),
            (3, "frame", 5, 6, 1, 1, false, false),
            (4, "frame", 2, 4, 1, 1, false, false),
            (5, "frame", 4, 6, 1, 1, false, false),
        ],
        vec![
            (1, 1, "fixed"),
            (2, 3, "fixed"),
            (3, 5, "fixed"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let d6 = results.displacements.iter().find(|d| d.node_id == 6).unwrap();

    // All top nodes must sway in the direction of the applied load.
    assert!(d2.ux > 0.0, "Two-bay: node 2 should sway right, got ux={:.8}", d2.ux);
    assert!(d4.ux > 0.0, "Two-bay: node 4 should sway right, got ux={:.8}", d4.ux);
    assert!(d6.ux > 0.0, "Two-bay: node 6 should sway right, got ux={:.8}", d6.ux);

    // The beams are axially stiff, so all top nodes have nearly the same ux.
    let ux_max = d2.ux.max(d4.ux).max(d6.ux);
    let ux_min = d2.ux.min(d4.ux).min(d6.ux);
    let ux_range = (ux_max - ux_min) / ux_max;
    assert!(ux_range < 0.05,
        "Two-bay sway: top nodes should have similar ux, range={:.4}",
        ux_range);

    // All three column tops have non-zero rotation (rigid joints).
    assert!(d2.ry.abs() > 1e-10, "Two-bay: node 2 should rotate");
    assert!(d4.ry.abs() > 1e-10, "Two-bay: node 4 should rotate");
    assert!(d6.ry.abs() > 1e-10, "Two-bay: node 6 should rotate");

    // Global horizontal equilibrium: sum_Rx = -F
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f, 0.02, "Two-bay: sum_Rx = -F");
}

// ================================================================
// 8. Mixed Hinge/Rigid: Selective Moment Release
// ================================================================
//
// Three-element beam (fixed at left, roller at right) with a hinge
// at the first interior node (node 2) and a rigid connection at the
// second interior node (node 3). The hinge releases moment at node 2
// (m = 0 there), while the rigid connection at node 3 transmits moment
// freely. Compatibility requires uy continuous everywhere and rz
// continuous at node 3 but discontinuous at node 2.
//
// Ref: Hibbeler, ch. 6 -- combining hinges and rigid joints.

#[test]
fn validation_compat_ext_mixed_hinge_rigid_joint() {
    let l = 12.0;
    let q = 10.0;
    let third = l / 3.0;

    // Nodes: 1(0,0), 2(l/3,0), 3(2l/3,0), 4(l,0)
    // Elements:
    //   1: 1->2, hinge at j-end (node 2)
    //   2: 2->3, hinge at i-end (node 2), rigid at j-end (node 3)
    //   3: 3->4, rigid at i-end (node 3)
    // Fixed at 1, rollerX at 4.
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, third, 0.0),
            (3, 2.0 * third, 0.0),
            (4, l, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),  // hinge at j-end (node 2)
            (2, "frame", 2, 3, 1, 1, true, false),   // hinge at i-end (node 2), rigid at j-end
            (3, "frame", 3, 4, 1, 1, false, false),  // rigid both ends
        ],
        vec![(1, 1, "fixed"), (2, 4, "rollerX")],
        vec![
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 1, q_i: -q, q_j: -q, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 2, q_i: -q, q_j: -q, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 3, q_i: -q, q_j: -q, a: None, b: None,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // At the hinge (node 2): moment must be zero in both adjacent elements.
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    assert!(ef1.m_end.abs() < 1.0,
        "Mixed: hinge at node 2, elem 1 m_end should be ~0, got {:.4}", ef1.m_end);
    assert!(ef2.m_start.abs() < 1.0,
        "Mixed: hinge at node 2, elem 2 m_start should be ~0, got {:.4}", ef2.m_start);

    // At the rigid joint (node 3): moment is transmitted (non-zero).
    assert!(ef2.m_end.abs() > 0.1,
        "Mixed: rigid joint at node 3, elem 2 m_end should be non-zero, got {:.6}", ef2.m_end);
    assert!(ef3.m_start.abs() > 0.1,
        "Mixed: rigid joint at node 3, elem 3 m_start should be non-zero, got {:.6}", ef3.m_start);

    // At the rigid joint (node 3): moment continuity (m_end = m_start).
    // Sign convention: node force equilibrium gives m_end_A = m_start_B.
    let moment_diff_node3 = ef2.m_end - ef3.m_start;
    assert!(moment_diff_node3.abs() < 1.0,
        "Mixed: moment continuity at node 3, diff={:.6} should be ~0", moment_diff_node3);

    // Displacements at all interior nodes should be non-zero (beam deflects).
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d2.uz.abs() > 1e-10,
        "Mixed: node 2 should deflect, got uy={:.2e}", d2.uz);
    assert!(d3.uz.abs() > 1e-10,
        "Mixed: node 3 should deflect, got uy={:.2e}", d3.uz);

    // Global equilibrium: sum_Ry = qL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.02, "Mixed hinge/rigid: sum_Ry = qL");
}
