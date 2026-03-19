/// Validation: Extended Stress Resultant Calculations (N, V, M Relationships)
///
/// References:
///   - Timoshenko, "Strength of Materials", Part I
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///   - Kassimali, "Structural Analysis", 6th Ed.
///
/// Tests verify the fundamental relationships between axial force (N),
/// shear force (V), and bending moment (M) for standard configurations:
///   1. SS beam UDL: linear shear, parabolic moment
///   2. Cantilever point load: constant shear, linear moment
///   3. SS beam point load at midspan: shear discontinuity at load point
///   4. Relationship dM/dx = V verified at multiple points
///   5. Relationship dV/dx = -q verified for UDL
///   6. Axially-loaded column: constant N, zero shear
///   7. Portal frame column: simultaneous N, V, M present
///   8. Fixed-fixed beam UDL: end shears, end moments, midspan values
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: V Varies Linearly from qL/2 to -qL/2,
//    M Parabolic with max qL^2/8
// ================================================================
//
// Simply-supported beam with UDL q (downward). Shear is linear:
//   V(x) = qL/2 - q*x
// Moment is parabolic:
//   M(x) = (q/2)*x*(L - x), M_max = qL^2/8 at midspan.
//
// Reference: Timoshenko, "Strength of Materials", Sec. 40

#[test]
fn validation_sr_ss_beam_udl_linear_shear_parabolic_moment() {
    let l = 10.0;
    let q = 12.0;
    let n: usize = 10;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len: f64 = l / n as f64;

    // Check shear at the start of the first element: V(0) = qL/2
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_left_expected: f64 = q * l / 2.0;
    assert_close(ef_first.v_start, v_left_expected, 0.02, "SS UDL SR: V(0) = qL/2");

    // Check shear at the end of the last element: V(L) = -qL/2
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    let v_right_expected: f64 = -(q * l / 2.0);
    assert_close(ef_last.v_end, v_right_expected, 0.02, "SS UDL SR: V(L) = -qL/2");

    // Verify linear variation of shear at element boundaries
    for i in 1..=n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_start: f64 = (i - 1) as f64 * elem_len;
        let x_end: f64 = i as f64 * elem_len;
        let v_start_expected: f64 = q * l / 2.0 - q * x_start;
        let v_end_expected: f64 = q * l / 2.0 - q * x_end;
        assert_close(ef.v_start, v_start_expected, 0.03,
            &format!("SS UDL SR: V at x={:.1}", x_start));
        assert_close(ef.v_end, v_end_expected, 0.03,
            &format!("SS UDL SR: V at x={:.1}", x_end));
    }

    // Verify parabolic moment: M(x) = (q/2)*x*(L - x)
    let m_max_expected: f64 = q * l * l / 8.0;
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max_expected, 0.03, "SS UDL SR: M_max = qL^2/8");

    for i in 1..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end: f64 = i as f64 * elem_len;
        let m_expected: f64 = (q / 2.0) * x_end * (l - x_end);
        if m_expected > 1.0 {
            assert_close(ef.m_end.abs(), m_expected, 0.05,
                &format!("SS UDL SR: M parabolic at x={:.1}", x_end));
        }
    }
}

// ================================================================
// 2. Cantilever Point Load: V = -P Constant, M Linear from 0 to -PL
// ================================================================
//
// Cantilever (fixed at left, free at right) with point load P downward
// at the tip. Shear is constant: V = P throughout.
// Moment is linear: M(x) = P*(L - x), from PL at fixed end to 0 at tip.
//
// Reference: Hibbeler, "Structural Analysis", Table inside front cover

#[test]
fn validation_sr_cantilever_point_load_constant_shear_linear_moment() {
    let l = 8.0;
    let p = 60.0;
    let n: usize = 8;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len: f64 = l / n as f64;

    // Shear should be constant = P (upward reaction at fixed end)
    // throughout all elements
    for i in 1..=n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        assert_close(ef.v_start, p, 0.02,
            &format!("Cantilever P SR: V_start constant at elem {}", i));
        assert_close(ef.v_end, p, 0.02,
            &format!("Cantilever P SR: V_end constant at elem {}", i));
    }

    // Moment should be linear: M(x) = P*(L - x)
    // At fixed end (x=0): M = PL
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let m_fixed_expected: f64 = p * l;
    assert_close(ef_first.m_start.abs(), m_fixed_expected, 0.02,
        "Cantilever P SR: M at fixed end = PL");

    // At free end (x=L): M = 0
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_fixed_expected * 0.02,
        "Cantilever P SR: M at tip should be ~0, got {:.6}", ef_last.m_end
    );

    // Verify linear decrease at intermediate points
    for i in 1..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end: f64 = i as f64 * elem_len;
        let m_expected: f64 = p * (l - x_end);
        assert_close(ef.m_end.abs(), m_expected, 0.03,
            &format!("Cantilever P SR: M linear at x={:.1}", x_end));
    }
}

// ================================================================
// 3. SS Beam Point Load at Midspan: V = P/2 Left, V = -P/2 Right
// ================================================================
//
// Simply-supported beam with point load P at midspan.
// Shear: V = +P/2 for x < L/2, V = -P/2 for x > L/2.
// The shear has a discontinuity (jump = P) at the load point.
//
// Reference: Gere & Goodno, Table D-1, Case 4

#[test]
fn validation_sr_ss_beam_midspan_point_load_shear_jump() {
    let l = 12.0;
    let p = 80.0;
    let n: usize = 12;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Left half: V = P/2 (positive, upward reaction at left)
    for i in 1..=(n / 2) {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        assert_close(ef.v_start, p / 2.0, 0.02,
            &format!("SS midspan P SR: V = P/2 left half, elem {}", i));
        assert_close(ef.v_end, p / 2.0, 0.02,
            &format!("SS midspan P SR: V = P/2 left half end, elem {}", i));
    }

    // Right half: V = -P/2 (negative, load exceeded reaction)
    for i in (n / 2 + 1)..=n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        assert_close(ef.v_start, -(p / 2.0), 0.02,
            &format!("SS midspan P SR: V = -P/2 right half, elem {}", i));
        assert_close(ef.v_end, -(p / 2.0), 0.02,
            &format!("SS midspan P SR: V = -P/2 right half end, elem {}", i));
    }

    // Shear jump at the load point: V_end(left) - V_start(right) = P
    let ef_left = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    let ef_right = results.element_forces.iter().find(|f| f.element_id == n / 2 + 1).unwrap();
    let shear_jump: f64 = ef_left.v_end - ef_right.v_start;
    assert_close(shear_jump, p, 0.02, "SS midspan P SR: shear jump = P at load point");
}

// ================================================================
// 4. Relationship dM/dx = V: Moment Gradient Matches Shear
// ================================================================
//
// For a beam without point loads within an element, the relationship
// dM/dx = V holds. We verify this by computing the finite difference
// of the moment diagram and comparing it to the average shear.
//
// Using SS beam with UDL where V and M are smooth.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Sec. 5.2

#[test]
fn validation_sr_dm_dx_equals_v() {
    let l = 10.0;
    let q = 15.0;
    let n: usize = 20; // fine mesh for good FD approximation

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len: f64 = l / n as f64;

    // For each element, check |dM/dx| ~ |V_avg|
    // Within a single element: dM/dx = (m_end - m_start) / elem_len
    // Average shear in element: V_avg = (v_start + v_end) / 2
    //
    // In the solver's local coordinate system, the sign convention for
    // moment and shear leads to dM/dx = -V. We verify the magnitude
    // relationship: |dM/dx| = |V_avg|.
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|ef| ef.element_id);

    for ef in &sorted_forces {
        let dm_dx: f64 = (ef.m_end - ef.m_start) / elem_len;
        let v_avg: f64 = (ef.v_start + ef.v_end) / 2.0;
        let diff: f64 = (dm_dx.abs() - v_avg.abs()).abs();
        let scale: f64 = v_avg.abs().max(1.0);
        assert!(
            diff / scale < 0.05,
            "dM/dx = V: elem {}, |dM/dx|={:.4}, |V_avg|={:.4}, diff={:.4}",
            ef.element_id, dm_dx.abs(), v_avg.abs(), diff
        );
    }

    // Also check at specific points using element boundary values
    // At x = L/4: V_analytical = qL/2 - q*(L/4) = qL/4
    // M_analytical = (q/2)*(L/4)*(3L/4) = 3qL^2/32
    let elem_at_quarter: usize = n / 4;
    let ef_q = sorted_forces[elem_at_quarter - 1];
    let x_q: f64 = elem_at_quarter as f64 * elem_len;
    let v_expected_q: f64 = q * l / 2.0 - q * x_q;
    assert_close(ef_q.v_end, v_expected_q, 0.03, "dM/dx = V: shear at L/4");

    // At x = 3L/4: V_analytical = qL/2 - q*(3L/4) = -qL/4
    let elem_at_3quarter: usize = 3 * n / 4;
    let ef_3q = sorted_forces[elem_at_3quarter - 1];
    let x_3q: f64 = elem_at_3quarter as f64 * elem_len;
    let v_expected_3q: f64 = q * l / 2.0 - q * x_3q;
    assert_close(ef_3q.v_end, v_expected_3q, 0.03, "dM/dx = V: shear at 3L/4");
}

// ================================================================
// 5. Relationship dV/dx = -q: Shear Gradient Matches Load Intensity
// ================================================================
//
// For a beam with UDL q, the relationship dV/dx = -q holds.
// We verify this using finite differences of the shear force diagram.
//
// Using SS beam with UDL: V(x) = qL/2 - q*x, so dV/dx = -q.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Sec. 5.2

#[test]
fn validation_sr_dv_dx_equals_negative_q() {
    let l = 10.0;
    let q = 12.0;
    let n: usize = 20;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len: f64 = l / n as f64;

    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|ef| ef.element_id);

    // Within each element, compute dV/dx = (v_end - v_start) / elem_len
    // and verify it equals -q (the load is applied downward, and the solver
    // uses the convention where downward UDL q yields dV/dx = -q in the
    // local coordinate system).
    for ef in &sorted_forces {
        let dv_dx: f64 = (ef.v_end - ef.v_start) / elem_len;
        // With load applied as -q (downward), the shear decreases at rate q
        // in the positive x direction: dV/dx = -q
        let diff: f64 = (dv_dx - (-q)).abs();
        assert!(
            diff < q * 0.05,
            "dV/dx = -q: elem {}, dV/dx={:.4}, expected={:.4}, diff={:.4}",
            ef.element_id, dv_dx, -q, diff
        );
    }

    // Also verify using element boundary shear values between adjacent elements
    for window in sorted_forces.windows(2) {
        let v_left: f64 = window[0].v_end;
        let v_right: f64 = window[1].v_start;
        // At element boundaries (no point loads), shear should be continuous
        let shear_continuity: f64 = (v_left - v_right).abs();
        assert!(
            shear_continuity < q * elem_len * 0.05,
            "dV/dx = -q: shear continuity between elem {} and {}, gap={:.6}",
            window[0].element_id, window[1].element_id, shear_continuity
        );
    }
}

// ================================================================
// 6. Axial-Loaded Column: N Constant = Applied Load, V ~ 0
// ================================================================
//
// Vertical column (pinned-roller along axis) with axial load only.
// No transverse loads, so V = 0 and M = 0 throughout.
// N = applied axial load, constant along the length.
//
// Using a horizontal beam with axial load (Fx) to stay in the 2D
// solver's coordinate system.
//
// Reference: Gere & Goodno, "Mechanics of Materials", Ch. 1

#[test]
fn validation_sr_axial_loaded_column_constant_n() {
    let l = 6.0;
    let p_axial = 100.0;
    let n: usize = 6;

    // Horizontal member, pinned at left (node 1), rollerX at right (node 7).
    // Apply axial load Fx at right end.
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Axial force should be constant in all elements
    for i in 1..=n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();

        // N should be approximately equal to applied axial load
        assert_close(ef.n_start.abs(), p_axial, 0.02,
            &format!("Axial column SR: N_start constant at elem {}", i));
        assert_close(ef.n_end.abs(), p_axial, 0.02,
            &format!("Axial column SR: N_end constant at elem {}", i));

        // Shear should be approximately zero
        assert!(
            ef.v_start.abs() < p_axial * 0.01,
            "Axial column SR: V_start ~ 0 at elem {}, got {:.6}", i, ef.v_start
        );
        assert!(
            ef.v_end.abs() < p_axial * 0.01,
            "Axial column SR: V_end ~ 0 at elem {}, got {:.6}", i, ef.v_end
        );

        // Moment should be approximately zero
        assert!(
            ef.m_start.abs() < p_axial * 0.01,
            "Axial column SR: M_start ~ 0 at elem {}, got {:.6}", i, ef.m_start
        );
        assert!(
            ef.m_end.abs() < p_axial * 0.01,
            "Axial column SR: M_end ~ 0 at elem {}, got {:.6}", i, ef.m_end
        );
    }
}

// ================================================================
// 7. Portal Frame Column: Simultaneous N, V, M Present
// ================================================================
//
// Portal frame with lateral load and gravity loads. The columns
// carry simultaneous axial force (from gravity), shear (from lateral
// load), and bending moment. This test verifies all three stress
// resultants are non-trivial and physically consistent.
//
// Frame layout: nodes 1(base-left), 2(top-left), 3(top-right), 4(base-right)
// Elements: 1(col 1->2), 2(beam 2->3), 3(col 3->4)
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Ch. 16

#[test]
fn validation_sr_portal_frame_column_simultaneous_nvm() {
    let h = 5.0;
    let w = 8.0;
    let h_load = 20.0;  // lateral load at node 2
    let g_load = -30.0;  // gravity at nodes 2 and 3

    let input = make_portal_frame(h, w, E, A, IZ, h_load, g_load);
    let results = linear::solve_2d(&input).unwrap();

    // Column 1 (element 1): node 1 -> node 2 (vertical, fixed base)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    // Column 2 (element 3): node 3 -> node 4 (vertical, fixed base)
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Axial force in columns should be non-trivial (gravity loads)
    // The columns carry the gravity from nodes 2 and 3
    assert!(
        ef1.n_start.abs() > 1.0,
        "Portal col1 SR: N should be non-trivial, got {:.6}", ef1.n_start
    );
    assert!(
        ef3.n_start.abs() > 1.0,
        "Portal col2 SR: N should be non-trivial, got {:.6}", ef3.n_start
    );

    // Shear in columns should be non-trivial (lateral load)
    assert!(
        ef1.v_start.abs() > 1.0,
        "Portal col1 SR: V should be non-trivial, got {:.6}", ef1.v_start
    );
    assert!(
        ef3.v_start.abs() > 1.0,
        "Portal col2 SR: V should be non-trivial, got {:.6}", ef3.v_start
    );

    // Moment in columns should be non-trivial (fixed-base frame)
    assert!(
        ef1.m_start.abs() > 1.0,
        "Portal col1 SR: M_base should be non-trivial, got {:.6}", ef1.m_start
    );
    assert!(
        ef3.m_start.abs() > 1.0,
        "Portal col2 SR: M_base should be non-trivial, got {:.6}", ef3.m_start
    );

    // Global equilibrium check: sum of horizontal reactions = lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_load, 0.02, "Portal SR: sum Rx = -H");

    // Global equilibrium check: sum of vertical reactions = total gravity
    let total_gravity: f64 = 2.0 * g_load.abs(); // two gravity loads (nodes 2 and 3)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_gravity, 0.02, "Portal SR: sum Ry = total gravity");

    // Column axial forces should approximately share the gravity load
    // (sum of column axial forces ~ total gravity)
    let n_col1: f64 = ef1.n_start.abs();
    let n_col3: f64 = ef3.n_start.abs();
    let n_sum: f64 = n_col1 + n_col3;
    assert_close(n_sum, total_gravity, 0.10,
        "Portal SR: sum of column axial forces ~ total gravity");
}

// ================================================================
// 8. Fixed-Fixed Beam UDL: V(0) = qL/2, V(mid) = 0,
//    M(0) = -qL^2/12, M(mid) = qL^2/24
// ================================================================
//
// Fixed-fixed beam under UDL q. By symmetry:
//   V(0) = qL/2, V(L) = -qL/2, V(midspan) = 0
//   M(ends) = qL^2/12 (hogging), M(midspan) = qL^2/24 (sagging)
//
// Reference: AISC Manual Table 3-23, Case 1

#[test]
fn validation_sr_fixed_fixed_udl_stress_resultants() {
    let l = 12.0;
    let q = 10.0;
    let n: usize = 24; // fine mesh for accuracy

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_end_expected: f64 = q * l * l / 12.0;   // = 120
    let m_mid_expected: f64 = q * l * l / 24.0;    // = 60
    let v_end_expected: f64 = q * l / 2.0;         // = 60

    // Shear at left end: V(0) = qL/2
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(ef_first.v_start, v_end_expected, 0.03,
        "FF UDL SR: V(x=0) = qL/2");

    // Shear at right end: V(L) = -qL/2
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert_close(ef_last.v_end, -v_end_expected, 0.03,
        "FF UDL SR: V(x=L) = -qL/2");

    // Shear at midspan should be approximately zero
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    assert!(
        ef_mid.v_end.abs() < v_end_expected * 0.05,
        "FF UDL SR: V(midspan) ~ 0, got {:.6}", ef_mid.v_end
    );

    // Moment at left end (hogging): M(0) = qL^2/12
    assert_close(ef_first.m_start.abs(), m_end_expected, 0.03,
        "FF UDL SR: |M(x=0)| = qL^2/12");

    // Moment at right end (hogging): M(L) = qL^2/12
    assert_close(ef_last.m_end.abs(), m_end_expected, 0.03,
        "FF UDL SR: |M(x=L)| = qL^2/12");

    // Moment at midspan (sagging): M(mid) = qL^2/24
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.05,
        "FF UDL SR: |M(midspan)| = qL^2/24");

    // End moments and midspan moment should have opposite signs
    assert!(
        ef_first.m_start * ef_mid.m_end < 0.0,
        "FF UDL SR: M(0) and M(mid) have opposite signs: {:.4} vs {:.4}",
        ef_first.m_start, ef_mid.m_end
    );

    // Symmetry: V(x) = -V(L-x) and M(x) = M(L-x)
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|ef| ef.element_id);
    for i in 0..(n / 2) {
        let ef_left = &sorted_forces[i];
        let ef_right = &sorted_forces[n - 1 - i];

        // Shear antisymmetry: V_start(i) ~ -V_end(n-i)
        let v_diff: f64 = (ef_left.v_start + ef_right.v_end).abs();
        assert!(
            v_diff < v_end_expected * 0.05,
            "FF UDL SR: shear antisymmetry, elem {} vs {}, diff={:.6}",
            ef_left.element_id, ef_right.element_id, v_diff
        );

        // Moment symmetry: |M_start(i)| ~ |M_end(n-i)|
        let m_diff: f64 = (ef_left.m_start.abs() - ef_right.m_end.abs()).abs();
        assert!(
            m_diff < m_end_expected * 0.05,
            "FF UDL SR: moment symmetry, elem {} vs {}, diff={:.6}",
            ef_left.element_id, ef_right.element_id, m_diff
        );
    }
}
