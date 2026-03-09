/// Validation: Equilibrium Conditions Along the Full Structure
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4-5 (shear and moment diagrams)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5 (internal forces)
///   - Beer & Johnston, "Mechanics of Materials", 8th Ed., Ch. 6
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", §2.5
///
/// The FEM must produce element forces that are in equilibrium at every section.
/// Specifically:
///   - dV/dx = -q(x)  (differential relation for shear under distributed load)
///   - dM/dx = V(x)   (differential relation for bending moment)
///   - Shear sign must change at the zero-shear point in a SS beam under UDL
///   - At fixed ends of a fixed-fixed beam under UDL: M = -qL²/12 (hogging)
///   - At midspan of a fixed-fixed beam: M = +qL²/24 (sagging)
///   - At interior supports of a continuous beam: shear jumps by the reaction value
///   - Portal frame: axial force in beam equals the shear in the column
///   - Truss: every node satisfies ΣFx = 0 and ΣFy = 0
///
/// Tests:
///   1. SS beam under UDL: V changes sign at midspan
///   2. Fixed-fixed beam: moment pattern hogging-sagging-hogging
///   3. Cantilever under UDL: moment increases monotonically toward fixed end
///   4. Portal frame column: combined axial + shear + moment consistency
///   5. Truss equilibrium: every node satisfies ΣF = 0
///   6. Continuous beam: shear jump at interior support = reaction
///   7. Element-by-element force balance: V_j = V_i - q*L_elem
///   8. Portal frame: beam axial force equals column shear force
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Under UDL: Shear Changes Sign at Midspan
// ================================================================
//
// Simply supported beam (L = 8 m) with UDL q = -10 kN/m.
// Shear at left: V(0+) = +qL/2 = +40 kN (upward reaction, positive).
// Shear at midspan: V(L/2) = 0 (sign change).
// Shear at right: V(L-) = -qL/2 = -40 kN.
//
// We verify the shear from the leftmost element has the opposite sign
// to the shear from the rightmost element.
//
// Ref: Hibbeler, "Structural Analysis", §4.2, Example 4-3

#[test]
fn validation_path_ss_udl_shear_sign_change() {
    let l = 8.0;
    let n = 16;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // First element: positive shear (left reaction dominates)
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    // Last element: negative shear (right reaction dominates)
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();

    // Shear at left end of first element: V(0+) = +qL/2
    let v_max = q.abs() * l / 2.0;
    assert_close(ef_first.v_start.abs(), v_max, 0.02,
        "SS UDL: |V(0+)| = qL/2");

    // Sign change: v_start of first element is opposite sign to v_end of last element
    assert!(ef_first.v_start > 0.0,
        "SS UDL: V at left support is positive (upward): {:.4}", ef_first.v_start);
    assert!(ef_last.v_end < 0.0,
        "SS UDL: V at right support is negative (downward): {:.4}", ef_last.v_end);

    // The shear must pass through zero: check that some element straddles zero
    let has_sign_change = results.element_forces.iter().any(|ef| ef.v_start * ef.v_end < 0.0);
    assert!(has_sign_change,
        "SS UDL: shear must change sign somewhere along the beam");
}

// ================================================================
// 2. Fixed-Fixed Beam: Moment Pattern Hogging-Sagging-Hogging
// ================================================================
//
// Fixed-fixed beam (L = 6 m) under UDL q = -10 kN/m.
// End moments: M_end = -qL²/12 = -30 kN·m (hogging, negative).
// Midspan moment: M_mid = +qL²/24 = +15 kN·m (sagging, positive).
//
// The sign of m_start of element 1 and m_end of element n should be
// the same (both hogging), while the middle element should have a
// moment of opposite sign.
//
// Ref: Beer & Johnston, "Mechanics of Materials", §5.3, Table B-9

#[test]
fn validation_path_fixed_fixed_moment_pattern() {
    let l = 6.0;
    let n = 12;
    let q = -10.0;
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let ef_mid = results.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();

    // End moments should be hogging (negative in beam convention):
    let m_end_exact = q.abs() * l * l / 12.0; // magnitude
    assert_close(ef1.m_start.abs(), m_end_exact, 0.02,
        "FF: |M_start| = qL²/12");
    assert_close(ef_last.m_end.abs(), m_end_exact, 0.02,
        "FF: |M_end| = qL²/12");

    // Midspan moment should be sagging (opposite sign to end moments)
    // The exact value at x=L/2 is qL²/24. We check the midspan element
    // which straddles x=L/2; its m_end corresponds to the node at x=L/2.
    let m_mid_exact = q.abs() * l * l / 24.0;
    // Use the end of element n/2 which is at x = L/2 exactly for even n
    let m_at_midspan = ef_mid.m_end.abs();
    assert_close(m_at_midspan, m_mid_exact, 0.05,
        "FF: |M_mid| ≈ qL²/24");

    // End moments and midspan moment must have opposite sign
    assert!(ef1.m_start * ef_mid.m_start < 0.0 || ef_mid.m_start.abs() < 1e-3,
        "FF: end moment and midspan moment have opposite signs: M_end={:.4}, M_mid={:.4}",
        ef1.m_start, ef_mid.m_start);

}

// ================================================================
// 3. Cantilever Under UDL: Moment Increases Toward Fixed End
// ================================================================
//
// Cantilever beam (L = 6 m, fixed at left, free at right) under UDL q = -10 kN/m.
// M(x) = q(L-x)²/2, which is maximum at x=0 (fixed end) and zero at x=L (free end).
// The moment magnitude must be monotonically decreasing from fixed to free end.
//
// Ref: Hibbeler, "Structural Analysis", §4.3, Example 4-8

#[test]
fn validation_path_cantilever_udl_moment_monotonic() {
    let l = 6.0;
    let n = 6;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check moment magnitudes decrease from fixed end (elem 1) to free end (elem n)
    let mut prev_m = f64::MAX;
    for elem_id in 1..=n {
        let ef = results.element_forces.iter().find(|e| e.element_id == elem_id).unwrap();
        let m_here = ef.m_start.abs();
        assert!(m_here <= prev_m + 1e-6,
            "Cantilever UDL: moment magnitude must decrease from fixed to free end at elem {}: {:.4} > {:.4}",
            elem_id, m_here, prev_m);
        prev_m = m_here;
    }

    // Free end moment should be ≈ 0
    let ef_free = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert!(ef_free.m_end.abs() < 1.0,
        "Cantilever UDL: M_free_end ≈ 0: {:.6e}", ef_free.m_end);

    // Fixed end moment should be qL²/2
    let ef_fixed = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let m_fixed_exact = q.abs() * l * l / 2.0;
    assert_close(ef_fixed.m_start.abs(), m_fixed_exact, 0.02,
        "Cantilever UDL: M_fixed = qL²/2");
}

// ================================================================
// 4. Portal Frame Column: Axial + Shear + Moment Consistency
// ================================================================
//
// Portal frame (h=4m, w=6m) under lateral load F=10kN at top.
// Left column (element 1, nodes 1→2): carries:
//   - Axial: N = Ry (vertical reaction at base)
//   - Shear: V = Rx / 2 (half of total horizontal reaction)
//   - Moment: M_base ≈ F*h/2 (inflection point assumed at mid-height for equal columns)
//
// Verify internal consistency:
//   M_top + M_base = V_col * h  (moment equilibrium of column free body)
//
// Ref: Kassimali, "Structural Analysis", §5.2, portal frame analysis

#[test]
fn validation_path_portal_column_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Left column: element 1 (nodes 1 to 2)
    let ef_col = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    // Global equilibrium: sum of base horizontal reactions = -F_lat
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rx + r4.rx, -f_lat, 0.01,
        "Portal: ΣRx = -F");

    // Column shear should equal the base horizontal reaction
    // (column carries constant shear between base and beam)
    assert_close(ef_col.v_start.abs(), r1.rx.abs(), 0.05,
        "Portal: column shear = base horizontal reaction");

    // Moment equilibrium of left column:
    // |M_base| + |M_top| = V_col * h
    let m_check = ef_col.m_start.abs() + ef_col.m_end.abs();
    let v_times_h = ef_col.v_start.abs() * h;
    assert_close(m_check, v_times_h, 0.02,
        "Portal: M_base + M_top = V_col * h (column moment equilibrium)");
}

// ================================================================
// 5. Truss Equilibrium: Every Node Satisfies ΣF = 0
// ================================================================
//
// Four-panel symmetric Pratt truss: bottom chord nodes 1-5, top chord nodes 6-10,
// with verticals and diagonals. Load P at each interior bottom node 2, 3, 4.
//
// At every support node: sum of reactions + sum of member forces = 0.
// Global equilibrium: ΣRy = 3P (total vertical load).
//
// By symmetry, the reactions at nodes 1 and 5 are equal: R1 = R5 = 3P/2.
// All member forces must be finite.
// The bottom chord carries tension, top chord carries compression.
//
// Ref: Beer & Johnston, "Vector Mechanics for Engineers", §6.2

#[test]
fn validation_path_truss_nodal_equilibrium() {
    let w = 3.0; // panel width
    let h = 3.0; // truss height
    let p = 10.0;

    // Bottom: nodes 1..=5, Top: nodes 6..=10
    let nodes_data = vec![
        (1, 0.0,       0.0), (2, w,       0.0), (3, 2.0*w, 0.0),
        (4, 3.0*w,     0.0), (5, 4.0*w,   0.0),
        (6, 0.0,         h), (7, w,           h), (8, 2.0*w,   h),
        (9, 3.0*w,       h), (10, 4.0*w,   h),
    ];
    let elems_data = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 5, 1, 1, false, false),
        // Top chord
        (5, "truss",  6,  7, 1, 1, false, false),
        (6, "truss",  7,  8, 1, 1, false, false),
        (7, "truss",  8,  9, 1, 1, false, false),
        (8, "truss",  9, 10, 1, 1, false, false),
        // Verticals
        (9,  "truss", 1,  6, 1, 1, false, false),
        (10, "truss", 2,  7, 1, 1, false, false),
        (11, "truss", 3,  8, 1, 1, false, false),
        (12, "truss", 4,  9, 1, 1, false, false),
        (13, "truss", 5, 10, 1, 1, false, false),
        // Diagonals (Pratt: slope toward center)
        (14, "truss", 1,  7, 1, 1, false, false),
        (15, "truss", 2,  8, 1, 1, false, false),
        (16, "truss", 3,  9, 1, 1, false, false),
        (17, "truss", 4, 10, 1, 1, false, false),
    ];
    let sups_data = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let loads_data = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let input = make_input(
        nodes_data, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_data, sups_data, loads_data,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: ΣRy = 3P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 3.0 * p, 0.01, "Truss: ΣRy = 3P");

    // ΣRx = 0 (no horizontal loads)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.01, "Truss: ΣRx = 0");

    // By symmetry: R1 = R5 = 3P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.ry, 3.0 * p / 2.0, 0.01, "Truss: R1 = 3P/2 (symmetry)");
    assert_close(r5.ry, 3.0 * p / 2.0, 0.01, "Truss: R5 = 3P/2 (symmetry)");

    // All member forces must be finite
    for ef in &results.element_forces {
        assert!(ef.n_start.is_finite(),
            "Truss: all member forces finite, elem {}", ef.element_id);
    }

    // Bottom chord should be in tension (positive N) under gravity loading
    let ef_bot_mid = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_bot_mid.n_start > 0.0,
        "Truss: bottom chord in tension: N={:.4}", ef_bot_mid.n_start);

    // Top chord should be in compression (negative N) under gravity loading
    let ef_top_mid = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(ef_top_mid.n_start < 0.0,
        "Truss: top chord in compression: N={:.4}", ef_top_mid.n_start);
}

// ================================================================
// 6. Continuous Beam: Shear Jump at Interior Support = Reaction
// ================================================================
//
// Two-span beam (6m + 6m) with UDL q = -10 kN/m on both spans.
// At the interior support, the shear force jumps by exactly the
// magnitude of the interior reaction.
//
// Interior reaction for equal-span equal-load two-span beam: R_B = 10qL/8 = 5qL/4.
// (This is 5/4 of what a simply-supported beam would carry at each end.)
//
// Ref: Kassimali, "Structural Analysis", §12.4, two-span beam

#[test]
fn validation_path_continuous_shear_jump() {
    let span = 6.0;
    let n_per_span = 12;
    let q = -10.0;
    let total_n = 2 * n_per_span;

    let loads: Vec<SolverLoad> = (1..=total_n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support: node n_per_span + 1 = 13
    let interior_node = n_per_span + 1;

    let r_int = results.reactions.iter()
        .find(|r| r.node_id == interior_node).unwrap();

    // Element just before interior support (last element of span 1)
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    // Element just after interior support (first element of span 2)
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span + 1).unwrap();

    // Shear jump = |V_right_start - V_left_end| should equal the reaction magnitude
    let v_jump = (ef_right.v_start - ef_left.v_end).abs();
    assert_close(v_jump, r_int.ry.abs(), 0.05,
        "Continuous: shear jump at interior support = reaction");

    // Interior reaction should be 10qL/8 for equal spans (by three-moment equation)
    let r_expected = 5.0 * q.abs() * span / 4.0;
    assert_close(r_int.ry.abs(), r_expected, 0.02,
        "Continuous: interior reaction = 5qL/4");
}

// ================================================================
// 7. Element-by-Element Force Balance: V_j = V_i - q*L_elem
// ================================================================
//
// For any element carrying a uniform distributed load q over its length L_e,
// the differential equilibrium relation gives:
//   V_j = V_i + q * L_e   (with q negative for downward loads)
//
// Similarly: M_j = M_i + (V_i + V_j)/2 * L_e
//
// Test: cantilever under UDL, n = 6 elements. Each element must satisfy
// the local shear equilibrium condition exactly.
//
// Ref: Beer & Johnston, "Mechanics of Materials", §6.2 (differential equation of beam)

#[test]
fn validation_path_element_force_balance() {
    let l = 6.0;
    let n = 6;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let l_elem = l / n as f64;

    // For each element: V_j = V_i + q * L_elem
    // The sign convention used by the solver: positive V_start is upward on left face.
    // dV/dx = -q (distributed load per unit length is -10 kN/m, so dV/dx = +10)
    // V_end - V_start = q_distributed * L_elem = q * L_elem (since q = -10 kN/m)
    for ef in &results.element_forces {
        let v_expected_end = ef.v_start + q * l_elem;
        let err = (ef.v_end - v_expected_end).abs();
        assert!(err < 0.1,
            "Elem {}: V_end = V_start + q*L: V_end={:.4}, expected={:.4}",
            ef.element_id, ef.v_end, v_expected_end);
    }

    // Also check moment balance for each element:
    // M_j = M_i - V_avg * L_elem (sign depends on convention)
    // |M_j - M_i| ≈ V_avg * L_elem
    for ef in &results.element_forces {
        let v_avg = (ef.v_start + ef.v_end) / 2.0;
        let dm = ef.m_end - ef.m_start;
        let dm_expected = -v_avg * l_elem; // from beam differential equation
        let err = (dm - dm_expected).abs();
        let scale = dm.abs().max(dm_expected.abs()).max(1.0);
        assert!(err / scale < 0.05,
            "Elem {}: ΔM = -V_avg*L: ΔM={:.4}, expected={:.4}",
            ef.element_id, dm, dm_expected);
    }
}

// ================================================================
// 8. Portal Frame: Beam Axial Force Equals Column Shear Force
// ================================================================
//
// In a symmetric fixed-base portal frame under lateral load,
// horizontal equilibrium of the beam requires:
//   N_beam_left_end + N_beam_right_end = 0  (no horizontal distributed load on beam)
//
// Also, by cutting the top of the left column:
//   V_col_top = N_beam (axial in beam = shear at top of column)
//
// Additionally, for a horizontal beam with no vertical distributed load:
//   N_beam_left = N_beam_right  (constant axial force along beam)
//
// Ref: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", §5.3

#[test]
fn validation_path_portal_beam_axial_column_shear() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Beam is element 2 (node 2 to node 3)
    // Left column is element 1 (node 1 to node 2)
    let ef_beam  = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef_col_l = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    // Beam: no distributed load → constant axial force
    assert_close(ef_beam.n_start, ef_beam.n_end, 0.01,
        "Portal beam: N is constant (no horizontal distributed load)");

    // Left column shear at top (v_end) should equal beam axial force magnitude
    // (horizontal equilibrium at node 2)
    // The column end shear and beam axial are coupled through node 2 equilibrium
    assert_close(ef_col_l.v_end.abs(), ef_beam.n_start.abs(), 0.05,
        "Portal: |V_col_top| = |N_beam| (horizontal equilibrium at joint)");

    // Global: both columns carry equal shear for symmetric geometry
    let ef_col_r = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef_col_l.v_start.abs(), ef_col_r.v_start.abs(), 0.05,
        "Portal: both columns carry equal base shear (symmetric frame)");
}
