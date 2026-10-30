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
