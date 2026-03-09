/// Validation: Cross-Section Classification — Extended
///
/// References:
///   - EN 1993-1-1:2005 SS5.5, Table 5.2 (EC3 classification)
///   - EN 1993-1-1:2005 SS5.5.3, Table 5.2 Sheet 3 (CHS and internal elements)
///   - AISC 360-22 Table B4.1a (axial compression), Table B4.1b (flexure)
///   - Trahair, Bradford, Nethercot, Gardner: "The Behaviour and Design of Steel Structures to EC3" 4th ed.
///   - SCI Publication P362: "Steel Building Design: Design Data" (section property tables)
///
/// Tests extend the base cross_section_classification suite with additional
/// section types and loading conditions: CHS, RHS, welded box sections,
/// web under combined bending+compression, Class 4 flanges, AISC HSS,
/// steel grade comparison, and AISC slender flanges.

// ================================================================
// Steel material constants
// ================================================================
const E_STEEL: f64 = 200_000.0; // MPa (Young's modulus)
const FY_S235: f64 = 235.0; // MPa (S235 yield strength)
const FY_S355: f64 = 355.0; // MPa (S355 yield strength)
const FY_S460: f64 = 460.0; // MPa (S460 yield strength)

// ================================================================
// EC3 classification enums and helpers
// ================================================================

#[derive(Debug, PartialEq, Clone, Copy)]
enum Ec3Class {
    Class1, // Plastic (can form plastic hinge with rotation capacity)
    Class2, // Compact (can reach plastic moment but limited rotation)
    Class3, // Semi-compact (elastic moment only)
    Class4, // Slender (local buckling before yield)
}

/// Epsilon parameter per EN 1993-1-1 Table 5.2: epsilon = sqrt(235 / fy)
fn ec3_epsilon(fy: f64) -> f64 {
    (235.0 / fy).sqrt()
}

/// Classify an I-section web in pure bending per EC3 Table 5.2.
///
/// Class 1 if c/tw <= 72*epsilon
/// Class 2 if c/tw <= 83*epsilon
/// Class 3 if c/tw <= 124*epsilon
/// Class 4 otherwise
fn ec3_classify_web_bending(c: f64, tw: f64, fy: f64) -> Ec3Class {
    let eps = ec3_epsilon(fy);
    let ratio = c / tw;
    if ratio <= 72.0 * eps {
        Ec3Class::Class1
    } else if ratio <= 83.0 * eps {
        Ec3Class::Class2
    } else if ratio <= 124.0 * eps {
        Ec3Class::Class3
    } else {
        Ec3Class::Class4
    }
}

/// Classify an I-section web under combined bending and compression per EC3 Table 5.2.
///
/// psi = stress ratio at edges: psi > -1 means part in compression.
/// alpha = fraction of web in compression = (1 - psi) / (2 * (1 - psi)) for linear stress.
/// For psi = 1 (uniform compression): use compression limits.
/// For -1 < psi < 1 (bending + compression):
///   Class 1 if c/tw <= 396*eps / (13*alpha - 1)   when alpha > 0.5
///   Class 2 if c/tw <= 456*eps / (13*alpha - 1)   when alpha > 0.5
///   Class 3 if c/tw <= 42*eps / (0.67 + 0.33*psi) when psi >= -1
///   Class 4 otherwise
fn ec3_classify_web_bending_compression(c: f64, tw: f64, fy: f64, alpha: f64, psi: f64) -> Ec3Class {
    let eps = ec3_epsilon(fy);
    let ratio = c / tw;
    if alpha > 0.5 {
        let class1_limit = 396.0 * eps / (13.0 * alpha - 1.0);
        let class2_limit = 456.0 * eps / (13.0 * alpha - 1.0);
        let class3_limit = 42.0 * eps / (0.67 + 0.33 * psi);
        if ratio <= class1_limit {
            Ec3Class::Class1
        } else if ratio <= class2_limit {
            Ec3Class::Class2
        } else if ratio <= class3_limit {
            Ec3Class::Class3
        } else {
            Ec3Class::Class4
        }
    } else {
        // alpha <= 0.5: predominantly tension, very generous limits
        let class1_limit = 36.0 * eps / alpha;
        let class2_limit = 41.5 * eps / alpha;
        let class3_limit = 42.0 * eps / (0.67 + 0.33 * psi);
        if ratio <= class1_limit {
            Ec3Class::Class1
        } else if ratio <= class2_limit {
            Ec3Class::Class2
        } else if ratio <= class3_limit {
            Ec3Class::Class3
        } else {
            Ec3Class::Class4
        }
    }
}

/// Classify an I-section outstand flange in compression per EC3 Table 5.2.
///
/// Class 1 if c/tf <= 9*epsilon
/// Class 2 if c/tf <= 10*epsilon
/// Class 3 if c/tf <= 14*epsilon
/// Class 4 otherwise
fn ec3_classify_flange_outstand(c: f64, tf: f64, fy: f64) -> Ec3Class {
    let eps = ec3_epsilon(fy);
    let ratio = c / tf;
    if ratio <= 9.0 * eps {
        Ec3Class::Class1
    } else if ratio <= 10.0 * eps {
        Ec3Class::Class2
    } else if ratio <= 14.0 * eps {
        Ec3Class::Class3
    } else {
        Ec3Class::Class4
    }
}

/// Classify an internal compression element (e.g. box flange or RHS wall in compression)
/// per EC3 Table 5.2 (Part: "Internal compression parts subject to compression").
///
/// Class 1 if c/t <= 33*epsilon
/// Class 2 if c/t <= 38*epsilon
/// Class 3 if c/t <= 42*epsilon
/// Class 4 otherwise
fn ec3_classify_internal_compression(c: f64, t: f64, fy: f64) -> Ec3Class {
    let eps = ec3_epsilon(fy);
    let ratio = c / t;
    if ratio <= 33.0 * eps {
        Ec3Class::Class1
    } else if ratio <= 38.0 * eps {
        Ec3Class::Class2
    } else if ratio <= 42.0 * eps {
        Ec3Class::Class3
    } else {
        Ec3Class::Class4
    }
}

/// Classify a CHS (Circular Hollow Section) per EC3 Table 5.2 (Sheet 3).
///
/// d/t ratio is compared to epsilon-squared limits:
///   Class 1 if d/t <= 50*epsilon^2
///   Class 2 if d/t <= 70*epsilon^2
///   Class 3 if d/t <= 90*epsilon^2
///   Class 4 otherwise
fn ec3_classify_chs(d: f64, t: f64, fy: f64) -> Ec3Class {
    let eps = ec3_epsilon(fy);
    let eps2 = eps * eps;
    let ratio = d / t;
    if ratio <= 50.0 * eps2 {
        Ec3Class::Class1
    } else if ratio <= 70.0 * eps2 {
        Ec3Class::Class2
    } else if ratio <= 90.0 * eps2 {
        Ec3Class::Class3
    } else {
        Ec3Class::Class4
    }
}

/// Overall EC3 section class: governed by the worst (highest) class of any element.
fn ec3_overall_class(web_class: &Ec3Class, flange_class: &Ec3Class) -> Ec3Class {
    match (web_class, flange_class) {
        (Ec3Class::Class4, _) | (_, Ec3Class::Class4) => Ec3Class::Class4,
        (Ec3Class::Class3, _) | (_, Ec3Class::Class3) => Ec3Class::Class3,
        (Ec3Class::Class2, _) | (_, Ec3Class::Class2) => Ec3Class::Class2,
        _ => Ec3Class::Class1,
    }
}

// ================================================================
// AISC classification enums and helpers
// ================================================================

#[derive(Debug, PartialEq)]
enum AiscClass {
    Compact,
    Noncompact,
    Slender,
}

/// Classify I-section flange per AISC 360-22 Table B4.1b (Case 10).
///
/// lambda = b_f / (2 * t_f)
/// lambda_p = 0.38 * sqrt(E / Fy)
/// lambda_r = 1.0 * sqrt(E / Fy)
fn aisc_classify_flange(bf: f64, tf: f64, e: f64, fy: f64) -> AiscClass {
    let lambda = bf / (2.0 * tf);
    let lambda_p = 0.38 * (e / fy).sqrt();
    let lambda_r = 1.0 * (e / fy).sqrt();
    if lambda <= lambda_p {
        AiscClass::Compact
    } else if lambda <= lambda_r {
        AiscClass::Noncompact
    } else {
        AiscClass::Slender
    }
}

/// Classify I-section web per AISC 360-22 Table B4.1b (Case 15).
///
/// lambda = h / t_w
/// lambda_p = 3.76 * sqrt(E / Fy)
/// lambda_r = 5.70 * sqrt(E / Fy)
fn aisc_classify_web(h: f64, tw: f64, e: f64, fy: f64) -> AiscClass {
    let lambda = h / tw;
    let lambda_p = 3.76 * (e / fy).sqrt();
    let lambda_r = 5.70 * (e / fy).sqrt();
    if lambda <= lambda_p {
        AiscClass::Compact
    } else if lambda <= lambda_r {
        AiscClass::Noncompact
    } else {
        AiscClass::Slender
    }
}

/// Classify HSS (Hollow Structural Section) wall in flexure per AISC 360-22 Table B4.1b (Case 19).
///
/// lambda = b/t (flat width to thickness)
/// lambda_p = 1.12 * sqrt(E / Fy)
/// lambda_r = 1.40 * sqrt(E / Fy)
fn aisc_classify_hss_wall_flexure(b_flat: f64, t: f64, e: f64, fy: f64) -> AiscClass {
    let lambda = b_flat / t;
    let lambda_p = 1.12 * (e / fy).sqrt();
    let lambda_r = 1.40 * (e / fy).sqrt();
    if lambda <= lambda_p {
        AiscClass::Compact
    } else if lambda <= lambda_r {
        AiscClass::Noncompact
    } else {
        AiscClass::Slender
    }
}

/// Overall AISC section class: governed by the worst (most slender) classification.
fn aisc_overall_class(web_class: &AiscClass, flange_class: &AiscClass) -> AiscClass {
    match (web_class, flange_class) {
        (AiscClass::Slender, _) | (_, AiscClass::Slender) => AiscClass::Slender,
        (AiscClass::Noncompact, _) | (_, AiscClass::Noncompact) => AiscClass::Noncompact,
        _ => AiscClass::Compact,
    }
}

// ================================================================
// 1. EC3 Web Under Combined Bending and Compression (alpha > 0.5)
// ================================================================
//
// Welded I-section acting as beam-column in S235:
//   h = 500 mm, b = 200 mm, tw = 8.0 mm, tf = 16.0 mm
//
// Axial compression plus major-axis bending gives stress ratio psi = 0.2
// (both edges in compression, but one more than the other).
//
// alpha = fraction of web in compression = (1 + psi) / 2 for stress on web
// For a beam-column: alpha is computed from the axial stress relative to bending stress.
// Here we take alpha = 0.7 (70% of web in compression).
//
// epsilon = 1.0 (S235)
//
// Web: c = h - 2*tf = 500 - 32 = 468 mm
//      c/tw = 468 / 8.0 = 58.5
//      Class 1 limit: 396*eps / (13*0.7 - 1) = 396 / 8.1 = 48.89
//      Class 2 limit: 456*eps / (13*0.7 - 1) = 456 / 8.1 = 56.30
//      Class 3 limit: 42*eps / (0.67 + 0.33*0.2) = 42 / 0.736 = 57.07
//
//      58.5 > 57.07 -> Class 4 (web is slender under combined loading!)
//
// This demonstrates how axial compression significantly reduces web class.
// Under pure bending: c/tw = 58.5 vs limit 72 -> would be Class 1.

#[test]
fn validation_ec3_web_combined_bending_compression() {
    let h = 500.0;
    let tw = 8.0;
    let tf = 16.0;
    let fy = FY_S235;

    let eps = ec3_epsilon(fy);
    assert!((eps - 1.0).abs() < 1e-10, "epsilon for S235 = 1.0");

    let c_web = h - 2.0 * tf; // 468 mm
    let web_ratio = c_web / tw; // 58.5
    assert!(
        (c_web - 468.0_f64).abs() < 0.1,
        "Web clear depth: expected 468, got {:.1}",
        c_web
    );

    // Under pure bending -> Class 1
    let pure_bending_class = ec3_classify_web_bending(c_web, tw, fy);
    assert_eq!(
        pure_bending_class,
        Ec3Class::Class1,
        "Under pure bending, c/tw={:.1} < 72 -> Class 1",
        web_ratio
    );

    // Under combined bending + compression with alpha=0.7, psi=0.2
    let alpha = 0.7;
    let psi = 0.2;
    let class1_limit = 396.0 * eps / (13.0 * alpha - 1.0);
    let class2_limit = 456.0 * eps / (13.0 * alpha - 1.0);
    let class3_limit = 42.0 * eps / (0.67 + 0.33 * psi);

    assert!(
        (class1_limit - 48.89_f64).abs() < 0.1,
        "Class 1 limit: expected ~48.89, got {:.2}",
        class1_limit
    );
    assert!(
        (class2_limit - 56.30_f64).abs() < 0.1,
        "Class 2 limit: expected ~56.30, got {:.2}",
        class2_limit
    );
    assert!(
        (class3_limit - 57.07_f64).abs() < 0.1,
        "Class 3 limit: expected ~57.07, got {:.2}",
        class3_limit
    );

    assert!(
        web_ratio > class3_limit,
        "c/tw = {:.1} > Class 3 limit {:.2} -> Class 4",
        web_ratio,
        class3_limit
    );

    let combined_class = ec3_classify_web_bending_compression(c_web, tw, fy, alpha, psi);
    assert_eq!(
        combined_class,
        Ec3Class::Class4,
        "Under combined loading (alpha=0.7, psi=0.2), web degrades from Class 1 to Class 4"
    );
}

// ================================================================
// 2. EC3 Circular Hollow Section Classification
// ================================================================
//
// CHS 219.1 x 8.0 (hot-finished) in S355:
//   d = 219.1 mm, t = 8.0 mm
//
// epsilon = sqrt(235/355) = 0.8136
// epsilon^2 = 235/355 = 0.6620
//
// d/t = 219.1 / 8.0 = 27.39
//
// Class 1 limit: 50 * eps^2 = 50 * 0.6620 = 33.10
// Class 2 limit: 70 * eps^2 = 70 * 0.6620 = 46.34
// Class 3 limit: 90 * eps^2 = 90 * 0.6620 = 59.58
//
// 27.39 <= 33.10 -> Class 1
//
// Also test CHS 323.9 x 5.0 in S355:
//   d/t = 323.9 / 5.0 = 64.78
//   50*eps^2 = 33.10 -> NOT Class 1
//   70*eps^2 = 46.34 -> NOT Class 2
//   90*eps^2 = 59.58 -> NOT Class 3
//   64.78 > 59.58 -> Class 4

#[test]
fn validation_ec3_chs_classification() {
    let fy = FY_S355;
    let eps = ec3_epsilon(fy);
    let eps2 = eps * eps;

    // Verify epsilon^2 = 235/355
    let expected_eps2: f64 = 235.0 / 355.0;
    assert!(
        (eps2 - expected_eps2).abs() < 1e-10,
        "eps^2 for S355: expected {:.6}, got {:.6}",
        expected_eps2,
        eps2
    );

    // --- CHS 219.1 x 8.0: compact (Class 1) ---
    let d1 = 219.1;
    let t1 = 8.0;
    let ratio1 = d1 / t1; // 27.39
    let class1_limit = 50.0 * eps2; // 33.10

    assert!(
        (ratio1 - 27.39_f64).abs() < 0.1,
        "d/t for CHS 219.1x8 = {:.2}, expected ~27.39",
        ratio1
    );
    assert!(
        ratio1 <= class1_limit,
        "d/t = {:.2} <= 50*eps^2 = {:.2} -> Class 1",
        ratio1,
        class1_limit
    );

    let chs1_class = ec3_classify_chs(d1, t1, fy);
    assert_eq!(
        chs1_class,
        Ec3Class::Class1,
        "CHS 219.1x8.0 in S355 should be Class 1"
    );

    // --- CHS 323.9 x 5.0: slender (Class 4) ---
    let d2 = 323.9;
    let t2 = 5.0;
    let ratio2 = d2 / t2; // 64.78
    let class3_limit = 90.0 * eps2; // 59.58

    assert!(
        (ratio2 - 64.78_f64).abs() < 0.1,
        "d/t for CHS 323.9x5 = {:.2}, expected ~64.78",
        ratio2
    );
    assert!(
        ratio2 > class3_limit,
        "d/t = {:.2} > 90*eps^2 = {:.2} -> Class 4",
        ratio2,
        class3_limit
    );

    let chs2_class = ec3_classify_chs(d2, t2, fy);
    assert_eq!(
        chs2_class,
        Ec3Class::Class4,
        "CHS 323.9x5.0 in S355 should be Class 4"
    );
}

// ================================================================
// 3. EC3 Class 4 Outstand Flange (very thin flange)
// ================================================================
//
// Welded I-section with extremely thin flanges in S460:
//   h = 400 mm, b = 300 mm, tw = 10.0 mm, tf = 8.0 mm
//
// epsilon = sqrt(235/460) = 0.7146
//
// Flange outstand (welded): c = (b - tw) / 2 = (300 - 10) / 2 = 145.0 mm
// c/tf = 145.0 / 8.0 = 18.125
//
// Class 1 limit: 9*eps = 9 * 0.7146 = 6.43
// Class 2 limit: 10*eps = 10 * 0.7146 = 7.15
// Class 3 limit: 14*eps = 14 * 0.7146 = 10.00
//
// 18.125 > 10.00 -> Class 4 (flange is slender!)
//
// Web: c = h - 2*tf = 400 - 16 = 384 mm
//      c/tw = 384 / 10.0 = 38.4
//      72*eps = 51.45 -> Class 1
//
// Overall: Class 4 (governed by slender flange)

#[test]
fn validation_ec3_class4_outstand_flange() {
    let h = 400.0;
    let b = 300.0;
    let tw = 10.0;
    let tf = 8.0;
    let fy = FY_S460;

    let eps = ec3_epsilon(fy);
    let expected_eps: f64 = (235.0_f64 / 460.0).sqrt();
    assert!(
        (eps - expected_eps).abs() < 1e-10,
        "epsilon for S460: expected {:.6}, got {:.6}",
        expected_eps,
        eps
    );

    // Flange classification (welded outstand)
    let c_flange = (b - tw) / 2.0; // 145.0 mm
    let flange_ratio = c_flange / tf; // 18.125
    let class3_flange_limit = 14.0 * eps;

    assert!(
        (c_flange - 145.0_f64).abs() < 0.1,
        "Flange outstand: expected 145.0, got {:.1}",
        c_flange
    );
    assert!(
        (flange_ratio - 18.125_f64).abs() < 0.01,
        "Flange c/tf: expected 18.125, got {:.3}",
        flange_ratio
    );
    assert!(
        flange_ratio > class3_flange_limit,
        "c/tf = {:.3} > 14*eps = {:.2} -> Class 4 flange",
        flange_ratio,
        class3_flange_limit
    );

    let flange_class = ec3_classify_flange_outstand(c_flange, tf, fy);
    assert_eq!(
        flange_class,
        Ec3Class::Class4,
        "Thin flange in S460 should be Class 4"
    );

    // Web classification
    let c_web = h - 2.0 * tf; // 384 mm
    let web_ratio = c_web / tw; // 38.4
    let class1_web_limit = 72.0 * eps;

    assert!(
        web_ratio < class1_web_limit,
        "Web c/tw = {:.1} < 72*eps = {:.2} -> Class 1",
        web_ratio,
        class1_web_limit
    );

    let web_class = ec3_classify_web_bending(c_web, tw, fy);
    assert_eq!(web_class, Ec3Class::Class1, "Web should be Class 1");

    // Overall: governed by Class 4 flange
    let overall = ec3_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        Ec3Class::Class4,
        "Overall should be Class 4 (governed by slender outstand flange)"
    );
}

// ================================================================
// 4. EC3 RHS Class 3 (at boundary between Class 2 and Class 3)
// ================================================================
//
// RHS 250 x 150 x 5.0 (hot-finished) in S355:
//   h = 250 mm, b = 150 mm, t = 5.0 mm
//
// epsilon = sqrt(235/355) = 0.8136
//
// Web-like wall (h face, subject to bending):
//   c = h - 3*t = 250 - 15 = 235 mm (hot-finished corner allowance)
//   c/t = 235 / 5.0 = 47.0
//   72*eps = 58.58 -> Class 1
//
// Flange-like wall (b face, subject to compression):
//   c = b - 3*t = 150 - 15 = 135 mm
//   c/t = 135 / 5.0 = 27.0
//   33*eps = 26.85 -> NOT Class 1
//   38*eps = 30.92 -> Class 2 (27.0 <= 30.92)
//
// Wait: 27.0 > 26.85, so just barely exceeds Class 1 limit.
// Checking: 27.0 <= 38*0.8136 = 30.92 -> Class 2
//
// Overall: Class 2 (governed by flange-like wall)
//
// Now check with S460 instead: eps = 0.7146
//   Flange wall: c/t = 27.0
//     33*eps = 23.58 -> NOT Class 1
//     38*eps = 27.16 -> Class 2 (27.0 <= 27.16, barely!)
//
// Bump to RHS 250 x 150 x 4.5 in S460:
//   c_flange = 150 - 3*4.5 = 136.5 mm
//   c/t = 136.5 / 4.5 = 30.33
//   38*eps = 27.16 -> NOT Class 2
//   42*eps = 30.01 -> NOT Class 3 (30.33 > 30.01)
//   -> Class 4!
//
// But let us pick dimensions that land in Class 3 cleanly.
// RHS 200 x 120 x 4.0 in S355:
//   c_web = 200 - 3*4 = 188, c/t = 47.0, 72*eps = 58.58 -> Class 1
//   c_flange = 120 - 3*4 = 108, c/t = 27.0
//     33*eps = 26.85 -> NOT Class 1
//     38*eps = 30.92 -> Class 2 (27.0 <= 30.92)
// Still Class 2. Let me pick to land in Class 3:
//
// RHS 300 x 200 x 5.0 in S460:
//   eps = 0.7146
//   c_flange = 200 - 3*5 = 185, c/t = 37.0
//     33*eps = 23.58 -> NOT Class 1
//     38*eps = 27.16 -> NOT Class 2
//     42*eps = 30.01 -> NOT Class 3 (37.0 > 30.01) -> Class 4
//
// RHS 200 x 150 x 5.0 in S460:
//   c_flange = 150 - 15 = 135, c/t = 27.0
//   38*eps = 27.16 -> Class 2 (27.0 <= 27.16)
// Too close. Let's use 4.5 mm:
//   c_flange = 150 - 13.5 = 136.5, c/t = 30.33
//   38*eps = 27.16 -> NOT Class 2
//   42*eps = 30.01 -> NOT Class 3 (30.33 > 30.01) -> Class 4
//
// For a clean Class 3 result, use:
// RHS 200 x 150 x 5.0 in S355:
//   eps = 0.8136
//   c_flange = 150 - 15 = 135, c/t = 27.0
//   33*eps = 26.85 -> NOT Class 1 (27.0 > 26.85)
//   38*eps = 30.92 -> Class 2
//   But I want Class 3. Let me try RHS 250 x 200 x 5.0 in S355:
//   c_flange = 200 - 15 = 185, c/t = 37.0
//   33*eps = 26.85 -> NOT Class 1
//   38*eps = 30.92 -> NOT Class 2
//   42*eps = 34.17 -> NOT Class 3 (37.0 > 34.17) -> Class 4
//
// RHS 200 x 170 x 5.0 in S355:
//   c_flange = 170 - 15 = 155, c/t = 31.0
//   38*eps = 30.92 -> NOT Class 2
//   42*eps = 34.17 -> Class 3 (31.0 <= 34.17)
//
// Great! Web: c_web = 200 - 15 = 185, c/t = 37.0
//   72*eps = 58.58 -> Class 1

#[test]
fn validation_ec3_rhs_class3_internal_compression() {
    let h = 200.0; // mm (long face)
    let b = 170.0; // mm (short face, subject to compression in bending)
    let t = 5.0; // mm wall thickness
    let fy = FY_S355;

    let eps = ec3_epsilon(fy);

    // Web-like wall (h face, bending): hot-finished corner deduction
    let c_web = h - 3.0 * t; // 185 mm
    let web_ratio = c_web / t; // 37.0
    let web_class1_limit = 72.0 * eps; // 58.58

    assert!(
        (c_web - 185.0_f64).abs() < 0.1,
        "Web internal flat width: expected 185, got {:.1}",
        c_web
    );
    assert!(
        web_ratio < web_class1_limit,
        "Web c/t = {:.1} < 72*eps = {:.2} -> Class 1 in bending",
        web_ratio,
        web_class1_limit
    );

    // Flange-like wall (b face, compression): internal compression element
    let c_flange = b - 3.0 * t; // 155 mm
    let flange_ratio = c_flange / t; // 31.0

    assert!(
        (c_flange - 155.0_f64).abs() < 0.1,
        "Flange internal flat width: expected 155, got {:.1}",
        c_flange
    );
    assert!(
        (flange_ratio - 31.0_f64).abs() < 0.1,
        "Flange c/t: expected 31.0, got {:.2}",
        flange_ratio
    );

    // Check Class 2 limit is exceeded
    let class2_limit = 38.0 * eps;
    assert!(
        flange_ratio > class2_limit,
        "c/t = {:.1} > 38*eps = {:.2} -> exceeds Class 2 limit",
        flange_ratio,
        class2_limit
    );

    // Check Class 3 limit is NOT exceeded
    let class3_limit = 42.0 * eps;
    assert!(
        flange_ratio <= class3_limit,
        "c/t = {:.1} <= 42*eps = {:.2} -> within Class 3 limit",
        flange_ratio,
        class3_limit
    );

    let flange_class = ec3_classify_internal_compression(c_flange, t, fy);
    assert_eq!(
        flange_class,
        Ec3Class::Class3,
        "RHS flange wall (compression face) should be Class 3"
    );

    // Web wall remains Class 1 under bending
    let web_class = ec3_classify_web_bending(c_web, t, fy);
    assert_eq!(web_class, Ec3Class::Class1, "RHS web wall should be Class 1 in bending");

    // Overall: Class 3 governed by the compression flange wall
    let overall = ec3_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        Ec3Class::Class3,
        "RHS 200x170x5 in S355: overall Class 3 (governed by compression wall)"
    );
}

// ================================================================
// 5. AISC HSS (Hollow Structural Section) Classification
// ================================================================
//
// HSS 10x6x3/8 (254 x 152.4 x 9.525 mm):
//   h = 254 mm, b = 152.4 mm, t = 9.525 mm
//   Fy = 345 MPa (50 ksi), E = 200000 MPa
//
// Flat width deduction for HSS: b_flat = b - 3*t (AISC uses 3t corner radius approx)
//
// Web (long face, in flexure):
//   b_flat_web = h - 3*t = 254 - 28.575 = 225.425 mm
//   lambda = 225.425 / 9.525 = 23.67
//   lambda_p = 2.42 * sqrt(E/Fy) = 2.42 * sqrt(200000/345) = 58.27 [AISC Table B4.1b Case 19]
//   Actually for HSS web in flexure: lambda_p = 2.42*sqrt(E/Fy), lambda_r = 5.70*sqrt(E/Fy)
//   23.67 <= 58.27 -> Compact
//
// Flange (short face, in compression due to bending):
//   b_flat_flange = b - 3*t = 152.4 - 28.575 = 123.825 mm
//   lambda = 123.825 / 9.525 = 13.00
//   lambda_p = 1.12*sqrt(E/Fy) = 1.12*sqrt(200000/345) = 26.96
//   13.00 <= 26.96 -> Compact
//
// Overall: Compact

#[test]
fn validation_aisc_hss_classification() {
    let h = 254.0; // mm (10 in)
    let b = 152.4; // mm (6 in)
    let t = 9.525; // mm (3/8 in)
    let fy = 345.0; // MPa (50 ksi)
    let e = E_STEEL;

    // Flat widths (AISC corner deduction = 3t)
    let b_flat_web = h - 3.0 * t; // 225.425 mm
    let b_flat_flange = b - 3.0 * t; // 123.825 mm

    assert!(
        (b_flat_web - 225.425_f64).abs() < 0.01,
        "Web flat width: expected 225.425, got {:.3}",
        b_flat_web
    );
    assert!(
        (b_flat_flange - 123.825_f64).abs() < 0.01,
        "Flange flat width: expected 123.825, got {:.3}",
        b_flat_flange
    );

    // Flange classification (compression face in flexure)
    let lambda_f = b_flat_flange / t; // 13.00
    let lambda_pf = 1.12 * (e / fy).sqrt(); // 26.96

    assert!(
        (lambda_f - 13.00_f64).abs() < 0.1,
        "Flange lambda = {:.2}, expected ~13.00",
        lambda_f
    );
    assert!(
        lambda_f <= lambda_pf,
        "Flange lambda = {:.2} <= lambda_p = {:.2} -> Compact",
        lambda_f,
        lambda_pf
    );

    let flange_class = aisc_classify_hss_wall_flexure(b_flat_flange, t, e, fy);
    assert_eq!(
        flange_class,
        AiscClass::Compact,
        "HSS 10x6x3/8 flange wall should be Compact"
    );

    // Web classification (long face in flexure) - use same HSS wall limits
    let lambda_w = b_flat_web / t; // 23.67
    let lambda_pw = 1.12 * (e / fy).sqrt();

    assert!(
        lambda_w <= lambda_pw,
        "Web lambda = {:.2} <= lambda_p = {:.2} -> Compact",
        lambda_w,
        lambda_pw
    );

    let web_class = aisc_classify_hss_wall_flexure(b_flat_web, t, e, fy);
    assert_eq!(
        web_class,
        AiscClass::Compact,
        "HSS 10x6x3/8 web wall should be Compact"
    );

    // Overall
    let overall = aisc_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        AiscClass::Compact,
        "HSS 10x6x3/8 should be Compact overall"
    );

    // Verify both walls are well within limits
    assert!(
        lambda_f < 0.55 * lambda_pf,
        "Flange is well within compact limit (ratio = {:.2})",
        lambda_f / lambda_pf
    );
}

// ================================================================
// 6. AISC Slender Flange (built-up section exceeding lambda_r)
// ================================================================
//
// Built-up I-section with extremely wide, thin flanges:
//   d = 600 mm, bf = 600 mm, tw = 12.0 mm, tf = 10.0 mm
//   Fy = 345 MPa, E = 200000 MPa
//
// Flange: lambda = bf/(2*tf) = 600/(2*10) = 30.0
//         lambda_p = 0.38*sqrt(200000/345) = 9.15
//         lambda_r = 1.0*sqrt(200000/345) = 24.08
//         30.0 > 24.08 -> Slender!
//
// Web:    h = d - 2*tf = 600 - 20 = 580 mm
//         lambda = 580/12 = 48.33
//         lambda_p = 3.76*sqrt(200000/345) = 90.55
//         48.33 <= 90.55 -> Compact
//
// Overall: Slender (governed by flange)

#[test]
fn validation_aisc_slender_flange() {
    let d = 600.0; // mm
    let bf = 600.0; // mm (extremely wide)
    let tw = 12.0; // mm
    let tf = 10.0; // mm (thin relative to width)
    let fy = 345.0; // MPa
    let e = E_STEEL;

    // Flange slenderness
    let lambda_f = bf / (2.0 * tf); // 30.0
    let lambda_pf = 0.38 * (e / fy).sqrt(); // 9.15
    let lambda_rf = 1.0 * (e / fy).sqrt(); // 24.08

    assert!(
        (lambda_f - 30.0_f64).abs() < 0.01,
        "Flange lambda = {:.2}, expected 30.0",
        lambda_f
    );
    assert!(
        lambda_f > lambda_rf,
        "Flange lambda = {:.2} > lambda_r = {:.2} -> Slender",
        lambda_f,
        lambda_rf
    );

    let flange_class = aisc_classify_flange(bf, tf, e, fy);
    assert_eq!(
        flange_class,
        AiscClass::Slender,
        "Very wide flange should be Slender"
    );

    // Web slenderness
    let h_web = d - 2.0 * tf; // 580 mm
    let lambda_w = h_web / tw; // 48.33
    let lambda_pw = 3.76 * (e / fy).sqrt(); // 90.55

    assert!(
        lambda_w < lambda_pw,
        "Web lambda = {:.2} < lambda_p = {:.2} -> Compact",
        lambda_w,
        lambda_pw
    );

    let web_class = aisc_classify_web(h_web, tw, e, fy);
    assert_eq!(web_class, AiscClass::Compact, "Web should be Compact");

    // Overall: slender flange governs
    let overall = aisc_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        AiscClass::Slender,
        "Overall should be Slender (governed by very wide flange)"
    );

    // For slender flanges per AISC 360-22 Table F3.1, the nominal moment
    // is reduced by factor kc. Verify the flange exceeds lambda_r by a
    // significant margin, confirming substantial strength reduction is needed.
    let excess_ratio = (lambda_f - lambda_rf) / lambda_rf;
    assert!(
        excess_ratio > 0.20,
        "Flange exceeds lambda_r by {:.1}% -- significant reduction needed",
        excess_ratio * 100.0
    );

    // Verify that the flange slenderness is far beyond the compact limit
    assert!(
        lambda_f > 3.0 * lambda_pf,
        "Flange lambda = {:.2} is over 3x the compact limit {:.2}",
        lambda_f,
        lambda_pf
    );
}

// ================================================================
// 7. EC3 Steel Grade Comparison: Same Section in S235 vs S355 vs S460
// ================================================================
//
// Welded I-section:
//   h = 500 mm, b = 250 mm, tw = 8.0 mm, tf = 12.0 mm
//
// Web: c = 500 - 24 = 476 mm, c/tw = 59.5
// Flange: c = (250 - 8) / 2 = 121.0 mm, c/tf = 10.083
//
// S235 (eps=1.0):
//   Web: 59.5 < 72 -> Class 1
//   Flange: 10.083 > 10.0 -> NOT Class 2, but <= 14.0 -> Class 3
//   Overall: Class 3
//
// S355 (eps=0.8136):
//   Web: 59.5 > 72*0.8136=58.58 -> NOT Class 1, <= 83*0.8136=67.53 -> Class 2
//   Flange: 10.083 > 10*0.8136=8.14 -> NOT Class 2, <= 14*0.8136=11.39 -> Class 3
//   Overall: Class 3
//
// S460 (eps=0.7146):
//   Web: 59.5 > 83*0.7146=59.31 -> NOT Class 2, <= 124*0.7146=88.61 -> Class 3
//   Flange: 10.083 > 10*0.7146=7.15 -> NOT Class 2, <= 14*0.7146=10.00 -> Class 3
//   Wait: 14*0.7146 = 10.005 and c/tf = 10.083 > 10.005 -> Class 4!
//
//   Overall: Class 4

#[test]
fn validation_ec3_grade_comparison() {
    let h = 500.0;
    let b = 250.0;
    let tw = 8.0;
    let tf = 12.0;

    // Section geometry (welded, no root radius)
    let c_web = h - 2.0 * tf; // 476 mm
    let c_flange = (b - tw) / 2.0; // 121.0 mm
    let web_ratio = c_web / tw; // 59.5
    let flange_ratio = c_flange / tf; // 10.0833

    assert!(
        (web_ratio - 59.5_f64).abs() < 0.1,
        "Web c/tw = {:.1}, expected 59.5",
        web_ratio
    );
    assert!(
        (flange_ratio - 10.083_f64).abs() < 0.01,
        "Flange c/tf = {:.4}, expected ~10.083",
        flange_ratio
    );

    // --- S235 ---
    let eps_235 = ec3_epsilon(FY_S235); // 1.0
    let web_235 = ec3_classify_web_bending(c_web, tw, FY_S235);
    let flange_235 = ec3_classify_flange_outstand(c_flange, tf, FY_S235);
    let overall_235 = ec3_overall_class(&web_235, &flange_235);

    assert_eq!(web_235, Ec3Class::Class1, "S235: web should be Class 1");
    // c/tf = 10.083 > 10*1.0 = 10.0 -> NOT Class 2
    assert!(
        flange_ratio > 10.0 * eps_235,
        "S235: c/tf = {:.3} > 10*eps = {:.1}",
        flange_ratio,
        10.0 * eps_235
    );
    assert_eq!(
        flange_235,
        Ec3Class::Class3,
        "S235: flange should be Class 3"
    );
    assert_eq!(
        overall_235,
        Ec3Class::Class3,
        "S235: overall should be Class 3"
    );

    // --- S355 ---
    let eps_355 = ec3_epsilon(FY_S355);
    let web_355 = ec3_classify_web_bending(c_web, tw, FY_S355);
    let flange_355 = ec3_classify_flange_outstand(c_flange, tf, FY_S355);
    let overall_355 = ec3_overall_class(&web_355, &flange_355);

    // Web: 59.5 > 72*0.8136 = 58.58 -> NOT Class 1
    assert!(
        web_ratio > 72.0 * eps_355,
        "S355: web c/tw = {:.1} > 72*eps = {:.2} (not Class 1)",
        web_ratio,
        72.0 * eps_355
    );
    assert_eq!(web_355, Ec3Class::Class2, "S355: web should be Class 2");
    assert_eq!(
        flange_355,
        Ec3Class::Class3,
        "S355: flange should be Class 3"
    );
    assert_eq!(
        overall_355,
        Ec3Class::Class3,
        "S355: overall should be Class 3"
    );

    // --- S460 ---
    let eps_460 = ec3_epsilon(FY_S460);
    let web_460 = ec3_classify_web_bending(c_web, tw, FY_S460);
    let flange_460 = ec3_classify_flange_outstand(c_flange, tf, FY_S460);
    let overall_460 = ec3_overall_class(&web_460, &flange_460);

    // Web: 59.5 > 83*0.7146 = 59.31 -> NOT Class 2, <= 124*0.7146 = 88.61 -> Class 3
    assert!(
        web_ratio > 83.0 * eps_460,
        "S460: web c/tw = {:.1} > 83*eps = {:.2} (not Class 2)",
        web_ratio,
        83.0 * eps_460
    );
    assert_eq!(web_460, Ec3Class::Class3, "S460: web should be Class 3");

    // Flange: 10.083 > 14*0.7146 = 10.005 -> Class 4
    let flange_class3_limit = 14.0 * eps_460;
    assert!(
        flange_ratio > flange_class3_limit,
        "S460: c/tf = {:.4} > 14*eps = {:.4} -> Class 4 flange",
        flange_ratio,
        flange_class3_limit
    );
    assert_eq!(
        flange_460,
        Ec3Class::Class4,
        "S460: flange should be Class 4"
    );
    assert_eq!(
        overall_460,
        Ec3Class::Class4,
        "S460: overall should be Class 4 (flange governs)"
    );

    // Verify monotonic degradation: higher grade -> worse classification
    // S235: Class 3, S355: Class 3, S460: Class 4
    // Class numbers should be non-decreasing with increasing grade
    let class_num = |c: &Ec3Class| -> u8 {
        match c {
            Ec3Class::Class1 => 1,
            Ec3Class::Class2 => 2,
            Ec3Class::Class3 => 3,
            Ec3Class::Class4 => 4,
        }
    };
    assert!(
        class_num(&overall_235) <= class_num(&overall_355),
        "Classification should not improve with higher grade (S235->S355)"
    );
    assert!(
        class_num(&overall_355) <= class_num(&overall_460),
        "Classification should not improve with higher grade (S355->S460)"
    );
}

// ================================================================
// 8. EC3 Welded Box Section Classification
// ================================================================
//
// Welded box section (all plates welded, no corner radii):
//   h = 400 mm, b = 300 mm, tw = 10.0 mm, tf = 12.0 mm
//   Steel: S355
//
// epsilon = sqrt(235/355) = 0.8136
//
// Web (internal part in bending):
//   c_web = h - 2*tf = 400 - 24 = 376 mm
//   c/tw = 376 / 10 = 37.6
//   72*eps = 58.58 -> Class 1
//
// Flange (internal compression element):
//   For a welded box, both flanges are internal elements (supported at both edges).
//   c_flange = b - 2*tw = 300 - 20 = 280 mm
//   c/tf = 280 / 12 = 23.33
//   33*eps = 26.85 -> Class 1 (23.33 <= 26.85)
//
// Overall: Class 1 -- a well-proportioned welded box in S355.
//
// Compare with thinner flanges (tf = 9.0 mm):
//   c/tf = 280 / 9.0 = 31.11
//   33*eps = 26.85 -> NOT Class 1
//   38*eps = 30.92 -> NOT Class 2 (31.11 > 30.92)
//   42*eps = 34.17 -> Class 3 (31.11 <= 34.17)

#[test]
fn validation_ec3_welded_box_section() {
    let h = 400.0;
    let b = 300.0;
    let tw = 10.0;
    let fy = FY_S355;

    let eps = ec3_epsilon(fy);

    // --- Thick-flanged box (tf = 12 mm): Class 1 ---
    let tf_thick = 12.0;
    let c_web = h - 2.0 * tf_thick; // 376 mm
    let c_flange_thick = b - 2.0 * tw; // 280 mm

    assert!(
        (c_web - 376.0_f64).abs() < 0.1,
        "Web clear depth: expected 376, got {:.1}",
        c_web
    );
    assert!(
        (c_flange_thick - 280.0_f64).abs() < 0.1,
        "Flange internal width: expected 280, got {:.1}",
        c_flange_thick
    );

    // Web classification
    let web_ratio = c_web / tw; // 37.6
    let web_class = ec3_classify_web_bending(c_web, tw, fy);
    assert_eq!(
        web_class,
        Ec3Class::Class1,
        "Box web: c/tw = {:.1} < 72*eps = {:.2} -> Class 1",
        web_ratio,
        72.0 * eps
    );

    // Flange classification (internal compression element for box sections)
    let flange_ratio_thick = c_flange_thick / tf_thick; // 23.33
    assert!(
        (flange_ratio_thick - 23.33_f64).abs() < 0.1,
        "Thick flange c/tf = {:.2}, expected ~23.33",
        flange_ratio_thick
    );

    let flange_class_thick = ec3_classify_internal_compression(c_flange_thick, tf_thick, fy);
    assert_eq!(
        flange_class_thick,
        Ec3Class::Class1,
        "Box flange (tf=12): c/tf = {:.2} <= 33*eps = {:.2} -> Class 1",
        flange_ratio_thick,
        33.0 * eps
    );

    let overall_thick = ec3_overall_class(&web_class, &flange_class_thick);
    assert_eq!(
        overall_thick,
        Ec3Class::Class1,
        "Welded box 400x300x10/12 in S355: overall Class 1"
    );

    // --- Thin-flanged box (tf = 9 mm): Class 3 ---
    let tf_thin = 9.0;
    let c_web_thin = h - 2.0 * tf_thin; // 382 mm
    let c_flange_thin = b - 2.0 * tw; // 280 mm (same as before)
    let flange_ratio_thin = c_flange_thin / tf_thin; // 31.11

    assert!(
        (flange_ratio_thin - 31.11_f64).abs() < 0.1,
        "Thin flange c/tf = {:.2}, expected ~31.11",
        flange_ratio_thin
    );

    // Verify this exceeds Class 2 limit but is within Class 3 limit
    let class2_limit = 38.0 * eps;
    let class3_limit = 42.0 * eps;
    assert!(
        flange_ratio_thin > class2_limit,
        "c/tf = {:.2} > 38*eps = {:.2} -> exceeds Class 2",
        flange_ratio_thin,
        class2_limit
    );
    assert!(
        flange_ratio_thin <= class3_limit,
        "c/tf = {:.2} <= 42*eps = {:.2} -> within Class 3",
        flange_ratio_thin,
        class3_limit
    );

    let flange_class_thin = ec3_classify_internal_compression(c_flange_thin, tf_thin, fy);
    assert_eq!(
        flange_class_thin,
        Ec3Class::Class3,
        "Box flange (tf=9): c/tf = {:.2} -> Class 3",
        flange_ratio_thin
    );

    let web_class_thin = ec3_classify_web_bending(c_web_thin, tw, fy);
    assert_eq!(
        web_class_thin,
        Ec3Class::Class1,
        "Box web with thinner flanges still Class 1"
    );

    let overall_thin = ec3_overall_class(&web_class_thin, &flange_class_thin);
    assert_eq!(
        overall_thin,
        Ec3Class::Class3,
        "Welded box 400x300x10/9 in S355: overall Class 3 (governed by thin flange)"
    );

    // Verify the thick box is strictly better than the thin box
    let class_num = |c: &Ec3Class| -> u8 {
        match c {
            Ec3Class::Class1 => 1,
            Ec3Class::Class2 => 2,
            Ec3Class::Class3 => 3,
            Ec3Class::Class4 => 4,
        }
    };
    assert!(
        class_num(&overall_thick) < class_num(&overall_thin),
        "Thicker flanges yield better classification"
    );
}
