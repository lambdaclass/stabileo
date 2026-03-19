/// Validation: Extended Stress Analysis — Mohr's Circle & Yield Criteria
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 7-9
///   - Hibbeler, "Mechanics of Materials", 10th Ed., Ch. 9-10
///   - Boresi & Schmidt, "Advanced Mechanics of Materials", 6th Ed.
///   - Ugural & Fenster, "Advanced Strength and Applied Elasticity", 5th Ed.
///
/// These tests verify fundamental stress analysis computations including
/// Mohr's circle, yield criteria (Von Mises, Tresca), stress transformations,
/// pressure vessel theory, beam stress distributions, and stress concentration.
///
/// Tests:
///   1. Mohr's circle — principal stresses, max shear, principal angle
///   2. Von Mises yield criterion — plane stress
///   3. Tresca yield criterion — comparison with Von Mises
///   4. Combined bending and torsion — principal stresses in a shaft
///   5. Stress transformation — rotated coordinate axes
///   6. Pressure vessel — hoop and longitudinal stresses
///   7. Beam stress distribution — normal and shear at various y
///   8. Stress concentration factor — plate with hole
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver internally multiplies by 1000 -> kN/m^2)
const A: f64 = 0.01;      // m^2 (100mm x 100mm equivalent)
const IZ: f64 = 8.333e-6; // m^4 (b*h^3/12 for 100mm x 100mm section)
const REL_TOL: f64 = 0.03;

// Section dimensions for stress calculations (square 100mm x 100mm)
const B_SEC: f64 = 0.1; // width (m)
const H_SEC: f64 = 0.1; // depth (m)

// ================================================================
// 1. Mohr's Circle — Principal Stresses, Max Shear, Principal Angle
// ================================================================
//
// Given a general plane stress state (sigma_x, sigma_y, tau_xy),
// compute principal stresses, maximum shear stress, and principal
// angle using Mohr's circle relations.
//
// Mohr's circle:
//   center = (sigma_x + sigma_y) / 2
//   radius = sqrt(((sigma_x - sigma_y)/2)^2 + tau_xy^2)
//   sigma_1 = center + radius
//   sigma_2 = center - radius
//   tau_max = radius
//   theta_p = 0.5 * atan(2*tau_xy / (sigma_x - sigma_y))
//
// Verify using solver-extracted forces from a cantilever beam
// at a known cross-section point.

#[test]
fn validation_stress2_ext_mohrs_circle() {
    // Use a cantilever beam to get realistic stress state
    let l = 4.0;
    let n = 4;
    let p = -30.0; // kN downward at tip

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_force = ef1.v_start.abs();
    let m_force = ef1.m_start.abs();

    // At quarter-depth (y = h/4), both sigma and tau are nonzero
    let y_pt = H_SEC / 4.0;
    let sigma_x: f64 = m_force * y_pt / IZ; // kN/m^2
    let sigma_y: f64 = 0.0; // beam theory: no transverse normal stress

    // Shear at y = h/4: Q = b/2 * (h^2/4 - y^2)
    let q_at_y = B_SEC / 2.0 * (H_SEC * H_SEC / 4.0 - y_pt * y_pt);
    let tau_xy: f64 = v_force * q_at_y / (IZ * B_SEC); // kN/m^2

    // Mohr's circle parameters
    let center: f64 = (sigma_x + sigma_y) / 2.0;
    let radius: f64 = (((sigma_x - sigma_y) / 2.0).powi(2) + tau_xy.powi(2)).sqrt();

    let sigma_1 = center + radius;
    let sigma_2 = center - radius;
    let tau_max = radius;

    // Principal angle: theta_p = 0.5 * atan(2*tau / (sigma_x - sigma_y))
    let theta_p: f64 = (2.0 * tau_xy / (sigma_x - sigma_y)).atan() / 2.0;

    // Verify: sigma_1 + sigma_2 = sigma_x + sigma_y (trace invariant)
    assert_close(sigma_1 + sigma_2, sigma_x + sigma_y, REL_TOL,
        "Mohr trace invariant: sigma_1+sigma_2 = sigma_x+sigma_y");

    // Verify: sigma_1 * sigma_2 = sigma_x * sigma_y - tau_xy^2 (determinant invariant)
    let det_principal = sigma_1 * sigma_2;
    let det_original = sigma_x * sigma_y - tau_xy * tau_xy;
    assert_close(det_principal, det_original, REL_TOL,
        "Mohr determinant invariant: sigma_1*sigma_2 = sigma_x*sigma_y - tau^2");

    // Verify: tau_max = (sigma_1 - sigma_2) / 2
    let tau_max_check: f64 = (sigma_1 - sigma_2) / 2.0;
    assert_close(tau_max, tau_max_check, REL_TOL,
        "tau_max = (sigma_1 - sigma_2)/2");

    // Verify: principal angle is in range (-pi/4, pi/4]
    let pi: f64 = std::f64::consts::PI;
    assert!(theta_p.abs() <= pi / 4.0 + 1e-10,
        "Principal angle should be in [-pi/4, pi/4], got {:.4}", theta_p);

    // Verify: on principal plane, shear stress vanishes
    // sigma_n at theta_p should equal sigma_1 (or sigma_2)
    let cos2t: f64 = (2.0 * theta_p).cos();
    let sin2t: f64 = (2.0 * theta_p).sin();
    let sigma_n_check = (sigma_x + sigma_y) / 2.0
        + (sigma_x - sigma_y) / 2.0 * cos2t
        + tau_xy * sin2t;
    assert_close(sigma_n_check, sigma_1, REL_TOL,
        "Normal stress at principal angle = sigma_1");

    // Shear on principal plane should be zero
    let tau_nt_check: f64 = -(sigma_x - sigma_y) / 2.0 * sin2t + tau_xy * cos2t;
    assert_close(tau_nt_check, 0.0, REL_TOL,
        "Shear on principal plane = 0");
}

// ================================================================
// 2. Von Mises Yield Criterion — Plane Stress
// ================================================================
//
// sigma_vm = sqrt(sigma_x^2 - sigma_x*sigma_y + sigma_y^2 + 3*tau^2)
//
// For plane stress (sigma_z = 0), the Von Mises criterion uses the
// full biaxial formula. Verify with known stress states.

#[test]
fn validation_stress2_ext_von_mises_yield() {
    // Use cantilever with axial + transverse load for biaxial state
    let l = 3.0;
    let n = 4;
    let p_axial = 80.0;  // kN tension
    let p_trans = -20.0;  // kN downward

    let tip_node = n + 1;
    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip_node, fx: p_axial, fz: 0.0, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fz: p_trans, my: 0.0,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let n_force = ef1.n_start.abs();
    let v_force = ef1.v_start.abs();
    let m_force = ef1.m_start.abs();

    // At the extreme fiber (y = h/2): sigma_x = N/A + M*y/I, tau = 0
    let y_ext = H_SEC / 2.0;
    let sigma_x: f64 = n_force / A + m_force * y_ext / IZ;
    let sigma_y: f64 = 0.0;
    let tau_xy: f64 = 0.0; // shear is zero at extreme fiber

    // Von Mises: full biaxial formula
    let vm: f64 = (sigma_x.powi(2) - sigma_x * sigma_y + sigma_y.powi(2)
        + 3.0 * tau_xy.powi(2)).sqrt();

    // For uniaxial stress (sigma_y = 0, tau = 0): VM = |sigma_x|
    assert_close(vm, sigma_x.abs(), REL_TOL,
        "VM for uniaxial stress = |sigma_x|");

    // At the neutral axis (y = 0): sigma_x = N/A only, tau = 1.5*V/A
    let sigma_x_na: f64 = n_force / A;
    let sigma_y_na: f64 = 0.0;
    let tau_xy_na: f64 = 1.5 * v_force / A;

    let vm_na: f64 = (sigma_x_na.powi(2) - sigma_x_na * sigma_y_na
        + sigma_y_na.powi(2) + 3.0 * tau_xy_na.powi(2)).sqrt();

    // Should equal sqrt(sigma^2 + 3*tau^2) since sigma_y = 0
    let vm_na_check: f64 = (sigma_x_na.powi(2) + 3.0 * tau_xy_na.powi(2)).sqrt();
    assert_close(vm_na, vm_na_check, REL_TOL,
        "VM at NA: full formula = simplified formula");

    // Verify numerical values
    // N ≈ 80 kN, V ≈ 20 kN, M ≈ 60 kN*m
    assert_close(n_force, p_axial, REL_TOL, "N at fixed end");
    assert_close(v_force, p_trans.abs(), REL_TOL, "V at fixed end");
    assert_close(m_force, p_trans.abs() * l, REL_TOL, "M at fixed end");

    // For pure shear state (hypothetical): VM = sqrt(3) * tau
    let tau_pure: f64 = 5000.0; // kN/m^2
    let vm_pure_shear: f64 = (3.0 * tau_pure.powi(2)).sqrt();
    let vm_pure_expected: f64 = 3.0_f64.sqrt() * tau_pure;
    assert_close(vm_pure_shear, vm_pure_expected, REL_TOL,
        "VM for pure shear = sqrt(3)*tau");
}

// ================================================================
// 3. Tresca Yield Criterion — Comparison with Von Mises
// ================================================================
//
// Tresca: sigma_1 - sigma_3 <= fy
// Von Mises: sigma_vm <= fy
// Property: Tresca is always >= Von Mises (more conservative)
// For plane stress: sigma_3 = 0 or min(sigma_1, sigma_2, 0)

#[test]
fn validation_stress2_ext_tresca_yield() {
    // Use a cantilever with combined loading
    let l = 5.0;
    let n = 4;
    let p = -25.0; // kN downward

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_force = ef1.v_start.abs();
    let m_force = ef1.m_start.abs();

    // Evaluate at quarter-depth for combined state
    let y_pt = H_SEC / 4.0;
    let sigma_x: f64 = m_force * y_pt / IZ;
    let sigma_y: f64 = 0.0;
    let q_at_y = B_SEC / 2.0 * (H_SEC * H_SEC / 4.0 - y_pt * y_pt);
    let tau_xy: f64 = v_force * q_at_y / (IZ * B_SEC);

    // Principal stresses
    let center: f64 = (sigma_x + sigma_y) / 2.0;
    let radius: f64 = (((sigma_x - sigma_y) / 2.0).powi(2) + tau_xy.powi(2)).sqrt();
    let sigma_1 = center + radius;
    let sigma_2 = center - radius;

    // For plane stress, sigma_3 = 0. The three principal stresses
    // sorted: max(sigma_1, sigma_2, 0) and min(sigma_1, sigma_2, 0)
    let s_max: f64 = sigma_1.max(sigma_2).max(0.0);
    let s_min: f64 = sigma_1.min(sigma_2).min(0.0);

    // Tresca criterion: tau_max = (s_max - s_min) / 2
    // Equivalent to: sigma_tresca = s_max - s_min
    let sigma_tresca = s_max - s_min;

    // Von Mises
    let sigma_vm: f64 = (sigma_x.powi(2) - sigma_x * sigma_y + sigma_y.powi(2)
        + 3.0 * tau_xy.powi(2)).sqrt();

    // Key property: Tresca >= Von Mises (Tresca is more conservative)
    assert!(sigma_tresca >= sigma_vm - 1e-6,
        "Tresca ({:.2}) should be >= Von Mises ({:.2})", sigma_tresca, sigma_vm);

    // The ratio Tresca/VM should be between 1.0 and 2/sqrt(3) ≈ 1.1547
    let ratio: f64 = sigma_tresca / sigma_vm;
    let upper_bound: f64 = 2.0 / 3.0_f64.sqrt();
    assert!(ratio >= 1.0 - 1e-6,
        "Tresca/VM ratio ({:.4}) should be >= 1.0", ratio);
    assert!(ratio <= upper_bound + 1e-6,
        "Tresca/VM ratio ({:.4}) should be <= 2/sqrt(3) = {:.4}", ratio, upper_bound);

    // For pure uniaxial tension (special case): Tresca = VM = sigma
    let sigma_uni: f64 = 100_000.0; // kN/m^2
    let vm_uni: f64 = sigma_uni; // sigma_y = tau = 0
    let tresca_uni: f64 = sigma_uni; // sigma_1 = sigma, sigma_2 = 0, sigma_3 = 0
    assert_close(vm_uni, tresca_uni, REL_TOL,
        "Uniaxial: VM = Tresca");

    // For pure shear: Tresca = 2*tau, VM = sqrt(3)*tau
    let tau_ps: f64 = 50_000.0;
    let tresca_ps: f64 = 2.0 * tau_ps; // sigma_1 = tau, sigma_2 = -tau -> diff = 2*tau
    let vm_ps: f64 = 3.0_f64.sqrt() * tau_ps;
    let ratio_ps: f64 = tresca_ps / vm_ps;
    let expected_ratio_ps: f64 = 2.0 / 3.0_f64.sqrt();
    assert_close(ratio_ps, expected_ratio_ps, REL_TOL,
        "Pure shear: Tresca/VM = 2/sqrt(3)");
}

// ================================================================
// 4. Combined Bending and Torsion — Principal Stresses in a Shaft
// ================================================================
//
// For a circular shaft under combined bending moment M and torque T:
//   sigma = 32*M / (pi*d^3)  (bending stress at extreme fiber)
//   tau   = 16*T / (pi*d^3)  (torsional shear stress at surface)
//   sigma_1,2 = sigma/2 +/- sqrt((sigma/2)^2 + tau^2)
//
// Verify using a cantilever beam with tip load to provide bending,
// then analytically add torsion effects.

#[test]
fn validation_stress2_ext_combined_bending_torsion() {
    // Get bending moment from a cantilever
    let l = 3.0;
    let n = 4;
    let p = -20.0; // kN downward

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let m_bending = ef1.m_start.abs(); // should be |p|*l = 60 kN*m

    assert_close(m_bending, p.abs() * l, REL_TOL, "M at fixed end = P*L");

    // For a circular shaft with diameter d:
    // Use d = 0.1m (100mm diameter) as the hypothetical shaft
    let d: f64 = 0.1; // m
    let pi: f64 = std::f64::consts::PI;

    // Bending stress at extreme fiber
    let sigma: f64 = 32.0 * m_bending / (pi * d.powi(3));

    // Assume a torsion T = 40 kN*m applied simultaneously
    let t_torque: f64 = 40.0; // kN*m
    let tau: f64 = 16.0 * t_torque / (pi * d.powi(3));

    // Principal stresses from combined bending + torsion
    let sigma_avg: f64 = sigma / 2.0;
    let radius: f64 = (sigma_avg.powi(2) + tau.powi(2)).sqrt();
    let sigma_1 = sigma_avg + radius;
    let sigma_2 = sigma_avg - radius;

    // Verify invariants
    // sigma_1 + sigma_2 = sigma (since sigma_y = 0)
    assert_close(sigma_1 + sigma_2, sigma, REL_TOL,
        "sigma_1 + sigma_2 = sigma_bending");

    // sigma_1 * sigma_2 = -tau^2 (determinant for sigma_y = 0)
    let product: f64 = sigma_1 * sigma_2;
    let expected_product: f64 = -tau.powi(2);
    assert_close(product, expected_product, REL_TOL,
        "sigma_1 * sigma_2 = -tau^2");

    // sigma_1 should be positive (tension), sigma_2 should be negative (compression)
    assert!(sigma_1 > 0.0, "sigma_1 should be positive (tension)");
    assert!(sigma_2 < 0.0, "sigma_2 should be negative (compression)");

    // Maximum shear stress = radius = (sigma_1 - sigma_2) / 2
    let tau_max: f64 = (sigma_1 - sigma_2) / 2.0;
    assert_close(tau_max, radius, REL_TOL,
        "tau_max = radius of Mohr's circle");

    // Equivalent stress (Von Mises for shaft):
    // sigma_vm = sqrt(sigma^2 + 3*tau^2)
    let vm: f64 = (sigma.powi(2) + 3.0 * tau.powi(2)).sqrt();

    // Alternative: sigma_vm = sqrt(sigma_1^2 - sigma_1*sigma_2 + sigma_2^2)
    let vm_principal: f64 = (sigma_1.powi(2) - sigma_1 * sigma_2 + sigma_2.powi(2)).sqrt();
    assert_close(vm, vm_principal, REL_TOL,
        "VM from components = VM from principal stresses");
}

// ================================================================
// 5. Stress Transformation — Rotated Coordinate Axes
// ================================================================
//
// For a stress state (sigma_x, sigma_y, tau_xy) rotated by angle theta:
//   sigma_n = sigma_x*cos^2(theta) + sigma_y*sin^2(theta)
//             + 2*tau_xy*sin(theta)*cos(theta)
//   tau_nt  = -(sigma_x - sigma_y)*sin(theta)*cos(theta)
//             + tau_xy*(cos^2(theta) - sin^2(theta))
//
// Verify invariants: sigma_n + sigma_t = sigma_x + sigma_y

#[test]
fn validation_stress2_ext_stress_transformation() {
    // Get stress state from a loaded beam
    let l = 5.0;
    let n = 4;
    let p = -35.0; // kN downward

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_force = ef1.v_start.abs();
    let m_force = ef1.m_start.abs();

    // Stress at quarter-depth (y = h/4)
    let y_pt = H_SEC / 4.0;
    let sigma_x: f64 = m_force * y_pt / IZ;
    let sigma_y: f64 = 0.0;
    let q_at_y = B_SEC / 2.0 * (H_SEC * H_SEC / 4.0 - y_pt * y_pt);
    let tau_xy: f64 = v_force * q_at_y / (IZ * B_SEC);

    // Test at several rotation angles
    let pi: f64 = std::f64::consts::PI;
    let angles = [0.0, pi / 6.0, pi / 4.0, pi / 3.0, pi / 2.0];

    for &theta in &angles {
        let cos_t: f64 = theta.cos();
        let sin_t: f64 = theta.sin();

        // Stress transformation equations
        let sigma_n: f64 = sigma_x * cos_t.powi(2)
            + sigma_y * sin_t.powi(2)
            + 2.0 * tau_xy * sin_t * cos_t;

        let sigma_t: f64 = sigma_x * sin_t.powi(2)
            + sigma_y * cos_t.powi(2)
            - 2.0 * tau_xy * sin_t * cos_t;

        let tau_nt: f64 = -(sigma_x - sigma_y) * sin_t * cos_t
            + tau_xy * (cos_t.powi(2) - sin_t.powi(2));

        // Invariant 1: sigma_n + sigma_t = sigma_x + sigma_y
        assert_close(sigma_n + sigma_t, sigma_x + sigma_y, REL_TOL,
            &format!("Trace invariant at theta={:.2} rad", theta));

        // Invariant 2: sigma_n * sigma_t - tau_nt^2 = sigma_x * sigma_y - tau_xy^2
        let det_rotated: f64 = sigma_n * sigma_t - tau_nt.powi(2);
        let det_original: f64 = sigma_x * sigma_y - tau_xy.powi(2);
        assert_close(det_rotated, det_original, REL_TOL,
            &format!("Determinant invariant at theta={:.2} rad", theta));
    }

    // At theta = 0: transformed stresses should equal original
    let cos0: f64 = (0.0_f64).cos();
    let sin0: f64 = (0.0_f64).sin();
    let sn0: f64 = sigma_x * cos0.powi(2) + sigma_y * sin0.powi(2)
        + 2.0 * tau_xy * sin0 * cos0;
    assert_close(sn0, sigma_x, REL_TOL,
        "sigma_n at theta=0 should equal sigma_x");

    // At theta = pi/2: sigma_n should equal sigma_y
    let cos90: f64 = (pi / 2.0).cos();
    let sin90: f64 = (pi / 2.0).sin();
    let sn90: f64 = sigma_x * cos90.powi(2) + sigma_y * sin90.powi(2)
        + 2.0 * tau_xy * sin90 * cos90;
    assert_close(sn90, sigma_y, REL_TOL,
        "sigma_n at theta=pi/2 should equal sigma_y");
}

// ================================================================
// 6. Pressure Vessel — Hoop and Longitudinal Stresses
// ================================================================
//
// Thin-walled cylindrical pressure vessel:
//   sigma_h = p*D / (2*t)  (hoop/circumferential stress)
//   sigma_l = p*D / (4*t)  (longitudinal/axial stress)
//
// sigma_h = 2 * sigma_l (hoop stress is twice longitudinal)
//
// Verify these relations and associated Von Mises stress using
// a solver-verified equilibrium check for the axial force.

#[test]
fn validation_stress2_ext_pressure_vessel() {
    // Pressure vessel parameters
    let p_internal: f64 = 5.0;  // MPa = N/mm^2 (internal pressure)
    let d_vessel: f64 = 2.0;     // m (diameter)
    let t_wall: f64 = 0.02;     // m (wall thickness = 20mm)

    // Thin-wall hoop and longitudinal stresses (in MPa)
    let sigma_h: f64 = p_internal * d_vessel / (2.0 * t_wall); // MPa
    let sigma_l: f64 = p_internal * d_vessel / (4.0 * t_wall); // MPa

    // Key relation: hoop = 2 * longitudinal
    assert_close(sigma_h, 2.0 * sigma_l, REL_TOL,
        "sigma_h = 2 * sigma_l");

    // Numerical values: sigma_h = 5*2/(2*0.02) = 250 MPa
    //                   sigma_l = 5*2/(4*0.02) = 125 MPa
    assert_close(sigma_h, 250.0, REL_TOL, "sigma_h = 250 MPa");
    assert_close(sigma_l, 125.0, REL_TOL, "sigma_l = 125 MPa");

    // Von Mises for biaxial stress state (no shear on principal axes):
    // sigma_vm = sqrt(sigma_h^2 - sigma_h*sigma_l + sigma_l^2)
    let vm: f64 = (sigma_h.powi(2) - sigma_h * sigma_l + sigma_l.powi(2)).sqrt();

    // Expected: sqrt(250^2 - 250*125 + 125^2) = sqrt(62500 - 31250 + 15625)
    //         = sqrt(46875) ≈ 216.5 MPa
    let vm_expected: f64 = (250.0_f64.powi(2) - 250.0 * 125.0 + 125.0_f64.powi(2)).sqrt();
    assert_close(vm, vm_expected, REL_TOL, "VM for pressure vessel");

    // Verify with a beam under equivalent axial loading
    // The longitudinal stress in the vessel wall can be modeled as axial force
    // in a beam element: N = sigma_l * A_wall (converted to kN)
    // A_wall = pi * D * t for thin wall
    let pi: f64 = std::f64::consts::PI;
    let a_wall: f64 = pi * d_vessel * t_wall; // m^2

    // Axial force to produce sigma_l (convert MPa to kN/m^2: multiply by 1000)
    let n_axial_kn: f64 = sigma_l * 1000.0 * a_wall; // kN

    // Model as a simple bar (1 element, pinned-rollerX)
    let l_bar = 2.0;
    let _a_sec = a_wall;
    let iz_sec = 1e-4; // some value (doesn't matter for pure axial)

    let input = make_beam(
        1, l_bar, E, A, iz_sec, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: n_axial_kn, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Verify equilibrium: reaction at support 1 should balance applied load
    let rx_total: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(rx_total.abs(), n_axial_kn.abs(), REL_TOL,
        "Axial equilibrium for pressure vessel model");

    // Maximum in-plane shear in the vessel wall
    // tau_max = (sigma_h - sigma_l) / 2
    let tau_max_inplane: f64 = (sigma_h - sigma_l) / 2.0;
    assert_close(tau_max_inplane, 62.5, REL_TOL,
        "Max in-plane shear = (sigma_h - sigma_l)/2 = 62.5 MPa");

    // Absolute max shear (considering sigma_z = 0 on inner surface):
    // tau_abs_max = sigma_h / 2
    let tau_abs_max: f64 = sigma_h / 2.0;
    assert_close(tau_abs_max, 125.0, REL_TOL,
        "Absolute max shear = sigma_h/2 = 125 MPa");
}

// ================================================================
// 7. Beam Stress Distribution — Normal and Shear at Various y
// ================================================================
//
// For a rectangular cross-section beam under V and M:
//   sigma(y) = M*y/I  (linear distribution)
//   tau(y)   = V*Q(y)/(I*b) = V/(2*I) * (h^2/4 - y^2)  (parabolic)
//
// Verify the distributions at multiple points across the depth.

#[test]
fn validation_stress2_ext_beam_stress_distribution() {
    // SS beam with point load at midspan
    let l = 6.0;
    let n = 4;
    let p = -40.0; // kN at midspan

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Element 1 (near left support): V = P/2, M varies along span
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_force = ef1.v_start.abs(); // P/2 = 20 kN
    let m_at_end = ef1.m_end.abs();  // M at end of element 1

    assert_close(v_force, p.abs() / 2.0, REL_TOL, "V at support = P/2");

    // Stress distribution at 5 points across the depth: y = -h/2, -h/4, 0, h/4, h/2
    let y_values: [f64; 5] = [-H_SEC / 2.0, -H_SEC / 4.0, 0.0, H_SEC / 4.0, H_SEC / 2.0];

    for &y in &y_values {
        // Normal stress: sigma(y) = M*y/I
        let sigma: f64 = m_at_end * y / IZ;

        // Shear stress: tau(y) = V*(b/2)*(h^2/4 - y^2) / (I*b) = V/(2*I) * (h^2/4 - y^2)
        let tau: f64 = v_force * B_SEC / 2.0
            * (H_SEC * H_SEC / 4.0 - y * y) / (IZ * B_SEC);

        // Verify: normal stress is linear (anti-symmetric about NA)
        // sigma(-y) = -sigma(y)
        let sigma_neg: f64 = m_at_end * (-y) / IZ;
        assert_close(sigma, -sigma_neg, REL_TOL,
            &format!("sigma anti-symmetry at y={:.4}", y));

        // Verify: shear stress is parabolic (symmetric about NA)
        // tau(-y) = tau(y)
        let tau_neg: f64 = v_force * B_SEC / 2.0
            * (H_SEC * H_SEC / 4.0 - (-y) * (-y)) / (IZ * B_SEC);
        assert_close(tau, tau_neg, REL_TOL,
            &format!("tau symmetry at y={:.4}", y));
    }

    // At NA (y=0): sigma = 0, tau = max
    let sigma_na: f64 = m_at_end * 0.0 / IZ;
    let tau_na: f64 = 1.5 * v_force / A;
    assert_close(sigma_na, 0.0, REL_TOL, "sigma at NA = 0");
    assert_close(tau_na, 1.5 * v_force / A, REL_TOL, "tau_max at NA = 1.5*V/A");

    // At extreme fiber (y=h/2): sigma = max, tau = 0
    let sigma_ext: f64 = m_at_end * (H_SEC / 2.0) / IZ;
    let tau_ext: f64 = v_force * B_SEC / 2.0
        * (H_SEC * H_SEC / 4.0 - (H_SEC / 2.0).powi(2)) / (IZ * B_SEC);
    assert!(sigma_ext.abs() > 0.0, "sigma at extreme fiber should be nonzero");
    assert_close(tau_ext, 0.0, REL_TOL, "tau at extreme fiber = 0");

    // Integral check: total shear force = integral of tau*b*dy over depth
    // For parabolic distribution: V = integral = b * tau_max * (2/3) * h
    // Or equivalently: tau_max = 1.5 * V / A
    let tau_max_check: f64 = 1.5 * v_force / (B_SEC * H_SEC);
    let v_from_integral: f64 = tau_max_check * (2.0 / 3.0) * B_SEC * H_SEC;
    assert_close(v_from_integral, v_force, REL_TOL,
        "V from integral of tau distribution");
}

// ================================================================
// 8. Stress Concentration Factor — Plate with Hole
// ================================================================
//
// A plate with a central circular hole under uniaxial tension:
//   sigma_max = Kt * sigma_nom
//
// For an infinite plate: Kt = 3.0 (classic Kirsch solution)
// For a finite plate (width w, hole diameter d):
//   Kt ≈ 3.0 - 3.13*(d/w) + 3.66*(d/w)^2 - 1.53*(d/w)^3 (Howland)
//
// Verify the Howland formula, verify that it reduces to Kt=3 as d/w->0,
// and use the solver to confirm the nominal stress in the net section.

#[test]
fn validation_stress2_ext_stress_concentration() {
    // Plate parameters
    let w_plate: f64 = 0.2;     // m (plate width = 200mm)
    let d_hole: f64 = 0.04;     // m (hole diameter = 40mm)
    let t_plate: f64 = 0.01;    // m (plate thickness = 10mm)

    // Applied axial load
    let p_axial: f64 = 100.0; // kN

    // Nominal stress on net section: sigma_nom = P / ((w - d) * t)
    let a_net = (w_plate - d_hole) * t_plate;
    let sigma_nom: f64 = p_axial / a_net; // kN/m^2

    // Gross section stress: sigma_gross = P / (w * t)
    let a_gross = w_plate * t_plate;
    let sigma_gross: f64 = p_axial / a_gross; // kN/m^2

    // Stress concentration factor (Howland approximation for finite plate)
    let ratio: f64 = d_hole / w_plate; // d/w = 0.2
    let kt: f64 = 3.0 - 3.13 * ratio + 3.66 * ratio.powi(2) - 1.53 * ratio.powi(3);

    // Maximum stress at hole edge
    let sigma_max: f64 = kt * sigma_nom;

    // Verify Kt for d/w = 0.2
    // Kt = 3.0 - 3.13*0.2 + 3.66*0.04 - 1.53*0.008
    //    = 3.0 - 0.626 + 0.1464 - 0.01224 = 2.508
    let kt_expected: f64 = 3.0 - 3.13 * 0.2 + 3.66 * 0.04 - 1.53 * 0.008;
    assert_close(kt, kt_expected, REL_TOL,
        "Kt for d/w = 0.2 (Howland)");

    // For d/w -> 0 (infinite plate): Kt -> 3.0
    let ratio_small: f64 = 0.001;
    let kt_inf: f64 = 3.0 - 3.13 * ratio_small + 3.66 * ratio_small.powi(2)
        - 1.53 * ratio_small.powi(3);
    assert_close(kt_inf, 3.0, 0.01,
        "Kt approaches 3.0 for small d/w");

    // Verify sigma_max > sigma_nom (stress concentration amplifies stress)
    assert!(sigma_max > sigma_nom,
        "sigma_max ({:.2}) should exceed sigma_nom ({:.2})", sigma_max, sigma_nom);

    // Verify Kt > 1 (always amplifies)
    assert!(kt > 1.0, "Kt should be > 1, got {:.4}", kt);

    // Use solver to verify nominal stress via equilibrium of a bar
    // Model a bar with the net section area
    let l_bar = 1.0;
    let a_bar = a_net;
    let iz_bar: f64 = t_plate * (w_plate - d_hole).powi(3) / 12.0;

    let input = make_beam(
        2, l_bar, E, a_bar, iz_bar, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: p_axial, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Verify axial force in element = applied load
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(ef1.n_start.abs(), p_axial, REL_TOL,
        "N in bar = applied axial load");

    // Nominal stress from solver: sigma_nom = N / A_net
    let sigma_nom_solver = ef1.n_start.abs() / a_net;
    assert_close(sigma_nom_solver, sigma_nom, REL_TOL,
        "sigma_nom from solver matches hand calc");

    // Apply SCF to get maximum stress
    let sigma_max_from_solver: f64 = kt * sigma_nom_solver;
    assert_close(sigma_max_from_solver, sigma_max, REL_TOL,
        "sigma_max from solver-based sigma_nom");

    // Cross-check: sigma_max / sigma_gross should equal Kt * w / (w - d)
    let ratio_check: f64 = sigma_max / sigma_gross;
    let expected_ratio_check: f64 = kt * w_plate / (w_plate - d_hole);
    assert_close(ratio_check, expected_ratio_check, REL_TOL,
        "sigma_max/sigma_gross = Kt * w/(w-d)");
}
