//! Crash-free fuzz testing: generate thousands of random structural models
//! and verify the solver never panics and never produces NaN/Inf.
//!
//! The contract: `solve_2d` and `solve_3d` must return `Ok(results)` with
//! finite values, or `Err(message)`. They must NEVER panic.

use dedaliano_engine::solver::{linear, modal, staged, time_integration};
use dedaliano_engine::types::*;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

mod fuzz_models;
use fuzz_models::{random_2d_model, random_3d_model};

// ==================== Assertion helpers ====================

fn assert_finite_2d(results: &AnalysisResults, seed: u64) {
    for d in &results.displacements {
        assert!(
            d.ux.is_finite() && d.uz.is_finite() && d.ry.is_finite(),
            "seed {}: NaN/Inf in 2D displacement node {}: ux={}, uz={}, ry={}",
            seed, d.node_id, d.ux, d.uz, d.ry
        );
    }
    for r in &results.reactions {
        assert!(
            r.rx.is_finite() && r.rz.is_finite() && r.my.is_finite(),
            "seed {}: NaN/Inf in 2D reaction node {}: rx={}, rz={}, my={}",
            seed, r.node_id, r.rx, r.rz, r.my
        );
    }
}

fn assert_finite_3d(results: &AnalysisResults3D, seed: u64) {
    for d in &results.displacements {
        assert!(
            d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite()
                && d.rx.is_finite() && d.ry.is_finite() && d.rz.is_finite(),
            "seed {}: NaN/Inf in 3D displacement node {}: [{}, {}, {}, {}, {}, {}]",
            seed, d.node_id, d.ux, d.uy, d.uz, d.rx, d.ry, d.rz
        );
    }
    for r in &results.reactions {
        assert!(
            r.fx.is_finite() && r.fy.is_finite() && r.fz.is_finite()
                && r.mx.is_finite() && r.my.is_finite() && r.mz.is_finite(),
            "seed {}: NaN/Inf in 3D reaction node {}: [{}, {}, {}, {}, {}, {}]",
            seed, r.node_id, r.fx, r.fy, r.fz, r.mx, r.my, r.mz
        );
    }
}

// ==================== Main fuzz tests ====================

#[test]
fn fuzz_2d_crash_free_10k() {
    let mut ok_count = 0u64;
    let mut err_count = 0u64;

    for seed in 0..10_000u64 {
        let input = random_2d_model(seed);
        let result = std::panic::catch_unwind(|| linear::solve_2d(&input));
        match result {
            Ok(Ok(results)) => {
                assert_finite_2d(&results, seed);
                ok_count += 1;
            }
            Ok(Err(_msg)) => {
                // Solver returned a clean error — acceptable
                err_count += 1;
            }
            Err(panic_info) => {
                panic!(
                    "PANIC on 2D seed {}: {:?}",
                    seed, panic_info
                );
            }
        }
    }

    eprintln!(
        "fuzz_2d_crash_free_10k: {} ok, {} err out of 10000",
        ok_count, err_count
    );
}

#[test]
fn fuzz_3d_crash_free_2k() {
    let mut ok_count = 0u64;
    let mut err_count = 0u64;

    for seed in 0..2_000u64 {
        // Offset seed to avoid overlap with 2D seeds
        let actual_seed = seed + 100_000;
        let input = random_3d_model(actual_seed);
        let result = std::panic::catch_unwind(|| linear::solve_3d(&input));
        match result {
            Ok(Ok(results)) => {
                assert_finite_3d(&results, actual_seed);
                ok_count += 1;
            }
            Ok(Err(_msg)) => {
                err_count += 1;
            }
            Err(panic_info) => {
                panic!(
                    "PANIC on 3D seed {}: {:?}",
                    actual_seed, panic_info
                );
            }
        }
    }

    eprintln!(
        "fuzz_3d_crash_free_2k: {} ok, {} err out of 2000",
        ok_count, err_count
    );
}

// ==================== Known tricky seeds / regression pins ====================

/// Single element, minimal model — the simplest possible 2D case.
#[test]
fn fuzz_2d_regression_seed_0() {
    let input = random_2d_model(0);
    let result = linear::solve_2d(&input);
    match result {
        Ok(r) => assert_finite_2d(&r, 0),
        Err(_) => {} // acceptable
    }
}

/// Seed 42: arbitrary mid-range model.
#[test]
fn fuzz_2d_regression_seed_42() {
    let input = random_2d_model(42);
    let result = linear::solve_2d(&input);
    match result {
        Ok(r) => assert_finite_2d(&r, 42),
        Err(_) => {}
    }
}

/// Seed 9999: near the upper bound of the 2D sweep.
#[test]
fn fuzz_2d_regression_seed_9999() {
    let input = random_2d_model(9999);
    let result = linear::solve_2d(&input);
    match result {
        Ok(r) => assert_finite_2d(&r, 9999),
        Err(_) => {}
    }
}

/// 3D regression: seed 100000 (first 3D seed in the sweep).
#[test]
fn fuzz_3d_regression_seed_100000() {
    let input = random_3d_model(100_000);
    let result = linear::solve_3d(&input);
    match result {
        Ok(r) => assert_finite_3d(&r, 100_000),
        Err(_) => {}
    }
}

/// 3D regression: seed 101999 (last 3D seed in the sweep).
#[test]
fn fuzz_3d_regression_seed_101999() {
    let input = random_3d_model(101_999);
    let result = linear::solve_3d(&input);
    match result {
        Ok(r) => assert_finite_3d(&r, 101_999),
        Err(_) => {}
    }
}

// ==================== Edge case generators ====================

/// All-truss model: no bending DOFs, tests the truss code path.
#[test]
fn fuzz_2d_all_truss_1k() {
    let mut ok_count = 0u64;
    let mut err_count = 0u64;

    for seed in 0..1_000u64 {
        let actual_seed = seed + 200_000;
        let mut input = random_2d_model(actual_seed);
        // Force all elements to truss and disable hinges
        for elem in input.elements.values_mut() {
            elem.elem_type = "truss".to_string();
            elem.hinge_start = false;
            elem.hinge_end = false;
        }
        let result = std::panic::catch_unwind(|| linear::solve_2d(&input));
        match result {
            Ok(Ok(results)) => {
                assert_finite_2d(&results, actual_seed);
                ok_count += 1;
            }
            Ok(Err(_)) => { err_count += 1; }
            Err(panic_info) => {
                panic!("PANIC on 2D all-truss seed {}: {:?}", actual_seed, panic_info);
            }
        }
    }

    eprintln!(
        "fuzz_2d_all_truss_1k: {} ok, {} err out of 1000",
        ok_count, err_count
    );
}

/// Extreme stiffness range: tests numerical conditioning.
#[test]
fn fuzz_2d_extreme_stiffness_1k() {
    let mut ok_count = 0u64;
    let mut err_count = 0u64;

    for seed in 0..1_000u64 {
        let actual_seed = seed + 300_000;
        let mut rng = StdRng::seed_from_u64(actual_seed);
        let mut input = random_2d_model(actual_seed);
        // Assign extreme stiffness values to materials
        for mat in input.materials.values_mut() {
            // Very wide range: 1.0 to 1e12
            mat.e = 10f64.powf(rng.gen_range(0.0..12.0));
        }
        let result = std::panic::catch_unwind(|| linear::solve_2d(&input));
        match result {
            Ok(Ok(results)) => {
                assert_finite_2d(&results, actual_seed);
                ok_count += 1;
            }
            Ok(Err(_)) => { err_count += 1; }
            Err(panic_info) => {
                panic!("PANIC on 2D extreme-stiffness seed {}: {:?}", actual_seed, panic_info);
            }
        }
    }

    eprintln!(
        "fuzz_2d_extreme_stiffness_1k: {} ok, {} err out of 1000",
        ok_count, err_count
    );
}

/// Hinged-at-both-ends frames: tests the hinge release path.
#[test]
fn fuzz_2d_double_hinge_500() {
    let mut ok_count = 0u64;
    let mut err_count = 0u64;

    for seed in 0..500u64 {
        let actual_seed = seed + 400_000;
        let mut input = random_2d_model(actual_seed);
        // Force all frame elements to have both hinges
        for elem in input.elements.values_mut() {
            if elem.elem_type == "frame" {
                elem.hinge_start = true;
                elem.hinge_end = true;
            }
        }
        let result = std::panic::catch_unwind(|| linear::solve_2d(&input));
        match result {
            Ok(Ok(results)) => {
                assert_finite_2d(&results, actual_seed);
                ok_count += 1;
            }
            Ok(Err(_)) => { err_count += 1; }
            Err(panic_info) => {
                panic!("PANIC on 2D double-hinge seed {}: {:?}", actual_seed, panic_info);
            }
        }
    }

    eprintln!(
        "fuzz_2d_double_hinge_500: {} ok, {} err out of 500",
        ok_count, err_count
    );
}

/// Mixed frame/truss with distributed + point loads: broad coverage of load types.
#[test]
fn fuzz_2d_mixed_loads_1k() {
    let mut ok_count = 0u64;
    let mut err_count = 0u64;

    for seed in 0..1_000u64 {
        let actual_seed = seed + 500_000;
        let mut rng = StdRng::seed_from_u64(actual_seed);
        let mut input = random_2d_model(actual_seed);

        // Add extra loads of every type
        let elem_ids: Vec<usize> = input.elements.values().map(|e| e.id).collect();
        if !elem_ids.is_empty() {
            let eid = elem_ids[rng.gen_range(0..elem_ids.len())];
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: eid,
                q_i: rng.gen_range(-200.0..200.0),
                q_j: rng.gen_range(-200.0..200.0),
                a: None,
                b: None,
            }));
            let eid2 = elem_ids[rng.gen_range(0..elem_ids.len())];
            input.loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                element_id: eid2,
                a: rng.gen_range(0.05..0.95),
                p: rng.gen_range(-300.0..300.0),
                px: Some(rng.gen_range(-100.0..100.0)),
                my: Some(rng.gen_range(-50.0..50.0)),
            }));
        }

        let result = std::panic::catch_unwind(|| linear::solve_2d(&input));
        match result {
            Ok(Ok(results)) => {
                assert_finite_2d(&results, actual_seed);
                ok_count += 1;
            }
            Ok(Err(_)) => { err_count += 1; }
            Err(panic_info) => {
                panic!("PANIC on 2D mixed-loads seed {}: {:?}", actual_seed, panic_info);
            }
        }
    }

    eprintln!(
        "fuzz_2d_mixed_loads_1k: {} ok, {} err out of 1000",
        ok_count, err_count
    );
}

// ==================== Modal, Time-History, Staged Fuzz Tests ====================

#[test]
fn fuzz_modal_2d_crash_free_2k() {
    let mut ok_count = 0u64;
    let mut err_count = 0u64;
    for seed in 0..2_000u64 {
        let input = random_2d_model(seed);
        // Vary densities: mostly physical, sometimes zero (must Err cleanly, not panic)
        let densities: std::collections::HashMap<String, f64> = input.materials.values()
            .map(|m| (m.id.to_string(), if seed % 7 == 0 { 0.0 } else { 7850.0 }))
            .collect();
        match std::panic::catch_unwind(|| modal::solve_modal_2d(&input, &densities, 3)) {
            Ok(Ok(res)) => {
                assert!(res.total_mass.is_finite(), "non-finite total_mass, seed {}", seed);
                for m in &res.modes {
                    assert!(m.frequency.is_finite(), "non-finite frequency, seed {}", seed);
                }
                ok_count += 1;
            }
            Ok(Err(_)) => err_count += 1,
            Err(p) => panic!("PANIC modal 2D seed {}: {:?}", seed, p),
        }
    }
    eprintln!("fuzz_modal_2d: {} ok, {} err", ok_count, err_count);
}

#[test]
fn fuzz_modal_3d_crash_free_500() {
    for seed in 100_000..100_500u64 {
        let input = random_3d_model(seed);
        let densities: std::collections::HashMap<String, f64> = input.materials.values()
            .map(|m| (m.id.to_string(), 7850.0))
            .collect();
        match std::panic::catch_unwind(|| modal::solve_modal_3d(&input, &densities, 3)) {
            Ok(Ok(res)) => {
                assert!(res.total_mass.is_finite(), "non-finite total_mass, seed {}", seed);
                for m in &res.modes {
                    assert!(m.frequency.is_finite(), "non-finite frequency, seed {}", seed);
                }
            }
            Ok(Err(_)) => {}
            Err(p) => panic!("PANIC modal 3D seed {}: {:?}", seed, p),
        }
    }
}

#[test]
fn fuzz_time_history_2d_crash_free_500() {
    for seed in 0..500u64 {
        let m = random_2d_model(seed);
        let densities: std::collections::HashMap<String, f64> = m.materials.values()
            .map(|mat| (mat.id.to_string(), 7850.0))
            .collect();
        let input = TimeHistoryInput {
            solver: m,
            densities,
            time_step: 0.01,
            n_steps: 10,
            method: "newmark".to_string(),
            beta: 0.25,
            gamma: 0.5,
            alpha: None,
            damping_xi: Some(0.05),
            ground_accel: Some(vec![0.5; 10]),
            ground_direction: Some("x".to_string()),
            force_history: None,
        };
        match std::panic::catch_unwind(|| time_integration::solve_time_history_2d(&input)) {
            Ok(Ok(res)) => {
                for nh in &res.node_histories {
                    let all_finite = nh.ux.iter().all(|v| v.is_finite())
                        && nh.uz.iter().all(|v| v.is_finite())
                        && nh.ry.iter().all(|v| v.is_finite())
                        && nh.vx.iter().all(|v| v.is_finite())
                        && nh.vz.iter().all(|v| v.is_finite())
                        && nh.ax.iter().all(|v| v.is_finite())
                        && nh.az.iter().all(|v| v.is_finite());
                    assert!(
                        all_finite,
                        "seed {}: NaN/Inf in TH 2D node {} history",
                        seed, nh.node_id
                    );
                }
                for d in &res.peak_displacements {
                    assert!(
                        d.ux.is_finite() && d.uz.is_finite() && d.ry.is_finite(),
                        "seed {}: NaN/Inf in TH 2D peak displacement node {}: ux={}, uz={}, ry={}",
                        seed, d.node_id, d.ux, d.uz, d.ry
                    );
                }
            }
            Ok(Err(_)) => {}
            Err(p) => panic!("PANIC TH 2D seed {}: {:?}", seed, p),
        }
    }
}

#[test]
fn fuzz_staged_2d_crash_free_1k() {
    for seed in 0..1_000u64 {
        let m = random_2d_model(seed);
        let mut elem_ids: Vec<usize> = m.elements.values().map(|e| e.id).collect();
        elem_ids.sort_unstable();
        let split = (elem_ids.len() / 2).clamp(1, elem_ids.len());
        let (first, rest) = elem_ids.split_at(split);
        let stage = |name: &str, elems: &[usize]| ConstructionStage {
            name: name.to_string(),
            elements_added: elems.to_vec(),
            elements_removed: vec![],
            load_indices: (0..m.loads.len()).collect(),
            supports_added: vec![],
            supports_removed: vec![],
            prestress_loads: vec![],
        };
        let input = StagedInput {
            nodes: m.nodes.clone(),
            materials: m.materials.clone(),
            sections: m.sections.clone(),
            elements: m.elements.clone(),
            supports: m.supports.clone(),
            loads: m.loads.clone(),
            stages: vec![stage("s1", first), stage("s2", rest)],
            constraints: vec![],
        };
        match std::panic::catch_unwind(|| staged::solve_staged_2d(&input)) {
            Ok(Ok(res)) => {
                for stage in &res.stages {
                    assert_finite_2d(&stage.results, seed);
                }
                assert_finite_2d(&res.final_results, seed);
            }
            Ok(Err(_)) => {}
            Err(p) => panic!("PANIC staged 2D seed {}: {:?}", seed, p),
        }
    }
}
