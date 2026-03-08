/// Validation: Extended Load Path Behavior in Structures
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 2 (Principles of Statics)
///   - Kassimali, "Structural Analysis", Ch. 3 (Load Path Concepts)
///   - ASCE 7-22, Section 1.4 (General Structural Integrity — Load Path)
///
/// Tests verify that loads follow physically correct paths through structures:
///   1. Simply-supported beam: midspan load creates equal reactions at both supports
///   2. Cantilever: entire load transfers to fixed support
///   3. Two-span continuous beam: load on span 1 creates reactions at all 3 supports
///   4. Portal frame gravity: symmetric loads produce equal column reactions
///   5. Portal frame lateral: horizontal load distributes to both column bases
///   6. Truss: loads transfer as axial forces only (zero bending with hinges)
///   7. Propped cantilever: load sharing between fixed and roller supports
///   8. Multi-span beam: point load on one span affects adjacent span reactions
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Simply-Supported Beam: Midspan Load Creates Equal Reactions
// ================================================================
//
// A simply-supported beam of length L with a point load P at midspan
// produces R_A = R_B = P/2 by symmetry. This is the most fundamental
// load path: load travels to the nearest supports in proportion to
// stiffness and geometry.

#[test]
fn validation_load_path_ext_ss_beam_equal_reactions() {
    let l = 10.0;
    let n = 10;
    let p = 40.0;

    // Point load at midspan (node 6 for 10 elements, midspan = node 6)
    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Both reactions should be P/2 = 20 kN (upward)
    assert_close(r_a.ry, p / 2.0, 0.01, "SS midspan: R_A = P/2");
    assert_close(r_b.ry, p / 2.0, 0.01, "SS midspan: R_B = P/2");

    // Reactions should be equal by symmetry
    let diff: f64 = (r_a.ry - r_b.ry).abs();
    assert!(
        diff < 0.01,
        "SS midspan: reactions should be equal, diff = {:.6}",
        diff
    );

    // Vertical equilibrium: R_A + R_B = P
    assert_close(r_a.ry + r_b.ry, p, 0.01, "SS midspan: R_A + R_B = P");

    // No horizontal reactions (pinned + roller, no horizontal load)
    assert!(
        r_a.rx.abs() < 1e-6,
        "SS midspan: R_Ax = 0, got {:.6}",
        r_a.rx
    );

    // No moment reactions at simple supports
    assert!(
        r_a.mz.abs() < 1e-6,
        "SS midspan: M_A = 0, got {:.6}",
        r_a.mz
    );
    assert!(
        r_b.mz.abs() < 1e-6,
        "SS midspan: M_B = 0, got {:.6}",
        r_b.mz
    );
}

// ================================================================
// 2. Cantilever: All Load Transferred to Fixed Support
// ================================================================
//
// A cantilever beam of length L with a point load P at the free end
// transfers the entire load to the fixed support:
//   R_y = P, M_z = P * L
// This demonstrates the simplest determinate load path.

#[test]
fn validation_load_path_ext_cantilever_full_transfer() {
    let l = 6.0;
    let n = 12;
    let p = 25.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Entire vertical load transfers to the fixed support
    assert_close(r.ry, p, 0.01, "Cantilever: R_y = P");

    // Fixed-end moment = P * L
    assert_close(r.mz.abs(), p * l, 0.01, "Cantilever: M = P*L");

    // No horizontal reaction (vertical load only)
    assert!(
        r.rx.abs() < 1e-6,
        "Cantilever: R_x = 0, got {:.6}",
        r.rx
    );

    // Element forces: shear should be constant = P along the beam
    for i in 1..=n {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == i)
            .unwrap();
        assert_close(
            ef.v_start.abs(),
            p,
            0.02,
            &format!("Cantilever: V_elem{} = P", i),
        );
    }

    // Axial force should be zero (no axial load on cantilever)
    let ef1 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    assert!(
        ef1.n_start.abs() < 0.1,
        "Cantilever: N = 0, got {:.6}",
        ef1.n_start
    );
}

// ================================================================
// 3. Two-Span Continuous Beam: Load on Span 1 Creates Reactions
//    at All 3 Supports
// ================================================================
//
// A two-span continuous beam (L1 = L2 = L) with a point load P at
// midspan of span 1 is statically indeterminate. The load creates
// reactions at ALL three supports, including the far end of span 2
// (hogging moment over the interior support pulls on span 2).
// From the three-moment equation:
//   R_A, R_B, R_C are all nonzero.

#[test]
fn validation_load_path_ext_two_span_load_on_span1() {
    let l = 8.0;
    let n_per_span = 8;
    let p = 50.0;

    // Point load at midspan of span 1 (node 5 for n_per_span=8)
    let load_node = n_per_span / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;

    let r_a = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_a)
        .unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_b)
        .unwrap();
    let r_c = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_c)
        .unwrap();

    // All three supports must have nonzero reactions
    assert!(
        r_a.ry.abs() > 1.0,
        "Two-span: R_A is nonzero, got {:.4}",
        r_a.ry
    );
    assert!(
        r_b.ry.abs() > 1.0,
        "Two-span: R_B is nonzero, got {:.4}",
        r_b.ry
    );
    // Span 2 has no direct load, but the far support still reacts
    // (the interior hogging moment pulls span 2 upward at C)
    assert!(
        r_c.ry.abs() > 0.1,
        "Two-span: R_C is nonzero (indirect path), got {:.4}",
        r_c.ry
    );

    // R_C should be negative (downward) because the hogging moment at B
    // lifts span 2 at its midspan and pushes node C down
    assert!(
        r_c.ry < 0.0,
        "Two-span: R_C < 0 (uplift), got {:.4}",
        r_c.ry
    );

    // Vertical equilibrium: R_A + R_B + R_C = P
    let sum_ry: f64 = r_a.ry + r_b.ry + r_c.ry;
    assert_close(sum_ry, p, 0.01, "Two-span: sum_Ry = P");

    // The loaded span carries the majority: R_A + R_B > P
    // (because R_C is negative, R_A + R_B must exceed P)
    assert!(
        r_a.ry + r_b.ry > p,
        "Two-span: R_A + R_B > P since R_C < 0"
    );

    // For equal spans with P at midspan of span 1:
    // M_B = -3PL/32 (three-moment equation)
    // R_C = M_B / L = -3PL / (32*L) = -3P/32
    let r_c_exact = -3.0 * p / 32.0;
    assert_close(r_c.ry, r_c_exact, 0.05, "Two-span: R_C = -3P/32");
}

// ================================================================
// 4. Portal Frame Gravity: Symmetric Loads Produce Equal Column
//    Reactions
// ================================================================
//
// A symmetric portal frame (both columns same height and stiffness,
// beam connecting them) with equal gravity loads at both beam-column
// joints should produce equal vertical reactions at both bases.
// The horizontal reactions should be zero or negligible.

#[test]
fn validation_load_path_ext_portal_gravity_symmetric() {
    let h = 5.0;
    let w = 8.0;
    let p = 30.0;

    // make_portal_frame applies gravity_load at nodes 2 and 3 (both beam ends)
    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -p);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Equal vertical reactions by symmetry: R1_y = R4_y = P (each column gets load P)
    assert_close(r1.ry, r4.ry, 0.01, "Portal gravity: R1_y = R4_y (symmetry)");

    // Total vertical reaction = 2P (two loads of P each)
    let total_p = 2.0 * p;
    assert_close(
        r1.ry + r4.ry,
        total_p,
        0.01,
        "Portal gravity: R1_y + R4_y = 2P",
    );

    // Each column carries P
    assert_close(r1.ry, p, 0.01, "Portal gravity: R1_y = P");
    assert_close(r4.ry, p, 0.01, "Portal gravity: R4_y = P");

    // Horizontal reactions should be zero by symmetry (no lateral load)
    let sum_rx: f64 = r1.rx + r4.rx;
    assert!(
        sum_rx.abs() < 0.01,
        "Portal gravity: sum_Rx = 0, got {:.6}",
        sum_rx
    );

    // Equal moments at both bases by symmetry
    let m_diff: f64 = (r1.mz.abs() - r4.mz.abs()).abs();
    assert!(
        m_diff < 0.1,
        "Portal gravity: equal base moments, diff = {:.6}",
        m_diff
    );
}

// ================================================================
// 5. Portal Frame Lateral: Horizontal Load Distributes to Both
//    Column Bases
// ================================================================
//
// A portal frame with a horizontal load H at the beam level must
// transfer the entire shear to the column bases. Both columns share
// the lateral load. The sum of horizontal reactions = -H (equilibrium).

#[test]
fn validation_load_path_ext_portal_lateral_distribution() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 15.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Horizontal equilibrium: R1_x + R4_x + H = 0
    assert_close(
        r1.rx + r4.rx,
        -lateral,
        0.01,
        "Portal lateral: sum_Rx = -H",
    );

    // Both columns carry some horizontal shear (neither is zero)
    assert!(
        r1.rx.abs() > 1.0,
        "Portal lateral: left column carries shear, got {:.4}",
        r1.rx
    );
    assert!(
        r4.rx.abs() > 1.0,
        "Portal lateral: right column carries shear, got {:.4}",
        r4.rx
    );

    // For a symmetric portal frame with equal column stiffness and fixed bases,
    // each column carries approximately H/2
    assert_close(
        r1.rx,
        -lateral / 2.0,
        0.10,
        "Portal lateral: R1_x approx -H/2",
    );
    assert_close(
        r4.rx,
        -lateral / 2.0,
        0.10,
        "Portal lateral: R4_x approx -H/2",
    );

    // Vertical reactions exist due to overturning moment (H*h)
    // Moment about base: H*h = R4_y * w => R4_y = H*h/w (approximate for portal method)
    // The two vertical reactions should be equal and opposite
    let sum_ry: f64 = r1.ry + r4.ry;
    assert!(
        sum_ry.abs() < 0.5,
        "Portal lateral: sum_Ry approx 0, got {:.4}",
        sum_ry
    );

    // Both bases should have nonzero moments (fixed supports resist rotation)
    assert!(
        r1.mz.abs() > 1.0,
        "Portal lateral: M1 nonzero, got {:.4}",
        r1.mz
    );
    assert!(
        r4.mz.abs() > 1.0,
        "Portal lateral: M4 nonzero, got {:.4}",
        r4.mz
    );
}

// ================================================================
// 6. Truss: Load Transfers as Axial Forces Only (Zero Moments)
// ================================================================
//
// A truss is composed of pin-connected members. All loads are applied
// at joints, so members carry only axial forces (tension/compression).
// Bending moments and shear forces should be zero in every member.
// We model this with hinge_start=true, hinge_end=true and IZ ~ 0.

#[test]
fn validation_load_path_ext_truss_axial_only() {
    let w = 6.0;
    let h = 4.0;
    let p = 30.0;
    let a_truss = 0.005;
    let iz_truss = 1e-8; // negligible bending stiffness

    // Warren-type truss: 4 nodes, 5 members
    // Bottom chord: 1(0,0) -- 2(w,0)
    // Top chord: 3(w/3, h) -- 4(2w/3, h)
    // Diagonals: 1-3, 3-2, 1-4, 4-2 ... simplified: triangulated truss
    //
    // Simpler: Pratt truss with 3 panels
    // Nodes: 1(0,0), 2(w/2,0), 3(w,0), 4(w/2,h)
    // Members: 1-2 (bottom left), 2-3 (bottom right), 1-4 (diagonal), 3-4 (diagonal), 2-4 (vertical)
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, w / 2.0, 0.0),
            (3, w, 0.0),
            (4, w / 2.0, h),
        ],
        vec![(1, E, 0.3)],
        vec![(1, a_truss, iz_truss)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom left
            (2, "frame", 2, 3, 1, 1, true, true), // bottom right
            (3, "frame", 1, 4, 1, 1, true, true), // left diagonal
            (4, "frame", 3, 4, 1, 1, true, true), // right diagonal
            (5, "frame", 2, 4, 1, 1, true, true), // vertical
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Verify reactions: R_A + R_B = P (vertical equilibrium)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.ry + r3.ry, p, 0.01, "Truss: sum_Ry = P");

    // By symmetry: R1_y = R3_y = P/2
    assert_close(r1.ry, p / 2.0, 0.02, "Truss: R1 = P/2");
    assert_close(r3.ry, p / 2.0, 0.02, "Truss: R3 = P/2");

    // All members should carry only axial force (moments and shear ~ 0)
    for i in 1..=5 {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == i)
            .unwrap();

        // Axial force should be nonzero (load path carries through)
        // (except possibly the vertical member 5 depending on configuration)
        // Moments and shears must be negligible
        assert!(
            ef.m_start.abs() < 0.01,
            "Truss elem {}: m_start = {:.6} should be ~0",
            i,
            ef.m_start
        );
        assert!(
            ef.m_end.abs() < 0.01,
            "Truss elem {}: m_end = {:.6} should be ~0",
            i,
            ef.m_end
        );
        assert!(
            ef.v_start.abs() < 0.01,
            "Truss elem {}: v_start = {:.6} should be ~0",
            i,
            ef.v_start
        );
        assert!(
            ef.v_end.abs() < 0.01,
            "Truss elem {}: v_end = {:.6} should be ~0",
            i,
            ef.v_end
        );
    }

    // Diagonals should carry nonzero axial force
    let ef3 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();
    let ef4 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 4)
        .unwrap();
    assert!(
        ef3.n_start.abs() > 1.0,
        "Truss: left diagonal carries axial force, N = {:.4}",
        ef3.n_start
    );
    assert!(
        ef4.n_start.abs() > 1.0,
        "Truss: right diagonal carries axial force, N = {:.4}",
        ef4.n_start
    );

    // By symmetry, diagonals should carry equal magnitude
    assert_close(
        ef3.n_start.abs(),
        ef4.n_start.abs(),
        0.02,
        "Truss: symmetric diagonal forces",
    );
}

// ================================================================
// 7. Propped Cantilever: Load Sharing Between Fixed and Roller
// ================================================================
//
// A propped cantilever (fixed at A, roller at B) with a point load P
// at midspan is a classic indeterminate structure. The fixed end
// carries more load than the roller (it also resists moment).
//
// Exact results for P at midspan:
//   R_B = 5P/16 (roller)
//   R_A = 11P/16 (fixed)
//   M_A = 3PL/16 (fixed-end moment)

#[test]
fn validation_load_path_ext_propped_cantilever_sharing() {
    let l = 8.0;
    let n = 16;
    let p = 32.0;

    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // R_B = 5P/16 = 10.0 kN
    let r_b_exact = 5.0 * p / 16.0;
    assert_close(r_b.ry, r_b_exact, 0.02, "Propped: R_B = 5P/16");

    // R_A = 11P/16 = 22.0 kN
    let r_a_exact = 11.0 * p / 16.0;
    assert_close(r_a.ry, r_a_exact, 0.02, "Propped: R_A = 11P/16");

    // Fixed end carries MORE than the roller
    assert!(
        r_a.ry > r_b.ry,
        "Propped: fixed end carries more: R_A={:.4} > R_B={:.4}",
        r_a.ry,
        r_b.ry
    );

    // Vertical equilibrium
    assert_close(r_a.ry + r_b.ry, p, 0.01, "Propped: R_A + R_B = P");

    // Fixed-end moment = 3PL/16 = 48.0 kN*m
    let m_a_exact = 3.0 * p * l / 16.0;
    assert_close(
        r_a.mz.abs(),
        m_a_exact,
        0.02,
        "Propped: M_A = 3PL/16",
    );

    // Roller has zero moment (simple support)
    assert!(
        r_b.mz.abs() < 1e-6,
        "Propped: M_B = 0, got {:.6}",
        r_b.mz
    );

    // Deflection at midspan should be nonzero and downward
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert!(
        d_mid.uy < 0.0,
        "Propped: midspan deflects downward, uy = {:.6}",
        d_mid.uy
    );
}

// ================================================================
// 8. Multi-Span Beam: Point Load on One Span Affects Adjacent
//    Span Reactions
// ================================================================
//
// A three-span continuous beam (L1 = L2 = L3 = L) with a point load P
// at midspan of span 2 produces reactions at all 4 supports.
// The adjacent spans (1 and 3) have nonzero reactions even though
// no load is applied directly on them. This demonstrates how
// continuity transmits forces across spans.

#[test]
fn validation_load_path_ext_multi_span_adjacent_effects() {
    let l = 6.0;
    let n_per_span = 6;
    let p = 60.0;

    // Load at midspan of span 2: node = n_per_span + n_per_span/2 + 1
    let load_node = n_per_span + n_per_span / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;
    let node_d = 3 * n_per_span + 1;

    let r_a = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_a)
        .unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_b)
        .unwrap();
    let r_c = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_c)
        .unwrap();
    let r_d = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_d)
        .unwrap();

    // Global equilibrium: sum of all reactions = P
    let sum_ry: f64 = r_a.ry + r_b.ry + r_c.ry + r_d.ry;
    assert_close(sum_ry, p, 0.01, "Multi-span: sum_Ry = P");

    // Supports B and C (flanking the loaded span) carry the most load
    assert!(
        r_b.ry.abs() > r_a.ry.abs(),
        "Multi-span: R_B > R_A (B flanks loaded span)"
    );
    assert!(
        r_c.ry.abs() > r_d.ry.abs(),
        "Multi-span: R_C > R_D (C flanks loaded span)"
    );

    // By symmetry of the structure and load position (centered on span 2):
    // R_A = R_D and R_B = R_C
    assert_close(r_a.ry, r_d.ry, 0.02, "Multi-span: R_A = R_D (symmetry)");
    assert_close(r_b.ry, r_c.ry, 0.02, "Multi-span: R_B = R_C (symmetry)");

    // Adjacent span reactions (A and D) should be nonzero — key test for load path continuity
    assert!(
        r_a.ry.abs() > 0.1,
        "Multi-span: R_A nonzero (adjacent span effect), got {:.4}",
        r_a.ry
    );
    assert!(
        r_d.ry.abs() > 0.1,
        "Multi-span: R_D nonzero (adjacent span effect), got {:.4}",
        r_d.ry
    );

    // The far-end supports (A and D) should have negative reactions (uplift)
    // because the hogging moment at B and C lifts the outer spans
    assert!(
        r_a.ry < 0.0,
        "Multi-span: R_A < 0 (uplift from continuity), got {:.4}",
        r_a.ry
    );
    assert!(
        r_d.ry < 0.0,
        "Multi-span: R_D < 0 (uplift from continuity), got {:.4}",
        r_d.ry
    );
}
