use dedaliano_engine::{
    metamorphic::planes::{embed_2d, Plane},
    solver::{corotational, linear, pdelta},
    types::*,
};

fn witness() -> SolverInput {
    serde_json::from_str(include_str!("../fixtures/narrow-span-2222.json")).unwrap()
}

fn near(a: f64, b: f64) {
    assert!((a - b).abs() <= 1e-10 * b.abs().max(1.0), "{a} != {b}");
}

fn bounded_interval_cases() -> Vec<(f64, f64, bool)> {
    vec![
        (-5e-13, 3.0, false), (0.0, 3.0 + 5e-13, false),
        (-f64::from_bits(1), 3.0, false), (0.0, 3.0_f64.next_up(), false),
        (-1e-12, 3.0, false), (0.0, 3.0 + 1e-12, false),
        (0.0, 3.0, true), (f64::from_bits(1), 3.0, true),
        (0.0, 3.0_f64.next_down(), true), (5e-13, 3.0 - 5e-13, true),
        (1.0, 2.0, true),
        (1.0, 1.0_f64.next_down(), false),
    ]
}

fn interval_result(result: Result<(), String>, valid: bool, entry: &str, a: f64, b: f64) {
    if valid {
        result.unwrap_or_else(|e| panic!("{entry} refused [{a}, {b}]: {e}"));
    } else {
        let error = result.expect_err(&format!("{entry} accepted [{a}, {b}]"));
        assert!(error.contains("invalid distributed load interval"), "{entry}: {error}");
    }
}

#[test]
fn issue_2222_near_full_bounds_planar() {
    for (a, b, valid) in bounded_interval_cases() {
        for axial in [false, true] {
            let mut input = witness();
            let load = SolverDistributedLoad { element_id: 1, q_i: -2.0, q_j: -2.0, a: Some(a), b: Some(b) };
            input.loads = vec![if axial { SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: load.element_id, q_i: load.q_i, q_j: load.q_j, a: load.a, b: load.b }) } else { SolverLoad::Distributed(load) }];
            let mut base = input.clone();
            base.loads.clear();
            let typed = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
            let fiber = dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearInput {
                solver: input.clone(), fiber_sections: Default::default(), n_integration_points: 5,
                max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false,
            };
            for (entry, result) in [
                ("linear", linear::solve_2d(&input).map(|_| ())),
                ("typed", linear::solve_2d_typed(&typed).map(|_| ())),
                ("prepared", linear::prepare_static_2d(&base).unwrap().solve_loads(&input.loads).map(|_| ())),
                ("dense", linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&input.loads).map(|_| ())),
                ("session", dedaliano_engine::load_session::LoadSession2D::from_input(base).unwrap().solve_loads(&input.loads).map(|_| ())),
                ("pdelta", pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|_| ())),
                ("corotational", corotational::solve_corotational_2d(&input, 40, 1e-9, 1, false).map(|_| ())),
                ("fiber", dedaliano_engine::solver::fiber_nonlinear::solve_fiber_nonlinear_2d(&fiber).map(|_| ())),
            ] {
                interval_result(result, valid, entry, a, b);
            }
            if valid {
                let result = linear::solve_2d(&input).unwrap();
                let reaction: f64 = result.reactions.iter().map(|r| if axial { r.rx } else { r.rz }).sum();
                near(reaction, 2.0 * (b - a));
                if b > a { assert!(result.displacements.iter().any(|d| d.ux != 0.0 || d.uz != 0.0)); }
            }
        }
    }
}

#[test]
fn issue_2222_near_full_bounds_spatial() {
    for (a, b, valid) in bounded_interval_cases() {
        for plane in [Plane::XY, Plane::XZ] {
            for axial in [false, true] {
                let mut input = witness();
                let load = SolverDistributedLoad { element_id: 1, q_i: -2.0, q_j: -2.0, a: Some(a), b: Some(b) };
                input.loads = vec![if axial { SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: load.element_id, q_i: load.q_i, q_j: load.q_j, a: load.a, b: load.b }) } else { SolverLoad::Distributed(load) }];
                let input = embed_2d(&input, plane).unwrap();
                let mut base = input.clone();
                base.loads.clear();
                let fiber = dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearInput3D {
                    solver: input.clone(), fiber_sections: Default::default(), n_integration_points: 5,
                    max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false,
                };
                for (entry, result) in [
                    ("linear", linear::solve_3d(&input).map(|_| ())),
                    ("prepared", linear::prepare_static_3d(&base).unwrap().solve_loads(&input.loads).map(|_| ())),
                    ("session", dedaliano_engine::load_session::LoadSession3D::from_input(base).unwrap().solve_loads(&input.loads).map(|_| ())),
                    ("pdelta", pdelta::solve_pdelta_3d(&input, 20, 1e-9).map(|_| ())),
                    ("corotational", corotational::solve_corotational_3d(&input, 40, 1e-9, 1, false).map(|_| ())),
                    ("fiber", dedaliano_engine::solver::fiber_nonlinear::solve_fiber_nonlinear_3d(&fiber).map(|_| ())),
                ] {
                    interval_result(result, valid, entry, a, b);
                }
                if valid {
                    let result = linear::solve_3d(&input).unwrap();
                    let reaction: f64 = result.reactions.iter().map(|r| if axial { r.fx } else if matches!(plane, Plane::XY) { r.fy } else { r.fz }).sum();
                    near(reaction, 2.0 * (b - a));
                    if b > a { assert!(result.displacements.iter().any(|d| d.ux != 0.0 || d.uy != 0.0 || d.uz != 0.0)); }
                }
            }
        }
    }
}


fn cancellation_input() -> SolverInput {
    let mut input = witness();
    input.loads = [(1, 1e16), (3, 1.0), (1, -1e16)].into_iter().map(|(node_id, fz)| {
        SolverLoad::Nodal(SolverNodalLoad { node_id, fx: 0.0, fz, my: 0.0 })
    }).collect();
    input
}

#[test]
fn issue_2222_cancelling_nodal_forces_planar() {
    use dedaliano_engine::{load_session::LoadSession2D, solver::fiber_nonlinear::*};
    for cancel in [true, false] {
        let mut input = cancellation_input();
        if !cancel { input.loads = vec![input.loads[1].clone()]; }
        let mut base = input.clone();
        base.loads.clear();
        let typed = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
        let fiber = FiberNonlinearInput { solver: input.clone(), fiber_sections: Default::default(),
            n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
        for (entry, result) in [
            ("linear", linear::solve_2d(&input)),
            ("typed", linear::solve_2d_typed(&typed)),
            ("prepared", linear::prepare_static_2d(&base).unwrap().solve_loads(&input.loads)),
            ("dense", linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&input.loads)),
            ("session", LoadSession2D::from_input(base).unwrap().solve_loads(&input.loads)),
            ("pdelta", pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|r| r.linear_results)),
            ("corotational", corotational::solve_corotational_2d(&input, 40, 1e-9, 1, false).map(|r| r.results)),
            ("fiber", solve_fiber_nonlinear_2d(&fiber).map(|r| r.results)),
        ] {
            let r = result.unwrap_or_else(|e| panic!("{entry}: {e}"));
            assert_eq!(r.reactions.iter().find(|r| r.node_id == 3).unwrap().rz, -1.0, "{entry}");
            if let Some(eq) = r.equilibrium {
                assert!(eq.equilibrium_ok, "{entry}: {eq:?}");
                assert_eq!(eq.applied_force_sum[1], 1.0, "{entry}");
            } else { assert_eq!(entry, "corotational"); }
        }
    }
}

#[test]
fn issue_2222_cancelling_nodal_forces_spatial() {
    use dedaliano_engine::{load_session::LoadSession3D, solver::fiber_nonlinear::*};
    for plane in [Plane::XY, Plane::XZ] {
        for cancel in [true, false] {
            let mut planar = cancellation_input();
            if !cancel { planar.loads = vec![planar.loads[1].clone()]; }
            let input = embed_2d(&planar, plane).unwrap();
            let mut base = input.clone();
            base.loads.clear();
            let fiber = FiberNonlinearInput3D { solver: input.clone(), fiber_sections: Default::default(),
                n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
            for (entry, result) in [
                ("linear", linear::solve_3d(&input)),
                ("prepared", linear::prepare_static_3d(&base).unwrap().solve_loads(&input.loads)),
                ("session", LoadSession3D::from_input(base).unwrap().solve_loads(&input.loads)),
                ("pdelta", pdelta::solve_pdelta_3d(&input, 20, 1e-9).map(|r| r.linear_results)),
                ("corotational", corotational::solve_corotational_3d(&input, 40, 1e-9, 1, false).map(|r| r.results)),
                ("fiber", solve_fiber_nonlinear_3d(&fiber).map(|r| r.results)),
            ] {
                let r = result.unwrap_or_else(|e| panic!("{entry}: {e}"));
                let reaction = r.reactions.iter().find(|r| r.node_id == 3).unwrap();
                assert_eq!(if matches!(plane, Plane::XY) { reaction.fy } else { reaction.fz }, -1.0, "{entry}");
                if let Some(eq) = r.equilibrium {
                    assert!(eq.equilibrium_ok, "{entry}: {eq:?}");
                    assert_eq!(eq.applied_force_sum[if matches!(plane, Plane::XY) { 1 } else { 2 }], 1.0, "{entry}");
                } else { assert_eq!(entry, "corotational"); }
            }
        }
    }
}

fn refusal_cases_2222() -> Vec<(f64, f64, bool)> {
    let limit = 3.0e-10_f64;
    vec![
        (0.0, 0.0, false), (1.5, 1.5, false), (3.0, 3.0, false),
        (0.0, limit.next_down(), false), (0.0, limit, true), (0.0, limit.next_up(), true),
        (1.5, 1.5 + 5e-13, false), (1.5, 1.5_f64.next_up(), false), (3.0_f64.next_down(), 3.0, false),
        (0.0, f64::from_bits(1), false), (1.0, 2.0, true), (0.0, 3.0, true),
    ]
}

fn refusal_result_2222(result: Result<(), String>, valid: bool, entry: &str, a: f64, b: f64) {
    if valid {
        result.unwrap_or_else(|e| panic!("{entry}: [{a}, {b}]: {e}"));
    } else {
        let e = result.expect_err(&format!("{entry} accepted [{a}, {b}]"));
        assert!(e.contains("Element 1") && e.contains("interval") && e.contains("geometry limit"), "{entry}: {e}");
        assert!(e.contains(&format!("[{a}, {b}]")), "{entry}: {e}");
    }
}

#[test]
fn issue_2222_refuses_sublimit_planar_entry_points() {
    use dedaliano_engine::{load_session::LoadSession2D, solver::fiber_nonlinear::*};
    for (a, b, valid) in refusal_cases_2222() {
        for axial in [false, true] {
            for ratio in [0.0, 1.0, -1.0] {
                let mut input = witness();
                let q = if b == a || !(1.0 / (b - a)).is_finite() { -7.0 } else { -1.0 / (b - a) };
                input.loads = vec![if axial {
                    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: 1, q_i: q, q_j: q * ratio, a: Some(a), b: Some(b) })
                } else {
                    SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: q, q_j: q * ratio, a: Some(a), b: Some(b) })
                }];
                let mut base = input.clone(); base.loads.clear();
                let typed = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
                let fiber = FiberNonlinearInput { solver: input.clone(), fiber_sections: Default::default(),
                    n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
                for (entry, result) in [
                    ("linear", linear::solve_2d(&input)),
                    ("typed", linear::solve_2d_typed(&typed)),
                    ("prepared", linear::prepare_static_2d(&base).unwrap().solve_loads(&input.loads)),
                    ("dense", linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&input.loads)),
                    ("session", LoadSession2D::from_input(base).unwrap().solve_loads(&input.loads)),
                    ("pdelta", pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|r| r.linear_results)),
                    ("corotational", corotational::solve_corotational_2d(&input, 40, 1e-9, 1, false).map(|r| r.results)),
                    ("fiber", solve_fiber_nonlinear_2d(&fiber).map(|r| r.results)),
                ] {
                    if valid {
                        let r = result.as_ref().unwrap_or_else(|e| panic!("{entry}: {e}"));
                        near(r.reactions.iter().map(|r| if axial { r.rx } else { r.rz }).sum(), (1.0 + ratio) / 2.0);
                    }
                    refusal_result_2222(result.map(|_| ()), valid, entry, a, b);
                }
            }
        }
    }
}

#[test]
fn issue_2222_refuses_sublimit_spatial_entry_points() {
    use dedaliano_engine::{load_session::LoadSession3D, solver::fiber_nonlinear::*};
    for (a, b, valid) in refusal_cases_2222() {
        for plane in [Plane::XY, Plane::XZ] {
            for axial in [false, true] {
                let mut planar = witness();
                let q = if b == a || !(1.0 / (b - a)).is_finite() { -7.0 } else { -1.0 / (b - a) };
                planar.loads = vec![if axial {
                    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: 1, q_i: q, q_j: q, a: Some(a), b: Some(b) })
                } else {
                    SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: q, q_j: q, a: Some(a), b: Some(b) })
                }];
                let input = embed_2d(&planar, plane).unwrap();
                let mut base = input.clone(); base.loads.clear();
                let fiber = FiberNonlinearInput3D { solver: input.clone(), fiber_sections: Default::default(),
                    n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
                for (entry, result) in [
                    ("linear", linear::solve_3d(&input)),
                    ("prepared", linear::prepare_static_3d(&base).unwrap().solve_loads(&input.loads)),
                    ("session", LoadSession3D::from_input(base).unwrap().solve_loads(&input.loads)),
                    ("pdelta", pdelta::solve_pdelta_3d(&input, 20, 1e-9).map(|r| r.linear_results)),
                    ("corotational", corotational::solve_corotational_3d(&input, 40, 1e-9, 1, false).map(|r| r.results)),
                    ("fiber", solve_fiber_nonlinear_3d(&fiber).map(|r| r.results)),
                ] {
                    if valid {
                        let r = result.as_ref().unwrap_or_else(|e| panic!("{entry}: {e}"));
                        near(r.reactions.iter().map(|r| if axial { r.fx } else if matches!(plane, Plane::XY) { r.fy } else { r.fz }).sum(), 1.0);
                    }
                    refusal_result_2222(result.map(|_| ()), valid, entry, a, b);
                }
            }
        }
    }
}

#[test]
fn issue_2222_refuses_sublimit_recovery() {
    use dedaliano_engine::postprocess::diagrams::{recover_member, MemberRecoveryInput};
    for space in ["planar", "spatial"] {
        for (a, b, valid) in refusal_cases_2222() {
            let input: MemberRecoveryInput = serde_json::from_value(serde_json::json!({
                "space":space,"length":3.0,"ei":1000.0,"gas":1700.0,"vI":0.0,"rI":0.0,"vJ":0.0,"rJ":0.0,
                "positions":[0.0,0.25,0.75,1.0],"dist":[{"qI":-2.0,"qJ":-2.0,"a":a,"b":b}]
            })).unwrap();
            let r = recover_member(&input);
            if valid { assert!(r.unwrap().iter().any(|s| s.v != 0.0)); }
            else {
                let e = r.err().expect("recovery accepted a sublimit interval");
                assert!(e.contains("Member recovery") && e.contains("geometry limit") && e.contains(&format!("[{a}, {b}]")), "{e}");
            }
        }
    }
}

#[test]
fn issue_2222_refuses_sublimit_raw_load_kernels_and_diagrams() {
    use dedaliano_engine::{element::*, postprocess::{diagrams::*, diagrams_3d::*}};
    for length in [0.03, 3.0, 300.0] {
        let width = length * 1e-10_f64;
        assert!(std::panic::catch_unwind(|| fef_partial_distributed_2d(-2.0, -2.0, 0.0, width.next_down(), length, 0.7)).is_err());
        for b in [width, width.next_up()] {
            let q = -1.0 / b;
            let f = fef_partial_distributed_2d(q, q, 0.0, b, length, 0.7);
            assert!((f[1] + f[4] + 1.0).abs() < 1e-13);
        }
    }
    let mut input = witness();
    input.loads = vec![SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: -2.0, q_j: -2.0, a: Some(1.0), b: Some(2.0) })];
    let base = linear::solve_2d(&input).unwrap();
    for (a, b, valid) in refusal_cases_2222() {
        for mode in 0..3 {
            let r = std::panic::catch_unwind(|| match mode {
                0 => { fef_partial_distributed_2d(-2.0, -2.0, a, b, 3.0, 0.7); }
                1 => { fef_partial_distributed_3d(-2.0, -2.0, -2.0, -2.0, a, b, 3.0, 0.7, 0.7); }
                _ => { axial_distributed_fef(-2.0, -2.0, a, b, 3.0); }
            });
            assert_eq!(r.is_ok(), valid, "kernel {mode}: [{a}, {b}]");
        }
        let mut ef = base.element_forces[0].clone();
        ef.distributed_loads = vec![DistributedLoadInfo { q_i: -2.0, q_j: -2.0, a, b }];
        assert_eq!(std::panic::catch_unwind(|| compute_diagram_value_at("shear", 0.9, &ef)).is_ok(), valid);
        assert_eq!(std::panic::catch_unwind(|| diagram_positions_2d(&ef, "shear")).is_ok(), valid);
        for plane in [Plane::XY, Plane::XZ] {
            let mut ef = linear::solve_3d(&embed_2d(&input, plane).unwrap()).unwrap().element_forces[0].clone();
            for loads in [&mut ef.distributed_loads_x, &mut ef.distributed_loads_y, &mut ef.distributed_loads_z] {
                *loads = vec![DistributedLoadInfo { q_i: -2.0, q_j: -2.0, a, b }];
            }
            assert_eq!(std::panic::catch_unwind(|| evaluate_diagram_3d_at(&ef, "shearY", 0.9)).is_ok(), valid);
            assert_eq!(std::panic::catch_unwind(|| diagram_positions_3d(&ef, "shearZ")).is_ok(), valid);
        }
    }
}

#[test]
fn issue_2222_kinematics_identifies_only_finite_unsupported_nodal_moments() {
    let mut input = witness();
    input.elements.get_mut("1").unwrap().hinge_end = true;
    input.elements.get_mut("2").unwrap().hinge_start = true;
    input.loads = serde_json::from_value(serde_json::json!([
        {"type":"nodal", "data":{"nodeId":2,"fx":0,"fz":0,"my":1}}
    ])).unwrap();
    let result = serde_json::to_value(dedaliano_engine::solver::kinematic::analyze_kinematics_2d(&input)).unwrap();
    assert_eq!(result["invalidInputKind"], "unsupportedNodalMoment");
    assert_eq!(result["isSolvable"], false);
    for moment in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut bad = input.clone();
        if let SolverLoad::Nodal(n) = &mut bad.loads[0] { n.my = moment; }
        let result = serde_json::to_value(dedaliano_engine::solver::kinematic::analyze_kinematics_2d(&bad)).unwrap();
        assert!(result["invalidInputKind"].is_null(), "{result}");
        assert!(result["invalidInput"].is_string(), "{result}");
    }
    let mut bad = input.clone();
    bad.loads.extend(serde_json::from_value::<Vec<SolverLoad>>(serde_json::json!([
        {"type":"distributed", "data":{"elementId":1,"a":-1,"b":2,"qI":1,"qJ":1}}
    ])).unwrap());
    let result = serde_json::to_value(dedaliano_engine::solver::kinematic::analyze_kinematics_2d(&bad)).unwrap();
    assert!(result["invalidInputKind"].is_null(), "{result}");
    assert!(result["invalidInput"].is_string(), "{result}");
    input.elements.get_mut("1").unwrap().hinge_end = false;
    let result = serde_json::to_value(dedaliano_engine::solver::kinematic::analyze_kinematics_2d(&input)).unwrap();
    assert!(result["invalidInputKind"].is_null(), "{result}");
    assert!(result["invalidInput"].is_null(), "{result}");
    assert_eq!(result["isSolvable"], true);
}

#[test]
fn issue_2222_wind_endpoint_arithmetic_across_solvers() {
    use dedaliano_engine::{load_session::*, solver::fiber_nonlinear::*};
    for (origin, tip, endpoint, overhang, density_safe) in [
        ([1000.1, 0.0], [1004.1, 0.0], 4.0_f64.next_up(), 4.0 + 1e-10, true),
        ([1000.1, 0.0], [1004.1, 0.0], 4.0 + 16.0 * f64::EPSILON, (4.0 + 16.0 * f64::EPSILON).next_up(), true),
        ([-0.665, 0.17], [-0.435, 0.63], 0.5142956348249517, 0.5142956348249517 + 1e-10, true),
        ([0.0, 4.4999812501171865], [0.0, 6.0], 1.500018749882814, 1.500018749882814 + 1e-10, true),
        ([1000.1, 0.0], [1004.1, 0.0], 4.0_f64.next_up(), 4.0 + 1e-10, false),
    ] {
        for b in [endpoint, overhang] {
            for axial in [false, true] {
                let mut input = witness();
                input.materials.values_mut().next().unwrap().e = 200_000.0;
                let delta = [tip[0] - origin[0], tip[1] - origin[1]];
                for node in input.nodes.values_mut() {
                    node.x = origin[0] + (node.id - 1) as f64 * delta[0];
                    node.z = origin[1] + (node.id - 1) as f64 * delta[1];
                }
                let length = (delta[0] * delta[0] + delta[1] * delta[1]).sqrt();
                let a = b * 0.2;
                let (q_i, q_j) = if density_safe { (-2.0, -4.0) } else { let q = 1.5 * 2.0_f64.powi(53); (q, -q + 2.0) };
                input.loads = vec![if axial {
                    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: 1, q_i, q_j, a: Some(a), b: Some(b) })
                } else {
                    SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i, q_j, a: Some(a), b: Some(b) })
                }];
                let mut base = input.clone(); base.loads.clear();
                let fiber = FiberNonlinearInput { solver: input.clone(), fiber_sections: Default::default(), n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
                for (entry, result) in [
                    ("linear", linear::solve_2d(&input)),
                    ("typed", linear::solve_2d_typed(&serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap())),
                    ("prepared", linear::prepare_static_2d(&base).unwrap().solve_loads(&input.loads)),
                    ("dense", linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&input.loads)),
                    ("session", LoadSession2D::from_input(base.clone()).unwrap().solve_loads(&input.loads)),
                    ("pdelta", pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|r| r.results)),
                    ("corotational", corotational::solve_corotational_2d(&input, 40, 1e-12, 1, false).map(|r| r.results)),
                    ("fiber", solve_fiber_nonlinear_2d(&fiber).map(|r| r.results)),
                ] {
                    if b != endpoint || !density_safe {
                        assert!(result.expect_err(&format!("{entry} accepted {b}")).contains("invalid distributed load interval"));
                        continue;
                    }
                    let r = result.unwrap_or_else(|e| panic!("{entry}: {e}"));
                    let f = -3.0 * (b - a);
                    let expected = if axial { [f * delta[0] / length, f * delta[1] / length] } else { [-f * delta[1] / length, f * delta[0] / length] };
                    near(r.reactions.iter().map(|r| r.rx).sum(), -expected[0]);
                    near(r.reactions.iter().map(|r| r.rz).sum(), -expected[1]);
                }
                for plane in [Plane::XY, Plane::XZ] {
                    let spatial = embed_2d(&input, plane).unwrap();
                    let mut base = spatial.clone(); base.loads.clear();
                    let fiber = FiberNonlinearInput3D { solver: spatial.clone(), fiber_sections: Default::default(), n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
                    for (entry, result) in [
                        ("linear", linear::solve_3d(&spatial)),
                        ("prepared", linear::prepare_static_3d(&base).unwrap().solve_loads(&spatial.loads)),
                        ("session", LoadSession3D::from_input(base.clone()).unwrap().solve_loads(&spatial.loads)),
                        ("pdelta", pdelta::solve_pdelta_3d(&spatial, 20, 1e-9).map(|r| r.results)),
                        ("corotational", corotational::solve_corotational_3d(&spatial, 40, 1e-12, 1, false).map(|r| r.results)),
                        ("fiber", solve_fiber_nonlinear_3d(&fiber).map(|r| r.results)),
                    ] {
                        if b != endpoint || !density_safe {
                            assert!(result.expect_err(&format!("3D {entry} accepted {b}")).contains("invalid distributed load interval"));
                            continue;
                        }
                        let r = result.unwrap_or_else(|e| panic!("3D {entry}: {e}"));
                        let sum = r.reactions.iter().fold([0.0; 3], |s, r| [s[0] + r.fx, s[1] + r.fy, s[2] + r.fz]);
                        near(sum.iter().map(|f| f * f).sum::<f64>().sqrt(), 3.0 * (b - a));
                    }
                }
            }
        }
    }
}

#[test]
fn issue_2223_translated_decimal_endpoint_across_solvers() {
    use dedaliano_engine::{load_session::*, solver::fiber_nonlinear::*};
    for angle in [0.0_f64, 0.37, -0.37] {
    for axial in [false, true] {
        for b in [0.2_f64.next_down(), 0.2, 0.2_f64.next_up()] {
            let mut input = witness();
            input.materials.values_mut().next().unwrap().e = 200_000.0;
            for node in input.nodes.values_mut() {
                let station = if node.id == 2 { 0.6 } else { 0.4 + (node.id - 1) as f64 * (0.6 - 0.4) };
                node.x = station * angle.cos(); node.z = station * angle.sin();
            }
            input.loads = vec![if axial {
                SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: 1, q_i: -2.0, q_j: -4.0, a: Some(0.0), b: Some(b) })
            } else {
                SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: -2.0, q_j: -4.0, a: Some(0.0), b: Some(b) })
            }];
            let mut base = input.clone(); base.loads.clear();
            let fiber = FiberNonlinearInput { solver: input.clone(), fiber_sections: Default::default(), n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
            for (entry, result) in [
                ("linear", linear::solve_2d(&input)),
                ("typed", linear::solve_2d_typed(&serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap())),
                ("prepared", linear::prepare_static_2d(&base).unwrap().solve_loads(&input.loads)),
                ("dense", linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&input.loads)),
                ("session", LoadSession2D::from_input(base.clone()).unwrap().solve_loads(&input.loads)),
                ("pdelta", pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|r| r.results)),
                ("corotational", corotational::solve_corotational_2d(&input, 40, 1e-12, 1, false).map(|r| r.results)),
                ("fiber", solve_fiber_nonlinear_2d(&fiber).map(|r| r.results)),
            ] {
                if b > 0.2 { assert!(result.expect_err(entry).contains("invalid distributed load interval")); }
                else { let r = result.unwrap_or_else(|e| panic!("{entry}: {e}")); near(r.reactions.iter().map(|r| r.rx).sum::<f64>().hypot(r.reactions.iter().map(|r| r.rz).sum()), 3.0 * b); }
            }
            for plane in [Plane::XY, Plane::XZ] {
                let spatial = embed_2d(&input, plane).unwrap();
                let mut base = spatial.clone(); base.loads.clear();
                let fiber = FiberNonlinearInput3D { solver: spatial.clone(), fiber_sections: Default::default(), n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
                for (entry, result) in [
                    ("linear", linear::solve_3d(&spatial)),
                    ("prepared", linear::prepare_static_3d(&base).unwrap().solve_loads(&spatial.loads)),
                    ("session", LoadSession3D::from_input(base.clone()).unwrap().solve_loads(&spatial.loads)),
                    ("pdelta", pdelta::solve_pdelta_3d(&spatial, 20, 1e-9).map(|r| r.results)),
                    ("corotational", corotational::solve_corotational_3d(&spatial, 40, 1e-12, 1, false).map(|r| r.results)),
                    ("fiber", solve_fiber_nonlinear_3d(&fiber).map(|r| r.results)),
                ] {
                    if b > 0.2 { assert!(result.expect_err(entry).contains("invalid distributed load interval")); }
                    else { let r = result.unwrap_or_else(|e| panic!("{entry}: {e}")); let sums = r.reactions.iter().fold([0.0; 3], |s, r| [s[0] + r.fx, s[1] + r.fy, s[2] + r.fz]); near(sums[0].hypot(sums[1]).hypot(sums[2]), 3.0 * b); }
                }
            }
        }
    }
}
}

#[test]
fn issue_2223_large_intensity_saved_diagrams_keep_unloaded_stations_zero() {
    use dedaliano_engine::postprocess::{diagrams::*, diagrams_3d::*};
    let mut input = witness();
    input.loads.clear();
    let a = 2.0_f64.powi(-20);
    let b = a + 2.0_f64.powi(-28);
    let q = 2.0_f64.powi(1000);
    let load = DistributedLoadInfo { q_i: 0.0, q_j: q, a, b };
    let fiber = dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearInput {
        solver: input.clone(),
        fiber_sections: Default::default(),
        n_integration_points: 5,
        max_iter: 40,
        tolerance: 1e-9,
        n_increments: 1,
        modified_nr: false,
    };
    for mut result in [
        linear::solve_2d(&input),
        linear::solve_2d_typed(&serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap()),
        linear::prepare_static_2d_dense_reference(&input).unwrap().solve_loads(&[]),
        linear::prepare_static_2d(&input).unwrap().solve_loads(&[]),
        dedaliano_engine::load_session::LoadSession2D::from_input(input.clone())
            .unwrap()
            .solve_loads(&[]),
        pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|r| r.results),
        corotational::solve_corotational_2d(&input, 40, 1e-12, 1, false).map(|r| r.results),
        dedaliano_engine::solver::fiber_nonlinear::solve_fiber_nonlinear_2d(&fiber).map(|r| r.results),
    ]
    .map(Result::unwrap)
    {
        let ef = &mut result.element_forces[0];
        ef.distributed_loads = vec![load.clone()];
        let section =
            serde_json::json!({"elementForces": ef, "section": {"shape": "rect", "a": 1, "iy": 1, "iz": 1, "h": 1, "b": 1}, "t": 0});
        let stress = dedaliano_engine::postprocess::section_stress::compute_section_stress_2d(&serde_json::from_value(section).unwrap());
        assert_eq!((stress.v, stress.m), (0.0, 0.0));
        for kind in ["shear", "moment"] {
            for x in [0.0, a / 2.0, a] {
                assert_eq!(compute_diagram_value_at(kind, x / ef.length, ef), 0.0);
                assert_eq!(compute_diagram_value_at_sorted(kind, x / ef.length, ef, &[]), 0.0);
            }
        }
        let diagrams = compute_diagrams_2d(&input, &result);
        for diagram in diagrams.shear.iter().chain(&diagrams.moment) {
            assert!(diagram.points.iter().all(|p| p.value.is_finite()));
        }
        let request = serde_json::json!({
            "members": [{"elementId": 1, "materialId": 1, "sectionId": 1, "length": 3.0}],
            "combinations": [{"comboId": 1, "results": result}], "numStations": 3
        });
        let stations =
            dedaliano_engine::postprocess::beam_stations::extract_beam_stations(&serde_json::from_value(request.clone()).unwrap());
        assert_eq!(
            (stations.stations[0].combo_forces[0].v, stations.stations[0].combo_forces[0].m),
            (0.0, 0.0)
        );
        let grouped =
            dedaliano_engine::postprocess::beam_stations::extract_beam_stations_grouped(&serde_json::from_value(request).unwrap());
        assert_eq!(grouped.members[0].stations[0].combo_forces[0].v, 0.0);
        let envelope = dedaliano_engine::postprocess::combinations::compute_envelope(&[result]).unwrap();
        assert_eq!(envelope.shear.elements[0].pos_values[0], 0.0);
        assert_eq!(envelope.moment.elements[0].neg_values[0], 0.0);
    }
    for plane in [Plane::XY, Plane::XZ] {
        let spatial = embed_2d(&input, plane).unwrap();
        let fiber = dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearInput3D {
            solver: spatial.clone(),
            fiber_sections: Default::default(),
            n_integration_points: 5,
            max_iter: 40,
            tolerance: 1e-9,
            n_increments: 1,
            modified_nr: false,
        };
        for mut result in [
            linear::solve_3d(&spatial),
            linear::prepare_static_3d(&spatial).unwrap().solve_loads(&[]),
            dedaliano_engine::load_session::LoadSession3D::from_input(spatial.clone())
                .unwrap()
                .solve_loads(&[]),
            pdelta::solve_pdelta_3d(&spatial, 20, 1e-9).map(|r| r.results),
            corotational::solve_corotational_3d(&spatial, 40, 1e-12, 1, false).map(|r| r.results),
            dedaliano_engine::solver::fiber_nonlinear::solve_fiber_nonlinear_3d(&fiber).map(|r| r.results),
        ]
        .map(Result::unwrap)
        {
            let ef = &mut result.element_forces[0];
            ef.distributed_loads_y = vec![load.clone()];
            ef.distributed_loads_z = vec![load.clone()];
            let section =
                serde_json::json!({"elementForces": ef, "section": {"shape": "rect", "a": 1, "iy": 1, "iz": 1, "h": 1, "b": 1}, "t": 0});
            let stress =
                dedaliano_engine::postprocess::section_stress_3d::compute_section_stress_3d(&serde_json::from_value(section).unwrap());
            assert_eq!((stress.vy, stress.vz, stress.my, stress.mz), (0.0, 0.0, 0.0, 0.0));
            let buffer = dedaliano_engine::postprocess::station_buffer::extract(
                &serde_json::from_value(serde_json::json!({
                    "members": [{"elementId": 1, "length": 3}],
                    "combinations": [{"comboId": 1, "elementForces": [ef]}], "numStations": 3
                }))
                .unwrap(),
            );
            assert!(buffer.iter().all(|v| v.is_finite()));
            assert_eq!(&buffer[7..13], &[0.0; 6]);
            for kind in ["shearY", "shearZ", "momentY", "momentZ"] {
                for x in [0.0, a / 2.0, a] {
                    assert_eq!(evaluate_diagram_3d_at(ef, kind, x / ef.length), 0.0);
                }
            }
            let diagrams = compute_diagrams_3d(&result);
            for diagram in diagrams
                .shear_y
                .iter()
                .chain(&diagrams.shear_z)
                .chain(&diagrams.moment_y)
                .chain(&diagrams.moment_z)
            {
                assert!(diagram.points.iter().all(|p| p.value.is_finite()));
            }
            let request = serde_json::json!({
                "members": [{"elementId": 1, "materialId": 1, "sectionId": 1, "length": 3.0}],
                "combinations": [{"comboId": 1, "results": result}], "numStations": 3
            });
            let stations =
                dedaliano_engine::postprocess::beam_stations::extract_beam_stations_3d(&serde_json::from_value(request.clone()).unwrap());
            assert_eq!(
                (stations.stations[0].combo_forces[0].vy, stations.stations[0].combo_forces[0].vz),
                (0.0, 0.0)
            );
            let grouped =
                dedaliano_engine::postprocess::beam_stations::extract_beam_stations_grouped_3d(&serde_json::from_value(request).unwrap());
            assert_eq!(grouped.members[0].stations[0].combo_forces[0].mz, 0.0);
            let envelope = dedaliano_engine::postprocess::combinations::compute_envelope_3d(&[result]).unwrap();
            assert_eq!(envelope.shear_y.elements[0].pos_values[0], 0.0);
            assert_eq!(envelope.moment_z.elements[0].neg_values[0], 0.0);
        }
    }
}
