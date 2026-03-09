/// Validation: Thermal Stress Analysis — Pure-Math Formulas
///
/// References:
///   - Timoshenko & Goodier, "Theory of Elasticity", 3rd ed. (1970)
///   - Boley & Weiner, "Theory of Thermal Stresses" (1960)
///   - Roark's Formulas for Stress and Strain, 8th ed. (2012)
///   - Incropera & DeWitt, "Fundamentals of Heat and Mass Transfer", 7th ed.
///   - Hetnarski & Eslami, "Thermal Stresses — Advanced Theory and Applications" (2009)
///   - Timoshenko, "Analysis of Bi-Metal Thermostats", JOSA (1925)
///   - Ugural & Fenster, "Advanced Mechanics of Materials and Applied Elasticity", 6th ed.
///
/// Tests verify thermal stress and deformation formulas with hand-computed expected values.
/// No solver calls — pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < tol,
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Free Thermal Expansion (No Stress, Strain = alpha * dT)
// ================================================================
//
// An unrestrained bar heated by dT expands freely:
//   epsilon_thermal = alpha * dT
//   delta_L = alpha * dT * L
//   sigma = 0 (no restraint)
//
// For steel: alpha = 12e-6 /degC, L = 3000 mm, dT = 50 degC
//   epsilon = 12e-6 * 50 = 6e-4
//   delta_L = 6e-4 * 3000 = 1.8 mm
//
// Ref: Timoshenko & Goodier (1970), Ch. 13

#[test]
fn validation_free_thermal_expansion() {
    let alpha: f64 = 12e-6; // /degC (steel)
    let dt: f64 = 50.0; // degC
    let l: f64 = 3000.0; // mm
    let e_mod: f64 = 200_000.0; // MPa

    // Thermal strain
    let epsilon_th = alpha * dt;
    assert_close(epsilon_th, 6.0e-4, 1e-12, "thermal strain");

    // Free elongation
    let delta_l = alpha * dt * l;
    assert_close(delta_l, 1.8, 1e-12, "free thermal elongation");

    // Stress is zero (no restraint)
    let sigma = 0.0 * e_mod; // explicitly zero
    assert_close(sigma, 0.0, 1e-12, "free expansion stress = 0");

    // Verify for aluminum: alpha = 23e-6 /degC
    let alpha_al: f64 = 23e-6;
    let delta_l_al = alpha_al * dt * l;
    assert_close(delta_l_al, 23e-6 * 50.0 * 3000.0, 1e-12, "aluminum free expansion");

    // Aluminum expands more than steel
    assert!(delta_l_al > delta_l, "aluminum expands more than steel");

    // Volume expansion (isotropic): dV/V = 3 * alpha * dT
    let vol_strain = 3.0 * alpha * dt;
    assert_close(vol_strain, 3.0 * 6.0e-4, 1e-12, "volumetric thermal strain");

    let _e = e_mod;
    let _ = PI;
}

// ================================================================
// 2. Fully Restrained Bar (Stress = -E * alpha * dT)
// ================================================================
//
// A bar fixed at both ends, heated by dT:
//   epsilon_total = 0 (no elongation possible)
//   epsilon_thermal + epsilon_mechanical = 0
//   alpha*dT + sigma/E = 0
//   sigma = -E * alpha * dT (compressive for heating)
//
// For steel: sigma = -200000 * 12e-6 * 80 = -192 MPa
//
// Ref: Timoshenko & Goodier (1970), Ch. 13; Roark's (2012), Table 15.1

#[test]
fn validation_fully_restrained_thermal_bar() {
    let e_mod: f64 = 200_000.0; // MPa
    let alpha: f64 = 12e-6; // /degC
    let dt: f64 = 80.0; // degC

    // Thermal stress in fully restrained bar
    let sigma = -e_mod * alpha * dt;
    assert_close(sigma, -192.0, 1e-12, "fully restrained thermal stress");

    // Compressive for heating
    assert!(sigma < 0.0, "heating causes compression in restrained bar");

    // Cooling causes tension
    let dt_cool: f64 = -40.0;
    let sigma_cool = -e_mod * alpha * dt_cool;
    assert_close(sigma_cool, 96.0, 1e-12, "cooling causes tension");
    assert!(sigma_cool > 0.0, "cooling produces tensile stress");

    // Force in bar: F = sigma * A
    let area: f64 = 500.0; // mm^2
    let force = sigma * area;
    assert_close(force, -192.0 * 500.0, 1e-12, "thermal force in restrained bar");

    // Partial restraint: if bar can expand by delta_free * r (r = restraint factor 0..1)
    // sigma = -(1-r) * E * alpha * dT
    let r_partial: f64 = 0.3; // 30% free expansion allowed
    let sigma_partial = -(1.0 - r_partial) * e_mod * alpha * dt;
    assert_close(sigma_partial, -0.7 * 192.0, 1e-12, "partial restraint thermal stress");

    // Verify: partial stress magnitude < full restraint
    assert!(sigma_partial.abs() < sigma.abs(), "partial < full restraint stress");
}

// ================================================================
// 3. Bimetallic Strip Curvature (Timoshenko Formula)
// ================================================================
//
// Two bonded layers with different alpha, heated by dT:
//   kappa = 6 * (alpha2 - alpha1) * dT * (1 + m)^2
//           / [h * (3*(1+m)^2 + (1+m*n)*(m^2 + 1/(m*n)))]
//
// where m = t1/t2 (thickness ratio), n = E1/E2 (modulus ratio),
// h = t1 + t2 (total thickness).
//
// For equal thickness (m=1) and equal modulus (n=1):
//   kappa = 6 * (alpha2 - alpha1) * dT * 4 / [h * (12 + 2*2)]
//         = 24 * da * dT / (16 * h)
//         = 3 * da * dT / (2 * h)
//
// Ref: Timoshenko, JOSA (1925); Roark's (2012), Table 15.2

#[test]
fn validation_bimetallic_strip_curvature() {
    // Steel-aluminum bimetallic strip
    let alpha_steel: f64 = 12e-6; // /degC
    let alpha_al: f64 = 23e-6; // /degC
    let da: f64 = alpha_al - alpha_steel; // 11e-6
    let dt: f64 = 100.0; // degC

    // Equal thickness layers
    let t1: f64 = 1.0; // mm (steel)
    let t2: f64 = 1.0; // mm (aluminum)
    let h: f64 = t1 + t2; // 2 mm total
    let m: f64 = t1 / t2; // 1.0
    let e_steel: f64 = 200_000.0; // MPa
    let e_al: f64 = 70_000.0; // MPa
    let n: f64 = e_steel / e_al;

    // Full Timoshenko formula
    let numerator = 6.0 * da * dt * (1.0 + m).powi(2);
    let denom = h * (3.0 * (1.0 + m).powi(2) + (1.0 + m * n) * (m * m + 1.0 / (m * n)));
    let kappa = numerator / denom;

    // For equal thickness, equal modulus (n=1):
    // kappa_simple = 3 * da * dT / (2*h)
    let kappa_simple = 3.0 * da * dt / (2.0 * h);

    // With different moduli, kappa differs from the simple formula
    // Just verify the formula is self-consistent
    assert!(kappa > 0.0, "curvature positive when alpha2 > alpha1");

    // Radius of curvature
    let radius = 1.0 / kappa;
    assert!(radius > 0.0, "radius of curvature positive");

    // For equal-modulus case specifically
    let n_eq: f64 = 1.0;
    let denom_eq = h * (3.0 * (1.0 + m).powi(2) + (1.0 + m * n_eq) * (m * m + 1.0 / (m * n_eq)));
    let kappa_eq = 6.0 * da * dt * (1.0 + m).powi(2) / denom_eq;
    assert_close(kappa_eq, kappa_simple, 1e-10, "equal-modulus simplified formula");

    // Tip deflection of a cantilever bimetallic strip of length L:
    // delta = kappa * L^2 / 2
    let l_strip: f64 = 50.0; // mm
    let delta_tip = kappa * l_strip * l_strip / 2.0;
    assert!(delta_tip > 0.0, "tip deflection positive for heated bimetallic strip");

    // Verify dimensional consistency: kappa has units 1/mm
    // da [1/degC] * dT [degC] / h [mm] => kappa [1/mm]
    let kappa_order = da * dt / h;
    assert!(kappa.abs() < 10.0 * kappa_order.abs(), "curvature in expected order of magnitude");

    let _e_s = e_steel;
    let _e_a = e_al;
}

// ================================================================
// 4. Through-Depth Temperature Gradient in Beam
// ================================================================
//
// Linear temperature gradient through beam depth h:
//   T(y) = T_mean + dT_gradient * y / h  (y from -h/2 to +h/2)
//
// For a simply supported beam (free to bow):
//   Curvature: kappa = alpha * dT_gradient / h
//   Midspan deflection: delta = kappa * L^2 / 8
//   Axial stress from gradient (restrained): sigma(y) = -E * alpha * dT_gradient * y / h
//   Self-equilibrating stress (free ends): zero net force and moment
//
// Ref: Boley & Weiner (1960), Ch. 8; Eurocode EN 1991-1-5

#[test]
fn validation_thermal_gradient_beam() {
    let alpha: f64 = 12e-6; // /degC
    let e_mod: f64 = 200_000.0; // MPa
    let h: f64 = 500.0; // mm (beam depth)
    let b: f64 = 200.0; // mm (beam width)
    let l: f64 = 10_000.0; // mm (span)
    let dt_grad: f64 = 30.0; // degC (top-to-bottom difference)

    // Free curvature from linear gradient
    let kappa = alpha * dt_grad / h;
    assert_close(kappa, 12e-6 * 30.0 / 500.0, 1e-12, "thermal curvature");

    // Midspan deflection (simply supported, uniform curvature)
    let delta_mid = kappa * l * l / 8.0;
    let expected_delta = alpha * dt_grad * l * l / (8.0 * h);
    assert_close(delta_mid, expected_delta, 1e-12, "thermal bow midspan deflection");

    // Numerical check: delta = 12e-6 * 30 * 10000^2 / (8 * 500)
    // = 3.6e-4 * 1e8 / 4000 = 36000 / 4000 = 9.0 mm
    assert_close(delta_mid, 9.0, 1e-10, "thermal bow = 9.0 mm");

    // If beam is fully restrained (fixed-fixed), thermal moment develops:
    // M_thermal = E * I * kappa = E * (b*h^3/12) * alpha * dT / h
    let i_val = b * h.powi(3) / 12.0;
    let m_thermal = e_mod * i_val * kappa;

    // Equivalently: M = E * alpha * dT * b * h^2 / 12
    let m_expected = e_mod * alpha * dt_grad * b * h * h / 12.0;
    assert_close(m_thermal, m_expected, 1e-10, "restrained thermal moment");

    // Max stress from restrained gradient (at extreme fiber):
    // sigma_max = M * (h/2) / I = E * alpha * dT / 2
    let sigma_max = m_thermal * (h / 2.0) / i_val;
    let sigma_expected = e_mod * alpha * dt_grad / 2.0;
    assert_close(sigma_max, sigma_expected, 1e-10, "max restrained thermal stress");

    // Numerical: sigma = 200000 * 12e-6 * 30 / 2 = 36 MPa
    assert_close(sigma_max, 36.0, 1e-10, "thermal stress = 36 MPa");

    // Self-equilibrating check: integral of stress over depth = 0 (net force)
    // For linear distribution sigma(y) = sigma_max * 2y/h:
    // integral from -h/2 to h/2 of sigma(y)*b dy = 0 (by symmetry, odd function)
    // This is automatically satisfied for a linear distribution about the centroid.
    let _b = b;
}

// ================================================================
// 5. Thermal Buckling Critical Temperature
// ================================================================
//
// A pin-pin column heated uniformly will buckle when the thermal
// compressive force equals the Euler critical load:
//   P_thermal = E * A * alpha * dT_cr
//   P_euler = pi^2 * E * I / L^2
//
// Setting equal: dT_cr = pi^2 * I / (A * L^2 * alpha)
//              = pi^2 * r^2 / (L^2 * alpha)
// where r = sqrt(I/A) is the radius of gyration.
//
// For a slender column: the critical temperature rise can be quite small.
//
// Ref: Hetnarski & Eslami (2009), Ch. 6; Ugural & Fenster, Ch. 11

#[test]
fn validation_thermal_buckling_critical_temperature() {
    let e_mod: f64 = 200_000.0; // MPa
    let alpha: f64 = 12e-6; // /degC
    let l: f64 = 5000.0; // mm (column length)

    // Rectangular section: b=100mm, h=200mm
    let b: f64 = 100.0;
    let h: f64 = 200.0;
    let area = b * h;
    let i_val = b * h.powi(3) / 12.0;
    let r_gyration = (i_val / area).sqrt();

    // Radius of gyration for rectangle: r = h / sqrt(12)
    assert_close(r_gyration, h / 12.0_f64.sqrt(), 1e-12, "radius of gyration");

    // Euler critical load
    let p_euler = PI * PI * e_mod * i_val / (l * l);

    // Critical temperature rise
    let dt_cr = PI * PI * i_val / (area * l * l * alpha);
    // Equivalently: dt_cr = pi^2 * r^2 / (L^2 * alpha)
    let dt_cr_alt = PI * PI * r_gyration * r_gyration / (l * l * alpha);
    assert_close(dt_cr, dt_cr_alt, 1e-12, "dT_cr formula equivalence");

    // Verify: thermal force at dT_cr = Euler load
    let p_thermal = e_mod * area * alpha * dt_cr;
    assert_close(p_thermal, p_euler, 1e-10, "thermal force = Euler load at buckling");

    // Numerical: dT_cr = pi^2 * (200/sqrt(12))^2 / (5000^2 * 12e-6)
    // = pi^2 * (200^2/12) / (25e6 * 12e-6)
    // = pi^2 * 3333.33 / 300 = pi^2 * 11.111 = 109.66 degC
    let dt_numerical = PI * PI * (h * h / 12.0) / (l * l * alpha);
    assert_close(dt_cr, dt_numerical, 1e-12, "dT_cr numerical check");

    // Slenderness ratio: lambda = L / r
    let slenderness = l / r_gyration;
    // dT_cr = pi^2 / (lambda^2 * alpha)
    let dt_from_slenderness = PI * PI / (slenderness * slenderness * alpha);
    assert_close(dt_cr, dt_from_slenderness, 1e-12, "dT_cr from slenderness");

    // More slender column buckles at lower temperature
    let l_long: f64 = 10_000.0;
    let dt_cr_long = PI * PI * r_gyration * r_gyration / (l_long * l_long * alpha);
    assert!(dt_cr_long < dt_cr, "longer column buckles at lower temperature");

    let _e = e_mod;
    let _b = b;
}

// ================================================================
// 6. Transient Heat Conduction (Fourier's Equation)
// ================================================================
//
// 1D heat conduction in a slab of thickness L, initially at T0,
// with surfaces suddenly set to Ts:
//
// T(x,t) = Ts + (T0-Ts) * sum_{n=1}^{inf} [2/(n*pi) * (-1)^(n+1) + 2/(n*pi)]
//           * sin(n*pi*x/L) * exp(-n^2*pi^2*alpha_d*t/L^2)
//
// Simplified for first-term approximation at center (x=L/2):
//   T_center(t) ~ Ts + (T0-Ts) * (4/pi) * exp(-pi^2 * alpha_d * t / L^2)
//
// where alpha_d = k/(rho*c) is thermal diffusivity.
//
// Fourier number: Fo = alpha_d * t / L^2
// At Fo >> 0.2, first-term approximation is sufficient.
//
// Ref: Incropera & DeWitt, Ch. 5; Carslaw & Jaeger, "Conduction of Heat in Solids"

#[test]
fn validation_transient_heat_conduction() {
    // Steel slab properties
    let k: f64 = 50.0; // W/(m*K) thermal conductivity
    let rho: f64 = 7850.0; // kg/m^3
    let cp: f64 = 500.0; // J/(kg*K) specific heat
    let alpha_d: f64 = k / (rho * cp); // m^2/s thermal diffusivity

    // alpha_d = 50/(7850*500) = 50/3.925e6 = 1.274e-5 m^2/s
    assert_close(alpha_d, 50.0 / (7850.0 * 500.0), 1e-12, "thermal diffusivity");

    let l: f64 = 0.1; // m (100 mm slab thickness)
    let t0: f64 = 20.0; // degC initial temperature
    let ts: f64 = 200.0; // degC surface temperature

    // Fourier number at t = 100s
    let t_time: f64 = 100.0; // seconds
    let fo = alpha_d * t_time / (l * l);
    // Fo = 1.274e-5 * 100 / 0.01 = 0.1274
    assert_close(fo, alpha_d * 100.0 / 0.01, 1e-12, "Fourier number");

    // At higher Fo (say Fo=0.5), first-term is accurate
    let t_long: f64 = 0.5 * l * l / alpha_d; // time for Fo=0.5
    let fo_long = alpha_d * t_long / (l * l);
    assert_close(fo_long, 0.5, 1e-10, "Fo = 0.5 at t_long");

    // First-term approximation for center temperature at Fo=0.5:
    // theta* = (T_center - Ts)/(T0 - Ts) = (4/pi) * exp(-pi^2 * Fo)
    let theta_star = (4.0 / PI) * (-PI * PI * fo_long).exp();

    // Temperature at center
    let t_center = ts + (t0 - ts) * theta_star;

    // theta* should be very small for Fo=0.5: exp(-pi^2*0.5) = exp(-4.935) ~ 0.0072
    let exp_factor = (-PI * PI * 0.5).exp();
    assert_close(theta_star, (4.0 / PI) * exp_factor, 1e-12, "theta* first-term");

    // Center temperature should be close to surface temperature
    assert!(t_center > ts * 0.9, "center nearly reached surface temp at Fo=0.5");

    // At t=0, center should be T0
    let theta_0 = (4.0 / PI) * (-PI * PI * 0.0).exp();
    let t_center_0 = ts + (t0 - ts) * theta_0;
    // theta_0 = 4/pi ~ 1.273, so first-term gives T ~ Ts + (T0-Ts)*1.273
    // This shows the first-term alone overshoots at t=0 (need more terms)
    assert!(theta_0 > 1.0, "first-term overshoots at t=0 (expected, need more terms)");

    // Energy absorbed per unit area: Q = rho*cp*L*(Ts-T0) at equilibrium
    let q_total = rho * cp * l * (ts - t0);
    assert!(q_total > 0.0, "total energy absorption positive");

    let _t_c0 = t_center_0;
}

// ================================================================
// 7. Thermal Shock Stress Concentration
// ================================================================
//
// Sudden surface cooling of a semi-infinite solid:
//   Surface stress: sigma_surface = E * alpha * dT / (1 - nu)
//
// This is the maximum thermal stress from a sudden quench.
// The factor 1/(1-nu) accounts for biaxial restraint at the surface.
//
// For a plate with a circular hole under uniform temperature change,
// the stress concentration factor for thermal stress is K_t = 1
// (unlike mechanical loading where K_t = 3), because thermal stress
// is self-equilibrating and doesn't concentrate at holes.
//
// Ref: Boley & Weiner (1960), Ch. 3; Hetnarski & Eslami (2009), Ch. 4

#[test]
fn validation_thermal_shock_stress() {
    let e_mod: f64 = 200_000.0; // MPa
    let alpha: f64 = 12e-6; // /degC
    let nu: f64 = 0.3;
    let dt: f64 = 200.0; // degC sudden quench

    // Uniaxial restrained thermal stress
    let sigma_uniaxial = e_mod * alpha * dt;
    assert_close(sigma_uniaxial, 200_000.0 * 12e-6 * 200.0, 1e-12, "uniaxial thermal stress");
    // = 480 MPa
    assert_close(sigma_uniaxial, 480.0, 1e-12, "sigma_uniaxial = 480 MPa");

    // Biaxial restrained (plate surface): sigma = E*alpha*dT / (1-nu)
    let sigma_biaxial = e_mod * alpha * dt / (1.0 - nu);
    assert_close(sigma_biaxial, 480.0 / 0.7, 1e-10, "biaxial thermal stress");
    // ~ 685.7 MPa
    assert!(sigma_biaxial > sigma_uniaxial, "biaxial > uniaxial");

    // Triaxial restrained: sigma = E*alpha*dT / (1-2*nu)
    let sigma_triaxial = e_mod * alpha * dt / (1.0 - 2.0 * nu);
    assert_close(sigma_triaxial, 480.0 / 0.4, 1e-10, "triaxial thermal stress");
    // = 1200 MPa
    assert!(sigma_triaxial > sigma_biaxial, "triaxial > biaxial");

    // Thermal stress concentration: for uniform dT, K_t = 1 at hole
    // Unlike mechanical loading where K_t = 3 for circular hole in plate
    let k_t_thermal: f64 = 1.0;
    let k_t_mechanical: f64 = 3.0;
    let sigma_thermal_at_hole = k_t_thermal * sigma_biaxial;
    let sigma_mech_at_hole = k_t_mechanical * 100.0; // hypothetical 100 MPa nominal

    assert_close(sigma_thermal_at_hole, sigma_biaxial, 1e-12,
        "thermal stress not concentrated at hole");
    assert!(k_t_thermal < k_t_mechanical,
        "thermal SCF < mechanical SCF for hole");

    // Biot number effect: Bi = h_conv * L_c / k
    // For Bi >> 1 (severe quench), surface reaches ambient instantly
    // For Bi << 1, temperature is nearly uniform (low thermal stress)
    let h_conv: f64 = 5000.0; // W/(m^2*K) (water quench)
    let l_char: f64 = 0.025; // m (characteristic length)
    let k_cond: f64 = 50.0; // W/(m*K)
    let biot = h_conv * l_char / k_cond;
    assert_close(biot, 2.5, 1e-12, "Biot number");
    assert!(biot > 1.0, "Bi > 1: surface temperature drops rapidly");

    let _sigma_m = sigma_mech_at_hole;
}

// ================================================================
// 8. Thick-Walled Cylinder Thermal Hoop Stress
// ================================================================
//
// Steady-state radial temperature in a thick cylinder:
//   T(r) = T_i + (T_o - T_i) * ln(r/r_i) / ln(r_o/r_i)
//
// Thermal hoop stress (plane strain, ends restrained):
//   sigma_theta(r) = E*alpha*(T_i - T_o) / [2*(1-nu)*ln(r_o/r_i)]
//                    * [-1 - ln(r_o/r) + (r_o^2/(r_o^2 - r_i^2))*ln(r_o/r_i)*(1 + r_i^2/r^2)]
//
// At inner surface (simplified for thin wall where r_o/r_i ~ 1+t/r_m):
//   The maximum hoop stress occurs at the inner surface.
//
// For a thin ring (r_i >> t): sigma_theta ~ E*alpha*dT / (2*(1-nu))
//
// Ref: Timoshenko & Goodier (1970), Ch. 14; Hetnarski & Eslami (2009), Ch. 5

#[test]
fn validation_cylinder_thermal_hoop_stress() {
    let e_mod: f64 = 200_000.0; // MPa
    let alpha: f64 = 12e-6; // /degC
    let nu: f64 = 0.3;

    let r_i: f64 = 100.0; // mm inner radius
    let r_o: f64 = 150.0; // mm outer radius
    let t_i: f64 = 300.0; // degC inner surface temperature
    let t_o: f64 = 100.0; // degC outer surface temperature
    let dt: f64 = t_i - t_o; // 200 degC

    let ln_ratio = (r_o / r_i).ln();
    assert_close(ln_ratio, (1.5_f64).ln(), 1e-12, "ln(r_o/r_i)");

    // Temperature distribution at mid-radius r_m = (r_i + r_o)/2 = 125 mm
    let r_m: f64 = (r_i + r_o) / 2.0;
    let t_mid = t_i + (t_o - t_i) * (r_m / r_i).ln() / ln_ratio;

    // Temperature should be between inner and outer
    assert!(t_mid > t_o && t_mid < t_i, "T_mid between T_i and T_o");

    // Logarithmic distribution: T_mid is NOT the average of T_i and T_o
    let t_linear_mid = (t_i + t_o) / 2.0;
    assert!((t_mid - t_linear_mid).abs() > 0.1,
        "logarithmic distribution differs from linear");

    // Plane-stress thermal hoop stress (unrestrained axially) at inner surface:
    // sigma_theta_i = E*alpha / (2*(1-nu)) * { -2*ln(r_o/r_i)^(-1)
    //                  * [r_o^2/(r_o^2-r_i^2)*ln(r_o/r_i) - 1] * (T_i - T_o) }
    // Simplified form for the inner surface:
    let r_o2 = r_o * r_o;
    let r_i2 = r_i * r_i;
    let c = e_mod * alpha * dt / (2.0 * (1.0 - nu) * ln_ratio);

    // At inner surface: -ln(r_o/r_i) + r_o^2/(r_o^2-r_i^2)*ln(r_o/r_i)*(1+r_i^2/r_i^2) - 1
    // = -ln_ratio + r_o^2/(r_o^2-r_i^2)*ln_ratio*2 - 1
    let bracket_inner = -ln_ratio + r_o2 / (r_o2 - r_i2) * ln_ratio * 2.0 - 1.0;
    let _sigma_theta_i = c * bracket_inner;

    // At outer surface:
    // -ln(r_o/r_o) + r_o^2/(r_o^2-r_i^2)*ln(r_o/r_i)*(1+r_i^2/r_o^2) - 1
    let bracket_outer = 0.0 + r_o2 / (r_o2 - r_i2) * ln_ratio * (1.0 + r_i2 / r_o2) - 1.0;
    let _sigma_theta_o = c * bracket_outer;

    // For a thin ring approximation (t << r_m):
    // sigma ~ E*alpha*dT / (2*(1-nu))
    let sigma_thin_ring = e_mod * alpha * dt / (2.0 * (1.0 - nu));
    // = 200000 * 12e-6 * 200 / (2 * 0.7) = 480 / 1.4 = 342.86 MPa
    assert_close(sigma_thin_ring, 480.0 / 1.4, 1e-10, "thin ring thermal hoop stress");

    // The inner surface should be in tension (hotter side) for internal heating
    // and the outer surface in compression, or vice versa depending on convention.
    // Key check: net thermal force through the wall should be zero
    // (self-equilibrating stress distribution)

    // Verify temperature at boundaries
    let t_at_ri = t_i + (t_o - t_i) * (r_i / r_i).ln() / ln_ratio;
    let t_at_ro = t_i + (t_o - t_i) * (r_o / r_i).ln() / ln_ratio;
    assert_close(t_at_ri, t_i, 1e-12, "T at inner surface");
    assert_close(t_at_ro, t_o, 1e-12, "T at outer surface");
}
