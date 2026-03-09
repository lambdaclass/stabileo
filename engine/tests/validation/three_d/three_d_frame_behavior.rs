/// Validation: 3D Frame Structural Behavior
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Dover, Ch. 6, 10
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 5
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", 3rd Ed., Ch. 8
///   - Timoshenko & Goodier, "Theory of Elasticity", 3rd Ed., Ch. 10
///
/// Tests:
///   1. 3D portal frame lateral stiffness (X-direction sway)
///   2. Out-of-plane loading on a plane frame (Y-direction force on XZ-plane frame)
///   3. Torsional response of a space frame L-bend under torque
///   4. 3D cantilever with biaxial UDL: independent bending planes
///   5. Strong vs. weak axis bending of a cantilever
///   6. 3D frame moment distribution at a rigid joint (equilibrium check)
///   7. Space frame symmetry — equal load sharing on symmetric 3D frame
///   8. 3D frame under combined axial + biaxial bending (superposition)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const NU: f64 = 0.3;
const A: f64 = 0.01;      // m²
const IY: f64 = 1e-4;     // m⁴  (weak axis)
const IZ: f64 = 2e-4;     // m⁴  (strong axis, larger)
const J: f64 = 8e-5;      // m⁴  (torsional constant)

// ================================================================
// 1. 3D Portal Frame Lateral Stiffness
// ================================================================
//
// Fixed-base portal frame in the XZ-plane.
// Nodes: 1=(0,0,0), 2=(0,0,h), 3=(b,0,h), 4=(b,0,0).
// Lateral load H at node 2 in X-direction.
//
// Lateral stiffness K = H / Δ is bounded between:
//   K_lower = 2 × 3EI/h³  (two independent cantilever columns)
//   K_upper = 2 × 12EI/h³ (two columns with fully fixed-fixed condition)
// With a finite-stiffness beam, actual K lies between these bounds.
//
// Reference: Przemieniecki "Theory of Matrix Structural Analysis" Ch. 10, §10.3.

#[test]
fn validation_3d_portal_lateral_stiffness() {
    let h = 4.0;
    let b = 6.0;
    let h_load = 1.0; // kN lateral load
    let e_eff = E * 1000.0;

    // Frame in XZ-plane: columns along Z, beam along X
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), // base left
        (2, 0.0, 0.0, h),   // top left
        (3, b, 0.0, h),     // top right
        (4, b, 0.0, 0.0),   // base right
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // left column (along Z)
        (2, "frame", 2, 3, 1, 1), // beam (along X)
        (3, "frame", 3, 4, 1, 1), // right column (along Z)
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: h_load, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let sway = d2.ux.abs();
    let k_actual = h_load / sway;

    // Columns bend about Y when displaced in X; use IY for X-direction bending
    let k_cantilever_pair = 2.0 * 3.0 * e_eff * IY / h.powi(3);
    let k_fixed_fixed_pair = 2.0 * 12.0 * e_eff * IY / h.powi(3);

    assert!(k_actual > k_cantilever_pair * 0.9,
        "Portal lateral K={:.4e} should exceed cantilever pair K={:.4e}",
        k_actual, k_cantilever_pair);
    assert!(k_actual < k_fixed_fixed_pair * 1.1,
        "Portal lateral K={:.4e} should be below fixed-fixed pair K={:.4e}",
        k_actual, k_fixed_fixed_pair);

    // Global equilibrium
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert!((sum_fx + h_load).abs() < h_load * 0.01,
        "Portal equilibrium ΣFx: sum={:.4}, applied={:.4}", sum_fx, h_load);
}

// ================================================================
// 2. Out-of-Plane Loading on Plane Frame
// ================================================================
//
// A portal frame is built in the XZ-plane (all nodes at y=0).
// A Y-direction force (out-of-plane) is applied at a beam joint.
// This engages torsion in the columns and bending about the local weak axis.
//
// Equilibrium: ΣFy from reactions = applied Y-force.
//
// Reference: McGuire, Gallagher & Ziemian "Matrix Structural Analysis" 2nd Ed., §5.3.

#[test]
fn validation_3d_out_of_plane_loading() {
    let h = 3.0;
    let b = 5.0;
    let p_y = 8.0; // kN out-of-plane

    // Frame nodes in XZ-plane
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, b, 0.0, h),
        (4, b, 0.0, 0.0),
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
    // Out-of-plane load at midpoint of beam (node 2, left top)
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: p_y, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Global equilibrium in Y
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!((sum_fy + p_y).abs() < p_y * 0.01,
        "Out-of-plane equilibrium ΣFy: sum={:.4}, applied={:.4}", sum_fy, p_y);

    // Node 2 should have a Y displacement (out-of-plane)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.uy.abs() > 1e-6,
        "Out-of-plane: node 2 Y-displacement should be nonzero, got {:.6e}", d2.uy);

    // X and Z equilibrium should still hold (no loads in these directions)
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fx.abs() < 0.01, "Out-of-plane: ΣFx should be 0, got {:.4}", sum_fx);
    assert!(sum_fz.abs() < 0.01, "Out-of-plane: ΣFz should be 0, got {:.4}", sum_fz);
}

// ================================================================
// 3. Torsional Response of Space Frame L-Bend Under Torque
// ================================================================
//
// L-shaped beam:
//   Segment 1: along X, fixed at origin, free end at (L, 0, 0).
//   Segment 2: along Y from (L, 0, 0) to (L, L, 0).
// A Z-force at the tip (L, L, 0) creates a torque T = P × L in segment 1
// and bending in segment 2.
//
// Torque in segment 1: T = P × L → twist θ = T × L / (G × J).
// G = E / (2(1+ν)).
//
// Reference: Weaver & Gere "Matrix Analysis of Framed Structures" 3rd Ed., §8.4.

#[test]
fn validation_3d_lbend_torsional_response() {
    let l = 4.0;
    let p_z = 5.0; // kN downward at tip
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), // fixed base
        (2, l, 0.0, 0.0),   // corner
        (3, l, l, 0.0),     // free tip
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // segment along X
        (2, "frame", 2, 3, 1, 1), // segment along Y
    ];
    let sups = vec![(1, vec![true, true, true, true, true, true])];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: 0.0, fz: -p_z,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Global equilibrium: ΣFz = p_z
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!((sum_fz - p_z).abs() < p_z * 0.01,
        "L-bend equilibrium ΣFz: sum={:.4}, P={:.4}", sum_fz, p_z);

    // Tip should deflect downward in Z
    let d_tip = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d_tip.uz < 0.0, "L-bend tip should deflect in -Z, got {:.6e}", d_tip.uz);

    // Segment 1 carries torque T = p_z × l (arm = l in Y-direction from load to segment axis)
    // Twist angle at corner: θ = T × L / (G × J)
    let torque = p_z * l;
    let theta_exact = torque * l / (g * J);
    // The x-rotation at corner (node 2) approximates this twist
    let d_corner = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d_corner.rx.abs() > theta_exact * 0.5,
        "L-bend: corner twist rx={:.6e} should be significant (expected order {:.6e})",
        d_corner.rx.abs(), theta_exact);
}

// ================================================================
// 4. 3D Cantilever with Biaxial UDL
// ================================================================
//
// 3D cantilever, length L = 5 m, fixed at node 1.
// UDL q_y applied in Y-direction (bending about Z-axis, uses Iz).
// UDL q_z applied in Z-direction (bending about Y-axis, uses Iy).
//
// Exact tip deflections:
//   δy = q_y × L⁴ / (8 × E × Iz)
//   δz = q_z × L⁴ / (8 × E × Iy)
//
// Reference: Przemieniecki "Theory of Matrix Structural Analysis" Ch. 6, §6.2.

#[test]
fn validation_3d_cantilever_biaxial_udl() {
    let l = 5.0;
    let n = 8;
    let q_y = -6.0;   // kN/m in Y (downward)
    let q_z = -4.0;   // kN/m in Z
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i,
            q_yi: q_y, q_yj: q_y,
            q_zi: q_z, q_zj: q_z,
            a: None, b: None,
        }));
    }

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δy = q_y × L⁴ / (8EIz)
    let dy_exact = q_y.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), dy_exact, 0.03,
        "Biaxial UDL: δy = qy·L⁴/(8EIz)");

    // δz = q_z × L⁴ / (8EIy)
    let dz_exact = q_z.abs() * l.powi(4) / (8.0 * e_eff * IY);
    assert_close(tip.uz.abs(), dz_exact, 0.03,
        "Biaxial UDL: δz = qz·L⁴/(8EIy)");

    // Equilibrium: fixed-end reactions balance applied loads
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let total_y = q_y.abs() * l;
    let total_z = q_z.abs() * l;
    assert_close(r1.fy.abs(), total_y, 0.02,
        "Biaxial UDL: Fy reaction = qy·L");
    assert_close(r1.fz.abs(), total_z, 0.02,
        "Biaxial UDL: Fz reaction = qz·L");
}

// ================================================================
// 5. Strong vs. Weak Axis Bending of a Cantilever
// ================================================================
//
// Same section but loaded along weak axis vs. strong axis.
// IZ > IY (IZ = 2e-4, IY = 1e-4), so bending about Y-axis (Z-force)
// uses IY and gives larger deflection than bending about Z-axis (Y-force).
//
// For equal tip force P:
//   δ_weak (Z-force, bending about Y) = P·L³/(3·E·IY)
//   δ_strong (Y-force, bending about Z) = P·L³/(3·E·IZ)
//   δ_weak / δ_strong = IZ / IY = 2
//
// Reference: McGuire, Gallagher & Ziemian "Matrix Structural Analysis" 2nd Ed., §3.2.

#[test]
fn validation_3d_strong_vs_weak_axis_bending() {
    let l = 4.0;
    let n = 8;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let fix = vec![true, true, true, true, true, true];

    // Load in Y-direction (bending about Z, strong axis)
    let input_strong = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fix.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    // Load in Z-direction (bending about Y, weak axis)
    let input_weak = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fix, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    let res_strong = linear::solve_3d(&input_strong).unwrap();
    let res_weak = linear::solve_3d(&input_weak).unwrap();

    let tip_strong = res_strong.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_weak = res_weak.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Analytical tip deflections
    let d_strong_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    let d_weak_exact = p * l.powi(3) / (3.0 * e_eff * IY);

    assert_close(tip_strong.uy.abs(), d_strong_exact, 0.02,
        "Strong axis: δy = PL³/(3EIz)");
    assert_close(tip_weak.uz.abs(), d_weak_exact, 0.02,
        "Weak axis: δz = PL³/(3EIy)");

    // Ratio should match Iz/Iy = 2
    let ratio = tip_weak.uz.abs() / tip_strong.uy.abs();
    let expected_ratio = IZ / IY;
    assert_close(ratio, expected_ratio, 0.02,
        "Strong/weak ratio: δ_weak/δ_strong = Iz/Iy");
}

// ================================================================
// 6. 3D Frame Moment Distribution at a Rigid Joint
// ================================================================
//
// A T-shaped 3D frame: two collinear beams along X meeting at a central
// node, plus one beam along Y from the same node (all in the XY plane at z=0).
// An external moment Mz is applied at the central node.
//
// The three members share the moment in proportion to their stiffnesses.
// Symmetry of the two X-beams means each X-arm carries the same Mz.
// Equilibrium: sum of reaction moments about Z = −Mz_applied.
//
// This tests that a 3D rigid joint correctly distributes moment to members.
//
// Reference: Weaver & Gere "Matrix Analysis of Framed Structures" 3rd Ed., §8.2.

#[test]
fn validation_3d_joint_moment_equilibrium() {
    let l = 3.0;
    let mz_applied = 10.0; // kN·m applied at central joint

    // T-frame: all members in XY plane at z = 0
    // Arm 1: along +X from central node 4 to node 1
    // Arm 2: along -X from central node 4 to node 2
    // Arm 3: along +Y from central node 4 to node 3
    let nodes = vec![
        (1,  l, 0.0, 0.0),  // end of +X arm
        (2, -l, 0.0, 0.0),  // end of -X arm
        (3, 0.0,  l, 0.0),  // end of +Y arm
        (4, 0.0, 0.0, 0.0), // central joint
    ];
    let elems = vec![
        (1, "frame", 4, 1, 1, 1),
        (2, "frame", 4, 2, 1, 1),
        (3, "frame", 4, 3, 1, 1),
    ];
    // Fix all three arm ends
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (2, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
    ];
    // Apply moment about Z at central joint
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: mz_applied, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // The central joint (node 4) should rotate about Z
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(d4.rz.abs() > 1e-8,
        "Joint should rotate under applied Mz: rz={:.6e}", d4.rz);

    // By symmetry, the two X-arms (fixed-fixed in bending) must carry equal reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    // Reaction moments at symmetric arms should be equal in magnitude
    assert_close(r1.mz.abs(), r2.mz.abs(), 0.02,
        "Symmetric arms carry equal Mz reactions");

    // Global force equilibrium (no applied forces)
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fx.abs() < 0.01, "Joint Mz: ΣFx={:.4} should be 0", sum_fx);
    assert!(sum_fy.abs() < 0.01, "Joint Mz: ΣFy={:.4} should be 0", sum_fy);
    assert!(sum_fz.abs() < 0.01, "Joint Mz: ΣFz={:.4} should be 0", sum_fz);
}

// ================================================================
// 7. Space Frame Symmetry — Equal Load Sharing
// ================================================================
//
// A symmetric space frame: 4 identical columns at the corners of a square,
// connected by a rigid roof plate (modelled as 4 beams).
// A central vertical load P is applied at the centroid of the roof.
// By symmetry each column base should carry P/4 vertically.
//
// Reference: Przemieniecki "Theory of Matrix Structural Analysis" Ch. 10, §10.5.

#[test]
fn validation_3d_symmetric_frame_load_sharing() {
    let h = 3.5;
    let s = 4.0; // half-side of square plan (total 8m × 8m)
    let p = 40.0; // kN total vertical load at centroid

    // 4 column bases + 4 column tops + centroid node
    let nodes = vec![
        (1, -s, -s, 0.0), (2,  s, -s, 0.0), (3,  s,  s, 0.0), (4, -s,  s, 0.0), // bases
        (5, -s, -s, h),   (6,  s, -s, h),   (7,  s,  s, h),   (8, -s,  s, h),   // tops
        (9, 0.0, 0.0, h), // centroid at roof level
    ];
    let elems = vec![
        (1, "frame", 1, 5, 1, 1), // columns
        (2, "frame", 2, 6, 1, 1),
        (3, "frame", 3, 7, 1, 1),
        (4, "frame", 4, 8, 1, 1),
        (5, "frame", 5, 9, 1, 1), // roof beams to centroid
        (6, "frame", 6, 9, 1, 1),
        (7, "frame", 7, 9, 1, 1),
        (8, "frame", 8, 9, 1, 1),
    ];
    // Fix all 4 column bases
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (2, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 9, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Each column base should carry P/4 = 10 kN in Z
    let target = p / 4.0;
    for node_id in [1, 2, 3, 4] {
        let r = results.reactions.iter().find(|r| r.node_id == node_id).unwrap();
        assert_close(r.fz, target, 0.05,
            &format!("Symmetric frame: column {} Fz = P/4", node_id));
    }

    // Total equilibrium
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!((sum_fz - p).abs() < p * 0.01,
        "Symmetric frame equilibrium: ΣFz={:.4}, P={:.4}", sum_fz, p);
}

// ================================================================
// 8. 3D Frame Under Combined Axial + Biaxial Bending
// ================================================================
//
// Cantilever beam, length L = 5 m.
// Loads: Fx (axial tension), Fy (lateral in Y), Fz (lateral in Z).
//
// Linear analysis — superposition holds:
//   δx_combined = δx_axial
//   δy_combined = δy_lateral_y
//   δz_combined = δz_lateral_z
//
// Verify that combined response equals sum of individual responses.
//
// Reference: Timoshenko "Strength of Materials" Vol. I, §21.

#[test]
fn validation_3d_combined_axial_biaxial_bending() {
    let l = 5.0;
    let n = 8;
    let fx_load = 80.0;  // kN axial tension
    let fy_load = 12.0;  // kN lateral in Y
    let fz_load = 8.0;   // kN lateral in Z
    let e_eff = E * 1000.0;

    let fix = vec![true, true, true, true, true, true];

    // Individual load cases
    let input_x = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fix.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: fx_load, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let input_y = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fix.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: -fy_load, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let input_z = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fix.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: -fz_load,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    // Combined load case
    let input_combined = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fix, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: fx_load, fy: -fy_load, fz: -fz_load,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    let res_x = linear::solve_3d(&input_x).unwrap();
    let res_y = linear::solve_3d(&input_y).unwrap();
    let res_z = linear::solve_3d(&input_z).unwrap();
    let res_combined = linear::solve_3d(&input_combined).unwrap();

    let tip_x = res_x.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_y = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_z = res_z.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_c = res_combined.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Superposition checks
    assert_close(tip_c.ux, tip_x.ux + tip_y.ux + tip_z.ux, 0.01,
        "Combined: superposition ux");
    assert_close(tip_c.uy, tip_x.uy + tip_y.uy + tip_z.uy, 0.01,
        "Combined: superposition uy");
    assert_close(tip_c.uz, tip_x.uz + tip_y.uz + tip_z.uz, 0.01,
        "Combined: superposition uz");

    // Analytical check: δx = Fx·L/(EA)
    let dx_exact = fx_load * l / (e_eff * A);
    assert_close(tip_x.ux, dx_exact, 0.02,
        "Combined axial: δx = FxL/(EA)");

    // δy = Fy·L³/(3·E·Iz)
    let dy_exact = fy_load * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip_y.uy.abs(), dy_exact, 0.02,
        "Combined bending Y: δy = Fy·L³/(3EIz)");

    // δz = Fz·L³/(3·E·Iy)
    let dz_exact = fz_load * l.powi(3) / (3.0 * e_eff * IY);
    assert_close(tip_z.uz.abs(), dz_exact, 0.02,
        "Combined bending Z: δz = Fz·L³/(3EIy)");
}
