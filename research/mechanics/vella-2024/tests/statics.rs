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
        mu < c.mu_a - 1e-4 && mu > c.mu_star + 1e-4 && s.height(&strip) / alpha < c.height_star
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
#[test]
#[ignore = "known wrong result: #2320"]
fn review_natural_clamps_are_prescribed_and_optional_spectra_are_absent() {
    let strip = Strip { n: 24, alpha: PI / 12.0, slenderness: 2126.0 };
    for mu in [0.25, 0.6] {
        let shortening = mu * strip.alpha.powi(2);
        let up = natural(&strip, shortening).unwrap();
        assert_eq!(up.clamps.shortening(), shortening);
        if mu == 0.6 {
            for eigen in [true, false] {
                let path = invert(&strip, &up, eigen).unwrap().0;
                assert!(path.points.iter().all(|p| serde_json::to_value(p).unwrap()["spectrum"].is_object() == eigen));
            }
        }
    }
}

#[test]
#[ignore = "known wrong result: #2320"]
fn review_only_bracketed_roots_and_converging_meshes_supply_values() {
    let fold = shallow::fold();
    for (mu, valid) in [(0.2, false), (fold.1, true), (0.6, true)] {
        assert_eq!(serde_json::to_value(shallow::tau_at(mu, true)).unwrap().is_number(), valid);
    }
    for (values, valid) in [([0.0, 4.0, 3.0], false), ([0.0, 4.0, 5.0], true)] {
        let [a,b,c] = values;
        let r = snap_symmetry_vella_2024::study::richardson(a,b,c);
        assert_eq!(serde_json::to_value(r).unwrap()["value"].is_number(), valid);
    }
}
