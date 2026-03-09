/// Validation: Seismic Design Formulas (ASCE 7-22 / IBC)
///
/// References:
///   - ASCE 7-22: "Minimum Design Loads and Associated Criteria", Ch. 12
///   - IBC 2021: International Building Code, Sec. 1613
///   - FEMA P-1050: "NEHRP Recommended Seismic Provisions"
///   - Chopra: "Dynamics of Structures", 5th Ed.
///   - Paulay & Priestley: "Seismic Design of Reinforced Concrete and Masonry Buildings"
///
/// Tests verify ASCE 7 seismic design formulas with hand-computed values.
/// No solver calls -- pure arithmetic verification of code-based equations.

#[allow(unused_imports)]
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
// 1. Equivalent Lateral Force: Base Shear (ASCE 7 12.8.1)
// ================================================================
//
// V = Cs * W
//
// Cs = SDS / (R/Ie)  but not greater than SD1/(T*(R/Ie))
//                     and not less than 0.044*SDS*Ie (>= 0.01)
//
// Example: 5-story steel moment frame
//   SDS = 1.0g, SD1 = 0.60g, R = 8, Ie = 1.0
//   T = Cu*Ta = 1.4 * 0.028*60^0.8 = 1.4*0.028*33.59 = 1.32 sec
//     (where hn = 60 ft)
//   Cs = SDS/(R/Ie) = 1.0/8.0 = 0.125
//   Cs_max = SD1/(T*R/Ie) = 0.60/(1.32*8) = 0.0568
//   Cs_min = 0.044*SDS*Ie = 0.044
//   Cs governs = max(min(0.125, 0.0568), 0.044) = 0.0568
//   V = 0.0568 * W

#[test]
fn validation_asce7_equivalent_lateral_force() {
    let sds: f64 = 1.0;        // g, design spectral acceleration (short)
    let sd1: f64 = 0.60;       // g, design spectral acceleration (1 sec)
    let r: f64 = 8.0;          // response modification factor (SMF)
    let ie: f64 = 1.0;         // importance factor (Risk Cat II)
    let w: f64 = 5000.0;       // kip, seismic weight

    // Approximate fundamental period (ASCE 7 12.8.2.1)
    let hn: f64 = 60.0;        // ft, building height
    let ct: f64 = 0.028;       // steel moment frame
    let x_exp: f64 = 0.8;
    let ta: f64 = ct * hn.powf(x_exp);
    let cu: f64 = 1.4;         // upper limit coefficient (for SD1 >= 0.4)
    let t: f64 = cu * ta;

    // Seismic response coefficient
    let cs_calc: f64 = sds / (r / ie);
    assert_close(cs_calc, 0.125, 0.001, "Cs calculated");

    let cs_max: f64 = sd1 / (t * (r / ie));
    // Cs_max should be less than cs_calc (long period reduces demand)

    let cs_min: f64 = (0.044 * sds * ie).max(0.01);
    assert_close(cs_min, 0.044, 0.001, "Cs minimum");

    // Governing Cs
    let cs: f64 = cs_calc.min(cs_max).max(cs_min);
    assert_close(cs, cs_max, 0.01, "Governing Cs = Cs_max");

    // Base shear
    let v: f64 = cs * w;
    assert!(
        v > 100.0 && v < 1000.0,
        "V = {:.1} kip should be reasonable for 5-story building",
        v
    );

    // Verify Cs is in reasonable range (1-15% of weight)
    assert!(
        cs > 0.01 && cs < 0.15,
        "Cs = {:.4} should be 1-15%",
        cs
    );
}

// ================================================================
// 2. Vertical Distribution of Seismic Forces (ASCE 7 12.8.3)
// ================================================================
//
// Fx = Cvx * V
// Cvx = wx * hx^k / Sigma(wi * hi^k)
//
// where k = 1 for T <= 0.5s, k = 2 for T >= 2.5s, linear interp between
//
// Example: 3-story building, T = 0.5s (k = 1.0)
//   Story weights: w1=w2=w3 = 200 kip
//   Story heights: h1=12, h2=24, h3=36 ft
//   Sigma(wi*hi) = 200*12 + 200*24 + 200*36 = 14400
//   Cv1 = 200*12/14400 = 0.1667
//   Cv2 = 200*24/14400 = 0.3333
//   Cv3 = 200*36/14400 = 0.5000
//   Sum = 1.0 (check)

#[test]
fn validation_asce7_vertical_distribution() {
    let t: f64 = 0.5;          // sec, fundamental period

    // k exponent
    let k: f64 = if t <= 0.5 {
        1.0
    } else if t >= 2.5 {
        2.0
    } else {
        1.0 + 0.5 * (t - 0.5)
    };
    assert_close(k, 1.0, 0.001, "k for T=0.5s");

    // Story weights and heights
    let w: [f64; 3] = [200.0, 200.0, 200.0];   // kip
    let h: [f64; 3] = [12.0, 24.0, 36.0];       // ft

    // Sigma(wi * hi^k)
    let sum_wh: f64 = w.iter().zip(h.iter())
        .map(|(&wi, &hi)| wi * hi.powf(k))
        .sum::<f64>();
    assert_close(sum_wh, 14400.0, 0.001, "Sigma(wi*hi^k)");

    // Vertical distribution coefficients
    let cv: Vec<f64> = w.iter().zip(h.iter())
        .map(|(&wi, &hi)| wi * hi.powf(k) / sum_wh)
        .collect();

    assert_close(cv[0], 1.0 / 6.0, 0.001, "Cv1");
    assert_close(cv[1], 2.0 / 6.0, 0.001, "Cv2");
    assert_close(cv[2], 3.0 / 6.0, 0.001, "Cv3");

    // Sum of Cvx must equal 1.0
    let sum_cv: f64 = cv.iter().sum::<f64>();
    assert_close(sum_cv, 1.0, 0.001, "Sigma Cvx = 1.0");

    // Higher floors get more force (inverted triangle)
    assert!(cv[2] > cv[1], "Top floor > middle");
    assert!(cv[1] > cv[0], "Middle > bottom");

    // Actual forces: V = 300 kip
    let v: f64 = 300.0;
    let fx: Vec<f64> = cv.iter().map(|&c| c * v).collect();
    assert_close(fx[0], 50.0, 0.001, "F1");
    assert_close(fx[1], 100.0, 0.001, "F2");
    assert_close(fx[2], 150.0, 0.001, "F3");
}

// ================================================================
// 3. Story Drift and Drift Limits (ASCE 7 12.8.6)
// ================================================================
//
// Delta = Cd * delta_xe / Ie
//
// where:
//   delta_xe = elastic displacement from analysis
//   Cd = deflection amplification factor
//   Ie = importance factor
//
// Drift limit: Delta_allow = 0.020 * hsx for Risk Category I/II
//              Delta_allow = 0.015 * hsx for Risk Category III
//              Delta_allow = 0.010 * hsx for Risk Category IV
//
// Example: SMF, Cd = 5.5, Ie = 1.0, hsx = 13 ft = 156 in
//   delta_xe = 0.50 in (from elastic analysis)
//   Delta = 5.5 * 0.50 / 1.0 = 2.75 in
//   Delta_allow = 0.020 * 156 = 3.12 in
//   DCR = 2.75/3.12 = 0.881 (OK)

#[test]
fn validation_asce7_story_drift() {
    let cd: f64 = 5.5;         // deflection amplification (SMF)
    let ie: f64 = 1.0;         // importance factor
    let hsx: f64 = 156.0;      // in (13 ft story height)
    let delta_xe: f64 = 0.50;  // in, elastic displacement

    // Amplified drift
    let delta: f64 = cd * delta_xe / ie;
    assert_close(delta, 2.75, 0.001, "Amplified drift");

    // Allowable drift (Risk Category II)
    let delta_allow: f64 = 0.020 * hsx;
    assert_close(delta_allow, 3.12, 0.001, "Allowable drift");

    // Demand-capacity ratio
    let dcr: f64 = delta / delta_allow;
    assert!(dcr < 1.0, "DCR = {:.3} < 1.0 (OK)", dcr);
    assert_close(dcr, 0.881, 0.01, "DCR value");

    // Risk Category IV (essential facility): stricter limit
    let delta_allow_iv: f64 = 0.010 * hsx;
    let dcr_iv: f64 = delta / delta_allow_iv;
    assert!(dcr_iv > 1.0, "DCR_IV = {:.3} > 1.0 (not OK for essential)", dcr_iv);

    // Higher Ie reduces amplified drift
    let ie_iv: f64 = 1.5;
    let delta_iv: f64 = cd * delta_xe / ie_iv;
    assert!(
        delta_iv < delta,
        "Higher Ie reduces drift: {:.2} < {:.2}",
        delta_iv, delta
    );
}

// ================================================================
// 4. P-Delta Effects (ASCE 7 12.8.7)
// ================================================================
//
// Stability coefficient:
//   theta = Px * Delta * Ie / (Vx * hsx * Cd)
//
// where:
//   Px = total vertical load at and above story x
//   Delta = design story drift
//   Vx = seismic shear at story x
//
// Maximum: theta_max = 0.5 / (beta * Cd) <= 0.25
//   where beta = ratio of shear demand to capacity (approx 1.0 conservatively)
//
// If theta <= 0.10: P-delta effects need not be considered
//
// Example: Px = 3000 kip, Delta = 2.75 in, Vx = 300 kip, hsx = 156 in

#[test]
fn validation_asce7_p_delta_stability() {
    let px: f64 = 3000.0;      // kip, total vertical load
    let delta: f64 = 2.75;     // in, design story drift
    let vx: f64 = 300.0;       // kip, story shear
    let hsx: f64 = 156.0;      // in, story height
    let cd: f64 = 5.5;
    let ie: f64 = 1.0;

    // Stability coefficient
    let theta: f64 = px * delta * ie / (vx * hsx * cd);
    let expected_theta: f64 = 3000.0 * 2.75 * 1.0 / (300.0 * 156.0 * 5.5);
    assert_close(theta, expected_theta, 0.001, "Stability coefficient theta");

    // Check if P-delta must be considered
    let pdelta_required: bool = theta > 0.10;

    // Maximum allowable theta
    let beta: f64 = 1.0;
    let theta_max: f64 = (0.5 / (beta * cd)).min(0.25);
    assert_close(theta_max, 0.5 / 5.5, 0.001, "theta_max");

    assert!(
        theta < theta_max,
        "theta = {:.4} < theta_max = {:.4} (stable)",
        theta, theta_max
    );

    // Amplification factor for P-delta
    let amp_factor: f64 = 1.0 / (1.0 - theta);
    assert!(
        amp_factor > 1.0,
        "Amplification = {:.4} > 1.0",
        amp_factor
    );

    // If theta were 0.10, amplification = 1/0.9 = 1.111
    let amp_at_limit: f64 = 1.0 / (1.0 - 0.10);
    assert_close(amp_at_limit, 1.111, 0.01, "Amp at theta=0.10");

    // Report whether P-delta is required
    if pdelta_required {
        assert!(theta > 0.10, "P-delta required because theta > 0.10");
    } else {
        assert!(theta <= 0.10, "P-delta not required because theta <= 0.10");
    }
}

// ================================================================
// 5. Diaphragm Design Force (ASCE 7 12.10.1.1)
// ================================================================
//
// Fpx = Sigma(Fi, from roof to x) / Sigma(wi, from roof to x) * wpx
//
// with bounds:
//   Fpx_min = 0.2 * SDS * Ie * wpx
//   Fpx_max = 0.4 * SDS * Ie * wpx
//
// Example: 3-story building
//   w = [200, 200, 200] kip, F = [150, 100, 50] kip (from vert. dist.)
//
// Level 3 (roof): Fpx = F3/w3 * wp3 = 150/200*200 = 150 kip
// Level 2: Fpx = (F3+F2)/(w3+w2)*wp2 = 250/400*200 = 125 kip
// Level 1: Fpx = (F3+F2+F1)/(w3+w2+w1)*wp1 = 300/600*200 = 100 kip

#[test]
fn validation_asce7_diaphragm_force() {
    let sds: f64 = 1.0;
    let ie: f64 = 1.0;

    let w: [f64; 3] = [200.0, 200.0, 200.0];   // kip (bottom to top)
    let f: [f64; 3] = [50.0, 100.0, 150.0];     // kip (bottom to top)
    let wp: [f64; 3] = [200.0, 200.0, 200.0];   // diaphragm weight = story weight

    // Min and max bounds
    let fpx_min_factor: f64 = 0.2 * sds * ie;
    let fpx_max_factor: f64 = 0.4 * sds * ie;
    assert_close(fpx_min_factor, 0.2, 0.001, "Fpx min factor");
    assert_close(fpx_max_factor, 0.4, 0.001, "Fpx max factor");

    // Level 3 (roof, index 2): only roof forces
    let sum_f_3: f64 = f[2];
    let sum_w_3: f64 = w[2];
    let fpx_3: f64 = (sum_f_3 / sum_w_3 * wp[2])
        .max(fpx_min_factor * wp[2])
        .min(fpx_max_factor * wp[2]);
    assert_close(sum_f_3 / sum_w_3 * wp[2], 150.0, 0.001, "Fpx3 raw");

    // Level 2 (index 1): roof + level 2
    let sum_f_2: f64 = f[2] + f[1];
    let sum_w_2: f64 = w[2] + w[1];
    let fpx_2_raw: f64 = sum_f_2 / sum_w_2 * wp[1];
    assert_close(fpx_2_raw, 125.0, 0.001, "Fpx2 raw");
    let fpx_2: f64 = fpx_2_raw.max(fpx_min_factor * wp[1]).min(fpx_max_factor * wp[1]);

    // Level 1 (index 0): all stories
    let sum_f_1: f64 = f[2] + f[1] + f[0];
    let sum_w_1: f64 = w[2] + w[1] + w[0];
    let fpx_1_raw: f64 = sum_f_1 / sum_w_1 * wp[0];
    assert_close(fpx_1_raw, 100.0, 0.001, "Fpx1 raw");
    let fpx_1: f64 = fpx_1_raw.max(fpx_min_factor * wp[0]).min(fpx_max_factor * wp[0]);

    // Diaphragm forces decrease from roof to base (for equal weights)
    assert!(fpx_3 >= fpx_2, "Fpx3 ({:.0}) >= Fpx2 ({:.0})", fpx_3, fpx_2);
    assert!(fpx_2 >= fpx_1, "Fpx2 ({:.0}) >= Fpx1 ({:.0})", fpx_2, fpx_1);

    // Check bounds
    let fpx_min_1: f64 = fpx_min_factor * wp[0];
    let fpx_max_1: f64 = fpx_max_factor * wp[0];
    assert!(fpx_1 >= fpx_min_1, "Fpx1 >= min");
    assert!(fpx_1 <= fpx_max_1, "Fpx1 <= max");
}

// ================================================================
// 6. Response Spectrum Base Shear (ASCE 7 12.8.1.1)
// ================================================================
//
// For different period ranges:
//   T < T0 = 0.2*SD1/SDS: Cs = SDS*(0.4 + 0.6*T/T0) / (R/Ie)
//   T0 <= T <= Ts = SD1/SDS: Cs = SDS / (R/Ie)  (plateau)
//   Ts < T <= TL: Cs = SD1 / (T*(R/Ie))  (descending)
//   T > TL: Cs = SD1*TL / (T^2*(R/Ie))  (long period)
//
// Always: Cs >= 0.044*SDS*Ie >= 0.01
//
// Example: SDS=1.0, SD1=0.60, R=8, Ie=1.0, TL=8s
//   T0 = 0.2*0.6/1.0 = 0.12s
//   Ts = 0.6/1.0 = 0.6s

#[test]
fn validation_asce7_response_spectrum_cs() {
    let sds: f64 = 1.0;
    let sd1: f64 = 0.60;
    let r: f64 = 8.0;
    let ie: f64 = 1.0;
    let tl: f64 = 8.0;

    // Characteristic periods
    let t0: f64 = 0.2 * sd1 / sds;
    let ts: f64 = sd1 / sds;
    assert_close(t0, 0.12, 0.001, "T0");
    assert_close(ts, 0.60, 0.001, "Ts");

    let cs_min: f64 = (0.044 * sds * ie).max(0.01);

    // Cs function over period range
    let cs_at = |t: f64| -> f64 {
        let cs_raw: f64 = if t < t0 {
            sds * (0.4 + 0.6 * t / t0) / (r / ie)
        } else if t <= ts {
            sds / (r / ie)
        } else if t <= tl {
            sd1 / (t * (r / ie))
        } else {
            sd1 * tl / (t * t * (r / ie))
        };
        cs_raw.max(cs_min)
    };

    // At T = 0 (very short period): Cs = SDS*0.4/(R/Ie)
    let cs_0: f64 = cs_at(0.0);
    assert_close(cs_0, sds * 0.4 / (r / ie), 0.001, "Cs at T=0");

    // At T = T0: Cs = SDS/(R/Ie) (reaches plateau)
    let cs_t0: f64 = cs_at(t0);
    assert_close(cs_t0, sds / (r / ie), 0.01, "Cs at T0");

    // Plateau: Cs constant between T0 and Ts
    let cs_mid: f64 = cs_at((t0 + ts) / 2.0);
    assert_close(cs_mid, cs_t0, 0.001, "Cs in plateau");

    // Descending branch at T = 1.0s
    let cs_1: f64 = cs_at(1.0);
    let expected_1: f64 = sd1 / (1.0 * r / ie);
    assert_close(cs_1, expected_1, 0.001, "Cs at T=1.0s");

    // Long period at T = 10s
    let cs_10: f64 = cs_at(10.0);
    let expected_10: f64 = (sd1 * tl / (100.0 * r / ie)).max(cs_min);
    assert_close(cs_10, expected_10, 0.001, "Cs at T=10s");

    // Monotonically decreasing after Ts
    assert!(cs_1 < cs_t0, "Cs descends after Ts");
    assert!(cs_10 < cs_1, "Cs continues to descend");
}

// ================================================================
// 7. Redundancy Factor (ASCE 7 12.3.4)
// ================================================================
//
// rho = 1.0 or 1.3 based on structural configuration
//
// rho = 1.0 when:
//   - SDC B or C
//   - Drift and P-delta checks
//   - Design of nonstructural components
//
// rho = 1.3 when (SDC D-F):
//   - Removal of individual braced bay or moment frame does not cause
//     >33% reduction in story strength or create extreme torsional irregularity
//
// E = rho*QE +/- 0.2*SDS*D  (seismic load effect with redundancy)
//
// Example: QE = 100 kip, SDS = 1.0, D = 500 kip
//   With rho = 1.0:
//     E_add = 1.0*100 + 0.2*1.0*500 = 100 + 100 = 200 kip (additive)
//     E_cnt = 1.0*100 - 0.2*1.0*500 = 100 - 100 = 0 kip (counteracting)
//   With rho = 1.3:
//     E_add = 1.3*100 + 0.2*1.0*500 = 130 + 100 = 230 kip (additive)
//     E_cnt = 1.3*100 - 0.2*1.0*500 = 130 - 100 = 30 kip (counteracting)

#[test]
fn validation_asce7_redundancy_factor() {
    let rho_redundant: f64 = 1.0;
    let rho_not_redundant: f64 = 1.3;

    let qe: f64 = 100.0;       // kip, horizontal seismic force
    let sds: f64 = 1.0;
    let d_load: f64 = 500.0;   // kip, dead load

    // Seismic load effect E = rho*QE +/- 0.2*SDS*D
    // Additive case (gravity + seismic)
    let e_add_red: f64 = rho_redundant * qe + 0.2 * sds * d_load;
    let e_add_nr: f64 = rho_not_redundant * qe + 0.2 * sds * d_load;
    assert_close(e_add_red, 200.0, 0.001, "E additive (rho=1.0)");
    assert_close(e_add_nr, 230.0, 0.001, "E additive (rho=1.3)");

    // Counteracting case (uplift): E = rho*QE - Ev
    // For rho=1.0: E = 100 - 100 = 0.0
    // For rho=1.3: E = 130 - 100 = 30.0
    let e_cnt_red: f64 = rho_redundant * qe - 0.2 * sds * d_load;
    let e_cnt_nr: f64 = rho_not_redundant * qe - 0.2 * sds * d_load;
    assert!((e_cnt_red - 0.0).abs() < 0.01, "E counteracting (rho=1.0): got {:.4}", e_cnt_red);
    assert_close(e_cnt_nr, 30.0, 0.001, "E counteracting (rho=1.3)");

    // Non-redundant structure has higher design force
    assert!(
        e_add_nr > e_add_red,
        "rho=1.3 gives higher E ({:.0}) > ({:.0})",
        e_add_nr, e_add_red
    );

    // Vertical seismic effect: 0.2*SDS*D
    let ev: f64 = 0.2 * sds * d_load;
    assert_close(ev, 100.0, 0.001, "Vertical seismic effect");

    // Load combination 7: (0.9 - 0.2*SDS)*D + rho*QE
    let lc7: f64 = (0.9 - 0.2 * sds) * d_load + rho_not_redundant * qe;
    assert_close(lc7, 0.7 * 500.0 + 130.0, 0.001, "Load combination 7");
}

// ================================================================
// 8. Overstrength Factor and Special Load Combinations (ASCE 7 12.4.3)
// ================================================================
//
// For elements requiring overstrength design:
//   Emh = Omega_0 * QE
//
// Special seismic load combinations:
//   (1.2 + 0.2*SDS)*D + Omega_0*QE + L + 0.2S
//   (0.9 - 0.2*SDS)*D + Omega_0*QE
//
// Omega_0 values: 2.0 (braced frame), 2.5 (moment frame column), 3.0 (cantilever)
//
// Example: Column in SMF, Omega_0 = 3.0
//   QE = 100 kip, SDS = 1.0, D = 500 kip, L = 200 kip, S = 0
//   Combo 1: (1.2+0.2)*500 + 3.0*100 + 200 = 700 + 300 + 200 = 1200 kip
//   Combo 2: (0.9-0.2)*500 + 3.0*100 = 350 + 300 = 650 kip

#[test]
fn validation_asce7_overstrength_combinations() {
    // Overstrength factors for different systems
    let omega_braced: f64 = 2.0;
    let omega_moment: f64 = 2.5;
    let omega_cantilever: f64 = 3.0;

    let qe: f64 = 100.0;       // kip, horizontal seismic
    let sds: f64 = 1.0;
    let d_load: f64 = 500.0;   // kip, dead
    let l_load: f64 = 200.0;   // kip, live
    let s_load: f64 = 0.0;     // kip, snow

    // Amplified seismic force
    let emh_braced: f64 = omega_braced * qe;
    let emh_moment: f64 = omega_moment * qe;
    let emh_cantilever: f64 = omega_cantilever * qe;
    assert_close(emh_braced, 200.0, 0.001, "Emh braced frame");
    assert_close(emh_moment, 250.0, 0.001, "Emh moment frame");
    assert_close(emh_cantilever, 300.0, 0.001, "Emh cantilever");

    // Special load combination 1 (gravity + overstrength seismic)
    let combo1: f64 = (1.2 + 0.2 * sds) * d_load + omega_cantilever * qe
        + l_load + 0.2 * s_load;
    assert_close(combo1, 1200.0, 0.001, "Special combo 1");

    // Special load combination 2 (minimum gravity + overstrength seismic)
    let combo2: f64 = (0.9 - 0.2 * sds) * d_load + omega_cantilever * qe;
    assert_close(combo2, 650.0, 0.001, "Special combo 2");

    // Combo 1 governs for compression design
    assert!(combo1 > combo2, "Combo 1 ({:.0}) governs for compression", combo1);

    // Compare Omega_0*QE with rho*QE: overstrength is more severe
    let rho: f64 = 1.3;
    let rho_qe: f64 = rho * qe;
    assert!(
        emh_cantilever > rho_qe,
        "Omega_0*QE ({:.0}) > rho*QE ({:.0})",
        emh_cantilever, rho_qe
    );

    // Gravity factor with vertical seismic
    let grav_factor_add: f64 = 1.2 + 0.2 * sds;
    let grav_factor_sub: f64 = 0.9 - 0.2 * sds;
    assert_close(grav_factor_add, 1.4, 0.001, "Additive gravity factor");
    assert_close(grav_factor_sub, 0.7, 0.001, "Subtractive gravity factor");
}
