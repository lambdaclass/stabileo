/// Validation: Moving Load Envelope Benchmarks
///
/// Reference: Kassimali *Structural Analysis*, AASHTO HL-93.
///
/// Tests: single axle, two-axle, HL-93 truck, continuous beam, envelope properties.
///
/// Note: In this solver, downward loads produce negative bending moments (sagging).
/// The envelope's m_max_neg captures the maximum sagging moment (most negative).
use dedaliano_engine::solver::{linear, moving_loads};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a clean SS beam solver input (no permanent loads).
fn make_ss_beam_clean(n: usize, l: f64) -> SolverInput {
    make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![])
}

// ═══════════════════════════════════════════════════════════════
// 1. Single Axle on SS Beam
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_moving_single_axle_ss_beam() {
    // SS beam L=10m, P=100 kN single axle, step=0.5m
    // M_max = PL/4 = 250 kN·m (load at midspan, sagging = negative in convention)
    // V_max = P = 100 kN (load at support)
    let l = 10.0;
    let p = 100.0;
    let n = 10;

    let solver = make_ss_beam_clean(n, l);

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single Axle".into(),
            axles: vec![Axle { offset: 0.0, weight: p }],
        },
        step: Some(0.5),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Sagging moments are negative; find the most negative (largest magnitude)
    let m_max_sag: f64 = envelope.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);

    let m_expected = p * l / 4.0; // 250 kN·m
    assert_close(m_max_sag, m_expected, 0.02, "Single axle M_max");

    // Find max shear
    let v_max: f64 = envelope.elements.values()
        .map(|e| e.v_max_pos.max(e.v_max_neg.abs()))
        .fold(0.0, f64::max);

    assert_close(v_max, p, 0.05, "Single axle V_max");
}

// ═══════════════════════════════════════════════════════════════
// 2. Two-Axle Load (Critical Position)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_moving_two_axle_critical() {
    // L=10m, P₁=P₂=100 kN, spacing d=2m
    // M_max ≈ 400 kN·m at critical position
    let l = 10.0;
    let p = 100.0;
    let d = 2.0;
    let n = 10;

    let solver = make_ss_beam_clean(n, l);

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Two Axle".into(),
            axles: vec![
                Axle { offset: 0.0, weight: p },
                Axle { offset: d, weight: p },
            ],
        },
        step: Some(0.25),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    let m_max_sag: f64 = envelope.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);

    let m_expected = 400.0;
    assert_close(m_max_sag, m_expected, 0.05, "Two-axle M_max");
}

// ═══════════════════════════════════════════════════════════════
// 3. HL-93 Design Truck
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_moving_hl93_truck() {
    // AASHTO HL-93 truck: 35 kN at 0m, 145 kN at 4.3m, 145 kN at 8.6m
    // L=20m SS beam
    let l = 20.0;
    let n = 20;

    let solver = make_ss_beam_clean(n, l);

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "HL-93 Truck".into(),
            axles: vec![
                Axle { offset: 0.0, weight: 35.0 },
                Axle { offset: 4.3, weight: 145.0 },
                Axle { offset: 8.6, weight: 145.0 },
            ],
        },
        step: Some(0.5),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    let m_max_sag: f64 = envelope.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);

    assert!(m_max_sag > 900.0, "HL-93 M_max={:.1} should be > 900 kN·m", m_max_sag);
    assert!(m_max_sag < 1500.0, "HL-93 M_max={:.1} should be < 1500 kN·m", m_max_sag);

    let v_max: f64 = envelope.elements.values()
        .map(|e| e.v_max_pos.max(e.v_max_neg.abs()))
        .fold(0.0, f64::max);
    // V_max ≤ total truck weight = 325 kN
    assert!(v_max <= 325.0 + 1.0, "HL-93 V_max={:.1} ≤ 325 kN", v_max);
    assert!(v_max > 200.0, "HL-93 V_max={:.1} should be > 200 kN", v_max);
}

// ═══════════════════════════════════════════════════════════════
// 4. Continuous Beam: Negative Moment at Interior Support
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_moving_continuous_beam_negative_moment() {
    // 2-span continuous beam, L=8m each, single 100 kN axle
    // Envelope should capture hogging moment at interior support (positive in convention)
    // AND sagging moments in spans (negative in convention)
    let spans = vec![8.0, 8.0];
    let n_per_span = 8;

    let solver = make_continuous_beam(&spans, n_per_span, E, A, IZ, vec![]);

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single Axle".into(),
            axles: vec![Axle { offset: 0.0, weight: 100.0 }],
        },
        step: Some(0.5),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Check that sagging (negative) moments exist in the spans
    let has_sag = envelope.elements.values().any(|e| e.m_max_neg < -1.0);
    assert!(has_sag, "Continuous beam should have sagging moments");

    // Check that hogging (positive) moments exist at interior support region
    let has_hog = envelope.elements.values().any(|e| e.m_max_pos > 1.0);
    assert!(has_hog, "Continuous beam should have hogging moments at interior support");
}

// ═══════════════════════════════════════════════════════════════
// 5. Envelope Bounds: sign consistency
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_moving_envelope_bounds() {
    let l = 10.0;
    let n = 10;

    let solver = make_ss_beam_clean(n, l);

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single Axle".into(),
            axles: vec![Axle { offset: 0.0, weight: 100.0 }],
        },
        step: Some(0.5),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();

    for (eid, env) in &envelope.elements {
        assert!(env.m_max_pos >= -1e-6, "elem {} m_max_pos={:.4} should be ≥ 0", eid, env.m_max_pos);
        assert!(env.m_max_neg <= 1e-6, "elem {} m_max_neg={:.4} should be ≤ 0", eid, env.m_max_neg);
        assert!(env.v_max_pos >= -1e-6, "elem {} v_max_pos={:.4} should be ≥ 0", eid, env.v_max_pos);
        assert!(env.v_max_neg <= 1e-6, "elem {} v_max_neg={:.4} should be ≤ 0", eid, env.v_max_neg);
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. Single Position = Static
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_moving_single_position_matches_static() {
    // Axle at fixed position (midspan) should match static point load
    let l = 10.0;
    let p = 100.0;
    let n = 10;

    // Static solution with point load at midspan
    let static_input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: n / 2,
            a: l / n as f64,
            p: -p,
            px: None,
            mz: None,
        })],
    );

    let static_res = linear::solve_2d(&static_input).unwrap();
    let static_m_mid = static_res.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);

    // Moving load envelope — max moment magnitude should be ≥ static midspan moment
    let solver = make_ss_beam_clean(n, l);
    let moving_input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single".into(),
            axles: vec![Axle { offset: 0.0, weight: p }],
        },
        step: Some(0.5),
        path_element_ids: None,
    };

    let envelope = moving_loads::solve_moving_loads_2d(&moving_input).unwrap();
    let env_m_max: f64 = envelope.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0, f64::max);

    assert!(
        env_m_max >= static_m_mid * 0.95,
        "envelope |M_max|={:.2} should ≥ static |M_mid|={:.2}",
        env_m_max, static_m_mid
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Equilibrium per position (spot-check)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_moving_equilibrium_per_position() {
    // For a single axle on SS beam, verify equilibrium at a static position
    let l = 10.0;
    let p = 100.0;
    let n = 10;

    // Place load at x=3m (on element 3, local a=1.0m)
    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 3,
            a: 1.0,
            p: -p,
            px: None,
            mz: None,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

    assert_close(sum_ry, p, 0.01, "Moving load equilibrium ΣRy=P");
}

// ═══════════════════════════════════════════════════════════════
// 8. Fine vs Coarse Step
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_moving_fine_vs_coarse_step() {
    // Finer step should give envelope ≥ coarse step (captures more positions)
    let l = 10.0;
    let n = 10;

    let make_envelope = |step: f64| -> f64 {
        let solver = make_ss_beam_clean(n, l);
        let input = MovingLoadInput {
            solver,
            train: LoadTrain {
                name: "Single".into(),
                axles: vec![Axle { offset: 0.0, weight: 100.0 }],
            },
            step: Some(step),
            path_element_ids: None,
        };
        let envelope = moving_loads::solve_moving_loads_2d(&input).unwrap();
        // Use absolute magnitude (sagging = negative)
        envelope.elements.values().map(|e| e.m_max_neg.abs()).fold(0.0, f64::max)
    };

    let m_fine = make_envelope(0.25);
    let m_coarse = make_envelope(1.0);

    assert!(
        m_fine >= m_coarse * 0.99,
        "Fine step M_max={:.2} should ≥ coarse M_max={:.2}", m_fine, m_coarse
    );
}
