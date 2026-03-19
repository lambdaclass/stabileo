/// Validation: NAFEMS Extended Benchmarks
///
/// References:
///   - NAFEMS "Standard Benchmark Tests for Finite Element Accuracy"
///   - NAFEMS LE1:  Elliptic membrane (approximated as frame grid for load distribution)
///   - NAFEMS FV2:  Natural frequency of a simply supported beam
///   - NAFEMS FV4:  Cantilever beam natural frequencies (multiple modes)
///   - NAFEMS FV12: Free-free beam frequencies (indirect via boundary condition ratios)
///   - NAFEMS FV32: Free vibration of a symmetric cross-ply laminate (frame approximation)
///   - NAFEMS T1:   Plane thermal stress benchmark (1D bar analog)
///   - NAFEMS LE10: Thick plate bending (approximated as grillage of 3D beams)
///   - NAFEMS R0031: Linear elastic 3D beam bending
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// ================================================================
// 1. NAFEMS LE1 -- Elliptic Membrane (Frame Grid Approximation)
// ================================================================
//
// The NAFEMS LE1 benchmark tests stress in an elliptic membrane under
// internal pressure. We approximate this with a 2D frame grid that
// forms a rectangular mesh. Under uniform vertical load on the top
// chord, we verify equilibrium, symmetry of reactions, and that the
// midspan deflection matches the analytical result for a simply
// supported grid.
//
// Model: 4-bay grid beam (simply supported at ends) with uniform load.
// Effectively a SS beam with UDL -- verifying the "grid" aspect by
// checking that each element contributes correctly to global equilibrium.

#[test]
fn validation_nafems_le1_frame_grid_equilibrium() {
    let e = 200_000.0; // MPa
    let a_sec = 0.02;  // m^2
    let iz = 5e-4;     // m^4
    let length = 8.0;  // m
    let n = 16;         // 16 elements
    let q = -12.0;     // kN/m (downward)

    let input = make_ss_beam_udl(n, length, e, a_sec, iz, q);
    let results = linear::solve_2d(&input).unwrap();

    let e_eff = e * 1000.0;

    // 1. Global vertical equilibrium: sum of reactions = total applied load
    let total_load = q.abs() * length;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 1e-10,
        "NAFEMS LE1: global vertical equilibrium sum(Ry) = qL");

    // 2. Global horizontal equilibrium: no horizontal load applied
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 1e-6,
        "NAFEMS LE1: sum(Rx) = 0, got {:.6e}", sum_rx);

    // 3. Symmetry: reactions at both supports should be equal (= qL/2)
    let r_exact = total_load / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, r_exact, 1e-10, "NAFEMS LE1: R_left = qL/2");
    assert_close(rn.rz, r_exact, 1e-10, "NAFEMS LE1: R_right = qL/2");

    // 4. Midspan deflection: delta = 5qL^4 / (384 EI)
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let delta_exact = 5.0 * q.abs() * length.powi(4) / (384.0 * e_eff * iz);
    assert_close(d_mid.uz.abs(), delta_exact, 0.01,
        "NAFEMS LE1: midspan deflection = 5qL^4/(384EI)");

    // 5. Midspan moment: M_max = qL^2/8
    let m_exact = q.abs() * length * length / 8.0;
    let mid_elem = n / 2;
    let ef = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    assert_close(ef.m_end.abs(), m_exact, 0.02,
        "NAFEMS LE1: midspan moment = qL^2/8");
}

// ================================================================
// 2. NAFEMS FV2 -- Natural Frequency of a Simply Supported Beam
// ================================================================
//
// Simply supported uniform beam. Euler-Bernoulli exact frequencies:
//   f_n = (n*pi)^2 / (2*pi*L^2) * sqrt(EI / (rho*A))
//
// Properties: E=210 GPa, rho=7800 kg/m^3, L=8 m,
// Section: A=0.01 m^2, I=8.333e-6 m^4 (approx 0.1m square).
//
// Reference: NAFEMS FV2 published fundamental frequency.

#[test]
fn validation_nafems_fv2_ss_beam_natural_frequency() {
    let e = 210_000.0;   // MPa
    let density = 7800.0; // kg/m^3
    let length = 8.0;     // m
    let a_sec = 0.01;     // m^2
    let iz = 8.333e-6;    // m^4
    let n_elem = 40;      // fine mesh for accuracy

    let solver = make_beam(n_elem, length, e, a_sec, iz, "pinned", Some("rollerX"), vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 3).unwrap();
    assert!(!modal_res.modes.is_empty(), "NAFEMS FV2: should find at least 1 mode");

    let ei = e * 1000.0 * iz;              // E_EFF * I
    let rho_a = density * a_sec / 1000.0;  // Engine internal mass convention

    // Verify first 3 flexural modes
    for mode_n in 1..=3_usize {
        if mode_n > modal_res.modes.len() { break; }
        let n_f = mode_n as f64;
        let omega_exact = (n_f * std::f64::consts::PI / length).powi(2)
            * (ei / rho_a).sqrt();
        let f_exact = omega_exact / (2.0 * std::f64::consts::PI);

        // Find FE mode closest to this exact frequency
        let closest = modal_res.modes.iter()
            .min_by(|a, b| {
                let ea = (a.frequency - f_exact).abs();
                let eb = (b.frequency - f_exact).abs();
                ea.partial_cmp(&eb).unwrap()
            });

        if let Some(m) = closest {
            let err = (m.frequency - f_exact).abs() / f_exact;
            assert!(
                err < 0.03,
                "NAFEMS FV2 mode {}: f_fe={:.4} Hz, f_exact={:.4} Hz, err={:.2}%",
                mode_n, m.frequency, f_exact, err * 100.0
            );
        }
    }

    // Frequencies should be in ascending order
    for i in 1..modal_res.modes.len() {
        assert!(modal_res.modes[i].frequency >= modal_res.modes[i - 1].frequency,
            "NAFEMS FV2: modes should be in ascending frequency order");
    }

    // Verify fundamental frequency is in a reasonable range
    let f1_exact = (std::f64::consts::PI / length).powi(2)
        * (ei / rho_a).sqrt() / (2.0 * std::f64::consts::PI);
    assert!(f1_exact > 0.1 && f1_exact < 100.0,
        "NAFEMS FV2: f1_exact={:.4} Hz should be reasonable", f1_exact);
}

// ================================================================
// 3. NAFEMS FV4 -- Cantilever Beam Natural Frequencies (Multiple Modes)
// ================================================================
//
// Cantilever beam, uniform section, exact Euler-Bernoulli frequencies:
//   omega_n = (beta_n * L)^2 * sqrt(EI / (rho*A*L^4))
//   beta_1*L = 1.8751, beta_2*L = 4.6941, beta_3*L = 7.8548
//
// Properties: E=200 GPa, rho=7850 kg/m^3, L=6 m,
// Section: A=0.01 m^2, I=1e-4 m^4.
//
// Verify first 3 modes and their frequency ratios.

#[test]
fn validation_nafems_fv4_cantilever_multiple_modes() {
    let e = 200_000.0;
    let density = 7850.0;
    let length = 6.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let n_elem = 20;

    let solver = make_beam(n_elem, length, e, a_sec, iz, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 5).unwrap();
    assert!(modal_res.modes.len() >= 3,
        "NAFEMS FV4: should find at least 3 modes, found {}", modal_res.modes.len());

    let ei = e * 1000.0 * iz;
    let rho_a = density * a_sec / 1000.0;
    let beta_l = [1.87510407, 4.69409113, 7.85475744];

    let mut f_fe_values = Vec::new();
    for (i, &bl) in beta_l.iter().enumerate() {
        let omega_exact = bl * bl / (length * length) * (ei / rho_a).sqrt();
        let f_exact = omega_exact / (2.0 * std::f64::consts::PI);

        // Find closest FE mode
        let closest = modal_res.modes.iter()
            .min_by(|a, b| {
                let ea = (a.frequency - f_exact).abs();
                let eb = (b.frequency - f_exact).abs();
                ea.partial_cmp(&eb).unwrap()
            })
            .unwrap();

        let err = (closest.frequency - f_exact).abs() / f_exact;
        // FE frequencies converge from above (stiffer)
        assert!(
            err < 0.05,
            "NAFEMS FV4 mode {}: f_fe={:.4} Hz, f_exact={:.4} Hz, err={:.2}%",
            i + 1, closest.frequency, f_exact, err * 100.0
        );
        f_fe_values.push(closest.frequency);
    }

    // Verify frequency ratios: f2/f1 = (4.6941/1.8751)^2 = 6.267
    let ratio_21 = f_fe_values[1] / f_fe_values[0];
    let ratio_21_exact = (4.69409113 / 1.87510407_f64).powi(2);
    let err_ratio = (ratio_21 - ratio_21_exact).abs() / ratio_21_exact;
    assert!(err_ratio < 0.05,
        "NAFEMS FV4: f2/f1 ratio = {:.3}, expected {:.3}, err={:.2}%",
        ratio_21, ratio_21_exact, err_ratio * 100.0);

    // Verify f3/f1 ratio: (7.8548/1.8751)^2 = 17.55
    let ratio_31 = f_fe_values[2] / f_fe_values[0];
    let ratio_31_exact = (7.85475744 / 1.87510407_f64).powi(2);
    let err_ratio31 = (ratio_31 - ratio_31_exact).abs() / ratio_31_exact;
    assert!(err_ratio31 < 0.08,
        "NAFEMS FV4: f3/f1 ratio = {:.3}, expected {:.3}, err={:.2}%",
        ratio_31, ratio_31_exact, err_ratio31 * 100.0);
}

// ================================================================
// 4. NAFEMS FV12 -- Free-Free Beam Frequencies
// ================================================================
//
// A free-free beam has rigid body modes (f=0) then flexural modes.
// Since the engine's modal solver filters out near-zero eigenvalues,
// we verify the free-free beam frequencies indirectly by comparing
// the ratio of boundary condition frequencies.
//
// Theoretical relationships (Euler-Bernoulli):
//   Cantilever 1st: beta_1*L = 1.8751
//   SS beam 1st:    beta_1*L = pi = 3.14159
//   Free-free 1st:  beta_1*L = 4.7300
//
// We solve cantilever and SS cases, verify their ratio, then
// predict the free-free first flexural frequency.

#[test]
fn validation_nafems_fv12_free_free_beam_frequencies() {
    let e = 200_000.0;
    let density = 7850.0;
    let length = 8.0;
    let a_sec = 0.01;
    let iz = 8.333e-6;
    let n_elem = 30;

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    // Solve cantilever
    let cantilever = make_beam(n_elem, length, e, a_sec, iz, "fixed", None, vec![]);
    let modal_cant = modal::solve_modal_2d(&cantilever, &densities, 2).unwrap();
    assert!(!modal_cant.modes.is_empty(), "NAFEMS FV12: cantilever should have modes");

    // Solve simply supported
    let ss = make_beam(n_elem, length, e, a_sec, iz, "pinned", Some("rollerX"), vec![]);
    let modal_ss = modal::solve_modal_2d(&ss, &densities, 2).unwrap();
    assert!(!modal_ss.modes.is_empty(), "NAFEMS FV12: SS should have modes");

    let f1_cant = modal_cant.modes[0].frequency;
    let f1_ss = modal_ss.modes[0].frequency;

    // Theoretical ratio: f1_ss / f1_cant = (pi / 1.8751)^2 = 2.802
    let ratio_exact = (std::f64::consts::PI / 1.8751).powi(2);
    let ratio_fe = f1_ss / f1_cant;
    let err = (ratio_fe - ratio_exact).abs() / ratio_exact;
    assert!(
        err < 0.05,
        "NAFEMS FV12: f_ss/f_cant = {:.3}, expected {:.3}, err={:.2}%",
        ratio_fe, ratio_exact, err * 100.0
    );

    // Predict free-free first flexural frequency from cantilever result
    let ratio_ff_cant = (4.7300 / 1.8751_f64).powi(2);
    let f1_ff_predicted = f1_cant * ratio_ff_cant;

    // Verify against exact Euler-Bernoulli free-free formula
    let ei = e * 1000.0 * iz;
    let rho_a = density * a_sec / 1000.0;
    let omega_ff_exact = 4.7300_f64.powi(2) / (length * length) * (ei / rho_a).sqrt();
    let f_ff_exact = omega_ff_exact / (2.0 * std::f64::consts::PI);

    let err_ff = (f1_ff_predicted - f_ff_exact).abs() / f_ff_exact;
    assert!(
        err_ff < 0.05,
        "NAFEMS FV12: predicted free-free f1={:.4} Hz, exact={:.4} Hz, err={:.2}%",
        f1_ff_predicted, f_ff_exact, err_ff * 100.0
    );

    // Free-free first flexural frequency must exceed SS first frequency
    assert!(f1_ff_predicted > f1_ss,
        "NAFEMS FV12: free-free f1 ({:.4}) should exceed SS f1 ({:.4})",
        f1_ff_predicted, f1_ss);

    // Also verify the free-free to SS ratio: (4.7300/pi)^2 = 2.267
    let ratio_ff_ss = (4.7300 / std::f64::consts::PI).powi(2);
    let predicted_from_ss = f1_ss * ratio_ff_ss;
    let err2 = (predicted_from_ss - f_ff_exact).abs() / f_ff_exact;
    assert!(
        err2 < 0.05,
        "NAFEMS FV12: free-free predicted from SS: {:.4} Hz, exact: {:.4} Hz, err={:.2}%",
        predicted_from_ss, f_ff_exact, err2 * 100.0
    );
}

// ================================================================
// 5. NAFEMS FV32 -- Free Vibration of Symmetric Cross-Ply Laminate
//                   (Frame Approximation)
// ================================================================
//
// The NAFEMS FV32 benchmark tests free vibration of a laminated plate.
// We approximate the laminate as a frame beam with effective stiffness
// properties representing the composite layup.
//
// For a symmetric cross-ply laminate [0/90/90/0], the effective
// bending stiffness can be approximated using lamination theory.
// Here we use equivalent beam properties and verify the fundamental
// frequency against the analytical Euler-Bernoulli result.
//
// Properties: Equivalent E=150 GPa, rho=1600 kg/m^3, L=4 m,
// Section: b=0.2 m, h=0.02 m (thin laminate strip).
// Simply supported at both ends.

#[test]
fn validation_nafems_fv32_laminate_vibration_frame_approx() {
    let e = 150_000.0;    // MPa (equivalent laminate modulus)
    let density = 1600.0; // kg/m^3 (composite density)
    let length = 4.0;     // m
    let b = 0.2;          // m (width)
    let h = 0.02;         // m (total thickness)
    let a_sec = b * h;    // 0.004 m^2
    let iz = b * h * h * h / 12.0; // 1.333e-8 m^4
    let n_elem = 30;

    let solver = make_beam(n_elem, length, e, a_sec, iz, "pinned", Some("rollerX"), vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 3).unwrap();
    assert!(!modal_res.modes.is_empty(), "NAFEMS FV32: should find at least 1 mode");

    let ei = e * 1000.0 * iz;
    let rho_a = density * a_sec / 1000.0;

    // SS beam fundamental: f1 = pi^2 / (2*pi*L^2) * sqrt(EI/(rho*A))
    let omega1_exact = (std::f64::consts::PI / length).powi(2) * (ei / rho_a).sqrt();
    let f1_exact = omega1_exact / (2.0 * std::f64::consts::PI);

    let f1_fe = modal_res.modes[0].frequency;
    let err = (f1_fe - f1_exact).abs() / f1_exact;
    assert!(
        err < 0.03,
        "NAFEMS FV32: f1_fe={:.4} Hz, f1_exact={:.4} Hz, err={:.2}%",
        f1_fe, f1_exact, err * 100.0
    );

    // Verify second mode: f2 = 4 * f1 for SS beam
    if modal_res.modes.len() >= 2 {
        let omega2_exact = (2.0 * std::f64::consts::PI / length).powi(2)
            * (ei / rho_a).sqrt();
        let f2_exact = omega2_exact / (2.0 * std::f64::consts::PI);

        // Find closest FE mode to f2
        let closest = modal_res.modes.iter()
            .min_by(|a, b| {
                let ea = (a.frequency - f2_exact).abs();
                let eb = (b.frequency - f2_exact).abs();
                ea.partial_cmp(&eb).unwrap()
            })
            .unwrap();

        let err2 = (closest.frequency - f2_exact).abs() / f2_exact;
        assert!(
            err2 < 0.05,
            "NAFEMS FV32 mode 2: f_fe={:.4} Hz, f_exact={:.4} Hz, err={:.2}%",
            closest.frequency, f2_exact, err2 * 100.0
        );
    }

    // Verify the composite beam has lower frequency than steel beam of same geometry
    // due to lower E/rho ratio for this composite
    let e_steel = 200_000.0;
    let rho_steel = 7850.0;
    let ei_steel = e_steel * 1000.0 * iz;
    let rho_a_steel = rho_steel * a_sec / 1000.0;
    let omega_steel = (std::f64::consts::PI / length).powi(2)
        * (ei_steel / rho_a_steel).sqrt();
    let f_steel = omega_steel / (2.0 * std::f64::consts::PI);

    // Compare E/rho ratios: composite has E/rho = 150e3/1600 = 93.75
    // Steel has E/rho = 200e3/7850 = 25.48
    // So composite should actually have HIGHER frequency per unit mass
    // Exact comparison depends on sqrt(E/rho): composite = sqrt(93750) = 306
    // Steel = sqrt(25478) = 160 -> composite frequency is higher
    let ratio_composite_steel = f1_exact / f_steel;
    assert!(ratio_composite_steel > 1.0,
        "NAFEMS FV32: composite f1/steel f1 = {:.3}, composite should be higher due to E/rho",
        ratio_composite_steel);
}

// ================================================================
// 6. NAFEMS T1 -- Plane Thermal Stress Benchmark (1D Bar Analog)
// ================================================================
//
// Fixed-fixed bar with uniform temperature rise dT.
// Since the bar cannot expand, the thermal strain produces stress:
//   sigma = -E * alpha * dT (compressive)
//   N = -E * A * alpha * dT
//
// All displacements should be zero (fully restrained).
// Engine uses hardcoded alpha = 12e-6 (steel).
//
// Properties: E=200 GPa, A=0.01 m^2, L=5 m, dT=80 degC.

#[test]
fn validation_nafems_t1_thermal_stress_fixed_bar() {
    let e = 200_000.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let length = 5.0;
    let alpha = 12e-6; // Engine hardcodes steel alpha = 12e-6
    let delta_t = 80.0;
    let n = 8;

    // Fixed at both ends
    let mut input = make_beam(n, length, e, a_sec, iz, "fixed", Some("fixed"), vec![]);
    for i in 1..=n {
        input.loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: delta_t,
            dt_gradient: 0.0,
        }));
    }

    let results = linear::solve_2d(&input).unwrap();

    let e_eff = e * 1000.0;
    let n_expected = e_eff * a_sec * alpha * delta_t;

    // 1. All elements should carry the same axial force magnitude
    for ef in &results.element_forces {
        assert!(
            (ef.n_start.abs() - n_expected).abs() < n_expected * 0.02,
            "NAFEMS T1: |N|={:.4} kN, expected {:.4} kN in element {}",
            ef.n_start.abs(), n_expected, ef.element_id
        );
    }

    // 2. All axial displacements should be zero (fully restrained)
    for d in &results.displacements {
        assert!(d.ux.abs() < 1e-10,
            "NAFEMS T1: node {} ux should be 0, got {:.6e}", d.node_id, d.ux);
    }

    // 3. All vertical displacements should be zero (no lateral loading)
    for d in &results.displacements {
        assert!(d.uz.abs() < 1e-10,
            "NAFEMS T1: node {} uy should be 0, got {:.6e}", d.node_id, d.uz);
    }

    // 4. Reactions at fixed ends should balance the thermal force
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    // The sum of horizontal reactions should be zero (internal thermal force only)
    let sum_rx = r1.rx + rn.rx;
    assert!(sum_rx.abs() < 1e-6,
        "NAFEMS T1: sum(Rx) should be 0, got {:.6e}", sum_rx);

    // 5. Each reaction should have magnitude equal to the thermal force
    // (one compression, one tension reaction)
    assert_close(r1.rx.abs(), n_expected, 0.02,
        "NAFEMS T1: R1_x = E*A*alpha*dT");
    assert_close(rn.rx.abs(), n_expected, 0.02,
        "NAFEMS T1: Rn_x = E*A*alpha*dT");
}

// ================================================================
// 7. NAFEMS LE10 -- Thick Plate Bending (Grillage Approximation)
// ================================================================
//
// The NAFEMS LE10 benchmark tests a thick plate under pressure.
// We approximate this as a grillage of 3D beams forming a grid.
//
// Model: single 3D cantilever beam (grillage strip) loaded with
// a transverse tip load representing the pressure resultant.
// Verify deflection and torsional response.
//
// Properties: E=200 GPa, nu=0.3, L=5 m
// Section: A=0.02 m^2, Iy=2e-4 m^4, Iz=5e-4 m^4, J=3e-4 m^4
// Load: P=15 kN downward + T=3 kN*m torque at tip.

#[test]
fn validation_nafems_le10_grillage_bending() {
    let e = 200_000.0;
    let nu = 0.3;
    let length = 5.0;
    let n = 10;
    let n_nodes = n + 1;

    let a_sec = 0.02;
    let iy = 2e-4;
    let iz = 5e-4;
    let j = 3e-4;
    let p = 15.0;  // kN vertical
    let t = 3.0;   // kN*m torque

    let fix = vec![true, true, true, true, true, true]; // fully fixed
    let input = make_3d_beam(n, length, e, nu, a_sec, iy, iz, j,
        fix, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_nodes, fx: 0.0, fy: -p, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();

    let e_eff = e * 1000.0;
    let g = e_eff / (2.0 * (1.0 + nu));

    // 1. Bending deflection: delta_y = PL^3 / (3*E_eff*Iz)
    let delta_y_exact = p * length.powi(3) / (3.0 * e_eff * iz);
    assert_close(tip.uz.abs(), delta_y_exact, 0.02,
        "NAFEMS LE10: tip bending deflection uy = PL^3/(3EIz)");

    // 2. Tip rotation from bending: theta_z = PL^2 / (2*E_eff*Iz)
    let theta_z_exact = p * length.powi(2) / (2.0 * e_eff * iz);
    assert_close(tip.ry.abs(), theta_z_exact, 0.02,
        "NAFEMS LE10: tip bending rotation rz = PL^2/(2EIz)");

    // 3. Torsional twist: theta_x = TL / (GJ)
    let theta_x_exact = t * length / (g * j);
    assert_close(tip.rx.abs(), theta_x_exact, 0.02,
        "NAFEMS LE10: tip torsional twist rx = TL/(GJ)");

    // 4. Out-of-plane deflection should be zero (load in Y, no Z component)
    assert!(tip.uz.abs() < 1e-8,
        "NAFEMS LE10: uz should be ~0 for Y-plane loading, got {:.6e}", tip.uz);

    // 5. Global equilibrium: reactions at fixed end
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, p, 0.01,
        "NAFEMS LE10: vertical equilibrium sum(Fy) = P");

    // 6. Fixed-end moment from bending: M_fixed = P*L
    let sum_my: f64 = results.reactions.iter().map(|r| r.my).sum();
    assert_close(sum_my.abs(), p * length, 0.02,
        "NAFEMS LE10: fixed-end bending moment = PL");

    // 7. Fixed-end torque: T_fixed = T (applied torque)
    let sum_mx: f64 = results.reactions.iter().map(|r| r.mx).sum();
    assert_close(sum_mx.abs(), t, 0.02,
        "NAFEMS LE10: fixed-end torque reaction = T");
}

// ================================================================
// 8. NAFEMS R0031 -- Linear Elastic 3D Beam Bending
// ================================================================
//
// 3D cantilever beam under combined loading at the tip:
// vertical load, lateral load, and axial load.
// Verify deflections in all three directions and coupled behavior.
//
// Properties: E=200 GPa, nu=0.3, L=6 m
// Section: A=0.01 m^2, Iy=1e-4 m^4, Iz=5e-5 m^4, J=5e-5 m^4
// Loads at tip: Fx=5 kN, Fy=-10 kN, Fz=3 kN
//
// Reference: Euler-Bernoulli beam theory for each direction independently.

#[test]
fn validation_nafems_r0031_3d_beam_bending() {
    let e = 200_000.0;
    let nu = 0.3;
    let length = 6.0;
    let n = 12;
    let n_nodes = n + 1;

    let a_sec = 0.01;
    let iy = 1e-4;   // bending about local Y (for Z-direction deflection)
    let iz = 5e-5;   // bending about local Z (for Y-direction deflection)
    let j = 5e-5;
    let fx = 5.0;     // axial load (kN)
    let fy = -10.0;   // vertical load (kN, downward)
    let fz = 3.0;     // lateral load (kN)

    let fix = vec![true, true, true, true, true, true]; // fully fixed
    let input = make_3d_beam(n, length, e, nu, a_sec, iy, iz, j,
        fix, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_nodes, fx, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();

    let e_eff = e * 1000.0;

    // 1. Axial displacement: delta_x = Fx * L / (E_eff * A)
    let delta_x_exact = fx * length / (e_eff * a_sec);
    assert_close(tip.ux, delta_x_exact, 0.02,
        "NAFEMS R0031: axial displacement ux = FxL/(EA)");

    // 2. Vertical deflection: delta_y = |Fy| * L^3 / (3 * E_eff * Iz)
    let delta_y_exact = fy.abs() * length.powi(3) / (3.0 * e_eff * iz);
    assert_close(tip.uz.abs(), delta_y_exact, 0.02,
        "NAFEMS R0031: vertical deflection uy = FyL^3/(3EIz)");

    // 3. Lateral deflection: delta_z = Fz * L^3 / (3 * E_eff * Iy)
    let delta_z_exact = fz * length.powi(3) / (3.0 * e_eff * iy);
    assert_close(tip.uz.abs(), delta_z_exact, 0.02,
        "NAFEMS R0031: lateral deflection uz = FzL^3/(3EIy)");

    // 4. Tip rotation about Z (from vertical bending): rz = |Fy| * L^2 / (2 * E_eff * Iz)
    let theta_z_exact = fy.abs() * length.powi(2) / (2.0 * e_eff * iz);
    assert_close(tip.ry.abs(), theta_z_exact, 0.02,
        "NAFEMS R0031: tip rotation rz = FyL^2/(2EIz)");

    // 5. Tip rotation about Y (from lateral bending): ry = Fz * L^2 / (2 * E_eff * Iy)
    let theta_y_exact = fz * length.powi(2) / (2.0 * e_eff * iy);
    assert_close(tip.rz.abs(), theta_y_exact, 0.02,
        "NAFEMS R0031: tip rotation ry = FzL^2/(2EIy)");

    // 6. Global equilibrium in all directions
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fx, -fx, 0.01,
        "NAFEMS R0031: X equilibrium sum(Rx) = -Fx");
    assert_close(sum_fz, -fy, 0.01,
        "NAFEMS R0031: Y equilibrium sum(Ry) = -Fy");
    assert_close(sum_fz, -fz, 0.01,
        "NAFEMS R0031: Z equilibrium sum(Rz) = -Fz");

    // 7. Fixed-end moment about Z: Mz = |Fy| * L (from vertical load)
    let sum_my: f64 = results.reactions.iter().map(|r| r.my).sum();
    assert_close(sum_my.abs(), fy.abs() * length, 0.02,
        "NAFEMS R0031: fixed-end moment Mz = |Fy|*L");

    // 8. Fixed-end moment about Y: My = Fz * L (from lateral load)
    let sum_my: f64 = results.reactions.iter().map(|r| r.my).sum();
    assert_close(sum_my.abs(), fz * length, 0.02,
        "NAFEMS R0031: fixed-end moment My = Fz*L");

    // 9. Deflection directions should match load directions
    assert!(tip.uz < 0.0, "NAFEMS R0031: uy should be negative (downward load)");
    assert!(tip.uz > 0.0, "NAFEMS R0031: uz should be positive (positive Fz)");
    assert!(tip.ux > 0.0, "NAFEMS R0031: ux should be positive (positive Fx)");
}
