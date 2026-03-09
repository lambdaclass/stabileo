/// Validation: Fatigue Assessment
///
/// References:
///   - EN 1993-1-9:2005: Fatigue (Eurocode 3 Part 1-9)
///   - AISC 360-22 Appendix 3: Fatigue
///   - AASHTO LRFD Bridge Design Specifications 9th ed. §6.6
///   - Fisher, Kulak, Smith: "A Fatigue Primer for Structural Engineers"
///   - Miner (1945): "Cumulative Damage in Fatigue"
///
/// Tests verify S-N curves, Palmgren-Miner cumulative damage rule,
/// fatigue category classification, and endurance limits.

// ================================================================
// Helper: compute cycles to failure on the m=3 portion of an EC3
// S-N curve.  N = (Δσ_C / Δσ)^m * 2×10⁶
// ================================================================
fn ec3_cycles_m3(delta_sigma_c: f64, delta_sigma: f64) -> f64 {
    (delta_sigma_c / delta_sigma).powi(3) * 2.0e6
}

// ================================================================
// Helper: compute cycles to failure on the m=5 portion (between
// CAFL and cut-off limit) of an EC3 S-N curve.
// N = (Δσ_D / Δσ)^5 * 5×10⁶
// ================================================================
fn ec3_cycles_m5(delta_sigma_d: f64, delta_sigma: f64) -> f64 {
    (delta_sigma_d / delta_sigma).powi(5) * 5.0e6
}

// ================================================================
// 1. EC3-1-9 Detail Category C71 — S-N Curve (m = 3 branch)
// ================================================================
//
// EN 1993-1-9 Table 8.1, Detail Category 71 (butt weld, full
// penetration, ground flush, NDT inspected).
//
// S-N relationship for N ≤ 5×10⁶ cycles:
//   N = (Δσ_C / Δσ)^3 × 2×10⁶
//
// At Δσ = 100 MPa:
//   N = (71/100)^3 × 2×10⁶
//     = 0.357911 × 2×10⁶
//     = 715,822  (≈ 716,282 with more precise rounding)

#[test]
fn validation_ec3_detail_category_c71_sn_curve() {
    let delta_sigma_c: f64 = 71.0; // MPa — detail category
    let m: i32 = 3;
    let n_ref: f64 = 2.0e6; // reference cycle count
    let delta_sigma: f64 = 100.0; // MPa — applied stress range

    // Step-by-step calculation
    let ratio: f64 = delta_sigma_c / delta_sigma; // 0.71
    let ratio_cubed = ratio.powi(m); // 0.71^3 = 0.357911
    let n_expected = ratio_cubed * n_ref; // 715,822

    // Compute via helper
    let n_calc = ec3_cycles_m3(delta_sigma_c, delta_sigma);

    // Verify intermediate steps
    let ratio_err = (ratio - 0.71).abs() / 0.71;
    assert!(ratio_err < 0.01, "ratio: {:.6}, expected ~0.71", ratio);

    let cubed_exact = 0.71_f64.powi(3);
    let cubed_err = (ratio_cubed - cubed_exact).abs() / cubed_exact;
    assert!(cubed_err < 1e-10, "ratio^3 mismatch");

    // Final result within 1% of hand calculation
    let rel_err = (n_calc - n_expected).abs() / n_expected;
    assert!(
        rel_err < 0.01,
        "EC3 C71 S-N: N_calc={:.0}, N_expected={:.0}, err={:.4}%",
        n_calc, n_expected, rel_err * 100.0
    );

    // Sanity: result should be in the hundreds-of-thousands range
    assert!(n_calc > 500_000.0 && n_calc < 1_000_000.0,
        "N={:.0} out of plausible range for C71 at 100 MPa", n_calc);
}

// ================================================================
// 2. EC3-1-9 Constant Amplitude Fatigue Limit (CAFL)
// ================================================================
//
// The CAFL Δσ_D is the stress range at N = 5×10⁶ on the m=3 curve:
//   Δσ_D = (2/5)^(1/3) × Δσ_C = 0.7368 × Δσ_C
//
// For C71: Δσ_D = 0.7368 × 71 = 52.31 MPa
//
// Below this stress range, under constant-amplitude loading, fatigue
// life is theoretically infinite.

#[test]
fn validation_ec3_constant_amplitude_fatigue_limit() {
    let delta_sigma_c = 71.0; // MPa

    // Derivation: at N_D = 5×10⁶, from N = (Δσ_C/Δσ)^3 × 2×10⁶
    //   5×10⁶ = (Δσ_C / Δσ_D)^3 × 2×10⁶
    //   (Δσ_C / Δσ_D)^3 = 5/2
    //   Δσ_D = Δσ_C × (2/5)^(1/3)
    let factor = (2.0_f64 / 5.0).powf(1.0 / 3.0);
    let delta_sigma_d = factor * delta_sigma_c;

    // Expected factor value: (0.4)^(1/3) ≈ 0.7368
    let factor_err = (factor - 0.7368).abs() / 0.7368;
    assert!(factor_err < 0.001,
        "CAFL factor: {:.6}, expected ~0.7368", factor);

    // Expected CAFL for C71 ≈ 52.31 MPa
    let expected_cafl = 52.31;
    let rel_err = (delta_sigma_d - expected_cafl).abs() / expected_cafl;
    assert!(
        rel_err < 0.01,
        "CAFL: Δσ_D={:.2} MPa, expected={:.2} MPa, err={:.4}%",
        delta_sigma_d, expected_cafl, rel_err * 100.0
    );

    // Verify consistency: at Δσ = Δσ_D, N should equal 5×10⁶
    let n_at_cafl = ec3_cycles_m3(delta_sigma_c, delta_sigma_d);
    let n_err = (n_at_cafl - 5.0e6).abs() / 5.0e6;
    assert!(
        n_err < 0.01,
        "N at CAFL: {:.0}, expected 5,000,000, err={:.4}%",
        n_at_cafl, n_err * 100.0
    );
}

// ================================================================
// 3. EC3-1-9 Cut-Off Limit
// ================================================================
//
// The cut-off limit Δσ_L is defined at N = 1×10⁸ on the m=5 curve:
//   Δσ_L = (5/100)^(1/5) × Δσ_D
//        = (0.05)^0.2 × Δσ_D
//        ≈ 0.5493 × Δσ_D
//
// Below Δσ_L, no fatigue damage accumulates (even under variable
// amplitude loading).
//
// For C71: Δσ_D ≈ 52.31, Δσ_L ≈ 0.5493 × 52.31 ≈ 28.73 MPa

#[test]
fn validation_ec3_cutoff_limit() {
    let delta_sigma_c = 71.0;

    // First compute CAFL
    let delta_sigma_d = (2.0_f64 / 5.0).powf(1.0 / 3.0) * delta_sigma_c;

    // Cut-off limit derivation:
    // At N_L = 1×10⁸, using m=5 branch: N = (Δσ_D/Δσ)^5 × 5×10⁶
    //   1×10⁸ = (Δσ_D / Δσ_L)^5 × 5×10⁶
    //   (Δσ_D / Δσ_L)^5 = 100/5 = 20
    //   Δσ_L = Δσ_D × (1/20)^(1/5) = Δσ_D × (5/100)^(1/5)
    let cutoff_factor = (5.0_f64 / 100.0).powf(1.0 / 5.0);
    let delta_sigma_l = cutoff_factor * delta_sigma_d;

    // Expected factor ≈ 0.5493
    let factor_err = (cutoff_factor - 0.5493).abs() / 0.5493;
    assert!(factor_err < 0.001,
        "Cut-off factor: {:.6}, expected ~0.5493", cutoff_factor);

    // Expected cut-off for C71 ≈ 28.73 MPa
    let expected_cutoff = 28.73;
    let rel_err = (delta_sigma_l - expected_cutoff).abs() / expected_cutoff;
    assert!(
        rel_err < 0.01,
        "Cut-off: Δσ_L={:.2} MPa, expected={:.2} MPa, err={:.4}%",
        delta_sigma_l, expected_cutoff, rel_err * 100.0
    );

    // Verify: at Δσ = Δσ_L, N on the m=5 curve should equal 1×10⁸
    let n_at_cutoff = ec3_cycles_m5(delta_sigma_d, delta_sigma_l);
    let n_err = (n_at_cutoff - 1.0e8).abs() / 1.0e8;
    assert!(
        n_err < 0.01,
        "N at cut-off: {:.0}, expected 100,000,000, err={:.4}%",
        n_at_cutoff, n_err * 100.0
    );

    // Confirm ordering: Δσ_C > Δσ_D > Δσ_L
    assert!(delta_sigma_c > delta_sigma_d,
        "Δσ_C ({:.2}) must exceed Δσ_D ({:.2})", delta_sigma_c, delta_sigma_d);
    assert!(delta_sigma_d > delta_sigma_l,
        "Δσ_D ({:.2}) must exceed Δσ_L ({:.2})", delta_sigma_d, delta_sigma_l);
}

// ================================================================
// 4. Palmgren-Miner Rule — Simple Three-Block Loading
// ================================================================
//
// Linear damage accumulation: D = Σ(n_i / N_i).
// Failure predicted when D ≥ 1.0.
//
// Detail category C = 71 MPa.
// Load blocks:
//   Block 1: Δσ₁ = 120 MPa, n₁ = 200,000
//   Block 2: Δσ₂ =  90 MPa, n₂ = 500,000
//   Block 3: Δσ₃ =  70 MPa, n₃ = 1,000,000
//
// All stress ranges are above CAFL so m=3 branch applies to all.

#[test]
fn validation_miners_rule_simple() {
    let delta_sigma_c = 71.0;

    // Load blocks: (stress_range_MPa, applied_cycles)
    let blocks: [(f64, f64); 3] = [
        (120.0, 200_000.0),
        (90.0, 500_000.0),
        (70.0, 1_000_000.0),
    ];

    let mut d_total = 0.0;

    // Block 1: Δσ₁ = 120 MPa
    //   N₁ = (71/120)^3 × 2×10⁶ = 0.20726 × 2×10⁶ = 414,528
    //   D₁ = 200,000 / 414,528 = 0.4825
    let n1 = ec3_cycles_m3(delta_sigma_c, blocks[0].0);
    let d1 = blocks[0].1 / n1;
    let n1_expected = 414_528.0;
    let n1_err = (n1 - n1_expected).abs() / n1_expected;
    assert!(n1_err < 0.01,
        "N₁={:.0}, expected≈{:.0}, err={:.4}%", n1, n1_expected, n1_err * 100.0);
    d_total += d1;

    // Block 2: Δσ₂ = 90 MPa
    //   N₂ = (71/90)^3 × 2×10⁶ = 0.49128 × 2×10⁶ = 982,563
    //   D₂ = 500,000 / 982,563 = 0.5089
    let n2 = ec3_cycles_m3(delta_sigma_c, blocks[1].0);
    let d2 = blocks[1].1 / n2;
    let n2_expected = 982_563.0;
    let n2_err = (n2 - n2_expected).abs() / n2_expected;
    assert!(n2_err < 0.01,
        "N₂={:.0}, expected≈{:.0}, err={:.4}%", n2, n2_expected, n2_err * 100.0);
    d_total += d2;

    // Block 3: Δσ₃ = 70 MPa
    //   N₃ = (71/70)^3 × 2×10⁶ = 1.04340 × 2×10⁶ = 2,086,805
    //   D₃ = 1,000,000 / 2,086,805 = 0.4792
    let n3 = ec3_cycles_m3(delta_sigma_c, blocks[2].0);
    let d3 = blocks[2].1 / n3;
    let n3_expected = 2_086_805.0;
    let n3_err = (n3 - n3_expected).abs() / n3_expected;
    assert!(n3_err < 0.01,
        "N₃={:.0}, expected≈{:.0}, err={:.4}%", n3, n3_expected, n3_err * 100.0);
    d_total += d3;

    // Total damage D = D₁ + D₂ + D₃ ≈ 0.4825 + 0.5089 + 0.4792 = 1.4706
    let d_expected = d1 + d2 + d3;
    let d_err = (d_total - d_expected).abs();
    assert!(d_err < 1e-10, "summation check failed");

    // D > 1.0 → failure predicted
    assert!(d_total > 1.0,
        "Miner's D={:.4} should exceed 1.0 (failure)", d_total);

    // Cross-check total damage value (hand calculation)
    let d_hand = 1.47;
    let rel = (d_total - d_hand).abs() / d_hand;
    assert!(rel < 0.01,
        "D_total={:.4}, hand-calc≈{:.2}, err={:.2}%", d_total, d_hand, rel * 100.0);
}

// ================================================================
// 5. Miner's Rule — Cycles Below CAFL Use m=5 Slope
// ================================================================
//
// In variable-amplitude loading, stress ranges between Δσ_D and
// Δσ_L still cause damage on the m=5 branch of the S-N curve:
//   N = (Δσ_D / Δσ)^5 × 5×10⁶
//
// For C71: Δσ_D ≈ 52.31 MPa. Test at Δσ = 40 MPa (above cut-off
// Δσ_L ≈ 28.73 MPa but below CAFL).

#[test]
fn validation_miners_rule_below_cafl() {
    let delta_sigma_c = 71.0;
    let delta_sigma_d = (2.0_f64 / 5.0).powf(1.0 / 3.0) * delta_sigma_c;
    let cutoff_factor = (5.0_f64 / 100.0).powf(1.0 / 5.0);
    let delta_sigma_l = cutoff_factor * delta_sigma_d;

    let delta_sigma = 40.0; // MPa — between Δσ_D and Δσ_L

    // Confirm stress range is in the m=5 region
    assert!(delta_sigma < delta_sigma_d,
        "Δσ={:.1} should be < Δσ_D={:.2}", delta_sigma, delta_sigma_d);
    assert!(delta_sigma > delta_sigma_l,
        "Δσ={:.1} should be > Δσ_L={:.2}", delta_sigma, delta_sigma_l);

    // N = (Δσ_D / Δσ)^5 × 5×10⁶
    let ratio = delta_sigma_d / delta_sigma;
    let n_calc = ratio.powi(5) * 5.0e6;

    // Step-by-step verification
    // ratio = 52.31 / 40 ≈ 1.3078
    let ratio_expected = delta_sigma_d / 40.0;
    assert!((ratio - ratio_expected).abs() < 1e-10);

    // ratio^5 ≈ 1.3078^5 ≈ 3.863
    let ratio_5 = ratio.powi(5);

    // N ≈ 3.863 × 5×10⁶ ≈ 19,315,000
    let n_expected = ratio_5 * 5.0e6;
    let rel_err = (n_calc - n_expected).abs() / n_expected;
    assert!(rel_err < 1e-10, "self-consistency check");

    // Verify via helper function
    let n_helper = ec3_cycles_m5(delta_sigma_d, delta_sigma);
    let helper_err = (n_helper - n_calc).abs() / n_calc;
    assert!(helper_err < 1e-10, "helper function mismatch");

    // N should be substantially larger than 5×10⁶ (because Δσ < Δσ_D)
    assert!(n_calc > 5.0e6,
        "N={:.0} should exceed 5×10⁶ for stress below CAFL", n_calc);
    // And less than 1×10⁸ (cut-off limit)
    assert!(n_calc < 1.0e8,
        "N={:.0} should be below 1×10⁸ (cut-off)", n_calc);

    // Compare m=5 vs m=3 result at the same stress range.
    // m=5 should give significantly more cycles (shallower slope).
    let n_m3 = ec3_cycles_m3(delta_sigma_c, delta_sigma);
    assert!(n_calc > n_m3,
        "m=5 cycles ({:.0}) should exceed m=3 cycles ({:.0}) at Δσ={} MPa",
        n_calc, n_m3, delta_sigma);
}

// ================================================================
// 6. AISC 360-22 Category B — Base Metal at Rolled Surfaces
// ================================================================
//
// AISC Appendix 3, Table A-3.1
// Category B: Base metal and weld metal in members connected by
//             continuous full-penetration groove welds.
//
// S-N relationship: N = C_f / (ΔF_sr)^3
//   C_f = 120 × 10⁸ (ksi³ units)
//   Threshold F_TH = 16 ksi = 110.3 MPa
//
// At ΔF_sr = 20 ksi:
//   N = 120×10⁸ / 20³ = 120×10⁸ / 8000 = 1,500,000 cycles

#[test]
fn validation_aisc_category_b_sn() {
    let cf: f64 = 120.0e8; // ksi³ — AISC constant for Category B
    let threshold_ksi = 16.0; // ksi — fatigue threshold
    let threshold_mpa = threshold_ksi * 6.895; // ≈ 110.3 MPa

    let delta_f_sr: f64 = 20.0; // ksi — applied stress range

    // Confirm above threshold
    assert!(delta_f_sr > threshold_ksi,
        "ΔF_sr={} ksi must exceed threshold={} ksi", delta_f_sr, threshold_ksi);

    // N = C_f / (ΔF_sr)^3
    let n_calc = cf / delta_f_sr.powi(3);

    // Step-by-step
    let denominator = 20.0_f64.powi(3); // 8000
    let denom_err = (denominator - 8000.0).abs();
    assert!(denom_err < 1e-6, "20^3 should be 8000, got {}", denominator);

    let n_expected = 120.0e8 / 8000.0; // = 1,500,000
    let rel_err = (n_calc - n_expected).abs() / n_expected;
    assert!(
        rel_err < 0.01,
        "AISC Cat B: N={:.0}, expected={:.0}, err={:.4}%",
        n_calc, n_expected, rel_err * 100.0
    );

    // Exact value check
    assert!((n_calc - 1_500_000.0).abs() < 1.0,
        "N should be exactly 1,500,000, got {:.2}", n_calc);

    // Verify threshold in MPa
    let threshold_mpa_expected: f64 = 110.3;
    let thresh_err = (threshold_mpa - threshold_mpa_expected).abs() / threshold_mpa_expected;
    assert!(thresh_err < 0.01,
        "Threshold: {:.1} MPa, expected≈{:.1} MPa", threshold_mpa, threshold_mpa_expected);
}

// ================================================================
// 7. AISC 360-22 Category C — Stiffener Welds
// ================================================================
//
// AISC Appendix 3, Table A-3.1
// Category C: Base metal at toe of transverse stiffener-to-flange
//             and stiffener-to-web welds.
//
//   C_f = 44 × 10⁸ (ksi³)
//   Threshold F_TH = 10 ksi = 68.95 MPa
//
// At ΔF_sr = 15 ksi:
//   N = 44×10⁸ / 15³ = 44×10⁸ / 3375 = 1,303,704 cycles

#[test]
fn validation_aisc_category_c_welded() {
    let cf: f64 = 44.0e8; // ksi³ — AISC constant for Category C
    let threshold_ksi = 10.0; // ksi
    let threshold_mpa = threshold_ksi * 6.895; // ≈ 68.95 MPa

    let delta_f_sr: f64 = 15.0; // ksi

    // Confirm above threshold
    assert!(delta_f_sr > threshold_ksi,
        "ΔF_sr={} ksi must exceed threshold={} ksi", delta_f_sr, threshold_ksi);

    // N = C_f / (ΔF_sr)^3
    let n_calc = cf / delta_f_sr.powi(3);

    // Step-by-step
    let denominator = 15.0_f64.powi(3); // 3375
    let denom_err = (denominator - 3375.0).abs();
    assert!(denom_err < 1e-6, "15^3 should be 3375, got {}", denominator);

    let n_expected = 44.0e8 / 3375.0; // ≈ 1,303,703.7
    let rel_err = (n_calc - n_expected).abs() / n_expected;
    assert!(
        rel_err < 0.01,
        "AISC Cat C: N={:.0}, expected={:.0}, err={:.4}%",
        n_calc, n_expected, rel_err * 100.0
    );

    // Check approximate value (hand calculation: ~1,303,704)
    let n_hand = 1_303_704.0;
    let hand_err = (n_calc - n_hand).abs() / n_hand;
    assert!(hand_err < 0.01,
        "N={:.0}, hand-calc≈{:.0}, err={:.4}%", n_calc, n_hand, hand_err * 100.0);

    // Category C should have fewer allowable cycles than Category B
    // at the same stress range, since C_f(C) < C_f(B)
    let cf_b = 120.0e8;
    let n_cat_b = cf_b / delta_f_sr.powi(3);
    assert!(n_calc < n_cat_b,
        "Cat C cycles ({:.0}) should be less than Cat B ({:.0}) at same ΔF_sr",
        n_calc, n_cat_b);

    // Verify threshold in MPa
    let thresh_expected: f64 = 68.95;
    let thresh_err = (threshold_mpa - thresh_expected).abs() / thresh_expected;
    assert!(thresh_err < 0.01,
        "Threshold: {:.2} MPa, expected≈{:.2} MPa", threshold_mpa, thresh_expected);
}

// ================================================================
// 8. Fatigue Life Prediction — Stress Histogram with Miner's Rule
// ================================================================
//
// Given a measured stress histogram (5 load levels representing one
// year of service), predict remaining fatigue life using Miner's
// linear damage rule.
//
// Detail category: EC3 C = 80 MPa (fillet weld, non-load-carrying).
// Annual stress histogram (typical bridge crane girder):
//   Level 1: Δσ = 140 MPa,  n =   1,500 /year  (heavy overloads)
//   Level 2: Δσ = 100 MPa,  n =   8,000 /year  (full-load cycles)
//   Level 3: Δσ =  70 MPa,  n =  30,000 /year  (partial-load cycles)
//   Level 4: Δσ =  50 MPa,  n =  80,000 /year  (below CAFL, use m=5)
//   Level 5: Δσ =  35 MPa,  n = 150,000 /year  (low-amplitude, use m=5)
//
// Compute annual damage D_year, then remaining life = (1-D×t) / D_year.

#[test]
fn validation_fatigue_life_prediction() {
    let delta_sigma_c = 80.0; // MPa
    let delta_sigma_d = (2.0_f64 / 5.0).powf(1.0 / 3.0) * delta_sigma_c; // ≈ 58.92 MPa
    let cutoff_factor = (5.0_f64 / 100.0).powf(1.0 / 5.0);
    let delta_sigma_l = cutoff_factor * delta_sigma_d; // ≈ 32.37 MPa

    // Annual stress histogram: (stress_range_MPa, cycles_per_year)
    let histogram: [(f64, f64); 5] = [
        (140.0, 1_500.0),
        (100.0, 8_000.0),
        (70.0, 30_000.0),
        (50.0, 80_000.0),
        (35.0, 150_000.0),
    ];

    let mut d_annual = 0.0;

    for &(ds, n_applied) in &histogram {
        if ds < delta_sigma_l {
            // Below cut-off: no damage contribution
            continue;
        }

        let n_failure = if ds >= delta_sigma_d {
            // Above CAFL: use m=3 branch
            ec3_cycles_m3(delta_sigma_c, ds)
        } else {
            // Between CAFL and cut-off: use m=5 branch
            ec3_cycles_m5(delta_sigma_d, ds)
        };

        let d_i = n_applied / n_failure;
        d_annual += d_i;
    }

    // d_annual should be a reasonable fraction (structure doesn't fail in 1 year)
    assert!(d_annual > 0.0, "annual damage must be positive");
    assert!(d_annual < 1.0,
        "annual damage D={:.6} should be < 1.0 for a realistic design", d_annual);

    // Verify individual block classifications
    // Levels 1-3 are above CAFL (~58.92 MPa): use m=3
    assert!(140.0 > delta_sigma_d);
    assert!(100.0 > delta_sigma_d);
    assert!(70.0 > delta_sigma_d);
    // Levels 4-5 are below CAFL but above cut-off (~32.37 MPa): use m=5
    assert!(50.0 < delta_sigma_d);
    assert!(50.0 > delta_sigma_l);
    assert!(35.0 < delta_sigma_d);
    assert!(35.0 > delta_sigma_l);

    // Compute expected total life in years and remaining life after 10 years
    let total_life_years = 1.0 / d_annual;
    let years_elapsed = 10.0;
    let d_accumulated = d_annual * years_elapsed;

    // After 10 years, accumulated damage should still be < 1.0
    // (otherwise design is inadequate for 10-year check)
    // The remaining life formula:
    //   remaining = (1 - D_accumulated) / D_annual
    let remaining_life = (1.0 - d_accumulated) / d_annual;

    // Consistency: total life = years_elapsed + remaining_life
    let reconstructed = years_elapsed + remaining_life;
    let life_err = (reconstructed - total_life_years).abs() / total_life_years;
    assert!(life_err < 0.01,
        "Life consistency: {:.2} + {:.2} = {:.2}, expected {:.2}",
        years_elapsed, remaining_life, reconstructed, total_life_years);

    // Cross-check: remaining life should be positive and less than total
    assert!(remaining_life > 0.0,
        "Remaining life ({:.2} years) must be positive", remaining_life);
    assert!(remaining_life < total_life_years,
        "Remaining life ({:.2}) must be less than total ({:.2})",
        remaining_life, total_life_years);

    // Verify Miner's rule: D at end-of-life should equal 1.0
    let d_at_end = d_annual * total_life_years;
    let eol_err = (d_at_end - 1.0).abs();
    assert!(eol_err < 0.01,
        "D at end-of-life={:.6}, expected 1.0", d_at_end);

    // Verify total life is reasonable (should be tens of years for a
    // well-designed structure, not hundreds or fractions)
    assert!(total_life_years > 5.0,
        "Total life {:.1} years is unrealistically short", total_life_years);
    assert!(total_life_years < 500.0,
        "Total life {:.1} years is unrealistically long", total_life_years);
}
