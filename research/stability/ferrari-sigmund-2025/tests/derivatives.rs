use dedaliano_engine::solver::{corotational::assemble_corotational_public, dof::DofNumbering};
use koiter_ferrari_sigmund_2025::{energy::variation, model::roorda};
#[test]
fn every_energy_derivative_through_order_four_matches_central_differences() {
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
}
