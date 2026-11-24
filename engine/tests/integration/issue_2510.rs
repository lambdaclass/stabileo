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

fn tied_springs() -> SolverInput {
    serde_json::from_str(include_str!(
        "../../../scripts/tests/fixtures/arc-tied-springs.json"
    ))
    .unwrap()
}

#[test]
fn review_2539_arc_tie_is_rebuilt_from_each_absolute_support_position() {
    let mut base = tied_springs();
    base.supports.get_mut("1").unwrap().dx = Some(2f64.powi(54));
    base.loads.clear();
    let initial = solve_corotational_2d(&base, 20, 1e-8, 1, false).unwrap();
    assert!(initial.converged);
    let start = CorotationalStart2D {
        input: &base,
        displacements: &initial.results.displacements,
    };

    let mut input = two_bar(1.0, 1.0, 2f64.sqrt(), 5, 80);
    input.solver = tied_springs();
    input.solver.supports.get_mut("1").unwrap().dx = Some(1.0);
    for start in [Some(&start), None] {
        let result = solve_arc_length_from(&input, start).unwrap();
        assert!(!result.steps.is_empty());
        for (step, state) in result
            .steps
            .iter()
            .map(|s| (s.step, &s.displacements))
            .chain([(result.steps.len(), &result.results.displacements)])
        {
            assert_eq!(state[1].ux, state[0].ux, "step {step}");
        }
        if start.is_none() {
            assert!(result.converged);
        }
    }
}

#[test]
fn review_2539_partial_warm_start_recovers_the_load_it_solved() {
    let large = 2f64.powi(54);
    let mut base = tied_springs();
    base.constraints.clear();
    base.supports.get_mut("1").unwrap().dx = Some(large);
    base.supports.get_mut("2").unwrap().kx = Some(3.0);
    base.loads = serde_json::from_value(serde_json::json!([
        {"type":"nodal","data":{"nodeId":1,"fx":large,"fz":0,"my":0}},
        {"type":"nodal","data":{"nodeId":2,"fx":large-2.0,"fz":0,"my":0}},
        {"type":"nodal","data":{"nodeId":3,"fx":large,"fz":0,"my":0}}
    ]))
    .unwrap();
    let mut target = base.clone();
    target.supports.get_mut("1").unwrap().dx = Some(2.0 - large);
    for (load, force) in target
        .loads
        .iter_mut()
        .zip([2.0 - large, 2.0 - large, 2.0 - large])
    {
        let SolverLoad::Nodal(load) = load else {
            unreachable!()
        };
        load.fx = force;
    }
    let initial = solve_corotational_2d(&base, 20, 1e-8, 1, false).unwrap();
    assert!(initial.converged);
    let start = CorotationalStart2D {
        input: &base,
        displacements: &initial.results.displacements,
    };
    let check = |result: dedaliano_engine::types::CorotationalResult| {
        assert!(!result.converged);
        assert_eq!(result.load_factor, 0.5);
        assert_eq!(result.results.displacements[2].ux, 1.0);
        assert_eq!(result.results.displacements[0].ux, 1.0);
        assert_eq!(
            result
                .results
                .reactions
                .iter()
                .find(|r| r.node_id == 1)
                .unwrap()
                .rx,
            -1.0
        );
    };
    for modified in [false, true] {
        check(solve_corotational_2d_from(&target, Some(&start), 6, 1e-20, 2, modified).unwrap());
    }
    #[cfg(feature = "experimental-nonlinear")]
    {
        use dedaliano_engine::solver::experimental_nonlinear::{
            solve_corotational_2d_by, solve_corotational_2d_stepped, IterationMethod, LoadStepping,
        };
        for method in [IterationMethod::Newton, IterationMethod::ModifiedNewton] {
            check(solve_corotational_2d_by(&target, Some(&start), 6, 1e-20, 2, method).unwrap());
            check(
                solve_corotational_2d_stepped(
                    &target,
                    Some(&start),
                    6,
                    1e-20,
                    2,
                    method,
                    LoadStepping::Equal,
                )
                .unwrap(),
            );
        }
    }
}

#[test]
fn review_2539_arc_requires_finite_ordered_controls() {
    let base = two_bar(1.0, 0.01, 0.25, 1, 20);
    for (initial_ds, min_ds, max_ds, tolerance) in [
        (0.125, 0.25, 0.5, base.tolerance),
        (0.5, 0.125, 0.25, base.tolerance),
        (0.25, 0.0, 0.5, base.tolerance),
        (0.25, 0.5, 0.125, base.tolerance),
        (0.25, 0.125, f64::INFINITY, base.tolerance),
        (f64::NAN, 0.125, 0.5, base.tolerance),
        (0.25, 0.125, 0.5, f64::INFINITY),
        (0.25, 0.125, 0.5, 0.0),
    ] {
        let input = ArcLengthInput {
            solver: base.solver.clone(),
            initial_ds,
            min_ds,
            max_ds,
            tolerance,
            ..base
        };
        assert!(solve_arc_length(&input).is_err(), "{input:?}");
        assert!(solve_arc_length_from(&input, None).is_err(), "{input:?}");
    }
    for initial_ds in [0.125, 0.25] {
        let input = ArcLengthInput {
            solver: base.solver.clone(),
            initial_ds,
            min_ds: 0.125,
            max_ds: 0.25,
            ..base
        };
        assert!(solve_arc_length(&input).unwrap().converged);
    }
}

#[test]
fn displacement_control_matches_the_axial_bar_equilibrium() {
    let solver = serde_json::from_str(include_str!(
        "../../../scripts/tests/fixtures/displacement-control-axial.json"
    ))
    .unwrap();
    let input = DisplacementControlInput {
        solver,
        control_node: 2,
        control_dof: 0,
        target_displacement: 0.5,
        n_steps: 2,
        max_iter: 20,
        tolerance: 1e-8,
    };
    let check = |result: dedaliano_engine::solver::arc_length::DisplacementControlResult| {
        assert!(result.converged);
        assert_eq!(result.steps.len(), input.n_steps);
        for (index, step) in result.steps.iter().enumerate() {
            let displacement = (index + 1) as f64 * 0.25;
            assert!(step.converged);
            assert_eq!(step.control_displacement, displacement);
            assert_eq!(step.load_factor, displacement / 2.0);
        }
        assert_eq!(result.final_load_factor, 0.25);
        assert_eq!(result.results.displacements[1].ux, 0.5);
        assert_eq!(result.results.reactions[0].rx, -0.5);
        let force = &result.results.element_forces[0];
        assert_eq!(force.n_start, 0.5);
        assert_eq!(force.n_end, 0.5);
    };
    check(solve_displacement_control(&input).unwrap());
    #[cfg(feature = "experimental-nonlinear")]
    check(dedaliano_engine::solver::experimental_nonlinear::solve_displacement_control(&input).unwrap());
}


fn round_two_tied_springs() -> SolverInput {
    serde_json::from_str(include_str!("../../../scripts/tests/fixtures/arc-tied-springs.json"))
        .unwrap()
}

#[test]
#[ignore = "known wrong result: #2510"]
fn review_round_two_cold_corotation_reconstructs_a_scaled_tie() {
    let mut input = round_two_tied_springs();
    input.constraints = serde_json::from_value(serde_json::json!([{
        "type": "linearMPC",
        "terms": [
            {"nodeId": 2, "dof": 0, "coefficient": 1},
            {"nodeId": 1, "dof": 0, "coefficient": -3}
        ]
    }])).unwrap();
    input.supports.get_mut("1").unwrap().dx = Some(0.1);
    for increments in [1, 7] {
        for modified in [false, true] {
            let result = solve_corotational_2d(&input, 20, 1e-8, increments, modified).unwrap();
            assert!(result.converged);
            let displacements = &result.results.displacements;
            assert_eq!(displacements[0].ux, 0.1);
            assert_eq!(displacements[1].ux, 3.0 * displacements[0].ux);
            assert_eq!(displacements[2].ux, 1.0);
        }
    }
}

#[test]
#[ignore = "known wrong result: #2510"]
fn review_round_two_warm_corotation_preserves_the_absolute_tie() {
    let mut first = round_two_tied_springs();
    first.supports.get_mut("1").unwrap().dx = Some(1.0);
    let initial = solve_corotational_2d(&first, 20, 1e-8, 1, false).unwrap();
    assert!(initial.converged);
    assert_eq!(initial.results.displacements[0].ux, 1.0);
    assert_eq!(initial.results.displacements[1].ux, 1.0);
    let start = CorotationalStart2D {
        input: &first,
        displacements: &initial.results.displacements,
    };
    for target in [0.25, 0.0, 1e-20, -1e-20] {
        let mut input = first.clone();
        input.supports.get_mut("1").unwrap().dx = Some(target);
        for modified in [false, true] {
            let result =
                solve_corotational_2d_from(&input, Some(&start), 20, 1e-8, 1, modified).unwrap();
            assert!(result.converged);
            let displacements = &result.results.displacements;
            assert_eq!((displacements[0].ux, displacements[1].ux), (target, target));
            assert_eq!(displacements[2].ux, 1.0);
        }
    }
}

fn round_two_cancelling_loads(node_id: usize) -> [SolverLoad; 2] {
    let b = 3.0 * 2f64.powi(51);
    [b + 3.0, -(b + 2.0)].map(|fx| {
        SolverLoad::Nodal(dedaliano_engine::types::SolverNodalLoad {
            node_id,
            fx,
            fz: 0.0,
            my: 0.0,
        })
    })
}

#[test]
#[ignore = "known wrong result: #2510"]
fn review_round_two_warm_corotation_keeps_a_constant_resultant_at_every_increment() {
    let mut input = axial_spring(1.0);
    let initial = solve_corotational_2d(&input, 20, 1e-8, 1, false).unwrap();
    assert!(initial.converged);
    assert_eq!(initial.results.displacements[0].ux, 1.0);
    input.loads = round_two_cancelling_loads(1).to_vec();
    let start = CorotationalStart2D {
        input: &input,
        displacements: &initial.results.displacements,
    };
    for modified in [false, true] {
        let result =
            solve_corotational_2d_from(&input, Some(&start), 1, 1e-8, 4, modified).unwrap();
        assert!(result.converged, "stopped at {}", result.load_factor);
        assert_eq!(result.load_factor, 1.0);
        assert_eq!(result.results.displacements[0].ux, 1.0);
    }
}

fn round_two_axial_cancellation() -> SolverInput {
    let mut solver: SolverInput = serde_json::from_str(include_str!(
        "../../../scripts/tests/fixtures/displacement-control-axial.json"
    )).unwrap();
    let SolverLoad::Nodal(load) = &mut solver.loads[0] else { unreachable!() };
    load.fx = 1.0;
    solver.loads.extend(round_two_cancelling_loads(1));
    solver
}

#[test]
#[ignore = "known wrong result: #2510"]
fn review_round_two_arc_recovers_the_scaled_exact_resultant() {
    for factor in [0.5, 0.75, 1.0] {
        let radius = factor * std::f64::consts::SQRT_2;
        let input = ArcLengthInput {
            solver: round_two_axial_cancellation(),
            max_steps: 1,
            max_iter: 20,
            tolerance: 1e-8,
            initial_ds: radius,
            min_ds: radius,
            max_ds: radius,
            target_iter: 5,
        };
        for result in arc_runs(&input) {
            assert!(result.converged);
            assert_eq!(result.final_load_factor, factor);
            assert_eq!(result.results.displacements[1].ux, factor);
            assert_eq!(result.results.reactions[0].rx, -2.0 * factor);
        }
    }
}

#[test]
#[ignore = "known wrong result: #2510"]
fn review_round_two_displacement_control_recovers_the_scaled_exact_resultant() {
    for factor in [0.5, 0.75, 1.0] {
        let input = DisplacementControlInput {
            solver: round_two_axial_cancellation(),
            control_node: 2,
            control_dof: 0,
            target_displacement: factor,
            n_steps: 1,
            max_iter: 20,
            tolerance: 1e-8,
        };
        let result = solve_displacement_control(&input).unwrap();
        assert!(result.converged);
        assert_eq!(result.final_load_factor, factor);
        assert_eq!(result.results.reactions[0].rx, -2.0 * factor);
    }
}

#[test]
#[ignore = "known wrong result: #2510"]
fn review_round_two_public_arc_rejects_a_backwards_corrector() {
    let mut input = two_bar(0.5, 0.01, 0.375, 1, 30);
    let first = arc_runs(&input);
    input.max_steps = 2;
    for (first, fixed) in first.iter().zip(arc_runs(&input)) {
        assert!(first.converged);
        assert!(!fixed.converged);
        assert_eq!(fixed.steps.len(), 1);
        assert_eq!(fixed.final_load_factor, first.final_load_factor);
        assert_eq!(fixed.steps[0].control_displacement, first.steps[0].control_displacement);
        assert_eq!(fixed.results.displacements[1].uz, first.steps[0].control_displacement);
    }

    input.min_ds = 0.1875;
    for (first, retried) in first.iter().zip(arc_runs(&input)) {
        assert!(retried.converged);
        assert_eq!(retried.steps.len(), 2);
        let (a, b) = (&retried.steps[0], &retried.steps[1]);
        assert_eq!(a.load_factor, first.final_load_factor);
        assert_eq!(a.control_displacement, first.steps[0].control_displacement);
        let du = b.control_displacement - a.control_displacement;
        let dl = b.load_factor - a.load_factor;
        assert!(a.control_displacement * du + a.load_factor * dl > 0.0);
        assert!((du.hypot(dl) / input.min_ds - 1.0).abs() <= input.tolerance);
    }
}


#[test]
#[ignore = "known wrong result: #2510"]
fn review_round_two_arc_scales_the_axial_member_resultant() {
    let mut solver = round_two_axial_cancellation();
    solver.loads.truncate(1);
    let SolverLoad::Nodal(load) = &mut solver.loads[0] else { unreachable!() };
    load.fx = 0.5;
    let b = 3.0 * 2f64.powi(51);
    solver.loads.extend([b + 3.0, -(b + 2.0)].map(|px| {
        serde_json::from_value(serde_json::json!({
            "type": "pointOnElement",
            "data": {"elementId": 1, "a": 1, "p": 0, "px": px}
        })).unwrap()
    }));
    let factor = 0.75;
    let radius = factor * std::f64::consts::SQRT_2;
    let input = ArcLengthInput {
        solver,
        max_steps: 1,
        max_iter: 20,
        tolerance: 1e-8,
        initial_ds: radius,
        min_ds: radius,
        max_ds: radius,
        target_iter: 5,
    };
    for result in arc_runs(&input) {
        assert!(result.converged);
        assert_eq!(result.final_load_factor, factor);
        assert_eq!(result.results.displacements[1].ux, factor);
        assert_eq!(result.results.reactions[0].rx, -1.5 * factor);
        let forces = &result.results.element_forces[0];
        assert_eq!(forces.n_start, 1.5 * factor);
        assert_eq!(forces.n_end, 0.5 * factor);
        assert_eq!(forces.point_loads.iter().map(|load| load.px.unwrap()).sum::<f64>(), factor);
    }
}

#[test]
#[ignore = "known wrong result: #2510"]
fn review_round_two_arc_assembles_loads_before_rounding_the_reference() {
    let mut solver = round_two_axial_cancellation();
    solver.loads.clear();
    let large = 2f64.powi(54);
    solver.loads.extend([large, 1.0, -large].map(|fx| {
        SolverLoad::Nodal(dedaliano_engine::types::SolverNodalLoad {
            node_id: 2, fx, fz: 0.0, my: 0.0,
        })
    }));
    let factor = 0.75;
    let radius = factor * std::f64::consts::SQRT_2;
    let input = ArcLengthInput {
        solver,
        max_steps: 1,
        max_iter: 20,
        tolerance: 1e-8,
        initial_ds: radius,
        min_ds: radius,
        max_ds: radius,
        target_iter: 5,
    };
    for result in arc_runs(&input) {
        assert!(result.converged);
        assert_eq!(result.final_load_factor, factor);
        assert_eq!(result.results.displacements[1].ux, factor);
        assert_eq!(result.results.reactions[0].rx, -factor);
    }
}
