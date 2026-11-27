use snap_symmetry_vella_2024::{dynamics::Settings, run::page, study::default_settings};

#[test]
fn a_one_clamp_release_samples_both_precritical_windows_inside_its_first_step() {
    let settings = Settings { n: 24, start: 0.27, rate: 0.7, ramp: 0.0, dt: 0.1, one_end: true, imperfection: 0.0, ..default_settings() };
    let run = page(&settings, &mut |_| false).unwrap();
    assert!(settings.start > run.critical.mu_a && run.critical.mu_a > run.critical.mu_star);
    assert!((settings.start - run.critical.mu_star) / settings.rate < settings.dt);
    assert!(run.outcome.snapped);
    assert!(run.outcome.theta_before > 0.0);
    let jump = run.outcome.jump().unwrap();
    assert!(jump.amplification.is_finite() && jump.amplification_from_mu_a.is_finite());
}
