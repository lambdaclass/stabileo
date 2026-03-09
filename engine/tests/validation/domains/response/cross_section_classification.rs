/// Validation: Cross-Section Classification
///
/// References:
///   - EN 1993-1-1:2005 SS5.5, Table 5.2 (EC3 classification)
///   - AISC 360-22 Table B4.1b (width-to-thickness limits)
///   - Trahair, Bradford, Nethercot, Gardner: "The Behaviour and Design of Steel Structures to EC3" 4th ed.
///
/// Tests verify classification rules for I-sections and hollow sections.

// ================================================================
// Steel material constants
// ================================================================
const E_STEEL: f64 = 200_000.0; // MPa (Young's modulus)
const FY_S235: f64 = 235.0; // MPa (S235 yield strength)
const FY_S355: f64 = 355.0; // MPa (S355 yield strength)

// ================================================================
// EC3 classification enums and helpers
// ================================================================

#[derive(Debug, PartialEq)]
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

/// Classify an I-section web in pure bending per EC3 Table 5.2 (case "Web subject to bending").
///
/// c = clear web depth (h - 2*tf - 2*r for rolled, or h - 2*tf for welded)
/// tw = web thickness
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

/// Classify an I-section outstand flange in compression per EC3 Table 5.2.
///
/// c = (b - tw - 2*r) / 2 for rolled sections, or (b - tw) / 2 for welded
/// tf = flange thickness
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

/// Classify a rectangular hollow section (RHS/SHS) wall in pure bending per EC3 Table 5.2.
///
/// c = h - 3*t (internal flat width for hot-finished) or h - 2*t for simplified
/// t = wall thickness
///
/// Class 1 if c/t <= 72*epsilon
/// Class 2 if c/t <= 83*epsilon
/// Class 3 if c/t <= 124*epsilon
/// Class 4 otherwise
fn ec3_classify_rhs_wall_bending(c: f64, t: f64, fy: f64) -> Ec3Class {
    // Same limits as web in bending
    ec3_classify_web_bending(c, t, fy)
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

/// Classify I-section flange per AISC 360-22 Table B4.1b (Case 10: Flanges of I-shaped sections in flexure).
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

/// Classify I-section web per AISC 360-22 Table B4.1b (Case 15: Webs of doubly-symmetric I-sections in flexure).
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

/// Overall AISC section class: governed by the worst (most slender) classification.
fn aisc_overall_class(web_class: &AiscClass, flange_class: &AiscClass) -> AiscClass {
    match (web_class, flange_class) {
        (AiscClass::Slender, _) | (_, AiscClass::Slender) => AiscClass::Slender,
        (AiscClass::Noncompact, _) | (_, AiscClass::Noncompact) => AiscClass::Noncompact,
        _ => AiscClass::Compact,
    }
}

// ================================================================
// 1. EC3 Class 1 I-Section in S235 (IPE 300)
// ================================================================
//
// IPE 300 (rolled):
//   h = 300 mm, b = 150 mm, tw = 7.1 mm, tf = 10.7 mm, r = 15 mm
//
// epsilon = sqrt(235/235) = 1.0
//
// Web: c = h - 2*tf - 2*r = 300 - 2*10.7 - 2*15 = 248.6 mm
//      c/tw = 248.6 / 7.1 = 35.01  (limit: 72*1.0 = 72) -> Class 1
//
// Flange: c = (b - tw - 2*r) / 2 = (150 - 7.1 - 2*15) / 2 = 56.45 mm
//         c/tf = 56.45 / 10.7 = 5.28  (limit: 9*1.0 = 9) -> Class 1
//
// Overall: Class 1

#[test]
fn validation_ec3_class1_i_section_s235() {
    // IPE 300 dimensions (mm)
    let h = 300.0;
    let b = 150.0;
    let tw = 7.1;
    let tf = 10.7;
    let r = 15.0;
    let fy = FY_S235;

    let eps = ec3_epsilon(fy);
    assert!((eps - 1.0).abs() < 1e-10, "epsilon for S235 should be exactly 1.0, got {:.6}", eps);

    // Web classification
    let c_web = h - 2.0 * tf - 2.0 * r; // 248.6 mm
    let web_ratio = c_web / tw;
    assert!(
        (c_web - 248.6_f64).abs() < 0.1,
        "Web clear depth should be 248.6 mm, got {:.1}",
        c_web
    );
    assert!(
        web_ratio < 72.0 * eps,
        "Web c/tw = {:.2} should be < 72*eps = {:.1} for Class 1",
        web_ratio,
        72.0 * eps
    );
    let web_class = ec3_classify_web_bending(c_web, tw, fy);
    assert_eq!(web_class, Ec3Class::Class1, "IPE 300 web should be Class 1");

    // Flange classification
    let c_flange = (b - tw - 2.0 * r) / 2.0; // 56.45 mm
    let flange_ratio = c_flange / tf;
    assert!(
        (c_flange - 56.45).abs() < 0.1,
        "Flange outstand should be 56.45 mm, got {:.2}",
        c_flange
    );
    assert!(
        flange_ratio < 9.0 * eps,
        "Flange c/tf = {:.2} should be < 9*eps = {:.1} for Class 1",
        flange_ratio,
        9.0 * eps
    );
    let flange_class = ec3_classify_flange_outstand(c_flange, tf, fy);
    assert_eq!(flange_class, Ec3Class::Class1, "IPE 300 flange should be Class 1");

    // Overall classification
    let overall = ec3_overall_class(&web_class, &flange_class);
    assert_eq!(overall, Ec3Class::Class1, "IPE 300 in S235 should be Class 1 overall");
}

// ================================================================
// 2. EC3 Class 2 I-Section in S355 (thin-flanged section)
// ================================================================
//
// Custom welded I-section:
//   h = 400 mm, b = 200 mm, tw = 8.0 mm, tf = 12.0 mm (welded, no r)
//
// epsilon = sqrt(235/355) = 0.8136
//
// Web: c = h - 2*tf = 400 - 24 = 376 mm
//      c/tw = 376 / 8.0 = 47.0
//      72*eps = 58.58 -> Class 1
//
// Flange: c = (b - tw) / 2 = (200 - 8) / 2 = 96.0 mm
//         c/tf = 96.0 / 12.0 = 8.0
//         9*eps = 7.32 -> NOT Class 1
//         10*eps = 8.14 -> Class 2 (8.0 <= 8.14)
//
// Overall: Class 2 (governed by flange)

#[test]
fn validation_ec3_class2_i_section_s355() {
    let h = 400.0;
    let b = 200.0;
    let tw = 8.0;
    let tf = 12.0;
    let fy = FY_S355;

    let eps = ec3_epsilon(fy);
    let eps_expected = (235.0_f64 / 355.0).sqrt();
    assert!(
        (eps - eps_expected).abs() < 1e-10,
        "epsilon for S355: expected {:.6}, got {:.6}",
        eps_expected,
        eps
    );

    // Web classification (welded: no root radius)
    let c_web = h - 2.0 * tf; // 376 mm
    let web_ratio = c_web / tw; // 47.0
    assert!(
        web_ratio < 72.0 * eps,
        "Web c/tw = {:.2} should be < 72*eps = {:.2} for Class 1",
        web_ratio,
        72.0 * eps
    );
    let web_class = ec3_classify_web_bending(c_web, tw, fy);
    assert_eq!(web_class, Ec3Class::Class1, "Web should be Class 1");

    // Flange classification (welded: c = (b - tw) / 2)
    let c_flange = (b - tw) / 2.0; // 96.0 mm
    let flange_ratio = c_flange / tf; // 8.0
    assert!(
        flange_ratio > 9.0 * eps,
        "Flange c/tf = {:.2} should exceed 9*eps = {:.2} (not Class 1)",
        flange_ratio,
        9.0 * eps
    );
    assert!(
        flange_ratio <= 10.0 * eps,
        "Flange c/tf = {:.2} should be <= 10*eps = {:.2} (Class 2)",
        flange_ratio,
        10.0 * eps
    );
    let flange_class = ec3_classify_flange_outstand(c_flange, tf, fy);
    assert_eq!(flange_class, Ec3Class::Class2, "Flange should be Class 2");

    // Overall: governed by worst element
    let overall = ec3_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        Ec3Class::Class2,
        "Overall section should be Class 2 (governed by flange)"
    );
}

// ================================================================
// 3. EC3 Class 3 Web in Bending (slender web section)
// ================================================================
//
// Custom welded I-section with a relatively slender web:
//   h = 600 mm, b = 200 mm, tw = 6.0 mm, tf = 20.0 mm (welded)
//
// epsilon = sqrt(235/235) = 1.0 (S235)
//
// Web: c = h - 2*tf = 600 - 40 = 560 mm
//      c/tw = 560 / 6.0 = 93.33
//      72*eps = 72 -> NOT Class 1
//      83*eps = 83 -> NOT Class 2
//      124*eps = 124 -> Class 3 (93.33 <= 124)
//
// Flange: c = (b - tw) / 2 = (200 - 6) / 2 = 97.0 mm
//         c/tf = 97.0 / 20.0 = 4.85
//         9*eps = 9 -> Class 1
//
// Overall: Class 3 (governed by web)

#[test]
fn validation_ec3_class3_web_bending() {
    let h = 600.0;
    let b = 200.0;
    let tw = 6.0;
    let tf = 20.0;
    let fy = FY_S235;

    let eps = ec3_epsilon(fy); // 1.0

    // Web classification
    let c_web = h - 2.0 * tf; // 560 mm
    let web_ratio = c_web / tw; // 93.33
    assert!(
        web_ratio > 83.0 * eps,
        "Web c/tw = {:.2} should exceed 83*eps = {:.1} (not Class 1 or 2)",
        web_ratio,
        83.0 * eps
    );
    assert!(
        web_ratio <= 124.0 * eps,
        "Web c/tw = {:.2} should be <= 124*eps = {:.1} (Class 3)",
        web_ratio,
        124.0 * eps
    );
    let web_class = ec3_classify_web_bending(c_web, tw, fy);
    assert_eq!(web_class, Ec3Class::Class3, "Web should be Class 3");

    // Flange classification
    let c_flange = (b - tw) / 2.0; // 97.0 mm
    let flange_ratio = c_flange / tf; // 4.85
    assert!(
        flange_ratio < 9.0 * eps,
        "Flange c/tf = {:.2} should be < 9*eps = {:.1} (Class 1)",
        flange_ratio,
        9.0 * eps
    );
    let flange_class = ec3_classify_flange_outstand(c_flange, tf, fy);
    assert_eq!(flange_class, Ec3Class::Class1, "Flange should be Class 1");

    // Overall: governed by web
    let overall = ec3_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        Ec3Class::Class3,
        "Overall section should be Class 3 (governed by slender web)"
    );
}

// ================================================================
// 4. EC3 Class 4 Slender Plate Girder
// ================================================================
//
// Deep plate girder (welded):
//   h = 1500 mm, b = 300 mm, tw = 10.0 mm, tf = 25.0 mm
//
// epsilon = sqrt(235/355) = 0.8136 (S355)
//
// Web: c = h - 2*tf = 1500 - 50 = 1450 mm
//      c/tw = 1450 / 10.0 = 145.0
//      124*eps = 124 * 0.8136 = 100.9 -> Class 4 (145.0 > 100.9)
//
// Flange: c = (b - tw) / 2 = (300 - 10) / 2 = 145.0 mm
//         c/tf = 145.0 / 25.0 = 5.8
//         9*eps = 9 * 0.8136 = 7.32 -> Class 1
//
// Overall: Class 4 (governed by very slender web)

#[test]
fn validation_ec3_class4_slender_plate_girder() {
    let h = 1500.0;
    let b = 300.0;
    let tw = 10.0;
    let tf = 25.0;
    let fy = FY_S355;

    let eps = ec3_epsilon(fy);

    // Web classification
    let c_web = h - 2.0 * tf; // 1450 mm
    let web_ratio = c_web / tw; // 145.0
    let class3_limit = 124.0 * eps;
    assert!(
        web_ratio > class3_limit,
        "Web c/tw = {:.1} should exceed 124*eps = {:.1} for Class 4",
        web_ratio,
        class3_limit
    );
    let web_class = ec3_classify_web_bending(c_web, tw, fy);
    assert_eq!(web_class, Ec3Class::Class4, "Plate girder web should be Class 4");

    // Flange classification
    let c_flange = (b - tw) / 2.0; // 145.0 mm
    let flange_ratio = c_flange / tf; // 5.8
    assert!(
        flange_ratio < 9.0 * eps,
        "Flange c/tf = {:.2} should be < 9*eps = {:.2} (Class 1)",
        flange_ratio,
        9.0 * eps
    );
    let flange_class = ec3_classify_flange_outstand(c_flange, tf, fy);
    assert_eq!(flange_class, Ec3Class::Class1, "Plate girder flange should be Class 1");

    // Overall: governed by Class 4 web
    let overall = ec3_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        Ec3Class::Class4,
        "Overall section should be Class 4 (deep plate girder web governs)"
    );

    // Verify effective width reduction would be needed (EN 1993-1-5 SS4)
    // For Class 4, effective section properties must be calculated
    // The stress reduction factor rho < 1.0 for the web
    let lambda_p = (c_web / tw) / (28.4 * eps * 1.0_f64.sqrt()); // k_sigma = 23.9 for pure bending, but simplified here
    assert!(
        lambda_p > 0.673,
        "Plate slenderness lambda_p = {:.3} > 0.673 confirms reduction needed",
        lambda_p
    );
}

// ================================================================
// 5. EC3 Hollow Section Class 1 (SHS 200x200x10)
// ================================================================
//
// Square hollow section (hot-finished):
//   h = b = 200 mm, t = 10.0 mm
//
// epsilon = sqrt(235/235) = 1.0 (S235)
//
// Internal flat width for hot-finished SHS: c = h - 3*t = 200 - 30 = 170 mm
// c/t = 170 / 10 = 17.0
//
// For SHS wall in bending: Class 1 if c/t <= 72*eps = 72 -> Class 1
// For SHS wall in compression (flange-like): Class 1 if c/t <= 33*eps = 33 -> Class 1
//
// Overall: Class 1

#[test]
fn validation_ec3_hollow_section_class1() {
    let h = 200.0; // mm
    let t = 10.0; // mm
    let fy = FY_S235;

    let eps = ec3_epsilon(fy); // 1.0

    // Internal flat width (hot-finished SHS per EN 10210)
    let c = h - 3.0 * t; // 170 mm
    let ratio = c / t; // 17.0

    assert!(
        (c - 170.0_f64).abs() < 0.1,
        "Internal flat width should be 170 mm, got {:.1}",
        c
    );
    assert!(
        (ratio - 17.0_f64).abs() < 0.1,
        "c/t ratio should be 17.0, got {:.2}",
        ratio
    );

    // Wall in bending (web-like behavior): limit 72*eps
    let wall_bending_class = ec3_classify_rhs_wall_bending(c, t, fy);
    assert_eq!(
        wall_bending_class,
        Ec3Class::Class1,
        "SHS wall in bending: c/t = {:.1} < 72*eps = {:.1}, should be Class 1",
        ratio,
        72.0 * eps
    );

    // Wall in compression (EN 1993-1-1 Table 5.2, internal compression element):
    // Class 1 limit: c/t <= 33*eps
    let class1_comp_limit = 33.0 * eps;
    assert!(
        ratio <= class1_comp_limit,
        "SHS wall in compression: c/t = {:.1} should be <= 33*eps = {:.1} for Class 1",
        ratio,
        class1_comp_limit
    );

    // For a SHS in bending, one wall is in compression, opposite in tension,
    // and two walls have stress gradient. The overall section is Class 1.
    assert!(
        ratio < 33.0 * eps,
        "SHS 200x200x10 in S235 is Class 1 for all loading"
    );
}

// ================================================================
// 6. AISC Compact W-Shape (W14x22 equivalent)
// ================================================================
//
// W14x22 (AISC shape):
//   d = 13.7 in = 348.0 mm, bf = 5.00 in = 127.0 mm
//   tw = 0.230 in = 5.84 mm, tf = 0.335 in = 8.51 mm
//   Fy = 50 ksi = 345 MPa, E = 29000 ksi = 200000 MPa
//
// Flange: lambda = bf/(2*tf) = 127.0/(2*8.51) = 7.46
//         lambda_p = 0.38*sqrt(E/Fy) = 0.38*sqrt(200000/345) = 9.15
//         7.46 <= 9.15 -> Compact
//
// Web:    h = d - 2*tf = 348.0 - 2*8.51 = 330.98 mm
//         lambda = h/tw = 330.98/5.84 = 56.67
//         lambda_p = 3.76*sqrt(E/Fy) = 3.76*sqrt(200000/345) = 90.55
//         56.67 <= 90.55 -> Compact
//
// Overall: Compact

#[test]
fn validation_aisc_compact_w_shape() {
    // W14x22 dimensions (converted to mm for consistency)
    let d = 348.0; // mm (13.7 in)
    let bf = 127.0; // mm (5.00 in)
    let tw = 5.84; // mm (0.230 in)
    let tf = 8.51; // mm (0.335 in)
    let fy = 345.0; // MPa (50 ksi)
    let e = E_STEEL; // MPa

    // Flange slenderness
    let lambda_f = bf / (2.0 * tf);
    let lambda_pf = 0.38 * (e / fy).sqrt();
    let _lambda_rf = 1.0 * (e / fy).sqrt();

    assert!(
        (lambda_f - 7.46_f64).abs() < 0.1,
        "Flange lambda = {:.2}, expected ~7.46",
        lambda_f
    );
    assert!(
        (lambda_pf - 9.15).abs() < 0.1,
        "lambda_pf = {:.2}, expected ~9.15",
        lambda_pf
    );
    assert!(
        lambda_f <= lambda_pf,
        "Flange lambda = {:.2} <= lambda_p = {:.2} -> Compact",
        lambda_f,
        lambda_pf
    );

    let flange_class = aisc_classify_flange(bf, tf, e, fy);
    assert_eq!(flange_class, AiscClass::Compact, "W14x22 flange should be Compact");

    // Web slenderness
    let h_web = d - 2.0 * tf; // clear web height
    let lambda_w = h_web / tw;
    let lambda_pw = 3.76 * (e / fy).sqrt();
    let _lambda_rw = 5.70 * (e / fy).sqrt();

    assert!(
        lambda_w < lambda_pw,
        "Web lambda = {:.2} < lambda_p = {:.2} -> Compact",
        lambda_w,
        lambda_pw
    );

    let web_class = aisc_classify_web(h_web, tw, e, fy);
    assert_eq!(web_class, AiscClass::Compact, "W14x22 web should be Compact");

    // Overall
    let overall = aisc_overall_class(&web_class, &flange_class);
    assert_eq!(overall, AiscClass::Compact, "W14x22 should be Compact overall");

    // Verify lambda values are well within limits (this is a standard rolled shape)
    assert!(
        lambda_f < 0.85 * lambda_pf,
        "W14x22 flange is well within compact limit"
    );
    assert!(
        lambda_w < 0.70 * lambda_pw,
        "W14x22 web is well within compact limit"
    );
}

// ================================================================
// 7. AISC Noncompact Flange (built-up section with wide flange)
// ================================================================
//
// Built-up I-section with intentionally wide, thin flanges:
//   d = 500 mm, bf = 350 mm, tw = 10.0 mm, tf = 12.0 mm
//   Fy = 345 MPa, E = 200000 MPa
//
// Flange: lambda = bf/(2*tf) = 350/(2*12) = 14.58
//         lambda_p = 0.38*sqrt(200000/345) = 9.15
//         lambda_r = 1.0*sqrt(200000/345) = 24.08
//         9.15 < 14.58 <= 24.08 -> Noncompact
//
// Web:    h = d - 2*tf = 500 - 24 = 476 mm
//         lambda = 476/10 = 47.6
//         lambda_p = 3.76*sqrt(200000/345) = 90.55
//         47.6 <= 90.55 -> Compact
//
// Overall: Noncompact (governed by flange)

#[test]
fn validation_aisc_noncompact_flange() {
    let d = 500.0; // mm
    let bf = 350.0; // mm
    let tw = 10.0; // mm
    let tf = 12.0; // mm
    let fy = 345.0; // MPa (50 ksi)
    let e = E_STEEL;

    // Flange slenderness
    let lambda_f = bf / (2.0 * tf); // 14.58
    let lambda_pf = 0.38 * (e / fy).sqrt(); // 9.15
    let lambda_rf = 1.0 * (e / fy).sqrt(); // 24.08

    assert!(
        (lambda_f - 14.58_f64).abs() < 0.1,
        "Flange lambda = {:.2}, expected ~14.58",
        lambda_f
    );
    assert!(
        lambda_f > lambda_pf,
        "Flange lambda = {:.2} > lambda_p = {:.2} (exceeds compact limit)",
        lambda_f,
        lambda_pf
    );
    assert!(
        lambda_f <= lambda_rf,
        "Flange lambda = {:.2} <= lambda_r = {:.2} (within noncompact limit)",
        lambda_f,
        lambda_rf
    );

    let flange_class = aisc_classify_flange(bf, tf, e, fy);
    assert_eq!(
        flange_class,
        AiscClass::Noncompact,
        "Built-up flange should be Noncompact"
    );

    // Web slenderness
    let h_web = d - 2.0 * tf; // 476 mm
    let lambda_w = h_web / tw; // 47.6
    let lambda_pw = 3.76 * (e / fy).sqrt(); // 90.55

    assert!(
        lambda_w < lambda_pw,
        "Web lambda = {:.2} < lambda_p = {:.2} -> Compact",
        lambda_w,
        lambda_pw
    );

    let web_class = aisc_classify_web(h_web, tw, e, fy);
    assert_eq!(web_class, AiscClass::Compact, "Web should be Compact");

    // Overall: governed by noncompact flange
    let overall = aisc_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        AiscClass::Noncompact,
        "Overall section should be Noncompact (governed by wide flange)"
    );

    // Verify the moment capacity would use inelastic LTB formula, not plastic
    // For noncompact flanges: Mn = Mp - (Mp - 0.7*Fy*Sx) * (lambda - lambda_p) / (lambda_r - lambda_p)
    let interpolation_factor = (lambda_f - lambda_pf) / (lambda_rf - lambda_pf);
    assert!(
        interpolation_factor > 0.0 && interpolation_factor < 1.0,
        "Interpolation factor = {:.3} should be between 0 and 1 for noncompact",
        interpolation_factor
    );
}

// ================================================================
// 8. AISC Slender Web (built-up plate girder)
// ================================================================
//
// Deep built-up plate girder with slender web:
//   d = 1800 mm, bf = 400 mm, tw = 8.0 mm, tf = 30.0 mm
//   Fy = 345 MPa, E = 200000 MPa
//
// Flange: lambda = bf/(2*tf) = 400/(2*30) = 6.67
//         lambda_p = 0.38*sqrt(200000/345) = 9.15
//         6.67 <= 9.15 -> Compact
//
// Web:    h = d - 2*tf = 1800 - 60 = 1740 mm
//         lambda = 1740/8 = 217.5
//         lambda_p = 3.76*sqrt(200000/345) = 90.55
//         lambda_r = 5.70*sqrt(200000/345) = 137.27
//         217.5 > 137.27 -> Slender
//
// Overall: Slender (governed by web)

#[test]
fn validation_aisc_slender_web() {
    let d = 1800.0; // mm
    let bf = 400.0; // mm
    let tw = 8.0; // mm
    let tf = 30.0; // mm
    let fy = 345.0; // MPa
    let e = E_STEEL;

    // Flange slenderness
    let lambda_f = bf / (2.0 * tf); // 6.67
    let lambda_pf = 0.38 * (e / fy).sqrt();

    assert!(
        lambda_f <= lambda_pf,
        "Flange lambda = {:.2} <= lambda_p = {:.2} -> Compact",
        lambda_f,
        lambda_pf
    );

    let flange_class = aisc_classify_flange(bf, tf, e, fy);
    assert_eq!(flange_class, AiscClass::Compact, "Plate girder flange should be Compact");

    // Web slenderness
    let h_web = d - 2.0 * tf; // 1740 mm
    let lambda_w = h_web / tw; // 217.5
    let lambda_pw = 3.76 * (e / fy).sqrt(); // 90.55
    let lambda_rw = 5.70 * (e / fy).sqrt(); // 137.27

    assert!(
        (lambda_w - 217.5).abs() < 0.1,
        "Web lambda = {:.2}, expected 217.5",
        lambda_w
    );
    assert!(
        (lambda_pw - 90.55).abs() < 0.1,
        "lambda_pw = {:.2}, expected ~90.55",
        lambda_pw
    );
    assert!(
        (lambda_rw - 137.27).abs() < 0.1,
        "lambda_rw = {:.2}, expected ~137.27",
        lambda_rw
    );
    assert!(
        lambda_w > lambda_rw,
        "Web lambda = {:.2} > lambda_r = {:.2} -> Slender",
        lambda_w,
        lambda_rw
    );

    let web_class = aisc_classify_web(h_web, tw, e, fy);
    assert_eq!(web_class, AiscClass::Slender, "Plate girder web should be Slender");

    // Overall: governed by slender web
    let overall = aisc_overall_class(&web_class, &flange_class);
    assert_eq!(
        overall,
        AiscClass::Slender,
        "Overall section should be Slender (governed by deep plate girder web)"
    );

    // Per AISC 360-22 F5, slender web sections use the plate girder provisions:
    //   Rpg = 1 - aw/(1200 + 300*aw) * (hc/tw - 5.70*sqrt(E/Fy)) <= 1.0
    // where aw = hc*tw / (bf*tf)
    let aw = h_web * tw / (bf * tf);
    let rpg = 1.0 - aw / (1200.0 + 300.0 * aw) * (lambda_w - 5.70 * (e / fy).sqrt());
    assert!(
        rpg < 1.0,
        "Plate girder bending strength reduction factor Rpg = {:.4} should be < 1.0",
        rpg
    );
    assert!(
        rpg > 0.0,
        "Rpg = {:.4} should be positive (section is usable)",
        rpg
    );

    // Verify web exceeds AISC maximum slenderness limit check
    // For unstiffened webs, the absolute limit is h/tw <= 260
    // Our section has h/tw = 217.5, which is within the absolute limit
    assert!(
        lambda_w <= 260.0,
        "h/tw = {:.1} should not exceed AISC absolute maximum of 260 for unstiffened webs",
        lambda_w
    );
}
