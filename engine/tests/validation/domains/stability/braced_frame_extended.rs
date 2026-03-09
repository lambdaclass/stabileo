/// Validation: Extended Braced Frame Analysis
///
/// References:
///   - Goel & Chao, "Performance-Based Plastic Design", Ch. 4
///   - Bungale S. Taranath, "Structural Analysis and Design of Tall Buildings", Ch. 5
///   - Ambrose & Tripeny, "Simplified Design of Steel Structures", 9th Ed., Ch. 7
///   - Chen & Lui, "Structural Stability: Theory and Implementation", Ch. 3
///   - AISC 341-16, Seismic Provisions, Chapter F
///
/// Tests verify advanced braced frame behavior:
///   1. Eccentric brace: link element develops shear and moment
///   2. Column axial forces from overturning in braced frame
///   3. Three-story alternating diagonal bracing pattern
///   4. Braced frame with distributed gravity on beam
///   5. Asymmetric single-brace: unequal column moments
///   6. Pin-base vs fixed-base braced frame stiffness
///   7. Braced frame global overturning moment balance
///   8. Brace stiffness proportional to cross-section area
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A_FRAME: f64 = 0.02;
const A_BRACE: f64 = 0.005;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Eccentric Brace: Link Element Develops Shear and Moment
// ================================================================
//
// Eccentric braced frame (EBF): the brace connects not to the
// beam-column joint but to a point offset along the beam, creating
// a short "link" segment. The link develops significant shear and
// moment while the brace carries mainly axial force.
//
// Reference: Goel & Chao, "Performance-Based Plastic Design", Ch. 4;
//            AISC 341-16, Chapter F.

#[test]
fn validation_braced_frame_eccentric_brace_link_forces() {
    let h = 4.0;
    let w = 6.0;
    let e_link = 1.0; // link length (offset from column-beam joint)
    let p = 20.0;

    // Nodes: 1(0,0), 2(0,h), 3(e_link, h) = brace-beam intersection,
    //        4(w, h), 5(w, 0)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, e_link, h),  // eccentric connection point on beam
        (4, w, h),
        (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // link segment
        (3, "frame", 3, 4, 1, 1, false, false), // beam remainder
        (4, "frame", 4, 5, 1, 1, false, false), // right column
        (5, "truss", 5, 3, 1, 2, false, false), // eccentric brace from base to link
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 5, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // The link segment (element 2, from node 2 to node 3) should develop
    // significant shear force because the brace force vertical component
    // is transferred through the link.
    let ef_link = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    assert!(
        ef_link.v_start.abs() > 1.0,
        "Link shear should be significant: V={:.4}",
        ef_link.v_start
    );

    // The link should also develop end moments
    assert!(
        ef_link.m_start.abs() > 0.1 || ef_link.m_end.abs() > 0.1,
        "Link should develop moments: M_start={:.4}, M_end={:.4}",
        ef_link.m_start,
        ef_link.m_end
    );

    // The brace (element 5) should carry mainly axial force
    let ef_brace = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 5)
        .unwrap();
    assert!(
        ef_brace.n_start.abs() > 5.0,
        "Brace should carry substantial axial force: N={:.4}",
        ef_brace.n_start
    );

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "EBF: SumRx = -P");
}

// ================================================================
// 2. Column Axial Forces From Overturning in Braced Frame
// ================================================================
//
// In a braced frame under lateral load, the overturning moment
// M = P * h is resisted by a couple in the columns: N = M / w.
// The windward column goes into tension, leeward into compression
// (for pinned-base columns where only axial forces develop at base).
//
// For a stiff brace, column axial force difference ~ P*h/w.
//
// Reference: Taranath, "Structural Analysis of Tall Buildings", Ch. 5.

#[test]
fn validation_braced_frame_column_overturning_forces() {
    let h = 5.0;
    let w = 8.0;
    let p = 30.0;

    // Use very stiff brace so that frame action is minimal
    let a_brace_stiff = 0.1;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    // Use truss members for columns too (pinned-pinned) to isolate
    // the truss mechanism and get clean overturning forces
    let elems = vec![
        (1, "truss", 1, 2, 1, 2, false, false), // left column (truss)
        (2, "truss", 2, 3, 1, 2, false, false), // beam (truss)
        (3, "truss", 3, 4, 1, 2, false, false), // right column (truss)
        (4, "truss", 1, 3, 1, 3, false, false), // diagonal brace
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![
            (1, A_FRAME, IZ),
            (2, A_FRAME, 0.0),
            (3, a_brace_stiff, 0.0),
        ],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Overturning moment = P * h
    // Resisted by vertical reactions: R_left_y and R_right_y
    // forming a couple with lever arm w.
    // So |R_y| ~ P*h/w for each support.
    let expected_vert: f64 = p * h / w;

    let ry_left = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .ry;
    let ry_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == 4)
        .unwrap()
        .ry;

    // Vertical reactions should form a couple
    // Sum should be ~0 (no net vertical load)
    assert_close(ry_left + ry_right, 0.0, 0.05, "Overturning: SumRy ~ 0");

    // Each vertical reaction magnitude ~ P*h/w
    assert_close(
        ry_left.abs(),
        expected_vert,
        0.05,
        "Overturning: |Ry_left| ~ P*h/w",
    );
    assert_close(
        ry_right.abs(),
        expected_vert,
        0.05,
        "Overturning: |Ry_right| ~ P*h/w",
    );
}

// ================================================================
// 3. Three-Story Alternating Diagonal Bracing Pattern
// ================================================================
//
// Three-story frame with alternating diagonal braces (zigzag pattern).
// Story 1: brace from bottom-left to top-right,
// Story 2: brace from bottom-right to top-left,
// Story 3: brace from bottom-left to top-right.
// All stories should have reduced drift compared to unbraced.
//
// Reference: Ambrose & Tripeny, "Simplified Design of Steel Structures",
//            9th Ed., Ch. 7.

#[test]
fn validation_braced_frame_three_story_alternating() {
    let h = 3.5;
    let w = 6.0;
    let p = 8.0;

    // 8 nodes: 4 per column side, 3 stories
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, 0.0, 3.0 * h),
        (5, w, 0.0),
        (6, w, h),
        (7, w, 2.0 * h),
        (8, w, 3.0 * h),
    ];
    let elems = vec![
        // Left column segments
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        // Right column segments
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 6, 7, 1, 1, false, false),
        (6, "frame", 7, 8, 1, 1, false, false),
        // Beams at each floor
        (7, "frame", 2, 6, 1, 1, false, false),
        (8, "frame", 3, 7, 1, 1, false, false),
        (9, "frame", 4, 8, 1, 1, false, false),
        // Alternating braces (zigzag)
        (10, "truss", 1, 6, 1, 2, false, false), // story 1: bottom-left to top-right
        (11, "truss", 6, 3, 1, 2, false, false), // story 2: bottom-right to top-left
        (12, "truss", 3, 8, 1, 2, false, false), // story 3: bottom-left to top-right
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 5, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: p, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: p, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // All three braces should carry axial force
    for brace_id in [10, 11, 12] {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == brace_id)
            .unwrap();
        assert!(
            ef.n_start.abs() > 0.5,
            "Brace {} should carry axial force: N={:.4}",
            brace_id,
            ef.n_start
        );
    }

    // Global horizontal equilibrium: sum_rx = -3P
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -3.0 * p, 0.02, "3-story alternating: SumRx = -3P");

    // Roof drift should be finite and positive (load pushes in +x)
    let d_roof_left = results
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap()
        .ux;
    assert!(
        d_roof_left > 0.0,
        "Roof should drift in +x direction: ux={:.6e}",
        d_roof_left
    );
}

// ================================================================
// 4. Braced Frame with Distributed Gravity Load on Beam
// ================================================================
//
// X-braced portal frame with uniform distributed load on the beam.
// Under pure symmetric gravity loading, the brace forces should be
// small relative to the beam and column forces, and vertical equilibrium
// must hold: sum(Ry) = q * L.
//
// Reference: Chen & Lui, "Structural Stability", Ch. 3.

#[test]
fn validation_braced_frame_distributed_gravity() {
    let h = 4.0;
    let w = 6.0;
    let q = -10.0; // uniform load on beam (downward)

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
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal 1
        (5, "truss", 2, 4, 1, 2, false, false), // diagonal 2
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: 2,
        q_i: q,
        q_j: q,
        a: None,
        b: None,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: total applied = q * w (downward, so negative)
    // Reactions should sum to |q * w| upward
    let total_applied: f64 = q * w; // negative
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -total_applied, 0.02, "Distributed gravity: SumRy = q*L");

    // No horizontal load => horizontal reactions should sum to zero
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.05, "Distributed gravity: SumRx ~ 0");

    // Beam should develop midspan moment. For a beam with fixed ends,
    // M_midspan ~ qL^2/24 (fixed-fixed) or qL^2/8 (simply-supported).
    // With frame action the value is between these bounds.
    let beam_ef = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    // Beam end moments should be nonzero (frame action provides fixity)
    assert!(
        beam_ef.m_start.abs() > 1.0,
        "Beam start moment should be nonzero: M={:.4}",
        beam_ef.m_start
    );
}

// ================================================================
// 5. Asymmetric Single-Brace: Unequal Column Shear Forces
// ================================================================
//
// Portal frame with single diagonal brace from lower-left to upper-right.
// Due to the asymmetric brace, the horizontal reactions at the two
// supports are unequal. In a symmetric (unbraced) portal frame,
// each base carries P/2; with a single diagonal brace, the base
// connected to the brace carries a larger share of the horizontal
// reaction.
//
// Reference: Ambrose & Tripeny, "Simplified Design of Steel Structures",
//            9th Ed., Ch. 7.

#[test]
fn validation_braced_frame_asymmetric_column_shear() {
    let h = 4.0;
    let w = 6.0;
    let p = 15.0;

    // Use a stiff brace to maximize asymmetry
    let a_brace_stiff = 0.05;

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
        (4, "truss", 1, 3, 1, 2, false, false), // brace: bottom-left to top-right
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
        vec![(1, A_FRAME, IZ), (2, a_brace_stiff, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal reactions at the two bases
    let rx_left = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .rx
        .abs();
    let rx_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == 4)
        .unwrap()
        .rx
        .abs();

    // For an unbraced symmetric portal, Rx_left ~ Rx_right ~ P/2.
    // With the single diagonal brace, the reactions become unequal
    // because the brace provides a direct load path to the bottom-left support.
    // The horizontal reactions should NOT be equal.
    let rx_max = rx_left.max(rx_right);
    let rx_min = rx_left.min(rx_right);
    let reaction_ratio: f64 = rx_max / rx_min.max(1e-10);
    assert!(
        reaction_ratio > 1.5,
        "Asymmetric brace should cause unequal horizontal reactions: Rx_left={:.4}, Rx_right={:.4}, ratio={:.2}",
        rx_left, rx_right, reaction_ratio
    );

    // Global equilibrium still holds
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Asymmetric brace: SumRx = -P");
}

// ================================================================
// 6. Pin-Base vs Fixed-Base Braced Frame Stiffness
// ================================================================
//
// Same braced frame geometry but with different base conditions.
// Fixed bases should result in less lateral drift than pinned bases,
// even with bracing present.
//
// Reference: Chen & Lui, "Structural Stability", Ch. 3.

#[test]
fn validation_braced_frame_pin_vs_fixed_base() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    let build_braced = |base_type: &str| -> f64 {
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
            (4, "truss", 1, 3, 1, 2, false, false), // single diagonal brace
        ];
        let sups = vec![(1, 1_usize, base_type), (2, 4, base_type)];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: p,
            fy: 0.0,
            mz: 0.0,
        })];
        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
            elems,
            sups,
            loads,
        );
        let results = linear::solve_2d(&input).unwrap();

        // Also check equilibrium for each case
        let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
        assert_close(sum_rx, -p, 0.02, &format!("{} base: SumRx = -P", base_type));

        results
            .displacements
            .iter()
            .find(|d| d.node_id == 2)
            .unwrap()
            .ux
            .abs()
    };

    let d_pinned = build_braced("pinned");
    let d_fixed = build_braced("fixed");

    // Fixed base should be stiffer (less drift)
    assert!(
        d_fixed < d_pinned,
        "Fixed-base drift={:.6e} should be less than pinned-base drift={:.6e}",
        d_fixed,
        d_pinned
    );

    // Both should produce finite positive drift
    assert!(d_pinned > 0.0, "Pinned-base drift should be > 0");
    assert!(d_fixed > 0.0, "Fixed-base drift should be > 0");
}

// ================================================================
// 7. Braced Frame Global Overturning Moment Balance
// ================================================================
//
// For a braced frame under lateral loads at multiple levels,
// the overturning moment about the base must be balanced by the
// vertical reaction couple. Taking moments about node 1:
//   sum(P_i * h_i) = Ry_right * w - sum(Mz_base)
//
// This tests the complete moment equilibrium equation.
//
// Reference: Taranath, "Structural Analysis of Tall Buildings", Ch. 5.

#[test]
fn validation_braced_frame_overturning_moment_balance() {
    let h = 4.0;
    let w = 6.0;
    let p1 = 10.0; // lateral at first floor
    let p2 = 15.0; // lateral at roof

    // Two-story braced frame
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, w, 0.0),
        (5, w, h),
        (6, w, 2.0 * h),
    ];
    let elems = vec![
        // Left column
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        // Right column
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        // Beams
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
        // X-braces in both stories
        (7, "truss", 1, 5, 1, 2, false, false),
        (8, "truss", 2, 4, 1, 2, false, false),
        (9, "truss", 2, 6, 1, 2, false, false),
        (10, "truss", 3, 5, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: p2, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Applied overturning moment about node 1 (base-left):
    // M_applied = P1 * h + P2 * 2h
    let m_applied = p1 * h + p2 * 2.0 * h;

    // Resisting moment from reactions about node 1:
    // - Ry at node 4 (x=w): contributes Ry_4 * w
    // - Rx at node 1 and node 4: contribute Rx * 0 (at node 1, arm=0)
    //   and Rx_4 * 0 (horizontal, arm is vertical = 0 from base)
    // - Mz at node 1 and node 4: directly resist
    // Full moment equilibrium about node 1:
    //   M_applied + Rx_1*0 + Ry_1*0 + Mz_1 + Rx_4*0 + Ry_4*w + Mz_4 = 0
    //   => M_applied + Mz_1 + Ry_4*w + Mz_4 = 0

    let ry_4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().ry;
    let mz_1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    let mz_4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().mz;

    // Convention: positive applied moment is counterclockwise.
    // Reactions resist applied loads, so the total reaction moment
    // about node 1 should equal the applied overturning moment
    // (reactions act opposite to applied loads).
    // Moment about node 1 from reactions: Ry_4 * w + Mz_1 + Mz_4
    // This must balance the applied moment: Ry_4*w + Mz_1 + Mz_4 + m_applied = 0
    // => |Ry_4*w + Mz_1 + Mz_4| = m_applied
    let m_reaction = ry_4 * w + mz_1 + mz_4;
    assert_close(
        m_reaction.abs(),
        m_applied,
        0.02,
        "Overturning moment balance about base-left",
    );

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -(p1 + p2), 0.02, "Overturning: SumRx = -(P1+P2)");
}

// ================================================================
// 8. Brace Stiffness Proportional to Cross-Section Area
// ================================================================
//
// For a braced frame dominated by brace axial stiffness (EA/L),
// doubling the brace area should roughly halve the lateral drift.
// The ratio won't be exactly 2 due to frame contribution, but the
// drift with area A should exceed the drift with area 2A.
//
// Reference: Ambrose & Tripeny, "Simplified Design of Steel Structures",
//            9th Ed., Ch. 7.

#[test]
fn validation_braced_frame_stiffness_vs_brace_area() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;
    let a_small = 0.005;
    let a_large = 0.010; // double the area

    let build_with_brace_area = |ab: f64| -> f64 {
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
            (4, "truss", 1, 3, 1, 2, false, false), // single diagonal brace
        ];
        let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: p,
            fy: 0.0,
            mz: 0.0,
        })];
        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A_FRAME, IZ), (2, ab, 0.0)],
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

    let d_small = build_with_brace_area(a_small);
    let d_large = build_with_brace_area(a_large);

    // Larger brace area => less drift
    assert!(
        d_large < d_small,
        "Larger brace area should reduce drift: d_large={:.6e} < d_small={:.6e}",
        d_large,
        d_small
    );

    // The drift ratio should be between 1.0 and 2.0
    // (would be exactly 2.0 if drift were purely brace-governed)
    let drift_ratio: f64 = d_small / d_large;
    assert!(
        drift_ratio > 1.2 && drift_ratio < 2.5,
        "Drift ratio d_small/d_large={:.3} should be between 1.2 and 2.5",
        drift_ratio
    );
}
