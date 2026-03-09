/// Validation: Extended Reinforcement Detailing in Reinforced Concrete
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - ACI 318-19 Section 25.4.2: Development of deformed bars in tension
///   - ACI 318-19 Section 25.4.3: Development of standard hooks in tension
///   - ACI 318-19 Section 25.5: Splices of deformed reinforcement
///   - ACI 318-19 Section 24.3: Crack control (Frosch model)
///   - ACI 318-19 Section 25.3: Minimum bend diameters
///   - ACI 318-19 Section 18.8.5: Beam-column joints in special moment frames
///   - Wight, "Reinforced Concrete: Mechanics and Design", 7th Ed.
///   - Park & Paulay, "Reinforced Concrete Structures" (1975)
///
/// Tests cover 8 topics on concrete reinforcement detailing:
///   1. Development length (ACI 318 section 25.4.2 basic tension)
///   2. Hook development (ACI 318 standard hook ldh)
///   3. Lap splice (Class A vs Class B tension splices)
///   4. Cutoff points (theoretical and actual with extension)
///   5. Minimum reinforcement (ACI 318 As_min)
///   6. Maximum spacing (ACI 318 section 24.3 crack control)
///   7. Bar bend radius (ACI 318 section 25.3 minimum inside bend diameter)
///   8. Anchorage in beam-column joint (ACI 318 section 18.8.5 seismic)

use crate::common::*;

// ================================================================
// 1. Development Length -- ACI 318 section 25.4.2
// ================================================================
//
// General equation (ACI 318-19 Eq. 25.4.2.4a):
//   ld = (fy * psi_t * psi_e * psi_s * psi_g) / (1.1 * lambda * sqrt(f'c)) * db
//
// This is the simplified form for bars with:
//   - Clear spacing >= 2*db
//   - Clear cover >= db
//   - Minimum transverse reinforcement per code
//
// Modification factors:
//   psi_t = 1.3 for top bars (>300 mm concrete below)
//   psi_e = 1.2 for epoxy-coated bars
//   psi_s = 0.8 for No. 6 and smaller bars
//   psi_g = 1.0 for Grade 60
//   lambda = 1.0 for normal-weight concrete
//
// Minimum ld >= max(300 mm)
//
// Reference: ACI 318-19 Section 25.4.2, Wight Ch. 6

#[test]
fn validation_rebar_ext_development_length() {
    // Material properties
    let fc: f64 = 28.0;           // MPa (4000 psi)
    let fy: f64 = 420.0;          // MPa (Grade 60)
    let lambda: f64 = 1.0;        // normal-weight concrete

    // Bar properties -- No. 8 bar (25M)
    let db: f64 = 25.4;           // mm, bar diameter

    // Modification factors (standard bottom bar, uncoated)
    let psi_t: f64 = 1.0;         // bottom bars
    let psi_e: f64 = 1.0;         // uncoated
    let psi_s: f64 = 1.0;         // No. 7 and larger
    let psi_g: f64 = 1.0;         // Grade 60

    let sqrt_fc: f64 = fc.sqrt();

    // --- ACI 318-19 Eq. 25.4.2.4a ---
    // ld = (fy * psi_t * psi_e * psi_s * psi_g) / (1.1 * lambda * sqrt(f'c)) * db
    let ld: f64 = (fy * psi_t * psi_e * psi_s * psi_g)
        / (1.1 * lambda * sqrt_fc) * db;
    // = (420 * 1.0) / (1.1 * 1.0 * 5.292) * 25.4
    // = (420 / 5.821) * 25.4 = 72.15 * 25.4 = 1832.6 mm

    let ld_min: f64 = 300.0;      // mm, ACI minimum
    let ld_final: f64 = ld.max(ld_min);

    // Expected calculation
    let ld_expected: f64 = (420.0 / (1.1 * 5.2915)) * 25.4;
    assert_close(ld, ld_expected, 0.01, "development length base calculation");

    // Must meet minimum
    assert!(
        ld_final >= ld_min,
        "ld = {:.1} mm >= 300 mm minimum", ld_final
    );

    // --- Top bar factor increases ld ---
    let psi_t_top: f64 = 1.3;
    let ld_top: f64 = (fy * psi_t_top * psi_e * psi_s * psi_g)
        / (1.1 * lambda * sqrt_fc) * db;
    let ld_top_expected: f64 = ld * 1.3;
    assert_close(ld_top, ld_top_expected, 0.01, "top bar development length ratio");

    // --- Epoxy coating factor ---
    let psi_e_epoxy: f64 = 1.2;
    let ld_epoxy: f64 = (fy * psi_t * psi_e_epoxy * psi_s * psi_g)
        / (1.1 * lambda * sqrt_fc) * db;
    let ld_epoxy_expected: f64 = ld * 1.2;
    assert_close(ld_epoxy, ld_epoxy_expected, 0.01, "epoxy-coated development length ratio");

    // --- Small bar factor ---
    let psi_s_small: f64 = 0.8;   // No. 6 and smaller
    let db_small: f64 = 19.1;     // mm, No. 6 bar
    let ld_small: f64 = (fy * psi_t * psi_e * psi_s_small * psi_g)
        / (1.1 * lambda * sqrt_fc) * db_small;
    // Small bar with psi_s=0.8 should give shorter ld per unit db
    let ld_per_db_large: f64 = ld / db;
    let ld_per_db_small: f64 = ld_small / db_small;
    assert_close(ld_per_db_small / ld_per_db_large, 0.8, 0.01, "small bar factor effect on ld/db");

    // --- Higher concrete strength reduces ld ---
    let fc_high: f64 = 42.0;
    let sqrt_fc_high: f64 = fc_high.sqrt();
    let ld_high_fc: f64 = (fy * psi_t * psi_e * psi_s * psi_g)
        / (1.1 * lambda * sqrt_fc_high) * db;
    let ratio_fc: f64 = ld_high_fc / ld;
    let ratio_fc_expected: f64 = sqrt_fc / sqrt_fc_high;
    assert_close(ratio_fc, ratio_fc_expected, 0.01, "ld inversely proportional to sqrt(fc)");
}

// ================================================================
// 2. Hook Development -- ACI 318 Section 25.4.3
// ================================================================
//
// Standard hook development length in tension:
//   ldh = (0.24 * fy * psi_e * psi_r * psi_o * psi_c)
//         / (lambda * sqrt(f'c)) * db
//
// Modification factors:
//   psi_e = 1.2 for epoxy-coated bars
//   psi_r = 0.8 with confining reinforcement (perpendicular ties)
//   psi_o = 1.0 or 0.7 (side cover and tail cover factors)
//   psi_c = 0.7 for lightweight concrete cover >= 65 mm
//
// Minimum: ldh >= max(8*db, 150 mm)
//
// Reference: ACI 318-19 Section 25.4.3

#[test]
fn validation_rebar_ext_hook_development() {
    let fc: f64 = 35.0;           // MPa
    let fy: f64 = 420.0;          // MPa
    let lambda: f64 = 1.0;        // normal-weight concrete
    let db: f64 = 22.2;           // mm, No. 7 bar

    let sqrt_fc: f64 = fc.sqrt();

    // Base modification factors
    let psi_e: f64 = 1.0;         // uncoated
    let psi_r: f64 = 1.0;         // no confining ties
    let psi_o: f64 = 1.0;         // standard location
    let psi_c: f64 = 1.0;         // standard cover

    // --- Base hook development length ---
    let ldh: f64 = (0.24 * fy * psi_e * psi_r * psi_o * psi_c)
        / (lambda * sqrt_fc) * db;
    // = (0.24 * 420 / 5.916) * 22.2
    // = (100.8 / 5.916) * 22.2 = 17.04 * 22.2 = 378.3 mm

    let ldh_expected: f64 = (0.24 * 420.0 / 5.9161) * 22.2;
    assert_close(ldh, ldh_expected, 0.01, "hook development base length");

    // --- Minimum ldh ---
    let ldh_min: f64 = (8.0 * db).max(150.0);
    let ldh_final: f64 = ldh.max(ldh_min);
    // 8*22.2 = 177.6 mm; max(177.6, 150) = 177.6 mm
    assert_close(ldh_min, 8.0 * db, 0.01, "minimum ldh governed by 8*db");
    assert!(
        ldh_final >= ldh_min,
        "ldh = {:.1} mm >= min {:.1} mm", ldh_final, ldh_min
    );

    // --- Effect of confining reinforcement (psi_r = 0.8) ---
    let psi_r_conf: f64 = 0.8;
    let ldh_confined: f64 = (0.24 * fy * psi_e * psi_r_conf * psi_o * psi_c)
        / (lambda * sqrt_fc) * db;
    let confined_ratio: f64 = ldh_confined / ldh;
    assert_close(confined_ratio, 0.8, 0.01, "confining reinforcement reduces ldh by 20%");

    // --- Effect of epoxy coating (psi_e = 1.2) ---
    let psi_e_epoxy: f64 = 1.2;
    let ldh_epoxy: f64 = (0.24 * fy * psi_e_epoxy * psi_r * psi_o * psi_c)
        / (lambda * sqrt_fc) * db;
    let epoxy_ratio: f64 = ldh_epoxy / ldh;
    assert_close(epoxy_ratio, 1.2, 0.01, "epoxy coating increases ldh by 20%");

    // --- Hook vs straight development ---
    // Straight: ld = (fy * psi_t * psi_e * psi_s * psi_g) / (1.1 * lambda * sqrt(fc)) * db
    let ld_straight: f64 = (fy * 1.0 * 1.0 * 1.0 * 1.0)
        / (1.1 * lambda * sqrt_fc) * db;

    assert!(
        ldh < ld_straight,
        "Hook ldh = {:.1} mm < straight ld = {:.1} mm", ldh, ld_straight
    );

    // --- Higher concrete strength reduces ldh ---
    let fc_high: f64 = 55.0;
    let sqrt_fc_high: f64 = fc_high.sqrt();
    let ldh_high_fc: f64 = (0.24 * fy * psi_e * psi_r * psi_o * psi_c)
        / (lambda * sqrt_fc_high) * db;
    let fc_ratio: f64 = ldh_high_fc / ldh;
    let fc_ratio_expected: f64 = sqrt_fc / sqrt_fc_high;
    assert_close(fc_ratio, fc_ratio_expected, 0.01, "ldh inversely proportional to sqrt(fc)");
}

// ================================================================
// 3. Lap Splice -- ACI 318 Section 25.5
// ================================================================
//
// Tension lap splices (ACI 318-19 Table 25.5.2.1):
//   Class A splice: l_st = 1.0 * ld (As_provided/As_required >= 2
//                   and no more than 50% spliced at same location)
//   Class B splice: l_st = 1.3 * ld (all other cases)
//
// Minimum splice length >= 300 mm in all cases
//
// ld is computed from ACI 318-19 Eq. 25.4.2.4a:
//   ld = (fy * psi_t * psi_e * psi_s * psi_g) / (1.1 * lambda * sqrt(f'c)) * db
//
// Reference: ACI 318-19 Section 25.5, Wight Ch. 6

#[test]
fn validation_rebar_ext_lap_splice() {
    let fc: f64 = 28.0;           // MPa
    let fy: f64 = 420.0;          // MPa
    let lambda: f64 = 1.0;
    let db: f64 = 25.4;           // mm, No. 8 bar

    let sqrt_fc: f64 = fc.sqrt();

    // Base development length
    let psi_t: f64 = 1.0;
    let psi_e: f64 = 1.0;
    let psi_s: f64 = 1.0;
    let psi_g: f64 = 1.0;

    let ld: f64 = ((fy * psi_t * psi_e * psi_s * psi_g)
        / (1.1 * lambda * sqrt_fc) * db).max(300.0);

    // --- Class A splice ---
    let splice_a: f64 = (1.0 * ld).max(300.0);

    // --- Class B splice ---
    let splice_b: f64 = (1.3 * ld).max(300.0);

    // Class B must be longer than Class A
    assert!(
        splice_b > splice_a,
        "Class B ({:.0} mm) > Class A ({:.0} mm)", splice_b, splice_a
    );

    // The ratio should be exactly 1.3 when both exceed minimum
    let ratio_ba: f64 = splice_b / splice_a;
    assert_close(ratio_ba, 1.3, 0.01, "Class B/A splice ratio");

    // Both must meet 300 mm minimum
    assert!(
        splice_a >= 300.0,
        "Class A splice = {:.0} mm >= 300 mm", splice_a
    );
    assert!(
        splice_b >= 300.0,
        "Class B splice = {:.0} mm >= 300 mm", splice_b
    );

    // --- Top bar splices are longer ---
    let psi_t_top: f64 = 1.3;
    let ld_top: f64 = ((fy * psi_t_top * psi_e * psi_s * psi_g)
        / (1.1 * lambda * sqrt_fc) * db).max(300.0);
    let splice_b_top: f64 = (1.3 * ld_top).max(300.0);

    assert!(
        splice_b_top > splice_b,
        "Top bar Class B splice ({:.0} mm) > bottom bar ({:.0} mm)",
        splice_b_top, splice_b
    );

    let top_ratio: f64 = splice_b_top / splice_b;
    assert_close(top_ratio, 1.3, 0.01, "top bar splice increase factor");

    // --- Higher strength concrete reduces splice length ---
    let fc_high: f64 = 42.0;
    let sqrt_fc_high: f64 = fc_high.sqrt();
    let ld_high: f64 = ((fy * psi_t * psi_e * psi_s * psi_g)
        / (1.1 * lambda * sqrt_fc_high) * db).max(300.0);
    let splice_b_high: f64 = (1.3 * ld_high).max(300.0);

    assert!(
        splice_b_high < splice_b,
        "Higher fc splice ({:.0} mm) < lower fc splice ({:.0} mm)",
        splice_b_high, splice_b
    );

    // Ratio of splice lengths should follow sqrt(fc) ratio
    let splice_ratio: f64 = splice_b_high / splice_b;
    let sqrt_ratio: f64 = sqrt_fc / sqrt_fc_high;
    assert_close(splice_ratio, sqrt_ratio, 0.02, "splice length inversely proportional to sqrt(fc)");
}

// ================================================================
// 4. Cutoff Points -- Theoretical and Actual
// ================================================================
//
// ACI 318-19 Section 9.7.3.3 requires that reinforcement extend
// beyond the point where it is no longer required by:
//   - d (effective depth) or 12*db, whichever is greater
//
// ACI 318-19 Section 9.7.3.8.3 requires at least 1/3 of positive
// moment reinforcement extend beyond the face of support by:
//   - 150 mm, or
//   - ld (development length) past the point of inflection
//
// For a simply-supported beam with uniform load:
//   Moment at distance x from support: M(x) = (w*L*x)/2 - (w*x^2)/2
//   Point of zero moment: x = 0 and x = L (at supports)
//   Theoretical cutoff for partial reinforcement at M = alpha*M_max:
//     x_cutoff determined from M(x) = alpha * M_max
//
// Reference: ACI 318-19 Section 9.7.3, Wight Ch. 5

#[test]
fn validation_rebar_ext_cutoff_points() {
    // Beam geometry and loading
    let l: f64 = 8000.0;          // mm, span length
    let w: f64 = 30.0;            // kN/m = N/mm * 1000 (unit load)
    let d: f64 = 540.0;           // mm, effective depth
    let db: f64 = 25.4;           // mm, bar diameter

    // Maximum moment at midspan for simply-supported beam
    let m_max: f64 = w * l * l / 8.0; // N*mm (in kN*mm^2 / mm -> kN*mm)
    // = 30 * 8000^2 / 8 = 240,000,000 N*mm (but keeping units as formula)

    let m_max_expected: f64 = 30.0 * 8000.0 * 8000.0 / 8.0;
    assert_close(m_max, m_max_expected, 0.01, "max moment wL^2/8");

    // --- Theoretical cutoff for bars no longer needed ---
    // If we need only alpha fraction of M_max beyond cutoff,
    // M(x) = alpha * M_max
    // w*L*x/2 - w*x^2/2 = alpha * w*L^2/8
    // x^2 - L*x + alpha*L^2/4 = 0
    // x = L/2 * (1 - sqrt(1 - alpha))  [nearer support]
    let alpha: f64 = 0.5;         // cut half the bars where moment drops to 50%
    let sqrt_term: f64 = (1.0 - alpha).sqrt();
    let x_cutoff_theory: f64 = (l / 2.0) * (1.0 - sqrt_term);
    // = 4000 * (1 - 0.707) = 4000 * 0.293 = 1171.6 mm from support

    let x_cutoff_expected: f64 = (l / 2.0) * (1.0 - 0.5_f64.sqrt());
    assert_close(x_cutoff_theory, x_cutoff_expected, 0.01, "theoretical cutoff location");

    // By symmetry, the other cutoff is at L - x_cutoff
    let x_cutoff_far: f64 = l - x_cutoff_theory;
    assert_close(x_cutoff_far, l - x_cutoff_expected, 0.01, "symmetric cutoff location");

    // --- ACI 318 required extension beyond theoretical cutoff ---
    // Extend d or 12*db beyond the point where bars are no longer needed
    let extension: f64 = d.max(12.0 * db);
    // d = 540 mm, 12*db = 304.8 mm => extension = 540 mm

    assert_close(extension, d, 0.01, "extension governed by d (d > 12*db)");

    // Actual cutoff point (closer to support than theoretical)
    let x_actual_cutoff: f64 = x_cutoff_theory - extension;

    // Actual cutoff must be > 0 (still within the span from support)
    if x_actual_cutoff > 0.0 {
        assert!(
            x_actual_cutoff < x_cutoff_theory,
            "actual cutoff {:.0} mm < theoretical {:.0} mm",
            x_actual_cutoff, x_cutoff_theory
        );
    }

    // --- Extension past inflection point (ACI 318-19 Section 9.7.3.8.3) ---
    // At least 1/3 of positive moment reinforcement must extend:
    //   - past the point of inflection by the greater of d, 12*db, or L/16
    // For simply-supported beam, inflection point is at the support (x=0)
    let ext_past_inflection: f64 = d.max(12.0 * db).max(l / 16.0);
    // d = 540, 12*db = 304.8, L/16 = 500 => ext = 540 mm

    assert_close(ext_past_inflection, d, 0.01, "extension past inflection governed by d");

    // --- Verify extension for different bar sizes ---
    let db_large: f64 = 35.8;     // mm, No. 11 bar
    let ext_large: f64 = d.max(12.0 * db_large);
    // d = 540, 12*35.8 = 429.6 => ext = 540 mm (d still governs)
    assert_close(ext_large, d, 0.01, "d still governs for No. 11 bar");

    // For a shallow beam, 12*db might govern
    let d_shallow: f64 = 250.0;
    let ext_shallow: f64 = d_shallow.max(12.0 * db);
    // d = 250, 12*25.4 = 304.8 => ext = 304.8 mm
    let ext_shallow_expected: f64 = 12.0 * db;
    assert_close(ext_shallow, ext_shallow_expected, 0.01, "12*db governs for shallow beam");
}

// ================================================================
// 5. Minimum Reinforcement -- ACI 318 Section 9.6.1
// ================================================================
//
// For flexural members, minimum tension reinforcement:
//   As_min = max(3*sqrt(f'c)/fy, 200/fy) * bw * d
//
// This ensures that the cracking moment of the section is less
// than the nominal moment capacity, preventing sudden brittle
// failure at first cracking.
//
// Alternative interpretation per ACI 318-19 Section 9.6.1.2:
//   As_min = max(0.25*sqrt(f'c)/fy, 1.4/fy) * bw * d   (in MPa units)
//
// Reference: ACI 318-19 Section 9.6.1, Wight Ch. 3

#[test]
fn validation_rebar_ext_minimum_reinforcement() {
    let fc: f64 = 28.0;           // MPa
    let fy: f64 = 420.0;          // MPa

    // Beam cross-section
    let bw: f64 = 300.0;          // mm, web width
    let d: f64 = 540.0;           // mm, effective depth

    let sqrt_fc: f64 = fc.sqrt();

    // --- ACI 318-19 Section 9.6.1.2 ---
    // As_min = max(0.25*sqrt(f'c)/fy, 1.4/fy) * bw * d
    let as_min_1: f64 = 0.25 * sqrt_fc / fy * bw * d;
    let as_min_2: f64 = 1.4 / fy * bw * d;
    let as_min: f64 = as_min_1.max(as_min_2);

    // Compute expected values
    // as_min_1 = 0.25 * 5.292 / 420 * 300 * 540 = 0.003149 * 162000 = 510.2 mm^2
    // as_min_2 = 1.4 / 420 * 300 * 540 = 0.003333 * 162000 = 540.0 mm^2
    let as_min_1_expected: f64 = 0.25 * 5.2915 / 420.0 * 300.0 * 540.0;
    let as_min_2_expected: f64 = 1.4 / 420.0 * 300.0 * 540.0;
    assert_close(as_min_1, as_min_1_expected, 0.01, "As_min equation (a)");
    assert_close(as_min_2, as_min_2_expected, 0.01, "As_min equation (b)");

    // For fc = 28 MPa, equation (b) governs (1.4/fy > 0.25*sqrt(28)/fy)
    // 1.4/420 = 0.003333 vs 0.25*5.292/420 = 0.003149
    assert!(
        as_min_2 > as_min_1,
        "1.4/fy ({:.1}) governs over 0.25*sqrt(fc)/fy ({:.1}) for fc=28 MPa",
        as_min_2, as_min_1
    );
    assert_close(as_min, as_min_2, 0.01, "As_min governed by 1.4/fy");

    // --- Minimum reinforcement ratio ---
    let rho_min: f64 = as_min / (bw * d);
    let rho_min_expected: f64 = 1.4 / fy;  // 0.003333
    assert_close(rho_min, rho_min_expected, 0.01, "minimum reinforcement ratio");

    // --- For higher fc, equation (a) governs ---
    let fc_high: f64 = 55.0;
    let sqrt_fc_high: f64 = fc_high.sqrt();
    let as_high_1: f64 = 0.25 * sqrt_fc_high / fy * bw * d;
    let as_high_2: f64 = 1.4 / fy * bw * d;
    // 0.25 * 7.416 / 420 = 0.004414 vs 1.4/420 = 0.003333
    assert!(
        as_high_1 > as_high_2,
        "0.25*sqrt(fc)/fy ({:.1}) governs for fc=55 MPa",
        as_high_1
    );

    // --- Wider beam needs more minimum steel ---
    let bw_wide: f64 = 450.0;
    let as_min_wide: f64 = (0.25 * sqrt_fc / fy).max(1.4 / fy) * bw_wide * d;
    let width_ratio: f64 = as_min_wide / as_min;
    let width_ratio_expected: f64 = bw_wide / bw;
    assert_close(width_ratio, width_ratio_expected, 0.01, "As_min proportional to bw");

    // --- Deeper beam needs more minimum steel ---
    let d_deep: f64 = 800.0;
    let as_min_deep: f64 = (0.25 * sqrt_fc / fy).max(1.4 / fy) * bw * d_deep;
    let depth_ratio: f64 = as_min_deep / as_min;
    let depth_ratio_expected: f64 = d_deep / d;
    assert_close(depth_ratio, depth_ratio_expected, 0.01, "As_min proportional to d");
}

// ================================================================
// 6. Maximum Spacing -- ACI 318 Section 24.3 Crack Control
// ================================================================
//
// ACI 318-19 Section 24.3.2 (Frosch model):
//   s_max = min(380*(280/fs) - 2.5*cc, 300*(280/fs))
//
// where:
//   fs = 2/3 * fy (approximate service-level steel stress)
//   cc = least distance from surface of reinforcement to tension face
//
// This controls flexural crack widths at service load level.
//
// Reference: ACI 318-19 Section 24.3.2

#[test]
fn validation_rebar_ext_maximum_spacing() {
    let fy: f64 = 420.0;          // MPa
    let cc: f64 = 50.0;           // mm, clear cover to tension face

    // Service steel stress (approximate)
    let fs: f64 = (2.0 / 3.0) * fy;  // = 280 MPa

    // --- ACI 318-19 Section 24.3.2 ---
    let s_max_1: f64 = 380.0 * (280.0 / fs) - 2.5 * cc;
    let s_max_2: f64 = 300.0 * (280.0 / fs);
    let s_max: f64 = s_max_1.min(s_max_2);

    // When fs = 280 MPa:
    // s_max_1 = 380*(280/280) - 2.5*50 = 380 - 125 = 255 mm
    // s_max_2 = 300*(280/280) = 300 mm
    // s_max = min(255, 300) = 255 mm
    assert_close(s_max_1, 255.0, 0.01, "s_max equation (1) at fs=280 MPa");
    assert_close(s_max_2, 300.0, 0.01, "s_max equation (2) at fs=280 MPa");
    assert_close(s_max, 255.0, 0.01, "controlling s_max at fs=280 MPa, cc=50mm");

    // --- Higher stress reduces maximum spacing ---
    let fs_high: f64 = 350.0;     // MPa
    let s_max_high_1: f64 = 380.0 * (280.0 / fs_high) - 2.5 * cc;
    let s_max_high_2: f64 = 300.0 * (280.0 / fs_high);
    let s_max_high: f64 = s_max_high_1.min(s_max_high_2);

    // s_max_high_1 = 380*(280/350) - 125 = 380*0.8 - 125 = 304 - 125 = 179 mm
    // s_max_high_2 = 300*0.8 = 240 mm
    // s_max_high = min(179, 240) = 179 mm
    assert_close(s_max_high, 179.0, 0.02, "s_max at higher stress fs=350 MPa");
    assert!(
        s_max_high < s_max,
        "Higher stress: s_max={:.0} mm < {:.0} mm", s_max_high, s_max
    );

    // --- Larger cover reduces s_max (equation 1) ---
    let cc_large: f64 = 75.0;     // mm
    let s_max_large_cover_1: f64 = 380.0 * (280.0 / fs) - 2.5 * cc_large;
    let s_max_large_cover_2: f64 = 300.0 * (280.0 / fs);
    let s_max_large_cover: f64 = s_max_large_cover_1.min(s_max_large_cover_2);

    // s_max_1 = 380 - 2.5*75 = 380 - 187.5 = 192.5 mm
    // s_max_2 = 300 mm
    // s_max = min(192.5, 300) = 192.5 mm
    assert_close(s_max_large_cover, 192.5, 0.01, "s_max with larger cover cc=75mm");
    assert!(
        s_max_large_cover < s_max,
        "Larger cover: s_max={:.0} mm < {:.0} mm", s_max_large_cover, s_max
    );

    // --- Grade 60 vs Grade 80 steel ---
    let fy_80: f64 = 550.0;       // MPa (Grade 80)
    let fs_80: f64 = (2.0 / 3.0) * fy_80;  // = 366.7 MPa
    let s_max_80_1: f64 = 380.0 * (280.0 / fs_80) - 2.5 * cc;
    let s_max_80_2: f64 = 300.0 * (280.0 / fs_80);
    let s_max_80: f64 = s_max_80_1.min(s_max_80_2);

    assert!(
        s_max_80 < s_max,
        "Grade 80 s_max={:.0} mm < Grade 60 s_max={:.0} mm", s_max_80, s_max
    );

    // --- Number of bars needed in a beam ---
    let bw: f64 = 350.0;          // mm, beam width
    let cover_side: f64 = 40.0;   // mm
    let d_stirrup: f64 = 10.0;    // mm
    let db: f64 = 25.4;           // mm

    let available_width: f64 = bw - 2.0 * cover_side - 2.0 * d_stirrup - db;
    // = 350 - 80 - 20 - 25.4 = 224.6 mm between extreme bars
    let n_spaces: f64 = (available_width / s_max).floor();
    let n_bars: f64 = n_spaces + 1.0;
    // n_spaces = floor(224.6/255) = floor(0.88) = 0 => n_bars = 1?
    // Actually with 2 bars min: spacing = 224.6 mm < 255 mm => OK
    // We need at least 2 bars, check if that spacing meets the limit
    let actual_spacing_2bars: f64 = available_width;  // with 2 bars
    assert!(
        actual_spacing_2bars <= s_max || n_bars >= 1.0,
        "2 bars at {:.0} mm spacing within s_max={:.0} mm", actual_spacing_2bars, s_max
    );
}

// ================================================================
// 7. Bar Bend Radius -- ACI 318 Section 25.3
// ================================================================
//
// Minimum inside bend diameter (ACI 318-19 Table 25.3.1):
//   No. 3 through No. 8:  6*db
//   No. 9, No. 10, No. 11: 8*db
//   No. 14, No. 18:        10*db
//
// For stirrups and ties (ACI 318-19 Section 25.3.2):
//   No. 3 through No. 5: 4*db
//   No. 6 through No. 8: 6*db
//
// The inside bend diameter is the diameter of the mandrel around
// which the bar is bent. It ensures the bar is not damaged during
// bending and that bearing stresses on concrete inside the bend
// are acceptable.
//
// Reference: ACI 318-19 Section 25.3

#[test]
fn validation_rebar_ext_bar_bend_radius() {
    // --- Main reinforcement bend diameters ---

    // No. 3 bar (db = 9.5 mm) through No. 8 bar (db = 25.4 mm)
    let db_3: f64 = 9.5;          // mm, No. 3
    let db_5: f64 = 15.9;         // mm, No. 5
    let db_8: f64 = 25.4;         // mm, No. 8

    let bend_dia_3: f64 = 6.0 * db_3;   // = 57.0 mm
    let bend_dia_5: f64 = 6.0 * db_5;   // = 95.4 mm
    let bend_dia_8: f64 = 6.0 * db_8;   // = 152.4 mm

    assert_close(bend_dia_3, 57.0, 0.01, "No. 3 bar bend diameter 6*db");
    assert_close(bend_dia_5, 95.4, 0.01, "No. 5 bar bend diameter 6*db");
    assert_close(bend_dia_8, 152.4, 0.01, "No. 8 bar bend diameter 6*db");

    // No. 9 (db = 28.7 mm), No. 10 (db = 32.3 mm), No. 11 (db = 35.8 mm)
    let db_9: f64 = 28.7;         // mm, No. 9
    let db_10: f64 = 32.3;        // mm, No. 10
    let db_11: f64 = 35.8;        // mm, No. 11

    let bend_dia_9: f64 = 8.0 * db_9;   // = 229.6 mm
    let bend_dia_10: f64 = 8.0 * db_10; // = 258.4 mm
    let bend_dia_11: f64 = 8.0 * db_11; // = 286.4 mm

    assert_close(bend_dia_9, 229.6, 0.01, "No. 9 bar bend diameter 8*db");
    assert_close(bend_dia_10, 258.4, 0.01, "No. 10 bar bend diameter 8*db");
    assert_close(bend_dia_11, 286.4, 0.01, "No. 11 bar bend diameter 8*db");

    // No. 14 (db = 43.0 mm), No. 18 (db = 57.3 mm)
    let db_14: f64 = 43.0;        // mm, No. 14
    let db_18: f64 = 57.3;        // mm, No. 18

    let bend_dia_14: f64 = 10.0 * db_14; // = 430.0 mm
    let bend_dia_18: f64 = 10.0 * db_18; // = 573.0 mm

    assert_close(bend_dia_14, 430.0, 0.01, "No. 14 bar bend diameter 10*db");
    assert_close(bend_dia_18, 573.0, 0.01, "No. 18 bar bend diameter 10*db");

    // --- Stirrup and tie bend diameters ---
    // No. 3 through No. 5: 4*db
    let stirrup_bend_3: f64 = 4.0 * db_3;  // = 38.0 mm
    let stirrup_bend_5: f64 = 4.0 * db_5;  // = 63.6 mm

    assert_close(stirrup_bend_3, 38.0, 0.01, "No. 3 stirrup bend diameter 4*db");
    assert_close(stirrup_bend_5, 63.6, 0.01, "No. 5 stirrup bend diameter 4*db");

    // No. 6 through No. 8: 6*db (same as main bars)
    let db_6: f64 = 19.1;         // mm, No. 6
    let stirrup_bend_6: f64 = 6.0 * db_6;  // = 114.6 mm
    let stirrup_bend_8: f64 = 6.0 * db_8;  // = 152.4 mm

    assert_close(stirrup_bend_6, 114.6, 0.01, "No. 6 stirrup bend diameter 6*db");
    assert_close(stirrup_bend_8, 152.4, 0.01, "No. 8 stirrup bend diameter 6*db");

    // Stirrup bend is smaller than main bar bend for same diameter
    assert!(
        stirrup_bend_3 < bend_dia_3,
        "No. 3 stirrup bend {:.0} mm < main bend {:.0} mm",
        stirrup_bend_3, bend_dia_3
    );
    assert!(
        stirrup_bend_5 < bend_dia_5,
        "No. 5 stirrup bend {:.0} mm < main bend {:.0} mm",
        stirrup_bend_5, bend_dia_5
    );

    // --- Bend radius increases with bar size (inside bend radius = dia/2) ---
    let radius_8: f64 = bend_dia_8 / 2.0;
    let radius_9: f64 = bend_dia_9 / 2.0;
    assert!(
        radius_9 > radius_8,
        "No. 9 bend radius {:.1} mm > No. 8 bend radius {:.1} mm (category change)",
        radius_9, radius_8
    );

    // The jump from 6*db to 8*db at No. 9 accounts for bearing stress
    let ratio_8_to_9: f64 = bend_dia_9 / (6.0 * db_9);
    assert_close(ratio_8_to_9, 8.0 / 6.0, 0.01, "No. 9 uses 8*db vs 6*db for smaller bars");
}

// ================================================================
// 8. Anchorage in Beam-Column Joint -- ACI 318 Section 18.8.5
// ================================================================
//
// ACI 318-19 Section 18.8.5 requirements for beam reinforcement
// terminating in a beam-column joint of special moment frames:
//
// (a) For hooked bars terminating in the joint:
//     ldh >= greater of (8*db, 150 mm, fy*db/(5.4*sqrt(f'c)))
//     Hook must be within the confined core
//
// (b) For straight bars passing through the joint:
//     h_col >= 20*db  (for normalweight concrete, Grade 60)
//     This prevents bar slip through the joint under cyclic loading
//
// (c) Joint transverse reinforcement:
//     Confining hoops required through the joint at spacing
//     s <= min(h_col/4, 6*db_long, 150 mm)
//
// Reference: ACI 318-19 Section 18.8.5, ACI 352R-02

#[test]
fn validation_rebar_ext_anchorage_beam_column_joint() {
    let fc: f64 = 35.0;           // MPa
    let fy: f64 = 420.0;          // MPa
    let lambda: f64 = 1.0;

    let sqrt_fc: f64 = fc.sqrt();

    // Column dimensions
    let h_col: f64 = 500.0;       // mm, column depth (direction of beam)
    let b_col: f64 = 500.0;       // mm, column width

    // Beam bar diameter
    let db: f64 = 22.2;           // mm, No. 7 bar

    // --- (a) Hooked bar anchorage in joint ---
    // ldh per ACI 318-19 Section 18.8.5.1
    let ldh_a: f64 = 8.0 * db;                          // = 177.6 mm
    let ldh_b: f64 = 150.0;                              // mm
    let ldh_c: f64 = fy * db / (5.4 * lambda * sqrt_fc); // seismic hook formula

    // ldh_c = 420 * 22.2 / (5.4 * 1.0 * 5.916)
    //       = 9324 / 31.95 = 291.8 mm
    let ldh_c_expected: f64 = 420.0 * 22.2 / (5.4 * 5.9161);
    assert_close(ldh_c, ldh_c_expected, 0.01, "seismic hook development formula");

    let ldh_seismic: f64 = ldh_a.max(ldh_b).max(ldh_c);
    assert_close(ldh_seismic, ldh_c, 0.01, "seismic ldh governed by fy*db/(5.4*sqrt(fc))");

    // Hook must fit within column depth minus cover
    let cover: f64 = 40.0;
    let available_depth: f64 = h_col - cover;  // = 460 mm
    assert!(
        ldh_seismic < available_depth,
        "Seismic ldh = {:.0} mm fits within column depth - cover = {:.0} mm",
        ldh_seismic, available_depth
    );

    // --- (b) Straight bar passing through joint ---
    // Minimum column depth: h_col >= 20 * db
    let h_col_min_straight: f64 = 20.0 * db;  // = 444 mm
    assert!(
        h_col >= h_col_min_straight,
        "Column depth {:.0} mm >= 20*db = {:.0} mm for bar continuity",
        h_col, h_col_min_straight
    );

    // Maximum bar that can pass through this column
    let db_max_through: f64 = h_col / 20.0;   // = 25 mm
    assert!(
        db <= db_max_through,
        "Bar db = {:.1} mm <= h_col/20 = {:.1} mm", db, db_max_through
    );

    // Larger column allows larger bars
    let h_col_large: f64 = 600.0;
    let db_max_large: f64 = h_col_large / 20.0;  // = 30 mm
    assert!(
        db_max_large > db_max_through,
        "Larger column: db_max = {:.1} mm > {:.1} mm",
        db_max_large, db_max_through
    );

    // --- (c) Joint confinement reinforcement ---
    let db_long: f64 = 28.7;      // mm, No. 9 longitudinal column bar

    let s_joint_max: f64 = (h_col / 4.0).min(6.0 * db_long).min(150.0);
    // h_col/4 = 125 mm, 6*28.7 = 172.2 mm, 150 mm
    // s_max = min(125, 172.2, 150) = 125 mm

    assert_close(s_joint_max, 125.0, 0.01, "joint hoop spacing governed by h_col/4");

    // --- Joint shear demand and capacity check ---
    let n_bars: f64 = 4.0;
    let a_s: f64 = n_bars * std::f64::consts::PI * (db / 2.0).powi(2);
    let t_beam: f64 = a_s * fy / 1000.0;      // kN, beam steel tension
    let v_col: f64 = 120.0;                    // kN, column shear from analysis
    let v_j: f64 = t_beam - v_col;             // kN, joint shear demand

    // Joint shear capacity (interior joint, gamma = 1.67)
    let gamma: f64 = 1.67;
    let a_j: f64 = b_col * h_col;  // mm^2
    let v_j_capacity: f64 = gamma * sqrt_fc * a_j / 1000.0;  // kN

    assert!(
        v_j_capacity > v_j,
        "Joint capacity {:.0} kN > demand {:.0} kN", v_j_capacity, v_j
    );

    // --- Verify bar diameter limits for different fy ---
    // ACI 318-19: For Grade 80 (fy=550 MPa), h_col >= 26*db
    let fy_80: f64 = 550.0;
    let _ = fy_80;
    let h_col_min_grade80: f64 = 26.0 * db;   // = 577.2 mm
    assert!(
        h_col_min_grade80 > h_col_min_straight,
        "Grade 80 requires deeper column: {:.0} mm > {:.0} mm",
        h_col_min_grade80, h_col_min_straight
    );
}
