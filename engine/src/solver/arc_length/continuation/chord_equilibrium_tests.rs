use super::*;
use crate::solver::corotational::{
    solve_corotational_2d, solve_corotational_2d_from, CorotationalStart2D,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    solver: SolverInput,
    assembly_loads: Vec<SolverLoad>,
    recovery_loads: Vec<SolverLoad>,
    rotation_motion: [f64; 2],
    rotation_constraints: Vec<Constraint>,
}

fn fixture() -> Fixture {
    serde_json::from_str(include_str!(
        "../../../../../scripts/tests/fixtures/planar-chord-equilibrium.json"
    ))
    .unwrap()
}

const TOLERANCE: f64 = 1e-8;

fn arc_input(solver: SolverInput) -> ArcLengthInput {
    let radius = 2.0_f64.sqrt();
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

fn run_drivers(
    solver: SolverInput,
    displacement: SolverInput,
    mut check: impl FnMut(&str, AnalysisResults, f64, bool),
) {
    let arc = solve_arc_length(&arc_input(solver.clone())).unwrap();
    check(
        "arc length",
        arc.results,
        arc.final_load_factor,
        arc.converged,
    );
    let controlled = solve_displacement_control(&DisplacementControlInput {
        solver: displacement,
        control_node: 4,
        control_dof: 0,
        target_displacement: 4.0,
        n_steps: 1,
        max_iter: 20,
        tolerance: TOLERANCE,
    })
    .unwrap();
    check(
        "displacement control",
        controlled.results,
        controlled.final_load_factor,
        controlled.converged,
    );

    for (driver, modified) in [("co-rotation", false), ("modified Newton", true)] {
        let result = solve_corotational_2d(&solver, 20, TOLERANCE, 1, modified).unwrap();
        check(driver, result.results, result.load_factor, result.converged);
    }

    let mut base = solver.clone();
    base.loads.truncate(1);
    if let SolverLoad::Nodal(load) = &mut base.loads[0] {
        load.fx = 0.0;
    }
    let initial = solve_corotational_2d(&base, 20, TOLERANCE, 1, false).unwrap();
    assert!(initial.converged);
    let start = CorotationalStart2D {
        input: &base,
        displacements: &initial.results.displacements,
    };
    let warm = solve_corotational_2d_from(&solver, Some(&start), 20, TOLERANCE, 4, true).unwrap();
    check(
        "warm co-rotation",
        warm.results,
        warm.load_factor,
        warm.converged,
    );

    let mut warm_arc = arc_input(solver.clone());
    let support = warm_arc.solver.supports.get_mut("2").unwrap();
    support.dx = None;
    support.dz = None;
    let warm = solve_arc_length_from(&warm_arc, Some(&start)).unwrap();
    check(
        "warm arc length",
        warm.results,
        warm.final_load_factor,
        warm.converged,
    );

    #[cfg(feature = "experimental-nonlinear")]
    {
        use crate::solver::experimental_nonlinear::{
            solve_corotational_2d_by, solve_corotational_2d_stepped, IterationMethod, LoadStepping,
        };
        let by = solve_corotational_2d_by(&solver, None, 20, TOLERANCE, 1, IterationMethod::Newton)
            .unwrap();
        check(
            "experimental co-rotation",
            by.results,
            by.load_factor,
            by.converged,
        );
        let adaptive = solve_corotational_2d_stepped(
            &solver,
            Some(&start),
            20,
            TOLERANCE,
            4,
            IterationMethod::Newton,
            LoadStepping::Adaptive,
        )
        .unwrap();
        check(
            "adaptive warm co-rotation",
            adaptive.results,
            adaptive.load_factor,
            adaptive.converged,
        );
    }
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_chord_assembly_equilibrium() {
    let mut failures = Vec::new();
    for member_type in ["frame", "truss"] {
        let Fixture {
            mut solver,
            assembly_loads,
            ..
        } = fixture();
        solver.elements.get_mut("1").unwrap().elem_type = member_type.into();
        solver.loads.extend(assembly_loads);
        run_drivers(
            solver.clone(),
            solver,
            |driver, result, factor, converged| {
                let tip = result.reactions.iter().find(|r| r.node_id == 2).unwrap();
                if !converged || factor <= 0.0 || [tip.rx, tip.rz, tip.my] != [0.0; 3] {
                    failures.push(format!(
                    "{member_type}, {driver}: converged={converged}, factor={factor}, reaction=({}, {}, {}), diagnostics={:?}",
                    tip.rx, tip.rz, tip.my, result.diagnostics,
                ));
                }
            },
        );
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
#[ignore = "known wrong result: #2560"]
fn issue_2560_chord_recovery_equilibrium() {
    let Fixture {
        mut solver,
        recovery_loads,
        rotation_motion,
        rotation_constraints,
        ..
    } = fixture();
    solver.nodes.get_mut("2").unwrap().x = 5.0;
    solver.nodes.get_mut("2").unwrap().z = 0.0;
    solver.loads.extend(recovery_loads);
    let mut displacement = solver.clone();
    displacement.supports.remove("2");
    displacement.constraints = rotation_constraints;
    if let SolverLoad::Nodal(load) = &mut displacement.loads[0] {
        load.fx = 4.0;
    }
    let support = solver.supports.get_mut("2").unwrap();
    support.dx = Some(rotation_motion[0]);
    support.dz = Some(rotation_motion[1]);
    let mut failures = Vec::new();
    run_drivers(solver, displacement, |driver, result, factor, converged| {
        let tip = result
            .displacements
            .iter()
            .find(|d| d.node_id == 2)
            .unwrap();
        let member = result
            .element_forces
            .iter()
            .find(|f| f.element_id == 1)
            .unwrap();
        if !converged || factor <= 0.0 || [tip.ux, tip.uz] != rotation_motion || member.n_end != 0.0
        {
            failures.push(format!(
                "{driver}: converged={converged}, factor={factor}, motion=({}, {}), axial={}, diagnostics={:?}",
                tip.ux, tip.uz, member.n_end, result.diagnostics,
            ));
        }
    });
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn chord_assembly_preserves_an_unbalanced_tip_force() {
    let Fixture {
        mut solver,
        mut assembly_loads,
        ..
    } = fixture();
    let [SolverLoad::PointOnElement(point), SolverLoad::Nodal(balance)] = &mut assembly_loads[..]
    else {
        unreachable!();
    };
    point.p = 5.0;
    balance.fx = 2.0;
    balance.fz = -3.0;
    solver.loads.extend(assembly_loads);
    let result = solve_corotational_2d(&solver, 20, TOLERANCE, 1, false).unwrap();
    assert!(result.converged);
    assert_eq!(result.load_factor, 1.0);
    let tip = result
        .results
        .reactions
        .iter()
        .find(|r| r.node_id == 2)
        .unwrap();
    assert_eq!(tip.rx, 2.0);
}
