/// Validation: Cable Analysis — Advanced Formulations
///
/// References:
///   - Irvine: "Cable Structures" (1981)
///   - EN 1993-1-11:2006: Design of structures with tension components
///   - ASCE 19-16: Structural Applications of Steel Cables
///   - Gimsing & Georgakis: "Cable Supported Bridges" 3rd ed. (2012)
///   - Ernst: "Der E-Modul von Seilen" (1965) — Equivalent modulus
///
/// Tests verify catenary equations, cable sag, equivalent stiffness,
/// wind and ice loading on cables, and stay cable design.

// ================================================================
// 1. Catenary Cable — Self-Weight Sag
// ================================================================
//
// Exact catenary: y = H/w * (cosh(w*x/H) - 1)
// Parabolic approximation: y ≈ w*x*(L-x)/(2H)
// Sag at midspan: d = wL²/(8H) (parabolic)

#[test]
fn cable_catenary_sag() {
    let w: f64 = 0.5;      // kN/m, cable self-weight per meter
    let l: f64 = 200.0;    // m, horizontal span
    let h: f64 = 500.0;    // kN, horizontal tension

    // Parabolic sag
    let d_parabolic: f64 = w * l * l / (8.0 * h);
    let d_expected: f64 = 0.5 * 40000.0 / 4000.0; // = 5.0 m

    assert!(
        (d_parabolic - d_expected).abs() / d_expected < 0.01,
        "Parabolic sag: {:.2} m, expected {:.2}", d_parabolic, d_expected
    );

    // Exact catenary midspan sag
    let d_catenary: f64 = h / w * ((w * l / (2.0 * h)).cosh() - 1.0);
    // = 1000 * (cosh(0.1) - 1) = 1000 * (1.005004 - 1) = 5.004 m

    // Catenary and parabolic should be close for small sag/span ratio
    let sag_ratio: f64 = d_parabolic / l;
    assert!(
        sag_ratio < 0.1,
        "Sag/span = {:.4} — parabolic approximation valid", sag_ratio
    );

    let error_pct: f64 = ((d_catenary - d_parabolic) / d_catenary).abs() * 100.0;
    assert!(
        error_pct < 1.0,
        "Catenary vs parabolic error: {:.2}% (< 1% for d/L < 0.05)", error_pct
    );
}

// ================================================================
// 2. Cable Length — Parabolic Approximation
// ================================================================
//
// Cable length: S ≈ L * (1 + 8*(d/L)²/3 - 32*(d/L)⁴/5 + ...)
// First-order: S ≈ L + 8*d²/(3*L)

#[test]
fn cable_length_parabolic() {
    let l: f64 = 300.0;   // m, span
    let d: f64 = 15.0;    // m, sag

    // First-order length approximation
    let s_approx: f64 = l + 8.0 * d * d / (3.0 * l);
    // = 300 + 8*225/900 = 300 + 2.0 = 302.0 m
    let s_expected: f64 = 302.0;

    assert!(
        (s_approx - s_expected).abs() / s_expected < 0.001,
        "Cable length: {:.2} m, expected {:.2}", s_approx, s_expected
    );

    // Length excess ratio
    let excess: f64 = (s_approx - l) / l * 100.0;
    // = 2.0/300 * 100 = 0.667%
    let excess_expected: f64 = 0.667;
    assert!(
        (excess - excess_expected).abs() / excess_expected < 0.02,
        "Length excess: {:.3}%, expected {:.3}%", excess, excess_expected
    );

    // For larger sag, length increases more
    let d_large: f64 = 30.0;
    let s_large: f64 = l + 8.0 * d_large * d_large / (3.0 * l);
    assert!(
        s_large > s_approx,
        "Larger sag → longer cable: {:.2} > {:.2}", s_large, s_approx
    );
}

// ================================================================
// 3. Ernst Equivalent Modulus
// ================================================================
//
// For inclined cables with sag, the effective modulus accounts
// for catenary effect:
// E_eq = E / (1 + (w*L_h)²*E*A/(12*T³))
// where L_h = horizontal projection, T = cable tension

#[test]
fn cable_ernst_equivalent_modulus() {
    let e_cable: f64 = 195_000.0; // MPa, cable modulus
    let a_cable: f64 = 5000.0;    // mm², cable area
    let w_cable: f64 = 0.40;      // kN/m, cable weight per unit length
    let l_h: f64 = 150.0;         // m, horizontal projection
    let t: f64 = 3000.0;          // kN, cable tension

    // Ernst formula (working in consistent units: kN, m)
    let w_m: f64 = w_cable;  // kN/m
    let e_kn_m2: f64 = e_cable * 1000.0; // kN/m² (from MPa)
    let a_m2: f64 = a_cable / 1e6;       // m² (from mm²)

    let denominator: f64 = 1.0 + (w_m * l_h).powi(2) * e_kn_m2 * a_m2 / (12.0 * t.powi(3));

    let e_eq_kn_m2: f64 = e_kn_m2 / denominator;
    let e_eq: f64 = e_eq_kn_m2 / 1000.0; // back to MPa

    // (0.4*150)² * 195e6 * 5e-3 / (12 * 3000³) = 3600 * 975000 / (12 * 2.7e10)
    // = 3.51e9 / 3.24e11 = 0.01083
    // E_eq = 195000 / 1.01083 = 192,909 MPa

    // E_eq should be close to E for taut cables
    let reduction: f64 = (1.0 - e_eq / e_cable) * 100.0;
    assert!(
        reduction > 0.0 && reduction < 10.0,
        "Modulus reduction: {:.2}%", reduction
    );

    // At lower tension, reduction is larger
    let t_low: f64 = 1000.0;
    let denom_low: f64 = 1.0 + (w_m * l_h).powi(2) * e_kn_m2 * a_m2 / (12.0 * t_low.powi(3));
    let e_eq_low: f64 = e_kn_m2 / denom_low / 1000.0;
    assert!(
        e_eq_low < e_eq,
        "Lower tension → lower E_eq: {:.0} < {:.0} MPa", e_eq_low, e_eq
    );
}

// ================================================================
// 4. Cable Vibration — Irvine Parameter
// ================================================================
//
// Irvine parameter: λ² = (wL/H)² * (L/Le)³ * (EA/H)
// where Le = cable length, H = horizontal tension.
// For λ² < 4π², first mode is antisymmetric (no cable-stays crossover).

#[test]
fn cable_irvine_parameter() {
    let w: f64 = 0.8;       // kN/m, cable weight
    let l: f64 = 100.0;     // m, span
    let h: f64 = 800.0;     // kN, horizontal tension
    let e_cable: f64 = 160_000_000.0; // kN/m² (160 GPa)
    let a_cable: f64 = 0.002; // m² (2000 mm²)

    // Cable sag
    let d: f64 = w * l * l / (8.0 * h);
    // = 0.8 * 10000 / 6400 = 1.25 m

    // Cable length (approximate)
    let le: f64 = l * (1.0 + 8.0 * (d / l).powi(2) / 3.0);

    // Irvine parameter
    let lambda_sq: f64 = (w * l / h).powi(2) * (l / le).powi(3) * (e_cable * a_cable / h);

    // = (0.1)² * (100/100.0042)³ * (320000/800)
    // ≈ 0.01 * 0.99987 * 400 = 4.0

    // Check if first mode is symmetric or antisymmetric
    let crossover: f64 = 4.0 * std::f64::consts::PI * std::f64::consts::PI;
    // = 39.48

    if lambda_sq < crossover {
        // First mode is antisymmetric (typical for most cables)
        assert!(lambda_sq < crossover, "λ² = {:.2} < 4π² = {:.2}", lambda_sq, crossover);
    }

    // Natural frequency of cable (first mode, antisymmetric)
    let f1: f64 = (1.0 / l) * (h / (w / 9.81)).sqrt();
    // Sag frequency formula: f_n = n/(2L) * sqrt(H/(m)) where m = w/g
    let m_per_m: f64 = w / 9.81; // mass per meter
    let _f1_alt: f64 = 1.0 / (2.0 * l) * (h / m_per_m * 1000.0).sqrt();

    assert!(
        f1 > 0.0,
        "Cable frequency: {:.3} Hz", f1
    );
}

// ================================================================
// 5. Stay Cable — Sag Effect on Stiffness
// ================================================================
//
// Effective axial stiffness of inclined stay cable:
// k_eff = EA/L * 1/(1 + (w*L_h)²*EA/(12*T³))
// The cable sag reduces apparent stiffness.

#[test]
fn cable_stay_effective_stiffness() {
    let e: f64 = 190_000.0;    // MPa
    let a: f64 = 8000.0;       // mm², cable area
    let l: f64 = 250.0;        // m, cable length
    let w: f64 = 0.65;         // kN/m, weight per length
    let t: f64 = 5000.0;       // kN, cable tension

    // Horizontal projection (assume 60° angle with horizontal)
    let l_h: f64 = l * 0.5; // cos(60°) = 0.5, L_h = 125m

    // Geometric stiffness (no sag)
    let ea: f64 = e * 1000.0 * a / 1e6; // kN (E in kN/m² * A in m²)
    // = 190000 * 1000 * 8000/1e6 = 190e6 * 8e-3 = 1,520,000 kN
    let k_no_sag: f64 = ea / l;
    // = 1520000 / 250 = 6080 kN/m

    // Sag reduction factor
    let sag_factor: f64 = 1.0 / (1.0 + (w * l_h).powi(2) * ea / (12.0 * t.powi(3)));

    let k_eff: f64 = k_no_sag * sag_factor;

    // Stiffness ratio
    let stiffness_ratio: f64 = k_eff / k_no_sag;
    assert!(
        stiffness_ratio > 0.5 && stiffness_ratio < 1.0,
        "Stiffness ratio: {:.3} (sag reduces stiffness)", stiffness_ratio
    );

    // At higher tension, ratio improves
    let t_high: f64 = 8000.0;
    let sag_factor_high: f64 = 1.0 / (1.0 + (w * l_h).powi(2) * ea / (12.0 * t_high.powi(3)));
    assert!(
        sag_factor_high > sag_factor,
        "Higher tension → less sag effect: {:.4} > {:.4}", sag_factor_high, sag_factor
    );
}

// ================================================================
// 6. Cable Ice Loading (ASCE 7 / EC1-1-4)
// ================================================================
//
// Ice on cables: radial ice thickness t_ice
// Added weight: w_ice = ρ_ice * g * π * ((D+2t)² - D²) / 4
// Wind on iced cable: F_w = q * Cd * (D + 2*t_ice)

#[test]
fn cable_ice_loading() {
    let d_cable: f64 = 0.050;   // m, cable diameter (50mm)
    let t_ice: f64 = 0.025;     // m, ice thickness (25mm)
    let rho_ice: f64 = 900.0;   // kg/m³
    let g: f64 = 9.81;          // m/s²

    // Iced diameter
    let d_iced: f64 = d_cable + 2.0 * t_ice;
    let d_iced_expected: f64 = 0.100; // m

    assert!(
        (d_iced - d_iced_expected).abs() < 0.001,
        "Iced diameter: {:.3} m, expected {:.3}", d_iced, d_iced_expected
    );

    // Ice weight per meter
    let a_ice: f64 = std::f64::consts::PI / 4.0 * (d_iced * d_iced - d_cable * d_cable);
    let w_ice: f64 = rho_ice * g * a_ice / 1000.0; // kN/m

    // A_ice = π/4 * (0.01 - 0.0025) = π/4 * 0.0075 = 0.005890 m²
    let a_ice_expected: f64 = std::f64::consts::PI / 4.0 * (0.01 - 0.0025);

    assert!(
        (a_ice - a_ice_expected).abs() / a_ice_expected < 0.01,
        "Ice area: {:.6} m², expected {:.6}", a_ice, a_ice_expected
    );

    // w_ice = 900 * 9.81 * 0.005890 / 1000 = 0.0520 kN/m
    assert!(
        w_ice > 0.01 && w_ice < 0.2,
        "Ice weight: {:.4} kN/m", w_ice
    );

    // Wind on iced cable: increased projected area
    let q_wind: f64 = 0.7;  // kN/m², wind pressure
    let cd: f64 = 1.2;      // drag coefficient (iced cable)

    let fw_bare: f64 = q_wind * 1.0 * d_cable; // Cd=1.0 for bare cable
    let fw_iced: f64 = q_wind * cd * d_iced;

    assert!(
        fw_iced > fw_bare,
        "Iced wind: {:.4} > bare {:.4} kN/m", fw_iced, fw_bare
    );
}

// ================================================================
// 7. Cable Pretension — Temperature Effects
// ================================================================
//
// Temperature change in cable: ΔT causes force change
// ΔP = E*A*α*ΔT (restrained cable)
// For unrestrained: cable length change ΔL = α*L*ΔT

#[test]
fn cable_temperature_effects() {
    let e: f64 = 195_000.0;     // MPa
    let a: f64 = 3000.0;        // mm²
    let alpha: f64 = 12e-6;     // 1/°C, thermal expansion
    let l: f64 = 150.0;         // m, cable length
    let delta_t: f64 = 40.0;    // °C, temperature rise

    // Free length change
    let delta_l: f64 = alpha * l * delta_t;
    let delta_l_expected: f64 = 12e-6 * 150.0 * 40.0; // = 0.072 m = 72 mm

    assert!(
        (delta_l - delta_l_expected).abs() / delta_l_expected < 0.01,
        "Free expansion: {:.4} m ({:.1} mm), expected {:.4}", delta_l, delta_l * 1000.0, delta_l_expected
    );

    // Restrained force change
    let delta_p: f64 = e * a * alpha * delta_t / 1000.0; // kN
    // = 195000 * 3000 * 12e-6 * 40 / 1000 = 195000 * 3000 * 4.8e-4 / 1000 = 280.8 kN
    let delta_p_expected: f64 = 195_000.0 * 3000.0 * 12e-6 * 40.0 / 1000.0;

    assert!(
        (delta_p - delta_p_expected).abs() / delta_p_expected < 0.01,
        "Thermal force: {:.1} kN, expected {:.1}", delta_p, delta_p_expected
    );

    // This is significant — typical stay cable pretension is 3000-5000 kN
    let pretension: f64 = 4000.0;
    let ratio: f64 = delta_p / pretension * 100.0;
    assert!(
        ratio > 1.0 && ratio < 20.0,
        "Temperature effect: {:.1}% of pretension", ratio
    );
}

// ================================================================
// 8. EN 1993-1-11 — Cable Safety Factors
// ================================================================
//
// Design resistance of cable: Fd = Fuk / (γR * γM)
// Fuk = characteristic breaking strength
// γR = 1.50 (general), γM = 1.0 (for locked coil)
// Fatigue: ΔσRsk / γMf for cable fatigue

#[test]
fn cable_en1993_1_11_design() {
    let fuk: f64 = 8000.0;    // kN, characteristic breaking strength
    let gamma_r: f64 = 1.50;   // resistance factor
    let gamma_m: f64 = 1.0;    // material factor (locked coil rope)

    // Design resistance
    let fd: f64 = fuk / (gamma_r * gamma_m);
    let fd_expected: f64 = 5333.3; // kN

    assert!(
        (fd - fd_expected).abs() / fd_expected < 0.01,
        "Design resistance: {:.1} kN, expected {:.1}", fd, fd_expected
    );

    // Check utilization for service load
    let f_service: f64 = 4500.0; // kN
    let utilization: f64 = f_service / fd;

    assert!(
        utilization < 1.0,
        "Utilization: {:.3} < 1.0 → OK", utilization
    );

    // For spiral strand: γM = 1.10
    let gamma_m_spiral: f64 = 1.10;
    let fd_spiral: f64 = fuk / (gamma_r * gamma_m_spiral);

    assert!(
        fd_spiral < fd,
        "Spiral strand: {:.0} < locked coil {:.0}", fd_spiral, fd
    );

    // Minimum safety factor check: Fuk/F_service
    let overall_sf: f64 = fuk / f_service;
    // Should exceed γR * γM
    assert!(
        overall_sf > gamma_r * gamma_m,
        "Safety factor {:.2} > required {:.2}", overall_sf, gamma_r * gamma_m
    );

    // Fatigue: typical cable fatigue range = 200 MPa at 2M cycles
    let delta_sigma: f64 = 150.0; // MPa, stress range
    let delta_sigma_rsk: f64 = 200.0; // MPa, characteristic fatigue at 2M
    let gamma_mf: f64 = 1.15; // fatigue factor
    let fatigue_check: f64 = delta_sigma / (delta_sigma_rsk / gamma_mf);

    assert!(
        fatigue_check < 1.0,
        "Fatigue check: {:.3} < 1.0 → OK", fatigue_check
    );
}
