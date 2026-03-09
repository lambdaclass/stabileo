/// Validation: Advanced Concrete Design Formulas
///
/// References:
///   - ACI 318-19: "Building Code Requirements for Structural Concrete"
///   - EN 1992-1-1 (EC2): "Design of Concrete Structures"
///   - ACI 209R-92: "Prediction of Creep, Shrinkage, and Temperature Effects"
///   - Wight & MacGregor: "Reinforced Concrete: Mechanics and Design" 7th ed.
///   - Nawy: "Prestressed Concrete" 5th ed.
///   - Schlaich, Schafer & Jennewein: "Toward a Consistent Design of Structural
///     Concrete", PCI Journal 32(3), 1987
///
/// Tests verify advanced concrete design formulas with hand-computed values.
/// No solver calls -- pure arithmetic verification of analytical expressions.

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
// 1. Strut-and-Tie: Nodal Zone Strength (ACI 318-19 Ch. 23)
// ================================================================
//
// Effective compressive strength of nodal zones (ACI 318-19 Table 23.9.2):
//   CCC node: f_ce = 0.85 * beta_n * f'c,  beta_n = 1.0
//   CCT node: f_ce = 0.85 * beta_n * f'c,  beta_n = 0.80
//   CTT node: f_ce = 0.85 * beta_n * f'c,  beta_n = 0.60
//
// For f'c = 35 MPa:
//   CCC: f_ce = 0.85 * 1.0 * 35 = 29.75 MPa
//   CCT: f_ce = 0.85 * 0.80 * 35 = 23.80 MPa
//   CTT: f_ce = 0.85 * 0.60 * 35 = 17.85 MPa

#[test]
fn validation_strut_and_tie_nodal_zones() {
    let fc: f64 = 35.0; // MPa

    // Node type factors (ACI 318-19 Table 23.9.2)
    let beta_ccc: f64 = 1.0;
    let beta_cct: f64 = 0.80;
    let beta_ctt: f64 = 0.60;

    // Effective compressive strengths
    let fce_ccc: f64 = 0.85 * beta_ccc * fc;
    let fce_cct: f64 = 0.85 * beta_cct * fc;
    let fce_ctt: f64 = 0.85 * beta_ctt * fc;

    assert_close(fce_ccc, 29.75, 0.001, "CCC nodal zone strength");
    assert_close(fce_cct, 23.80, 0.001, "CCT nodal zone strength");
    assert_close(fce_ctt, 17.85, 0.001, "CTT nodal zone strength");

    // Ordering: CCC > CCT > CTT
    assert!(fce_ccc > fce_cct, "CCC stronger than CCT");
    assert!(fce_cct > fce_ctt, "CCT stronger than CTT");

    // Strut effective strength (bottle-shaped, with reinforcement): beta_s = 0.75
    let beta_s: f64 = 0.75;
    let fce_strut: f64 = 0.85 * beta_s * fc;
    assert_close(fce_strut, 0.85 * 0.75 * 35.0, 0.001, "Strut strength");

    // Node capacity: Fn = f_ce * A_nz
    let a_nz: f64 = 200.0 * 300.0; // mm^2, nodal zone area (200mm x 300mm)
    let fn_ccc: f64 = fce_ccc * a_nz / 1000.0; // kN
    let fn_cct: f64 = fce_cct * a_nz / 1000.0;
    assert!(fn_ccc > fn_cct, "CCC node capacity > CCT node capacity");
    assert!(fn_ccc > 0.0, "Node capacity is positive");

    let _ = PI; // acknowledge import
}

// ================================================================
// 2. Deep Beam Shear Strength: a/d < 2 (ACI 318-19 Ch. 9.9)
// ================================================================
//
// For deep beams (a/d < 2), shear strength is enhanced.
// ACI 318 limits: Vn <= 10*sqrt(f'c)*b*d (ACI upper limit)
//
// Strut-and-tie approach:
//   V_strut = f_ce * b * w_s * sin(theta_s)
//   where w_s = strut width, theta_s = strut angle
//
// For a/d = 1.5, d = 800 mm, b = 400 mm, f'c = 30 MPa:
//   theta_s = atan(d/a) = atan(800/1200) = 33.69 deg

#[test]
fn validation_deep_beam_shear() {
    let fc: f64 = 30.0;      // MPa
    let b: f64 = 400.0;      // mm
    let d: f64 = 800.0;      // mm
    let a: f64 = 1200.0;     // mm (shear span)
    let a_over_d: f64 = a / d;

    assert_close(a_over_d, 1.5, 0.001, "a/d ratio");
    assert!(a_over_d < 2.0, "Deep beam: a/d < 2");

    // Strut angle
    let theta_s: f64 = (d / a).atan();
    let theta_deg: f64 = theta_s * 180.0 / PI;
    assert_close(theta_deg, 33.69, 0.01, "Strut angle (degrees)");

    // ACI upper limit on Vn
    let vn_max: f64 = 10.0 * fc.sqrt() * b * d / 1000.0; // kN
    let expected_vn_max: f64 = 10.0 * 30.0_f64.sqrt() * 400.0 * 800.0 / 1000.0;
    assert_close(vn_max, expected_vn_max, 0.001, "ACI Vn upper limit");

    // Concrete contribution to shear (simplified for deep beams)
    // Vc = 0.17*lambda*sqrt(f'c)*b*d * max(2.5 - a/d, 1.0) (enhanced for deep beams)
    // When a/d < 1.5 the enhancement exceeds 1.0; at a/d = 1.5 it equals 1.0
    let enhancement: f64 = (2.5 - a_over_d).max(1.0);
    let vc: f64 = 0.17 * 1.0 * fc.sqrt() * b * d * enhancement / 1000.0; // kN
    assert!(vc > 0.0, "Concrete shear contribution is positive");
    assert!(enhancement >= 1.0, "Enhancement factor >= 1 for a/d <= 2.5");

    // Strut capacity
    let beta_s: f64 = 0.75; // bottle-shaped strut
    let fce_strut: f64 = 0.85 * beta_s * fc;
    let w_s: f64 = 150.0; // mm, strut width (from node geometry)
    let v_strut: f64 = fce_strut * b * w_s * theta_s.sin() / 1000.0; // kN
    assert!(v_strut > 0.0, "Strut shear capacity is positive");

    // phi factor for shear in strut-and-tie: 0.75
    let phi: f64 = 0.75;
    let phi_vn: f64 = phi * v_strut;
    assert!(phi_vn < vn_max, "Design strength < upper limit");
}

// ================================================================
// 3. Torsion Design: Threshold and Cracking Torsion (ACI 318-19 Ch. 22.7)
// ================================================================
//
// Threshold torsion (below which torsion can be neglected):
//   T_th = phi * lambda * sqrt(f'c) * (Acp^2/pcp) / 12
//
// Cracking torsion:
//   T_cr = lambda * sqrt(f'c) * (Acp^2/pcp) / 3
//
// Rectangular section 400x600 mm:
//   Acp = 400*600 = 240,000 mm^2
//   pcp = 2*(400+600) = 2000 mm

#[test]
fn validation_torsion_design() {
    let fc: f64 = 35.0;       // MPa
    let b_w: f64 = 400.0;     // mm
    let h: f64 = 600.0;       // mm
    let phi_torsion: f64 = 0.75;
    let lambda: f64 = 1.0;    // normal weight concrete

    // Section properties
    let acp: f64 = b_w * h;
    let pcp: f64 = 2.0 * (b_w + h);

    assert_close(acp, 240_000.0, 0.001, "Acp");
    assert_close(pcp, 2000.0, 0.001, "pcp");

    // Threshold torsion (ACI 318-19 Eq. 22.7.4.1)
    let t_th: f64 = phi_torsion * lambda * fc.sqrt() * (acp * acp / pcp) / 12.0;
    // Units: MPa^0.5 * mm^4 / mm = MPa^0.5 * mm^3 -> need to convert to kN*m
    // Actually: sqrt(fc) in MPa = sqrt(fc) in N/mm^2
    // T_th = phi * lambda * sqrt(35) * (240000^2/2000) / 12
    //      = 0.75 * 1.0 * 5.916 * 28800000000/2000 / 12
    //      -- let's compute in N*mm then convert
    let acp2_pcp: f64 = acp * acp / pcp;
    assert_close(acp2_pcp, 2.88e7, 0.001, "Acp^2/pcp");

    let t_th_nmm: f64 = phi_torsion * lambda * fc.sqrt() * acp2_pcp / 12.0;
    let t_th_knm: f64 = t_th_nmm / 1e6; // N*mm to kN*m

    assert!(t_th_knm > 0.0, "Threshold torsion is positive");

    // Cracking torsion
    let t_cr_nmm: f64 = lambda * fc.sqrt() * acp2_pcp / 3.0;
    let t_cr_knm: f64 = t_cr_nmm / 1e6;

    // T_cr = 4 * T_th / phi (since T_th = phi * T_cr / 4)
    assert_close(t_cr_nmm, 4.0 * t_th_nmm / phi_torsion, 0.001, "T_cr = 4*T_th/phi");

    // T_cr > T_th always
    assert!(t_cr_knm > t_th_knm, "Cracking torsion > threshold torsion");

    // Required stirrup spacing for torsion
    // Ao = 0.85 * Aoh where Aoh is area enclosed by centerline of outermost closed stirrups
    let cover: f64 = 40.0; // mm
    let stirrup_dia: f64 = 10.0; // mm
    let x0: f64 = b_w - 2.0 * cover - stirrup_dia;
    let y0: f64 = h - 2.0 * cover - stirrup_dia;
    let aoh: f64 = x0 * y0;
    let a_o: f64 = 0.85 * aoh;

    assert!(a_o > 0.0, "Ao is positive");
    assert!(a_o < acp, "Ao < Acp");

    let _ = t_th;
    let _ = PI;
}

// ================================================================
// 4. Post-Tensioned Slab: Load Balancing Method
// ================================================================
//
// Parabolic tendon in a simply supported beam:
//   Balanced load: w_b = 8*P*e / L^2
//   where P = prestress force, e = eccentricity at midspan, L = span
//
// For P = 1200 kN, e = 150 mm = 0.15 m, L = 10 m:
//   w_b = 8*1200*0.15/100 = 14.4 kN/m

#[test]
fn validation_post_tensioned_load_balancing() {
    let p: f64 = 1200.0;     // kN, prestress force
    let e: f64 = 0.15;       // m, tendon eccentricity at midspan
    let l: f64 = 10.0;       // m, span length

    // Balanced load from parabolic tendon
    let w_b: f64 = 8.0 * p * e / (l * l);
    let expected_wb: f64 = 8.0 * 1200.0 * 0.15 / 100.0;
    assert_close(w_b, expected_wb, 0.001, "Balanced load w_b");
    assert_close(w_b, 14.4, 0.001, "w_b = 14.4 kN/m");

    // Net load on slab = applied - balanced
    let w_applied: f64 = 20.0; // kN/m (dead + live)
    let w_net: f64 = w_applied - w_b;
    assert_close(w_net, 5.6, 0.001, "Net load after balancing");

    // Midspan moment from net load (simply supported)
    let m_net: f64 = w_net * l * l / 8.0;
    assert_close(m_net, 5.6 * 100.0 / 8.0, 0.001, "Net moment at midspan");

    // Full dead load balanced: if w_b = w_dead
    let w_dead: f64 = 14.4; // kN/m (matches balanced load)
    let w_live: f64 = 5.6;
    let m_dead_balanced: f64 = (w_dead - w_b) * l * l / 8.0;
    assert!((m_dead_balanced).abs() < 0.01, "Dead load fully balanced -> M_dead ~ 0");

    // Only live load produces moment
    let m_live: f64 = w_live * l * l / 8.0;
    assert_close(m_live, m_net, 0.001, "Net moment = live load moment");

    // Tendon drape: y(x) = 4*e*x*(L-x)/L^2 (parabolic profile)
    let x_quarter: f64 = l / 4.0;
    let y_quarter: f64 = 4.0 * e * x_quarter * (l - x_quarter) / (l * l);
    assert_close(y_quarter, 0.75 * e, 0.001, "Tendon drape at quarter span");

    // At midspan: y = e
    let y_mid: f64 = 4.0 * e * (l / 2.0) * (l / 2.0) / (l * l);
    assert_close(y_mid, e, 0.001, "Tendon drape at midspan = e");

    let _ = PI;
}

// ================================================================
// 5. Creep Coefficient: EC2 Model (phi_28, phi_infinity)
// ================================================================
//
// EC2 (EN 1992-1-1) Annex B creep model:
//   phi(t,t0) = phi_0 * beta_c(t,t0)
//   phi_0 = phi_RH * beta(fcm) * beta(t0)
//
// phi_RH = 1 + (1-RH/100)/(0.1*h0^(1/3))  for fcm <= 35 MPa
// beta(fcm) = 16.8 / sqrt(fcm)
// beta(t0) = 1 / (0.1 + t0^0.20)
// h0 = 2*Ac/u (notional size)
//
// For RH=50%, h0=300mm, fcm=38 MPa, t0=28 days:

#[test]
fn validation_ec2_creep_coefficient() {
    let rh: f64 = 50.0;       // %
    let h0: f64 = 300.0;      // mm, notional size
    let fcm: f64 = 38.0;      // MPa, mean compressive strength
    let t0: f64 = 28.0;       // days, age at loading

    // phi_RH factor (EC2 Eq. B.3a, for fcm <= 35 use B.3a, else B.3b)
    // For fcm > 35: phi_RH = (1 + (1-RH/100)/(0.1*h0^(1/3)) * alpha_1) * alpha_2
    let alpha_1: f64 = (35.0 / fcm).powf(0.7);
    let alpha_2: f64 = (35.0 / fcm).powf(0.2);

    let phi_rh: f64 = (1.0 + (1.0 - rh / 100.0) / (0.1 * h0.powf(1.0 / 3.0)) * alpha_1) * alpha_2;

    // beta(fcm)
    let beta_fcm: f64 = 16.8 / fcm.sqrt();
    assert_close(beta_fcm, 16.8 / 38.0_f64.sqrt(), 0.001, "beta(fcm)");

    // beta(t0)
    let beta_t0: f64 = 1.0 / (0.1 + t0.powf(0.20));
    assert_close(beta_t0, 1.0 / (0.1 + 28.0_f64.powf(0.2)), 0.001, "beta(t0)");

    // Notional creep coefficient
    let phi_0: f64 = phi_rh * beta_fcm * beta_t0;
    assert!(phi_0 > 1.0, "Creep coefficient > 1 for typical conditions");
    assert!(phi_0 < 5.0, "Creep coefficient < 5 (reasonable range)");

    // Time development: beta_c(t,t0) = ((t-t0)/(beta_H + t - t0))^0.3
    let beta_h: f64 = 1.5 * (1.0 + (0.012 * rh).powf(18.0)) * h0 + 250.0;
    let beta_h_capped: f64 = beta_h.min(1500.0);

    // At t = 10000 days (~ 27 years), close to final value
    let t: f64 = 10000.0;
    let beta_c: f64 = ((t - t0) / (beta_h_capped + t - t0)).powf(0.3);
    assert!(beta_c > 0.9, "beta_c near 1.0 at long time");
    assert!(beta_c <= 1.0, "beta_c <= 1.0");

    // phi at time t
    let phi_t: f64 = phi_0 * beta_c;
    assert!(phi_t > 0.0, "Creep coefficient at time t is positive");
    assert!(phi_t <= phi_0 + 0.01, "phi(t) <= phi_0 (approaches from below)");

    // Earlier loading (lower t0) gives higher creep
    let t0_early: f64 = 7.0;
    let beta_t0_early: f64 = 1.0 / (0.1 + t0_early.powf(0.20));
    assert!(beta_t0_early > beta_t0, "Earlier loading -> higher beta(t0)");

    let _ = PI;
}

// ================================================================
// 6. Shrinkage Strain: ACI 209 Model with Correction Factors
// ================================================================
//
// ACI 209R-92 shrinkage model:
//   epsilon_sh(t) = (t/(f + t)) * epsilon_sh_u
//
// where f = 35 (moist cured) or 55 (steam cured)
// epsilon_sh_u = 780e-6 * gamma_sh (ultimate shrinkage)
//
// Correction factors gamma_sh:
//   gamma_cp = 1.0 (for 7-day moist cure)
//   gamma_rh = 1.40 - 0.01*H  for 40 <= H <= 80
//   gamma_vs = 1.2 * exp(-0.12 * V/S)
//   gamma_s  = 0.89 + 0.00161 * slump_mm
//   gamma_cc = 0.75 + 0.00061 * cement_content
//   gamma_alpha = 0.95 + 0.008 * air_content

#[test]
fn validation_aci209_shrinkage() {
    let t: f64 = 365.0;       // days after end of curing
    let f_factor: f64 = 35.0; // moist cured
    let eps_sh_u_base: f64 = 780e-6; // base ultimate shrinkage

    // Correction factors
    let rh: f64 = 60.0;       // % relative humidity
    let gamma_rh: f64 = 1.40 - 0.01 * rh;
    assert_close(gamma_rh, 0.80, 0.001, "gamma_RH for 60% humidity");

    let v_s: f64 = 75.0;      // mm, volume/surface ratio
    let gamma_vs: f64 = 1.2 * (-0.12 * v_s / 25.4).exp(); // V/S in inches: 75/25.4
    // Note: ACI 209 uses V/S in inches -> v_s_in = 75/25.4 = 2.953
    let v_s_in: f64 = v_s / 25.4;
    let gamma_vs_correct: f64 = 1.2 * (-0.12 * v_s_in).exp();
    assert_close(gamma_vs, gamma_vs_correct, 0.001, "gamma_VS");

    let slump_mm: f64 = 100.0; // mm
    let gamma_s: f64 = 0.89 + 0.00161 * slump_mm;
    assert_close(gamma_s, 0.89 + 0.161, 0.001, "gamma_s for 100mm slump");

    let cement_content: f64 = 350.0; // kg/m^3
    let gamma_cc: f64 = 0.75 + 0.00061 * cement_content;
    assert_close(gamma_cc, 0.75 + 0.2135, 0.001, "gamma_cc for 350 kg/m^3");

    let air_content: f64 = 4.0; // %
    let gamma_alpha: f64 = 0.95 + 0.008 * air_content;
    assert_close(gamma_alpha, 0.982, 0.001, "gamma_alpha for 4% air");

    // Combined correction factor
    let gamma_sh: f64 = gamma_rh * gamma_vs_correct * gamma_s * gamma_cc * gamma_alpha;
    assert!(gamma_sh > 0.0, "Combined correction factor is positive");

    // Ultimate shrinkage strain
    let eps_sh_u: f64 = eps_sh_u_base * gamma_sh;

    // Time-dependent shrinkage
    let eps_sh_t: f64 = (t / (f_factor + t)) * eps_sh_u;

    // At t = 365 days: t/(35+t) = 365/400 = 0.9125
    let time_factor: f64 = t / (f_factor + t);
    assert_close(time_factor, 365.0 / 400.0, 0.001, "Time development factor");

    assert!(eps_sh_t > 0.0, "Shrinkage strain is positive");
    assert!(eps_sh_t < eps_sh_u, "Shrinkage at 1 year < ultimate");
    assert!(eps_sh_t < 1000e-6, "Shrinkage < 1000 microstrain (reasonable)");

    let _ = PI;
}

// ================================================================
// 7. Two-Way Slab Direct Design: Static Moment Distribution
// ================================================================
//
// ACI 318-19 Ch. 8: Direct Design Method for two-way slabs
//
// Total static moment per span:
//   Mo = w_u * L2 * Ln^2 / 8
//
// Distribution:
//   Negative moment at face of support: 0.65 * Mo (interior span)
//   Positive moment at midspan: 0.35 * Mo
//
// Column strip takes: 75% of negative, 60% of positive (typical)
// Middle strip takes remainder.

#[test]
fn validation_two_way_slab_direct_design() {
    let w_u: f64 = 12.0;      // kN/m^2, factored load
    let l1: f64 = 6.0;        // m, span in direction of analysis
    let l2: f64 = 5.0;        // m, span perpendicular to analysis
    let support_width: f64 = 0.4; // m, column dimension

    // Clear span
    let ln: f64 = l1 - support_width;
    assert_close(ln, 5.6, 0.001, "Clear span Ln");

    // Total static moment (ACI 318-19 Eq. 8.10.3.2)
    let m_o: f64 = w_u * l2 * ln * ln / 8.0;
    let expected_mo: f64 = 12.0 * 5.0 * 5.6 * 5.6 / 8.0;
    assert_close(m_o, expected_mo, 0.001, "Total static moment Mo");

    // Interior span distribution (ACI 318-19 Table 8.10.4.2)
    let f_neg: f64 = 0.65; // fraction to negative moment
    let f_pos: f64 = 0.35; // fraction to positive moment

    let m_neg: f64 = f_neg * m_o;
    let m_pos: f64 = f_pos * m_o;

    // Sum of negative + positive = Mo
    assert_close(m_neg + m_pos, m_o, 0.001, "Neg + Pos = Mo");

    // Column strip distribution (ACI 318-19 Table 8.10.5.1/5.5)
    let cs_neg_frac: f64 = 0.75; // column strip takes 75% of negative
    let cs_pos_frac: f64 = 0.60; // column strip takes 60% of positive

    let m_neg_cs: f64 = cs_neg_frac * m_neg;
    let m_neg_ms: f64 = (1.0 - cs_neg_frac) * m_neg;
    let m_pos_cs: f64 = cs_pos_frac * m_pos;
    let m_pos_ms: f64 = (1.0 - cs_pos_frac) * m_pos;

    // Column strip negative > column strip positive
    assert!(m_neg_cs > m_pos_cs, "CS negative > CS positive");

    // Middle strip gets remainder
    assert_close(m_neg_cs + m_neg_ms, m_neg, 0.001, "CS + MS = total negative");
    assert_close(m_pos_cs + m_pos_ms, m_pos, 0.001, "CS + MS = total positive");

    // Total distributed = Mo
    let total: f64 = m_neg_cs + m_neg_ms + m_pos_cs + m_pos_ms;
    assert_close(total, m_o, 0.001, "Total distributed moment = Mo");

    // Column strip width = min(L1, L2)/2 per side (total = L2/2 or L1/4 each side)
    let cs_width: f64 = l2 / 2.0; // simplified
    assert_close(cs_width, 2.5, 0.001, "Column strip width");

    let _ = PI;
}

// ================================================================
// 8. Corbel Design: Shear Friction Model (ACI 318-19 Ch. 16.5)
// ================================================================
//
// Corbel supporting a beam reaction:
//   Vu = applied factored vertical load
//   Nuc = factored horizontal tensile force (>= 0.2*Vu)
//   a/d <= 1.0 (short bracket)
//
// Shear friction: Vn = mu * Avf * fy
//   where mu = 1.4 (concrete placed monolithically)
//
// Primary tension reinforcement:
//   Af = Mu / (phi * fy * d * (1 - a/(2d)))   -- simplified flexure
//   An = Nuc / (phi * fy)
//   As = max(Af + An, 2/3*Avf + An)
//
// Minimum: As >= 0.04*(f'c/fy)*b*d

#[test]
fn validation_corbel_shear_friction() {
    let vu: f64 = 400.0;      // kN, factored vertical load
    let a_v: f64 = 150.0;     // mm, distance from load to face of column
    let d: f64 = 450.0;       // mm, effective depth
    let b: f64 = 350.0;       // mm, corbel width
    let fc: f64 = 35.0;       // MPa
    let fy: f64 = 420.0;      // MPa
    let phi: f64 = 0.75;      // strength reduction factor

    // Check a/d ratio
    let a_over_d: f64 = a_v / d;
    assert!(a_over_d <= 1.0, "a/d <= 1.0 for corbel");
    assert_close(a_over_d, 150.0 / 450.0, 0.001, "a/d ratio");

    // Horizontal tensile force (minimum)
    let nuc: f64 = 0.2 * vu;
    assert_close(nuc, 80.0, 0.001, "Nuc = 0.2*Vu");

    // Shear friction reinforcement
    let mu: f64 = 1.4; // monolithic concrete
    let avf: f64 = vu * 1000.0 / (phi * fy * mu); // mm^2
    let expected_avf: f64 = 400_000.0 / (0.75 * 420.0 * 1.4);
    assert_close(avf, expected_avf, 0.001, "Avf shear friction reinforcement");

    // Flexural reinforcement
    let _mu_moment: f64 = vu * a_v / 1000.0; // kN*mm -> kN*m? No, keep in kN*mm for consistency
    // Mu = Vu * a = 400 * 150 = 60,000 kN*mm = 60 kN*m
    let mu_knmm: f64 = vu * a_v; // kN*mm
    assert_close(mu_knmm, 60_000.0, 0.001, "Mu = Vu*a in kN*mm");

    let af: f64 = mu_knmm * 1000.0 / (phi * fy * d); // mm^2 (simplified, ignoring compression block)
    // Af = 60,000,000 N*mm / (0.75 * 420 * 450) = 60e6 / 141750 = 423.3 mm^2
    let expected_af: f64 = 60e6 / (0.75 * 420.0 * 450.0);
    assert_close(af, expected_af, 0.001, "Af flexural reinforcement");

    // Tension tie reinforcement
    let an: f64 = nuc * 1000.0 / (phi * fy); // mm^2
    let expected_an: f64 = 80_000.0 / (0.75 * 420.0);
    assert_close(an, expected_an, 0.001, "An tension tie reinforcement");

    // Total primary reinforcement (ACI 318-19 Eq. 16.5.4.4)
    let as_1: f64 = af + an;
    let as_2: f64 = 2.0 / 3.0 * avf + an;
    let as_req: f64 = as_1.max(as_2);

    // Minimum reinforcement
    let as_min: f64 = 0.04 * (fc / fy) * b * d;
    let as_final: f64 = as_req.max(as_min);

    assert!(as_final > 0.0, "Required reinforcement is positive");
    assert!(as_final >= as_min, "As >= minimum reinforcement");

    let _ = PI;
}
