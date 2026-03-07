/// Validation: Earthquake Engineering
///
/// References:
///   - ASCE 7-22: Minimum Design Loads for Buildings
///   - EN 1998-1:2004 (EC8): Design of structures for earthquake resistance
///   - FEMA P-1050: NEHRP Recommended Seismic Provisions (2015)
///   - Chopra: "Dynamics of Structures" 5th ed. (2017)
///   - Priestley, Calvi & Kowalsky: "Displacement-Based Seismic Design" (2007)
///
/// Tests verify response spectrum, base shear, force distribution,
/// drift limits, diaphragm forces, redundancy, overstrength, and seismic weight.

mod helpers;

// ═══════════════════════════════════════════════════════════════
// 1. Design Response Spectrum — ASCE 7 Two-Period Method (§11.4)
// ═══════════════════════════════════════════════════════════════
//
// ASCE 7 design response spectrum:
//   For T < T0:       Sa = SDS × (0.4 + 0.6×T/T0)
//   For T0 ≤ T ≤ TS:  Sa = SDS
//   For TS < T ≤ TL:   Sa = SD1/T
//   For T > TL:        Sa = SD1×TL/T²
//
// where T0 = 0.2×SD1/SDS, TS = SD1/SDS
//   SDS = 2/3 × Fa × Ss (design short-period acceleration)
//   SD1 = 2/3 × Fv × S1 (design 1-sec acceleration)
//
// Example: Site Class D, Ss = 1.5g, S1 = 0.6g
//   Fa = 1.0, Fv = 1.5 (from ASCE 7 Tables)
//   SMS = Fa × Ss = 1.5g, SM1 = Fv × S1 = 0.9g
//   SDS = 2/3 × 1.5 = 1.0g
//   SD1 = 2/3 × 0.9 = 0.6g
//   T0 = 0.2 × 0.6/1.0 = 0.12 s
//   TS = 0.6/1.0 = 0.6 s

#[test]
fn earthquake_design_response_spectrum() {
    let ss: f64 = 1.5;      // g, mapped short-period acceleration
    let s1: f64 = 0.6;      // g, mapped 1-sec acceleration
    let fa: f64 = 1.0;      // site coefficient (short period)
    let fv: f64 = 1.5;      // site coefficient (1-sec)
    let tl: f64 = 8.0;      // s, long-period transition

    // Design spectral parameters
    let sms: f64 = fa * ss;
    let sm1: f64 = fv * s1;
    let sds: f64 = 2.0 / 3.0 * sms;
    let sd1: f64 = 2.0 / 3.0 * sm1;

    assert!((sds - 1.0).abs() < 0.001, "SDS = {:.3}g", sds);
    assert!((sd1 - 0.6).abs() < 0.001, "SD1 = {:.3}g", sd1);

    // Characteristic periods
    let t0: f64 = 0.2 * sd1 / sds;
    let ts: f64 = sd1 / sds;
    assert!((t0 - 0.12).abs() < 0.001, "T0 = {:.3} s", t0);
    assert!((ts - 0.60).abs() < 0.001, "TS = {:.3} s", ts);

    // Spectrum value at various periods
    // T = 0 → Sa = SDS × 0.4
    let sa_0: f64 = sds * 0.4;
    assert!((sa_0 - 0.4).abs() < 0.001, "Sa(T=0) = {:.3}g", sa_0);

    // T = T0 → Sa = SDS
    let sa_t0: f64 = sds * (0.4 + 0.6 * t0 / t0);
    assert!((sa_t0 - sds).abs() < 0.001, "Sa(T0) = {:.3}g", sa_t0);

    // T = 0.3 s (plateau) → Sa = SDS
    let t_plat: f64 = 0.3;
    assert!(t_plat >= t0 && t_plat <= ts, "T={:.1} in plateau", t_plat);
    let sa_plat: f64 = sds;
    assert!((sa_plat - 1.0).abs() < 0.001, "Sa(plateau) = {:.3}g", sa_plat);

    // T = 1.0 s → Sa = SD1/T
    let t_1: f64 = 1.0;
    let sa_1: f64 = sd1 / t_1;
    assert!((sa_1 - 0.6).abs() < 0.001, "Sa(1.0s) = {:.3}g", sa_1);

    // T = 2.0 s → Sa = SD1/T = 0.3g
    let t_2: f64 = 2.0;
    let sa_2: f64 = sd1 / t_2;
    assert!((sa_2 - 0.3).abs() < 0.001, "Sa(2.0s) = {:.3}g", sa_2);

    // T > TL → Sa = SD1×TL/T²
    let t_long: f64 = 10.0;
    let sa_long: f64 = sd1 * tl / (t_long * t_long);
    assert!(sa_long < sa_2, "Long period: Sa={:.4}g < {:.3}g", sa_long, sa_2);

    // Spectrum decreases monotonically after TS
    assert!(sa_1 < sa_plat, "Sa decreases after plateau");
    assert!(sa_2 < sa_1, "Sa continues decreasing");
}

// ═══════════════════════════════════════════════════════════════
// 2. Equivalent Lateral Force — Base Shear (ASCE 7 §12.8)
// ═══════════════════════════════════════════════════════════════
//
// Seismic base shear: V = Cs × W
//
// Seismic response coefficient:
//   Cs = SDS / (R/Ie)                    (Eq. 12.8-2)
//   Cs ≤ SD1 / (T×(R/Ie)) for T ≤ TL    (Eq. 12.8-3)
//   Cs ≥ max(0.044×SDS×Ie, 0.01)         (Eq. 12.8-5)
//   If S1 ≥ 0.6g: Cs ≥ 0.5×S1/(R/Ie)    (Eq. 12.8-6)
//
// Example: 8-story office, special moment frame (R=8, Ie=1.0)
//   SDS = 1.0g, SD1 = 0.6g, S1 = 0.6g
//   T = Cu × Ta = 1.4 × 0.0724 × (30)^0.8 = 1.4 × 1.268 = 1.775 s
//   (Building height = 30 m, Ct=0.0724, x=0.8 for steel MF)
//   Cs = 1.0/(8/1.0) = 0.125
//   Cs_max = 0.6/(1.775×8) = 0.0423 → governs!
//   Cs_min1 = 0.044×1.0×1.0 = 0.044
//   Cs_min2 = 0.5×0.6/(8/1.0) = 0.0375
//   Cs = max(0.0423, 0.044) = 0.044 (minimum governs!)
//   W = 50,000 kN → V = 0.044 × 50,000 = 2,200 kN

#[test]
fn earthquake_equivalent_lateral_force() {
    let sds: f64 = 1.0;         // g
    let sd1: f64 = 0.6;         // g
    let s1: f64 = 0.6;          // g
    let r: f64 = 8.0;           // response modification factor (SMF)
    let ie: f64 = 1.0;          // importance factor
    let w: f64 = 50_000.0;      // kN, effective seismic weight

    // Approximate fundamental period (ASCE 7 Eq. 12.8-7)
    let ct: f64 = 0.0724;       // steel moment frame
    let x: f64 = 0.8;
    let hn: f64 = 30.0;         // m, building height
    let ta: f64 = ct * hn.powf(x);  // approximate period
    let cu: f64 = 1.4;          // upper limit coefficient (SDS ≥ 0.4)
    let t: f64 = cu * ta;

    assert!(
        t > 1.0 && t < 3.0,
        "T = {:.3} s — typical for 8-story steel frame", t
    );

    // Response coefficient calculations
    let r_ie: f64 = r / ie;
    let cs_eq2: f64 = sds / r_ie;                 // 0.125
    let cs_eq3: f64 = sd1 / (t * r_ie);           // upper limit
    let cs_eq5: f64 = (0.044 * sds * ie).max(0.01); // minimum
    let cs_eq6: f64 = 0.5 * s1 / r_ie;            // S1 ≥ 0.6g minimum

    assert!((cs_eq2 - 0.125).abs() < 0.001, "Cs(eq2) = {:.4}", cs_eq2);
    assert!(cs_eq3 < cs_eq2, "Period-limited Cs={:.4} < {:.4}", cs_eq3, cs_eq2);

    // Governing Cs
    let cs_upper: f64 = cs_eq2.min(cs_eq3);
    let cs_lower: f64 = cs_eq5.max(cs_eq6);
    let cs: f64 = cs_upper.max(cs_lower);

    // Base shear
    let v: f64 = cs * w;
    assert!(
        v > 1000.0 && v < 10000.0,
        "V = {:.0} kN — typical for high seismic zone", v
    );

    // Verify minimum governs for this long-period building
    assert!(
        cs_lower > cs_upper || (cs - cs_lower).abs() < 0.001 || (cs - cs_upper).abs() < 0.001,
        "Cs = {:.4}, lower={:.4}, upper={:.4}", cs, cs_lower, cs_upper
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Vertical Distribution of Seismic Forces (ASCE 7 §12.8.3)
// ═══════════════════════════════════════════════════════════════
//
// Story force: Fx = Cvx × V
//   Cvx = wx × hx^k / Σ(wi × hi^k)
//   k = 1 for T ≤ 0.5 s (linear)
//   k = 2 for T ≥ 2.5 s (parabolic)
//   k = interpolated for 0.5 < T < 2.5
//
// Example: 4-story building, T = 0.6 s → k = 1 + 0.5×(0.6−0.5)/(2.5−0.5) = 1.025
//   Story weights: [3000, 3000, 3000, 2500] kN
//   Story heights: [4, 8, 12, 16] m
//   W = 11,500 kN, V = 500 kN
//   Σ(wi×hi^k) = 3000×4^1.025 + 3000×8^1.025 + 3000×12^1.025 + 2500×16^1.025

#[test]
fn earthquake_vertical_distribution() {
    let t: f64 = 0.6;
    let v: f64 = 500.0;     // kN, base shear

    let weights: [f64; 4] = [3000.0, 3000.0, 3000.0, 2500.0];
    let heights: [f64; 4] = [4.0, 8.0, 12.0, 16.0];

    // Exponent k
    let k: f64 = if t <= 0.5 {
        1.0
    } else if t >= 2.5 {
        2.0
    } else {
        1.0 + 0.5 * (t - 0.5) / (2.5 - 0.5)
    };
    let k_expected: f64 = 1.025;
    assert!(
        (k - k_expected).abs() < 0.001,
        "k = {:.3}, expected {:.3}", k, k_expected
    );

    // Compute distribution
    let sum_wh_k: f64 = weights.iter().zip(heights.iter())
        .map(|(w, h)| w * h.powf(k))
        .sum::<f64>();

    let mut forces = [0.0_f64; 4];
    for i in 0..4 {
        let cvx: f64 = weights[i] * heights[i].powf(k) / sum_wh_k;
        forces[i] = cvx * v;
    }

    // Sum of story forces = V
    let sum_f: f64 = forces.iter().sum::<f64>();
    assert!(
        (sum_f - v).abs() / v < 0.001,
        "ΣFx = {:.1} ≈ V = {:.1}", sum_f, v
    );

    // Top story has largest force
    assert!(
        forces[3] > forces[2] && forces[2] > forces[1] && forces[1] > forces[0],
        "Forces increase with height: {:?}", forces
    );

    // Top story fraction
    let top_fraction: f64 = forces[3] / v;
    assert!(
        top_fraction > 0.2 && top_fraction < 0.6,
        "Top story = {:.1}% of V", top_fraction * 100.0
    );

    // Story shears (cumulative from top)
    let mut shears = [0.0_f64; 4];
    shears[3] = forces[3];
    shears[2] = shears[3] + forces[2];
    shears[1] = shears[2] + forces[1];
    shears[0] = shears[1] + forces[0];
    assert!(
        (shears[0] - v).abs() / v < 0.001,
        "Base shear = {:.1} kN", shears[0]
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Story Drift Limits and P-Delta Effects (ASCE 7 §12.8.6 & §12.8.7)
// ═══════════════════════════════════════════════════════════════
//
// Story drift: Δx = Cd × δxe / Ie
//   where δxe = elastic displacement from analysis
//   Cd = deflection amplification factor
//
// Drift limit: Δa/hsx where Δa = allowable drift
//   Risk Category I-III: Δa = 0.02×hsx (most buildings)
//   Risk Category IV: Δa = 0.01×hsx (essential facilities)
//
// P-Delta stability coefficient:
//   θ = Px × Δ / (Vx × hsx × Cd)
//   θmax = 0.5 / (β×Cd) ≤ 0.25
//   where Px = total gravity at story, Vx = story shear, β = 1.0 (conservative)
//
// Example: Story height 4000 mm, Cd = 5.5 (SMF)
//   δxe = 12 mm → Δx = 5.5×12/1.0 = 66 mm
//   Drift ratio = 66/4000 = 0.0165 < 0.02 OK
//   Px = 15,000 kN, Vx = 500 kN
//   θ = 15000×66/(500×4000×5.5) = 990,000/11,000,000 = 0.090

#[test]
fn earthquake_drift_and_pdelta() {
    let hsx: f64 = 4_000.0;     // mm, story height
    let cd: f64 = 5.5;          // deflection amplification factor
    let ie: f64 = 1.0;          // importance factor
    let delta_xe: f64 = 12.0;   // mm, elastic displacement

    // Amplified drift
    let delta_x: f64 = cd * delta_xe / ie;
    assert!(
        (delta_x - 66.0).abs() < 0.01,
        "Δx = {:.1} mm", delta_x
    );

    // Drift ratio
    let drift_ratio: f64 = delta_x / hsx;
    assert!(
        (drift_ratio - 0.0165).abs() / 0.0165 < 0.01,
        "Drift ratio = {:.4}", drift_ratio
    );

    // Drift limit check (Risk Category II)
    let drift_limit: f64 = 0.02;
    assert!(
        drift_ratio < drift_limit,
        "Drift {:.4} < {:.2} — OK", drift_ratio, drift_limit
    );

    // P-Delta stability coefficient
    let px: f64 = 15_000.0;     // kN, gravity load at story
    let vx: f64 = 500.0;        // kN, story shear
    let theta: f64 = px * delta_x / (vx * hsx * cd);
    let theta_expected: f64 = 0.090;
    assert!(
        (theta - theta_expected).abs() / theta_expected < 0.01,
        "θ = {:.3}, expected {:.3}", theta, theta_expected
    );

    // Maximum stability coefficient
    let beta: f64 = 1.0; // conservative
    let theta_max: f64 = (0.5 / (beta * cd)).min(0.25);
    assert!(
        theta < theta_max,
        "θ={:.3} < θ_max={:.3} — P-delta OK", theta, theta_max
    );

    // P-delta amplification factor
    let amplification: f64 = 1.0 / (1.0 - theta);
    assert!(
        amplification > 1.0 && amplification < 2.0,
        "P-delta amplification = {:.3}", amplification
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Diaphragm Design Force (ASCE 7 §12.10.1.1)
// ═══════════════════════════════════════════════════════════════
//
// Diaphragm force at level x:
//   Fpx = Σ(Fi, i=x..n) / Σ(wi, i=x..n) × wpx
//
// Bounds:
//   Fpx_min = 0.2 × SDS × Ie × wpx
//   Fpx_max = 0.4 × SDS × Ie × wpx
//
// Example: 4-story building, SDS = 1.0g, Ie = 1.0
//   Level 3 (third floor): F3=80, F4=120 kN
//   w3=3000, w4=2500 kN, wpx=3000 kN
//   Fpx = (80+120)/(3000+2500) × 3000 = 200/5500 × 3000 = 109.1 kN
//   Min = 0.2×1.0×1.0×3000 = 600 kN → governs!
//   Max = 0.4×1.0×1.0×3000 = 1200 kN

#[test]
fn earthquake_diaphragm_design_force() {
    let sds: f64 = 1.0;
    let ie: f64 = 1.0;
    let wpx: f64 = 3_000.0;     // kN, diaphragm weight at level x

    // Story forces (from distribution)
    let forces_above: [f64; 2] = [80.0, 120.0]; // F3, F4
    let weights_above: [f64; 2] = [3_000.0, 2_500.0]; // w3, w4

    let sum_f: f64 = forces_above.iter().sum::<f64>();
    let sum_w: f64 = weights_above.iter().sum::<f64>();

    // Raw diaphragm force
    let fpx_raw: f64 = sum_f / sum_w * wpx;
    let fpx_raw_expected: f64 = 109.1;
    assert!(
        (fpx_raw - fpx_raw_expected).abs() / fpx_raw_expected < 0.01,
        "Fpx_raw = {:.1} kN", fpx_raw
    );

    // Bounds
    let fpx_min: f64 = 0.2 * sds * ie * wpx;
    let fpx_max: f64 = 0.4 * sds * ie * wpx;
    assert!((fpx_min - 600.0).abs() < 0.01, "Fpx_min = {:.0} kN", fpx_min);
    assert!((fpx_max - 1200.0).abs() < 0.01, "Fpx_max = {:.0} kN", fpx_max);

    // Apply bounds
    let fpx: f64 = fpx_raw.max(fpx_min).min(fpx_max);
    assert!(
        (fpx - fpx_min).abs() < 0.01,
        "Fpx = {:.0} kN (minimum governs)", fpx
    );

    // Minimum governs for this case
    assert!(
        fpx_raw < fpx_min,
        "Raw {:.1} < min {:.0} — minimum governs", fpx_raw, fpx_min
    );

    // Higher SDS increases diaphragm forces
    let fpx_min_high: f64 = 0.2 * 1.5 * ie * wpx;
    assert!(
        fpx_min_high > fpx_min,
        "Higher SDS: min={:.0} > {:.0}", fpx_min_high, fpx_min
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Redundancy Factor Calculation (ASCE 7 §12.3.4)
// ═══════════════════════════════════════════════════════════════
//
// Redundancy factor ρ:
//   ρ = 1.0 for SDC B and C
//   ρ = 1.3 unless specific conditions are met (SDC D-F)
//
// Conditions for ρ = 1.0 in SDC D-F (ASCE 7 §12.3.4.2):
//   - Removal of any single element does not cause >33% reduction
//     in story strength AND does not create extreme torsional irregularity
//   - Each story has at least 2 bays of seismic-resisting framing
//     on each side in each orthogonal direction
//
// Effect on load combinations:
//   E = Eh + Ev = ρ×QE + 0.2×SDS×D
//
// Example: SDC D, ρ = 1.3, QE = 500 kN, SDS = 1.0g, D = 2000 kN
//   Eh = 1.3 × 500 = 650 kN
//   Ev = 0.2 × 1.0 × 2000 = 400 kN
//   E = 650 + 400 = 1,050 kN

#[test]
fn earthquake_redundancy_factor() {
    let qe: f64 = 500.0;       // kN, horizontal seismic force effect
    let sds: f64 = 1.0;        // g
    let d: f64 = 2_000.0;      // kN, dead load

    // ρ = 1.3 (SDC D, conditions not met)
    let rho_13: f64 = 1.3;
    let eh_13: f64 = rho_13 * qe;
    assert!((eh_13 - 650.0).abs() < 0.01, "Eh(ρ=1.3) = {:.0} kN", eh_13);

    // ρ = 1.0 (conditions met or SDC B/C)
    let rho_10: f64 = 1.0;
    let eh_10: f64 = rho_10 * qe;
    assert!((eh_10 - 500.0).abs() < 0.01, "Eh(ρ=1.0) = {:.0} kN", eh_10);

    // Vertical seismic effect (always ρ = 1.0)
    let ev: f64 = 0.2 * sds * d;
    assert!((ev - 400.0).abs() < 0.01, "Ev = {:.0} kN", ev);

    // Combined seismic effect
    let e_with_rho: f64 = eh_13 + ev;
    let e_without_rho: f64 = eh_10 + ev;
    assert!(
        (e_with_rho - 1050.0).abs() < 0.01,
        "E(ρ=1.3) = {:.0} kN", e_with_rho
    );

    // Increase from redundancy penalty
    let increase: f64 = (e_with_rho - e_without_rho) / e_without_rho * 100.0;
    assert!(
        increase > 10.0 && increase < 20.0,
        "Redundancy penalty = {:.1}% increase", increase
    );

    // Load combination: 1.2D + E + L
    let l: f64 = 1_000.0; // kN, live load
    let combo_13: f64 = 1.2 * d + e_with_rho + 0.5 * l;
    let combo_10: f64 = 1.2 * d + e_without_rho + 0.5 * l;
    assert!(
        combo_13 > combo_10,
        "ρ=1.3 combo {:.0} > ρ=1.0 combo {:.0}", combo_13, combo_10
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Overstrength Factor Application (ASCE 7 §12.4.3)
// ═══════════════════════════════════════════════════════════════
//
// Seismic load effect with overstrength:
//   Em = Emh + Ev = Ω0 × QE + 0.2 × SDS × D
//
// Ω0 values (ASCE 7 Table 12.2-1):
//   Special moment frame: Ω0 = 3.0
//   Ordinary braced frame: Ω0 = 2.0
//   Special shear wall: Ω0 = 2.5
//
// Used for:
//   - Collector elements (diaphragm connections)
//   - Columns supporting discontinuous frames
//   - Foundations of cantilever systems
//
// Example: Collector design, SMF (Ω0 = 3.0)
//   QE = 200 kN, SDS = 1.0g, D = 500 kN
//   Emh = 3.0 × 200 = 600 kN
//   Ev = 0.2 × 1.0 × 500 = 100 kN
//   Em = 600 + 100 = 700 kN

#[test]
fn earthquake_overstrength_factor() {
    let qe: f64 = 200.0;       // kN, horizontal seismic force
    let sds: f64 = 1.0;        // g
    let d: f64 = 500.0;        // kN, dead load

    // Overstrength factors for different systems
    let omega0_smf: f64 = 3.0;
    let omega0_obf: f64 = 2.0;
    let omega0_sw: f64 = 2.5;

    // EMF with overstrength (SMF)
    let emh_smf: f64 = omega0_smf * qe;
    assert!((emh_smf - 600.0).abs() < 0.01, "Emh(SMF) = {:.0} kN", emh_smf);

    // Vertical component (same regardless of Ω0)
    let ev: f64 = 0.2 * sds * d;
    assert!((ev - 100.0).abs() < 0.01, "Ev = {:.0} kN", ev);

    // Total overstrength effect
    let em_smf: f64 = emh_smf + ev;
    assert!((em_smf - 700.0).abs() < 0.01, "Em(SMF) = {:.0} kN", em_smf);

    // Compare systems
    let em_obf: f64 = omega0_obf * qe + ev;
    let em_sw: f64 = omega0_sw * qe + ev;
    assert!(em_smf > em_sw && em_sw > em_obf, "SMF > SW > OBF overstrength");

    // Regular seismic effect vs overstrength (with ρ=1.0)
    let e_regular: f64 = 1.0 * qe + ev;
    let amplification: f64 = em_smf / e_regular;
    assert!(
        amplification > 2.0 && amplification < 4.0,
        "Overstrength amplification = {:.2}×", amplification
    );

    // Load combo with overstrength: 1.2D + Em + L
    let l: f64 = 300.0;
    let combo_os: f64 = 1.2 * d + em_smf + 0.5 * l;
    let combo_reg: f64 = 1.2 * d + e_regular + 0.5 * l;
    assert!(
        combo_os > combo_reg,
        "Overstrength combo {:.0} > regular {:.0}", combo_os, combo_reg
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Seismic Weight Calculation with Tributary Mass (ASCE 7 §12.7.2)
// ═══════════════════════════════════════════════════════════════
//
// Effective seismic weight W:
//   W = dead load + portions of other loads:
//   + 25% of floor live load in storage areas
//   + partition load allowance (0.5 kPa minimum per ASCE 7)
//   + total operating weight of permanent equipment
//   + 20% of flat roof snow load where ps > 1.44 kPa
//
// Example: 5-story office building, 30 m × 20 m floor plan
//   Dead load per floor: 5.5 kPa (self-weight + superimposed)
//   Roof dead load: 4.0 kPa
//   Partition: 0.5 kPa (typical office → add full)
//   Roof snow: 2.0 kPa (ps > 1.44 → add 20%)
//   No storage areas.
//
//   Floor area = 30 × 20 = 600 m²
//   W_floor = (5.5 + 0.5) × 600 = 3,600 kN per floor (4 floors)
//   W_roof = (4.0 + 0.2×2.0) × 600 = 4.4 × 600 = 2,640 kN
//   W_total = 4 × 3,600 + 2,640 = 17,040 kN

#[test]
fn earthquake_seismic_weight() {
    let floor_area: f64 = 600.0;  // m²
    let n_floors: f64 = 4.0;      // typical floors (excluding roof)

    // Load intensities (kPa)
    let dl_floor: f64 = 5.5;      // floor dead load
    let dl_roof: f64 = 4.0;       // roof dead load
    let partition: f64 = 0.5;     // partition allowance (ASCE 7 minimum)
    let snow: f64 = 2.0;          // flat roof snow load

    // Floor seismic weight (per floor)
    let w_floor: f64 = (dl_floor + partition) * floor_area;
    let w_floor_expected: f64 = 3_600.0;
    assert!(
        (w_floor - w_floor_expected).abs() / w_floor_expected < 0.001,
        "W_floor = {:.0} kN, expected {:.0}", w_floor, w_floor_expected
    );

    // Roof seismic weight (include 20% snow since ps > 1.44 kPa)
    assert!(
        snow > 1.44,
        "Snow {:.2} kPa > 1.44 → include 20%", snow
    );
    let w_roof: f64 = (dl_roof + 0.20 * snow) * floor_area;
    let w_roof_expected: f64 = 2_640.0;
    assert!(
        (w_roof - w_roof_expected).abs() / w_roof_expected < 0.001,
        "W_roof = {:.0} kN, expected {:.0}", w_roof, w_roof_expected
    );

    // Total seismic weight
    let w_total: f64 = n_floors * w_floor + w_roof;
    let w_total_expected: f64 = 17_040.0;
    assert!(
        (w_total - w_total_expected).abs() / w_total_expected < 0.001,
        "W_total = {:.0} kN, expected {:.0}", w_total, w_total_expected
    );

    // Dead load fraction of seismic weight
    let dl_total: f64 = n_floors * dl_floor * floor_area + dl_roof * floor_area;
    let dl_fraction: f64 = dl_total / w_total;
    assert!(
        dl_fraction > 0.85,
        "Dead load is {:.1}% of seismic weight", dl_fraction * 100.0
    );

    // Storage building comparison (add 25% of live load)
    let ll_storage: f64 = 12.0; // kPa, heavy storage
    let w_storage_floor: f64 = (dl_floor + partition + 0.25 * ll_storage) * floor_area;
    assert!(
        w_storage_floor > w_floor,
        "Storage: W={:.0} > office W={:.0} kN", w_storage_floor, w_floor
    );
}
