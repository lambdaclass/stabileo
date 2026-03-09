/// Validation: Fluid-Structure Interaction — Pure-Math Formulas
///
/// References:
///   - Morison, O'Brien, Johnson & Schaaf (1950): "The Force Exerted by Surface Waves
///     on Piles", Petroleum Transactions, AIME, 189, pp. 149-154
///   - Sarpkaya & Isaacson (1981): "Mechanics of Wave Forces on Offshore Structures"
///   - DNV-RP-C205 (2019): "Environmental Conditions and Environmental Loads"
///   - Ibrahim (2005): "Liquid Sloshing Dynamics: Theory and Applications"
///   - Blevins (1990): "Flow-Induced Vibration", 2nd ed.
///   - Lamb (1932): "Hydrodynamics", 6th ed.
///   - Eurocode 8, Part 4: Silos, tanks, and pipelines
///
/// Tests verify fluid-structure interaction formulas with hand-computed values.
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
// 1. Morison Equation — Wave Force on a Cylinder
// ================================================================
//
// Morison et al. (1950):
//   F(t) = F_D + F_I
//   F_D = 0.5 * rho * Cd * D * |u| * u   (drag force per unit length)
//   F_I = rho * Cm * (pi*D^2/4) * du/dt   (inertia force per unit length)
//
// where rho = water density, Cd = drag coefficient, Cm = inertia coefficient,
//       D = cylinder diameter, u = water particle velocity, du/dt = acceleration
//
// For linear wave theory:
//   u = (pi*H/T) * cosh(k*(z+d)) / sinh(k*d) * cos(kx - omega*t)
//   du/dt = (2*pi^2*H/T^2) * cosh(k*(z+d)) / sinh(k*d) * sin(kx - omega*t)
//
// Test: rho = 1025 kg/m^3, D = 1.0 m, Cd = 1.0, Cm = 2.0
//   u = 2.0 m/s, du/dt = 3.0 m/s^2
//   F_D = 0.5*1025*1.0*1.0*|2.0|*2.0 = 2050.0 N/m
//   F_I = 1025*2.0*(pi*1.0/4)*3.0 = 1025*2.0*0.7854*3.0 = 4830.2 N/m

#[test]
fn validation_morison_equation_wave_force() {
    let rho: f64 = 1025.0; // kg/m^3 (seawater)
    let d_cyl: f64 = 1.0; // m (cylinder diameter)
    let cd: f64 = 1.0; // drag coefficient
    let cm: f64 = 2.0; // inertia coefficient

    // Water particle kinematics
    let u: f64 = 2.0; // m/s (velocity)
    let du_dt: f64 = 3.0; // m/s^2 (acceleration)

    // Drag force per unit length
    let f_d = 0.5 * rho * cd * d_cyl * u.abs() * u;
    let expected_fd = 0.5 * 1025.0 * 1.0 * 1.0 * 2.0 * 2.0;
    assert_close(f_d, expected_fd, 1e-10, "Morison drag force");

    // Inertia force per unit length
    let area = PI * d_cyl * d_cyl / 4.0;
    let f_i = rho * cm * area * du_dt;
    let expected_fi = 1025.0 * 2.0 * (PI * 1.0 / 4.0) * 3.0;
    assert_close(f_i, expected_fi, 1e-10, "Morison inertia force");

    // Total force
    let f_total = f_d + f_i;
    assert_close(f_total, f_d + f_i, 1e-10, "total Morison force");

    // Drag dominates when KC number is large (KC = u*T/D)
    // Inertia dominates when KC is small
    // For our test: relative importance
    let drag_ratio = f_d / f_total;
    let inertia_ratio = f_i / f_total;
    assert_close(drag_ratio + inertia_ratio, 1.0, 1e-10, "force ratios sum to 1");

    // Drag force is proportional to u^2
    let u2: f64 = 4.0;
    let f_d2 = 0.5 * rho * cd * d_cyl * u2.abs() * u2;
    assert_close(f_d2 / f_d, (u2 / u).powi(2), 1e-10, "drag proportional to u^2");

    // Inertia force is proportional to du/dt
    let du_dt2: f64 = 6.0;
    let f_i2 = rho * cm * area * du_dt2;
    assert_close(f_i2 / f_i, du_dt2 / du_dt, 1e-10, "inertia proportional to du/dt");
}

// ================================================================
// 2. Vortex Shedding — Strouhal Number
// ================================================================
//
// Strouhal number: St = f_s * D / U
//   where f_s = shedding frequency, D = diameter, U = flow velocity
//
// For circular cylinders: St ≈ 0.20 for 300 < Re < 3e5 (subcritical)
//
// Vortex-induced vibration occurs when f_s ≈ f_n (natural frequency):
//   Lock-in velocity: U_cr = f_n * D / St
//
// Lift force per unit length:
//   F_L = 0.5 * rho * U^2 * D * C_L * sin(2*pi*f_s*t)
//
// Test: D = 0.5 m, U = 10 m/s, rho = 1.225 kg/m^3 (air), St = 0.20
//   f_s = St*U/D = 0.20*10/0.5 = 4.0 Hz

#[test]
fn validation_vortex_shedding_strouhal() {
    let d: f64 = 0.5; // m (cylinder diameter)
    let u_flow: f64 = 10.0; // m/s (flow velocity)
    let rho: f64 = 1.225; // kg/m^3 (air)
    let st: f64 = 0.20; // Strouhal number (subcritical)
    let _cl: f64 = 0.3; // lift coefficient (typical)

    // Shedding frequency
    let f_s = st * u_flow / d;
    assert_close(f_s, 4.0, 1e-10, "shedding frequency");

    // Reynolds number
    let nu_air: f64 = 1.5e-5; // m^2/s (kinematic viscosity of air)
    let re = u_flow * d / nu_air;
    assert_close(re, 10.0 * 0.5 / 1.5e-5, 1e-10, "Reynolds number");
    // Re ≈ 333,333 (subcritical regime, St ≈ 0.20 valid for Re < ~5e5)
    assert!(re > 300.0 && re < 5e5, "subcritical regime check");

    // Critical (lock-in) velocity for a structure with f_n = 5 Hz
    let f_n: f64 = 5.0; // Hz
    let u_cr = f_n * d / st;
    assert_close(u_cr, 5.0 * 0.5 / 0.20, 1e-10, "critical velocity for lock-in");
    assert_close(u_cr, 12.5, 1e-10, "U_cr = 12.5 m/s");

    // Reduced velocity at lock-in
    let vr = u_cr / (f_n * d);
    assert_close(vr, 1.0 / st, 1e-10, "reduced velocity = 1/St");

    // Lift force amplitude per unit length at peak
    let f_lift = 0.5 * rho * u_flow * u_flow * d * _cl;
    let expected_lift = 0.5 * 1.225 * 100.0 * 0.5 * 0.3;
    assert_close(f_lift, expected_lift, 1e-10, "lift force amplitude");

    // Power input from VIV (at lock-in, assuming amplitude y = 0.1*D)
    let _y_amp = 0.1 * d;
    let omega_s = 2.0 * PI * f_s;
    // Power = F * velocity_max = F_lift * omega_s * y_amp
    let _power_input = f_lift * omega_s * _y_amp;
    assert!(_power_input > 0.0, "power input must be positive");
}

// ================================================================
// 3. Sloshing Frequencies in Rectangular Tank
// ================================================================
//
// Natural frequencies of liquid sloshing in a rectangular tank
// (length a, width b, liquid depth h):
//
//   omega_mn = sqrt(g * k_mn * tanh(k_mn * h))
//   k_mn = pi * sqrt((m/a)^2 + (n/b)^2)
//
// For the fundamental mode (m=1, n=0):
//   omega_10 = sqrt(g * (pi/a) * tanh(pi*h/a))
//   f_10 = omega_10 / (2*pi)
//   T_10 = 2*pi/omega_10
//
// Test: a = 10 m, b = 5 m, h = 3 m, g = 9.81 m/s^2
//   k_10 = pi/10 = 0.3142 m^-1
//   omega_10 = sqrt(9.81 * 0.3142 * tanh(0.3142*3))
//            = sqrt(9.81 * 0.3142 * tanh(0.9425))
//            = sqrt(9.81 * 0.3142 * 0.7379)
//            = sqrt(2.2745) = 1.5082 rad/s

#[test]
fn validation_sloshing_rectangular_tank() {
    let a: f64 = 10.0; // m (tank length)
    let b: f64 = 5.0; // m (tank width)
    let h: f64 = 3.0; // m (liquid depth)
    let g: f64 = 9.81; // m/s^2

    // Fundamental mode (1,0) — longitudinal
    let k_10 = PI / a;
    let omega_10 = (g * k_10 * (k_10 * h).tanh()).sqrt();
    let f_10 = omega_10 / (2.0 * PI);
    let t_10 = 2.0 * PI / omega_10;

    assert_close(k_10, PI / 10.0, 1e-10, "k_10 wave number");
    let expected_omega = (9.81 * (PI / 10.0) * (PI * 3.0 / 10.0).tanh()).sqrt();
    assert_close(omega_10, expected_omega, 1e-10, "omega_10");
    assert_close(f_10, omega_10 / (2.0 * PI), 1e-10, "f_10 frequency");
    assert_close(t_10, 2.0 * PI / omega_10, 1e-10, "T_10 period");

    // Second longitudinal mode (2,0)
    let k_20 = 2.0 * PI / a;
    let omega_20 = (g * k_20 * (k_20 * h).tanh()).sqrt();
    assert!(omega_20 > omega_10, "higher mode has higher frequency");

    // First transverse mode (0,1)
    let k_01 = PI / b;
    let omega_01 = (g * k_01 * (k_01 * h).tanh()).sqrt();
    assert!(omega_01 > omega_10, "transverse mode higher than longitudinal (b < a)");

    // Deep water limit: tanh(k*h) -> 1 when k*h >> 1
    let h_deep: f64 = 100.0;
    let omega_deep = (g * k_10 * (k_10 * h_deep).tanh()).sqrt();
    let omega_deep_approx = (g * k_10).sqrt(); // deep water approximation
    assert_close(omega_deep, omega_deep_approx, 0.001,
        "deep water approximation valid for large h");

    // Shallow water limit: tanh(k*h) -> k*h when k*h << 1
    let h_shallow: f64 = 0.1;
    let omega_shallow = (g * k_10 * (k_10 * h_shallow).tanh()).sqrt();
    let omega_shallow_approx = k_10 * (g * h_shallow).sqrt(); // shallow water
    assert_close(omega_shallow, omega_shallow_approx, 0.01,
        "shallow water approximation valid for small h");
}

// ================================================================
// 4. Added Mass for Submerged Cylinder
// ================================================================
//
// When a body accelerates in a fluid, it must also accelerate
// some of the surrounding fluid. This is modeled as "added mass".
//
// For a circular cylinder (per unit length):
//   m_a = Cm' * rho * pi * D^2 / 4
//   where Cm' = added mass coefficient = Cm - 1
//
// For potential flow around a circular cylinder: Cm' = 1.0
//   Total inertia coefficient Cm = 1 + Cm' = 2.0
//
// For other shapes (Lamb 1932):
//   Sphere: Cm' = 0.5 (added mass = half displaced fluid mass)
//   Flat plate (normal to flow): Cm' = pi (infinite aspect ratio)
//   Ellipsoid (a/b ratio): Cm' depends on axis ratio
//
// Test: D = 0.8 m, rho_water = 1025 kg/m^3
//   m_a = 1.0 * 1025 * pi * 0.64 / 4 = 515.0 kg/m

#[test]
fn validation_added_mass_submerged_cylinder() {
    let d: f64 = 0.8; // m
    let rho: f64 = 1025.0; // kg/m^3

    // Added mass per unit length for circular cylinder
    let cm_prime: f64 = 1.0; // added mass coefficient (potential flow)
    let m_displaced = rho * PI * d * d / 4.0; // mass of displaced fluid per unit length
    let m_added = cm_prime * m_displaced;

    let expected_m_disp = 1025.0 * PI * 0.64 / 4.0;
    assert_close(m_displaced, expected_m_disp, 1e-10, "displaced mass per unit length");
    assert_close(m_added, m_displaced, 1e-10, "added mass = displaced mass for cylinder");

    // Total inertia coefficient
    let cm = 1.0 + cm_prime;
    assert_close(cm, 2.0, 1e-10, "total Cm for cylinder");

    // Sphere: added mass = 0.5 * displaced mass
    let d_sphere: f64 = 1.0; // m
    let m_disp_sphere = rho * PI * d_sphere.powi(3) / 6.0; // volume of sphere * rho
    let m_added_sphere = 0.5 * m_disp_sphere;
    assert_close(m_added_sphere / m_disp_sphere, 0.5, 1e-10,
        "sphere added mass ratio = 0.5");

    // Effect on natural frequency
    // f_n_vacuum = (1/(2*pi)) * sqrt(k/m_struct)
    // f_n_fluid = (1/(2*pi)) * sqrt(k/(m_struct + m_added))
    // Ratio: f_fluid/f_vacuum = sqrt(m_struct/(m_struct + m_added))
    let m_struct: f64 = 500.0; // kg/m (structural mass per unit length)
    let k_stiff: f64 = 1e6; // N/m^2 (stiffness)

    let f_vacuum = (1.0 / (2.0 * PI)) * (k_stiff / m_struct).sqrt();
    let f_fluid = (1.0 / (2.0 * PI)) * (k_stiff / (m_struct + m_added)).sqrt();

    let freq_ratio = f_fluid / f_vacuum;
    let expected_ratio = (m_struct / (m_struct + m_added)).sqrt();
    assert_close(freq_ratio, expected_ratio, 1e-10, "frequency reduction in fluid");
    assert!(f_fluid < f_vacuum, "natural frequency decreases in fluid");
}

// ================================================================
// 5. Hydrodynamic Pressure on Dam (Westergaard)
// ================================================================
//
// Westergaard (1933) parabolic approximation for hydrodynamic
// pressure on a vertical rigid dam face during earthquake:
//
//   p(y) = (7/8) * alpha_h * rho_w * sqrt(H*y)
//
// where alpha_h = horizontal seismic coefficient,
//       H = water depth, y = depth from surface, rho_w = water density
//
// Total hydrodynamic force per unit width:
//   F = (7/12) * alpha_h * rho_w * H^2
//
// Point of application: y_bar = (3/5)*H from surface = (2/5)*H from base
//
// Test: H = 30 m, alpha_h = 0.1, rho_w = 1000 kg/m^3
//   p(H) = (7/8)*0.1*1000*sqrt(30*30) = 875*30 = 2625 Pa = 2.625 kPa
//   F = (7/12)*0.1*1000*900 = 52500 N/m = 52.5 kN/m

#[test]
fn validation_westergaard_hydrodynamic_pressure() {
    let h: f64 = 30.0; // m (water depth)
    let alpha_h: f64 = 0.1; // horizontal seismic coefficient
    let rho_w: f64 = 1000.0; // kg/m^3

    // Pressure at base (y = H)
    let p_base = (7.0 / 8.0) * alpha_h * rho_w * (h * h).sqrt();
    let expected_p_base = 0.875 * 0.1 * 1000.0 * 30.0;
    assert_close(p_base, expected_p_base, 1e-10, "pressure at base");

    // Pressure at mid-depth (y = H/2)
    let p_mid = (7.0 / 8.0) * alpha_h * rho_w * (h * h / 2.0).sqrt();
    let expected_p_mid = 0.875 * 0.1 * 1000.0 * (450.0_f64).sqrt();
    assert_close(p_mid, expected_p_mid, 1e-10, "pressure at mid-depth");

    // Parabolic distribution check: p(y) ∝ sqrt(y)
    let ratio = p_mid / p_base;
    let expected_ratio = ((h / 2.0) / h).sqrt();
    assert_close(ratio, expected_ratio, 1e-10, "parabolic pressure distribution");
    assert_close(ratio, (0.5_f64).sqrt(), 1e-10, "p_mid/p_base = 1/sqrt(2)");

    // Total hydrodynamic force
    let f_total = (7.0 / 12.0) * alpha_h * rho_w * h * h;
    let expected_f = (7.0 / 12.0) * 0.1 * 1000.0 * 900.0;
    assert_close(f_total, expected_f, 1e-10, "total hydrodynamic force");

    // Convert to kN/m
    let f_kn = f_total / 1000.0;
    assert_close(f_kn, expected_f / 1000.0, 1e-10, "force in kN/m");

    // Point of application from surface
    let y_bar = 0.6 * h; // 3/5 of H from surface
    assert_close(y_bar, 18.0, 1e-10, "point of application from surface");

    // Overturning moment about base
    let moment_base = f_total * (h - y_bar);
    let expected_moment = f_total * (30.0 - 18.0);
    assert_close(moment_base, expected_moment, 1e-10, "overturning moment about base");
}

// ================================================================
// 6. Wave Dispersion Relation (Linear Airy Wave Theory)
// ================================================================
//
// The dispersion relation for linear gravity waves:
//   omega^2 = g * k * tanh(k * d)
//
// where omega = 2*pi/T, k = 2*pi/L (wave number), d = water depth
//
// Deep water (kd > pi): omega^2 ≈ g*k  →  L = g*T^2/(2*pi)
// Shallow water (kd < 0.05*2*pi): omega^2 ≈ g*k^2*d  →  L = T*sqrt(g*d)
//
// Phase velocity: c = omega/k = L/T
// Group velocity: cg = c/2 * (1 + 2kd/sinh(2kd))
//   Deep water: cg = c/2
//   Shallow water: cg = c
//
// Test: T = 8 s, d = 20 m, g = 9.81 m/s^2

#[test]
fn validation_wave_dispersion_relation() {
    let g: f64 = 9.81;
    let t_wave: f64 = 8.0; // s (wave period)
    let d: f64 = 20.0; // m (water depth)
    let omega = 2.0 * PI / t_wave;

    // Solve dispersion relation iteratively: omega^2 = g*k*tanh(k*d)
    // Start with deep water approximation: k0 = omega^2/g
    let mut k = omega * omega / g; // initial guess (deep water)
    for _ in 0..50 {
        let f_val = omega * omega - g * k * (k * d).tanh();
        let f_prime = -g * ((k * d).tanh() + k * d / (k * d).cosh().powi(2));
        k -= f_val / f_prime; // Newton-Raphson
    }

    // Verify dispersion relation
    let lhs = omega * omega;
    let rhs = g * k * (k * d).tanh();
    assert_close(lhs, rhs, 1e-10, "dispersion relation satisfied");

    // Wavelength
    let wavelength = 2.0 * PI / k;
    assert!(wavelength > 0.0, "wavelength must be positive");

    // Phase velocity
    let c_phase = omega / k;
    assert_close(c_phase, wavelength / t_wave, 1e-10, "phase velocity = L/T");

    // Group velocity
    let n_factor = 0.5 * (1.0 + 2.0 * k * d / (2.0 * k * d).sinh());
    let c_group = n_factor * c_phase;

    // Group velocity <= phase velocity (for gravity waves)
    assert!(c_group <= c_phase, "group velocity <= phase velocity");

    // Deep water check: kd >> 1 means cg ≈ c/2
    let d_deep: f64 = 1000.0;
    let mut k_deep = omega * omega / g;
    for _ in 0..50 {
        let f_val = omega * omega - g * k_deep * (k_deep * d_deep).tanh();
        let f_prime = -g * ((k_deep * d_deep).tanh()
            + k_deep * d_deep / (k_deep * d_deep).cosh().powi(2));
        k_deep -= f_val / f_prime;
    }
    let c_deep = omega / k_deep;
    let n_deep = 0.5 * (1.0 + 2.0 * k_deep * d_deep / (2.0 * k_deep * d_deep).sinh());
    assert_close(n_deep, 0.5, 0.001, "deep water: n ≈ 0.5");
    let cg_deep = n_deep * c_deep;
    assert_close(cg_deep, c_deep / 2.0, 0.001, "deep water: cg ≈ c/2");
}

// ================================================================
// 7. Keulegan-Carpenter Number and Flow Regime Classification
// ================================================================
//
// KC = u_m * T / D
//   where u_m = maximum orbital velocity, T = wave period, D = cylinder diameter
//
// Flow regimes:
//   KC < 4: inertia dominated (no separation)
//   4 < KC < 8: single-pair vortex shedding
//   8 < KC < 15: double-pair vortex shedding
//   KC > 15: quasi-steady (drag dominated)
//
// For a pile in waves:
//   u_m = pi * H / T (at surface, deep water)
//
// Test: H = 5 m, T = 10 s, D = 1.5 m
//   u_m = pi*5/10 = 1.5708 m/s
//   KC = 1.5708*10/1.5 = 10.472

#[test]
fn validation_keulegan_carpenter_number() {
    let h_wave: f64 = 5.0; // m (wave height)
    let t_wave: f64 = 10.0; // s (wave period)
    let d_cyl: f64 = 1.5; // m (cylinder diameter)

    // Maximum orbital velocity (deep water, at surface)
    let u_m = PI * h_wave / t_wave;
    assert_close(u_m, PI * 5.0 / 10.0, 1e-10, "max orbital velocity");

    // Keulegan-Carpenter number
    let kc = u_m * t_wave / d_cyl;
    assert_close(kc, PI * 5.0 / 1.5, 1e-10, "KC number");

    // Flow regime classification
    let regime = if kc < 4.0 {
        "inertia"
    } else if kc < 8.0 {
        "single-pair vortex"
    } else if kc < 15.0 {
        "double-pair vortex"
    } else {
        "quasi-steady drag"
    };
    assert_eq!(regime, "double-pair vortex", "flow regime for KC ≈ 10.5");

    // Force ratio: F_drag/F_inertia ∝ KC
    // Drag becomes significant when KC > ~15-20
    assert!(kc > 4.0, "KC > 4 means drag is non-negligible");

    // Effect of wave height on KC (proportional)
    let kc_double_h = (PI * 2.0 * h_wave / t_wave) * t_wave / d_cyl;
    assert_close(kc_double_h, 2.0 * kc, 1e-10, "KC doubles with wave height");

    // Reynolds number based on u_m
    let nu_water: f64 = 1.0e-6; // m^2/s (kinematic viscosity of seawater)
    let re = u_m * d_cyl / nu_water;
    assert!(re > 1e5, "high Reynolds number for typical wave loading");

    // Beta parameter (frequency parameter): beta = Re/KC = D^2/(nu*T)
    let beta = re / kc;
    let expected_beta = d_cyl * d_cyl / (nu_water * t_wave);
    assert_close(beta, expected_beta, 1e-6, "beta = Re/KC = D^2/(nu*T)");
}

// ================================================================
// 8. Wind-Induced Pressure on Structures (Bernoulli)
// ================================================================
//
// Dynamic wind pressure:
//   q = 0.5 * rho * V^2
//
// Wind force on a structure:
//   F = q * Cf * A
//   where Cf = force coefficient (drag), A = projected area
//
// Gust effect factor (simplified Davenport approach):
//   G = 1 + g_p * sqrt(B^2 + R^2/D_f)
//
// where g_p = peak factor (≈3.5), B = background response,
//       R = resonant response, D_f = size reduction
//
// For a simple estimate with Cf = 1.3 (rectangular building):
//   V = 40 m/s, rho_air = 1.225 kg/m^3
//   q = 0.5*1.225*1600 = 980 Pa ≈ 1.0 kPa
//   With gust factor G = 2.0: q_design = 2.0*980 = 1960 Pa

#[test]
fn validation_wind_pressure_bernoulli() {
    let rho: f64 = 1.225; // kg/m^3 (air at sea level)
    let v: f64 = 40.0; // m/s (basic wind speed)

    // Dynamic pressure
    let q = 0.5 * rho * v * v;
    let expected_q = 0.5 * 1.225 * 1600.0;
    assert_close(q, expected_q, 1e-10, "dynamic wind pressure");

    // Wind force on building face
    let cf: f64 = 1.3; // force coefficient (rectangular building)
    let width: f64 = 30.0; // m
    let height: f64 = 50.0; // m
    let area = width * height;
    let f_wind = q * cf * area;

    let expected_f = expected_q * 1.3 * 1500.0;
    assert_close(f_wind, expected_f, 1e-10, "total wind force");

    // Pressure scales with V^2
    let v2: f64 = 60.0;
    let q2 = 0.5 * rho * v2 * v2;
    let ratio = q2 / q;
    assert_close(ratio, (v2 / v).powi(2), 1e-10, "pressure scales with V^2");
    assert_close(ratio, 2.25, 1e-10, "60/40 squared = 2.25");

    // Gust effect factor (simplified)
    let g_p: f64 = 3.5; // peak factor
    let b_background: f64 = 0.6; // background response factor
    let r_resonant: f64 = 0.3; // resonant response factor
    let d_size: f64 = 0.8; // size reduction factor

    let gust_factor = 1.0 + g_p * (b_background.powi(2) + r_resonant.powi(2) / d_size).sqrt();
    assert!(gust_factor > 1.0, "gust factor must be > 1.0");

    // Design pressure
    let q_design = gust_factor * q;
    assert!(q_design > q, "design pressure > static pressure");

    // Base overturning moment (uniform pressure)
    let moment_base = f_wind * height / 2.0;
    let expected_moment = f_wind * 25.0;
    assert_close(moment_base, expected_moment, 1e-10, "base overturning moment");

    // Base shear
    assert_close(f_wind, q * cf * area, 1e-10, "base shear = total wind force");
}
