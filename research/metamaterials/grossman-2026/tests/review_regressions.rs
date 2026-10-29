use springs_grossman_2026::{experiment::{run_periodic, PeriodicSpec}, moduli};

#[test]
fn oversized_json_specs_fail_before_building() {
    // Includes wasm32 multiplication overflow, native overflow, and excessive basis nodes/bonds.
    for (lattice, n1, n2) in [
        (r#"{"kind":"square","diagonals":true}"#, 60_001, 3),
        (r#"{"kind":"square","diagonals":false}"#, 65_536, 65_536),
        (r#"{"kind":"square","diagonals":false}"#, usize::MAX, 3),
        (r#"{"kind":"honeycomb","l":0.25,"k_radial":0.001}"#, 150, 150),
    ] {
        let json = format!(r#"{{"network":{{"lattice":{lattice}}},"n1":{n1},"n2":{n2}}}"#);
        let spec: PeriodicSpec = serde_json::from_str(&json).unwrap();
        let start = std::time::Instant::now();
        let error = run_periodic(&spec).unwrap_err();
        assert!(error.contains("limit") || error.contains("overflow"), "{error}");
        assert!(start.elapsed().as_secs_f64() < 1.0);
    }
}

#[test]
fn square_lattice_supports_axial_loads_but_not_shear_loading() {
    let spec: PeriodicSpec = serde_json::from_str(r#"{"network":{"lattice":{"kind":"square","diagonals":false}},"n1":4,"n2":4}"#).unwrap();
    let result = run_periodic(&spec).unwrap();
    for angle in [0.0, std::f64::consts::FRAC_PI_2, std::f64::consts::PI] {
        let (young, poisson) = moduli::uniaxial(&result.c, angle).unwrap();
        assert!((young - 1.0).abs() < 1e-10);
        assert!(poisson.abs() < 1e-10);
    }
    assert!(result.c[2][2].abs() < 1e-10);
    assert!(moduli::uniaxial(&result.c, std::f64::consts::FRAC_PI_4).is_none());
    // A transverse floppy mode makes Poisson's ratio indeterminate.
    assert!(moduli::uniaxial_x(&[[1.0, 0.0, 0.0], [0.0; 3], [0.0; 3]]).is_none());
}

#[test]
fn oversized_json_strips_fail_before_building() {
    use springs_grossman_2026::experiment::{run_strip, StripSpec};
    for width in [100_000.0, 1e100] {
        let json = format!(r#"{{"network":{{"lattice":{{"kind":"square","diagonals":true}}}},"width":{width},"height":100,"theta":0,"clamp_band":0.5,"strain":0.01}}"#);
        let spec: StripSpec = serde_json::from_str(&json).unwrap();
        let start = std::time::Instant::now();
        let error = run_strip(&spec).unwrap_err();
        assert!(error.contains("limit") || error.contains("overflow"), "{error}");
        assert!(start.elapsed().as_secs_f64() < 1.0);
    }
}

#[test]
fn mechanism_bearing_strips_have_indeterminate_poisson_ratio() {
    use springs_grossman_2026::experiment::{run_strip, StripSpec};
    for (diagonals, keep) in [(false, 1.0), (true, 0.3), (true, 1.0)] {
        let spec: StripSpec = serde_json::from_value(serde_json::json!({
            "network": {"lattice": {"kind": "square", "diagonals": diagonals}, "keep": keep},
            "width": 8.0, "height": 8.0, "theta": 0.0, "clamp_band": 0.5, "strain": 0.01
        })).unwrap();
        let result = run_strip(&spec).unwrap();
        assert_eq!(result.poisson.is_finite(), diagonals && keep == 1.0);
        if !result.poisson.is_finite() {
            assert!(serde_json::to_value(result).unwrap()["poisson"].is_null());
        }
    }
}

#[test]
fn compressed_bonds_keep_axial_stiffness_during_relaxation() {
    use springs_grossman_2026::{network::{Bond, Network}, solve};
    for rest in [1.1, 3.0] {
        let net = Network {
            nodes: vec![[0.0, 0.0], [1.0, 0.0]], cell: None,
            bonds: vec![Bond { a: 0, b: 1, shift: [0, 0], k: 1.0, rest }],
        };
        let result = solve::relax(&net, &net.nodes, &[true, false], 1e-10, 100).unwrap();
        assert!((result.positions[1][0] - rest).abs() < 1e-9);
        assert!(result.energy < 1e-18);
        assert!(result.residual < 1e-10);
    }
}

#[test]
fn nearly_parallel_springs_match_the_kinematic_solution() {
    use springs_grossman_2026::{network::{Bond, Network}, solve};
    for slope in [1e-4_f64, 1e-5, 1e-6] {
        let net = Network {
            nodes: vec![[0.0, 0.0], [1.0, slope], [1.0, -slope]], cell: None,
            bonds: (1..=2).map(|b| Bond { a: 0, b, shift: [0, 0], k: 1.0, rest: 1.0_f64.hypot(slope) }).collect(),
        };
        let response = solve::finite_response(&net, &net.nodes, &[false, true, true], &[[0.0; 2], [1.0, 0.0], [-1.0, 0.0]]).unwrap();
        assert!(response.full_rank);
        assert!(response.u[0][0].abs() < 1e-10);
        assert!((response.u[0][1] * slope - 1.0).abs() < 1e-10);
        assert!(response.force.iter().all(|f| f.abs() < 1e-10));
    }
}

#[test]
fn uniform_stiffness_scaling_preserves_network_response() {
    use springs_grossman_2026::experiment::{run_strip, StripSpec};
    for k in [1e-16, 1e-8, 1.0, 1e8, 1e16] {
        let network = serde_json::json!({"lattice": {"kind": "triangular", "phi": 1.0, "psi": 1.0}, "k": k});
        let periodic: PeriodicSpec = serde_json::from_value(serde_json::json!({"network": network, "n1": 4, "n2": 4})).unwrap();
        let result = run_periodic(&periodic).unwrap();
        assert!((result.isotropic.bulk / k - 3f64.sqrt() / 2.0).abs() < 1e-10);
        assert!((result.isotropic.shear / k - 3f64.sqrt() / 4.0).abs() < 1e-10);
        let strip: StripSpec = serde_json::from_value(serde_json::json!({"network": network,
            "width": 8.0, "height": 8.0, "theta": 0.0, "clamp_band": 0.5, "strain": 0.01})).unwrap();
        let response = run_strip(&strip).unwrap();
        let mut unit = strip;
        unit.network.k = 1.0;
        let expected = run_strip(&unit).unwrap();
        assert!((response.poisson - expected.poisson).abs() < 1e-9);
        for (actual, expected) in response.force.iter().zip(&expected.force) {
            assert!((actual / k - expected).abs() < 1e-10);
        }
    }
}
