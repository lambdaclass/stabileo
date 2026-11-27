use super::super::discrete_problem::Problem;
use super::super::incremental::IncrementalProblem;
use super::super::{IterationMethod, LoadStepping};
use super::*;
use crate::linalg::cholesky_decompose;

fn close(a: f64, b: f64, tol: f64) {
    assert!((a - b).abs() <= tol, "{a:e} != {b:e}, tolerance {tol:e}");
}
fn control() -> LoadControl {
    LoadControl {
        increments: 20,
        max_iterations: 40,
        tolerance: 1e-8,
        method: IterationMethod::Newton,
        stepping: LoadStepping::Equal,
    }
}

fn member(a: usize, b: usize) -> BeamMember2D {
    BeamMember2D {
        nodes: [a, b],
        young: 1e6,
        area: 0.001,
        inertia: 1e-8,
        shear_rigidity: 320.0,
        half_depth: 0.01,
    }
}
fn cantilever(n: usize) -> BeamModel2D {
    let mut model = BeamModel2D {
        positions: (0..=n).map(|i| [i as f64 / n as f64, 0.0]).collect(),
        fixed: vec![[false; 3]; n + 1],
        loads: vec![[0.0; 3]; n + 1],
        members: (0..n).map(|i| member(i, i + 1)).collect(),
    };
    model.fixed[0] = [true; 3];
    model
}
fn column(n: usize, imperfection: f64, load: f64) -> BeamModel2D {
    let mut model = cantilever(n);
    for (i, p) in model.positions.iter_mut().enumerate() {
        let s = i as f64 / n as f64;
        *p = [imperfection * (std::f64::consts::PI * s).sin(), s];
    }
    model.fixed[0] = [true, true, false];
    model.fixed[n] = [true, false, false];
    model.loads[n][1] = -load;
    model
}

#[test]
fn energy_gradient_and_tangent_are_consistent_at_a_rotated_bent_state() {
    let e = TotalLagrangianBeam2D::new([[0.0, 0.0], [1.2, 0.4]], 1e6, 0.01, 1e-6, 3000.0, 0.02)
        .unwrap();
    let beta: f64 = 1.1;
    let (s, c) = beta.sin_cos();
    let u = [
        [0.2, -0.1, beta - 0.02],
        [
            0.2 + c * 1.2 - s * 0.4 - 1.2 + 0.001,
            -0.1 + s * 1.2 + c * 0.4 - 0.4,
            beta + 0.02,
        ],
    ];
    let r = e.evaluate(u).unwrap();
    let h = 1e-6;
    for j in 0..6 {
        let (mut p, mut m) = (u, u);
        p[j / 3][j % 3] += h;
        m[j / 3][j % 3] -= h;
        let (p, m) = (e.evaluate(p).unwrap(), e.evaluate(m).unwrap());
        close((p.energy - m.energy) / (2.0 * h), r.internal[j], 1e-5);
        for i in 0..6 {
            close(
                (p.internal[i] - m.internal[i]) / (2.0 * h),
                r.tangent[6 * i + j],
                1e-4,
            );
            close(r.tangent[6 * i + j], r.tangent[6 * j + i], 1e-10);
        }
    }
}

#[test]
fn finite_rigid_rotations_do_not_create_strain_or_force() {
    let reference = [[0.2, -0.4], [1.7, 0.6]];
    let e = TotalLagrangianBeam2D::new(reference, 1e6, 0.01, 1e-6, 3000.0, 0.02).unwrap();
    for beta in [-3.0_f64, -0.7, 0.0, 1.6, 3.9, 6.0] {
        let (s, c) = beta.sin_cos();
        let u = reference.map(|p| {
            [
                c * p[0] - s * p[1] + 3.0 - p[0],
                s * p[0] + c * p[1] - 2.0 - p[1],
                beta,
            ]
        });
        let r = e.evaluate(u).unwrap();
        assert!(r.strains.iter().all(|x| x.abs() < 1e-14));
        assert!(r.internal.iter().all(|x| x.abs() < 1e-9));
        close(r.energy, 0.0, 1e-20);
    }
}

#[test]
fn linear_limit_has_three_rigid_modes_and_the_expected_section_energy() {
    let e =
        TotalLagrangianBeam2D::new([[0.0; 2], [2.0, 0.0]], 1000.0, 2.0, 0.1, 500.0, 0.5).unwrap();
    let r = e.evaluate([[0.0; 3]; 2]).unwrap();
    for rigid in [
        [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0, 0.0, 2.0, 1.0],
    ] {
        for row in r.tangent.chunks_exact(6) {
            close(row.iter().zip(rigid).map(|(a, b)| a * b).sum(), 0.0, 1e-12);
        }
    }
    // Pure axial, shear and symmetric bending modes independently exercise all three strains.
    let axial = e.evaluate([[0.0; 3], [0.002, 0.0, 0.0]]).unwrap();
    close(axial.energy, 0.5 * 2000.0 * 2.0 * 0.001_f64.powi(2), 1e-15);
    let shear = e.evaluate([[0.0; 3], [0.0, 0.002, 0.0]]).unwrap();
    close(shear.energy, 0.5 * 500.0 * 2.0 * 0.001_f64.powi(2), 1e-15);
    let bend = e.evaluate([[0.0, 0.0, -0.001], [0.0, 0.0, 0.001]]).unwrap();
    close(bend.energy, 0.5 * 100.0 * 2.0 * 0.001_f64.powi(2), 1e-15);
}

#[test]
fn invalid_properties_overflow_and_section_domain_are_refused() {
    let r = [[0.0; 2], [1.0, 0.0]];
    for bad in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(TotalLagrangianBeam2D::new(r, bad, 1.0, 0.001, 1.0, 0.1).is_err());
        assert!(TotalLagrangianBeam2D::new(r, 1000.0, 1.0, 0.001, bad, 0.1).is_err());
        assert!(TotalLagrangianBeam2D::new(r, 1000.0, 1.0, 0.001, 1.0, bad).is_err());
    }
    assert!(TotalLagrangianBeam2D::new([[0.0; 2]; 2], 1000.0, 1.0, 0.001, 1.0, 0.1).is_err());
    assert!(TotalLagrangianBeam2D::new(r, f64::MAX, 2.0, 0.001, 1.0, 0.1).is_err());
    let e = TotalLagrangianBeam2D::new(r, 1000.0, 1.0, 0.001, 100.0, 0.1).unwrap();
    for u in [
        [[0.0; 3], [f64::MAX, 0.0, 0.0]],
        [[0.0; 3], [0.0, f64::NAN, 0.0]],
        [[0.0; 3], [0.0, 0.0, 0.2]],
        [[0.0; 3], [0.0, 0.02, 0.0]],
        [[0.0; 3], [0.02, 0.0, 0.0]],
        [[0.0, 0.0, 1e100]; 2],
    ] {
        assert!(e.evaluate(u).is_err());
    }
    // Rotation/mesh domain is independent of the small section-strain check.
    assert!(e.evaluate([[0.0, 0.0, -1.0], [0.0, 0.0, 1.0]]).is_err());
    assert!(e.evaluate([[0.0; 3]; 2]).is_ok());

    // A finite reference length can overflow if a Hessian denominator forms 2*L.
    // Its reciprocal would silently become zero, corrupting a finite tangent.
    let huge =
        TotalLagrangianBeam2D::new([[0.0; 2], [1e308, 0.0]], 1.0, 1.0, 1.0, 1.0, 1.0).unwrap();
    let u = [[0.0; 3], [-1e305, 1e305, 0.0]];
    let response = huge.evaluate(u).unwrap();
    let (mut plus, mut minus) = (u, u);
    plus[1][2] = 1e-6;
    minus[1][2] = -1e-6;
    let p = huge.evaluate(plus).unwrap();
    let m = huge.evaluate(minus).unwrap();
    for i in [0, 1, 3, 4] {
        close(
            (p.internal[i] - m.internal[i]) / 2e-6,
            response.tangent[6 * i + 5],
            1e-6,
        );
    }
}

#[test]
fn cantilever_refines_toward_the_linear_timoshenko_solution_without_shear_locking() {
    let force = 1e-6;
    let exact = force / (3.0 * 0.01) + force / 320.0;
    let mut errors = Vec::new();
    for n in [2, 4, 8, 16] {
        let mut model = cantilever(n);
        model.loads[n][1] = force;
        let result = solve_load_control(&model, control()).unwrap();
        assert!(result.completed);
        let tip = result.last_equilibrium.displacements[n];
        errors.push((tip[1] / exact - 1.0).abs());
        close(tip[2], force / (2.0 * 0.01), 1e-9);
        close(result.last_equilibrium.reactions[0][1], -force, 1e-13);
        close(result.last_equilibrium.reactions[0][2], -force, 1e-13);
    }
    assert!(errors.windows(2).all(|p| p[1] < p[0]));
    assert!(errors[3] < 0.0011, "{errors:?}");
}

#[test]
fn large_rotation_pure_bending_refines_toward_a_circular_arc() {
    let angle = std::f64::consts::FRAC_PI_2;
    let mut errors = Vec::new();
    for n in [8, 16] {
        let mut model = cantilever(n);
        for m in &mut model.members {
            m.half_depth = 0.004;
        }
        model.loads[n][2] = 0.01 * angle;
        let result = solve_load_control(
            &model,
            LoadControl {
                increments: 64,
                tolerance: 1e-7,
                ..control()
            },
        )
        .unwrap();
        assert!(result.completed, "n={n}, steps={}", result.steps.len());
        let tip = result.last_equilibrium.displacements[n];
        close(tip[2], angle, 1e-6);
        let x = 1.0 + tip[0];
        let y = tip[1];
        let error = (x - angle.sin() / angle).hypot(y - (1.0 - angle.cos()) / angle);
        errors.push(error);
        close(
            result.last_equilibrium.energy,
            0.5 * 0.01 * angle * angle,
            1e-8,
        );
        close(result.last_equilibrium.reactions[0][2], -0.01 * angle, 1e-8);
    }
    assert!(errors[1] < errors[0] * 0.3, "{errors:?}");
    assert!(errors[1] < 0.0004, "{errors:?}");
}

#[test]
fn imperfect_column_amplification_agrees_with_euler_under_mesh_refinement() {
    let pcr = std::f64::consts::PI.powi(2) * 0.01;
    let initial = 1e-4;
    let fraction = 0.7;
    let expected = initial * fraction / (1.0 - fraction);
    let mut errors = Vec::new();
    for n in [8, 16, 32] {
        let model = column(n, initial, fraction * pcr);
        let r = solve_load_control(&model, control()).unwrap();
        assert!(r.completed);
        let deflection = r.last_equilibrium.displacements[n / 2][0];
        errors.push((deflection / expected - 1.0).abs());
        close(r.last_equilibrium.reactions[0][1], fraction * pcr, 1e-8);
    }
    eprintln!("Euler imperfection relative errors: {errors:?}");
    assert!(errors.windows(2).all(|p| p[1] < p[0]), "{errors:?}");
    assert!(errors[2] < 0.006, "{errors:?}");
}

#[test]
fn perfect_column_tangent_loses_positive_definiteness_near_euler_load() {
    let expected = std::f64::consts::PI.powi(2) * 0.01;
    let mut errors = Vec::new();
    for n in [8, 16, 32] {
        let model = column(n, 0.0, expected);
        let prepared = PreparedBeam::new(&model).unwrap();
        let positive = |p: f64| {
            let u: Vec<_> = prepared
                .free
                .iter()
                .map(|&i| {
                    if i % 3 == 1 {
                        -p / 1000.0 * model.positions[i / 3][1]
                    } else {
                        0.0
                    }
                })
                .collect();
            let mut k = prepared.assemble(&u, p / expected).unwrap().tangent;
            let scale = k.iter().fold(0.0_f64, |a, v| a.max(v.abs()));
            for v in &mut k {
                *v /= scale;
            }
            cholesky_decompose(&mut k, u.len())
        };
        let (mut low, mut high) = (0.8 * expected, 1.2 * expected);
        assert!(positive(low));
        assert!(!positive(high));
        for _ in 0..40 {
            let mid = 0.5 * (low + high);
            if positive(mid) {
                low = mid;
            } else {
                high = mid;
            }
        }
        errors.push((0.5 * (low + high) / expected - 1.0).abs());
    }
    eprintln!("Euler critical-load relative errors: {errors:?}");
    assert!(errors.windows(2).all(|p| p[1] < p[0]), "{errors:?}");
    assert!(errors[2] < 0.002, "{errors:?}");
}

#[test]
fn arc_length_follows_an_imperfect_column_beyond_the_linear_critical_load() {
    let pcr = std::f64::consts::PI.powi(2) * 0.01;
    let model = column(16, 1e-4, pcr);
    let result = solve_arc_length(
        &model,
        ArcControl {
            steps: 80,
            max_iterations: 40,
            tolerance: 1e-7,
            initial_radius: 0.01,
            min_radius: 0.0001,
            max_radius: 0.01,
            load_weight: 0.2,
        },
    )
    .unwrap();
    assert!(
        result.completed,
        "{} steps, factor {}",
        result.steps.len(),
        result.last_equilibrium.load_factor
    );
    eprintln!(
        "Imperfect column: lambda={}, midspan={}",
        result.last_equilibrium.load_factor, result.last_equilibrium.displacements[8][0]
    );
    assert!(result.last_equilibrium.load_factor > 1.0);
    assert!(result.last_equilibrium.displacements[8][0] > 0.03);
    assert!(result.steps.iter().all(|p| p.relative_residual < 1e-7));
}

#[test]
fn beam_checkpoints_reject_invalid_trials_and_never_publish_unconverged_steps() {
    let mut model = cantilever(2);
    model.loads[2][1] = 1e-4;
    let r = solve_load_control(
        &model,
        LoadControl {
            max_iterations: 1,
            ..control()
        },
    )
    .unwrap();
    assert!(!r.completed);
    assert!(r.steps.is_empty());
    assert!(r
        .last_equilibrium
        .displacements
        .iter()
        .flatten()
        .all(|u| *u == 0.0));
    let mut problem = Problem::new(PreparedBeam::new(&model).unwrap()).unwrap();
    problem.u[0] = 1e-5;
    problem.assemble().unwrap();
    problem.accept();
    let accepted = problem.u.clone();
    problem.u[0] = f64::MAX;
    assert!(IncrementalProblem::linearize(&mut problem).is_err());
    IncrementalProblem::rollback(&mut problem);
    assert_eq!(problem.u, accepted);
    // An unloaded global mechanism is still refused before solving the load.
    model.fixed[0][0] = false;
    assert!(solve_load_control(&model, control()).is_err());
}

fn mixed_arc_model() -> (BeamModel2D, ArcControl) {
    let mut model = cantilever(4);
    model.loads[4] = [0.0002, -0.0004, 0.0008];
    (
        model,
        ArcControl {
            steps: 20,
            max_iterations: 40,
            tolerance: 1e-8,
            initial_radius: 0.003,
            min_radius: 0.0001,
            max_radius: 0.003,
            load_weight: 0.02,
        },
    )
}

#[test]
fn arc_metric_with_rotations_is_invariant_to_consistent_unit_changes() {
    let (model, control) = mixed_arc_model();
    let original = solve_arc_length(&model, control).unwrap();
    let mut scaled = model;
    // m,N -> mm,kN: rotations unchanged, moments and energies numerically unchanged.
    for p in &mut scaled.positions {
        for x in p {
            *x *= 1000.0;
        }
    }
    for f in &mut scaled.loads {
        f[0] *= 0.001;
        f[1] *= 0.001;
    }
    for m in &mut scaled.members {
        m.young *= 1e-9;
        m.area *= 1e6;
        m.inertia *= 1e12;
        m.shear_rigidity *= 0.001;
        m.half_depth *= 1000.0;
    }
    let changed = solve_arc_length(
        &scaled,
        ArcControl {
            initial_radius: control.initial_radius * 1000.0,
            min_radius: control.min_radius * 1000.0,
            max_radius: control.max_radius * 1000.0,
            load_weight: control.load_weight * 1000.0,
            ..control
        },
    )
    .unwrap();
    assert!(original.completed && changed.completed);
    assert_eq!(original.steps.len(), changed.steps.len());
    for (a, b) in original.steps.iter().zip(&changed.steps) {
        close(a.load_factor, b.load_factor, 1e-8);
        close(a.energy, b.energy, 1e-10);
        for i in 0..scaled.positions.len() {
            for j in 0..3 {
                let length = if j == 2 { 1.0 } else { 1000.0 };
                let force = if j == 2 { 1.0 } else { 0.001 };
                close(a.displacements[i][j], b.displacements[i][j] / length, 1e-8);
                close(a.reactions[i][j], b.reactions[i][j] / force, 1e-9);
            }
        }
    }
}

#[test]
fn rotating_and_renumbering_a_loaded_beam_preserves_the_arc_path_and_balance() {
    let (model, control) = mixed_arc_model();
    let original = solve_arc_length(&model, control).unwrap();
    let n = model.positions.len();
    // Put an interior node first, so a scale measured from node zero would fail.
    let order = [2, 4, 0, 3, 1];
    let mut transformed = model.clone();
    for i in 0..n {
        let p = model.positions[i];
        let f = model.loads[i];
        transformed.positions[order[i]] = [3.0 - p[1], p[0] - 2.0];
        transformed.loads[order[i]] = [-f[1], f[0], f[2]];
        transformed.fixed[order[i]] = model.fixed[i];
    }
    for m in &mut transformed.members {
        m.nodes = m.nodes.map(|i| order[i]);
    }
    transformed.members.reverse();
    let changed = solve_arc_length(&transformed, control).unwrap();
    assert!(original.completed && changed.completed);
    for (a, b) in original.steps.iter().zip(&changed.steps) {
        close(a.load_factor, b.load_factor, 1e-8);
        close(a.energy, b.energy, 1e-10);
        let mut force = [0.0; 2];
        let mut moment = 0.0;
        for i in 0..n {
            let u = a.displacements[i];
            let r = a.reactions[i];
            let ur = [-u[1], u[0], u[2]];
            let rr = [-r[1], r[0], r[2]];
            for j in 0..3 {
                close(ur[j], b.displacements[order[i]][j], 1e-8);
                close(rr[j], b.reactions[order[i]][j], 1e-9);
            }
            let f: [f64; 3] = std::array::from_fn(|j| r[j] + model.loads[i][j] * a.load_factor);
            force[0] += f[0];
            force[1] += f[1];
            let p = [model.positions[i][0] + u[0], model.positions[i][1] + u[1]];
            moment += p[0] * f[1] - p[1] * f[0] + f[2];
        }
        close(force[0], 0.0, 1e-9);
        close(force[1], 0.0, 1e-9);
        close(moment, 0.0, 1e-9);
    }
}

#[test]
fn support_forces_and_couples_do_not_hide_free_dof_imbalance() {
    let mut model = cantilever(4);
    model.loads[4][2] = 1e-4;
    let a = solve_load_control(&model, control()).unwrap();
    model.loads[0] = [1e200, -1e200, 1e200];
    let b = solve_load_control(&model, control()).unwrap();
    assert!(a.completed && b.completed);
    assert_eq!(a.iterations, b.iterations);
    assert_eq!(
        a.last_equilibrium.displacements,
        b.last_equilibrium.displacements
    );
    assert_eq!(
        a.last_equilibrium.relative_residual,
        b.last_equilibrium.relative_residual
    );
}

#[test]
fn assembly_overflow_and_invalid_model_shapes_are_refused() {
    let mut model = cantilever(1);
    model.loads[1][0] = 1.0;
    model.members[0].young = f64::MAX;
    model.members[0].area = 0.75;
    model.members = vec![model.members[0].clone(); 2];
    assert_eq!(
        solve_load_control(&model, control()).unwrap_err(),
        "Experimental beam assembly exceeds the finite range"
    );
    let mut model = cantilever(1);
    model.loads[1][0] = 1.0;
    model.loads.pop();
    assert!(solve_load_control(&model, control()).is_err());
    model = cantilever(1);
    model.loads[1][0] = 1.0;
    model.members[0].nodes[1] = 2;
    assert!(solve_load_control(&model, control()).is_err());
    model = cantilever(1);
    model.loads[1][0] = f64::NAN;
    assert!(solve_load_control(&model, control()).is_err());
    model = cantilever(1);
    model.loads[1][0] = 1.0;
    model.positions.push([2.0, 0.0]);
    model.fixed.push([false; 3]);
    model.loads.push([0.0; 3]);
    assert!(solve_load_control(&model, control()).is_err());
}
