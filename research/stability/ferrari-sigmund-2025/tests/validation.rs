use dedaliano_engine::solver::{
    buckling::solve_buckling_2d, corotational::assemble_corotational_public, dof::DofNumbering,
};
use koiter_ferrari_sigmund_2025::{energy::variation, model::roorda};

fn published_linear_buckling_and_mesh_convergence() -> Vec<serde_json::Value> {
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
    observations
        .iter()
        .enumerate()
        .map(|(i, observed)| {
            let mut check = evidence["checks"][i + 4].clone();
            check["observed"] = serde_json::json!(observed);
            check["passed"] = serde_json::json!(*observed <= check["tolerance"].as_f64().unwrap());
            check
        })
        .collect()
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

fn every_energy_derivative_through_order_four_matches_central_differences() -> Vec<serde_json::Value>
{
    let mut input = roorda(2, 0.);
    input.elements.retain(|_, e| e.id == 1);
    input.nodes.retain(|_, n| n.id <= 2);
    input.supports.clear();
    input.loads.clear();
    let dofs = DofNumbering::build_2d(&input);
    let n = dofs.n_total;
    assert_eq!(n, 6);
    let basis: Vec<Vec<f64>> = (0..n)
        .map(|i| (0..n).map(|j| if i == j { 1. } else { 0. }).collect())
        .collect();
    let mut maxima = [0_f64; 4];
    for state in [0., 0.001, 0.025] {
        let u: Vec<f64> = (0..n).map(|i| state * ((i + 1) as f64).sin()).collect();
        let mut f = vec![0.; n];
        let mut k = vec![0.; n * n];
        assemble_corotational_public(&input, &dofs, &u, &mut f, &mut k);
        for i in 0..n {
            let g = variation(&input, &dofs, &u, &[&basis[i]]);
            assert!((g - f[i]).abs() / (1. + f[i].abs()) < 1e-9);
            for j in 0..n {
                let h = variation(&input, &dofs, &u, &[&basis[i], &basis[j]]);
                assert!((h - k[i * n + j]).abs() / (1. + k[i * n + j].abs()) < 1e-9);
            }
        }
        for order in 1..=4 {
            for index in 0..n.pow(order as u32) {
                let mut digits = index;
                let mut dirs = Vec::new();
                let mut coordinate = 0;
                for j in 0..order {
                    let i = digits % n;
                    digits /= n;
                    if j + 1 == order {
                        coordinate = i;
                    }
                    dirs.push(basis[i].as_slice());
                }
                let exact = variation(&input, &dofs, &u, &dirs);
                let mut best = f64::INFINITY;
                for step in [1e-4, 5e-5, 2.5e-5] {
                    let mut plus = u.clone();
                    let mut minus = u.clone();
                    plus[coordinate] += step;
                    minus[coordinate] -= step;
                    let approx = (variation(&input, &dofs, &plus, &dirs[..order - 1])
                        - variation(&input, &dofs, &minus, &dirs[..order - 1]))
                        / (2. * step);
                    best = best.min((exact - approx).abs() / (1. + exact.abs()));
                }
                maxima[order - 1] = maxima[order - 1].max(best);
            }
        }
    }
    let evidence: serde_json::Value =
        serde_json::from_str(include_str!("../VALIDATION.json")).unwrap();
    for (i, observed) in maxima.iter().enumerate() {
        let recorded = evidence["checks"][i]["observed"].as_f64().unwrap();
        assert!((recorded - observed).abs() < 1e-7);
        assert_eq!(evidence["checks"][i]["tolerance"], 2e-5);
    }
    println!("derivative relative scaled maxima {maxima:?}");
    assert!(maxima.into_iter().all(|x| x < 2e-5));
    maxima
        .iter()
        .enumerate()
        .map(|(i, observed)| {
            let mut check = evidence["checks"][i].clone();
            check["observed"] = serde_json::json!(observed);
            check["passed"] = serde_json::json!(*observed <= 2e-5);
            check
        })
        .collect()
}

#[test]
fn validation_against_reference_evidence() {
    let mut checks = every_energy_derivative_through_order_four_matches_central_differences();
    checks.extend(published_linear_buckling_and_mesh_convergence());
    let mut evidence: serde_json::Value =
        serde_json::from_str(include_str!("../VALIDATION.json")).unwrap();
    evidence["checks"] = serde_json::json!(checks);
    let target = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target");
    std::fs::create_dir_all(&target).unwrap();
    std::fs::write(
        target.join("VALIDATION.json"),
        serde_json::to_string_pretty(&evidence).unwrap() + "\n",
    )
    .unwrap();
}
