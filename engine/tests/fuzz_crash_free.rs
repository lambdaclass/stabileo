//! Crash-free fuzz testing: generate thousands of random structural models
//! and verify the solver never panics and never produces NaN/Inf.
//!
//! The contract: `solve_2d` and `solve_3d` must return `Ok(results)` with
//! finite values, or `Err(message)`. They must NEVER panic.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::collections::HashMap;

// ==================== 2D Random Model Generator ====================

fn random_2d_model(seed: u64) -> SolverInput {
    let mut rng = StdRng::seed_from_u64(seed);

    // 2-20 nodes
    let n_nodes = rng.gen_range(2..=20);
    let mut nodes_map = HashMap::new();
    for i in 1..=n_nodes {
        let x = rng.gen_range(-100.0..100.0);
        let z = rng.gen_range(-100.0..100.0);
        nodes_map.insert(
            i.to_string(),
            SolverNode {
                id: i,
                x,
                z,
            },
        );
    }

    // 1-3 materials
    let n_mats = rng.gen_range(1..=3);
    let mut mats_map = HashMap::new();
    for i in 1..=n_mats {
        let e = 10f64.powf(rng.gen_range(3.0..9.0)); // 1e3..1e9
        let nu = rng.gen_range(0.1..0.45);
        mats_map.insert(
            i.to_string(),
            SolverMaterial { id: i, e, nu },
        );
    }

    // 1-3 sections
    let n_secs = rng.gen_range(1..=3);
    let mut secs_map = HashMap::new();
    for i in 1..=n_secs {
        let a = 10f64.powf(rng.gen_range(-4.0..0.0)); // 1e-4..1.0
        let iz = 10f64.powf(rng.gen_range(-8.0..-2.0)); // 1e-8..1e-2
        secs_map.insert(
            i.to_string(),
            SolverSection {
                id: i,
                a,
                iz,
                as_y: None,
            },
        );
    }

    // 1-10 elements connecting random node pairs (no zero-length)
    let n_elems = rng.gen_range(1..=10.min(n_nodes * (n_nodes - 1) / 2).max(1));
    let mut elems_map = HashMap::new();
    let elem_types = ["frame", "truss"];
    for i in 1..=n_elems {
        let mut ni = rng.gen_range(1..=n_nodes);
        let mut nj = rng.gen_range(1..=n_nodes);
        // Avoid self-loop; also avoid coincident nodes
        let mut attempts = 0;
        while attempts < 20 {
            if ni != nj {
                let n_i = &nodes_map[&ni.to_string()];
                let n_j = &nodes_map[&nj.to_string()];
                let dist = ((n_i.x - n_j.x).powi(2) + (n_i.z - n_j.z).powi(2)).sqrt();
                if dist > 0.01 {
                    break;
                }
            }
            nj = rng.gen_range(1..=n_nodes);
            if ni == nj {
                ni = rng.gen_range(1..=n_nodes);
            }
            attempts += 1;
        }
        if ni == nj {
            // Skip this element if we can't find distinct non-coincident nodes
            continue;
        }

        let elem_type = elem_types[rng.gen_range(0..2)];
        let mat_id = rng.gen_range(1..=n_mats);
        let sec_id = rng.gen_range(1..=n_secs);
        let hinge_start = elem_type == "frame" && rng.gen_bool(0.15);
        let hinge_end = elem_type == "frame" && rng.gen_bool(0.15);

        elems_map.insert(
            i.to_string(),
            SolverElement {
                id: i,
                elem_type: elem_type.to_string(),
                node_i: ni,
                node_j: nj,
                material_id: mat_id,
                section_id: sec_id,
                hinge_start,
                hinge_end,
            },
        );
    }

    // If no elements were created (e.g., all coincident), add at least one valid element
    if elems_map.is_empty() {
        // Force two well-separated nodes and connect them
        nodes_map.insert(
            "1".to_string(),
            SolverNode { id: 1, x: 0.0, z: 0.0 },
        );
        nodes_map.insert(
            "2".to_string(),
            SolverNode { id: 2, x: 5.0, z: 0.0 },
        );
        elems_map.insert(
            "1".to_string(),
            SolverElement {
                id: 1,
                elem_type: "frame".to_string(),
                node_i: 1,
                node_j: 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    // Supports: at least 1 fixed or pinned, then random additional supports
    let support_types = ["fixed", "pinned", "rollerX", "rollerZ"];
    let mut sups_map = HashMap::new();

    // First support: always fixed or pinned on node 1 to ensure stability
    let first_type = if rng.gen_bool(0.5) { "fixed" } else { "pinned" };
    sups_map.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: first_type.to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        },
    );

    // Additional random supports
    let n_extra_sups = rng.gen_range(0..=3.min(n_nodes - 1));
    for i in 0..n_extra_sups {
        let node_id = rng.gen_range(2..=n_nodes);
        let sup_type = support_types[rng.gen_range(0..support_types.len())];
        let sup_id = i + 2;
        sups_map.insert(
            sup_id.to_string(),
            SolverSupport {
                id: sup_id,
                node_id,
                support_type: sup_type.to_string(),
                kx: None, ky: None, kz: None,
                dx: None, dz: None, dry: None, angle: None,
            },
        );
    }

    // Loads: 1-5 random loads
    let n_loads = rng.gen_range(1..=5);
    let mut loads = Vec::new();
    let elem_ids: Vec<usize> = elems_map.values().map(|e| e.id).collect();

    for _ in 0..n_loads {
        let load_kind = rng.gen_range(0..3);
        match load_kind {
            0 => {
                // Nodal load
                let node_id = rng.gen_range(1..=n_nodes);
                loads.push(SolverLoad::Nodal(SolverNodalLoad {
                    node_id,
                    fx: rng.gen_range(-1000.0..1000.0),
                    fz: rng.gen_range(-1000.0..1000.0),
                    my: rng.gen_range(-500.0..500.0),
                }));
            }
            1 if !elem_ids.is_empty() => {
                // Distributed load
                let elem_id = elem_ids[rng.gen_range(0..elem_ids.len())];
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: elem_id,
                    q_i: rng.gen_range(-100.0..100.0),
                    q_j: rng.gen_range(-100.0..100.0),
                    a: None,
                    b: None,
                }));
            }
            2 if !elem_ids.is_empty() => {
                // Point load on element
                let elem_id = elem_ids[rng.gen_range(0..elem_ids.len())];
                loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                    element_id: elem_id,
                    a: rng.gen_range(0.1..0.9),
                    p: rng.gen_range(-500.0..500.0),
                    px: None,
                    my: None,
                }));
            }
            _ => {
                // Fallback: nodal load
                let node_id = rng.gen_range(1..=n_nodes);
                loads.push(SolverLoad::Nodal(SolverNodalLoad {
                    node_id,
                    fx: rng.gen_range(-1000.0..1000.0),
                    fz: rng.gen_range(-1000.0..1000.0),
                    my: 0.0,
                }));
            }
        }
    }

    SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

// ==================== 3D Random Model Generator ====================

fn random_3d_model(seed: u64) -> SolverInput3D {
    let mut rng = StdRng::seed_from_u64(seed);

    // 2-15 nodes
    let n_nodes = rng.gen_range(2..=15);
    let mut nodes_map = HashMap::new();
    for i in 1..=n_nodes {
        nodes_map.insert(
            i.to_string(),
            SolverNode3D {
                id: i,
                x: rng.gen_range(-50.0..50.0),
                y: rng.gen_range(-50.0..50.0),
                z: rng.gen_range(-50.0..50.0),
            },
        );
    }

    // 1-3 materials
    let n_mats = rng.gen_range(1..=3);
    let mut mats_map = HashMap::new();
    for i in 1..=n_mats {
        let e = 10f64.powf(rng.gen_range(3.0..9.0));
        let nu = rng.gen_range(0.1..0.45);
        mats_map.insert(
            i.to_string(),
            SolverMaterial { id: i, e, nu },
        );
    }

    // 1-3 sections
    let n_secs = rng.gen_range(1..=3);
    let mut secs_map = HashMap::new();
    for i in 1..=n_secs {
        let a = 10f64.powf(rng.gen_range(-4.0..0.0));
        let iy = 10f64.powf(rng.gen_range(-8.0..-2.0));
        let iz = 10f64.powf(rng.gen_range(-8.0..-2.0));
        let j = 10f64.powf(rng.gen_range(-8.0..-2.0));
        secs_map.insert(
            i.to_string(),
            SolverSection3D {
                id: i,
                name: None,
                a,
                iy,
                iz,
                j,
                cw: None,
                as_y: None,
                as_z: None,
            },
        );
    }

    // 1-8 frame elements connecting random node pairs
    let n_elems = rng.gen_range(1..=8.min(n_nodes * (n_nodes - 1) / 2).max(1));
    let mut elems_map = HashMap::new();
    for i in 1..=n_elems {
        let mut ni = rng.gen_range(1..=n_nodes);
        let mut nj = rng.gen_range(1..=n_nodes);
        let mut attempts = 0;
        while attempts < 20 {
            if ni != nj {
                let n_i = &nodes_map[&ni.to_string()];
                let n_j = &nodes_map[&nj.to_string()];
                let dist = ((n_i.x - n_j.x).powi(2)
                    + (n_i.y - n_j.y).powi(2)
                    + (n_i.z - n_j.z).powi(2))
                .sqrt();
                if dist > 0.01 {
                    break;
                }
            }
            nj = rng.gen_range(1..=n_nodes);
            if ni == nj {
                ni = rng.gen_range(1..=n_nodes);
            }
            attempts += 1;
        }
        if ni == nj {
            continue;
        }

        let mat_id = rng.gen_range(1..=n_mats);
        let sec_id = rng.gen_range(1..=n_secs);

        elems_map.insert(
            i.to_string(),
            SolverElement3D {
                id: i,
                elem_type: "frame".to_string(),
                node_i: ni,
                node_j: nj,
                material_id: mat_id,
                section_id: sec_id,
                release_my_start: rng.gen_bool(0.1),
                release_my_end: rng.gen_bool(0.1),
                release_mz_start: rng.gen_bool(0.1),
                release_mz_end: rng.gen_bool(0.1),
                release_t_start: false,
                release_t_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            },
        );
    }

    // Fallback: ensure at least one element
    if elems_map.is_empty() {
        nodes_map.insert(
            "1".to_string(),
            SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 },
        );
        nodes_map.insert(
            "2".to_string(),
            SolverNode3D { id: 2, x: 5.0, y: 0.0, z: 0.0 },
        );
        elems_map.insert(
            "1".to_string(),
            SolverElement3D {
                id: 1,
                elem_type: "frame".to_string(),
                node_i: 1,
                node_j: 2,
                material_id: 1,
                section_id: 1,
                release_my_start: false,
                release_my_end: false,
                release_mz_start: false,
                release_mz_end: false,
                release_t_start: false,
                release_t_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            },
        );
    }

    // Supports: at least 1 fully fixed, plus random ones
    let mut sups_map = HashMap::new();
    sups_map.insert(
        "1".to_string(),
        SolverSupport3D {
            node_id: 1,
            rx: true, ry: true, rz: true,
            rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    // Additional random supports
    let n_extra_sups = rng.gen_range(0..=2.min(n_nodes - 1));
    for i in 0..n_extra_sups {
        let node_id = rng.gen_range(2..=n_nodes);
        let sup_id = i + 2;
        sups_map.insert(
            sup_id.to_string(),
            SolverSupport3D {
                node_id,
                rx: rng.gen_bool(0.6),
                ry: rng.gen_bool(0.6),
                rz: rng.gen_bool(0.6),
                rrx: rng.gen_bool(0.4),
                rry: rng.gen_bool(0.4),
                rrz: rng.gen_bool(0.4),
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
    }

    // Loads: 1-4 random nodal and distributed loads
    let n_loads = rng.gen_range(1..=4);
    let mut loads = Vec::new();
    let elem_ids: Vec<usize> = elems_map.values().map(|e| e.id).collect();

    for _ in 0..n_loads {
        let load_kind = rng.gen_range(0..3);
        match load_kind {
            0 => {
                let node_id = rng.gen_range(1..=n_nodes);
                loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id,
                    fx: rng.gen_range(-500.0..500.0),
                    fy: rng.gen_range(-500.0..500.0),
                    fz: rng.gen_range(-500.0..500.0),
                    mx: rng.gen_range(-200.0..200.0),
                    my: rng.gen_range(-200.0..200.0),
                    mz: rng.gen_range(-200.0..200.0),
                    bw: None,
                }));
            }
            1 if !elem_ids.is_empty() => {
                let elem_id = elem_ids[rng.gen_range(0..elem_ids.len())];
                loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    element_id: elem_id,
                    q_yi: rng.gen_range(-100.0..100.0),
                    q_yj: rng.gen_range(-100.0..100.0),
                    q_zi: rng.gen_range(-100.0..100.0),
                    q_zj: rng.gen_range(-100.0..100.0),
                    a: None,
                    b: None,
                }));
            }
            2 if !elem_ids.is_empty() => {
                let elem_id = elem_ids[rng.gen_range(0..elem_ids.len())];
                loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
                    element_id: elem_id,
                    a: rng.gen_range(0.1..0.9),
                    py: rng.gen_range(-500.0..500.0),
                    pz: rng.gen_range(-500.0..500.0),
                }));
            }
            _ => {
                let node_id = rng.gen_range(1..=n_nodes);
                loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id,
                    fx: rng.gen_range(-500.0..500.0),
                    fy: rng.gen_range(-500.0..500.0),
                    fz: rng.gen_range(-500.0..500.0),
                    mx: 0.0, my: 0.0, mz: 0.0,
                    bw: None,
                }));
            }
        }
    }

    SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(),
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

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
