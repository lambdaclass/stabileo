/// Validation: Foundation Engineering Extended
///
/// References:
///   - Terzaghi (1943): "Theoretical Soil Mechanics", Wiley
///   - Meyerhof (1963): "Some Recent Research on the Bearing Capacity of Foundations"
///   - Das, "Principles of Foundation Engineering", 9th Ed.
///   - Bowles, "Foundation Analysis and Design", 5th Ed.
///   - Tomlinson, "Pile Design and Construction Practice", 6th Ed.
///   - Broms (1964): "Lateral Resistance of Piles in Cohesive Soils" / "...Cohesionless Soils"
///   - Terzaghi (1925): 1D consolidation theory
///   - Coduto, "Foundation Design: Principles and Practices", 3rd Ed.
///
/// Tests:
///   1. Terzaghi bearing capacity — strip, square, circular with shape factors
///   2. Meyerhof general bearing capacity — inclination, depth, shape factors
///   3. Pile capacity — alpha method (clay) + beta method (sand), skin + end bearing
///   4. Pile group efficiency — Converse-Labarre formula, block failure check
///   5. Mat foundation — Winkler model, rigid vs flexible contact pressure
///   6. Combined footing — trapezoidal vs rectangular under two columns
///   7. Lateral pile capacity — Broms method for short/long piles
///   8. Settlement — immediate elastic, Terzaghi 1D consolidation, secondary compression

mod helpers;

use helpers::assert_close;
use std::f64::consts::PI;

// ================================================================
// 1. Terzaghi Bearing Capacity — Shape Factors for Strip/Square/Circular
// ================================================================
//
// Terzaghi's bearing capacity equation:
//   qu = c·Nc·sc + q·Nq + 0.5·gamma·B·Ngamma·sgamma
//
// Shape factors (Terzaghi):
//   Strip:    sc = 1.0,  sgamma = 1.0
//   Square:   sc = 1.3,  sgamma = 0.8
//   Circular: sc = 1.3,  sgamma = 0.6
//
// Bearing capacity factors for phi = 20 deg (Terzaghi):
//   Nc = 17.69, Nq = 7.44, Ngamma = 5.0
//   (From Terzaghi's original tables, also in Das Table 4.1)
//
// Given:
//   c = 25 kPa, gamma = 17 kN/m^3, Df = 1.5 m, B = 2.0 m
//   q = gamma * Df = 25.5 kPa
//
// Strip:  qu = 25*17.69*1.0 + 25.5*7.44 + 0.5*17*2*5.0*1.0
//            = 442.25 + 189.72 + 85.0 = 716.97 kPa
//
// Square: qu = 25*17.69*1.3 + 25.5*7.44 + 0.5*17*2*5.0*0.8
//            = 574.93 + 189.72 + 68.0 = 832.65 kPa
//
// Circular: qu = 25*17.69*1.3 + 25.5*7.44 + 0.5*17*2*5.0*0.6
//              = 574.93 + 189.72 + 51.0 = 815.65 kPa

#[test]
fn validation_found_ext_terzaghi_bearing_capacity() {
    let c = 25.0;       // kPa
    let gamma = 17.0;   // kN/m^3
    let df = 1.5;       // m
    let b = 2.0;        // m
    let q = gamma * df;  // 25.5 kPa

    // Terzaghi bearing capacity factors for phi = 20 deg
    let nc = 17.69;
    let nq = 7.44;
    let n_gamma = 5.0;

    // Verify overburden
    assert_close(q, 25.5, 0.01, "Overburden pressure q = gamma*Df");

    // --- Strip footing (sc = 1.0, sgamma = 1.0) ---
    let sc_strip = 1.0;
    let sg_strip = 1.0;
    let qu_strip = c * nc * sc_strip + q * nq + 0.5 * gamma * b * n_gamma * sg_strip;
    assert_close(qu_strip, 716.97, 0.02, "Terzaghi strip footing qu");

    // --- Square footing (sc = 1.3, sgamma = 0.8) ---
    let sc_sq = 1.3;
    let sg_sq = 0.8;
    let qu_sq = c * nc * sc_sq + q * nq + 0.5 * gamma * b * n_gamma * sg_sq;
    assert_close(qu_sq, 832.65, 0.02, "Terzaghi square footing qu");

    // --- Circular footing (sc = 1.3, sgamma = 0.6) ---
    let sc_circ = 1.3;
    let sg_circ = 0.6;
    let qu_circ = c * nc * sc_circ + q * nq + 0.5 * gamma * b * n_gamma * sg_circ;
    assert_close(qu_circ, 815.65, 0.02, "Terzaghi circular footing qu");

    // Square > Circular > Strip for same B (because of shape factor interplay)
    assert!(qu_sq > qu_circ, "Square qu > Circular qu");
    assert!(qu_circ > qu_strip, "Circular qu > Strip qu");

    // Allowable bearing capacity with FS = 3.0
    let fs = 3.0;
    let qa_strip = qu_strip / fs;
    let qa_sq = qu_sq / fs;
    assert_close(qa_strip, 238.99, 0.02, "Terzaghi strip qa with FS=3");
    assert_close(qa_sq, 277.55, 0.02, "Terzaghi square qa with FS=3");
}

// ================================================================
// 2. Meyerhof General Bearing Capacity — Inclination, Depth, Shape
// ================================================================
//
// Meyerhof general bearing capacity:
//   qu = c*Nc*Fcs*Fcd*Fci + q*Nq*Fqs*Fqd*Fqi + 0.5*gamma*B*Ng*Fgs*Fgd*Fgi
//
// For phi = 25 deg:
//   Nq = exp(pi*tan(25))*tan^2(45+12.5) = exp(1.4627)*tan^2(57.5)
//      = 4.3185 * 2.4640 = 10.662
//   Nc = (Nq-1)*cot(25) = 9.662 * 2.1445 = 20.721
//   Ng = 2*(Nq+1)*tan(25) = 2*11.662*0.4663 = 10.877
//
// Rectangular footing: B = 1.5 m, L = 3.0 m, Df = 1.2 m
// Soil: c = 15 kPa, gamma = 18 kN/m^3, phi = 25 deg
// Inclined load: theta = 10 deg from vertical
//
// Shape factors (Meyerhof):
//   Fcs = 1 + (B/L)*(Nq/Nc) = 1 + 0.5 * (10.662/20.721) = 1.2572
//   Fqs = 1 + (B/L)*tan(phi) = 1 + 0.5*0.4663 = 1.2332
//   Fgs = 1 - 0.4*(B/L) = 1 - 0.4*0.5 = 0.80
//
// Depth factors (Df/B = 1.2/1.5 = 0.8 <= 1):
//   Fcd = 1 + 0.4*(Df/B) = 1 + 0.4*0.8 = 1.32
//   Fqd = 1 + 2*tan(phi)*(1-sin(phi))^2*(Df/B)
//        = 1 + 2*0.4663*(1-0.4226)^2*0.8
//        = 1 + 2*0.4663*0.3334*0.8 = 1 + 0.2487 = 1.2487
//   Fgd = 1.0
//
// Inclination factors (theta = 10 deg):
//   Fci = Fqi = (1 - theta/90)^2 = (1 - 10/90)^2 = (0.8889)^2 = 0.7901
//   Fgi = (1 - theta/phi)^2 = (1 - 10/25)^2 = (0.6)^2 = 0.36
//
// q = gamma*Df = 18*1.2 = 21.6 kPa
//
// Term1 = c*Nc*Fcs*Fcd*Fci = 15*20.721*1.2572*1.32*0.7901
//       = 15*20.721*1.2572*1.32*0.7901
//       = 15 * 20.721 * 1.3152 = 15 * 27.252
//       Wait, let me compute step by step:
//   15 * 20.721 = 310.815
//   310.815 * 1.2572 = 390.78
//   390.78 * 1.32 = 515.83
//   515.83 * 0.7901 = 407.54
//
// Term2 = q*Nq*Fqs*Fqd*Fqi = 21.6*10.662*1.2332*1.2487*0.7901
//   21.6 * 10.662 = 230.30
//   230.30 * 1.2332 = 283.90
//   283.90 * 1.2487 = 354.51
//   354.51 * 0.7901 = 280.10
//
// Term3 = 0.5*gamma*B*Ng*Fgs*Fgd*Fgi = 0.5*18*1.5*10.877*0.80*1.0*0.36
//   0.5*18*1.5 = 13.5
//   13.5 * 10.877 = 146.84
//   146.84 * 0.80 = 117.47
//   117.47 * 0.36 = 42.29
//
// qu = 407.54 + 280.10 + 42.29 = 729.93 kPa

#[test]
fn validation_found_ext_meyerhof_general_bearing_capacity() {
    let phi_deg: f64 = 25.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let c = 15.0;        // kPa
    let gamma = 18.0;    // kN/m^3
    let df = 1.2;        // m
    let b = 1.5;         // m
    let l = 3.0;         // m
    let theta_deg: f64 = 10.0;  // inclination angle (degrees)
    let q = gamma * df;   // 21.6 kPa

    // Bearing capacity factors
    let nq: f64 = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nc: f64 = (nq - 1.0) / phi.tan();
    let n_gamma: f64 = 2.0 * (nq + 1.0) * phi.tan();

    assert_close(nq, 10.662, 0.02, "Meyerhof Nq phi=25");
    assert_close(nc, 20.721, 0.02, "Meyerhof Nc phi=25");
    assert_close(n_gamma, 10.877, 0.02, "Meyerhof Ng phi=25");

    // Shape factors (Hansen/Meyerhof form from Das)
    let fcs: f64 = 1.0 + (b / l) * (nq / nc);
    let fqs: f64 = 1.0 + (b / l) * phi.tan();
    let fgs: f64 = 1.0 - 0.4 * (b / l);

    assert_close(fcs, 1.2572, 0.02, "Shape factor Fcs");
    assert_close(fqs, 1.2332, 0.02, "Shape factor Fqs");
    assert_close(fgs, 0.80, 0.01, "Shape factor Fgs");

    // Depth factors (Df/B <= 1)
    let df_over_b = df / b;
    let fcd: f64 = 1.0 + 0.4 * df_over_b;
    let sin_phi: f64 = phi.sin();
    let fqd: f64 = 1.0 + 2.0 * phi.tan() * (1.0 - sin_phi).powi(2) * df_over_b;
    let fgd = 1.0;

    assert_close(fcd, 1.32, 0.02, "Depth factor Fcd");
    assert_close(fqd, 1.2487, 0.02, "Depth factor Fqd");

    // Inclination factors
    let fci: f64 = (1.0 - theta_deg / 90.0).powi(2);
    let fqi = fci;
    let fgi: f64 = (1.0 - theta_deg / phi_deg).powi(2);

    assert_close(fci, 0.7901, 0.02, "Inclination factor Fci");
    assert_close(fgi, 0.36, 0.02, "Inclination factor Fgi");

    // Ultimate bearing capacity
    let term1 = c * nc * fcs * fcd * fci;
    let term2 = q * nq * fqs * fqd * fqi;
    let term3 = 0.5 * gamma * b * n_gamma * fgs * fgd * fgi;

    assert_close(term1, 407.54, 0.03, "Meyerhof cohesion term");
    assert_close(term2, 280.10, 0.03, "Meyerhof overburden term");
    assert_close(term3, 42.29, 0.03, "Meyerhof self-weight term");

    let qu = term1 + term2 + term3;
    assert_close(qu, 729.93, 0.03, "Meyerhof general qu with inclination");

    // Without inclination (vertical load), qu should be higher
    let qu_vert = c * nc * fcs * fcd * 1.0
                + q * nq * fqs * fqd * 1.0
                + 0.5 * gamma * b * n_gamma * fgs * fgd * 1.0;
    assert!(qu_vert > qu,
        "Vertical load qu ({:.1}) > inclined qu ({:.1})", qu_vert, qu);
}

// ================================================================
// 3. Pile Capacity — Alpha Method (Clay) + Beta Method (Sand)
// ================================================================
//
// Single pile capacity: Qu = Qs + Qb
// where Qs = skin friction, Qb = end bearing
//
// Alpha method (for clay layers):
//   fs = alpha * cu
//   Qs_clay = sum(alpha_i * cu_i * pi * D * Li)
//
// Beta method (for sand layers):
//   fs = beta * sigma_v' = K * tan(delta) * sigma_v'
//   Qs_sand = sum(beta_i * sigma_vi' * pi * D * Li)
//
// End bearing:
//   Qb = Nc * cu_tip * Ab  (clay tip)
//   Qb = Nq * sigma_v_tip' * Ab  (sand tip)
//
// Given:
//   Pile: D = 0.6 m, L = 20 m
//   Layer 1 (clay): 0-10 m, cu = 60 kPa, gamma = 18 kN/m^3, alpha = 0.7
//   Layer 2 (sand): 10-20 m, phi = 35 deg, gamma = 19 kN/m^3, beta = 0.4
//   Pile tip in sand at 20 m depth.
//
// Skin friction:
//   Qs_clay = 0.7 * 60 * pi * 0.6 * 10 = 42.0 * 1.8850 * 10 = 791.68 kN
//
//   sigma_v' at mid of sand layer (15 m): 18*10 + 19*5 = 180+95 = 275 kPa
//   (simplifying with no water table)
//   Qs_sand = 0.4 * 275 * pi * 0.6 * 10 = 110 * 1.8850 * 10 = 2073.45 kN
//
//   Wait, that's very high. Let me reconsider. For the beta method, we
//   integrate over the sand layer. Using the average sigma_v' at mid-layer:
//   Qs_sand = beta * sigma_v_avg' * perimeter * L_sand
//           = 0.4 * 275 * pi*0.6 * 10 = 2073.45 kN
//
//   Actually this is reasonable for a 20m pile. Let me use smaller values
//   to keep numbers manageable.
//
// Revised given:
//   Pile: D = 0.4 m, L = 15 m
//   Layer 1 (clay): 0-8 m, cu = 40 kPa, gamma = 17 kN/m^3, alpha = 0.8
//   Layer 2 (sand): 8-15 m, phi = 30 deg, gamma = 18 kN/m^3, beta = 0.35
//   No water table.
//
// Skin friction:
//   perimeter = pi * D = pi * 0.4 = 1.2566 m
//   Qs_clay = alpha * cu * perimeter * L_clay
//           = 0.8 * 40 * 1.2566 * 8 = 321.68 kN
//
//   sigma_v' at mid of sand layer (11.5 m from surface):
//   sigma_v' = 17*8 + 18*3.5 = 136 + 63 = 199 kPa
//   Qs_sand = beta * sigma_v_avg' * perimeter * L_sand
//           = 0.35 * 199 * 1.2566 * 7 = 612.88 kN
//
// End bearing (sand tip at 15 m):
//   sigma_v_tip' = 17*8 + 18*7 = 136 + 126 = 262 kPa
//   Nq(30 deg) ~ 18.4 (Meyerhof)
//   Ab = pi/4 * D^2 = pi/4 * 0.16 = 0.12566 m^2
//   Qb = Nq * sigma_v_tip' * Ab = 18.4 * 262 * 0.12566 = 605.63 kN
//
// Qu = Qs_clay + Qs_sand + Qb = 321.68 + 612.88 + 605.63 = 1540.19 kN

#[test]
fn validation_found_ext_pile_capacity_alpha_beta() {
    // Pile geometry
    let d: f64 = 0.4;           // diameter (m)
    let perimeter: f64 = PI * d;
    let ab: f64 = PI / 4.0 * d.powi(2);  // base area

    assert_close(perimeter, 1.2566, 0.01, "Pile perimeter");
    assert_close(ab, 0.12566, 0.01, "Pile base area");

    // Layer 1: Clay (0-8 m)
    let l_clay = 8.0;
    let cu = 40.0;       // kPa
    let gamma_clay = 17.0;
    let alpha = 0.8;

    // Alpha method skin friction
    let qs_clay = alpha * cu * perimeter * l_clay;
    assert_close(qs_clay, 321.68, 0.02, "Skin friction Qs_clay (alpha method)");

    // Layer 2: Sand (8-15 m)
    let l_sand = 7.0;
    let gamma_sand = 18.0;
    let beta = 0.35;

    // Average effective vertical stress at mid of sand layer (depth 11.5 m)
    let sigma_v_mid: f64 = gamma_clay * l_clay + gamma_sand * (l_sand / 2.0);
    assert_close(sigma_v_mid, 199.0, 0.01, "sigma_v' at mid sand layer");

    // Beta method skin friction
    let qs_sand = beta * sigma_v_mid * perimeter * l_sand;
    assert_close(qs_sand, 612.88, 0.03, "Skin friction Qs_sand (beta method)");

    // End bearing (sand tip at 15 m)
    let sigma_v_tip: f64 = gamma_clay * l_clay + gamma_sand * l_sand;
    assert_close(sigma_v_tip, 262.0, 0.01, "sigma_v' at pile tip");

    let nq_pile = 18.4; // Meyerhof Nq for phi=30 (pile tip)
    let qb = nq_pile * sigma_v_tip * ab;
    assert_close(qb, 605.63, 0.03, "End bearing Qb");

    // Total ultimate pile capacity
    let qu = qs_clay + qs_sand + qb;
    assert_close(qu, 1540.19, 0.03, "Total ultimate pile capacity Qu");

    // Factor of safety FS = 2.5 for design
    let fs = 2.5;
    let qa = qu / fs;
    assert_close(qa, 616.08, 0.03, "Allowable pile capacity Qa (FS=2.5)");

    // Verify skin friction dominates over end bearing for this friction pile
    let skin_total = qs_clay + qs_sand;
    assert!(skin_total > qb,
        "Friction pile: skin friction ({:.1}) > end bearing ({:.1})", skin_total, qb);
}

// ================================================================
// 4. Pile Group Efficiency — Converse-Labarre Formula
// ================================================================
//
// Converse-Labarre formula for pile group efficiency:
//   eta = 1 - theta/(90*m*n) * [n*(m-1) + m*(n-1)]
//
// where:
//   theta = atan(D/s) in degrees
//   m = number of rows
//   n = number of columns
//   D = pile diameter
//   s = center-to-center spacing
//
// Given:
//   D = 0.5 m, s = 1.5 m (3D spacing)
//   Group: 3 rows x 4 columns = 12 piles
//   Individual pile capacity Qu = 800 kN
//
// theta = atan(0.5/1.5) = atan(0.3333) = 18.435 deg
// m = 3, n = 4
//
// eta = 1 - 18.435/(90*3*4) * [4*(3-1) + 3*(4-1)]
//     = 1 - 18.435/1080 * [8 + 9]
//     = 1 - 0.01707 * 17
//     = 1 - 0.2902
//     = 0.7098
//
// Group capacity (efficiency method):
//   Qg_eff = eta * n_piles * Qu = 0.7098 * 12 * 800 = 6814.1 kN
//
// Block failure capacity (for clay):
//   Qg_block = 2*(Bg+Lg)*L*cu + Nc*cu*Bg*Lg
//   where Bg = s*(m-1)+D = 1.5*2+0.5 = 3.5 m
//         Lg = s*(n-1)+D = 1.5*3+0.5 = 5.0 m
//         L  = pile length = 15 m
//         cu = 50 kPa, Nc = 9.0 (deep foundation)
//
//   Qg_block = 2*(3.5+5.0)*15*50 + 9.0*50*3.5*5.0
//            = 2*8.5*750 + 9*50*17.5
//            = 12750 + 7875 = 20625 kN
//
// Group capacity = min(Qg_eff, Qg_block) = 6814.1 kN (efficiency governs)

#[test]
fn validation_found_ext_pile_group_efficiency() {
    let d: f64 = 0.5;    // pile diameter (m)
    let s = 1.5;          // pile spacing (m)
    let m: f64 = 3.0;     // rows
    let n: f64 = 4.0;     // columns
    let n_piles: f64 = m * n;  // 12 piles
    let qu_single = 800.0; // individual pile capacity (kN)

    // Converse-Labarre formula
    let theta_rad: f64 = (d / s).atan();
    let theta_deg: f64 = theta_rad * 180.0 / PI;
    assert_close(theta_deg, 18.435, 0.02, "theta = atan(D/s) degrees");

    let eta: f64 = 1.0 - theta_deg / (90.0 * m * n)
                   * (n * (m - 1.0) + m * (n - 1.0));
    assert_close(eta, 0.7098, 0.02, "Converse-Labarre efficiency eta");

    // Efficiency must be between 0 and 1
    assert!(eta > 0.0 && eta < 1.0, "Efficiency in valid range: {:.4}", eta);

    // Group capacity by efficiency
    let qg_eff = eta * n_piles * qu_single;
    assert_close(qg_eff, 6814.1, 0.03, "Pile group capacity (efficiency method)");

    // Block failure check (clay)
    let cu = 50.0;        // undrained cohesion (kPa)
    let pile_length = 15.0;
    let nc_block = 9.0;   // Nc for deep foundation in clay

    let bg: f64 = s * (m - 1.0) + d;  // block width
    let lg: f64 = s * (n - 1.0) + d;  // block length
    assert_close(bg, 3.5, 0.01, "Block width Bg");
    assert_close(lg, 5.0, 0.01, "Block length Lg");

    let qg_block = 2.0 * (bg + lg) * pile_length * cu + nc_block * cu * bg * lg;
    assert_close(qg_block, 20625.0, 0.02, "Block failure capacity");

    // Governing capacity = min of efficiency and block failure
    let qg_governing: f64 = qg_eff.min(qg_block);
    assert_close(qg_governing, qg_eff, 0.01, "Efficiency method governs");

    // Effect of spacing: larger spacing -> higher efficiency
    let s2 = 3.0; // 6D spacing
    let theta2_rad: f64 = (d / s2).atan();
    let theta2_deg: f64 = theta2_rad * 180.0 / PI;
    let eta2: f64 = 1.0 - theta2_deg / (90.0 * m * n)
                    * (n * (m - 1.0) + m * (n - 1.0));
    assert!(eta2 > eta,
        "Wider spacing improves efficiency: {:.4} > {:.4}", eta2, eta);
}

// ================================================================
// 5. Mat Foundation — Winkler Model, Rigid vs Flexible
// ================================================================
//
// Rigid mat: uniform contact pressure q = P_total / A_mat
// Flexible mat: pressure varies, higher under columns, lower between
//
// We model both as beams on Winkler springs:
//   - Rigid: very high EI, uniform settlement -> uniform pressure
//   - Flexible: moderate EI, differential settlement -> variable pressure
//
// Given:
//   Mat: L = 12 m, B = 1.0 m (unit strip), ks = 20000 kN/m^3
//   Two columns: P1 = P2 = 400 kN at x = 3 m and x = 9 m
//   Total load = 800 kN
//   For rigid mat: q_uniform = 800 / (12*1) = 66.67 kN/m^2
//
// We verify that:
//   1. For rigid mat (high EI), settlement is nearly uniform
//   2. For flexible mat (low EI), differential settlement is significant
//   3. Both satisfy equilibrium (sum of spring reactions = total load)

#[test]
fn validation_found_ext_mat_foundation_winkler() {
    use dedaliano_engine::solver::linear;
    use dedaliano_engine::types::*;
    use std::collections::HashMap;

    let l_mat = 12.0;
    let n = 48;
    let ks = 20_000.0;   // subgrade modulus (kN/m^3)
    let b_mat = 1.0;      // unit strip width
    let k_soil = ks * b_mat; // kN/m per m length

    let p1 = 400.0;
    let p2 = 400.0;
    let p_total = p1 + p2;
    let elem_len = l_mat / n as f64;
    let node_p1 = (3.0 / elem_len).round() as usize + 1;
    let node_p2 = (9.0 / elem_len).round() as usize + 1;

    // Helper to build a Winkler beam model
    let build_model = |iz: f64| -> SolverInput {
        let n_nodes = n + 1;
        let a_sec = b_mat * 0.5; // some cross-section area

        let mut nodes_map = HashMap::new();
        for i in 0..n_nodes {
            let id = i + 1;
            nodes_map.insert(id.to_string(), SolverNode {
                id, x: i as f64 * elem_len, y: 0.0,
            });
        }
        let mut mats_map = HashMap::new();
        mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: 25_000.0, nu: 0.2 });
        let mut secs_map = HashMap::new();
        secs_map.insert("1".to_string(), SolverSection { id: 1, a: a_sec, iz, as_y: None });
        let mut elems_map = HashMap::new();
        for i in 0..n {
            let id = i + 1;
            elems_map.insert(id.to_string(), SolverElement {
                id, elem_type: "frame".to_string(),
                node_i: i + 1, node_j: i + 2,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            });
        }
        let mut sups_map = HashMap::new();
        for i in 0..n_nodes {
            let trib = if i == 0 || i == n_nodes - 1 { elem_len / 2.0 } else { elem_len };
            let ky_node = k_soil * trib;
            let kx = if i == 0 { Some(1e10) } else { None };
            sups_map.insert((i + 1).to_string(), SolverSupport {
                id: i + 1, node_id: i + 1,
                support_type: "spring".to_string(),
                kx, ky: Some(ky_node), kz: None,
                dx: None, dy: None, drz: None, angle: None,
            });
        }
        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: node_p1, fx: 0.0, fy: -p1, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: node_p2, fx: 0.0, fy: -p2, mz: 0.0 }),
        ];
        SolverInput {
            nodes: nodes_map, materials: mats_map, sections: secs_map,
            elements: elems_map, supports: sups_map, loads,
        }
    };

    // --- Rigid mat (very high Iz) ---
    let iz_rigid = 10.0; // very stiff
    let input_rigid = build_model(iz_rigid);
    let res_rigid = linear::solve_2d(&input_rigid).unwrap();

    // Check equilibrium
    let n_nodes = n + 1;
    let mut reaction_rigid = 0.0;
    for i in 0..n_nodes {
        let nid = i + 1;
        let trib = if i == 0 || i == n_nodes - 1 { elem_len / 2.0 } else { elem_len };
        let ky = k_soil * trib;
        let d = res_rigid.displacements.iter().find(|d| d.node_id == nid).unwrap();
        reaction_rigid += ky * d.uy.abs();
    }
    assert_close(reaction_rigid, p_total, 0.05, "Rigid mat: equilibrium sum R = P");

    // Rigid mat: settlement should be nearly uniform
    let disps_rigid: Vec<f64> = res_rigid.displacements.iter().map(|d| d.uy).collect();
    let avg_rigid: f64 = disps_rigid.iter().sum::<f64>() / disps_rigid.len() as f64;
    let max_dev_rigid: f64 = disps_rigid.iter()
        .map(|&d| (d - avg_rigid).abs())
        .fold(0.0_f64, f64::max);
    let rigid_uniformity = max_dev_rigid / avg_rigid.abs();
    assert!(rigid_uniformity < 0.15,
        "Rigid mat: settlement nearly uniform, deviation ratio = {:.4}", rigid_uniformity);

    // --- Flexible mat (low Iz) ---
    let h_flex: f64 = 0.25;
    let iz_flex: f64 = b_mat * h_flex.powi(3) / 12.0; // thin slab
    let input_flex = build_model(iz_flex);
    let res_flex = linear::solve_2d(&input_flex).unwrap();

    // Check equilibrium
    let mut reaction_flex = 0.0;
    for i in 0..n_nodes {
        let nid = i + 1;
        let trib = if i == 0 || i == n_nodes - 1 { elem_len / 2.0 } else { elem_len };
        let ky = k_soil * trib;
        let d = res_flex.displacements.iter().find(|d| d.node_id == nid).unwrap();
        reaction_flex += ky * d.uy.abs();
    }
    assert_close(reaction_flex, p_total, 0.05, "Flexible mat: equilibrium sum R = P");

    // Flexible mat: differential settlement should be larger
    let disps_flex: Vec<f64> = res_flex.displacements.iter().map(|d| d.uy).collect();
    let avg_flex: f64 = disps_flex.iter().sum::<f64>() / disps_flex.len() as f64;
    let max_dev_flex: f64 = disps_flex.iter()
        .map(|&d| (d - avg_flex).abs())
        .fold(0.0_f64, f64::max);

    assert!(max_dev_flex > max_dev_rigid,
        "Flexible mat has more differential settlement: {:.6e} > {:.6e}",
        max_dev_flex, max_dev_rigid);

    // Flexible mat: deflection under columns > deflection at edges
    let d_col = res_flex.displacements.iter().find(|d| d.node_id == node_p1).unwrap();
    let d_edge = res_flex.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d_col.uy.abs() > d_edge.uy.abs(),
        "Flexible mat: column settles more than edge: {:.6e} > {:.6e}",
        d_col.uy.abs(), d_edge.uy.abs());
}

// ================================================================
// 6. Combined Footing — Trapezoidal vs Rectangular Under Two Columns
// ================================================================
//
// Two columns with unequal loads require a combined footing.
// For uniform pressure, the centroid of the footing must coincide
// with the resultant of the column loads.
//
// Rectangular footing approach:
//   Footing centered on resultant, length chosen so edges don't
//   extend beyond practical limits.
//
// Trapezoidal footing approach:
//   Widths B1 and B2 at each end adjusted so centroid of trapezoid
//   aligns with resultant. Area = L*(B1+B2)/2.
//
// Given:
//   Column A: PA = 600 kN at x = 0
//   Column B: PB = 400 kN at x = 4.0 m (column spacing)
//   Total P = 1000 kN
//   Resultant location from A: x_r = PB*4 / P = 400*4/1000 = 1.6 m
//   Allowable soil pressure: qa = 200 kPa
//
// Rectangular footing:
//   Length L must center on x_r: so L/2 = distance from left edge to x_r
//   If left edge is at column A (x=0): L = 2*1.6 = 3.2 m
//   Required area: A = P/qa = 1000/200 = 5.0 m^2
//   Width B = A/L = 5.0/3.2 = 1.5625 m
//   Uniform pressure: q = P/(B*L) = 1000/(1.5625*3.2) = 200.0 kPa
//
// Trapezoidal footing:
//   Use length L = 5.0 m (extends 0.5 m beyond each column)
//   Need centroid at x_r = 1.6 m from left end (which is at x = -0.5)
//   So centroid at 1.6 + 0.5 = 2.1 m from left edge of footing
//
//   Centroid of trapezoid from wider end:
//   x_c = L/3 * (B1 + 2*B2)/(B1 + B2)
//   where B1 is width at left (wider), B2 at right
//
//   2.1 = 5/3 * (B1 + 2*B2)/(B1 + B2)
//   2.1*(B1+B2) = 5/3*(B1+2*B2)
//   2.1*B1 + 2.1*B2 = 1.6667*B1 + 3.3333*B2
//   0.4333*B1 = 1.2333*B2
//   B1/B2 = 2.8462
//
//   Area = L*(B1+B2)/2 = P/qa = 5.0 m^2
//   5*(B1+B2)/2 = 5 => B1+B2 = 2.0
//   B1 = 2.8462*B2, so 2.8462*B2 + B2 = 2.0 => 3.8462*B2 = 2.0
//   B2 = 0.5200 m, B1 = 1.4800 m
//
// Verify: centroid from B1 end = 5/3*(1.48+2*0.52)/(1.48+0.52)
//       = 1.6667 * 2.52 / 2.0 = 2.1 m  ✓

#[test]
fn validation_found_ext_combined_footing_design() {
    let pa = 600.0;     // kN
    let pb = 400.0;     // kN
    let spacing = 4.0;  // m between columns
    let p_total = pa + pb;
    let qa = 200.0;     // kPa, allowable bearing pressure

    // Resultant location from column A
    let x_r = pb * spacing / p_total;
    assert_close(x_r, 1.6, 0.01, "Resultant location from column A");

    // --- Rectangular footing design ---
    // Center footing on resultant, left edge at column A position
    let l_rect = 2.0 * x_r;   // 3.2 m
    assert_close(l_rect, 3.2, 0.01, "Rectangular footing length");

    let a_req = p_total / qa;  // required area = 5.0 m^2
    assert_close(a_req, 5.0, 0.01, "Required footing area");

    let b_rect = a_req / l_rect;  // width = 1.5625 m
    assert_close(b_rect, 1.5625, 0.02, "Rectangular footing width");

    // Uniform pressure check
    let q_rect = p_total / (b_rect * l_rect);
    assert_close(q_rect, 200.0, 0.02, "Rectangular footing: uniform pressure = qa");

    // --- Trapezoidal footing design ---
    let l_trap = 5.0;  // footing length (extends 0.5m beyond each column)
    let overhang = 0.5; // beyond column A

    // Centroid distance from left edge of footing
    let x_c = x_r + overhang;  // 2.1 m from left edge
    assert_close(x_c, 2.1, 0.01, "Trapezoid centroid from left edge");

    // Solve for B1 (wide end at column A side) and B2 (narrow end)
    // x_c = L/3 * (B1 + 2*B2) / (B1 + B2)
    // Area = L*(B1+B2)/2 = P/qa
    let b_sum = 2.0 * a_req / l_trap;  // B1 + B2 = 2.0
    assert_close(b_sum, 2.0, 0.01, "B1 + B2");

    // From centroid equation: 0.4333*B1 = 1.2333*B2 => B1 = 2.8462*B2
    let _ratio: f64 = (3.0 * x_c / l_trap - 2.0) / (1.0 - 3.0 * x_c / l_trap + 1.0);
    // Deriving: x_c = L/3*(B1+2B2)/(B1+B2)
    // 3*x_c/L = (B1+2B2)/(B1+B2) = 1 + B2/(B1+B2)
    // B2/(B1+B2) = 3*x_c/L - 1 = 3*2.1/5 - 1 = 1.26 - 1 = 0.26
    // B2 = 0.26 * (B1+B2) = 0.26 * 2.0 = 0.52
    let frac: f64 = 3.0 * x_c / l_trap - 1.0;
    let b2 = frac * b_sum;
    let b1 = b_sum - b2;

    assert_close(b2, 0.52, 0.02, "Trapezoid narrow width B2");
    assert_close(b1, 1.48, 0.02, "Trapezoid wide width B1");

    // Verify centroid
    let x_c_check = l_trap / 3.0 * (b1 + 2.0 * b2) / (b1 + b2);
    assert_close(x_c_check, x_c, 0.02, "Trapezoid centroid verification");

    // Verify area
    let a_trap = l_trap * (b1 + b2) / 2.0;
    assert_close(a_trap, a_req, 0.02, "Trapezoid area = required area");

    // Average pressure
    let q_avg = p_total / a_trap;
    assert_close(q_avg, qa, 0.02, "Trapezoidal footing: average pressure = qa");

    // B1 > B2 because heavier column is on the B1 side
    assert!(b1 > b2, "Wider end under heavier load: B1={:.3} > B2={:.3}", b1, b2);
}

// ================================================================
// 7. Lateral Pile Capacity — Broms Method
// ================================================================
//
// Broms (1964) method for lateral capacity of piles.
//
// Case 1: Short pile in cohesive soil (free head)
//   Failure by rotation (soil failure on both sides).
//   Hu = 9*cu*D*(L - 1.5*D)^2 / (2*(e + 1.5*D + 0.5*(L-1.5*D)))
//   Simplified for e = 0 (load at ground level):
//   Hu = 9*cu*D*(L - 1.5*D)^2 / (2*(1.5*D + 0.5*f))
//   where f = L - 1.5*D
//
//   Actually, Broms' simplified short-pile approach for free head:
//   Hu is found from moment equilibrium about the point of rotation.
//   For free-headed short pile in clay (e = 0):
//   The ultimate soil resistance per unit length = 9*cu*D
//   for depth > 1.5D.
//
//   Simplified formula (Das, Eq. 12.38):
//   For a free-headed short pile (e=0) in cohesive soil:
//   Hu = 9*cu*D*L * (1 - 1.5*D/L)^2 / 2
//   This is approximate.
//
//   Let's use the normalized chart approach instead:
//   For short pile: L/D = 6, pile is "short"
//   Hu/(cu*D^2) can be read from Broms chart, but let's compute directly.
//
//   Using the equilibrium approach for short free-head pile in clay:
//   The pile rotates about a point at depth z0 from 1.5D.
//   Passive resistance above z0: 9*cu*D*z0 (upward at depth)
//   Passive resistance below z0: 9*cu*D*(f-z0) where f = L-1.5D
//   Moment about bottom: Hu*(L) = 9*cu*D*(f^2)/2
//   Hu = 9*cu*D*(L-1.5D)^2 / (2*L)
//
// Given:
//   D = 0.4 m, L = 4.0 m, cu = 50 kPa, e = 0 (load at ground)
//   f = L - 1.5*D = 4.0 - 0.6 = 3.4 m
//   Hu = 9*50*0.4*3.4^2 / (2*4.0)
//      = 9*50*0.4*11.56 / 8.0
//      = 2080.8 / 8.0 = 260.1 kN
//
// Case 2: Long pile in cohesionless soil (free head)
//   Broms solution for free-headed long pile in sand:
//   Hu = 0.5*Kp*gamma*D*f^2   (where f is embedment below ground, Kp = passive earth pressure)
//   Wait, for long pile in sand the plastic hinge forms.
//
//   For free-headed short pile in cohesionless soil (Broms):
//   Hu = 0.5*gamma*D*L^3*Kp / (e + L)
//   For e = 0:
//   Hu = 0.5*gamma*D*L^2*Kp
//   This is the resultant of the triangular Kp*gamma*z*D pressure acting
//   over L, times the moment arm, solved for Hu. Actually:
//
//   Broms (1964) for short free-head pile in sand:
//   Hu = 0.5*Kp*gamma*D*L^3 / (e+L)
//   For e = 0: Hu = 0.5*Kp*gamma*D*L^2
//
//   Given: phi = 35 deg, Kp = tan^2(45+35/2) = tan^2(62.5)
//        = 3.690
//   gamma = 17 kN/m^3, D = 0.4 m, L = 3.0 m (short pile)
//
//   Hu = 0.5*3.690*17*0.4*3.0^2
//      = 0.5*3.690*17*0.4*9
//      = 0.5*3.690*61.2
//      = 0.5*225.828
//      = 112.91 kN

#[test]
fn validation_found_ext_lateral_pile_broms() {
    // --- Case 1: Short pile in cohesive soil ---
    let d_coh = 0.4;      // pile diameter (m)
    let l_coh = 4.0;      // embedded length (m)
    let cu = 50.0;         // undrained cohesion (kPa)
    let _e_coh = 0.0;     // load at ground level

    // Effective length below 1.5D zone
    let f_coh: f64 = l_coh - 1.5 * d_coh;
    assert_close(f_coh, 3.4, 0.01, "Broms f = L - 1.5D (clay)");

    // Short pile lateral capacity (Broms, free head, cohesive)
    let hu_clay: f64 = 9.0 * cu * d_coh * f_coh.powi(2) / (2.0 * l_coh);
    assert_close(hu_clay, 260.1, 0.03, "Broms Hu short pile in clay");

    // Factor of safety
    let fs_lat = 2.5;
    let ha_clay = hu_clay / fs_lat;
    assert_close(ha_clay, 104.04, 0.03, "Allowable lateral capacity in clay");

    // --- Case 2: Short pile in cohesionless soil ---
    let phi_deg: f64 = 35.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let kp: f64 = (PI / 4.0 + phi / 2.0).tan().powi(2);
    assert_close(kp, 3.690, 0.02, "Passive earth pressure coefficient Kp");

    let gamma_sand = 17.0;
    let d_sand = 0.4;
    let l_sand: f64 = 3.0;

    // Short free-headed pile in sand (Broms)
    let hu_sand: f64 = 0.5 * kp * gamma_sand * d_sand * l_sand.powi(2);
    assert_close(hu_sand, 112.91, 0.03, "Broms Hu short pile in sand");

    // Long vs short pile distinction:
    // A pile is "long" if it fails by forming a plastic hinge before
    // the soil fails along the full length.
    // For clay: pile is short if L/D < ~10-12 (depending on My/cu*D^3)
    let ld_ratio_clay = l_coh / d_coh;
    assert_close(ld_ratio_clay, 10.0, 0.01, "L/D ratio for clay pile");

    // For sand: pile is short if L/D < ~5-8
    let ld_ratio_sand = l_sand / d_sand;
    assert_close(ld_ratio_sand, 7.5, 0.01, "L/D ratio for sand pile");

    // Clay lateral capacity should be higher than sand for these parameters
    assert!(hu_clay > hu_sand,
        "Clay pile Hu ({:.1}) > Sand pile Hu ({:.1}) for these params", hu_clay, hu_sand);
}

// ================================================================
// 8. Settlement — Immediate, Consolidation, and Secondary Compression
// ================================================================
//
// Total settlement: S_total = S_i + S_c + S_s
//
// (a) Immediate (elastic) settlement:
//   S_i = q*B*(1-nu^2)*I_p / E_s
//   Given: q=120 kPa, B=3.0 m, nu=0.3, Es=15000 kPa, Ip=0.82
//   S_i = 120*3.0*(1-0.09)*0.82/15000
//       = 120*3.0*0.91*0.82/15000
//       = 268.63 / 15000 = 0.01791 m = 17.91 mm
//
// (b) Terzaghi 1D consolidation settlement:
//   S_c = Cc/(1+e0) * H * log10((sigma_0' + delta_sigma) / sigma_0')
//   Given: Cc=0.3, e0=0.8, H=5.0 m (clay layer), sigma_0'=100 kPa, delta_sigma=60 kPa
//   S_c = 0.3/(1+0.8) * 5.0 * log10((100+60)/100)
//       = 0.3/1.8 * 5.0 * log10(1.6)
//       = 0.1667 * 5.0 * 0.2041
//       = 0.1701 m = 170.1 mm
//
// (c) Secondary compression:
//   S_s = C_alpha/(1+e0) * H * log10(t2/t1)
//   where t1 = time for primary consolidation to complete, t2 = design life
//   Given: C_alpha = 0.015, t1 = 2 years, t2 = 50 years
//   S_s = 0.015/(1+0.8) * 5.0 * log10(50/2)
//       = 0.00833 * 5.0 * log10(25)
//       = 0.04167 * 1.3979
//       = 0.05824 m = 58.24 mm
//
// Total: S = 17.91 + 170.1 + 58.24 = 246.25 mm

#[test]
fn validation_found_ext_settlement_analysis() {
    // --- (a) Immediate elastic settlement ---
    let q_imm = 120.0;     // kPa, applied pressure
    let b_imm = 3.0;       // m, footing width
    let nu: f64 = 0.3;     // Poisson's ratio
    let es = 15_000.0;     // kPa, soil elastic modulus
    let ip = 0.82;         // influence factor

    let one_minus_nu2: f64 = 1.0 - nu.powi(2);
    assert_close(one_minus_nu2, 0.91, 0.001, "1 - nu^2");

    let si_m: f64 = q_imm * b_imm * one_minus_nu2 * ip / es;
    let si_mm: f64 = si_m * 1000.0;
    assert_close(si_mm, 17.91, 0.02, "Immediate settlement Si (mm)");

    // --- (b) Terzaghi 1D consolidation settlement ---
    let cc = 0.3;          // compression index
    let e0 = 0.8;          // initial void ratio
    let h_clay = 5.0;      // m, clay layer thickness
    let sigma_0 = 100.0;   // kPa, initial effective stress at mid-layer
    let delta_sigma = 60.0; // kPa, stress increase from foundation

    let stress_ratio: f64 = (sigma_0 + delta_sigma) / sigma_0;
    assert_close(stress_ratio, 1.6, 0.01, "Stress ratio for consolidation");

    let sc_m: f64 = cc / (1.0 + e0) * h_clay * stress_ratio.log10();
    let sc_mm: f64 = sc_m * 1000.0;
    assert_close(sc_mm, 170.1, 0.03, "Consolidation settlement Sc (mm)");

    // Verify intermediate: Cc/(1+e0) = 0.1667
    let cc_eff: f64 = cc / (1.0 + e0);
    assert_close(cc_eff, 0.1667, 0.02, "Cc/(1+e0)");

    // Verify log10(1.6) = 0.2041
    let log_ratio: f64 = stress_ratio.log10();
    assert_close(log_ratio, 0.2041, 0.02, "log10(sigma_f/sigma_0)");

    // --- (c) Secondary compression ---
    let c_alpha = 0.015;   // secondary compression index
    let t1 = 2.0;          // years, end of primary consolidation
    let t2 = 50.0;         // years, design life

    let time_ratio: f64 = t2 / t1;
    let ss_m: f64 = c_alpha / (1.0 + e0) * h_clay * time_ratio.log10();
    let ss_mm: f64 = ss_m * 1000.0;
    assert_close(ss_mm, 58.24, 0.03, "Secondary compression Ss (mm)");

    // Verify log10(25) = 1.3979
    let log_time: f64 = time_ratio.log10();
    assert_close(log_time, 1.3979, 0.02, "log10(t2/t1)");

    // --- Total settlement ---
    let s_total_mm: f64 = si_mm + sc_mm + ss_mm;
    assert_close(s_total_mm, 246.25, 0.03, "Total settlement (mm)");

    // Verify relative magnitudes: consolidation dominates
    assert!(sc_mm > si_mm, "Consolidation > immediate: {:.1} > {:.1}", sc_mm, si_mm);
    assert!(sc_mm > ss_mm, "Consolidation > secondary: {:.1} > {:.1}", sc_mm, ss_mm);
    assert!(ss_mm > si_mm, "Secondary > immediate: {:.1} > {:.1}", ss_mm, si_mm);

    // Check typical ratio: C_alpha/Cc ~ 0.04-0.06 for normally consolidated clay
    let ratio_alpha_cc = c_alpha / cc;
    assert_close(ratio_alpha_cc, 0.05, 0.05, "C_alpha/Cc ratio typical range");
}
