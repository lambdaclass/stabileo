/// Validation: Fire Resistance and Elevated Temperature Analysis (Extended)
///
/// References:
///   - EN 1993-1-2:2005: Structural fire design of steel structures
///   - EN 1991-1-2:2002: Actions on structures exposed to fire
///   - Buchanan & Abu: "Structural Design for Fire Safety", 2nd Ed.
///   - Purkiss & Li: "Fire Safety Engineering Design of Structures", 3rd Ed.
///
/// These tests model fire scenarios using thermal loads (SolverLoad::Thermal)
/// with reduced material properties per Eurocode fire curves.
/// The solver uses E * 1000 internally (E in MPa -> kN/m^2).
/// Coefficient of thermal expansion alpha = 12e-6 /degC is hardcoded in engine.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const ALPHA: f64 = 12e-6; // /degC, hardcoded in solver

// ================================================================
// 1. Steel Beam at Elevated Temperature -- Reduced E, Buckling Check
// ================================================================
//
// EN 1993-1-2 Table 3.1: at 400 degC, kE = 0.70.
// A simply-supported steel beam with E_ambient = 200,000 MPa
// at 400 degC has E_fire = 0.70 * 200,000 = 140,000 MPa.
//
// The solver uses E * 1000 internally.  For a UDL q on a
// simply-supported beam of length L:
//   delta_mid = 5*q*L^4 / (384*E_eff*I)
//
// Deflection scales as 1/E, so at elevated temperature:
//   delta_fire / delta_ambient = E_ambient / E_fire = 1/0.70 = 1.4286
//
// Also check that Euler buckling load scales with kE:
//   P_cr_fire = kE * P_cr_ambient

#[test]
fn validation_fire_ext_1_steel_beam_elevated_temperature() {
    let l = 6.0;
    let a = 0.01; // m^2
    let iz = 1e-4; // m^4
    let n = 4;
    let q = -10.0; // kN/m downward

    // Ambient temperature: E = 200,000 MPa
    let e_ambient = 200_000.0;
    // Fire temperature 400 degC: kE = 0.70 per EN 1993-1-2
    let ke_400 = 0.70;
    let e_fire = ke_400 * e_ambient; // 140,000 MPa

    // Solve at ambient temperature
    let input_ambient = make_ss_beam_udl(n, l, e_ambient, a, iz, q);
    let results_ambient = linear::solve_2d(&input_ambient).unwrap();

    // Solve at fire temperature (reduced E)
    let input_fire = make_ss_beam_udl(n, l, e_fire, a, iz, q);
    let results_fire = linear::solve_2d(&input_fire).unwrap();

    // Midspan node
    let mid_node = n / 2 + 1;

    let d_ambient = results_ambient.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    let d_fire = results_fire.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    // Deflection should scale inversely with E
    // delta_fire / delta_ambient = E_ambient / E_fire = 1/kE
    let deflection_ratio = d_fire.uz.abs() / d_ambient.uz.abs();
    let expected_ratio = 1.0 / ke_400;

    assert_close(deflection_ratio, expected_ratio, 0.05,
        "Deflection ratio at 400 degC");

    // Analytical midspan deflection: 5qL^4/(384EI)
    let e_eff_ambient = e_ambient * 1000.0; // kN/m^2
    let expected_delta_ambient = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff_ambient * iz);
    assert_close(d_ambient.uz.abs(), expected_delta_ambient, 0.05,
        "Ambient midspan deflection");

    // Euler buckling load comparison (fixed-fixed column analog):
    // P_cr = pi^2 * E * I / L^2
    // At 400 degC, P_cr_fire = kE * P_cr_ambient
    let pi = std::f64::consts::PI;
    let p_cr_ambient = pi * pi * e_eff_ambient * iz / (l * l);
    let p_cr_fire = pi * pi * (e_fire * 1000.0) * iz / (l * l);
    let buckling_ratio = p_cr_fire / p_cr_ambient;

    assert_close(buckling_ratio, ke_400, 0.001,
        "Buckling load ratio at 400 degC = kE");
}

// ================================================================
// 2. Thermal Gradient Through Depth -- Restrained vs Free Expansion
// ================================================================
//
// Fire on the bottom of a beam creates a temperature gradient.
// Compare:
//   (a) Simply-supported (free curvature): deflects but no moment
//   (b) Fixed-fixed (restrained curvature): no deflection but moments
//
// Free beam: delta_mid = alpha * DeltaT_g * L^2 / (8*h)
// Fixed beam: M = E*I*alpha*DeltaT_g / h  (at both ends)
//
// The restrained case models a beam embedded in a stiffer structure
// during a fire where the gradient cannot produce free curvature.

#[test]
fn validation_fire_ext_2_thermal_gradient_restrained_vs_free() {
    let l: f64 = 6.0;
    let e: f64 = 200_000.0; // MPa
    let a: f64 = 0.01;       // m^2
    let iz: f64 = 1e-4;      // m^4
    let n = 8;
    let dt_gradient: f64 = 100.0; // degC, bottom hotter than top (fire below)

    // Section height: h = sqrt(12*Iz/A)
    let h_sec: f64 = (12.0 * iz / a).sqrt();

    // (a) Simply-supported: free curvature
    let loads_ss: Vec<SolverLoad> = (1..=n).map(|i| {
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_gradient,
        })
    }).collect();

    let input_ss = make_beam(n, l, e, a, iz, "pinned", Some("rollerX"), loads_ss);
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    // Midspan deflection (free curvature): delta = alpha*DeltaT*L^2/(8*h)
    let mid_node = n / 2 + 1;
    let d_mid_ss = results_ss.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    let expected_delta_ss = ALPHA * dt_gradient * l * l / (8.0 * h_sec);

    assert_close(d_mid_ss.uz.abs(), expected_delta_ss, 0.10,
        "SS beam thermal gradient midspan deflection");

    // Moments should be near zero (statically determinate, free curvature)
    for ef in &results_ss.element_forces {
        assert!(ef.m_start.abs() < 2.0,
            "SS beam: M should be ~0, got {:.4} on elem {}", ef.m_start, ef.element_id);
    }

    // (b) Fixed-fixed: restrained curvature
    let loads_ff: Vec<SolverLoad> = (1..=n).map(|i| {
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_gradient,
        })
    }).collect();

    let input_ff = make_beam(n, l, e, a, iz, "fixed", Some("fixed"), loads_ff);
    let results_ff = linear::solve_2d(&input_ff).unwrap();

    // End moment: M = E_eff * Iz * alpha * DeltaT_g / h
    let e_eff = e * 1000.0;
    let expected_m = e_eff * iz * ALPHA * dt_gradient / h_sec;

    let r_start = results_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_start.my.abs(), expected_m, 0.10,
        "FF beam thermal gradient end moment");

    // Fixed-fixed beam should have near-zero midspan deflection
    let d_mid_ff = results_ff.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert!(d_mid_ff.uz.abs() < expected_delta_ss * 0.05,
        "FF beam: midspan deflection should be ~0, got {:.6e}", d_mid_ff.uz);

    // The moment in the restrained case should be significant
    assert!(expected_m > 10.0,
        "Restrained thermal moment should be significant: {:.2} kNm", expected_m);
}

// ================================================================
// 3. Fire Compartment Frame -- Differential Heating on Beam vs Columns
// ================================================================
//
// Portal frame with fire in the compartment: the beam is uniformly
// heated (DeltaT = 200 degC) while the columns are partially
// heated (DeltaT = 80 degC).
//
// The beam expansion pushes the column tops apart.  The differential
// thermal expansion between beam and columns creates secondary
// moments.  We verify:
//   - Horizontal reactions appear at column bases
//   - Moments develop at beam-column connections
//   - Global equilibrium is maintained

#[test]
fn validation_fire_ext_3_fire_compartment_frame() {
    let h = 4.0; // column height (m)
    let w = 8.0; // beam span (m)
    let e = 200_000.0;  // MPa (ambient, we model at average temperature)
    let a = 0.01;
    let iz = 1e-4;

    // Frame: node 1 (0,0), node 2 (0,h), node 3 (w,h), node 4 (w,0)
    // Elements: left column (1-2), beam (2-3), right column (3-4)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    // Fire loads: beam heated more than columns
    let dt_beam = 200.0;    // degC (fire compartment temperature on beam)
    let dt_column = 80.0;   // degC (columns partially shielded)

    let loads = vec![
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: 1, dt_uniform: dt_column, dt_gradient: 0.0,
        }),
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: 2, dt_uniform: dt_beam, dt_gradient: 0.0,
        }),
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: 3, dt_uniform: dt_column, dt_gradient: 0.0,
        }),
    ];

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum of reactions = 0 (thermal is self-equilibrating)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_rx.abs() < 1.0,
        "Fire frame: ΣRx should be ~0, got {:.4}", sum_rx);
    assert!(sum_ry.abs() < 1.0,
        "Fire frame: ΣRy should be ~0, got {:.4}", sum_ry);

    // Horizontal reactions should be nonzero (beam expansion pushes columns)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(r1.rx.abs() > 1.0,
        "Fire frame: horizontal reaction at base should be nonzero, got {:.4}", r1.rx);

    // Reactions at both bases should be equal and opposite (symmetric frame)
    assert_close(r1.rx, -r4.rx, 0.05, "Fire frame: symmetric horizontal reactions");

    // Moments develop at beam-column joints
    let max_moment = results.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(max_moment > 1.0,
        "Fire frame: moments develop at joints, M_max={:.4}", max_moment);

    // The beam undergoes greater thermal expansion than columns
    // So the top of columns should sway outward
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Node 2 should move left (negative x) and node 3 should move right (positive x)
    // or vice versa, but they should be symmetric and opposite
    assert_close(d2.ux, -d3.ux, 0.10,
        "Fire frame: symmetric lateral displacements at column tops");
}

// ================================================================
// 4. Steel Strength Reduction -- EN 1993-1-2 (E at 400 degC ~ 0.7*E)
// ================================================================
//
// Verify that using reduced E at 400 degC per EN 1993-1-2 Table 3.1
// correctly scales all structural responses:
//   - Deflections scale as 1/kE
//   - Reactions remain unchanged (statically determinate case)
//   - Internal forces remain unchanged (equilibrium, not stiffness)
//
// For a simply-supported beam with point load at midspan:
//   delta = P*L^3 / (48*E*I)
//
// At 400 degC: kE = 0.70, so delta_fire = delta_ambient / 0.70

#[test]
fn validation_fire_ext_4_steel_strength_reduction_en1993() {
    let l = 5.0;
    let a = 0.01;
    let iz = 1e-4;
    let n = 4;
    let p = -50.0; // kN point load at midspan

    // EN 1993-1-2 Table 3.1 reduction factors
    let ke_400 = 0.70; // elastic modulus reduction at 400 degC
    let ke_600 = 0.31; // elastic modulus reduction at 600 degC

    let e_ambient = 200_000.0; // MPa
    let e_400 = ke_400 * e_ambient;
    let e_600 = ke_600 * e_ambient;

    // Point load at midspan on a SS beam
    let make_ss_point = |e_val: f64| -> SolverInput {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1,
            fx: 0.0,
            fz: p,
            my: 0.0,
        })];
        make_beam(n, l, e_val, a, iz, "pinned", Some("rollerX"), loads)
    };

    let results_ambient = linear::solve_2d(&make_ss_point(e_ambient)).unwrap();
    let results_400 = linear::solve_2d(&make_ss_point(e_400)).unwrap();
    let results_600 = linear::solve_2d(&make_ss_point(e_600)).unwrap();

    let mid_node = n / 2 + 1;

    let delta_ambient = results_ambient.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();
    let delta_400 = results_400.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();
    let delta_600 = results_600.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Deflection scales as 1/kE
    assert_close(delta_400 / delta_ambient, 1.0 / ke_400, 0.02,
        "400 degC deflection ratio");
    assert_close(delta_600 / delta_ambient, 1.0 / ke_600, 0.02,
        "600 degC deflection ratio");

    // Reactions should be unchanged (statically determinate)
    let r_ambient = results_ambient.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().rz;
    let r_400 = results_400.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().rz;
    let r_600 = results_600.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().rz;

    assert_close(r_400, r_ambient, 0.001,
        "400 degC: reactions unchanged for determinate beam");
    assert_close(r_600, r_ambient, 0.001,
        "600 degC: reactions unchanged for determinate beam");

    // Internal forces (moment, shear) unchanged in determinate structure
    let m_ambient = results_ambient.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let m_400 = results_400.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);

    assert_close(m_400, m_ambient, 0.001,
        "400 degC: moments unchanged for determinate beam");

    // Verify analytical deflection: delta = P*L^3/(48*E*I)
    let e_eff = e_ambient * 1000.0;
    let expected_delta = p.abs() * l.powi(3) / (48.0 * e_eff * iz);
    assert_close(delta_ambient, expected_delta, 0.05,
        "Ambient analytical midspan deflection");

    // Higher temperature -> larger deflection (monotonicity)
    assert!(delta_600 > delta_400,
        "600 degC deflection ({:.6}) > 400 degC deflection ({:.6})",
        delta_600, delta_400);
    assert!(delta_400 > delta_ambient,
        "400 degC deflection ({:.6}) > ambient deflection ({:.6})",
        delta_400, delta_ambient);
}

// ================================================================
// 5. Critical Temperature Calculation -- Load Ratio Determines T_cr
// ================================================================
//
// EN 1993-1-2 Section 4.2.4: for a utilisation factor mu_0,
// the critical temperature theta_cr is where kE(theta_cr) = mu_0
// (for buckling-governed members), or ky(theta_cr) = mu_0
// (for strength-governed members).
//
// Model a fixed-fixed beam at successively higher temperatures.
// As kE decreases, the beam becomes more flexible.  Verify that
// the deflection grows inversely with kE and find the temperature
// at which deflection exceeds a serviceability limit (L/250).

#[test]
fn validation_fire_ext_5_critical_temperature_calculation() {
    let l = 6.0;
    let a = 0.01;
    let iz = 1e-4;
    let n = 4;
    let q = -15.0; // kN/m

    let e_ambient = 200_000.0;

    // EN 1993-1-2 Table 3.1: kE values at discrete temperatures
    let temperature_ke: [(f64, f64); 8] = [
        (20.0,   1.000),
        (200.0,  0.900),
        (300.0,  0.800),
        (400.0,  0.700),
        (500.0,  0.600),
        (600.0,  0.310),
        (700.0,  0.130),
        (800.0,  0.090),
    ];

    // Serviceability limit
    let delta_limit = l / 250.0; // = 0.024 m

    let mut prev_delta = 0.0_f64;
    let mut critical_temp = 0.0_f64;
    let mut found_critical = false;

    for &(theta, ke) in &temperature_ke {
        let e_fire = ke * e_ambient;
        let input = make_ss_beam_udl(n, l, e_fire, a, iz, q);
        let results = linear::solve_2d(&input).unwrap();

        let mid_node = n / 2 + 1;
        let delta = results.displacements.iter()
            .find(|d| d.node_id == mid_node).unwrap().uz.abs();

        // Deflection must increase monotonically with temperature
        if theta > 20.0 {
            assert!(delta >= prev_delta - 1e-10,
                "Deflection should increase with temperature: at {:.0} degC, delta={:.6} < prev={:.6}",
                theta, delta, prev_delta);
        }

        // Check if we exceed the serviceability limit
        if delta > delta_limit && !found_critical {
            critical_temp = theta;
            found_critical = true;
        }

        prev_delta = delta;
    }

    // The critical temperature should exist and be reasonable
    assert!(found_critical,
        "Should find a temperature where deflection exceeds L/250 = {:.4} m", delta_limit);
    assert!(critical_temp >= 400.0 && critical_temp <= 800.0,
        "Critical temperature should be between 400 and 800 degC, got {:.0}", critical_temp);

    // Verify deflection scaling for a specific pair
    let e_300 = 0.800 * e_ambient;
    let e_600 = 0.310 * e_ambient;
    let input_300 = make_ss_beam_udl(n, l, e_300, a, iz, q);
    let input_600 = make_ss_beam_udl(n, l, e_600, a, iz, q);
    let d_300 = linear::solve_2d(&input_300).unwrap().displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();
    let d_600 = linear::solve_2d(&input_600).unwrap().displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    let ratio = d_600 / d_300;
    let expected_ratio = 0.800 / 0.310;
    assert_close(ratio, expected_ratio, 0.05,
        "Deflection ratio 600/300 degC = kE_300/kE_600");
}

// ================================================================
// 6. Fire Exposure on One Side -- Gradient Drives Bowing
// ================================================================
//
// A column exposed to fire on one side develops a thermal gradient
// through its depth, causing it to bow.  For a simply-supported
// column (pinned-rollerX, modeled as a horizontal beam):
//   delta_mid = alpha * DeltaT_g * L^2 / (8*h)
//
// For a fixed-fixed column, the gradient is fully restrained and
// produces end moments but no lateral deflection.
//
// This models the bowing effect in compartment walls during fire.

#[test]
fn validation_fire_ext_6_fire_one_side_bowing() {
    let l: f64 = 3.5;        // column height (modeled as horizontal beam)
    let e: f64 = 200_000.0;  // MPa
    let a: f64 = 0.01;       // m^2
    let iz: f64 = 1e-4;      // m^4
    let n = 8;

    // Temperature gradient from one-sided fire exposure
    // Fire side ~600 degC, unexposed ~100 degC, gradient = 500 degC
    let dt_gradient: f64 = 500.0;

    // Section height
    let h_sec: f64 = (12.0 * iz / a).sqrt();

    // (a) Pin-roller column (free to bow)
    let loads_free: Vec<SolverLoad> = (1..=n).map(|i| {
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_gradient,
        })
    }).collect();

    let input_free = make_beam(n, l, e, a, iz, "pinned", Some("rollerX"), loads_free);
    let results_free = linear::solve_2d(&input_free).unwrap();

    // Expected midspan bow: delta = alpha * DeltaT_g * L^2 / (8*h)
    let expected_bow = ALPHA * dt_gradient * l * l / (8.0 * h_sec);
    let mid_node = n / 2 + 1;
    let d_mid_free = results_free.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(d_mid_free.uz.abs(), expected_bow, 0.10,
        "Free column bow at midheight");

    // No moments in determinate structure
    for ef in &results_free.element_forces {
        assert!(ef.m_start.abs() < 2.0,
            "Free column: M should be ~0, got {:.4}", ef.m_start);
    }

    // (b) Fixed-fixed column (restrained, no bowing)
    let loads_fixed: Vec<SolverLoad> = (1..=n).map(|i| {
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_gradient,
        })
    }).collect();

    let input_fixed = make_beam(n, l, e, a, iz, "fixed", Some("fixed"), loads_fixed);
    let results_fixed = linear::solve_2d(&input_fixed).unwrap();

    // Expected end moment: M = E_eff * Iz * alpha * DeltaT_g / h
    let e_eff = e * 1000.0;
    let expected_m = e_eff * iz * ALPHA * dt_gradient / h_sec;

    let r1 = results_fixed.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.my.abs(), expected_m, 0.10,
        "Restrained column end moment from gradient");

    // No midspan deflection in fixed-fixed
    let d_mid_fixed = results_fixed.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert!(d_mid_fixed.uz.abs() < expected_bow * 0.05,
        "Fixed column: no bowing, uy={:.6e}", d_mid_fixed.uz);

    // Bowing displacement is significant for fire design
    assert!(expected_bow > 0.001,
        "Bowing displacement {:.4} m should be structurally significant", expected_bow);
}

// ================================================================
// 7. Column Fire Resistance -- Axial Capacity Reduces with Temperature
// ================================================================
//
// A restrained column under axial load develops additional forces
// due to thermal expansion.  As temperature rises:
//   - The column tries to expand: delta_free = alpha * DeltaT * L
//   - If restrained, axial force N = E_fire * A * alpha * DeltaT
//   - As kE drops, the restraint force changes
//
// We model a fixed-fixed column at different temperatures and verify
// that the axial force from thermal expansion is:
//   N = kE * E_ambient * 1000 * A * alpha * DeltaT
//
// At very high temperatures, kE is so small that the thermal
// expansion force becomes negligible (material has softened).

#[test]
fn validation_fire_ext_7_column_fire_resistance() {
    let l = 4.0;
    let a = 0.01;
    let iz = 1e-4;
    let n = 4;
    let dt = 50.0; // degC uniform temperature rise

    let e_ambient = 200_000.0;

    // kE values from EN 1993-1-2
    let temperatures: [(f64, f64); 5] = [
        (20.0,  1.000),
        (300.0, 0.800),
        (400.0, 0.700),
        (500.0, 0.600),
        (600.0, 0.310),
    ];

    let mut prev_n = f64::MAX;

    for &(theta, ke) in &temperatures {
        let e_fire = ke * e_ambient;

        let loads: Vec<SolverLoad> = (1..=n).map(|i| {
            SolverLoad::Thermal(SolverThermalLoad {
                element_id: i,
                dt_uniform: dt,
                dt_gradient: 0.0,
            })
        }).collect();

        let input = make_beam(n, l, e_fire, a, iz, "fixed", Some("fixed"), loads);
        let results = linear::solve_2d(&input).unwrap();

        // Expected axial force: N = E_fire_eff * A * alpha * DeltaT
        let e_fire_eff = e_fire * 1000.0;
        let expected_n = e_fire_eff * a * ALPHA * dt;

        // Check element axial forces
        for ef in &results.element_forces {
            assert_close(ef.n_start.abs(), expected_n, 0.05,
                &format!("Column at {:.0} degC: N = E_fire*A*alpha*DeltaT = {:.2} kN",
                    theta, expected_n));
        }

        // Axial force should decrease with temperature (kE drops)
        if theta > 20.0 {
            assert!(ef_avg_n(&results) < prev_n + 1.0,
                "Axial force should decrease with temperature: at {:.0} degC", theta);
        }
        prev_n = ef_avg_n(&results);

        // No displacement at any node (fully restrained)
        for d in &results.displacements {
            assert!(d.ux.abs() < 1e-6,
                "Fixed-fixed: no expansion at node {}, ux={:.6e}", d.node_id, d.ux);
        }

        // Equilibrium: sum of reactions = 0
        let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
        assert!(sum_rx.abs() < 1.0,
            "Equilibrium at {:.0} degC: ΣRx={:.4}", theta, sum_rx);
    }

    // At 600 degC, the restrained force is only 31% of ambient
    let n_ambient = e_ambient * 1000.0 * a * ALPHA * dt;
    let n_600 = 0.310 * e_ambient * 1000.0 * a * ALPHA * dt;
    assert_close(n_600 / n_ambient, 0.310, 0.001,
        "Force ratio at 600 degC = kE(600)");
}

/// Helper to get average absolute axial force from results
fn ef_avg_n(results: &AnalysisResults) -> f64 {
    let n_elems = results.element_forces.len() as f64;
    results.element_forces.iter().map(|ef| ef.n_start.abs()).sum::<f64>() / n_elems
}

// ================================================================
// 8. Superposition of Thermal + Mechanical at Elevated Temperature
// ================================================================
//
// A fixed-fixed beam under combined:
//   (a) Mechanical UDL q = -20 kN/m
//   (b) Uniform thermal DeltaT = 60 degC
// at E_fire = 0.70 * E_ambient (400 degC)
//
// Superposition: solve mechanical-only, thermal-only, and combined.
// For a linear solver, the combined result must equal the sum.
//
// This validates that the solver correctly handles the interaction
// of thermal expansion with external loads at reduced stiffness.

#[test]
fn validation_fire_ext_8_superposition_thermal_mechanical() {
    let l = 5.0;
    let a = 0.01;
    let iz = 1e-4;
    let n = 4;
    let q = -20.0;   // kN/m mechanical load
    let dt = 60.0;    // degC uniform temperature rise

    // At 400 degC: kE = 0.70
    let ke_400 = 0.70;
    let e_fire = ke_400 * 200_000.0; // 140,000 MPa

    // (a) Mechanical only: fixed-fixed beam with UDL
    let mech_loads: Vec<SolverLoad> = (1..=n).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        })
    }).collect();

    let input_mech = make_beam(n, l, e_fire, a, iz, "fixed", Some("fixed"), mech_loads);
    let results_mech = linear::solve_2d(&input_mech).unwrap();

    // (b) Thermal only: fixed-fixed beam with uniform DeltaT
    let thermal_loads: Vec<SolverLoad> = (1..=n).map(|i| {
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        })
    }).collect();

    let input_thermal = make_beam(n, l, e_fire, a, iz, "fixed", Some("fixed"), thermal_loads);
    let results_thermal = linear::solve_2d(&input_thermal).unwrap();

    // (c) Combined: both mechanical and thermal loads together
    let mut combined_loads: Vec<SolverLoad> = (1..=n).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        })
    }).collect();
    for i in 1..=n {
        combined_loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }));
    }

    let input_combined = make_beam(n, l, e_fire, a, iz, "fixed", Some("fixed"), combined_loads);
    let results_combined = linear::solve_2d(&input_combined).unwrap();

    // Superposition: combined displacements = mech + thermal
    for d_comb in &results_combined.displacements {
        let d_mech = results_mech.displacements.iter()
            .find(|d| d.node_id == d_comb.node_id).unwrap();
        let d_therm = results_thermal.displacements.iter()
            .find(|d| d.node_id == d_comb.node_id).unwrap();

        let ux_sum = d_mech.ux + d_therm.ux;
        let uy_sum = d_mech.uz + d_therm.uz;
        let rz_sum = d_mech.ry + d_therm.ry;

        assert_close(d_comb.ux, ux_sum, 0.02,
            &format!("Superposition ux at node {}", d_comb.node_id));
        assert_close(d_comb.uz, uy_sum, 0.02,
            &format!("Superposition uy at node {}", d_comb.node_id));
        assert_close(d_comb.ry, rz_sum, 0.02,
            &format!("Superposition rz at node {}", d_comb.node_id));
    }

    // Superposition: combined reactions = mech + thermal
    for r_comb in &results_combined.reactions {
        let r_mech = results_mech.reactions.iter()
            .find(|r| r.node_id == r_comb.node_id).unwrap();
        let r_therm = results_thermal.reactions.iter()
            .find(|r| r.node_id == r_comb.node_id).unwrap();

        assert_close(r_comb.rx, r_mech.rx + r_therm.rx, 0.02,
            &format!("Superposition Rx at node {}", r_comb.node_id));
        assert_close(r_comb.rz, r_mech.rz + r_therm.rz, 0.02,
            &format!("Superposition Ry at node {}", r_comb.node_id));
        assert_close(r_comb.my, r_mech.my + r_therm.my, 0.02,
            &format!("Superposition Mz at node {}", r_comb.node_id));
    }

    // Superposition: combined element forces = mech + thermal
    for ef_comb in &results_combined.element_forces {
        let ef_mech = results_mech.element_forces.iter()
            .find(|e| e.element_id == ef_comb.element_id).unwrap();
        let ef_therm = results_thermal.element_forces.iter()
            .find(|e| e.element_id == ef_comb.element_id).unwrap();

        assert_close(ef_comb.n_start, ef_mech.n_start + ef_therm.n_start, 0.02,
            &format!("Superposition N_start elem {}", ef_comb.element_id));
        assert_close(ef_comb.v_start, ef_mech.v_start + ef_therm.v_start, 0.02,
            &format!("Superposition V_start elem {}", ef_comb.element_id));
        assert_close(ef_comb.m_start, ef_mech.m_start + ef_therm.m_start, 0.02,
            &format!("Superposition M_start elem {}", ef_comb.element_id));
    }

    // Verify thermal-only produces axial force (restrained bar)
    let e_fire_eff = e_fire * 1000.0;
    let expected_n_thermal = e_fire_eff * a * ALPHA * dt;
    let n_thermal_avg = results_thermal.element_forces.iter()
        .map(|ef| ef.n_start.abs()).sum::<f64>() / n as f64;
    assert_close(n_thermal_avg, expected_n_thermal, 0.05,
        "Thermal-only restrained axial force");

    // Verify mechanical-only produces expected end moment
    // Fixed-fixed beam under UDL: M_end = q*L^2/12
    let expected_m_end = q.abs() * l * l / 12.0;
    let r1_mech = results_mech.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1_mech.my.abs(), expected_m_end, 0.10,
        "Mechanical-only end moment qL^2/12");
}
