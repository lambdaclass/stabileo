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
        shear_center_y: None,
        shear_center_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
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
        solver_options: None, masses: Default::default(),
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
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
        shear_center_y: None,
        shear_center_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
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
        solver_options: None, masses: Default::default(),
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
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

fn planar_span(rise: f64) -> SolverInput {
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 8.0, "z": rise}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.05, "iz": 0.0001}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "2": {"id": 2, "nodeId": 2, "type": "rollerX"}},
        "loads": []
    })).unwrap()
}

fn planar_moving_input(rise: f64) -> MovingLoadInput {
    MovingLoadInput {
        solver: planar_span(rise),
        train: LoadTrain { name: "planar parity".into(), axles: vec![Axle { offset: 0.0, weight: 100.0 }] },
        path_element_ids: Some(vec![1]),
        step: Some(8.0_f64.hypot(rise) / 2.0),
    }
}

fn embedded_moving_input(input: &MovingLoadInput, plane: dedaliano_engine::metamorphic::planes::Plane) -> MovingLoadInput3D {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    MovingLoadInput3D {
        solver: embed_2d(&input.solver, plane).unwrap(),
        train: input.train.clone(),
        step: input.step,
        path_element_ids: input.path_element_ids.clone(),
        gravity_direction: Some(if plane == Plane::XY { "y" } else { "z" }.into()),
    }
}

fn assert_planar_value(actual: f64, expected: f64) {
    assert!((actual - expected).abs() <= 1e-9 * expected.abs().max(1.0), "actual {actual}, expected {expected}");
}

#[test]
fn issue_1782_midspan_moving_moment_matches_embedded_2d() {
    use dedaliano_engine::metamorphic::planes::Plane;
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    let input = planar_moving_input(0.0);
    let reference = solve_moving_loads_2d(&input).unwrap();
    let r = &reference.elements["1"];
    let length = input.solver.nodes["2"].x;
    let reaction = input.train.axles[0].weight / 2.0;
    let midspan_moment = reaction * length / 2.0;
    assert_planar_value(r.m_max_pos.max(-r.m_max_neg), midspan_moment);
    for plane in Plane::ALL {
        let embedded = embedded_moving_input(&input, plane);
        let result = solve_moving_loads_3d(&embedded).unwrap();
        let e = &result.elements["1"];
        let a = &embedded.solver.nodes["1"];
        let b = &embedded.solver.nodes["2"];
        let (_, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z, None, None, None, None, false);
        let dot = |v: [f64; 3], w: [f64; 3]| v.iter().zip(w).map(|(x, y)| x * y).sum::<f64>();
        for (coefficient, pos, neg) in [(dot(plane.normal(), ey), e.my_max_pos, e.my_max_neg), (dot(plane.normal(), ez), e.mz_max_pos, e.mz_max_neg)] {
            assert_planar_value(pos, (coefficient * r.m_max_pos).max(coefficient * r.m_max_neg));
            assert_planar_value(neg, (coefficient * r.m_max_pos).min(coefficient * r.m_max_neg));
        }
    }
}

fn inclined_midpoint_axial_extremum(input: &MovingLoadInput) -> f64 {
    let a = &input.solver.nodes["1"];
    let b = &input.solver.nodes["2"];
    let length = (b.x - a.x).hypot(b.z - a.z);
    let vertical_reaction = input.train.axles[0].weight / 2.0;
    vertical_reaction * (b.z - a.z) / length
}

#[test]
fn issue_1782_inclined_moving_axial_matches_embedded_2d() {
    use dedaliano_engine::metamorphic::planes::Plane;
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    let input = planar_moving_input(6.0);
    let expected = inclined_midpoint_axial_extremum(&input);
    let reference = solve_moving_loads_2d(&input).unwrap();
    let r = &reference.elements["1"];
    assert!(r.n_max_pos.abs().max(r.n_max_neg.abs()) > 1.0);
    assert_eq!(reference.num_positions, 3);
    assert_planar_value(r.n_max_pos, expected);
    assert_planar_value(r.n_max_neg, -expected);
    println!("inclined 2D axial envelope: [{}, {}] kN; equilibrium: ±{expected} kN", r.n_max_neg, r.n_max_pos);
    let mut endpoints = input.clone();
    endpoints.step = Some(2.0 * input.step.unwrap());
    let endpoint_reference = solve_moving_loads_2d(&endpoints).unwrap();
    assert_eq!(endpoint_reference.num_positions, 2);
    assert_planar_value(endpoint_reference.elements["1"].n_max_pos, 0.0);
    assert_planar_value(endpoint_reference.elements["1"].n_max_neg, 0.0);
    for plane in Plane::ALL {
        let result = solve_moving_loads_3d(&embedded_moving_input(&input, plane)).unwrap();
        let e = &result.elements["1"];
        assert_eq!(result.num_positions, reference.num_positions);
        assert_planar_value(e.n_max_pos, r.n_max_pos);
        assert_planar_value(e.n_max_neg, r.n_max_neg);
        assert_planar_value(e.n_max_pos, expected);
        assert_planar_value(e.n_max_neg, -expected);
        println!("inclined {plane:?} axial envelope: [{}, {}] kN; equilibrium: ±{expected} kN", e.n_max_neg, e.n_max_pos);
        let endpoint_result = solve_moving_loads_3d(&embedded_moving_input(&endpoints, plane)).unwrap();
        assert_eq!(endpoint_result.num_positions, 2);
        assert_planar_value(endpoint_result.elements["1"].n_max_pos, 0.0);
        assert_planar_value(endpoint_result.elements["1"].n_max_neg, 0.0);
    }
}

#[test]
#[ignore = "known wrong result: #1782"]
fn issue_1782_inclined_documented_axial_extrema_match_equilibrium() {
    let expected = inclined_midpoint_axial_extremum(&planar_moving_input(6.0));
    for (name, document) in [
        ("SA-2026-051", include_str!("../../../docs/advisories/SA-2026-051-moving-loads-3d.md")),
        ("moving-loads-3d results change", include_str!("../../../docs/results-changes/2026-11-moving-loads-3d.md")),
    ] {
        let extrema = document.split('±').filter_map(|part| part.split_once(" kN")).filter_map(|(value, _)| value.parse::<f64>().ok()).collect::<Vec<_>>();
        assert!(extrema.iter().any(|value| (*value - expected).abs() <= 1e-9), "{name} must document axial extrema ±{expected} kN from equilibrium; found {extrema:?}");
    }
}

#[test]
fn moving_axle_between_regular_stations_matches_2d() {
    use dedaliano_engine::metamorphic::planes::Plane;
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    let mut input = planar_moving_input(0.0);
    let length = input.solver.nodes["2"].x;
    input.step = Some(0.37 * length);
    let reference = solve_moving_loads_2d(&input).unwrap();
    let expected = (0..reference.num_positions).map(|i| {
        let a = i as f64 * input.step.unwrap();
        let left_reaction = input.train.axles[0].weight * (length - a) / length;
        left_reaction * a
    }).fold(0.0, f64::max);
    assert_planar_value(reference.elements["1"].m_max_pos.max(-reference.elements["1"].m_max_neg), expected);
    let result = solve_moving_loads_3d(&embedded_moving_input(&input, Plane::XY)).unwrap();
    assert_planar_value(result.elements["1"].mz_max_pos.max(-result.elements["1"].mz_max_neg), expected);
}

#[test]
fn inclined_axle_matches_2d_with_reversed_connectivity_and_downward_slope() {
    use dedaliano_engine::metamorphic::planes::Plane;
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    for rise in [-6.0, 6.0] {
        for reverse in [false, true] {
            let mut input = planar_moving_input(rise);
            if reverse {
                let e = input.solver.elements.get_mut("1").unwrap();
                std::mem::swap(&mut e.node_i, &mut e.node_j);
            }
            let reference = solve_moving_loads_2d(&input).unwrap();
            for plane in Plane::ALL {
                let result = solve_moving_loads_3d(&embedded_moving_input(&input, plane)).unwrap();
                assert_planar_value(result.elements["1"].n_max_pos, reference.elements["1"].n_max_pos);
                assert_planar_value(result.elements["1"].n_max_neg, reference.elements["1"].n_max_neg);
            }
        }
    }
}

#[test]
fn axial_point_loads_recover_jumps_and_balance_in_all_3d_assembly_paths() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    use dedaliano_engine::postprocess::diagrams::compute_diagram_value_at;
    use dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at;
    use dedaliano_engine::solver::assembly::{assemble_load_vector_3d_dense, assemble_load_vector_3d_sparse};
    use dedaliano_engine::solver::dof::DofNumbering;
    use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
    use dedaliano_engine::solver::sparse_assembly::assemble_load_vector_sparse_3d;
    for kind in ["frame", "warping", "mixed", "truss"] {
        let mut input = planar_span(0.0);
        input.supports.get_mut("2").unwrap().support_type = "pinned".into();
        if kind == "truss" { input.elements.get_mut("1").unwrap().elem_type = "truss".into(); }
        input.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: 1.17, p: 0.0, px: Some(40.0), my: None,
        }), SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: 5.77, p: 0.0, px: Some(-40.0), my: None,
        })];
        let reference = solve_2d(&input).unwrap();
        let r = &reference.element_forces[0];
        for plane in Plane::ALL {
            let mut embedded = embed_2d(&input, plane).unwrap();
            if kind == "warping" || kind == "mixed" {
                embedded.sections.get_mut("1").unwrap().cw = Some(1e-6);
                for sup in embedded.supports.values_mut() { sup.rw = Some(true); }
            }
            if kind == "mixed" {
                let mut sec = embedded.sections["1"].clone();
                sec.id = 2;
                sec.cw = None;
                embedded.sections.insert("2".into(), sec);
                let mut elem = embedded.elements["1"].clone();
                elem.id = 2;
                elem.section_id = 2;
                embedded.elements.insert("2".into(), elem);
            }
            let dofs = DofNumbering::build_3d(&embedded);
            let dense = assemble_load_vector_3d_dense(&embedded, &embedded.loads, &dofs, &[]);
            for sparse in [assemble_load_vector_3d_sparse(&embedded, &embedded.loads, &dofs, &[]), assemble_load_vector_sparse_3d(&embedded, &embedded.loads, &dofs, &[])] {
                for (a, b) in dense.iter().zip(&sparse) { assert_planar_value(*a, *b); }
            }
            let left_force = 40.0 * ((1.0 - 1.17 / 8.0) - (1.0 - 5.77 / 8.0));
            for (node, force) in [(1, left_force), (2, -left_force)] {
                for (axis, coefficient) in plane.e1().into_iter().enumerate() {
                    assert_planar_value(dense[dofs.global_dof(node, axis).unwrap()], coefficient * force);
                }
            }
            let result = solve_3d(&embedded).unwrap();
            let ef = result.element_forces.iter().find(|e| e.element_id == 1).unwrap();
            assert_planar_value(ef.n_start, r.n_start);
            assert_planar_value(ef.n_end, r.n_end);
            for x in [0.0, 1.17 - 1e-5, 1.17 + 1e-5, 3.0, 5.77 - 1e-5, 5.77 + 1e-5, 8.0] {
                let expected = r.n_start - if x > 1.17 { 40.0 } else { 0.0 } + if x > 5.77 { 40.0 } else { 0.0 };
                assert_planar_value(evaluate_diagram_3d_at(ef, "axial", x / ef.length), expected);
                if kind != "mixed" { assert_planar_value(evaluate_diagram_3d_at(ef, "axial", x / ef.length), compute_diagram_value_at("axial", x / r.length, r)); }
            }
        }
    }
}

#[test]
fn axial_point_loads_survive_combinations_and_moving_envelopes() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    let mut input = planar_moving_input(0.0);
    input.train.axles.clear();
    input.solver.supports.get_mut("2").unwrap().support_type = "pinned".into();
    input.solver.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: 1.17, p: 0.0, px: Some(40.0), my: None,
    }), SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: 5.77, p: 0.0, px: Some(-40.0), my: None,
    })];
    let reference = solve_moving_loads_2d(&input).unwrap();
    let embedded = embedded_moving_input(&input, Plane::XZ);
    let result = solve_moving_loads_3d(&embedded).unwrap();
    assert_planar_value(result.elements["1"].n_max_pos, reference.elements["1"].n_max_pos);
    assert_planar_value(result.elements["1"].n_max_neg, reference.elements["1"].n_max_neg);
    let model = embed_2d(&input.solver, Plane::XZ).unwrap();
    let static_result = dedaliano_engine::solver::linear::solve_3d(&model).unwrap();
    let factors = vec![dedaliano_engine::postprocess::combinations::CombinationFactor { case_id: 1, factor: -2.0 }];
    let combined = dedaliano_engine::postprocess::combinations::combine_results_3d_refs(&factors, &[(1, &static_result)]).unwrap().unwrap();
    let ef = &combined.element_forces[0];
    for t in [0.0, 0.1, 0.3, 0.8, 1.0] {
        let evaluate = dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at;
        assert_planar_value(evaluate(ef, "axial", t), -2.0 * evaluate(&static_result.element_forces[0], "axial", t));
    }
}

#[test]
fn axial_point_load_is_certified_against_independent_3d_reassembly() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    let mut input = planar_span(0.0);
    input.supports.get_mut("1").unwrap().support_type = "fixed".into();
    input.supports.remove("2");
    input.loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: 1.17, p: 0.0, px: Some(40.0), my: None,
    }));
    for plane in Plane::ALL {
        let model = embed_2d(&input, plane).unwrap();
        let result = dedaliano_engine::certify::solver::certify_linear_3d_full(&model).unwrap();
        assert!(result.end_to_end.is_certified(), "{:?}", result.end_to_end);
        let expected_reaction = -40.0;
        for (force, coefficient) in [result.results.reactions[0].fx, result.results.reactions[0].fy, result.results.reactions[0].fz].into_iter().zip(plane.e1()) {
            assert_planar_value(force, coefficient * expected_reaction);
        }
    }
}

#[test]
fn permanent_axial_span_extremum_matches_2d_off_grid() {
    use dedaliano_engine::metamorphic::planes::Plane;
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    let mut input = planar_moving_input(0.0);
    input.train.axles.clear();
    input.solver.loads.push(SolverLoad::AxialDistributed(SolverAxialDistributedLoad {
        element_id: 1, q_i: 3.7, q_j: -6.3, a: None, b: None,
    }));
    let reference = solve_moving_loads_2d(&input).unwrap();
    for plane in Plane::ALL {
        let result = solve_moving_loads_3d(&embedded_moving_input(&input, plane)).unwrap();
        assert_planar_value(result.elements["1"].n_max_pos, reference.elements["1"].n_max_pos);
        assert_planar_value(result.elements["1"].n_max_neg, reference.elements["1"].n_max_neg);
    }
}

#[test]
fn axial_point_load_geometric_stiffness_matches_embedded_2d() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    use dedaliano_engine::solver::buckling::{solve_buckling_2d, solve_buckling_3d};
    let mut input = planar_span(0.0);
    input.supports.get_mut("1").unwrap().support_type = "fixed".into();
    input.supports.remove("2");
    input.loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: 0.37 * 8.0, p: 0.0, px: Some(-40.0), my: None,
    }));
    let reference = solve_buckling_2d(&input, 1).unwrap();
    assert_eq!(reference.modes.len(), 1);
    for plane in Plane::ALL {
        let result = solve_buckling_3d(&embed_2d(&input, plane).unwrap(), 1).unwrap();
        assert_eq!(result.modes.len(), reference.modes.len());
        assert_planar_value(result.modes[0].load_factor, reference.modes[0].load_factor);
    }
}

fn opposite_axial_patches(sign: f64) -> (MovingLoadInput, f64) {
    let mut input = planar_moving_input(0.0);
    input.train.axles.clear();
    input.solver.supports.get_mut("1").unwrap().support_type = "fixed".into();
    input.solver.supports.remove("2");
    let (a, boundary, b) = (1.10, 1.15, 1.20);
    let q = sign * 100.0;
    input.solver.loads = vec![
        SolverLoad::AxialDistributed(SolverAxialDistributedLoad {
            element_id: 1, q_i: q, q_j: q, a: Some(a), b: Some(boundary),
        }),
        SolverLoad::AxialDistributed(SolverAxialDistributedLoad {
            element_id: 1, q_i: -q, q_j: -q, a: Some(boundary), b: Some(b),
        }),
    ];
    let right_patch_resultant = -q * (b - boundary);
    (input, right_patch_resultant)
}

#[test]
fn issue_1782_axial_patch_boundaries_govern_2d_moving_envelope() {
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    for sign in [-1.0, 1.0] {
        let (input, expected) = opposite_axial_patches(sign);
        let result = solve_moving_loads_2d(&input).unwrap();
        assert_planar_value(result.elements["1"].n_max_neg, expected.min(0.0));
        assert_planar_value(result.elements["1"].n_max_pos, expected.max(0.0));
    }
}

#[test]
fn issue_1782_axial_patch_boundaries_govern_3d_moving_envelope() {
    use dedaliano_engine::metamorphic::planes::Plane;
    for sign in [-1.0, 1.0] {
        let (input, expected) = opposite_axial_patches(sign);
        for plane in Plane::ALL {
            let result = solve_moving_loads_3d(&embedded_moving_input(&input, plane)).unwrap();
            assert_planar_value(result.elements["1"].n_max_neg, expected.min(0.0));
            assert_planar_value(result.elements["1"].n_max_pos, expected.max(0.0));
        }
    }
}

#[test]
fn issue_1782_moving_3d_point_jump_limits_are_reversal_invariant() {
    use dedaliano_engine::metamorphic::reversal::reverse_3d;
    let (length, a, q, p) = (10.0, 3.37, 4.0, -60.0);
    let expected = -(q * length / 2.0 + p * (length - a) / length) + q * a;
    let mut solver = make_ss_beam_3d();
    solver.loads = vec![
        SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: 1, q_xi: 0.0, q_xj: 0.0, q_yi: 0.0, q_yj: 0.0,
            q_zi: q, q_zj: q, a: None, b: None,
        }),
        SolverLoad3D::PointOnElement(SolverPointLoad3D {
            element_id: 1, a, px: 0.0, py: 0.0, pz: p,
        }),
    ];
    for s in [solver.clone(), reverse_3d(&solver, &|_| true).unwrap()] {
        let r = solve_moving_loads_3d(&MovingLoadInput3D {
            solver: s, train: LoadTrain { name: "permanent loads".into(), axles: vec![] },
            step: Some(0.7), path_element_ids: Some(vec![1]), gravity_direction: None,
        }).unwrap();
        let actual = r.elements["1"].vz_max_pos;
        assert!((actual - expected).abs() < 1e-9, "jump shear: {actual} vs {expected}");
    }
    for axial in [false, true] {
        for sign in [-1.0, 1.0] {
            let mut s = make_ss_beam_3d();
            s.loads = vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: 1, q_xi: if axial { sign * q } else { 0.0 },
                q_xj: if axial { sign * q } else { 0.0 },
                q_yi: if axial { 0.0 } else { sign * q },
                q_yj: if axial { 0.0 } else { sign * q },
                q_zi: 0.0, q_zj: 0.0, a: None, b: None,
            })];
            for fraction in [0.25, 0.75] {
                s.loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
                    element_id: 1, a, px: if axial { sign * p * fraction } else { 0.0 },
                    py: if axial { 0.0 } else { sign * p * fraction }, pz: 0.0,
                }));
            }
            let (lo, hi) = if axial {
                (q * (length - a) + p, q * (length - a))
            } else { (expected + p, expected) };
            for reverse in [false, true] {
                let solver = if reverse { reverse_3d(&s, &|_| true).unwrap() } else { s.clone() };
                let units = dedaliano_engine::metamorphic::units::Units::froude(0.3048, 4.448);
                let solver = dedaliano_engine::metamorphic::units::scale_3d(&solver, &units);
                let r = solve_moving_loads_3d(&MovingLoadInput3D {
                    solver, train: LoadTrain { name: "coincident loads".into(), axles: vec![] },
                    step: Some(0.7 * units.length), path_element_ids: Some(vec![1]), gravity_direction: None,
                }).unwrap();
                let e = &r.elements["1"];
                let (actual_lo, actual_hi) = if axial { (e.n_max_neg, e.n_max_pos) } else { (e.vy_max_neg, e.vy_max_pos) };
                let multiplier = units.force * if reverse && !axial { -sign } else { sign };
                let (want_lo, want_hi) = ((multiplier * lo).min(multiplier * hi), (multiplier * lo).max(multiplier * hi));
                assert!((actual_lo - want_lo).abs() < 1e-9, "axial={axial} sign={sign} reverse={reverse}: lower limit: {actual_lo} vs {want_lo}");
                assert!((actual_hi - want_hi).abs() < 1e-9, "axial={axial} sign={sign} reverse={reverse}: upper limit: {actual_hi} vs {want_hi}");
            }
        }
    }
}

fn endpoint_cantilever_2d(at_end: bool, load_at_fixed: bool, axial: bool, force: f64) -> (MovingLoadInput, f64) {
    let mut input = planar_moving_input(0.0);
    input.train.axles.clear();
    let fixed = if at_end == load_at_fixed { "2" } else { "1" };
    input.solver.supports.retain(|id, _| id == fixed);
    input.solver.supports.get_mut(fixed).unwrap().support_type = "fixed".into();
    input.solver.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: if at_end { 8.0 } else { 0.0 },
        p: if axial { 0.0 } else { force }, px: Some(if axial { force } else { 0.0 }), my: None,
    })];
    let expected = if load_at_fixed { 0.0 } else { force * if at_end == axial { 1.0 } else { -1.0 } };
    (input, expected)
}

fn check_endpoint_2d(at_end: bool, axial: bool) {
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    for load_at_fixed in [true, false] {
        for force in [-40.0, 40.0] {
            let (input, expected) = endpoint_cantilever_2d(at_end, load_at_fixed, axial, force);
            let r = solve_moving_loads_2d(&input).unwrap();
            let e = &r.elements["1"];
            let (lo, hi) = if axial { (e.n_max_neg, e.n_max_pos) } else { (e.v_max_neg, e.v_max_pos) };
            assert_planar_value(lo, expected.min(0.0));
            assert_planar_value(hi, expected.max(0.0));
        }
    }
}

fn check_endpoint_3d(at_end: bool, axis: usize) {
    use dedaliano_engine::metamorphic::planes::Plane;
    for load_at_fixed in [true, false] {
        for force in [-40.0, 40.0] {
            let (input, expected) = endpoint_cantilever_2d(at_end, load_at_fixed, axis == 0, force);
            let mut input = embedded_moving_input(&input, Plane::XZ);
            input.solver.supports.retain(|_, s| s.rx && s.ry && s.rz && s.rrx && s.rry && s.rrz);
            input.solver.loads = vec![SolverLoad3D::PointOnElement(SolverPointLoad3D {
                element_id: 1, a: if at_end { 8.0 } else { 0.0 },
                px: if axis == 0 { force } else { 0.0 },
                py: if axis == 1 { force } else { 0.0 },
                pz: if axis == 2 { force } else { 0.0 },
            })];
            let r = solve_moving_loads_3d(&input).unwrap();
            let e = &r.elements["1"];
            let (lo, hi) = [(e.n_max_neg, e.n_max_pos), (e.vy_max_neg, e.vy_max_pos), (e.vz_max_neg, e.vz_max_pos)][axis];
            assert_planar_value(lo, expected.min(0.0));
            assert_planar_value(hi, expected.max(0.0));
        }
    }
}

#[test]
fn issue_1782_endpoint_2d_axial_start_obeys_equilibrium() {
    check_endpoint_2d(false, true);
}

#[test]
fn issue_1782_endpoint_2d_axial_end_obeys_equilibrium() {
    check_endpoint_2d(true, true);
}

#[test]
fn issue_1782_endpoint_2d_shear_start_obeys_equilibrium() {
    check_endpoint_2d(false, false);
}

#[test]
fn issue_1782_endpoint_2d_shear_end_obeys_equilibrium() {
    check_endpoint_2d(true, false);
}

#[test]
fn issue_1782_endpoint_3d_axial_start_obeys_equilibrium() {
    check_endpoint_3d(false, 0);
}

#[test]
fn issue_1782_endpoint_3d_axial_end_obeys_equilibrium() {
    check_endpoint_3d(true, 0);
}

#[test]
fn issue_1782_endpoint_3d_shear_y_start_obeys_equilibrium() {
    check_endpoint_3d(false, 1);
}

#[test]
fn issue_1782_endpoint_3d_shear_y_end_obeys_equilibrium() {
    check_endpoint_3d(true, 1);
}

#[test]
fn issue_1782_endpoint_3d_shear_z_start_obeys_equilibrium() {
    check_endpoint_3d(false, 2);
}

#[test]
fn issue_1782_endpoint_3d_shear_z_end_obeys_equilibrium() {
    check_endpoint_3d(true, 2);
}

#[test]
fn issue_1782_endpoint_axles_are_carried_by_supports() {
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    use dedaliano_engine::metamorphic::planes::Plane;
    for length in [8.0, 1e-6] {
        let mut input = planar_moving_input(0.0);
        input.solver.nodes.get_mut("2").unwrap().x = length;
        for s in input.solver.supports.values_mut() { s.support_type = "fixed".into(); }
        input.step = Some(length);
        let r = solve_moving_loads_2d(&input).unwrap();
        assert_eq!(r.num_positions, 2);
        let e = &r.elements["1"];
        for value in [e.n_max_neg, e.n_max_pos, e.v_max_neg, e.v_max_pos, e.m_max_neg, e.m_max_pos] {
            assert_planar_value(value, 0.0);
        }
        for plane in Plane::ALL {
            let r = solve_moving_loads_3d(&embedded_moving_input(&input, plane)).unwrap();
            assert_eq!(r.num_positions, 2);
            let e = &r.elements["1"];
            for value in [e.n_max_neg, e.n_max_pos, e.vy_max_neg, e.vy_max_pos, e.vz_max_neg, e.vz_max_pos, e.my_max_neg, e.my_max_pos, e.mz_max_neg, e.mz_max_pos] {
                assert_planar_value(value, 0.0);
            }
        }
    }
}
