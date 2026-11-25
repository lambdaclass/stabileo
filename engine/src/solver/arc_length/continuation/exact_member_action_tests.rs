use super::*;
use crate::solver::corotational::{
    solve_corotational_2d, solve_corotational_2d_from, CorotationalStart2D,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    name: String,
    loads: Vec<SolverLoad>,
    element_type: Option<String>,
    #[serde(default)]
    hinge_start: bool,
    #[serde(default)]
    hinge_end: bool,
    #[serde(default)]
    shear_flexible: bool,
    #[serde(default)]
    far_axial_load: f64,
}

#[derive(serde::Deserialize)]
struct Fixture {
    solver: SolverInput,
    cases: Vec<Case>,
}

const TOLERANCE: f64 = 1e-8;

fn arc_input(solver: SolverInput) -> ArcLengthInput {
    let radius = 0.75 * 2.0_f64.sqrt();
    ArcLengthInput {
        solver,
        initial_ds: radius,
        min_ds: radius,
        max_ds: radius,
        max_steps: 1,
        max_iter: 20,
        tolerance: TOLERANCE,
        target_iter: 5,
    }
}

fn check_actions(solve: impl Fn(SolverInput) -> (AnalysisResults, f64, bool)) {
    let Fixture { solver, cases } = serde_json::from_str(include_str!(
        "../../../../../scripts/tests/fixtures/planar-exact-member-actions.json"
    ))
    .unwrap();
    let mut failures = Vec::new();
    for case in cases {
        let mut input = solver.clone();
        input.loads.extend(case.loads);
        let member = input.elements.get_mut("1").unwrap();
        member.hinge_start = case.hinge_start;
        member.hinge_end = case.hinge_end;
        if let Some(element_type) = case.element_type {
            member.elem_type = element_type;
        }
        if case.shear_flexible {
            input.materials.get_mut("1").unwrap().nu = 0.0;
            let section = input.sections.get_mut("1").unwrap();
            section.as_y = Some(1.0);
            section.iz = 3.0;
        }
        let (result, factor, converged) = solve(input);
        let reaction = result.reactions.iter().find(|r| r.node_id == 2).unwrap();
        let member = result
            .element_forces
            .iter()
            .find(|f| f.element_id == 1)
            .unwrap();
        let axial = -case.far_axial_load * factor;
        if !converged
            || factor <= 0.0
            || [
                reaction.rx,
                reaction.rz,
                reaction.my,
                member.n_end,
                member.v_end,
                member.m_end,
            ] != [axial, 0.0, 0.0, axial, 0.0, 0.0]
        {
            failures.push(format!(
                "{}: converged={converged}, factor={factor}, expected axial={axial}, reaction=[{}, {}, {}], member=[{}, {}, {}]",
                case.name, reaction.rx, reaction.rz, reaction.my, member.n_end, member.v_end, member.m_end,
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn issue_2560_exact_member_actions_arc() {
    check_actions(|solver| {
        let result = solve_arc_length(&arc_input(solver)).unwrap();
        (result.results, result.final_load_factor, result.converged)
    });
}

#[test]
fn issue_2560_exact_member_actions_warm_arc() {
    check_actions(|mut solver| {
        let mut base = solver.clone();
        base.loads = vec![solver.loads.remove(1)];
        let initial = solve_corotational_2d(&base, 20, TOLERANCE, 1, false).unwrap();
        assert!(initial.converged);
        let start = CorotationalStart2D {
            input: &base,
            displacements: &initial.results.displacements,
        };
        let mut input = arc_input(solver);
        let radius = 2.0_f64.sqrt();
        input.initial_ds = radius;
        input.min_ds = radius;
        input.max_ds = radius;
        let result = solve_arc_length_from(&input, Some(&start)).unwrap();
        assert_eq!(result.final_load_factor, 1.0);
        (result.results, result.final_load_factor, result.converged)
    });
}

#[test]
fn issue_2560_exact_member_actions_displacement_control() {
    check_actions(|solver| {
        let result = solve_displacement_control(&DisplacementControlInput {
            solver,
            control_node: 4,
            control_dof: 0,
            target_displacement: 0.75,
            n_steps: 1,
            max_iter: 20,
            tolerance: TOLERANCE,
        })
        .unwrap();
        (result.results, result.final_load_factor, result.converged)
    });
}

#[test]
fn issue_2560_exact_member_actions_corotation() {
    for modified in [false, true] {
        check_actions(|solver| {
            let result = solve_corotational_2d(&solver, 20, TOLERANCE, 4, modified).unwrap();
            (result.results, result.load_factor, result.converged)
        });
    }
}

#[test]
fn issue_2560_exact_member_actions_warm_corotation() {
    check_actions(|solver| {
        let initial = solve_corotational_2d(&solver, 20, TOLERANCE, 1, false).unwrap();
        assert!(initial.converged);
        let start = CorotationalStart2D {
            input: &solver,
            displacements: &initial.results.displacements,
        };
        let result =
            solve_corotational_2d_from(&solver, Some(&start), 20, TOLERANCE, 4, true).unwrap();
        (result.results, result.load_factor, result.converged)
    });
}

#[cfg(feature = "experimental-nonlinear")]
#[test]
fn issue_2560_exact_member_actions_experimental_corotation() {
    use crate::solver::experimental_nonlinear::{
        solve_corotational_2d_by, solve_corotational_2d_stepped, IterationMethod, LoadStepping,
    };
    check_actions(|solver| {
        let result =
            solve_corotational_2d_by(&solver, None, 20, TOLERANCE, 4, IterationMethod::Newton)
                .unwrap();
        (result.results, result.load_factor, result.converged)
    });
    check_actions(|solver| {
        let initial = solve_corotational_2d(&solver, 20, TOLERANCE, 1, false).unwrap();
        assert!(initial.converged);
        let start = CorotationalStart2D {
            input: &solver,
            displacements: &initial.results.displacements,
        };
        let result = solve_corotational_2d_stepped(
            &solver,
            Some(&start),
            20,
            TOLERANCE,
            4,
            IterationMethod::Newton,
            LoadStepping::Adaptive,
        )
        .unwrap();
        (result.results, result.load_factor, result.converged)
    });
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RotationFixture {
    solver: SolverInput,
    displacement_control: RotationDisplacementControl,
}

#[derive(serde::Deserialize)]
struct RotationDisplacementControl {
    constraints: Vec<Constraint>,
    loads: Vec<SolverLoad>,
}

fn rotation_fixture() -> RotationFixture {
    serde_json::from_str(include_str!(
        "../../../../../scripts/tests/fixtures/planar-member-rotation.json"
    ))
    .unwrap()
}

fn check_end_axial(result: &AnalysisResults, converged: bool, motion: [f64; 2], axial: f64) {
    assert!(converged);
    let tip = result
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    assert_eq!([tip.ux, tip.uz], motion);
    let member = result
        .element_forces
        .iter()
        .find(|f| f.element_id == 1)
        .unwrap();
    assert_eq!(member.n_end, axial);
}

#[test]
fn member_recovery_resolves_both_signs_of_chord_rotation() {
    let mut solver = rotation_fixture().solver;
    let SolverLoad::PointOnElement(load) = &mut solver.loads[1] else {
        unreachable!();
    };
    load.p = 5.0;
    for (motion, axial) in [([-3.0, 1.0], -3.0), ([2.0, -4.0], 4.0)] {
        let support = solver.supports.get_mut("2").unwrap();
        support.dx = Some(motion[0]);
        support.dz = Some(motion[1]);
        let result = solve_corotational_2d(&solver, 20, TOLERANCE, 1, false).unwrap();
        assert_eq!(result.load_factor, 1.0);
        check_end_axial(&result.results, result.converged, motion, axial);
    }
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_member_rotation_after_axial_stretch_corotation() {
    let mut solver = rotation_fixture().solver;
    for (motion, axial) in [([0.0, 0.0], 0.0), ([3.0, 4.0], 2.0), ([-1.5, -2.0], -1.0)] {
        let support = solver.supports.get_mut("2").unwrap();
        support.dx = Some(motion[0]);
        support.dz = Some(motion[1]);
        for modified in [false, true] {
            let result = solve_corotational_2d(&solver, 20, TOLERANCE, 4, modified).unwrap();
            assert_eq!(result.load_factor, 1.0);
            check_end_axial(&result.results, result.converged, motion, axial);
        }
    }
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_member_rotation_after_axial_stretch_warm_corotation() {
    let solver = rotation_fixture().solver;
    let mut base = solver.clone();
    base.loads.pop();
    let initial = solve_corotational_2d(&base, 20, TOLERANCE, 1, false).unwrap();
    assert!(initial.converged);
    let start = CorotationalStart2D {
        input: &base,
        displacements: &initial.results.displacements,
    };
    let result = solve_corotational_2d_from(&solver, Some(&start), 20, TOLERANCE, 4, true).unwrap();
    assert_eq!(result.load_factor, 1.0);
    check_end_axial(&result.results, result.converged, [3.0, 4.0], 2.0);
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_member_rotation_after_axial_stretch_arc() {
    let solver = rotation_fixture().solver;
    let result = solve_arc_length(&arc_input(solver)).unwrap();
    assert_eq!(result.final_load_factor, 0.75);
    check_end_axial(&result.results, result.converged, [2.25, 3.0], 1.5);
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_member_rotation_after_axial_stretch_warm_arc() {
    let mut solver = rotation_fixture().solver;
    let mut base = solver.clone();
    base.loads.pop();
    let initial = solve_corotational_2d(&base, 20, TOLERANCE, 1, false).unwrap();
    assert!(initial.converged);
    let start = CorotationalStart2D {
        input: &base,
        displacements: &initial.results.displacements,
    };
    let support = solver.supports.get_mut("2").unwrap();
    support.dx = None;
    support.dz = None;
    let result = solve_arc_length_from(&arc_input(solver), Some(&start)).unwrap();
    assert_eq!(result.final_load_factor, 0.75);
    check_end_axial(&result.results, result.converged, [3.0, 4.0], 2.0);
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_member_rotation_after_axial_stretch_displacement_control() {
    let RotationFixture {
        mut solver,
        displacement_control,
    } = rotation_fixture();
    solver.supports.remove("2");
    solver.constraints = displacement_control.constraints;
    solver.loads = displacement_control.loads;
    let result = solve_displacement_control(&DisplacementControlInput {
        solver,
        control_node: 4,
        control_dof: 0,
        target_displacement: 4.0,
        n_steps: 1,
        max_iter: 20,
        tolerance: TOLERANCE,
    })
    .unwrap();
    check_end_axial(&result.results, result.converged, [3.0, 4.0], 2.0);
}

#[cfg(feature = "experimental-nonlinear")]
#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_member_rotation_after_axial_stretch_experimental_corotation() {
    use crate::solver::experimental_nonlinear::{
        solve_corotational_2d_by, solve_corotational_2d_stepped, IterationMethod, LoadStepping,
    };
    let solver = rotation_fixture().solver;
    let mut base = solver.clone();
    base.loads.pop();
    let initial = solve_corotational_2d(&base, 20, TOLERANCE, 1, false).unwrap();
    assert!(initial.converged);
    let start = CorotationalStart2D {
        input: &base,
        displacements: &initial.results.displacements,
    };
    let by =
        solve_corotational_2d_by(&solver, None, 20, TOLERANCE, 4, IterationMethod::Newton).unwrap();
    let stepped = solve_corotational_2d_stepped(
        &solver,
        Some(&start),
        20,
        TOLERANCE,
        4,
        IterationMethod::Newton,
        LoadStepping::Adaptive,
    )
    .unwrap();
    for result in [by, stepped] {
        assert_eq!(result.load_factor, 1.0);
        check_end_axial(&result.results, result.converged, [3.0, 4.0], 2.0);
    }
}
