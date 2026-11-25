use super::super::super::{IterationMethod, LoadStepping};
use super::*;

fn close(a: f64, b: f64, tol: f64) {
    assert!((a - b).abs() <= tol, "{a:e} != {b:e}, tolerance {tol:e}");
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
fn column(n: usize) -> BeamModel2D {
    let mut m = BeamModel2D {
        positions: (0..=n).map(|i| [0.0, i as f64 / n as f64]).collect(),
        fixed: vec![[false; 3]; n + 1],
        loads: vec![[0.0; 3]; n + 1],
        members: (0..n).map(|i| member(i, i + 1)).collect(),
    };
    m.fixed[0] = [true, true, false];
    m.fixed[n] = [true, false, false];
    m.loads[n][1] = -1.2 * std::f64::consts::PI.powi(2) * 0.01;
    m
}
fn control() -> LoadControl {
    LoadControl {
        increments: 12,
        max_iterations: 40,
        tolerance: 1e-8,
        method: IterationMethod::Newton,
        stepping: LoadStepping::Equal,
    }
}
fn refinement() -> Refinement {
    Refinement {
        interval_tolerance: 1e-3,
        ..Refinement::default()
    }
}

#[test]
fn spectrum_requires_a_verified_complete_basis_and_resolves_only_definite_signs() {
    for factor in [1e-300, 1.0, 1e300] {
        let a = spectrum(&[factor, 0.0, 0.0, 2.0 * factor], 2, 64).0;
        assert_eq!(a.verdict, Verdict::Stable);
        close(a.minimum.unwrap(), 1.0 / 5.0_f64.sqrt(), 1e-14);
        let b = spectrum(&[-factor, 0.0, 0.0, 2.0 * factor], 2, 64).0;
        assert_eq!(b.verdict, Verdict::Unstable);
        assert_eq!(b.negative_modes, 1);
    }
    assert_eq!(
        spectrum(&[1e-16, 0.0, 0.0, 1.0], 2, 64).0.verdict,
        Verdict::Undetermined
    );
    assert_eq!(
        spectrum(&[2.0, 1.0, 1.0, 2.0], 2, 0).0.reason,
        Reason::UnverifiedSpectrum
    );
    assert_eq!(
        spectrum(&[1.0, 1.0, 0.0, 1.0], 2, 64).0.reason,
        Reason::AsymmetricTangent
    );
    for bad in [f64::NAN, f64::INFINITY] {
        assert_eq!(spectrum(&[bad], 1, 64).0.reason, Reason::NonFiniteSpectrum);
    }
    assert_eq!(spectrum(&[0.0], 1, 64).0.verdict, Verdict::Undetermined);
    assert_eq!(spectrum(&[], 241, 64).0.verdict, Verdict::Undetermined);
}

#[test]
fn converged_column_can_be_unstable_and_postprocessing_does_not_change_results() {
    let model = column(8);
    let path = solve_load_control(&model, control()).unwrap();
    assert!(path.completed);
    let before = format!("{path:?}");
    let states = diagnose_path(&model, &path, 1e-8).unwrap();
    assert_eq!(states.first().unwrap().stability.verdict, Verdict::Stable);
    assert_eq!(states.last().unwrap().stability.verdict, Verdict::Unstable);
    for (point, checked) in path.steps.iter().zip(&states) {
        assert_eq!(format!("{point:?}"), format!("{:?}", checked.equilibrium));
    }
    assert_eq!(before, format!("{path:?}"));
    assert_eq!(
        before,
        format!("{:?}", solve_load_control(&model, control()).unwrap())
    );
}

#[test]
fn stored_convergence_and_support_reactions_cannot_forge_a_stable_state() {
    let mut model = column(4);
    let mut path = solve_load_control(&model, control()).unwrap();
    path.steps[0].displacements[2][0] = 0.001;
    path.steps[0].relative_residual = 0.0;
    model.loads[0] = [1e200, 1e200, 0.0];
    let states = diagnose_path(&model, &path, 1e-8).unwrap();
    assert_eq!(states[0].stability.reason, Reason::NotEquilibrated);
    assert_eq!(states[0].stability.verdict, Verdict::Undetermined);
    assert!(states[0].stability.mode.is_none());
    assert!(locate_first_loss(&model, &path, refinement()).is_err());
    path.steps[0].displacements[0][0] = 1e-3;
    assert!(diagnose_path(&model, &path, 1e-8).is_err());
}

#[test]
fn perfect_column_loss_is_localized_with_a_bifurcation_indicator_and_a_sine_mode() {
    let model = column(8);
    let path = solve_load_control(&model, control()).unwrap();
    let found = locate_first_loss(&model, &path, refinement())
        .unwrap()
        .unwrap();
    eprintln!(
        "Column critical: {:?}, {:?}, lambda {}, width {}, uncertainty {:?}",
        found.resolution,
        found.kind,
        found.near_critical.equilibrium.load_factor,
        found.interval_size,
        found.near_critical.stability.uncertainty
    );
    assert_eq!(found.resolution, Localization::Bracketed);
    assert_eq!(found.kind, CriticalKind::BifurcationCandidate);
    assert_eq!(found.stable.stability.verdict, Verdict::Stable);
    assert_eq!(found.unstable.stability.verdict, Verdict::Unstable);
    // Previous independent tangent/Cholesky mesh study: n=8, Pcrit/Peuler=1.0260543.
    close(
        found.near_critical.equilibrium.load_factor,
        1.0260543005 / 1.2,
        0.001,
    );
    let mode = found.near_critical.stability.mode.unwrap();
    close(mode.translations[4][0].abs(), 1.0, 1e-8);
    for (i, point) in mode.translations.iter().enumerate() {
        close(
            point[0].abs(),
            (std::f64::consts::PI * i as f64 / 8.0).sin(),
            0.005,
        );
    }
    assert!(found.near_critical.stability.load_coupling.unwrap() < 1e-6);
}

#[test]
fn unresolved_refinement_never_promotes_an_unknown_sign_to_stable() {
    let model = column(8);
    let path = solve_load_control(&model, control()).unwrap();
    let found = locate_first_loss(
        &model,
        &path,
        Refinement {
            max_refinements: 1,
            interval_tolerance: 1e-12,
            ..refinement()
        },
    )
    .unwrap()
    .unwrap();
    assert_ne!(found.resolution, Localization::Bracketed);
    assert_eq!(found.kind, CriticalKind::Unresolved);
    assert_eq!(found.stable.stability.verdict, Verdict::Stable);
    assert_eq!(found.unstable.stability.verdict, Verdict::Unstable);
    let found = locate_first_loss(
        &model,
        &path,
        Refinement {
            interval_tolerance: 1e-14,
            ..refinement()
        },
    )
    .unwrap()
    .unwrap();
    assert_ne!(found.resolution, Localization::Bracketed);
    assert_eq!(found.kind, CriticalKind::Unresolved);
}

#[test]
fn geometric_imperfections_have_a_physical_amplitude_and_preserve_supports_and_loads() {
    let model = column(8);
    let path = solve_load_control(&model, control()).unwrap();
    let found = locate_first_loss(&model, &path, refinement())
        .unwrap()
        .unwrap();
    let mode = found.near_critical.stability.mode.unwrap();
    for amplitude in [-1e-4, 0.0, 1e-5, 1e-4] {
        let result = with_imperfection(&model, &mode.translations, amplitude).unwrap();
        let peak = result
            .offsets
            .iter()
            .map(|p| p[0].hypot(p[1]))
            .fold(0.0_f64, f64::max);
        close(peak, amplitude.abs(), 1e-12);
        assert_eq!(result.model.fixed, model.fixed);
        assert_eq!(result.model.loads, model.loads);
        assert_eq!(
            format!("{:?}", result.model.members),
            format!("{:?}", model.members)
        );
        assert_eq!(result.model.positions[0], model.positions[0]);
        assert_eq!(result.model.positions[8][0], model.positions[8][0]);
        let at = PreparedBeam::new(&result.model)
            .unwrap()
            .assemble(&vec![0.0; 24], 0.0)
            .unwrap();
        close(at.equilibrium.energy, 0.0, 0.0);
    }
    let mut shape = mode.translations.clone();
    shape[0][0] = 1.0;
    assert!(with_imperfection(&model, &shape, 1e-4).is_err());
    assert!(with_imperfection(&model, &vec![[0.0; 2]; 9], 1e-4).is_err());
    assert!(with_imperfection(&model, &mode.translations, f64::INFINITY).is_err());
    let mut moved = model;
    for p in &mut moved.positions {
        p[0] += 1e10;
    }
    assert!(with_imperfection(&moved, &mode.translations, 1e-8).is_err());
}

#[test]
fn modal_imperfections_show_signed_amplitude_sensitivity_under_compression() {
    let mut model = column(8);
    let path = solve_load_control(&model, control()).unwrap();
    let mode = locate_first_loss(&model, &path, refinement())
        .unwrap()
        .unwrap()
        .near_critical
        .stability
        .mode
        .unwrap();
    model.loads[8][1] *= 0.5; // safely on the precritical branch
    let mut deflections = Vec::new();
    for amplitude in [-1e-4, 1e-4, 2e-4] {
        let imperfect = with_imperfection(&model, &mode.translations, amplitude).unwrap();
        let path = solve_load_control(&imperfect.model, control()).unwrap();
        assert!(path.completed);
        let final_state = diagnose_state(
            &imperfect.model,
            1.0,
            &path.last_equilibrium.displacements,
            1e-8,
        )
        .unwrap();
        assert_eq!(final_state.stability.verdict, Verdict::Stable);
        deflections.push(path.last_equilibrium.displacements[4][0]);
    }
    close(deflections[0], -deflections[1], 1e-10);
    close(deflections[2] / deflections[1], 2.0, 0.002);
}

fn arch() -> BeamModel2D {
    let n = 6;
    let mut model = BeamModel2D {
        positions: (0..=n)
            .map(|i| {
                let x = i as f64 / n as f64;
                [x, 0.1 * (std::f64::consts::FRAC_PI_2 * x).sin()]
            })
            .collect(),
        fixed: vec![[false; 3]; n + 1],
        loads: vec![[0.0; 3]; n + 1],
        members: (0..n).map(|i| member(i, i + 1)).collect(),
    };
    model.fixed[0] = [true, true, false];
    model.fixed[n] = [true, false, true];
    model.loads[n][1] = -0.5;
    model
}

#[test]
fn a_symmetric_half_arch_has_a_limit_point_and_is_re_equilibrated_during_refinement() {
    let model = arch();
    let path = solve_arc_length(
        &model,
        ArcControl {
            steps: 80,
            max_iterations: 40,
            tolerance: 1e-7,
            initial_radius: 0.005,
            min_radius: 0.0001,
            max_radius: 0.005,
            load_weight: 0.05,
        },
    )
    .unwrap();
    assert!(path.completed, "steps {}", path.steps.len());
    let found = locate_first_loss(
        &model,
        &path,
        Refinement {
            equilibrium_tolerance: 1e-7,
            ..refinement()
        },
    )
    .unwrap()
    .unwrap();
    eprintln!(
        "Arch critical: {:?}, {:?}, lambda {}, width {}",
        found.resolution,
        found.kind,
        found.near_critical.equilibrium.load_factor,
        found.interval_size
    );
    assert_eq!(found.resolution, Localization::Bracketed);
    assert_eq!(found.kind, CriticalKind::LimitPointCandidate);
    assert!(found.near_critical.equilibrium.relative_residual < 1e-7);
    assert!(found.near_critical.stability.load_coupling.unwrap() > 0.01);
    let peak = path
        .steps
        .iter()
        .map(|p| p.load_factor)
        .fold(0.0_f64, f64::max);
    close(found.near_critical.equilibrium.load_factor, peak, 0.005);
    let failed = locate_first_loss(
        &model,
        &path,
        Refinement {
            max_corrector_iterations: 1,
            equilibrium_tolerance: 1e-7,
            ..refinement()
        },
    )
    .unwrap()
    .unwrap();
    assert_eq!(failed.resolution, Localization::CorrectionFailed);
    assert!(failed.corrector_error.is_some());
    assert_eq!(failed.kind, CriticalKind::Unresolved);
    assert_eq!(failed.stable.stability.verdict, Verdict::Stable);
    assert_eq!(failed.unstable.stability.verdict, Verdict::Unstable);
}

#[test]
fn diagnostics_and_critical_loads_are_invariant_to_consistent_units_and_rigid_rotation() {
    let model = column(8);
    let path = solve_load_control(&model, control()).unwrap();
    let reference = locate_first_loss(&model, &path, refinement())
        .unwrap()
        .unwrap();
    let mut scaled = model.clone();
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
    let scaled_path = solve_load_control(&scaled, control()).unwrap();
    let found = locate_first_loss(&scaled, &scaled_path, refinement())
        .unwrap()
        .unwrap();
    assert_eq!(reference.resolution, found.resolution);
    assert_eq!(reference.kind, found.kind);
    close(
        reference.near_critical.equilibrium.load_factor,
        found.near_critical.equilibrium.load_factor,
        1e-8,
    );
    let old = diagnose_path(&model, &path, 1e-8).unwrap();
    let new = diagnose_path(&scaled, &scaled_path, 1e-8).unwrap();
    for (a, b) in old.iter().zip(&new) {
        assert_eq!(a.stability.verdict, b.stability.verdict);
        close(
            a.stability.minimum.unwrap(),
            b.stability.minimum.unwrap(),
            1e-12,
        );
    }
    let mut rotated = model.clone();
    for p in &mut rotated.positions {
        *p = [3.0 - p[1], p[0] - 2.0];
    }
    for f in &mut rotated.loads {
        *f = [-f[1], f[0], f[2]];
    }
    for fixed in &mut rotated.fixed {
        fixed.swap(0, 1);
    }
    for a in old {
        let moved: Vec<_> = a
            .equilibrium
            .displacements
            .iter()
            .map(|u| [-u[1], u[0], u[2]])
            .collect();
        let b = diagnose_state(&rotated, a.equilibrium.load_factor, &moved, 1e-8).unwrap();
        assert_eq!(a.stability.verdict, b.stability.verdict);
        close(
            a.stability.minimum.unwrap(),
            b.stability.minimum.unwrap(),
            1e-12,
        );
    }
}

#[test]
fn a_loaded_portal_frame_and_its_imperfect_geometry_have_checked_local_stability() {
    let model = BeamModel2D {
        positions: vec![[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0]],
        fixed: vec![[true; 3], [false; 3], [false; 3], [true; 3]],
        loads: vec![
            [0.0; 3],
            [0.0001, -0.005, 0.0],
            [0.0001, -0.005, 0.0],
            [0.0; 3],
        ],
        members: vec![member(0, 1), member(1, 2), member(2, 3)],
    };
    for amplitude in [0.0, 0.001, -0.001] {
        let imperfect = with_imperfection(
            &model,
            &[[0.0; 2], [1.0, 0.0], [1.0, 0.0], [0.0; 2]],
            amplitude,
        )
        .unwrap();
        let path = solve_load_control(&imperfect.model, control()).unwrap();
        assert!(path.completed);
        let states = diagnose_path(&imperfect.model, &path, 1e-8).unwrap();
        assert!(states
            .iter()
            .all(|s| s.stability.verdict == Verdict::Stable));
        assert!(locate_first_loss(&imperfect.model, &path, refinement())
            .unwrap()
            .is_none());
    }
}

#[test]
fn malformed_states_controls_and_unrepresentable_imperfections_fail_closed() {
    let model = column(4);
    let u = vec![[0.0; 3]; 5];
    for bad in [f64::NAN, f64::INFINITY] {
        assert!(diagnose_state(&model, bad, &u, 1e-8).is_err());
        assert!(diagnose_state(&model, 0.0, &u, bad).is_err());
    }
    assert!(diagnose_state(&model, 0.0, &u, 0.01).is_err());
    assert!(diagnose_state(&model, 0.0, &u[..4], 1e-8).is_err());
    let mut bad = u.clone();
    bad[2][0] = f64::NAN;
    assert!(diagnose_state(&model, 0.0, &bad, 1e-8).is_err());
    let path = solve_load_control(&model, control()).unwrap();
    assert!(locate_first_loss(
        &model,
        &path,
        Refinement {
            max_refinements: 0,
            ..refinement()
        }
    )
    .is_err());
    let mut too_long = path.clone();
    too_long.steps = vec![path.steps[0].clone(); 1001];
    assert!(diagnose_path(&model, &too_long, 1e-8).is_err());
    let mut shape = vec![[0.0; 2]; 5];
    shape[2][0] = f64::MAX;
    shape[2][1] = f64::MAX;
    assert!(with_imperfection(&model, &shape, 1e-4).is_err());
    shape[2] = [f64::NAN, 0.0];
    assert!(with_imperfection(&model, &shape, 1e-4).is_err());
}
