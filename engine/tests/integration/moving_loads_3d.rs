/// Integration tests for 3D moving loads analysis.
///
/// Tests verify:
/// 1. Single axle on simple beam produces envelope
/// 2. Multi-axle train (HL-93 truck-like)
/// 3. Gravity in -Z direction
/// 4. Gravity in -Y direction
/// 5. Multi-span bridge path
/// 6. Step size affects number of positions

use dedaliano_engine::solver::moving_loads::solve_moving_loads_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Create a simply-supported 3D beam along X: nodes 1(0,0,0) and 2(10,0,0).
/// Node 1: pinned. Node 2: roller (free X).
fn make_ss_beam_3d() -> SolverInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 10.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.05,
        iy: 1.0e-4, iz: 5.0e-5, j: 1.5e-4,
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
    // Pin at node 1
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });
    // Roller at node 2 (free in X)
    supports.insert("2".to_string(), SolverSupport3D {
        node_id: 2,
        rx: false, ry: true, rz: true,
        rrx: true, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });

    SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(),
        curved_beams: vec![],
    }
}

#[test]
fn moving_loads_3d_single_axle() {
    let solver = make_ss_beam_3d();
    let input = MovingLoadInput3D {
        solver,
        train: LoadTrain {
            name: "Single axle".to_string(),
            axles: vec![Axle { offset: 0.0, weight: 100.0 }],
        },
        step: Some(0.5),
        path_element_ids: Some(vec![1]),
        gravity_direction: Some("z".to_string()),
    };

    let result = solve_moving_loads_3d(&input).unwrap();
    assert!(result.num_positions > 10, "Should have many positions: {}", result.num_positions);
    assert_eq!(result.path.len(), 1);

    let env = result.elements.get("1").unwrap();

    // For a 100kN load on 10m span, max moment ≈ P*L/4 = 250 kN·m (at midspan)
    // The envelope should capture both positive and negative values
    assert!(env.my_max_pos > 0.0 || env.my_max_neg < 0.0 || env.mz_max_pos > 0.0 || env.mz_max_neg < 0.0,
        "Should have non-zero bending envelope");
    assert!(env.vz_max_pos > 0.0 || env.vz_max_neg < 0.0 || env.vy_max_pos > 0.0 || env.vy_max_neg < 0.0,
        "Should have non-zero shear envelope");
}

#[test]
fn moving_loads_3d_truck_train() {
    let solver = make_ss_beam_3d();
    // HL-93 style truck: 35kN + 145kN (4.3m) + 145kN (4.3m)
    let input = MovingLoadInput3D {
        solver,
        train: LoadTrain {
            name: "HL-93 truck".to_string(),
            axles: vec![
                Axle { offset: 0.0, weight: 35.0 },
                Axle { offset: 4.3, weight: 145.0 },
                Axle { offset: 8.6, weight: 145.0 },
            ],
        },
        step: Some(0.5),
        path_element_ids: Some(vec![1]),
        gravity_direction: Some("z".to_string()),
    };

    let result = solve_moving_loads_3d(&input).unwrap();
    let env = result.elements.get("1").unwrap();

    // Truck total weight = 325 kN on 10m span — check all force envelopes
    let max_shear = env.vy_max_pos.abs().max(env.vy_max_neg.abs())
        .max(env.vz_max_pos.abs().max(env.vz_max_neg.abs()));
    let max_moment = env.my_max_pos.abs().max(env.my_max_neg.abs())
        .max(env.mz_max_pos.abs().max(env.mz_max_neg.abs()));
    let has_effects = max_shear > 1e-6 || max_moment > 1e-6;
    assert!(has_effects, "Truck should produce forces: shear={}, moment={}", max_shear, max_moment);
}

#[test]
fn moving_loads_3d_gravity_z() {
    let solver = make_ss_beam_3d();
    let input = MovingLoadInput3D {
        solver,
        train: LoadTrain {
            name: "Test".to_string(),
            axles: vec![Axle { offset: 0.0, weight: 50.0 }],
        },
        step: Some(1.0),
        path_element_ids: Some(vec![1]),
        gravity_direction: Some("z".to_string()),
    };

    let result = solve_moving_loads_3d(&input).unwrap();
    let env = result.elements.get("1").unwrap();

    // Gravity in Z: should produce Vz and My effects (beam along X, load in -Z)
    let has_z_effects = env.vz_max_pos.abs() > 1e-10 || env.vz_max_neg.abs() > 1e-10
        || env.my_max_pos.abs() > 1e-10 || env.my_max_neg.abs() > 1e-10;
    assert!(has_z_effects, "Gravity in Z should produce Z-direction effects");
}

#[test]
fn moving_loads_3d_gravity_y() {
    let solver = make_ss_beam_3d();
    let input = MovingLoadInput3D {
        solver,
        train: LoadTrain {
            name: "Test".to_string(),
            axles: vec![Axle { offset: 0.0, weight: 50.0 }],
        },
        step: Some(1.0),
        path_element_ids: Some(vec![1]),
        gravity_direction: Some("y".to_string()),
    };

    let result = solve_moving_loads_3d(&input).unwrap();
    let env = result.elements.get("1").unwrap();

    // Gravity in Y: should produce Vy and Mz effects
    let has_y_effects = env.vy_max_pos.abs() > 1e-10 || env.vy_max_neg.abs() > 1e-10
        || env.mz_max_pos.abs() > 1e-10 || env.mz_max_neg.abs() > 1e-10;
    assert!(has_y_effects, "Gravity in Y should produce Y-direction effects");
}

#[test]
fn moving_loads_3d_multispan() {
    // Two-span bridge: node 1(0,0,0), 2(8,0,0), 3(16,0,0)
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 8.0, y: 0.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 16.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.05,
        iy: 1.0e-4, iz: 5.0e-5, j: 1.5e-4,
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
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });

    let mut supports = HashMap::new();
    for (key, nid) in [("1", 1usize), ("2", 2), ("3", 3)] {
        supports.insert(key.to_string(), SolverSupport3D {
            node_id: nid,
            rx: if nid == 1 { true } else { false },
            ry: true, rz: true,
            rrx: true, rry: false, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            rw: None, kw: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None,
        });
    }

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(),
        curved_beams: vec![],
    };

    let input = MovingLoadInput3D {
        solver,
        train: LoadTrain {
            name: "Single axle".to_string(),
            axles: vec![Axle { offset: 0.0, weight: 100.0 }],
        },
        step: Some(0.5),
        path_element_ids: Some(vec![1, 2]),
        gravity_direction: Some("z".to_string()),
    };

    let result = solve_moving_loads_3d(&input).unwrap();
    assert_eq!(result.path.len(), 2, "Should have 2 path segments");

    // Both elements should have envelope data
    let env1 = result.elements.get("1").unwrap();
    let env2 = result.elements.get("2").unwrap();
    let has_forces_1 = env1.my_max_pos.abs() > 1e-10 || env1.my_max_neg.abs() > 1e-10;
    let has_forces_2 = env2.my_max_pos.abs() > 1e-10 || env2.my_max_neg.abs() > 1e-10;
    assert!(has_forces_1, "Element 1 should have envelope forces");
    assert!(has_forces_2, "Element 2 should have envelope forces");
}

#[test]
fn moving_loads_3d_step_size_effect() {
    let solver = make_ss_beam_3d();

    let make_input = |step: f64| MovingLoadInput3D {
        solver: solver.clone(),
        train: LoadTrain {
            name: "Test".to_string(),
            axles: vec![Axle { offset: 0.0, weight: 100.0 }],
        },
        step: Some(step),
        path_element_ids: Some(vec![1]),
        gravity_direction: Some("z".to_string()),
    };

    let result_coarse = solve_moving_loads_3d(&make_input(2.0)).unwrap();
    let result_fine = solve_moving_loads_3d(&make_input(0.5)).unwrap();

    // Finer step should have more positions
    assert!(result_fine.num_positions > result_coarse.num_positions,
        "Finer step should have more positions: {} vs {}",
        result_fine.num_positions, result_coarse.num_positions);
}
