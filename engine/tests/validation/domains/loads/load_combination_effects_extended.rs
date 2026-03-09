/// Validation: Load Combination Effects — Extended
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4–9 (superposition, beams, frames)
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 2–4
///   - Roark & Young, "Formulas for Stress and Strain", 7th Ed., Tables 3–8
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed., Ch. 1–2
///
/// Tests verify extended load combination behavior:
///   1. Triangular + uniform load superposition on cantilever
///   2. Double-span continuous beam — UDL on one span vs both spans
///   3. Portal frame lateral + gravity superposition
///   4. Propped cantilever — point load + moment superposition
///   5. Fixed-fixed beam — two symmetric point loads vs equivalent UDL
///   6. Cantilever — tip moment + tip point load independence
///   7. Continuous beam — pattern loading (checkerboard) vs full loading
///   8. Scaling linearity — doubling all loads doubles all responses
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m²
const IZ: f64 = 1e-4;     // m⁴

// ================================================================
// 1. Triangular + Uniform Load Superposition on Cantilever
// ================================================================
//
// Cantilever beam, length L = 6 m, fixed at node 1, free at tip.
// Case A: Uniform downward load w = -10 kN/m.
// Case B: Triangular load from 0 at fixed end to w_max = -10 kN/m at tip
//         (q_i = 0, q_j = w_max on each element with linearly varying ends).
// Case C: Both loads applied simultaneously.
//
// Superposition: δ_C = δ_A + δ_B, R_C = R_A + R_B.
//
// Cantilever tip deflection under UDL: δ = wL⁴/(8EI)
// Cantilever tip deflection under triangular load (zero at root, w at tip):
//   δ = wL⁴/(30EI)
//
// Reference: Roark & Young, Table 3-2 (cantilever cases).

#[test]
fn validation_lce_ext_triangular_plus_uniform_cantilever() {
    let l = 6.0;
    let n = 10;
    let w_uniform: f64 = -10.0; // kN/m (downward)
    let w_max: f64 = -10.0;     // kN/m at tip (downward)
    let e_eff: f64 = E * 1000.0;
    let elem_len: f64 = l / n as f64;

    let build = |apply_uniform: bool, apply_triangular: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if apply_uniform {
            for i in 1..=n {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i,
                    q_i: w_uniform,
                    q_j: w_uniform,
                    a: None,
                    b: None,
                }));
            }
        }
        if apply_triangular {
            // Triangular load: linearly from 0 at x=0 to w_max at x=L
            for i in 1..=n {
                let x_start = (i - 1) as f64 * elem_len;
                let x_end = i as f64 * elem_len;
                let qi = w_max * x_start / l;
                let qj = w_max * x_end / l;
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i,
                    q_i: qi,
                    q_j: qj,
                    a: None,
                    b: None,
                }));
            }
        }
        let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_a = build(true, false);
    let res_b = build(false, true);
    let res_c = build(true, true);

    let tip = n + 1;

    // Superposition check: tip deflection
    let da = res_a.displacements.iter().find(|d| d.node_id == tip).unwrap().uy;
    let db = res_b.displacements.iter().find(|d| d.node_id == tip).unwrap().uy;
    let dc = res_c.displacements.iter().find(|d| d.node_id == tip).unwrap().uy;
    assert_close(dc, da + db, 0.01, "Tri+UDL cantilever: δ_C = δ_A + δ_B");

    // Superposition check: fixed-end reaction Ry
    let ra = res_a.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rc = res_c.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(rc, ra + rb, 0.01, "Tri+UDL cantilever: Ry_C = Ry_A + Ry_B");

    // Analytical: UDL tip deflection = wL⁴/(8EI)
    let delta_udl_exact = w_uniform.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    assert_close(da.abs(), delta_udl_exact, 0.02, "Cantilever UDL: δ = wL⁴/(8EI)");

    // Analytical: Triangular load on cantilever, zero at fixed end, w_max at free end:
    //   δ_tip = 11 * w_max * L⁴ / (120 * EI)
    // Reference: Roark & Young, Table 3-2, case with linearly increasing load.
    let delta_tri_exact = 11.0 * w_max.abs() * l.powi(4) / (120.0 * e_eff * IZ);
    assert_close(db.abs(), delta_tri_exact, 0.03, "Cantilever triangular: δ = 11wL⁴/(120EI)");
}

// ================================================================
// 2. Double-Span Continuous Beam — UDL on One Span vs Both Spans
// ================================================================
//
// Two-span continuous beam, each span L = 6 m.
// Supports: pinned at left, rollerX at center, rollerX at right.
//
// Case A: UDL on span 1 only.
// Case B: UDL on span 2 only.
// Case C: UDL on both spans.
// Superposition: C = A + B.
//
// For a two-span beam with UDL w on both spans (symmetric loading):
//   Center reaction = 10wL/8 = 5wL/4
//   End reactions = 3wL/8
//
// Reference: Ghali & Neville, "Structural Analysis", 7th Ed., §4.3.

#[test]
fn validation_lce_ext_continuous_beam_span_loading() {
    let l = 6.0;
    let n_per = 8;
    let w: f64 = -5.0; // kN/m (downward)
    let total_elem = n_per * 2;

    let build = |span1: bool, span2: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if span1 {
            for i in 1..=n_per {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i, q_i: w, q_j: w, a: None, b: None,
                }));
            }
        }
        if span2 {
            for i in (n_per + 1)..=(total_elem) {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i, q_i: w, q_j: w, a: None, b: None,
                }));
            }
        }
        let input = make_continuous_beam(&[l, l], n_per, E, A, IZ, loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_a = build(true, false);
    let res_b = build(false, true);
    let res_c = build(true, true);

    let center_node = n_per + 1;
    let end_node = 2 * n_per + 1;

    // Superposition: center reaction
    let rc_a = res_a.reactions.iter().find(|r| r.node_id == center_node).unwrap().ry;
    let rc_b = res_b.reactions.iter().find(|r| r.node_id == center_node).unwrap().ry;
    let rc_c = res_c.reactions.iter().find(|r| r.node_id == center_node).unwrap().ry;
    assert_close(rc_c, rc_a + rc_b, 0.01,
        "Continuous beam: center Ry superposition");

    // Superposition: end reactions
    let r1_a = res_a.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r1_b = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r1_c = res_c.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(r1_c, r1_a + r1_b, 0.01,
        "Continuous beam: left Ry superposition");

    let rn_a = res_a.reactions.iter().find(|r| r.node_id == end_node).unwrap().ry;
    let rn_b = res_b.reactions.iter().find(|r| r.node_id == end_node).unwrap().ry;
    let rn_c = res_c.reactions.iter().find(|r| r.node_id == end_node).unwrap().ry;
    assert_close(rn_c, rn_a + rn_b, 0.01,
        "Continuous beam: right Ry superposition");

    // Analytical: UDL on both spans of two-span continuous beam
    // Center reaction = 5wL/4, end reactions = 3wL/8
    let w_abs = w.abs();
    let r_center_exact = 5.0 * w_abs * l / 4.0;
    let r_end_exact = 3.0 * w_abs * l / 8.0;
    assert_close(rc_c, r_center_exact, 0.02,
        "Continuous beam both spans: R_center = 5wL/4");
    assert_close(r1_c, r_end_exact, 0.02,
        "Continuous beam both spans: R_end = 3wL/8");
}

// ================================================================
// 3. Portal Frame — Lateral + Gravity Superposition
// ================================================================
//
// Fixed-base portal frame, height h = 4 m, width w = 6 m.
// Case A: Lateral load H = 20 kN at left knee (node 2).
// Case B: Gravity load G = -30 kN at each knee (nodes 2 and 3).
// Case C: Both loads applied simultaneously.
//
// Superposition must hold for all reactions and displacements.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Ch. 9.

#[test]
fn validation_lce_ext_portal_frame_superposition() {
    let h = 4.0;
    let w = 6.0;
    let h_lat = 20.0;
    let g_vert = -30.0;

    let res_a = {
        let input = make_portal_frame(h, w, E, A, IZ, h_lat, 0.0);
        linear::solve_2d(&input).unwrap()
    };
    let res_b = {
        let input = make_portal_frame(h, w, E, A, IZ, 0.0, g_vert);
        linear::solve_2d(&input).unwrap()
    };
    let res_c = {
        let input = make_portal_frame(h, w, E, A, IZ, h_lat, g_vert);
        linear::solve_2d(&input).unwrap()
    };

    // Check superposition for reactions at both base nodes
    for node_id in [1_usize, 4] {
        let ra = res_a.reactions.iter().find(|r| r.node_id == node_id).unwrap();
        let rb = res_b.reactions.iter().find(|r| r.node_id == node_id).unwrap();
        let rc = res_c.reactions.iter().find(|r| r.node_id == node_id).unwrap();
        assert_close(rc.rx, ra.rx + rb.rx, 0.01,
            &format!("Portal frame: Rx at node {} superposition", node_id));
        assert_close(rc.ry, ra.ry + rb.ry, 0.01,
            &format!("Portal frame: Ry at node {} superposition", node_id));
        assert_close(rc.mz, ra.mz + rb.mz, 0.01,
            &format!("Portal frame: Mz at node {} superposition", node_id));
    }

    // Check superposition for displacement at knee node 2
    let da = res_a.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let db = res_b.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let dc = res_c.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(dc.ux, da.ux + db.ux, 0.01,
        "Portal frame: ux at node 2 superposition");
    assert_close(dc.uy, da.uy + db.uy, 0.01,
        "Portal frame: uy at node 2 superposition");

    // Gravity: symmetric loading → horizontal reactions at base should balance
    let rb1 = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb4 = res_b.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        (rb1.rx + rb4.rx).abs() < 0.5,
        "Portal frame gravity: sum Rx ≈ 0, got {:.4}", rb1.rx + rb4.rx
    );
}

// ================================================================
// 4. Propped Cantilever — Point Load + Moment Superposition
// ================================================================
//
// Propped cantilever: fixed at left (node 1), rollerX at right (node n+1).
// rollerX = uy restrained, ux free → vertical support at the far end.
// Length L = 8 m.
// Case A: Midspan point load P = 24 kN downward.
// Case B: Applied moment M₀ = 16 kN·m at midspan.
// Case C: Both loads simultaneously.
//
// For propped cantilever with midspan point load P:
//   R_roller = 5P/16
//
// Reference: Roark & Young, Table 3-8.

#[test]
fn validation_lce_ext_propped_cantilever_superposition() {
    let l = 8.0;
    let n = 10;
    let p = 24.0;
    let m0 = 16.0;
    let mid = n / 2 + 1;
    let tip = n + 1;

    let build = |apply_p: bool, apply_m: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if apply_p {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            }));
        }
        if apply_m {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: 0.0, mz: m0,
            }));
        }
        let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_a = build(true, false);
    let res_b = build(false, true);
    let res_c = build(true, true);

    // Superposition: reaction at roller (node tip)
    let ry_a = res_a.reactions.iter().find(|r| r.node_id == tip).unwrap().ry;
    let ry_b = res_b.reactions.iter().find(|r| r.node_id == tip).unwrap().ry;
    let ry_c = res_c.reactions.iter().find(|r| r.node_id == tip).unwrap().ry;
    assert_close(ry_c, ry_a + ry_b, 0.01,
        "Propped cantilever: Ry roller superposition");

    // Superposition: fixed-end moment at node 1
    let mz_a = res_a.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    let mz_b = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    let mz_c = res_c.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    assert_close(mz_c, mz_a + mz_b, 0.01,
        "Propped cantilever: Mz fixed end superposition");

    // Superposition: midspan deflection
    let dy_a = res_a.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let dy_b = res_b.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let dy_c = res_c.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    assert_close(dy_c, dy_a + dy_b, 0.01,
        "Propped cantilever: δ_mid superposition");

    // Analytical: propped cantilever with midspan point load
    // Roller reaction = 5P/16
    let r_roller_exact = 5.0 * p / 16.0;
    assert_close(ry_a, r_roller_exact, 0.03,
        "Propped cantilever midspan P: R_roller = 5P/16");
}

// ================================================================
// 5. Fixed-Fixed Beam — Two Symmetric Point Loads vs Equivalent UDL
// ================================================================
//
// Fixed-fixed beam, L = 12 m.
// Case A: Two equal point loads P at L/3 and 2L/3 (third-point loading).
// Case B: Equivalent UDL with same total load: w = 2P/L.
//
// Both produce the same total load and similar (though not identical)
// bending patterns. The fixed-end reactions must match (same total load)
// but the moment distributions differ somewhat.
//
// For fixed-fixed beam with UDL:
//   R = wL/2, M_end = wL²/12
//
// Reference: Ghali & Neville, "Structural Analysis", 7th Ed., §3.7.

#[test]
fn validation_lce_ext_fixed_beam_two_point_loads_vs_udl() {
    let l = 12.0;
    let n = 12;
    let p = 30.0; // kN at each third-point
    let w_eq: f64 = -2.0 * p / l; // equivalent UDL intensity (downward)

    let n_third = n / 3 + 1;       // node at L/3
    let n_two_third = 2 * n / 3 + 1; // node at 2L/3

    // Case A: Two point loads at third-points
    let loads_a = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_third, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_two_third, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];
    let input_a = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Case B: Equivalent UDL
    let loads_b: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: w_eq, q_j: w_eq, a: None, b: None,
        }))
        .collect();
    let input_b = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Both cases: same total load = 2P = w*L → same total vertical reaction
    let ry_a_left = res_a.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_a_right = res_a.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    assert_close(ry_a_left + ry_a_right, 2.0 * p, 0.01,
        "Two-point loads: total reaction = 2P");

    let ry_b_left = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_b_right = res_b.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    assert_close(ry_b_left + ry_b_right, 2.0 * p, 0.01,
        "Equivalent UDL: total reaction = wL = 2P");

    // By symmetry in both cases, left and right reactions should be equal
    assert_close(ry_a_left, ry_a_right, 0.01,
        "Two-point loads symmetric: R_left = R_right");

    // Analytical: fixed-fixed UDL → M_end = wL²/12
    let m_end_udl_exact = w_eq.abs() * l.powi(2) / 12.0;
    let mz_b_left = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    assert_close(mz_b_left.abs(), m_end_udl_exact, 0.02,
        "Fixed-fixed UDL: M_end = wL²/12");

    // Fixed-fixed with two symmetric third-point loads:
    // M_end = P*a*(L-a)²/L² + P*(L-a)*a²/L² where a = L/3
    // = P*L/3*(2L/3)²/L² + P*2L/3*(L/3)²/L²
    // = P*(2L/9 + 2L/9) = 4PL/9 ... but for fixed-fixed with symmetric loads:
    // Actually for fixed-fixed beam with two third-point loads, use
    // M_end = Pa(3L-4a)/(3L) with a=L/3 gives 2P*L/3*(3L-4L/3)/(3L)
    // Let's just check that both end reactions are P each (by symmetry, total 2P, each P)
    assert_close(ry_a_left, p, 0.01,
        "Two-point loads on fixed-fixed: R_each = P");
}

// ================================================================
// 6. Cantilever — Tip Moment + Tip Point Load Independence
// ================================================================
//
// Cantilever beam, length L = 5 m, fixed at left.
// Case A: Tip point load P = 15 kN downward.
// Case B: Tip moment M = 20 kN·m.
// Case C: Both simultaneously.
//
// Analytical:
//   Tip deflection from P: δ_P = PL³/(3EI)
//   Tip rotation from P: θ_P = PL²/(2EI)
//   Tip deflection from M: δ_M = ML²/(2EI)
//   Tip rotation from M: θ_M = ML/(EI)
//
// Reference: Timoshenko, "Strength of Materials", Vol. I, §4.

#[test]
fn validation_lce_ext_cantilever_tip_moment_and_load() {
    let l = 5.0;
    let n = 8;
    let p = 15.0;  // kN downward
    let m0 = 20.0; // kN·m (CCW)
    let e_eff: f64 = E * 1000.0;
    let tip = n + 1;

    let build = |apply_p: bool, apply_m: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if apply_p {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip, fx: 0.0, fy: -p, mz: 0.0,
            }));
        }
        if apply_m {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip, fx: 0.0, fy: 0.0, mz: m0,
            }));
        }
        let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_a = build(true, false);
    let res_b = build(false, true);
    let res_c = build(true, true);

    let tip_a = res_a.displacements.iter().find(|d| d.node_id == tip).unwrap();
    let tip_b = res_b.displacements.iter().find(|d| d.node_id == tip).unwrap();
    let tip_c = res_c.displacements.iter().find(|d| d.node_id == tip).unwrap();

    // Superposition: deflection
    assert_close(tip_c.uy, tip_a.uy + tip_b.uy, 0.01,
        "Cantilever tip: δ_C = δ_P + δ_M (superposition)");

    // Superposition: rotation
    assert_close(tip_c.rz, tip_a.rz + tip_b.rz, 0.01,
        "Cantilever tip: θ_C = θ_P + θ_M (superposition)");

    // Analytical: tip deflection from point load = PL³/(3EI)
    let delta_p_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip_a.uy.abs(), delta_p_exact, 0.02,
        "Cantilever: δ_P = PL³/(3EI)");

    // Analytical: tip rotation from point load = PL²/(2EI)
    let theta_p_exact = p * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip_a.rz.abs(), theta_p_exact, 0.02,
        "Cantilever: θ_P = PL²/(2EI)");

    // Analytical: tip deflection from moment = ML²/(2EI)
    // Note: moment M0 (CCW) causes upward deflection at tip
    let delta_m_exact = m0 * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip_b.uy.abs(), delta_m_exact, 0.02,
        "Cantilever: δ_M = ML²/(2EI)");

    // Analytical: tip rotation from moment = ML/(EI)
    let theta_m_exact = m0 * l / (e_eff * IZ);
    assert_close(tip_b.rz.abs(), theta_m_exact, 0.02,
        "Cantilever: θ_M = ML/(EI)");
}

// ================================================================
// 7. Continuous Beam — Pattern Loading vs Full Loading
// ================================================================
//
// Three-span continuous beam, each span L = 5 m.
// Full loading: UDL w on all three spans.
// Pattern loading: UDL w on spans 1 and 3 only (checkerboard).
//
// For the full-loading case, by symmetry: center spans have identical behavior.
// For the pattern loading: the unloaded middle span deflects upward.
// The difference between them exercises superposition (pattern = full - span2_only).
//
// Reference: Ghali & Neville, "Structural Analysis", 7th Ed., §4.5.

#[test]
fn validation_lce_ext_pattern_loading_vs_full() {
    let l = 5.0;
    let n_per = 6;
    let w: f64 = -8.0; // kN/m downward

    let build = |span1: bool, span2: bool, span3: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        let spans = [span1, span2, span3];
        for (s_idx, &active) in spans.iter().enumerate() {
            if active {
                for j in 1..=n_per {
                    let elem_id = s_idx * n_per + j;
                    loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: elem_id, q_i: w, q_j: w, a: None, b: None,
                    }));
                }
            }
        }
        let input = make_continuous_beam(&[l, l, l], n_per, E, A, IZ, loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_full = build(true, true, true);
    let res_pattern = build(true, false, true); // checkerboard
    let res_span2 = build(false, true, false);  // span 2 only

    // Superposition: full = pattern + span2_only
    // Check midspan deflection of span 2 (middle of second span)
    let mid_span2_node = n_per + n_per / 2 + 1;
    let d_full = res_full.displacements.iter().find(|d| d.node_id == mid_span2_node).unwrap().uy;
    let d_pattern = res_pattern.displacements.iter().find(|d| d.node_id == mid_span2_node).unwrap().uy;
    let d_span2 = res_span2.displacements.iter().find(|d| d.node_id == mid_span2_node).unwrap().uy;
    assert_close(d_full, d_pattern + d_span2, 0.01,
        "Pattern loading: full = pattern + span2_only (midspan2 δ)");

    // In the pattern case (spans 1 and 3 loaded, span 2 unloaded),
    // the unloaded middle span should deflect upward (hogging from continuity).
    assert!(d_pattern > 0.0,
        "Pattern loading: unloaded middle span deflects upward, got {:.6}", d_pattern);

    // Full loading on symmetric 3-span beam: center reaction at support 2
    // should equal center reaction at support 3 (by symmetry).
    let sup2_node = n_per + 1;
    let sup3_node = 2 * n_per + 1;
    let r_sup2_full = res_full.reactions.iter().find(|r| r.node_id == sup2_node).unwrap().ry;
    let r_sup3_full = res_full.reactions.iter().find(|r| r.node_id == sup3_node).unwrap().ry;
    assert_close(r_sup2_full, r_sup3_full, 0.01,
        "Full loading 3-span: R_sup2 = R_sup3 (symmetry)");

    // Also check superposition at support reactions
    let r_sup2_pattern = res_pattern.reactions.iter().find(|r| r.node_id == sup2_node).unwrap().ry;
    let r_sup2_span2 = res_span2.reactions.iter().find(|r| r.node_id == sup2_node).unwrap().ry;
    assert_close(r_sup2_full, r_sup2_pattern + r_sup2_span2, 0.01,
        "Pattern loading: support 2 reaction superposition");
}

// ================================================================
// 8. Scaling Linearity — Doubling All Loads Doubles All Responses
// ================================================================
//
// Simply-supported beam, L = 10 m, with a complex load pattern:
//   UDL + midspan point load + applied moment at quarter-span.
// Scale factor α = 2: multiplying all loads by α must multiply
// all displacements, reactions, and internal forces by α.
//
// This is a fundamental property of linear analysis.
//
// Reference: Ghali & Neville, "Structural Analysis", 7th Ed., §1.4.

#[test]
fn validation_lce_ext_scaling_linearity() {
    let l = 10.0;
    let n = 10;
    let p = 12.0;
    let w: f64 = -3.0;
    let m0 = 8.0;
    let alpha: f64 = 2.0;
    let mid = n / 2 + 1;
    let quarter = n / 4 + 1;

    let build = |scale: f64| -> AnalysisResults {
        let mut loads = Vec::new();
        // Point load at midspan
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: scale * (-p), mz: 0.0,
        }));
        // Moment at quarter-span
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: quarter, fx: 0.0, fy: 0.0, mz: scale * m0,
        }));
        // UDL on all elements
        for i in 1..=n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: scale * w, q_j: scale * w, a: None, b: None,
            }));
        }
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_1 = build(1.0);
    let res_2 = build(alpha);

    // Reactions scale by α
    for r1 in &res_1.reactions {
        let r2 = res_2.reactions.iter().find(|r| r.node_id == r1.node_id).unwrap();
        assert_close(r2.ry, alpha * r1.ry, 0.01,
            &format!("Scaling: Ry at node {} scales by α", r1.node_id));
        assert_close(r2.mz, alpha * r1.mz, 0.01,
            &format!("Scaling: Mz at node {} scales by α", r1.node_id));
    }

    // Displacements scale by α
    for d1 in &res_1.displacements {
        let d2 = res_2.displacements.iter().find(|d| d.node_id == d1.node_id).unwrap();
        assert_close(d2.uy, alpha * d1.uy, 0.01,
            &format!("Scaling: uy at node {} scales by α", d1.node_id));
        assert_close(d2.rz, alpha * d1.rz, 0.01,
            &format!("Scaling: rz at node {} scales by α", d1.node_id));
    }

    // Element forces scale by α
    for ef1 in &res_1.element_forces {
        let ef2 = res_2.element_forces.iter().find(|e| e.element_id == ef1.element_id).unwrap();
        assert_close(ef2.v_start, alpha * ef1.v_start, 0.01,
            &format!("Scaling: V_start elem {} scales by α", ef1.element_id));
        assert_close(ef2.m_start, alpha * ef1.m_start, 0.01,
            &format!("Scaling: M_start elem {} scales by α", ef1.element_id));
        assert_close(ef2.v_end, alpha * ef1.v_end, 0.01,
            &format!("Scaling: V_end elem {} scales by α", ef1.element_id));
        assert_close(ef2.m_end, alpha * ef1.m_end, 0.01,
            &format!("Scaling: M_end elem {} scales by α", ef1.element_id));
    }
}
