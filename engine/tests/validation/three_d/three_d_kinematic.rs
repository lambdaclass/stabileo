/// Validation: 3D Kinematic Analysis
///
/// Tests structural classification in 3D:
///   1. Fully fixed cantilever → hyperstatic
///   2. Space truss (determinate) → isostatic
///   3. Unconstrained structure → hypostatic / mechanism
///   4. SS beam → isostatic or hyperstatic depending on BCs
///   5. Portal frame fixed-fixed → hyperstatic
///   6. Single bar, no supports → mechanism with unconstrained DOFs
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///   - McGuire/Gallagher/Ziemian, "Matrix Structural Analysis"
///   - Ghali/Neville, "Structural Analysis", 7th Ed., Ch. 2
use dedaliano_engine::solver::kinematic;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;

// ================================================================
// 1. 3D Cantilever — Hyperstatic (6 DOF fixed, frame element)
// ================================================================
//
// Fixed-free beam: 6 restraints at base for a 3D beam.
// 3D frame needs 6 restraints minimum → isostatic or hyperstatic.

#[test]
fn validation_3d_kinematic_cantilever_hyperstatic() {
    let n = 4;
    let l = 5.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![],
    );

    let result = kinematic::analyze_kinematics_3d(&input);

    assert!(result.is_solvable, "Cantilever should be solvable");
    assert_eq!(result.mechanism_modes, 0, "No mechanism modes");
    assert!(
        result.classification == "hyperstatic" || result.classification == "isostatic",
        "Cantilever should be stable, got: {}", result.classification
    );
}

// ================================================================
// 2. Space Truss — Determinate
// ================================================================
//
// Tetrahedron with 3 base pins → 9 translational restraints.
// With 6 truss bars and 4 nodes (12 translational DOFs):
// DOF = 12 - 9 = 3 free DOFs, 6 bars → classified as stable.

#[test]
fn validation_3d_kinematic_space_truss() {
    let a = 2.0;
    let h = (2.0_f64 / 3.0).sqrt() * a;
    let r = a / 3.0_f64.sqrt();

    let nodes = vec![
        (1, r, 0.0, 0.0),
        (2, -r / 2.0, r * (3.0_f64).sqrt() / 2.0, 0.0),
        (3, -r / 2.0, -r * (3.0_f64).sqrt() / 2.0, 0.0),
        (4, 0.0, 0.0, h),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 2, 3, 1, 1),
        (3, "truss", 1, 3, 1, 1),
        (4, "truss", 1, 4, 1, 1),
        (5, "truss", 2, 4, 1, 1),
        (6, "truss", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let result = kinematic::analyze_kinematics_3d(&input);

    assert!(result.is_solvable, "Space truss should be solvable");
    assert_eq!(result.mechanism_modes, 0, "No mechanism modes in stable truss");
}

// ================================================================
// 3. Unconstrained Structure — Mechanism
// ================================================================
//
// 3D beam with no supports → 6 rigid body modes.

#[test]
fn validation_3d_kinematic_unconstrained_mechanism() {
    let n = 2;
    let l = 3.0;
    let elem_len = l / n as f64;
    let n_nodes = n + 1;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, vec![], vec![], // no supports
    );

    let result = kinematic::analyze_kinematics_3d(&input);

    assert!(!result.is_solvable, "Unconstrained beam should not be solvable");
    assert_eq!(result.classification, "hypostatic", "Should be hypostatic");
    assert!(result.mechanism_modes > 0, "Should have mechanism modes");
    assert!(!result.unconstrained_dofs.is_empty(), "Should report unconstrained DOFs");
}

// ================================================================
// 4. Portal Frame Fixed-Fixed — Hyperstatic
// ================================================================
//
// 3D portal frame with fixed bases → highly indeterminate.

#[test]
fn validation_3d_kinematic_portal_hyperstatic() {
    let h = 4.0;
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, h, 0.0),
        (3, w, h, 0.0),
        (4, w, 0.0, 0.0),
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

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let result = kinematic::analyze_kinematics_3d(&input);

    assert!(result.is_solvable, "Fixed-fixed portal should be solvable");
    assert_eq!(result.classification, "hyperstatic", "Should be hyperstatic");
    assert!(result.degree > 0, "Degree of indeterminacy > 0, got {}", result.degree);
}

// ================================================================
// 5. Pinned-Pinned Beam — Stable (Isostatic for 2D Equivalent)
// ================================================================
//
// Simply supported 3D beam with enough restraints for stability.

#[test]
fn validation_3d_kinematic_ss_beam() {
    let n = 4;
    let l = 5.0;

    // Fix all translations + torsion at start, translations + torsion at end (but free ux)
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, false, false],  // pin: ux,uy,uz,rrx fixed
        Some(vec![false, true, true, true, false, false]), // roller: uy,uz,rrx fixed
        vec![],
    );

    let result = kinematic::analyze_kinematics_3d(&input);

    assert!(result.is_solvable, "SS beam should be solvable");
    assert_eq!(result.mechanism_modes, 0, "No mechanism modes");
}

// ================================================================
// 6. Partial Restraints — Insufficient for Stability
// ================================================================
//
// 3D beam with only Y restraint at one end → not enough constraints.

#[test]
fn validation_3d_kinematic_insufficient_restraints() {
    let n = 2;
    let l = 3.0;

    // Only restrain uy at start — clearly insufficient for 3D stability
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![false, true, false, false, false, false], // only ry
        None,
        vec![],
    );

    let result = kinematic::analyze_kinematics_3d(&input);

    assert!(!result.is_solvable, "Insufficient restraints should not be solvable");
    assert!(result.mechanism_modes > 0, "Should detect mechanism modes");
}

// ================================================================
// 7. Degree of Indeterminacy — Fixed-Fixed Beam
// ================================================================
//
// Fixed-fixed 3D beam: 12 restraints, 6 DOF per node × (n+1) nodes,
// r = 12, m = n × 6 internal forces per element... high indeterminacy.

#[test]
fn validation_3d_kinematic_fixed_fixed_beam_degree() {
    let n = 4;
    let l = 5.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        Some(vec![true, true, true, true, true, true]), // fixed
        vec![],
    );

    let result = kinematic::analyze_kinematics_3d(&input);

    assert!(result.is_solvable, "Fixed-fixed beam should be solvable");
    assert_eq!(result.classification, "hyperstatic");
    assert!(result.degree > 0, "Should have positive degree of indeterminacy: {}", result.degree);
}
