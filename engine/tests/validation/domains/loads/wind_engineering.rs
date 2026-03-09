/// Validation: Wind Engineering Formulas
///
/// References:
///   - Simiu & Yeo, "Wind Effects on Structures", 4th Ed., Wiley
///   - Holmes, "Wind Loading of Structures", 3rd Ed., CRC Press
///   - Davenport, "Gust Loading Factors", ASCE J. Struct. Div. 1967
///   - Strouhal, "Uber eine besondere Art der Tonerregung", Ann. Phys. 1878
///   - Selberg, "Aerodynamic Effects on Suspension Bridges", 1961
///   - ASCE 7-22, "Minimum Design Loads for Buildings"
///   - Eurocode 1 (EN 1991-1-4), "Wind Actions"
///
/// Tests verify wind engineering formulas without calling the solver.
/// Pure arithmetic verification of analytical expressions.

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
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Basic Wind Pressure q = 0.5 * rho * V^2
// ================================================================
//
// The velocity pressure (dynamic pressure) is:
//   q = 0.5 * rho * V^2
//
// where rho = air density (1.225 kg/m^3 at sea level, 15C)
// and V = wind speed (m/s).
//
// For V = 50 m/s (approx. 180 km/h):
//   q = 0.5 * 1.225 * 50^2 = 1531.25 Pa = 1.531 kPa
//
// Reference: ASCE 7-22, Eq. 26.10-1; Simiu & Yeo, Ch. 2

#[test]
fn validation_basic_wind_pressure() {
    let rho: f64 = 1.225;  // kg/m^3, standard air density
    let v: f64 = 50.0;     // m/s, basic wind speed

    // Velocity pressure
    let q: f64 = 0.5 * rho * v * v;
    assert_close(q, 1531.25, 1e-10, "q = 0.5*rho*V^2");

    // Convert to kPa
    let q_kpa: f64 = q / 1000.0;
    assert_close(q_kpa, 1.53125, 1e-10, "q in kPa");

    // Wind force on a flat plate (Cd = 2.0 for flat plate normal to wind)
    let cd: f64 = 2.0;
    let area: f64 = 10.0;  // m^2
    let f_wind: f64 = cd * q * area;
    assert_close(f_wind, 2.0 * 1531.25 * 10.0, 1e-10, "F = Cd*q*A");

    // Pressure scales with V^2: doubling V quadruples q
    let v2: f64 = 2.0 * v;
    let q2: f64 = 0.5 * rho * v2 * v2;
    assert_close(q2 / q, 4.0, 1e-10, "q(2V)/q(V) = 4");

    // At altitude (lower density): rho = 1.0 kg/m^3
    let rho_alt: f64 = 1.0;
    let q_alt: f64 = 0.5 * rho_alt * v * v;
    assert_close(q_alt / q, rho_alt / rho, 1e-10, "q ratio = density ratio");
}

// ================================================================
// 2. Terrain Roughness Power Law Profile
// ================================================================
//
// The mean wind speed profile over terrain follows the power law:
//   V(z) = V_ref * (z / z_ref)^alpha
//
// where alpha depends on terrain category:
//   Open terrain (category B): alpha ~ 0.16
//   Suburban (category C):     alpha ~ 0.22
//   Urban center (category D): alpha ~ 0.30
//
// Reference: ASCE 7-22, Table 26.11-1; Simiu & Yeo, Ch. 2

#[test]
fn validation_terrain_roughness_power_law() {
    let v_ref: f64 = 40.0;  // m/s at reference height
    let z_ref: f64 = 10.0;  // m, reference height

    // Open terrain: alpha = 0.16
    let alpha_open: f64 = 0.16;
    let z: f64 = 50.0;  // m, height of interest

    let v_open: f64 = v_ref * (z / z_ref).powf(alpha_open);
    let expected_ratio: f64 = 5.0_f64.powf(0.16);
    assert_close(v_open, v_ref * expected_ratio, 1e-10, "V(50m) open terrain");

    // Urban: alpha = 0.30
    let alpha_urban: f64 = 0.30;
    let v_urban: f64 = v_ref * (z / z_ref).powf(alpha_urban);
    let expected_urban: f64 = v_ref * 5.0_f64.powf(0.30);
    assert_close(v_urban, expected_urban, 1e-10, "V(50m) urban terrain");

    // Above z_ref with same V_ref: higher alpha means faster growth
    assert!(v_urban > v_open, "Higher alpha -> faster growth above z_ref");

    // Below reference height: larger alpha means slower speed
    let z_low: f64 = 5.0;
    let v_open_low: f64 = v_ref * (z_low / z_ref).powf(alpha_open);
    let v_urban_low: f64 = v_ref * (z_low / z_ref).powf(alpha_urban);
    assert!(v_urban_low < v_open_low, "Below z_ref: urban slower than open");

    // Pressure profile: q(z) = q_ref * (z/z_ref)^(2*alpha)
    let q_ratio: f64 = (z / z_ref).powf(2.0 * alpha_open);
    let v_ratio: f64 = (z / z_ref).powf(alpha_open);
    assert_close(q_ratio, v_ratio * v_ratio, 1e-10, "q ratio = V ratio squared");
}

// ================================================================
// 3. Along-Wind Response (Gust Factor Approach, Davenport)
// ================================================================
//
// The gust factor G relates peak to mean wind response:
//   G = 1 + 2 * g_p * I_z * sqrt(Q^2 + R^2)
//
// where:
//   g_p = peak factor (typically 3.5-4.0)
//   I_z = turbulence intensity at height z
//   Q^2 = background response factor
//   R^2 = resonant response factor
//
// For a rigid structure (f1 high): R^2 -> 0
// For a flexible structure: R^2 contributes significantly
//
// Reference: Davenport (1967); ASCE 7-22, Sec 26.11

#[test]
fn validation_along_wind_gust_factor() {
    let g_p: f64 = 3.5;          // peak factor
    let i_z: f64 = 0.18;         // turbulence intensity at z (suburban, z=30m)
    let q_sq: f64 = 0.85;        // background factor (typical)
    let r_sq_rigid: f64 = 0.0;   // resonant factor for rigid structure
    let r_sq_flex: f64 = 0.25;   // resonant factor for flexible structure

    // Gust factor for rigid structure
    let g_rigid: f64 = 1.0 + 2.0 * g_p * i_z * (q_sq + r_sq_rigid).sqrt();
    let expected_rigid: f64 = 1.0 + 2.0 * 3.5 * 0.18 * (0.85_f64).sqrt();
    assert_close(g_rigid, expected_rigid, 1e-10, "G rigid = 1 + 2*g_p*I_z*sqrt(Q^2)");

    // Gust factor for flexible structure
    let g_flex: f64 = 1.0 + 2.0 * g_p * i_z * (q_sq + r_sq_flex).sqrt();
    let expected_flex: f64 = 1.0 + 2.0 * 3.5 * 0.18 * (1.10_f64).sqrt();
    assert_close(g_flex, expected_flex, 1e-10, "G flexible = 1 + 2*g_p*I_z*sqrt(Q^2+R^2)");

    // Flexible structure has higher gust factor
    assert!(g_flex > g_rigid, "G_flex > G_rigid");

    // Quasi-static limit: G_qs = 1 + 2*g*I_z (when Q=1, R=0)
    let g_qs: f64 = 1.0 + 2.0 * g_p * i_z;
    assert_close(g_qs, 2.26, 1e-10, "G_qs = 1 + 2*g_p*I_z");

    // Peak wind force = G * mean_force
    let f_mean: f64 = 100.0; // kN, mean wind force
    let f_peak_rigid: f64 = g_rigid * f_mean;
    let f_peak_flex: f64 = g_flex * f_mean;
    assert!(f_peak_flex > f_peak_rigid, "Peak force: flex > rigid");
    assert_close(f_peak_rigid / f_mean, g_rigid, 1e-10, "F_peak/F_mean = G");
}

// ================================================================
// 4. Across-Wind Vortex Shedding (Strouhal Number)
// ================================================================
//
// When wind flows past a bluff body, vortices shed at frequency:
//   f_s = St * V / D
//
// where St is the Strouhal number:
//   Circular cylinder: St ~ 0.20 (Re = 10^3 to 10^5)
//   Square section:    St ~ 0.12
//   Flat plate:        St ~ 0.15
//
// Lock-in occurs when f_s ~ f_n (natural frequency).
//
// Reference: Strouhal (1878); Simiu & Yeo, Ch. 6

#[test]
fn validation_vortex_shedding_strouhal() {
    let st_cyl: f64 = 0.20;   // Strouhal number for cylinder
    let d: f64 = 1.0;         // m, cylinder diameter
    let v: f64 = 30.0;        // m/s, wind speed

    // Shedding frequency
    let f_s: f64 = st_cyl * v / d;
    assert_close(f_s, 6.0, 1e-10, "f_s = St*V/D = 6 Hz");

    // Critical wind speed for lock-in (when f_s = f_n)
    let f_n: f64 = 2.0;      // Hz, natural frequency of structure
    let v_cr: f64 = f_n * d / st_cyl;
    assert_close(v_cr, 10.0, 1e-10, "V_cr = f_n*D/St = 10 m/s");

    // Reduced velocity at lock-in
    let v_red: f64 = v_cr / (f_n * d);
    assert_close(v_red, 1.0 / st_cyl, 1e-10, "V_red = 1/St = 5.0");
    assert_close(v_red, 5.0, 1e-10, "V_red = 5.0");

    // For a square section (St = 0.12): lower shedding frequency
    let st_sq: f64 = 0.12;
    let f_s_sq: f64 = st_sq * v / d;
    assert_close(f_s_sq, 3.6, 1e-10, "f_s square = 3.6 Hz");
    assert!(f_s_sq < f_s, "Square sheds at lower frequency than cylinder");

    // Reynolds number check
    let nu_air: f64 = 1.5e-5;  // m^2/s, kinematic viscosity of air
    let re: f64 = v * d / nu_air;
    assert_close(re, 30.0 / 1.5e-5, 1e-10, "Re = VD/nu");
    assert!(re > 1e3 && re < 1e7, "Re = {:.0} in relevant range for vortex shedding", re);
}

// ================================================================
// 5. Wind Tunnel Pressure Coefficient Distribution
// ================================================================
//
// The pressure coefficient Cp relates surface pressure to dynamic pressure:
//   p - p_inf = Cp * q
//
// For a circular cylinder (potential flow theory):
//   Cp(theta) = 1 - 4 sin^2(theta)
//
// Stagnation point (theta=0): Cp = 1.0
// Top/bottom (theta=90): Cp = -3.0
//
// For rectangular buildings (ASCE 7):
//   Windward wall: Cp = +0.8
//   Leeward wall:  Cp = -0.5
//   Net:           Cp_net = 1.3
//
// Reference: Simiu & Yeo, Ch. 4; ASCE 7-22, Figure 27.3-1

#[test]
fn validation_pressure_coefficient_distribution() {
    // Potential flow around circular cylinder
    let cp_potential = |theta_deg: f64| -> f64 {
        let theta: f64 = theta_deg * PI / 180.0;
        1.0 - 4.0 * theta.sin().powi(2)
    };

    // Stagnation point
    assert_close(cp_potential(0.0), 1.0, 1e-12, "Cp(0) = 1.0 stagnation");

    // Top of cylinder (90 degrees)
    assert_close(cp_potential(90.0), -3.0, 1e-10, "Cp(90) = -3.0");

    // Symmetry: Cp(theta) = Cp(-theta)
    assert_close(cp_potential(30.0), cp_potential(-30.0), 1e-12, "Cp symmetry");

    // Minimum Cp location: at theta = 90 deg
    assert_close(cp_potential(90.0), -3.0, 1e-10, "Min Cp at 90 degrees");

    // Net force coefficient (integrate pressure * cos(theta) around cylinder)
    // For potential flow: Cd = 0 (D'Alembert's paradox)
    let n: i32 = 1000;
    let mut f_x: f64 = 0.0;
    let dtheta: f64 = 2.0 * PI / (n as f64);
    for i in 0..n {
        let theta: f64 = (i as f64 + 0.5) * dtheta;
        let cp: f64 = 1.0 - 4.0 * theta.sin().powi(2);
        f_x += cp * theta.cos() * dtheta;
    }
    assert_close(f_x.abs(), 0.0, 1e-6, "D'Alembert paradox: Cd = 0");

    // Building pressure coefficients (ASCE 7 typical values)
    let cp_windward: f64 = 0.8;
    let cp_leeward: f64 = -0.5;
    let net_cp: f64 = cp_windward - cp_leeward;
    assert_close(net_cp, 1.3, 1e-10, "Net Cp = 0.8 - (-0.5) = 1.3");
}

// ================================================================
// 6. Buffeting Response of Line-Like Structure
// ================================================================
//
// The buffeting response of a slender structure in turbulent wind:
//
// Resonant response variance (narrow-band approximation):
//   sigma_R^2 ~ pi*f_n*S_F(f_n) / (4*zeta*k^2)
//
// Background response:
//   sigma_B^2 ~ S_F_0 * bandwidth / k^2
//
// Total: sigma^2 = sigma_B^2 + sigma_R^2
//
// Reference: Davenport (1962); Holmes, Ch. 12

#[test]
fn validation_buffeting_response() {
    let f_n: f64 = 0.5;     // Hz, natural frequency
    let zeta: f64 = 0.02;   // damping ratio (2%)
    let k: f64 = 5000.0;    // kN/m, generalized stiffness
    let s_f_fn: f64 = 100.0; // kN^2/Hz, force spectral density at f_n

    // Resonant response variance (narrow-band approximation)
    let sigma_r_sq: f64 = PI * f_n * s_f_fn / (4.0 * zeta * k * k);
    let expected_res: f64 = PI * 0.5 * 100.0 / (4.0 * 0.02 * 25e6);
    assert_close(sigma_r_sq, expected_res, 1e-10, "Resonant variance");

    // Background response (quasi-static)
    let s_f_0: f64 = 50.0;        // kN^2/Hz, low-freq spectral density
    let bandwidth: f64 = 0.3;      // Hz, effective bandwidth
    let sigma_b_sq: f64 = s_f_0 * bandwidth / (k * k);
    assert!(sigma_b_sq > 0.0, "Background variance > 0");

    // Total response
    let sigma_total_sq: f64 = sigma_b_sq + sigma_r_sq;
    let sigma_total: f64 = sigma_total_sq.sqrt();
    assert!(sigma_total > 0.0, "Total RMS response > 0");

    // Resonant contribution fraction
    let resonant_fraction: f64 = sigma_r_sq / sigma_total_sq;
    assert!(resonant_fraction > 0.0 && resonant_fraction < 1.0,
        "Resonant fraction = {} between 0 and 1", resonant_fraction);

    // Halving damping doubles resonant variance
    let zeta2: f64 = zeta / 2.0;
    let sigma_r_sq_2: f64 = PI * f_n * s_f_fn / (4.0 * zeta2 * k * k);
    assert_close(sigma_r_sq_2 / sigma_r_sq, 2.0, 1e-10,
        "Half damping -> double resonant variance");

    // Peak response = g_p * sigma_total
    let g_p: f64 = 3.5;
    let x_peak: f64 = g_p * sigma_total;
    assert_close(x_peak, 3.5 * sigma_total, 1e-10, "Peak = g_p * sigma");
}

// ================================================================
// 7. Aeroelastic Flutter Speed (Selberg Formula)
// ================================================================
//
// The Selberg formula gives the critical flutter speed for a flat
// plate (thin airfoil approximation):
//   V_cr = k_s * f_alpha * B * sqrt(mu * r_alpha^2 * (1-(f_h/f_alpha)^2))
//
// where:
//   f_h, f_alpha = vertical and torsional natural frequencies
//   B = deck half-width
//   mu = m / (rho * B^2) = mass ratio
//   r_alpha = radius of gyration / B
//   k_s ~ 3.71 (Selberg coefficient)
//
// Reference: Selberg (1961); Simiu & Yeo, Ch. 14

#[test]
fn validation_selberg_flutter_speed() {
    let f_h: f64 = 0.15;       // Hz, vertical frequency
    let f_alpha: f64 = 0.45;   // Hz, torsional frequency
    let b: f64 = 15.0;         // m, deck half-width
    let m: f64 = 15000.0;      // kg/m, mass per unit length
    let i_alpha: f64 = 800000.0; // kg*m^2/m, mass moment of inertia per unit length
    let rho_air: f64 = 1.225;  // kg/m^3

    // Mass ratio
    let mu: f64 = m / (rho_air * b * b);
    assert_close(mu, 15000.0 / (1.225 * 225.0), 1e-10, "Mass ratio mu");

    // Radius of gyration ratio
    let r_alpha: f64 = (i_alpha / m).sqrt() / b;
    let expected_r: f64 = (800000.0_f64 / 15000.0).sqrt() / 15.0;
    assert_close(r_alpha, expected_r, 1e-10, "r_alpha = sqrt(I/m)/B");

    // Frequency ratio
    let freq_ratio: f64 = f_h / f_alpha;
    assert_close(freq_ratio, 1.0 / 3.0, 1e-10, "f_h/f_alpha = 1/3");

    // Selberg flutter speed
    let k_selberg: f64 = 3.71;
    let factor: f64 = (mu * r_alpha * r_alpha * (1.0 - freq_ratio * freq_ratio)).sqrt();
    let v_cr: f64 = k_selberg * f_alpha * b * factor;

    assert!(v_cr > 0.0, "Flutter speed > 0");

    // Frequency separation effect: closer frequencies reduce V_cr
    let freq_ratio_close: f64 = 0.8;
    let factor_close: f64 = (mu * r_alpha * r_alpha * (1.0 - freq_ratio_close * freq_ratio_close)).sqrt();
    let v_cr_close: f64 = k_selberg * f_alpha * b * factor_close;
    assert!(v_cr > v_cr_close, "Better freq separation -> higher V_cr");

    // When f_h = f_alpha: V_cr = 0 (coupled flutter)
    let factor_coupled: f64 = mu * r_alpha * r_alpha * (1.0 - 1.0);
    assert_close(factor_coupled, 0.0, 1e-12, "Coupled flutter: factor = 0");
}

// ================================================================
// 8. Comfort Criteria (Peak Acceleration)
// ================================================================
//
// Human comfort limits for wind-induced building acceleration:
//   Residential: a_peak < 5-10 milli-g (depending on period)
//   Office:      a_peak < 10-15 milli-g
//
// Peak acceleration from along-wind response:
//   a_peak = g_p * sigma_a
//   sigma_a = (2*pi*f1)^2 * sigma_x
//
// Reference: ISO 10137; ASCE 7-22 Commentary

#[test]
fn validation_comfort_criteria_acceleration() {
    let f1: f64 = 0.2;       // Hz, fundamental frequency (T = 5 s)
    let sigma_x: f64 = 0.05; // m, RMS displacement at top floor
    let g_p: f64 = 3.5;      // peak factor
    let g_accel: f64 = 9.81;  // m/s^2

    // RMS acceleration
    let omega1: f64 = 2.0 * PI * f1;
    let sigma_a: f64 = omega1 * omega1 * sigma_x;
    let expected_sigma_a: f64 = (2.0 * PI * 0.2).powi(2) * 0.05;
    assert_close(sigma_a, expected_sigma_a, 1e-10, "sigma_a = omega1^2 * sigma_x");

    // Peak acceleration
    let a_peak: f64 = g_p * sigma_a;
    assert_close(a_peak, g_p * sigma_a, 1e-10, "a_peak = g_p * sigma_a");

    // Convert to milli-g
    let a_peak_mg: f64 = a_peak / g_accel * 1000.0;
    let expected_mg: f64 = a_peak / 9.81 * 1000.0;
    assert_close(a_peak_mg, expected_mg, 1e-10, "Peak acceleration in milli-g");

    // Consistent milli-g computation
    assert_close(a_peak_mg, g_p * omega1 * omega1 * sigma_x / g_accel * 1000.0,
        1e-10, "Consistent milli-g computation");

    // Period effect: longer period building (lower f1) has less acceleration
    // for the same displacement
    let f1_low: f64 = 0.1;
    let omega_low: f64 = 2.0 * PI * f1_low;
    let a_low: f64 = g_p * omega_low * omega_low * sigma_x;
    assert!(a_low < a_peak, "Lower frequency -> lower acceleration (same displacement)");
    assert_close(a_low / a_peak, (f1_low / f1).powi(2), 1e-10,
        "Acceleration ratio = frequency ratio squared");
}
