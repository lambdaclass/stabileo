/// Validation: Composite Section Design (Steel-Concrete)
///
/// References:
///   - AISC 360-22 Chapter I: Design of Composite Members
///   - EN 1994-1-1:2004 (EC4): Design of composite steel and concrete structures
///   - CIRSOC 301+201: Argentine steel-concrete composite design
///   - Viest, Colaco, et al.: "Composite Construction Design for Buildings"
///   - Johnson: "Composite Structures of Steel and Concrete" 3rd ed.
///
/// Tests verify composite beam capacity, effective width, shear connector design.

use std::f64::consts::PI;

// ================================================================
// 1. AISC Composite Beam — Full Interaction (PNA in Slab)
// ================================================================
//
// W16x40 steel beam with 125 mm concrete slab (full composite).
//
// Steel:    Fy = 345 MPa, As = 7613 mm²
// Concrete: f'c = 28 MPa, effective width be = 2000 mm (from test 3)
//
// AISC I3.2a — Full composite action:
//   C = min(As*Fy, 0.85*f'c*be*tc)
//     = min(7613*345, 0.85*28*2000*125)
//     = min(2,626,485 N, 5,950,000 N)
//     = 2,626,485 N   (steel governs — PNA is in the slab)
//
//   Depth of concrete compression block:
//     a = C / (0.85 * f'c * be)
//       = 2,626,485 / (0.85 * 28 * 2000)
//       = 55.14 mm
//
//   Nominal moment capacity (PNA in slab):
//     Mn = C * (d/2 + tc - a/2)
//     where d = 407 mm (W16x40 depth)
//     Mn = 2,626,485 * (407/2 + 125 - 55.14/2)
//        = 2,626,485 * 300.93
//        = 790.47 kN·m
//
// Reference: AISC 360-22 Commentary §I3.2a, Example I.1

#[test]
fn validation_aisc_composite_beam_full_interaction() {
    // Steel section: W16x40
    let fy: f64 = 345.0;        // MPa — yield strength
    let as_steel: f64 = 7613.0; // mm² — steel area
    let d: f64 = 407.0;         // mm — steel beam depth

    // Concrete slab
    let fc: f64 = 28.0;         // MPa — compressive strength
    let tc: f64 = 125.0;        // mm — slab thickness
    let be: f64 = 2000.0;       // mm — effective width

    // Compressive force: governed by weaker of steel yield or concrete crush
    let c_steel: f64 = as_steel * fy;             // 2,626,485 N
    let c_concrete: f64 = 0.85 * fc * be * tc;    // 5,950,000 N
    let c: f64 = c_steel.min(c_concrete);          // steel governs

    // Verify steel governs
    assert!(
        c_steel < c_concrete,
        "Steel should govern: As*Fy={:.0} N < 0.85*f'c*be*tc={:.0} N",
        c_steel, c_concrete
    );

    // Check intermediate values
    let c_steel_expected: f64 = 2_626_485.0;
    let err_c: f64 = (c_steel - c_steel_expected).abs() / c_steel_expected;
    assert!(err_c < 0.001,
        "As*Fy={:.0}, expected={:.0}", c_steel, c_steel_expected);

    let c_concrete_expected: f64 = 5_950_000.0;
    let err_cc: f64 = (c_concrete - c_concrete_expected).abs() / c_concrete_expected;
    assert!(err_cc < 0.001,
        "0.85*f'c*be*tc={:.0}, expected={:.0}", c_concrete, c_concrete_expected);

    // Compression block depth
    let a: f64 = c / (0.85 * fc * be);
    let a_expected: f64 = 55.14;
    let err_a: f64 = (a - a_expected).abs() / a_expected;
    assert!(err_a < 0.01,
        "a={:.2} mm, expected={:.2} mm", a, a_expected);

    // Compression block must be within the slab
    assert!(a < tc,
        "a={:.2} mm must be less than slab thickness tc={:.0} mm", a, tc);

    // Nominal moment capacity
    let lever_arm: f64 = d / 2.0 + tc - a / 2.0;
    let mn: f64 = c * lever_arm;                    // N·mm
    let mn_knm: f64 = mn / 1.0e6;                   // kN·m

    let lever_expected: f64 = 300.93;
    let err_lever: f64 = (lever_arm - lever_expected).abs() / lever_expected;
    assert!(err_lever < 0.01,
        "Lever arm={:.2} mm, expected={:.2} mm", lever_arm, lever_expected);

    let mn_expected: f64 = 790.47;
    let err_mn: f64 = (mn_knm - mn_expected).abs() / mn_expected;
    assert!(err_mn < 0.01,
        "Mn={:.2} kN·m, expected={:.2} kN·m, err={:.2}%",
        mn_knm, mn_expected, err_mn * 100.0);

    // Composite moment must exceed bare steel plastic moment
    // Mp_steel ~ Fy * Zx, where Zx ≈ 1205e3 mm³ for W16x40
    let zx: f64 = 1205.0e3;    // mm³ — plastic section modulus
    let mp_steel: f64 = fy * zx / 1.0e6; // kN·m
    assert!(mn_knm > mp_steel,
        "Composite Mn={:.1} kN·m should exceed bare steel Mp={:.1} kN·m",
        mn_knm, mp_steel);
}

// ================================================================
// 2. AISC Composite Beam — Partial Interaction (50%)
// ================================================================
//
// Same W16x40 + 125 mm slab, but with only 50% shear connection.
//
// AISC I3.2a — Partial composite action:
//   ΣQn = 0.50 * min(As*Fy, 0.85*f'c*be*tc)
//        = 0.50 * 2,626,485 = 1,313,243 N
//
//   Depth of compression block:
//     a = ΣQn / (0.85 * f'c * be) = 1,313,243 / (0.85*28*2000) = 27.57 mm
//
//   Simplified moment capacity (lower bound approach per AISC Commentary I3):
//     Mn ≈ ΣQn*(d/2 + tc - a/2) + As*Fy*(d/2)*(1 - ΣQn/(As*Fy))
//        = 1,313,243*(407/2 + 125 - 27.57/2)
//          + 2,626,485*(407/2)*(1 - 0.5)
//        = 1,313,243*316.72 + 2,626,485*203.5*0.5
//        = 415,868 kN·mm + 267,190 kN·mm (approx)
//        ≈ 683.1 kN·m
//
// Note: The exact AISC method uses the plastic stress distribution
// method (PSDM) which is more refined. This simplified approach gives
// a reasonable lower-bound estimate.

#[test]
fn validation_aisc_composite_beam_partial_interaction() {
    // Same section as test 1
    let fy: f64 = 345.0;
    let as_steel: f64 = 7613.0;
    let d: f64 = 407.0;
    let fc: f64 = 28.0;
    let tc: f64 = 125.0;
    let be: f64 = 2000.0;

    // Partial shear connection ratio
    let eta: f64 = 0.50;

    // Full composite force
    let c_full: f64 = (as_steel * fy).min(0.85 * fc * be * tc);

    // Partial composite shear force
    let sum_qn: f64 = eta * c_full;
    let sum_qn_expected: f64 = 1_313_242.5;
    let err_qn: f64 = (sum_qn - sum_qn_expected).abs() / sum_qn_expected;
    assert!(err_qn < 0.001,
        "ΣQn={:.1} N, expected={:.1} N", sum_qn, sum_qn_expected);

    // Compression block depth
    let a: f64 = sum_qn / (0.85 * fc * be);
    let a_expected: f64 = 27.57;
    let err_a: f64 = (a - a_expected).abs() / a_expected;
    assert!(err_a < 0.01,
        "a={:.2} mm, expected={:.2} mm", a, a_expected);

    // a must be within slab thickness
    assert!(a < tc,
        "a={:.2} mm must be less than tc={:.0} mm", a, tc);

    // Simplified moment capacity (two-part expression)
    // Part 1: Concrete slab contribution
    let lever_slab: f64 = d / 2.0 + tc - a / 2.0;
    let mn_slab: f64 = sum_qn * lever_slab;

    // Part 2: Residual steel moment (portion of As*Fy not transferred to slab)
    let residual_ratio: f64 = 1.0 - sum_qn / (as_steel * fy);
    let mn_steel_residual: f64 = as_steel * fy * (d / 2.0) * residual_ratio;

    let mn_total: f64 = mn_slab + mn_steel_residual;
    let mn_knm: f64 = mn_total / 1.0e6;

    // Verify residual ratio
    let residual_expected: f64 = 0.50;
    let err_res: f64 = (residual_ratio - residual_expected).abs() / residual_expected;
    assert!(err_res < 0.001,
        "Residual ratio={:.4}, expected={:.4}", residual_ratio, residual_expected);

    // Partial composite must be less than full composite
    let mn_full: f64 = c_full * (d / 2.0 + tc - c_full / (0.85 * fc * be) / 2.0);
    let mn_full_knm: f64 = mn_full / 1.0e6;
    assert!(mn_knm < mn_full_knm,
        "Partial Mn={:.1} kN·m should be less than full Mn={:.1} kN·m",
        mn_knm, mn_full_knm);

    // Partial composite must exceed bare steel capacity
    let zx: f64 = 1205.0e3;
    let mp_steel: f64 = fy * zx / 1.0e6;
    assert!(mn_knm > mp_steel,
        "Partial composite Mn={:.1} kN·m should exceed bare steel Mp={:.1} kN·m",
        mn_knm, mp_steel);

    // Verify approximate range: should be between Mp_steel and Mn_full
    // Typical partial composite at 50% gives roughly 75-85% of full composite
    let ratio_to_full: f64 = mn_knm / mn_full_knm;
    assert!(ratio_to_full > 0.70 && ratio_to_full < 0.95,
        "Mn_partial/Mn_full={:.3}, expected between 0.70 and 0.95",
        ratio_to_full);
}

// ================================================================
// 3. AISC Effective Width (I3.1a)
// ================================================================
//
// AISC 360-22 §I3.1a defines the effective slab width for composite
// beams. For an interior beam:
//   be = min(span/4, center-to-center_spacing)
// which is evaluated per side:
//   each side ≤ min(L/8, spacing/2, 8*tc)
// then total be = 2 × (per-side value)
//
// Given:
//   L = 12 m = 12000 mm (beam span)
//   Spacing = 3 m = 3000 mm (center-to-center)
//   tc = 125 mm (slab thickness)
//
// Per side:
//   L/8       = 12000/8 = 1500 mm
//   spacing/2 = 3000/2  = 1500 mm
//   8*tc      = 8*125   = 1000 mm   <-- governs
//
// Total effective width: be = 2 × 1000 = 2000 mm

#[test]
fn validation_aisc_effective_width() {
    let l: f64 = 12000.0;      // mm — beam span
    let spacing: f64 = 3000.0;  // mm — beam center-to-center spacing
    let tc: f64 = 125.0;        // mm — slab thickness

    // Per-side limits
    let limit_span: f64 = l / 8.0;           // 1500 mm
    let limit_spacing: f64 = spacing / 2.0;   // 1500 mm
    let limit_slab: f64 = 8.0 * tc;           // 1000 mm

    // Check intermediate values
    assert!((limit_span - 1500.0_f64).abs() < 0.1,
        "L/8={:.1}, expected 1500", limit_span);
    assert!((limit_spacing - 1500.0_f64).abs() < 0.1,
        "spacing/2={:.1}, expected 1500", limit_spacing);
    assert!((limit_slab - 1000.0_f64).abs() < 0.1,
        "8*tc={:.1}, expected 1000", limit_slab);

    // Governing per-side width
    let be_per_side: f64 = limit_span.min(limit_spacing).min(limit_slab);
    let be_per_side_expected: f64 = 1000.0;
    assert!((be_per_side - be_per_side_expected).abs() < 0.1,
        "be per side={:.1}, expected={:.1}", be_per_side, be_per_side_expected);

    // Slab thickness limit governs
    assert!(
        limit_slab < limit_span && limit_slab < limit_spacing,
        "8*tc={:.0} should govern over L/8={:.0} and spacing/2={:.0}",
        limit_slab, limit_span, limit_spacing
    );

    // Total effective width (interior beam: both sides)
    let be: f64 = 2.0 * be_per_side;
    let be_expected: f64 = 2000.0;
    assert!((be - be_expected).abs() < 0.1,
        "be={:.1} mm, expected={:.1} mm", be, be_expected);

    // Cross-check with AISC simplified rule: be ≤ L/4
    let be_simplified: f64 = l / 4.0;
    assert!(be <= be_simplified,
        "be={:.0} mm should not exceed L/4={:.0} mm", be, be_simplified);

    // Effective width ratio (be/L) should be reasonable (typically 0.1-0.3)
    let be_ratio: f64 = be / l;
    assert!(be_ratio > 0.05 && be_ratio < 0.35,
        "be/L={:.3}, expected between 0.05 and 0.35", be_ratio);
}

// ================================================================
// 4. EC4 Effective Width (EN 1994-1-1 §5.4.1.2)
// ================================================================
//
// EC4 defines effective width differently from AISC:
//   beff = b0 + Σ bei
//   bei = min(Le/8, bi)
//
// where:
//   b0 = distance between shear connectors (typically ≈ 0 for single row)
//   bi = distance from connector to mid-span between beams
//   Le = equivalent span = 0.85*L for interior span
//
// Given:
//   L = 10 m = 10000 mm (interior span)
//   Le = 0.85 * 10000 = 8500 mm
//   bi = 1500 mm (half-spacing to adjacent beams, each side)
//   b0 = 0 (single row of connectors on beam centerline)
//
// Per side:
//   bei = min(Le/8, bi) = min(8500/8, 1500) = min(1062.5, 1500) = 1062.5 mm
//
// Total:
//   beff = 0 + 2 × 1062.5 = 2125.0 mm

#[test]
fn validation_ec4_effective_width() {
    let l: f64 = 10000.0;       // mm — span length
    let le_factor: f64 = 0.85;  // EC4 factor for interior span
    let le: f64 = le_factor * l; // mm — equivalent span
    let bi: f64 = 1500.0;       // mm — half spacing to adjacent beam (each side)
    let b0: f64 = 0.0;          // mm — distance between connector rows

    // Equivalent span
    let le_expected: f64 = 8500.0;
    assert!((le - le_expected).abs() < 0.1,
        "Le={:.1} mm, expected={:.1} mm", le, le_expected);

    // Per-side effective width
    let le_over_8: f64 = le / 8.0;
    let le_over_8_expected: f64 = 1062.5;
    assert!((le_over_8 - le_over_8_expected).abs() < 0.1,
        "Le/8={:.1} mm, expected={:.1} mm", le_over_8, le_over_8_expected);

    let bei: f64 = le_over_8.min(bi);
    let bei_expected: f64 = 1062.5;
    assert!((bei - bei_expected).abs() < 0.1,
        "bei={:.1} mm, expected={:.1} mm", bei, bei_expected);

    // Le/8 governs (smaller than bi)
    assert!(le_over_8 < bi,
        "Le/8={:.1} should govern over bi={:.1}", le_over_8, bi);

    // Total effective width (symmetric, both sides)
    let beff: f64 = b0 + 2.0 * bei;
    let beff_expected: f64 = 2125.0;
    assert!((beff - beff_expected).abs() < 0.1,
        "beff={:.1} mm, expected={:.1} mm", beff, beff_expected);

    // EC4 vs AISC comparison (AISC test 3 gave be = 2000 mm for different inputs)
    // For longer spans with wide spacing, Le/8 often governs in EC4
    // The EC4 effective width is generally more conservative for short spans
    // and more generous for long spans compared to AISC
    let beff_over_l: f64 = beff / l;
    assert!(beff_over_l > 0.10 && beff_over_l < 0.40,
        "beff/L={:.3}, expected between 0.10 and 0.40", beff_over_l);

    // For support sections, Le factor differs (EC4 Table 5.1):
    // Le = 0.25*(L1 + L2) for internal supports
    // This produces narrower effective widths at supports
    let le_support: f64 = 0.25 * (l + l); // two equal adjacent spans
    let bei_support: f64 = (le_support / 8.0).min(bi);
    assert!(bei_support < bei,
        "Support bei={:.1} should be less than midspan bei={:.1}",
        bei_support, bei);
}

// ================================================================
// 5. AISC Shear Stud Capacity (I8.2a)
// ================================================================
//
// AISC 360-22 §I8.2a — Strength of headed stud anchors:
//   Qn = min(0.5 * Asc * sqrt(f'c * Ec), Asc * Fu)
//
// where:
//   Asc = cross-sectional area of stud = π*d²/4
//   d = 19 mm (3/4 in) — standard stud diameter
//   Ec = wc^1.5 * 0.043 * sqrt(f'c) for normal weight concrete
//      = 4700 * sqrt(f'c) (simplified, MPa)
//   f'c = 28 MPa
//   Fu = 450 MPa (stud ultimate tensile strength, ASTM A108)
//
// Calculations:
//   Asc = π * 19² / 4 = 283.53 mm²
//   Ec = 4700 * sqrt(28) = 4700 * 5.2915 = 24,870 MPa
//   Qn_concrete = 0.5 * 283.53 * sqrt(28 * 24870)
//               = 0.5 * 283.53 * sqrt(697,360)
//               = 0.5 * 283.53 * 835.08
//               = 118,349 N ≈ 118.3 kN
//   Qn_steel = 283.53 * 450 = 127,589 N ≈ 127.6 kN
//   Qn = min(118.3, 127.6) = 118.3 kN  (concrete breakout governs)

#[test]
fn validation_aisc_shear_stud_capacity() {
    let d_stud: f64 = 19.0;     // mm — stud diameter
    let fc: f64 = 28.0;         // MPa — concrete compressive strength
    let fu: f64 = 450.0;        // MPa — stud ultimate tensile strength

    // Stud cross-sectional area
    let asc: f64 = PI * d_stud.powi(2) / 4.0;
    let asc_expected: f64 = 283.53;
    let err_asc: f64 = (asc - asc_expected).abs() / asc_expected;
    assert!(err_asc < 0.001,
        "Asc={:.2} mm², expected={:.2} mm²", asc, asc_expected);

    // Concrete modulus of elasticity (ACI 318 simplified for normal weight)
    let ec: f64 = 4700.0 * fc.sqrt();
    let ec_expected: f64 = 24_870.0;
    let err_ec: f64 = (ec - ec_expected).abs() / ec_expected;
    assert!(err_ec < 0.01,
        "Ec={:.0} MPa, expected={:.0} MPa", ec, ec_expected);

    // Concrete breakout/pryout limit
    let fc_ec_product: f64 = fc * ec;
    let qn_concrete: f64 = 0.5 * asc * (fc_ec_product).sqrt();
    let qn_concrete_kn: f64 = qn_concrete / 1000.0;

    // Steel fracture limit
    let qn_steel: f64 = asc * fu;
    let qn_steel_kn: f64 = qn_steel / 1000.0;

    // Verify intermediate: sqrt(f'c * Ec)
    let sqrt_fc_ec: f64 = fc_ec_product.sqrt();
    let sqrt_expected: f64 = 835.08;
    let err_sqrt: f64 = (sqrt_fc_ec - sqrt_expected).abs() / sqrt_expected;
    assert!(err_sqrt < 0.01,
        "sqrt(f'c*Ec)={:.2}, expected={:.2}", sqrt_fc_ec, sqrt_expected);

    // Governing capacity
    let qn: f64 = qn_concrete.min(qn_steel);
    let qn_kn: f64 = qn / 1000.0;

    // Concrete breakout governs
    assert!(qn_concrete < qn_steel,
        "Concrete limit ({:.1} kN) should govern over steel ({:.1} kN)",
        qn_concrete_kn, qn_steel_kn);

    // Check final values
    let qn_concrete_expected: f64 = 118.3;
    let err_qnc: f64 = (qn_concrete_kn - qn_concrete_expected).abs() / qn_concrete_expected;
    assert!(err_qnc < 0.01,
        "Qn_concrete={:.1} kN, expected={:.1} kN", qn_concrete_kn, qn_concrete_expected);

    let qn_steel_expected: f64 = 127.6;
    let err_qns: f64 = (qn_steel_kn - qn_steel_expected).abs() / qn_steel_expected;
    assert!(err_qns < 0.01,
        "Qn_steel={:.1} kN, expected={:.1} kN", qn_steel_kn, qn_steel_expected);

    let qn_expected: f64 = 118.3;
    let err_qn: f64 = (qn_kn - qn_expected).abs() / qn_expected;
    assert!(err_qn < 0.01,
        "Qn={:.1} kN, expected={:.1} kN, err={:.2}%",
        qn_kn, qn_expected, err_qn * 100.0);
}

// ================================================================
// 6. EC4 Shear Connector Design (EN 1994-1-1 §6.6.3.1)
// ================================================================
//
// EC4 headed stud resistance:
//   PRd = min(PRd1, PRd2)
//   PRd1 = 0.8 * fu * π * d² / (4 * γv)          [steel shank failure]
//   PRd2 = 0.29 * α * d² * sqrt(fck * Ecm) / γv  [concrete crushing]
//
// where:
//   d = 19 mm (stud diameter)
//   hsc = 100 mm (stud height after welding)
//   fu = 450 MPa (stud ultimate strength, ≤ 500 MPa per EC4)
//   fck = 25 MPa (C25/30 concrete characteristic strength)
//   Ecm = 31000 MPa (secant modulus for C25/30, EN 1992-1-1 Table 3.1)
//   γv = 1.25 (partial safety factor for shear connectors)
//
// α factor:
//   hsc/d = 100/19 = 5.26 > 4, so α = 1.0
//
// Calculations:
//   PRd1 = 0.8 * 450 * π * 19² / (4 * 1.25)
//        = 0.8 * 450 * 283.53 / 1.25
//        = 81,657 N ≈ 81.7 kN
//
//   PRd2 = 0.29 * 1.0 * 19² * sqrt(25 * 31000) / 1.25
//        = 0.29 * 361 * sqrt(775000) / 1.25
//        = 0.29 * 361 * 880.34 / 1.25
//        = 73,735 N ≈ 73.7 kN
//
//   PRd = min(81.7, 73.7) = 73.7 kN (concrete governs)

#[test]
fn validation_ec4_shear_connector_design() {
    let d_stud: f64 = 19.0;     // mm — stud diameter
    let hsc: f64 = 100.0;       // mm — stud height after welding
    let fu: f64 = 450.0;        // MPa — stud ultimate tensile strength
    let fck: f64 = 25.0;        // MPa — concrete characteristic strength
    let ecm: f64 = 31000.0;     // MPa — secant modulus for C25/30
    let gamma_v: f64 = 1.25;    // partial safety factor

    // Alpha factor per EC4 §6.6.3.1
    // α = 0.2*(hsc/d + 1) for hsc/d ≤ 4
    // α = 1.0             for hsc/d > 4
    let hsc_over_d: f64 = hsc / d_stud;
    assert!(hsc_over_d > 4.0,
        "hsc/d={:.2} should be > 4 for α=1.0", hsc_over_d);
    let alpha: f64 = if hsc_over_d <= 4.0 {
        0.2 * (hsc_over_d + 1.0)
    } else {
        1.0
    };
    assert!((alpha - 1.0_f64).abs() < 1e-10,
        "alpha should be 1.0 for hsc/d={:.2}", hsc_over_d);

    // Stud area
    let asc: f64 = PI * d_stud.powi(2) / 4.0;

    // PRd1: steel shank failure mode
    let prd1: f64 = 0.8 * fu * asc / gamma_v;
    let prd1_kn: f64 = prd1 / 1000.0;
    let prd1_expected: f64 = 81.7;
    let err_prd1: f64 = (prd1_kn - prd1_expected).abs() / prd1_expected;
    assert!(err_prd1 < 0.01,
        "PRd1={:.1} kN, expected={:.1} kN", prd1_kn, prd1_expected);

    // PRd2: concrete crushing mode
    let sqrt_fck_ecm: f64 = (fck * ecm).sqrt();
    let prd2: f64 = 0.29 * alpha * d_stud.powi(2) * sqrt_fck_ecm / gamma_v;
    let prd2_kn: f64 = prd2 / 1000.0;
    let prd2_expected: f64 = 73.7;
    let err_prd2: f64 = (prd2_kn - prd2_expected).abs() / prd2_expected;
    assert!(err_prd2 < 0.01,
        "PRd2={:.1} kN, expected={:.1} kN", prd2_kn, prd2_expected);

    // Governing resistance
    let prd: f64 = prd1.min(prd2);
    let prd_kn: f64 = prd / 1000.0;

    // Concrete mode governs
    assert!(prd2 < prd1,
        "Concrete mode ({:.1} kN) should govern over steel ({:.1} kN)",
        prd2_kn, prd1_kn);

    let prd_expected: f64 = 73.7;
    let err_prd: f64 = (prd_kn - prd_expected).abs() / prd_expected;
    assert!(err_prd < 0.01,
        "PRd={:.1} kN, expected={:.1} kN, err={:.2}%",
        prd_kn, prd_expected, err_prd * 100.0);

    // Verify alpha for short studs (hsc/d = 3)
    let hsc_short: f64 = 57.0; // mm — gives hsc/d = 3.0
    let hsc_over_d_short: f64 = hsc_short / d_stud;
    let alpha_short: f64 = 0.2 * (hsc_over_d_short + 1.0);
    let alpha_short_expected: f64 = 0.8;
    assert!((alpha_short - alpha_short_expected).abs() < 0.01,
        "alpha_short={:.2}, expected={:.2}", alpha_short, alpha_short_expected);

    // Short stud PRd2 would be reduced
    let prd2_short: f64 = 0.29 * alpha_short * d_stud.powi(2) * sqrt_fck_ecm / gamma_v;
    assert!(prd2_short < prd2,
        "Short stud PRd2={:.0} N should be less than tall stud PRd2={:.0} N",
        prd2_short, prd2);
}

// ================================================================
// 7. AISC Composite Column Capacity (Concrete-Filled HSS)
// ================================================================
//
// AISC 360-22 §I2.1b — Filled Composite Members
//
// HSS 254×254×9.5 (square tube), concrete-filled:
//   B = H = 254 mm, t = 9.5 mm
//   As = 4 * (254 - 9.5) * 9.5 = 4 * 244.5 * 9.5 = 9291 mm² (approx)
//   Ac = (254 - 2*9.5)² = 235² = 55225 mm²
//
// Steel: Fy = 345 MPa, Es = 200000 MPa
// Concrete: f'c = 35 MPa, Ec = 4700*sqrt(35) = 27806 MPa
//
// AISC I2.1b — Compressive strength:
//   Po = Fy*As + 0.85*f'c*Ac (no reinforcing bars)
//
// Effective stiffness:
//   EIeff = Es*Is + C3*Ec*Ic
//   C3 = min(0.9, 0.6 + 2*(As/(Ac+As)))
//
//   Is = (B^4 - (B-2t)^4) / 12 = (254^4 - 235^4) / 12
//   Ic = (B-2t)^4 / 12 = 235^4 / 12
//
// Euler buckling:
//   Pe = π² * EIeff / (K*L)²
//
// AISC stability (I2.1b):
//   If Pe/Po ≥ 2.25:  Pn = Po * (0.658^(Po/Pe))
//   If Pe/Po < 2.25:  Pn = 0.877 * Pe

#[test]
fn validation_aisc_composite_column_capacity() {
    // HSS dimensions
    let b_hss: f64 = 254.0;     // mm — outer dimension
    let t_hss: f64 = 9.5;       // mm — wall thickness
    let b_inner: f64 = b_hss - 2.0 * t_hss; // 235 mm

    // Steel properties
    let fy: f64 = 345.0;        // MPa
    let es: f64 = 200_000.0;    // MPa

    // Concrete properties
    let fc: f64 = 35.0;         // MPa
    let ec: f64 = 4700.0 * fc.sqrt();

    // Column length
    let kl: f64 = 4000.0;       // mm — effective length (K*L)

    // Cross-sectional areas
    let a_gross: f64 = b_hss.powi(2);
    let a_concrete: f64 = b_inner.powi(2);
    let a_steel: f64 = a_gross - a_concrete;

    let ac_expected: f64 = 55225.0;
    let err_ac: f64 = (a_concrete - ac_expected).abs() / ac_expected;
    assert!(err_ac < 0.001,
        "Ac={:.0} mm², expected={:.0} mm²", a_concrete, ac_expected);

    // Steel area (for HSS, this is more precise using perimeter approach)
    // Simplified: As = B² - (B-2t)²
    let as_expected: f64 = b_hss.powi(2) - b_inner.powi(2);
    assert!((a_steel - as_expected).abs() < 0.1,
        "As={:.0} mm², check={:.0} mm²", a_steel, as_expected);

    // Squash load (Po)
    let po: f64 = fy * a_steel + 0.85 * fc * a_concrete;
    let po_kn: f64 = po / 1000.0;

    // Verify Po components
    let po_steel: f64 = fy * a_steel;
    let po_concrete: f64 = 0.85 * fc * a_concrete;
    assert!(po_steel > 0.0 && po_concrete > 0.0,
        "Both components must be positive");

    // Moments of inertia
    let is_steel: f64 = (b_hss.powi(4) - b_inner.powi(4)) / 12.0;
    let ic_concrete: f64 = b_inner.powi(4) / 12.0;

    // C3 coefficient
    let c3: f64 = (0.6 + 2.0 * (a_steel / (a_concrete + a_steel))).min(0.9);
    assert!(c3 > 0.6 && c3 <= 0.9,
        "C3={:.4} should be between 0.6 and 0.9", c3);

    // Effective stiffness
    let ei_eff: f64 = es * is_steel + c3 * ec * ic_concrete;

    // Euler buckling load
    let pe: f64 = PI.powi(2) * ei_eff / kl.powi(2);
    let pe_kn: f64 = pe / 1000.0;

    // Check Pe/Po ratio to determine which stability equation to use
    let pe_over_po: f64 = pe / po;

    // Nominal compressive strength
    let pn: f64 = if pe_over_po >= 2.25 {
        // Inelastic buckling
        po * (0.658_f64).powf(po / pe)
    } else {
        // Elastic buckling
        0.877 * pe
    };
    let pn_kn: f64 = pn / 1000.0;

    // Pn should be less than Po (stability reduces capacity)
    assert!(pn < po,
        "Pn={:.0} kN should be less than Po={:.0} kN (buckling effect)",
        pn_kn, po_kn);

    // Pn should be less than Pe (strength limits elastic capacity)
    assert!(pn < pe,
        "Pn={:.0} kN should be less than Pe={:.0} kN",
        pn_kn, pe_kn);

    // Pn should be positive and substantial
    assert!(pn_kn > 100.0,
        "Pn={:.0} kN should be a substantial capacity", pn_kn);

    // Composite column should be stronger than bare steel alone
    let pn_steel_only: f64 = fy * a_steel; // simplified bare steel squash
    assert!(po > pn_steel_only,
        "Composite Po={:.0} kN should exceed bare steel Fy*As={:.0} kN",
        po_kn, pn_steel_only / 1000.0);

    // Concrete contribution ratio (typically 30-60% for filled HSS)
    let concrete_ratio: f64 = po_concrete / po;
    assert!(concrete_ratio > 0.15 && concrete_ratio < 0.70,
        "Concrete contribution ratio={:.3}, expected 0.15-0.70",
        concrete_ratio);

    // Verify Ec
    let ec_expected: f64 = 27_806.0;
    let err_ec: f64 = (ec - ec_expected).abs() / ec_expected;
    assert!(err_ec < 0.01,
        "Ec={:.0} MPa, expected={:.0} MPa", ec, ec_expected);
}

// ================================================================
// 8. Composite Transformed Section Method
// ================================================================
//
// The transformed section method converts a composite steel-concrete
// cross-section into an equivalent homogeneous section by dividing
// the concrete width by the modular ratio n = Es/Ec.
//
// Steel beam: W16x40 (simplified as rectangle for calculation clarity)
//   d_steel = 407 mm, bf = 178 mm, As = 7613 mm²
//   Is = 216e6 mm⁴ (strong axis moment of inertia)
//   Es = 200000 MPa
//
// Concrete slab:
//   tc = 125 mm, be = 2000 mm
//   f'c = 28 MPa
//   Ec = 4700 * sqrt(28) = 24870 MPa
//
// Modular ratio:
//   n = Es/Ec = 200000/24870 = 8.042
//
// Transformed concrete width:
//   b_tr = be/n = 2000/8.042 = 248.7 mm
//
// Transformed concrete area:
//   Ac_tr = b_tr * tc = 248.7 * 125 = 31,088 mm²
//
// Neutral axis location (measured from bottom of steel):
//   Total area: A_total = As + Ac_tr = 7613 + 31088 = 38701 mm²
//   y_steel = d/2 = 203.5 mm (centroid of steel from bottom)
//   y_concrete = d + tc/2 = 407 + 62.5 = 469.5 mm (centroid of slab from bottom)
//   y_bar = (As*y_steel + Ac_tr*y_concrete) / A_total
//         = (7613*203.5 + 31088*469.5) / 38701
//         = (1,549,246 + 14,595,816) / 38701
//         = 16,145,062 / 38701
//         = 417.2 mm
//
// Transformed moment of inertia (parallel axis theorem):
//   I_tr = Is + As*(y_bar - y_steel)² + b_tr*tc³/12 + Ac_tr*(y_concrete - y_bar)²
//        = 216e6 + 7613*(417.2-203.5)² + 248.7*125³/12 + 31088*(469.5-417.2)²
//        = 216e6 + 7613*45,660 + 248.7*162,760 + 31088*2732
//        = 216.0e6 + 347.6e6 + 40.5e6 + 84.9e6
//        = 689.0e6 mm⁴

#[test]
fn validation_composite_transformed_section() {
    // Steel beam: W16x40
    let d_steel: f64 = 407.0;   // mm — overall depth
    let as_steel: f64 = 7613.0; // mm² — area
    let is_steel: f64 = 216.0e6; // mm⁴ — strong axis moment of inertia
    let es: f64 = 200_000.0;    // MPa

    // Concrete slab
    let tc: f64 = 125.0;        // mm — slab thickness
    let be: f64 = 2000.0;       // mm — effective width
    let fc: f64 = 28.0;         // MPa
    let ec: f64 = 4700.0 * fc.sqrt();

    // Modular ratio
    let n: f64 = es / ec;
    let n_expected: f64 = 8.042;
    let err_n: f64 = (n - n_expected).abs() / n_expected;
    assert!(err_n < 0.01,
        "n=Es/Ec={:.3}, expected={:.3}", n, n_expected);

    // Transformed concrete width
    let b_tr: f64 = be / n;
    let b_tr_expected: f64 = 248.7;
    let err_btr: f64 = (b_tr - b_tr_expected).abs() / b_tr_expected;
    assert!(err_btr < 0.01,
        "b_tr={:.1} mm, expected={:.1} mm", b_tr, b_tr_expected);

    // Transformed concrete area
    let ac_tr: f64 = b_tr * tc;
    let ac_tr_expected: f64 = 31_088.0;
    let err_actr: f64 = (ac_tr - ac_tr_expected).abs() / ac_tr_expected;
    assert!(err_actr < 0.01,
        "Ac_tr={:.0} mm², expected={:.0} mm²", ac_tr, ac_tr_expected);

    // Total transformed area
    let a_total: f64 = as_steel + ac_tr;

    // Centroids (measured from bottom of steel beam)
    let y_steel: f64 = d_steel / 2.0;           // 203.5 mm
    let y_concrete: f64 = d_steel + tc / 2.0;    // 469.5 mm

    // Neutral axis of composite section
    let y_bar: f64 = (as_steel * y_steel + ac_tr * y_concrete) / a_total;
    let y_bar_expected: f64 = 417.2;
    let err_ybar: f64 = (y_bar - y_bar_expected).abs() / y_bar_expected;
    assert!(err_ybar < 0.01,
        "y_bar={:.1} mm, expected={:.1} mm", y_bar, y_bar_expected);

    // Neutral axis should be above the steel centroid (slab pulls it up)
    assert!(y_bar > y_steel,
        "NA y_bar={:.1} must be above steel centroid y_steel={:.1}", y_bar, y_steel);

    // Neutral axis should be below the slab centroid
    assert!(y_bar < y_concrete,
        "NA y_bar={:.1} must be below slab centroid y_concrete={:.1}", y_bar, y_concrete);

    // Transformed moment of inertia (parallel axis theorem)
    let i_steel_shifted: f64 = is_steel + as_steel * (y_bar - y_steel).powi(2);
    let i_slab_own: f64 = b_tr * tc.powi(3) / 12.0;
    let i_slab_shifted: f64 = i_slab_own + ac_tr * (y_concrete - y_bar).powi(2);

    let i_tr: f64 = i_steel_shifted + i_slab_shifted;

    // Verify individual components (approximate, within 5%)
    let i_steel_shifted_expected: f64 = 216.0e6 + 7613.0 * (y_bar - 203.5).powi(2);
    let err_is: f64 = (i_steel_shifted - i_steel_shifted_expected).abs() / i_steel_shifted_expected;
    assert!(err_is < 0.001, "Steel I shifted check");

    // Transformed I should be substantially larger than steel I alone
    assert!(i_tr > is_steel,
        "I_tr={:.2e} should exceed I_steel={:.2e}", i_tr, is_steel);

    // Composite section ratio I_tr / I_steel — typically 2-5x for composite beams
    let i_ratio: f64 = i_tr / is_steel;
    assert!(i_ratio > 1.5 && i_ratio < 6.0,
        "I_tr/I_steel={:.2}, expected between 1.5 and 6.0", i_ratio);

    // Verify overall I_tr magnitude (hand calculation gives ~689e6 mm⁴)
    let i_tr_expected: f64 = 689.0e6;
    let err_itr: f64 = (i_tr - i_tr_expected).abs() / i_tr_expected;
    assert!(err_itr < 0.05,
        "I_tr={:.2e} mm⁴, expected={:.2e} mm⁴, err={:.1}%",
        i_tr, i_tr_expected, err_itr * 100.0);

    // Section moduli
    // Bottom fiber (steel tension): S_bot = I_tr / y_bar
    let s_bot: f64 = i_tr / y_bar;
    // Top fiber (concrete compression): S_top = I_tr / (d_steel + tc - y_bar)
    let dist_top: f64 = d_steel + tc - y_bar;
    let s_top: f64 = i_tr / dist_top;

    // Both moduli must be positive
    assert!(s_bot > 0.0 && s_top > 0.0,
        "Section moduli must be positive: S_bot={:.0}, S_top={:.0}", s_bot, s_top);

    // Neutral axis position sanity: distance to bottom > 0, to top > 0
    assert!(y_bar > 0.0 && dist_top > 0.0,
        "Distances must be positive: y_bar={:.1}, dist_top={:.1}", y_bar, dist_top);
}
