/// Bit-for-bit parity tests for the prepared (factorization-reuse) moving-load
/// and influence-line paths.
///
/// Production code now prepares the structure once (`prepare_static_2d/3d`)
/// and reuses the factorization per train position / sampled unit load. The
/// legacy reference below runs one full `solve_2d`/`solve_3d` per position or
/// point, over exactly the same load sets (built with the same public
/// helpers). All f64 comparisons are exact (`==`).

use dedaliano_engine::postprocess::influence::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::moving_loads::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn assert_f64_eq(a: f64, b: f64, what: &str) {
    assert!(a == b, "mismatch at {}: {} vs {} (diff {:e})", what, a, b, (a - b).abs());
}

// ==================== Model builders ====================

fn sup_2d(id: usize, node_id: usize, kind: &str) -> SolverSupport {
    SolverSupport {
        id, node_id, support_type: kind.to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    }
}

/// 2D three-element beam, last element inclined, with a permanent distributed
/// load (exercises base-load carry-over in moving loads).
fn make_beam_2d_inclined() -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 4.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: 8.0, z: 0.0 });
    nodes.insert("4".to_string(), SolverNode { id: 4, x: 12.0, z: 3.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.05, iz: 1.0e-4, as_y: None });

    let mut elements = HashMap::new();
    for (id, ni, nj) in [(1, 1, 2), (2, 2, 3), (3, 3, 4)] {
        elements.insert(id.to_string(), SolverElement {
            id, elem_type: "frame".to_string(),
            node_i: ni, node_j: nj,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup_2d(1, 1, "pinned"));
    supports.insert("2".to_string(), sup_2d(2, 2, "rollerX"));
    supports.insert("3".to_string(), sup_2d(3, 4, "rollerX"));

    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -2.0, q_j: -2.0, a: None, b: None,
        }),
        SolverLoad::Thermal(SolverThermalLoad { element_id: 2, dt_uniform: 5.0, dt_gradient: 0.0 }),
    ];

    SolverInput {
        nodes, materials, sections, elements, supports,
        loads, constraints: vec![], connectors: HashMap::new(),
    }
}

fn sup_3d(node_id: usize, rx: bool, ry: bool, rz: bool, rrx: bool, rry: bool, rrz: bool) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx, ry, rz, rrx, rry, rrz,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    }
}

/// 3D three-element beam along X, last element inclined up in Z.
fn make_beam_3d_inclined() -> SolverInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 4.0, y: 0.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 8.0, y: 0.0, z: 0.0 });
    nodes.insert("4".to_string(), SolverNode3D { id: 4, x: 12.0, y: 0.0, z: 3.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.05,
        iy: 1.0e-4, iz: 5.0e-5, j: 1.5e-4,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    for (id, ni, nj) in [(1, 1, 2), (2, 2, 3), (3, 3, 4)] {
        elements.insert(id.to_string(), SolverElement3D {
            id, elem_type: "frame".to_string(),
            node_i: ni, node_j: nj,
            material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false,
            release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None,
            roll_angle: None,
        });
    }

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup_3d(1, true, true, true, true, false, false));
    supports.insert("2".to_string(), sup_3d(4, false, true, true, true, false, false));

    let loads = vec![
        SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: 1, q_yi: 0.0, q_yj: 0.0, q_zi: -1.5, q_zj: -1.5,
            a: None, b: None,
        }),
    ];

    SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

fn train_3axle() -> LoadTrain {
    LoadTrain {
        name: "T3".to_string(),
        axles: vec![
            Axle { offset: 0.0, weight: 100.0 },
            Axle { offset: 2.0, weight: 150.0 },
            Axle { offset: 5.0, weight: 80.0 },
        ],
    }
}

// ==================== Legacy references (full solve per position/point) ====================

fn legacy_moving_2d(input: &MovingLoadInput) -> MovingLoadEnvelope {
    let solver_input = &input.solver;
    let train = &input.train;
    let step = input.step.unwrap_or(0.25);
    let path = build_load_path(solver_input, input.path_element_ids.as_deref()).unwrap();
    let total_length: f64 = path.iter().map(|s| s.length).sum();
    let max_offset: f64 = train.axles.iter().map(|a| a.offset).fold(0.0, f64::max);

    let mut envelopes: HashMap<String, ElementEnvelope> = HashMap::new();
    for elem in solver_input.elements.values() {
        envelopes.insert(elem.id.to_string(), ElementEnvelope {
            m_max_pos: 0.0, m_max_neg: 0.0,
            v_max_pos: 0.0, v_max_neg: 0.0,
            n_max_pos: 0.0, n_max_neg: 0.0,
        });
    }

    let mut pos = -max_offset;
    let mut num_positions = 0;
    while pos <= total_length + 1e-10 {
        num_positions += 1;
        let loads = moving_loads_at_position_2d(solver_input, train, &path, pos, total_length);
        let mut modified_input = solver_input.clone();
        modified_input.loads = loads;
        if let Ok(results) = solve_2d(&modified_input) {
            for ef in &results.element_forces {
                if let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) {
                    let m_max = ef.m_start.max(ef.m_end);
                    let m_min = ef.m_start.min(ef.m_end);
                    let v_max = ef.v_start.max(ef.v_end);
                    let v_min = ef.v_start.min(ef.v_end);
                    let n_max = ef.n_start.max(ef.n_end);
                    let n_min = ef.n_start.min(ef.n_end);
                    env.m_max_pos = env.m_max_pos.max(m_max);
                    env.m_max_neg = env.m_max_neg.min(m_min);
                    env.v_max_pos = env.v_max_pos.max(v_max);
                    env.v_max_neg = env.v_max_neg.min(v_min);
                    env.n_max_pos = env.n_max_pos.max(n_max);
                    env.n_max_neg = env.n_max_neg.min(n_min);
                }
            }
        }
        pos += step;
    }

    MovingLoadEnvelope { elements: envelopes, train: train.clone(), path, num_positions }
}

fn legacy_moving_3d(input: &MovingLoadInput3D) -> MovingLoadEnvelope3D {
    let solver_input = &input.solver;
    let train = &input.train;
    let step = input.step.unwrap_or(0.25);
    let gravity = input.gravity_direction.as_deref().unwrap_or("z");
    let path = build_load_path_3d(solver_input, input.path_element_ids.as_deref()).unwrap();
    let total_length: f64 = path.iter().map(|s| s.length).sum();
    let max_offset: f64 = train.axles.iter().map(|a| a.offset).fold(0.0, f64::max);

    let mut envelopes: HashMap<String, ElementEnvelope3D> = HashMap::new();
    for elem in solver_input.elements.values() {
        envelopes.insert(elem.id.to_string(), ElementEnvelope3D {
            n_max_pos: 0.0, n_max_neg: 0.0,
            vy_max_pos: 0.0, vy_max_neg: 0.0,
            vz_max_pos: 0.0, vz_max_neg: 0.0,
            my_max_pos: 0.0, my_max_neg: 0.0,
            mz_max_pos: 0.0, mz_max_neg: 0.0,
            mx_max_pos: 0.0, mx_max_neg: 0.0,
        });
    }

    let mut pos = -max_offset;
    let mut num_positions = 0;
    while pos <= total_length + 1e-10 {
        num_positions += 1;
        let loads = moving_loads_at_position_3d(solver_input, train, gravity, &path, pos, total_length);
        let mut modified_input = solver_input.clone();
        modified_input.loads = loads;
        if let Ok(results) = solve_3d(&modified_input) {
            for ef in &results.element_forces {
                if let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) {
                    env.n_max_pos = env.n_max_pos.max(ef.n_start.max(ef.n_end));
                    env.n_max_neg = env.n_max_neg.min(ef.n_start.min(ef.n_end));
                    env.vy_max_pos = env.vy_max_pos.max(ef.vy_start.max(ef.vy_end));
                    env.vy_max_neg = env.vy_max_neg.min(ef.vy_start.min(ef.vy_end));
                    env.vz_max_pos = env.vz_max_pos.max(ef.vz_start.max(ef.vz_end));
                    env.vz_max_neg = env.vz_max_neg.min(ef.vz_start.min(ef.vz_end));
                    env.my_max_pos = env.my_max_pos.max(ef.my_start.max(ef.my_end));
                    env.my_max_neg = env.my_max_neg.min(ef.my_start.min(ef.my_end));
                    env.mz_max_pos = env.mz_max_pos.max(ef.mz_start.max(ef.mz_end));
                    env.mz_max_neg = env.mz_max_neg.min(ef.mz_start.min(ef.mz_end));
                    env.mx_max_pos = env.mx_max_pos.max(ef.mx_start.max(ef.mx_end));
                    env.mx_max_neg = env.mx_max_neg.min(ef.mx_start.min(ef.mx_end));
                }
            }
        }
        pos += step;
    }

    MovingLoadEnvelope3D { elements: envelopes, train: train.clone(), path, num_positions }
}

// ==================== Moving loads parity ====================

#[test]
fn parity_moving_loads_2d() {
    let input = MovingLoadInput {
        solver: make_beam_2d_inclined(),
        train: train_3axle(),
        step: Some(0.7),
        path_element_ids: None,
    };

    let new = solve_moving_loads_2d(&input).unwrap();
    let legacy = legacy_moving_2d(&input);

    assert_eq!(new.num_positions, legacy.num_positions);
    assert!(new.num_positions > 20, "expected many positions, got {}", new.num_positions);
    assert_eq!(new.elements.len(), legacy.elements.len());
    for (eid, a) in &new.elements {
        let b = legacy.elements.get(eid).expect("missing element in legacy");
        let c = format!("element {}", eid);
        assert_f64_eq(a.m_max_pos, b.m_max_pos, &format!("{} m_max_pos", c));
        assert_f64_eq(a.m_max_neg, b.m_max_neg, &format!("{} m_max_neg", c));
        assert_f64_eq(a.v_max_pos, b.v_max_pos, &format!("{} v_max_pos", c));
        assert_f64_eq(a.v_max_neg, b.v_max_neg, &format!("{} v_max_neg", c));
        assert_f64_eq(a.n_max_pos, b.n_max_pos, &format!("{} n_max_pos", c));
        assert_f64_eq(a.n_max_neg, b.n_max_neg, &format!("{} n_max_neg", c));
    }
    // Sanity: envelopes actually moved off zero somewhere
    let any_nonzero = new.elements.values()
        .any(|e| e.m_max_pos != 0.0 || e.m_max_neg != 0.0 || e.v_max_pos != 0.0 || e.n_max_neg != 0.0);
    assert!(any_nonzero, "envelopes unexpectedly all zero");
}

#[test]
fn parity_moving_loads_3d() {
    let input = MovingLoadInput3D {
        solver: make_beam_3d_inclined(),
        train: LoadTrain {
            name: "T2".to_string(),
            axles: vec![
                Axle { offset: 0.0, weight: 100.0 },
                Axle { offset: 3.0, weight: 140.0 },
            ],
        },
        step: Some(0.8),
        path_element_ids: None,
        gravity_direction: None,
    };

    let new = solve_moving_loads_3d(&input).unwrap();
    let legacy = legacy_moving_3d(&input);

    assert_eq!(new.num_positions, legacy.num_positions);
    assert!(new.num_positions > 15, "expected many positions, got {}", new.num_positions);
    for (eid, a) in &new.elements {
        let b = legacy.elements.get(eid).expect("missing element in legacy");
        let c = format!("element {}", eid);
        assert_f64_eq(a.n_max_pos, b.n_max_pos, &format!("{} n_max_pos", c));
        assert_f64_eq(a.n_max_neg, b.n_max_neg, &format!("{} n_max_neg", c));
        assert_f64_eq(a.vy_max_pos, b.vy_max_pos, &format!("{} vy_max_pos", c));
        assert_f64_eq(a.vy_max_neg, b.vy_max_neg, &format!("{} vy_max_neg", c));
        assert_f64_eq(a.vz_max_pos, b.vz_max_pos, &format!("{} vz_max_pos", c));
        assert_f64_eq(a.vz_max_neg, b.vz_max_neg, &format!("{} vz_max_neg", c));
        assert_f64_eq(a.my_max_pos, b.my_max_pos, &format!("{} my_max_pos", c));
        assert_f64_eq(a.my_max_neg, b.my_max_neg, &format!("{} my_max_neg", c));
        assert_f64_eq(a.mz_max_pos, b.mz_max_pos, &format!("{} mz_max_pos", c));
        assert_f64_eq(a.mz_max_neg, b.mz_max_neg, &format!("{} mz_max_neg", c));
        assert_f64_eq(a.mx_max_pos, b.mx_max_pos, &format!("{} mx_max_pos", c));
        assert_f64_eq(a.mx_max_neg, b.mx_max_neg, &format!("{} mx_max_neg", c));
    }
    let any_nonzero = new.elements.values()
        .any(|e| e.mz_max_pos != 0.0 || e.mz_max_neg != 0.0 || e.vz_max_pos != 0.0 || e.n_max_neg != 0.0);
    assert!(any_nonzero, "envelopes unexpectedly all zero");
}

// ==================== Influence line parity ====================

#[test]
fn parity_influence_line_2d() {
    for (quantity, node, elem_id) in [("Ry", Some(1), None), ("M", None, Some(1))] {
        let input = InfluenceLineInput {
            solver: make_beam_2d_inclined(),
            quantity: quantity.to_string(),
            target_node_id: node,
            target_element_id: elem_id,
            target_position: 0.5,
            n_points_per_element: 8,
        };

        let new = compute_influence_line(&input).unwrap();

        // Legacy: one full solve per sampled point
        let base = SolverInput { loads: vec![], ..input.solver.clone() };
        let node_pos: HashMap<usize, (f64, f64)> = input.solver.nodes.values()
            .map(|n| (n.id, (n.x, n.z)))
            .collect();
        let mut legacy_points = Vec::new();
        for elem in input.solver.elements.values() {
            let (nix, niy) = *node_pos.get(&elem.node_i).unwrap();
            let (njx, njy) = *node_pos.get(&elem.node_j).unwrap();
            let dx = njx - nix;
            let dy = njy - niy;
            let l = (dx * dx + dy * dy).sqrt();
            if l < 1e-6 { continue; }
            let cos_theta = dx / l;
            let sin_theta = dy / l;
            for k in 0..=input.n_points_per_element {
                let t = k as f64 / input.n_points_per_element as f64;
                let a = t * l;
                let loads = influence_unit_loads_2d(elem, a, t, cos_theta, sin_theta);
                let mut trial = base.clone();
                trial.loads = loads;
                let value = match solve_2d(&trial) {
                    Ok(result) => extract_value(&input.quantity, input.target_node_id, input.target_element_id, input.target_position, &result),
                    Err(_) => 0.0,
                };
                legacy_points.push((nix + t * dx, niy + t * dy, elem.id, t, value));
            }
        }

        assert_eq!(new.points.len(), legacy_points.len(), "point count for {}", quantity);
        for (p, (lx, ly, le, lt, lv)) in new.points.iter().zip(&legacy_points) {
            let c = format!("{} elem {} t {}", quantity, le, lt);
            assert_f64_eq(p.x, *lx, &format!("{} x", c));
            assert_f64_eq(p.y, *ly, &format!("{} y", c));
            assert_eq!(p.element_id, *le, "{} element_id", c);
            assert_f64_eq(p.t, *lt, &format!("{} t", c));
            assert_f64_eq(p.value, *lv, &format!("{} value", c));
        }
        let any_nonzero = new.points.iter().any(|p| p.value != 0.0);
        assert!(any_nonzero, "influence line unexpectedly all zero for {}", quantity);
    }
}

#[test]
fn parity_influence_line_3d() {
    for (quantity, node, elem_id) in [("Fz", Some(1), None), ("My_diag", None, Some(1))] {
        let input = InfluenceLineInput3D {
            solver: make_beam_3d_inclined(),
            quantity: quantity.to_string(),
            target_node_id: node,
            target_element_id: elem_id,
            target_position: 0.5,
            n_points_per_element: 8,
            gravity_direction: None,
        };

        let new = compute_influence_line_3d(&input).unwrap();

        // Legacy: one full solve per sampled point
        let base = SolverInput3D { loads: vec![], ..input.solver.clone() };
        let node_pos: HashMap<usize, (f64, f64, f64)> = input.solver.nodes.values()
            .map(|n| (n.id, (n.x, n.y, n.z)))
            .collect();
        let gravity_dir = [0.0_f64, 0.0, -1.0];
        let mut legacy_points = Vec::new();
        for elem in input.solver.elements.values() {
            if elem.elem_type != "frame" && elem.elem_type != "beam" { continue; }
            let (nix, niy, niz) = *node_pos.get(&elem.node_i).unwrap();
            let (njx, njy, njz) = *node_pos.get(&elem.node_j).unwrap();
            let dx = njx - nix;
            let dy = njy - niy;
            let dz = njz - niz;
            let l = (dx * dx + dy * dy + dz * dz).sqrt();
            if l < 1e-6 { continue; }
            let left_hand = input.solver.left_hand.unwrap_or(false);
            let (_ex, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(
                nix, niy, niz, njx, njy, njz,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle, left_hand,
            );
            let g_local_y = gravity_dir[0] * ey[0] + gravity_dir[1] * ey[1] + gravity_dir[2] * ey[2];
            let g_local_z = gravity_dir[0] * ez[0] + gravity_dir[1] * ez[1] + gravity_dir[2] * ez[2];
            for k in 0..=input.n_points_per_element {
                let t = k as f64 / input.n_points_per_element as f64;
                let a = t * l;
                let loads = influence_unit_loads_3d(elem.id, a, g_local_y, g_local_z);
                let mut trial = base.clone();
                trial.loads = loads;
                let value = match solve_3d(&trial) {
                    Ok(result) => extract_value_3d(&input.quantity, input.target_node_id, input.target_element_id, input.target_position, &result),
                    Err(_) => 0.0,
                };
                legacy_points.push((nix + t * dx, niy + t * dy, niz + t * dz, elem.id, t, value));
            }
        }

        assert_eq!(new.points.len(), legacy_points.len(), "point count for {}", quantity);
        for (p, (lx, ly, lz, le, lt, lv)) in new.points.iter().zip(&legacy_points) {
            let c = format!("{} elem {} t {}", quantity, le, lt);
            assert_f64_eq(p.x, *lx, &format!("{} x", c));
            assert_f64_eq(p.y, *ly, &format!("{} y", c));
            assert_f64_eq(p.z, *lz, &format!("{} z", c));
            assert_eq!(p.element_id, *le, "{} element_id", c);
            assert_f64_eq(p.t, *lt, &format!("{} t", c));
            assert_f64_eq(p.value, *lv, &format!("{} value", c));
        }
        let any_nonzero = new.points.iter().any(|p| p.value != 0.0);
        assert!(any_nonzero, "influence line unexpectedly all zero for {}", quantity);
    }
}
