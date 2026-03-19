/// Validation: Shear Force Diagrams — Extended
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 4-5
///   - Beer & Johnston, "Mechanics of Materials", Ch. 5
///   - Timoshenko & Young, "Theory of Structures", Ch. 3
///
/// Tests verify shear force values against closed-form analytical solutions:
///   1. SS beam + triangular load: V at supports and midspan
///   2. Propped cantilever + UDL: V at fixed and roller ends
///   3. Continuous two-span beam + UDL: V at interior support
///   4. SS beam + two symmetric point loads: constant shear between loads
///   5. Cantilever + tip point load: uniform shear along span
///   6. Fixed-fixed beam + midspan point load: V at supports
///   7. Portal frame + lateral load: column shear distribution
///   8. SS beam + partial UDL: shear in loaded and unloaded regions
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam + Triangular Load: V at Supports
// ================================================================
// Triangular load from q=0 at left to q_max at right on a simply-supported beam.
// Reactions: R_A = q_max * L / 6, R_B = q_max * L / 3
// V(0) = R_A, V(L) = -R_B

#[test]
fn validation_sfd_ext_triangular_load() {
    let l = 6.0;
    let n = 12;
    let q_max: f64 = -12.0; // downward at right end
    // Triangular load: linearly varying from 0 at left to q_max at right.
    // Each element gets linearly varying load q_i..q_j
    let elem_len = l / n as f64;
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let x_i = i as f64 * elem_len;
            let x_j = (i + 1) as f64 * elem_len;
            let qi = q_max * x_i / l;
            let qj = q_max * x_j / l;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical reactions for triangular load 0..q_max (downward = negative q):
    // Total load W = |q_max| * L / 2
    // R_A = W * L / (3*L) = W/3 = |q_max|*L/6
    // R_B = W * 2L / (3*L) = 2W/3 = |q_max|*L/3
    let w_total = q_max.abs() * l / 2.0;
    let ra = w_total / 3.0;  // left reaction (upward)
    let rb = 2.0 * w_total / 3.0;  // right reaction (upward)

    // Check reactions
    let ry_left: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_right: f64 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    assert_close(ry_left, ra, 0.02, "Triangular load: R_A = qL/6");
    assert_close(ry_right, rb, 0.02, "Triangular load: R_B = qL/3");

    // V at left support start = R_A (positive upward shear)
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.v_start.abs(), ra, 0.03, "Triangular load: V(0) = R_A");

    // V at right support = -R_B
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(ef_last.v_end.abs(), rb, 0.03, "Triangular load: V(L) = R_B");
}

// ================================================================
// 2. Propped Cantilever + UDL: V at Fixed and Roller Ends
// ================================================================
// Fixed at left, roller at right, UDL q downward.
// Reactions: R_A = 5qL/8, R_B = 3qL/8
// V(0) = 5qL/8, V(L) = -3qL/8

#[test]
fn validation_sfd_ext_propped_cantilever_udl() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -8.0;
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: R_A = 5qL/8 (upward), R_B = 3qL/8 (upward)
    let ra = 5.0 * q.abs() * l / 8.0;
    let rb = 3.0 * q.abs() * l / 8.0;

    // Check via reactions
    let ry_fixed: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_roller: f64 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    assert_close(ry_fixed, ra, 0.02, "Propped cantilever UDL: R_A = 5qL/8");
    assert_close(ry_roller, rb, 0.02, "Propped cantilever UDL: R_B = 3qL/8");

    // V at left = R_A
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.v_start.abs(), ra, 0.03, "Propped cantilever: V(0) = 5qL/8");

    // V at right = R_B (shear just left of roller)
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(ef_last.v_end.abs(), rb, 0.03, "Propped cantilever: V(L) = 3qL/8");
}

// ================================================================
// 3. Continuous Two-Span Beam + UDL: V at Interior Support
// ================================================================
// Two equal spans L each, UDL q on both spans.
// For equal spans: R_A = R_C = 3qL/8, R_B = 10qL/8 = 5qL/4
// V jump at interior support = R_B

#[test]
fn validation_sfd_ext_two_span_udl() {
    let span = 6.0;
    let n_per_span = 10;
    let q: f64 = -10.0;
    let total_elements = n_per_span * 2;

    let loads: Vec<SolverLoad> = (1..=total_elements)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: R_A = R_C = 3qL/8, R_B = 5qL/4
    let ra = 3.0 * q.abs() * span / 8.0;
    let rb = 5.0 * q.abs() * span / 4.0;

    // Check end reactions
    let ry_a: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(ry_a, ra, 0.03, "Two-span UDL: R_A = 3qL/8");

    let last_node = total_elements + 1;
    let ry_c: f64 = results.reactions.iter().find(|r| r.node_id == last_node).unwrap().rz;
    assert_close(ry_c, ra, 0.03, "Two-span UDL: R_C = 3qL/8 (symmetry)");

    // Check interior reaction (at node n_per_span + 1)
    let mid_node = n_per_span + 1;
    let ry_b: f64 = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap().rz;
    assert_close(ry_b, rb, 0.03, "Two-span UDL: R_B = 5qL/4");

    // V jump at interior support: difference between end of span 1 and start of span 2
    let ef_left = results.element_forces.iter().find(|e| e.element_id == n_per_span).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == n_per_span + 1).unwrap();
    let v_jump = (ef_left.v_end - ef_right.v_start).abs();
    assert_close(v_jump, rb, 0.05, "Two-span UDL: V jump at interior support = R_B");
}

// ================================================================
// 4. SS Beam + Two Symmetric Point Loads: Constant V Between Loads
// ================================================================
// P at L/3 and 2L/3 on SS beam.
// Between the two loads, V = 0 (by symmetry).
// Left region: V = P, Right region: V = -P

#[test]
fn validation_sfd_ext_two_symmetric_loads() {
    let l = 9.0;
    let n = 9;
    let p = 15.0;

    // Loads at L/3 (node 4) and 2L/3 (node 7) for 9-element beam
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_B = P (by symmetry, total load = 2P)
    let ry_a: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(ry_a, p, 0.02, "Symmetric loads: R_A = P");

    // Between loads (elements 4..6): V should be ~0
    for elem_id in 4..=6 {
        let ef = results.element_forces.iter().find(|e| e.element_id == elem_id).unwrap();
        assert!(ef.v_start.abs() < 0.5,
            "Symmetric loads: V~0 between loads, elem {} v_start={:.4}", elem_id, ef.v_start);
    }

    // Left of first load: V = +P (upward reaction minus no loads yet)
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_left.v_start.abs(), p, 0.03, "Symmetric loads: V = P left of first load");

    // Right of second load: V = -P
    let ef_right = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(ef_right.v_end.abs(), p, 0.03, "Symmetric loads: V = P right of second load");
}

// ================================================================
// 5. Cantilever + Tip Point Load: Uniform Shear Along Span
// ================================================================
// Fixed at left, P downward at tip.
// V = P everywhere along the beam (constant).

#[test]
fn validation_sfd_ext_cantilever_tip_load() {
    let l = 5.0;
    let n = 10;
    let p = 25.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // V should be constant and equal to P at every element
    for elem_id in 1..=n {
        let ef = results.element_forces.iter().find(|e| e.element_id == elem_id).unwrap();
        assert_close(ef.v_start.abs(), p, 0.02,
            &format!("Cantilever tip load: V = P at elem {} start", elem_id));
        assert_close(ef.v_end.abs(), p, 0.02,
            &format!("Cantilever tip load: V = P at elem {} end", elem_id));
    }

    // Moment at fixed end: M = P * L
    let ef_base = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_base.m_start.abs(), p * l, 0.02, "Cantilever tip load: M_fixed = PL");

    // Moment at free end: M = 0
    let ef_tip = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert!(ef_tip.m_end.abs() < 0.5, "Cantilever tip load: M_tip ~ 0, got {:.4}", ef_tip.m_end);
}

// ================================================================
// 6. Fixed-Fixed Beam + Midspan Point Load: V at Supports
// ================================================================
// Fixed-fixed beam, point load P at center.
// By symmetry: R_A = R_B = P/2, V_left = P/2, V_right = -P/2.

#[test]
fn validation_sfd_ext_fixed_beam_center_load() {
    let l = 8.0;
    let n = 16;
    let p = 30.0;

    let mid = n / 2 + 1; // node at midspan
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // V in left half = P/2 (constant, no distributed load)
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_left.v_start.abs(), p / 2.0, 0.02,
        "Fixed-fixed center P: V_left = P/2");

    // V in right half = P/2 (magnitude)
    let ef_right = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(ef_right.v_end.abs(), p / 2.0, 0.02,
        "Fixed-fixed center P: V_right = P/2");

    // V should jump by P at the midspan node
    let ef_before = results.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();
    let ef_after = results.element_forces.iter().find(|e| e.element_id == n / 2 + 1).unwrap();
    let v_jump = (ef_before.v_end - ef_after.v_start).abs();
    assert_close(v_jump, p, 0.02, "Fixed-fixed center P: V jump = P at midspan");

    // Check reaction
    let ry_a: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(ry_a, p / 2.0, 0.02, "Fixed-fixed center P: R_A = P/2");
}

// ================================================================
// 7. Portal Frame + Lateral Load: Column Shear Distribution
// ================================================================
// Fixed-base portal frame, lateral load H at top-left.
// By antisymmetry for equal columns: each column carries H/2 shear.
// Sum of column base shears = H.

#[test]
fn validation_sfd_ext_portal_lateral() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Sum of horizontal reactions must equal lateral load
    let rx_sum: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(rx_sum.abs(), lateral, 0.02, "Portal lateral: sum Rx = H");

    // Left column is element 1 (node 1->2), right column is element 3 (node 3->4)
    let ef_col_left = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_col_right = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Column shear is the transverse force (v) in the column element.
    // For vertical columns, shear corresponds to horizontal force.
    // The two column shears should sum to the lateral load.
    let col_shear_sum = ef_col_left.v_start.abs() + ef_col_right.v_start.abs();
    assert_close(col_shear_sum, lateral, 0.05,
        "Portal lateral: column shears sum to H");

    // Each column carries shear (not necessarily equal due to frame action,
    // but for fixed-fixed portal with equal columns, each carries ~H/2)
    assert_close(ef_col_left.v_start.abs(), lateral / 2.0, 0.10,
        "Portal lateral: left column V ~ H/2");
    assert_close(ef_col_right.v_start.abs(), lateral / 2.0, 0.10,
        "Portal lateral: right column V ~ H/2");
}

// ================================================================
// 8. SS Beam + Partial UDL: Shear in Loaded and Unloaded Regions
// ================================================================
// SS beam of length L, UDL q on first half only (0 to L/2).
// R_A = q*(L/2)/L * (L - L/4) = q*L*3/8 = 3qL/8
// R_B = q*(L/2)/L * (L/4) = qL/8
// (Using R_A + R_B = qL/2 check)
// In the unloaded right half, V is constant = -R_B

#[test]
fn validation_sfd_ext_partial_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    // Load only on first half: elements 1..n/2
    let loads: Vec<SolverLoad> = (1..=n / 2)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical reactions for UDL q on [0, L/2]:
    // Total load W = |q| * L/2
    // Centroid of load at L/4 from left.
    // R_B = W * (L/4) / L = |q| * L/2 * (L/4) / L = |q|*L/8
    // R_A = W - R_B = |q|*L/2 - |q|*L/8 = 3|q|*L/8
    let w_total = q.abs() * l / 2.0;
    let rb = q.abs() * l / 8.0;
    let ra = w_total - rb; // = 3qL/8

    let ry_a: f64 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_b: f64 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
    assert_close(ry_a, ra, 0.02, "Partial UDL: R_A = 3qL/8");
    assert_close(ry_b, rb, 0.02, "Partial UDL: R_B = qL/8");

    // In the unloaded region (right half), V is constant = -R_B
    // Check several elements in the unloaded region
    for elem_id in (n / 2 + 2)..=n {
        let ef = results.element_forces.iter().find(|e| e.element_id == elem_id).unwrap();
        assert_close(ef.v_start.abs(), rb, 0.05,
            &format!("Partial UDL: V constant in unloaded region, elem {}", elem_id));
        assert_close(ef.v_end.abs(), rb, 0.05,
            &format!("Partial UDL: V constant in unloaded region end, elem {}", elem_id));
    }

    // V at left support
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.v_start.abs(), ra, 0.03, "Partial UDL: V(0) = R_A");
}
