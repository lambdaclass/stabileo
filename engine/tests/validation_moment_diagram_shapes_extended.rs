/// Validation: Extended Bending Moment Diagram Shape Properties
///
/// References:
///   - Timoshenko, "Strength of Materials", Part I
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///   - Ghali & Neville, "Structural Analysis", 7th Ed.
///
/// Tests verify geometric properties of moment diagrams for standard
/// loading and support configurations: triangular, parabolic, sign-change,
/// contraflexure, hogging/sagging patterns, and pure bending regions.
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam with Point Load: Triangular Moment Diagram, M_max = PL/4
// ================================================================
//
// Simply-supported beam with concentrated load P at midspan.
// Moment diagram is triangular: M = 0 at both supports, linear increase
// to M_max = PL/4 at the midspan node.
//
// Reference: Gere & Goodno Table D-1, Case 4

#[test]
fn validation_ext_ss_point_load_triangular_mmax() {
    let l = 12.0;
    let p = 80.0;
    let n: usize = 12; // midspan node at n/2+1 = 7

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_max_expected: f64 = p * l / 4.0; // = 240

    // Moment at supports should be zero
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert!(
        ef_first.m_start.abs() < m_max_expected * 0.03,
        "SS point load ext: m_start at left support should be ~0, got {:.6}",
        ef_first.m_start
    );

    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_max_expected * 0.03,
        "SS point load ext: m_end at right support should be ~0, got {:.6}",
        ef_last.m_end
    );

    // Maximum moment at midspan = PL/4
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max_expected, 0.02, "SS point load ext: M_max = PL/4 at midspan");

    // Triangular shape: linear increase in left half M(x) = (P/2)*x
    for i in 1..=(n / 2) {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end: f64 = i as f64 * l / n as f64;
        let m_expected: f64 = (p / 2.0) * x_end;
        assert_close(
            ef.m_end.abs(),
            m_expected,
            0.03,
            &format!("SS point load ext: linear at elem {} (x={:.1})", i, x_end),
        );
    }

    // Triangular shape: linear decrease in right half M(x) = (P/2)*(L - x)
    for i in (n / 2 + 1)..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end: f64 = i as f64 * l / n as f64;
        let m_expected: f64 = (p / 2.0) * (l - x_end);
        assert_close(
            ef.m_end.abs(),
            m_expected,
            0.03,
            &format!("SS point load ext: linear decrease at elem {} (x={:.1})", i, x_end),
        );
    }
}

// ================================================================
// 2. SS Beam with UDL: Parabolic Moment Diagram, M_max = qL^2/8
// ================================================================
//
// Simply-supported beam under uniform distributed load q.
// Moment diagram is parabolic: M(x) = (q/2)*x*(L-x), with
// M_max = qL^2/8 at midspan.
//
// Reference: Timoshenko, "Strength of Materials", Sec. 40

#[test]
fn validation_ext_ss_udl_parabolic_mmax() {
    let l = 10.0;
    let q = 15.0;
    let n: usize = 10;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let m_mid_expected: f64 = q * l * l / 8.0; // = 187.5

    // End moments should be zero at supports
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert!(
        ef_first.m_start.abs() < m_mid_expected * 0.03,
        "SS UDL ext: m_start at left support should be ~0, got {:.6}",
        ef_first.m_start
    );

    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_mid_expected * 0.03,
        "SS UDL ext: m_end at right support should be ~0, got {:.6}",
        ef_last.m_end
    );

    // Midspan moment = qL^2/8
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.03, "SS UDL ext: M_midspan = qL^2/8");

    // Verify parabolic shape: M(x) = (q/2)*x*(L - x)
    for i in 1..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end: f64 = i as f64 * l / n as f64;
        let m_expected: f64 = (q / 2.0) * x_end * (l - x_end);
        if m_expected > 1.0 {
            assert_close(
                ef.m_end.abs(),
                m_expected,
                0.05,
                &format!("SS UDL ext: parabolic at elem {} (x={:.1})", i, x_end),
            );
        }
    }

    // Symmetry: M at x and M at (L-x) should be equal
    for i in 1..=(n / 2) {
        let ef_left = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let ef_right = results.element_forces.iter().find(|f| f.element_id == n - i).unwrap();
        let diff: f64 = (ef_left.m_end.abs() - ef_right.m_end.abs()).abs();
        assert!(
            diff < m_mid_expected * 0.03,
            "SS UDL ext: symmetry check failed at elem {} vs {}, diff={:.6}",
            i, n - i, diff
        );
    }
}

// ================================================================
// 3. Cantilever Point Load at Tip: Linear Moment from 0 to PL
// ================================================================
//
// Cantilever beam with concentrated load P at the free end.
// Moment diagram is linear: M = 0 at the tip, increases linearly
// to M = PL at the fixed end.
//
// Reference: Hibbeler, "Structural Analysis", Table inside front cover

#[test]
fn validation_ext_cantilever_point_load_linear() {
    let l = 6.0;
    let p = 50.0;
    let n: usize = 12;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_fixed_expected: f64 = p * l; // = 300

    // Moment at fixed end = PL
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), m_fixed_expected, 0.02, "Cantilever P ext: M at fixed end = PL");

    // Moment at free end = 0
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_fixed_expected * 0.02,
        "Cantilever P ext: M at tip should be ~0, got {:.6}",
        ef_last.m_end
    );

    // Verify linear decrease: M(x) = P*(L - x)
    for i in 1..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end: f64 = i as f64 * l / n as f64;
        let m_expected: f64 = p * (l - x_end);
        assert_close(
            ef.m_end.abs(),
            m_expected,
            0.03,
            &format!("Cantilever P ext: linear at elem {} (x={:.1})", i, x_end),
        );
    }

    // Verify strict monotonic decrease from fixed end to tip
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|ef| ef.element_id);
    for window in sorted_forces.windows(2) {
        let m_left: f64 = window[0].m_end.abs();
        let m_right: f64 = window[1].m_end.abs();
        assert!(
            m_left >= m_right - 1e-6,
            "Cantilever P ext: moment should decrease monotonically, elem {} ({:.4}) > elem {} ({:.4})",
            window[0].element_id, m_left, window[1].element_id, m_right
        );
    }
}

// ================================================================
// 4. Cantilever UDL: Parabolic Moment from 0 at Tip to qL^2/2
// ================================================================
//
// Cantilever beam with UDL q over full length.
// Moment diagram is parabolic: M(x) = (q/2)*(L-x)^2.
// M = 0 at the free end, M = qL^2/2 at the fixed end.
//
// Reference: Timoshenko, "Strength of Materials", Sec. 41

#[test]
fn validation_ext_cantilever_udl_parabolic() {
    let l = 8.0;
    let q = 12.0;
    let n: usize = 16;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_fixed_expected: f64 = q * l * l / 2.0; // = 384

    // Moment at fixed end = qL^2/2
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), m_fixed_expected, 0.02, "Cantilever UDL ext: M at fixed end = qL^2/2");

    // Moment at free end = 0
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_fixed_expected * 0.02,
        "Cantilever UDL ext: M at tip should be ~0, got {:.6}",
        ef_last.m_end
    );

    // Verify parabolic shape: M(x) = (q/2)*(L - x)^2
    for i in 1..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end: f64 = i as f64 * l / n as f64;
        let remaining: f64 = l - x_end;
        let m_expected: f64 = (q / 2.0) * remaining.powi(2);
        assert_close(
            ef.m_end.abs(),
            m_expected,
            0.05,
            &format!("Cantilever UDL ext: parabolic at elem {} (x={:.1})", i, x_end),
        );
    }

    // Verify the moment increases at an increasing rate toward the fixed end
    // (convex upward when viewed from the fixed end). The second differences
    // should be positive, meaning moments grow faster closer to the fixed end.
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|ef| ef.element_id);
    let moments: Vec<f64> = sorted_forces.iter().map(|ef| ef.m_end.abs()).collect();
    if moments.len() >= 3 {
        for i in 1..(moments.len() - 1) {
            let delta_right: f64 = moments[i] - moments[i + 1]; // increase going left
            let delta_left: f64 = moments[i - 1] - moments[i]; // increase going further left
            // Going from tip toward fixed end, increments should grow
            assert!(
                delta_left >= delta_right - 1.0,
                "Cantilever UDL ext: parabolic curvature check failed at index {}",
                i
            );
        }
    }
}

// ================================================================
// 5. Fixed-Fixed UDL: Moment Changes Sign
// ================================================================
//
// Fixed-fixed beam under UDL q. End moments = qL^2/12 (hogging),
// midspan moment = qL^2/24 (sagging). The moment diagram is parabolic
// and changes sign, with inflection points at x = L*(3-sqrt(3))/6 and
// x = L*(3+sqrt(3))/6.
//
// Reference: Gere & Goodno, Table D-3, Case 1

#[test]
fn validation_ext_fixed_fixed_udl_sign_change() {
    let l = 12.0;
    let q = 10.0;
    let n: usize = 24; // fine mesh to capture sign changes well

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_end_expected: f64 = q * l * l / 12.0; // = 120 (hogging)
    let m_mid_expected: f64 = q * l * l / 24.0; // = 60 (sagging)

    // End moments = qL^2/12
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert_close(ef_first.m_start.abs(), m_end_expected, 0.03, "FF UDL ext: M at left end = qL^2/12");
    assert_close(ef_last.m_end.abs(), m_end_expected, 0.03, "FF UDL ext: M at right end = qL^2/12");

    // Midspan moment = qL^2/24
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.05, "FF UDL ext: M at midspan = qL^2/24");

    // Key property: end moments and midspan moment have opposite signs
    assert!(
        ef_first.m_start * ef_mid.m_end < 0.0,
        "FF UDL ext: left end moment ({:.4}) and midspan moment ({:.4}) must have opposite signs",
        ef_first.m_start, ef_mid.m_end
    );
    assert!(
        ef_last.m_end * ef_mid.m_end < 0.0,
        "FF UDL ext: right end moment ({:.4}) and midspan moment ({:.4}) must have opposite signs",
        ef_last.m_end, ef_mid.m_end
    );

    // Count the number of sign changes (should be exactly 2 for FF UDL)
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|ef| ef.element_id);

    let mut sign_changes = 0_usize;
    // Check within elements (m_start vs m_end)
    for ef in &sorted_forces {
        if ef.m_start * ef.m_end < 0.0 {
            sign_changes += 1;
        }
    }
    // Check between adjacent elements
    for window in sorted_forces.windows(2) {
        if window[0].m_end * window[1].m_start < 0.0 {
            sign_changes += 1;
        }
    }

    assert!(
        sign_changes >= 2,
        "FF UDL ext: expected at least 2 sign changes (inflection points), found {}",
        sign_changes
    );
}

// ================================================================
// 6. Propped Cantilever UDL: One Zero-Crossing (Contraflexure)
// ================================================================
//
// Fixed at A, roller at B with UDL. The moment diagram transitions from
// hogging at the fixed end to sagging in the span, crossing zero once.
// This defines the point of contraflexure at x = L/4 from the fixed end.
//
// Reference: Hibbeler, "Structural Analysis", Example 10.1

#[test]
fn validation_ext_propped_cantilever_one_contraflexure() {
    let l = 10.0;
    let q = 10.0;
    let n: usize = 20; // fine mesh for accurate sign change detection

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_fixed_expected: f64 = q * l * l / 8.0; // = 125

    // Fixed end moment = qL^2/8
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), m_fixed_expected, 0.03, "Propped ext: M at fixed end = qL^2/8");

    // Roller end moment = 0
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_fixed_expected * 0.03,
        "Propped ext: M at roller should be ~0, got {:.6}",
        ef_last.m_end
    );

    // Find all sign changes (contraflexure points)
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|ef| ef.element_id);

    let mut contraflexure_count = 0_usize;
    let mut contraflexure_x: f64 = 0.0;

    // Check within elements
    for ef in &sorted_forces {
        if ef.m_start * ef.m_end < 0.0 {
            contraflexure_count += 1;
            // Estimate location by linear interpolation within element
            let elem_len: f64 = l / n as f64;
            let x_start: f64 = (ef.element_id - 1) as f64 * elem_len;
            let frac: f64 = ef.m_start.abs() / (ef.m_start.abs() + ef.m_end.abs());
            contraflexure_x = x_start + frac * elem_len;
        }
    }
    // Check between adjacent elements
    for window in sorted_forces.windows(2) {
        if window[0].m_end * window[1].m_start < 0.0 {
            contraflexure_count += 1;
            let elem_len: f64 = l / n as f64;
            contraflexure_x = window[0].element_id as f64 * elem_len;
        }
    }

    // Propped cantilever UDL should have exactly one contraflexure point
    assert_eq!(
        contraflexure_count, 1,
        "Propped ext: expected exactly 1 contraflexure point, found {}",
        contraflexure_count
    );

    // Contraflexure should be near x = L/4 = 2.5 from the fixed end
    let x_expected: f64 = l / 4.0;
    let x_err: f64 = (contraflexure_x - x_expected).abs();
    assert!(
        x_err < l * 0.1,
        "Propped ext: contraflexure at x={:.2}, expected ~{:.2}, error={:.2}",
        contraflexure_x, x_expected, x_err
    );
}

// ================================================================
// 7. Two-Span Beam UDL: Hogging Over Support, Sagging in Spans
// ================================================================
//
// Two equal spans with UDL. The interior support develops a hogging
// moment while the spans have sagging regions. For two equal spans
// with UDL, the interior moment = qL^2/8 (hogging).
//
// Reference: Ghali & Neville, "Structural Analysis", Ch. 4

#[test]
fn validation_ext_two_span_udl_hogging_sagging() {
    let l = 8.0; // each span
    let q = 10.0;
    let n_per_span: usize = 10;
    let n_total: usize = 2 * n_per_span;

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support moment (hogging): M_B = qL^2/8 for two equal spans
    // The interior support is at node 1 + n_per_span = 11
    let ef_span1_end = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();

    let m_interior_expected: f64 = q * l * l / 8.0; // = 80
    assert_close(
        ef_span1_end.m_end.abs(),
        m_interior_expected,
        0.05,
        "Two-span ext: interior support moment = qL^2/8",
    );

    // Exterior support moments should be zero (pinned/roller)
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n_total).unwrap();
    assert!(
        ef_first.m_start.abs() < m_interior_expected * 0.05,
        "Two-span ext: left support M should be ~0, got {:.6}",
        ef_first.m_start
    );
    assert!(
        ef_last.m_end.abs() < m_interior_expected * 0.05,
        "Two-span ext: right support M should be ~0, got {:.6}",
        ef_last.m_end
    );

    // The interior support moment (hogging) should have opposite sign to
    // the midspan moments (sagging) in each span.
    let m_interior_sign = ef_span1_end.m_end;

    // Midspan of span 1 is around element n_per_span/2
    let ef_mid_span1 = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span / 2)
        .unwrap();

    // Midspan of span 2 is around element n_per_span + n_per_span/2
    let ef_mid_span2 = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span + n_per_span / 2)
        .unwrap();

    // Hogging at support vs sagging in spans: opposite signs
    assert!(
        m_interior_sign * ef_mid_span1.m_end < 0.0,
        "Two-span ext: interior moment ({:.4}) and span 1 midspan ({:.4}) should have opposite signs",
        m_interior_sign, ef_mid_span1.m_end
    );
    assert!(
        m_interior_sign * ef_mid_span2.m_end < 0.0,
        "Two-span ext: interior moment ({:.4}) and span 2 midspan ({:.4}) should have opposite signs",
        m_interior_sign, ef_mid_span2.m_end
    );

    // Each span should have at least one sagging region with M > 0 (opposite to hogging)
    let span1_sagging: f64 = results
        .element_forces
        .iter()
        .filter(|ef| ef.element_id <= n_per_span)
        .flat_map(|ef| vec![ef.m_start, ef.m_end])
        .filter(|&m| m * m_interior_sign < 0.0)
        .map(|m| m.abs())
        .fold(0.0_f64, f64::max);

    let span2_sagging: f64 = results
        .element_forces
        .iter()
        .filter(|ef| ef.element_id > n_per_span)
        .flat_map(|ef| vec![ef.m_start, ef.m_end])
        .filter(|&m| m * m_interior_sign < 0.0)
        .map(|m| m.abs())
        .fold(0.0_f64, f64::max);

    assert!(
        span1_sagging > 1.0,
        "Two-span ext: span 1 should have sagging moment, max={:.4}",
        span1_sagging
    );
    assert!(
        span2_sagging > 1.0,
        "Two-span ext: span 2 should have sagging moment, max={:.4}",
        span2_sagging
    );
}

// ================================================================
// 8. SS Beam Two Symmetric Point Loads: Constant Moment (Pure Bending)
// ================================================================
//
// Simply-supported beam with equal loads P at distance a from each
// support (symmetric four-point bending). Between the load points,
// the shear is zero and the moment is constant M = P*a.
//
// Reference: Gere & Goodno, "Mechanics of Materials", Sec. 4.5

#[test]
fn validation_ext_ss_two_point_loads_pure_bending() {
    let l = 12.0;
    let p = 20.0;
    let n: usize = 12; // elem_len = 1.0
    let a_dist: f64 = l / 3.0; // loads at L/3 from each end

    // Load at node 5 (x=4.0) and node 9 (x=8.0)
    let load_node_left: usize = (n as f64 / 3.0) as usize + 1; // node 5
    let load_node_right: usize = n + 1 - (n as f64 / 3.0) as usize; // node 9

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node_left,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node_right,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_const_expected: f64 = p * a_dist; // = 20 * 4.0 = 80

    // End moments at supports should be zero
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_first.m_start.abs() < m_const_expected * 0.05,
        "Pure bending ext: left support M should be ~0, got {:.6}",
        ef_first.m_start
    );
    assert!(
        ef_last.m_end.abs() < m_const_expected * 0.05,
        "Pure bending ext: right support M should be ~0, got {:.6}",
        ef_last.m_end
    );

    // Between the load points (elements load_node_left to load_node_right-1),
    // the moment should be constant = P*a
    let left_elem: usize = load_node_left; // element starting after left load node
    let right_elem: usize = load_node_right - 1; // element ending before right load node

    let mut moments_in_pure_zone = Vec::new();
    for eid in left_elem..=right_elem {
        let ef = results.element_forces.iter().find(|f| f.element_id == eid).unwrap();
        moments_in_pure_zone.push(ef.m_start.abs());
        moments_in_pure_zone.push(ef.m_end.abs());
    }

    // All moments in the pure bending zone should be close to P*a
    for (idx, &m) in moments_in_pure_zone.iter().enumerate() {
        assert_close(
            m,
            m_const_expected,
            0.05,
            &format!("Pure bending ext: moment value {} in constant zone", idx),
        );
    }

    // Variation in the constant zone should be very small
    let m_min: f64 = moments_in_pure_zone.iter().cloned().fold(f64::INFINITY, f64::min);
    let m_max: f64 = moments_in_pure_zone.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let variation: f64 = (m_max - m_min) / m_const_expected;
    assert!(
        variation < 0.03,
        "Pure bending ext: moment variation in constant zone = {:.4}, should be < 3%",
        variation
    );

    // Verify shear is zero in the pure bending region
    for eid in left_elem..=right_elem {
        let ef = results.element_forces.iter().find(|f| f.element_id == eid).unwrap();
        assert!(
            ef.v_start.abs() < p * 0.05,
            "Pure bending ext: shear in constant zone elem {} should be ~0, got {:.6}",
            eid, ef.v_start
        );
        assert!(
            ef.v_end.abs() < p * 0.05,
            "Pure bending ext: shear in constant zone elem {} end should be ~0, got {:.6}",
            eid, ef.v_end
        );
    }
}
