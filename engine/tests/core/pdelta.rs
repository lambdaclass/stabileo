/// P-Delta analysis tests.
use dedaliano_engine::solver::pdelta;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ─── P-Delta Portal Frame ────────────────────────────────────

#[test]
fn pdelta_portal_amplifies_sway() {
    // Portal frame with gravity + lateral load
    // P-Delta should amplify lateral displacements
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, -100.0);

    let linear = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();
    let pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    assert!(pdelta.converged, "should converge");
    assert!(pdelta.is_stable, "should be stable");

    // Find lateral displacement at top node
    let lin_ux = linear.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pdelta.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // P-Delta sway should be larger than linear
    assert!(
        pd_ux.abs() > lin_ux.abs(),
        "P-Delta sway ({:.6}) should exceed linear sway ({:.6})",
        pd_ux.abs(), lin_ux.abs()
    );
}

#[test]
fn pdelta_b2_factor_reasonable() {
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, -100.0);
    let pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    // B2 factor should be between 1.0 and ~2.0 for typical structures
    assert!(
        pdelta.b2_factor >= 1.0 && pdelta.b2_factor < 5.0,
        "B2={:.4} should be reasonable", pdelta.b2_factor
    );
}

#[test]
fn pdelta_converges_within_iterations() {
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, -50.0);
    let pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    assert!(pdelta.converged, "should converge");
    assert!(pdelta.iterations < 15, "should converge in < 15 iterations, took {}", pdelta.iterations);
}

#[test]
fn pdelta_equilibrium() {
    // Global equilibrium should hold after P-Delta
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, -100.0);
    let pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    let sum_rx: f64 = pdelta.results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = pdelta.results.reactions.iter().map(|r| r.ry).sum();

    // ΣFx = reactions + applied ≈ 0
    assert!(
        (sum_rx + 20.0).abs() < 2.0,
        "ΣFx: sum_rx={:.2}, applied=20, diff={:.2}", sum_rx, sum_rx + 20.0
    );
    // ΣFy = reactions + gravity ≈ 0
    assert!(
        (sum_ry - 200.0).abs() < 2.0,
        "ΣFy: sum_ry={:.2}, applied=−200, diff={:.2}", sum_ry, sum_ry - 200.0
    );

    // Moment equilibrium about the origin (node 1 at (0,0)):
    // Portal: h=4, w=6. Lateral H=20 at node 2, gravity -100 at nodes 2 & 3.
    let node_coords: std::collections::HashMap<usize, (f64, f64)> = [
        (1, (0.0, 0.0)), (2, (0.0, 4.0)), (3, (6.0, 4.0)), (4, (6.0, 0.0)),
    ].iter().cloned().collect();
    check_moment_equilibrium_2d(
        &pdelta.results, &input.loads, &node_coords, 2.0,
        "P-Delta portal frame ΣM",
    );
}

#[test]
fn pdelta_includes_linear_results() {
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, -50.0);
    let pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    assert!(!pdelta.linear_results.displacements.is_empty());
    assert!(!pdelta.linear_results.reactions.is_empty());
    assert!(!pdelta.linear_results.element_forces.is_empty());
}

// ─── Pure Lateral Load (no gravity → no P-Delta effect) ─────

#[test]
fn pdelta_no_gravity_matches_linear() {
    // Without gravity, there's no axial force → no P-Delta effect
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, 0.0);
    let pdelta = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    let lin_ux = pdelta.linear_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pdelta.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Should be very close (minor iteration effect from small axial forces in columns)
    let ratio = if lin_ux.abs() > 1e-10 { pd_ux / lin_ux } else { 1.0 };
    assert!(
        (ratio - 1.0).abs() < 0.05,
        "No gravity: P-Delta/linear ratio={:.4}, should be ~1.0", ratio
    );
}
