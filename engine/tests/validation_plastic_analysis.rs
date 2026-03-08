/// Validation: Plastic Analysis Methods (Pure Formula Verification)
///
/// References:
///   - Neal, "The Plastic Methods of Structural Analysis", 3rd Ed.
///   - Horne, "Plastic Theory of Structures", 2nd Ed.
///   - Baker & Heyman, "Plastic Design of Frames"
///   - Bruneau, Uang, Sabelli, "Ductile Design of Steel Structures", 2nd Ed.
///   - EN 1992-1-1 (Eurocode 2), ACI 318-19
///
/// Tests verify plastic analysis formulas without calling the solver.
///   1. Plastic moment capacity (Z_p * f_y) for various sections
///   2. Upper bound theorem (mechanism method) for beam
///   3. Lower bound theorem (equilibrium method) for beam
///   4. Shape factor for common sections (rectangle, circle, I-section)
///   5. Plastic hinge formation sequence in propped cantilever
///   6. Collapse load factor for fixed beam under UDL
///   7. Moment redistribution limits (EC2 and ACI provisions)
///   8. Portal frame plastic collapse (beam, sway, combined mechanisms)

mod helpers;

use std::f64::consts::PI;

// ================================================================
// 1. Plastic Moment Capacity: Mp = fy * Zp
// ================================================================
//
// The plastic moment capacity is the yield stress times the plastic
// section modulus Zp. For different cross-sections:
//
// Rectangular (b x h):         Zp = b*h^2/4
// Circular (diameter d):       Zp = d^3/6
// Hollow circular (D, d):      Zp = (D^3 - d^3)/6
//
// Reference: Neal, Ch. 2; AISC Steel Construction Manual

#[test]
fn validation_plastic_moment_capacity() {
    let fy: f64 = 250.0; // MPa (mild steel)

    // Rectangular section: 150 mm x 300 mm
    let b: f64 = 150.0;
    let h: f64 = 300.0;
    let zp_rect: f64 = b * h * h / 4.0_f64;
    let zp_rect_expected: f64 = 3_375_000.0; // mm^3
    assert!(
        (zp_rect - zp_rect_expected).abs() < 1e-6_f64,
        "Rectangular Zp: {:.0} mm^3, expected {:.0}",
        zp_rect, zp_rect_expected
    );

    let mp_rect: f64 = fy * zp_rect / 1e6_f64; // kN*m
    let mp_rect_expected: f64 = 843.75;
    assert!(
        (mp_rect - mp_rect_expected).abs() / mp_rect_expected < 1e-10_f64,
        "Rectangular Mp: {:.2} kN*m, expected {:.2}",
        mp_rect, mp_rect_expected
    );

    // Circular section: diameter 200 mm
    let d_circ: f64 = 200.0;
    let zp_circ: f64 = d_circ.powi(3) / 6.0_f64;
    let mp_circ: f64 = fy * zp_circ / 1e6_f64;
    let mp_circ_expected: f64 = fy * 200.0_f64.powi(3) / 6.0_f64 / 1e6_f64;
    assert!(
        (mp_circ - mp_circ_expected).abs() / mp_circ_expected < 1e-10_f64,
        "Circular Mp: {:.4} kN*m",
        mp_circ
    );

    // Hollow circular: D=200 mm, d=160 mm
    let d_outer: f64 = 200.0;
    let d_inner: f64 = 160.0;
    let zp_hollow: f64 = (d_outer.powi(3) - d_inner.powi(3)) / 6.0_f64;
    let mp_hollow: f64 = fy * zp_hollow / 1e6_f64;
    // Hollow should have less capacity than solid
    assert!(
        mp_hollow < mp_circ,
        "Hollow Mp ({:.4}) < Solid Mp ({:.4})",
        mp_hollow, mp_circ
    );
    // But more than zero
    assert!(mp_hollow > 0.0_f64, "Hollow Mp must be positive");
}

// ================================================================
// 2. Upper Bound Theorem (Mechanism Method)
// ================================================================
//
// The upper bound theorem states: any kinematically admissible
// collapse mechanism gives a load factor >= the true collapse
// load factor.
//
// For a simply supported beam with central point load:
//   True collapse: P_p = 4*Mp/L
//
// A non-optimal mechanism (hinge at L/3) gives P_upper > P_true.
//
// Reference: Neal, Ch. 5; Horne, Ch. 3

#[test]
fn validation_plastic_upper_bound_theorem() {
    let mp: f64 = 600.0; // kN*m
    let l: f64 = 10.0;   // m

    // True collapse: hinge at midspan under load
    // Virtual work: P * delta = Mp * (2*theta_left + 2*theta_right)
    // For midspan: delta = theta * L/2, so P * theta * L/2 = Mp * 2*theta
    // P_true = 4*Mp/L
    let p_true: f64 = 4.0_f64 * mp / l;
    let p_true_expected: f64 = 240.0;
    assert!(
        (p_true - p_true_expected).abs() < 1e-10_f64,
        "P_true: {:.2} kN, expected {:.2}",
        p_true, p_true_expected
    );

    // Non-optimal mechanism: hinge at L/3 instead of under load at L/2
    // If load is at L/2 but hinge forms at L/3:
    //   Left rotation alpha at L/3, right rotation beta
    //   Compatibility: alpha * L/3 = beta * 2L/3 => alpha = 2*beta
    //   Load displacement: delta_P = beta * L/2 (from the right segment)
    //   ... Actually, properly:
    //   Hinge at x = L/3. Beam rotates: left segment angle = alpha, right segment angle = beta
    //   alpha * (L/3) = beta * (2L/3) => alpha = 2*beta
    //   Displacement at load (L/2): delta_load = alpha * L/3 ... wait, L/2 > L/3, so:
    //   delta_load = beta * (2L/3 - (2L/3 - L/2)) = ... let's do it properly.
    //
    //   With hinge at L/3: left part rotates by alpha, right part by beta (opposite sense).
    //   At hinge: alpha * L/3 = beta * 2L/3 => alpha = 2*beta
    //   Deflection at P (at L/2, which is in the right part):
    //     delta_P = beta * (L - L/2) = beta * L/2 (measuring from right support)
    //   Wait: the right part spans from L/3 to L. Point at L/2 is at distance (L/2 - L/3) = L/6 from hinge.
    //   delta_P = beta * (L/6) ... no. Let me think again.
    //
    //   Actually from the right support: the right segment goes from x=L/3 to x=L (length 2L/3).
    //   The right support is at x=L. The displacement at any point x in the right segment is:
    //     w(x) = beta * (L - x) for x in [L/3, L]
    //   At x = L/2: delta_P = beta * (L - L/2) = beta * L/2
    //
    //   Internal work: Mp * (alpha + beta) = Mp * (2*beta + beta) = 3*Mp*beta
    //   External work: P * delta_P = P * beta * L/2
    //   Equating: P_upper = 3*Mp*beta / (beta*L/2) = 6*Mp/L

    let p_upper_l3: f64 = 6.0_f64 * mp / l;
    let p_upper_expected: f64 = 360.0;
    assert!(
        (p_upper_l3 - p_upper_expected).abs() < 1e-10_f64,
        "P_upper (hinge at L/3): {:.2} kN, expected {:.2}",
        p_upper_l3, p_upper_expected
    );

    // Upper bound must be >= true collapse
    assert!(
        p_upper_l3 >= p_true,
        "Upper bound ({:.2}) >= true ({:.2})",
        p_upper_l3, p_true
    );

    // Optimal mechanism (hinge at L/2) recovers exact
    let p_upper_mid: f64 = 4.0_f64 * mp / l;
    assert!(
        (p_upper_mid - p_true).abs() < 1e-10_f64,
        "Optimal upper bound = true: {:.2} = {:.2}",
        p_upper_mid, p_true
    );
}

// ================================================================
// 3. Lower Bound Theorem (Equilibrium Method)
// ================================================================
//
// The lower bound theorem states: any statically admissible stress
// distribution that nowhere exceeds Mp gives a load factor <= the
// true collapse load factor.
//
// For a fixed-fixed beam with central load P:
//   Elastic moment at supports: M_sup = PL/8
//   Elastic moment at midspan: M_mid = PL/8
//
//   If we limit moment to Mp everywhere:
//     PL/8 <= Mp => P <= 8*Mp/L (elastic limit, lower bound)
//     True collapse: P_p = 8*Mp/L (hinges at both ends and midspan)
//     ... wait, that's a degenerate case.
//
// Better example: propped cantilever with central load
//   Elastic: M_fixed = 3PL/16, M_midspan = 5PL/32
//   Lower bound: max(3PL/16, 5PL/32) <= Mp
//     3P*L/16 <= Mp => P <= 16*Mp/(3L)  (lower bound from support)
//     True collapse: P_p = 6*Mp/L
//
// Reference: Neal, Ch. 5; Baker & Heyman, Ch. 2

#[test]
fn validation_plastic_lower_bound_theorem() {
    let mp: f64 = 400.0; // kN*m
    let l: f64 = 6.0;    // m

    // Propped cantilever with P at midspan
    // Elastic moments:
    //   M_fixed_end = 3*P*L/16  (at fixed support)
    //   M_midspan   = 5*P*L/32  (at load point)

    // Lower bound from fixed end: 3*P*L/16 <= Mp
    // => P_lower_1 = 16*Mp/(3*L)
    let p_lower_1: f64 = 16.0_f64 * mp / (3.0_f64 * l);
    // = 16*400/18 = 355.56 kN

    // Lower bound from midspan: 5*P*L/32 <= Mp
    // => P_lower_2 = 32*Mp/(5*L)
    let p_lower_2: f64 = 32.0_f64 * mp / (5.0_f64 * l);
    // = 32*400/30 = 426.67 kN

    // The governing lower bound is the smaller value
    let p_lower = p_lower_1.min(p_lower_2);
    assert!(
        (p_lower - p_lower_1).abs() < 1e-10_f64,
        "Fixed end governs: P_lower = {:.2} kN",
        p_lower
    );

    // True collapse load (from mechanism method)
    let p_true: f64 = 6.0_f64 * mp / l;
    let p_true_expected: f64 = 400.0;
    assert!(
        (p_true - p_true_expected).abs() < 1e-10_f64,
        "P_true: {:.2} kN",
        p_true
    );

    // Lower bound must be <= true collapse
    assert!(
        p_lower <= p_true,
        "Lower bound ({:.2}) <= true ({:.2})",
        p_lower, p_true
    );

    // Verify ratio: the gap between lower and upper bounds
    let ratio = p_lower / p_true;
    assert!(
        ratio > 0.5_f64 && ratio <= 1.0_f64,
        "Lower/true ratio: {:.4} should be between 0.5 and 1.0",
        ratio
    );
}

// ================================================================
// 4. Shape Factor for Common Sections
// ================================================================
//
// The shape factor f = Zp/Se relates plastic to elastic section modulus.
//
// Rectangular: f = 1.5    (Zp = bh^2/4, Se = bh^2/6)
// Circular:    f = 16/(3*pi) ~ 1.698
// Diamond:     f = 2.0
// I-section:   f ~ 1.12-1.18 (typical for standard I-beams)
//
// Reference: Neal, Ch. 2, Table 2.1

#[test]
fn validation_plastic_shape_factors() {
    // Rectangular section
    let b: f64 = 100.0;
    let h: f64 = 200.0;
    let zp_rect: f64 = b * h * h / 4.0_f64;
    let se_rect: f64 = b * h * h / 6.0_f64;
    let f_rect: f64 = zp_rect / se_rect;
    assert!(
        (f_rect - 1.5_f64).abs() < 1e-12_f64,
        "Rectangular shape factor: {:.6}, expected 1.5",
        f_rect
    );

    // Circular section (solid)
    let d: f64 = 150.0;
    let zp_circ: f64 = d.powi(3) / 6.0_f64;
    let se_circ: f64 = PI * d.powi(3) / 32.0_f64;
    let f_circ: f64 = zp_circ / se_circ;
    let f_circ_expected: f64 = 16.0_f64 / (3.0_f64 * PI);
    assert!(
        (f_circ - f_circ_expected).abs() / f_circ_expected < 1e-10_f64,
        "Circular shape factor: {:.6}, expected {:.6}",
        f_circ, f_circ_expected
    );
    // Should be approximately 1.698
    assert!(
        (f_circ - 1.698_f64).abs() < 0.001_f64,
        "Circular f ~ 1.698: got {:.4}",
        f_circ
    );

    // Diamond (rhombus): b x h oriented as diamond
    // Se = bh^2/12 (for diamond loaded along diagonal)
    // Zp = bh^2/6
    // Shape factor = 2.0
    let f_diamond: f64 = 2.0_f64;
    // Verify: for a diamond section with diagonal lengths d1 and d2:
    // I = d1 * d2^3 / 48 (about horizontal axis through center)
    // Se = I / (d2/2) = d1 * d2^2 / 24
    // Zp = d1 * d2^2 / 12
    // f = Zp/Se = (d1*d2^2/12) / (d1*d2^2/24) = 2.0
    let d1: f64 = 100.0;
    let d2: f64 = 200.0;
    let se_diamond: f64 = d1 * d2 * d2 / 24.0_f64;
    let zp_diamond: f64 = d1 * d2 * d2 / 12.0_f64;
    let f_diamond_calc: f64 = zp_diamond / se_diamond;
    assert!(
        (f_diamond_calc - f_diamond).abs() < 1e-12_f64,
        "Diamond shape factor: {:.6}, expected 2.0",
        f_diamond_calc
    );

    // I-section: bf=200, tf=15, d=300, tw=10
    let bf: f64 = 200.0;
    let tf: f64 = 15.0;
    let d_total: f64 = 300.0;
    let tw: f64 = 10.0;
    let hw: f64 = d_total - 2.0_f64 * tf;

    let i_flanges: f64 = 2.0_f64 * (bf * tf.powi(3) / 12.0_f64
        + bf * tf * ((d_total - tf) / 2.0_f64).powi(2));
    let i_web: f64 = tw * hw.powi(3) / 12.0_f64;
    let i_total: f64 = i_flanges + i_web;
    let se_i: f64 = i_total / (d_total / 2.0_f64);

    let zp_i: f64 = bf * tf * (d_total - tf) + tw * hw * hw / 4.0_f64;
    let f_i: f64 = zp_i / se_i;
    assert!(
        f_i > 1.10_f64 && f_i < 1.25_f64,
        "I-section shape factor: {:.4}, expected 1.12-1.18",
        f_i
    );
}

// ================================================================
// 5. Plastic Hinge Formation Sequence in Propped Cantilever
// ================================================================
//
// A propped cantilever (fixed at A, roller at B) under UDL:
//   - First hinge forms at the fixed end (elastic M_max = wL^2/8)
//   - Second hinge forms in the span, creating a mechanism
//
// The first yield load: w_y = 8*Mp/L^2 (elastic moment at support = Mp)
// The collapse load:    w_p = (6+4*sqrt(2))*Mp/L^2 ~ 11.657*Mp/L^2
//
// The hinge in the span forms at x = L*(sqrt(2)-1) from the roller end.
//
// Reference: Neal, Ch. 4; Horne, Ch. 3

#[test]
fn validation_plastic_hinge_formation_sequence() {
    let mp: f64 = 500.0; // kN*m
    let l: f64 = 8.0;    // m

    // First yield: elastic moment at fixed end = wL^2/8
    // wL^2/8 = Mp => w_y = 8*Mp/L^2
    let w_first_yield: f64 = 8.0_f64 * mp / (l * l);
    let w_fy_expected: f64 = 62.5; // kN/m
    assert!(
        (w_first_yield - w_fy_expected).abs() / w_fy_expected < 1e-10_f64,
        "First yield load: {:.2} kN/m, expected {:.2}",
        w_first_yield, w_fy_expected
    );

    // Collapse load: w_p = (6 + 4*sqrt(2)) * Mp / L^2
    let coeff: f64 = 6.0_f64 + 4.0_f64 * 2.0_f64.sqrt();
    let w_collapse: f64 = coeff * mp / (l * l);
    // coeff ~ 11.657
    assert!(
        (coeff - 11.6569_f64).abs() < 0.001_f64,
        "Collapse coefficient: {:.4}, expected ~11.657",
        coeff
    );

    // Location of span hinge: x_h = L*(sqrt(2)-1) from roller end
    // (or equivalently, x = L*(2 - sqrt(2)) from fixed end)
    let x_hinge_from_roller: f64 = l * (2.0_f64.sqrt() - 1.0_f64);
    let x_hinge_from_fixed: f64 = l - x_hinge_from_roller;

    // x_hinge_from_fixed = L*(2-sqrt(2)) ≈ 0.5858*L, so between L/2 and 2L/3
    assert!(
        x_hinge_from_fixed > l / 2.0_f64 && x_hinge_from_fixed < 2.0_f64 * l / 3.0_f64,
        "Span hinge at {:.4} m from fixed end, should be in ({:.2}, {:.2})",
        x_hinge_from_fixed, l / 2.0_f64, 2.0_f64 * l / 3.0_f64
    );

    // Redistribution ratio: w_collapse / w_first_yield
    let redistribution_ratio: f64 = w_collapse / w_first_yield;
    let ratio_expected: f64 = coeff / 8.0_f64;
    assert!(
        (redistribution_ratio - ratio_expected).abs() / ratio_expected < 1e-10_f64,
        "Redistribution ratio: {:.4}, expected {:.4}",
        redistribution_ratio, ratio_expected
    );
    // Should be about 1.457
    assert!(
        (redistribution_ratio - 1.457_f64).abs() < 0.01_f64,
        "Ratio ~ 1.457: got {:.4}",
        redistribution_ratio
    );
}

// ================================================================
// 6. Collapse Load Factor for Fixed Beam Under UDL
// ================================================================
//
// A fixed-fixed beam under UDL collapses when 3 hinges form:
//   both ends + midspan.
//
// Virtual work:
//   External: w_p * L * (L/4) * theta = w_p * L^2 * theta / 4
//   Internal: 2*Mp*theta + 2*Mp*theta = 4*Mp*theta (2 end hinges + midspan)
//
// Wait: correct derivation:
//   Each end hinge rotates by theta. Midspan hinge rotates by 2*theta.
//   Internal work = Mp*theta + Mp*theta + Mp*2*theta = 4*Mp*theta
//   Actually: each end rotates theta, midspan also has theta from left and theta from right
//   Internal work = Mp*theta (left end) + Mp*theta (right end) + Mp*2*theta (midspan) = 4*Mp*theta
//   External work = w_p * integral of deflection = w_p * L * (L/4*theta)/2 * 2 = w_p * L^2 * theta / 4
//
// w_p = 16*Mp/L^2
//
// Reference: Neal, Ch. 4; Horne, Ch. 3

#[test]
fn validation_plastic_collapse_load_factor() {
    let mp: f64 = 300.0; // kN*m
    let l: f64 = 6.0;    // m

    // Fixed beam under UDL
    let w_collapse: f64 = 16.0_f64 * mp / (l * l);
    // = 16*300/36 = 133.33 kN/m
    let w_collapse_expected: f64 = 16.0_f64 * 300.0_f64 / 36.0_f64;
    assert!(
        (w_collapse - w_collapse_expected).abs() < 1e-10_f64,
        "w_collapse: {:.4} kN/m",
        w_collapse
    );

    // Elastic maximum moment (at supports): w*L^2/12
    // First yield: w_y * L^2/12 = Mp => w_y = 12*Mp/L^2
    let w_first_yield: f64 = 12.0_f64 * mp / (l * l);

    // Load factor = w_collapse / w_first_yield = 16/12 = 4/3
    let load_factor: f64 = w_collapse / w_first_yield;
    let lf_expected: f64 = 4.0_f64 / 3.0_f64;
    assert!(
        (load_factor - lf_expected).abs() / lf_expected < 1e-10_f64,
        "Load factor: {:.6}, expected {:.6}",
        load_factor, lf_expected
    );

    // Fixed beam with central point load: P_p = 8*Mp/L
    let p_collapse: f64 = 8.0_f64 * mp / l;
    let p_collapse_expected: f64 = 400.0;
    assert!(
        (p_collapse - p_collapse_expected).abs() < 1e-10_f64,
        "P_collapse (fixed beam): {:.2} kN, expected {:.2}",
        p_collapse, p_collapse_expected
    );

    // Compare with SS beam: P_p_ss = 4*Mp/L
    let p_ss: f64 = 4.0_f64 * mp / l;
    // Fixed beam carries twice the SS beam collapse load
    assert!(
        (p_collapse / p_ss - 2.0_f64).abs() < 1e-10_f64,
        "Fixed/SS ratio: {:.4}, expected 2.0",
        p_collapse / p_ss
    );
}

// ================================================================
// 7. Moment Redistribution Limits (EC2 and ACI)
// ================================================================
//
// Both Eurocode 2 (EN 1992-1-1) and ACI 318 limit the amount of
// moment redistribution allowed in continuous beams.
//
// EC2 (cl. 5.5):
//   delta >= 0.44 + 1.25*(xu/d) for Class A/B reinforcement
//   where delta = redistributed moment / elastic moment
//   Typical limit: 20-30% redistribution (delta >= 0.7-0.8)
//
// ACI 318-19 (8.4.1):
//   Max redistribution = 1000 * epsilon_t percent
//   where epsilon_t >= 0.0075 for redistribution (i.e., max ~7.5%)
//   But effectively limited to about 20%
//
// Reference: EN 1992-1-1:2004 cl. 5.5; ACI 318-19 cl. 8.4

#[test]
fn validation_plastic_moment_redistribution_limits() {
    // EC2 redistribution limit
    // delta = redistributed_moment / elastic_moment
    // Must have delta >= k1 + k2*(xu/d)
    // For Class B/C reinforcement and fck <= 50 MPa:
    //   k1 = 0.44, k2 = 1.25
    let k1_ec2: f64 = 0.44;
    let k2_ec2: f64 = 1.25;

    // Example: xu/d = 0.25 (typical)
    let xu_d: f64 = 0.25;
    let delta_min_ec2: f64 = k1_ec2 + k2_ec2 * xu_d;
    // = 0.44 + 1.25*0.25 = 0.44 + 0.3125 = 0.7525
    let delta_min_expected: f64 = 0.7525;
    assert!(
        (delta_min_ec2 - delta_min_expected).abs() < 1e-10_f64,
        "EC2 delta_min: {:.4}, expected {:.4}",
        delta_min_ec2, delta_min_expected
    );

    // Maximum redistribution percentage
    let max_redist_ec2: f64 = (1.0_f64 - delta_min_ec2) * 100.0_f64;
    // = (1 - 0.7525)*100 = 24.75%
    let max_redist_expected: f64 = 24.75;
    assert!(
        (max_redist_ec2 - max_redist_expected).abs() < 1e-10_f64,
        "EC2 max redistribution: {:.2}%, expected {:.2}%",
        max_redist_ec2, max_redist_expected
    );

    // ACI 318-19 redistribution limit
    // Max redistribution = 1000 * epsilon_t percent
    // where epsilon_t is net tensile strain
    let epsilon_t: f64 = 0.0075; // minimum for redistribution
    let max_redist_aci: f64 = 1000.0_f64 * epsilon_t;
    // = 7.5%
    assert!(
        (max_redist_aci - 7.5_f64).abs() < 1e-10_f64,
        "ACI min redistribution: {:.1}%",
        max_redist_aci
    );

    // With a typical epsilon_t = 0.02 (tension-controlled)
    let epsilon_t_typical: f64 = 0.02;
    let redist_aci_typical: f64 = 1000.0_f64 * epsilon_t_typical;
    // = 20%
    assert!(
        (redist_aci_typical - 20.0_f64).abs() < 1e-10_f64,
        "ACI typical redistribution: {:.1}%",
        redist_aci_typical
    );

    // EC2 allows more redistribution than ACI for typical sections
    assert!(
        max_redist_ec2 > max_redist_aci,
        "EC2 ({:.2}%) > ACI ({:.1}%) for typical xu/d",
        max_redist_ec2, max_redist_aci
    );
}

// ================================================================
// 8. Portal Frame Plastic Collapse
// ================================================================
//
// Fixed-base portal frame with span L, height h, Mp same for all.
//
// Three possible mechanisms:
//   (a) Beam mechanism: w_p = 16*Mp/L^2 (or P_p = 8*Mp/L for point load)
//   (b) Sway mechanism: H_p = 4*Mp/h
//   (c) Combined (beam+sway): lambda from virtual work
//
// The governing mechanism gives the lowest collapse load factor.
//
// Reference: Horne, "Plastic Theory of Structures", Ch. 5

#[test]
fn validation_plastic_portal_frame_collapse() {
    let mp: f64 = 200.0; // kN*m (all members)
    let l: f64 = 8.0;    // m (beam span)
    let h: f64 = 4.0;    // m (column height)
    let w: f64 = 20.0;   // kN/m (vertical UDL on beam, reference)
    let h_force: f64 = 50.0; // kN (horizontal at beam level, reference)

    // (a) Beam mechanism:
    // 4 hinges (both beam-column joints + midspan)
    // Internal work: 2*Mp*theta + 2*Mp*theta = 4*Mp*theta (joints)
    //              + Mp*2*theta (midspan) ... wait:
    // Actually for beam mechanism in portal with fixed bases:
    //   Hinges at both ends of beam + midspan = 4*Mp*theta
    //   (each end hinge: Mp*theta, midspan: Mp*2*theta => total 4*Mp*theta)
    //   External work: lambda*w*L^2/4 * theta
    //   lambda_beam = 4*Mp / (w*L^2/4) = 16*Mp/(w*L^2)
    let lambda_beam: f64 = 16.0_f64 * mp / (w * l * l);
    // But we want it in terms of a load factor on w=20:
    // lambda_beam = 16*200/(20*64) = 3200/1280 = 2.5
    let lambda_beam_expected: f64 = 2.5;
    assert!(
        (lambda_beam - lambda_beam_expected).abs() / lambda_beam_expected < 1e-10_f64,
        "Beam mechanism lambda: {:.4}, expected {:.4}",
        lambda_beam, lambda_beam_expected
    );

    // (b) Sway mechanism:
    // 4 hinges at column tops and bottoms
    // Internal work: 4*Mp*theta
    // External work: lambda*H*h*theta
    let lambda_sway: f64 = 4.0_f64 * mp / (h_force * h);
    // = 800/200 = 4.0
    let lambda_sway_expected: f64 = 4.0;
    assert!(
        (lambda_sway - lambda_sway_expected).abs() / lambda_sway_expected < 1e-10_f64,
        "Sway mechanism lambda: {:.4}, expected {:.4}",
        lambda_sway, lambda_sway_expected
    );

    // (c) Combined mechanism (beam + sway):
    // 6 hinges: 2 at column bases + midspan + 1 at beam-column joint
    // Actually: combine beam+sway, remove overlapping hinges
    // Internal work: 6*Mp*theta
    // External work: lambda*(w*L^2/4 + H*h)*theta
    let ext_work_unit: f64 = w * l * l / 4.0_f64 + h_force * h;
    // = 20*64/4 + 50*4 = 320 + 200 = 520
    let lambda_combined: f64 = 6.0_f64 * mp / ext_work_unit;
    // = 1200/520 = 2.3077
    let lambda_combined_expected: f64 = 1200.0_f64 / 520.0_f64;
    assert!(
        (lambda_combined - lambda_combined_expected).abs() / lambda_combined_expected < 1e-10_f64,
        "Combined mechanism lambda: {:.6}, expected {:.6}",
        lambda_combined, lambda_combined_expected
    );

    // Governing mechanism is the minimum lambda
    let lambda_governing = lambda_beam.min(lambda_sway).min(lambda_combined);
    assert!(
        (lambda_governing - lambda_combined).abs() < 1e-10_f64,
        "Combined mechanism governs: lambda = {:.4}",
        lambda_governing
    );

    // Verify ordering: combined < beam < sway
    assert!(lambda_combined < lambda_beam, "combined < beam");
    assert!(lambda_beam < lambda_sway, "beam < sway");
}
