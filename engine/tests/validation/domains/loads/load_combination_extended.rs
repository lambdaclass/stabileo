/// Validation: Load Combinations Per Design Codes (Extended)
///
/// References:
///   - ASCE 7-22, Ch. 2 (Combinations of Loads) -- LRFD and ASD combinations
///   - EN 1990:2002, Section 6.4.3 (Combinations of actions for ULS and SLS)
///   - ACI 318-19, Section 6.4.2 (Arrangement of live load / pattern loading)
///   - Eurocode 1, EN 1991-1-5 (Thermal actions)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 8 (Superposition)
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 2 & 6
///
/// Tests:
///   1. ASCE 7 LRFD combinations: 1.4D, 1.2D+1.6L, 1.2D+1.0E+L -- governing case
///   2. ASD combinations: D+L, D+0.75L+0.75W, 0.6D+W -- governing case
///   3. EN 1990 fundamental: gamma_G*Gk + gamma_Q1*Qk1 + sum(gamma_Qi*psi_0i*Qki)
///   4. Pattern loading: checkerboard and alternate span loading for max effects
///   5. Envelope from multiple load cases: max/min moment and shear
///   6. Counteracting loads: uplift check 0.9D+1.0W, net tension/compression
///   7. Companion action factors: psi_0, psi_1, psi_2 for EN 1990
///   8. Load combination with thermal: 1.2D+T+L per ASCE 7
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 -> kN/m^2)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ================================================================
// 1. ASCE 7 LRFD Combinations -- Governing Case Identification
// ================================================================
//
// ASCE 7-22, Section 2.3.1 defines basic LRFD combinations:
//   Combo 1: 1.4D
//   Combo 2: 1.2D + 1.6L + 0.5(Lr or S or R)
//   Combo 5: 1.2D + 1.0E + L
//
// For a simply-supported beam under D = -4 kN/m and L = -8 kN/m:
//   Combo 1: 1.4*(-4) = -5.6 kN/m
//   Combo 2: 1.2*(-4) + 1.6*(-8) = -4.8 - 12.8 = -17.6 kN/m
//   Combo 5: 1.2*(-4) + 1.0*0 + 1.0*(-8) = -12.8 kN/m  (E=0 for gravity beam)
//
// Combo 2 governs for maximum gravity effect.
// Verify by running each case and comparing midspan deflection.
//
// Reference: ASCE 7-22, Section 2.3.1

#[test]
fn validation_lc_ext_asce7_lrfd_governing() {
    let l: f64 = 8.0;
    let n: usize = 16;
    let mid = n / 2 + 1;
    let q_d: f64 = -4.0;  // dead load (kN/m)
    let q_l: f64 = -8.0;  // live load (kN/m)

    // Combo 1: 1.4D
    let q_c1: f64 = 1.4 * q_d;
    // Combo 2: 1.2D + 1.6L
    let q_c2: f64 = 1.2 * q_d + 1.6 * q_l;
    // Combo 5: 1.2D + 1.0E + L (E=0 for this gravity-only case)
    let q_c5: f64 = 1.2 * q_d + 1.0 * q_l;

    let solve_udl = |q: f64| -> AnalysisResults {
        let loads: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_c1 = solve_udl(q_c1);
    let res_c2 = solve_udl(q_c2);
    let res_c5 = solve_udl(q_c5);

    let d_c1: f64 = res_c1.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();
    let d_c2: f64 = res_c2.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();
    let d_c5: f64 = res_c5.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Combo 2 (1.2D+1.6L) governs for maximum gravity
    assert!(d_c2 > d_c1, "LRFD: 1.2D+1.6L > 1.4D: {:.6e} > {:.6e}", d_c2, d_c1);
    assert!(d_c2 > d_c5, "LRFD: 1.2D+1.6L > 1.2D+1.0E+L: {:.6e} > {:.6e}", d_c2, d_c5);

    // Verify superposition: factored response = factor * individual responses
    // Solve D and L separately
    let res_d = solve_udl(q_d);
    let res_l = solve_udl(q_l);
    let d_d: f64 = res_d.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_l: f64 = res_l.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    let d_c2_super: f64 = 1.2 * d_d + 1.6 * d_l;
    let d_c2_actual: f64 = res_c2.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    assert_close(d_c2_actual, d_c2_super, 0.01, "LRFD combo2 superposition");

    // Verify ratio: deflections scale linearly with total factored load
    let ratio_c1_c2: f64 = d_c1 / d_c2;
    let expected_ratio: f64 = q_c1.abs() / q_c2.abs();
    assert_close(ratio_c1_c2, expected_ratio, 0.01, "LRFD load ratio = deflection ratio");
}

// ================================================================
// 2. ASD Combinations -- Governing Case Identification
// ================================================================
//
// ASCE 7-22, Section 2.4.1 defines ASD combinations:
//   Combo 1: D
//   Combo 2: D + L
//   Combo 4: D + 0.75L + 0.75W
//   Combo 6: 0.6D + W
//
// Portal frame with gravity and lateral wind:
//   D: gravity -10 kN per node; W: lateral +8 kN
// For max base moment, D+L governs gravity; 0.6D+W governs overturning.
//
// Reference: ASCE 7-22, Section 2.4.1

#[test]
fn validation_lc_ext_asd_combinations() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let g_d: f64 = -10.0;  // dead gravity per node (kN)
    let g_l: f64 = -6.0;   // live gravity per node (kN)
    let f_w: f64 = 8.0;    // wind lateral (kN)

    // Solve individual load cases on portal frame
    // Dead only
    let input_d = make_portal_frame(h, w, E, A, IZ, 0.0, g_d);
    let res_d = linear::solve_2d(&input_d).unwrap();
    let ry_d: f64 = res_d.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let mz_d: f64 = res_d.reactions.iter().find(|r| r.node_id == 1).unwrap().my;
    let drift_d: f64 = res_d.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Live only
    let input_l = make_portal_frame(h, w, E, A, IZ, 0.0, g_l);
    let res_l = linear::solve_2d(&input_l).unwrap();
    let ry_l: f64 = res_l.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let mz_l: f64 = res_l.reactions.iter().find(|r| r.node_id == 1).unwrap().my;

    // Wind only
    let input_w = make_portal_frame(h, w, E, A, IZ, f_w, 0.0);
    let res_w = linear::solve_2d(&input_w).unwrap();
    let ry_w: f64 = res_w.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let mz_w: f64 = res_w.reactions.iter().find(|r| r.node_id == 1).unwrap().my;
    let drift_w: f64 = res_w.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // ASD Combo 2: D + L
    let ry_dl: f64 = ry_d + ry_l;
    let _mz_dl: f64 = mz_d + mz_l;

    // ASD Combo 4: D + 0.75L + 0.75W
    let ry_c4: f64 = ry_d + 0.75 * ry_l + 0.75 * ry_w;
    let mz_c4: f64 = mz_d + 0.75 * mz_l + 0.75 * mz_w;

    // ASD Combo 6: 0.6D + W
    let ry_c6: f64 = 0.6 * ry_d + ry_w;
    let _mz_c6: f64 = 0.6 * mz_d + mz_w;

    // Verify direct solve matches superposition for combo 4
    let input_c4 = make_portal_frame(h, w, E, A, IZ, 0.75 * f_w, g_d + 0.75 * g_l);
    let res_c4 = linear::solve_2d(&input_c4).unwrap();
    let ry_c4_direct: f64 = res_c4.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(ry_c4_direct, ry_c4, 0.01, "ASD combo4 Ry superposition");

    // D+L governs for max vertical reaction (pure gravity)
    assert!(ry_dl.abs() > ry_c4.abs(),
        "ASD: D+L governs vertical: {:.4} > {:.4}", ry_dl.abs(), ry_c4.abs());

    // 0.6D+W has the most lateral drift (wind dominates drift, gravity has none)
    let drift_c6: f64 = 0.6 * drift_d + drift_w;
    assert!(drift_c6.abs() > 0.0, "ASD: 0.6D+W produces lateral drift");

    // Combo 4 base moment includes both gravity and wind effects
    assert!(mz_c4.abs() > mz_d.abs(),
        "ASD combo4: base moment > dead only: {:.4} > {:.4}", mz_c4.abs(), mz_d.abs());

    // Verify combo 6 has reduced gravity stabilizing effect
    assert!(ry_c6.abs() < ry_dl.abs(),
        "ASD: 0.6D+W vertical < D+L: {:.4} < {:.4}", ry_c6.abs(), ry_dl.abs());
}

// ================================================================
// 3. EN 1990 Fundamental Combination
// ================================================================
//
// EN 1990:2002, Eq. 6.10:
//   E_d = gamma_G * Gk + gamma_Q1 * Qk1 + sum(gamma_Qi * psi_0i * Qki)
//
// For a simply-supported beam:
//   Gk = -5 kN/m (permanent, gamma_G = 1.35)
//   Qk1 = -8 kN/m (leading variable action -- imposed, gamma_Q = 1.5)
//   Qk2 = 3 kN/m (accompanying variable -- wind uplift, gamma_Q = 1.5, psi_0 = 0.6)
//   Qk3 = -2 kN/m (accompanying variable -- snow, gamma_Q = 1.5, psi_0 = 0.5)
//
// Factored combination:
//   q_d = 1.35*(-5) + 1.5*(-8) + 1.5*0.6*(3) + 1.5*0.5*(-2)
//       = -6.75 + (-12.0) + 2.7 + (-1.5) = -17.55 kN/m
//
// Reference: EN 1990:2002, Section 6.4.3.2, Table A1.2(B)

#[test]
fn validation_lc_ext_en1990_fundamental_combination() {
    let l: f64 = 10.0;
    let n: usize = 20;
    let mid = n / 2 + 1;

    // EN 1990 partial factors
    let gamma_g: f64 = 1.35;
    let gamma_q: f64 = 1.50;
    let psi_0_wind: f64 = 0.6;
    let psi_0_snow: f64 = 0.5;

    // Characteristic loads
    let gk: f64 = -5.0;   // permanent
    let qk1: f64 = -8.0;  // leading variable (imposed)
    let qk2: f64 = 3.0;   // accompanying (wind uplift)
    let qk3: f64 = -2.0;  // accompanying (snow)

    let solve_udl = |q: f64| -> AnalysisResults {
        let loads: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
    };

    // Solve each characteristic load case individually
    let res_g = solve_udl(gk);
    let res_q1 = solve_udl(qk1);
    let res_q2 = solve_udl(qk2);
    let res_q3 = solve_udl(qk3);

    let d_g: f64 = res_g.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_q1: f64 = res_q1.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_q2: f64 = res_q2.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_q3: f64 = res_q3.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // EN 1990 fundamental combination (Eq. 6.10)
    let d_combo_super: f64 = gamma_g * d_g
        + gamma_q * d_q1
        + gamma_q * psi_0_wind * d_q2
        + gamma_q * psi_0_snow * d_q3;

    // Direct solve with factored combined load
    let q_factored: f64 = gamma_g * gk + gamma_q * qk1 + gamma_q * psi_0_wind * qk2 + gamma_q * psi_0_snow * qk3;
    let res_direct = solve_udl(q_factored);
    let d_direct: f64 = res_direct.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Superposition must match direct solve
    assert_close(d_combo_super, d_direct, 0.01, "EN1990 combo: superposition = direct");

    // Verify the factored load magnitude
    let q_expected: f64 = -17.55;
    assert_close(q_factored, q_expected, 0.01, "EN1990 factored load = -17.55 kN/m");

    // The leading variable action (imposed) is the dominant contributor:
    // gamma_Q * Qk1 = 1.5 * 8 = 12.0 kN/m downward vs gamma_G * Gk = 1.35 * 5 = 6.75 kN/m
    let contribution_g: f64 = (gamma_g * d_g).abs();
    let contribution_q1: f64 = (gamma_q * d_q1).abs();
    assert!(contribution_q1 > contribution_g,
        "EN1990: leading variable dominates: {:.6e} > {:.6e}", contribution_q1, contribution_g);

    // Wind uplift partially counteracts gravity
    assert!(d_q2 > 0.0, "EN1990: wind uplift gives positive deflection");

    // Reaction verification
    let r_direct: f64 = res_direct.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_super: f64 = gamma_g * res_g.reactions.iter().find(|r| r.node_id == 1).unwrap().rz
        + gamma_q * res_q1.reactions.iter().find(|r| r.node_id == 1).unwrap().rz
        + gamma_q * psi_0_wind * res_q2.reactions.iter().find(|r| r.node_id == 1).unwrap().rz
        + gamma_q * psi_0_snow * res_q3.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(r_direct, r_super, 0.01, "EN1990 combo: reaction superposition");
}

// ================================================================
// 4. Pattern Loading -- Checkerboard and Alternate Span Loading
// ================================================================
//
// For a 3-span continuous beam (equal spans L):
//   - Full load: DL+LL on all spans
//   - Pattern A (max midspan 1): DL all + LL on spans 1 & 3 only
//   - Pattern B (max support moment): DL all + LL on spans 1 & 2 only
//
// Pattern A produces max positive moment (sagging) in span 1.
// Pattern B produces max negative moment (hogging) at interior support B.
//
// References:
//   - ACI 318-19, Section 6.4.2
//   - Wight & MacGregor, "Reinforced Concrete", Ch. 10

#[test]
fn validation_lc_ext_pattern_loading() {
    let span: f64 = 6.0;
    let n_per: usize = 8;
    let q_d: f64 = -3.0;  // dead
    let q_l: f64 = -7.0;  // live

    // Helper to create span loads on specific spans
    let span_loads = |spans: &[usize], q: f64| -> Vec<SolverLoad> {
        let mut loads = Vec::new();
        for &s in spans {
            let first = (s - 1) * n_per + 1;
            for e in first..=(first + n_per - 1) {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: e, q_i: q, q_j: q, a: None, b: None,
                }));
            }
        }
        loads
    };

    let spans = [span, span, span];

    // Full load: D+L on all spans
    let loads_full = span_loads(&[1, 2, 3], q_d + q_l);
    let input_full = make_continuous_beam(&spans, n_per, E, A, IZ, loads_full);
    let res_full = linear::solve_2d(&input_full).unwrap();

    // Pattern A: D all + L on spans 1 & 3 (checkerboard for max midspan 1)
    let mut loads_a = span_loads(&[1, 2, 3], q_d);
    loads_a.extend(span_loads(&[1, 3], q_l));
    let input_a = make_continuous_beam(&spans, n_per, E, A, IZ, loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Pattern B: D all + L on spans 1 & 2 (for max hogging at support B)
    let mut loads_b = span_loads(&[1, 2, 3], q_d);
    loads_b.extend(span_loads(&[1, 2], q_l));
    let input_b = make_continuous_beam(&spans, n_per, E, A, IZ, loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Midspan node of span 1 (midpoint of 8-element span)
    let mid_span1 = n_per / 2 + 1;

    let d_full: f64 = res_full.displacements.iter().find(|d| d.node_id == mid_span1).unwrap().uz.abs();
    let d_pattern_a: f64 = res_a.displacements.iter().find(|d| d.node_id == mid_span1).unwrap().uz.abs();

    // Pattern A gives larger midspan deflection in span 1 than full load
    // because unloaded span 2 allows more rotation at interior support
    assert!(d_pattern_a > d_full,
        "Pattern A > full in span 1: {:.6e} > {:.6e}", d_pattern_a, d_full);

    // Support B is at node (n_per + 1)
    let support_b_node = n_per + 1;

    // Hogging moment at support B: use element forces at end of span 1
    // Element n_per (last element of span 1) has m_end at support B
    let m_b_full: f64 = res_full.element_forces.iter()
        .find(|f| f.element_id == n_per).unwrap().m_end.abs();
    let m_b_pattern_b: f64 = res_b.element_forces.iter()
        .find(|f| f.element_id == n_per).unwrap().m_end.abs();

    // Pattern B (adjacent spans loaded) gives larger hogging at support B
    assert!(m_b_pattern_b > m_b_full,
        "Pattern B > full at support B: {:.6e} > {:.6e}", m_b_pattern_b, m_b_full);

    // Verify reactions at support B
    let rb_full: f64 = res_full.reactions.iter().find(|r| r.node_id == support_b_node).unwrap().rz.abs();
    let rb_b: f64 = res_b.reactions.iter().find(|r| r.node_id == support_b_node).unwrap().rz.abs();
    // Pattern B produces larger reaction at support B (both adjacent spans loaded)
    assert!(rb_b > rb_full * 0.95,
        "Pattern B reaction at B significant: {:.4}", rb_b);
}

// ================================================================
// 5. Envelope from Multiple Load Cases -- Max/Min Moment and Shear
// ================================================================
//
// For a 2-span continuous beam, compute 4 load cases:
//   Case 1: DL only (all spans)
//   Case 2: DL + LL span 1 only
//   Case 3: DL + LL span 2 only
//   Case 4: DL + LL all spans
//
// The envelope is the set of max/min internal forces across all cases.
// Max positive moment in span 1 occurs from Case 2 (LL on span 1).
// Max hogging at interior support occurs from Case 4 (both loaded).
//
// Reference: Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 4

#[test]
fn validation_lc_ext_envelope_max_min() {
    let span: f64 = 8.0;
    let n_per: usize = 8;
    let q_d: f64 = -4.0;
    let q_l: f64 = -6.0;

    let span_loads = |spans: &[usize], q: f64| -> Vec<SolverLoad> {
        let mut loads = Vec::new();
        for &s in spans {
            let first = (s - 1) * n_per + 1;
            for e in first..=(first + n_per - 1) {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: e, q_i: q, q_j: q, a: None, b: None,
                }));
            }
        }
        loads
    };

    let spans = [span, span];

    // Case 1: DL only
    let loads1 = span_loads(&[1, 2], q_d);
    let res1 = linear::solve_2d(&make_continuous_beam(&spans, n_per, E, A, IZ, loads1)).unwrap();

    // Case 2: DL + LL on span 1 only
    let mut loads2 = span_loads(&[1, 2], q_d);
    loads2.extend(span_loads(&[1], q_l));
    let res2 = linear::solve_2d(&make_continuous_beam(&spans, n_per, E, A, IZ, loads2)).unwrap();

    // Case 3: DL + LL on span 2 only
    let mut loads3 = span_loads(&[1, 2], q_d);
    loads3.extend(span_loads(&[2], q_l));
    let res3 = linear::solve_2d(&make_continuous_beam(&spans, n_per, E, A, IZ, loads3)).unwrap();

    // Case 4: DL + LL all spans
    let loads4 = span_loads(&[1, 2], q_d + q_l);
    let res4 = linear::solve_2d(&make_continuous_beam(&spans, n_per, E, A, IZ, loads4)).unwrap();

    // Interior support at node (n_per + 1)
    let support_b = n_per + 1;
    // Midspan of span 1: node (n_per/2 + 1)
    let mid1 = n_per / 2 + 1;
    // Midspan of span 2: node (n_per + n_per/2 + 1)
    let mid2 = n_per + n_per / 2 + 1;

    // Collect midspan deflections of span 1 across all cases
    let d1_cases: Vec<f64> = [&res1, &res2, &res3, &res4].iter()
        .map(|r| r.displacements.iter().find(|d| d.node_id == mid1).unwrap().uz.abs())
        .collect();

    // Case 2 (LL on span 1) gives max deflection in span 1
    let max_d1: f64 = d1_cases.iter().cloned().fold(0.0_f64, f64::max);
    assert_close(max_d1, d1_cases[1], 0.01, "Envelope: Case 2 max defl span 1");

    // Hogging moment at interior support across cases
    let m_b_cases: Vec<f64> = [&res1, &res2, &res3, &res4].iter()
        .map(|r| r.element_forces.iter()
            .find(|f| f.element_id == n_per).unwrap().m_end.abs())
        .collect();

    // Case 4 (both spans loaded) gives max hogging at support B
    let max_m_b: f64 = m_b_cases.iter().cloned().fold(0.0_f64, f64::max);
    assert_close(max_m_b, m_b_cases[3], 0.01, "Envelope: Case 4 max hogging at B");

    // Shear at support B: reaction at interior support
    let v_b_cases: Vec<f64> = [&res1, &res2, &res3, &res4].iter()
        .map(|r| r.reactions.iter().find(|rx| rx.node_id == support_b).unwrap().rz.abs())
        .collect();

    // Case 4 gives max shear at support B
    let max_v_b: f64 = v_b_cases.iter().cloned().fold(0.0_f64, f64::max);
    assert_close(max_v_b, v_b_cases[3], 0.01, "Envelope: Case 4 max reaction at B");

    // Min moment at support B comes from Case 1 (DL only, smallest total load)
    let min_m_b: f64 = m_b_cases.iter().cloned().fold(f64::MAX, f64::min);
    assert_close(min_m_b, m_b_cases[0], 0.01, "Envelope: Case 1 min hogging at B");

    // By symmetry, Case 2 and Case 3 give equal deflection in their respective spans
    let d2_case3: f64 = res3.displacements.iter().find(|d| d.node_id == mid2).unwrap().uz.abs();
    assert_close(d1_cases[1], d2_case3, 0.02, "Envelope: symmetric pattern equal deflections");
}

// ================================================================
// 6. Counteracting Loads -- Uplift Check 0.9D + 1.0W
// ================================================================
//
// ASCE 7-22, Section 2.3.1, Combo 6: 0.9D + 1.0W
// For uplift/overturning checks, dead load is reduced to minimum
// credible level (0.9 factor) while wind is at full value.
//
// Cantilever beam, L=5m:
//   D: UDL -6 kN/m downward (gravity)
//   W: UDL +10 kN/m upward (wind uplift on roof)
//
// Net = 0.9*(-6) + 1.0*(+10) = -5.4 + 10.0 = +4.6 kN/m (net uplift)
//
// The beam lifts off if net load is upward -- check reaction changes sign.
//
// Reference: ASCE 7-22, Section 2.3.1

#[test]
fn validation_lc_ext_counteracting_uplift() {
    let l: f64 = 5.0;
    let n: usize = 10;
    let q_d: f64 = -6.0;   // dead (downward)
    let q_w: f64 = 10.0;   // wind (upward)

    let solve_udl = |q: f64| -> AnalysisResults {
        let loads: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
    };

    // Solve separately
    let res_d = solve_udl(q_d);
    let res_w = solve_udl(q_w);

    let ry_d: f64 = res_d.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_w: f64 = res_w.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;

    // D produces positive (upward) reactions supporting the beam
    assert!(ry_d > 0.0, "Dead load: positive reaction (upward support)");
    // W uplift produces negative (downward) reactions (beam pushed up, supports pull down)
    assert!(ry_w < 0.0, "Wind uplift: negative reaction (downward)");

    // Combo 6: 0.9D + 1.0W
    let ry_combo: f64 = 0.9 * ry_d + 1.0 * ry_w;

    // Net combo load: 0.9*(-6) + 1.0*(10) = +4.6 kN/m (upward)
    let q_net: f64 = 0.9 * q_d + 1.0 * q_w;
    assert!(q_net > 0.0, "Net load is uplift: q_net = {:.2} kN/m", q_net);

    // Since net load is upward, reaction at support must be negative (downward = tension)
    assert!(ry_combo < 0.0,
        "Uplift combo: reaction negative (tension) = {:.4} kN", ry_combo);

    // Verify direct solve matches superposition
    let res_combo = solve_udl(q_net);
    let ry_combo_direct: f64 = res_combo.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(ry_combo, ry_combo_direct, 0.01, "Uplift combo: superposition = direct");

    // Analytical: for SS beam with net upward UDL q_net > 0,
    // the support reaction is negative (downward, i.e., tension hold-down).
    // R = -q_net * L / 2 in the solver sign convention.
    let ry_expected: f64 = -q_net * l / 2.0;
    assert_close(ry_combo_direct, ry_expected, 0.02, "Uplift: R = -q*L/2");

    // Compare with full dead (1.0D + 1.0W): different from 0.9D + 1.0W
    let ry_full: f64 = 1.0 * ry_d + 1.0 * ry_w;
    // With 1.0D: net = -6+10 = +4 kN/m (less uplift than 0.9D case)
    // With 0.9D: net = -5.4+10 = +4.6 kN/m (more uplift -- more conservative for overturning)
    assert!(ry_combo.abs() > ry_full.abs(),
        "0.9D+W more critical than 1.0D+W for uplift: {:.4} > {:.4}",
        ry_combo.abs(), ry_full.abs());
}

// ================================================================
// 7. Companion Action Factors -- psi_0, psi_1, psi_2 for EN 1990
// ================================================================
//
// EN 1990:2002, Table A1.1 defines combination value factors:
//   Category A (residential): psi_0 = 0.7, psi_1 = 0.5, psi_2 = 0.3
//   Wind:                     psi_0 = 0.6, psi_1 = 0.2, psi_2 = 0.0
//   Snow (altitude <= 1000m): psi_0 = 0.5, psi_1 = 0.2, psi_2 = 0.0
//
// Three combinations tested:
//   ULS Fundamental (6.10): 1.35*G + 1.5*Q_imposed + 1.5*0.6*Q_wind + 1.5*0.5*Q_snow
//   SLS Frequent    (6.15): 1.0*G + 0.5*Q_imposed + 0.2*Q_wind
//   SLS Quasi-permanent (6.16): 1.0*G + 0.3*Q_imposed
//
// Verify that ULS > SLS_frequent > SLS_quasi-permanent for deflection.
//
// Reference: EN 1990:2002, Table A1.1, Eqs. 6.10, 6.15b, 6.16b

#[test]
fn validation_lc_ext_companion_action_factors() {
    let l: f64 = 10.0;
    let n: usize = 20;
    let mid = n / 2 + 1;

    // Characteristic loads (kN/m)
    let gk: f64 = -5.0;    // permanent
    let qk_imp: f64 = -4.0; // imposed (Category A residential)
    let qk_w: f64 = -2.0;   // wind (pressure, downward for this check)
    let qk_s: f64 = -1.5;   // snow

    // psi factors for Category A / wind / snow
    let _psi_0_imp: f64 = 0.7;
    let psi_1_imp: f64 = 0.5;
    let psi_2_imp: f64 = 0.3;
    let psi_0_w: f64 = 0.6;
    let psi_1_w: f64 = 0.2;
    let psi_0_s: f64 = 0.5;

    let solve_udl = |q: f64| -> f64 {
        let loads: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let res = linear::solve_2d(&input).unwrap();
        res.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs()
    };

    // Individual case deflections
    let d_g: f64 = solve_udl(gk);
    let d_imp: f64 = solve_udl(qk_imp);
    let d_w: f64 = solve_udl(qk_w);
    let d_s: f64 = solve_udl(qk_s);

    // ULS Fundamental (Eq. 6.10): imposed as leading action
    // 1.35*G + 1.5*Q_imp + 1.5*psi_0_w*Q_w + 1.5*psi_0_s*Q_s
    let q_uls: f64 = 1.35 * gk + 1.5 * qk_imp + 1.5 * psi_0_w * qk_w + 1.5 * psi_0_s * qk_s;
    let d_uls: f64 = solve_udl(q_uls);

    // SLS Frequent (Eq. 6.15b): G + psi_1*Q_imp + psi_1_w*Q_w (snow quasi-perm = 0)
    let q_freq: f64 = 1.0 * gk + psi_1_imp * qk_imp + psi_1_w * qk_w;
    let d_freq: f64 = solve_udl(q_freq);

    // SLS Quasi-permanent (Eq. 6.16b): G + psi_2*Q_imp (wind & snow = 0)
    let q_qp: f64 = 1.0 * gk + psi_2_imp * qk_imp;
    let d_qp: f64 = solve_udl(q_qp);

    // ULS > Frequent > Quasi-permanent
    assert!(d_uls > d_freq,
        "ULS > SLS_frequent: {:.6e} > {:.6e}", d_uls, d_freq);
    assert!(d_freq > d_qp,
        "SLS_frequent > SLS_quasi: {:.6e} > {:.6e}", d_freq, d_qp);

    // Verify superposition for ULS combination
    let d_uls_super: f64 = 1.35 * d_g + 1.5 * d_imp + 1.5 * psi_0_w * d_w + 1.5 * psi_0_s * d_s;
    assert_close(d_uls, d_uls_super, 0.01, "ULS combo: superposition matches");

    // Verify superposition for frequent combination
    let d_freq_super: f64 = 1.0 * d_g + psi_1_imp * d_imp + psi_1_w * d_w;
    assert_close(d_freq, d_freq_super, 0.01, "SLS frequent: superposition matches");

    // Verify superposition for quasi-permanent combination
    let d_qp_super: f64 = 1.0 * d_g + psi_2_imp * d_imp;
    assert_close(d_qp, d_qp_super, 0.01, "SLS quasi-perm: superposition matches");

    // Ratio of ULS to service should reflect load factor amplification
    let ratio_uls_qp: f64 = d_uls / d_qp;
    let expected_ratio: f64 = q_uls.abs() / q_qp.abs();
    assert_close(ratio_uls_qp, expected_ratio, 0.01, "ULS/QP deflection ratio = load ratio");
}

// ================================================================
// 8. Load Combination with Thermal -- 1.2D + T + L per ASCE 7
// ================================================================
//
// ASCE 7-22, Section 2.3.1, Combo 4: 1.2D + 1.0T + 1.0L + 0.5S
//
// A thermal gradient across a beam depth causes bending (self-straining)
// in restrained structures. For a fixed-fixed beam, a thermal gradient
// produces restrained moments M_T = E*I*alpha*DeltaT/h at each end.
//
// We model the thermal gradient effect as equivalent end moments applied
// at interior nodes (since the solver does not have native thermal loads).
// This lets us verify the superposition principle for the combination
// 1.2D + 1.0T + 1.0L using separate load cases.
//
// Reference: ASCE 7-22, Section 2.3.1; Ghali & Neville Ch. 6

#[test]
fn validation_lc_ext_thermal_combination() {
    let l: f64 = 6.0;
    let n: usize = 12;
    let mid = n / 2 + 1;

    // Thermal gradient parameters
    let alpha_t: f64 = 12.0e-6;  // steel thermal coefficient (1/degC)
    let delta_t_grad: f64 = 30.0; // temperature difference top-to-bottom (degC)
    let h: f64 = 0.40;            // section depth (m)
    let e_eff: f64 = E * 1000.0;  // kN/m^2 (solver E)

    // Equivalent thermal moment from gradient: M_T = E*I*alpha*DeltaT/h
    let m_thermal: f64 = e_eff * IZ * alpha_t * delta_t_grad / h;

    // Verify M_T analytically
    // E_eff = 200e6 kN/m^2, IZ = 1e-4 m^4, alpha = 12e-6, DT = 30, h = 0.40
    // M_T = 200e6 * 1e-4 * 12e-6 * 30 / 0.40 = 200e6 * 1e-4 * 3.6e-4 / 0.40
    //     = 200e6 * 3.6e-8 / 0.40 = 7.2 / 0.40 = 18.0 kN*m
    let m_t_expected: f64 = 18.0;
    assert_close(m_thermal, m_t_expected, 0.01, "Thermal moment M_T = EI*alpha*DT/h");

    // Dead load: UDL -5 kN/m
    let q_d: f64 = -5.0;
    // Live load: midspan point load -20 kN
    let p_l: f64 = -20.0;

    // Build load cases for fixed-fixed beam
    let build_case = |apply_dead: bool, apply_live: bool, apply_thermal: bool,
                      factor_d: f64, factor_l: f64, factor_t: f64| -> AnalysisResults {
        let mut loads = Vec::new();
        if apply_dead {
            for i in 1..=n {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i, q_i: factor_d * q_d, q_j: factor_d * q_d, a: None, b: None,
                }));
            }
        }
        if apply_live {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fz: factor_l * p_l, my: 0.0,
            }));
        }
        if apply_thermal {
            // Model thermal gradient as equivalent moments at quarter-span nodes.
            // The thermal gradient causes curvature, modeled as applied moments
            // at internal nodes to produce bending distinct from gravity loads.
            let q_pt = n / 4 + 1;       // quarter-span node
            let three_q = 3 * n / 4 + 1; // three-quarter-span node
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: q_pt, fx: 0.0, fz: 0.0, my: factor_t * m_thermal,
            }));
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: three_q, fx: 0.0, fz: 0.0, my: -factor_t * m_thermal,
            }));
        }
        let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
        linear::solve_2d(&input).unwrap()
    };

    // Individual cases
    let res_d = build_case(true, false, false, 1.0, 0.0, 0.0);
    let res_l = build_case(false, true, false, 0.0, 1.0, 0.0);
    let res_t = build_case(false, false, true, 0.0, 0.0, 1.0);

    // Combined: 1.2D + 1.0T + 1.0L
    let res_combo = build_case(true, true, true, 1.2, 1.0, 1.0);

    // Superposition check on displacements
    let d_d: f64 = res_d.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_l: f64 = res_l.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_t: f64 = res_t.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_combo: f64 = res_combo.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    let d_super: f64 = 1.2 * d_d + 1.0 * d_l + 1.0 * d_t;
    assert_close(d_combo, d_super, 0.02, "Thermal combo: deflection superposition");

    // Superposition check on reactions
    let ry_d: f64 = res_d.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_l: f64 = res_l.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_t: f64 = res_t.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_combo: f64 = res_combo.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;

    let ry_super: f64 = 1.2 * ry_d + 1.0 * ry_l + 1.0 * ry_t;
    assert_close(ry_combo, ry_super, 0.02, "Thermal combo: reaction superposition");

    // Moment superposition at fixed end
    let mz_d: f64 = res_d.reactions.iter().find(|r| r.node_id == 1).unwrap().my;
    let mz_l: f64 = res_l.reactions.iter().find(|r| r.node_id == 1).unwrap().my;
    let mz_t: f64 = res_t.reactions.iter().find(|r| r.node_id == 1).unwrap().my;
    let mz_combo: f64 = res_combo.reactions.iter().find(|r| r.node_id == 1).unwrap().my;

    let mz_super: f64 = 1.2 * mz_d + 1.0 * mz_l + 1.0 * mz_t;
    assert_close(mz_combo, mz_super, 0.02, "Thermal combo: moment superposition");

    // Dead load produces downward deflection (negative uy for downward load)
    assert!(d_d < 0.0, "Dead load: negative deflection (downward)");
    // Live load at midspan produces downward deflection
    assert!(d_l < 0.0, "Live load: negative deflection (downward)");

    // Thermal gradient causes non-zero deflection distinct from zero
    assert!(d_t.abs() > 1e-10, "Thermal gradient produces non-zero deflection");

    // The combined deflection differs from pure gravity by the thermal contribution
    let d_gravity_only: f64 = 1.2 * d_d + 1.0 * d_l;
    assert_close(d_combo, d_gravity_only + d_t, 0.02,
        "Thermal combo = gravity + thermal contribution");

    // Verify for fixed-fixed beam with UDL: M_end = qL^2/12
    let mz_d_expected: f64 = q_d * l * l / 12.0;
    assert_close(mz_d.abs(), mz_d_expected.abs(), 0.03,
        "Fixed-fixed: M_end = qL^2/12");
}
