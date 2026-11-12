use crate::{case::Case2, corpus};
use dedaliano_engine::metamorphic::{transform::Iso2, Rng};
use dedaliano_engine::solver::pdelta;

fn rigid_control() -> Case2 {
    let mut c = corpus::fuzz_case_2d(20754, 18);
    c.s.supports.get_mut("3").unwrap().kx = None;
    c.name.push_str("-rigid-control");
    c
}

#[test]
#[ignore = "known wrong result: #1940"]
fn rotated_rigid_control_keeps_its_pdelta_equilibrium() {
    let c = rigid_control();
    let seed = 20754 ^ crate::checks2::hash("fuzz_rich_2d/20772") ^ crate::checks2::hash("P-Delta");
    let mut rng = Rng::new(seed);
    let iso = Iso2::rotation(rng.range(0.1, 6.2)).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0));
    assert!(c.iso(&iso).is_err());
    let q = Iso2::rotation(std::f64::consts::FRAC_PI_2 * (1 + rng.below(3)) as f64).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0));
    let tc = c.iso(&q).unwrap();
    let base = pdelta::solve_pdelta_2d(&c.s, 100, 1e-12).unwrap();
    let got = pdelta::solve_pdelta_2d(&tc.s, 100, 1e-12).unwrap();
    eprintln!("original={}\nrotated={}\nresult={}", serde_json::to_string(&c.s).unwrap(), serde_json::to_string(&tc.s).unwrap(), serde_json::to_string(&got).unwrap());
    assert!(base.converged);
    assert!(got.converged, "rotated equilibrium did not converge in {} iterations", got.iterations);
}
