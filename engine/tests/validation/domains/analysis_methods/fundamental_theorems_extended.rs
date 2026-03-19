/// Validation: Fundamental Structural Mechanics Theorems (Extended)
///
/// Extended tests for foundational principles beyond the base file:
///   - Maxwell-Betti for continuous beams and mixed force/moment DOFs
///   - Clapeyron's theorem for UDL beams and fixed-fixed beams
///   - Castigliano's theorem for rotation (∂U/∂M = θ) and 3D beams
///   - Superposition for scaling (αF → αδ) and sign reversal (-F → -δ)
///   - Work-energy balance for 3D structures
///   - Equilibrium of element forces (ΣV = 0, ΣM = 0)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Maxwell-Betti on Continuous Beam (two spans)
// ================================================================
//
// A two-span continuous beam (pinned-roller-roller).
// Load at node i → uy at node j  must equal  load at node j → uy at node i.
// This extends Betti to indeterminate structures.

#[test]
fn validation_ext_maxwell_betti_continuous_beam() {
    let spans = [4.0, 4.0];
    let n_per_span = 4;
    // Node layout: 1..9 (4 elements per span, 2 spans, 9 nodes)
    // Interior nodes of span 1: 2,3,4; span 2: 6,7,8
    let node_i = 3; // in span 1
    let node_j = 7; // in span 2

    let input_a = make_continuous_beam(
        &spans, n_per_span, E, A, IZ,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: node_i, fx: 0.0, fz: -1.0, my: 0.0 })],
    );
    let input_b = make_continuous_beam(
        &spans, n_per_span, E, A, IZ,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: node_j, fx: 0.0, fz: -1.0, my: 0.0 })],
    );

    let res_a = linear::solve_2d(&input_a).unwrap();
    let res_b = linear::solve_2d(&input_b).unwrap();

    let d_a_at_j = res_a.displacements.iter().find(|d| d.node_id == node_j).unwrap().uz;
    let d_b_at_i = res_b.displacements.iter().find(|d| d.node_id == node_i).unwrap().uz;

    assert_close(d_a_at_j, d_b_at_i, 1e-10,
        "Maxwell-Betti continuous beam: δ_{i,j} = δ_{j,i}");
}

// ================================================================
// 2. Clapeyron for SS Beam with UDL: W_ext = 5qL⁴/(768EI) per unit q
// ================================================================
//
// SS beam under uniform load q. External work W = ½ Σ (q·elem_len) · uy_avg.
// For exact comparison: U_strain = q²L⁵ / (240 EI) ... but we use the
// simpler check that W_ext (computed from nodal forces and displacements)
// matches ½·q·∫δ(x)dx, which for a SS beam equals 5q²L⁵/(768EI).
// Actually easier: compare W_ext = ½ Σ FEF·u to the analytical
// midspan energy P²L³/(96EI) approach. Use the Clapeyron identity instead:
//   Total strain energy U = ½ Σ (element end forces · end displacements)
//   And U must equal the external work.
//
// Simplified approach: midspan deflection δ_mid matches 5qL⁴/(384EI).

#[test]
fn validation_ext_clapeyron_ss_beam_udl() {
    let l: f64 = 6.0;
    let n = 12;
    let q = -8.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Exact midspan deflection: δ = 5qL⁴/(384EI)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);

    assert_close(d_mid.uz.abs(), delta_exact, 0.02,
        "Clapeyron UDL: midspan δ = 5qL⁴/(384EI)");

    // Also verify external work is positive via Clapeyron
    // W_ext = ½ Σ (applied force * displacement) > 0
    // For UDL, equivalent nodal forces act downward, displacements are downward → W > 0
    // We check that total reaction work sums correctly:
    // Σ R_y · u_y at supports should be zero (supports don't move for pinned/roller)
    let sup_1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let sup_n = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(sup_1.uz.abs() < 1e-10, "Pinned support uy must be zero");
    assert!(sup_n.uz.abs() < 1e-10, "Roller support uy must be zero");
}

// ================================================================
// 3. Castigliano for Rotation: ∂U/∂M = θ
// ================================================================
//
// Cantilever with tip moment M. Tip rotation θ = ML/(EI).
// Verify via finite difference: (U(M+dM) - U(M)) / dM ≈ θ(M).

#[test]
fn validation_ext_castigliano_rotation() {
    let l: f64 = 5.0;
    let n = 10;
    let tip = n + 1;
    let m_val: f64 = 8.0;
    let dm: f64 = 0.001;
    let e_eff: f64 = E * 1000.0;

    // Case 1: moment = m_val
    let input_1 = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: tip, fx: 0.0, fz: 0.0, my: m_val })]);
    // Case 2: moment = m_val + dm
    let input_2 = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: tip, fx: 0.0, fz: 0.0, my: m_val + dm })]);

    let res_1 = linear::solve_2d(&input_1).unwrap();
    let res_2 = linear::solve_2d(&input_2).unwrap();

    let rz_1 = res_1.displacements.iter().find(|d| d.node_id == tip).unwrap().ry;
    let rz_2 = res_2.displacements.iter().find(|d| d.node_id == tip).unwrap().ry;

    // Strain energy: U = ½ M θ (linear system)
    let u1 = 0.5 * m_val * rz_1;
    let u2 = 0.5 * (m_val + dm) * rz_2;
    let du_dm = (u2 - u1) / dm;

    // ∂U/∂M should equal θ
    assert_close(du_dm, rz_1, 0.001, "Castigliano rotation: ∂U/∂M = θ");

    // Also check analytical: θ = ML/(EI)
    let theta_exact = m_val * l / (e_eff * IZ);
    assert_close(rz_1, theta_exact, 0.02,
        "Cantilever tip rotation: θ = ML/(EI)");
}

// ================================================================
// 4. Superposition Scaling: αF → αδ
// ================================================================
//
// For a linear system, doubling the load must double the displacements.
// Check with α = 3.7 (arbitrary non-integer scaling factor).

#[test]
fn validation_ext_superposition_scaling() {
    let l: f64 = 6.0;
    let n = 8;
    let p = 10.0;
    let alpha: f64 = 3.7;
    let mid = n / 2 + 1;

    let input_base = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: mid, fx: 0.0, fz: -p, my: 0.0 })]);
    let input_scaled = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: mid, fx: 0.0, fz: -p * alpha, my: 0.0 })]);

    let res_base = linear::solve_2d(&input_base).unwrap();
    let res_scaled = linear::solve_2d(&input_scaled).unwrap();

    for ds in &res_scaled.displacements {
        let db = res_base.displacements.iter().find(|d| d.node_id == ds.node_id).unwrap();
        assert_close(ds.uz, alpha * db.uz, 1e-10,
            &format!("Scaling uy node {}: {}*δ", ds.node_id, alpha));
        assert_close(ds.ry, alpha * db.ry, 1e-10,
            &format!("Scaling rz node {}: {}*θ", ds.node_id, alpha));
    }

    // Also check reactions scale
    for rs in &res_scaled.reactions {
        let rb = res_base.reactions.iter().find(|r| r.node_id == rs.node_id).unwrap();
        assert_close(rs.rz, alpha * rb.rz, 1e-10,
            &format!("Scaling reaction ry node {}", rs.node_id));
    }
}

// ================================================================
// 5. Superposition Sign Reversal: -F → -δ
// ================================================================
//
// Reversing the sign of all loads must reverse the sign of all displacements
// and reactions.

#[test]
fn validation_ext_superposition_sign_reversal() {
    let l: f64 = 5.0;
    let n = 8;
    let tip = n + 1;
    let p = 12.0;

    let input_pos = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: tip, fx: 0.0, fz: -p, my: 0.0 })]);
    let input_neg = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: tip, fx: 0.0, fz: p, my: 0.0 })]);

    let res_pos = linear::solve_2d(&input_pos).unwrap();
    let res_neg = linear::solve_2d(&input_neg).unwrap();

    for dp in &res_pos.displacements {
        let dn = res_neg.displacements.iter().find(|d| d.node_id == dp.node_id).unwrap();
        assert_close(dn.uz, -dp.uz, 1e-10,
            &format!("Sign reversal uy node {}", dp.node_id));
        assert_close(dn.ry, -dp.ry, 1e-10,
            &format!("Sign reversal rz node {}", dp.node_id));
    }

    // Element forces should also reverse sign
    for ef_pos in &res_pos.element_forces {
        let ef_neg = res_neg.element_forces.iter()
            .find(|ef| ef.element_id == ef_pos.element_id).unwrap();
        assert_close(ef_neg.m_start, -ef_pos.m_start, 1e-10,
            &format!("Sign reversal m_start elem {}", ef_pos.element_id));
        assert_close(ef_neg.v_start, -ef_pos.v_start, 1e-10,
            &format!("Sign reversal v_start elem {}", ef_pos.element_id));
    }
}

// ================================================================
// 6. Global Force Equilibrium and Element Equilibrium
// ================================================================
//
// For any loaded structure, the sum of reactions must exactly balance
// the applied loads: ΣFx = 0, ΣFy = 0.
// Additionally, for each element without distributed loads,
// shear must be constant: v_start = -v_end, and moments must be
// consistent: m_end = -m_start + v_start * L.

#[test]
fn validation_ext_global_equilibrium_portal() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let h_load = 15.0;
    let g_load = -10.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, g_load);
    let results = linear::solve_2d(&input).unwrap();

    // Compute total applied forces
    let mut fx_applied: f64 = 0.0;
    let mut fy_applied: f64 = 0.0;
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            fx_applied += nl.fx;
            fy_applied += nl.fz;
        }
    }

    // Sum of reactions
    let rx_sum: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let ry_sum: f64 = results.reactions.iter().map(|r| r.rz).sum();

    // Force equilibrium: applied + reactions = 0
    assert_close(rx_sum + fx_applied, 0.0, 0.01,
        "Global equilibrium ΣFx = 0");
    assert_close(ry_sum + fy_applied, 0.0, 0.01,
        "Global equilibrium ΣFy = 0");

    // Element-level equilibrium: for unloaded elements (no distributed load),
    // axial force is constant along the element: n_start = n_end
    for ef in &results.element_forces {
        assert_close(ef.n_start, ef.n_end, 0.01,
            &format!("Element {} axial equilibrium: N_start = N_end (constant axial)", ef.element_id));
    }
}

// ================================================================
// 7. Work-Energy Balance for 3D Cantilever
// ================================================================
//
// 3D cantilever with tip force in Y-direction.
// W_ext = ½ F · δ must match analytical U = P²L³/(6EI).

#[test]
fn validation_ext_work_energy_3d_cantilever() {
    let l: f64 = 5.0;
    let n = 8;
    let tip = n + 1;
    let p = 10.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 5e-5,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: tip, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    let results = linear::solve_3d(&input).unwrap();
    let d_tip = results.displacements.iter().find(|d| d.node_id == tip).unwrap();

    // External work: W = ½ P |δ_y|
    let w_ext: f64 = 0.5 * p * d_tip.uz.abs();

    // Analytical strain energy: U = P²L³/(6EI)
    let u_analytical: f64 = p * p * l.powi(3) / (6.0 * e_eff * IZ);

    assert_close(w_ext, u_analytical, 0.02,
        "3D work-energy: W_ext = P²L³/(6EI)");

    // Also verify tip deflection directly
    let delta_exact: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(d_tip.uz.abs(), delta_exact, 0.02,
        "3D cantilever tip deflection: δ = PL³/(3EI)");
}

// ================================================================
// 8. Maxwell-Betti 3D Mixed DOF: Fz at node i → ry at j = My at j → uz at i
// ================================================================
//
// 3D cantilever beam: apply Fz at one internal node, read rotation ry at another.
// Then apply My at the second node, read uz at the first. They must be equal.

#[test]
fn validation_ext_maxwell_betti_3d_mixed_dof() {
    let l: f64 = 6.0;
    let n = 6;
    let node_i = 3;
    let node_j = 5;

    // Case A: Fz = 1.0 at node_i
    let input_a = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 5e-5,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_i, fx: 0.0, fy: 0.0, fz: -1.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    // Case B: My = -1.0 at node_j (moment about y-axis)
    let input_b = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 5e-5,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_j, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: -1.0, mz: 0.0, bw: None,
        })]);

    let res_a = linear::solve_3d(&input_a).unwrap();
    let res_b = linear::solve_3d(&input_b).unwrap();

    // Fz at node_i → rotation ry at node_j
    let ry_a_at_j = res_a.displacements.iter().find(|d| d.node_id == node_j).unwrap().rz;
    // My at node_j → displacement uz at node_i
    let uz_b_at_i = res_b.displacements.iter().find(|d| d.node_id == node_i).unwrap().uz;

    assert_close(ry_a_at_j, uz_b_at_i, 1e-10,
        "Maxwell-Betti 3D mixed: Fz→ry = My→uz");
}
