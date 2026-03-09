/// Validation: Retaining Wall Design
///
/// References:
///   - Bowles: "Foundation Analysis and Design" 5th ed. (1996)
///   - Das & Sivakugan: "Principles of Foundation Engineering" 9th ed.
///   - EN 1997-1:2004 (EC7): Geotechnical design
///   - AASHTO LRFD §11: Abutments, Piers, and Walls
///   - Terzaghi, Peck & Mesri: "Soil Mechanics in Engineering Practice" 3rd ed.
///
/// Tests verify earth pressure theories (Rankine, Coulomb), stability
/// checks (overturning, sliding, bearing), and reinforced earth walls.

// ================================================================
// 1. Rankine Active Earth Pressure
// ================================================================
//
// Ka = (1 - sin φ)/(1 + sin φ) = tan²(45° - φ/2)
// σa = Ka * γ * z - 2c*√Ka
// For cohesionless soil: Pa = 0.5 * Ka * γ * H²

#[test]
fn wall_rankine_active() {
    let phi: f64 = 30.0_f64.to_radians(); // friction angle
    let gamma: f64 = 18.0;                // kN/m³
    let h: f64 = 5.0;                     // m, wall height

    // Active earth pressure coefficient
    let ka: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    let ka_expected: f64 = 1.0 / 3.0; // for φ=30°

    assert!(
        (ka - ka_expected).abs() / ka_expected < 0.01,
        "Ka = {:.4}, expected {:.4}", ka, ka_expected
    );

    // Total active force (cohesionless)
    let pa: f64 = 0.5 * ka * gamma * h * h;
    // = 0.5 * 0.333 * 18 * 25 = 75.0 kN/m
    let pa_expected: f64 = 75.0;

    assert!(
        (pa - pa_expected).abs() / pa_expected < 0.01,
        "Active force: {:.1} kN/m, expected {:.1}", pa, pa_expected
    );

    // Point of application: H/3 from base
    let z_pa: f64 = h / 3.0;
    assert!(
        (z_pa - 1.667).abs() < 0.01,
        "Force acts at: {:.3} m from base", z_pa
    );
}

// ================================================================
// 2. Rankine Passive Earth Pressure
// ================================================================
//
// Kp = (1 + sin φ)/(1 - sin φ) = tan²(45° + φ/2)
// Pp = 0.5 * Kp * γ * D² (toe embedment)

#[test]
fn wall_rankine_passive() {
    let phi: f64 = 30.0_f64.to_radians();
    let gamma: f64 = 18.0;
    let d: f64 = 1.5; // m, toe embedment depth

    let kp: f64 = (1.0 + phi.sin()) / (1.0 - phi.sin());
    let kp_expected: f64 = 3.0; // for φ=30°

    assert!(
        (kp - kp_expected).abs() / kp_expected < 0.01,
        "Kp = {:.2}, expected {:.2}", kp, kp_expected
    );

    // Ka * Kp = 1 (reciprocal relationship)
    let ka: f64 = 1.0 / kp;
    assert!(
        (ka * kp - 1.0).abs() < 0.001,
        "Ka * Kp = {:.4} (should = 1)", ka * kp
    );

    // Passive resistance
    let pp: f64 = 0.5 * kp * gamma * d * d;
    // = 0.5 * 3.0 * 18 * 2.25 = 60.75 kN/m
    let pp_expected: f64 = 60.75;

    assert!(
        (pp - pp_expected).abs() / pp_expected < 0.01,
        "Passive resistance: {:.2} kN/m, expected {:.2}", pp, pp_expected
    );
}

// ================================================================
// 3. Coulomb Earth Pressure (Inclined Wall/Backfill)
// ================================================================
//
// Ka_c = sin²(α+φ) / [sin²(α)*sin(α-δ)*(1+√(sin(φ+δ)*sin(φ-β)/(sin(α-δ)*sin(α+β))))²]
// For vertical wall (α=90°), level backfill (β=0), no wall friction (δ=0):
// reduces to Rankine Ka

#[test]
fn wall_coulomb_earth_pressure() {
    let phi: f64 = 35.0_f64.to_radians();
    let delta: f64 = 20.0_f64.to_radians(); // wall friction (2/3*φ approx)
    let alpha: f64 = 90.0_f64.to_radians(); // wall face angle (vertical)
    let beta: f64 = 0.0_f64.to_radians();   // backfill slope (level)
    let gamma: f64 = 19.0;
    let h: f64 = 6.0;

    // Coulomb Ka
    let num: f64 = (alpha + phi).sin().powi(2);
    let sqrt_term: f64 = ((phi + delta).sin() * (phi - beta).sin()
        / ((alpha - delta).sin() * (alpha + beta).sin())).sqrt();
    let denom: f64 = alpha.sin().powi(2) * (alpha - delta).sin()
        * (1.0 + sqrt_term).powi(2);

    let ka_c: f64 = num / denom;

    // For φ=35°, δ=20°: Ka should be less than Rankine Ka (wall friction helps)
    let ka_rankine: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());

    assert!(
        ka_c < ka_rankine,
        "Coulomb Ka {:.4} < Rankine Ka {:.4} (wall friction reduces pressure)",
        ka_c, ka_rankine
    );

    // Active force
    let pa: f64 = 0.5 * ka_c * gamma * h * h;
    assert!(
        pa > 50.0 && pa < 200.0,
        "Coulomb active force: {:.1} kN/m", pa
    );
}

// ================================================================
// 4. Overturning Stability Check
// ================================================================
//
// Factor of safety against overturning: FS_OT = ΣM_resist / ΣM_overturn
// FS_OT ≥ 2.0 (AASHTO) or ≥ 1.5 (some codes)

#[test]
fn wall_overturning_stability() {
    let h: f64 = 5.0;         // m, wall height
    let b: f64 = 3.0;         // m, base width
    let gamma_c: f64 = 24.0;  // kN/m³, concrete
    let t_w: f64 = 0.40;      // m, wall stem thickness
    let t_b: f64 = 0.50;      // m, base thickness
    let gamma_s: f64 = 18.0;  // kN/m³, backfill
    let ka: f64 = 0.333;      // active pressure coefficient

    // Overturning moment (about toe)
    let pa: f64 = 0.5 * ka * gamma_s * h * h; // = 75.0 kN/m
    let m_overturn: f64 = pa * h / 3.0;
    // = 75.0 * 1.667 = 125.0 kN·m/m

    // Resisting moments (about toe)
    // Wall stem weight
    let w_stem: f64 = gamma_c * t_w * (h - t_b);
    let _arm_stem: f64 = t_w / 2.0; // if toe = 0.5m offset
    // Simplified: assume wall at b/3 from toe
    let toe: f64 = 0.5;
    let arm_stem_full: f64 = toe + t_w / 2.0;

    // Base weight
    let w_base: f64 = gamma_c * b * t_b;
    let arm_base: f64 = b / 2.0;

    // Soil on heel
    let heel: f64 = b - toe - t_w;
    let w_soil: f64 = gamma_s * heel * (h - t_b);
    let arm_soil: f64 = b - heel / 2.0;

    let m_resist: f64 = w_stem * arm_stem_full + w_base * arm_base + w_soil * arm_soil;

    // Safety factor
    let fs_ot: f64 = m_resist / m_overturn;
    assert!(
        fs_ot > 1.5,
        "FS_overturning = {:.2} > 1.5 — OK", fs_ot
    );
}

// ================================================================
// 5. Sliding Stability Check
// ================================================================
//
// FS_sliding = (ΣV * tan(δb) + c_b * B + Pp) / Pa
// δb = base friction angle, c_b = base adhesion, Pp = passive resistance

#[test]
fn wall_sliding_stability() {
    let pa: f64 = 75.0;          // kN/m, active force
    let sum_v: f64 = 200.0;      // kN/m, total vertical load
    let delta_b: f64 = 25.0_f64.to_radians(); // base friction (2/3*φ)
    let pp: f64 = 30.0;          // kN/m, passive resistance at toe
    let c_b: f64 = 0.0;          // kPa, base adhesion (granular = 0)
    let b: f64 = 3.0;            // m, base width

    // Sliding resistance
    let f_resist: f64 = sum_v * delta_b.tan() + c_b * b + pp;
    // = 200 * 0.4663 + 0 + 30 = 93.27 + 30 = 123.27

    let fs_sliding: f64 = f_resist / pa;
    // = 123.27 / 75 = 1.644

    assert!(
        fs_sliding > 1.5,
        "FS_sliding = {:.2} > 1.5 — OK", fs_sliding
    );

    // Without passive (conservative)
    let fs_no_passive: f64 = (sum_v * delta_b.tan()) / pa;
    assert!(
        fs_no_passive > 1.0,
        "Without passive: FS = {:.2}", fs_no_passive
    );
}

// ================================================================
// 6. Bearing Pressure Check (Meyerhof Distribution)
// ================================================================
//
// Eccentricity: e = B/2 - ΣM_net/ΣV
// Effective width: B' = B - 2e
// Bearing pressure: q = ΣV / B' (Meyerhof)
// Or trapezoidal: q_max = ΣV/B * (1 + 6e/B), q_min = ΣV/B * (1 - 6e/B)

#[test]
fn wall_bearing_pressure() {
    let sum_v: f64 = 200.0;     // kN/m, total vertical
    let b: f64 = 3.0;           // m, base width
    let m_resist: f64 = 350.0;  // kN·m/m, resisting moment
    let m_overturn: f64 = 125.0; // kN·m/m, overturning moment

    // Net moment about toe
    let m_net: f64 = m_resist - m_overturn;
    // = 225 kN·m/m

    // Eccentricity from base center
    let x_resultant: f64 = m_net / sum_v; // = 1.125 m from toe
    let e: f64 = b / 2.0 - x_resultant;
    // = 1.5 - 1.125 = 0.375 m

    // Check: e must be within middle third (e < B/6)
    let e_limit: f64 = b / 6.0; // = 0.5 m
    assert!(
        e < e_limit,
        "e = {:.3}m < B/6 = {:.3}m — no tension", e, e_limit
    );

    // Trapezoidal pressure
    let q_max: f64 = sum_v / b * (1.0 + 6.0 * e / b);
    let q_min: f64 = sum_v / b * (1.0 - 6.0 * e / b);

    // q_max = 66.67 * (1 + 0.75) = 66.67 * 1.75 = 116.7
    // q_min = 66.67 * (1 - 0.75) = 66.67 * 0.25 = 16.7

    assert!(
        q_min > 0.0,
        "q_min = {:.1} kPa > 0 — no tension at base", q_min
    );
    assert!(
        q_max > q_min,
        "q_max = {:.1} > q_min = {:.1} kPa", q_max, q_min
    );

    // Meyerhof: uniform pressure on effective width
    let b_eff: f64 = b - 2.0 * e;
    let q_meyerhof: f64 = sum_v / b_eff;
    // = 200 / 2.25 = 88.9 kPa

    assert!(
        q_meyerhof > q_min && q_meyerhof < q_max,
        "Meyerhof {:.1} between {:.1} and {:.1}", q_meyerhof, q_min, q_max
    );
}

// ================================================================
// 7. Reinforced Earth Wall (MSE) — Tie-Back Design
// ================================================================
//
// Horizontal reinforcement tension at depth z:
// T = Ka * γ * z * Sv * Sh
// Required length: L = La + Le
// Le = T / (2*f_eff*tan(φ)*σ'v) (pullout)

#[test]
fn wall_mse_reinforcement() {
    let ka: f64 = 0.333;
    let gamma: f64 = 18.0;
    let z: f64 = 4.0;        // m, depth from top
    let sv: f64 = 0.75;      // m, vertical spacing
    let sh: f64 = 1.0;       // m, horizontal spacing (per unit width)

    // Reinforcement tension
    let t_reinf: f64 = ka * gamma * z * sv * sh;
    // = 0.333 * 18 * 4 * 0.75 * 1.0 = 18.0 kN/m
    let t_expected: f64 = 0.333 * 18.0 * 4.0 * 0.75;

    assert!(
        (t_reinf - t_expected).abs() / t_expected < 0.01,
        "Reinforcement tension: {:.1} kN/m, expected {:.1}", t_reinf, t_expected
    );

    // Active zone length (Rankine wedge): La = (H-z)*tan(45°-φ/2)
    let h: f64 = 6.0;
    let phi: f64 = 30.0_f64.to_radians();
    let la: f64 = (h - z) * (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan();

    // Embedment length for pullout
    let f_eff: f64 = 0.8;     // pullout resistance factor
    let sigma_v: f64 = gamma * z; // = 72 kPa
    let le: f64 = t_reinf / (2.0 * f_eff * phi.tan() * sigma_v);

    let l_total: f64 = la + le;
    // At z=4m (near bottom), active zone is short; minimum length typically > 1m
    assert!(
        l_total > 1.0,
        "Total reinforcement length: {:.2} m (La={:.2}, Le={:.2})", l_total, la, le
    );

    // FHWA recommends minimum length = 0.7*H
    let l_min_fhwa: f64 = 0.7 * h;
    let l_design: f64 = l_total.max(l_min_fhwa);
    assert!(
        l_design >= l_min_fhwa,
        "Design length {:.2}m ≥ FHWA minimum {:.2}m", l_design, l_min_fhwa
    );
}

// ================================================================
// 8. Surcharge on Retaining Wall
// ================================================================
//
// Uniform surcharge q (kPa) on backfill:
// Additional horizontal pressure: Δσh = Ka * q (constant with depth)
// Additional force: ΔPa = Ka * q * H (acts at H/2)

#[test]
fn wall_surcharge_loading() {
    let q: f64 = 10.0;        // kPa, uniform surcharge
    let ka: f64 = 0.333;
    let h: f64 = 5.0;

    // Additional horizontal pressure (constant with depth)
    let delta_sigma: f64 = ka * q;
    let delta_sigma_expected: f64 = 3.33;

    assert!(
        (delta_sigma - delta_sigma_expected).abs() / delta_sigma_expected < 0.01,
        "Surcharge pressure: {:.2} kPa, expected {:.2}", delta_sigma, delta_sigma_expected
    );

    // Additional active force
    let delta_pa: f64 = ka * q * h;
    let delta_pa_expected: f64 = 16.65;

    assert!(
        (delta_pa - delta_pa_expected).abs() / delta_pa_expected < 0.01,
        "Surcharge force: {:.2} kN/m, expected {:.2}", delta_pa, delta_pa_expected
    );

    // Acts at H/2 (not H/3 like triangular)
    let arm: f64 = h / 2.0;
    let delta_m: f64 = delta_pa * arm;
    // = 16.65 * 2.5 = 41.6 kN·m/m

    // Compare to self-weight earth pressure moment
    let gamma: f64 = 18.0;
    let pa_self: f64 = 0.5 * ka * gamma * h * h;
    let m_self: f64 = pa_self * h / 3.0;

    let surcharge_ratio: f64 = delta_m / m_self;
    assert!(
        surcharge_ratio > 0.1 && surcharge_ratio < 1.0,
        "Surcharge/self-weight moment ratio: {:.3}", surcharge_ratio
    );
}
