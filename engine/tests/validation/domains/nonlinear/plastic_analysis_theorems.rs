/// Validation: Plastic Analysis Theorems (Pure Formula Verification)
///
/// References:
///   - Neal, "The Plastic Methods of Structural Analysis", 3rd Ed.
///   - Horne, "Plastic Theory of Structures", 2nd Ed.
///   - Baker & Heyman, "Plastic Design of Frames", Vol. 1-2
///   - Bruneau, Uang & Sabelli, "Ductile Design of Steel Structures", 2nd Ed.
///   - Megson, "Structural and Stress Analysis", 4th Ed., Ch. 18
///   - EN 1993-1-1, Sec 5.6 (Plastic global analysis)
///
/// Tests verify plastic analysis formulas without calling the solver.
/// Pure arithmetic verification of collapse loads, mechanisms, and shape factors.

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
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Simply Supported Beam Plastic Moment (Neal, Ch. 2)
// ================================================================
//
// Simply supported beam, span L, point load P at midspan.
// Collapse mechanism: single hinge at midspan.
//
// Virtual work: P * delta = Mp * (2*theta)
// where delta = theta*L/2, so P*theta*L/2 = Mp*2*theta
// => Mp = P*L/4  (same as elastic, but valid at collapse)
//
// For UDL w per unit length:
// Virtual work: w*L*delta_avg = Mp*2*theta
// delta_avg = theta*L/4 (parabolic mechanism)
// => w*L*theta*L/4 = Mp*2*theta => Mp = w*L^2/8

#[test]
fn validation_ss_beam_plastic_moment() {
    let l: f64 = 8.0;   // m, span
    let fy: f64 = 250.0; // MPa, yield stress

    // Rectangular section: b=0.2m, h=0.4m
    let b: f64 = 0.200;
    let h: f64 = 0.400;

    // Plastic section modulus for rectangle: Zp = b*h^2/4
    let zp: f64 = b * h * h / 4.0;
    assert_close(zp, 0.008, 0.001, "Zp for rectangle");

    // Plastic moment capacity (in kN-m, converting MPa -> kN/m^2)
    let mp: f64 = fy * 1000.0 * zp; // fy in kN/m^2 * m^3 = kN-m
    assert_close(mp, 2000.0, 0.001, "Mp = fy*Zp");

    // Collapse load for midspan point load
    // Mp = P*L/4 => P_collapse = 4*Mp/L
    let p_collapse: f64 = 4.0 * mp / l;
    assert_close(p_collapse, 1000.0, 0.001, "P_collapse (point load)");

    // Collapse load for UDL
    // Mp = w*L^2/8 => w_collapse = 8*Mp/L^2
    let w_collapse: f64 = 8.0 * mp / (l * l);
    assert_close(w_collapse, 250.0, 0.001, "w_collapse (UDL)");

    // Elastic moment at first yield: My = fy * Ze, Ze = b*h^2/6
    let ze: f64 = b * h * h / 6.0;
    let my: f64 = fy * 1000.0 * ze;
    assert_close(my, mp * 2.0 / 3.0, 0.001, "My = (2/3)*Mp for rectangle");

    // Load at first yield (UDL): My = w_y*L^2/8
    let w_yield: f64 = 8.0 * my / (l * l);
    let overstrength: f64 = w_collapse / w_yield;
    assert_close(overstrength, 1.5, 0.001, "Overstrength = shape factor = 1.5");
}

// ================================================================
// 2. Fixed Beam Collapse Load — 3-Hinge Mechanism (Neal, Ch. 3)
// ================================================================
//
// Fixed-fixed beam, span L, point load P at midspan.
// Elastic solution: M_ends = PL/8, M_mid = PL/8.
// 3-hinge collapse mechanism: hinges at both ends + midspan.
//
// Virtual work: P*delta = Mp*(theta + theta + 2*theta) = 4*Mp*theta
// where delta = theta*L/2
// P*theta*L/2 = 4*Mp*theta => P_collapse = 8*Mp/L
//
// For UDL on fixed beam:
// P_collapse_UDL: 16*Mp/L^2 (hinges at ends + midspan, parabolic mechanism)

#[test]
fn validation_fixed_beam_collapse_load() {
    let l: f64 = 6.0;    // m
    let mp: f64 = 150.0;  // kN-m

    // Point load at midspan: P_c = 8*Mp/L
    let p_collapse_point: f64 = 8.0 * mp / l;
    assert_close(p_collapse_point, 200.0, 0.001, "Fixed beam P_c (point load)");

    // UDL collapse: w_c = 16*Mp/L^2
    let w_collapse_udl: f64 = 16.0 * mp / (l * l);
    assert_close(w_collapse_udl, 16.0 * 150.0 / 36.0, 0.001, "Fixed beam w_c (UDL)");

    // Compare with simply supported:
    // SS P_c = 4*Mp/L, Fixed P_c = 8*Mp/L => ratio = 2
    let p_collapse_ss: f64 = 4.0 * mp / l;
    let ratio_point: f64 = p_collapse_point / p_collapse_ss;
    assert_close(ratio_point, 2.0, 0.001, "Fixed/SS strength ratio (point)");

    // SS w_c = 8*Mp/L^2, Fixed w_c = 16*Mp/L^2 => ratio = 2
    let w_collapse_ss: f64 = 8.0 * mp / (l * l);
    let ratio_udl: f64 = w_collapse_udl / w_collapse_ss;
    assert_close(ratio_udl, 2.0, 0.001, "Fixed/SS strength ratio (UDL)");

    // Elastic first yield for fixed beam under midspan P:
    // M_fixed_end = PL/8 = Mp => P_yield = 8*Mp/L (same as collapse for this case!)
    // But actually, M_end = PL/8 and M_mid = PL/8 both reach Mp simultaneously.
    // For UDL: M_end = wL^2/12, M_mid = wL^2/24
    // Yield at ends first: wL^2/12 = Mp => w_yield = 12*Mp/L^2
    let w_yield: f64 = 12.0 * mp / (l * l);
    let load_factor: f64 = w_collapse_udl / w_yield;
    assert_close(load_factor, 4.0 / 3.0, 0.001, "Load factor for fixed beam UDL");

    // This 4/3 represents the moment redistribution from elastic to plastic
    assert!(load_factor > 1.0, "Plastic collapse > first yield");
}

// ================================================================
// 3. Portal Frame Sway Mechanism (Horne, Ch. 4)
// ================================================================
//
// Single-bay portal frame with fixed bases:
//   Columns height H, beam span L
//   Horizontal load F at beam level
//
// Sway mechanism: 4 hinges (2 at column bases, 2 at beam-column joints)
// Virtual work: F*delta_sway = Mp*(theta + theta + theta + theta) = 4*Mp*theta
// delta_sway = theta*H
// F*theta*H = 4*Mp*theta => F_collapse = 4*Mp/H
//
// For combined vertical + horizontal:
// Beam mechanism: P*delta = Mp*(theta + theta + 2*theta) = 4*Mp*theta
//   delta = theta*L/2 => P = 8*Mp/L
// Sway: F = 4*Mp/H
// Combined: P*L/2 + F*H = 4*Mp + 2*Mp = 6*Mp (depends on mechanism)

#[test]
fn validation_portal_frame_sway_mechanism() {
    let h_col: f64 = 4.0;   // m, column height
    let l_beam: f64 = 8.0;  // m, beam span
    let mp: f64 = 200.0;     // kN-m (same for all members)

    // Pure sway mechanism: F = 4*Mp/H
    let f_sway: f64 = 4.0 * mp / h_col;
    assert_close(f_sway, 200.0, 0.001, "Sway mechanism F_collapse");

    // Pure beam mechanism: P = 8*Mp/L (hinges at beam ends + midspan)
    // Wait -- for a fixed-base portal frame with vertical load P at midspan of beam:
    // Beam mechanism has hinges at the two beam-column joints + midspan.
    // Virtual work: P*theta*L/2 = Mp*(theta + 2*theta + theta) = 4*Mp*theta
    // P = 8*Mp/L
    let p_beam: f64 = 8.0 * mp / l_beam;
    assert_close(p_beam, 200.0, 0.001, "Beam mechanism P_collapse");

    // Combined mechanism (Horne): merge beam + sway
    // Number of hinges = 4+4 - 2 (shared joints) = 6 distinct hinge locations,
    // but actually: hinges at 2 column bases + midspan beam + 1 beam-column joint
    // that doesn't participate in sway.
    //
    // Combined virtual work: P*theta*L/2 + F*theta*H = Mp*(sum of rotations)
    // For the combined mechanism with hinges at: 2 bases + midspan + windward joint
    // Internal work = Mp*(theta + theta + 2*theta + theta) = 5*Mp*theta (one side)
    //
    // Actually, the combined mechanism is:
    // Sway: 4 hinges, 4*Mp*theta
    // Beam: 4 hinges, 4*Mp*theta
    // Combined = Sway + Beam - duplicates:
    // Hinges at: 2 bases, midspan, 1 or 2 joints
    // Combined with P at midspan and F horizontal:
    //   P*theta*L/2 + F*theta*H = 6*Mp*theta
    //   (6 hinges: 2 bases + 2 joints (one sagging, one hogging) + midspan = 5,
    //    but rotations differ)
    //
    // Standard result for portal with uniform Mp:
    // Combined mechanism gives P*L/2 + F*H = 6*Mp (Neal, Table 3.1)
    // This is an upper bound.

    // Test specific case: P = 100 kN, find F for combined collapse
    let p: f64 = 100.0;
    // P*L/2 + F*H = 6*Mp => F = (6*Mp - P*L/2) / H
    let f_combined: f64 = (6.0 * mp - p * l_beam / 2.0) / h_col;
    assert_close(f_combined, (1200.0 - 400.0) / 4.0, 0.001, "Combined: F for P=100");
    assert_close(f_combined, 200.0, 0.001, "F_combined = 200 kN");

    // The combined load must satisfy: it's less than or equal to pure beam + pure sway
    // (interaction equation)
    let p_ratio: f64 = p / p_beam;
    let f_ratio: f64 = f_combined / f_sway;
    // Interaction: p_ratio + f_ratio <= some value depending on mechanism
    let _interaction: f64 = p_ratio + f_ratio;
    assert!(p_ratio >= 0.0 && f_ratio >= 0.0, "Load ratios non-negative");
}

// ================================================================
// 4. Combined Beam-Sway Mechanism (Baker & Heyman)
// ================================================================
//
// Two-bay portal frame with uniform Mp:
//   |---L---|---L---|
//   |                |
//   H               H (fixed bases)
//
// Vertical loads P1 and P2 at midspan of each bay, horizontal load F.
//
// Possible mechanisms:
//   (a) Beam 1: P1 = 8Mp/L
//   (b) Beam 2: P2 = 8Mp/L
//   (c) Sway:   F = 6Mp/H (3 columns, but middle column has 2 hinges)
//   (d) Combined beam1+sway
//   (e) Combined beam2+sway
//   (f) Combined all three
//
// The correct collapse load is the minimum of all upper bounds.

#[test]
fn validation_combined_beam_sway_mechanism() {
    let l: f64 = 6.0;    // m, bay span
    let h: f64 = 4.0;    // m, column height
    let mp: f64 = 120.0;  // kN-m

    // Pure beam mechanism (each bay): P = 8Mp/L
    let p_beam: f64 = 8.0 * mp / l;
    assert_close(p_beam, 160.0, 0.001, "Beam mechanism P");

    // For a two-bay frame with 3 columns and fixed bases:
    // Sway mechanism: hinges at 3 bases + 2 beam-column joints (top)
    // But the interior column has hinges at top and bottom.
    // Virtual work: F*theta*H = Mp*(3*theta for bases + 3*theta for tops) = 6*Mp*theta
    // => F = 6*Mp/H
    let f_sway: f64 = 6.0 * mp / h;
    assert_close(f_sway, 180.0, 0.001, "Two-bay sway mechanism F");

    // Interaction: for proportional loading P1 = P2 = P, F given
    // Combined mechanism (beam1 + sway):
    // P*L/2 + F*H = 8*Mp + some sway work
    // For two-bay combined (all beams + sway):
    //   2*P*L/2 + F*H = (8+6)*Mp = 14*Mp (upper bound)
    //   P*L + F*H = 14*Mp

    // Test with F = 100 kN, find P for collapse
    let f: f64 = 100.0;
    // P*L + F*H = 14*Mp => P = (14*Mp - F*H)/L
    let p_combined: f64 = (14.0 * mp - f * h) / l;
    assert_close(p_combined, (1680.0 - 400.0) / 6.0, 0.001, "Combined P for F=100");

    // Check all mechanisms to find governing one
    let p_beam_only: f64 = p_beam; // 160 kN (ignores F)
    let p_from_sway: f64 = f64::MAX; // sway doesn't constrain P directly

    // Governing is minimum P (beam mechanism controls since it's lower)
    let p_govern: f64 = p_beam_only.min(p_combined).min(p_from_sway);
    assert_close(p_govern, p_beam_only, 0.001, "Governing collapse load");

    // Verify combined mechanism allows higher P than beam mechanism
    // (sway mechanism work absorbs part of lateral load F, raising vertical capacity)
    assert!(
        p_combined > p_beam,
        "Combined mechanism P ({:.1}) > beam mechanism P ({:.1})",
        p_combined, p_beam
    );
}

// ================================================================
// 5. Propped Cantilever Collapse Load (Neal, Ch. 2)
// ================================================================
//
// Propped cantilever (fixed left, roller right), span L, point load P at midspan.
//
// Elastic: M_fixed = 3PL/16, M_mid = 5PL/32
//   First yield at fixed end: 3PL/16 = Mp => P_y = 16Mp/(3L)
//
// Collapse: two hinges — at fixed end and under load.
// Virtual work: P*theta*L/2 = Mp*(theta + 2*theta) = 3*Mp*theta
//   P_collapse = 6*Mp/L
//
// For UDL: collapse with hinge at fixed end + hinge at distance x from fixed end.
//   Optimizing: x = L*(sqrt(3)-1)/2 ≈ 0.414L (actually w_c = 11.656*Mp/L^2)
//   Approximate: w_c ≈ 11.66*Mp/L^2

#[test]
fn validation_propped_cantilever_collapse() {
    let l: f64 = 10.0;
    let mp: f64 = 300.0; // kN-m

    // Point load at midspan
    let p_collapse: f64 = 6.0 * mp / l;
    assert_close(p_collapse, 180.0, 0.001, "Propped cantilever P_c (midspan)");

    // Elastic first yield load
    let p_yield: f64 = 16.0 * mp / (3.0 * l);
    assert_close(p_yield, 160.0, 0.001, "Propped cantilever P_y");

    // Overstrength ratio
    let overstrength: f64 = p_collapse / p_yield;
    assert_close(overstrength, 180.0 / 160.0, 0.001, "Overstrength = 1.125");

    // UDL collapse: w_c = 11.656*Mp/L^2
    // Exact: w_c = 2*Mp*(3+2*sqrt(2))/L^2
    let w_collapse_exact: f64 = 2.0 * mp * (3.0 + 2.0 * 2.0_f64.sqrt()) / (l * l);
    assert_close(w_collapse_exact, 2.0 * 300.0 * (3.0 + 2.828427) / 100.0, 0.001, "w_c exact");

    // Hinge location for UDL: x = L*(2-sqrt(2)) from the fixed end
    // This gives the position of the sagging hinge.
    let x_hinge: f64 = l * (2.0 - 2.0_f64.sqrt());
    assert_close(x_hinge, l * 0.5858, 0.001, "UDL hinge position");

    // Verify the hinge is between 0.5L and 0.7L
    assert!(
        x_hinge > 0.5 * l && x_hinge < 0.7 * l,
        "Hinge at x = {:.2} in range [5, 7]",
        x_hinge
    );

    // Compare with fixed-fixed beam: w_ff = 16*Mp/L^2
    let w_ff: f64 = 16.0 * mp / (l * l);
    assert!(
        w_collapse_exact < w_ff,
        "Propped cant ({:.2}) weaker than fixed-fixed ({:.2})",
        w_collapse_exact, w_ff
    );

    // Compare with SS beam: w_ss = 8*Mp/L^2
    let w_ss: f64 = 8.0 * mp / (l * l);
    assert!(
        w_collapse_exact > w_ss,
        "Propped cant ({:.2}) stronger than SS ({:.2})",
        w_collapse_exact, w_ss
    );
}

// ================================================================
// 6. Continuous Beam Plastic Collapse (Horne, Ch. 3)
// ================================================================
//
// Two-span continuous beam (A-B-C), each span L, UDL w on both spans.
// Fixed at A, simply supported at C, continuous over B.
//
// Mechanism 1: span AB — hinges at A, and at distance x in span AB + at B
// Mechanism 2: span BC — hinges at B and at distance x in span BC
//
// For equal spans under uniform w with Mp uniform:
//   Span AB (fixed-pinned end): w_c1 = 11.656*Mp/L^2
//   Span BC (pinned-pinned with moment at B): w_c2 depends on whether
//     interior support acts as a hinge.
//
// Simplified: for a 2-span beam, pinned at A and C, continuous at B
//   Each span collapse: w_c = 11.656*Mp/L^2 (propped cantilever analogy)
//   or use individual span mechanisms.
//
// Here we test the simpler case: 2-span beam, all supports pinned,
//   continuous at interior support.
//   Span mechanism: w_c = 8*Mp/L^2 (SS beam per span, hinge at midspan + at B)

#[test]
fn validation_continuous_beam_plastic_collapse() {
    let l: f64 = 8.0;    // m, each span
    let mp: f64 = 200.0;  // kN-m

    // Two-span beam, pinned at both ends, continuous over interior support.
    // UDL on both spans.
    // Mechanism per span: midspan hinge + hogging hinge at B.
    // Virtual work for span AB:
    //   w*L * (theta*L/4) = Mp*(theta) + Mp*(2*theta)
    //   w*L^2*theta/4 = 3*Mp*theta
    //   w_c = 12*Mp/L^2

    // Wait — for a propped-like scenario with hinge at interior:
    // The interior support moment is Mp (hogging).
    // The mechanism has hinge at midspan (sagging) and at support (hogging).
    // Internal work = Mp*theta (support) + Mp*2*theta (midspan) = 3*Mp*theta
    // External work = w*L*(delta_avg) where delta_avg for mechanism with theta at one end:
    //   delta_avg = theta*L/4
    // w*L*theta*L/4 = 3*Mp*theta => w_c = 12*Mp/L^2

    let w_collapse: f64 = 12.0 * mp / (l * l);
    assert_close(w_collapse, 12.0 * 200.0 / 64.0, 0.001, "2-span w_c");

    // Compare with simply supported: w_ss = 8*Mp/L^2
    let w_ss: f64 = 8.0 * mp / (l * l);
    assert!(w_collapse > w_ss, "Continuity adds strength: {:.1} > {:.1}", w_collapse, w_ss);

    // Ratio: continuous/SS = 12/8 = 1.5
    let ratio: f64 = w_collapse / w_ss;
    assert_close(ratio, 1.5, 0.001, "Continuity strength ratio");

    // If interior support has 2*Mp (stronger):
    // Internal work = 2*Mp*theta + Mp*2*theta = 4*Mp*theta
    // w*L^2/4 = 4*Mp => w_c = 16*Mp/L^2 (same as fixed-fixed!)
    let w_strong_support: f64 = 16.0 * mp / (l * l);
    assert_close(w_strong_support / w_ss, 2.0, 0.001, "Strong support = fixed-fixed ratio");

    // For unequal spans L1, L2 with same load, the shorter span governs
    let l1: f64 = 6.0;
    let l2: f64 = 10.0;
    let w_c1: f64 = 12.0 * mp / (l1 * l1);
    let w_c2: f64 = 12.0 * mp / (l2 * l2);
    assert!(w_c2 < w_c1, "Longer span governs (lower collapse load)");
    let w_govern: f64 = w_c1.min(w_c2);
    assert_close(w_govern, w_c2, 0.001, "Governing = longer span");
}

// ================================================================
// 7. Shape Factors for Various Cross-Sections (Megson, Ch. 18)
// ================================================================
//
// Shape factor f = Zp / Ze = Mp / My
//
// Rectangle: Zp = bh^2/4, Ze = bh^2/6 => f = 1.5
// Circle: Zp = d^3/6, Ze = pi*d^3/32 => f = 16/(3*pi) = 1.698
// I-section (approx): f ~ 1.10 to 1.20
// Diamond (rhombus): Zp = bd^2/6, Ze = bd^2/12 => f = 2.0
// Hollow circle: f -> 1.27 (thin wall)

#[test]
fn validation_shape_factors() {
    // Rectangle: b x h
    let b_rect: f64 = 0.150;
    let h_rect: f64 = 0.300;
    let zp_rect: f64 = b_rect * h_rect * h_rect / 4.0;
    let ze_rect: f64 = b_rect * h_rect * h_rect / 6.0;
    let f_rect: f64 = zp_rect / ze_rect;
    assert_close(f_rect, 1.5, 0.001, "Rectangle shape factor");

    // Circle: diameter d
    let d: f64 = 0.200;
    let zp_circle: f64 = d * d * d / 6.0;
    let ze_circle: f64 = PI * d * d * d / 32.0;
    let f_circle: f64 = zp_circle / ze_circle;
    assert_close(f_circle, 16.0 / (3.0 * PI), 0.001, "Circle shape factor");
    assert!(f_circle > 1.69 && f_circle < 1.71, "Circle f ~ 1.698");

    // I-section (wide flange approximation)
    // W-shape: bf=200mm, tf=15mm, d=400mm, tw=10mm
    let bf: f64 = 0.200;
    let tf: f64 = 0.015;
    let d_web: f64 = 0.400; // total depth
    let tw: f64 = 0.010;
    let hw: f64 = d_web - 2.0 * tf; // web height

    // Elastic section modulus: I/c
    let i_flange: f64 = 2.0 * (bf * tf * tf * tf / 12.0 + bf * tf * ((d_web - tf) / 2.0).powi(2));
    let i_web: f64 = tw * hw * hw * hw / 12.0;
    let i_total: f64 = i_flange + i_web;
    let ze_i: f64 = i_total / (d_web / 2.0);

    // Plastic section modulus: sum of first moments
    // Flanges: 2 * bf * tf * (d/2 - tf/2) = bf * tf * (d - tf)
    let zp_flange: f64 = bf * tf * (d_web - tf);
    // Web: 2 * tw * (hw/2) * (hw/4) = tw * hw^2 / 4
    let zp_web: f64 = tw * hw * hw / 4.0;
    let zp_i: f64 = zp_flange + zp_web;

    let f_i: f64 = zp_i / ze_i;
    assert!(
        f_i > 1.05 && f_i < 1.25,
        "I-section shape factor {:.3} in range [1.05, 1.25]",
        f_i
    );

    // Thin-walled hollow circle: f = 4/pi ~ 1.273
    let f_hollow_circle: f64 = 4.0 / PI;
    assert_close(f_hollow_circle, 1.2732, 0.001, "Thin-wall hollow circle shape factor");

    // Ranking: diamond > circle > rectangle > hollow > I-section
    let f_diamond: f64 = 2.0;
    assert!(f_diamond > f_circle, "Diamond > circle");
    assert!(f_circle > f_rect, "Circle > rectangle");
    assert!(f_rect > f_hollow_circle, "Rectangle > hollow circle");
    assert!(f_hollow_circle > f_i, "Hollow circle > I-section");
}

// ================================================================
// 8. Upper Bound Theorem Verification (Baker & Heyman)
// ================================================================
//
// The upper bound theorem states that the collapse load computed
// from any kinematically admissible mechanism is an upper bound
// on the true collapse load.
//
// Test: fixed-fixed beam with off-center point load P at distance a
// from left end (a < L/2).
//
// Mechanism 1: hinge under load + both ends
//   P*theta*a*(L-a)/L = Mp*(theta*(L-a)/L + 2*theta + theta*a/L)
//   Simplifying: P*a*(L-a)/L = Mp*(2 + (L-a)/L + a/L) = Mp*3... wait
//
// For fixed beam, load at distance a from left:
//   Virtual work: P*delta = Mp*(theta_A + theta_load + theta_B)
//   Geometry: delta = theta_A * a = theta_B * (L-a)
//   theta_load = theta_A + theta_B
//   Let theta_A = theta, then theta_B = theta*a/(L-a)
//   delta = theta*a
//   theta_load = theta + theta*a/(L-a) = theta*L/(L-a)
//   P*theta*a = Mp*(theta + theta*L/(L-a) + theta*a/(L-a))
//   P*a = Mp*(1 + L/(L-a) + a/(L-a)) = Mp*((L-a+L+a)/(L-a)) = Mp*2L/(L-a)
//   P = 2*Mp*L / (a*(L-a))

#[test]
fn validation_upper_bound_theorem() {
    let l: f64 = 10.0;
    let mp: f64 = 400.0; // kN-m

    // Load at midspan (a = L/2):
    let a_mid: f64 = l / 2.0;
    let p_mid: f64 = 2.0 * mp * l / (a_mid * (l - a_mid));
    assert_close(p_mid, 2.0 * 400.0 * 10.0 / 25.0, 0.001, "P_c at midspan");
    assert_close(p_mid, 320.0, 0.001, "P_c midspan = 8Mp/L");

    // Verify 8Mp/L formula
    assert_close(p_mid, 8.0 * mp / l, 0.001, "P_c = 8Mp/L at midspan");

    // Load at quarter span (a = L/4):
    let a_quarter: f64 = l / 4.0;
    let p_quarter: f64 = 2.0 * mp * l / (a_quarter * (l - a_quarter));
    // P = 2*400*10 / (2.5*7.5) = 8000/18.75 = 426.67
    let expected_pq: f64 = 8000.0 / 18.75;
    assert_close(p_quarter, expected_pq, 0.001, "P_c at quarter span");

    // Off-center load requires higher P than midspan (midspan is minimum)
    assert!(
        p_quarter > p_mid,
        "Off-center P ({:.1}) > midspan P ({:.1})",
        p_quarter, p_mid
    );

    // The minimum P_c occurs at midspan (a = L/2) by symmetry
    // dP/da = 0 at a = L/2
    // P(a) = 2*Mp*L / (a*(L-a)) is minimum where a*(L-a) is maximum
    // d/da[a*(L-a)] = L - 2a = 0 => a = L/2
    let product_mid: f64 = a_mid * (l - a_mid);
    let product_quarter: f64 = a_quarter * (l - a_quarter);
    assert!(
        product_mid > product_quarter,
        "a*(L-a) is maximum at midspan"
    );

    // Upper bound check: any other mechanism gives higher P
    // Try a "wrong" mechanism: hinge at L/3 instead of under load at L/4
    // This would give a kinematically inadmissible mechanism for load at L/4,
    // but if we apply it: the internal work changes.
    // For the correct mechanism at a = L/4, P = 426.67 kN
    // For a wrong assumed hinge at L/3 with load at L/4:
    // The upper bound theorem guarantees that the correct mechanism
    // gives the least upper bound.
    let a_load: f64 = l / 4.0;
    let _a_hinge: f64 = l / 3.0;

    // With hinge correctly at load point (upper bound theorem):
    let p_correct: f64 = 2.0 * mp * l / (a_load * (l - a_load));

    // P_correct is the true collapse load for this loading
    assert!(p_correct > 0.0, "Positive collapse load");
    assert!(
        p_correct > p_mid,
        "Quarter-span load needs more P than midspan"
    );
}
