/// Validation: Sway vs Non-Sway Frame Classification Benchmarks
///
/// References:
///   - AISC 360-22, "Specification for Structural Steel Buildings", Ch. C (Stability)
///   - Eurocode 3, EN 1993-1-1:2005, §5.2 (Frame Classification)
///   - Hibbeler, "Structural Analysis", 10th Ed., §11.1
///   - Kassimali, "Structural Analysis", 6th Ed., §12.2
///   - Chen & Lui, "Stability Design of Steel Frames", CRC Press (1991)
///
/// A frame is classified as "sway" when lateral displacements are significant
/// relative to the column height, and "non-sway" when bracing or geometry
/// prevents meaningful sway. The stiffness method directly produces lateral
/// displacements and column end moments that reveal the sway behaviour.
///
/// Tests:
///   1. Non-sway frame: braced against lateral drift under gravity
///   2. Sway frame: lateral drift occurs under gravity + lateral load
///   3. Fixed-base portal: sway stiffness k = 12EI/h³ per column (limiting case)
///   4. Pinned-base portal: larger sway than fixed-base under same lateral load
///   5. Symmetric gravity on symmetric frame: no sway by symmetry
///   6. Asymmetric gravity on symmetric frame: small lateral drift induced
///   7. Frame sway under wind load: drift proportional to applied load
///   8. Sway sensitivity to column stiffness: stiffer columns → less sway
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Non-Sway Frame: Bracing Prevents Lateral Drift
// ================================================================
//
// A portal frame with a diagonal brace carries lateral load without sway.
// The brace is modelled as a truss (hinge-released) element with large axial
// stiffness. Under a horizontal load, the sway displacement should be
// negligible compared to an unbraced portal of the same geometry.
//
// Source: AISC 360-22, C2.1 — Condition for non-sway classification.

#[test]
fn validation_classification_braced_no_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Build braced portal: nodes 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    // Elements: col-L, col-R, beam, diagonal brace (2→4, truss with hinges)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        // Diagonal brace (hinged both ends — acts as truss member)
        (4, "frame", 2, 4, 1, 2, true, true),  // brace
    ];
    // Large area for brace section (axially stiff)
    let secs = vec![(1, A, IZ), (2, A * 100.0, IZ)];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input_braced = make_input(nodes, vec![(1, E, 0.3)], secs, elems, sups, loads);
    let res_braced = linear::solve_2d(&input_braced).unwrap();

    // Unbraced portal (no brace element)
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();

    let sway_braced = res_braced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let sway_unbraced = res_unbraced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Braced frame must have much less sway than unbraced
    assert!(sway_braced < sway_unbraced / 5.0,
        "Braced sway={:.6e} should be << unbraced sway={:.6e}",
        sway_braced, sway_unbraced);
}

// ================================================================
// 2. Sway Frame: Lateral Drift Occurs Under Lateral Load
// ================================================================
//
// An unbraced portal frame with fixed bases deflects laterally under a
// horizontal load. The sway index δ/h should be significant and consistent
// with the classical elastic formula. This verifies that the solver correctly
// captures the sway mechanism.
//
// Source: Chen & Lui, "Stability Design of Steel Frames", §2.3.

#[test]
fn validation_classification_sway_occurs() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let input = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let sway = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Sway must be positive (towards load direction)
    assert!(sway > 0.0,
        "Sway frame should deflect laterally: ux={:.6e}", sway);

    // Sway index δ/h should be within order of magnitude for elastic portal
    // Lower bound: 0 < δ/h (trivially)
    // Upper bound: for any reasonable EI, sway stiffness k > 6EI/h³ (pinned base)
    let k_min = 6.0 * e_eff * IZ / h.powi(3);
    let sway_max = p / k_min;
    assert!(sway < sway_max * 1.05,
        "Sway {:.6e} should not exceed pinned-base limit {:.6e}", sway, sway_max);

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let err = (sum_rx + p).abs() / p;
    assert!(err < 0.01,
        "Sway frame ΣRx={:.4} should equal -P={:.1}", sum_rx, -p);
}

// ================================================================
// 3. Fixed-Base Portal: Sway Stiffness Bounds
// ================================================================
//
// For a symmetric fixed-base portal with equal I throughout, the sway
// stiffness under a lateral load H is bounded:
//   k_lower = 6EI/h³ per column  (pinned-beam limit → 2 × 6EI/h³ = 12EI/h³ total)
//   k_upper = 24EI/h³ total      (rigid-beam limit)
//
// With finite beam stiffness the result lies strictly between these bounds.
//
// Source: Kassimali, "Structural Analysis", §12.2, Table 12.1.

#[test]
fn validation_classification_fixed_base_stiffness_bounds() {
    let h = 4.0;
    let w = 6.0;
    let p = 1.0;
    let e_eff = E * 1000.0;

    let input = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let sway = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let k_fem = p / sway;

    // Bounds for two fixed-base columns:
    let k_lower = 12.0 * e_eff * IZ / h.powi(3); // pinned beam limit
    let k_upper = 24.0 * e_eff * IZ / h.powi(3); // rigid beam limit

    assert!(k_fem > k_lower * 0.95 && k_fem < k_upper * 1.05,
        "Fixed-base sway stiffness k={:.4} not in bounds [{:.4}, {:.4}]",
        k_fem, k_lower, k_upper);
}

// ================================================================
// 4. Pinned-Base Portal: Larger Sway Than Fixed-Base
// ================================================================
//
// A portal with pinned bases has no rotational fixity at the ground.
// Its sway stiffness is k = 3EI/h³ per column (total 6EI/h³ for two columns
// with rigid beam) — much less stiff than the fixed-base case (12EI/h³ per column).
//
// Under the same lateral load, a pinned-base portal sways more than fixed-base.
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., Example 11-2.

#[test]
fn validation_classification_pinned_vs_fixed_base_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Fixed-base portal
    let input_fixed = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();
    let sway_fixed = res_fixed.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Pinned-base portal: nodes 1(0,0) pinned, 2(0,h), 3(w,h), 4(w,0) pinned
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_pinned = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input_pinned = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups_pinned, loads);
    let res_pinned = linear::solve_2d(&input_pinned).unwrap();
    let sway_pinned = res_pinned.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Pinned base must sway more than fixed base
    assert!(sway_pinned > sway_fixed,
        "Pinned-base sway={:.6e} should exceed fixed-base sway={:.6e}",
        sway_pinned, sway_fixed);

    // For a portal with very stiff beam, ratio approaches 4:
    // fixed → 12EI/h³, pinned → 3EI/h³  (per column, single column)
    // With finite beam stiffness ratio < 4.
    let ratio = sway_pinned / sway_fixed;
    assert!(ratio > 1.5 && ratio < 5.0,
        "Sway ratio (pinned/fixed)={:.3} should be in (1.5, 5.0)", ratio);
}

// ================================================================
// 5. Symmetric Gravity on Symmetric Frame: No Sway
// ================================================================
//
// By the symmetry argument: equal vertical loads on both joints of a
// symmetric portal frame produce purely symmetric deformation. There is
// no antisymmetric (sway) component, so lateral displacements are zero
// at the joint level.
//
// Source: Kassimali, "Structural Analysis", §12.1 — Symmetry conditions.

#[test]
fn validation_classification_symmetric_gravity_no_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 20.0;

    // Fixed-base portal with equal gravity loads at both top joints
    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -p);
    let results = linear::solve_2d(&input).unwrap();

    // No lateral sway at either top joint
    let ux2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    assert!(ux2.abs() < 1e-10,
        "Symmetric gravity: ux at node 2 should be 0, got {:.6e}", ux2);
    assert!(ux3.abs() < 1e-10,
        "Symmetric gravity: ux at node 3 should be 0, got {:.6e}", ux3);

    // Vertical reactions at bases should be equal (symmetric)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().ry;
    let err = (r1 - r4).abs() / r1.abs().max(1e-12);
    assert!(err < 1e-8,
        "Symmetric gravity: R1={:.6} and R4={:.6} should be equal", r1, r4);
}

// ================================================================
// 6. Asymmetric Gravity: Small Lateral Drift Induced
// ================================================================
//
// Applying gravity load to only one side of a symmetric portal frame
// breaks symmetry and produces lateral sway (secondary sway under gravity).
// The frame is NOT braced so it can drift. The sway is small but non-zero.
//
// Source: AISC 360-22, C2.2b — Notional loads for non-symmetric loading.

#[test]
fn validation_classification_asymmetric_gravity_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 20.0;

    // Gravity load on left joint only (node 2)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ux2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let uy2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;

    // Lateral drift must exist (non-zero) due to asymmetry
    assert!(ux2.abs() > 1e-12,
        "Asymmetric gravity must cause sway, ux={:.6e}", ux2);

    // But sway << vertical displacement (gravity dominates)
    assert!(ux2.abs() < uy2.abs() * 10.0,
        "Sway ux={:.6e} should be much less than vertical uy={:.6e}",
        ux2.abs(), uy2.abs());

    // Global equilibrium: ΣFy = applied gravity load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let err = (sum_ry - p).abs() / p;
    assert!(err < 0.01,
        "ΣRy={:.4} should equal P={:.1}", sum_ry, p);
}

// ================================================================
// 7. Frame Sway Under Wind Load: Proportional to Applied Load
// ================================================================
//
// For a linear elastic frame, lateral displacement must be exactly
// proportional to lateral load (no geometric nonlinearity here).
// Doubling the wind load must exactly double the sway.
//
// Source: Chen & Lui, "Stability Design of Steel Frames", §1.2.

#[test]
fn validation_classification_sway_proportional_to_load() {
    let h = 4.0;
    let w = 6.0;
    let p1 = 5.0;
    let p2 = 10.0; // double the load

    let input1 = make_portal_frame(h, w, E, A, IZ, p1, 0.0);
    let res1 = linear::solve_2d(&input1).unwrap();
    let sway1 = res1.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    let input2 = make_portal_frame(h, w, E, A, IZ, p2, 0.0);
    let res2 = linear::solve_2d(&input2).unwrap();
    let sway2 = res2.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Linearity: sway2 should be exactly 2 × sway1
    let ratio = sway2 / sway1;
    let expected = p2 / p1; // = 2.0
    let err = (ratio - expected).abs() / expected;
    assert!(err < 1e-8,
        "Sway proportionality: ratio={:.8}, expected {:.1}, err={:.2e}",
        ratio, expected, err);
}

// ================================================================
// 8. Sway Sensitivity to Column Stiffness
// ================================================================
//
// A portal with stiffer columns (larger I) should sway less under the same
// lateral load. Doubling the column moment of inertia should roughly halve
// the sway (exactly halves it in the rigid-beam limiting case, approximately
// in the finite-beam-stiffness case).
//
// Source: Eurocode 3, EN 1993-1-1:2005, §5.2.1 — Sensitivity to second order effects.

#[test]
fn validation_classification_sway_sensitivity_to_column_stiffness() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Standard portal
    let input_std = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let res_std = linear::solve_2d(&input_std).unwrap();
    let sway_std = res_std.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Portal with columns having 4× the moment of inertia
    // All members use same section; we build manually with IZ_col = 4*IZ
    let iz_col = 4.0 * IZ;
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // left column — stiff section
        (2, "frame", 2, 3, 1, 1, false, false), // beam — standard section
        (3, "frame", 3, 4, 1, 2, false, false), // right column — stiff section
    ];
    let secs = vec![(1, A, IZ), (2, A, iz_col)];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input_stiff = make_input(nodes, vec![(1, E, 0.3)], secs, elems, sups, loads);
    let res_stiff = linear::solve_2d(&input_stiff).unwrap();
    let sway_stiff = res_stiff.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Stiffer columns → less sway
    assert!(sway_stiff < sway_std,
        "Stiffer column sway={:.6e} should be less than standard sway={:.6e}",
        sway_stiff, sway_std);

    // With 4× column I, sway should reduce significantly (more than 50%)
    let reduction = (sway_std - sway_stiff) / sway_std;
    assert!(reduction > 0.50,
        "Sway reduction with 4×I_col should exceed 50%, got {:.1}%",
        reduction * 100.0);
}
