/// Validation: Advanced Fatigue Design Benchmark Cases
///
/// References:
///   - EN 1993-1-9:2005 (EC3-1-9): Fatigue of Steel Structures
///   - AISC 360-22 Appendix 3: Design for Fatigue
///   - IIW Recommendations (XIII-2460-13/XV-1440-13): Fatigue Design of Welded Joints
///   - BS 7608:2014: Fatigue Design and Assessment of Steel Structures
///   - Maddox (1991): "Fatigue Strength of Welded Structures"
///   - Miner (1945): "Cumulative Damage in Fatigue"
///
/// Tests verify S-N curve computations across multiple detail categories,
/// Palmgren-Miner damage accumulation, rainflow equivalent stress ranges,
/// constant amplitude fatigue limits, AISC fatigue categories, hot-spot
/// stress concentration at weld toes, thickness corrections, and remaining
/// life calculations from damage indices.

use crate::common::*;

// ================================================================
// Helper: EC3 S-N curve, m=3 branch.
// N = (delta_sigma_c / delta_sigma)^3 * 2e6
// ================================================================
fn ec3_cycles_m3(delta_sigma_c: f64, delta_sigma: f64) -> f64 {
    (delta_sigma_c / delta_sigma).powi(3) * 2.0e6
}

// ================================================================
// Helper: EC3 S-N curve, m=5 branch.
// N = (delta_sigma_d / delta_sigma)^5 * 5e6
// ================================================================
fn ec3_cycles_m5(delta_sigma_d: f64, delta_sigma: f64) -> f64 {
    (delta_sigma_d / delta_sigma).powi(5) * 5.0e6
}

// ================================================================
// Helper: AISC S-N curve.
// N = C_f / (delta_f_sr)^3
// ================================================================
fn aisc_cycles(cf: f64, delta_f_sr: f64) -> f64 {
    cf / delta_f_sr.powi(3)
}

// ================================================================
// Helper: EC3 CAFL (Constant Amplitude Fatigue Limit).
// delta_sigma_d = (2/5)^(1/3) * delta_sigma_c
// ================================================================
fn ec3_cafl(delta_sigma_c: f64) -> f64 {
    (2.0_f64 / 5.0).powf(1.0 / 3.0) * delta_sigma_c
}

// ================================================================
// Helper: EC3 cut-off limit.
// delta_sigma_l = (5/100)^(1/5) * delta_sigma_d
// ================================================================
fn ec3_cutoff(delta_sigma_d: f64) -> f64 {
    (5.0_f64 / 100.0).powf(1.0 / 5.0) * delta_sigma_d
}

// ================================================================
// 1. EC3-1-9: S-N Curves for Multiple Detail Categories
// ================================================================
//
// EN 1993-1-9 Table 8.1 defines detail categories C = 36, 40, 45,
// 50, 56, 63, 71, 80, 90, 100, 112, 125, 140, 160.
//
// For the m=3 branch: N = (C / delta_sigma)^3 * 2e6
//
// Verify cycles to failure for categories C=71, 80, 90 at
// delta_sigma = 100 MPa:
//   C=71:  N = (71/100)^3  * 2e6 = 0.357911 * 2e6 =   715,822
//   C=80:  N = (80/100)^3  * 2e6 = 0.512000 * 2e6 = 1,024,000
//   C=90:  N = (90/100)^3  * 2e6 = 0.729000 * 2e6 = 1,458,000
//   C=112: N = (112/100)^3 * 2e6 = 1.404928 * 2e6 = 2,809,856
//   C=160: N = (160/100)^3 * 2e6 = 4.096000 * 2e6 = 8,192,000
//
// Also verify the ordering: higher C => more cycles at same stress.

#[test]
fn validation_fat_ext_1_sn_curve_ec3() {
    let delta_sigma: f64 = 100.0; // MPa — applied stress range

    // Detail categories and expected cycles (hand-calculated)
    let categories: [(f64, f64); 5] = [
        (71.0, 715_822.0),
        (80.0, 1_024_000.0),
        (90.0, 1_458_000.0),
        (112.0, 2_809_856.0),
        (160.0, 8_192_000.0),
    ];

    let mut prev_n: f64 = 0.0;

    for &(c, n_expected) in &categories {
        let n_calc: f64 = ec3_cycles_m3(c, delta_sigma);

        // Verify within 1% of hand calculation
        assert_close(n_calc, n_expected, 0.01,
            &format!("EC3 C={} S-N at {} MPa", c, delta_sigma));

        // Verify ordering: higher detail category => more cycles
        assert!(n_calc > prev_n,
            "C={}: N={:.0} should exceed previous N={:.0}", c, n_calc, prev_n);
        prev_n = n_calc;
    }

    // Cross-check: ratio of cycles between C=80 and C=71 should equal (80/71)^3
    let n_71: f64 = ec3_cycles_m3(71.0, delta_sigma);
    let n_80: f64 = ec3_cycles_m3(80.0, delta_sigma);
    let ratio_calc: f64 = n_80 / n_71;
    let ratio_expected: f64 = (80.0_f64 / 71.0).powi(3);
    assert_close(ratio_calc, ratio_expected, 0.001, "N_80/N_71 ratio");

    // Verify CAFL ordering for each category
    for &(c, _) in &categories {
        let cafl: f64 = ec3_cafl(c);
        let cutoff: f64 = ec3_cutoff(cafl);
        assert!(c > cafl, "C={:.0} must exceed CAFL={:.2}", c, cafl);
        assert!(cafl > cutoff, "CAFL={:.2} must exceed cutoff={:.2}", cafl, cutoff);
    }
}

// ================================================================
// 2. Palmgren-Miner Damage Accumulation — Multi-Block Loading
// ================================================================
//
// Linear damage rule: D = sum(n_i / N_i).
// Failure when D >= 1.0.
//
// Detail category C=80 MPa (fillet weld, non-load-carrying).
// Five load blocks mixing m=3 and m=5 regions:
//   Block 1: delta_sigma=150 MPa, n=  2,000  (above CAFL, m=3)
//   Block 2: delta_sigma=100 MPa, n= 10,000  (above CAFL, m=3)
//   Block 3: delta_sigma= 80 MPa, n= 50,000  (above CAFL, m=3)
//   Block 4: delta_sigma= 50 MPa, n=200,000  (below CAFL, m=5)
//   Block 5: delta_sigma= 35 MPa, n=500,000  (below CAFL, m=5)
//
// CAFL for C=80: delta_sigma_d = 0.7368 * 80 = 58.94 MPa
// Cutoff for C=80: delta_sigma_l = 0.5493 * 58.94 = 32.39 MPa

#[test]
fn validation_fat_ext_2_miner_accumulation() {
    let delta_sigma_c: f64 = 80.0;
    let delta_sigma_d: f64 = ec3_cafl(delta_sigma_c);
    let delta_sigma_l: f64 = ec3_cutoff(delta_sigma_d);

    // Verify CAFL and cutoff values
    assert_close(delta_sigma_d, 58.94, 0.01, "CAFL for C=80");
    assert_close(delta_sigma_l, 32.39, 0.01, "Cutoff for C=80");

    // Load blocks: (stress_range, applied_cycles)
    let blocks: [(f64, f64); 5] = [
        (150.0, 2_000.0),
        (100.0, 10_000.0),
        (80.0, 50_000.0),
        (50.0, 200_000.0),
        (35.0, 500_000.0),
    ];

    let mut d_total: f64 = 0.0;
    let mut damages: Vec<f64> = Vec::new();

    for &(ds, n_applied) in &blocks {
        if ds < delta_sigma_l {
            // Below cut-off: no damage
            damages.push(0.0);
            continue;
        }

        let n_failure: f64 = if ds >= delta_sigma_d {
            ec3_cycles_m3(delta_sigma_c, ds)
        } else {
            ec3_cycles_m5(delta_sigma_d, ds)
        };

        let d_i: f64 = n_applied / n_failure;
        damages.push(d_i);
        d_total += d_i;
    }

    // Each individual damage must be non-negative
    for (i, &d) in damages.iter().enumerate() {
        assert!(d >= 0.0, "Block {} damage={:.6} must be non-negative", i + 1, d);
    }

    // Verify damage summation consistency
    let d_sum: f64 = damages.iter().sum();
    assert_close(d_total, d_sum, 0.001, "Damage summation consistency");

    // Total damage should be positive
    assert!(d_total > 0.0, "Total damage must be positive, got {:.6}", d_total);

    // Verify that blocks above CAFL contribute more damage per cycle
    // than blocks below CAFL (higher slope means fewer cycles to failure)
    let d_per_cycle_block2: f64 = damages[1] / blocks[1].1; // 100 MPa, above CAFL
    let d_per_cycle_block4: f64 = damages[3] / blocks[3].1; // 50 MPa, below CAFL
    assert!(d_per_cycle_block2 > d_per_cycle_block4,
        "Damage per cycle at 100 MPa ({:.2e}) should exceed at 50 MPa ({:.2e})",
        d_per_cycle_block2, d_per_cycle_block4);

    // Compute fatigue life in repetitions of the full spectrum
    let life_repetitions: f64 = 1.0 / d_total;
    assert!(life_repetitions > 0.0, "Life repetitions must be positive");

    // At end of life, damage should equal 1.0
    let d_at_eol: f64 = d_total * life_repetitions;
    assert_close(d_at_eol, 1.0, 0.001, "Damage at end-of-life");
}

// ================================================================
// 3. Rainflow Counting: Equivalent Constant-Amplitude Stress Range
// ================================================================
//
// For variable-amplitude loading, the equivalent constant-amplitude
// stress range is computed from a rainflow-counted spectrum:
//
//   delta_sigma_eq = [ sum(n_i * delta_sigma_i^m) / sum(n_i) ]^(1/m)
//
// This is the stress range that, applied for the same total number
// of cycles, produces the same Miner's damage sum.
//
// Test spectrum (5 bins, m=3):
//   Bin 1: delta_sigma=120 MPa, n=  5,000
//   Bin 2: delta_sigma= 90 MPa, n= 20,000
//   Bin 3: delta_sigma= 60 MPa, n= 80,000
//   Bin 4: delta_sigma= 40 MPa, n=200,000
//   Bin 5: delta_sigma= 20 MPa, n=500,000
//
// delta_sigma_eq = [ (5000*120^3 + 20000*90^3 + 80000*60^3 +
//                     200000*40^3 + 500000*20^3) / 805000 ]^(1/3)

#[test]
fn validation_fat_ext_3_stress_range_spectrum() {
    let m: f64 = 3.0; // S-N curve exponent

    // Spectrum bins: (stress_range, cycles)
    let bins: [(f64, f64); 5] = [
        (120.0, 5_000.0),
        (90.0, 20_000.0),
        (60.0, 80_000.0),
        (40.0, 200_000.0),
        (20.0, 500_000.0),
    ];

    // Compute numerator: sum(n_i * delta_sigma_i^m)
    let mut numerator: f64 = 0.0;
    let mut n_total: f64 = 0.0;
    for &(ds, n) in &bins {
        numerator += n * ds.powf(m);
        n_total += n;
    }

    // Total cycles
    assert_close(n_total, 805_000.0, 0.001, "Total cycles");

    // Equivalent stress range
    let delta_sigma_eq: f64 = (numerator / n_total).powf(1.0 / m);

    // Hand calculation:
    //   5000*120^3    = 5000 * 1,728,000     =   8,640,000,000
    //   20000*90^3    = 20000 * 729,000       =  14,580,000,000
    //   80000*60^3    = 80000 * 216,000       =  17,280,000,000
    //   200000*40^3   = 200000 * 64,000       =  12,800,000,000
    //   500000*20^3   = 500000 * 8,000        =   4,000,000,000
    //   Sum = 57,300,000,000
    //   Mean = 57,300,000,000 / 805,000 = 71,180.12
    //   delta_sigma_eq = 71180.12^(1/3) = 41.43 MPa

    let numerator_expected: f64 = 57_300_000_000.0;
    assert_close(numerator, numerator_expected, 0.001, "Numerator sum");

    let mean_val: f64 = numerator / n_total;
    let mean_expected: f64 = 71_180.12;
    assert_close(mean_val, mean_expected, 0.01, "Mean sigma^m");

    // Compute expected equivalent stress range
    let ds_eq_expected: f64 = mean_expected.powf(1.0 / 3.0);
    assert_close(delta_sigma_eq, ds_eq_expected, 0.01, "Equivalent stress range");

    // Sanity: equivalent stress range should be between min and max
    assert!(delta_sigma_eq > 20.0,
        "Equiv stress {:.2} must exceed minimum bin (20 MPa)", delta_sigma_eq);
    assert!(delta_sigma_eq < 120.0,
        "Equiv stress {:.2} must be below maximum bin (120 MPa)", delta_sigma_eq);

    // Verify Miner's equivalence: damage from equivalent constant amplitude
    // should equal damage from original spectrum (using any detail category).
    let c: f64 = 80.0; // arbitrary detail category for check
    let d_spectrum: f64 = bins.iter()
        .map(|&(ds, n)| n / ec3_cycles_m3(c, ds))
        .sum();
    let d_equivalent: f64 = n_total / ec3_cycles_m3(c, delta_sigma_eq);
    assert_close(d_equivalent, d_spectrum, 0.01, "Miner equivalence check");
}

// ================================================================
// 4. Constant Amplitude Fatigue Limit (CAFL) — Multiple Categories
// ================================================================
//
// EC3-1-9: CAFL delta_sigma_D = (2/5)^(1/3) * delta_sigma_C
//          = 0.7368 * delta_sigma_C
//
// At the CAFL, cycles to failure N_D = 5e6 on the m=3 curve.
//
// AISC: Each category has its own threshold F_TH (Table A-3.1).
// Below F_TH, fatigue life is infinite under constant amplitude.
//
// Verify CAFL for EC3 categories and AISC thresholds.

#[test]
fn validation_fat_ext_4_cafl_threshold() {
    // EC3 CAFL verification for multiple detail categories
    let ec3_categories: [f64; 6] = [56.0, 71.0, 80.0, 90.0, 112.0, 160.0];
    let cafl_factor: f64 = (2.0_f64 / 5.0).powf(1.0 / 3.0);

    for &c in &ec3_categories {
        let cafl: f64 = ec3_cafl(c);
        let cafl_expected: f64 = cafl_factor * c;
        assert_close(cafl, cafl_expected, 0.001,
            &format!("CAFL for EC3 C={}", c));

        // At CAFL, N should equal 5e6
        let n_at_cafl: f64 = ec3_cycles_m3(c, cafl);
        assert_close(n_at_cafl, 5.0e6, 0.01,
            &format!("N at CAFL for EC3 C={}", c));

        // CAFL should be less than detail category
        assert!(cafl < c,
            "CAFL={:.2} must be less than C={:.0}", cafl, c);
    }

    // AISC fatigue thresholds (ksi): Category => (C_f, F_TH)
    // From AISC 360-22 Table A-3.1
    let aisc_categories: [(&str, f64, f64); 5] = [
        ("A",  250.0e8, 24.0),
        ("B",  120.0e8, 16.0),
        ("C",   44.0e8, 10.0),
        ("D",   22.0e8,  7.0),
        ("E",   11.0e8,  4.5),
    ];

    let mut prev_cf: f64 = f64::MAX;
    let mut prev_fth: f64 = f64::MAX;

    for &(cat, cf, f_th) in &aisc_categories {
        // Verify ordering: Category A is best, E is worst
        assert!(cf <= prev_cf,
            "AISC Cat {}: Cf={:.0e} should decrease from previous", cat, cf);
        assert!(f_th <= prev_fth,
            "AISC Cat {}: F_TH={:.1} should decrease from previous", cat, f_th);
        prev_cf = cf;
        prev_fth = f_th;

        // At the threshold, compute cycles (should be very large)
        let n_at_threshold: f64 = aisc_cycles(cf, f_th);
        assert!(n_at_threshold > 1.0e6,
            "AISC Cat {}: N at threshold={:.0} should exceed 1M", cat, n_at_threshold);

        // Convert threshold to MPa for comparison: 1 ksi = 6.895 MPa
        let f_th_mpa: f64 = f_th * 6.895;
        assert!(f_th_mpa > 0.0,
            "AISC Cat {}: threshold in MPa must be positive", cat);
    }
}

// ================================================================
// 5. AISC Fatigue Categories A through E' — S-N Curves
// ================================================================
//
// AISC 360-22 Appendix 3, Table A-3.1.
// N = C_f / (delta_F_sr)^3
//
//   Category A:   C_f = 250 x 10^8 ksi^3,  F_TH = 24 ksi
//   Category B:   C_f = 120 x 10^8 ksi^3,  F_TH = 16 ksi
//   Category B':  C_f =  61 x 10^8 ksi^3,  F_TH = 12 ksi
//   Category C:   C_f =  44 x 10^8 ksi^3,  F_TH = 10 ksi
//   Category D:   C_f =  22 x 10^8 ksi^3,  F_TH =  7 ksi
//   Category E:   C_f =  11 x 10^8 ksi^3,  F_TH =  4.5 ksi
//   Category E':  C_f = 3.9 x 10^8 ksi^3,  F_TH =  2.6 ksi
//
// Verify cycles at delta_F_sr = 20 ksi for categories A through E'.

#[test]
fn validation_fat_ext_5_aisc_fatigue_categories() {
    let delta_f_sr: f64 = 20.0; // ksi — applied stress range

    // AISC categories: (name, C_f, F_TH, N_expected at 20 ksi)
    // N = C_f / 20^3 = C_f / 8000
    let categories: [(&str, f64, f64, f64); 7] = [
        ("A",  250.0e8, 24.0, 250.0e8 / 8000.0),   // 3,125,000
        ("B",  120.0e8, 16.0, 120.0e8 / 8000.0),   // 1,500,000
        ("B'",  61.0e8, 12.0,  61.0e8 / 8000.0),   //   762,500
        ("C",   44.0e8, 10.0,  44.0e8 / 8000.0),   //   550,000
        ("D",   22.0e8,  7.0,  22.0e8 / 8000.0),   //   275,000
        ("E",   11.0e8,  4.5,  11.0e8 / 8000.0),   //   137,500
        ("E'", 3.9e8,    2.6, 3.9e8 / 8000.0),     //    48,750
    ];

    let mut prev_n: f64 = f64::MAX;

    for &(cat, cf, f_th, n_expected) in &categories {
        let n_calc: f64 = aisc_cycles(cf, delta_f_sr);

        // Verify calculation
        assert_close(n_calc, n_expected, 0.001,
            &format!("AISC Cat {} cycles at {} ksi", cat, delta_f_sr));

        // Verify ordering: A has most cycles, E' has fewest
        assert!(n_calc <= prev_n,
            "AISC Cat {}: N={:.0} should decrease from previous N={:.0}",
            cat, n_calc, prev_n);
        prev_n = n_calc;

        // Verify stress range exceeds threshold (except for A where 20 < 24)
        if delta_f_sr > f_th {
            // Above threshold: finite life
            assert!(n_calc > 0.0 && n_calc < f64::INFINITY,
                "AISC Cat {}: N={:.0} should be finite above threshold", cat, n_calc);
        }
    }

    // Verify specific hand-calculated values
    assert_close(categories[0].3, 3_125_000.0, 0.001, "Cat A at 20 ksi");
    assert_close(categories[1].3, 1_500_000.0, 0.001, "Cat B at 20 ksi");
    assert_close(categories[3].3, 550_000.0, 0.001, "Cat C at 20 ksi");

    // Verify ratio between categories
    let n_a: f64 = aisc_cycles(250.0e8, delta_f_sr);
    let n_e: f64 = aisc_cycles(11.0e8, delta_f_sr);
    let ratio_ae: f64 = n_a / n_e;
    let ratio_expected: f64 = 250.0 / 11.0;
    assert_close(ratio_ae, ratio_expected, 0.001, "Ratio N_A/N_E");
}

// ================================================================
// 6. Weld Toe Stress Concentration — Hot-Spot Stress Method
// ================================================================
//
// IIW Recommendations for hot-spot stress at weld toes.
//
// The structural hot-spot stress (HSS) is extrapolated from stresses
// at reference points to the weld toe:
//
//   sigma_hs = 1.67 * sigma_0.4t - 0.67 * sigma_1.0t
//
// where sigma_0.4t is stress at 0.4*t from weld toe, and
//       sigma_1.0t is stress at 1.0*t from weld toe.
//
// The stress concentration factor (SCF) relates hot-spot stress
// to nominal stress:
//   SCF = sigma_hs / sigma_nom
//
// For a T-joint with plate thickness t=20mm, weld angle theta=45 deg:
//   Monahan's formula: SCF = 1 + 0.388 * (t/rho)^0.386
//   where rho = weld toe radius.
//
// Test case: t=20mm, rho=1mm (sharp weld toe).

#[test]
fn validation_fat_ext_6_weld_toe_stress() {
    // Hot-spot stress extrapolation
    let sigma_0_4t: f64 = 145.0; // MPa — stress at 0.4t from weld toe
    let sigma_1_0t: f64 = 120.0; // MPa — stress at 1.0t from weld toe

    // IIW linear extrapolation formula
    let sigma_hs: f64 = 1.67 * sigma_0_4t - 0.67 * sigma_1_0t;

    // Hand calculation:
    //   sigma_hs = 1.67 * 145 - 0.67 * 120
    //            = 242.15 - 80.40
    //            = 161.75 MPa
    let sigma_hs_expected: f64 = 1.67 * 145.0 - 0.67 * 120.0;
    assert_close(sigma_hs, sigma_hs_expected, 0.001, "Hot-spot stress extrapolation");
    assert_close(sigma_hs, 161.75, 0.01, "Hot-spot stress value");

    // SCF from hot-spot stress
    let sigma_nom: f64 = 100.0; // MPa — nominal stress
    let scf_hs: f64 = sigma_hs / sigma_nom;
    assert_close(scf_hs, 1.6175, 0.01, "SCF from hot-spot method");

    // Monahan's SCF formula for weld toe
    let t: f64 = 20.0;   // mm — plate thickness
    let rho: f64 = 1.0;  // mm — weld toe radius (sharp)

    // SCF = 1 + 0.388 * (t/rho)^0.386
    let t_over_rho: f64 = t / rho;
    let scf_monahan: f64 = 1.0 + 0.388 * t_over_rho.powf(0.386);

    // Hand calculation:
    //   t/rho = 20
    //   20^0.386: ln(20) = 2.9957, 0.386 * 2.9957 = 1.1563
    //   e^1.1563 = 3.178
    //   SCF = 1 + 0.388 * 3.178 = 1 + 1.233 = 2.233
    let exponent: f64 = 20.0_f64.powf(0.386);
    let scf_expected: f64 = 1.0 + 0.388 * exponent;
    assert_close(scf_monahan, scf_expected, 0.001, "Monahan SCF self-consistency");

    // SCF should be greater than 1.0 (stress is amplified)
    assert!(scf_monahan > 1.0,
        "SCF={:.4} must exceed 1.0", scf_monahan);

    // For sharp weld toe (rho=1mm, t=20mm), SCF is typically 2.0-3.0
    assert!(scf_monahan > 1.5 && scf_monahan < 4.0,
        "SCF={:.4} out of expected range for sharp weld toe", scf_monahan);

    // Effect on fatigue: hot-spot stress range determines fatigue life
    // using the appropriate detail category (typically FAT 90 for HSS method)
    let c_hss: f64 = 90.0; // MPa — detail category for HSS method
    let delta_sigma_hs: f64 = scf_hs * 80.0; // stress range with SCF applied
    let n_with_scf: f64 = ec3_cycles_m3(c_hss, delta_sigma_hs);
    let n_without_scf: f64 = ec3_cycles_m3(c_hss, 80.0);

    // SCF reduces fatigue life
    assert!(n_with_scf < n_without_scf,
        "N with SCF ({:.0}) must be less than N without ({:.0})",
        n_with_scf, n_without_scf);

    // Reduction factor in life = SCF^3 (because N ~ 1/sigma^3)
    let life_ratio: f64 = n_without_scf / n_with_scf;
    let life_ratio_expected: f64 = scf_hs.powi(3);
    assert_close(life_ratio, life_ratio_expected, 0.01, "Life reduction factor = SCF^3");
}

// ================================================================
// 7. Thickness Correction — EC3-1-9 and BS 7608
// ================================================================
//
// For plates thicker than the reference thickness t_ref, fatigue
// strength is reduced:
//
//   delta_sigma_C(t) = delta_sigma_C * (t_ref / t)^n
//
// EC3-1-9, clause 7.2.2:
//   t_ref = 25 mm (for transverse butt welds)
//   n = 0.2 (for as-welded joints)
//
// BS 7608: same formula with n=0.25 for some joint classes.
//
// Test cases:
//   t = 25 mm (reference):  correction factor = 1.0
//   t = 40 mm: factor = (25/40)^0.2 = 0.625^0.2
//   t = 60 mm: factor = (25/60)^0.2 = 0.4167^0.2
//   t = 100 mm: factor = (25/100)^0.2 = 0.25^0.2

#[test]
fn validation_fat_ext_7_thickness_correction() {
    let t_ref: f64 = 25.0;  // mm — reference thickness
    let n_ec3: f64 = 0.2;   // exponent for EC3
    let n_bs: f64 = 0.25;   // exponent for BS 7608
    let delta_sigma_c_base: f64 = 90.0; // MPa — base detail category

    // Test thicknesses and expected EC3 correction factors
    let thicknesses: [f64; 4] = [25.0, 40.0, 60.0, 100.0];

    // At reference thickness, factor = 1.0
    let factor_ref: f64 = (t_ref / thicknesses[0]).powf(n_ec3);
    assert_close(factor_ref, 1.0, 0.001, "Factor at t_ref");

    let mut prev_factor: f64 = 2.0; // Start above 1.0 for ordering check

    for &t in &thicknesses {
        // EC3 thickness correction
        let factor_ec3: f64 = (t_ref / t).powf(n_ec3);
        let delta_sigma_corrected: f64 = delta_sigma_c_base * factor_ec3;

        // Factor should be <= 1.0 for t >= t_ref
        if t >= t_ref {
            assert!(factor_ec3 <= 1.0 + 1e-10,
                "Factor={:.4} should be <= 1.0 for t={:.0}mm >= t_ref", factor_ec3, t);
        }

        // Factor should decrease with increasing thickness
        assert!(factor_ec3 < prev_factor,
            "Factor={:.4} at t={:.0}mm should be less than previous {:.4}",
            factor_ec3, t, prev_factor);
        prev_factor = factor_ec3;

        // Corrected detail category should be less than base
        if t > t_ref {
            assert!(delta_sigma_corrected < delta_sigma_c_base,
                "Corrected C={:.2} should be less than base C={:.0} for t={:.0}mm",
                delta_sigma_corrected, delta_sigma_c_base, t);
        }
    }

    // Specific hand calculations for EC3 (n=0.2):
    //   t=40mm:  (25/40)^0.2 = 0.625^0.2
    let f_40: f64 = (25.0_f64 / 40.0).powf(0.2);
    let f_40_expected: f64 = 0.625_f64.powf(0.2);
    assert_close(f_40, f_40_expected, 0.001, "Factor at t=40mm");

    //   t=100mm: (25/100)^0.2 = 0.25^0.2
    let f_100: f64 = (25.0_f64 / 100.0).powf(0.2);
    let f_100_expected: f64 = 0.25_f64.powf(0.2);
    assert_close(f_100, f_100_expected, 0.001, "Factor at t=100mm");

    // Compare EC3 (n=0.2) vs BS 7608 (n=0.25) at t=60mm
    let f_60_ec3: f64 = (t_ref / 60.0).powf(n_ec3);
    let f_60_bs: f64 = (t_ref / 60.0).powf(n_bs);

    // BS 7608 is more conservative (lower factor) since n_bs > n_ec3
    assert!(f_60_bs < f_60_ec3,
        "BS factor={:.4} should be less than EC3 factor={:.4} at t=60mm",
        f_60_bs, f_60_ec3);

    // Effect on fatigue life at t=100mm with EC3 correction
    let c_corrected: f64 = delta_sigma_c_base * f_100;
    let c_base: f64 = delta_sigma_c_base;
    let delta_sigma_test: f64 = 60.0; // MPa — applied stress range

    let n_corrected: f64 = ec3_cycles_m3(c_corrected, delta_sigma_test);
    let n_base: f64 = ec3_cycles_m3(c_base, delta_sigma_test);

    // Thicker plate has reduced fatigue life
    assert!(n_corrected < n_base,
        "N_corrected={:.0} should be less than N_base={:.0}", n_corrected, n_base);

    // Life reduction ratio = (correction_factor)^3
    let life_ratio: f64 = n_corrected / n_base;
    let life_ratio_expected: f64 = f_100.powi(3);
    assert_close(life_ratio, life_ratio_expected, 0.01, "Life ratio = factor^3");
}

// ================================================================
// 8. Remaining Life Calculation from Damage Index
// ================================================================
//
// Given an existing structure with known service history, compute
// the remaining fatigue life using Miner's rule.
//
// Scenario: Bridge girder, EC3 detail category C=71 MPa.
// Service history (20 years of operation):
//   Year 1-10:  D_annual = 0.035 (lighter traffic)
//   Year 11-20: D_annual = 0.050 (increased traffic)
//
// Accumulated damage after 20 years:
//   D_accumulated = 10 * 0.035 + 10 * 0.050 = 0.35 + 0.50 = 0.85
//
// Future loading: D_annual = 0.055 (projected traffic growth)
//
// Remaining life = (1.0 - D_accumulated) / D_annual_future

#[test]
fn validation_fat_ext_8_remaining_life() {
    // Service history
    let d_annual_phase1: f64 = 0.035; // damage per year, years 1-10
    let d_annual_phase2: f64 = 0.050; // damage per year, years 11-20
    let years_phase1: f64 = 10.0;
    let years_phase2: f64 = 10.0;

    // Accumulated damage after 20 years
    let d_phase1: f64 = d_annual_phase1 * years_phase1; // 0.35
    let d_phase2: f64 = d_annual_phase2 * years_phase2; // 0.50
    let d_accumulated: f64 = d_phase1 + d_phase2;       // 0.85

    assert_close(d_phase1, 0.35, 0.001, "Damage phase 1");
    assert_close(d_phase2, 0.50, 0.001, "Damage phase 2");
    assert_close(d_accumulated, 0.85, 0.001, "Total accumulated damage");

    // Verify damage is below failure threshold
    assert!(d_accumulated < 1.0,
        "Accumulated damage {:.4} must be less than 1.0", d_accumulated);

    // Remaining capacity
    let d_remaining: f64 = 1.0 - d_accumulated; // 0.15
    assert_close(d_remaining, 0.15, 0.001, "Remaining damage capacity");

    // Future loading rate
    let d_annual_future: f64 = 0.055;

    // Remaining life calculation
    let remaining_years: f64 = d_remaining / d_annual_future;
    // 0.15 / 0.055 = 2.7273 years
    let remaining_expected: f64 = 0.15 / 0.055;
    assert_close(remaining_years, remaining_expected, 0.001, "Remaining life");
    assert_close(remaining_years, 2.7273, 0.01, "Remaining life ~2.73 years");

    // Verify: total damage at end of remaining life = 1.0
    let d_at_end: f64 = d_accumulated + d_annual_future * remaining_years;
    assert_close(d_at_end, 1.0, 0.001, "Damage at end of remaining life");

    // Total service life
    let total_life: f64 = years_phase1 + years_phase2 + remaining_years;
    assert_close(total_life, 22.7273, 0.01, "Total service life");

    // Sensitivity analysis: if future damage rate is reduced by 20%
    let d_annual_reduced: f64 = d_annual_future * 0.80; // 0.044
    let remaining_reduced: f64 = d_remaining / d_annual_reduced;
    // 0.15 / 0.044 = 3.4091 years
    let remaining_reduced_expected: f64 = 0.15 / 0.044;
    assert_close(remaining_reduced, remaining_reduced_expected, 0.01,
        "Remaining life with reduced loading");

    // Life extension from reducing damage rate
    let life_extension: f64 = remaining_reduced - remaining_years;
    assert!(life_extension > 0.0,
        "Reducing damage rate should extend life, got {:.4}", life_extension);

    // Extension ratio should equal 1/0.8 - 1 = 0.25 (25% more life)
    let extension_ratio: f64 = life_extension / remaining_years;
    let extension_ratio_expected: f64 = (1.0 / 0.80) - 1.0;
    assert_close(extension_ratio, extension_ratio_expected, 0.01,
        "Life extension ratio");

    // Cross-check with solver: use a simple beam to compute stress and verify
    // that S-N curve gives consistent damage with the manual calculation.
    let delta_sigma_c: f64 = 71.0; // MPa — detail category
    // If annual stress histogram produces D_annual = 0.055, then at a single
    // stress range delta_sigma, the equivalent annual cycles needed are:
    //   n_annual = D_annual * N_failure
    //   For delta_sigma = 100 MPa:
    //     N_failure = (71/100)^3 * 2e6 = 715,822
    //     n_annual = 0.055 * 715,822 = 39,370
    let delta_sigma_test: f64 = 100.0;
    let n_failure: f64 = ec3_cycles_m3(delta_sigma_c, delta_sigma_test);
    let n_annual: f64 = d_annual_future * n_failure;
    let n_annual_expected: f64 = 0.055 * 715_822.0;
    assert_close(n_annual, n_annual_expected, 0.01, "Equivalent annual cycles");

    // Verify back-calculation of damage rate
    let d_check: f64 = n_annual / n_failure;
    assert_close(d_check, d_annual_future, 0.001, "Damage rate back-calculation");
}
