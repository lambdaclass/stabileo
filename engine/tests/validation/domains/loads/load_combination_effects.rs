/// Validation: Load Combination Effects
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 8–9 (superposition principle)
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 2 (basic beam formulas)
///   - Roark & Young, "Formulas for Stress and Strain", 7th Ed., Table 3 (beam cases)
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed., Ch. 2
///
/// Tests verify that combinations of loads on beams and frames behave correctly:
///   1. Point load + UDL superposition on SS beam (deflection and reactions)
///   2. Opposing loads — partial cancellation (net reaction and midspan displacement)
///   3. Symmetric + antisymmetric decomposition of two-point-load problem
///   4. Multiple point loads vs. statically equivalent UDL
///   5. End moments + transverse load on fixed-fixed beam
///   6. Axial preload combined with lateral UDL (independent for linear analysis)
///   7. Moving load envelope concept — max midspan deflection bound
///   8. Load reversal symmetry — reversing all loads reverses all responses
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m²
const IZ: f64 = 1e-4;     // m⁴

// ================================================================
// 1. Point Load + UDL Superposition on SS Beam
// ================================================================
//
// SS beam, length L = 8 m.
// Case A: midspan point load P only.
// Case B: UDL w only.
// Case C: both P + w.
//
// Superposition: reactions_C = reactions_A + reactions_B,
//                deflection_C = deflection_A + deflection_B.
//
// Reference: Hibbeler "Structural Analysis" 10th Ed., §8-2.

#[test]
fn validation_lce_udl_plus_point_superposition() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;   // kN, midspan point load (downward)
    let w = -5.0;   // kN/m UDL (downward)
    let mid = n / 2 + 1; // midspan node

    let build = |apply_point: bool, apply_udl: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if apply_point {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            }));
        }
        if apply_udl {
            for i in 1..=n {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i, q_i: w, q_j: w, a: None, b: None,
                }));
            }
        }
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
    };

    let ra = build(true, false);
    let rb = build(false, true);
    let rc = build(true, true);

    // Reaction at node 1: superposition
    let r1a = ra.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r1b = rb.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r1c = rc.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(r1c, r1a + r1b, 0.01, "LCE superposition: R1y_C = R1y_A + R1y_B");

    // Midspan deflection: superposition
    let da = ra.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let db = rb.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let dc = rc.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    assert_close(dc, da + db, 0.01, "LCE superposition: δ_C = δ_A + δ_B");

    // Independent analytical checks
    let e_eff = E * 1000.0;
    // δ_midspan (point load, SS, midspan): PL³/(48EI)
    let delta_p_exact = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(da.abs(), delta_p_exact, 0.02,
        "LCE: δ midspan (point load) = PL³/48EI");
    // δ_midspan (UDL, SS): 5wL⁴/(384EI)
    let delta_udl_exact = 5.0 * w.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(db.abs(), delta_udl_exact, 0.02,
        "LCE: δ midspan (UDL) = 5wL⁴/384EI");
}

// ================================================================
// 2. Opposing Loads — Partial Cancellation
// ================================================================
//
// Cantilever beam, length L = 5 m.
// Load 1: tip downward point load P₁ = 30 kN (negative fy).
// Load 2: UDL upward w = +6 kN/m over full length.
// Net vertical load = P₁ − w·L = 30 − 30 = 0 → fixed-end shear ≈ 0.
//
// Reference: Ghali & Neville "Structural Analysis" 7th Ed., §2.3.

#[test]
fn validation_lce_opposing_loads_cancellation() {
    let l = 5.0;
    let n = 8;
    let p1 = 30.0;  // kN downward at tip
    let w_up = 6.0; // kN/m upward (net total = 30 kN upward)

    let loads: Vec<SolverLoad> = {
        let mut v = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p1, mz: 0.0,
        })];
        for i in 1..=n {
            v.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: w_up, q_j: w_up, a: None, b: None,
            }));
        }
        v
    };

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Net vertical load = P1_down − w_up * L = 30 − 30 = 0
    // Fixed-end reaction Ry should be ~0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.ry.abs() < 0.5,
        "Opposing loads: Ry should ≈ 0, got {:.4}", r1.ry);

    // But moment at fixed end is NOT zero (they don't cancel in moments)
    // M_fixed = P1·L − w_up·L²/2 = 30·5 − 6·25/2 = 150 − 75 = 75 kN·m
    let m_exact = p1 * l - w_up * l * l / 2.0;
    assert_close(r1.mz.abs(), m_exact, 0.02,
        "Opposing loads: M_fixed = P1·L − wL²/2");
}

// ================================================================
// 3. Symmetric + Antisymmetric Decomposition
// ================================================================
//
// SS beam, L = 10 m, with two equal point loads P at positions a and L-a.
// This load has symmetric and antisymmetric components.
// Combined deflection must equal the FEM result directly.
//
// Reference: Hibbeler "Structural Analysis" 10th Ed., §8-4 (symmetry).

#[test]
fn validation_lce_symmetric_antisymmetric_decomposition() {
    let l = 10.0;
    let n = 10;
    let p1 = 15.0; // at node at L/4
    let p2 = 9.0;  // at node at 3L/4 (asymmetric)
    let n1 = n / 4 + 1;       // node at L/4
    let n2 = 3 * n / 4 + 1;   // node at 3L/4

    // Symmetric part: (p1+p2)/2 at both n1 and n2
    // Antisymmetric part: (p1-p2)/2 downward at n1, (p2-p1)/2 at n2 (upward)

    let p_sym = (p1 + p2) / 2.0;
    let p_anti = (p1 - p2) / 2.0;

    // Direct combined
    let combined_loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fy: -p1, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fy: -p2, mz: 0.0 }),
    ];
    let input_direct = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), combined_loads);
    let res_direct = linear::solve_2d(&input_direct).unwrap();

    // Symmetric component alone
    let sym_loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fy: -p_sym, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fy: -p_sym, mz: 0.0 }),
    ];
    let input_sym = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), sym_loads);
    let res_sym = linear::solve_2d(&input_sym).unwrap();

    // Antisymmetric component alone
    let anti_loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fy: -p_anti, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fy: p_anti, mz: 0.0 }),
    ];
    let input_anti = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), anti_loads);
    let res_anti = linear::solve_2d(&input_anti).unwrap();

    // Check that direct = symmetric + antisymmetric at midspan
    let mid = n / 2 + 1;
    let d_direct = res_direct.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d_sym = res_sym.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d_anti = res_anti.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    assert_close(d_direct, d_sym + d_anti, 0.01,
        "Sym+anti decomposition: δ_mid");

    // Check reaction superposition at node 1
    let r_direct = res_direct.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_sym = res_sym.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_anti = res_anti.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(r_direct, r_sym + r_anti, 0.01,
        "Sym+anti decomposition: R1y");
}

// ================================================================
// 4. Multiple Point Loads vs. Equivalent UDL
// ================================================================
//
// A series of n equally-spaced point loads of total magnitude W
// approximates a UDL of intensity w = W/L on an SS beam.
// As n → ∞, the midspan deflection converges to 5wL⁴/(384EI).
//
// With n = 8 loads on a beam of L = 8 m (one per metre), total W = 40 kN:
//   Equivalent UDL w = W/L = 5 kN/m, δ_mid_exact = 5·5·8⁴/(384·EI).
// The 8-load discrete approximation should be within ~2% of the continuous UDL.
//
// Reference: Roark & Young "Formulas for Stress and Strain" 7th Ed., Table 3-3.

#[test]
fn validation_lce_discrete_loads_vs_udl() {
    let l = 8.0;
    let n_elem = 8;
    let n_loads = 8;
    let w_total = 40.0; // kN total
    let w_per_load = w_total / n_loads as f64; // 5 kN per load
    let w_udl = w_total / l; // equivalent UDL intensity (kN/m)
    let e_eff = E * 1000.0;

    // Discrete loads at interior nodes (nodes 2 through n_elem, i.e. at x = 1, 2, …, 7 m)
    // Beam has n_elem+1 = 9 nodes; interior nodes are 2..=n_elem
    let mut discrete_loads = Vec::new();
    for i in 2..=(n_elem) {
        discrete_loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -w_per_load, mz: 0.0,
        }));
    }
    let input_discrete = make_beam(n_elem, l, E, A, IZ, "pinned", Some("rollerX"), discrete_loads);
    let res_discrete = linear::solve_2d(&input_discrete).unwrap();

    // UDL case (same total load)
    let udl_loads: Vec<SolverLoad> = (1..=n_elem)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -w_udl, q_j: -w_udl, a: None, b: None,
        }))
        .collect();
    let input_udl = make_beam(n_elem, l, E, A, IZ, "pinned", Some("rollerX"), udl_loads);
    let res_udl = linear::solve_2d(&input_udl).unwrap();

    let mid = n_elem / 2 + 1;
    let d_discrete = res_discrete.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d_udl = res_udl.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Both should be close to exact UDL deflection
    let delta_exact = 5.0 * w_udl * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_udl.abs(), delta_exact, 0.02,
        "Equivalent UDL: δ_mid = 5wL⁴/384EI");

    // Discrete approximation within 5% of UDL
    let ratio = d_discrete / d_udl;
    assert!((ratio - 1.0).abs() < 0.05,
        "Discrete vs UDL: ratio={:.4} (should be within 5%)", ratio);
}

// ================================================================
// 5. End Moments + Transverse Load on Fixed-Fixed Beam
// ================================================================
//
// Fixed-fixed beam, length L = 6 m.
// Applied end moment M₀ at the left (node 1) via a nodal moment load,
// plus midspan point load P.
//
// Superposition:
//   From P alone: M_fixed = PL/8 (each end), V = P/2.
//   From M₀ alone: M_fixed_left += M₀ (but beam is fixed so M₀ causes redistribution).
// Verify the combined reaction equals the sum of individual cases.
//
// Reference: Ghali & Neville "Structural Analysis" 7th Ed., §8.5.

#[test]
fn validation_lce_end_moment_plus_transverse() {
    let l = 6.0;
    let n = 8;
    let p = 24.0;    // kN midspan
    let m0 = 10.0;   // kN·m applied moment at left end (free moment, not support moment)
    let mid = n / 2 + 1;

    let build = |apply_p: bool, apply_m: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if apply_p {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            }));
        }
        if apply_m {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 0.0, fy: 0.0, mz: m0,
            }));
        }
        let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_p = build(true, false);
    let res_m = build(false, true);
    let res_both = build(true, true);

    // Superposition: reaction Ry at node 1
    let ry_p = res_p.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_m = res_m.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_both = res_both.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(ry_both, ry_p + ry_m, 0.01,
        "End moment + transverse: superposition Ry");

    // From P alone on fixed-fixed: R = P/2, M_ends = PL/8
    assert_close(ry_p, p / 2.0, 0.02,
        "Fixed-fixed beam, midspan P: R = P/2");
    let mz_p = res_p.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    let m_fixed_p_exact = p * l / 8.0;
    assert_close(mz_p.abs(), m_fixed_p_exact, 0.02,
        "Fixed-fixed beam, midspan P: M_end = PL/8");
}

// ================================================================
// 6. Axial Preload Combined with Lateral UDL
// ================================================================
//
// Cantilever beam, length L = 5 m.
// Axial preload N_pre = 100 kN (tension) applied at tip along X.
// Lateral UDL w = -8 kN/m applied simultaneously.
//
// In linear analysis (no P-delta) these are completely independent:
// Axial: δx = N·L/(EA).
// Bending: δy = wL⁴/(8EI), M_fixed = wL²/2.
//
// The combined response must equal the sum of individual cases.
//
// Reference: Timoshenko "Strength of Materials" Vol. II, §63.

#[test]
fn validation_lce_axial_preload_plus_lateral_udl() {
    let l = 5.0;
    let n = 8;
    let n_pre = 100.0; // kN axial tension at tip
    let w = -8.0;      // kN/m UDL downward

    let e_eff = E * 1000.0;

    let build = |axial: bool, lateral: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if axial {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: n_pre, fy: 0.0, mz: 0.0,
            }));
        }
        if lateral {
            for i in 1..=n {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i, q_i: w, q_j: w, a: None, b: None,
                }));
            }
        }
        let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_axial = build(true, false);
    let res_lateral = build(false, true);
    let res_combined = build(true, true);

    let tip_axial = res_axial.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_lateral = res_lateral.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_combined = res_combined.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Superposition of displacements
    assert_close(tip_combined.ux, tip_axial.ux + tip_lateral.ux, 0.01,
        "Axial+lateral: superposition ux");
    assert_close(tip_combined.uy, tip_axial.uy + tip_lateral.uy, 0.01,
        "Axial+lateral: superposition uy");

    // Analytical check — axial tip displacement
    let dx_exact = n_pre * l / (e_eff * A);
    assert_close(tip_axial.ux, dx_exact, 0.02,
        "Axial preload: δx = NL/(EA)");

    // Analytical check — cantilever tip deflection under UDL
    let dy_exact = w.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    assert_close(tip_lateral.uy.abs(), dy_exact, 0.02,
        "Cantilever UDL: δy = wL⁴/8EI");
}

// ================================================================
// 7. Moving Load Envelope — Max Midspan Deflection Bound
// ================================================================
//
// SS beam, L = 12 m. A single unit point load P moves along the span.
// The influence line for midspan deflection peaks when P is at midspan.
// The maximum value is PL³/(48EI).
//
// Compare: load at midspan vs. load at L/4 vs. load at 3L/4.
// The midspan placement must give the largest midspan deflection.
//
// Reference: Hibbeler "Structural Analysis" 10th Ed., §6-4 (influence lines).

#[test]
fn validation_lce_moving_load_max_at_midspan() {
    let l = 12.0;
    let n = 12;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let quarter = n / 4 + 1;
    let three_quarter = 3 * n / 4 + 1;

    let deflect_at = |load_node: usize| -> f64 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy
    };

    let d_mid_load = deflect_at(mid);
    let d_quarter_load = deflect_at(quarter);
    let d_three_quarter_load = deflect_at(three_quarter);

    // Midspan deflection is maximized when load is at midspan (influence line peak)
    assert!(d_mid_load.abs() > d_quarter_load.abs(),
        "Moving load: midspan load gives larger midspan deflection than quarter-span load");
    assert!(d_mid_load.abs() > d_three_quarter_load.abs(),
        "Moving load: midspan load gives larger midspan deflection than 3/4-span load");

    // Exact value when load is at midspan: δ = PL³/(48EI)
    let delta_exact = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_mid_load.abs(), delta_exact, 0.02,
        "Moving load: δ_max = PL³/(48EI)");

    // By the reciprocal theorem, the influence line is symmetric:
    // deflection at midspan due to P at L/4 equals deflection at L/4 due to P at midspan.
    // Check: d_quarter_load (P@L/4) ≈ d_three_quarter_load (P@3L/4) by symmetry
    let ratio = d_quarter_load / d_three_quarter_load;
    assert!((ratio - 1.0).abs() < 0.02,
        "Moving load symmetry: P@L/4 and P@3L/4 give same midspan deflection, ratio={:.4}", ratio);
}

// ================================================================
// 8. Load Reversal Symmetry
// ================================================================
//
// Any linear structure: if all loads are reversed (multiplied by −1),
// all responses (displacements, reactions, internal forces) are reversed.
//
// Test on a two-span continuous beam with a mixed load pattern.
// Verify: response_reversed = −response_original.
//
// Reference: Ghali & Neville "Structural Analysis" 7th Ed., §1.4 (linearity).

#[test]
fn validation_lce_load_reversal_symmetry() {
    let l = 5.0;
    let n_per = 6;
    let p = 18.0;   // point load
    let w = -4.0;   // UDL intensity

    let build = |sign: f64| -> AnalysisResults {
        let mut loads = Vec::new();
        // Point load at midspan of span 1
        let mid_span1 = n_per / 2 + 1;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_span1, fx: 0.0, fy: sign * (-p), mz: 0.0,
        }));
        // UDL on span 2
        for i in (n_per + 1)..=(2 * n_per) {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: sign * w, q_j: sign * w, a: None, b: None,
            }));
        }
        let input = make_continuous_beam(&[l, l], n_per, E, A, IZ, loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_pos = build(1.0);
    let res_neg = build(-1.0);

    // Every reaction must flip sign
    for r_pos in &res_pos.reactions {
        let r_neg = res_neg.reactions.iter().find(|r| r.node_id == r_pos.node_id).unwrap();
        assert_close(r_neg.ry, -r_pos.ry, 0.01,
            &format!("Load reversal: Ry at node {} reversed", r_pos.node_id));
        assert_close(r_neg.mz, -r_pos.mz, 0.01,
            &format!("Load reversal: Mz at node {} reversed", r_pos.node_id));
    }

    // Every displacement must flip sign
    for d_pos in &res_pos.displacements {
        let d_neg = res_neg.displacements.iter().find(|d| d.node_id == d_pos.node_id).unwrap();
        assert_close(d_neg.uy, -d_pos.uy, 0.01,
            &format!("Load reversal: uy at node {} reversed", d_pos.node_id));
    }
}
