use super::*;
use crate::solver::corotational::{
    solve_corotational_2d, solve_corotational_2d_from, CorotationalStart2D,
};

const TOLERANCE: f64 = 1e-8;

fn arc_input(solver: &SolverInput) -> ArcLengthInput {
    let radius = 0.75 * 2.0_f64.sqrt();
    ArcLengthInput {
        solver: solver.clone(),
        initial_ds: radius,
        min_ds: radius,
        max_ds: radius,
        max_steps: 1,
        max_iter: 20,
        tolerance: TOLERANCE,
        target_iter: 5,
    }
}

fn displacement_input(
    solver: SolverInput,
    control_node: usize,
    target_displacement: f64,
    n_steps: usize,
) -> DisplacementControlInput {
    DisplacementControlInput {
        solver,
        control_node,
        control_dof: 0,
        target_displacement,
        n_steps,
        max_iter: 20,
        tolerance: TOLERANCE,
    }
}

fn tied_springs() -> SolverInput {
    serde_json::from_str(include_str!(
        "../../../../../scripts/tests/fixtures/arc-tied-springs.json"
    ))
    .unwrap()
}

fn displacement(displacements: &[Displacement], node_id: usize) -> &Displacement {
    displacements.iter().find(|d| d.node_id == node_id).unwrap()
}

fn check_inclined(solve: impl Fn(&SolverInput) -> (AnalysisResults, f64)) {
    let mut solver: SolverInput = serde_json::from_str(include_str!(
        "../../../../../scripts/tests/fixtures/nonlinear-rounding-2560-inclined.json"
    ))
    .unwrap();
    let (combined, factor) = solve(&solver);
    let SolverLoad::PointOnElement(load) = &mut solver.loads[0] else {
        unreachable!();
    };
    let transverse = load.p;
    load.p = 0.0;
    let (axial, axial_factor) = solve(&solver);
    assert_eq!(factor, axial_factor);
    let tip = displacement(&combined.displacements, 2);
    let axial_tip = displacement(&axial.displacements, 2);
    assert_ne!(axial_tip.ux, 0.0);
    assert_eq!(
        [tip.ux, tip.uz, tip.ry],
        [axial_tip.ux, axial_tip.uz, axial_tip.ry]
    );
    assert_eq!(combined.reactions[0].rx, axial.reactions[0].rx);
    assert_eq!(combined.reactions[0].rz, axial.reactions[0].rz);
    let tip_reaction = combined.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert!((tip_reaction.rx / (transverse * factor) - 0.6).abs() < TOLERANCE);
    assert!((tip_reaction.rz / (transverse * factor) - 0.8).abs() < TOLERANCE);
    let end = &combined.element_forces[0];
    let axial_end = &axial.element_forces[0];
    assert_eq!(
        [end.n_start, end.n_end],
        [axial_end.n_start, axial_end.n_end]
    );
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_inclined_member_projection_arc() {
    check_inclined(|solver| {
        let result = solve_arc_length(&arc_input(solver)).unwrap();
        assert!(result.converged);
        (result.results, result.final_load_factor)
    });
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_inclined_member_projection_corotation() {
    check_inclined(|solver| {
        let result = solve_corotational_2d(solver, 20, TOLERANCE, 4, false).unwrap();
        assert!(result.converged);
        (result.results, result.load_factor)
    });
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_displacement_control_reconstructs_the_scaled_tie() {
    let mut solver = tied_springs();
    solver.constraints = serde_json::from_str(
        r#"[{"type":"linearMPC","terms":[{"nodeId":2,"dof":0,"coefficient":1},{"nodeId":3,"dof":0,"coefficient":-3}]}]"#,
    )
    .unwrap();
    for (node, target) in [(3, 0.1), (2, -0.3)] {
        let result =
            solve_displacement_control(&displacement_input(solver.clone(), node, target, 7))
                .unwrap();
        assert!(result.converged);
        for state in result
            .steps
            .iter()
            .map(|step| step.displacements.as_slice())
            .chain(std::iter::once(result.results.displacements.as_slice()))
        {
            let master = displacement(state, 3).ux;
            assert_ne!(master, 0.0);
            assert_eq!(displacement(state, 2).ux, 3.0 * master);
        }
    }
}

fn check_coincident(solve: impl Fn(&SolverInput) -> (AnalysisResults, f64)) {
    let mut solver: SolverInput = serde_json::from_str(include_str!(
        "../../../../../scripts/tests/fixtures/nonlinear-rounding-2560-coincident.json"
    ))
    .unwrap();
    let (split, factor) = solve(&solver);
    solver.loads.remove(1);
    let SolverLoad::PointOnElement(load) = &mut solver.loads[0] else {
        unreachable!();
    };
    load.px = Some(2.0);
    let (single, single_factor) = solve(&solver);
    assert_eq!(factor, single_factor);
    assert!(factor > 0.0);
    assert_eq!(single.element_forces[0].n_end.abs(), 1.5 * factor);
    assert_eq!(
        split.element_forces[0].n_end,
        single.element_forces[0].n_end
    );
    assert_eq!(
        split.element_forces[0].n_start,
        single.element_forces[0].n_start
    );
    assert_eq!(split.reactions[1].rx, single.reactions[1].rx);
    assert_eq!(split.reactions[0].rx, single.reactions[0].rx);
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_coincident_member_loads_arc() {
    check_coincident(|solver| {
        let result = solve_arc_length(&arc_input(solver)).unwrap();
        assert!(result.converged);
        (result.results, result.final_load_factor)
    });
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_coincident_member_loads_displacement_control() {
    check_coincident(|solver| {
        let input = displacement_input(solver.clone(), 4, 0.75, 1);
        let result = solve_displacement_control(&input).unwrap();
        assert!(result.converged);
        (result.results, result.final_load_factor)
    });
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_coincident_member_loads_corotation() {
    check_coincident(|solver| {
        let result = solve_corotational_2d(solver, 20, TOLERANCE, 4, true).unwrap();
        assert!(result.converged);
        (result.results, result.load_factor)
    });
}

fn check_prescribed_ramp(
    solve: impl Fn(&SolverInput, &CorotationalStart2D<'_>) -> CorotationalResult,
) {
    let mut base = tied_springs();
    base.constraints.clear();
    base.supports.get_mut("1").unwrap().dx = Some(18014398509481988.0);
    base.supports.get_mut("2").unwrap().kx = Some(0.3);
    let SolverLoad::Nodal(load) = &mut base.loads[0] else {
        unreachable!();
    };
    load.node_id = 2;
    load.fx = -12.0;
    let initial = solve_corotational_2d(&base, 20, TOLERANCE, 1, false).unwrap();
    assert!(initial.converged);
    let state = CorotationalStart2D {
        input: &base,
        displacements: &initial.results.displacements,
    };
    let mut target = base.clone();
    target.supports.get_mut("1").unwrap().dx = Some(-6004799503160663.0);
    let SolverLoad::Nodal(load) = &mut target.loads[0] else {
        unreachable!();
    };
    load.fx = -7.0;
    let result = solve(&target, &state);
    assert!(!result.converged);
    assert_eq!(result.load_factor, 0.75);
    assert_eq!(displacement(&result.results.displacements, 1).ux, -0.25);
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_prescribed_position_at_last_accepted_increment() {
    check_prescribed_ramp(|target, state| {
        solve_corotational_2d_from(target, Some(state), 4, 1e-20, 4, false).unwrap()
    });
}

#[cfg(feature = "experimental-nonlinear")]
#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_prescribed_position_in_experimental_corotation() {
    use crate::solver::experimental_nonlinear::{solve_corotational_2d_by, IterationMethod};
    check_prescribed_ramp(|target, state| {
        solve_corotational_2d_by(target, Some(state), 4, 1e-20, 4, IterationMethod::Newton).unwrap()
    });
}
