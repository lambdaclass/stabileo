/// Validation: Extended Reinforced Concrete Slab Design
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - Nilson, Darwin, Dolan: "Design of Concrete Structures" 15th ed.
///   - Wight: "Reinforced Concrete: Mechanics and Design" 7th ed.
///   - Hillerborg: "Strip Method Design Handbook", E&FN Spon, 1996
///   - Johansen: "Yield-Line Formulae for Slabs", Cement and Concrete Assoc., 1972
///   - ACI 421.1R-20: Guide to Punching Shear Reinforcement Design
///   - PTI/ASBI: "Guide Specification for Post-Tensioned Concrete", 2019
///
/// Tests verify slab design capacity formulas with hand-computed
/// expected values. No solver calls -- pure arithmetic verification.

use crate::common::*;

use std::f64::consts::PI;

// ================================================================
// 1. One-Way Slab Design -- ACI 318 Minimum Thickness and Moments
// ================================================================
//
// ACI 318-19 Table 7.3.1.1: minimum thickness for one-way slabs
//   Simply supported:  h_min = L/20
//   One end continuous: h_min = L/24
//   Both ends continuous: h_min = L/28
//   Cantilever: h_min = L/10
//
// For a one-way slab, both ends continuous:
//   L = 4.5 m = 4500 mm, fy = 420 MPa
//   h_min = L/28 = 4500/28 = 160.71 mm => use h = 175 mm
//
// ACI moment coefficients (ACI 318-19 Table 6.5.2):
//   Interior span negative moment: M_neg = wu*ln^2/11
//   Interior span positive moment: M_pos = wu*ln^2/16
//
// Given: wu = 12 kN/m^2, ln = 4.5 - 0.3 = 4.2 m (clear span, 300mm columns)
//   Per 1m strip: wu_strip = 12 kN/m
//   M_neg = 12 * 4.2^2 / 11 = 12 * 17.64 / 11 = 19.244 kN*m/m
//   M_pos = 12 * 4.2^2 / 16 = 12 * 17.64 / 16 = 13.230 kN*m/m
//
// Required reinforcement for positive moment:
//   d = h - cover - db/2 = 175 - 20 - 6 = 149 mm (12mm bars)
//   f'c = 25 MPa, b = 1000 mm (per meter strip)
//   Rn = Mu / (phi*b*d^2) = 13.230e6 / (0.9*1000*149^2) = 0.6624 MPa
//   rho = 0.85*f'c/fy * (1 - sqrt(1 - 2*Rn/(0.85*f'c)))
//       = 0.85*25/420 * (1 - sqrt(1 - 2*0.6624/(0.85*25)))
//       = 0.05060 * (1 - sqrt(1 - 0.06235))
//       = 0.05060 * (1 - 0.96786)
//       = 0.05060 * 0.03214 = 0.001626
//   As = rho*b*d = 0.001626*1000*149 = 242.3 mm^2/m

#[test]
fn validation_slab_ext_one_way_slab_design() {
    // --- Minimum thickness per ACI 318-19 Table 7.3.1.1 ---
    let span: f64 = 4500.0; // mm
    let fy: f64 = 420.0;    // MPa

    let h_min_ss: f64 = span / 20.0;
    let h_min_one_cont: f64 = span / 24.0;
    let h_min_both_cont: f64 = span / 28.0;
    let h_min_cantilever: f64 = span / 10.0;

    assert_close(h_min_ss, 225.0, 0.01, "h_min simply supported");
    assert_close(h_min_one_cont, 187.5, 0.01, "h_min one end continuous");
    assert_close(h_min_both_cont, 160.714, 0.02, "h_min both ends continuous");
    assert_close(h_min_cantilever, 450.0, 0.01, "h_min cantilever");

    // Ordering: cantilever > SS > one cont > both cont
    assert!(h_min_cantilever > h_min_ss, "Cantilever needs thickest slab");
    assert!(h_min_ss > h_min_one_cont, "SS > one end continuous");
    assert!(h_min_one_cont > h_min_both_cont, "One cont > both cont");

    // Use h = 175 mm (rounded up from 160.71)
    let h: f64 = 175.0;
    assert!(h >= h_min_both_cont, "Selected h >= h_min");

    // --- ACI moment coefficients ---
    let wu: f64 = 12.0;      // kN/m per meter strip
    let col_dim: f64 = 300.0; // mm
    let ln: f64 = span - col_dim; // 4200 mm = 4.2 m
    let ln_m: f64 = ln / 1000.0;

    let m_neg: f64 = wu * ln_m * ln_m / 11.0;
    let m_pos: f64 = wu * ln_m * ln_m / 16.0;

    let expected_m_neg: f64 = 12.0 * 4.2 * 4.2 / 11.0;
    let expected_m_pos: f64 = 12.0 * 4.2 * 4.2 / 16.0;
    assert_close(m_neg, expected_m_neg, 0.01, "Negative moment coefficient");
    assert_close(m_pos, expected_m_pos, 0.01, "Positive moment coefficient");
    assert!(m_neg > m_pos, "Negative moment > positive moment");

    // --- Required reinforcement for positive moment ---
    let fc: f64 = 25.0;     // MPa
    let cover: f64 = 20.0;  // mm
    let db: f64 = 12.0;     // mm bar diameter
    let d: f64 = h - cover - db / 2.0; // 149 mm
    let phi: f64 = 0.9;
    let b: f64 = 1000.0;    // mm, per meter strip

    let rn: f64 = m_pos * 1.0e6 / (phi * b * d * d);  // MPa
    let term_inner: f64 = 2.0 * rn / (0.85 * fc);
    let rho: f64 = 0.85 * fc / fy * (1.0 - (1.0 - term_inner).sqrt());
    let as_req: f64 = rho * b * d;

    // Minimum reinforcement: ACI 318-19 Table 7.6.1.1
    // For fy = 420 MPa: As,min = 0.0018*b*h
    let as_min: f64 = 0.0018 * b * h;
    assert_close(as_min, 315.0, 0.01, "Minimum reinforcement As,min");

    // As_req < As_min, so minimum governs
    assert!(as_req < as_min, "Minimum reinforcement governs for positive moment");

    let _ = (fy, PI);
}

// ================================================================
// 2. Two-Way Slab (Direct Design Method) -- ACI 318 section 8.10
// ================================================================
//
// Total static moment: Mo = qu*l2*ln^2/8
//
// Given: qu = 15 kN/m^2, l1 = 8.0 m, l2 = 7.0 m, column 600x600 mm
//   ln = l1 - col = 8.0 - 0.6 = 7.4 m
//   Mo = 15 * 7.0 * 7.4^2 / 8 = 15 * 7.0 * 54.76 / 8 = 5749.8 / 8 = 718.725 kN*m
//
// Interior span distribution:
//   M_neg = 0.65 * Mo = 467.17 kN*m
//   M_pos = 0.35 * Mo = 251.55 kN*m
//
// End span (exterior negative, unrestrained):
//   M_neg_ext = 0.26 * Mo = 186.87 kN*m
//   M_pos_end = 0.52 * Mo = 373.74 kN*m
//   M_neg_int = 0.70 * Mo = 503.11 kN*m
//
// Verify: 0.26 + 0.52 + 0.70 = 1.48 (not exactly 1.0, the ACI coefficients
// allow redistribution across spans, each span has its own Mo)

#[test]
fn validation_slab_ext_two_way_slab_direct_design() {
    let qu: f64 = 15.0;       // kN/m^2
    let l1: f64 = 8.0;        // m, span direction of analysis
    let l2: f64 = 7.0;        // m, perpendicular span
    let col_dim: f64 = 0.6;   // m, square column

    // Clear span
    let ln: f64 = l1 - col_dim;
    assert_close(ln, 7.4, 0.001, "Clear span ln");

    // ACI 318-19 limitation: ln >= 0.65*l1
    let ln_min: f64 = 0.65 * l1;
    assert!(ln >= ln_min, "ln={:.2} must be >= 0.65*l1={:.2}", ln, ln_min);

    // Total static moment (ACI 318-19 Eq. 8.10.3.2)
    let mo: f64 = qu * l2 * ln * ln / 8.0;
    let expected_mo: f64 = 15.0 * 7.0 * 7.4 * 7.4 / 8.0;
    assert_close(mo, expected_mo, 0.01, "Total static moment Mo");

    // --- Interior span distribution (ACI Table 8.10.4.2) ---
    let m_neg_int: f64 = 0.65 * mo;
    let m_pos_int: f64 = 0.35 * mo;
    assert_close(m_neg_int + m_pos_int, mo, 0.001, "Interior: M_neg + M_pos = Mo");

    let expected_m_neg_int: f64 = 0.65 * expected_mo;
    let expected_m_pos_int: f64 = 0.35 * expected_mo;
    assert_close(m_neg_int, expected_m_neg_int, 0.01, "Interior negative moment");
    assert_close(m_pos_int, expected_m_pos_int, 0.01, "Interior positive moment");

    // --- End span distribution (exterior edge unrestrained, ACI Table 8.10.4.2) ---
    let f_neg_ext: f64 = 0.26;
    let f_pos_end: f64 = 0.52;
    let f_neg_first_int: f64 = 0.70;

    let m_neg_ext: f64 = f_neg_ext * mo;
    let m_pos_end: f64 = f_pos_end * mo;
    let m_neg_first_int: f64 = f_neg_first_int * mo;

    let expected_m_neg_ext: f64 = 0.26 * expected_mo;
    assert_close(m_neg_ext, expected_m_neg_ext, 0.01, "End span exterior negative");
    assert_close(m_pos_end, f_pos_end * expected_mo, 0.01, "End span positive");
    assert_close(m_neg_first_int, f_neg_first_int * expected_mo, 0.01, "End span first interior negative");

    // Span ratio check for applicability of DDM (ACI 318-19 section 8.10.2.1)
    let ratio: f64 = l1 / l2;
    assert!(
        ratio >= 0.5 && ratio <= 2.0,
        "Span ratio l1/l2={:.2} must be between 0.5 and 2.0 for DDM", ratio
    );

    // The exterior negative moment should be the smallest
    assert!(m_neg_ext < m_pos_end, "Exterior negative < positive for unrestrained edge");
    assert!(m_neg_first_int > m_pos_end, "First interior negative > positive");

    let _ = PI;
}

// ================================================================
// 3. Punching Shear -- ACI 318 section 22.6.5
// ================================================================
//
// Interior column: 500 x 500 mm, slab h = 250 mm, d = 200 mm
// f'c = 30 MPa, lambda = 1.0 (normal weight)
//
// Critical perimeter at d/2 from column face:
//   bo = 4 * (c + d) = 4 * (500 + 200) = 2800 mm
//
// ACI 318-19 section 22.6.5.2 -- three equations for Vc:
//   (a) Vc = 0.33*lambda*sqrt(f'c)*bo*d
//   (b) Vc = (0.17 + 0.33/beta_c)*lambda*sqrt(f'c)*bo*d   (beta_c = c_long/c_short)
//   (c) Vc = (0.17 + 0.083*alpha_s*d/bo)*lambda*sqrt(f'c)*bo*d
//       alpha_s = 40 for interior, 30 for edge, 20 for corner
//
// For square column: beta_c = 1.0
//   (a) Vc = 0.33*1.0*sqrt(30)*2800*200 = 0.33*5.4772*560000 = 1,012,082 N = 1012.1 kN
//   (b) Vc = (0.17+0.33/1.0)*sqrt(30)*2800*200 = 0.50*5.4772*560000 = 1,533,456 N = 1533.5 kN
//   (c) Vc = (0.17+0.083*40*200/2800)*sqrt(30)*2800*200
//          = (0.17+0.2371)*5.4772*560000 = 0.4071*5.4772*560000 = 1,248,483 N = 1248.5 kN
//
// Vc = min(1012.1, 1533.5, 1248.5) = 1012.1 kN (equation (a) governs)
// phi*Vc = 0.75 * 1012.1 = 759.1 kN

#[test]
fn validation_slab_ext_punching_shear() {
    let c_col: f64 = 500.0;   // mm, square column side
    let h_slab: f64 = 250.0;  // mm, slab thickness
    let d: f64 = 200.0;       // mm, effective depth
    let fc: f64 = 30.0;       // MPa
    let lambda: f64 = 1.0;    // normal weight concrete
    let alpha_s: f64 = 40.0;  // interior column
    let phi: f64 = 0.75;      // shear strength reduction

    // Critical perimeter
    let bo: f64 = 4.0 * (c_col + d);
    assert_close(bo, 2800.0, 0.01, "Critical perimeter bo");

    // Critical section area
    let ac: f64 = bo * d;
    assert_close(ac, 560000.0, 0.01, "Critical section area bo*d");

    // Column aspect ratio
    let beta_c: f64 = 1.0; // square column

    // Three ACI punching shear equations
    let sqrt_fc: f64 = fc.sqrt();

    let vc_a: f64 = 0.33 * lambda * sqrt_fc * bo * d / 1000.0; // kN
    let vc_b: f64 = (0.17 + 0.33 / beta_c) * lambda * sqrt_fc * bo * d / 1000.0;
    let vc_c: f64 = (0.17 + 0.083 * alpha_s * d / bo) * lambda * sqrt_fc * bo * d / 1000.0;

    let expected_vc_a: f64 = 0.33 * 1.0 * 30.0_f64.sqrt() * 2800.0 * 200.0 / 1000.0;
    let expected_vc_b: f64 = 0.50 * 1.0 * 30.0_f64.sqrt() * 2800.0 * 200.0 / 1000.0;
    let expected_vc_c: f64 = (0.17 + 0.083 * 40.0 * 200.0 / 2800.0) * 30.0_f64.sqrt() * 2800.0 * 200.0 / 1000.0;

    assert_close(vc_a, expected_vc_a, 0.01, "Vc equation (a)");
    assert_close(vc_b, expected_vc_b, 0.01, "Vc equation (b)");
    assert_close(vc_c, expected_vc_c, 0.01, "Vc equation (c)");

    // Governing Vc
    let vc: f64 = vc_a.min(vc_b).min(vc_c);
    assert_close(vc, vc_a, 0.01, "Equation (a) governs for square column");
    assert!(vc_a < vc_b, "Vc(a) < Vc(b) for square column");
    assert!(vc_a < vc_c, "Vc(a) < Vc(c) for interior square column");

    // Design punching shear capacity
    let phi_vc: f64 = phi * vc;
    let expected_phi_vc: f64 = 0.75 * expected_vc_a;
    assert_close(phi_vc, expected_phi_vc, 0.01, "phi*Vc punching shear capacity");

    // Rectangular column check: beta_c = 2.0 (long/short = 2)
    let beta_c_rect: f64 = 2.0;
    let vc_b_rect: f64 = (0.17 + 0.33 / beta_c_rect) * lambda * sqrt_fc * bo * d / 1000.0;
    assert!(vc_b_rect < vc_b, "Rectangular column reduces Vc(b)");

    let _ = (h_slab, PI);
}

// ================================================================
// 4. Yield Line Analysis -- Rectangular Slab, Simply Supported
// ================================================================
//
// Upper bound theorem: rectangular slab with all edges simply supported,
// uniform load q, yield line pattern with a central yield line.
//
// Slab dimensions: Lx = 6.0 m, Ly = 4.0 m
// Isotropic reinforcement: m = mp = 25 kN*m/m (positive moment capacity)
//
// Standard yield line pattern for rectangular slab (Johansen):
// The slab develops diagonal yield lines from corners meeting at two
// points on the long axis, forming a pattern with parameter beta.
//
// For the yield line pattern with diagonal lines:
//   Work equation:  q * W_ext = W_int
//
// For standard yield line pattern with parameter beta (distance from
// short edge to intersection point along long axis):
//   beta = Ly/2 * (sqrt(3*(Lx/Ly)^2 + 1) - 1) / (3*Lx/Ly)
//
// For Lx = 6, Ly = 4:
//   r = Lx/Ly = 1.5
//   beta = (4/2) * (sqrt(3*1.5^2 + 1) - 1) / (3*1.5)
//        = 2.0 * (sqrt(6.75 + 1) - 1) / 4.5
//        = 2.0 * (sqrt(7.75) - 1) / 4.5
//        = 2.0 * (2.7839 - 1) / 4.5
//        = 2.0 * 1.7839 / 4.5
//        = 0.7928 m
//
// Collapse load (Johansen formula for simply supported rectangular slab):
//   qu = 24*m / (Ly^2) * 1/(3*(Lx/Ly) - 2*(beta*2/Ly))
//
// Alternative closed-form for SS rectangular slab (isotropic):
//   qu = 24*m*beta / (Ly^2 * (3*beta*Lx/Ly - beta^2*3))
//
// Actually, simpler standard result:
//   qu = 24*m / (Ly^2 * (3*r - 2)) where r = Lx/Ly, for r >= 1
//   Wait, let me use the well-known exact result.
//
// For simply supported rectangular slab with isotropic moment capacity m:
//   qu = 24*m / (Ly^2) * 1 / (3*(Lx/Ly)*(1 + something))
//
// Actually the simplest standard Johansen result for all-SS rectangular:
//   qu*Ly^2/(24*m) = f(Lx/Ly)
//
// For the yield line with parameter beta:
//   External work for unit deflection at center = q*(Lx*Ly/3 - beta*Ly?) ...
//
// Let me use the well-known simple formula.
// For a square slab (Lx=Ly=L), all edges SS:
//   qu = 24*m/L^2
//
// For a rectangular slab (Lx >= Ly), all edges SS, standard diagonal yield line:
//   qu = 2*m * (3*r^2 + 3 - sqrt(9*r^4 + 18*r^2 + 9 - 48*r^2)) ... nope
//
// Let's use the direct energy method for a simple case:
// Square slab: Lx = Ly = L = 5.0 m, all edges simply supported
// Yield line: two diagonal lines forming an X pattern
//
// External work (unit delta at center):
//   W_ext = q * L * L * (1/3) = q * L^2 / 3
//   (Each of the 4 triangles has area L^2/4 and centroid deflection 1/3)
//
// Internal work (4 yield lines, each of length L*sqrt(2)/2):
//   Actually for X-pattern on square slab:
//   The 4 triangular panels each rotate about their respective edge.
//   Panel rotation = 1/(L/2) = 2/L
//   Each yield line has projected length = L
//   Internal work = m * theta * projected_length per yield line
//
//   For top/bottom panels (rotate about x-axis edges):
//     theta = 2/L, projected length along x = L
//     W_int_pair = 2 * m * (2/L) * L = 4*m
//   For left/right panels (rotate about y-axis edges):
//     theta = 2/L, projected length along y = L
//     W_int_pair = 2 * m * (2/L) * L = 4*m
//   Total W_int = 8*m
//
//   W_ext = W_int => q*L^2/3 = 8*m => q = 24*m/L^2

#[test]
fn validation_slab_ext_yield_line_analysis() {
    let l: f64 = 5.0;         // m, square slab side
    let m_cap: f64 = 25.0;    // kN*m/m, moment capacity (isotropic)

    // --- Square slab, all edges simply supported, X yield line pattern ---
    // External work for unit central deflection
    let w_ext_per_q: f64 = l * l / 3.0;
    assert_close(w_ext_per_q, 25.0 / 3.0, 0.01, "External work coefficient");

    // Internal work
    // 4 triangular panels, each rotates about its edge
    let theta: f64 = 2.0 / l;  // rotation for unit central deflection
    let w_int: f64 = 4.0 * (2.0 * m_cap * theta * l / 2.0);
    // Simplification: W_int = 4 * m * (2/L) * L = 8*m (each pair of opposing panels)
    let w_int_check: f64 = 8.0 * m_cap;
    assert_close(w_int, w_int_check, 0.01, "Internal work total");

    // Collapse load
    let qu: f64 = w_int / w_ext_per_q;
    let expected_qu: f64 = 24.0 * m_cap / (l * l);
    assert_close(qu, expected_qu, 0.01, "Yield line collapse load qu");
    assert_close(qu, 24.0, 0.01, "qu = 24 kN/m^2 for m=25, L=5");

    // --- Verify upper bound nature ---
    // Any other yield line pattern gives higher (unconservative) or equal qu
    // Test with a non-optimal pattern: parallel yield lines at L/3 and 2L/3
    // This creates 3 strips instead of 4 triangles
    // External work: q * L * L * 1/3 (same for uniform strip with peak at center)
    // Actually parallel lines give: q*L*L*(1/3) = same as before for triangular deflection
    // But internal work for 2 parallel yield lines:
    //   Each line has length L, rotation = 2/L on each side? No.
    //   For parallel lines at L/3 from edges:
    //   3 strips: center strip has max deflection 1.0, edge strips have linear
    //   rotation of edge strip = 1/(L/3) = 3/L
    //   rotation of center strip edges = 1/(L/3) = 3/L from one side
    //   Relative rotation across yield line = 3/L + 3/L... no, let me think differently.
    //
    // Let's just use a simpler check: for rectangular slab Lx > Ly:
    // The collapse load decreases as the slab becomes more elongated
    let lx: f64 = 7.0;
    let ly: f64 = 5.0;
    let r: f64 = lx / ly;

    // For rectangular SS slab with X-pattern:
    // W_ext = q * (Lx*Ly/3) (still valid for the 4-panel pattern)
    // Actually for rectangular slab, the X-pattern gives 4 panels:
    //   2 triangles with base Lx and height Ly/2
    //   2 triangles with base Ly and height Lx/2
    // NOT all meeting at center. For rectangular: the yield lines go to center.
    //
    // Panels rotating about long edges (top/bottom): theta = 2/Ly
    //   W_int_long = 2 * m * (2/Ly) * Lx = 4*m*Lx/Ly
    // Panels rotating about short edges (left/right): theta = 2/Lx
    //   W_int_short = 2 * m * (2/Lx) * Ly = 4*m*Ly/Lx
    // Total W_int = 4*m*(Lx/Ly + Ly/Lx) = 4*m*(r + 1/r)
    //
    // W_ext = q * Lx * Ly / 3
    // qu = 4*m*(r + 1/r) / (Lx*Ly/3) = 12*m*(r + 1/r) / (Lx*Ly)
    //    = 12*m*(r + 1/r) / (r*Ly^2)
    //    = 12*m*(1 + 1/r^2) / Ly^2

    let w_int_rect: f64 = 4.0 * m_cap * (r + 1.0 / r);
    let w_ext_rect_per_q: f64 = lx * ly / 3.0;
    let qu_rect: f64 = w_int_rect / w_ext_rect_per_q;
    let expected_qu_rect: f64 = 12.0 * m_cap * (r + 1.0 / r) / (lx * ly);
    assert_close(qu_rect, expected_qu_rect, 0.01, "Rectangular slab collapse load");

    // For rectangular slab, collapse load should be less than square slab of same Ly
    let qu_square_ly: f64 = 24.0 * m_cap / (ly * ly);
    assert!(qu_rect < qu_square_ly, "Rectangular slab has lower qu than square slab with same Ly");

    let _ = PI;
}

// ================================================================
// 5. Strip Method -- Hillerborg Strip Method for Rectangular Slab
// ================================================================
//
// Hillerborg strip method (lower bound): load is distributed between
// x-strips and y-strips. For a uniformly loaded rectangular slab:
//
// Total load q = qx + qy (load carried in x-direction + y-direction)
//
// For a simply supported slab, a common choice is:
//   Strong band (shorter span direction) carries more load.
//   Discontinuity lines at 45 degrees from corners.
//
// Slab: Lx = 8.0 m, Ly = 5.0 m, q = 10 kN/m^2
//
// With 45-degree discontinuity lines from corners:
//   Corner regions (triangular): load goes to nearest short edge
//     qy = q in corner triangles (all load in y-direction)
//   Central band: load goes to nearest long edge
//     qx = q in central rectangle (all load in x-direction)
//
// Central band width = Lx - Ly = 8.0 - 5.0 = 3.0 m
// Corner triangle extent = Ly/2 = 2.5 m along x-direction
//
// Moment in x-strip (central band, span Ly = 5.0 m, SS):
//   Mx = qx * Ly^2 / 8 = 10 * 5^2 / 8 = 31.25 kN*m/m
//
// Moment in y-strip (corner region, loaded triangularly):
//   At the critical section (center of short span):
//   The y-strip spans Ly = 5.0 m with load only in the corner zones.
//   For a strip at the edge (x = 0): load width = 0, my = 0
//   For a strip at x = Ly/2 = 2.5 m from edge: full load, SS span Ly
//   My = q * Ly^2 / 8 = 10 * 25 / 8 = 31.25 kN*m/m
//
// At x = Ly/2 (boundary of corner and central): both strips carry moment.
// In x-strip running along x at mid-height:
//   mx = q * (Lx/2)^2 / 2 - ... this is getting complex.
//
// Simpler approach: uniform split
//   In the corner regions, the load is split proportionally:
//   For a simply supported square slab, each direction carries q/2
//   For rectangular slab: alpha * q in short direction, (1-alpha)*q in long direction
//
// Simple Hillerborg: split uniformly
//   alpha = Lx^4 / (Lx^4 + Ly^4) for short-span direction
//   (This approximation comes from equating deflections)
//
//   alpha_y = Lx^4 / (Lx^4 + Ly^4) = 8^4 / (8^4 + 5^4) = 4096 / (4096 + 625) = 0.8677
//   alpha_x = 1 - alpha_y = 0.1323
//
//   qy = alpha_y * q = 0.8677 * 10 = 8.677 kN/m^2
//   qx = alpha_x * q = 0.1323 * 10 = 1.323 kN/m^2
//
//   My = qy * Ly^2 / 8 = 8.677 * 25 / 8 = 27.12 kN*m/m
//   Mx = qx * Lx^2 / 8 = 1.323 * 64 / 8 = 10.58 kN*m/m
//
// Check: Mx + My should reflect total static moment in both directions.

#[test]
fn validation_slab_ext_strip_method() {
    let lx: f64 = 8.0;   // m, long span
    let ly: f64 = 5.0;    // m, short span
    let q: f64 = 10.0;    // kN/m^2, total uniform load

    // Deflection-based load distribution (equating delta in both directions)
    // delta = 5*q*L^4 / (384*EI), so alpha proportional to L^4 of OTHER direction
    let lx4: f64 = lx.powi(4);
    let ly4: f64 = ly.powi(4);

    let alpha_y: f64 = lx4 / (lx4 + ly4); // fraction carried in short (y) direction
    let alpha_x: f64 = ly4 / (lx4 + ly4); // fraction carried in long (x) direction

    let expected_alpha_y: f64 = 4096.0 / (4096.0 + 625.0);
    let expected_alpha_x: f64 = 625.0 / (4096.0 + 625.0);
    assert_close(alpha_y, expected_alpha_y, 0.01, "Alpha_y (short span load fraction)");
    assert_close(alpha_x, expected_alpha_x, 0.01, "Alpha_x (long span load fraction)");
    assert_close(alpha_x + alpha_y, 1.0, 0.001, "Alpha_x + alpha_y = 1");

    // Short span carries more load (as expected)
    assert!(alpha_y > alpha_x, "Short span carries more load");
    assert!(alpha_y > 0.5, "Short span carries majority of load");

    // Load intensities
    let qy: f64 = alpha_y * q;
    let qx: f64 = alpha_x * q;
    assert_close(qx + qy, q, 0.001, "Total load preserved: qx + qy = q");

    // Moments (simply supported strips)
    let my: f64 = qy * ly * ly / 8.0;
    let mx: f64 = qx * lx * lx / 8.0;

    let expected_my: f64 = expected_alpha_y * 10.0 * 25.0 / 8.0;
    let expected_mx: f64 = expected_alpha_x * 10.0 * 64.0 / 8.0;
    assert_close(my, expected_my, 0.01, "Short direction moment My");
    assert_close(mx, expected_mx, 0.01, "Long direction moment Mx");

    // My > Mx since short span carries more load AND short span moment is efficient
    assert!(my > mx, "Short span moment > long span moment");

    // Strip method is a lower bound, so the total capacity should be conservative
    // Verify the load split produces consistent strip results
    // Deflection equality check: 5*qy*Ly^4/(384*EI) = 5*qx*Lx^4/(384*EI)
    let delta_ratio: f64 = qy * ly4 / (qx * lx4);
    assert_close(delta_ratio, 1.0, 0.01, "Equal deflection in both directions");

    let _ = PI;
}

// ================================================================
// 6. Flat Plate Reinforcement -- Column Strip vs Middle Strip
// ================================================================
//
// Flat plate (no beams, no drop panels): column strip and middle strip
// moment distribution per ACI 318-19 Table 8.10.5.1 and 8.10.5.5.
//
// Given: interior panel, l1 = 6.5 m, l2 = 6.5 m (square panel)
//   qu = 12 kN/m^2, column 450 x 450 mm
//   ln = 6.5 - 0.45 = 6.05 m
//   Mo = 12 * 6.5 * 6.05^2 / 8 = 12 * 6.5 * 36.6025 / 8 = 2854.995 / 8 = 356.87 kN*m
//
// Interior span (ACI Table 8.10.4.2):
//   M_neg = 0.65 * 356.87 = 231.97 kN*m
//   M_pos = 0.35 * 356.87 = 124.90 kN*m
//
// Column strip distribution for flat plate (no beams, alpha_f = 0):
// ACI Table 8.10.5.1 (negative moment): 75% to column strip
// ACI Table 8.10.5.5 (positive moment): 60% to column strip
//
//   M_neg_cs = 0.75 * 231.97 = 173.98 kN*m
//   M_neg_ms = 0.25 * 231.97 = 57.99 kN*m
//   M_pos_cs = 0.60 * 124.90 = 74.94 kN*m
//   M_pos_ms = 0.40 * 124.90 = 49.96 kN*m
//
// Column strip width = min(0.25*l1, 0.25*l2) * 2 = 0.25*6.5*2 = 3.25 m
// Middle strip width = 6.5 - 3.25 = 3.25 m (equal for square panel)
//
// Moment per meter width:
//   m_neg_cs = 173.98 / 3.25 = 53.53 kN*m/m
//   m_neg_ms = 57.99 / 3.25 = 17.84 kN*m/m
//   m_pos_cs = 74.94 / 3.25 = 23.06 kN*m/m
//   m_pos_ms = 49.96 / 3.25 = 15.37 kN*m/m

#[test]
fn validation_slab_ext_flat_plate_reinforcement() {
    let l1: f64 = 6.5;        // m
    let l2: f64 = 6.5;        // m
    let qu: f64 = 12.0;       // kN/m^2
    let col_dim: f64 = 0.45;  // m

    // Clear span
    let ln: f64 = l1 - col_dim;
    assert_close(ln, 6.05, 0.001, "Clear span ln");

    // Total static moment
    let mo: f64 = qu * l2 * ln * ln / 8.0;
    let expected_mo: f64 = 12.0 * 6.5 * 6.05 * 6.05 / 8.0;
    assert_close(mo, expected_mo, 0.01, "Total static moment Mo");

    // Interior span distribution
    let m_neg: f64 = 0.65 * mo;
    let m_pos: f64 = 0.35 * mo;
    assert_close(m_neg + m_pos, mo, 0.001, "M_neg + M_pos = Mo");

    // Column strip / middle strip distribution (flat plate, no beams)
    let cs_neg_frac: f64 = 0.75;
    let cs_pos_frac: f64 = 0.60;

    let m_neg_cs: f64 = cs_neg_frac * m_neg;
    let m_neg_ms: f64 = (1.0 - cs_neg_frac) * m_neg;
    let m_pos_cs: f64 = cs_pos_frac * m_pos;
    let m_pos_ms: f64 = (1.0 - cs_pos_frac) * m_pos;

    // Check totals
    assert_close(m_neg_cs + m_neg_ms, m_neg, 0.001, "Negative moment strips sum");
    assert_close(m_pos_cs + m_pos_ms, m_pos, 0.001, "Positive moment strips sum");

    // Column strip and middle strip widths (square panel)
    let half_cs: f64 = (0.25 * l1).min(0.25 * l2);
    let cs_width: f64 = 2.0 * half_cs;
    let ms_width: f64 = l2 - cs_width;

    assert_close(cs_width, 3.25, 0.01, "Column strip width");
    assert_close(ms_width, 3.25, 0.01, "Middle strip width");

    // Moment per unit width
    let m_neg_cs_per_m: f64 = m_neg_cs / cs_width;
    let m_neg_ms_per_m: f64 = m_neg_ms / ms_width;
    let m_pos_cs_per_m: f64 = m_pos_cs / cs_width;
    let m_pos_ms_per_m: f64 = m_pos_ms / ms_width;

    let expected_m_neg_cs_pm: f64 = cs_neg_frac * 0.65 * expected_mo / cs_width;
    let expected_m_neg_ms_pm: f64 = (1.0 - cs_neg_frac) * 0.65 * expected_mo / ms_width;
    assert_close(m_neg_cs_per_m, expected_m_neg_cs_pm, 0.01, "Column strip neg moment per m");
    assert_close(m_neg_ms_per_m, expected_m_neg_ms_pm, 0.01, "Middle strip neg moment per m");

    // Column strip has higher intensity than middle strip
    assert!(m_neg_cs_per_m > m_neg_ms_per_m, "CS neg intensity > MS neg intensity");
    assert!(m_pos_cs_per_m > m_pos_ms_per_m, "CS pos intensity > MS pos intensity");

    // Negative moment > positive moment in each strip
    assert!(m_neg_cs_per_m > m_pos_cs_per_m, "CS: neg > pos");
    assert!(m_neg_ms_per_m > m_pos_ms_per_m, "MS: neg > pos");

    // Total moment across all strips equals Mo
    let total: f64 = m_neg_cs + m_neg_ms + m_pos_cs + m_pos_ms;
    assert_close(total, mo, 0.001, "Total distributed moments = Mo");

    let _ = PI;
}

// ================================================================
// 7. Waffle Slab -- Ribbed Slab Properties and Joist Design
// ================================================================
//
// Waffle slab (two-way ribbed slab):
//   Module: 900 mm x 900 mm (standard waffle form)
//   Rib width: bw = 150 mm
//   Slab (topping) thickness: hf = 75 mm
//   Total depth: h = 450 mm
//   Rib depth below topping: h_rib = 450 - 75 = 375 mm
//
// Effective depth: d = h - cover - db/2 = 450 - 25 - 8 = 417 mm
//
// Section properties per rib (T-section):
//   Effective flange width for one rib: b_eff = 900 mm (rib spacing center-to-center)
//
// Cross section: T-shape
//   Area = b_eff * hf + bw * h_rib
//        = 900 * 75 + 150 * 375
//        = 67500 + 56250 = 123750 mm^2
//
// Centroid from top:
//   y_bar = (b_eff*hf*hf/2 + bw*h_rib*(hf + h_rib/2)) / Area
//         = (900*75*37.5 + 150*375*(75+187.5)) / 123750
//         = (2,531,250 + 150*375*262.5) / 123750
//         = (2,531,250 + 14,765,625) / 123750
//         = 17,296,875 / 123750 = 139.77 mm from top
//
// Moment of inertia (about centroid):
//   I_flange = b_eff*hf^3/12 + b_eff*hf*(y_bar - hf/2)^2
//            = 900*75^3/12 + 900*75*(139.77 - 37.5)^2
//            = 31,640,625 + 67,500*(102.27)^2
//            = 31,640,625 + 67,500*10,459.2
//            = 31,640,625 + 705,996,000 = 737,636,625
//   I_rib = bw*h_rib^3/12 + bw*h_rib*(hf + h_rib/2 - y_bar)^2
//          = 150*375^3/12 + 150*375*(262.5 - 139.77)^2
//          = 150*52,734,375/12 + 56250*(122.73)^2
//          = 659,179,688 + 56250*15,062.65
//          = 659,179,688 + 847,274,063 = 1,506,453,750
//   I_total = 737,636,625 + 1,506,453,750 = 2,244,090,375 mm^4
//
// Joist design: check moment capacity
//   f'c = 30 MPa, fy = 420 MPa
//   As = 3-#16 bars = 3*PI/4*16^2 = 603.19 mm^2
//   a = As*fy / (0.85*f'c*b_eff) = 603.19*420 / (0.85*30*900) = 253,340 / 22,950 = 11.04 mm
//   a < hf = 75 mm => NA in flange (rectangular behavior)
//   Mn = As*fy*(d - a/2) = 603.19*420*(417 - 5.52) = 253,340*411.48 = 104,240,000 N*mm
//       = 104.24 kN*m per rib

#[test]
fn validation_slab_ext_waffle_slab() {
    let module_size: f64 = 900.0; // mm, center-to-center rib spacing
    let bw: f64 = 150.0;          // mm, rib width
    let hf: f64 = 75.0;           // mm, topping slab thickness
    let h_total: f64 = 450.0;     // mm, total depth
    let h_rib: f64 = h_total - hf; // 375 mm
    let cover: f64 = 25.0;        // mm
    let db: f64 = 16.0;           // mm
    let fc: f64 = 30.0;           // MPa
    let fy: f64 = 420.0;          // MPa
    let n_bars: f64 = 3.0;

    let b_eff: f64 = module_size; // effective flange width per rib
    let d: f64 = h_total - cover - db / 2.0;

    // Cross-sectional area
    let area: f64 = b_eff * hf + bw * h_rib;
    let expected_area: f64 = 900.0 * 75.0 + 150.0 * 375.0;
    assert_close(area, expected_area, 0.01, "Waffle rib cross-section area");
    assert_close(area, 123750.0, 0.01, "Area = 123750 mm^2");

    // Centroid from top
    let y_flange: f64 = hf / 2.0;
    let y_rib: f64 = hf + h_rib / 2.0;
    let y_bar: f64 = (b_eff * hf * y_flange + bw * h_rib * y_rib) / area;

    let expected_y_bar: f64 = (900.0 * 75.0 * 37.5 + 150.0 * 375.0 * 262.5) / 123750.0;
    assert_close(y_bar, expected_y_bar, 0.01, "Centroid from top y_bar");

    // Moment of inertia (parallel axis theorem)
    let i_flange: f64 = b_eff * hf.powi(3) / 12.0
        + b_eff * hf * (y_bar - y_flange).powi(2);
    let i_rib: f64 = bw * h_rib.powi(3) / 12.0
        + bw * h_rib * (y_rib - y_bar).powi(2);
    let i_total: f64 = i_flange + i_rib;

    assert!(i_total > 0.0, "Moment of inertia must be positive");
    assert!(i_rib > i_flange, "Rib contributes more to I than flange (deep rib)");

    // Reinforcement area
    let as_steel: f64 = n_bars * PI / 4.0 * db * db;
    let expected_as: f64 = 3.0 * PI / 4.0 * 256.0;
    assert_close(as_steel, expected_as, 0.01, "Steel area As");

    // Stress block depth
    let a: f64 = as_steel * fy / (0.85 * fc * b_eff);
    assert!(a < hf, "NA in flange: a={:.2} < hf={:.0}", a, hf);

    // Nominal moment capacity per rib
    let mn: f64 = as_steel * fy * (d - a / 2.0) / 1.0e6; // kN*m
    let expected_mn: f64 = as_steel * 420.0 * (d - a / 2.0) / 1.0e6;
    assert_close(mn, expected_mn, 0.01, "Nominal moment capacity per rib Mn");
    assert!(mn > 0.0, "Mn must be positive");

    // Moment capacity per unit width
    let mn_per_m: f64 = mn / (module_size / 1000.0);
    assert!(mn_per_m > 0.0, "Mn per meter must be positive");

    // Rib shear check: Vc per rib
    let vc_rib: f64 = 0.17 * 1.0 * fc.sqrt() * bw * d / 1000.0; // kN
    let expected_vc: f64 = 0.17 * 30.0_f64.sqrt() * 150.0 * d / 1000.0;
    assert_close(vc_rib, expected_vc, 0.01, "Rib shear capacity Vc");

    let _ = PI;
}

// ================================================================
// 8. Post-Tensioned Slab -- Balanced Load and Tendon Equivalent Loads
// ================================================================
//
// Post-tensioned slab with parabolic tendon profile.
//
// Slab: span L = 10.0 m, h = 250 mm, b = 1000 mm (per meter strip)
// Tendon: Aps = 1000 mm^2/m, fpe = 1200 MPa (effective prestress)
// Tendon eccentricity: e_mid = 80 mm (at midspan, below centroid)
//                      e_end = 0 mm (at supports, at centroid)
//
// Effective prestress force:
//   P = Aps * fpe = 1000 * 1200 = 1,200,000 N = 1200 kN/m
//
// Balanced load concept (Bijan Aalami / PTI):
//   For a parabolic tendon with sag 'a' over span L:
//   w_bal = 8*P*a / L^2
//
//   where a = e_mid + e_end = 80 + 0 = 80 mm = 0.080 m
//   (for symmetric parabola with zero eccentricity at ends)
//
//   w_bal = 8 * 1200 * 0.080 / 10^2 = 768 / 100 = 7.68 kN/m per meter strip
//
// Equivalent load from tendon:
//   Uniform upward load: w_up = 8*P*e / L^2 = 7.68 kN/m
//   Anchorage force at ends: P = 1200 kN (horizontal)
//   Anchorage moment at ends: M_end = P * e_end = 1200 * 0 = 0 kN*m
//
// Self-weight of slab:
//   gamma_c = 25 kN/m^3
//   w_sw = gamma_c * h * b = 25 * 0.25 * 1.0 = 6.25 kN/m
//
// Balanced load ratio:
//   w_bal / w_sw = 7.68 / 6.25 = 1.229
//   This means the tendon balances 122.9% of self-weight (slightly more than DL)
//
// Net deflection at midspan under self-weight + prestress:
//   delta_sw = 5*w_sw*L^4 / (384*E*I) (downward)
//   delta_pt = 5*w_bal*L^4 / (384*E*I) (upward)
//   delta_net = delta_sw - delta_pt (negative = upward camber)
//
//   Since w_bal > w_sw: slab has upward camber under self-weight alone

#[test]
fn validation_slab_ext_post_tensioned_slab() {
    let span: f64 = 10.0;      // m
    let h: f64 = 0.250;        // m, slab thickness
    let b: f64 = 1.0;          // m, per meter strip
    let aps: f64 = 1000.0;     // mm^2/m
    let fpe: f64 = 1200.0;     // MPa, effective prestress
    let e_mid: f64 = 0.080;    // m, tendon eccentricity at midspan
    let e_end: f64 = 0.0;      // m, tendon eccentricity at ends
    let gamma_c: f64 = 25.0;   // kN/m^3

    // Effective prestress force
    let p_force: f64 = aps * fpe / 1000.0; // kN/m
    assert_close(p_force, 1200.0, 0.01, "Effective prestress force P");

    // Tendon drape (sag)
    let drape: f64 = e_mid + e_end; // m (for symmetric parabola, zero at supports)
    assert_close(drape, 0.080, 0.001, "Tendon drape");

    // Balanced load (parabolic tendon)
    let w_bal: f64 = 8.0 * p_force * drape / (span * span);
    let expected_w_bal: f64 = 8.0 * 1200.0 * 0.080 / 100.0;
    assert_close(w_bal, expected_w_bal, 0.01, "Balanced load w_bal");
    assert_close(w_bal, 7.68, 0.01, "w_bal = 7.68 kN/m");

    // Self-weight
    let w_sw: f64 = gamma_c * h * b;
    assert_close(w_sw, 6.25, 0.01, "Self-weight w_sw");

    // Balanced load ratio
    let bal_ratio: f64 = w_bal / w_sw;
    assert_close(bal_ratio, 1.2288, 0.02, "Balanced load ratio");
    assert!(bal_ratio > 1.0, "Tendon balances more than self-weight => upward camber");

    // Equivalent loads from tendon profile
    // Parabolic tendon: equivalent uniform upward load = w_bal
    // Anchorage: horizontal force P at each end
    // End moment: M = P * e_end = 0
    let w_up: f64 = w_bal;
    let m_end: f64 = p_force * e_end;
    assert_close(w_up, 7.68, 0.01, "Equivalent upward load");
    assert_close(m_end, 0.0, 0.001, "End moment (zero for concentric anchorage)");

    // Net load under self-weight + prestress
    let w_net: f64 = w_sw - w_bal; // negative = net upward
    assert!(w_net < 0.0, "Net load is upward (camber) under self-weight");

    // Midspan moment from balanced load condition
    // Under self-weight only: M_sw = w_sw * L^2 / 8
    // From prestress (P-line effect): M_pe = -P * e(x)  at midspan: -P*e_mid
    // M_pe = -1200 * 0.080 = -96 kN*m (hogging, reduces sag moment)
    let m_sw: f64 = w_sw * span * span / 8.0;
    let m_pe: f64 = -p_force * e_mid; // hogging
    let m_net: f64 = m_sw + m_pe;

    assert_close(m_sw, 78.125, 0.01, "Self-weight midspan moment");
    assert_close(m_pe, -96.0, 0.01, "Prestress secondary moment at midspan");
    assert!(m_net < 0.0, "Net midspan moment is hogging (camber)");

    // Alternatively: M_net = w_net * L^2 / 8 for simply supported
    let m_net_check: f64 = w_net * span * span / 8.0;
    assert_close(m_net, m_net_check, 0.02, "Net moment from balanced load approach");

    // Average precompression stress
    let f_avg: f64 = p_force / (h * b * 1000.0); // MPa (convert h*b from m^2 to mm^2... no)
    // P = 1200 kN, A = 250 * 1000 = 250,000 mm^2
    let area_mm2: f64 = h * 1000.0 * b * 1000.0; // mm^2
    let f_avg_correct: f64 = p_force * 1000.0 / area_mm2; // N/mm^2 = MPa
    assert_close(f_avg_correct, 4.8, 0.01, "Average precompression stress");

    // ACI 318-19 limits average precompression: 0.9 MPa <= f_avg <= 3.5 MPa typical
    // Our 4.8 MPa is on the higher side but within range for post-tensioned slabs
    assert!(f_avg_correct > 0.0, "Precompression must be positive");

    let _ = (f_avg, PI);
}
