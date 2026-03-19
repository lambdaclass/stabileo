/// Validation: Castigliano's Theorems
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 8
///   - Hibbeler, "Structural Analysis", Ch. 9
///   - Timoshenko, "Strength of Materials", Vol. 1, Ch. 12
///
/// Castigliano's second theorem:
///   δ_i = ∂U/∂P_i where U = strain energy = ∫M²/(2EI)dx + ∫N²/(2EA)dx
///
/// Tests verify energy-based deflection calculations:
///   1. SS beam center: δ = PL³/(48EI) via energy
///   2. Cantilever tip: δ = PL³/(3EI) via energy
///   3. Strain energy: U = ½PΔ
///   4. Truss strain energy
///   5. Frame: combined axial + bending energy
///   6. Energy of UDL beam
///   7. Castigliano for rotation: θ = ∂U/∂M
///   8. Energy consistency: U_combined = U_axial + U_bending
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Center Load: Energy Gives δ = PL³/(48EI)
// ================================================================

#[test]
fn validation_castigliano_ss_center() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Castigliano: δ = ∂U/∂P = PL³/(48EI)
    let delta_exact = p * l * l * l / (48.0 * e_eff * IZ);
    assert_close(d_mid.uz.abs(), delta_exact, 0.02,
        "Castigliano: SS center δ = PL³/(48EI)");
}

// ================================================================
// 2. Cantilever Tip Load: δ = PL³/(3EI)
// ================================================================

#[test]
fn validation_castigliano_cantilever() {
    let l = 5.0;
    let n = 10;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_exact = p * l * l * l / (3.0 * e_eff * IZ);
    assert_close(tip.uz.abs(), delta_exact, 0.02,
        "Castigliano: cantilever δ = PL³/(3EI)");
}

// ================================================================
// 3. Strain Energy: U = ½PΔ
// ================================================================
//
// For a single concentrated load, U = ½ × P × δ.

#[test]
fn validation_castigliano_strain_energy() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let delta = results.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // U = ½PΔ
    let u_external = 0.5 * p * delta;

    // U_bending = ∫M²/(2EI)dx = P²L³/(96EI) for SS beam center load
    let u_bending = p * p * l * l * l / (96.0 * e_eff * IZ);

    assert_close(u_external, u_bending, 0.02,
        "Strain energy: U = ½PΔ = P²L³/(96EI)");
}

// ================================================================
// 4. Truss Strain Energy
// ================================================================
//
// For a truss: U = Σ N²L/(2EA)
// δ = ∂U/∂P

#[test]
fn validation_castigliano_truss_energy() {
    let h: f64 = 3.0;
    let w: f64 = 4.0;
    let p = 50.0;
    let e_eff = E * 1000.0;
    let a_truss = 0.001;

    let bar_len = (w * w + h * h).sqrt();
    let sin_a = h / bar_len;
    let cos_a = w / bar_len;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 2.0 * w, 0.0), (3, w, h)],
        vec![(1, E, 0.3)],
        vec![(1, a_truss, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 1, 3, 1, 1, false, false),
            (3, "truss", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Axial forces: diagonals = P/(2sinα), bottom = P cosα/(2sinα)
    let n_diag = p / (2.0 * sin_a);
    let n_bottom = p * cos_a / (2.0 * sin_a);

    // Strain energy: U = Σ N²L/(2EA)
    let u_diag = 2.0 * n_diag * n_diag * bar_len / (2.0 * e_eff * a_truss);
    let u_bottom = n_bottom * n_bottom * (2.0 * w) / (2.0 * e_eff * a_truss);
    let u_total = u_diag + u_bottom;

    // U = ½ × P × δ_vertical
    let u_external = 0.5 * p * d3.uz.abs();

    assert_close(u_external, u_total, 0.02,
        "Truss energy: ½Pδ = Σ N²L/(2EA)");
}

// ================================================================
// 5. Frame: Combined Axial + Bending Energy
// ================================================================

#[test]
fn validation_castigliano_frame_energy() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // External work = ½ × F × Δ
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let u_external = 0.5 * f_lat * d2.ux;

    // Should be positive (force and displacement in same direction)
    assert!(u_external > 0.0,
        "Frame energy: U > 0: {:.6e}", u_external);

    // Energy should be finite and reasonable
    assert!(u_external < 100.0,
        "Frame energy: U reasonable: {:.6e}", u_external);
}

// ================================================================
// 6. Energy of UDL Beam
// ================================================================
//
// SS beam with UDL: U = q²L⁵/(240EI)

#[test]
fn validation_castigliano_udl_energy() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // External work = ½ × ∫q × δ(x) dx ≈ ½ × q × Σδ_i × Δx
    let dx = l / n as f64;
    let u_external: f64 = results.displacements.iter()
        .filter(|d| d.node_id >= 1 && d.node_id <= n + 1)
        .map(|d| {
            let weight = if d.node_id == 1 || d.node_id == n + 1 { 0.5 } else { 1.0 };
            0.5 * q.abs() * d.uz.abs() * dx * weight
        })
        .sum();

    // Analytical: U = q²L⁵/(240EI) for SS beam with UDL
    let u_exact = q * q * l * l * l * l * l / (240.0 * e_eff * IZ);

    assert_close(u_external, u_exact, 0.02,
        "UDL energy: U = q²L⁵/(240EI)");
}

// ================================================================
// 7. Castigliano for Rotation: θ = ∂U/∂M
// ================================================================
//
// Apply moment M at free end of cantilever.
// θ = ML/(EI) = ∂U/∂M where U = M²L/(2EI)

#[test]
fn validation_castigliano_rotation() {
    let l = 6.0;
    let n = 12;
    let m = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: 0.0, my: m,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // θ = ML/(EI)
    let theta_exact = m * l / (e_eff * IZ);
    assert_close(tip.ry.abs(), theta_exact, 0.02,
        "Castigliano rotation: θ = ML/(EI)");

    // Verify U = ½Mθ = M²L/(2EI)
    let u = 0.5 * m * tip.ry.abs();
    let u_exact = m * m * l / (2.0 * e_eff * IZ);
    assert_close(u, u_exact, 0.02,
        "Castigliano rotation: U = M²L/(2EI)");
}

// ================================================================
// 8. Energy Consistency: U_combined = U_axial + U_bending
// ================================================================

#[test]
fn validation_castigliano_energy_additivity() {
    let l = 6.0;
    let n = 6;
    let p_ax = 50.0;
    let p_tr = 10.0;

    // Cantilever with both axial and transverse loads
    let loads_both = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p_ax, fz: -p_tr, my: 0.0,
    })];
    let input_both = make_beam(n, l, E, A, IZ, "fixed", None, loads_both);
    let res_both = linear::solve_2d(&input_both).unwrap();
    let tip_both = res_both.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Combined external work
    let u_combined = 0.5 * (p_ax * tip_both.ux + p_tr * tip_both.uz.abs());

    // Axial only
    let loads_ax = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p_ax, fz: 0.0, my: 0.0,
    })];
    let input_ax = make_beam(n, l, E, A, IZ, "fixed", None, loads_ax);
    let tip_ax = linear::solve_2d(&input_ax).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let u_ax = 0.5 * p_ax * tip_ax;

    // Transverse only
    let loads_tr = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p_tr, my: 0.0,
    })];
    let input_tr = make_beam(n, l, E, A, IZ, "fixed", None, loads_tr);
    let tip_tr = linear::solve_2d(&input_tr).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;
    let u_tr = 0.5 * p_tr * tip_tr.abs();

    // U_combined = U_axial + U_bending (for linear uncoupled systems)
    assert_close(u_combined, u_ax + u_tr, 0.01,
        "Energy additivity: U_combined = U_ax + U_bend");
}
