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
    let sum_ry: f64 = pdelta.results.reactions.iter().map(|r| r.rz).sum();

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

// ─── Prescribed displacements ────────────────────────────────

fn settle(input: &mut dedaliano_engine::types::SolverInput, node: usize, dz: f64) {
    input.supports.values_mut().find(|s| s.node_id == node).unwrap().dz = Some(dz);
}

#[test]
fn pdelta_settlement_alone_matches_linear() {
    // No load but a support settlement: the only axial forces are the small
    // ones the settlement itself induces, so the second-order solution is the
    // linear one to within a fraction of a percent. It used to be all zeros
    // and "not converged" — the iterations never saw the settlement.
    let mut input = make_portal_frame(4.0, 6.0, E, A, IZ, 0.0, 0.0);
    settle(&mut input, 4, -0.01);
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    assert!(pd.converged, "should converge");
    let lin = &pd.linear_results;
    let close = |p: f64, l: f64| (p - l).abs() <= 1e-3 * l.abs().max(1e-6);
    for (a, b) in pd.results.displacements.iter().zip(lin.displacements.iter()) {
        assert!(close(a.ux, b.ux) && close(a.uz, b.uz) && close(a.ry, b.ry),
            "node {}: P-Δ ({:.3e},{:.3e},{:.3e}) vs linear ({:.3e},{:.3e},{:.3e})", a.node_id, a.ux, a.uz, a.ry, b.ux, b.uz, b.ry);
    }
    let n4 = pd.results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!((n4.uz + 0.01).abs() < 1e-12, "the settled node sits at its prescribed value");
    let m_lin = lin.element_forces.iter().map(|f| f.m_start.abs()).fold(0.0, f64::max);
    let m_pd = pd.results.element_forces.iter().map(|f| f.m_start.abs()).fold(0.0, f64::max);
    assert!(m_lin > 1.0 && (m_pd - m_lin).abs() / m_lin < 1e-3, "moments: P-Δ {m_pd} vs linear {m_lin}");
}

#[test]
fn pdelta_settlement_with_gravity_keeps_it() {
    let mut input = make_portal_frame(4.0, 6.0, E, A, IZ, 10.0, -100.0);
    settle(&mut input, 4, -0.01);
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    assert!(pd.converged && pd.is_stable);
    let n4 = pd.results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!((n4.uz + 0.01).abs() < 1e-12);
    // The settlement drags the right column down: the beam's end rotates more
    // than it does under the loads alone.
    let plain = pdelta::solve_pdelta_2d(&make_portal_frame(4.0, 6.0, E, A, IZ, 10.0, -100.0), 20, 1e-6).unwrap();
    let r3 = |r: &pdelta::PDeltaResult| r.results.displacements.iter().find(|d| d.node_id == 3).unwrap().uz;
    assert!(r3(&pd) < r3(&plain) - 0.005, "node 3 goes down with the settlement: {} vs {}", r3(&pd), r3(&plain));
}

// ─── B₂ ──────────────────────────────────────────────────────

fn cantilever_column(frac: f64) -> (dedaliano_engine::types::SolverInput, f64) {
    use dedaliano_engine::types::*;
    let l = 5.0;
    let n = 8;
    let pcr = std::f64::consts::PI.powi(2) * E * 1000.0 * IZ / (4.0 * l * l);
    let nodes = (0..=n).map(|i| (i + 1, 0.0, l * i as f64 / n as f64)).collect();
    let elems = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: 1.0, fz: -frac * pcr, my: 0.0 }),
    ];
    (make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, vec![(1, 1, "fixed")], loads), 1.0 / (1.0 - frac))
}

#[test]
fn pdelta_b2_is_the_sway_amplification() {
    // B₂ used to be the largest ratio over single DOFs, which a DOF that
    // barely moves turns into anything. The tip sway of a cantilever column
    // is amplified by ≈ 1/(1 − P/Pcr).
    for frac in [0.1, 0.3, 0.5] {
        let (input, theory) = cantilever_column(frac);
        let pd = pdelta::solve_pdelta_2d(&input, 50, 1e-8).unwrap();
        assert!(pd.converged, "P/Pcr = {frac}: should converge");
        let r = pd.b2_factor / theory;
        assert!(r > 0.97 && r < 1.06, "P/Pcr = {frac}: B2 = {:.4}, theory {:.4}", pd.b2_factor, theory);
    }
}
