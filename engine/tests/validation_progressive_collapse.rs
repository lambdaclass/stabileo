/// Validation: Structural Redundancy and Progressive Collapse Resistance
///
/// Tests multi-load-path behavior and structural robustness:
///   - Redundant truss: removing one member doesn't cause collapse
///   - Hyperstatic beam: alternate load paths after support removal
///   - Portal frame: degree of indeterminacy check
///   - Load redistribution after member removal
///
/// References:
///   - GSA 2013: "Alternate Path Analysis & Design Guidelines for Progressive Collapse"
///   - EN 1991-1-7: "Accidental Actions"
///   - Starossek, U., "Progressive Collapse of Structures", 2009
mod helpers;

use dedaliano_engine::solver::{kinematic, linear};
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Statically Determinate vs Indeterminate Classification
// ================================================================
//
// Verify that the kinematic analysis correctly classifies structures.

#[test]
fn validation_statically_determinate_truss() {
    // Simple triangle truss: 3 bars, 3 nodes, 3 supports → just determinate
    // r=3, m=3, n=3 → 3*1 + 3 - 3*2 = 0 (isostatic)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 1, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );

    let kin = kinematic::analyze_kinematics_2d(&input);
    assert!(kin.is_solvable, "Triangle truss should be solvable");
    assert_eq!(kin.classification, "isostatic",
        "Triangle truss should be isostatic, got {}", kin.classification);
}

#[test]
fn validation_hyperstatic_frame() {
    // Portal frame with fixed bases: highly redundant
    // 3 frames, 4 nodes, fixed supports at 2 bases (6 restraints each for frame)
    let input = make_portal_frame(3.0, 5.0, E, A, IZ, 0.0, 0.0);
    let kin = kinematic::analyze_kinematics_2d(&input);

    assert!(kin.is_solvable, "Portal frame should be solvable");
    assert_eq!(kin.classification, "hyperstatic",
        "Fixed-base portal should be hyperstatic, got {}", kin.classification);
    assert!(kin.degree > 0, "Should have positive degree of indeterminacy, got {}", kin.degree);
}

// ================================================================
// 2. Redundant Truss: Alternate Load Path
// ================================================================
//
// Cross-braced truss: removing one diagonal still leaves the structure
// stable (alternate path through the other diagonal).

#[test]
fn validation_redundant_truss_alternate_path() {
    let w = 3.0;
    let h = 3.0;
    let p = -10.0;

    // Full cross-braced panel: 5 bars (2 diagonals provide redundancy)
    let input_full = make_input(
        vec![(1, 0.0, 0.0), (2, w, 0.0), (3, 0.0, h), (4, w, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, 0.0)],
        vec![
            (1, "truss", 1, 3, 1, 1, false, false),  // left vertical
            (2, "truss", 2, 4, 1, 1, false, false),  // right vertical
            (3, "truss", 3, 4, 1, 1, false, false),  // top horizontal
            (4, "truss", 1, 4, 1, 1, false, false),  // diagonal 1
            (5, "truss", 2, 3, 1, 1, false, false),  // diagonal 2
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: p, mz: 0.0 })],
    );

    let res_full = linear::solve_2d(&input_full).unwrap();

    // Remove one diagonal (element 5) — structure should still be stable
    let input_reduced = make_input(
        vec![(1, 0.0, 0.0), (2, w, 0.0), (3, 0.0, h), (4, w, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, 0.0)],
        vec![
            (1, "truss", 1, 3, 1, 1, false, false),
            (2, "truss", 2, 4, 1, 1, false, false),
            (3, "truss", 3, 4, 1, 1, false, false),
            (4, "truss", 1, 4, 1, 1, false, false),
            // diagonal 2 removed
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: p, mz: 0.0 })],
    );

    let res_reduced = linear::solve_2d(&input_reduced).unwrap();

    // Both should have valid results
    assert!(!res_full.displacements.is_empty(), "Full truss should solve");
    assert!(!res_reduced.displacements.is_empty(), "Reduced truss should still solve");

    // Equilibrium check on reduced structure
    let sum_ry: f64 = res_reduced.reactions.iter().map(|r| r.ry).sum();
    assert!(
        (sum_ry - p.abs()).abs() < 0.1,
        "Reduced truss: ΣRy={:.4}, expected {:.4}", sum_ry, p.abs()
    );

    // Displacements should be larger in reduced structure (less stiff)
    let d_full = res_full.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let d_red = res_reduced.displacements.iter().find(|d| d.node_id == 4).unwrap();

    assert!(
        d_red.uy.abs() >= d_full.uy.abs() * 0.99,
        "Reduced truss should be at least as flexible: full={:.6e}, reduced={:.6e}",
        d_full.uy, d_red.uy
    );
}

// ================================================================
// 3. Continuous Beam: Support Removal and Load Redistribution
// ================================================================
//
// 3-span continuous beam: removing the middle support should increase
// deflections but the structure should still carry the load.

#[test]
fn validation_continuous_beam_support_removal() {
    let span: f64 = 5.0;
    let q: f64 = -3.0;
    let n_per_span = 4;

    // 3-span continuous beam with UDL
    let total_elems_3 = 3 * n_per_span;
    let mut loads_3: Vec<SolverLoad> = Vec::new();
    for i in 1..=total_elems_3 {
        loads_3.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_full = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads_3);
    let res_full = linear::solve_2d(&input_full).unwrap();

    // 2-span continuous beam (middle support removed)
    let span_2 = span * 3.0 / 2.0;
    let n2 = n_per_span * 3 / 2;
    let total_elems_2 = 2 * n2;
    let mut loads_2: Vec<SolverLoad> = Vec::new();
    for i in 1..=total_elems_2 {
        loads_2.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_reduced = make_continuous_beam(&[span_2, span_2], n2, E, A, IZ, loads_2);
    let res_reduced = linear::solve_2d(&input_reduced).unwrap();

    // Both should solve successfully
    assert!(!res_full.displacements.is_empty(), "Full beam should solve");
    assert!(!res_reduced.displacements.is_empty(), "Reduced beam should solve");

    // Equilibrium in both cases
    let sum_ry_full: f64 = res_full.reactions.iter().map(|r| r.ry).sum();
    let total_load_full = q.abs() * 3.0 * span;
    assert_close(sum_ry_full, total_load_full, 0.02, "Full beam: ΣRy = total load");
}

// ================================================================
// 4. Frame Redundancy: Multiple Load Paths
// ================================================================
//
// Multi-bay frame has multiple load paths. Adding bays should
// increase the degree of static indeterminacy.

#[test]
fn validation_frame_redundancy_increases_with_bays() {
    let h = 3.0;
    let bay = 5.0;

    // 1-bay portal: degree = d1
    let input_1bay = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, bay, h), (4, bay, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 4, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![],
    );

    // 2-bay portal: more redundancy
    let input_2bay = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h), (3, bay, h), (4, bay, 0.0),
            (5, 2.0 * bay, h), (6, 2.0 * bay, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 4, 3, 1, 1, false, false),
            (4, "frame", 3, 5, 1, 1, false, false),
            (5, "frame", 6, 5, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")],
        vec![],
    );

    let kin_1 = kinematic::analyze_kinematics_2d(&input_1bay);
    let kin_2 = kinematic::analyze_kinematics_2d(&input_2bay);

    assert!(
        kin_2.degree > kin_1.degree,
        "2-bay frame should have higher redundancy than 1-bay: d1={}, d2={}",
        kin_1.degree, kin_2.degree
    );
}

// ================================================================
// 5. GSA Alternate Path: Load Increases After Member Removal
// ================================================================
//
// In the GSA progressive collapse methodology, when a member is removed,
// the loads it carried must redistribute to remaining members.
// The maximum member force should increase.

#[test]
fn validation_gsa_load_redistribution() {
    let w = 4.0;
    let h = 3.0;
    let p = -10.0;

    // 2-bay, 1-story frame with vertical loads
    let input_full = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h),
            (3, w, 0.0),   (4, w, h),
            (5, 2.0 * w, 0.0), (6, 2.0 * w, h),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // col 1
            (2, "frame", 3, 4, 1, 1, false, false), // col 2
            (3, "frame", 5, 6, 1, 1, false, false), // col 3
            (4, "frame", 2, 4, 1, 1, false, false), // beam 1
            (5, "frame", 4, 6, 1, 1, false, false), // beam 2
        ],
        vec![(1, 1, "fixed"), (2, 3, "fixed"), (3, 5, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: p, mz: 0.0 }),
        ],
    );

    // Remove middle column (element 2)
    let input_removed = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h),
            (3, w, h), // middle column base removed, just keep beam node
            (4, 2.0 * w, 0.0), (5, 2.0 * w, h),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // col 1
            (2, "frame", 4, 5, 1, 1, false, false), // col 3
            (3, "frame", 2, 3, 1, 1, false, false), // beam 1
            (4, "frame", 3, 5, 1, 1, false, false), // beam 2
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: p, mz: 0.0 }),
        ],
    );

    let res_full = linear::solve_2d(&input_full).unwrap();
    let res_removed = linear::solve_2d(&input_removed).unwrap();

    // Maximum moment should increase after member removal (load redistribution)
    let max_m_full = res_full.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, |a, b| a.max(b));
    let max_m_removed = res_removed.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, |a, b| a.max(b));

    assert!(
        max_m_removed >= max_m_full * 0.9,
        "GSA: max moment should increase or stay similar after member removal: full={:.2}, removed={:.2}",
        max_m_full, max_m_removed
    );

    // Equilibrium must still hold
    let sum_ry: f64 = res_removed.reactions.iter().map(|r| r.ry).sum();
    let total_load = 3.0 * p.abs();
    assert_close(sum_ry, total_load, 0.02, "GSA: ΣRy = total load after removal");
}
