/// Validation: Hydrodynamic Loading — Pure-Math Formulas
///
/// References:
///   - Morison, O'Brien, Johnson & Schaaf, "The force exerted by surface waves
///     on piles", Petroleum Transactions AIME (1950)
///   - Sarpkaya & Isaacson, "Mechanics of Wave Forces on Offshore Structures" (1981)
///   - DNV-RP-C205, "Environmental Conditions and Environmental Loads" (2019)
///   - Chakrabarti, "Hydrodynamics of Offshore Structures" (1987)
///   - Faltinsen, "Sea Loads on Ships and Offshore Structures" (1990)
///   - API RP 2A-WSD, "Planning, Designing, and Constructing Fixed Offshore Platforms" (2014)
///
/// Tests verify wave mechanics and hydrodynamic force formulas.
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
// 1. Airy Linear Wave Theory — Dispersion Relation
// ================================================================
//
// The dispersion relation for linear (Airy) waves:
//   omega^2 = g * k * tanh(k * d)
//
// where omega = 2*pi/T, k = 2*pi/L, d = water depth, g = 9.81 m/s^2
//
// Deep water limit (kd >> 1): omega^2 = g*k => L = g*T^2/(2*pi)
// Shallow water limit (kd << 1): c = sqrt(g*d), L = T*sqrt(g*d)
//
// Ref: Dean & Dalrymple, "Water Wave Mechanics for Engineers and Scientists" (1991)

#[test]
fn validation_airy_wave_dispersion_relation() {
    let g: f64 = 9.81; // m/s^2
    let t_period: f64 = 10.0; // seconds
    let omega = 2.0 * PI / t_period;

    // Deep water wavelength: L_0 = g*T^2/(2*pi)
    let l_deep = g * t_period * t_period / (2.0 * PI);
    // = 9.81 * 100 / (2*pi) = 981 / 6.2832 = 156.13 m
    let expected_l = 9.81 * 100.0 / (2.0 * PI);
    assert_close(l_deep, expected_l, 1e-12, "deep water wavelength");

    // Deep water wave number
    let k_deep = 2.0 * PI / l_deep;

    // Verify dispersion: omega^2 = g*k (deep water, tanh(kd) -> 1)
    let omega_sq = omega * omega;
    let gk = g * k_deep;
    assert_close(omega_sq, gk, 1e-10, "deep water dispersion");

    // Phase velocity: c = L/T = g*T/(2*pi)
    let c_deep = l_deep / t_period;
    let c_expected = g * t_period / (2.0 * PI);
    assert_close(c_deep, c_expected, 1e-10, "deep water phase velocity");

    // Group velocity in deep water: c_g = c/2
    let c_g_deep = c_deep / 2.0;
    let expected_cg = g * t_period / (4.0 * PI);
    assert_close(c_g_deep, expected_cg, 1e-10, "deep water group velocity");

    // Shallow water limit: c = sqrt(g*d)
    let d_shallow: f64 = 2.0; // m
    let c_shallow = (g * d_shallow).sqrt();
    let _l_shallow = c_shallow * t_period;
    // c = sqrt(9.81*2) = sqrt(19.62) = 4.429 m/s
    let expected_c_sh = (9.81_f64 * 2.0).sqrt();
    assert_close(c_shallow, expected_c_sh, 1e-10, "shallow water phase velocity");

    // In shallow water, c_g = c (non-dispersive)
    // Ratio c_g/c = 0.5*(1 + 2kd/sinh(2kd))
    // For kd -> 0: sinh(2kd) -> 2kd, so ratio -> 0.5*(1+1) = 1.0
    let kd_small: f64 = 0.01;
    let ratio_cg = 0.5 * (1.0 + 2.0 * kd_small / (2.0 * kd_small).sinh());
    assert_close(ratio_cg, 1.0, 1e-3, "shallow water c_g/c ratio ~ 1");
}

// ================================================================
// 2. Morison Equation — Inline Force on a Cylinder
// ================================================================
//
// Force per unit length on a vertical cylinder:
//   f(t) = f_D + f_I
//   f_D = 0.5 * rho * C_D * D * |u| * u     (drag)
//   f_I = rho * C_M * (pi*D^2/4) * du/dt     (inertia)
//
// where u = water particle velocity, du/dt = acceleration
// C_D ~ 1.0, C_M ~ 2.0 for smooth cylinders
//
// Keulegan-Carpenter number: KC = u_max * T / D
//   KC < 2: inertia dominated
//   KC > 20: drag dominated
//
// Ref: Morison et al. (1950), DNV-RP-C205

#[test]
fn validation_morison_equation_inline_force() {
    let rho: f64 = 1025.0; // kg/m^3 (seawater)
    let c_d: f64 = 1.0;
    let c_m: f64 = 2.0;
    let d_cyl: f64 = 1.5; // m cylinder diameter
    let u_vel: f64 = 2.0; // m/s particle velocity
    let a_acc: f64 = 1.5; // m/s^2 particle acceleration

    // Drag force per unit length
    let f_drag = 0.5 * rho * c_d * d_cyl * u_vel.abs() * u_vel;
    // = 0.5 * 1025 * 1.0 * 1.5 * 2.0 * 2.0 = 0.5 * 1025 * 6.0 = 3075 N/m
    let expected_drag = 0.5 * 1025.0 * 1.0 * 1.5 * 4.0;
    assert_close(f_drag, expected_drag, 1e-10, "Morison drag force");

    // Inertia force per unit length
    let area = PI * d_cyl * d_cyl / 4.0;
    let f_inertia = rho * c_m * area * a_acc;
    let expected_inertia = 1025.0 * 2.0 * PI * 1.5 * 1.5 / 4.0 * 1.5;
    assert_close(f_inertia, expected_inertia, 1e-10, "Morison inertia force");

    // Total force at this instant
    let f_total = f_drag + f_inertia;
    assert_close(f_total, f_drag + f_inertia, 1e-12, "total Morison force");

    // KC number check
    let t_period: f64 = 10.0;
    let kc = u_vel * t_period / d_cyl;
    // = 2.0 * 10 / 1.5 = 13.33
    assert_close(kc, 20.0 / 1.5, 1e-10, "KC number");

    // For a sinusoidal wave: u = u_max*cos(wt), du/dt = -u_max*omega*sin(wt)
    // Max drag occurs at u = u_max (crest), max inertia at du/dt max (zero crossing)
    // They are 90 degrees out of phase.
    // Max total force (for linear wave theory):
    // f_max = sqrt(f_D_max^2 + f_I_max^2) is an APPROXIMATION
    // (exact requires phase consideration)
    let u_max: f64 = 3.0;
    let omega = 2.0 * PI / t_period;
    let a_max = u_max * omega;

    let fd_max = 0.5 * rho * c_d * d_cyl * u_max * u_max;
    let fi_max = rho * c_m * area * a_max;

    // Since drag is proportional to |u|*u (nonlinear), the simple quadrature
    // sum is approximate. But for inertia-dominated (KC small), f_max ≈ fi_max
    assert!(fi_max > 0.0 && fd_max > 0.0, "both force components positive");
}

// ================================================================
// 3. Wave Energy and Power — Linear Wave Theory
// ================================================================
//
// Total energy per unit surface area (averaged over one wavelength):
//   E = (1/8) * rho * g * H^2
//
// Energy flux (wave power per unit crest width):
//   P = E * c_g
//
// Deep water: c_g = g*T/(4*pi)
//   P = rho*g^2*H^2*T / (32*pi)
//
// Ref: Dean & Dalrymple, Chakrabarti Ch.3

#[test]
fn validation_wave_energy_and_power() {
    let rho: f64 = 1025.0;
    let g: f64 = 9.81;
    let h_wave: f64 = 3.0; // m significant wave height
    let t_period: f64 = 8.0; // s

    // Energy density (per unit area)
    let energy = rho * g * h_wave * h_wave / 8.0;
    let expected_e = 1025.0 * 9.81 * 9.0 / 8.0;
    assert_close(energy, expected_e, 1e-10, "wave energy density");

    // Deep water group velocity
    let c_g = g * t_period / (4.0 * PI);
    let expected_cg = 9.81 * 8.0 / (4.0 * PI);
    assert_close(c_g, expected_cg, 1e-10, "group velocity");

    // Wave power
    let power = energy * c_g;
    let power_formula = rho * g * g * h_wave * h_wave * t_period / (32.0 * PI);
    assert_close(power, power_formula, 1e-10, "wave power two formulas agree");

    // Numerical value: P = 1025*9.81^2*9*8/(32*pi)
    let power_num = 1025.0 * 9.81 * 9.81 * 9.0 * 8.0 / (32.0 * PI);
    assert_close(power, power_num, 1e-10, "wave power numerical");

    // Energy doubles when wave height increases by factor sqrt(2)
    let h2 = h_wave * 2.0_f64.sqrt();
    let e2 = rho * g * h2 * h2 / 8.0;
    assert_close(e2 / energy, 2.0, 1e-10, "energy scaling with H^2");

    // Power scales with H^2 * T
    let t2: f64 = 12.0;
    let p2 = rho * g * g * h_wave * h_wave * t2 / (32.0 * PI);
    let ratio = p2 / power;
    assert_close(ratio, t2 / t_period, 1e-10, "power scaling with T");
}

// ================================================================
// 4. Added Mass and Damping — Potential Flow
// ================================================================
//
// For a circular cylinder oscillating in fluid:
//   Added mass per unit length: m_a = C_a * rho * pi * R^2
//   where C_a = C_M - 1 (added mass coefficient)
//   For a circular cylinder in unbounded flow: C_a = 1.0, so C_M = 2.0
//
// For a sphere: C_a = 0.5 (added mass = half displaced fluid mass)
//   m_a = (2/3)*pi*R^3*rho * 0.5
//
// Natural frequency in water vs air:
//   f_water/f_air = sqrt(m_struct / (m_struct + m_added))
//
// Ref: Sarpkaya & Isaacson, Faltinsen Ch.6

#[test]
fn validation_added_mass_potential_flow() {
    let rho: f64 = 1025.0; // kg/m^3
    let r_cyl: f64 = 0.75; // m radius
    let _l_cyl: f64 = 20.0; // m length

    // 2D cylinder added mass per unit length
    let c_a_cyl: f64 = 1.0; // circular cylinder
    let m_a_per_length = c_a_cyl * rho * PI * r_cyl * r_cyl;
    let expected_ma = 1025.0 * PI * 0.5625; // 0.75^2 = 0.5625
    assert_close(m_a_per_length, expected_ma, 1e-10, "cylinder added mass");

    // For C_M = 1 + C_a = 2.0 (Morison inertia coefficient)
    let c_m = 1.0 + c_a_cyl;
    assert_close(c_m, 2.0, 1e-12, "C_M = 1 + C_a");

    // Sphere added mass
    let r_sphere: f64 = 1.0; // m
    let c_a_sphere: f64 = 0.5;
    let vol_sphere = 4.0 / 3.0 * PI * r_sphere.powi(3);
    let m_a_sphere = c_a_sphere * rho * vol_sphere;
    let expected_sphere = 0.5 * 1025.0 * 4.0 / 3.0 * PI;
    assert_close(m_a_sphere, expected_sphere, 1e-10, "sphere added mass");

    // Natural frequency reduction in water
    let m_struct: f64 = 5000.0; // kg/m (structural mass per unit length)
    let m_added = m_a_per_length;
    let freq_ratio = (m_struct / (m_struct + m_added)).sqrt();

    // f_water < f_air always
    assert!(
        freq_ratio < 1.0,
        "frequency in water should be less than in air"
    );
    assert!(freq_ratio > 0.0, "frequency ratio should be positive");

    // For very heavy structure (m_struct >> m_added), ratio -> 1
    let m_heavy: f64 = 1e6;
    let ratio_heavy = (m_heavy / (m_heavy + m_added)).sqrt();
    assert_close(ratio_heavy, 1.0, 1e-3, "heavy structure freq ratio ~ 1");

    // Added mass equals displaced fluid mass for C_a = 1 cylinder
    let m_displaced = rho * PI * r_cyl * r_cyl; // per unit length
    assert_close(
        m_a_per_length,
        m_displaced,
        1e-10,
        "added mass = displaced mass for C_a=1",
    );
}

// ================================================================
// 5. Stokes Second-Order Wave — Nonlinear Correction
// ================================================================
//
// Stokes 2nd order surface elevation:
//   eta = (H/2)*cos(kx-wt) + (k*H^2/16) * (cosh(kd)*(2+cosh(2kd))/sinh^3(kd)) * cos(2(kx-wt))
//
// Key feature: crest height > H/2, trough depth < H/2 (asymmetric)
//   eta_crest = H/2 + correction (> H/2)
//   eta_trough = -H/2 + correction (< H/2 in magnitude)
//
// Ursell number: Ur = H*L^2/(d^3) — determines when nonlinearity matters
//   Ur < 25: linear theory adequate
//   Ur > 25: nonlinear theory needed
//
// Ref: Stokes (1847), Dean & Dalrymple Ch.3

#[test]
fn validation_stokes_second_order_wave() {
    let g: f64 = 9.81;
    let h_wave: f64 = 4.0; // m
    let t_period: f64 = 10.0; // s
    let d: f64 = 20.0; // m water depth

    // Deep water wave number (approximate for this depth)
    let l_deep = g * t_period * t_period / (2.0 * PI);
    let k_deep = 2.0 * PI / l_deep;

    // Check kd to determine depth regime
    let kd = k_deep * d;
    // kd ~ 0.04027 * 20 = 0.805 (intermediate depth)

    // Stokes 2nd order correction amplitude at crest
    // Second harmonic coefficient:
    // B2 = k*H^2/16 * cosh(kd)*(2+cosh(2kd)) / sinh^3(kd)
    let b2_num = k_deep * h_wave * h_wave / 16.0
        * kd.cosh() * (2.0 + (2.0 * kd).cosh())
        / kd.sinh().powi(3);

    // At crest: cos(phase) = 1, cos(2*phase) = 1
    let eta_crest = h_wave / 2.0 + b2_num;
    let eta_trough = -h_wave / 2.0 + b2_num; // cos = -1, cos(2*phase) = 1 still

    // Crest should be higher than H/2
    assert!(
        eta_crest > h_wave / 2.0,
        "Stokes crest ({:.3}) should exceed H/2 ({:.1})",
        eta_crest,
        h_wave / 2.0
    );

    // Trough magnitude should be less than H/2
    assert!(
        eta_trough.abs() < h_wave / 2.0,
        "Stokes trough magnitude ({:.3}) should be less than H/2",
        eta_trough.abs()
    );

    // Crest-to-trough height should still equal H (to 2nd order)
    // Actually: eta_crest - eta_trough = H (the second harmonic adds equally to both)
    // Wait: at trough, cos(phase) = -1, so first harmonic = -H/2
    // cos(2*phase) = cos(2*pi) = 1 (when phase = pi)
    // So eta_trough = -H/2 + B2 (positive correction, making trough shallower)
    // Total height = eta_crest - eta_trough = (H/2 + B2) - (-H/2 + B2) = H
    let total_height = eta_crest - eta_trough;
    assert_close(total_height, h_wave, 1e-10, "Stokes crest-to-trough = H");

    // Ursell number
    let ur = h_wave * l_deep * l_deep / (d * d * d);
    assert!(
        ur > 0.0,
        "Ursell number should be positive, got {}",
        ur
    );

    // In deep water (kd > pi), Stokes correction is small
    let kd_deep: f64 = 4.0; // very deep
    let b2_deep_factor =
        kd_deep.cosh() * (2.0 + (2.0 * kd_deep).cosh()) / kd_deep.sinh().powi(3);
    let kd_shallow: f64 = 0.5;
    let b2_shallow_factor = kd_shallow.cosh()
        * (2.0 + (2.0 * kd_shallow).cosh())
        / kd_shallow.sinh().powi(3);
    assert!(
        b2_deep_factor < b2_shallow_factor,
        "nonlinear correction should be larger in shallow water"
    );
}

// ================================================================
// 6. Froude-Krylov Force — Diffraction Regime
// ================================================================
//
// When the structure diameter D is large relative to wavelength L
// (D/L > 0.2), diffraction effects matter and Morison equation
// is insufficient.
//
// Froude-Krylov force on a vertical cylinder (exact for small D/L):
//   F_FK = -rho * integral(dP/dx * dV)
//
// For a linear wave, the undisturbed dynamic pressure gradient:
//   dP/dx = rho * g * H * k / 2 * cosh(k*(z+d))/cosh(kd) * sin(kx-wt)
//
// Simplified total FK force (deep water, per unit length):
//   f_FK = rho * g * H * k * (pi*D^2/4) / 2 * cosh(k(z+d))/cosh(kd)
//
// The ratio D/L determines the regime:
//   D/L < 0.05: drag dominated (Morison)
//   0.05 < D/L < 0.2: inertia dominated (Morison)
//   D/L > 0.2: diffraction (MacCamy-Fuchs)
//
// Ref: Chakrabarti Ch.4, DNV-RP-C205

#[test]
fn validation_froude_krylov_force() {
    let rho: f64 = 1025.0;
    let g: f64 = 9.81;
    let h_wave: f64 = 2.0; // m
    let t_period: f64 = 8.0;

    // Deep water wavelength
    let l_wave = g * t_period * t_period / (2.0 * PI);
    let k = 2.0 * PI / l_wave;

    // Different cylinder diameters
    let d_small: f64 = 1.0; // m, D/L << 0.2
    let d_large: f64 = 30.0; // m (e.g., gravity base), D/L > 0.2

    let dl_small = d_small / l_wave;
    let dl_large = d_large / l_wave;

    // D/L < 0.2 => Morison applicable
    assert!(
        dl_small < 0.05,
        "small cylinder D/L ({:.4}) should be < 0.05",
        dl_small
    );

    // D/L > 0.2 => diffraction regime
    assert!(
        dl_large > 0.2,
        "large cylinder D/L ({:.4}) should be > 0.2",
        dl_large
    );

    // Froude-Krylov force per unit length at z=0 (surface) in deep water:
    // cosh(k(z+d))/cosh(kd) -> exp(kz) for deep water, = 1 at z=0
    // f_FK_max = rho * g * H * k * pi * D^2 / (4 * 2)  (amplitude per unit length)
    let fk_small = rho * g * h_wave * k * PI * d_small * d_small / 8.0;
    let fk_large = rho * g * h_wave * k * PI * d_large * d_large / 8.0;

    // FK force scales with D^2
    let ratio = fk_large / fk_small;
    assert_close(ratio, (d_large / d_small).powi(2), 1e-10, "FK scales with D^2");

    // Morison inertia force per unit length for comparison:
    // f_I = C_M * rho * pi*D^2/4 * a_max
    // where a_max = H*omega^2/(2) for deep water
    let omega = 2.0 * PI / t_period;
    let a_max = h_wave * omega * omega / 2.0;
    let c_m: f64 = 2.0;
    let f_morison = c_m * rho * PI * d_small * d_small / 4.0 * a_max;

    // FK force (C_a=1 part) should equal Morison inertia (C_M=2) minus
    // the Froude-Krylov part. Actually C_M = 1 + C_a, where the '1'
    // part is FK and 'C_a' is the added mass contribution.
    // FK component = rho * pi*D^2/4 * a (C_FK = 1)
    let f_fk_component = rho * PI * d_small * d_small / 4.0 * a_max;
    let f_added_mass = (c_m - 1.0) * rho * PI * d_small * d_small / 4.0 * a_max;
    assert_close(
        f_morison,
        f_fk_component + f_added_mass,
        1e-10,
        "Morison = FK + added mass",
    );
}

// ================================================================
// 7. Vortex-Induced Vibration — Lock-In Criterion
// ================================================================
//
// Strouhal number: St = f_s * D / U
//   For circular cylinder: St ≈ 0.2 (subcritical Re)
//
// Shedding frequency: f_s = St * U / D
//
// Lock-in occurs when f_s ≈ f_n (natural frequency of structure)
// Critical velocity: U_cr = f_n * D / St
//
// Reduced velocity: V_r = U / (f_n * D)
// Lock-in range: typically 4 < V_r < 8 (St ≈ 0.2 means V_r_lock = 5)
//
// Maximum cross-flow amplitude (empirical):
//   A/D ≈ 1.0 for low mass-damping (Scruton number < 5)
//
// Ref: Sarpkaya (2004), DNV-RP-C205 Sec.9, Blevins (1990)

#[test]
fn validation_vortex_induced_vibration_lockin() {
    let st: f64 = 0.2; // Strouhal number
    let d: f64 = 0.5; // m cylinder diameter
    let f_n: f64 = 2.0; // Hz natural frequency

    // Critical velocity for lock-in
    let u_cr = f_n * d / st;
    // = 2.0 * 0.5 / 0.2 = 5.0 m/s
    assert_close(u_cr, 5.0, 1e-10, "critical velocity for lock-in");

    // Shedding frequency at U = U_cr
    let f_s = st * u_cr / d;
    assert_close(f_s, f_n, 1e-10, "shedding freq = natural freq at U_cr");

    // Reduced velocity at lock-in
    let vr = u_cr / (f_n * d);
    // = 5.0 / (2.0*0.5) = 5.0
    assert_close(vr, 1.0 / st, 1e-10, "V_r at lock-in = 1/St");
    assert_close(vr, 5.0, 1e-10, "V_r = 5 for St=0.2");

    // Lock-in range: 4 < V_r < 8
    assert!(vr > 4.0 && vr < 8.0, "V_r should be in lock-in range");

    // Scruton number: Sc = 4*pi*m*zeta/(rho*D^2)
    let m_per_length: f64 = 200.0; // kg/m
    let zeta: f64 = 0.01; // damping ratio (1%)
    let rho: f64 = 1025.0;
    let sc = 4.0 * PI * m_per_length * zeta / (rho * d * d);
    // = 4*pi*200*0.01 / (1025*0.25) = 25.133 / 256.25 = 0.0981
    let expected_sc = 4.0 * PI * 200.0 * 0.01 / (1025.0 * 0.25);
    assert_close(sc, expected_sc, 1e-10, "Scruton number");

    // Low Scruton number => large VIV amplitudes
    assert!(
        sc < 5.0,
        "Sc = {:.3} < 5 indicates susceptibility to VIV",
        sc
    );

    // At different velocity: f_s changes linearly with U
    let u_test: f64 = 3.0;
    let f_s_test = st * u_test / d;
    let expected_fs = 0.2 * 3.0 / 0.5;
    assert_close(f_s_test, expected_fs, 1e-10, "shedding freq at U=3");
    assert_close(f_s_test, 1.2, 1e-10, "f_s = 1.2 Hz");
}

// ================================================================
// 8. Wave Slamming Force — Impact Loading on Horizontal Members
// ================================================================
//
// When a wave surface strikes a horizontal structural member,
// the slamming force per unit length is:
//   f_slam = 0.5 * C_s * rho * D * v^2
//
// where v = vertical water particle velocity at impact,
// C_s = slamming coefficient ≈ pi (theoretical, 2D)
// or C_s ≈ 5.15 (experimental, 3D cylinder)
//
// The slamming force is impulsive (very short duration):
//   Duration: tau ≈ D / (C_tau * v), where C_tau ≈ 4-8
//   Impulse: I ≈ C_s * rho * D * v * D / C_tau
//
// Ref: API RP 2A-WSD, DNV-RP-C205 Sec.8, Sarpkaya Ch.6

#[test]
fn validation_wave_slamming_force() {
    let rho: f64 = 1025.0;
    let d: f64 = 0.8; // m member diameter
    let v_impact: f64 = 4.0; // m/s vertical velocity at impact

    // Theoretical slamming coefficient (2D cylinder, Wagner theory)
    let cs_theory = PI;

    // Slamming force per unit length
    let f_slam = 0.5 * cs_theory * rho * d * v_impact * v_impact;
    let expected_f = 0.5 * PI * 1025.0 * 0.8 * 16.0;
    assert_close(f_slam, expected_f, 1e-10, "slamming force");

    // Compare with steady drag force: f_drag = 0.5*C_D*rho*D*v^2
    let c_d: f64 = 1.0;
    let f_drag = 0.5 * c_d * rho * d * v_impact * v_impact;
    let slam_to_drag = f_slam / f_drag;
    // = C_s / C_D = pi / 1.0 = pi
    assert_close(slam_to_drag, PI, 1e-10, "slam/drag ratio = pi");

    // Impact duration
    let c_tau: f64 = 6.0; // typical
    let tau = d / (c_tau * v_impact);
    // = 0.8 / (6*4) = 0.8/24 = 0.0333 s
    let expected_tau = 0.8 / 24.0;
    assert_close(tau, expected_tau, 1e-10, "impact duration");

    // Impulse per unit length
    let impulse = f_slam * tau;
    let expected_impulse = 0.5 * cs_theory * rho * d * v_impact * v_impact * d
        / (c_tau * v_impact);
    assert_close(impulse, expected_impulse, 1e-10, "slamming impulse");

    // Dynamic amplification factor (DAF) for slam loading
    // For a rectangular pulse of duration tau and natural period T_n:
    //   DAF_max = 2*sin(pi*tau/T_n) for tau < T_n/2
    //   DAF_max = 2 for tau >= T_n/2
    let t_n: f64 = 0.5; // s natural period
    let ratio_tau_tn = tau / t_n;
    let daf = if ratio_tau_tn < 0.5 {
        2.0 * (PI * ratio_tau_tn).sin()
    } else {
        2.0
    };
    // tau/T_n = 0.0333/0.5 = 0.0667 < 0.5
    // DAF = 2*sin(pi*0.0667) = 2*sin(0.2094) = 2*0.2079 = 0.4159
    assert!(ratio_tau_tn < 0.5, "short duration impact");
    let expected_daf = 2.0 * (PI * ratio_tau_tn).sin();
    assert_close(daf, expected_daf, 1e-10, "dynamic amplification factor");
    assert!(daf < 2.0, "DAF for short pulse should be < 2.0");
}
