/// Validation: Gerber Beams (Beams with Internal Hinges)
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5 (Gerber beams)
///   - Ghali/Neville, "Structural Analysis", 7th Ed., Ch. 4
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 5
///
/// A Gerber beam uses internal hinges to reduce an indeterminate continuous
/// beam to a statically determinate structure. The key property is that the
/// bending moment at each internal hinge is zero.
///
/// Tests:
///   1. Simple Gerber beam: 2-span with internal hinge
///   2. Gerber beam reactions are determinate (global equilibrium)
///   3. Hinge makes beam more flexible
///   4. Moment is zero at hinge (different geometry)
///   5. Two hinges: fully determinate 3-span Gerber
///   6. Gerber beam vs simple spans (hinges at interior support)
///   7. Gerber beam point load
///   8. Equilibrium at hinge: shear is continuous
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// Helper: Build the standard 2-span Gerber beam used in tests 1,2,8
// ================================================================
//
// Geometry: 5 nodes at x = 0, 3, 6, 9, 12 (4 elements, each 3m)
// Supports: pinned at node 1 (x=0), rollerX at node 3 (x=6), rollerX at node 5 (x=12)
// Internal hinge at node 2 (x=3): elem 1 hinge_end, elem 2 hinge_start
// UDL q=-10 on all elements
fn make_gerber_2span_hinge_at_3() -> SolverInput {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),
        (4, 9.0, 0.0),
        (5, 12.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // hinge_end at node 2
        (2, "frame", 2, 3, 1, 1, true, false),   // hinge_start at node 2
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
    ];
    let mut loads = Vec::new();
    for i in 1..=4 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -10.0,
            q_j: -10.0,
            a: None,
            b: None,
        }));
    }
    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

// ================================================================
// 1. Simple Gerber beam: 2-span with internal hinge
// ================================================================
//
// 2-span beam (L1=L2=6m), supports at x=0, 6, 12.
// Internal hinge at x=3 makes the structure statically determinate.
// The moment at the hinge must be zero.

#[test]
fn gerber_2span_hinge_moment_zero() {
    let input = make_gerber_2span_hinge_at_3();
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge (node 2): m_end of element 1 and m_start of element 2
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    assert!(
        ef1.m_end.abs() < 0.5,
        "Moment at hinge (m_end of elem 1) should be ~0, got {:.6}", ef1.m_end
    );
    assert!(
        ef2.m_start.abs() < 0.5,
        "Moment at hinge (m_start of elem 2) should be ~0, got {:.6}", ef2.m_start
    );
}

// ================================================================
// 2. Gerber beam reactions are determinate (global equilibrium)
// ================================================================
//
// Same beam as test 1. Total applied load = q * L_total = 10 * 12 = 120 kN.
// Sum of vertical reactions must equal total applied load.
// Also verify horizontal equilibrium (no horizontal loads, sum Rx = 0).

#[test]
fn gerber_2span_global_equilibrium() {
    let input = make_gerber_2span_hinge_at_3();
    let results = linear::solve_2d(&input).unwrap();

    let q = 10.0;
    let l_total = 12.0;
    let total_load = q * l_total; // 120 kN

    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();

    assert_close(sum_ry, total_load, 0.01, "Gerber 2span: ΣRy = total load");
    assert!(
        sum_rx.abs() < 1e-6,
        "Gerber 2span: ΣRx should be ~0, got {:.6}", sum_rx
    );

    // Verify we get 3 reactions (3 supports, all with ry)
    assert_eq!(results.reactions.len(), 3, "Should have 3 support reactions");
}

// ================================================================
// 3. Hinge makes beam more flexible
// ================================================================
//
// 2-span beam L1=L2=6m, UDL q=-10.
// Case A: continuous beam (no hinge, indeterminate)
// Case B: Gerber beam with hinge at x=3
// The hinge introduces additional flexibility, so max deflection in
// Case B should be larger than in Case A.

#[test]
fn gerber_hinge_increases_flexibility() {
    // Case A: continuous beam without hinge
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),
        (4, 9.0, 0.0),
        (5, 12.0, 0.0),
    ];
    let elems_no_hinge = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
    ];
    let mut loads = Vec::new();
    for i in 1..=4 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -10.0,
            q_j: -10.0,
            a: None,
            b: None,
        }));
    }
    let input_a = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_no_hinge,
        sups.clone(),
        loads.clone(),
    );
    let results_a = linear::solve_2d(&input_a).unwrap();

    // Case B: Gerber beam with hinge
    let input_b = make_gerber_2span_hinge_at_3();
    let results_b = linear::solve_2d(&input_b).unwrap();

    // Find max absolute vertical displacement in each case
    let max_uy_a = results_a.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let max_uy_b = results_b.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    assert!(
        max_uy_b > max_uy_a,
        "Gerber beam should be more flexible: max|uy| with hinge={:.6e} > without={:.6e}",
        max_uy_b, max_uy_a
    );
}

// ================================================================
// 4. Moment is zero at hinge (different geometry)
// ================================================================
//
// 3 supports at x=0, 8, 16. Hinge at x=4 (midspan of span 1).
// 4 elements (each 4m). Element 1 hinge_end, element 2 hinge_start.
// UDL q=-10 on all. Moment at hinge should be zero.

#[test]
fn gerber_3support_hinge_at_midspan() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 4.0, 0.0),
        (3, 8.0, 0.0),
        (4, 12.0, 0.0),
        (5, 16.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // hinge_end at node 2
        (2, "frame", 2, 3, 1, 1, true, false),   // hinge_start at node 2
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
    ];
    let mut loads = Vec::new();
    for i in 1..=4 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -10.0,
            q_j: -10.0,
            a: None,
            b: None,
        }));
    }
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge (node 2, x=4)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    assert!(
        ef1.m_end.abs() < 0.5,
        "Moment at hinge (m_end of elem 1) should be ~0, got {:.6}", ef1.m_end
    );
    assert!(
        ef2.m_start.abs() < 0.5,
        "Moment at hinge (m_start of elem 2) should be ~0, got {:.6}", ef2.m_start
    );

    // Global equilibrium: total load = 10 * 16 = 160 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 160.0, 0.01, "Gerber 3-support: ΣRy = 160");
}

// ================================================================
// 5. Two hinges: fully determinate 3-span Gerber beam
// ================================================================
//
// 3-span beam: supports at x=0, 6, 12, 18.
// Nodes: 1(0), 2(3), 3(6), 4(9), 5(12), 6(15), 7(18). 6 elements of 3m.
// Hinges at node 2 (x=3) and node 6 (x=15).
// Element 1: 1->2 hinge_end. Element 2: 2->3 hinge_start.
// Element 5: 5->6 hinge_end. Element 6: 6->7 hinge_start.
// UDL q=-10 on all. Both hinge moments must be zero.

#[test]
fn gerber_3span_two_hinges() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),
        (4, 9.0, 0.0),
        (5, 12.0, 0.0),
        (6, 15.0, 0.0),
        (7, 18.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // hinge_end at node 2
        (2, "frame", 2, 3, 1, 1, true, false),   // hinge_start at node 2
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
        (5, "frame", 5, 6, 1, 1, false, true),  // hinge_end at node 6
        (6, "frame", 6, 7, 1, 1, true, false),   // hinge_start at node 6
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
        (4, 7_usize, "rollerX"),
    ];
    let mut loads = Vec::new();
    for i in 1..=6 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -10.0,
            q_j: -10.0,
            a: None,
            b: None,
        }));
    }
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Hinge 1 at node 2 (x=3)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef1.m_end.abs() < 0.5,
        "Hinge 1: m_end of elem 1 should be ~0, got {:.6}", ef1.m_end
    );
    assert!(
        ef2.m_start.abs() < 0.5,
        "Hinge 1: m_start of elem 2 should be ~0, got {:.6}", ef2.m_start
    );

    // Hinge 2 at node 6 (x=15)
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(
        ef5.m_end.abs() < 0.5,
        "Hinge 2: m_end of elem 5 should be ~0, got {:.6}", ef5.m_end
    );
    assert!(
        ef6.m_start.abs() < 0.5,
        "Hinge 2: m_start of elem 6 should be ~0, got {:.6}", ef6.m_start
    );

    // Global equilibrium: total load = 10 * 18 = 180 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 180.0, 0.01, "Gerber 3span: ΣRy = 180");

    // Symmetry: structure and loading are symmetric about x=9.
    // Reactions at node 1 and node 7 should be equal.
    // Reactions at node 3 and node 5 should be equal.
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r7 = results.reactions.iter().find(|r| r.node_id == 7).unwrap();
    assert_close(r1.ry, r7.ry, 0.01, "Gerber 3span symmetry: R1 = R7");

    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r3.ry, r5.ry, 0.01, "Gerber 3span symmetry: R3 = R5");
}

// ================================================================
// 6. Gerber beam vs simple spans
// ================================================================
//
// 2-span beam with hinges at both sides of the interior support (node 3).
// Element 2: hinge_end at node 3. Element 3: hinge_start at node 3.
// This disconnects moment transfer entirely at the interior support,
// making each span behave as an independent simply-supported beam.
//
// For a SS beam of length L=6m with UDL q=10:
//   R_end = q*L/2 = 30 kN at each end
//   Interior support: R_mid = 30 + 30 = 60 kN (from both spans)

#[test]
fn gerber_hinges_at_support_independent_spans() {
    let q = 10.0;
    let l = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),
        (4, 9.0, 0.0),
        (5, 12.0, 0.0),
    ];
    // Hinge at node 3 (interior support): elem 2 hinge_end, elem 3 hinge_start
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, true),  // hinge_end at node 3
        (3, "frame", 3, 4, 1, 1, true, false),   // hinge_start at node 3
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
    ];
    let mut loads = Vec::new();
    for i in 1..=4 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Each end support: q*L/2 = 30
    assert_close(r1.ry, q * l / 2.0, 0.02, "Gerber independent spans: R_A = qL/2");
    assert_close(r5.ry, q * l / 2.0, 0.02, "Gerber independent spans: R_C = qL/2");

    // Interior support: contributions from both spans = q*L/2 + q*L/2 = q*L
    assert_close(r3.ry, q * l, 0.02, "Gerber independent spans: R_B = qL");

    // Moment at interior support hinge should be zero
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(
        ef2.m_end.abs() < 0.5,
        "Moment at support hinge (m_end of elem 2) should be ~0, got {:.6}", ef2.m_end
    );
    assert!(
        ef3.m_start.abs() < 0.5,
        "Moment at support hinge (m_start of elem 3) should be ~0, got {:.6}", ef3.m_start
    );
}

// ================================================================
// 7. Gerber beam with point load
// ================================================================
//
// 2-span beam, L1=L2=6m. Hinge at x=3 (midspan of span 1).
// Point load P=-20 kN at x=9 (midspan of span 2, node 4).
// The hinge disconnects moment: the point load in span 2
// creates no moment at the hinge. Verify M(hinge) = 0.

#[test]
fn gerber_point_load_moment_zero_at_hinge() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),
        (4, 9.0, 0.0),
        (5, 12.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // hinge_end at node 2
        (2, "frame", 2, 3, 1, 1, true, false),   // hinge_start at node 2
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
        fx: 0.0,
        fy: -20.0,
        mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge (node 2)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    assert!(
        ef1.m_end.abs() < 0.5,
        "Point load: hinge moment (m_end of elem 1) should be ~0, got {:.6}", ef1.m_end
    );
    assert!(
        ef2.m_start.abs() < 0.5,
        "Point load: hinge moment (m_start of elem 2) should be ~0, got {:.6}", ef2.m_start
    );

    // Global equilibrium: total vertical load = 20 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 20.0, 0.01, "Gerber point load: ΣRy = P");

    // The point load is at midspan of span 2. With the hinge making the
    // left part independent, the left part (span 1, nodes 1-3) should have
    // zero internal forces in elements 1 and 2 (no load applied there and
    // hinge prevents moment transfer).
    // Actually, element 2 connects to the interior support (node 3) which
    // receives reaction from span 2, so shear can exist in element 2.
    // But element 1 (cantilever-like from pinned support to hinge with no load)
    // should have near-zero forces.
    assert!(
        ef1.v_start.abs() < 0.5,
        "Element 1 shear should be ~0 (no load on left of hinge), got {:.6}", ef1.v_start
    );
}

// ================================================================
// 8. Equilibrium at hinge: shear is continuous
// ================================================================
//
// At an internal hinge, moment is zero but shear must be continuous
// (Newton's third law). The shear at the end of the element before
// the hinge should equal the shear at the start of the element after.
// Using the Gerber beam from test 1 with UDL.

#[test]
fn gerber_shear_continuity_at_hinge() {
    let input = make_gerber_2span_hinge_at_3();
    let results = linear::solve_2d(&input).unwrap();

    // At hinge node 2: v_end of element 1 and v_start of element 2
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Shear sign convention: v_end of elem i is the internal shear at the
    // right end; v_start of elem i+1 is the internal shear at the left end.
    // At a hinge with no external point load, internal shear must be continuous.
    // Note: v_end and v_start follow the sign convention where v_end = -V(L)
    // in the element local frame, so we compare magnitudes.
    // The internal shear at the hinge should balance:
    // v_end(elem1) + v_start(elem2) should reflect Newton's 3rd law.
    // In the standard convention, v_end is the end shear of elem1 and v_start
    // is the start shear of elem2. At a shared node with no external force,
    // v_end(elem1) = -v_start(elem2) (action-reaction).
    // However, if both are reported as internal forces in the same sign
    // convention (positive upward on the left face), then at a shared node:
    // v_end(elem1) should equal v_start(elem2).
    //
    // The exact relationship depends on the sign convention, but the
    // key check is that shear transfers across the hinge.

    // At least one of them should be non-zero (there is load)
    assert!(
        ef1.v_end.abs() > 0.1 || ef2.v_start.abs() > 0.1,
        "Shear at hinge should be non-zero with UDL: v_end={:.6}, v_start={:.6}",
        ef1.v_end, ef2.v_start
    );

    // The magnitudes should match (shear is continuous at hinge)
    // Allow for the sign convention: either they are equal or opposite
    let shear_match = (ef1.v_end - ef2.v_start).abs() < 1.0
        || (ef1.v_end + ef2.v_start).abs() < 1.0;
    assert!(
        shear_match,
        "Shear should be continuous at hinge: v_end={:.6}, v_start={:.6}",
        ef1.v_end, ef2.v_start
    );

    // Meanwhile, moment IS zero at hinge (reconfirm)
    assert!(
        ef1.m_end.abs() < 0.5,
        "Moment at hinge should be zero: m_end={:.6}", ef1.m_end
    );
    assert!(
        ef2.m_start.abs() < 0.5,
        "Moment at hinge should be zero: m_start={:.6}", ef2.m_start
    );
}
