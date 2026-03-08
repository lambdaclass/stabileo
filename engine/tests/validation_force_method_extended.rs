/// Validation: Force Method (Compatibility Method) — Extended Tests
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 10-11
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 10-13
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 4-5
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed.
///
/// These tests extend the force method suite with additional
/// indeterminate structures and analytical formulas.
///
/// Tests verify:
///   1. Fixed-fixed beam with asymmetric point load: M_A, M_B, reactions
///   2. Three-span continuous beam with UDL: interior reactions
///   3. Propped cantilever with triangular (linearly varying) load
///   4. Fixed-fixed beam midspan deflection under UDL
///   5. Portal frame with lateral load: column base moments
///   6. Two-span continuous beam with point load on one span
///   7. Fixed-fixed beam with two symmetric point loads (third-point loading)
///   8. Propped cantilever: point of zero shear & max positive moment under UDL
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam: Asymmetric Point Load
// ================================================================
//
// Both ends fixed. Point load P at distance a from left end.
// (Timoshenko & Young; Hibbeler Table inside back cover)
//
// M_A = P a b² / L²    (hogging at left)
// M_B = P a² b / L²    (hogging at right)
// R_A = P b² (3a + b) / L³
// R_B = P a² (a + 3b) / L³
//
// where b = L - a.

#[test]
fn validation_force_method_ext_fixed_asym_point() {
    let l = 10.0;
    let n: usize = 20;
    let p = 30.0;
    let a_dist = 3.0; // load at 3 m from left
    let b_dist = l - a_dist;
    let load_node = (a_dist / l * n as f64).round() as usize + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Reactions
    let ra_exact = p * b_dist * b_dist * (3.0 * a_dist + b_dist) / (l * l * l);
    let rb_exact = p * a_dist * a_dist * (a_dist + 3.0 * b_dist) / (l * l * l);
    assert_close(r1.ry, ra_exact, 0.02, "Fixed asym: R_A = Pb²(3a+b)/L³");
    assert_close(r2.ry, rb_exact, 0.02, "Fixed asym: R_B = Pa²(a+3b)/L³");

    // Equilibrium check
    assert_close(r1.ry + r2.ry, p, 0.01, "Fixed asym: R_A + R_B = P");

    // End moments (absolute values)
    let ma_exact = p * a_dist * b_dist * b_dist / (l * l);
    let mb_exact = p * a_dist * a_dist * b_dist / (l * l);
    assert_close(r1.mz.abs(), ma_exact, 0.03, "Fixed asym: |M_A| = Pab²/L²");
    assert_close(r2.mz.abs(), mb_exact, 0.03, "Fixed asym: |M_B| = Pa²b/L²");
}

// ================================================================
// 2. Three-Span Continuous Beam: UDL
// ================================================================
//
// Three equal spans with UDL. Supports: pinned, roller, roller, roller.
// (Kassimali, Ch. 13, Table of Three-Moment Equation results)
//
// By the three-moment equation for three equal spans with UDL:
//   M_B = M_C = -q L² / 10  (hogging moments at interior supports)
//   R_A = R_D = 0.4 q L      (end reactions)
//   R_B = R_C = 1.1 q L      (interior reactions)

#[test]
fn validation_force_method_ext_three_span_udl() {
    let span = 6.0;
    let n_per_span = 12;
    let q: f64 = -10.0; // downward
    let total_elems = 3 * n_per_span;

    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q.abs();

    // End reactions: R_A = R_D = 0.4 q L
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_d_node = 3 * n_per_span + 1;
    let r_d = results.reactions.iter().find(|r| r.node_id == r_d_node).unwrap().ry;
    assert_close(r_a, 0.4 * q_abs * span, 0.02, "3-span: R_A = 0.4qL");
    assert_close(r_d, 0.4 * q_abs * span, 0.02, "3-span: R_D = 0.4qL");

    // Interior reactions: R_B = R_C = 1.1 q L
    let r_b_node = n_per_span + 1;
    let r_c_node = 2 * n_per_span + 1;
    let r_b = results.reactions.iter().find(|r| r.node_id == r_b_node).unwrap().ry;
    let r_c = results.reactions.iter().find(|r| r.node_id == r_c_node).unwrap().ry;
    assert_close(r_b, 1.1 * q_abs * span, 0.02, "3-span: R_B = 1.1qL");
    assert_close(r_c, 1.1 * q_abs * span, 0.02, "3-span: R_C = 1.1qL");

    // Total reaction = total load = 3 q L
    let total_r: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_r, 3.0 * q_abs * span, 0.01, "3-span: sum R = 3qL");
}

// ================================================================
// 3. Propped Cantilever: Triangular Load (Linearly Varying)
// ================================================================
//
// Fixed at left, roller at right. Linearly varying load from q at left to 0 at right.
// (Ghali & Neville, Table A-3; Timoshenko & Young)
//
// Total load = qL/2
// R_roller (at right) = qL/10  (exact by force method)
// R_fix (at left) = qL/2 - qL/10 = 2qL/5
// M_fix = qL²/15

#[test]
fn validation_force_method_ext_propped_triangular() {
    let l = 10.0;
    let n: usize = 40; // fine mesh for linearly varying load
    let q: f64 = -12.0; // max intensity at left (downward)

    // Apply linearly varying load: q_i varies linearly from q to 0
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let x_i = i as f64 * l / n as f64;
            let x_j = (i + 1) as f64 * l / n as f64;
            let qi = q * (1.0 - x_i / l);
            let qj = q * (1.0 - x_j / l);
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q.abs();

    // Roller reaction = qL/10
    let r_roller = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;
    assert_close(r_roller, q_abs * l / 10.0, 0.03,
        "Propped triangular: R_roller = qL/10");

    // Fixed reaction = 2qL/5
    let r_fix = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    assert_close(r_fix, 2.0 * q_abs * l / 5.0, 0.03,
        "Propped triangular: R_fix = 2qL/5");

    // Total reaction = qL/2
    assert_close(r_roller + r_fix, q_abs * l / 2.0, 0.02,
        "Propped triangular: sum R = qL/2");

    // Fixed end moment = qL²/15
    let m_fix = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    assert_close(m_fix, q_abs * l * l / 15.0, 0.03,
        "Propped triangular: |M_fix| = qL²/15");
}

// ================================================================
// 4. Fixed-Fixed Beam: Midspan Deflection Under UDL
// ================================================================
//
// Both ends fixed, UDL q. Midspan deflection:
//   delta_mid = q L⁴ / (384 EI)
// (Hibbeler, Appendix C; Timoshenko)
//
// E_eff = E * 1000.0 (solver internally multiplies E by 1000).

#[test]
fn validation_force_method_ext_fixed_udl_deflection() {
    let l = 8.0;
    let n: usize = 20;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0; // kN/m²

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan node
    let mid_node = n / 2 + 1;
    let uy_mid = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Analytical midspan deflection (downward → negative)
    let delta_exact = q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    // uy_mid is negative (downward), delta_exact is positive
    assert_close(uy_mid.abs(), delta_exact, 0.03,
        "Fixed UDL: delta_mid = qL⁴/(384EI)");

    // Also verify deflection is downward
    assert!(uy_mid < 0.0, "Fixed UDL: midspan deflects downward");
}

// ================================================================
// 5. Portal Frame: Lateral Load — Base Moments
// ================================================================
//
// Fixed-base portal frame with lateral load H at top left.
// By stiffness method / force method for equal column & beam stiffness:
//
// For a portal with fixed bases (height h, width w, same EI everywhere),
// lateral load H at node 2:
//   Horizontal base reactions are equal: Rx1 = Rx2 = H/2
//     (by anti-symmetric about portal centerline, no — actually
//      for unequal stiffness the split depends on I/L ratios.
//      For equal I/L of columns: each carries H/2)
//   Total vertical reaction: sum(Ry) = 0 (no net vertical load)
//   Base moments: M1 + M4 + H*h = 0 (column moments must resist overturning)

#[test]
fn validation_force_method_ext_portal_lateral() {
    let h = 5.0;
    let w = 8.0;
    let h_load = 40.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    eprintln!("R1: rx={:.6} ry={:.6} mz={:.6}", r1.rx, r1.ry, r1.mz);
    eprintln!("R4: rx={:.6} ry={:.6} mz={:.6}", r4.rx, r4.ry, r4.mz);

    // Horizontal equilibrium: Rx1 + Rx4 + H = 0
    assert_close(r1.rx + r4.rx, -h_load, 0.01,
        "Portal lateral: Rx1 + Rx4 = -H");

    // For equal columns with fixed base: Rx1 ≈ Rx4 ≈ -H/2
    assert_close(r1.rx, -h_load / 2.0, 0.05,
        "Portal lateral: Rx1 ≈ -H/2");
    assert_close(r4.rx, -h_load / 2.0, 0.05,
        "Portal lateral: Rx4 ≈ -H/2");

    // Vertical equilibrium: sum Ry = 0 (no vertical applied load)
    assert_close(r1.ry + r4.ry, 0.0, 0.01,
        "Portal lateral: sum Ry = 0");

    // Moment equilibrium about base 4:
    //   M1 + M4 + R1y * w + H * h = 0
    // → |R1y * w| = H*h - (M1 + M4)
    // Or equivalently, the full overturning balance:
    //   |R1y * w| + M1 + M4 = H * h
    let overturning: f64 = h_load * h;
    let couple = (r1.ry * w).abs();
    let base_moments = r1.mz + r4.mz;
    assert_close(couple + base_moments, overturning, 0.05,
        "Portal lateral: R1y*w + M1 + M4 = H*h");
}

// ================================================================
// 6. Two-Span Continuous: Point Load on One Span
// ================================================================
//
// Two equal spans, point load P at midpoint of span 1.
// Supports: pinned - roller - roller
// (Three-moment equation / force method)
//
// For a two-span beam (spans L each), point load P at mid-span 1:
//   M_B (moment at interior support) = -5PL/32
//   R_A = P/2 + 5P/32 * (1/L) * L = P/2 + 5P/32 ...
// Actually use the standard result:
//   R_A = 11P/16 - 5P/(32) ... let's use the exact formula:
//
// Using the three-moment equation for load P at mid-span 1 (c = L/2):
//   M_A = M_C = 0 (pinned/roller ends)
//   4 M_B L = -(P*c)/(6L) * (2L*c - c^2 - L^2) ... simplifies to:
//   M_B = -3PL/32 (hogging at interior support)
//
// Reactions (from statics + M_B):
//   Span 1: ΣM_A=0: R_B1*L + M_B = P*(L/2)  →  R_B1 = P/2 - M_B/L = P/2 + 3P/32 = 19P/32
//           R_A = P - R_B1 = 13P/32
//   Span 2: ΣM_C=0: R_B2*L + M_B = 0  →  R_B2 = -M_B/L = 3P/32
//           R_C = -R_B2 = -3P/32 (uplift!)
//   R_B = R_B1 + R_B2 = 19P/32 + 3P/32 = 22P/32 = 11P/16
//
// Check: R_A + R_B + R_C = 13/32 + 22/32 - 3/32 = 32/32 = P  ✓

#[test]
fn validation_force_method_ext_two_span_point_load() {
    let span = 8.0;
    let n_per_span: usize = 16;
    let p = 24.0;

    // Point load at midpoint of span 1 = node (n_per_span/2 + 1)
    let load_node = n_per_span / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical equilibrium
    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry, p, 0.01,
        "2-span point: sum Ry = P");

    // DEBUG: print all reactions
    for r in &results.reactions {
        eprintln!("Reaction node {}: ry={:.6}", r.node_id, r.ry);
    }
    // DEBUG: print element forces near interior support
    for ef in &results.element_forces {
        if ef.element_id >= n_per_span - 1 && ef.element_id <= n_per_span + 2 {
            eprintln!("EF {}: m_start={:.6} m_end={:.6} v_start={:.6} v_end={:.6}",
                ef.element_id, ef.m_start, ef.m_end, ef.v_start, ef.v_end);
        }
    }

    // Interior support moment (hogging): |M_B| = 3PL/32
    let m_b_elem = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    let m_b = m_b_elem.m_end;
    let m_b_exact = 3.0 * p * span / 32.0;
    assert_close(m_b.abs(), m_b_exact, 0.03,
        "2-span point: |M_B| = 3PL/32");

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_a_exact = 13.0 * p / 32.0;
    assert_close(r_a, r_a_exact, 0.03,
        "2-span point: R_A = 13P/32");
}

// ================================================================
// 7. Fixed-Fixed Beam: Two Symmetric Point Loads (Third Points)
// ================================================================
//
// Fixed-fixed beam with two equal loads P at L/3 and 2L/3.
// By symmetry, R_A = R_B = P (each support carries one load).
// End moments: using superposition of Pab²/L² + Pa²b/L² for both loads.
//
// Load 1 at a = L/3: M_A1 = P(L/3)(2L/3)²/L² = 4PL/27
//                     M_B1 = P(L/3)²(2L/3)/L² = 2PL/27
// Load 2 at a = 2L/3: M_A2 = P(2L/3)(L/3)²/L² = 2PL/27
//                      M_B2 = P(2L/3)²(L/3)/L² = 4PL/27
// By symmetry: M_A = M_A1 + M_A2 = 4PL/27 + 2PL/27 = 6PL/27 = 2PL/9
//              M_B = M_B1 + M_B2 = 2PL/27 + 4PL/27 = 6PL/27 = 2PL/9
//
// Equal end moments by symmetry: |M_A| = |M_B| = 2PL/9

#[test]
fn validation_force_method_ext_fixed_third_point() {
    let l = 9.0;
    let n: usize = 18;
    let p = 18.0;

    // Loads at L/3 and 2L/3
    let node1 = n / 3 + 1;
    let node2 = 2 * n / 3 + 1;
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node1, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node2, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Symmetric reactions: R_A = R_B = P (total load = 2P)
    assert_close(r1.ry, p, 0.02, "Fixed third-point: R_A = P");
    assert_close(r2.ry, p, 0.02, "Fixed third-point: R_B = P");

    // Equal end moments: |M_A| = |M_B| = 2PL/9
    let m_exact = 2.0 * p * l / 9.0;
    assert_close(r1.mz.abs(), m_exact, 0.02,
        "Fixed third-point: |M_A| = 2PL/9");
    assert_close(r2.mz.abs(), m_exact, 0.02,
        "Fixed third-point: |M_B| = 2PL/9");

    // Symmetry: |M_A| = |M_B|
    assert_close(r1.mz.abs(), r2.mz.abs(), 0.01,
        "Fixed third-point: |M_A| = |M_B| (symmetry)");
}

// ================================================================
// 8. Propped Cantilever: Zero Shear & Max Moment Under UDL
// ================================================================
//
// Fixed at left, roller at right, UDL q.
// (Hibbeler Ch. 12; Kassimali Ch. 10)
//
// R_A = 5qL/8,  R_B = 3qL/8,  M_A = qL²/8 (hogging)
//
// Shear: V(x) = R_A - qx = 5qL/8 - qx
// Zero shear at x₀ = 5L/8
// Max positive moment at x₀:
//   M_max = R_A * x₀ - q * x₀² / 2 - M_A
//         = (5qL/8)(5L/8) - q(5L/8)²/2 - qL²/8
//         = 25qL²/64 - 25qL²/128 - qL²/8
//         = (50 - 25 - 16)qL²/128
//         = 9qL²/128

#[test]
fn validation_force_method_ext_propped_max_moment() {
    let l = 8.0;
    let n: usize = 32; // fine mesh to capture max moment location
    let q: f64 = -10.0;
    let q_abs = q.abs();

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify known reactions first
    let r_fix = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_roller = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_fix.ry, 5.0 * q_abs * l / 8.0, 0.02,
        "Propped UDL: R_fix = 5qL/8");
    assert_close(r_roller.ry, 3.0 * q_abs * l / 8.0, 0.02,
        "Propped UDL: R_roller = 3qL/8");

    // Find element containing x₀ = 5L/8
    // Element at 5L/8: node index = 5*n/8 → element_id ≈ 5*n/8
    let x0_elem = 5 * n / 8; // element id near x₀ = 5L/8

    // The max positive moment (sagging) should be approximately 9qL²/128
    let m_max_exact = 9.0 * q_abs * l * l / 128.0;

    // DEBUG: print element forces around x0 = 5L/8
    for ef in &results.element_forces {
        if ef.element_id >= 5*n/8 - 2 && ef.element_id <= 5*n/8 + 2 {
            eprintln!("EF {}: m_start={:.6} m_end={:.6} v_start={:.6} v_end={:.6}",
                ef.element_id, ef.m_start, ef.m_end, ef.v_start, ef.v_end);
        }
    }
    // Also print first and last few
    for ef in &results.element_forces {
        if ef.element_id <= 3 || ef.element_id >= n - 1 {
            eprintln!("EF {}: m_start={:.6} m_end={:.6}", ef.element_id, ef.m_start, ef.m_end);
        }
    }

    // Find the maximum sagging bending moment across all elements.
    // In the element force convention, hogging is positive and sagging is negative.
    // The max sagging moment is the most negative m value (largest magnitude negative).
    let mut max_sag_moment: f64 = 0.0;
    for ef in &results.element_forces {
        if ef.m_start < max_sag_moment {
            max_sag_moment = ef.m_start;
        }
        if ef.m_end < max_sag_moment {
            max_sag_moment = ef.m_end;
        }
    }
    eprintln!("max_sag_moment = {:.6}", max_sag_moment);

    // With fine mesh, we should capture the maximum moment closely
    assert_close(max_sag_moment.abs(), m_max_exact, 0.05,
        "Propped UDL: M_max = 9qL²/128");

    // Verify the element near x₀ = 5L/8 has near-zero shear
    let ef_at_x0 = results.element_forces.iter()
        .find(|ef| ef.element_id == x0_elem).unwrap();
    // Shear at this element should be small (near zero crossing)
    let shear_near_x0 = (ef_at_x0.v_start.abs()).min(ef_at_x0.v_end.abs());
    assert!(shear_near_x0 < q_abs * l * 0.05,
        "Propped UDL: shear near zero at x=5L/8, got {:.4}", shear_near_x0);
}
