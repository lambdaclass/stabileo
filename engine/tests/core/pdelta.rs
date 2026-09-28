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

// ─── Review of #224: inclined supports, past Pcr, constraints ───────

/// A portal whose right foot sits on a 30° inclined roller. With a lateral
/// load and no gravity the columns carry only the small axial forces the sway
/// induces, so the second-order solution is the linear one to within a
/// fraction of a percent — in global axes, like every other analysis path.
fn inclined_portal(settle_dz: Option<f64>) -> dedaliano_engine::types::SolverInput {
    let mut input = make_portal_frame(4.0, 6.0, E, A, IZ, 10.0, 0.0);
    let s = input.supports.values_mut().find(|s| s.node_id == 4).unwrap();
    s.support_type = "inclinedRoller".into();
    s.angle = Some(std::f64::consts::PI / 6.0);
    s.dz = settle_dz;
    input
}

fn assert_matches_linear(pd: &pdelta::PDeltaResult, label: &str) {
    let lin = &pd.linear_results;
    let scale = lin.displacements.iter().map(|d| d.ux.abs().max(d.uz.abs())).fold(0.0, f64::max);
    for b in &lin.displacements {
        let a = pd.results.displacements.iter().find(|d| d.node_id == b.node_id).unwrap();
        for (p, l, what) in [(a.ux, b.ux, "ux"), (a.uz, b.uz, "uz")] {
            assert!((p - l).abs() <= 5e-3 * scale,
                "{label}: node {} {what}: P-Δ {p:.4e} vs linear {l:.4e}", b.node_id);
        }
    }
    let m_scale = lin.element_forces.iter().map(|f| f.m_start.abs().max(f.m_end.abs())).fold(0.0, f64::max);
    for b in &lin.element_forces {
        let a = pd.results.element_forces.iter().find(|f| f.element_id == b.element_id).unwrap();
        assert!((a.m_start - b.m_start).abs() <= 5e-3 * m_scale && (a.m_end - b.m_end).abs() <= 5e-3 * m_scale,
            "{label}: element {} moments: P-Δ ({:.3},{:.3}) vs linear ({:.3},{:.3})",
            b.element_id, a.m_start, a.m_end, b.m_start, b.m_end);
    }
    let (rx, rz) = pd.results.reactions.iter().fold((0.0, 0.0), |(x, z), r| (x + r.rx, z + r.rz));
    let (lx, lz) = lin.reactions.iter().fold((0.0, 0.0), |(x, z), r| (x + r.rx, z + r.rz));
    assert!((rx - lx).abs() < 1e-2 && (rz - lz).abs() < 1e-2,
        "{label}: ΣR P-Δ ({rx:.4},{rz:.4}) vs linear ({lx:.4},{lz:.4})");
}

#[test]
fn pdelta_inclined_roller_matches_linear_without_gravity() {
    let pd = pdelta::solve_pdelta_2d(&inclined_portal(None), 30, 1e-8).unwrap();
    assert!(pd.converged, "should converge");
    assert_matches_linear(&pd, "inclined roller");
}

#[test]
fn pdelta_inclined_roller_settlement_matches_linear_without_gravity() {
    let pd = pdelta::solve_pdelta_2d(&inclined_portal(Some(-0.01)), 30, 1e-8).unwrap();
    assert!(pd.converged, "should converge");
    assert_matches_linear(&pd, "inclined roller settled");
}

#[test]
fn pdelta_past_the_critical_load_is_not_stable() {
    // At P = 1.5·Pcr the linearised second-order system is indefinite; LU
    // still solves it, and the sway comes back reversed: u ≈ u_lin/(1 − 1.5).
    // That is a column past buckling, not an amplification of 2.
    let (input, _) = cantilever_column(1.5);
    let pd = pdelta::solve_pdelta_2d(&input, 50, 1e-8).unwrap();
    assert!(!pd.is_stable, "P/Pcr = 1.5 reported stable with B2 = {:.3}", pd.b2_factor);
}

#[test]
fn pdelta_constraint_forces_see_the_settlement() {
    use dedaliano_engine::types::*;
    // The beam is made axially rigid by tying the two top nodes' ux; the only
    // action is the right foot settling. With no gravity the second-order
    // constraint force is the linear one.
    let mut input = make_portal_frame(4.0, 6.0, E, A, IZ, 0.0, 0.0);
    settle(&mut input, 4, -0.01);
    input.supports.values_mut().find(|s| s.node_id == 4).unwrap().dx = Some(0.005);
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 3, dofs: vec![0] }));
    let lin = dedaliano_engine::solver::linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-8).unwrap();
    assert!(pd.converged);
    assert!(!lin.constraint_forces.is_empty(), "the linear pass reports the tie's force");
    let force = |cf: &[ConstraintForce]| cf.iter().map(|c| c.force.abs()).fold(0.0, f64::max);
    let (fl, fp) = (force(&lin.constraint_forces), force(&pd.results.constraint_forces));
    assert!(fl > 1.0 && (fp - fl).abs() / fl < 5e-3, "constraint force: P-Δ {fp:.4} vs linear {fl:.4}");
}

#[test]
fn pdelta_reactions_balance_the_loads_once_the_frame_sways() {
    // Horizontal equilibrium does not change with the deformed geometry: the
    // base shears still add up to the lateral load. K·u alone leaves out the
    // P·Δ/h shear K_G carries at each column base.
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, -300.0);
    let pd = pdelta::solve_pdelta_2d(&input, 50, 1e-10).unwrap();
    assert!(pd.converged && pd.is_stable);
    let rx: f64 = pd.results.reactions.iter().map(|r| r.rx).sum();
    let rz: f64 = pd.results.reactions.iter().map(|r| r.rz).sum();
    assert!((rx + 20.0).abs() < 1e-6, "ΣRx = {rx:.6}, lateral load 20");
    assert!((rz - 600.0).abs() < 1e-6, "ΣRz = {rz:.6}, gravity 600");
}

#[test]
fn pdelta_3d_inclined_roller_matches_linear_without_axial_load() {
    use dedaliano_engine::types::*;
    // A beam fixed at one end and resting on a roller whose normal leans 30°
    // in the xz plane at the other; transverse loads only, so P-Δ is linear.
    // The settlement is what the restrained normal slot has to carry.
    let fixed = vec![true; 6];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: SEG / 2 + 1, fx: 0.0, fy: 2.0, fz: -5.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let mut input = make_3d_beam(SEG, L_STRUT, E, 0.3, A, IZ, 2.0 * IZ, 1.5e-4, fixed.clone(), Some(fixed), loads);
    let (s, c) = (std::f64::consts::PI / 6.0).sin_cos();
    let end = input.supports.values_mut().find(|s| s.node_id == SEG + 1).unwrap();
    (end.rx, end.ry, end.rz, end.rrx, end.rry, end.rrz) = (false, false, false, true, false, false);
    (end.normal_x, end.normal_y, end.normal_z, end.is_inclined) = (Some(s), Some(0.0), Some(c), Some(true));
    // And it settles: the roller's surface drops 5 mm vertically.
    end.dz = Some(-0.005);
    let pd = pdelta::solve_pdelta_3d(&input, 30, 1e-8).unwrap();
    assert!(pd.converged && pd.is_stable, "converged {} stable {}", pd.converged, pd.is_stable);
    let lin = &pd.linear_results;
    let scale = lin.displacements.iter().map(|d| d.ux.abs().max(d.uy.abs()).max(d.uz.abs())).fold(0.0, f64::max);
    for b in &lin.displacements {
        let a = pd.results.displacements.iter().find(|d| d.node_id == b.node_id).unwrap();
        for (p, l, what) in [(a.ux, b.ux, "ux"), (a.uy, b.uy, "uy"), (a.uz, b.uz, "uz")] {
            assert!((p - l).abs() <= 5e-3 * scale, "node {} {what}: P-Δ {p:.4e} vs linear {l:.4e}", b.node_id);
        }
    }
    let sum = |rs: &[Reaction3D]| rs.iter().fold([0.0; 3], |t, r| [t[0] + r.fx, t[1] + r.fy, t[2] + r.fz]);
    let (p, l) = (sum(&pd.results.reactions), sum(&lin.reactions));
    for i in 0..3 { assert!((p[i] - l[i]).abs() < 1e-3, "ΣR[{i}] P-Δ {:.4} vs linear {:.4}", p[i], l[i]); }
}

#[test]
fn pdelta_b2_does_not_depend_on_the_scale_of_the_lateral_load() {
    // With the gravity fixed, the sway is linear in the lateral load, and so is
    // its second-order increment: B₂ is the same for 20 kN and for 20 µN.
    let big = pdelta::solve_pdelta_2d(&make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, -300.0), 50, 1e-10).unwrap();
    for lateral in [2e-3, 2e-6, 2e-9] {
        let small = pdelta::solve_pdelta_2d(&make_portal_frame(4.0, 6.0, E, A, IZ, lateral, -300.0), 50, 1e-10).unwrap();
        assert!((small.b2_factor - big.b2_factor).abs() < 1e-3 * big.b2_factor,
            "lateral {lateral}: B2 = {:.5}, with 20 kN B2 = {:.5}", small.b2_factor, big.b2_factor);
    }
}

#[test]
fn pdelta_b2_is_one_under_symmetric_gravity() {
    // No sway at all: nothing is amplified, whatever the solver's round-off does.
    let pd = pdelta::solve_pdelta_2d(&make_portal_frame(4.0, 6.0, E, A, IZ, 0.0, -300.0), 50, 1e-10).unwrap();
    assert!(pd.converged && pd.is_stable);
    assert!((pd.b2_factor - 1.0).abs() < 1e-2, "B2 = {:.5} with no lateral load", pd.b2_factor);
}
