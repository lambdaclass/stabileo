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
