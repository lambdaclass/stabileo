/// Validation: Fundamental Structural Mechanics Theorems
///
/// Tests foundational principles that any correct linear solver must satisfy:
///   - Maxwell-Betti reciprocal theorem: δ_ij = δ_ji
///   - Clapeyron's theorem (energy balance): W_ext = U_strain = ½·F·δ
///   - Castigliano's second theorem: ∂U/∂P = δ (verified via finite difference)
///   - Superposition principle: results(F₁+F₂) = results(F₁) + results(F₂)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const L: f64 = 5.0;

// ================================================================
// Maxwell-Betti Reciprocal Theorem: δ_ij = δ_ji
// ================================================================

/// SS beam: load at node 3 → uy at node 7 = load at node 7 → uy at node 3.
#[test]
fn validation_maxwell_betti_ss_beam() {
    let n = 8;

    let input_a = make_beam(n, L, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -1.0, mz: 0.0 })]);
    let input_b = make_beam(n, L, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -1.0, mz: 0.0 })]);

    let res_a = linear::solve_2d(&input_a).unwrap();
    let res_b = linear::solve_2d(&input_b).unwrap();

    let d_a_at_7 = res_a.displacements.iter().find(|d| d.node_id == 7).unwrap().uy;
    let d_b_at_3 = res_b.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;

    assert_close(d_a_at_7, d_b_at_3, 1e-10, "Maxwell-Betti: δ_{3,7} = δ_{7,3}");
}

/// Portal frame: horizontal force at node 2 → ux at node 3 = force at node 3 → ux at node 2.
#[test]
fn validation_maxwell_betti_portal_frame() {
    let mut input_a = make_portal_frame(4.0, 6.0, E, A, IZ, 0.0, 0.0);
    input_a.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 1.0, fy: 0.0, mz: 0.0 }));

    let mut input_b = make_portal_frame(4.0, 6.0, E, A, IZ, 0.0, 0.0);
    input_b.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 1.0, fy: 0.0, mz: 0.0 }));

    let res_a = linear::solve_2d(&input_a).unwrap();
    let res_b = linear::solve_2d(&input_b).unwrap();

    let d_a_at_3 = res_a.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d_b_at_2 = res_b.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    assert_close(d_a_at_3, d_b_at_2, 1e-10, "Maxwell-Betti portal: δ_{2,3} = δ_{3,2}");
}

/// Mixed DOF: force Fy at node i → rotation rz at node j = moment Mz at j → displacement uy at i.
#[test]
fn validation_maxwell_betti_mixed_dof() {
    let n = 8;

    let input_a = make_beam(n, L, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -1.0, mz: 0.0 })]);
    let input_b = make_beam(n, L, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: 0.0, mz: -1.0 })]);

    let res_a = linear::solve_2d(&input_a).unwrap();
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Fy at 3 → θz at 7
    let rz_a_at_7 = res_a.displacements.iter().find(|d| d.node_id == 7).unwrap().rz;
    // Mz at 7 → uy at 3
    let uy_b_at_3 = res_b.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;

    assert_close(rz_a_at_7, uy_b_at_3, 1e-10, "Maxwell-Betti mixed: Fy→θz = Mz→uy");
}

/// 3D frame: load Fy at node 2 → uy at node 4 = load Fy at node 4 → uy at node 2.
#[test]
fn validation_maxwell_betti_3d() {
    let n = 4;

    let input_a = make_3d_beam(n, L, E, 0.3, A, IZ, IZ, 5e-5,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -1.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let input_b = make_3d_beam(n, L, E, 0.3, A, IZ, IZ, 5e-5,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: -1.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    let res_a = linear::solve_3d(&input_a).unwrap();
    let res_b = linear::solve_3d(&input_b).unwrap();

    let uy_a_at_4 = res_a.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;
    let uy_b_at_2 = res_b.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;

    assert_close(uy_a_at_4, uy_b_at_2, 1e-10, "Maxwell-Betti 3D: δ_{2,4} = δ_{4,2}");
}

// ================================================================
// Clapeyron's Theorem: W_ext = U_strain = ½·F·δ
// ================================================================

/// SS beam with midspan point load: W_ext = ½Pδ = P²L³/(96EI).
/// Note: Engine uses EI_eff = E * 1000 * Iz (internal unit convention).
#[test]
fn validation_clapeyron_ss_beam_point_load() {
    let n = 8;
    let mid = n / 2 + 1;
    let p = 10.0;

    let input = make_beam(n, L, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: mid, fx: 0.0, fy: -p, mz: 0.0 })]);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let w_ext = 0.5 * p * d_mid.uy.abs();

    let ei = E * 1000.0 * IZ; // Engine internal EI convention
    let u_analytical = p * p * L.powi(3) / (96.0 * ei);

    assert_close(w_ext, u_analytical, 0.01, "Clapeyron: W_ext = P²L³/(96EI)");
}

/// Cantilever with tip load: W_ext = ½Pδ = P²L³/(6EI).
#[test]
fn validation_clapeyron_cantilever_tip_load() {
    let n = 8;
    let tip = n + 1;
    let p = 10.0;

    let input = make_beam(n, L, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: tip, fx: 0.0, fy: -p, mz: 0.0 })]);
    let results = linear::solve_2d(&input).unwrap();

    let d_tip = results.displacements.iter().find(|d| d.node_id == tip).unwrap();
    let w_ext = 0.5 * p * d_tip.uy.abs();

    let ei = E * 1000.0 * IZ; // Engine internal EI convention
    let u_analytical = p * p * L.powi(3) / (6.0 * ei);

    assert_close(w_ext, u_analytical, 0.01, "Clapeyron: W_ext = P²L³/(6EI)");
}

/// Portal frame: W_ext > 0 and supports contribute zero work.
#[test]
fn validation_clapeyron_frame_energy_positive() {
    let h_load = 10.0;
    let g_load = -5.0;
    let input = make_portal_frame(3.0, 5.0, E, A, IZ, h_load, g_load);
    let results = linear::solve_2d(&input).unwrap();

    // External work = ½ Σ F_applied · u
    let mut w_ext = 0.0;
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            let d = results.displacements.iter().find(|d| d.node_id == nl.node_id).unwrap();
            w_ext += nl.fx * d.ux + nl.fy * d.uy + nl.mz * d.rz;
        }
    }
    w_ext *= 0.5;

    assert!(w_ext > 0.0, "External work must be positive for loaded structure, got {:.6e}", w_ext);

    // Support displacements should be zero (fixed supports at nodes 1, 4)
    for &sup_node in &[1, 4] {
        let d = results.displacements.iter().find(|d| d.node_id == sup_node).unwrap();
        assert!(d.ux.abs() < 1e-12, "Fixed support {} ux not zero: {:.6e}", sup_node, d.ux);
        assert!(d.uy.abs() < 1e-12, "Fixed support {} uy not zero: {:.6e}", sup_node, d.uy);
        assert!(d.rz.abs() < 1e-12, "Fixed support {} rz not zero: {:.6e}", sup_node, d.rz);
    }
}

// ================================================================
// Castigliano's Second Theorem: ∂U/∂P = δ
// ================================================================

/// Verify Castigliano's theorem via finite difference: (U(P+ΔP) - U(P)) / ΔP ≈ δ(P).
#[test]
fn validation_castigliano_finite_difference() {
    let n = 8;
    let tip = n + 1;
    let p = 10.0;
    let dp = 0.001;

    // U(P) = ½ P δ(P), and since δ = αP for linear system: U = ½αP²
    // dU/dP = αP = δ
    let input_1 = make_beam(n, L, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: tip, fx: 0.0, fy: -p, mz: 0.0 })]);
    let input_2 = make_beam(n, L, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: tip, fx: 0.0, fy: -(p + dp), mz: 0.0 })]);

    let res_1 = linear::solve_2d(&input_1).unwrap();
    let res_2 = linear::solve_2d(&input_2).unwrap();

    let d1 = res_1.displacements.iter().find(|d| d.node_id == tip).unwrap().uy.abs();
    let d2 = res_2.displacements.iter().find(|d| d.node_id == tip).unwrap().uy.abs();

    let u1 = 0.5 * p * d1;
    let u2 = 0.5 * (p + dp) * d2;
    let du_dp = (u2 - u1) / dp;

    // Should equal δ(P) = d1
    assert_close(du_dp, d1, 0.001, "Castigliano: ∂U/∂P = δ");
}

/// Castigliano for a frame: verify energy derivative matches displacement.
#[test]
fn validation_castigliano_portal_frame() {
    let p = 5.0;
    let dp = 0.001;

    let mut input_1 = make_portal_frame(3.0, 5.0, E, A, IZ, 0.0, 0.0);
    input_1.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p, fy: 0.0, mz: 0.0 }));

    let mut input_2 = make_portal_frame(3.0, 5.0, E, A, IZ, 0.0, 0.0);
    input_2.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p + dp, fy: 0.0, mz: 0.0 }));

    let res_1 = linear::solve_2d(&input_1).unwrap();
    let res_2 = linear::solve_2d(&input_2).unwrap();

    let ux1 = res_1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux2 = res_2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    let u1 = 0.5 * p * ux1;
    let u2 = 0.5 * (p + dp) * ux2;
    let du_dp = (u2 - u1) / dp;

    assert_close(du_dp, ux1, 0.001, "Castigliano portal: ∂U/∂P = ux");
}

// ================================================================
// Superposition Principle: u(F₁+F₂) = u(F₁) + u(F₂)
// ================================================================

/// SS beam: two separate point loads superpose exactly.
#[test]
fn validation_superposition_beam_point_loads() {
    let n = 8;

    let input_1 = make_beam(n, L, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -10.0, mz: 0.0 })]);
    let input_2 = make_beam(n, L, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -15.0, mz: 0.0 })]);
    let input_c = make_beam(n, L, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -10.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -15.0, mz: 0.0 }),
        ]);

    let res_1 = linear::solve_2d(&input_1).unwrap();
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let res_c = linear::solve_2d(&input_c).unwrap();

    for dc in &res_c.displacements {
        let d1 = res_1.displacements.iter().find(|d| d.node_id == dc.node_id).unwrap();
        let d2 = res_2.displacements.iter().find(|d| d.node_id == dc.node_id).unwrap();

        assert_close(dc.ux, d1.ux + d2.ux, 1e-10,
            &format!("Superposition ux node {}", dc.node_id));
        assert_close(dc.uy, d1.uy + d2.uy, 1e-10,
            &format!("Superposition uy node {}", dc.node_id));
        assert_close(dc.rz, d1.rz + d2.rz, 1e-10,
            &format!("Superposition rz node {}", dc.node_id));
    }
}

/// Portal frame: lateral + gravity superposes with individual cases.
#[test]
fn validation_superposition_frame() {
    let input_1 = make_portal_frame(3.0, 5.0, E, A, IZ, 10.0, 0.0);
    let input_2 = make_portal_frame(3.0, 5.0, E, A, IZ, 0.0, -5.0);
    let input_c = make_portal_frame(3.0, 5.0, E, A, IZ, 10.0, -5.0);

    let res_1 = linear::solve_2d(&input_1).unwrap();
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let res_c = linear::solve_2d(&input_c).unwrap();

    for dc in &res_c.displacements {
        let d1 = res_1.displacements.iter().find(|d| d.node_id == dc.node_id).unwrap();
        let d2 = res_2.displacements.iter().find(|d| d.node_id == dc.node_id).unwrap();

        assert_close(dc.ux, d1.ux + d2.ux, 1e-10,
            &format!("Superposition frame ux node {}", dc.node_id));
        assert_close(dc.uy, d1.uy + d2.uy, 1e-10,
            &format!("Superposition frame uy node {}", dc.node_id));
    }
}

/// 3D beam: two load cases in different directions superpose.
#[test]
fn validation_superposition_3d() {
    let n = 4;
    let tip = n + 1;

    let input_1 = make_3d_beam(n, L, E, 0.3, A, IZ, IZ, 5e-5,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: tip, fx: 0.0, fy: -10.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let input_2 = make_3d_beam(n, L, E, 0.3, A, IZ, IZ, 5e-5,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: tip, fx: 0.0, fy: 0.0, fz: -5.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let input_c = make_3d_beam(n, L, E, 0.3, A, IZ, IZ, 5e-5,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: tip, fx: 0.0, fy: -10.0, fz: -5.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    let res_1 = linear::solve_3d(&input_1).unwrap();
    let res_2 = linear::solve_3d(&input_2).unwrap();
    let res_c = linear::solve_3d(&input_c).unwrap();

    for dc in &res_c.displacements {
        let d1 = res_1.displacements.iter().find(|d| d.node_id == dc.node_id).unwrap();
        let d2 = res_2.displacements.iter().find(|d| d.node_id == dc.node_id).unwrap();

        assert_close(dc.uy, d1.uy + d2.uy, 1e-10,
            &format!("Superposition 3D uy node {}", dc.node_id));
        assert_close(dc.uz, d1.uz + d2.uz, 1e-10,
            &format!("Superposition 3D uz node {}", dc.node_id));
    }
}
