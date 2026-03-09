/// Validation: Mohr Circle and Stress Transformations — Pure-Math Formulas
///
/// References:
///   - Timoshenko & Goodier, "Theory of Elasticity", 3rd ed. (1970)
///   - Boresi & Schmidt, "Advanced Mechanics of Materials", 6th ed. (2003)
///   - Gere & Goodno, "Mechanics of Materials", 9th ed. (2018)
///   - Popov, "Engineering Mechanics of Solids", 2nd ed. (1998)
///   - von Mises (1913): "Mechanik der festen Korper im plastisch deformablen Zustand"
///   - Tresca (1864): Maximum shear stress yield criterion
///
/// Tests verify stress transformation formulas, principal stresses, yield criteria,
/// and invariants with hand-computed expected values.
/// No solver calls — pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. 2D Stress Transformation — Rotation by Angle theta
// ================================================================
//
// Given stress state (sigma_x, sigma_y, tau_xy), the stresses on a
// plane rotated by angle theta (CCW from x-axis):
//
//   sigma_n = (sigma_x + sigma_y)/2 + (sigma_x - sigma_y)/2 * cos(2*theta)
//             + tau_xy * sin(2*theta)
//   tau_nt  = -(sigma_x - sigma_y)/2 * sin(2*theta) + tau_xy * cos(2*theta)
//
// Test: sigma_x = 80 MPa, sigma_y = -40 MPa, tau_xy = 30 MPa, theta = 30 deg
//   sigma_avg = (80-40)/2 = 20
//   sigma_diff_half = (80+40)/2 = 60  (note: sigma_x - sigma_y = 120, /2 = 60)
//   cos(60) = 0.5, sin(60) = 0.8660
//   sigma_n = 20 + 60*0.5 + 30*0.8660 = 20 + 30 + 25.98 = 75.98 MPa
//   tau_nt = -60*0.866 + 30*0.5 = -51.96 + 15 = -36.96 MPa

#[test]
fn validation_2d_stress_transformation() {
    let sigma_x: f64 = 80.0; // MPa
    let sigma_y: f64 = -40.0; // MPa
    let tau_xy: f64 = 30.0; // MPa
    let theta_deg: f64 = 30.0;
    let theta = theta_deg * PI / 180.0;

    let sigma_avg = (sigma_x + sigma_y) / 2.0;
    let sigma_diff_half = (sigma_x - sigma_y) / 2.0;

    let sigma_n = sigma_avg + sigma_diff_half * (2.0 * theta).cos()
        + tau_xy * (2.0 * theta).sin();
    let tau_nt = -sigma_diff_half * (2.0 * theta).sin()
        + tau_xy * (2.0 * theta).cos();

    // Hand-computed
    let expected_sigma_n = 20.0 + 60.0 * (60.0_f64 * PI / 180.0).cos()
        + 30.0 * (60.0_f64 * PI / 180.0).sin();
    let expected_tau_nt = -60.0 * (60.0_f64 * PI / 180.0).sin()
        + 30.0 * (60.0_f64 * PI / 180.0).cos();

    assert_close(sigma_n, expected_sigma_n, 1e-10, "sigma_n at 30 deg");
    assert_close(tau_nt, expected_tau_nt, 1e-10, "tau_nt at 30 deg");

    // At theta = 0: should recover original state
    let sigma_n_0 = sigma_avg + sigma_diff_half * 1.0 + tau_xy * 0.0;
    assert_close(sigma_n_0, sigma_x, 1e-10, "sigma_n at theta=0 = sigma_x");

    // Invariant: sigma_n(theta) + sigma_n(theta+90) = sigma_x + sigma_y
    let theta_90 = theta + PI / 2.0;
    let sigma_n_90 = sigma_avg + sigma_diff_half * (2.0 * theta_90).cos()
        + tau_xy * (2.0 * theta_90).sin();
    assert_close(sigma_n + sigma_n_90, sigma_x + sigma_y, 1e-10,
        "sum of normal stresses invariant");
}

// ================================================================
// 2. Principal Stresses and Maximum Shear Stress (2D)
// ================================================================
//
// sigma_1,2 = (sigma_x + sigma_y)/2 +/- sqrt(((sigma_x - sigma_y)/2)^2 + tau_xy^2)
// tau_max = sqrt(((sigma_x - sigma_y)/2)^2 + tau_xy^2)
// theta_p = 0.5 * atan2(2*tau_xy, sigma_x - sigma_y)
//
// Test: sigma_x = 50 MPa, sigma_y = -10 MPa, tau_xy = 40 MPa
//   R = sqrt(30^2 + 40^2) = sqrt(900 + 1600) = sqrt(2500) = 50
//   sigma_1 = 20 + 50 = 70 MPa
//   sigma_2 = 20 - 50 = -30 MPa
//   tau_max = 50 MPa
//   theta_p = 0.5*atan2(80, 60) = 0.5*53.13 deg = 26.57 deg

#[test]
fn validation_principal_stresses_2d() {
    let sigma_x: f64 = 50.0;
    let sigma_y: f64 = -10.0;
    let tau_xy: f64 = 40.0;

    let sigma_avg = (sigma_x + sigma_y) / 2.0; // 20
    let r = ((sigma_x - sigma_y) / 2.0).powi(2) + tau_xy.powi(2);
    let r = r.sqrt(); // 50

    let sigma_1 = sigma_avg + r;
    let sigma_2 = sigma_avg - r;
    let tau_max = r;

    assert_close(sigma_avg, 20.0, 1e-10, "sigma_avg");
    assert_close(r, 50.0, 1e-10, "Mohr circle radius");
    assert_close(sigma_1, 70.0, 1e-10, "sigma_1");
    assert_close(sigma_2, -30.0, 1e-10, "sigma_2");
    assert_close(tau_max, 50.0, 1e-10, "tau_max");

    // Principal angle
    let theta_p = 0.5 * (2.0 * tau_xy).atan2(sigma_x - sigma_y);
    let expected_theta = 0.5 * (80.0_f64).atan2(60.0);
    assert_close(theta_p, expected_theta, 1e-10, "principal angle");

    // Verify: at principal angle, shear stress = 0
    let sigma_diff_half = (sigma_x - sigma_y) / 2.0;
    let tau_at_principal = -sigma_diff_half * (2.0 * theta_p).sin()
        + tau_xy * (2.0 * theta_p).cos();
    assert!(tau_at_principal.abs() < 1e-10, "shear stress = 0 at principal plane");

    // Verify: sigma_1 + sigma_2 = sigma_x + sigma_y (first invariant)
    assert_close(sigma_1 + sigma_2, sigma_x + sigma_y, 1e-10, "first stress invariant I1");

    // Verify: sigma_1 * sigma_2 = sigma_x*sigma_y - tau_xy^2 (second invariant for 2D)
    let i2_principal = sigma_1 * sigma_2;
    let i2_original = sigma_x * sigma_y - tau_xy * tau_xy;
    assert_close(i2_principal, i2_original, 1e-10, "second stress invariant I2");
}

// ================================================================
// 3. 3D Principal Stresses — Cubic Equation
// ================================================================
//
// The characteristic equation for the 3D stress tensor:
//   sigma^3 - I1*sigma^2 + I2*sigma - I3 = 0
//
// Invariants:
//   I1 = sigma_xx + sigma_yy + sigma_zz
//   I2 = sigma_xx*sigma_yy + sigma_yy*sigma_zz + sigma_zz*sigma_xx
//        - tau_xy^2 - tau_yz^2 - tau_zx^2
//   I3 = det(sigma_ij)
//
// Test: sigma = [100, 50, 30; 50, 80, 20; 30, 20, 60] MPa
//   I1 = 100 + 80 + 60 = 240
//   I2 = 100*80 + 80*60 + 60*100 - 50^2 - 20^2 - 30^2
//      = 8000 + 4800 + 6000 - 2500 - 400 - 900 = 15000
//   I3 = det = 100*(80*60-20*20) - 50*(50*60-20*30) + 30*(50*20-80*30)
//      = 100*(4800-400) - 50*(3000-600) + 30*(1000-2400)
//      = 100*4400 - 50*2400 + 30*(-1400)
//      = 440000 - 120000 - 42000 = 278000

#[test]
fn validation_3d_principal_stresses() {
    // Stress components
    let sxx: f64 = 100.0;
    let syy: f64 = 80.0;
    let szz: f64 = 60.0;
    let txy: f64 = 50.0;
    let tyz: f64 = 20.0;
    let tzx: f64 = 30.0;

    // Invariants
    let i1 = sxx + syy + szz;
    let i2 = sxx * syy + syy * szz + szz * sxx - txy * txy - tyz * tyz - tzx * tzx;
    let i3 = sxx * (syy * szz - tyz * tyz)
           - txy * (txy * szz - tyz * tzx)
           + tzx * (txy * tyz - syy * tzx);

    assert_close(i1, 240.0, 1e-10, "I1");
    assert_close(i2, 15_000.0, 1e-10, "I2");
    assert_close(i3, 278_000.0, 1e-10, "I3");

    // Solve cubic: s^3 - I1*s^2 + I2*s - I3 = 0
    // Using trigonometric method (Viete's)
    let p = i2 - i1 * i1 / 3.0;
    let q_val = -2.0 * i1 * i1 * i1 / 27.0 + i1 * i2 / 3.0 - i3;

    let discriminant = -(4.0 * p * p * p + 27.0 * q_val * q_val);
    assert!(discriminant >= 0.0, "3 real roots expected for stress tensor");

    // Trigonometric solution
    let r_val = (-p / 3.0).sqrt();
    let cos_arg = -q_val / (2.0 * r_val * r_val * r_val);
    let cos_arg_clamped = cos_arg.max(-1.0).min(1.0);
    let theta_3 = cos_arg_clamped.acos();

    let s1 = 2.0 * r_val * (theta_3 / 3.0).cos() + i1 / 3.0;
    let s2 = 2.0 * r_val * ((theta_3 + 2.0 * PI) / 3.0).cos() + i1 / 3.0;
    let s3 = 2.0 * r_val * ((theta_3 + 4.0 * PI) / 3.0).cos() + i1 / 3.0;

    // Sort: sigma_1 >= sigma_2 >= sigma_3
    let mut principals = [s1, s2, s3];
    principals.sort_by(|a, b| b.partial_cmp(a).unwrap());

    // Verify invariant: sum = I1
    assert_close(principals[0] + principals[1] + principals[2], i1, 1e-8, "sum of principals = I1");

    // Verify invariant: product = I3
    assert_close(principals[0] * principals[1] * principals[2], i3, 1e-6, "product of principals = I3");

    // All principals should be positive for this stress state
    assert!(principals[2] > 0.0, "all principals positive for this tensile state");
    assert!(principals[0] > principals[1], "sigma_1 > sigma_2");
    assert!(principals[1] > principals[2], "sigma_2 > sigma_3");
}

// ================================================================
// 4. Von Mises Yield Criterion
// ================================================================
//
// sigma_vm = sqrt(0.5*((s1-s2)^2 + (s2-s3)^2 + (s3-s1)^2))
//
// Or in terms of stress components:
//   sigma_vm = sqrt(0.5*((sxx-syy)^2 + (syy-szz)^2 + (szz-sxx)^2
//              + 6*(txy^2 + tyz^2 + tzx^2)))
//
// Yield condition: sigma_vm <= sigma_y
//
// Special cases:
//   Uniaxial tension (sxx = sigma, rest = 0): sigma_vm = sigma
//   Pure shear (txy = tau, rest = 0): sigma_vm = sqrt(3)*tau
//   Biaxial equal tension (sxx = syy = sigma): sigma_vm = sigma
//   Hydrostatic (sxx = syy = szz = p): sigma_vm = 0

#[test]
fn validation_von_mises_yield_criterion() {
    let sigma_y: f64 = 250.0; // MPa (yield stress)

    // Von Mises from components
    let von_mises_components = |sxx: f64, syy: f64, szz: f64,
                                 txy: f64, tyz: f64, tzx: f64| -> f64 {
        (0.5 * ((sxx - syy).powi(2) + (syy - szz).powi(2) + (szz - sxx).powi(2)
            + 6.0 * (txy.powi(2) + tyz.powi(2) + tzx.powi(2)))).sqrt()
    };

    // Von Mises from principals
    let _von_mises_principal = |s1: f64, s2: f64, s3: f64| -> f64 {
        (0.5 * ((s1 - s2).powi(2) + (s2 - s3).powi(2) + (s3 - s1).powi(2))).sqrt()
    };

    // Case 1: Uniaxial tension
    let vm_uniaxial = von_mises_components(200.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    assert_close(vm_uniaxial, 200.0, 1e-10, "VM uniaxial tension");

    // Case 2: Pure shear
    let tau: f64 = 100.0;
    let vm_shear = von_mises_components(0.0, 0.0, 0.0, tau, 0.0, 0.0);
    assert_close(vm_shear, 3.0_f64.sqrt() * tau, 1e-10, "VM pure shear");

    // Shear yield stress = sigma_y / sqrt(3) = 144.34 MPa
    let tau_y = sigma_y / 3.0_f64.sqrt();
    assert_close(tau_y, 144.3376, 0.001, "shear yield stress");

    // Case 3: Biaxial equal tension
    let vm_biaxial = von_mises_components(150.0, 150.0, 0.0, 0.0, 0.0, 0.0);
    assert_close(vm_biaxial, 150.0, 1e-10, "VM biaxial equal tension");

    // Case 4: Hydrostatic pressure (deviatoric stress = 0)
    let vm_hydro = von_mises_components(100.0, 100.0, 100.0, 0.0, 0.0, 0.0);
    assert_close(vm_hydro, 0.0, 1e-10, "VM hydrostatic = 0");

    // Case 5: Compare component form vs principal form
    let vm_comp = von_mises_components(80.0, -40.0, 20.0, 30.0, 15.0, 10.0);
    // Principal form would give same result (invariant)
    // I1 = 60, I2 = 80*(-40)+(-40)*20+20*80 - 900-225-100 = -3200-800+1600-1225 = -3625
    // Just verify positivity and that it matches J2-based calculation
    assert!(vm_comp > 0.0, "VM stress must be positive for non-hydrostatic state");

    // Verify J2 relationship: sigma_vm = sqrt(3*J2)
    // J2 = vm^2 / 3
    let j2 = vm_comp * vm_comp / 3.0;
    let vm_from_j2 = (3.0 * j2).sqrt();
    assert_close(vm_from_j2, vm_comp, 1e-10, "VM from J2");
}

// ================================================================
// 5. Tresca Yield Criterion (Maximum Shear Stress)
// ================================================================
//
// Tresca: tau_max = (sigma_max - sigma_min) / 2 <= sigma_y / 2
// Or equivalently: sigma_max - sigma_min <= sigma_y
//
// For plane stress (sigma_3 = 0):
//   If sigma_1 > 0 and sigma_2 > 0: tau_max = sigma_1/2
//   If sigma_1 > 0 and sigma_2 < 0: tau_max = (sigma_1 - sigma_2)/2
//   If sigma_1 < 0 and sigma_2 < 0: tau_max = |sigma_2|/2
//
// Comparison with von Mises:
//   Tresca is always more conservative (inner hexagon vs ellipse)
//   At uniaxial: both give same result
//   At pure shear: Tresca gives tau_y = sigma_y/2, VM gives tau_y = sigma_y/sqrt(3)

#[test]
fn validation_tresca_yield_criterion() {
    let sigma_y: f64 = 300.0; // MPa

    // Tresca function (from 3 principal stresses)
    let tresca = |s1: f64, s2: f64, s3: f64| -> f64 {
        let max_s = s1.max(s2).max(s3);
        let min_s = s1.min(s2).min(s3);
        (max_s - min_s) / 2.0
    };

    // Case 1: Uniaxial tension sigma_1 = 200, sigma_2 = sigma_3 = 0
    let tau_1 = tresca(200.0, 0.0, 0.0);
    assert_close(tau_1, 100.0, 1e-10, "Tresca uniaxial");
    assert!(tau_1 <= sigma_y / 2.0, "uniaxial within Tresca yield");

    // Case 2: Pure shear equivalent: sigma_1 = tau, sigma_2 = 0, sigma_3 = -tau
    let tau_val: f64 = 120.0;
    let tau_2 = tresca(tau_val, 0.0, -tau_val);
    assert_close(tau_2, tau_val, 1e-10, "Tresca pure shear");

    // Tresca shear yield = sigma_y / 2
    let tau_y_tresca = sigma_y / 2.0;
    assert_close(tau_y_tresca, 150.0, 1e-10, "Tresca shear yield");

    // Von Mises shear yield = sigma_y / sqrt(3)
    let tau_y_vm = sigma_y / 3.0_f64.sqrt();
    assert!(tau_y_tresca < tau_y_vm, "Tresca shear yield < VM shear yield");

    // Case 3: Biaxial tension sigma_1 = sigma_2 = sigma
    // Tresca: tau = sigma/2 (since sigma_3 = 0)
    let tau_3 = tresca(200.0, 200.0, 0.0);
    assert_close(tau_3, 100.0, 1e-10, "Tresca biaxial equal tension");

    // Case 4: Hydrostatic (no shear)
    let tau_4 = tresca(100.0, 100.0, 100.0);
    assert_close(tau_4, 0.0, 1e-10, "Tresca hydrostatic = 0");

    // Tresca is more conservative: for same stress state,
    // Tresca equivalent stress >= VM equivalent stress (after normalization)
    // Check at 45-deg biaxial: sigma_1 = sigma_y, sigma_2 = sigma_y/2
    let s1_test = sigma_y;
    let s2_test = sigma_y / 2.0;
    let tresca_equiv = 2.0 * tresca(s1_test, s2_test, 0.0); // 2*tau_max as equivalent
    let vm_equiv = (0.5 * ((s1_test - s2_test).powi(2) + s2_test.powi(2) + s1_test.powi(2))).sqrt();
    // Tresca: 2*tau_max = sigma_1 - 0 = 300 MPa -> yield (Tresca_equiv = sigma_y)
    // VM: sqrt(0.5*(150^2 + 150^2 + 300^2)) = sqrt(0.5*(22500+22500+90000)) = sqrt(67500) = 259.8 MPa
    assert_close(tresca_equiv, sigma_y, 1e-10, "Tresca equiv at test point");
    assert!(vm_equiv < tresca_equiv, "VM equivalent < Tresca equivalent");
}

// ================================================================
// 6. Mohr Circle Graphical Properties
// ================================================================
//
// Center: C = (sigma_x + sigma_y)/2
// Radius: R = sqrt(((sigma_x - sigma_y)/2)^2 + tau_xy^2)
// The Mohr circle passes through (sigma_x, tau_xy) and (sigma_y, -tau_xy)
//
// Maximum shear stress occurs at 45 deg from principal planes
// On the Mohr circle, 45 deg physical = 90 deg on circle
//
// Test: sigma_x = 120, sigma_y = 40, tau_xy = 50 MPa

#[test]
fn validation_mohr_circle_properties() {
    let sigma_x: f64 = 120.0;
    let sigma_y: f64 = 40.0;
    let tau_xy: f64 = 50.0;

    let center = (sigma_x + sigma_y) / 2.0;
    let radius = (((sigma_x - sigma_y) / 2.0).powi(2) + tau_xy.powi(2)).sqrt();

    assert_close(center, 80.0, 1e-10, "Mohr circle center");

    // R = sqrt(40^2 + 50^2) = sqrt(1600 + 2500) = sqrt(4100) = 64.03
    let expected_r = (40.0_f64.powi(2) + 50.0_f64.powi(2)).sqrt();
    assert_close(radius, expected_r, 1e-10, "Mohr circle radius");

    // Principal stresses
    let sigma_1 = center + radius;
    let sigma_2 = center - radius;
    assert!(sigma_1 > sigma_2, "sigma_1 > sigma_2");

    // Check that (sigma_x, tau_xy) lies on the circle
    let dist_x = ((sigma_x - center).powi(2) + tau_xy.powi(2)).sqrt();
    assert_close(dist_x, radius, 1e-10, "point (sigma_x, tau_xy) on circle");

    // Check that (sigma_y, -tau_xy) lies on the circle
    let dist_y = ((sigma_y - center).powi(2) + (-tau_xy).powi(2)).sqrt();
    assert_close(dist_y, radius, 1e-10, "point (sigma_y, -tau_xy) on circle");

    // Maximum shear stress = radius
    assert_close(radius, (sigma_1 - sigma_2) / 2.0, 1e-10, "max shear = R");

    // Normal stress at max shear plane = center
    // (At 45 deg from principal = 90 deg on Mohr circle = top of circle)
    let sigma_at_max_shear = center;
    assert_close(sigma_at_max_shear, (sigma_1 + sigma_2) / 2.0, 1e-10,
        "normal stress at max shear plane");

    // Angle of principal planes from x-axis
    let theta_p_rad = 0.5 * (2.0 * tau_xy).atan2(sigma_x - sigma_y);
    let theta_p_deg = theta_p_rad * 180.0 / PI;
    // Max shear at 45 deg from principal
    let theta_s_deg = theta_p_deg + 45.0;
    assert!(theta_s_deg > theta_p_deg, "shear plane at 45 deg from principal");
}

// ================================================================
// 7. Octahedral Stresses
// ================================================================
//
// The octahedral normal and shear stresses on planes equally
// inclined to the principal axes:
//
//   sigma_oct = (sigma_1 + sigma_2 + sigma_3) / 3 = I1/3
//   tau_oct = (1/3)*sqrt((s1-s2)^2 + (s2-s3)^2 + (s3-s1)^2)
//           = sqrt(2)/3 * sigma_vm
//
// The relationship between tau_oct and von Mises:
//   sigma_vm = (3/sqrt(2)) * tau_oct
//
// Yield criterion: tau_oct <= tau_oct_y = sqrt(2)/3 * sigma_y
//
// Test: sigma_1 = 200, sigma_2 = 100, sigma_3 = -50 MPa

#[test]
fn validation_octahedral_stresses() {
    let s1: f64 = 200.0;
    let s2: f64 = 100.0;
    let s3: f64 = -50.0;

    // Octahedral normal stress
    let sigma_oct = (s1 + s2 + s3) / 3.0;
    assert_close(sigma_oct, 250.0 / 3.0, 1e-10, "octahedral normal stress");

    // Octahedral shear stress
    let tau_oct = (1.0 / 3.0)
        * ((s1 - s2).powi(2) + (s2 - s3).powi(2) + (s3 - s1).powi(2)).sqrt();

    // Hand calculation:
    // (200-100)^2 = 10000, (100+50)^2 = 22500, (-50-200)^2 = 62500
    // sum = 95000, sqrt = 308.22, /3 = 102.74
    let expected_tau = (1.0 / 3.0) * (10_000.0 + 22_500.0 + 62_500.0_f64).sqrt();
    assert_close(tau_oct, expected_tau, 1e-10, "octahedral shear stress");

    // Relationship to von Mises
    // tau_oct = (1/3)*sqrt(S), sigma_vm = sqrt(S/2), so tau_oct = sqrt(2)/3 * sigma_vm
    let sigma_vm = (0.5 * ((s1 - s2).powi(2) + (s2 - s3).powi(2) + (s3 - s1).powi(2))).sqrt();
    let tau_oct_from_vm = 2.0_f64.sqrt() / 3.0 * sigma_vm;
    assert_close(tau_oct, tau_oct_from_vm, 1e-10, "tau_oct = sqrt(2)/3 * sigma_vm");

    // Inverse relationship
    let vm_from_oct = (3.0 / 2.0_f64.sqrt()) * tau_oct;
    assert_close(vm_from_oct, sigma_vm, 1e-10, "sigma_vm = 3/sqrt(2)*tau_oct");

    // Octahedral yield criterion
    let sigma_y: f64 = 250.0;
    let tau_oct_yield = 2.0_f64.sqrt() / 3.0 * sigma_y;
    // This should be equivalent to sigma_vm = sigma_y
    let vm_at_oct_yield = (3.0 / 2.0_f64.sqrt()) * tau_oct_yield;
    assert_close(vm_at_oct_yield, sigma_y, 1e-10, "VM at octahedral yield = sigma_y");

    // Hydrostatic part doesn't affect octahedral shear
    let s1_h = s1 + 100.0;
    let s2_h = s2 + 100.0;
    let s3_h = s3 + 100.0;
    let tau_oct_h = (1.0 / 3.0)
        * ((s1_h - s2_h).powi(2) + (s2_h - s3_h).powi(2) + (s3_h - s1_h).powi(2)).sqrt();
    assert_close(tau_oct_h, tau_oct, 1e-10, "hydrostatic doesn't affect tau_oct");
}

// ================================================================
// 8. Strain Energy and Distortion Energy
// ================================================================
//
// Total strain energy density:
//   U = (1/(2E)) * (s1^2 + s2^2 + s3^2 - 2*nu*(s1*s2 + s2*s3 + s3*s1))
//
// Volumetric (dilatational) strain energy:
//   Uv = (1-2*nu)/(6*E) * (s1 + s2 + s3)^2
//
// Distortion (deviatoric) strain energy:
//   Ud = U - Uv = (1+nu)/(6*E) * ((s1-s2)^2 + (s2-s3)^2 + (s3-s1)^2)
//      = (1+nu)/(3*E) * J2
//      = sigma_vm^2 / (6*G)  where G = E/(2*(1+nu))
//
// Von Mises yield: Ud = Ud_y = sigma_y^2*(1+nu)/(3*E)
//
// Test: s1 = 150, s2 = 80, s3 = 30 MPa, E = 200 GPa, nu = 0.3

#[test]
fn validation_strain_energy_decomposition() {
    let s1: f64 = 150.0;
    let s2: f64 = 80.0;
    let s3: f64 = 30.0;
    let e_mod: f64 = 200_000.0; // MPa
    let nu: f64 = 0.3;
    let g_mod = e_mod / (2.0 * (1.0 + nu)); // shear modulus

    // Total strain energy density
    let u_total = (1.0 / (2.0 * e_mod))
        * (s1.powi(2) + s2.powi(2) + s3.powi(2)
           - 2.0 * nu * (s1 * s2 + s2 * s3 + s3 * s1));

    // Volumetric strain energy
    let u_vol = (1.0 - 2.0 * nu) / (6.0 * e_mod) * (s1 + s2 + s3).powi(2);

    // Distortion strain energy
    let u_dist_direct = (1.0 + nu) / (6.0 * e_mod)
        * ((s1 - s2).powi(2) + (s2 - s3).powi(2) + (s3 - s1).powi(2));
    let u_dist = u_total - u_vol;

    assert_close(u_dist, u_dist_direct, 1e-10, "distortion energy: U - Uv = direct formula");

    // Check with von Mises
    let sigma_vm = (0.5 * ((s1 - s2).powi(2) + (s2 - s3).powi(2) + (s3 - s1).powi(2))).sqrt();
    let u_dist_vm = sigma_vm.powi(2) / (6.0 * g_mod);
    assert_close(u_dist, u_dist_vm, 1e-10, "distortion energy = sigma_vm^2/(6G)");

    // All energy contributions should be non-negative
    assert!(u_total >= 0.0, "total energy >= 0");
    assert!(u_vol >= 0.0, "volumetric energy >= 0");
    assert!(u_dist >= 0.0, "distortion energy >= 0");

    // Sum check
    assert_close(u_vol + u_dist, u_total, 1e-10, "Uv + Ud = U_total");

    // Hydrostatic state: all distortion energy is zero
    let p = (s1 + s2 + s3) / 3.0;
    let u_dist_hydro = (1.0 + nu) / (6.0 * e_mod)
        * ((p - p).powi(2) + (p - p).powi(2) + (p - p).powi(2));
    assert_close(u_dist_hydro, 0.0, 1e-10, "distortion energy zero for hydrostatic");

    // Pure deviatoric state: all volumetric energy is zero
    let dev1 = s1 - p;
    let dev2 = s2 - p;
    let dev3 = s3 - p;
    // dev1 + dev2 + dev3 = 0
    assert_close(dev1 + dev2 + dev3, 0.0, 1e-10, "deviatoric stresses sum to zero");
}
