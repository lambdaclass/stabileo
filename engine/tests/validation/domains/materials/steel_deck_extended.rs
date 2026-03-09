/// Validation: Steel Deck & Composite Floor Design — Extended
///
/// References:
///   - AISC 360-22: Specification for Structural Steel Buildings, Ch. I
///   - SDI (Steel Deck Institute) Design Manual, 4th Edition
///   - SDI C-2017: Standard for Composite Steel Floor Deck-Slabs
///   - SDI DDM04: Diaphragm Design Manual, 4th Edition
///   - AISI S100-16: North American Specification for Cold-Formed Steel
///   - ASCE 7-22: Minimum Design Loads, §8.4 (Ponding)
///   - Viest, Colaco, et al.: "Composite Construction Design for Buildings"
///   - Johnson: "Composite Structures of Steel and Concrete", 3rd Ed.
///
/// Tests verify deck section properties, composite slab strength,
/// shear stud design, composite beam deflection (ILB), partial composite
/// action, construction stage deflection, diaphragm shear, and ponding.

use crate::common::*;

use std::f64::consts::PI;

// ================================================================
// 1. Steel Deck Section Properties — Effective Width & Section Modulus
// ================================================================
//
// Cold-formed steel deck effective section properties per unit width.
// AISI S100-16 effective width method for stiffened compression elements:
//   b_eff = ρ * w,  where ρ = (1 - 0.22/λ) / λ  for λ > 0.673
//   λ = (1.052 / sqrt(k)) * (w/t) * sqrt(Fy/E)
//   k = 4.0 for stiffened element (both edges supported)
//
// Typical 1.5" (38mm) Type B composite deck, 20 gauge (t = 0.91 mm):
//   Flat width of top flange w = 130 mm (per rib)
//   Fy = 250 MPa, E = 203,000 MPa
//   k = 4.0
//
//   λ = (1.052/sqrt(4)) * (130/0.91) * sqrt(250/203000)
//     = 0.526 * 142.86 * 0.03508
//     = 2.636
//
//   Since λ > 0.673:
//   ρ = (1 - 0.22/2.636) / 2.636 = (1 - 0.0835) / 2.636 = 0.3477
//   b_eff = 0.3477 * 130 = 45.20 mm
//
// Section modulus per rib (assuming trapezoidal profile, d = 38 mm):
//   S_eff per rib ≈ b_eff * t * (d - t/2)
//                  = 45.20 * 0.91 * (38 - 0.455)
//                  = 45.20 * 0.91 * 37.545
//                  = 1544.5 mm³
//
//   With 3 ribs per 300 mm cover width:
//   S_per_m = 1544.5 * (1000/300) * 3 = 15,445 mm³/m
//
// Reference: AISI S100-16 §B3.1, SDI Design Manual Table 2

#[test]
fn validation_deck_ext_section_properties() {
    let t: f64 = 0.91;           // mm, steel thickness (20 gauge)
    let w: f64 = 130.0;          // mm, flat width of top flange per rib
    let fy: f64 = 250.0;         // MPa, deck steel yield
    let e_deck: f64 = 203_000.0; // MPa, cold-formed steel modulus
    let k: f64 = 4.0;            // buckling coefficient for stiffened element
    let d_deck: f64 = 38.0;      // mm, deck depth (1.5" Type B)

    // Slenderness factor per AISI S100
    let lambda: f64 = (1.052 / k.sqrt()) * (w / t) * (fy / e_deck).sqrt();
    let lambda_expected: f64 = 2.636;
    assert_close(lambda, lambda_expected, 0.02, "deck lambda");

    // Effective width reduction factor
    assert!(lambda > 0.673, "lambda={:.3} must exceed 0.673 for reduction", lambda);
    let rho: f64 = (1.0 - 0.22 / lambda) / lambda;
    let rho_expected: f64 = 0.3477;
    assert_close(rho, rho_expected, 0.02, "deck rho");

    // Effective width per rib
    let b_eff: f64 = rho * w;
    let b_eff_expected: f64 = 45.20;
    assert_close(b_eff, b_eff_expected, 0.02, "deck b_eff");

    // Effective section modulus per rib (simplified trapezoidal profile)
    let s_per_rib: f64 = b_eff * t * (d_deck - t / 2.0);
    let s_per_rib_expected: f64 = 1544.5;
    assert_close(s_per_rib, s_per_rib_expected, 0.03, "deck S per rib");

    // Scale to per-meter width (3 ribs per 300 mm cover width)
    let ribs_per_m: f64 = 1000.0 / 300.0 * 3.0;
    let s_per_m: f64 = s_per_rib * ribs_per_m;
    let s_per_m_expected: f64 = 15_445.0;
    assert_close(s_per_m, s_per_m_expected, 0.03, "deck S per m");
}

// ================================================================
// 2. Composite Slab Strength — Positive Moment with Deck Reinforcement
// ================================================================
//
// SDI C-2017 / AISC 360-22 §I3: composite slab positive moment capacity.
// Deck acts as tensile reinforcement in the composite slab.
//
// Given:
//   f'c = 25 MPa (concrete)
//   Fy_deck = 250 MPa (deck steel yield)
//   t_slab = 140 mm (total slab depth)
//   d_deck = 50 mm (deck depth, 2" Type W)
//   As_deck = 1350 mm²/m (typical 18 gauge)
//   b = 1000 mm (per meter width)
//
// Effective depth of deck steel centroid from top:
//   d_s = t_slab - d_deck/2 = 140 - 25 = 115 mm
//
// Whitney stress block depth:
//   a = As*Fy / (0.85*f'c*b) = 1350*250 / (0.85*25*1000)
//     = 337,500 / 21,250 = 15.88 mm
//
// Verify a < (t_slab - d_deck) = 90 mm (NA in concrete above flutes)
//
// Nominal moment capacity:
//   Mn = As*Fy*(d_s - a/2)
//      = 1350 * 250 * (115 - 7.94)
//      = 1350 * 250 * 107.06
//      = 36,132,750 N·mm = 36.13 kN·m/m
//
// Reference: SDI C-2017 §4.3, AISC 360-22 §I3.3

#[test]
fn validation_deck_ext_composite_slab_strength() {
    let fc: f64 = 25.0;           // MPa
    let fy: f64 = 250.0;          // MPa
    let t_slab: f64 = 140.0;      // mm, total slab depth
    let d_deck: f64 = 50.0;       // mm, deck depth
    let as_deck: f64 = 1350.0;    // mm²/m, deck steel area
    let b: f64 = 1000.0;          // mm, unit width

    // Effective depth (centroid of deck steel from slab top)
    let d_s: f64 = t_slab - d_deck / 2.0;
    let d_s_expected: f64 = 115.0;
    assert_close(d_s, d_s_expected, 0.01, "deck d_s");

    // Whitney stress block depth
    let a: f64 = as_deck * fy / (0.85 * fc * b);
    let a_expected: f64 = 15.88;
    assert_close(a, a_expected, 0.02, "deck stress block a");

    // Verify NA in concrete above flutes
    let t_conc_above: f64 = t_slab - d_deck;
    assert!(a < t_conc_above,
        "a={:.2} must be < concrete above flutes={:.0}", a, t_conc_above);

    // Nominal moment capacity
    let mn: f64 = as_deck * fy * (d_s - a / 2.0) / 1.0e6; // kN·m/m
    let mn_expected: f64 = 36.13;
    assert_close(mn, mn_expected, 0.02, "composite slab Mn");

    // Non-composite deck-only moment for comparison
    // Mn_nc ~ As * Fy * d_deck / 2 (deck acting alone, approx)
    let mn_nc: f64 = as_deck * fy * d_deck / 2.0 / 1.0e6;
    assert!(mn > mn_nc,
        "Composite Mn={:.2} must exceed non-composite Mn_nc={:.2} kN.m/m", mn, mn_nc);
}

// ================================================================
// 3. Shear Stud Strength — AISC 360-22 Eq. I8-1
// ================================================================
//
// AISC 360-22 §I8.2a — Nominal strength of one headed stud anchor:
//   Qn = 0.5 * Asc * sqrt(f'c * Ec)   ≤  Rg * Rp * Asc * Fu
//
// where:
//   d_stud = 19 mm (3/4 in diameter)
//   Asc = π * d² / 4 = π * 19² / 4 = 283.53 mm²
//   f'c = 28 MPa
//   Ec = 4700 * sqrt(f'c) = 4700 * sqrt(28) = 24,870 MPa
//   Fu = 450 MPa (ASTM A108 stud ultimate strength)
//   Rg = 1.0 (stud in solid slab or above steel deck ribs perpendicular)
//   Rp = 0.75 (studs in steel deck with ribs perpendicular to beam)
//
// Concrete breakout:
//   Qn1 = 0.5 * 283.53 * sqrt(28 * 24870)
//        = 141.765 * sqrt(696,360)
//        = 141.765 * 834.48
//        = 118,270 N = 118.27 kN
//
// Steel limit:
//   Qn2 = Rg * Rp * Asc * Fu = 1.0 * 0.75 * 283.53 * 450
//        = 95,691 N = 95.69 kN
//
// Governing: Qn = min(118.27, 95.69) = 95.69 kN  (steel limit governs with Rp)
//
// Reference: AISC 360-22 §I8.2a, Table I8.2a

#[test]
fn validation_deck_ext_shear_stud_strength() {
    let d_stud: f64 = 19.0;      // mm
    let fc: f64 = 28.0;          // MPa
    let fu: f64 = 450.0;         // MPa
    let rg: f64 = 1.0;           // group factor (single stud, solid slab or perpendicular ribs)
    let rp: f64 = 0.75;          // position factor (in deck ribs perpendicular to beam)

    // Stud cross-sectional area
    let asc: f64 = PI * d_stud.powi(2) / 4.0;
    let asc_expected: f64 = 283.53;
    assert_close(asc, asc_expected, 0.01, "stud Asc");

    // Concrete elastic modulus (ACI 318 simplified)
    let ec: f64 = 4700.0 * fc.sqrt();
    let ec_expected: f64 = 24_870.0;
    assert_close(ec, ec_expected, 0.01, "concrete Ec");

    // Concrete breakout/pryout limit (AISC Eq. I8-1 left side)
    let fc_ec: f64 = fc * ec;
    let qn_concrete: f64 = 0.5 * asc * fc_ec.sqrt();
    let qn_concrete_kn: f64 = qn_concrete / 1000.0;
    let qn_concrete_expected: f64 = 118.27;
    assert_close(qn_concrete_kn, qn_concrete_expected, 0.02, "Qn concrete");

    // Steel fracture limit (AISC Eq. I8-1 right side)
    let qn_steel: f64 = rg * rp * asc * fu;
    let qn_steel_kn: f64 = qn_steel / 1000.0;
    let qn_steel_expected: f64 = 95.69;
    assert_close(qn_steel_kn, qn_steel_expected, 0.02, "Qn steel with Rp");

    // Governing capacity
    let qn: f64 = qn_concrete.min(qn_steel);
    let qn_kn: f64 = qn / 1000.0;
    assert_close(qn_kn, qn_steel_expected, 0.02, "Qn governing");

    // Steel limit governs when Rp < 1.0
    assert!(qn_steel < qn_concrete,
        "Steel limit {:.1} kN should govern over concrete {:.1} kN with Rp={:.2}",
        qn_steel_kn, qn_concrete_kn, rp);
}

// ================================================================
// 4. Composite Beam Deflection — Lower Bound Moment of Inertia (ILB)
// ================================================================
//
// AISC 360-22 Commentary §I3.2: Lower bound moment of inertia for
// deflection calculation of composite beams.
//
//   ILB = Is + As * (YENA - d/2)² + (ΣQn / Fy) * (2*d + 2*tc - 2*YENA - a_eff)² / 4
//
// Simplified (per AISC Commentary I3):
//   ILB = Is + As * YENA_sq_term  [transformed section approach at partial composite]
//
// For this test we use the equivalent approach:
//   I_eff = Is + As*(YENA - ys)² + (Ac_eff)*(yc - YENA)²  + Ic_eff
//   where Ac_eff = ΣQn / (0.85*f'c),  only partial concrete is mobilized
//
// Given (W21x44 beam, 125 mm slab, 75% composite):
//   As = 8387 mm², d = 525 mm, Is = 351e6 mm⁴
//   f'c = 28 MPa, Ec = 24870 MPa, tc = 125 mm, be = 2400 mm
//   Fy = 345 MPa, η = 0.75 (partial composite ratio)
//
// Full composite force:
//   Cf = min(As*Fy, 0.85*f'c*be*tc)
//      = min(8387*345, 0.85*28*2400*125)
//      = min(2,893,515, 7,140,000) = 2,893,515 N
//
//   ΣQn = η * Cf = 0.75 * 2,893,515 = 2,170,136 N
//
// Effective compression block:
//   a_eff = ΣQn / (0.85*f'c*be) = 2,170,136 / (0.85*28*2400) = 37.99 mm
//
// Elastic neutral axis (from steel bottom):
//   ys = d/2 = 262.5 mm
//   yc = d + tc - a_eff/2 = 525 + 125 - 19.0 = 631.0 mm
//   Ac_eff = ΣQn / (0.85*f'c) = 2,170,136 / 23.8 = 91,182 mm²
//   YENA = (As*ys + Ac_eff*yc) / (As + Ac_eff)
//        = (8387*262.5 + 91182*631.0) / (8387 + 91182)
//        = (2,201,588 + 57,535,842) / 99,569
//        = 59,737,430 / 99,569 = 599.9 mm
//
// ILB = Is + As*(YENA - ys)² + Ac_eff*(yc - YENA)²
//     = 351e6 + 8387*(599.9-262.5)² + 91182*(631.0-599.9)²
//     = 351e6 + 8387*113,892 + 91182*967.2
//     = 351e6 + 955.0e6 + 88.2e6
//     = 1394.2e6 mm⁴
//
// Midspan deflection under uniform load w = 12 kN/m, L = 10 m:
//   δ = 5*w*L⁴ / (384*E*ILB)
//     = 5 * 12 * 10000⁴ / (384 * 200000 * 1394.2e6)
//     = 6.0e17 / (1.071e17)
//     = 5.60 mm
//
// Reference: AISC 360-22 Commentary §I3.2, Design Guide 3

#[test]
fn validation_deck_ext_composite_beam_deflection_ilb() {
    // Steel section: W21x44
    let as_steel: f64 = 8387.0;   // mm²
    let d: f64 = 525.0;           // mm, beam depth
    let is_steel: f64 = 351.0e6;  // mm⁴
    let fy: f64 = 345.0;          // MPa

    // Concrete slab
    let fc: f64 = 28.0;           // MPa
    let tc: f64 = 125.0;          // mm
    let be: f64 = 2400.0;         // mm effective width

    // Partial composite ratio
    let eta: f64 = 0.75;

    // Full composite force (steel governs)
    let cf_steel: f64 = as_steel * fy;
    let cf_concrete: f64 = 0.85 * fc * be * tc;
    let cf: f64 = cf_steel.min(cf_concrete);
    let cf_expected: f64 = 2_893_515.0;
    assert_close(cf, cf_expected, 0.01, "Cf full composite");

    // Partial composite shear
    let sum_qn: f64 = eta * cf;
    let sum_qn_expected: f64 = 2_170_136.25;
    assert_close(sum_qn, sum_qn_expected, 0.01, "sum Qn partial");

    // Effective compression block
    let a_eff: f64 = sum_qn / (0.85 * fc * be);
    let a_eff_expected: f64 = 37.99;
    assert_close(a_eff, a_eff_expected, 0.02, "a_eff");

    // Centroid locations (from steel bottom)
    let ys: f64 = d / 2.0;
    let yc: f64 = d + tc - a_eff / 2.0;
    let ac_eff: f64 = sum_qn / (0.85 * fc);

    // Elastic neutral axis
    let yena: f64 = (as_steel * ys + ac_eff * yc) / (as_steel + ac_eff);
    let yena_expected: f64 = 599.9;
    assert_close(yena, yena_expected, 0.02, "YENA");

    // Lower bound moment of inertia
    let ilb: f64 = is_steel
        + as_steel * (yena - ys).powi(2)
        + ac_eff * (yc - yena).powi(2);
    let ilb_expected: f64 = 1394.2e6;
    assert_close(ilb, ilb_expected, 0.03, "ILB");

    // Deflection under uniform load
    let w: f64 = 12.0;           // kN/m = N/mm (after unit conversion)
    let l: f64 = 10_000.0;       // mm (10 m span)
    let e_steel: f64 = 200_000.0; // MPa
    let delta: f64 = 5.0 * w * l.powi(4) / (384.0 * e_steel * ilb);
    let delta_expected: f64 = 5.60;
    assert_close(delta, delta_expected, 0.05, "composite beam deflection");
}

// ================================================================
// 5. Partial Composite Action — Effective Moment Capacity
// ================================================================
//
// When ΣQn < Cf (partial composite), the effective moment capacity
// is interpolated. AISC 360-22 Commentary §I3:
//
//   Mn = Mp_steel + (ΣQn / Cf) * (Mn_full - Mp_steel)
//
// This linear interpolation is a lower-bound estimate.
//
// Given (W18x35):
//   As = 6645 mm², d = 450 mm, Zx = 1070e3 mm³
//   Fy = 345 MPa, f'c = 28 MPa, tc = 125 mm, be = 2000 mm
//
// Mp_steel = Fy * Zx = 345 * 1070e3 = 369.15e6 N·mm = 369.15 kN·m
//
// Full composite:
//   Cf = min(As*Fy, 0.85*f'c*be*tc) = min(2,292,525, 5,950,000) = 2,292,525 N
//   a = Cf / (0.85*f'c*be) = 2,292,525 / 47,600 = 48.16 mm
//   Mn_full = Cf * (d/2 + tc - a/2) = 2,292,525 * (225 + 125 - 24.08)
//           = 2,292,525 * 325.92 = 747.40e6 N·mm = 747.40 kN·m
//
// At 50% composite (η = 0.50):
//   ΣQn = 0.50 * 2,292,525 = 1,146,263 N
//   Mn_partial = 369.15 + (0.50) * (747.40 - 369.15)
//              = 369.15 + 189.13 = 558.28 kN·m
//
// Reference: AISC 360-22 Commentary §I3.2a

#[test]
fn validation_deck_ext_partial_composite_capacity() {
    // Steel section: W18x35
    let as_steel: f64 = 6645.0;    // mm²
    let d: f64 = 450.0;            // mm
    let zx: f64 = 1070.0e3;        // mm³ plastic section modulus
    let fy: f64 = 345.0;           // MPa

    // Concrete slab
    let fc: f64 = 28.0;            // MPa
    let tc: f64 = 125.0;           // mm
    let be: f64 = 2000.0;          // mm

    // Bare steel plastic moment
    let mp_steel: f64 = fy * zx / 1.0e6; // kN·m
    let mp_steel_expected: f64 = 369.15;
    assert_close(mp_steel, mp_steel_expected, 0.01, "Mp steel");

    // Full composite force (steel governs)
    let cf: f64 = (as_steel * fy).min(0.85 * fc * be * tc);
    let cf_expected: f64 = 2_292_525.0;
    assert_close(cf, cf_expected, 0.01, "Cf");

    // Full composite moment
    let a_full: f64 = cf / (0.85 * fc * be);
    let a_full_expected: f64 = 48.16;
    assert_close(a_full, a_full_expected, 0.02, "a_full");

    let mn_full: f64 = cf * (d / 2.0 + tc - a_full / 2.0) / 1.0e6;
    let mn_full_expected: f64 = 747.40;
    assert_close(mn_full, mn_full_expected, 0.02, "Mn_full");

    // Partial composite at eta = 0.50
    let eta: f64 = 0.50;
    let mn_partial: f64 = mp_steel + eta * (mn_full - mp_steel);
    let mn_partial_expected: f64 = 558.28;
    assert_close(mn_partial, mn_partial_expected, 0.02, "Mn partial 50%");

    // Verify bounds: Mp_steel < Mn_partial < Mn_full
    assert!(mn_partial > mp_steel,
        "Mn_partial={:.2} must exceed Mp_steel={:.2}", mn_partial, mp_steel);
    assert!(mn_partial < mn_full,
        "Mn_partial={:.2} must be less than Mn_full={:.2}", mn_partial, mn_full);
}

// ================================================================
// 6. Construction Stage — Unshored Beam Deflection Under Wet Concrete
// ================================================================
//
// During construction without shoring, the steel beam alone supports
// the wet concrete and deck self-weight. The beam acts non-compositely.
//
// Given (W21x44):
//   Is = 351e6 mm⁴, Es = 200,000 MPa
//   L = 10 m = 10,000 mm
//   Beam spacing = 3.0 m
//
// Loads (per unit length of beam):
//   w_concrete = γc * t_slab * spacing = 24 kN/m³ * 0.140 m * 3.0 m = 10.08 kN/m
//   w_deck = 0.15 kN/m² * 3.0 m = 0.45 kN/m
//   w_construction_LL = 0.96 kN/m² * 3.0 m = 2.88 kN/m (SDI minimum)
//   w_total = 10.08 + 0.45 + 2.88 = 13.41 kN/m
//
// Midspan deflection (steel beam alone):
//   δ = 5*w*L⁴ / (384*Es*Is)
//     = 5 * 13.41 * 10000⁴ / (384 * 200000 * 351e6)
//     = 6.705e17 / (2.695e16)
//     = 24.88 mm
//
// Allowable: L/240 = 10000/240 = 41.67 mm  (construction stage limit)
// Check: 24.88 < 41.67 — OK
//
// Reference: AISC Design Guide 3, §3.2; SDI C-2017 §3.2

#[test]
fn validation_deck_ext_construction_stage_deflection() {
    // Steel section: W21x44
    let is_steel: f64 = 351.0e6;    // mm⁴
    let es: f64 = 200_000.0;        // MPa
    let l: f64 = 10_000.0;          // mm (10 m span)
    let spacing: f64 = 3.0;         // m, beam spacing

    // Loads
    let gamma_c: f64 = 24.0;        // kN/m³
    let t_slab: f64 = 0.140;        // m (140 mm)
    let w_concrete: f64 = gamma_c * t_slab * spacing; // kN/m
    let w_concrete_expected: f64 = 10.08;
    assert_close(w_concrete, w_concrete_expected, 0.01, "w_concrete");

    let w_deck: f64 = 0.15 * spacing;  // kN/m
    let w_deck_expected: f64 = 0.45;
    assert_close(w_deck, w_deck_expected, 0.01, "w_deck");

    let w_cl: f64 = 0.96 * spacing;    // kN/m (construction live load)
    let w_cl_expected: f64 = 2.88;
    assert_close(w_cl, w_cl_expected, 0.01, "w_construction_LL");

    let w_total: f64 = w_concrete + w_deck + w_cl;
    let w_total_expected: f64 = 13.41;
    assert_close(w_total, w_total_expected, 0.01, "w_total");

    // Midspan deflection (non-composite, steel beam alone)
    // w in kN/m = N/mm
    let delta: f64 = 5.0 * w_total * l.powi(4) / (384.0 * es * is_steel);
    let delta_expected: f64 = 24.88;
    assert_close(delta, delta_expected, 0.03, "construction stage deflection");

    // Check against L/240 limit
    let limit: f64 = l / 240.0;
    let limit_expected: f64 = 41.67;
    assert_close(limit, limit_expected, 0.01, "L/240 limit");
    assert!(delta < limit,
        "delta={:.2} mm must be < L/240={:.2} mm", delta, limit);
}

// ================================================================
// 7. Diaphragm Shear — Steel Deck Per SDI DDM04
// ================================================================
//
// SDI Diaphragm Design Manual: deck diaphragm shear strength depends on
// fastener pattern, deck profile, and connection type.
//
// For a typical floor diaphragm:
//   - Deck: 20 gauge (0.91 mm), 38 mm deep, Type B
//   - Fasteners: PAF (powder actuated) at 300 mm on supports
//   - Side-lap: #10 screws at 300 mm
//
// SDI strength formula (simplified):
//   Sn = min(Sn_fastener, Sn_edge)
//
// Fastener-controlled (typical):
//   Sn = n_f * Qf / L_panel
//   where n_f = number of fasteners along panel edge
//         Qf = individual fastener shear strength
//         L_panel = panel length
//
// Given:
//   Qf = 4.50 kN per PAF (from SDI Table)
//   Panel: 6.0 m long, supports at 2.0 m spacing (3 supports)
//   Fasteners per support line: 4 (at 300 mm, 1200 mm cover)
//   Total fasteners on one edge = 4 * 3 = 12
//
//   Sn_fastener = 12 * 4.50 / 6.0 = 9.0 kN/m
//
// Design strength: φ * Sn = 0.65 * 9.0 = 5.85 kN/m
//
// Applied diaphragm shear from wind:
//   Building: 30 m × 15 m plan, wind pressure = 1.0 kN/m²
//   Total wind force on one face: 1.0 * 30 * 4.0 (story height) = 120 kN
//   Diaphragm shear at support: V = 120 / 2 = 60 kN
//   Unit shear: v = V / b = 60 / 15 = 4.0 kN/m
//
// Check: 4.0 < 5.85 — OK (DCR = 0.684)
//
// Reference: SDI DDM04 §3.4, AISI S310-16

#[test]
fn validation_deck_ext_diaphragm_shear() {
    // Fastener properties
    let qf: f64 = 4.50;             // kN per fastener (PAF shear strength)
    let l_panel: f64 = 6.0;         // m, panel length
    let n_supports: f64 = 3.0;      // support lines along panel
    let fasteners_per_line: f64 = 4.0; // fasteners per support line

    // Total fasteners on panel edge
    let n_f: f64 = n_supports * fasteners_per_line;
    let n_f_expected: f64 = 12.0;
    assert_close(n_f, n_f_expected, 0.01, "total fasteners");

    // Nominal diaphragm shear strength (fastener-controlled)
    let sn: f64 = n_f * qf / l_panel;
    let sn_expected: f64 = 9.0;
    assert_close(sn, sn_expected, 0.01, "Sn diaphragm");

    // Design strength
    let phi: f64 = 0.65;
    let phi_sn: f64 = phi * sn;
    let phi_sn_expected: f64 = 5.85;
    assert_close(phi_sn, phi_sn_expected, 0.01, "phi*Sn");

    // Applied diaphragm shear from wind
    let building_length: f64 = 30.0;  // m
    let building_width: f64 = 15.0;   // m
    let wind_pressure: f64 = 1.0;     // kN/m²
    let story_height: f64 = 4.0;      // m

    let v_total: f64 = wind_pressure * building_length * story_height;
    let v_total_expected: f64 = 120.0;
    assert_close(v_total, v_total_expected, 0.01, "V_total wind");

    let v_diaphragm: f64 = v_total / 2.0; // split to two sides
    let v_unit: f64 = v_diaphragm / building_width;
    let v_unit_expected: f64 = 4.0;
    assert_close(v_unit, v_unit_expected, 0.01, "v_unit applied");

    // Demand-capacity ratio
    let dcr: f64 = v_unit / phi_sn;
    let dcr_expected: f64 = 0.684;
    assert_close(dcr, dcr_expected, 0.02, "DCR diaphragm");

    // Verify adequacy
    assert!(dcr < 1.0, "DCR={:.3} must be < 1.0", dcr);
}

// ================================================================
// 8. Ponding Check — Rain/Concrete Ponding Stability Factor
// ================================================================
//
// ASCE 7-22 §8.4 and AISC 360-22 Appendix 2: ponding stability.
// Deflection of a flexible member under ponding loads amplifies:
//
//   Cp = 32 * Ls⁴ * γw / (π⁴ * E * Is)     (primary member)
//   Cs = 32 * S * Lp⁴ * γw / (π⁴ * E * Ip)  (secondary/deck)
//
// Stability requires: Cp + 0.9*Cs ≤ 0.25   (AISC Appendix 2)
//
// For the primary beam (W21x44):
//   Ls = 10,000 mm (primary beam span)
//   Is = 351e6 mm⁴
//   E = 200,000 MPa
//   γw = 9.81e-6 N/mm³ (unit weight of water)
//
//   Cp = 32 * 10000⁴ * 9.81e-6 / (π⁴ * 200000 * 351e6)
//      = 32 * 1.0e16 * 9.81e-6 / (97.409 * 200000 * 351e6)
//      = 3.1392e12 / (6.838e15)
//      = 4.591e-4
//
// For the secondary member (steel deck, span perpendicular):
//   Lp = 3000 mm (deck span)
//   S = 3000 mm (beam spacing = deck tributary)
//   Ip = 6.0e6 mm⁴/m → total Ip for S width = 6.0e6 * 3.0 = 18.0e6 mm⁴
//
//   Cs = 32 * 3000 * 3000⁴ * 9.81e-6 / (π⁴ * 200000 * 18.0e6)
//      = 32 * 3000 * 8.1e13 * 9.81e-6 / (97.409 * 200000 * 18.0e6)
//      = 7.633e13 / (3.507e14)
//      = 0.2176
//
// Check: Cp + 0.9*Cs = 4.591e-4 + 0.9*0.2176 = 0.000459 + 0.1958 = 0.1963
// 0.1963 < 0.25 — Ponding stable
//
// Reference: AISC 360-22 Appendix 2, ASCE 7-22 §8.4

#[test]
fn validation_deck_ext_ponding_check() {
    let e: f64 = 200_000.0;         // MPa
    let gamma_w: f64 = 9.81e-6;     // N/mm³ (water unit weight)
    let pi4: f64 = PI.powi(4);      // π⁴ ≈ 97.409

    let pi4_expected: f64 = 97.409;
    assert_close(pi4, pi4_expected, 0.01, "pi^4");

    // Primary beam (W21x44)
    let ls: f64 = 10_000.0;         // mm, primary beam span
    let is_beam: f64 = 351.0e6;     // mm⁴

    let cp: f64 = 32.0 * ls.powi(4) * gamma_w / (pi4 * e * is_beam);
    let cp_expected: f64 = 4.591e-4;
    assert_close(cp, cp_expected, 0.05, "Cp primary");

    // Secondary member (steel deck)
    let lp: f64 = 3000.0;           // mm, deck span
    let s: f64 = 3000.0;            // mm, beam spacing (tributary width for deck)
    let ip_per_m: f64 = 6.0e6;      // mm⁴/m, deck moment of inertia
    let ip: f64 = ip_per_m * (s / 1000.0); // mm⁴ for tributary width

    let cs: f64 = 32.0 * s * lp.powi(4) * gamma_w / (pi4 * e * ip);
    let cs_expected: f64 = 0.2176;
    assert_close(cs, cs_expected, 0.05, "Cs secondary");

    // AISC Appendix 2 ponding stability criterion
    let ponding_check: f64 = cp + 0.9 * cs;
    let ponding_expected: f64 = 0.1963;
    assert_close(ponding_check, ponding_expected, 0.05, "Cp + 0.9*Cs");

    // Stability criterion: must be ≤ 0.25
    assert!(ponding_check < 0.25,
        "Ponding check={:.4} must be < 0.25 for stability", ponding_check);

    // Verify individual contributions are positive
    assert!(cp > 0.0, "Cp must be positive");
    assert!(cs > 0.0, "Cs must be positive");
}
