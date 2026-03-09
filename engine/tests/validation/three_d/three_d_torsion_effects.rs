/// Validation: 3D Torsional Behavior and Effects
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 3
///   - Roark's Formulas for Stress and Strain, 9th Ed., Ch. 9
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 3
///
/// Tests:
///   1. Cantilever torsion φ = TL/(GJ): angle of twist formula
///   2. Section stiffness comparison: larger J → less twist for same torque
///   3. L-frame out-of-plane load: torsion induced in perpendicular member
///   4. Fixed-fixed torsion reactions: each end carries T/2 by symmetry
///   5. Distributed torque: φ_tip = t_x L²/(2GJ) for cantilever
///   6. Coupled bending-torsion: off-center load causes both bending and torsion
///   7. GJ proportionality: doubling J halves twist angle
///   8. Space-frame joint torsion equilibrium: ΣM_x = 0
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64  = 200_000.0;
const NU: f64 = 0.3;
const A: f64  = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64  = 5e-5;

// ================================================================
// 1. Cantilever Pure Torsion: φ = TL/(GJ)
// ================================================================
//
// Fixed at A (x=0), torque T applied at free end (x=L).
// Angle of twist at free end: φ = TL/(GJ)
// G = E / (2(1+ν))
//
// Ref: Gere & Goodno, "Mechanics of Materials" §3.3

#[test]
fn validation_torsion_cantilever_angle_of_twist() {
    let l: f64 = 5.0;
    let n = 8;
    let t = 8.0; // kN·m torque
    let g = E * 1000.0 / (2.0 * (1.0 + NU));

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed at A
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // φ = TL / (G·J)
    let phi_exact = t * l / (g * J);
    let err = (tip.rx.abs() - phi_exact).abs() / phi_exact;
    assert!(err < 0.05,
        "Cantilever torsion: φ={:.6e}, exact TL/(GJ)={:.6e}, err={:.1}%",
        tip.rx.abs(), phi_exact, err * 100.0);

    // Support reaction must equal applied torque
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.mx.abs(), t, 0.01, "Torsion reaction Mx = T");
}

// ================================================================
// 2. Section Stiffness Comparison: Larger J → Less Twist
// ================================================================
//
// Two identical beams, same load T, but different torsional constants J₁ < J₂.
// φ₁ > φ₂ and φ₁/φ₂ = J₂/J₁.
//
// Ref: Roark's Formulas, Table 9-1: torsional flexibility = L/(GJ)

#[test]
fn validation_torsion_stiffness_section_comparison() {
    let l: f64 = 4.0;
    let n = 4;
    let t = 10.0;
    let j1 = J;
    let j2 = 3.0 * J; // three times larger

    let fixed = vec![true, true, true, true, true, true];

    let input1 = make_3d_beam(n, l, E, NU, A, IY, IZ, j1,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);

    let input2 = make_3d_beam(n, l, E, NU, A, IY, IZ, j2,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);

    let res1 = linear::solve_3d(&input1).unwrap();
    let res2 = linear::solve_3d(&input2).unwrap();

    let phi1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();
    let phi2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();

    // φ₁/φ₂ should equal J₂/J₁ = 3.0
    let ratio = phi1 / phi2;
    let expected = j2 / j1;
    let err = (ratio - expected).abs() / expected;
    assert!(err < 0.02,
        "Torsion stiffness: φ₁/φ₂={:.3}, expected J₂/J₁={:.1}, err={:.1}%",
        ratio, expected, err * 100.0);

    // Larger J gives smaller twist
    assert!(phi1 > phi2,
        "Larger J → smaller twist: φ₁={:.6e} > φ₂={:.6e}", phi1, phi2);
}

// ================================================================
// 3. L-Frame: Out-of-Plane Load Induces Torsion
// ================================================================
//
// L-shaped frame in the XZ plane: beam 1 along X (fixed), beam 2 along Z.
// Vertical load at free end of beam 2 → torsion in beam 1.
//
// At the L-joint (node 2): bending in beam 2 transfers as torsion into beam 1.
// Beam 1 carries the torsional moment equal to V×L₂ (reaction arm).
//
// Ref: Przemieniecki, "Theory of Matrix Structural Analysis" Ch. 3.5

#[test]
fn validation_torsion_l_frame_induced() {
    let l1: f64 = 4.0; // beam 1 along X
    let l2: f64 = 3.0; // beam 2 along Z
    let p: f64  = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),   // fixed end
        (2, l1,  0.0, 0.0),   // L-joint
        (3, l1,  0.0, l2),    // free tip
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // fully fixed at node 1
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global vertical equilibrium: ΣFy = P
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.fy, p, 0.01, "L-frame: R_y = P");

    // Torsional moment at fixed end = p × l2 (load arm is l2 about X-axis)
    let mx_expected = p * l2;
    assert_close(r1.mx.abs(), mx_expected, 0.05,
        "L-frame: torsion Mx = P×L2 at fixed end");

    // Beam 1 is carrying torsion: its torsional DOF must be active
    let joint = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    // Node 2 (L-joint) should have rotation about X (torsion in beam 1)
    assert!(joint.rx.abs() > 1e-8,
        "L-joint should rotate in torsion: rx={:.6e}", joint.rx);
}

// ================================================================
// 4. Fixed-Fixed Beam Under Midspan Torque: Reactions = T/2
// ================================================================
//
// Beam fixed at both ends, torque T applied at midspan (n/2+1).
// By symmetry of the structure (torsional stiffness equal on each side):
//   each end reaction carries T/2.
//
// Ref: Roark's Formulas §9.1; also Gere & Goodno Ch. 3

#[test]
fn validation_torsion_fixed_fixed_midspan_torque() {
    let l: f64 = 8.0;
    let n = 8;
    let t = 16.0;
    let mid = n / 2 + 1;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        Some(vec![true, true, true, true, true, true]),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: mid, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // Each end should react with T/2 in opposing direction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.mx.abs(), t / 2.0, 0.02,
        "Fixed-fixed: start reaction Mx = T/2");
    assert_close(rn.mx.abs(), t / 2.0, 0.02,
        "Fixed-fixed: end reaction Mx = T/2");

    // Reactions are in opposite directions (opposing applied torque)
    let sum_mx: f64 = results.reactions.iter().map(|r| r.mx).sum();
    let err = (sum_mx + t).abs() / t;
    assert!(err < 0.01,
        "Torsion global equilibrium: ΣMx={:.4}, T={:.4}", sum_mx, t);
}

// ================================================================
// 5. Distributed Torque: φ_tip = t_x L²/(2GJ)
// ================================================================
//
// Cantilever beam (fixed at x=0) with uniformly distributed torque t_x per unit length.
// Angle of twist at tip: φ(L) = t_x × L² / (2G·J)
//
// Ref: Timoshenko & Gere, "Theory of Elastic Stability" §2.1

#[test]
fn validation_torsion_distributed_torque_cantilever() {
    let l: f64 = 4.0;
    let n = 8;
    let t_dist = 2.0; // kN·m/m distributed torque
    let g = E * 1000.0 / (2.0 * (1.0 + NU));

    // Apply distributed torque as nodal loads at each intermediate node
    // Each element has length l/n; carry t_x×(l/n) to each node
    let elem_len = l / n as f64;
    let mut loads = Vec::new();
    // Interior nodes get full tributary torque; tip gets half
    for i in 1..=n {
        let tributary = if i == n { elem_len / 2.0 } else { elem_len };
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: i + 1,
            fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t_dist * tributary, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed at A
        None,
        loads,
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // φ_tip = t_x × L² / (2 G J)
    let phi_exact = t_dist * l * l / (2.0 * g * J);
    let err = (tip.rx.abs() - phi_exact).abs() / phi_exact;
    assert!(err < 0.10,
        "Distributed torque: φ_tip={:.6e}, exact={:.6e}, err={:.1}%",
        tip.rx.abs(), phi_exact, err * 100.0);

    // Tip must rotate
    assert!(tip.rx.abs() > 1e-6,
        "Tip must rotate under distributed torque: rx={:.6e}", tip.rx);
}

// ================================================================
// 6. Coupled Bending-Torsion: Off-Center Load
// ================================================================
//
// Beam fixed at A (x=0). Load at tip applied at (y=e, z=0) offset from axis.
// A vertical load at offset e from the centroid creates a torque T = P×e
// in addition to the bending from P. Both effects add independently.
// We model this as P (vertical) + P×e (torque) applied at the node.
//
// Superposition: φ_torsion = T×L/(GJ) and δ_bending = FL³/(3EIz)
//
// Ref: Gere & Goodno, §6.3 combined loading

#[test]
fn validation_torsion_coupled_bending_torsion() {
    let l: f64 = 3.0;
    let n = 6;
    let fz: f64 = -10.0;  // vertical load (bending)
    let e  = 0.05_f64;    // eccentricity (m)
    let t_induced = fz.abs() * e; // induced torque = P × e
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    // Apply both vertical load and induced torque at tip
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz,
            mx: t_induced, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Bending deflection: δz = FL³/(3EIy)
    let delta_z_exact = fz.abs() * l.powi(3) / (3.0 * e_eff * IY);
    let err_bending = (tip.uz.abs() - delta_z_exact).abs() / delta_z_exact;
    assert!(err_bending < 0.05,
        "Coupled: bending uz={:.6e}, exact={:.6e}, err={:.1}%",
        tip.uz.abs(), delta_z_exact, err_bending * 100.0);

    // Torsion angle: φ = TL/(GJ)
    let phi_exact = t_induced * l / (g * J);
    let err_torsion = (tip.rx.abs() - phi_exact).abs() / phi_exact;
    assert!(err_torsion < 0.05,
        "Coupled: torsion rx={:.6e}, exact={:.6e}, err={:.1}%",
        tip.rx.abs(), phi_exact, err_torsion * 100.0);

    // Both effects present simultaneously
    assert!(tip.uz.abs() > 1e-6,
        "Coupled: bending present: uz={:.6e}", tip.uz);
    assert!(tip.rx.abs() > 1e-6,
        "Coupled: torsion present: rx={:.6e}", tip.rx);
}

// ================================================================
// 7. GJ Proportionality: Double J → Half Twist
// ================================================================
//
// For a cantilever under fixed torque T:
//   φ = TL/(GJ)
// Doubling J while keeping everything else constant halves φ.
//
// Ref: Roark's Formulas §9.1

#[test]
fn validation_torsion_gj_proportionality() {
    let l: f64 = 5.0;
    let n = 4;
    let t = 15.0;

    let fixed = vec![true, true, true, true, true, true];

    // Case 1: J = J_base
    let input1 = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);

    // Case 2: J = 2 × J_base
    let input2 = make_3d_beam(n, l, E, NU, A, IY, IZ, 2.0 * J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);

    let res1 = linear::solve_3d(&input1).unwrap();
    let res2 = linear::solve_3d(&input2).unwrap();

    let phi1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();
    let phi2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();

    // φ₁/φ₂ should equal 2 (since J₂ = 2·J₁ → φ₂ = φ₁/2)
    let ratio = phi1 / phi2;
    let err = (ratio - 2.0).abs() / 2.0;
    assert!(err < 0.02,
        "GJ proportionality: φ₁/φ₂={:.3}, expected 2.0, err={:.1}%",
        ratio, err * 100.0);

    // Also verify against analytical formula
    let g = E * 1000.0 / (2.0 * (1.0 + NU));
    let phi_exact = t * l / (g * J);
    let err_abs = (phi1 - phi_exact).abs() / phi_exact;
    assert!(err_abs < 0.05,
        "GJ: φ₁={:.6e}, analytical={:.6e}, err={:.1}%",
        phi1, phi_exact, err_abs * 100.0);
}

// ================================================================
// 8. Space-Frame Joint Torsion Equilibrium: ΣM_x = 0
// ================================================================
//
// T-shaped 3D frame: two beams meeting at a joint, one along X, one along Z.
// A torque is applied at the free end of beam along Z.
// At the joint: the torque distributes between the two beams
// according to torsional stiffness. Global equilibrium requires ΣMx = 0.
//
// Ref: Przemieniecki, "Theory of Matrix Structural Analysis" §3.5

#[test]
fn validation_torsion_space_frame_joint_equilibrium() {
    let la: f64 = 4.0; // arm along X (both sides of joint)
    let lb: f64 = 5.0; // torque-carrying leg along Z
    let t = 20.0;

    // T-frame: node 1 (left fixed), node 2 (joint), node 3 (right fixed), node 4 (free end)
    // Beam 1: 1–2 along X
    // Beam 2: 2–3 along X (other side)
    // Beam 3: 2–4 along Z (torque applied at 4)
    let nodes = vec![
        (1, -la, 0.0, 0.0),  // left fixed support
        (2,  0.0, 0.0, 0.0), // joint
        (3,  la,  0.0, 0.0), // right fixed support
        (4,  0.0, 0.0, lb),  // free end along Z
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 2, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: t, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global moment equilibrium: ΣMx_reactions + T = 0
    let sum_mx: f64 = results.reactions.iter().map(|r| r.mx).sum();
    let eq_err = (sum_mx + t).abs() / t;
    assert!(eq_err < 0.01,
        "Space-frame joint: ΣMx={:.4}, applied T={:.4}, eq err={:.2}%",
        sum_mx, t, eq_err * 100.0);

    // Both supports carry torsional reactions (distributed between them)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert!(r1.mx.abs() > 1e-3,
        "Support 1 carries torsion: Mx={:.6}", r1.mx);
    assert!(r3.mx.abs() > 1e-3,
        "Support 3 carries torsion: Mx={:.6}", r3.mx);

    // By symmetry of the two-arm T-frame: each support carries T/2
    assert_close(r1.mx.abs(), t / 2.0, 0.05,
        "Symmetric T-frame: support 1 Mx = T/2");
    assert_close(r3.mx.abs(), t / 2.0, 0.05,
        "Symmetric T-frame: support 3 Mx = T/2");

    // The joint should rotate (torsion propagates up the Z-beam)
    let joint = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(joint.rx.abs() > 1e-8,
        "Joint twists under applied torque: rx={:.6e}", joint.rx);
}
