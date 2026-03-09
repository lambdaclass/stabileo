/// Validation: Mixed Truss and Frame Element Models
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4-6
///   - McCormac & Csernak, "Structural Steel Design", 6th Ed., Ch. 13
///   - AISC 360-16, Chapter C (Stability Analysis)
///
/// Tests verify behavior when truss and frame elements coexist:
///   1. Braced frame: truss diagonal + frame columns/beam
///   2. Truss element has zero moment and shear
///   3. Frame with cable stay (tension rod)
///   4. Truss vs frame: same geometry, different behavior
///   5. Mixed model global equilibrium
///   6. Stiff brace vs flexible brace
///   7. K-braced frame
///   8. Truss element axial stiffness EA/L (parallel paths)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Braced Frame: Truss Diagonal + Frame Columns/Beam
// ================================================================
//
// Portal frame with nodes 1(0,0), 2(0,4), 3(6,4), 4(6,0).
// Columns and beam are frame elements; diagonal brace 1->3 is truss.
// Fixed at 1 and 4. Lateral load H=20kN at node 2.
// The diagonal brace should carry axial force and sway should be
// significantly less than an unbraced portal frame.

#[test]
fn validation_mixed_braced_frame_diagonal() {
    let h = 4.0;
    let w = 6.0;
    let p = 20.0;

    // Unbraced portal frame for comparison
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();
    let sway_unbraced = res_unbraced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Braced portal frame: add truss diagonal 1->3
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column (4->3 reversed for consistency)
        (4, "truss", 1, 3, 1, 1, false, false), // diagonal brace
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input_braced = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();
    let sway_braced = res_braced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Diagonal brace should carry significant axial force
    let ef_brace = res_braced
        .element_forces
        .iter()
        .find(|e| e.element_id == 4)
        .unwrap();
    assert!(
        ef_brace.n_start.abs() > 1.0,
        "Diagonal brace should carry axial force: N={:.4}",
        ef_brace.n_start
    );

    // Braced sway should be significantly less than unbraced
    assert!(
        sway_braced < sway_unbraced * 0.5,
        "Braced sway should be < 50% of unbraced: braced={:.6e}, unbraced={:.6e}",
        sway_braced,
        sway_unbraced
    );
}

// ================================================================
// 2. Truss Element Has Zero Moment and Shear
// ================================================================
//
// Same braced frame as test 1. Verify the diagonal truss element
// has m_start=0, m_end=0, v_start=0, v_end=0 (truss carries only
// axial force).

#[test]
fn validation_mixed_truss_zero_moment_shear() {
    let h = 4.0;
    let w = 6.0;
    let p = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 1, false, false), // diagonal brace
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef_truss = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 4)
        .unwrap();

    // Truss element should have zero moment at both ends
    assert!(
        ef_truss.m_start.abs() < 1e-6,
        "Truss m_start should be zero: {:.6e}",
        ef_truss.m_start
    );
    assert!(
        ef_truss.m_end.abs() < 1e-6,
        "Truss m_end should be zero: {:.6e}",
        ef_truss.m_end
    );

    // Truss element should have zero shear at both ends
    assert!(
        ef_truss.v_start.abs() < 1e-6,
        "Truss v_start should be zero: {:.6e}",
        ef_truss.v_start
    );
    assert!(
        ef_truss.v_end.abs() < 1e-6,
        "Truss v_end should be zero: {:.6e}",
        ef_truss.v_end
    );

    // But it should carry non-zero axial force
    assert!(
        ef_truss.n_start.abs() > 1.0,
        "Truss should carry axial force: N={:.4}",
        ef_truss.n_start
    );
}

// ================================================================
// 3. Frame with Cable Stay (Tension Rod)
// ================================================================
//
// Beam with a cable stay from above:
//   Nodes: 1(0,0), 2(3,0), 3(6,0), 4(3,3)
//   Frame elements: 1->2, 2->3 (beam segments)
//   Truss element: 4->2 (cable stay from top)
//   Supports: pinned at 1, rollerX at 3, pinned at 4
//   Load: P=-20kN at node 2
//
// The cable stay should carry tension and the beam midspan moment
// should be reduced compared to a simple beam without the stay.

#[test]
fn validation_mixed_cable_stay() {
    let span = 6.0;
    let cable_h = 3.0;
    let p = 20.0;

    // Plain simply-supported beam with point load at midspan for comparison
    let nodes_plain = vec![(1, 0.0, 0.0), (2, span / 2.0, 0.0), (3, span, 0.0)];
    let elems_plain = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let sups_plain = vec![(1, 1_usize, "pinned"), (2, 3, "rollerX")];
    let loads_plain = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input_plain = make_input(
        nodes_plain,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_plain,
        sups_plain,
        loads_plain,
    );
    let res_plain = linear::solve_2d(&input_plain).unwrap();
    let defl_plain = res_plain
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .uy
        .abs();

    // Now the cable-stayed beam
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, 0.0),
        (3, span, 0.0),
        (4, span / 2.0, cable_h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // beam left half
        (2, "frame", 2, 3, 1, 1, false, false), // beam right half
        (3, "truss", 4, 2, 1, 1, false, false), // cable stay
    ];
    // Node 4 connects only to a truss element, so in a mixed model (3 DOFs/node)
    // it needs "fixed" support to restrain its rotation DOF.
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3, "rollerX"),
        (3, 4, "fixed"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input_stay = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let res_stay = linear::solve_2d(&input_stay).unwrap();

    // Cable should carry tension (positive axial = tension for element 4->2 going downward)
    let ef_cable = res_stay
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();
    assert!(
        ef_cable.n_start.abs() > 1.0,
        "Cable stay should carry significant axial force: N={:.4}",
        ef_cable.n_start
    );

    // Deflection at midspan should be reduced compared to plain beam
    let defl_stay = res_stay
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .uy
        .abs();
    assert!(
        defl_stay < defl_plain,
        "Cable stay should reduce midspan deflection: stayed={:.6e}, plain={:.6e}",
        defl_stay,
        defl_plain
    );
}

// ================================================================
// 4. Truss vs Frame: Same Geometry, Different Behavior
// ================================================================
//
// Triangle: nodes 1(0,0), 2(4,0), 3(2,2).
// Elements: 1->3, 3->2. Pinned at 1 and 2. Load P=-10kN at node 3.
// Case A: both elements are "truss" -- carry only axial, zero moment.
// Case B: both elements are "frame" -- may carry non-zero moment.
// Deflections should differ because frame elements add bending stiffness.

#[test]
fn validation_mixed_truss_vs_frame_behavior() {
    let p = 10.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 2.0)];
    let sups = vec![(1, 1_usize, "pinned"), (2, 2, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    // Case A: truss elements
    let elems_truss = vec![
        (1, "truss", 1, 3, 1, 1, false, false),
        (2, "truss", 3, 2, 1, 1, false, false),
    ];
    let input_truss = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_truss,
        sups.clone(),
        loads.clone(),
    );
    let res_truss = linear::solve_2d(&input_truss).unwrap();

    // Case B: frame elements
    let elems_frame = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 3, 2, 1, 1, false, false),
    ];
    let input_frame = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_frame,
        sups,
        loads,
    );
    let res_frame = linear::solve_2d(&input_frame).unwrap();

    // Truss elements: moments must be zero
    for ef in &res_truss.element_forces {
        assert!(
            ef.m_start.abs() < 1e-6,
            "Truss elem {} m_start should be zero: {:.6e}",
            ef.element_id,
            ef.m_start
        );
        assert!(
            ef.m_end.abs() < 1e-6,
            "Truss elem {} m_end should be zero: {:.6e}",
            ef.element_id,
            ef.m_end
        );
    }

    // Frame elements may carry some moment (frame action at node 3)
    // With pinned supports and no hinge at node 3, the frame has a rigid joint.
    // There should be non-zero moment at node 3.
    let ef1_frame = res_frame
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    let ef2_frame = res_frame
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    let max_moment = ef1_frame
        .m_end
        .abs()
        .max(ef2_frame.m_start.abs());
    assert!(
        max_moment > 0.01,
        "Frame elements should carry moment at rigid joint: max_M={:.6e}",
        max_moment
    );

    // Deflections differ: frame model is stiffer due to bending stiffness
    let d_truss = res_truss
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap()
        .uy
        .abs();
    let d_frame = res_frame
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap()
        .uy
        .abs();
    assert!(
        (d_truss - d_frame).abs() > 1e-10,
        "Deflections should differ: truss={:.6e}, frame={:.6e}",
        d_truss,
        d_frame
    );
}

// ================================================================
// 5. Mixed Model Global Equilibrium
// ================================================================
//
// Braced portal frame under lateral and gravity loads.
// Verify sum of reactions equals sum of applied loads (global equilibrium).

#[test]
fn validation_mixed_global_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let px = 20.0;
    let py = -15.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        (4, "truss", 1, 3, 1, 1, false, false), // diagonal brace
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: px,
            fy: 0.0,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fy: py,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fy: py,
            mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum_Rx + px = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -px, 0.02, "Mixed equilibrium: sum_Rx = -Px");

    // Vertical equilibrium: sum_Ry + 2*py = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(
        sum_ry,
        -2.0 * py,
        0.02,
        "Mixed equilibrium: sum_Ry = -2*Py",
    );
}

// ================================================================
// 6. Stiff Brace vs Flexible Brace
// ================================================================
//
// Portal frame with diagonal brace. Two cases:
//   Case 1: brace A=0.01 (stiff)
//   Case 2: brace A=0.001 (flexible)
// Same lateral load H=10kN. Sway with stiff brace < sway with
// flexible brace.

#[test]
fn validation_mixed_stiff_vs_flexible_brace() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    let build_braced_frame = |brace_area: f64| -> f64 {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, 0.0, h),
            (3, w, h),
            (4, w, 0.0),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
            (4, "truss", 1, 3, 1, 2, false, false), // diagonal brace with section 2
        ];
        let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: p,
            fy: 0.0,
            mz: 0.0,
        })];

        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A, IZ), (2, brace_area, 1e-8)],
            elems,
            sups,
            loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        results
            .displacements
            .iter()
            .find(|d| d.node_id == 2)
            .unwrap()
            .ux
            .abs()
    };

    let sway_stiff = build_braced_frame(0.01);
    let sway_flexible = build_braced_frame(0.001);

    assert!(
        sway_stiff < sway_flexible,
        "Stiff brace should reduce sway more: stiff={:.6e}, flexible={:.6e}",
        sway_stiff,
        sway_flexible
    );

    // The stiff brace (10x area) should produce noticeably less sway
    assert!(
        sway_stiff < sway_flexible * 0.9,
        "Stiff brace sway should be meaningfully less: ratio={:.3}",
        sway_stiff / sway_flexible
    );
}

// ================================================================
// 7. K-Braced Frame
// ================================================================
//
// K-brace: two diagonal truss braces meeting at the midpoint of the
// left column. The left column is split into two frame segments at
// node 5(0,2), so node 5 has rotational stiffness from the frame
// elements. Braces run from node 5 to right-base (4) and right-top (3).
//
// Nodes: 1(0,0), 2(0,4), 3(6,4), 4(6,0), 5(0,2).
// Frame: 1->5, 5->2 (left column split), 4->3 (right column), 2->3 (beam).
// Truss: 5->4, 5->3 (K-brace diagonals).
// Fixed at 1 and 4. Lateral H=15kN at node 2.

#[test]
fn validation_mixed_k_brace() {
    let h = 4.0;
    let w = 6.0;
    let p = 15.0;

    // Unbraced portal for comparison
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();
    let sway_unbraced = res_unbraced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // K-braced frame: node 5 at left column midpoint
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
        (5, 0.0, h / 2.0), // midpoint of left column
    ];
    let elems = vec![
        (1, "frame", 1, 5, 1, 1, false, false), // left column bottom half
        (2, "frame", 5, 2, 1, 1, false, false), // left column top half
        (3, "frame", 2, 3, 1, 1, false, false), // beam
        (4, "frame", 4, 3, 1, 1, false, false), // right column
        (5, "truss", 5, 4, 1, 1, false, false), // K-brace: left mid to right base
        (6, "truss", 5, 3, 1, 1, false, false), // K-brace: left mid to right top
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input_braced = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();
    let sway_braced = res_braced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // K-brace should reduce sway compared to unbraced portal
    assert!(
        sway_braced < sway_unbraced,
        "K-brace should reduce sway: braced={:.6e}, unbraced={:.6e}",
        sway_braced,
        sway_unbraced
    );

    // Both K-brace legs should carry axial force (elements 5 and 6)
    let ef5 = res_braced
        .element_forces
        .iter()
        .find(|e| e.element_id == 5)
        .unwrap();
    let ef6 = res_braced
        .element_forces
        .iter()
        .find(|e| e.element_id == 6)
        .unwrap();
    assert!(
        ef5.n_start.abs() > 0.5,
        "K-brace leg 5->4 should carry force: N={:.4}",
        ef5.n_start
    );
    assert!(
        ef6.n_start.abs() > 0.5,
        "K-brace leg 5->3 should carry force: N={:.4}",
        ef6.n_start
    );

    // Global horizontal equilibrium
    let sum_rx: f64 = res_braced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "K-brace: sum_Rx = -P");
}

// ================================================================
// 8. Truss Element Axial Stiffness EA/L (Parallel Paths)
// ================================================================
//
// Two parallel paths from node 1(0,0) to node 2(4,0):
//   Path 1: frame element (A=0.01, Iz=1e-4)
//   Path 2: truss element (A=0.01, Iz ignored)
// Both share same A and same length. Under purely axial load (fx
// at node 2), both should carry equal axial force since they have
// the same axial stiffness EA/L.
//
// Node 1: pinned. Node 2: rollerX (free in x, restrained in y).
// Axial load fx=50 at node 2.

#[test]
fn validation_mixed_parallel_axial_stiffness() {
    let l = 4.0;
    let p = 50.0;

    // Two nodes with a small vertical offset for the second path
    // to avoid overlapping elements. Actually, two elements between
    // the same pair of nodes is fine structurally. But let us use
    // a very small offset to keep the model clean.
    //
    // Nodes: 1(0,0), 2(4,0) for both elements. However, having two
    // elements between the exact same two nodes may be supported.
    // Let us use nodes 1(0,0), 2(4,0) and both elements share them.
    let nodes = vec![(1, 0.0, 0.0), (2, l, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // frame element
        (2, "truss", 1, 2, 1, 1, false, false),  // truss element (same section)
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef_frame = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    let ef_truss = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();

    // Under pure axial load with identical A and L, both paths have
    // the same axial stiffness EA/L, so each carries P/2
    let expected = p / 2.0;
    assert_close(
        ef_frame.n_start,
        expected,
        0.05,
        "Frame element axial force = P/2",
    );
    assert_close(
        ef_truss.n_start,
        expected,
        0.05,
        "Truss element axial force = P/2",
    );

    // Axial forces should be nearly equal
    let diff = (ef_frame.n_start - ef_truss.n_start).abs();
    let avg = (ef_frame.n_start.abs() + ef_truss.n_start.abs()) / 2.0;
    assert!(
        diff / avg < 0.01,
        "Parallel elements should carry equal axial: frame_N={:.4}, truss_N={:.4}",
        ef_frame.n_start,
        ef_truss.n_start
    );
}
