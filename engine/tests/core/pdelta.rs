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

// ─── A temperature's compression reaches the geometric stiffness ─────
//
// A strut fixed at both ends and heated carries N = −EAαΔT without
// lengthening at all. The iteration used to read N back as EA·Δu/L — zero
// here — so the strut showed no second-order effect whatever its compression.
// Buckling, which reads N from the element results, was already right; this
// is checked against the same closed form: Pcr = 4π²EI/L², and a small
// transverse load amplified by ≈ 1/(1 − N/Pcr).

const SEG: usize = 8;
const L_STRUT: f64 = 5.0;
const DT: f64 = 400.0; // N/Pcr ≈ 0.30: second order plainly visible

fn heated_strut_2d(with_load: bool) -> dedaliano_engine::types::SolverInput {
    use dedaliano_engine::types::*;
    let mut input = make_column(SEG, L_STRUT, E, A, IZ, "fixed", "fixed", 0.0);
    for id in 1..=SEG {
        input.loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: id, dt_uniform: DT, dt_gradient: 0.0 }));
    }
    if with_load {
        input.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: SEG / 2 + 1, fx: 0.0, fz: -1.0, my: 0.0 }));
    }
    input
}

fn amplification_expected() -> f64 {
    let n = E * 1000.0 * A * 12e-6 * DT;
    let pcr = 4.0 * std::f64::consts::PI.powi(2) * E * 1000.0 * IZ / (L_STRUT * L_STRUT);
    1.0 / (1.0 - n / pcr)
}

#[test]
fn pdelta_2d_heated_strut_is_softened_by_its_thermal_compression() {
    let input = heated_strut_2d(true);
    let lin = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 50, 1e-8).unwrap();
    assert!(pd.converged && pd.is_stable);
    let mid = |ds: &[dedaliano_engine::types::Displacement]| ds.iter().find(|d| d.node_id == SEG / 2 + 1).unwrap().uz;
    let amp = mid(&pd.results.displacements) / mid(&lin.displacements);
    let want = amplification_expected();
    assert!((amp - want).abs() / want < 0.03, "amplification {amp:.4}, expected ≈ {want:.4}");
}

#[test]
fn pdelta_2d_heated_truss_bar_is_softened_too() {
    use dedaliano_engine::types::*;
    // A pin-jointed heated bar, restrained at both ends, braced at mid-length
    // by a soft spring: the bar's compression lowers the spring's stiffness.
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 2.0, 0.0), (3, 4.0, 0.0)],
        vec![(1, E, 0.3)], vec![(1, A, IZ)],
        vec![(1, "truss", 1, 2, 1, 1, false, false), (2, "truss", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "pinned"), (3, 2, "spring")],
        vec![
            SolverLoad::Thermal(SolverThermalLoad { element_id: 1, dt_uniform: 20.0, dt_gradient: 0.0 }),
            SolverLoad::Thermal(SolverThermalLoad { element_id: 2, dt_uniform: 20.0, dt_gradient: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -1.0, my: 0.0 }),
        ],
    );
    let k = 2000.0;
    for s in input.supports.values_mut() {
        if s.node_id == 2 { s.ky = Some(k); }
    }
    let n = E * 1000.0 * A * 12e-6 * 20.0; // compression in both bars
    let lin = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 50, 1e-10).unwrap();
    let uz = |ds: &[Displacement]| ds.iter().find(|d| d.node_id == 2).unwrap().uz;
    // Transverse stiffness at the joint: k − 2N/l, with l = 2.
    let want = (k) / (k - 2.0 * n / 2.0);
    let amp = uz(&pd.results.displacements) / uz(&lin.displacements);
    assert!((amp - want).abs() / want < 1e-3, "amplification {amp:.5}, expected {want:.5}");
}

#[test]
fn pdelta_3d_heated_strut_is_softened_by_its_thermal_compression() {
    use dedaliano_engine::types::*;
    let fixed = vec![true; 6];
    let mut loads: Vec<SolverLoad3D> = (1..=SEG)
        .map(|id| SolverLoad3D::Thermal(SolverThermalLoad3D { element_id: id, dt_uniform: DT, dt_gradient_y: 0.0, dt_gradient_z: 0.0 }))
        .collect();
    loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: SEG / 2 + 1, fx: 0.0, fy: 0.0, fz: -1.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    // Iy = IZ governs bending in the xz plane, the plane of the load.
    let input = make_3d_beam(SEG, L_STRUT, E, 0.3, A, IZ, 2.0 * IZ, 1.5e-4, fixed.clone(), Some(fixed), loads);
    let lin = dedaliano_engine::solver::linear::solve_3d(&input).unwrap();
    let pd = pdelta::solve_pdelta_3d(&input, 50, 1e-8).unwrap();
    assert!(pd.converged && pd.is_stable);
    let mid = |ds: &[Displacement3D]| ds.iter().find(|d| d.node_id == SEG / 2 + 1).unwrap().uz;
    let amp = mid(&pd.results.displacements) / mid(&lin.displacements);
    let want = amplification_expected();
    assert!((amp - want).abs() / want < 0.03, "amplification {amp:.4}, expected ≈ {want:.4}");
}
