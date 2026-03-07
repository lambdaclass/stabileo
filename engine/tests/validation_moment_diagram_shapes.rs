/// Validation: Bending Moment Diagram Shapes
///
/// References:
///   - Timoshenko, "Strength of Materials", Part I
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///
/// Tests verify the expected geometric shapes of moment diagrams for standard
/// loading cases: triangular, parabolic, trapezoidal, and sign-change patterns.
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Point Load at Midspan: Triangular Moment Diagram
// ================================================================
//
// P at midspan of simply-supported beam.
// Moment varies linearly from 0 at each support to PL/4 at midspan.

#[test]
fn validation_ss_point_load_triangular_diagram() {
    let l = 10.0;
    let p = 100.0;
    let n = 8; // 8 elements, midspan node = 5

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_max_expected = p * l / 4.0; // = 250

    // Moment at support ends should be zero
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert!(
        ef_first.m_start.abs() < m_max_expected * 0.05,
        "SS point load: m_start at left support should be ~0, got {:.4}",
        ef_first.m_start
    );

    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_max_expected * 0.05,
        "SS point load: m_end at right support should be ~0, got {:.4}",
        ef_last.m_end
    );

    // Element just before midspan (element n/2): m_end should equal PL/4
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max_expected, 0.02, "SS point load M_max at midspan");

    // Verify linear increase: moment at element boundaries should grow proportionally
    // Element i ends at x = i * L/n. For left half, M(x) = (P/2) * x.
    for i in 1..=(n / 2) {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end = i as f64 * l / n as f64;
        let m_expected = (p / 2.0) * x_end;
        assert_close(
            ef.m_end.abs(),
            m_expected,
            0.05,
            &format!("SS point load linear increase at elem {} end (x={:.1})", i, x_end),
        );
    }
}

// ================================================================
// 2. SS Beam UDL: Parabolic Moment Diagram
// ================================================================
//
// UDL on simply-supported beam.
// M(x) = (q*x/2)*(L - x), parabolic with M_max = qL^2/8 at midspan.

#[test]
fn validation_ss_udl_parabolic_diagram() {
    let l = 10.0;
    let q = 12.0;
    let n = 8;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let m_mid_expected = q * l * l / 8.0; // = 150

    // End moments should be zero
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert!(
        ef_first.m_start.abs() < m_mid_expected * 0.05,
        "SS UDL: m_start at left support should be ~0, got {:.4}",
        ef_first.m_start
    );

    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_mid_expected * 0.05,
        "SS UDL: m_end at right support should be ~0, got {:.4}",
        ef_last.m_end
    );

    // Midspan moment = qL^2/8
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.03, "SS UDL M_midspan = qL^2/8");

    // Verify parabolic shape: M(x) = (q/2)*x*(L - x)
    for i in 1..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end = i as f64 * l / n as f64;
        let m_expected = (q / 2.0) * x_end * (l - x_end);
        if m_expected > 1.0 {
            assert_close(
                ef.m_end.abs(),
                m_expected,
                0.05,
                &format!("SS UDL parabolic at elem {} end (x={:.1})", i, x_end),
            );
        }
    }
}

// ================================================================
// 3. Cantilever Point Load at Tip: Linear Moment Diagram
// ================================================================
//
// P at free end of cantilever. M(x) = P*(L - x).
// M at fixed end = PL, at tip = 0, linear variation.

#[test]
fn validation_cantilever_point_load_linear_diagram() {
    let l = 8.0;
    let p = 60.0;
    let n = 8;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_fixed_expected = p * l; // = 480

    // Moment at fixed end = PL
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), m_fixed_expected, 0.02, "Cantilever P: M at fixed end = PL");

    // Moment at free end = 0
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_fixed_expected * 0.02,
        "Cantilever P: M at tip should be ~0, got {:.4}",
        ef_last.m_end
    );

    // Verify linear decrease: M(x) = P*(L - x)
    for i in 1..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end = i as f64 * l / n as f64;
        let m_expected = p * (l - x_end);
        assert_close(
            ef.m_end.abs(),
            m_expected,
            0.03,
            &format!("Cantilever P linear at elem {} end (x={:.1})", i, x_end),
        );
    }
}

// ================================================================
// 4. Cantilever UDL: Parabolic Moment Diagram
// ================================================================
//
// UDL on cantilever. M(x) = (q/2)*(L - x)^2.
// M at fixed end = qL^2/2, at tip = 0.

#[test]
fn validation_cantilever_udl_parabolic_diagram() {
    let l = 8.0;
    let q = 10.0;
    let n = 8;

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

    let m_fixed_expected = q * l * l / 2.0; // = 320

    // Moment at fixed end = qL^2/2
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), m_fixed_expected, 0.02, "Cantilever UDL: M at fixed end = qL^2/2");

    // Moment at free end = 0
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_fixed_expected * 0.02,
        "Cantilever UDL: M at tip should be ~0, got {:.4}",
        ef_last.m_end
    );

    // Verify parabolic shape: M(x) = (q/2)*(L - x)^2
    for i in 1..n {
        let ef = results.element_forces.iter().find(|f| f.element_id == i).unwrap();
        let x_end = i as f64 * l / n as f64;
        let m_expected = (q / 2.0) * (l - x_end).powi(2);
        assert_close(
            ef.m_end.abs(),
            m_expected,
            0.05,
            &format!("Cantilever UDL parabolic at elem {} end (x={:.1})", i, x_end),
        );
    }
}

// ================================================================
// 5. Fixed-Fixed UDL: Parabolic with Negative End Moments
// ================================================================
//
// End moments = -qL^2/12 (hogging), midspan moment = +qL^2/24 (sagging).
// The diagram is parabolic between the two inflection points.

#[test]
fn validation_fixed_fixed_udl_negative_ends() {
    let l = 12.0;
    let q = 10.0;
    let n = 12;

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

    let m_end_expected = q * l * l / 12.0; // = 120 (hogging)
    let m_mid_expected = q * l * l / 24.0; // = 60 (sagging)

    // End moments = qL^2/12
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();

    assert_close(ef_first.m_start.abs(), m_end_expected, 0.03, "FF UDL: M at left end = qL^2/12");
    assert_close(ef_last.m_end.abs(), m_end_expected, 0.03, "FF UDL: M at right end = qL^2/12");

    // End moments should be hogging (opposite sign to midspan sagging)
    // The sign convention may vary, but the key check is that end moments and
    // midspan moment have opposite signs.
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.05, "FF UDL: M at midspan = qL^2/24");

    // Verify opposite signs: end moments and midspan moment
    assert!(
        ef_first.m_start * ef_mid.m_end < 0.0,
        "FF UDL: end moment ({:.4}) and midspan moment ({:.4}) should have opposite signs",
        ef_first.m_start, ef_mid.m_end
    );
}

// ================================================================
// 6. SS Beam Two Symmetric Point Loads: Trapezoidal Diagram
// ================================================================
//
// P at L/3 and 2L/3 on simply-supported beam.
// Between loads: constant moment M = P*L/3.
// Outside loads: linear increase/decrease.

#[test]
fn validation_ss_two_point_loads_trapezoidal() {
    let l = 9.0;
    let p = 15.0;
    let n = 9; // elem_len = 1.0, load at nodes 4 (x=3) and 7 (x=6)

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 3 + 1, // node 4 at x=3
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2 * n / 3 + 1, // node 7 at x=6
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let m_const_expected = p * l / 3.0; // = 45

    // Between the load points (elements 4, 5, 6), moment should be roughly constant
    let middle_elems: Vec<_> = results
        .element_forces
        .iter()
        .filter(|f| f.element_id > n / 3 && f.element_id <= 2 * n / 3)
        .collect();

    for ef in &middle_elems {
        assert_close(
            ef.m_start.abs(),
            m_const_expected,
            0.05,
            &format!("Trapezoidal constant zone elem {} m_start", ef.element_id),
        );
        assert_close(
            ef.m_end.abs(),
            m_const_expected,
            0.05,
            &format!("Trapezoidal constant zone elem {} m_end", ef.element_id),
        );
    }

    // Verify constancy: moments between loads should not vary much relative to each other
    let moments_in_zone: Vec<f64> = middle_elems.iter().map(|ef| ef.m_start.abs()).collect();
    if moments_in_zone.len() >= 2 {
        let m_min = moments_in_zone.iter().cloned().fold(f64::INFINITY, f64::min);
        let m_max = moments_in_zone.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let variation = (m_max - m_min) / m_const_expected;
        assert!(
            variation < 0.05,
            "Trapezoidal: moment variation in constant zone = {:.4}, should be < 5%",
            variation
        );
    }

    // End moments at supports should be zero
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_first.m_start.abs() < m_const_expected * 0.05,
        "Trapezoidal: left support M should be ~0, got {:.4}",
        ef_first.m_start
    );
    assert!(
        ef_last.m_end.abs() < m_const_expected * 0.05,
        "Trapezoidal: right support M should be ~0, got {:.4}",
        ef_last.m_end
    );
}

// ================================================================
// 7. Propped Cantilever: Nonzero Moment at Fixed End, Zero at SS End
// ================================================================
//
// Fixed at A (node 1), rollerX at B (end node). UDL applied.
// M_A = qL^2/8 (nonzero), M_B = 0 (free rotation at roller).

#[test]
fn validation_propped_cantilever_moment_boundary() {
    let l = 10.0;
    let q = 10.0;
    let n = 8;

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

    let m_fixed_expected = q * l * l / 8.0; // = 125

    // Fixed end: moment = qL^2/8
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(
        ef_first.m_start.abs(),
        m_fixed_expected,
        0.03,
        "Propped cantilever: M at fixed end = qL^2/8",
    );

    // Roller end: moment = 0 (free rotation)
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < m_fixed_expected * 0.03,
        "Propped cantilever: M at roller should be ~0, got {:.4}",
        ef_last.m_end
    );

    // Verify via reactions: the reaction moment at the fixed support should match
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_fixed.mz.abs(), m_fixed_expected, 0.03, "Propped cantilever: reaction Mz at fixed end");
}

// ================================================================
// 8. Propped Cantilever UDL: Sign Change Indicates Contraflexure
// ================================================================
//
// For a propped cantilever (fixed + roller) with UDL, the moment diagram
// transitions from hogging at the fixed end to sagging near midspan.
// This means there is a point of contraflexure where M = 0 and adjacent
// elements have opposite moment signs.

#[test]
fn validation_propped_cantilever_contraflexure() {
    let l = 10.0;
    let q = 10.0;
    let n = 16; // finer mesh to capture sign change accurately

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

    // The fixed end moment is hogging (one sign), midspan is sagging (opposite sign).
    // Find a pair of adjacent element boundaries where the moment changes sign.
    let mut found_contraflexure = false;
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|ef| ef.element_id);

    for window in sorted_forces.windows(2) {
        let m_left_end = window[0].m_end;
        let m_right_start = window[1].m_start;
        // Sign change between m_end of one element and m_start of the next
        if m_left_end * m_right_start < 0.0 {
            found_contraflexure = true;
            break;
        }
    }

    // Also check within individual elements (m_start vs m_end)
    if !found_contraflexure {
        for ef in &results.element_forces {
            if ef.m_start * ef.m_end < 0.0 {
                found_contraflexure = true;
                break;
            }
        }
    }

    assert!(
        found_contraflexure,
        "Propped cantilever UDL: expected a contraflexure point (moment sign change) but none found"
    );

    // Additionally verify the fixed end and roller end moments have consistent signs:
    // Fixed end moment is hogging, roller end moment is zero, and somewhere between
    // the moment reaches a sagging maximum.
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let m_fixed = ef_first.m_start;
    assert!(
        m_fixed.abs() > 1.0,
        "Propped cantilever: fixed end moment should be nonzero, got {:.4}",
        m_fixed
    );

    // Find the element with the largest moment of opposite sign to the fixed end
    let max_opposite = results
        .element_forces
        .iter()
        .flat_map(|ef| vec![ef.m_start, ef.m_end])
        .filter(|&m| m * m_fixed < 0.0)
        .map(|m| m.abs())
        .fold(0.0_f64, f64::max);

    assert!(
        max_opposite > 1.0,
        "Propped cantilever: should have a sagging region with significant moment, max opposite sign = {:.4}",
        max_opposite
    );
}
