use dedaliano_engine::solver::buckling::solve_buckling_2d;
use koiter_ferrari_sigmund_2025::model::roorda;
#[test]
fn published_linear_buckling_and_mesh_convergence() {
    let values: Vec<_> = [4, 10, 20, 40]
        .into_iter()
        .map(|n| solve_buckling_2d(&roorda(n, 0.), 1).unwrap().modes[0].load_factor)
        .collect();
    let evidence: serde_json::Value =
        serde_json::from_str(include_str!("../VALIDATION.json")).unwrap();
    let published: serde_json::Value =
        serde_json::from_str(include_str!("../PUBLISHED_COMPARISON.json")).unwrap();
    let observations = [
        (values[1] - 2.4313).abs(),
        (values[3] - 2.430).abs() / 2.430,
    ];
    for (i, observed) in observations.iter().enumerate() {
        let check = &evidence["checks"][i + 4];
        assert!((check["observed"].as_f64().unwrap() - observed).abs() < 1e-9);
        assert_eq!(check, &published["checks"][i]);
    }
    println!("buckling sequence {values:?}");
    assert!((values[1] - 2.4313).abs() < 0.0001);
    assert!((values[3] - 2.430).abs() / 2.430 < 0.001);
    assert!((values[3] - values[2]).abs() < 4e-6);
    assert!(values.windows(2).all(|w| w[1] < w[0]));
}

#[test]
fn scaled_linear_solution_is_not_accepted_as_a_nonlinear_critical_state() {
    use dedaliano_engine::solver::{
        buckling::buckling_system_2d, corotational::assemble_corotational_public, dof::DofNumbering,
    };
    let input = roorda(10, 0.);
    let dofs = DofNumbering::build_2d(&input);
    let system = buckling_system_2d(&input).unwrap();
    let buckling = solve_buckling_2d(&input, 1).unwrap();
    let mode = &buckling.modes[0];
    let mut u = vec![0.; dofs.n_total];
    let mut v = u.clone();
    for d in &system.linear.displacements {
        for (j, x) in [d.ux, d.uz, d.ry].iter().enumerate() {
            u[dofs.global_dof(d.node_id, j).unwrap()] = mode.load_factor * x;
        }
    }
    for d in &mode.displacements {
        for (j, x) in [d.ux, d.uz, d.ry].iter().enumerate() {
            v[dofs.global_dof(d.node_id, j).unwrap()] = *x;
        }
    }
    let scale = v[dofs.global_dof(11, 2).unwrap()];
    for x in &mut v {
        *x /= scale;
    }
    let mut force = vec![0.; dofs.n_total];
    let mut tangent = vec![0.; dofs.n_total * dofs.n_total];
    assemble_corotational_public(&input, &dofs, &u, &mut force, &mut tangent);
    let residual = (0..dofs.n_free)
        .map(|i| {
            tangent[i * dofs.n_total..(i + 1) * dofs.n_total]
                .iter()
                .zip(&v)
                .map(|(a, b)| a * b)
                .sum::<f64>()
                .powi(2)
        })
        .sum::<f64>()
        .sqrt();
    assert!((residual - 5.195338471728314).abs() < 1e-7);
    assert!(
        residual > 1e-6,
        "this shortcut must not silently become a validated Koiter calculation"
    );
}

#[test]
fn ferrari_model_matches_published_parameters() {
    let paper: serde_json::Value =
        serde_json::from_str(include_str!("../reference-results/paper_values.json")).unwrap();
    let p = &paper["parameters"];
    for n in [2, 4, 10, 20, 40] {
        let e = p["eccentricity_m"].as_f64().unwrap();
        let m = serde_json::to_value(roorda(n, e)).unwrap();
        let length = p["length_m"].as_f64().unwrap();
        assert_eq!(m["nodes"].as_object().unwrap().len(), 2 * n + 1);
        assert_eq!(m["elements"].as_object().unwrap().len(), 2 * n);
        for i in 0..=2 * n {
            let node = &m["nodes"][(i + 1).to_string()];
            let (x, z) = if i <= n {
                (0., length * i as f64 / n as f64)
            } else {
                (length * (i - n) as f64 / n as f64, length)
            };
            assert_eq!(node["x"], x);
            assert_eq!(node["z"], z);
        }
        assert_eq!(m["materials"]["1"]["e"].as_f64(), p["young_MPa"].as_f64());
        assert_eq!(m["sections"]["1"]["a"], p["area_m2"]);
        assert_eq!(m["sections"]["1"]["iz"], p["inertia_m4"]);
        assert_eq!(m["supports"].as_object().unwrap().len(), 2);
        for (id, node) in [(1, 1), (2, 2 * n + 1)] {
            assert_eq!(m["supports"][id.to_string()]["nodeId"], node);
            assert_eq!(m["supports"][id.to_string()]["type"], "pinned");
        }
        for i in 1..=2 * n {
            let el = &m["elements"][i.to_string()];
            assert_eq!(el["nodeI"], i);
            assert_eq!(el["nodeJ"], i + 1);
            assert_eq!(el["hingeStart"], false);
            assert_eq!(el["hingeEnd"], false);
        }
        let force = p["corner_force_N"].as_f64().unwrap() / 1000.;
        assert_eq!(m["loads"].as_array().unwrap().len(), 1);
        let load = &m["loads"][0]["data"];
        assert_eq!(load["nodeId"], n + 1);
        assert_eq!(load["fx"], 0.);
        assert_eq!(load["fz"], force);
        assert_eq!(load["my"], -force * e);
    }
}
