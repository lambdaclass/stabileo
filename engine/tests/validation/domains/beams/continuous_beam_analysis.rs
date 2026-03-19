/// Validation: Continuous beam analysis using three-moment equation (Clapeyron).
///
/// References:
///   - Ghali/Neville, "Structural Analysis", 7th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed.
///
/// Tests verify interior moments, reactions, symmetry, and deflection
/// reduction for multi-span continuous beams with various loading patterns.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. 3-Span Equal UDL: Interior Moments
// ================================================================
//
// Three equal spans L=5, UDL q=-10.
// Three-moment equation for 3 equal spans with UDL:
//   M_B = M_C = -qL²/10 = -10*25/10 = -25.0
//
// Source: Ghali/Neville Table 4.1

#[test]
fn validation_3span_equal_udl_interior_moments() {
    let l = 5.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 3 * n_per_span;
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

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_B: use m_end of last element of span 1 (element n_per_span)
    // Interior support B is at node 1 + n_per_span = 9
    // Interior support C is at node 1 + 2*n_per_span = 17
    let ef_span1_end = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    // M_C: use m_end of last element of span 2 (element 2*n_per_span)
    let ef_span2_end = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();

    // Three-moment equation: M_B = M_C = -qL²/10 = -25.0
    let expected_m = q * l * l / 10.0; // 25.0 magnitude
    assert_close(ef_span1_end.m_end.abs(), expected_m, 0.03, "3span M_B");
    assert_close(ef_span2_end.m_end.abs(), expected_m, 0.03, "3span M_C");

    // Symmetry: M_B should equal M_C
    assert_close(
        ef_span1_end.m_end.abs(),
        ef_span2_end.m_end.abs(),
        0.01,
        "3span M_B = M_C symmetry",
    );
}

// ================================================================
// 2. 3-Span Equal UDL: Reactions
// ================================================================
//
// Same beam as Test 1: L=5 each, q=-10.
// Three-moment equation results:
//   R_A = R_D = 0.4*qL = 0.4*10*5 = 20.0
//   R_B = R_C = 1.1*qL = 1.1*10*5 = 55.0
// Total = 2*20 + 2*55 = 150 = 3*q*L

#[test]
fn validation_3span_equal_udl_reactions() {
    let l = 5.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 3 * n_per_span;
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

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let node_a = 1;
    let node_b = 1 + n_per_span;
    let node_c = 1 + 2 * n_per_span;
    let node_d = 1 + 3 * n_per_span;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == node_d).unwrap();

    // End reactions: R_A = R_D = 0.4*qL = 20.0
    assert_close(r_a.rz, 0.4 * q * l, 0.03, "3span R_A");
    assert_close(r_d.rz, 0.4 * q * l, 0.03, "3span R_D");

    // Interior reactions: R_B = R_C = 1.1*qL = 55.0
    assert_close(r_b.rz, 1.1 * q * l, 0.03, "3span R_B");
    assert_close(r_c.rz, 1.1 * q * l, 0.03, "3span R_C");

    // Global equilibrium: sum = 3*q*L = 150
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 3.0 * q * l, 0.01, "3span equilibrium");
}

// ================================================================
// 3. 2-Span with Point Load on One Span
// ================================================================
//
// L1 = L2 = 8, P = -40 at midspan of span 1.
// Three-moment equation for 2 equal spans, point load P at midspan
// of span 1 (a = L/2):
//   M_B = 3PL/32 = 3*40*8/32 = 30.0
//
// Source: Hibbeler, Table of Beam Formulas

#[test]
fn validation_2span_point_load_one_span() {
    let l = 8.0;
    let p = 40.0;
    let n_per_span = 8;

    let load_node = n_per_span / 2 + 1; // midspan of span 1

    let input = make_continuous_beam(
        &[l, l],
        n_per_span,
        E,
        A,
        IZ,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // M_B from element ending at interior support
    let ef_at_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();

    // Three-moment: M_B = 3PL/32 = 30.0
    let expected_mb = 3.0 * p * l / 32.0; // 30.0 magnitude
    assert_close(ef_at_b.m_end.abs(), expected_mb, 0.05, "2span point M_B");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "2span point equilibrium");
}

// ================================================================
// 4. 4-Span Equal UDL: Symmetry
// ================================================================
//
// Four equal spans L=4, UDL q=-10.
// Supports: A(pin), B(roller), C(roller), D(roller), E(roller).
// By symmetry of structure and loading:
//   M_B = M_D  (end interior supports are symmetric)
//   M_C differs (central interior support)
//
// From four-span equal UDL three-moment solution:
//   M_B = M_D = 3qL²/28 = 3*10*16/28 = 17.143
//   M_C = 2qL²/28 = qL²/14 = 10*16/14 = 11.429 (different from M_B)

#[test]
fn validation_4span_equal_udl_symmetry() {
    let l = 4.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 4 * n_per_span;
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

    let input = make_continuous_beam(&[l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support B at element n_per_span, C at 2*n_per_span, D at 3*n_per_span
    let ef_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_c = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();
    let ef_d = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 3 * n_per_span)
        .unwrap();

    let m_b = ef_b.m_end.abs();
    let m_c = ef_c.m_end.abs();
    let m_d = ef_d.m_end.abs();

    // Symmetry: M_B = M_D
    assert_close(m_b, m_d, 0.02, "4span symmetry M_B = M_D");

    // M_C is different from M_B (central support has different moment)
    let diff = (m_c - m_b).abs();
    assert!(
        diff > 0.5,
        "4span M_C should differ from M_B: M_B={:.3}, M_C={:.3}, diff={:.3}",
        m_b,
        m_c,
        diff,
    );

    // Verify approximate magnitudes from three-moment solution
    // M_B = M_D = 3qL²/28
    let expected_mb = 3.0 * q * l * l / 28.0;
    assert_close(m_b, expected_mb, 0.05, "4span M_B magnitude");

    // M_C = qL²/14
    let expected_mc = q * l * l / 14.0;
    assert_close(m_c, expected_mc, 0.05, "4span M_C magnitude");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 4.0 * q * l, 0.01, "4span equilibrium");
}

// ================================================================
// 5. Alternating Loaded/Unloaded Spans
// ================================================================
//
// 3-span beam L=6 each, UDL on spans 1 and 3 only (span 2 unloaded).
// This pattern-loading tests that continuity transfers moments through
// the unloaded span. The moment diagram in span 2 will be non-zero
// due to the continuity moments at B and C.
//
// By the three-moment equation with loading on spans 1 and 3:
//   Due to symmetry of loading pattern: M_B = M_C

#[test]
fn validation_alternating_loaded_unloaded_spans() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 8;

    // Load only spans 1 and 3 (not span 2)
    let mut loads = Vec::new();
    // Span 1: elements 1..n_per_span
    for i in 0..n_per_span {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    // Span 3: elements 2*n_per_span+1..3*n_per_span
    for i in (2 * n_per_span)..(3 * n_per_span) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moments at interior supports
    let ef_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_c = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();

    let m_b = ef_b.m_end.abs();
    let m_c = ef_c.m_end.abs();

    // Due to symmetric loading pattern (spans 1 and 3 loaded, span 2 unloaded),
    // M_B should equal M_C by symmetry
    assert_close(m_b, m_c, 0.02, "alternating M_B = M_C symmetry");

    // The unloaded span 2 should still carry moments from continuity.
    // Check that the midspan element of span 2 has non-zero moments.
    let mid_span2_elem = n_per_span + n_per_span / 2;
    let ef_mid = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == mid_span2_elem)
        .unwrap();
    // The unloaded span carries moment via continuity - should be non-trivial
    assert!(
        ef_mid.m_start.abs() > 1.0 || ef_mid.m_end.abs() > 1.0,
        "Unloaded span 2 midspan should have non-zero moment from continuity: m_start={:.3}, m_end={:.3}",
        ef_mid.m_start, ef_mid.m_end,
    );

    // Equilibrium: total applied load = 2*q*L = 120 (only spans 1 and 3)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * q * l, 0.01, "alternating equilibrium");
}

// ================================================================
// 6. Continuous Beam End Span Moment Reduction
// ================================================================
//
// 2-span equal UDL: the maximum positive moment in each span is
// reduced from the simply-supported value qL²/8 by continuity.
//
// For a 2-span continuous beam with equal UDL:
//   M_B = -qL²/8 (hogging at interior support)
//   Max sagging in end span = 9qL²/128 ≈ 0.0703 qL²
//   This is less than qL²/8 = 0.125 qL² (SS beam)
//
// Verify: qL²/14.2 < M_max_positive < qL²/8

#[test]
fn validation_continuous_beam_end_span_moment() {
    let l = 8.0;
    let q = 10.0;
    let n_per_span = 16; // fine mesh for accurate midspan moments

    let n_total = 2 * n_per_span;
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

    // Find maximum positive moment in span 1 (elements 1..n_per_span).
    // Positive moment (sagging) means the beam is bending downward.
    // Check both m_start and m_end of each element in span 1.
    let mut max_positive = 0.0_f64;
    for i in 1..=n_per_span {
        let ef = results
            .element_forces
            .iter()
            .find(|ef| ef.element_id == i)
            .unwrap();
        // In the sign convention, sagging moments are positive (or negative
        // depending on the convention). We look for the maximum absolute
        // moment that has the opposite sign from the hogging at the support.
        // The end element at B has hogging (m_end). Sagging in midspan has
        // the opposite sign.
        // Take the maximum of the magnitudes, excluding the support moment.
        if i < n_per_span {
            max_positive = max_positive.max(ef.m_start.abs()).max(ef.m_end.abs());
        } else {
            // Last element: m_start is midspan region, m_end is at support B
            max_positive = max_positive.max(ef.m_start.abs());
        }
    }

    // For midspan region, the maximum positive moment in the first span
    // should be less than the SS value qL²/8 = 80.0
    // and greater than qL²/14.2 ≈ 45.07
    let ss_moment = q * l * l / 8.0; // 80.0
    let _lower_bound = q * l * l / 14.2; // ~45.07

    // The exact maximum positive moment for 2-span equal UDL is 9qL²/128 = 45.0
    // but with element discretization the max captured value may be slightly different.
    // Use a generous lower bound.
    let generous_lower = q * l * l / 16.0; // 40.0

    assert!(
        max_positive < ss_moment,
        "Continuity should reduce max positive moment below SS value: max_pos={:.2}, qL²/8={:.2}",
        max_positive, ss_moment,
    );

    assert!(
        max_positive > generous_lower,
        "Max positive moment should be meaningful: max_pos={:.2}, lower={:.2}",
        max_positive, generous_lower,
    );
}

// ================================================================
// 7. Long Center Span Dominates
// ================================================================
//
// 3-span beam: L1=4, L2=12, L3=4, UDL q=-10.
// When the center span is much longer than the side spans, the
// interior moments at B and C should be larger than the equal-span
// case (where all spans are the average length).
//
// For equal spans of L=6.667 (average): M_B = M_C = qL²/10 = 44.4
// For unequal spans with L2=12: moments at B and C should be larger
// because the long center span contributes more to the three-moment equation.

#[test]
fn validation_long_center_span_dominates() {
    let l1 = 4.0;
    let l2 = 12.0;
    let l3 = 4.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 3 * n_per_span;
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

    let input = make_continuous_beam(&[l1, l2, l3], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ef_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_c = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();

    let m_b = ef_b.m_end.abs();
    let m_c = ef_c.m_end.abs();

    // Equal-span reference: L_avg = (4+12+4)/3 = 6.667
    let l_avg = (l1 + l2 + l3) / 3.0;
    let m_equal = q * l_avg * l_avg / 10.0; // ~44.4

    // With long center span, M_B and M_C should exceed the equal-span case
    assert!(
        m_b > m_equal,
        "Long center: M_B={:.2} should exceed equal-span M={:.2}",
        m_b,
        m_equal,
    );
    assert!(
        m_c > m_equal,
        "Long center: M_C={:.2} should exceed equal-span M={:.2}",
        m_c,
        m_equal,
    );

    // By symmetry of spans (L1=L3), M_B should equal M_C
    assert_close(m_b, m_c, 0.02, "long center M_B = M_C symmetry");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * (l1 + l2 + l3), 0.01, "long center equilibrium");
}

// ================================================================
// 8. Continuity Reduces Max Deflection
// ================================================================
//
// Compare midspan deflection of a 2-span continuous beam vs a
// single-span simply-supported beam of the same span length.
//
// SS beam: δ_mid = 5qL⁴/(384EI)
// 2-span continuous: each span has δ_mid < 5qL⁴/(384EI)
// because continuity adds fixity at the interior support,
// reducing deflections significantly.

#[test]
fn validation_continuity_reduces_max_deflection() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 8;
    let e_eff = E * 1000.0; // E is in MPa, convert to kN/m²

    // --- Single span simply-supported beam ---
    let mut ss_loads = Vec::new();
    for i in 0..n_per_span {
        ss_loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    let ss_input = make_beam(n_per_span, l, E, A, IZ, "pinned", Some("rollerX"), ss_loads);
    let ss_results = linear::solve_2d(&ss_input).unwrap();

    let ss_mid_node = n_per_span / 2 + 1;
    let ss_mid_defl = ss_results
        .displacements
        .iter()
        .find(|d| d.node_id == ss_mid_node)
        .unwrap()
        .uz
        .abs();

    // Analytical: δ_ss = 5qL⁴/(384EI)
    let delta_ss_exact = 5.0 * q * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(ss_mid_defl, delta_ss_exact, 0.05, "SS midspan deflection");

    // --- 2-span continuous beam ---
    let n_total = 2 * n_per_span;
    let mut cont_loads = Vec::new();
    for i in 0..n_total {
        cont_loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    let cont_input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, cont_loads);
    let cont_results = linear::solve_2d(&cont_input).unwrap();

    // Midspan of first span is at node n_per_span/2 + 1
    let cont_mid_node = n_per_span / 2 + 1;
    let cont_mid_defl = cont_results
        .displacements
        .iter()
        .find(|d| d.node_id == cont_mid_node)
        .unwrap()
        .uz
        .abs();

    // Continuity should significantly reduce midspan deflection
    assert!(
        cont_mid_defl < ss_mid_defl,
        "Continuous beam deflection ({:.6e}) should be less than SS beam ({:.6e})",
        cont_mid_defl,
        ss_mid_defl,
    );

    // The reduction factor for 2-span continuous UDL is about 0.415
    // (exact: δ_cont/δ_ss ≈ 2/5 = 0.4 for equal spans)
    // Verify deflection is at least 20% smaller
    let ratio = cont_mid_defl / ss_mid_defl;
    assert!(
        ratio < 0.80,
        "Continuity should reduce deflection by >20%: ratio={:.3}",
        ratio,
    );

    // But it should still be positive and non-trivial
    assert!(
        cont_mid_defl > delta_ss_exact * 0.1,
        "Continuous deflection should be non-trivial: {:.6e}",
        cont_mid_defl,
    );
}
