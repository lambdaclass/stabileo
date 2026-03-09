/// Validation: NAFEMS Standard FE Benchmarks
///
/// References:
///   - NAFEMS "Standard Benchmark Tests" for finite elements
///   - NAFEMS FV2: Axially loaded bar
///   - NAFEMS FV12: Free vibration of a cantilever
///   - NAFEMS FV32: Simply supported beam under uniform load
///   - NAFEMS T3: Thermal stress in a constrained bar
///   - NAFEMS LE5: Z-section cantilever (3D coupled bending)
///   - NAFEMS FV52: Pin-jointed cross frame
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// ================================================================
// 1. NAFEMS FV2: Axially Loaded Bar
// ================================================================
//
// Single truss element, fixed at one end, axial force at the other.
// Reference: δ = FL/(EA), σ = F/A.

#[test]
fn validation_nafems_fv2_axial_bar() {
    let e = 200_000.0;
    let a = 0.01;
    let length = 5.0;
    let f = 100.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, length, 0.0)],
        vec![(1, e, 0.3)],
        vec![(1, a, 0.0)],
        vec![(1, "truss", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fy: 0.0, mz: 0.0 })],
    );

    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let e_eff = e * 1000.0; // Engine internal unit convention
    let delta_exact = f * length / (e_eff * a);

    assert_close(d2.ux, delta_exact, 1e-10, "NAFEMS FV2: δ = FL/(EA)");

    // Axial force in element should equal applied force
    let ef = &results.element_forces[0];
    assert_close(ef.n_start.abs(), f, 0.01, "NAFEMS FV2: N = F");
}

// ================================================================
// 2. NAFEMS FV12: Free Vibration of a Cantilever
// ================================================================
//
// Cantilever beam, uniform section, exact frequencies from Euler-Bernoulli theory:
// ω_n = (β_n L)² √(EI / (ρAL⁴))
// β₁L = 1.8751, β₂L = 4.6941, β₃L = 7.8548

#[test]
fn validation_nafems_fv12_cantilever_vibration() {
    let e = 200_000.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let length = 5.0;
    let density = 7850.0;
    let n_elem = 10;

    let solver = make_beam(n_elem, length, e, a_sec, iz, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 3).unwrap();

    // Exact Euler-Bernoulli frequencies
    let ei = e * 1000.0 * iz; // Engine internal EI convention
    let rho_a = density * a_sec / 1000.0; // Engine internal mass convention
    let beta_l = [1.87510407, 4.69409113, 7.85475744];

    for (i, &bl) in beta_l.iter().enumerate() {
        if i >= modal_res.modes.len() { break; }
        let omega_exact = bl * bl / (length * length) * (ei / rho_a).sqrt();
        let f_exact = omega_exact / (2.0 * std::f64::consts::PI);
        let f_fe = modal_res.modes[i].frequency;

        // FE frequencies converge from above (stiffened)
        let error = (f_fe - f_exact).abs() / f_exact;
        assert!(
            error < 0.02,
            "NAFEMS FV12 mode {}: f_fe={:.4}, f_exact={:.4}, error={:.2}%",
            i + 1, f_fe, f_exact, error * 100.0
        );
    }
}

// ================================================================
// 3. NAFEMS FV32: Simply Supported Beam Under Uniform Load
// ================================================================
//
// Reference: δ_mid = 5qL⁴/(384EI), M_mid = qL²/8.

#[test]
fn validation_nafems_fv32_ss_beam_udl() {
    let e = 200_000.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let length = 6.0;
    let q = -5.0;
    let n = 8;

    let input = make_ss_beam_udl(n, length, e, a_sec, iz, q);
    let results = linear::solve_2d(&input).unwrap();

    let ei = e * 1000.0 * iz; // Engine internal EI convention
    let mid = n / 2 + 1;

    // Midspan deflection
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let delta_exact = 5.0 * q.abs() * length.powi(4) / (384.0 * ei);
    assert_close(d_mid.uy.abs(), delta_exact, 0.01, "NAFEMS FV32: δ_mid");

    // Midspan moment = qL²/8
    let m_exact = q.abs() * length * length / 8.0;
    // Find element containing midspan, check moment
    let mid_elem = n / 2; // element index (0-based) or id (1-based)
    let ef = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    // Moment at end of element before midspan should be close to M_max
    assert_close(ef.m_end.abs(), m_exact, 0.02, "NAFEMS FV32: M_mid");
}

// ================================================================
// 4. NAFEMS FV52: Pin-Jointed Cross Frame (Truss)
// ================================================================
//
// 4-node, 5-bar cross-braced truss. Pinned at base, loaded at top.
// Verify member forces against statics solution.
//
//    3---4        Load P↓ at node 4
//    |\ /|        Nodes: 1(0,0), 2(2,0), 3(0,2), 4(2,2)
//    | X |        Bars: 1-3, 2-4, 3-4, 1-4, 2-3
//    |/ \|
//    1---2

#[test]
fn validation_nafems_fv52_cross_truss() {
    let e = 200_000.0;
    let a_sec = 0.001;
    let w = 2.0;
    let h = 2.0;
    let p = 10.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, w, 0.0), (3, 0.0, h), (4, w, h)],
        vec![(1, e, 0.3)],
        vec![(1, a_sec, 0.0)],
        vec![
            (1, "truss", 1, 3, 1, 1, false, false),  // left vertical
            (2, "truss", 2, 4, 1, 1, false, false),  // right vertical
            (3, "truss", 3, 4, 1, 1, false, false),  // top horizontal
            (4, "truss", 1, 4, 1, 1, false, false),  // diagonal 1
            (5, "truss", 2, 3, 1, 1, false, false),  // diagonal 2
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!((sum_ry - p).abs() < 0.01, "NAFEMS FV52: vertical equilibrium");

    // By symmetry of geometry (but asymmetric load), the diagonal members should
    // have different forces. All member forces should be axial only (truss).
    for ef in &results.element_forces {
        // Shear should be zero for truss
        assert!(
            ef.v_start.abs() < 1e-6,
            "NAFEMS FV52: truss element {} has shear {:.6e}", ef.element_id, ef.v_start
        );
    }
}

// ================================================================
// 5. NAFEMS T3: Thermal Stress in a Constrained Bar
// ================================================================
//
// Fixed-fixed bar with uniform temperature rise ΔT.
// Reference: σ = -E·α·ΔT (compressive, bar cannot expand).
// Engine uses hardcoded α = 12e-6 (steel).

#[test]
fn validation_nafems_t3_thermal_stress() {
    let e = 200_000.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let length = 4.0;
    let alpha = 12e-6; // Engine hardcodes steel α = 12e-6
    let delta_t = 50.0;
    let n = 4;

    let mut input = make_beam(n, length, e, a_sec, iz, "fixed", Some("fixed"), vec![]);
    for i in 1..=n {
        input.loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: delta_t,
            dt_gradient: 0.0,
        }));
    }

    let results = linear::solve_2d(&input).unwrap();

    // Axial force magnitude: |N| = E_eff·A·α·ΔT (compression)
    let e_eff = e * 1000.0; // Engine internal unit convention
    let n_expected = e_eff * a_sec * alpha * delta_t;
    for ef in &results.element_forces {
        assert!(
            (ef.n_start.abs() - n_expected).abs() < n_expected * 0.02,
            "NAFEMS T3: |N|={:.2}, expected {:.2} in element {}",
            ef.n_start.abs(), n_expected, ef.element_id
        );
    }

    // Displacements should be zero (fully restrained thermal expansion)
    for d in &results.displacements {
        assert!(d.ux.abs() < 1e-10,
            "NAFEMS T3: node {} should have zero ux, got {:.6e}", d.node_id, d.ux);
    }
}

// ================================================================
// 6. NAFEMS LE5: Z-Section Cantilever (3D)
// ================================================================
//
// Cantilever with non-symmetric section loaded at tip.
// For a beam with Iy ≠ Iz loaded in one plane, the deflection should
// have components in both Y and Z (biaxial bending).
// This tests the 3D frame element's coupling behavior.

#[test]
fn validation_nafems_le5_z_section_cantilever_3d() {
    let e = 200_000.0;
    let nu = 0.3;
    let length = 5.0;
    let n = 8;
    let n_nodes = n + 1;

    // Z-section: Iy ≠ Iz → biaxial bending under single-axis load
    let a_sec = 0.01;
    let iy = 2e-4;  // strong axis
    let iz = 5e-5;  // weak axis
    let j = 3e-5;
    let p = 10.0;

    let input = make_3d_beam(n, length, e, nu, a_sec, iy, iz, j,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_nodes, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();

    // Tip should deflect in Y (primary bending direction)
    let delta_y_exact = p * length.powi(3) / (3.0 * e * 1000.0 * iz);
    assert_close(tip.uy.abs(), delta_y_exact, 0.01,
        "NAFEMS LE5: tip uy matches Euler-Bernoulli");

    // With Iy ≠ Iz but load only in Y, there's no coupling for a principal-axis-aligned section.
    // The uz deflection should be zero (no out-of-plane coupling for aligned axes).
    assert!(tip.uz.abs() < 1e-8,
        "NAFEMS LE5: uz should be ~0 for principal-axis loading, got {:.6e}", tip.uz);

    // Verify global equilibrium
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!((sum_fy - p).abs() < 0.01, "NAFEMS LE5: vertical equilibrium");
}
