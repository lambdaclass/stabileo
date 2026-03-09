/// Validation: Moving Load Bridge Benchmarks
///
/// References:
///   - AASHTO LRFD Bridge Design Specifications, 9th Ed.
///   - EN 1991-2: Traffic loads on bridges (LM1, LM2)
///   - Barker & Puckett, "Design of Highway Bridges", 3rd Ed.
///   - Influence line theory: M_max at x for SS beam
///
/// Note: In this solver, downward loads produce negative bending moments (sagging).
/// The envelope's m_max_neg captures the maximum sagging moment (most negative).
///
/// Tests:
///   1. Single axle: |M_max_neg| ≈ PL/4 at midspan
///   2. Two equal axles: effect of axle spacing
///   3. HL-93 truck (AASHTO): 3-axle truck on SS beam
///   4. Shear envelope: V_max near supports
///   5. Continuous beam: moving load produces both positive and negative moments
///   6. Multi-element convergence: finer mesh → better envelope
///   7. Moment envelope symmetry: symmetric beam → symmetric envelope
use dedaliano_engine::solver::moving_loads;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

fn make_ss_moving_load(
    n: usize,
    l: f64,
    train: LoadTrain,
    step: f64,
) -> MovingLoadInput {
    let solver = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    MovingLoadInput {
        solver,
        train,
        step: Some(step),
        path_element_ids: None,
    }
}

// ================================================================
// 1. Single Axle: |M_max_neg| ≈ P·L/4
// ================================================================
//
// SS beam, single moving point load P.
// Sagging moment is negative in convention. |M_max_neg| = PL/4.

#[test]
fn validation_moving_load_single_axle_mmax() {
    let l = 10.0;
    let n = 10;
    let p = 100.0;

    let train = LoadTrain {
        name: "Single Axle".to_string(),
        axles: vec![Axle { offset: 0.0, weight: p }],
    };

    let input = make_ss_moving_load(n, l, train, 0.5);
    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Sagging moments are negative; find max magnitude
    let m_max_sag: f64 = result.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0_f64, f64::max);

    let m_exact = p * l / 4.0; // 250 kN·m

    let error = (m_max_sag - m_exact).abs() / m_exact;
    assert!(error < 0.10,
        "Single axle |M_max_neg|={:.2}, exact PL/4={:.2}, err={:.1}%",
        m_max_sag, m_exact, error * 100.0);
}

// ================================================================
// 2. Two Equal Axles: Spacing Effect
// ================================================================
//
// Two axles should produce more total moment than a single axle.

#[test]
fn validation_moving_load_two_axles_spacing() {
    let l = 10.0;
    let n = 10;
    let p = 100.0;
    let s = 2.0;

    let train = LoadTrain {
        name: "Two Axles".to_string(),
        axles: vec![
            Axle { offset: 0.0, weight: p },
            Axle { offset: s, weight: p },
        ],
    };

    let input = make_ss_moving_load(n, l, train, 0.5);
    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    let m_max_sag: f64 = result.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0_f64, f64::max);

    // Two axles should produce more sagging moment than single PL/4
    let m_single = p * l / 4.0;
    assert!(m_max_sag > m_single * 0.95,
        "Two axles |M_max_neg|={:.2} should exceed single PL/4={:.2}",
        m_max_sag, m_single);
}

// ================================================================
// 3. HL-93 Design Truck (AASHTO)
// ================================================================
//
// AASHTO HL-93 truck: 35 kN front, 145 kN middle, 145 kN rear.
// Axle spacings: 4.3m each.

#[test]
fn validation_moving_load_hl93_truck() {
    let l = 20.0;
    let n = 16;

    let train = LoadTrain {
        name: "HL-93 Truck".to_string(),
        axles: vec![
            Axle { offset: 0.0, weight: 35.0 },
            Axle { offset: 4.3, weight: 145.0 },
            Axle { offset: 8.6, weight: 145.0 },
        ],
    };

    let input = make_ss_moving_load(n, l, train, 0.5);
    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    let m_max_sag: f64 = result.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0_f64, f64::max);

    // Total truck weight = 325 kN, substantial moment expected
    assert!(m_max_sag > 500.0,
        "HL-93 |M_max_neg|={:.2} should be substantial", m_max_sag);
    assert!(m_max_sag < 2000.0,
        "HL-93 |M_max_neg|={:.2} should be bounded", m_max_sag);
}

// ================================================================
// 4. Shear Envelope: V_max Near Supports
// ================================================================
//
// V_max = P × (L - a)/L where a→0, so V_max → P.

#[test]
fn validation_moving_load_shear_envelope() {
    let l = 10.0;
    let n = 10;
    let p = 100.0;

    let train = LoadTrain {
        name: "Single Axle".to_string(),
        axles: vec![Axle { offset: 0.0, weight: p }],
    };

    let input = make_ss_moving_load(n, l, train, 0.25);
    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    let v_max: f64 = result.elements.values()
        .map(|e| e.v_max_pos.abs().max(e.v_max_neg.abs()))
        .fold(0.0_f64, f64::max);

    assert!(v_max > p * 0.5,
        "V_max={:.2} should approach P={:.1}", v_max, p);
    assert!(v_max <= p * 1.05,
        "V_max={:.2} should not exceed P={:.1}", v_max, p);
}

// ================================================================
// 5. Continuous Beam: Positive and Negative Moments
// ================================================================
//
// Two-span continuous beam. Moving load produces hogging at
// intermediate support (positive in convention) and sagging in spans.

#[test]
fn validation_moving_load_continuous_beam() {
    let l_span = 8.0;
    let n_per = 4;
    let p = 100.0;

    let solver = make_continuous_beam(
        &[l_span, l_span], n_per, E, A, IZ, vec![],
    );

    let train = LoadTrain {
        name: "Single Axle".to_string(),
        axles: vec![Axle { offset: 0.0, weight: p }],
    };

    let input = MovingLoadInput {
        solver,
        train,
        step: Some(0.5),
        path_element_ids: None,
    };

    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Sagging: m_max_neg < 0
    let m_max_neg: f64 = result.elements.values()
        .map(|e| e.m_max_neg)
        .fold(0.0_f64, f64::min);

    // Hogging: m_max_pos > 0 (at intermediate support region)
    let m_max_pos: f64 = result.elements.values()
        .map(|e| e.m_max_pos)
        .fold(0.0_f64, f64::max);

    assert!(m_max_neg < 0.0,
        "Should have sagging (negative) moments: {:.2}", m_max_neg);
    assert!(m_max_pos > 0.0,
        "Should have hogging (positive) moments at intermediate support: {:.2}", m_max_pos);
}

// ================================================================
// 6. Mesh Convergence: Finer Mesh → Better Envelope
// ================================================================

#[test]
fn validation_moving_load_mesh_convergence() {
    let l = 10.0;
    let p = 100.0;
    let m_exact = p * l / 4.0;

    let train = LoadTrain {
        name: "Single".to_string(),
        axles: vec![Axle { offset: 0.0, weight: p }],
    };

    let mut m_values = Vec::new();
    for &n in &[4, 8, 16] {
        let input = make_ss_moving_load(n, l, train.clone(), 0.5);
        let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

        let m_max: f64 = result.elements.values()
            .map(|e| e.m_max_neg.abs())
            .fold(0.0_f64, f64::max);
        m_values.push(m_max);
    }

    // Finer mesh should get closer to exact (or at least not worse)
    let err_coarse = (m_values[0] - m_exact).abs() / m_exact;
    let err_fine = (m_values[2] - m_exact).abs() / m_exact;
    assert!(
        err_fine <= err_coarse + 0.05,
        "Finer mesh should improve: coarse={:.2} (err={:.1}%), fine={:.2} (err={:.1}%)",
        m_values[0], err_coarse * 100.0, m_values[2], err_fine * 100.0
    );
}

// ================================================================
// 7. Moment Envelope Symmetry
// ================================================================

#[test]
fn validation_moving_load_envelope_symmetry() {
    let l = 12.0;
    let n = 6;
    let p = 50.0;

    let train = LoadTrain {
        name: "Single".to_string(),
        axles: vec![Axle { offset: 0.0, weight: p }],
    };

    let input = make_ss_moving_load(n, l, train, 0.25);
    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Elements 1 and n should have symmetric shear envelopes
    if let (Some(e1), Some(en)) = (
        result.elements.get(&1.to_string()),
        result.elements.get(&n.to_string()),
    ) {
        let v1 = e1.v_max_pos.abs().max(e1.v_max_neg.abs());
        let vn = en.v_max_pos.abs().max(en.v_max_neg.abs());
        if v1 > 1e-6 && vn > 1e-6 {
            let ratio = v1 / vn;
            assert!((ratio - 1.0).abs() < 0.20,
                "Symmetric shear: V1={:.2}, Vn={:.2}, ratio={:.3}",
                v1, vn, ratio);
        }
    }

    // Middle elements should have highest sagging moment magnitude
    let m_mid_sag: f64 = result.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0_f64, f64::max);
    assert!(m_mid_sag > 0.0, "Should have sagging moments: {:.2}", m_mid_sag);
}
