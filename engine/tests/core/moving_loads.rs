/// Moving loads analysis tests.
use dedaliano_engine::solver::moving_loads;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ─── Simple Moving Load on SS Beam ──────────────────────────

#[test]
fn moving_load_single_axle_ss_beam() {
    // Simply-supported beam L=10m with single 100 kN axle
    // Use 4 elements so interior moments are captured at element boundaries
    let l = 10.0;
    let n_elem = 4;
    let elem_len = l / n_elem as f64;
    let mut nodes = Vec::new();
    for i in 0..=n_elem {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let path_ids: Vec<usize> = (1..=n_elem).collect();
    let solver = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "pinned"), (2, n_elem + 1, "rollerX")],
        vec![],
    );

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single axle".to_string(),
            axles: vec![Axle { offset: 0.0, weight: 100.0 }],
        },
        step: Some(0.5),
        path_element_ids: Some(path_ids),
    };

    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    assert!(result.num_positions > 0, "should have positions");
    assert!(!result.path.is_empty(), "should have path");

    // Max moment for single load at midspan: M = PL/4 = 100*10/4 = 250 kN·m
    // Sign convention: sagging moments are negative in this solver
    let max_m_abs: f64 = result.elements.values()
        .map(|env| env.m_max_pos.abs().max(env.m_max_neg.abs()))
        .fold(0.0, f64::max);
    assert!(
        max_m_abs > 200.0,
        "max moment magnitude={:.2} should be > 200", max_m_abs
    );
    // Max shear: R = P (when load is near support)
    let max_v: f64 = result.elements.values()
        .map(|env| env.v_max_pos.max(env.v_max_neg.abs()))
        .fold(0.0, f64::max);
    assert!(
        max_v > 50.0,
        "max shear={:.2} should be significant", max_v
    );
}

#[test]
fn moving_load_two_axles() {
    // Two axles: 50 kN each, 3m apart on 4-element beam
    let l = 10.0;
    let n_elem = 4;
    let elem_len = l / n_elem as f64;
    let mut nodes = Vec::new();
    for i in 0..=n_elem {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let path_ids: Vec<usize> = (1..=n_elem).collect();
    let solver = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "pinned"), (2, n_elem + 1, "rollerX")],
        vec![],
    );

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Two axles".to_string(),
            axles: vec![
                Axle { offset: 0.0, weight: 50.0 },
                Axle { offset: 3.0, weight: 50.0 },
            ],
        },
        step: Some(0.5),
        path_element_ids: Some(path_ids),
    };

    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Envelope should capture max effects from all positions (sagging = negative)
    let max_m_abs: f64 = result.elements.values()
        .map(|env| env.m_max_pos.abs().max(env.m_max_neg.abs()))
        .fold(0.0, f64::max);
    let max_v: f64 = result.elements.values()
        .map(|env| env.v_max_pos.max(env.v_max_neg.abs()))
        .fold(0.0, f64::max);
    assert!(max_m_abs > 100.0, "should have significant moment, got {:.2}", max_m_abs);
    assert!(max_v > 30.0, "should have significant shear, got {:.2}", max_v);
}

// ─── Multi-element Path ──────────────────────────────────────

#[test]
fn moving_load_multi_element_beam() {
    // 2-element beam, L=12m total
    let solver = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![],
    );

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Single".to_string(),
            axles: vec![Axle { offset: 0.0, weight: 100.0 }],
        },
        step: Some(0.5),
        path_element_ids: Some(vec![1, 2]),
    };

    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Both elements should have envelope data
    assert!(result.elements.contains_key("1"), "element 1 in envelope");
    assert!(result.elements.contains_key("2"), "element 2 in envelope");

    // Path should have 2 segments
    assert_eq!(result.path.len(), 2, "path should have 2 segments");
}

// ─── Envelope Properties ─────────────────────────────────────

#[test]
fn moving_load_envelope_max_exceeds_min() {
    // Use multi-element beam for meaningful envelope comparison
    let l = 10.0;
    let n_elem = 4;
    let elem_len = l / n_elem as f64;
    let mut nodes = Vec::new();
    for i in 0..=n_elem {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let path_ids: Vec<usize> = (1..=n_elem).collect();
    let solver = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "pinned"), (2, n_elem + 1, "rollerX")],
        vec![],
    );

    let input = MovingLoadInput {
        solver,
        train: LoadTrain {
            name: "Test".to_string(),
            axles: vec![Axle { offset: 0.0, weight: 100.0 }],
        },
        step: Some(0.5),
        path_element_ids: Some(path_ids),
    };

    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // For downward-only loads: max positive moment should be >= 0
    // and max negative moment should be <= 0
    for env in result.elements.values() {
        assert!(
            env.m_max_pos >= env.m_max_neg,
            "m_max_pos={:.2} should >= m_max_neg={:.2}", env.m_max_pos, env.m_max_neg
        );
        assert!(
            env.v_max_pos >= env.v_max_neg,
            "v_max_pos={:.2} should >= v_max_neg={:.2}", env.v_max_pos, env.v_max_neg
        );
    }
}
