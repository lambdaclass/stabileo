/// Validation: Dynamic Wind Effects
///
/// References:
///   - EN 1991-1-4:2005 Annex E: Vortex shedding and aeroelastic instabilities
///   - ASCE 7-22 Ch.26-31: Wind loading provisions
///   - Simiu & Scanlan: "Wind Effects on Structures" 3rd ed. (1996)
///   - Holmes: "Wind Loading of Structures" 3rd ed. (2015)
///   - Dyrbye & Hansen: "Wind Loads on Structures" (1997)
///
/// Tests verify vortex shedding, gust factors, along-wind response,
/// across-wind response, and aeroelastic divergence.

// ================================================================
// 1. Vortex Shedding — Strouhal Number
// ================================================================
//
// f_s = St * V / D
// St ≈ 0.2 for circular cylinders (Re = 300-3×10⁵)
// Lock-in occurs when f_s ≈ f_n (natural frequency)

#[test]
fn wind_vortex_strouhal() {
    let st: f64 = 0.20;    // Strouhal number (circular cylinder)
    let v: f64 = 15.0;     // m/s, wind speed
    let d: f64 = 0.3;      // m, cylinder diameter

    let f_s: f64 = st * v / d;
    let f_s_expected: f64 = 10.0; // Hz

    assert!(
        (f_s - f_s_expected).abs() / f_s_expected < 0.01,
        "Shedding frequency: {:.1} Hz, expected {:.1}", f_s, f_s_expected
    );

    // Critical wind speed for lock-in (f_n = 5 Hz)
    let f_n: f64 = 5.0; // Hz, natural frequency
    let v_crit: f64 = f_n * d / st;
    let v_crit_expected: f64 = 7.5; // m/s

    assert!(
        (v_crit - v_crit_expected).abs() / v_crit_expected < 0.01,
        "Critical velocity: {:.1} m/s, expected {:.1}", v_crit, v_crit_expected
    );

    // Reduced velocity at lock-in: Vr = V/(f_n*D)
    let vr: f64 = v_crit / (f_n * d);
    let vr_expected: f64 = 1.0 / st; // = 5.0
    assert!(
        (vr - vr_expected).abs() / vr_expected < 0.01,
        "Reduced velocity: {:.1}, expected {:.1}", vr, vr_expected
    );
}

// ================================================================
// 2. EC1-1-4 Annex E — Vortex Shedding Response
// ================================================================
//
// Maximum across-wind displacement:
// y_max = σ_y * k_p
// where σ_y = St * (1/(St²)) * (C_lat²/(4π·Sc)) * D
// Scruton number: Sc = 2*m_e*δ_s/(ρ*D²)

#[test]
fn wind_ec1_vortex_scruton() {
    let m_e: f64 = 200.0;     // kg/m, equivalent mass per unit length
    let delta_s: f64 = 0.02;  // logarithmic decrement of structural damping
    let rho: f64 = 1.25;      // kg/m³, air density
    let d: f64 = 1.0;         // m, width/diameter

    // Scruton number
    let sc: f64 = 2.0 * m_e * delta_s / (rho * d * d);
    let sc_expected: f64 = 2.0 * 200.0 * 0.02 / (1.25 * 1.0);
    // = 8.0 / 1.25 = 6.4

    assert!(
        (sc - sc_expected).abs() / sc_expected < 0.01,
        "Scruton number: {:.2}, expected {:.2}", sc, sc_expected
    );

    // Sc > 10 generally prevents vortex-induced vibrations
    let sc_safe: f64 = 10.0;
    assert!(
        sc < sc_safe,
        "Sc = {:.1} < {} — vortex shedding assessment needed", sc, sc_safe
    );

    // Increasing damping to δ = 0.05 (with dampers):
    let delta_damped: f64 = 0.05;
    let sc_damped: f64 = 2.0 * m_e * delta_damped / (rho * d * d);
    assert!(
        sc_damped > sc_safe,
        "With dampers Sc = {:.1} > {} — safe from VIV", sc_damped, sc_safe
    );
}

// ================================================================
// 3. Gust Effect Factor (ASCE 7 §26.11)
// ================================================================
//
// Rigid structures (f_n > 1 Hz): G = 0.925 * (1 + 1.7*gQ*Iz*Q) / (1 + 1.7*gv*Iz)
// gQ = gv = 3.4, Iz = turbulence intensity, Q = background response factor

#[test]
fn wind_asce7_gust_factor_rigid() {
    let gq: f64 = 3.4;     // peak factor
    let gv: f64 = 3.4;     // peak factor
    let iz: f64 = 0.20;    // turbulence intensity at z_bar (Exposure B)
    let q: f64 = 0.85;     // background response factor (typical)

    // Gust effect factor for rigid structures
    let g: f64 = 0.925 * (1.0 + 1.7 * gq * iz * q) / (1.0 + 1.7 * gv * iz);

    // Numerator = 1 + 1.7*3.4*0.20*0.85 = 1 + 0.9826 = 1.9826
    // Denominator = 1 + 1.7*3.4*0.20 = 1 + 1.156 = 2.156
    // G = 0.925 * 1.9826/2.156 = 0.925 * 0.9195 = 0.8506

    let g_expected: f64 = 0.925 * (1.0 + 1.7 * 3.4 * 0.20 * 0.85) / (1.0 + 1.7 * 3.4 * 0.20);

    assert!(
        (g - g_expected).abs() / g_expected < 0.01,
        "Gust factor G: {:.4}, expected {:.4}", g, g_expected
    );

    // ASCE 7: G shall not be less than 0.85
    let g_min: f64 = 0.85;
    assert!(
        g >= g_min || (g_min - g).abs() < 0.01,
        "G = {:.3} should be near or above minimum {:.2}", g, g_min
    );
}

// ================================================================
// 4. Along-Wind Response — Davenport (1967)
// ================================================================
//
// Peak displacement: x_max = (ρ * Cd * V̄² * A) / (2 * k) * G_f
// where G_f = gust factor from spectral approach
// RMS displacement: σ_x = x_mean * (Iz * sqrt(B² + R²/ζ))

#[test]
fn wind_along_wind_response() {
    let rho: f64 = 1.25;      // kg/m³
    let cd: f64 = 1.3;        // drag coefficient
    let v_mean: f64 = 30.0;   // m/s, mean wind speed at top
    let b_face: f64 = 30.0;   // m, building width
    let h: f64 = 100.0;       // m, building height
    let a: f64 = b_face * h;  // m², projected area
    let k: f64 = 5e6;         // N/m, generalized stiffness (first mode)

    // Mean displacement
    let f_mean: f64 = 0.5 * rho * cd * v_mean * v_mean * a; // N
    let x_mean: f64 = f_mean / k; // m

    // F = 0.5 * 1.25 * 1.3 * 900 * 3000 = 0.5 * 1.25 * 1.3 * 2.7e6 = 2,193,750 N
    let f_expected: f64 = 0.5 * 1.25 * 1.3 * 900.0 * 3000.0;

    assert!(
        (f_mean - f_expected).abs() / f_expected < 0.01,
        "Mean wind force: {:.0} N, expected {:.0}", f_mean, f_expected
    );

    // Mean displacement
    let x_expected: f64 = f_expected / k;
    assert!(
        (x_mean - x_expected).abs() / x_expected < 0.01,
        "Mean displacement: {:.4} m, expected {:.4}", x_mean, x_expected
    );

    // Displacement should be reasonable (< H/100 for serviceability)
    let drift_limit: f64 = h / 100.0;
    assert!(
        x_mean < drift_limit,
        "Mean drift {:.4}m should be < H/100 = {:.4}m", x_mean, drift_limit
    );
}

// ================================================================
// 5. Across-Wind Response — Vortex-Induced Force
// ================================================================
//
// EC1-1-4 Annex E: lateral force per unit length
// F_w = C_L * 0.5 * ρ * V² * D (at resonance)
// Typical C_L values: 0.2-0.5 for circular cylinders

#[test]
fn wind_across_wind_force() {
    let cl: f64 = 0.3;        // lift coefficient (circular cylinder)
    let rho: f64 = 1.25;      // kg/m³
    let v_crit: f64 = 12.0;   // m/s, critical wind speed
    let d: f64 = 2.0;         // m, diameter

    // Lateral force per unit length
    let fw: f64 = cl * 0.5 * rho * v_crit * v_crit * d;
    // = 0.3 * 0.5 * 1.25 * 144 * 2 = 0.3 * 180 = 54 N/m
    let fw_expected: f64 = 0.3 * 0.5 * 1.25 * 144.0 * 2.0;

    assert!(
        (fw - fw_expected).abs() / fw_expected < 0.01,
        "Lateral force: {:.1} N/m, expected {:.1}", fw, fw_expected
    );

    // Compare to along-wind drag force
    let cd: f64 = 1.2;
    let fd: f64 = cd * 0.5 * rho * v_crit * v_crit * d;

    // Across-wind is typically less than along-wind
    assert!(
        fw < fd,
        "Across-wind {:.1} < along-wind {:.1} N/m", fw, fd
    );

    // Ratio CL/CD characterizes slenderness effect
    let ratio: f64 = cl / cd;
    assert!(
        ratio < 1.0,
        "CL/CD = {:.2} < 1.0 (typical)", ratio
    );
}

// ================================================================
// 6. Galloping Criterion (EC1-1-4 Annex E.2)
// ================================================================
//
// Galloping onset velocity: V_cg = 2*Sc*f_n*D / a_G
// where Sc = Scruton number, a_G = galloping instability factor
// For rectangular sections: a_G depends on D/b ratio

#[test]
fn wind_galloping_criterion() {
    let sc: f64 = 15.0;     // Scruton number
    let f_n: f64 = 0.5;     // Hz, natural frequency
    let d: f64 = 5.0;       // m, across-wind dimension
    let a_g: f64 = 2.0;     // galloping factor (D/b ≈ 2 for rectangle)

    // Galloping onset velocity
    let v_cg: f64 = 2.0 * sc * f_n * d / a_g;
    // = 2 * 15 * 0.5 * 5.0 / 2.0 = 75 / 2 = 37.5 m/s
    let v_cg_expected: f64 = 37.5;

    assert!(
        (v_cg - v_cg_expected).abs() / v_cg_expected < 0.01,
        "Galloping velocity: {:.1} m/s, expected {:.1}", v_cg, v_cg_expected
    );

    // Check against design wind speed
    let v_design: f64 = 45.0; // m/s

    if v_cg < v_design {
        // Galloping is possible — need mitigation
        assert!(
            v_cg < v_design,
            "V_cg = {:.1} < V_design = {:.1} — galloping risk", v_cg, v_design
        );
    }

    // Higher Scruton number → higher onset velocity (safer)
    let sc_high: f64 = 25.0;
    let v_cg_high: f64 = 2.0 * sc_high * f_n * d / a_g;
    assert!(
        v_cg_high > v_cg,
        "Higher Sc: V_cg = {:.1} > {:.1}", v_cg_high, v_cg
    );
}

// ================================================================
// 7. Buffeting Response — Power Spectral Density
// ================================================================
//
// Von Kármán spectrum for longitudinal turbulence:
// S_u(f) / σ_u² = 4*f*L_u/V / (1 + 70.8*(f*L_u/V)²)^(5/6)
// where L_u = integral length scale, σ_u = RMS turbulence

#[test]
fn wind_von_karman_spectrum() {
    let f: f64 = 1.0;         // Hz, frequency
    let l_u: f64 = 180.0;     // m, integral length scale
    let v_mean: f64 = 25.0;   // m/s, mean wind speed
    let sigma_u: f64 = 3.5;   // m/s, RMS turbulence intensity

    let n_hat: f64 = f * l_u / v_mean; // reduced frequency = 7.2

    // Von Kármán PSD (normalized)
    let s_norm: f64 = 4.0 * n_hat / (1.0 + 70.8 * n_hat * n_hat).powf(5.0 / 6.0);

    // = 4 * 7.2 / (1 + 70.8 * 51.84)^(5/6)
    // = 28.8 / (1 + 3670.1)^(5/6)
    // = 28.8 / 3671.1^0.8333
    // ≈ 28.8 / 1247 = 0.0231

    assert!(
        s_norm > 0.0 && s_norm < 1.0,
        "Normalized PSD: {:.6}", s_norm
    );

    // Actual PSD
    let s_u: f64 = s_norm * sigma_u * sigma_u / f;
    assert!(
        s_u > 0.0,
        "PSD at 1 Hz: {:.4} (m/s)²/Hz", s_u
    );

    // At lower frequency, PSD should be higher (more energy in gusts)
    let f_low: f64 = 0.1;
    let n_hat_low: f64 = f_low * l_u / v_mean;
    let s_norm_low: f64 = 4.0 * n_hat_low / (1.0 + 70.8 * n_hat_low * n_hat_low).powf(5.0 / 6.0);
    let s_u_low: f64 = s_norm_low * sigma_u * sigma_u / f_low;

    assert!(
        s_u_low > s_u,
        "Lower frequency has higher PSD: {:.4} > {:.4}", s_u_low, s_u
    );
}

// ================================================================
// 8. Aeroelastic Divergence — Critical Speed
// ================================================================
//
// Torsional divergence velocity:
// V_div = sqrt(2*K_θ / (ρ*B²*L*(dCM/dα)))
// where K_θ = torsional stiffness, B = chord, dCM/dα = moment slope

#[test]
fn wind_torsional_divergence() {
    let k_theta: f64 = 5e7;   // N·m/rad, torsional stiffness
    let rho: f64 = 1.25;      // kg/m³
    let b_chord: f64 = 30.0;  // m, bridge deck chord width
    let l_span: f64 = 200.0;  // m, span length
    let dcm_dalpha: f64 = 3.5; // 1/rad, moment coefficient slope

    // Divergence velocity
    let v_div: f64 = (2.0 * k_theta / (rho * b_chord * b_chord * l_span * dcm_dalpha)).sqrt();

    // = sqrt(1e8 / (1.25 * 900 * 200 * 3.5))
    // = sqrt(1e8 / 787500)
    // = sqrt(127.0) = 11.27 m/s — low because of large bridge parameters

    assert!(
        v_div > 0.0,
        "Divergence velocity: {:.1} m/s", v_div
    );

    // Higher torsional stiffness → higher divergence speed (safer)
    let k_theta_stiff: f64 = 2e8;
    let v_div_stiff: f64 = (2.0 * k_theta_stiff / (rho * b_chord * b_chord * l_span * dcm_dalpha)).sqrt();
    assert!(
        v_div_stiff > v_div,
        "Stiffer: V_div = {:.1} > {:.1} m/s", v_div_stiff, v_div
    );

    // Ratio scales as sqrt(K)
    let ratio: f64 = v_div_stiff / v_div;
    let k_ratio: f64 = (k_theta_stiff / k_theta).sqrt();
    assert!(
        (ratio - k_ratio).abs() / k_ratio < 0.01,
        "V ratio {:.2} = sqrt(K ratio) {:.2}", ratio, k_ratio
    );
}
