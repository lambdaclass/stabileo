/// Integration tests for 3D time history analysis.
///
/// Tests verify:
/// 1. Zero initial conditions → zero response
/// 2. Ground acceleration produces response
/// 3. Tri-directional seismic input
/// 4. Force history with 3D loads
/// 5. HHT-alpha numerical dissipation
/// 6. Rayleigh damping decay

use dedaliano_engine::solver::time_integration::solve_time_history_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Create a simple 3D cantilever: node 1 (fixed) at origin, node 2 (free) at (1,0,0).
fn make_3d_cantilever() -> TimeHistoryInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 1.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01,
        iy: 8.33e-6, iz: 8.33e-6, j: 1.41e-5,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(),
        curved_beams: vec![],
    };

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    TimeHistoryInput3D {
        solver, densities,
        time_step: 0.001, n_steps: 100,
        method: "newmark".to_string(),
        beta: 0.25, gamma: 0.5,
        alpha: None, damping_xi: None,
        ground_accel_x: None, ground_accel_y: None, ground_accel_z: None,
        force_history: None,
    }
}

#[test]
fn time_history_3d_zero_initial() {
    let input = make_3d_cantilever();
    let result = solve_time_history_3d(&input).unwrap();

    assert_eq!(result.n_steps, 100);
    assert_eq!(result.time_steps.len(), 101);
    assert!(!result.node_histories.is_empty());

    for hist in &result.node_histories {
        for &u in &hist.ux { assert!(u.abs() < 1e-10); }
        for &u in &hist.uy { assert!(u.abs() < 1e-10); }
        for &u in &hist.uz { assert!(u.abs() < 1e-10); }
    }
}

#[test]
fn time_history_3d_ground_accel_x() {
    let mut input = make_3d_cantilever();
    let mut ground_accel = vec![0.0; 201];
    ground_accel[1] = 9.81;
    input.ground_accel_x = Some(ground_accel);
    input.n_steps = 200;

    let result = solve_time_history_3d(&input).unwrap();
    let node2 = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
    let max_ux: f64 = node2.ux.iter().map(|v| v.abs()).fold(0.0, f64::max);
    assert!(max_ux > 1e-10, "Expected non-zero X response: {}", max_ux);
}

#[test]
fn time_history_3d_tridirectional_seismic() {
    let mut input = make_3d_cantilever();
    let n = 201;
    let mut ax = vec![0.0; n];
    let mut ay = vec![0.0; n];
    let mut az = vec![0.0; n];
    ax[1] = 5.0;
    ay[1] = 3.0;
    az[1] = 2.0;
    input.ground_accel_x = Some(ax);
    input.ground_accel_y = Some(ay);
    input.ground_accel_z = Some(az);
    input.n_steps = 200;

    let result = solve_time_history_3d(&input).unwrap();
    let node2 = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
    let max_ux: f64 = node2.ux.iter().map(|v| v.abs()).fold(0.0, f64::max);
    let max_uy: f64 = node2.uy.iter().map(|v| v.abs()).fold(0.0, f64::max);
    let max_uz: f64 = node2.uz.iter().map(|v| v.abs()).fold(0.0, f64::max);

    assert!(max_ux > 1e-10, "Expected non-zero X response: {}", max_ux);
    assert!(max_uy > 1e-10, "Expected non-zero Y response: {}", max_uy);
    assert!(max_uz > 1e-10, "Expected non-zero Z response: {}", max_uz);
}

#[test]
fn time_history_3d_force_history() {
    let mut input = make_3d_cantilever();
    input.force_history = Some(vec![
        TimeForceRecord3D {
            time: 0.0,
            loads: vec![SolverNodalLoad3D {
                node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }] },
        TimeForceRecord3D {
            time: 1.0,
            loads: vec![SolverNodalLoad3D {
                node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }] },
    ]);
    input.n_steps = 500;

    let result = solve_time_history_3d(&input).unwrap();
    let node2 = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
    let max_uz: f64 = node2.uz.iter().map(|v| v.abs()).fold(0.0, f64::max);
    assert!(max_uz > 1e-6, "Expected non-zero Z displacement: {}", max_uz);

    let peak = result.peak_displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(peak.uz.abs() > 1e-6);
}

#[test]
fn time_history_3d_hht_alpha() {
    let mut input = make_3d_cantilever();
    input.alpha = Some(-0.1);
    input.force_history = Some(vec![
        TimeForceRecord3D {
            time: 0.0,
            loads: vec![SolverNodalLoad3D {
                node_id: 2, fx: 0.0, fy: -10.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }] },
        TimeForceRecord3D {
            time: 0.01,
            loads: vec![SolverNodalLoad3D {
                node_id: 2, fx: 0.0, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }] },
    ]);
    input.n_steps = 200;

    let result = solve_time_history_3d(&input).unwrap();
    assert!(result.method.contains("HHT"));

    let node2 = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
    let max_uy: f64 = node2.uy.iter().map(|v| v.abs()).fold(0.0, f64::max);
    assert!(max_uy > 1e-8, "HHT should produce non-zero response: {}", max_uy);
}

#[test]
fn time_history_3d_rayleigh_damping() {
    let mut input = make_3d_cantilever();
    input.damping_xi = Some(0.05);
    input.force_history = Some(vec![
        TimeForceRecord3D {
            time: 0.0,
            loads: vec![SolverNodalLoad3D {
                node_id: 2, fx: 0.0, fy: -10.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }] },
        TimeForceRecord3D {
            time: 0.001,
            loads: vec![SolverNodalLoad3D {
                node_id: 2, fx: 0.0, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }] },
    ]);
    input.n_steps = 1000;

    let result = solve_time_history_3d(&input).unwrap();
    let node2 = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();

    let half = node2.uy.len() / 2;
    let max_first: f64 = node2.uy[..half].iter().map(|v| v.abs()).fold(0.0, f64::max);
    let max_second: f64 = node2.uy[half..].iter().map(|v| v.abs()).fold(0.0, f64::max);

    assert!(
        max_second < max_first || max_first < 1e-15,
        "Damping should reduce amplitude: first={}, second={}",
        max_first, max_second
    );
}
