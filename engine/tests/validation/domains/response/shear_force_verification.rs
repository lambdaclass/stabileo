/// Validation: Shear Force Verification Against Analytical Solutions
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4-5
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 4
///   - Beer & Johnston, "Mechanics of Materials", 8th Ed., Ch. 5
///
/// Tests verify shear force values for standard beam cases:
///   1. SS beam point load at midspan: V = P/2 left, V = -P/2 right
///   2. SS beam UDL: V linearly varies from qL/2 to -qL/2
///   3. Cantilever tip load: V = P constant along span
///   4. Cantilever UDL: V(x) = q(L-x), linear from qL to 0
///   5. Fixed-fixed beam center point load: V = P/2 both halves
///   6. Fixed-fixed beam UDL: V = qL/2 at left, -qL/2 at right
///   7. dM/dx = V relationship for UDL beam
///   8. Shear at support equals reaction for SS beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Point Load at Midspan: Shear Jump
// ================================================================
// P at midspan of 8-element beam.
// Left half: V = +P/2 (constant). Right half: V = -P/2.

#[test]
fn validation_shear_ss_point_load_jump() {
    let l = 8.0;
    let n = 8;
    let p = 30.0;

    // Point load at midspan node (node 5 for 8-element beam)
    let mid_node = n / 2 + 1; // node 5
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let v_expected = p / 2.0; // 15.0

    // Left half elements (1..4): V should be +P/2 throughout
    for elem_id in 1..=(n / 2) {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();
        assert_close(
            ef.v_start,
            v_expected,
            0.02,
            &format!("Left half elem {}: v_start = P/2", elem_id),
        );
        assert_close(
            ef.v_end,
            v_expected,
            0.02,
            &format!("Left half elem {}: v_end = P/2", elem_id),
        );
    }

    // Right half elements (5..8): V should be -P/2 throughout
    for elem_id in (n / 2 + 1)..=n {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();
        assert_close(
            ef.v_start,
            -v_expected,
            0.02,
            &format!("Right half elem {}: v_start = -P/2", elem_id),
        );
        assert_close(
            ef.v_end,
            -v_expected,
            0.02,
            &format!("Right half elem {}: v_end = -P/2", elem_id),
        );
    }
}

// ================================================================
// 2. SS Beam UDL: Linear Shear Variation
// ================================================================
// V at left = qL/2, V at right = -qL/2, linear variation.

#[test]
fn validation_shear_ss_udl_linear() {
    let l = 10.0;
    let n = 10;
    let q = -12.0; // downward UDL

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let v_left = q.abs() * l / 2.0; // qL/2 = 60.0 (upward at left)
    let v_right = -(q.abs() * l / 2.0); // -qL/2 = -60.0 (downward at right)

    // First element: v_start should be close to qL/2
    let ef_first = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    assert_close(
        ef_first.v_start,
        v_left,
        0.03,
        "SS UDL: V at left support = qL/2",
    );

    // Last element: v_end should be close to -qL/2
    let ef_last = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n)
        .unwrap();
    assert_close(
        ef_last.v_end,
        v_right,
        0.03,
        "SS UDL: V at right support = -qL/2",
    );

    // Verify linear variation: shear at each element boundary
    // V(x) = qL/2 - q*x => at element i start: x = (i-1)*L/n
    let elem_len = l / n as f64;
    for i in 1..=n {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == i)
            .unwrap();
        let x_start = (i - 1) as f64 * elem_len;
        let v_analytical_start = v_left + q * x_start; // q is negative
        assert_close(
            ef.v_start,
            v_analytical_start,
            0.05,
            &format!("SS UDL: V at elem {} start (x={:.1})", i, x_start),
        );
    }
}

// ================================================================
// 3. Cantilever Tip Load: Constant Shear
// ================================================================
// P at tip. V = P everywhere (constant along span).

#[test]
fn validation_shear_cantilever_tip_load_constant() {
    let l = 6.0;
    let n = 6;
    let p = 25.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Shear should be constant = P (upward reaction at fixed end)
    // Sign convention: with downward P at tip, reaction is upward at fixed end.
    // v_start of each element should equal P.
    for elem_id in 1..=n {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();
        assert_close(
            ef.v_start.abs(),
            p,
            0.02,
            &format!("Cantilever tip load: |v_start| of elem {} = P", elem_id),
        );
        assert_close(
            ef.v_end.abs(),
            p,
            0.02,
            &format!("Cantilever tip load: |v_end| of elem {} = P", elem_id),
        );
    }
}

// ================================================================
// 4. Cantilever UDL: Linearly Varying Shear
// ================================================================
// V(x) = q*(L-x). At fixed end V = qL, at tip V = 0.

#[test]
fn validation_shear_cantilever_udl_linear() {
    let l = 8.0;
    let n = 8;
    let q = -10.0; // downward UDL

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;

    // At fixed end (elem 1 start): V = |q|*L = 80
    let ef_base = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    assert_close(
        ef_base.v_start.abs(),
        q.abs() * l,
        0.02,
        "Cantilever UDL: V at fixed end = qL",
    );

    // At tip (last elem end): V = 0
    let ef_tip = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n)
        .unwrap();
    assert!(
        ef_tip.v_end.abs() < 0.5,
        "Cantilever UDL: V at tip should be ~0, got {:.4}",
        ef_tip.v_end
    );

    // Verify linear variation at each element start
    // V(x) = |q|*(L - x) measured from the fixed end
    for i in 1..=n {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == i)
            .unwrap();
        let x_start = (i - 1) as f64 * elem_len;
        let v_analytical = q.abs() * (l - x_start);
        assert_close(
            ef.v_start.abs(),
            v_analytical,
            0.05,
            &format!(
                "Cantilever UDL: |V| at elem {} start (x={:.1}) = q(L-x)",
                i, x_start
            ),
        );
    }
}

// ================================================================
// 5. Fixed-Fixed Beam Point Load at Center: V = P/2 Both Halves
// ================================================================
// For symmetric loading on fixed-fixed beam, V = P/2 left, V = -P/2 right.

#[test]
fn validation_shear_fixed_fixed_center_point_load() {
    let l = 10.0;
    let n = 10;
    let p = 40.0;

    let mid_node = n / 2 + 1; // node 6
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let v_expected = p / 2.0; // 20.0

    // Left half elements (1..5): V = +P/2
    for elem_id in 1..=(n / 2) {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();
        assert_close(
            ef.v_start.abs(),
            v_expected,
            0.03,
            &format!("Fixed-fixed center P: |V| of left elem {} = P/2", elem_id),
        );
    }

    // Right half elements (6..10): V = -P/2
    for elem_id in (n / 2 + 1)..=n {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();
        assert_close(
            ef.v_start.abs(),
            v_expected,
            0.03,
            &format!(
                "Fixed-fixed center P: |V| of right elem {} = P/2",
                elem_id
            ),
        );
    }
}

// ================================================================
// 6. Fixed-Fixed Beam UDL: V = qL/2 at Left, -qL/2 at Right
// ================================================================
// For symmetric UDL on fixed-fixed beam, shear diagram is same as SS:
// V = qL/2 at left, linearly to -qL/2 at right.

#[test]
fn validation_shear_fixed_fixed_udl() {
    let l = 10.0;
    let n = 10;
    let q = -15.0; // downward UDL

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let v_left = q.abs() * l / 2.0; // 75.0

    // V at left end (first element start)
    let ef_first = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    assert_close(
        ef_first.v_start,
        v_left,
        0.03,
        "Fixed-fixed UDL: V at left = qL/2",
    );

    // V at right end (last element end)
    let ef_last = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n)
        .unwrap();
    assert_close(
        ef_last.v_end,
        -v_left,
        0.03,
        "Fixed-fixed UDL: V at right = -qL/2",
    );

    // V at midspan should be approximately zero (by symmetry)
    let mid_elem = n / 2;
    let ef_mid = results
        .element_forces
        .iter()
        .find(|e| e.element_id == mid_elem)
        .unwrap();
    assert!(
        ef_mid.v_end.abs() < v_left * 0.1,
        "Fixed-fixed UDL: V at midspan should be ~0, got {:.4}",
        ef_mid.v_end
    );
}

// ================================================================
// 7. Shear-Moment Relationship: dM/dx = V
// ================================================================
// For a UDL beam, (m_end - m_start) / L_elem ~ (v_start + v_end) / 2.
// The average shear over an element equals the moment slope.

#[test]
fn validation_shear_moment_relationship_dm_dx() {
    let l = 12.0;
    let n = 12;
    let q = -8.0; // downward UDL

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;

    // Check the relationship for every element
    for elem_id in 1..=n {
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();

        // Moment slope: (M_end - M_start) / L_elem
        let dm_dx = (ef.m_end - ef.m_start) / elem_len;

        // Average shear: (V_start + V_end) / 2
        let v_avg = (ef.v_start + ef.v_end) / 2.0;

        // The magnitude of the moment slope should equal the magnitude
        // of the average shear: |dM/dx| = |V|
        // (sign depends on the beam-element convention for internal forces)
        assert_close(
            dm_dx.abs(),
            v_avg.abs(),
            0.05,
            &format!(
                "|dM/dx| = |V| for elem {}: |dM/dx|={:.4}, |V_avg|={:.4}",
                elem_id, dm_dx.abs(), v_avg.abs()
            ),
        );
    }
}

// ================================================================
// 8. Shear at Support Equals Reaction
// ================================================================
// For a SS beam, v_start of the first element should equal R_A (the
// vertical reaction at the left support).

#[test]
fn validation_shear_at_support_equals_reaction() {
    let l = 10.0;
    let n = 10;
    let p = 50.0;

    // SS beam with an off-center point load at L/4 (node 3 + 1 = node 4 for 10 elems)
    // with nodes at 0, 1, 2, ..., 10. Load at node 4 means x = 3.0, a = 3.0, b = 7.0
    // R_A = P * b / L = 50 * 7 / 10 = 35
    // R_B = P * a / L = 50 * 3 / 10 = 15
    let load_node = 4;
    let a_dist = (load_node - 1) as f64 * (l / n as f64); // distance from left = 3.0
    let b_dist = l - a_dist; // distance from right = 7.0

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a_expected = p * b_dist / l; // 35.0
    let r_b_expected = p * a_dist / l; // 15.0

    // Get the reaction at node 1 (left support)
    let reaction_a = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();

    // v_start of first element should equal the left reaction
    let ef_first = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();

    assert_close(
        reaction_a.rz,
        r_a_expected,
        0.02,
        "R_A = P*b/L",
    );

    assert_close(
        ef_first.v_start,
        reaction_a.rz,
        0.02,
        "Shear at left support = R_A: v_start of elem 1 equals reaction Ry",
    );

    // Also verify at the right end: |v_end| of last element should equal R_B
    let reaction_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    let ef_last = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n)
        .unwrap();

    assert_close(
        reaction_b.rz,
        r_b_expected,
        0.02,
        "R_B = P*a/L",
    );

    assert_close(
        ef_last.v_end.abs(),
        reaction_b.rz,
        0.02,
        "Shear at right support = R_B: |v_end| of last elem equals reaction Ry",
    );
}
