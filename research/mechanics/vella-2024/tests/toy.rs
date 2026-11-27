use snap_symmetry_vella_2024::toy::Toy;

#[test]
fn toy_constants_reproduce_the_published_bifurcations_and_frequencies() {
    let t = Toy::paper();
    let (fold, _) = t.fold();
    assert!((fold / 0.247 - 1.0).abs() < 5e-3, "{fold}");
    assert!((t.mu_a() / 0.25 - 1.0).abs() < 5e-3);
    let (s, a) = t.frequencies(0.25);
    assert!((s - 0.663).abs() < 1e-3, "{s}");
    assert!((a / 0.734 - 1.0).abs() < 5e-3, "{a}");
    assert!((t.t_osc() / 9.477 - 1.0).abs() < 1e-3);
}

#[test]
fn the_toy_amplifies_only_below_a_critical_rate() {
    let t = Toy::paper();
    let c = t.critical_rate();
    assert!(c > 0.09 && c < 0.12, "{c}");
    assert!(t.run(0.5 * c, 1e-9, 0.0).0 < 0.0);
    assert!(t.run(2.0 * c, 1e-9, 0.0).0 > 0.0);
}
