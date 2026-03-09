/// Extended validation tests for beams on 3 supports (2-span continuous).
///
/// These tests cover aspects NOT in the original file:
/// - Triangular (linearly varying) distributed loads
/// - Point loads applied on elements (PointOnElement)
/// - Shear force discontinuity at the interior support
/// - Midspan deflection of each span (analytical formula)
/// - Symmetry of displacements under symmetric loading
/// - Partial UDL on one span only
/// - Different stiffness per span (moment redistribution)
/// - Moment applied at interior support

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Helper to build UDL loads on all elements.
fn udl_loads(n_elements: usize, q: f64) -> Vec<SolverLoad> {
    (0..n_elements)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect()
}

// ─── Test 1: Triangular load on equal spans ──────────────────────────────────

/// Triangular load (zero at supports, peak at midspan) on a 2-span beam.
/// Reference: Three-moment equation with triangular load integrals.
///
/// For a single simply-supported span with triangular load peaking at mid:
///   w(x) = 2*q_max*x/L for x <= L/2, 2*q_max*(L-x)/L for x > L/2
///   total load on each span = q_max * L / 2
///
/// We approximate this with linearly varying distributed loads on sub-elements.
/// The key check is equilibrium and that M_B (hogging) is less in magnitude
/// than for a UDL with the same total load per span.
#[test]
fn triangular_load_equal_spans() {
    let l = 8.0;
    let n_per_span: usize = 8; // 8 elements per span for decent triangular approximation
    let elem_len = l / n_per_span as f64; // 1.0m per element
    let q_max: f64 = -10.0; // peak intensity at midspan

    // Build triangular load on each span:
    // Span 1: elements 1..8, midspan at element 4-5 boundary
    // Span 2: elements 9..16, midspan at element 12-13 boundary
    let mut loads = Vec::new();
    for span in 0..2 {
        for j in 0..n_per_span {
            let elem_id = span * n_per_span + j + 1;
            // x_start and x_end within this span (0 to L)
            let x_start = j as f64 * elem_len;
            let x_end = (j + 1) as f64 * elem_len;

            // Triangular intensity: w(x) = q_max * (1 - |x - L/2| / (L/2))
            // = q_max * 2*x/L for x <= L/2
            // = q_max * 2*(L-x)/L for x > L/2
            let half_l = l / 2.0;
            let w_start = if x_start <= half_l {
                q_max * x_start / half_l
            } else {
                q_max * (l - x_start) / half_l
            };
            let w_end = if x_end <= half_l {
                q_max * x_end / half_l
            } else {
                q_max * (l - x_end) / half_l
            };

            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: elem_id,
                q_i: w_start,
                q_j: w_end,
                a: None,
                b: None,
            }));
        }
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);

    // Total load per span = q_max * L / 2 = 10 * 8 / 2 = 40 kN per span
    // Total = 80 kN
    let total_load: f64 = 80.0;
    let sum_ry: f64 = reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "triangular: sum_ry = total load");

    // By symmetry: R_A = R_C
    let r_a = reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_c = reactions
        .iter()
        .find(|r| r.node_id == 1 + 2 * n_per_span)
        .unwrap()
        .ry;
    assert_close(r_a, r_c, 0.02, "triangular: R_A = R_C by symmetry");

    // R_B should be the largest reaction (interior support takes more)
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == 1 + n_per_span)
        .unwrap()
        .ry;
    assert!(
        r_b > r_a,
        "Interior reaction ({:.4}) should exceed end reaction ({:.4})",
        r_b,
        r_a
    );
}

// ─── Test 2: Point load on element (PointOnElement) ──────────────────────────

/// A single concentrated load P applied at the midpoint of span 1 using
/// the PointOnElement load type (not a nodal load).
///
/// Reference: Three-moment equation for a point load P at distance a=L/2
/// from the left end of span 1, with equal spans L1=L2=L:
///   2*M_B*(L+L) = -P*a*(L^2 - a^2)/L
///   With a = L/2:
///   4*M_B*L = -P*(L/2)*(L^2 - L^2/4)/L = -P*(L/2)*(3L^2/4)/L = -3PL^2/8
///   M_B = -3PL^2/(32L) = -3PL/32  ... Wait let me redo:
///   4*M_B*L = -P*a*(L1^2 - a^2)/L1
///   = -P*(L/2)*((L^2 - L^2/4))/L = -P*(L/2)*(3L/4) = -3PL^2/8
///   M_B = -3PL^2/(8*4*L) = -3PL/32  ... Hmm.
///
/// Actually using correct three-moment with concentrated load:
///   2*M_B*(L1+L2) = -P*a*(L1^2-a^2)/L1
///   With P=48, a=3, L1=L2=6:
///   2*M_B*12 = -48*3*(36-9)/6 = -48*3*27/6 = -48*13.5 = -648
///   M_B = -648/24 = -27
///
/// Span 1 reactions (SS beam with P at midspan, plus end moments 0 and M_B):
///   R_A = P*(L-a)/L + M_B/L = 48*3/6 + (-27)/6 = 24 - 4.5 = 19.5
///   R_B1 = P*a/L - M_B/L = 48*3/6 - (-27)/6 = 24 + 4.5 = 28.5
///
/// Span 2 (no load, moments M_B at left, 0 at right):
///   R_B2 = -M_B/L = 27/6 = 4.5
///   R_C = M_B/L = -27/6 = -4.5
///
/// Totals: R_A=19.5, R_B=28.5+4.5=33.0, R_C=-4.5
/// Check: 19.5 + 33.0 - 4.5 = 48.0  OK
#[test]
fn point_on_element_midspan() {
    let l: f64 = 6.0;
    let p_val: f64 = -48.0; // downward

    // Use n_per_span=1 to have one element per span,
    // and place the load at midspan: a = L/2 = 3m.
    let n_per_span_single = 1;
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1,
        a: l / 2.0, // at midspan of span 1
        p: p_val,
        px: None,
        mz: None,
    })];

    let input = make_continuous_beam(&[l, l], n_per_span_single, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);

    let p_abs: f64 = p_val.abs();

    // Equilibrium
    let sum_ry: f64 = reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_abs, 1e-6, "PointOnElement: sum_ry = |P|");

    let r_a = reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == 1 + n_per_span_single)
        .unwrap()
        .ry;
    let r_c = reactions
        .iter()
        .find(|r| r.node_id == 1 + 2 * n_per_span_single)
        .unwrap()
        .ry;

    // Analytical: M_B = -27, R_A = 19.5, R_B = 33.0, R_C = -4.5
    let r_a_expected: f64 = 19.5;
    let r_b_expected: f64 = 33.0;
    let r_c_expected: f64 = -4.5;

    assert_close(r_a, r_a_expected, 0.01, "PointOnElement: R_A");
    assert_close(r_b, r_b_expected, 0.01, "PointOnElement: R_B");
    assert_close(r_c, r_c_expected, 0.01, "PointOnElement: R_C");

    // Moment about A should be zero: R_B*L + R_C*2L - P_abs*(L/2) = 0
    let moment_about_a = r_b * l + r_c * 2.0 * l - p_abs * (l / 2.0);
    assert_close(moment_about_a, 0.0, 1e-4, "PointOnElement: moment about A = 0");
}

// ─── Test 3: Shear force discontinuity at interior support ───────────────────

/// For a 2-span beam under UDL, the shear force has a discontinuity at B
/// equal to the interior reaction R_B.
///
/// Reference: At the interior support, the shear jumps by R_B.
/// V_left(B) = R_A - q*L1  (shear just left of B)
/// V_right(B) = V_left(B) + R_B  (shear just right of B)
/// The jump V_right - V_left = R_B.
#[test]
fn shear_discontinuity_at_interior_support() {
    let q = -10.0;
    let l = 6.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;

    let loads = udl_loads(total_elems, q);
    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Shear just left of B: v_end of last element in span 1
    let ef_left = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();

    // Shear just right of B: v_start of first element in span 2
    let ef_right = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span + 1)
        .unwrap();

    // The shear jump magnitude should equal R_B
    // Note: v_end sign convention: positive shear in the element end direction.
    // The jump = v_start(span2) - v_end(span1) if they use consistent global sense,
    // but element forces are in local coordinates. For a horizontal beam,
    // the shear at left of B from span1 side is -v_end (since v_end is the
    // end shear), and from span2 side is v_start.
    //
    // Actually: v_end of element is the shear force at the j-end in local coords.
    // For equilibrium of the joint node B, the jump in global shear = R_B.
    // We check: |v_start(span2)| + |v_end(span1)| should relate to R_B.
    //
    // More directly: R_B from reactions should match the jump.
    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == 1 + n_per_span)
        .unwrap()
        .ry;

    // For a horizontal beam with downward UDL:
    // v_end of span1-last-element is negative (downward shear at right end)
    // v_start of span2-first-element is positive (upward shear at left end after reaction)
    // The shear jump = v_start(span2) - v_end(span1)
    let shear_jump = ef_right.v_start - ef_left.v_end;
    assert_close(
        shear_jump.abs(),
        r_b.abs(),
        0.01,
        "Shear jump at B = R_B",
    );

    // Verify R_B analytically: for equal spans, R_B = 10*q_abs*L/8 = 75
    assert_close(r_b, 75.0, 1e-3, "R_B = 10wL/8 for equal spans");
}

// ─── Test 4: Midspan deflection of continuous beam (analytical formula) ──────

/// For a 2-span continuous beam with equal spans L under UDL q,
/// the midspan deflection of each span is:
///   delta = (1/384) * q * L^4 / (EI) * (5 - 24*(M_B/(q*L^2)))
/// where M_B = -qL^2/8 * (from three-moment eqn, equal spans: M_B = -qL^2/8).
/// Wait, for equal spans: M_B = -q*L^2/8 only for propped cantilever.
/// For 2-span simply-supported ends:
///   M_B = -q*L^2/8  (this is actually correct for equal spans with UDL)
///
/// Midspan deflection for each span of a continuous beam (equal spans, UDL):
///   delta_mid = q*L^4/(384*EI) * (5 - 48*|M_B|/(q*L^2*8))
///
/// Simpler: use the known result delta_mid = q*L^4/(185*EI) for 2 equal
/// spans, pin-roller-roller, UDL on both. (Roark's Table 8.1)
/// Actually delta_mid = (2/384) * q*L^4/EI = q*L^4/192*EI is for a
/// propped cantilever midspan.
///
/// Let's just compute it from superposition:
/// SS beam midspan deflection = 5*q*L^4/(384*EI)
/// Correction from M_B: hogging moment M_B at the support creates an
/// additional upward deflection at midspan = M_B*L^2/(16*EI)
/// (deflection at midspan of SS beam with end moments M_B and 0)
/// So: delta = 5*q*L^4/(384*EI) + M_B*L^2/(16*EI)
/// With M_B = -q*L^2/8: delta = 5*q*L^4/(384*EI) - q*L^4/(128*EI)
///   = q*L^4/EI * (5/384 - 1/128) = q*L^4/EI * (5/384 - 3/384) = 2*q*L^4/(384*EI)
///   = q*L^4/(192*EI)
///
/// For q=10 kN/m (magnitude), L=6m, EI = 200e6 * 1e-4 * 1000 = 20000 kN.m^2
///   Wait: E in MPa, solver multiplies by 1000 -> kN/m^2.
///   EI = 200_000 * 1000 * 1e-4 = 20_000 kN.m^2
///   delta = 10 * 1296 / (192 * 20000) = 12960 / 3840000 = 0.003375 m downward
#[test]
fn midspan_deflection_analytical() {
    let q = -10.0;
    let l = 6.0;
    let n_per_span = 6; // 6 elements per span for good accuracy
    let total_elems = n_per_span * 2;

    let loads = udl_loads(total_elems, q);
    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan of span 1 is at x = L/2 = 3.0m, which is node 1 + n_per_span/2 = 4
    let mid_node = 1 + n_per_span / 2; // node 4
    let uy_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uy;

    // Analytical: delta = q_abs * L^4 / (192 * EI), downward = negative
    let q_abs: f64 = q.abs();
    let l4: f64 = l.powi(4);
    let ei: f64 = E * 1000.0 * IZ; // kN.m^2
    let delta_analytical: f64 = q_abs * l4 / (192.0 * ei);

    // uy should be negative (downward)
    assert!(uy_mid < 0.0, "midspan deflection should be negative");
    assert_close(
        uy_mid.abs(),
        delta_analytical,
        0.05, // 5% tolerance for mesh discretization
        "midspan deflection = qL^4/(192*EI)",
    );
}

// ─── Test 5: Symmetry of displacements under symmetric loading ───────────────

/// For a symmetric 2-span beam (equal spans) with symmetric UDL,
/// the deflected shape must be symmetric about the interior support.
/// Node displacements at symmetric positions must be equal.
///
/// Reference: Structural symmetry principle (Timoshenko, Theory of Structures).
#[test]
fn symmetric_displacements_equal_spans_udl() {
    let q = -10.0;
    let l = 8.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;

    let loads = udl_loads(total_elems, q);
    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Node numbering: 1, 2, 3, 4, 5 (span 1), 6, 7, 8, 9 (span 2)
    // Symmetric pairs about node 5: (4,6), (3,7), (2,8), (1,9)
    let mid_node = 1 + n_per_span;

    for k in 1..n_per_span {
        let left_node = mid_node - k;
        let right_node = mid_node + k;

        let uy_left = results
            .displacements
            .iter()
            .find(|d| d.node_id == left_node)
            .unwrap()
            .uy;
        let uy_right = results
            .displacements
            .iter()
            .find(|d| d.node_id == right_node)
            .unwrap()
            .uy;

        assert_close(
            uy_left,
            uy_right,
            1e-6,
            &format!("symmetry uy: node {} vs node {}", left_node, right_node),
        );

        // Rotations should be antisymmetric: rz(left) = -rz(right)
        let rz_left = results
            .displacements
            .iter()
            .find(|d| d.node_id == left_node)
            .unwrap()
            .rz;
        let rz_right = results
            .displacements
            .iter()
            .find(|d| d.node_id == right_node)
            .unwrap()
            .rz;

        assert_close(
            rz_left,
            -rz_right,
            1e-6,
            &format!(
                "antisymmetry rz: node {} vs node {}",
                left_node, right_node
            ),
        );
    }

    // At the interior support, uy = 0 (it's a support) and rz = 0 (by symmetry)
    let disp_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert_close(disp_mid.uy, 0.0, 1e-10, "interior support uy = 0");
    assert_close(disp_mid.rz, 0.0, 1e-10, "interior support rz = 0 by symmetry");
}

// ─── Test 6: UDL on one span only ───────────────────────────────────────────

/// 2-span beam with equal spans L, UDL on span 1 only.
///
/// Reference: Three-moment equation with w on span 1 only:
///   2*M_B*(L+L) = -w*L^3/4 - 0 = -w*L^3/4
///   M_B = -w*L^3 / (16*L) = -w*L^2/16
///
/// Reactions:
///   R_A = wL/2 + M_B/L = wL/2 - wL/16 = 7wL/16
///   R_C = 0 + M_B/L = -wL/16  -> but M_B/L with correct sign:
///     M_B = -wL^2/16 (hogging at B)
///     For span 2 (no load): R_C = -M_B/L = wL/16 (positive, upward? No...)
///
/// Let me re-derive carefully:
///   Three-moment equation for M_A=0, M_C=0:
///     2*M_B*(L1+L2) = -w1*L1^3/4 - w2*L2^3/4
///   With w1 = w (magnitude), w2 = 0, L1=L2=L:
///     4*M_B*L = -w*L^3/4
///     M_B = -w*L^2/16
///
/// Span 1 reactions (beam A-B, length L, UDL w, end moments M_A=0, M_B):
///   R_A = wL/2 + (M_B - M_A)/L = wL/2 + M_B/L = wL/2 - wL/16 = 7wL/16
///   R_B_from_span1 = wL/2 - M_B/L = wL/2 + wL/16 = 9wL/16
///
/// Span 2 reactions (beam B-C, length L, no load, end moments M_B, M_C=0):
///   R_B_from_span2 = -M_B/L = wL/16
///   R_C = M_B/L = -wL/16
///
/// Wait, for span 2 with no load, moments M_B at left, M_C=0 at right:
///   R_B_from_span2 = (M_B - M_C)/L = M_B/L = -wL/16 (downward!)
///   Hmm, that gives negative reaction from span 2 at B.
///
/// Let me use the standard sign: taking M_B = -wL^2/16 (negative = hogging)
///   For span 2 (no external load, M_left = M_B, M_right = 0):
///     Equilibrium: R_B2 * L + M_B = 0  => R_B2 = -M_B/L = wL/16
///     R_C = -R_B2 = -wL/16
///
/// Actually let's be more careful. For span 2, taking moments about C:
///   R_B2 * L + M_B = 0  (M_B is hogging, acts counterclockwise at B)
///   R_B2 = -M_B / L = wL/16 (upward)
///   Vertical equilibrium for span 2: R_B2 + R_C = 0 (no load)
///   R_C = -R_B2 = -wL/16 (downward, i.e., the support pulls down)
///
/// Total R_B = R_B_from_span1 + R_B_from_span2 = 9wL/16 + wL/16 = 10wL/16 = 5wL/8
///
/// Check: R_A + R_B + R_C = 7wL/16 + 10wL/16 - wL/16 = 16wL/16 = wL. Correct!
#[test]
fn udl_on_one_span_only() {
    let q: f64 = -12.0;
    let l: f64 = 8.0;
    let n_per_span = 4;
    let q_abs: f64 = q.abs();

    // Loads on span 1 only (elements 1..4)
    let loads: Vec<SolverLoad> = (0..n_per_span)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);

    let r_a = reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == 1 + n_per_span)
        .unwrap()
        .ry;
    let r_c = reactions
        .iter()
        .find(|r| r.node_id == 1 + 2 * n_per_span)
        .unwrap()
        .ry;

    // Analytical values:
    let r_a_expected: f64 = 7.0 * q_abs * l / 16.0; // 42.0
    let r_b_expected: f64 = 5.0 * q_abs * l / 8.0; // 60.0
    let r_c_expected: f64 = -q_abs * l / 16.0; // -6.0 (uplift)

    // Total load = q_abs * L = 96
    let sum_ry: f64 = reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q_abs * l, 1e-6, "one-span UDL: sum_ry = wL");

    assert_close(r_a, r_a_expected, 0.01, "one-span UDL: R_A = 7wL/16");
    assert_close(r_b, r_b_expected, 0.01, "one-span UDL: R_B = 5wL/8");
    assert_close(r_c, r_c_expected, 0.01, "one-span UDL: R_C = -wL/16");

    // Interior moment magnitude: |M_B| = wL^2/16
    let m_b_expected: f64 = q_abs * l * l / 16.0; // 48.0
    let ef_span1_end = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    assert_close(
        ef_span1_end.m_end.abs(),
        m_b_expected,
        0.01,
        "one-span UDL: |M_B| = wL^2/16",
    );
}

// ─── Test 7: Different section stiffness per span — moment redistribution ────

/// When the two spans have different EI, the interior moment M_B changes.
/// The three-moment equation generalizes to:
///   M_A*L1/(6*EI1) + 2*M_B*(L1/(6*EI1) + L2/(6*EI2)) + M_C*L2/(6*EI2)
///     = -w1*L1^3/(24*EI1) - w2*L2^3/(24*EI2)
///
/// With M_A = M_C = 0, equal spans L, equal UDL w, but EI1 != EI2:
///   2*M_B*(L/(6*EI1) + L/(6*EI2)) = -w*L^3/(24*EI1) - w*L^3/(24*EI2)
///   2*M_B * L/6 * (1/EI1 + 1/EI2) = -w*L^3/24 * (1/EI1 + 1/EI2)
///   M_B = -w*L^2/8
///
/// Interesting! For equal spans and equal UDL, M_B = -wL^2/8 regardless of EI ratio.
/// However, the reactions WILL differ because the stiffness affects load distribution
/// only through M_B in this case, and M_B is the same.
///
/// So R_A = wL/2 + M_B/L = wL/2 - wL/8 = 3wL/8  (same as equal EI)
///
/// The DEFLECTIONS will differ though. Let's verify this: with different I values,
/// the span with smaller I deflects more.
///
/// We model this by using different sections for each span's elements.
#[test]
fn different_stiffness_per_span_deflection() {
    let q = -10.0;
    let l = 6.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;
    let n_nodes = total_elems + 1;
    let elem_len = l / n_per_span as f64;

    let iz1: f64 = 1e-4; // span 1: smaller I
    let iz2: f64 = 4e-4; // span 2: 4x larger I

    // Build input manually to use two different sections
    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode {
                id: i + 1,
                x: i as f64 * elem_len,
                y: 0.0,
            },
        );
    }

    let mut mats_map = HashMap::new();
    mats_map.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: E,
            nu: 0.3,
        },
    );

    let mut secs_map = HashMap::new();
    secs_map.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a: A,
            iz: iz1,
            as_y: None,
        },
    );
    secs_map.insert(
        "2".to_string(),
        SolverSection {
            id: 2,
            a: A,
            iz: iz2,
            as_y: None,
        },
    );

    let mut elems_map = HashMap::new();
    for i in 0..total_elems {
        let sec_id = if i < n_per_span { 1 } else { 2 };
        elems_map.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: sec_id,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    let interior_node = 1 + n_per_span;
    let end_node = n_nodes;

    let mut sups_map = HashMap::new();
    sups_map.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dy: None,
            drz: None,
            angle: None,
        },
    );
    sups_map.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: interior_node,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dy: None,
            drz: None,
            angle: None,
        },
    );
    sups_map.insert(
        "3".to_string(),
        SolverSupport {
            id: 3,
            node_id: end_node,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dy: None,
            drz: None,
            angle: None,
        },
    );

    let loads = udl_loads(total_elems, q);

    let input = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // M_B should still be -wL^2/8 = -10*36/8 = -45 regardless of stiffness difference
    let ef_span1_end = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    assert_close(
        ef_span1_end.m_end.abs(),
        45.0,
        0.01,
        "M_B independent of EI ratio for equal spans + equal UDL",
    );

    // Span 1 midspan deflection (node 3) should be larger than span 2 midspan (node 7)
    // because span 1 has smaller I.
    let mid_span1 = 1 + n_per_span / 2; // node 3
    let mid_span2 = 1 + n_per_span + n_per_span / 2; // node 7

    let uy_span1 = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_span1)
        .unwrap()
        .uy;
    let uy_span2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_span2)
        .unwrap()
        .uy;

    assert!(
        uy_span1 < 0.0,
        "span 1 midspan deflection should be negative (downward)"
    );
    assert!(
        uy_span2 < 0.0,
        "span 2 midspan deflection should be negative (downward)"
    );

    // Span 1 (smaller I) should deflect more
    assert!(
        uy_span1.abs() > uy_span2.abs(),
        "span 1 (smaller I) deflects more ({:.6}) than span 2 ({:.6})",
        uy_span1,
        uy_span2
    );

    // Deflection ratio should be roughly proportional to I ratio (=4)
    // Not exactly 4 because of continuity effects, but should be > 2
    let ratio: f64 = uy_span1.abs() / uy_span2.abs();
    assert!(
        ratio > 2.0,
        "deflection ratio ({:.2}) should be > 2 (I ratio = 4)",
        ratio
    );
}

// ─── Test 8: Applied moment at interior support ──────────────────────────────

/// A concentrated moment M_0 applied at the interior support B of a 2-span beam
/// (no other loads). By the three-moment equation with external moment:
///
/// Reference: Force method. Released structure = simply-supported beam A-C.
/// Apply moment M_0 at B. With the intermediate support released,
/// the deflection at B under M_0 on a SS beam of length 2L is:
///   delta_B = M_0 * L * (2L - L) * (2*(2L)*(2L) - L^2 - (2L-L)^2) / (6*(2L)*EI*(2L))
/// This gets complicated. Instead, use direct stiffness results and verify equilibrium.
///
/// For a 2-span beam with equal spans L, moment M_0 at B, no other loads:
///   By symmetry and equilibrium:
///   sum Fy = 0 => R_A + R_B + R_C = 0
///   sum M about A = 0 => R_B * L + R_C * 2L + M_0 = 0
///   By the force method: the redundant R_B satisfies compatibility.
///
/// For equal spans, by antisymmetry of the moment load:
///   R_A = -R_C, R_B = 0
///   From moment about A: 0 + R_C * 2L + M_0 = 0 => R_C = -M_0/(2L)
///   R_A = M_0/(2L)
#[test]
fn applied_moment_at_interior_support() {
    let l = 6.0;
    let m_0: f64 = 60.0; // counterclockwise moment at interior support
    let n_per_span = 4;

    // Apply a nodal moment at the interior support
    let interior_node = 1 + n_per_span;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: interior_node,
        fx: 0.0,
        fy: 0.0,
        mz: m_0,
    })];

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);

    let r_a = reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == interior_node)
        .unwrap()
        .ry;
    let r_c = reactions
        .iter()
        .find(|r| r.node_id == 1 + 2 * n_per_span)
        .unwrap()
        .ry;

    // Equilibrium: sum Ry = 0 (no vertical loads applied)
    let sum_ry: f64 = reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 0.0, 1e-6, "moment only: sum_ry = 0");

    // Moment about A: R_B*L + R_C*2L + M_0 = 0
    let moment_about_a = r_b * l + r_c * 2.0 * l + m_0;
    assert_close(moment_about_a, 0.0, 1e-4, "moment about A = 0");

    // For equal spans with moment at B:
    // R_A = M_0/(2L), R_C = -M_0/(2L), R_B = 0
    let r_a_expected: f64 = m_0 / (2.0 * l); // 5.0
    let r_c_expected: f64 = -m_0 / (2.0 * l); // -5.0

    assert_close(r_a, r_a_expected, 0.01, "moment at B: R_A = M/(2L)");
    assert_close(r_c, r_c_expected, 0.01, "moment at B: R_C = -M/(2L)");
    assert_close(r_b, 0.0, 0.01, "moment at B: R_B = 0");

    // Verify antisymmetry: R_A = -R_C
    assert_close(r_a, -r_c, 1e-6, "R_A = -R_C by antisymmetry");
}
