use dedaliano_engine::solver::{
    arc_length::{
        solve_arc_length, solve_arc_length_from, solve_displacement_control, ArcLengthInput,
        ArcLengthResult, DisplacementControlInput,
    },
    corotational::{
        solve_corotational_2d, solve_corotational_2d_from, solve_corotational_3d,
        CorotationalStart2D,
    },
    linear::solve_3d,
};
use dedaliano_engine::types::{SolverInput, SolverInput3D, SolverLoad, SolverLoad3D};

fn two_bar(rise: f64, e: f64, radius: f64, max_steps: usize, max_iter: usize) -> ArcLengthInput {
    let mut solver: SolverInput = serde_json::from_str(include_str!(
        "../../../scripts/tests/fixtures/experimental-nonlinear-two-bar.json"
    ))
    .unwrap();
    solver.nodes.get_mut("2").unwrap().z = rise;
    solver.materials.get_mut("1").unwrap().e = e;
    ArcLengthInput {
        solver,
        max_steps,
        max_iter,
        tolerance: 1e-8,
        initial_ds: radius,
        min_ds: radius,
        max_ds: radius,
        target_iter: 5,
    }
}

fn arc_runs(input: &ArcLengthInput) -> [ArcLengthResult; 2] {
    let mut zero = input.solver.clone();
    zero.loads.clear();
    let initial = solve_corotational_2d(&zero, 20, input.tolerance, 1, false).unwrap();
    assert!(initial.converged);
    let start = CorotationalStart2D {
        input: &zero,
        displacements: &initial.results.displacements,
    };
    [
        solve_arc_length(input).unwrap(),
        solve_arc_length_from(input, Some(&start)).unwrap(),
    ]
}

#[test]
fn accepted_steps_stay_on_the_requested_sphere() {
    let input = two_bar(2.0, 0.01, 3.0, 2, 20);
    for result in arc_runs(&input) {
        assert!(!result.steps.is_empty());
        let (mut previous_u, mut previous_load) = (0.0, 0.0);
        for step in &result.steps {
            let radius =
                (step.control_displacement - previous_u).hypot(step.load_factor - previous_load);
            assert!(
                (radius / input.initial_ds - 1.0).abs() <= input.tolerance,
                "radius {radius}"
            );
            previous_u = step.control_displacement;
            previous_load = step.load_factor;
        }
        assert!(!result.converged && result.steps.len() == 1);
    }
    let mut retry = input;
    retry.min_ds *= 0.5;
    for result in arc_runs(&retry) {
        assert!(result.converged);
        assert_eq!(result.steps.len(), retry.max_steps);
        let first = &result.steps[0];
        let second = &result.steps[1];
        let radius = (second.control_displacement - first.control_displacement)
            .hypot(second.load_factor - first.load_factor);
        assert!(
            (radius / retry.min_ds - 1.0).abs() <= retry.tolerance,
            "radius {radius}"
        );
    }
}

#[test]
fn path_follows_the_fold_without_retracing() {
    let mut input = two_bar(1.0, 0.01, 0.25, 9, 20);
    let SolverLoad::Nodal(load) = &mut input.solver.loads[0] else {
        unreachable!()
    };
    load.fz = -0.1;
    for result in arc_runs(&input) {
        assert!(result.converged);
        assert_eq!(result.steps.len(), input.max_steps);
        for (index, pair) in result.steps.windows(2).enumerate() {
            assert!(
                pair[1].control_displacement < pair[0].control_displacement,
                "path reversed at step {}",
                index + 2
            );
        }
        assert!(result.steps[8].load_factor < result.steps[7].load_factor);
    }
}

#[test]
fn failed_trial_returns_the_exact_accepted_state() {
    let input = two_bar(0.5, 0.001, 0.25, 5, 3);
    for result in arc_runs(&input) {
        assert!(!result.converged);
        let last = result.steps.last().unwrap();
        assert_eq!(result.final_load_factor, last.load_factor);
        assert_eq!(
            result.results.displacements[1].uz,
            last.control_displacement
        );
    }
}

fn axial_spring(force: f64) -> SolverInput {
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0, "z": 0}},
        "elements": {}, "materials": {}, "sections": {},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "spring", "kx": 1, "ky": 1}},
        "loads": [{"type": "nodal", "data": {"nodeId": 1, "fx": force, "fz": 0, "my": 0}}]
    }))
    .unwrap()
}

#[test]
fn warm_start_uses_the_exact_target_force() {
    for (base, target) in [
        (1.0, 0.0),
        (1.0, 0.25),
        (2f64.powi(54), 1.0),
        (1.0, 1e-20),
        (1.0, -1e-20),
    ] {
        let first = axial_spring(base);
        let input = axial_spring(target);
        let initial = solve_corotational_2d(&first, 20, 1e-8, 1, false).unwrap();
        assert!(initial.converged);
        assert_eq!(initial.results.displacements[0].ux, base);
        let start = CorotationalStart2D {
            input: &first,
            displacements: &initial.results.displacements,
        };
        for modified in [false, true] {
            let result =
                solve_corotational_2d_from(&input, Some(&start), 20, 1e-8, 1, modified).unwrap();
            assert!(result.converged);
            assert_eq!(result.load_factor, 1.0);
            assert_eq!(result.results.displacements[0].ux, target);
        }
    }
}

fn frame() -> SolverInput {
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 100, "z": 0}, "2": {"id": 2, "x": 106, "z": 0}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "materials": {"1": {"id": 1, "e": 200, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 0.0001}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": []
    })).unwrap()
}

#[test]
fn warm_start_assigns_the_exact_target_support_position() {
    let mut first = frame();
    first.supports.insert(
        "2".into(),
        serde_json::from_value(serde_json::json!({
            "id": 2, "nodeId": 2, "type": "pinned", "dx": 1.0
        }))
        .unwrap(),
    );
    let initial = solve_corotational_2d(&first, 20, 1e-8, 1, false).unwrap();
    assert!(initial.converged);
    assert_eq!(initial.results.displacements[1].ux, 1.0);
    let start = CorotationalStart2D {
        input: &first,
        displacements: &initial.results.displacements,
    };
    for target in [0.0, 0.25, 1e-20, -1e-20] {
        let mut input = first.clone();
        input.supports.get_mut("2").unwrap().dx = Some(target);
        for modified in [false, true] {
            let result =
                solve_corotational_2d_from(&input, Some(&start), 20, 1e-8, 1, modified).unwrap();
            assert!(result.converged);
            assert_eq!(result.load_factor, 1.0);
            assert_eq!(result.results.displacements[1].ux, target);
        }
    }
}

#[test]
fn curved_frames_use_the_shear_centre_gate_in_both_iteration_modes() {
    let mut input: SolverInput3D = serde_json::from_str(include_str!(
        "../metamorphic_corpus/feature_matrix/3d-curved-beam-arch-with.json"
    ))
    .unwrap();
    assert!(input.elements.is_empty());
    input.curved_beams[0].num_segments = 4;
    for load in &mut input.loads {
        if let SolverLoad3D::Nodal(load) = load {
            load.fx *= 0.01;
            load.fy *= 0.01;
            load.fz *= 0.01;
        }
    }
    input.sections.get_mut("6").unwrap().shear_center_y = Some(0.01);
    for (y, z) in [
        (None, None),
        (Some(0.0), Some(-0.0)),
        (Some(-0.01), None),
        (None, Some(0.01)),
    ] {
        let section = input.sections.get_mut("1").unwrap();
        section.shear_center_y = y;
        section.shear_center_z = z;
        assert!(solve_3d(&input).is_ok());
        for modified in [false, true] {
            let result = solve_corotational_3d(&input, 30, 1e-8, 2, modified);
            if y.unwrap_or(0.0) != 0.0 || z.unwrap_or(0.0) != 0.0 {
                assert!(result
                    .unwrap_err()
                    .contains("shear-centre offset (section 1)"));
            } else {
                assert!(result.unwrap().converged);
            }
        }
    }
}

fn member_loads() -> [SolverInput; 2] {
    let mut raw = frame();
    let b = 6.0_f64.next_up();
    let scale = b / 6.0;
    raw.loads = vec![serde_json::from_value(serde_json::json!({
        "type": "axialDistributed", "data": {"elementId": 1, "qI": 0.25, "qJ": 0.19, "a": 0.5, "b": b}
    })).unwrap()];
    let mut canonical = raw.clone();
    canonical.loads = vec![serde_json::from_value(serde_json::json!({
        "type": "axialDistributed", "data": {"elementId": 1, "qI": 0.25 * scale, "qJ": 0.19 * scale, "a": 0.5 / scale}
    })).unwrap()];
    [raw, canonical]
}

#[test]
fn arc_length_recovers_the_same_member_load_pattern_it_solves() {
    let [raw, canonical] = member_loads();
    let arc = |solver| ArcLengthInput {
        solver,
        ..two_bar(2.0, 0.01, 0.003, 2, 20)
    };
    let initial = solve_corotational_2d(&canonical, 20, 1e-8, 2, false).unwrap();
    assert!(initial.converged);
    for warm in [false, true] {
        let solve = |solver: SolverInput| {
            let start = CorotationalStart2D {
                input: &solver,
                displacements: &initial.results.displacements,
            };
            let result =
                solve_arc_length_from(&arc(solver.clone()), warm.then_some(&start)).unwrap();
            assert!(result.converged && result.final_load_factor > 0.0);
            serde_json::to_value(result).unwrap()
        };
        assert_eq!(solve(raw.clone()), solve(canonical.clone()));
    }
}

#[test]
fn displacement_control_recovers_the_same_member_load_pattern_it_solves() {
    let solve = |solver| {
        let result = solve_displacement_control(&DisplacementControlInput {
            solver,
            control_node: 2,
            control_dof: 0,
            target_displacement: 0.02,
            n_steps: 2,
            max_iter: 20,
            tolerance: 1e-8,
        })
        .unwrap();
        assert!(result.converged && result.final_load_factor > 0.0);
        serde_json::to_value(result).unwrap()
    };
    let [raw, canonical] = member_loads();
    assert_eq!(solve(raw), solve(canonical));
}
