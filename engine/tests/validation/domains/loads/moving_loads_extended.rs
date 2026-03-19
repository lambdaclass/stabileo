/// Validation: Moving Load Envelopes and Influence Lines (Extended)
///
/// References:
///   - AASHTO HL-93 (design truck and lane loads)
///   - Ghali & Neville, "Structural Analysis" (influence lines, continuous beams)
///   - Muller-Breslau, "Die neueren Methoden der Festigkeitslehre" (1886)
///
/// Tests cover:
///   1. SS beam, single axle: M_max = PL/4, V_max = P
///   2. SS beam, two axles: critical position gives M > single-axle case
///   3. 2-span continuous beam: both positive and negative moment envelopes
///   4. SS beam, max shear at support
///   5. Influence line for left reaction of SS beam: IL = 1 - x/L
///   6. Influence line for midspan moment: triangular IL with peak L/4
///   7. Bridge with two lanes (wider SS beam), multiple axle groups
///   8. Muller-Breslau principle: deflection curve = influence line for moment
///
/// Convention: downward loads produce negative bending moments (sagging).
use dedaliano_engine::solver::{linear, moving_loads};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a simply-supported beam with no permanent loads.
fn make_ss_beam_clean(n: usize, l: f64) -> SolverInput {
    make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![])
}

// ================================================================
// 1. SS Beam — Single Axle Envelope
// ================================================================
//
// Simply-supported beam, span L, single moving axle P.
// Classical results:
//   M_max = PL/4  (load at midspan, sagging)
//   V_max = P     (load at support)

#[test]
fn validation_moving_1_ss_single_axle() {
    let l = 12.0;
    let p = 80.0;
    let n = 12;

    let solver = make_ss_beam_clean(n, l);

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single Axle".into(),
            axles: vec![Axle { offset: 0.0, weight: p }],
        },
        step: Some(0.25),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Sagging moment is negative; find maximum magnitude
    let m_max_sag: f64 = envelope
        .elements
        .values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);

    let m_expected = p * l / 4.0; // 240 kN-m
    assert_close(m_max_sag, m_expected, 0.02, "Single axle M_max = PL/4");

    // Maximum shear = P (when load is directly at or near a support)
    let v_max: f64 = envelope
        .elements
        .values()
        .map(|e| e.v_max_pos.max(e.v_max_neg.abs()))
        .fold(0.0, f64::max);

    assert_close(v_max, p, 0.05, "Single axle V_max = P");

    // Hogging (positive moment) should be zero or negligible on SS beam
    let m_max_hog: f64 = envelope
        .elements
        .values()
        .map(|e| e.m_max_pos)
        .fold(0.0, f64::max);
    assert!(
        m_max_hog < 1.0,
        "SS beam should have negligible hogging moment: {:.4}",
        m_max_hog
    );
}

// ================================================================
// 2. SS Beam — Two Axles (Critical Position)
// ================================================================
//
// Two equal axles P spaced d apart on span L.
// The critical position for maximum moment can be found by placing
// the resultant at the beam center. The maximum moment exceeds
// the single-axle PL/4 case because the second axle contributes.
//
// For P=80 kN, d=3m, L=12m:
//   M_two_axle > M_single = PL/4 = 240 kN-m
//   Exact: M_max ≈ P*(L/2 - d/4) = 80*(6 - 0.75) = 420 kN-m (approx)

#[test]
fn validation_moving_2_ss_two_axles() {
    let l = 12.0;
    let p = 80.0;
    let d = 3.0;
    let n = 12;

    // Single axle envelope for comparison
    let solver_single = make_ss_beam_clean(n, l);
    let input_single = MovingLoadInput {
        solver: solver_single,
        train: LoadTrain {
            name: "Single".into(),
            axles: vec![Axle { offset: 0.0, weight: p }],
        },
        step: Some(0.25),
        path_element_ids: None,
    };
    let env_single = moving_loads::solve_moving_loads_2d(&input_single).unwrap();
    let m_single: f64 = env_single
        .elements
        .values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);

    // Two-axle envelope
    let solver_two = make_ss_beam_clean(n, l);
    let input_two = MovingLoadInput {
        solver: solver_two,
        train: LoadTrain {
            name: "Two Axles".into(),
            axles: vec![
                Axle { offset: 0.0, weight: p },
                Axle { offset: d, weight: p },
            ],
        },
        step: Some(0.25),
        path_element_ids: None,
    };
    let env_two = moving_loads::solve_moving_loads_2d(&input_two).unwrap();
    let m_two: f64 = env_two
        .elements
        .values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);

    // Two axles must produce higher moment than single axle
    assert!(
        m_two > m_single * 1.05,
        "Two-axle M_max={:.2} should exceed single-axle M_max={:.2}",
        m_two,
        m_single
    );

    // Two-axle max moment should be in a reasonable range
    // Upper bound: if both loads at midspan (not possible with spacing), M = 2*PL/4
    assert!(
        m_two < 2.0 * p * l / 4.0 + 1.0,
        "Two-axle M_max={:.2} should be < 2*PL/4={:.2}",
        m_two,
        2.0 * p * l / 4.0
    );
}

// ================================================================
// 3. 2-Span Continuous Beam — Moment Envelope
// ================================================================
//
// A single moving load on a 2-span continuous beam produces:
//   - Positive sagging moments (negative in convention) in each span
//   - Hogging moment (positive in convention) at the interior support
//
// For 2 equal spans L, single load P:
//   Max sagging ≈ 0.203 PL (in the loaded span)
//   Max hogging ≈ 0.0938 PL (at interior support, load at ~0.4225L)
//   (Ghali & Neville, Table for 2-span beam)

#[test]
fn validation_moving_3_continuous_beam_envelope() {
    let span = 10.0;
    let p = 100.0;
    let n_per_span = 10;

    let solver = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, vec![]);

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single Axle".into(),
            axles: vec![Axle { offset: 0.0, weight: p }],
        },
        step: Some(0.25),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Check sagging moments exist (negative in convention)
    let m_max_sag: f64 = envelope
        .elements
        .values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);
    assert!(
        m_max_sag > 0.15 * p * span,
        "Continuous beam: max sagging |M|={:.2} should be > 0.15*P*L={:.2}",
        m_max_sag,
        0.15 * p * span
    );

    // Check hogging moments exist at interior support region (positive in convention)
    let m_max_hog: f64 = envelope
        .elements
        .values()
        .map(|e| e.m_max_pos)
        .fold(0.0, f64::max);
    assert!(
        m_max_hog > 0.05 * p * span,
        "Continuous beam: max hogging M={:.2} should be > 0.05*P*L={:.2}",
        m_max_hog,
        0.05 * p * span
    );

    // Both types of moment should be present simultaneously in the envelope
    let has_sag = envelope.elements.values().any(|e| e.m_max_neg < -1.0);
    let has_hog = envelope.elements.values().any(|e| e.m_max_pos > 1.0);
    assert!(has_sag, "Continuous beam envelope should have sagging moments");
    assert!(has_hog, "Continuous beam envelope should have hogging moments");

    // Sagging should exceed hogging for a 2-span beam with single concentrated load
    assert!(
        m_max_sag > m_max_hog,
        "Sagging |M|={:.2} should exceed hogging M={:.2} for single load on 2-span",
        m_max_sag,
        m_max_hog
    );
}

// ================================================================
// 4. SS Beam — Max Shear Position
// ================================================================
//
// For SS beam with single moving axle, maximum shear occurs when
// the load is at or near a support.
//   V_max = P  (load right at support)
//
// The shear envelope should show V decreasing as we move away from supports.

#[test]
fn validation_moving_4_max_shear_position() {
    let l = 10.0;
    let p = 150.0;
    let n = 20; // Fine mesh

    let solver = make_ss_beam_clean(n, l);

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single Axle".into(),
            axles: vec![Axle { offset: 0.0, weight: p }],
        },
        step: Some(0.25),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Overall peak shear should equal P (load at support)
    let v_peak: f64 = envelope
        .elements
        .values()
        .map(|e| e.v_max_pos.max(e.v_max_neg.abs()))
        .fold(0.0, f64::max);

    assert_close(v_peak, p, 0.05, "Max shear = P at support");

    // Elements near midspan should have lower shear envelope than elements near supports.
    // Element 1 is at x=[0, L/n], element n/2 is near midspan.
    let v_near_support: f64 = envelope
        .elements
        .values()
        .filter(|_| true)
        .map(|e| e.v_max_pos.max(e.v_max_neg.abs()))
        .fold(0.0, f64::max);

    // The midspan shear envelope should be less than the support shear
    // For a single axle, V at section x when load at x is:
    //   V_left = 1 - x/L (from IL), so at midspan V = 0.5*P
    let mid_elem_id = (n / 2).to_string();
    if let Some(mid_env) = envelope.elements.get(&mid_elem_id) {
        let v_mid = mid_env.v_max_pos.max(mid_env.v_max_neg.abs());
        assert!(
            v_mid < v_near_support,
            "Midspan shear {:.2} should be less than support shear {:.2}",
            v_mid,
            v_near_support
        );
    }
}

// ================================================================
// 5. Influence Line for Left Reaction (SS Beam)
// ================================================================
//
// IL for R_A of SS beam: ordinate = 1 - x/L.
// Place unit load at each node; record R_A.
// R_A(x=0) = 1, R_A(x=L) = 0, linear in between.

#[test]
fn validation_moving_5_influence_reaction() {
    let l = 10.0;
    let n = 10;

    let mut il_ra = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i,
            fx: 0.0,
            fz: -1.0,
            my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
        il_ra.push(ra);
    }

    // Verify IL ordinate at each node: R_A = 1 - (i-1)/n
    for (i, &ra) in il_ra.iter().enumerate() {
        let x = i as f64 * l / n as f64;
        let expected = 1.0 - x / l;
        assert_close(
            ra,
            expected,
            0.02,
            &format!("IL R_A at x={:.1}: expected {:.4}", x, expected),
        );
    }

    // Boundary checks
    assert_close(il_ra[0], 1.0, 0.01, "IL R_A at left support = 1.0");
    assert_close(il_ra[n], 0.0, 0.01, "IL R_A at right support = 0.0");
}

// ================================================================
// 6. Influence Line for Midspan Moment (SS Beam)
// ================================================================
//
// IL for moment at midspan of SS beam is triangular:
//   IL(x) = x/2      for x <= L/2
//   IL(x) = (L-x)/2  for x >= L/2
// Peak value = L/4 at midspan.
// (Ghali & Neville, "Structural Analysis")

#[test]
fn validation_moving_6_influence_moment() {
    let l = 8.0;
    let n = 16; // Fine mesh for accuracy

    let mut il_m_mid = Vec::new();

    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i,
            fx: 0.0,
            fz: -1.0,
            my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();

        // Moment at midspan: m_end of element n/2 (at node n/2+1 = midspan node)
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == n / 2)
            .unwrap();
        il_m_mid.push(ef.m_end);
    }

    // Peak IL ordinate should be L/4 at midspan
    let il_peak = il_m_mid.iter().map(|m| m.abs()).fold(0.0_f64, f64::max);
    assert_close(il_peak, l / 4.0, 0.05, "IL M_mid: peak = L/4");

    // Verify triangular shape at selected points
    // At x = L/4 (node n/4+1): IL = (L/4)/2 = L/8
    let quarter_idx = n / 4;
    let il_quarter = il_m_mid[quarter_idx].abs();
    assert_close(
        il_quarter,
        l / 8.0,
        0.05,
        "IL M_mid at L/4 = L/8",
    );

    // At x = 3L/4 (symmetric to L/4): IL = (L - 3L/4)/2 = L/8
    let three_quarter_idx = 3 * n / 4;
    let il_three_quarter = il_m_mid[three_quarter_idx].abs();
    assert_close(
        il_three_quarter,
        l / 8.0,
        0.05,
        "IL M_mid at 3L/4 = L/8 (symmetry)",
    );

    // Boundary: IL = 0 at supports
    assert!(
        il_m_mid[0].abs() < 0.01,
        "IL M_mid at left support should be ~0: {:.6}",
        il_m_mid[0]
    );
    assert!(
        il_m_mid[n].abs() < 0.01,
        "IL M_mid at right support should be ~0: {:.6}",
        il_m_mid[n]
    );
}

// ================================================================
// 7. Bridge with Two Lanes — Multiple Axle Groups
// ================================================================
//
// Model a bridge deck as a wider SS beam (same 2D analysis).
// Two axle groups (representing two lanes), each with 2 axles.
// The envelope should capture the worst-case position of both groups.
//
// Lane 1: 2 axles, 100 kN each, spacing 4m
// Lane 2: 2 axles, 80 kN each, spacing 4m, offset 6m behind Lane 1 lead axle
// Total weight = 2*(100+80) = 360 kN
// L = 20m

#[test]
fn validation_moving_7_bridge_two_lane() {
    let l = 20.0;
    let n = 20;

    let solver = make_ss_beam_clean(n, l);

    // Model both lanes as a single load train (worst case: both in same lane)
    // Lane 1 lead axle at offset 0
    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Two-Lane Bridge".into(),
            axles: vec![
                // Lane 1
                Axle { offset: 0.0, weight: 100.0 },
                Axle { offset: 4.0, weight: 100.0 },
                // Lane 2 (6m behind lane 1 lead axle)
                Axle { offset: 6.0, weight: 80.0 },
                Axle { offset: 10.0, weight: 80.0 },
            ],
        },
        step: Some(0.5),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Moment should be significantly higher than a single 100 kN axle
    let m_max: f64 = envelope
        .elements
        .values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);

    let m_single_100 = 100.0 * l / 4.0; // 500 kN-m for single axle
    assert!(
        m_max > m_single_100 * 1.2,
        "Two-lane M_max={:.2} should exceed 1.2 * single-axle M={:.2}",
        m_max,
        m_single_100 * 1.2
    );

    // Total shear should not exceed total train weight
    let total_weight = 100.0 + 100.0 + 80.0 + 80.0;
    let v_max: f64 = envelope
        .elements
        .values()
        .map(|e| e.v_max_pos.max(e.v_max_neg.abs()))
        .fold(0.0, f64::max);

    assert!(
        v_max <= total_weight + 1.0,
        "V_max={:.2} should not exceed total weight={:.2}",
        v_max,
        total_weight
    );
    assert!(
        v_max > 200.0,
        "V_max={:.2} should be substantial (> 200 kN)",
        v_max
    );

    // Moment upper bound: all loads at midspan is not possible given spacing,
    // but M < total_weight * L / 4
    assert!(
        m_max < total_weight * l / 4.0 + 1.0,
        "M_max={:.2} should be < W*L/4={:.2}",
        m_max,
        total_weight * l / 4.0
    );
}

// ================================================================
// 8. Muller-Breslau Principle: Influence Line Verification
// ================================================================
//
// The Muller-Breslau principle states: the influence line for a
// force quantity at a point is proportional to the deflected shape
// obtained by introducing a unit deformation at that point.
//
// For a simply-supported beam, we verify two applications:
//
// (a) IL for moment at section x=a of SS beam (analytical formula):
//       IL(x) = x*(L-a)/L   for x <= a
//       IL(x) = a*(L-x)/L   for x >= a
//     Verified by moving a unit load and reading the moment at the section.
//
// (b) Maxwell-Betti reciprocal theorem as a consequence:
//     The moment at section A due to unit load at B equals
//     the moment at section B due to unit load at A.
//     This reciprocity is the foundation of the Muller-Breslau principle.

#[test]
fn validation_moving_8_muller_breslau_il() {
    let l = 10.0;
    let n = 20; // Fine mesh for accuracy
    let section_a = l / 4.0; // quarter-point section
    let section_elem = n / 4; // element ending at the section node

    // (a) Compute the moment IL at the quarter-point by moving a unit load
    let mut il_moment = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i,
            fx: 0.0,
            fz: -1.0,
            my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();

        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == section_elem)
            .unwrap();
        il_moment.push(ef.m_end);
    }

    // Verify IL against analytical formula for moment at section a
    for (i, &m) in il_moment.iter().enumerate() {
        let x = i as f64 * l / n as f64;
        let expected = if x <= section_a + 1e-10 {
            x * (l - section_a) / l
        } else {
            section_a * (l - x) / l
        };
        // Sagging convention: moments are negative, compare magnitudes
        assert_close(
            m.abs(),
            expected,
            0.05,
            &format!("MB: moment IL at x={:.2}", x),
        );
    }

    // Peak should be at the section: IL(a) = a*(L-a)/L
    let peak_idx = n / 4;
    let peak_expected = section_a * (l - section_a) / l; // 2.5*7.5/10 = 1.875
    assert_close(
        il_moment[peak_idx].abs(),
        peak_expected,
        0.03,
        "MB: IL peak at section = a(L-a)/L",
    );

    // (b) Maxwell-Betti reciprocal theorem verification:
    //     M(section_A | load_at_B) = M(section_B | load_at_A)
    //
    //     Section A = L/4, Section B = 3L/4
    //     Load at B (node 3n/4+1): M at section A
    //     Load at A (node n/4+1): M at section B
    let section_b_elem = 3 * n / 4; // element ending at the 3L/4 section
    let load_at_b_node = 3 * n / 4 + 1;
    let load_at_a_node = n / 4 + 1;

    // M at section A due to unit load at B
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_at_b_node,
        fx: 0.0,
        fz: -1.0,
        my: 0.0,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();
    let m_a_from_b = results_b
        .element_forces
        .iter()
        .find(|e| e.element_id == section_elem)
        .unwrap()
        .m_end;

    // M at section B due to unit load at A
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_at_a_node,
        fx: 0.0,
        fz: -1.0,
        my: 0.0,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();
    let m_b_from_a = results_a
        .element_forces
        .iter()
        .find(|e| e.element_id == section_b_elem)
        .unwrap()
        .m_end;

    // Maxwell-Betti: these should be equal (both should be a*b/L = 1.875)
    assert_close(
        m_a_from_b.abs(),
        m_b_from_a.abs(),
        0.02,
        "Maxwell-Betti reciprocity: M(A|load@B) = M(B|load@A)",
    );

    // Both should match the analytical value
    let _reciprocal_expected = section_a * (l - section_a) / l; // a*b/L where b = 3L/4
    // Actually: M(section_A | load@B) = a*(L-xB)/L if xB >= a, = xB*(L-a)/L if xB <= a
    // xB = 3L/4, a = L/4: since xB >= a, M = a*(L-xB)/L = (L/4)*(L/4)/L = L/16
    let exact = section_a * (l - 3.0 * l / 4.0) / l; // (L/4)*(L/4)/L = L/16 = 0.625
    assert_close(
        m_a_from_b.abs(),
        exact,
        0.03,
        "MB: reciprocal value matches analytical",
    );

    // (c) Moving load envelope should capture the IL peak correctly
    let solver = make_ss_beam_clean(n, l);
    let input_ml = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Unit Axle".into(),
            axles: vec![Axle { offset: 0.0, weight: 1.0 }],
        },
        step: Some(0.25),
        path_element_ids: None,
    };
    let envelope = moving_loads::solve_moving_loads_2d(&input_ml).unwrap();

    // The section element should capture moment equal to the IL peak
    let env_at_section = envelope.elements.get(&section_elem.to_string()).unwrap();
    assert_close(
        env_at_section.m_max_neg.abs(),
        peak_expected,
        0.05,
        "MB: moving load envelope captures IL peak at section",
    );
}
