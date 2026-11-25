use super::super::discrete_problem::Problem;
use super::super::incremental::IncrementalProblem;
use super::*;
use crate::element::total_lagrangian_truss::{TotalLagrangianTruss, MAX_GREEN_STRAIN};

fn close(a: f64, b: f64, tolerance: f64) {
    assert!(
        (a - b).abs() <= tolerance,
        "{a:e} != {b:e} (tol {tolerance:e})"
    );
}

fn load_control() -> LoadControl {
    LoadControl {
        increments: 8,
        max_iterations: 30,
        tolerance: 1e-10,
        method: IterationMethod::Newton,
        stepping: LoadStepping::Equal,
    }
}

fn axial() -> TrussModel {
    TrussModel {
        positions: vec![[0.0; 3], [2.0, 0.0, 0.0]],
        fixed: vec![[true; 3], [false, true, true]],
        loads: vec![[0.0; 3], [2.0, 0.0, 0.0]],
        members: vec![TrussMember {
            nodes: [0, 1],
            young: 1000.0,
            area: 2.0,
        }],
    }
}

fn shallow() -> TrussModel {
    TrussModel {
        positions: vec![[-1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.1, 0.0]],
        fixed: vec![[true; 3], [true; 3], [false, false, true]],
        loads: vec![[0.0; 3], [0.0; 3], [0.0, -1.0, 0.0]],
        members: vec![
            TrussMember {
                nodes: [0, 2],
                young: 1000.0,
                area: 1.0,
            },
            TrussMember {
                nodes: [1, 2],
                young: 1000.0,
                area: 1.0,
            },
        ],
    }
}

fn arc_control() -> ArcControl {
    ArcControl {
        steps: 40,
        max_iterations: 30,
        tolerance: 1e-9,
        initial_radius: 0.004,
        min_radius: 0.0001,
        max_radius: 0.004,
        load_weight: 0.02,
    }
}

#[test]
fn energy_gradient_and_consistent_tangent_match_finite_differences() {
    let element = TotalLagrangianTruss::new([[0.0; 3], [2.0, 1.0, -0.5]], 210e9, 0.002).unwrap();
    let u = [[0.001, -0.002, 0.0003], [0.004, 0.002, -0.001]];
    let r = element.evaluate(u).unwrap();
    let h = 1e-6;
    for j in 0..6 {
        let (mut plus, mut minus) = (u, u);
        plus[j / 3][j % 3] += h;
        minus[j / 3][j % 3] -= h;
        let (p, m) = (
            element.evaluate(plus).unwrap(),
            element.evaluate(minus).unwrap(),
        );
        close((p.energy - m.energy) / (2.0 * h), r.internal[j], 1e-3);
        for i in 0..6 {
            close(
                (p.internal[i] - m.internal[i]) / (2.0 * h),
                r.tangent[i * 6 + j],
                0.2,
            );
            close(r.tangent[i * 6 + j], r.tangent[j * 6 + i], 0.0);
        }
    }
}

#[test]
fn rigid_motion_has_no_strain_and_rotated_stretch_has_objective_response() {
    let element = TotalLagrangianTruss::new([[0.0; 3], [2.0, 0.0, 0.0]], 1000.0, 2.0).unwrap();
    // Cyclic permutation is a proper 120-degree rotation about (1,1,1).
    let rotate = |v: [f64; 3]| [v[2], v[0], v[1]];
    for stretch in [1.0, 1.002] {
        let r = element
            .evaluate([[0.0; 3], [2.0 * (stretch - 1.0), 0.0, 0.0]])
            .unwrap();
        let translation = [5.0, -3.0, 7.0];
        let end = rotate([2.0 * stretch, 0.0, 0.0]);
        let moved = element
            .evaluate([
                translation,
                [
                    translation[0] + end[0] - 2.0,
                    translation[1] + end[1],
                    translation[2] + end[2],
                ],
            ])
            .unwrap();
        close(moved.energy, r.energy, 1e-11);
        close(moved.green_strain, r.green_strain, 1e-14);
        if stretch == 1.0 {
            assert!(moved.internal.iter().all(|x| x.abs() < 1e-11));
        }
        let permutation = [2, 0, 1];
        for i in 0..6 {
            let pi = (i / 3) * 3 + permutation[i % 3];
            close(moved.internal[i], r.internal[pi], 1e-10);
            for j in 0..6 {
                let pj = (j / 3) * 3 + permutation[j % 3];
                close(moved.tangent[i * 6 + j], r.tangent[pi * 6 + pj], 1e-10);
            }
        }
    }
}

#[test]
fn infinitesimal_tangent_is_the_linear_truss_and_forces_balance() {
    let r = TotalLagrangianTruss::new([[0.0; 3], [2.0, 0.0, 0.0]], 1000.0, 2.0)
        .unwrap()
        .evaluate([[0.0; 3]; 2])
        .unwrap();
    for i in 0..6 {
        for j in 0..6 {
            let expected = if i % 3 == 0 && j % 3 == 0 {
                if i == j {
                    1000.0
                } else {
                    -1000.0
                }
            } else {
                0.0
            };
            close(r.tangent[6 * i + j], expected, 0.0);
        }
    }
    let element = TotalLagrangianTruss::new([[0.0; 3], [1.0, 2.0, 3.0]], 1000.0, 2.0).unwrap();
    let r = element
        .evaluate([[0.0; 3], [0.001, -0.002, 0.003]])
        .unwrap();
    for i in 0..3 {
        close(r.internal[i] + r.internal[i + 3], 0.0, 0.0);
    }
}

#[test]
fn finite_domain_is_enforced_before_returning_any_response() {
    let reference = [[0.0; 3], [1.0, 0.0, 0.0]];
    for bad in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(TotalLagrangianTruss::new(reference, bad, 1.0).is_err());
        assert!(TotalLagrangianTruss::new(reference, 1.0, bad).is_err());
    }
    assert!(TotalLagrangianTruss::new([[0.0; 3]; 2], 1.0, 1.0).is_err());
    assert!(TotalLagrangianTruss::new(reference, f64::MAX, 2.0).is_err());
    assert!(TotalLagrangianTruss::new([[0.0; 3], [1e-300, 0.0, 0.0]], 1e100, 1.0).is_err());
    let e = TotalLagrangianTruss::new(reference, 1000.0, 1.0).unwrap();
    for bad in [f64::NAN, f64::INFINITY, f64::MAX, -1.0, 0.02] {
        assert!(e.evaluate([[0.0; 3], [bad, 0.0, 0.0]]).is_err());
    }
    assert!(e.evaluate([[0.0; 3], [0.001, 0.0, 0.0]]).is_ok());
    // Finite inputs and stiffness, but the stored strain energy would overflow.
    let huge = TotalLagrangianTruss::new([[0.0; 3], [1e100, 0.0, 0.0]], 1e300, 1.0).unwrap();
    assert!(huge.evaluate([[0.0; 3], [1e97, 0.0, 0.0]]).is_err());
}

#[test]
fn shared_iterations_reach_the_analytic_axial_solution() {
    let mut model = axial();
    let stretch: f64 = 1.003;
    model.loads[1][0] = 1000.0 * (stretch.powi(3) - stretch);
    for method in [
        IterationMethod::Newton,
        IterationMethod::ModifiedNewton,
        IterationMethod::NewtonLineSearch,
    ] {
        for stepping in [LoadStepping::Equal, LoadStepping::Adaptive] {
            let result = solve_load_control(
                &model,
                LoadControl {
                    method,
                    stepping,
                    ..load_control()
                },
            )
            .unwrap();
            assert!(result.completed);
            close(
                result.last_equilibrium.displacements[1][0],
                2.0 * (stretch - 1.0),
                1e-11,
            );
            close(
                result.last_equilibrium.reactions[0][0],
                -model.loads[1][0],
                1e-9,
            );
            assert!(result.last_equilibrium.relative_residual < 1e-10);
        }
    }
}

#[test]
fn arc_length_tracks_the_analytic_curve_through_the_limit_point() {
    let model = shallow();
    let result = solve_arc_length(&model, arc_control()).unwrap();
    assert!(result.completed, "{} steps", result.steps.len());
    let length = 1.01_f64.sqrt();
    let mut descending = 0;
    for (i, point) in result.steps.iter().enumerate() {
        let y = 0.1 + point.displacements[2][1];
        let force = 1000.0 * y * (0.01 - y * y) / length.powi(3);
        close(point.load_factor, force, 1e-8);
        close(point.displacements[2][0], 0.0, 1e-12);
        close(
            point.reactions[0][1] + point.reactions[1][1],
            point.load_factor,
            1e-8,
        );
        assert!(point.relative_residual < 1e-9);
        if i > 0 && point.load_factor < result.steps[i - 1].load_factor {
            descending += 1;
        }
    }
    assert!(descending > 10, "no sustained descending branch");
    let maximum = result
        .steps
        .iter()
        .map(|s| s.load_factor)
        .fold(0.0_f64, f64::max);
    let analytic_peak = 2.0 * 1000.0 * 0.1_f64.powi(3) / (3.0 * 3.0_f64.sqrt() * length.powi(3));
    close(maximum, analytic_peak, 0.002);
    assert!(result.last_equilibrium.displacements[2][1] < -0.1);
}

#[test]
fn load_and_arc_controllers_agree_at_the_same_equilibrium() {
    let model = shallow();
    let arc = solve_arc_length(
        &model,
        ArcControl {
            steps: 5,
            ..arc_control()
        },
    )
    .unwrap();
    let mut same_load = model;
    same_load.loads[2][1] *= arc.last_equilibrium.load_factor;
    let load = solve_load_control(&same_load, load_control()).unwrap();
    assert!(load.completed);
    for i in 0..3 {
        for j in 0..3 {
            close(
                load.last_equilibrium.displacements[i][j],
                arc.last_equilibrium.displacements[i][j],
                1e-9,
            );
        }
    }
}

#[test]
fn rejected_steps_leave_only_accepted_states() {
    let result = solve_load_control(
        &axial(),
        LoadControl {
            max_iterations: 1,
            ..load_control()
        },
    )
    .unwrap();
    assert!(!result.completed);
    assert!(result.steps.is_empty());
    close(result.last_equilibrium.load_factor, 0.0, 0.0);
    assert!(result
        .last_equilibrium
        .displacements
        .iter()
        .flatten()
        .all(|x| *x == 0.0));
    let result = solve_arc_length(
        &shallow(),
        ArcControl {
            max_iterations: 1,
            min_radius: 0.004,
            ..arc_control()
        },
    )
    .unwrap();
    assert!(!result.completed);
    assert!(result.steps.is_empty());
    close(result.last_equilibrium.energy, 0.0, 0.0);
    let model = axial();
    let mut problem = Problem::new(PreparedTruss::new(&model).unwrap()).unwrap();
    IncrementalProblem::begin_increment(&mut problem, 0.5);
    IncrementalProblem::set_state(&mut problem, &[0.001]);
    problem.assemble().unwrap();
    problem.accept();
    IncrementalProblem::set_state(&mut problem, &[f64::MAX]);
    assert!(IncrementalProblem::linearize(&mut problem).is_err());
    IncrementalProblem::rollback(&mut problem);
    assert_eq!(problem.u, vec![0.001]);
}

#[test]
fn supports_cannot_mask_free_residuals_and_zero_load_mechanisms_are_refused() {
    let baseline = solve_load_control(&axial(), load_control()).unwrap();
    let mut model = axial();
    model.loads[0][0] = 1e200;
    let large_reaction = solve_load_control(&model, load_control()).unwrap();
    assert_eq!(baseline.iterations, large_reaction.iterations);
    assert_eq!(
        baseline.last_equilibrium.displacements,
        large_reaction.last_equilibrium.displacements
    );
    model.fixed[1][1] = false; // Unloaded transverse mechanism must still be refused.
    assert!(solve_load_control(&model, load_control()).is_err());
}

#[test]
fn controls_connectivity_and_assembled_overflow_are_refused() {
    for tolerance in [0.0, -1.0, f64::NAN, f64::INFINITY, 0.1] {
        assert!(solve_load_control(
            &axial(),
            LoadControl {
                tolerance,
                ..load_control()
            }
        )
        .is_err());
    }
    assert!(solve_load_control(
        &axial(),
        LoadControl {
            increments: 0,
            ..load_control()
        }
    )
    .is_err());
    assert!(solve_load_control(
        &axial(),
        LoadControl {
            max_iterations: usize::MAX,
            ..load_control()
        }
    )
    .is_err());
    for weight in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(solve_arc_length(
            &shallow(),
            ArcControl {
                load_weight: weight,
                ..arc_control()
            }
        )
        .is_err());
    }
    let mut model = axial();
    model.members[0].nodes[1] = 3;
    assert!(solve_load_control(&model, load_control()).is_err());
    model = axial();
    model.loads[1][0] = f64::NAN;
    assert!(solve_load_control(&model, load_control()).is_err());
    model = axial();
    model.members[0].young = f64::MAX;
    model.members[0].area = 1.0;
    model.members = vec![model.members[0].clone(); 4];
    assert_eq!(
        solve_load_control(&model, load_control()).unwrap_err(),
        "Experimental truss assembly exceeds the finite range"
    );
    model = axial();
    model.loads[1][0] = 1000.0;
    assert_eq!(
        solve_load_control(&model, load_control()).unwrap_err(),
        "Truss member 0: Total Lagrangian truss exceeds its 1% Green strain domain"
    );
    assert_eq!(MAX_GREEN_STRAIN, 0.01);
}

#[test]
fn changing_consistent_units_preserves_the_arc_path() {
    let baseline = solve_arc_length(&shallow(), arc_control()).unwrap();
    // Length ×1000, force ×0.001: m/N -> mm/kN, stress ×1e-9, area ×1e6.
    let mut model = shallow();
    for p in &mut model.positions {
        for x in p {
            *x *= 1000.0;
        }
    }
    for f in &mut model.loads {
        for x in f {
            *x *= 0.001;
        }
    }
    for e in &mut model.members {
        e.young *= 1e-9;
        e.area *= 1e6;
    }
    let c = arc_control();
    let scaled = solve_arc_length(
        &model,
        ArcControl {
            initial_radius: c.initial_radius * 1000.0,
            min_radius: c.min_radius * 1000.0,
            max_radius: c.max_radius * 1000.0,
            load_weight: c.load_weight * 1000.0,
            ..c
        },
    )
    .unwrap();
    assert_eq!(baseline.steps.len(), scaled.steps.len());
    assert!(scaled.completed);
    for (a, b) in baseline.steps.iter().zip(&scaled.steps) {
        close(a.load_factor, b.load_factor, 1e-8);
        close(a.displacements[2][1], b.displacements[2][1] / 1000.0, 1e-9);
        close(a.energy, b.energy, 1e-8);
    }
}

#[test]
fn spatial_truss_is_invariant_under_rotation_translation_and_node_renumbering() {
    let model = TrussModel {
        positions: vec![[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [0.0; 3]],
        fixed: vec![[true; 3], [true; 3], [true; 3], [false; 3]],
        loads: vec![[0.0; 3], [0.0; 3], [0.0; 3], [1.0, -2.0, 3.0]],
        members: (0..3)
            .map(|i| TrussMember {
                nodes: [i, 3],
                young: 1000.0,
                area: 2.0,
            })
            .collect(),
    };
    let original = solve_load_control(&model, load_control()).unwrap();
    assert!(original.completed);
    let rotate = |v: [f64; 3]| [v[2], v[0], v[1]];
    let order = [3, 2, 0, 1]; // old node -> new node
    let mut transformed = model.clone();
    for i in 0..4 {
        let p = rotate(model.positions[i]);
        transformed.positions[order[i]] = [p[0] + 4.0, p[1] - 6.0, p[2] + 2.0];
        transformed.loads[order[i]] = rotate(model.loads[i]);
        transformed.fixed[order[i]] = model.fixed[i];
    }
    for m in &mut transformed.members {
        m.nodes = [order[m.nodes[1]], order[m.nodes[0]]];
    }
    transformed.members.reverse();
    let changed = solve_load_control(&transformed, load_control()).unwrap();
    assert!(changed.completed);
    for (a, b) in original.steps.iter().zip(&changed.steps) {
        close(a.energy, b.energy, 1e-11);
        for i in 0..4 {
            let displacement = rotate(a.displacements[i]);
            let reaction = rotate(a.reactions[i]);
            for j in 0..3 {
                close(displacement[j], b.displacements[order[i]][j], 1e-12);
                close(reaction[j], b.reactions[order[i]][j], 1e-9);
            }
        }
        for j in 0..3 {
            let balance: f64 =
                a.reactions.iter().map(|r| r[j]).sum::<f64>() + model.loads[3][j] * a.load_factor;
            close(balance, 0.0, 1e-9);
        }
    }
}

#[test]
fn branch_with_negative_tangent_is_an_equilibrium_not_a_stability_certificate() {
    let model = shallow();
    let path = solve_arc_length(
        &model,
        ArcControl {
            steps: 20,
            ..arc_control()
        },
    )
    .unwrap();
    assert!(path.completed);
    let mut problem = Problem::new(PreparedTruss::new(&model).unwrap()).unwrap();
    for (j, &i) in problem.model.free.iter().enumerate() {
        problem.u[j] = path.last_equilibrium.displacements[i / 3][i % 3];
    }
    problem.lambda = path.last_equilibrium.load_factor;
    problem.assemble().unwrap();
    assert!(problem.at.equilibrium.relative_residual < 1e-9);
    assert!(problem.at.tangent[3] < 0.0); // Negative vertical stiffness beyond the peak.
    assert!(problem
        .solve(&problem.model.reference.clone(), false)
        .is_ok());
}
