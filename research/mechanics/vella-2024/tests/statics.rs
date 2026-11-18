use snap_symmetry_vella_2024::model::{Assembler, Strip};
use snap_symmetry_vella_2024::shallow;
use snap_symmetry_vella_2024::spectrum::{mirror_stable, spectrum};
use snap_symmetry_vella_2024::statics::{critical, invert, natural, settle};
use std::f64::consts::PI;

#[test]
fn shallow_theory_reproduces_the_published_constants() {
    let tau = shallow::tau_asymmetric();
    assert!((tau - 8.987).abs() < 5e-4, "{tau}");
    assert!((shallow::mu(tau) - 0.25).abs() < 1e-12);
    let (t_fold, mu_fold) = shallow::fold();
    assert!((t_fold - 9.203).abs() < 5e-4, "{t_fold}");
    assert!((mu_fold - 0.247).abs() < 5e-4, "{mu_fold}");
    assert!(mu_fold < 0.25);
}

#[test]
fn small_angle_branches_follow_the_shallow_heights() {
    let alpha = 0.02;
    let strip = Strip { n: 48, alpha, slenderness: 2e4 };
    let up = natural(&strip, 0.6 * alpha * alpha).unwrap();
    let (_, down) = invert(&strip, &up, false).unwrap();
    let exact_up = shallow::height(shallow::tau_at(0.6, false));
    let exact_down = shallow::height(shallow::tau_at(0.6, true));
    assert!((up.height(&strip) / alpha / exact_up - 1.0).abs() < 2e-3);
    assert!((down.height(&strip) / alpha / exact_down - 1.0).abs() < 2e-3);
}

#[test]
fn the_inverted_state_loses_stability_to_an_antisymmetric_mode_before_its_fold() {
    let alpha = PI / 12.0;
    let strip = Strip { n: 24, alpha, slenderness: 2126.0 };
    let a2 = alpha * alpha;
    let up = natural(&strip, 0.6 * a2).unwrap();
    let (_, down) = invert(&strip, &up, false).unwrap();
    let (c, path) = critical(&strip, &down).unwrap();
    assert!(c.mu_a > c.mu_star + 0.002, "{c:?}");
    let between = path.states.iter().find(|s| {
        let mu = s.clamps.shortening() / a2;
        mu < c.mu_a - 1e-4 && mu > c.mu_star + 1e-4 && s.height(&strip) < c.height_star
    });
    let between = settle(&strip, &mut Assembler::new(&strip), between.unwrap()).unwrap();
    let mut assembler = Assembler::new(&strip);
    assert!(mirror_stable(&strip, &mut assembler, &between.q, 1.0));
    assert!(!mirror_stable(&strip, &mut assembler, &between.q, -1.0));
    let s = spectrum(&strip, &mut assembler, &between.q);
    assert!(s.omega2_antisymmetric < 0.0 && s.omega2_symmetric > 0.0, "{s:?}");
    for state in &path.states {
        let n = strip.n;
        let asymmetry = (0..=n).map(|i| (state.q[3 * i + 1] - state.q[3 * (n - i) + 1]).abs()).fold(0.0, f64::max);
        assert!(asymmetry < 1e-12);
    }
}
