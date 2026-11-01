use dedaliano_engine::{solver::linear::solve_3d, types::SolverInput3D};
use form_finding_pastrana_2026::{engine_input, four_bar, solve, Net};
use serde_json::{json, Value};

#[test]
fn reference_equilibrium_and_production_engine() {
    let reference: Vec<Value> =
        serde_json::from_str(include_str!("../reference-results/four_bar.json")).unwrap();
    let mut checks = Vec::new();
    for case in reference {
        let q = case["q"].as_f64().unwrap();
        let load = case["load"].as_f64().unwrap();
        let form = four_bar(q, load).unwrap();
        let mut position_error: f64 = 0.;
        let mut force_error: f64 = 0.;
        for i in 0..5 {
            for d in 0..3 {
                position_error = position_error
                    .max((form.nodes[i][d] - case["nodes"][i][d].as_f64().unwrap()).abs());
            }
        }
        for i in 0..4 {
            force_error =
                force_error.max((form.forces[i] - case["forces"][i].as_f64().unwrap()).abs());
        }
        let input: SolverInput3D = serde_json::from_value(engine_input(&form)).unwrap();
        let result = solve_3d(&input).unwrap();
        let engine_error = result
            .element_forces
            .iter()
            .map(|f| (f.n_start - form.forces[f.element_id - 1]).abs())
            .fold(0., f64::max);
        let d = result
            .displacements
            .iter()
            .find(|d| d.node_id == 1)
            .unwrap();
        let h = load / (4. * q);
        let length = (8. + h * h).sqrt();
        let exact_uz = -load * length.powi(3) / (4. * 200000. * h * h);
        for (metric, observed, tolerance) in [
            ("jax_fdm positions (m)", position_error, 1e-12),
            ("jax_fdm tension (kN)", force_error, 1e-12),
            ("free-node equilibrium (kN)", form.residual, 1e-12),
            (
                "Eq. (7) coordinate (m)",
                (form.nodes[0][2] + h).abs(),
                1e-12,
            ),
            ("production truss axial force (kN)", engine_error, 1e-9),
            (
                "production truss displacement (m)",
                (d.uz - exact_uz).abs(),
                1e-12,
            ),
        ] {
            checks.push(json!({"metric":format!("{metric}; q={q}, P={load}"),"observed":observed,"tolerance":tolerance,"passed":observed.is_finite() && observed <= tolerance}));
        }
    }
    assert!(checks.iter().all(|c| c["passed"] == true), "{checks:#?}");
    let evidence = json!({"scope":"Fig. 2 topology and Eq. (7), explicitly chosen inputs; no published numerical dataset or adjoints", "checks":checks});
    if std::env::var_os("WRITE_VALIDATION").is_some() {
        std::fs::write(
            concat!(env!("CARGO_MANIFEST_DIR"), "/VALIDATION.json"),
            serde_json::to_string_pretty(&evidence).unwrap() + "\n",
        )
        .unwrap();
    }
}

fn chain() -> Net {
    Net {
        nodes: vec![[0.; 3], [0.; 3], [3., 0., 0.]],
        fixed: vec![true, false, true],
        edges: vec![[0, 1], [1, 2]],
        densities: vec![1., 2.],
        loads: vec![[0.; 3], [0., 0., -3.], [0.; 3]],
    }
}
#[test]
fn unequal_densities_and_multiple_free_nodes() {
    let mut net = chain();
    let point = solve(&net).unwrap().nodes[1];
    for (a, b) in point.into_iter().zip([2., 0., -1.]) {
        assert!((a - b).abs() < 1e-12);
    }
    net.nodes = vec![[0.; 3], [0.; 3], [0.; 3], [3., 0., 0.]];
    net.fixed = vec![true, false, false, true];
    net.edges = vec![[0, 1], [1, 2], [2, 3]];
    net.densities = vec![1.; 3];
    net.loads = vec![[0.; 3], [0., 0., -1.], [0., 0., -1.], [0.; 3]];
    let result = solve(&net).unwrap();
    assert!((result.nodes[1][0] - 1.).abs() < 1e-12);
    assert!((result.nodes[2][0] - 2.).abs() < 1e-12);
    assert!((result.nodes[1][2] + 1.).abs() < 1e-12);
    assert!(result.residual < 1e-12);
}
#[test]
fn invalid_and_unanchored_inputs_fail() {
    for q in [0., -1., f64::NAN, f64::INFINITY] {
        let mut n = chain();
        n.densities[0] = q;
        assert!(solve(&n).is_err());
    }
    let mut n = chain();
    n.fixed.fill(false);
    assert!(solve(&n).is_err());
    let mut n = chain();
    n.edges[0] = [0, 9];
    assert!(solve(&n).is_err());
    let mut n = chain();
    n.loads.pop();
    assert!(solve(&n).is_err());
    assert!(four_bar(1., 0.).is_err());
    assert!(four_bar(f64::NAN, 4.).is_err());
}
#[test]
fn replay_is_generated_by_this_solver() {
    let frames: Vec<form_finding_pastrana_2026::Form> =
        serde_json::from_str(include_str!("../results/stabileo_results.json")).unwrap();
    assert_eq!(frames.len(), 25);
    for f in frames {
        let r = four_bar(f.q, f.load).unwrap();
        assert!((r.nodes[0][2] - f.nodes[0][2]).abs() < 1e-12);
        assert!((r.forces[0] - f.forces[0]).abs() < 1e-12);
    }
}

#[test]
fn initial_free_coordinates_do_not_change_equilibrium() {
    let mut net = chain();
    let expected = solve(&net).unwrap();
    net.nodes[1] = [100., -200., 300.];
    let observed = solve(&net).unwrap();
    assert_eq!(expected.nodes, observed.nodes);
    assert_eq!(expected.forces, observed.forces);
}
