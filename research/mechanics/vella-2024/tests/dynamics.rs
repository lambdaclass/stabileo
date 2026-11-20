use snap_symmetry_vella_2024::dynamics::{simulate, Settings, Simulation};
use snap_symmetry_vella_2024::model::Strip;
use snap_symmetry_vella_2024::statics::{critical, invert, natural, Critical, Equilibrium};
use std::f64::consts::PI;
use std::sync::OnceLock;

fn base() -> Settings {
    Settings { alpha: PI / 12.0, n: 24, slenderness: 2126.0, rate: 0.05, start: 0.6, one_end: false, ramp: 0.58, imperfection: 1e-3, phase: 0.0, dt: 0.01, hht: -0.1, after: 0.5 }
}

fn prepared() -> &'static (Equilibrium, Critical) {
    static CELL: OnceLock<(Equilibrium, Critical)> = OnceLock::new();
    CELL.get_or_init(|| {
        let s = base();
        let strip = Strip { n: s.n, alpha: s.alpha, slenderness: s.slenderness };
        let a2 = s.alpha * s.alpha;
        let up = natural(&strip, s.start * a2).unwrap();
        let (_, down) = invert(&strip, &up, false).unwrap();
        let (c, _) = critical(&strip, &down).unwrap();
        (down, c)
    })
}

fn run(s: Settings) -> Simulation {
    let (start, c) = prepared();
    simulate(&s, start, c.mu_star, c.mu_a, &mut |_| false).unwrap()
}

#[test]
fn both_ends_without_a_seed_stay_symmetric() {
    let sim = run(Settings { imperfection: 0.0, rate: 0.2, ..base() });
    assert!(sim.outcome.snapped);
    let worst = sim.frames.iter().map(|f| f.theta.abs()).fold(0.0, f64::max);
    assert!(worst < 1e-9, "{worst}");
}

#[test]
fn slow_release_amplifies_the_seed_and_fast_release_does_not() {
    let slow = run(Settings { rate: 0.01, ..base() });
    let fast = run(Settings { rate: 0.3, ..base() });
    assert!(slow.outcome.amplification > 10.0, "{:?}", slow.outcome);
    assert!(fast.outcome.amplification < 2.0, "{:?}", fast.outcome);
    assert!(fast.outcome.mu_snap < slow.outcome.mu_snap);
}

#[test]
fn moving_one_end_excites_the_antisymmetric_mode() {
    let sim = run(Settings { imperfection: 0.0, one_end: true, rate: 0.05, ..base() });
    assert!(sim.outcome.theta_before > 1e-5, "{:?}", sim.outcome);
    assert!(sim.outcome.amplification > 2.0, "{:?}", sim.outcome);
}

#[test]
fn halving_the_step_changes_the_amplification_little() {
    let coarse = run(Settings { rate: 0.05, ..base() });
    let fine = run(Settings { rate: 0.05, dt: 0.005, ..base() });
    let change = (coarse.outcome.amplification / fine.outcome.amplification - 1.0).abs();
    assert!(change < 0.05, "{change}");
}

#[test]
fn settings_outside_the_domain_are_refused() {
    let (start, c) = prepared();
    for s in [Settings { rate: f64::NAN, ..base() }, Settings { n: 25, ..base() }, Settings { hht: 0.1, ..base() }, Settings { imperfection: 0.5, ..base() }] {
        assert!(simulate(&s, start, c.mu_star, c.mu_a, &mut |_| false).is_err());
    }
}
