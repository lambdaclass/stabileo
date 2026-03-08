/// Validation: Mechanism Detection and Structural Classification
///
/// Reference: Ghali/Neville *Structural Analysis* (degree of indeterminacy formulas).
///
/// Tests: isostatic, hyperstatic, mechanism detection, truss formulae.
mod helpers;

use dedaliano_engine::solver::kinematic;

#[allow(unused_imports)]
use helpers::*;

const E: f64 = 200_000.0;

// ═══════════════════════════════════════════════════════════════
// 1. Isostatic Beam (Simply-Supported)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kinematic_isostatic_beam() {
    // SS beam: 3 DOFs per node, 2 nodes, pin + roller = 3 restraints
    // r=3, m=1 frame member, n=2 nodes, c=0 hinges
    // GH = 3*1 + 0 + 3 - 3*2 - 0 = 0 → determinate
    let input = make_beam(
        1, 10.0, E, 0.01, 1e-4,
        "pinned", Some("rollerX"),
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 0, "SS beam should be degree 0 (determinate)");
    assert!(result.is_solvable, "SS beam should be solvable");
    assert_eq!(result.mechanism_modes, 0, "SS beam: no mechanism modes");
}

// ═══════════════════════════════════════════════════════════════
// 2. Hyperstatic Beam (Fixed-Fixed)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kinematic_hyperstatic_beam() {
    // Fixed-fixed beam: 6 restraints, 1 frame member, 2 nodes
    // GH = 3*1 + 0 + 6 - 3*2 = 3 → 3x indeterminate
    let input = make_beam(
        1, 10.0, E, 0.01, 1e-4,
        "fixed", Some("fixed"),
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    assert!(result.degree > 0, "Fixed-fixed beam should be hyperstatic, got degree={}", result.degree);
    assert!(result.is_solvable, "Fixed-fixed beam should be solvable");
    assert_eq!(result.mechanism_modes, 0, "Fixed-fixed beam: no mechanism modes");
}

// ═══════════════════════════════════════════════════════════════
// 3. Mechanism: 3-hinge beam (frame with too many hinges)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kinematic_mechanism_3_hinges() {
    // Pin-pin beam with internal hinge → mechanism
    // 2 frame elements with hinge at shared node = 3 "hinges" total
    // GH = 3*2 + 0 + 3 - 3*3 - 2(hinge releases) = 6 + 3 - 9 - 2 = -2
    // This creates a mechanism.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0), (3, 10.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),  // hinge at node 2 (end of elem 1)
            (2, "frame", 2, 3, 1, 1, true, false),   // hinge at node 2 (start of elem 2)
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    assert!(result.degree < 0, "3-hinge SS beam should be mechanism, got degree={}", result.degree);
    assert!(!result.is_solvable, "mechanism should not be solvable");
    assert!(result.mechanism_modes > 0, "should have mechanism modes");
}

// ═══════════════════════════════════════════════════════════════
// 4. Mechanism: Unrestrained Node
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kinematic_unrestrained_node() {
    // A node with no support and only connected by a hinge (truss-like)
    // but no member → floating node
    // Node 3 is not connected to anything and has no support
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0), (3, 10.0, 5.0)],
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    // Node 3 is free-floating: not connected, not supported
    assert!(!result.is_solvable, "unrestrained node should make structure unsolvable");
    assert!(result.mechanism_modes > 0 || !result.unconstrained_dofs.is_empty(),
        "should detect unconstrained DOFs or mechanism");
}

// ═══════════════════════════════════════════════════════════════
// 5. Determinate Truss: m + r = 2j
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kinematic_determinate_truss() {
    // Simple triangular truss: 3 bars, 3 nodes, pin + roller = 3 restraints
    // m + r = 3 + 3 = 6 = 2*3 = 2j → determinate
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 1e-8)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 1, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 0, "determinate truss: m+r=2j → degree=0, got {}", result.degree);
    assert!(result.is_solvable, "determinate truss should be solvable");
}

// ═══════════════════════════════════════════════════════════════
// 6. Indeterminate Truss: Extra Bar
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kinematic_indeterminate_truss() {
    // Quadrilateral truss with both diagonals: 6 bars, 4 nodes,
    // pin + roller = 3 restraints
    // m + r = 6 + 3 = 9 > 2*4 = 8 → degree = 1 (indeterminate)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 4.0, 3.0), (4, 0.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 1e-8)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false), // bottom
            (2, "truss", 2, 3, 1, 1, false, false), // right
            (3, "truss", 3, 4, 1, 1, false, false), // top
            (4, "truss", 4, 1, 1, 1, false, false), // left
            (5, "truss", 1, 3, 1, 1, false, false), // diagonal 1
            (6, "truss", 2, 4, 1, 1, false, false), // diagonal 2
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );

    let result = kinematic::analyze_kinematics_2d(&input);
    assert!(result.degree > 0, "indeterminate truss: degree={}, expected > 0", result.degree);
    assert!(result.is_solvable, "indeterminate truss should be solvable");
}
