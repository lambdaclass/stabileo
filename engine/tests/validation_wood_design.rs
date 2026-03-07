/// Validation: Timber/Wood Structural Design
///
/// References:
///   - NDS 2024: National Design Specification for Wood Construction
///   - EN 1995-1-1:2004 (EC5): Design of timber structures
///   - Breyer et al.: "Design of Wood Structures — ASD/LRFD" 8th ed.
///   - AITC 117-2010: Standard Specifications for Structural Glulam Timber
///   - Thelandersson & Larsen: "Timber Engineering" (2003)
///
/// Tests verify bending capacity, column stability, bearing, notch effects,
/// glulam volume factor, moisture adjustment, composite, and CLT panel bending.

mod helpers;

// ═══════════════════════════════════════════════════════════════
// 1. Bending Capacity with Size Factor (NDS §4.3.6)
// ═══════════════════════════════════════════════════════════════
//
// Reference design value: Fb = 8.27 MPa (1,200 psi) for Select Structural
// Size factor CF for sawn lumber (NDS Table 4.3.1):
//   CF = (305/d)^(1/9) for d > 305 mm (12 in.)
//   CF = 1.0 for d ≤ 305 mm
//
// Adjusted bending: Fb' = Fb * CF * CM * Ct * CL
// For a 140 × 400 mm beam (d=400 mm):
//   CF = (305/400)^(1/9) = 0.7625^(0.1111) = 0.9701
//   Fb' = 8.27 × 0.9701 = 8.023 MPa
//
// Section modulus: S = b*d²/6 = 140*400²/6 = 3.733×10⁶ mm³
// Moment capacity: Mr = Fb' × S = 8.023 × 3.733×10⁶ = 29.95 kN·m

#[test]
fn wood_bending_capacity_with_size_factor() {
    let fb: f64 = 8.27;       // MPa, reference bending design value
    let b: f64 = 140.0;       // mm, width
    let d: f64 = 400.0;       // mm, depth
    let cm: f64 = 1.0;        // moisture content factor (dry service)
    let ct: f64 = 1.0;        // temperature factor (normal)
    let cl: f64 = 1.0;        // beam stability factor (full lateral support)

    // Size factor for sawn lumber (d > 305 mm)
    let cf: f64 = (305.0 / d).powf(1.0 / 9.0);
    let cf_expected: f64 = 0.9701;
    assert!(
        (cf - cf_expected).abs() / cf_expected < 0.005,
        "CF = {:.4}, expected {:.4}", cf, cf_expected
    );

    // Adjusted bending design value
    let fb_prime: f64 = fb * cf * cm * ct * cl;

    // Section modulus (rectangular)
    let s: f64 = b * d * d / 6.0;
    let s_expected: f64 = 3.733e6;  // mm³
    assert!(
        (s - s_expected).abs() / s_expected < 0.01,
        "S = {:.0} mm³, expected {:.0}", s, s_expected
    );

    // Moment capacity
    let mr: f64 = fb_prime * s / 1.0e6; // kN·m
    let mr_expected: f64 = 29.95;
    assert!(
        (mr - mr_expected).abs() / mr_expected < 0.02,
        "Mr = {:.2} kN·m, expected {:.2}", mr, mr_expected
    );

    // Verify smaller beam doesn't need size factor
    let d_small: f64 = 250.0;
    let cf_small: f64 = if d_small <= 305.0 { 1.0 } else { (305.0 / d_small).powf(1.0 / 9.0) };
    assert!(
        (cf_small - 1.0).abs() < 1e-10,
        "CF should be 1.0 for d ≤ 305 mm, got {:.4}", cf_small
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Column Stability Factor — Euler Buckling for Wood (NDS §3.7.1)
// ═══════════════════════════════════════════════════════════════
//
// Euler critical stress: FcE = 0.822 × E'min / (le/d)²
// E'min = Emin × CM × Ct × Ci / 1.66  (ASD format factor)
//
// Column stability factor Cp (NDS Eq. 3.7-1):
//   Cp = (1+α)/(2c) − √[ ((1+α)/(2c))² − α/c ]
//   where α = FcE / Fc*, c = 0.8 (sawn lumber)
//
// Example: 140×140 mm, Emin = 5,170 MPa, Fc = 7.93 MPa, Le = 3,000 mm
//   le/d = 3000/140 = 21.43
//   FcE = 0.822 × 5170/1.66 / 21.43² = 0.822 × 3114.5 / 459.2 = 5.573 MPa
//   α = 5.573 / 7.93 = 0.7027
//   Cp = (1+0.7027)/(2×0.8) − √[((1+0.7027)/(2×0.8))² − 0.7027/0.8]
//      = 1.0642 − √[1.1325 − 0.8784] = 1.0642 − √0.2541 = 1.0642 − 0.5041 = 0.5601
//   Fc' = Fc × Cp = 7.93 × 0.5601 = 4.44 MPa

#[test]
fn wood_column_stability_factor() {
    let emin: f64 = 5_170.0;   // MPa, minimum modulus of elasticity
    let fc: f64 = 7.93;         // MPa, reference compression parallel to grain
    let d: f64 = 140.0;         // mm, least dimension
    let le: f64 = 3_000.0;      // mm, effective length
    let c: f64 = 0.8;           // sawn lumber constant

    // Adjusted minimum E for stability
    let emin_prime: f64 = emin / 1.66;  // ASD format factor

    // Slenderness ratio
    let slenderness: f64 = le / d;
    assert!(
        (slenderness - 21.43).abs() < 0.01,
        "le/d = {:.2}", slenderness
    );

    // Euler critical stress (NDS)
    let fce: f64 = 0.822 * emin_prime / (slenderness * slenderness);
    let fce_expected: f64 = 5.573;
    assert!(
        (fce - fce_expected).abs() / fce_expected < 0.02,
        "FcE = {:.3} MPa, expected {:.3}", fce, fce_expected
    );

    // Column stability factor
    let alpha: f64 = fce / fc;
    let term: f64 = (1.0 + alpha) / (2.0 * c);
    let cp: f64 = term - (term * term - alpha / c).sqrt();
    let cp_expected: f64 = 0.5601;
    assert!(
        (cp - cp_expected).abs() / cp_expected < 0.02,
        "Cp = {:.4}, expected {:.4}", cp, cp_expected
    );

    // Adjusted compression design value
    let fc_prime: f64 = fc * cp;
    let fc_prime_expected: f64 = 4.44;
    assert!(
        (fc_prime - fc_prime_expected).abs() / fc_prime_expected < 0.02,
        "Fc' = {:.2} MPa, expected {:.2}", fc_prime, fc_prime_expected
    );

    // Verify: short column (le/d < 11) → Cp approaches 1.0
    let le_short: f64 = 1_000.0;
    let sl_short: f64 = le_short / d;
    let fce_short: f64 = 0.822 * emin_prime / (sl_short * sl_short);
    let alpha_short: f64 = fce_short / fc;
    let term_short: f64 = (1.0 + alpha_short) / (2.0 * c);
    let cp_short: f64 = term_short - (term_short * term_short - alpha_short / c).sqrt();
    assert!(
        cp_short > cp,
        "Short column Cp={:.3} > long column Cp={:.3}", cp_short, cp
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Bearing Perpendicular to Grain (NDS §3.10.2)
// ═══════════════════════════════════════════════════════════════
//
// Bearing area factor Cb (NDS §3.10.4):
//   Cb = (lb + 0.375) / lb for lb < 6 in. (152 mm)
//   Cb = 1.0 for lb ≥ 6 in.
//
// Adjusted perpendicular-to-grain compression:
//   Fc_perp' = Fc_perp × CM × Ct × Cb
//
// Example: Bearing plate 100 mm long on 140 mm wide member
//   Fc_perp = 4.31 MPa (625 psi for Douglas Fir-Larch)
//   lb = 100 mm = 3.94 in.
//   Cb = (3.94 + 0.375) / 3.94 = 1.095
//   Fc_perp' = 4.31 × 1.095 = 4.72 MPa
//   Bearing capacity = Fc_perp' × Ab = 4.72 × (100 × 140) = 66.1 kN

#[test]
fn wood_bearing_perpendicular_to_grain() {
    let fc_perp: f64 = 4.31;    // MPa, reference perpendicular compression
    let b_member: f64 = 140.0;  // mm, member width
    let lb_mm: f64 = 100.0;     // mm, bearing length
    let cm: f64 = 1.0;          // moisture factor
    let ct: f64 = 1.0;          // temperature factor

    // Convert bearing length to inches for NDS formula
    let lb_in: f64 = lb_mm / 25.4;
    assert!(
        lb_in < 6.0,
        "lb = {:.2} in < 6 in → bearing area factor applies", lb_in
    );

    // Bearing area factor
    let cb: f64 = (lb_in + 0.375) / lb_in;
    let cb_expected: f64 = 1.095;
    assert!(
        (cb - cb_expected).abs() / cb_expected < 0.01,
        "Cb = {:.3}, expected {:.3}", cb, cb_expected
    );

    // Adjusted perpendicular compression
    let fc_perp_prime: f64 = fc_perp * cm * ct * cb;
    let fc_perp_prime_expected: f64 = 4.72;
    assert!(
        (fc_perp_prime - fc_perp_prime_expected).abs() / fc_perp_prime_expected < 0.01,
        "Fc_perp' = {:.2} MPa, expected {:.2}", fc_perp_prime, fc_perp_prime_expected
    );

    // Bearing capacity
    let ab: f64 = lb_mm * b_member;  // mm², bearing area
    let capacity: f64 = fc_perp_prime * ab / 1000.0; // kN
    let capacity_expected: f64 = 66.1;
    assert!(
        (capacity - capacity_expected).abs() / capacity_expected < 0.01,
        "Capacity = {:.1} kN, expected {:.1}", capacity, capacity_expected
    );

    // Large bearing plate: Cb = 1.0
    let lb_large_mm: f64 = 200.0;
    let lb_large_in: f64 = lb_large_mm / 25.4;
    let cb_large: f64 = if lb_large_in >= 6.0 { 1.0 } else { (lb_large_in + 0.375) / lb_large_in };
    assert!(
        cb_large >= 1.0,
        "Cb for large plate = {:.3} ≥ 1.0", cb_large
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Notched Beam Shear Reduction (NDS §3.4.3.2)
// ═══════════════════════════════════════════════════════════════
//
// For beams notched on the tension side at supports,
// the adjusted shear capacity is reduced:
//   Vr' = (2/3) × Fv' × b × dn × (dn/d)
//
// where dn = depth at notch, d = full depth.
//
// Actually (NDS 3.4.3.2):
//   Vr' = (2/3) × Fv × b × d × (dn/d)²  ... simplified
//
// More precisely, the shear stress at notch:
//   fv = (3V)/(2·b·dn) × (d/dn)
// Rearranging for capacity:
//   V_notched = (2/3) × Fv × b × dn² / d
//
// Example: 140×400 beam notched to dn=300 mm, Fv = 1.0 MPa
//   V_full = (2/3) × 1.0 × 140 × 400 = 37.33 kN
//   V_notched = (2/3) × 1.0 × 140 × 300² / 400 = 21.0 kN
//   Reduction ratio = V_notched / V_full = (300/400)² = 0.5625

#[test]
fn wood_notched_beam_shear_reduction() {
    let fv: f64 = 1.0;       // MPa, reference shear design value
    let b: f64 = 140.0;      // mm, width
    let d: f64 = 400.0;      // mm, full depth
    let dn: f64 = 300.0;     // mm, depth at notch

    // Full beam shear capacity
    let v_full: f64 = (2.0 / 3.0) * fv * b * d / 1000.0; // kN
    let v_full_expected: f64 = 37.33;
    assert!(
        (v_full - v_full_expected).abs() / v_full_expected < 0.01,
        "V_full = {:.2} kN, expected {:.2}", v_full, v_full_expected
    );

    // Notched beam shear capacity
    let v_notched: f64 = (2.0 / 3.0) * fv * b * dn * dn / (d * 1000.0); // kN
    let v_notched_expected: f64 = 21.0;
    assert!(
        (v_notched - v_notched_expected).abs() / v_notched_expected < 0.01,
        "V_notched = {:.2} kN, expected {:.2}", v_notched, v_notched_expected
    );

    // Reduction ratio = (dn/d)²
    let reduction: f64 = v_notched / v_full;
    let reduction_expected: f64 = (dn / d) * (dn / d);
    assert!(
        (reduction - reduction_expected).abs() < 0.001,
        "Reduction ratio = {:.4}, expected {:.4}", reduction, reduction_expected
    );
    assert!(
        (reduction - 0.5625).abs() < 0.001,
        "Reduction = {:.4}, expected 0.5625", reduction
    );

    // Deeper notch → more severe reduction
    let dn2: f64 = 200.0;
    let v_deep: f64 = (2.0 / 3.0) * fv * b * dn2 * dn2 / (d * 1000.0);
    assert!(
        v_deep < v_notched,
        "Deeper notch: V={:.2} < {:.2} kN", v_deep, v_notched
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Glulam Volume Factor (NDS §5.3.6)
// ═══════════════════════════════════════════════════════════════
//
// Volume factor CV for structural glued-laminated timber:
//   CV = KL × (5.125/b)^(1/x) × (12/d)^(1/x) × (21/L)^(1/x)
//   where x = 10 for Western species, KL = loading factor
//
// For uniform load KL = 1.0 (effectively, adjusted by load shape).
// Dimensions in inches: b (width), d (depth), L (length in feet).
//
// Example: 171 × 600 mm (6.73 × 23.6 in), span 9 m (29.5 ft):
//   CV = 1.0 × (5.125/6.73)^0.1 × (12/23.6)^0.1 × (21/29.5)^0.1
//      = 0.7615^0.1 × 0.5085^0.1 × 0.7119^0.1
//      = 0.9729 × 0.9344 × 0.9662
//      = 0.878

#[test]
fn wood_glulam_volume_factor() {
    // Dimensions in mm → convert to inches
    let b_mm: f64 = 171.0;
    let d_mm: f64 = 600.0;
    let l_mm: f64 = 9_000.0;

    let b_in: f64 = b_mm / 25.4;   // 6.732 in
    let d_in: f64 = d_mm / 25.4;   // 23.622 in
    let l_ft: f64 = l_mm / 304.8;  // 29.53 ft

    let x: f64 = 10.0; // Western species
    let kl: f64 = 1.0;  // uniform loading

    // Volume factor components
    let cv_b: f64 = (5.125 / b_in).powf(1.0 / x);
    let cv_d: f64 = (12.0 / d_in).powf(1.0 / x);
    let cv_l: f64 = (21.0 / l_ft).powf(1.0 / x);

    let cv: f64 = kl * cv_b * cv_d * cv_l;
    let cv_expected: f64 = 0.878;
    assert!(
        (cv - cv_expected).abs() / cv_expected < 0.02,
        "CV = {:.3}, expected {:.3}", cv, cv_expected
    );

    // CV ≤ 1.0 always (volume effect reduces capacity)
    assert!(
        cv <= 1.0,
        "Volume factor must be ≤ 1.0: CV = {:.3}", cv
    );

    // Smaller member → CV closer to 1.0
    let b_small: f64 = 130.0 / 25.4;
    let d_small: f64 = 300.0 / 25.4;
    let l_short: f64 = 5_000.0 / 304.8;
    let cv_small: f64 = kl * (5.125 / b_small).powf(1.0 / x)
        * (12.0 / d_small).powf(1.0 / x)
        * (21.0 / l_short).powf(1.0 / x);
    assert!(
        cv_small > cv,
        "Smaller beam CV={:.3} > large beam CV={:.3}", cv_small, cv
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Moisture Content Adjustment Factors (NDS §4.3.3)
// ═══════════════════════════════════════════════════════════════
//
// Wet service factor CM (NDS Table 4.3.1 for sawn lumber):
//   Fb: CM = 0.85 (if Fb·CF ≤ 7.93 MPa) or 1.0
//   Ft: CM = 1.0
//   Fv: CM = 0.97
//   Fc_perp: CM = 0.67
//   Fc_parallel: CM = 0.8 (if Fc·CF ≤ 5.17 MPa) or 1.0
//   E: CM = 0.9
//   Emin: CM = 0.9
//
// Example: MC = 22% (wet service), Douglas Fir-Larch Select Structural
//   Fb = 8.27 MPa → Fb' = 8.27 × 0.85 = 7.03 MPa
//   Fv = 1.0 MPa → Fv' = 1.0 × 0.97 = 0.97 MPa
//   Fc_perp = 4.31 MPa → Fc_perp' = 4.31 × 0.67 = 2.89 MPa
//   E = 12,400 MPa → E' = 12,400 × 0.9 = 11,160 MPa

#[test]
fn wood_moisture_content_adjustment() {
    // Reference design values — Douglas Fir-Larch Select Structural
    let fb: f64 = 8.27;         // MPa
    let fv: f64 = 1.0;          // MPa
    let fc_perp: f64 = 4.31;    // MPa
    let e_mod: f64 = 12_400.0;  // MPa

    // Wet service factors (MC > 19%)
    let cm_fb: f64 = 0.85;
    let cm_fv: f64 = 0.97;
    let cm_fc_perp: f64 = 0.67;
    let cm_e: f64 = 0.9;

    // Adjusted values
    let fb_wet: f64 = fb * cm_fb;
    let fb_wet_expected: f64 = 7.03;
    assert!(
        (fb_wet - fb_wet_expected).abs() / fb_wet_expected < 0.01,
        "Fb' = {:.2} MPa, expected {:.2}", fb_wet, fb_wet_expected
    );

    let fv_wet: f64 = fv * cm_fv;
    assert!(
        (fv_wet - 0.97).abs() < 0.001,
        "Fv' = {:.3} MPa, expected 0.970", fv_wet
    );

    let fc_perp_wet: f64 = fc_perp * cm_fc_perp;
    let fc_perp_wet_expected: f64 = 2.89;
    assert!(
        (fc_perp_wet - fc_perp_wet_expected).abs() / fc_perp_wet_expected < 0.01,
        "Fc_perp' = {:.2} MPa, expected {:.2}", fc_perp_wet, fc_perp_wet_expected
    );

    let e_wet: f64 = e_mod * cm_e;
    let e_wet_expected: f64 = 11_160.0;
    assert!(
        (e_wet - e_wet_expected).abs() / e_wet_expected < 0.001,
        "E' = {:.0} MPa, expected {:.0}", e_wet, e_wet_expected
    );

    // Perpendicular compression is most affected
    let max_reduction: f64 = 1.0 - cm_fc_perp;  // 33%
    assert!(
        max_reduction > (1.0 - cm_fb),
        "Fc_perp most affected by moisture: {:.0}% reduction", max_reduction * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Wood-Concrete Composite Flexural Capacity (Gamma Method, EC5 Annex B)
// ═══════════════════════════════════════════════════════════════
//
// Effective bending stiffness (EI)eff per EC5 Annex B:
//   (EI)_eff = E1·I1 + E2·I2 + γ1·E1·A1·a1² + E2·A2·a2²
//
// Connection efficiency factor γ (gamma):
//   γ1 = 1 / (1 + π²·E1·A1·s / (K·L²))
//   where K = connection slip modulus, s = fastener spacing, L = span
//
// Example: Timber 140×200 mm, concrete 600×80 mm, span 5 m
//   E_timber = 11,000 MPa, E_concrete = 30,000 MPa
//   K = 10,000 N/mm (screw connection), s = 200 mm spacing
//   A1 (concrete) = 600×80 = 48,000 mm², I1 = 600×80³/12 = 25.6×10⁶ mm⁴
//   A2 (timber) = 140×200 = 28,000 mm², I2 = 140×200³/12 = 93.33×10⁶ mm⁴

#[test]
fn wood_concrete_composite_flexural_capacity() {
    // Concrete slab (element 1)
    let b_c: f64 = 600.0;        // mm, effective width
    let h_c: f64 = 80.0;         // mm, slab thickness
    let e_c: f64 = 30_000.0;     // MPa
    let a1: f64 = b_c * h_c;     // 48,000 mm²
    let i1: f64 = b_c * h_c.powi(3) / 12.0; // 25.6×10⁶ mm⁴

    // Timber beam (element 2)
    let b_t: f64 = 140.0;
    let h_t: f64 = 200.0;
    let e_t: f64 = 11_000.0;     // MPa
    let a2: f64 = b_t * h_t;     // 28,000 mm²
    let i2: f64 = b_t * h_t.powi(3) / 12.0; // 93.33×10⁶ mm⁴

    // Connection
    let k_conn: f64 = 10_000.0;  // N/mm, slip modulus
    let s: f64 = 200.0;          // mm, fastener spacing
    let l: f64 = 5_000.0;        // mm, span

    // Gamma factor for concrete (element 1)
    let gamma1: f64 = 1.0 / (1.0 + std::f64::consts::PI.powi(2) * e_c * a1 * s / (k_conn * l * l));
    assert!(
        gamma1 > 0.0 && gamma1 < 1.0,
        "γ₁ = {:.4} must be between 0 and 1", gamma1
    );

    // Distance between centroids
    let h_total: f64 = h_c + h_t; // Total depth = 280 mm
    let r: f64 = h_total / 2.0;   // distance between centroids = 140 mm

    // Neutral axis position from timber centroid (element 2)
    let a2_star: f64 = gamma1 * e_c * a1 + e_t * a2;
    let a2_dist: f64 = gamma1 * e_c * a1 * r / a2_star;
    let a1_dist: f64 = r - a2_dist;

    // Effective bending stiffness
    let ei_eff: f64 = e_c * i1 + e_t * i2
        + gamma1 * e_c * a1 * a1_dist * a1_dist
        + e_t * a2 * a2_dist * a2_dist;

    // Fully composite stiffness (γ = 1)
    let a2_dist_full: f64 = e_c * a1 * r / (e_c * a1 + e_t * a2);
    let a1_dist_full: f64 = r - a2_dist_full;
    let ei_full: f64 = e_c * i1 + e_t * i2
        + e_c * a1 * a1_dist_full * a1_dist_full
        + e_t * a2 * a2_dist_full * a2_dist_full;

    // Non-composite stiffness (γ = 0)
    let ei_non: f64 = e_c * i1 + e_t * i2;

    // Partial composite: must be between non-composite and fully composite
    assert!(
        ei_eff > ei_non && ei_eff < ei_full,
        "EI_eff={:.2e} must be between EI_non={:.2e} and EI_full={:.2e}",
        ei_eff, ei_non, ei_full
    );

    // Composite efficiency
    let efficiency: f64 = (ei_eff - ei_non) / (ei_full - ei_non);
    assert!(
        efficiency > 0.0 && efficiency < 1.0,
        "Composite efficiency = {:.1}%", efficiency * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Cross-Laminated Timber (CLT) Panel Bending (Gamma Method)
// ═══════════════════════════════════════════════════════════════
//
// CLT panel with 5 layers (3 longitudinal, 2 transverse):
//   Layer thicknesses: 40-20-40-20-40 mm (total 160 mm)
//   Only longitudinal layers contribute to major-axis bending.
//
// Effective section properties (simplified shear analogy method):
//   (EI)_eff = Σ (Ei·Ii + γi·Ei·Ai·zi²) for longitudinal layers
//
// For strong axis (simplified): consider only parallel layers.
//   Parallel layers: 1 (bottom), 3 (middle), 5 (top)
//   z1 = −60 mm, z3 = 0, z5 = +60 mm (from centroid)
//   E_long = 11,000 MPa (longitudinal E for spruce)
//   E_trans = 370 MPa (rolling shear E, ≈ E_long/30)
//
// (EI)_eff ≈ E_long × [3×(b×40³/12) + 2×(b×40)×60²]
//          per 1m width (b=1000mm):
//          = 11000 × [3×(1000×40³/12) + 2×(1000×40)×3600]
//          = 11000 × [3×5.333×10⁶ + 288×10⁶]
//          = 11000 × [16.0×10⁶ + 288.0×10⁶]
//          = 11000 × 304.0×10⁶ = 3.344 × 10¹² N·mm²/m

#[test]
fn wood_clt_panel_bending() {
    let b: f64 = 1_000.0;       // mm, unit width (per metre)
    let t_long: f64 = 40.0;     // mm, longitudinal layer thickness
    let t_trans: f64 = 20.0;    // mm, transverse layer thickness
    let e_long: f64 = 11_000.0; // MPa, E parallel to grain
    let _e_trans: f64 = 370.0;  // MPa, E perpendicular (rolling shear)

    // Total CLT depth: 5 layers
    let h_total: f64 = 3.0 * t_long + 2.0 * t_trans; // 160 mm
    assert!(
        (h_total - 160.0).abs() < 0.01,
        "Total depth = {:.0} mm", h_total
    );

    // Centroid at mid-height = 80 mm from bottom
    let centroid: f64 = h_total / 2.0;

    // Distances from centroid to longitudinal layer centroids:
    // Layer 1 (bottom): center at 20 mm → z1 = 20 − 80 = −60 mm
    // Layer 3 (middle): center at 80 mm → z3 = 0 mm
    // Layer 5 (top): center at 140 mm → z5 = +60 mm
    let z1: f64 = (t_long / 2.0) - centroid;               // -60
    let z3: f64 = (t_long + t_trans + t_long / 2.0) - centroid; // 0
    let z5: f64 = (2.0 * t_long + 2.0 * t_trans + t_long / 2.0) - centroid; // +60

    assert!(
        (z1 - (-60.0)).abs() < 0.01,
        "z1 = {:.1} mm", z1
    );
    assert!(
        z3.abs() < 0.01,
        "z3 = {:.1} mm (at centroid)", z3
    );
    assert!(
        (z5 - 60.0).abs() < 0.01,
        "z5 = {:.1} mm", z5
    );

    // Moment of inertia of each longitudinal layer about its own centroid
    let i_layer: f64 = b * t_long.powi(3) / 12.0; // mm⁴
    let a_layer: f64 = b * t_long;                  // mm²

    // Effective EI (parallel layers only, γ=1 for bonded CLT)
    let ei_eff: f64 = e_long * (
        3.0 * i_layer                             // self-inertia of 3 layers
        + a_layer * (z1 * z1 + z3 * z3 + z5 * z5) // parallel axis terms
    );

    let ei_expected: f64 = 3.344e12;  // N·mm²/m
    assert!(
        (ei_eff - ei_expected).abs() / ei_expected < 0.01,
        "(EI)_eff = {:.3e} N·mm²/m, expected {:.3e}", ei_eff, ei_expected
    );

    // Compare to solid timber panel of same depth
    let i_solid: f64 = b * h_total.powi(3) / 12.0;
    let ei_solid: f64 = e_long * i_solid;

    // CLT is less stiff than solid timber of same depth (transverse layers don't contribute)
    assert!(
        ei_eff < ei_solid,
        "CLT (EI)={:.2e} < solid (EI)={:.2e}", ei_eff, ei_solid
    );

    // Efficiency ratio
    let ratio: f64 = ei_eff / ei_solid;
    assert!(
        ratio > 0.5 && ratio < 1.0,
        "CLT/solid stiffness ratio = {:.3}", ratio
    );
}
