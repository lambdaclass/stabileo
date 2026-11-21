use snap_symmetry_vella_2024::dynamics::{simulate, Settings, Simulation, STOPPER};
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
    let (slow, fast) = (slow.outcome.jump().unwrap(), fast.outcome.jump().unwrap());
    assert!(slow.amplification > 10.0, "{slow:?}");
    assert!(fast.amplification < 2.0, "{fast:?}");
    assert!(fast.mu_snap < slow.mu_snap);
}

#[test]
fn moving_one_end_excites_the_antisymmetric_mode() {
    let sim = run(Settings { imperfection: 0.0, one_end: true, rate: 0.05, ..base() });
    assert!(sim.outcome.theta_before > 1e-5, "{:?}", sim.outcome);
    assert!(sim.outcome.jump().unwrap().amplification > 2.0, "{:?}", sim.outcome);
}

#[test]
fn halving_the_step_changes_the_amplification_little() {
    let coarse = run(Settings { rate: 0.05, ..base() });
    let fine = run(Settings { rate: 0.05, dt: 0.005, ..base() });
    let change = (coarse.outcome.jump().unwrap().amplification / fine.outcome.jump().unwrap().amplification - 1.0).abs();
    assert!(change < 0.05, "{change}");
}

#[test]
fn settings_outside_the_domain_are_refused() {
    let (start, c) = prepared();
    for s in [Settings { rate: f64::NAN, ..base() }, Settings { n: 25, ..base() }, Settings { hht: 0.1, ..base() }, Settings { imperfection: 0.5, ..base() }] {
        assert!(simulate(&s, start, c.mu_star, c.mu_a, &mut |_| false).is_err());
    }
}

#[test]
fn a_run_without_time_after_the_jump_still_ends_at_its_first_height_maximum() {
    for (rate, one_end) in [(0.05, false), (0.3, false), (0.05, true)] {
        let sim = run(Settings { rate, one_end, imperfection: if one_end { 0.0 } else { 1e-3 }, after: 0.0, ..base() });
        let o = sim.outcome.jump().unwrap();
        assert!(o.t_end >= o.t_snap, "{o:?}");
        let full = run(Settings { rate, one_end, imperfection: if one_end { 0.0 } else { 1e-3 }, ..base() }).outcome.jump().unwrap();
        assert_eq!(o.amplification, full.amplification, "µ̇ = {rate}, one end {one_end}");
        assert_eq!(o.t_end, full.t_end);
    }
}

#[test]
fn a_stopper_reached_before_the_snap_does_not_end_the_jump_window() {
    let sim = run(Settings { rate: 3.0, after: 0.0, ..base() });
    let o = sim.outcome.jump().unwrap();
    assert!(o.mu_snap < STOPPER, "the clamps should have started braking before the crossing: {o:?}");
    assert!(o.t_end > o.t_snap, "{o:?}");
    let peak = sim.trace.height.iter().cloned().fold(f64::MIN, f64::max);
    assert!(sim.trace.height.last().unwrap() < &peak, "the run ended while the height was still rising");
}
