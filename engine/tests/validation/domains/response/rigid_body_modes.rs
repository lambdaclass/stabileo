/// Validation: Rigid Body Mode Detection and Near-Singularity
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 1 & 3
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 3
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 2
///   - Cook, Malkus & Plesha, "Concepts and Applications of FEA", 4th Ed.
///
/// Tests verify stability classification and mechanism detection:
///   1. Free beam (no supports): mechanism — structure is a rigid body
///   2. Single roller only: insufficient horizontal restraint
///   3. Two collinear roller supports: no rotational restraint
///   4. Simply-supported beam: minimum valid restraint — solver succeeds
///   5. Fixed beam at both ends: over-constrained but valid, zero displacements
///   6. Adding supports transitions from mechanism to stable structure
///   7. Triangular truss with exactly enough supports: just-stable
///   8. 3D beam with all 6 DOF restrained at one end: valid cantilever
use dedaliano_engine::solver::kinematic;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Free Beam (No Supports): Mechanism
// ================================================================
//
// A beam element with no supports is a rigid body: it can translate
// in x, translate in y, and rotate. This is 3 mechanism modes for
// a 2D frame (or more if the structure is larger).
// The stiffness matrix is singular — not solvable.
//
// Ref: Przemieniecki, "Theory of Matrix Structural Analysis", p. 87

#[test]
fn validation_rigid_body_free_beam_unsolvable() {
    // Single beam element, no supports at all
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![], // no supports
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    // GH = 3*1 + 0 - 3*2 = -3 (3 mechanism modes)
    assert!(!result.is_solvable,
        "Free beam should not be solvable (rigid body modes): is_solvable={}",
        result.is_solvable);
    assert!(result.degree < 0,
        "Free beam should have negative degree (mechanism): degree={}",
        result.degree);
    assert!(result.mechanism_modes > 0,
        "Free beam should have mechanism modes: mechanism_modes={}",
        result.mechanism_modes);
}

// ================================================================
// 2. Single Roller: Insufficient Restraints
// ================================================================
//
// A single rollerX support provides only 1 reaction (Ry).
// The beam can still translate in X and rotate → 2 mechanism modes.
// GH = 3*1 + 1 - 3*2 = -2 → hypostatic (mechanism).
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., p. 22

#[test]
fn validation_rigid_body_single_roller_unsolvable() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "rollerX")], // only 1 restraint
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    assert!(!result.is_solvable,
        "Single roller should be unsolvable: is_solvable={}", result.is_solvable);
    assert!(result.degree < 0,
        "Single roller: degree={}, expected < 0", result.degree);
}

// ================================================================
// 3. Two Collinear Rollers: No Rotational Restraint
// ================================================================
//
// Two rollerX supports at x=0 and x=L both provide only Ry.
// The beam can still rotate as a rigid body about any point.
// GH = 3*1 + 2 - 3*2 = -1 → 1 mechanism mode.
//
// Ref: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", p. 48

#[test]
fn validation_rigid_body_collinear_rollers_unsolvable() {
    // Two rollerX supports on horizontal beam → no x-restraint, no rotation restraint
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0), (3, 10.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "rollerX"), (2, 3, "rollerX")], // both are rollerX (only Ry)
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    // GH = 3*2 + 2 - 3*3 = 6 + 2 - 9 = -1 → mechanism
    assert!(!result.is_solvable,
        "Two collinear rollers: not solvable due to missing x-restraint");
    assert!(result.degree < 0,
        "Two rollerX supports: degree={}, expected < 0", result.degree);
}

// ================================================================
// 4. Properly Restrained Beam: Minimum Valid Support
// ================================================================
//
// Simply-supported beam (pinned + rollerX) = 3 restraints.
// GH = 3*1 + 3 - 3*2 = 0 → statically determinate, solvable.
// The linear solver should return a valid result.
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., p. 18

#[test]
fn validation_rigid_body_ss_beam_valid() {
    let l = 6.0;
    let n = 2; // 2 elements, 3 nodes: midspan at node 2
    let p = 10.0;

    // Load at midspan node (node 2 with n=2 elements)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);

    // Kinematic check: should be solvable
    let kin = kinematic::analyze_kinematics_2d(&input);
    assert!(kin.is_solvable,
        "SS beam should be solvable: degree={}", kin.degree);
    assert_eq!(kin.degree, 0,
        "SS beam should be statically determinate: degree={}", kin.degree);

    // Linear solver should succeed
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_B = P/2 (midspan load, symmetric)
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    assert_close(r_a, p / 2.0, 0.02, "SS beam: R_A = P/2");
    assert_close(r_b, p / 2.0, 0.02, "SS beam: R_B = P/2");
}

// ================================================================
// 5. Over-Constrained Beam: Zero Displacement at All Supports
// ================================================================
//
// A fixed-fixed beam (2 fixed supports) is 3x statically indeterminate.
// All displacements and rotations at the support nodes must be zero
// since both ends are fully fixed.
//
// Ref: Przemieniecki, "Theory of Matrix Structural Analysis", p. 92

#[test]
fn validation_rigid_body_fixed_fixed_zero_disp() {
    let l = 6.0;
    let n = 4;
    let q: f64 = 10.0;

    // UDL on fixed-fixed beam
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);

    // Over-constrained but valid
    let kin = kinematic::analyze_kinematics_2d(&input);
    assert!(kin.is_solvable,
        "Fixed-fixed should be solvable: degree={}", kin.degree);
    assert!(kin.degree > 0,
        "Fixed-fixed should be over-constrained: degree={}", kin.degree);

    // Solve
    let results = linear::solve_2d(&input).unwrap();

    // Support nodes (1 and n+1) should have zero displacements
    let d_start = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end   = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert!(d_start.ux.abs() < 1e-10, "Fixed end ux should be 0: got {:.2e}", d_start.ux);
    assert!(d_start.uy.abs() < 1e-10, "Fixed end uy should be 0: got {:.2e}", d_start.uy);
    assert!(d_start.rz.abs() < 1e-10, "Fixed end rz should be 0: got {:.2e}", d_start.rz);
    assert!(d_end.ux.abs() < 1e-10, "Fixed end ux should be 0: got {:.2e}", d_end.ux);
    assert!(d_end.uy.abs() < 1e-10, "Fixed end uy should be 0: got {:.2e}", d_end.uy);
    assert!(d_end.rz.abs() < 1e-10, "Fixed end rz should be 0: got {:.2e}", d_end.rz);

    // Interior nodes should have non-zero displacements under load
    let d_mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert!(d_mid.uy.abs() > 1e-6,
        "Interior node should deflect: uy={:.2e}", d_mid.uy);
}

// ================================================================
// 6. Adding Restraints: Mechanism → Stable Structure
// ================================================================
//
// Start with an under-restrained beam and progressively add supports:
//   Step 1: rollerX only → mechanism (GH = -2)
//   Step 2: pinned at same node → determinate (GH = 0)
// This tests that each additional restraint reduces the mechanism count.
//
// Ref: Cook, Malkus & Plesha, "Concepts and Applications of FEA", p. 96

#[test]
fn validation_rigid_body_add_restraints_stability() {
    // Step 1: single rollerX → mechanism
    let input_roller = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "rollerX")],
        vec![],
    );
    let kin_roller = kinematic::analyze_kinematics_2d(&input_roller);
    assert!(!kin_roller.is_solvable,
        "Step 1 (roller only): should be unsolvable, degree={}",
        kin_roller.degree);

    // Step 2: add pinned at same node → replaces rollerX with pinned (2 restraints)
    // Still only 2 restraints, so GH = 3+2-6 = -1
    let input_pinned_only = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned")], // pinned at left only (2 restraints, no moment)
        vec![],
    );
    let kin_pin_only = kinematic::analyze_kinematics_2d(&input_pinned_only);
    // GH = 3*1 + 2 - 3*2 = -1 → still mechanism
    assert!(!kin_pin_only.is_solvable,
        "Pinned only: should still be unsolvable, degree={}",
        kin_pin_only.degree);
    assert!(kin_pin_only.degree > kin_roller.degree,
        "Adding pin should increase degree: {} > {}", kin_pin_only.degree, kin_roller.degree);

    // Step 3: pinned + rollerX → determinate
    let input_ss = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );
    let kin_ss = kinematic::analyze_kinematics_2d(&input_ss);
    assert!(kin_ss.is_solvable,
        "Pinned+rollerX: should be solvable, degree={}", kin_ss.degree);
    assert_eq!(kin_ss.degree, 0,
        "Pinned+rollerX: should be determinate (degree=0), got {}", kin_ss.degree);
}

// ================================================================
// 7. Triangular Truss with Just Enough Supports
// ================================================================
//
// A simple triangular truss (3 bars, 3 nodes) needs exactly 3 supports.
// m + r = 2n for a determinate truss: 3 + 3 = 2*3 = 6.
// With pinned + rollerX, this is exactly stable and determinate.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Section 3-1

#[test]
fn validation_rigid_body_truss_minimum_supports() {
    let p = 20.0; // kN downward at apex

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, 1e-8)], // truss: IZ ≈ 0
        vec![
            (1, "truss", 1, 2, 1, 1, false, false), // bottom chord
            (2, "truss", 1, 3, 1, 1, false, false), // left diagonal
            (3, "truss", 2, 3, 1, 1, false, false), // right diagonal
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    // Kinematic: just-determined
    let kin = kinematic::analyze_kinematics_2d(&input);
    assert!(kin.is_solvable,
        "Triangular truss should be solvable: degree={}", kin.degree);
    assert_eq!(kin.degree, 0,
        "Triangular truss: m+r=2n gives degree=0, got {}", kin.degree);

    // Linear solve should succeed
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: vertical reactions sum to P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Truss ΣRy = P");

    // Horizontal reactions sum to zero (no horizontal load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.01 * p,
        "Truss ΣRx = 0, got {:.6}", sum_rx);

    // By symmetry (apex at midspan), R_A = R_B = P/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    assert_close(r_a, p / 2.0, 0.02, "Truss R_A = P/2");
    assert_close(r_b, p / 2.0, 0.02, "Truss R_B = P/2");
}

// ================================================================
// 8. 3D Beam with All 6 DOF Restrained: Valid Cantilever Solution
// ================================================================
//
// A 3D cantilever with all 6 DOF fixed at the base can be solved
// by the linear 3D solver. Under a tip load Fy, deflection should
// match the beam formula: δ = PL³/(3EI).
//
// Ref: Timoshenko & Goodier, "Theory of Elasticity", Appendix A

#[test]
fn validation_rigid_body_3d_fully_restrained_valid() {
    let l = 3.0;
    let n = 4;
    let p = 15.0; // kN tip load in Y
    let e_eff = E * 1000.0; // kN/m²

    // All 6 DOF restrained at start (full cantilever)
    let full_fix = vec![true, true, true, true, true, true];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(
        n, l, E, 0.3, A,
        IZ, // iy
        IZ, // iz
        1.5e-4, // j
        full_fix,
        None, // free tip
        loads,
    );

    // This should succeed (fully restrained = no rigid body modes)
    let results = linear::solve_3d(&input).unwrap();

    // Tip deflection: δ = PL³/(3EI_z) for Fy load
    let delta_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uy.abs(), delta_exact, 0.05,
        "3D cantilever: δ = PL³/(3EI)");

    // Root node (node 1) should have zero displacements (fully fixed)
    let root = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(root.ux.abs() < 1e-10, "Root ux=0: got {:.2e}", root.ux);
    assert!(root.uy.abs() < 1e-10, "Root uy=0: got {:.2e}", root.uy);
    assert!(root.uz.abs() < 1e-10, "Root uz=0: got {:.2e}", root.uz);
    assert!(root.rx.abs() < 1e-10, "Root rx=0: got {:.2e}", root.rx);
    assert!(root.ry.abs() < 1e-10, "Root ry=0: got {:.2e}", root.ry);
    assert!(root.rz.abs() < 1e-10, "Root rz=0: got {:.2e}", root.rz);

    // Fixed end reaction: Fy = P, Mz = -P*L
    let r_root = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_root.fy, p, 0.01, "3D cantilever: root reaction Fy = P");
    assert_close(r_root.mz.abs(), p * l, 0.02, "3D cantilever: root moment Mz = PL");
}
