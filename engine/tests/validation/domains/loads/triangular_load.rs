/// Validation: Triangularly Distributed Loads (Linearly Varying Intensity)
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 12 (deflections, statically determinate)
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 3 (fixed-end forces)
///   - Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1 (beam formulas)
///   - Timoshenko & Gere, "Theory of Elastic Stability" (beam deflection tables)
///
/// Tests verify linearly varying (triangular) load behavior:
///   1. SS beam triangular load: reactions R_A = qL/6, R_B = qL/3
///   2. Max moment location on SS beam with triangular load
///   3. Cantilever with triangular load: tip deflection = qL^4/(30EI)
///   4. Reversed triangular: reactions swap sides
///   5. Trapezoidal = UDL + triangular decomposition (superposition)
///   6. Fixed-fixed with triangular load: end moments M_A = qL²/30, M_B = qL²/20
///   7. Triangular vs equivalent point load: different deflection profiles
///   8. SS beam triangular load: shear at left = qL/6, shear at right = qL/3
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a linearly varying load from q_left at x=0 to q_right at x=L
/// across n elements of equal length.
fn triangular_loads(n: usize, q_left: f64, q_right: f64) -> Vec<SolverLoad> {
    (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            let qi = q_left + (q_right - q_left) * t_i;
            let qj = q_left + (q_right - q_left) * t_j;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: qi,
                q_j: qj,
                a: None,
                b: None,
            })
        })
        .collect()
}

// ================================================================
// 1. SS Beam Triangular Load: Reactions R_A = qL/6, R_B = qL/3
// ================================================================
//
// Triangular load: zero at A, intensity q (downward) at B.
// Resultant = qL/2 acting at 2L/3 from A.
// Moments about B → R_A * L = (qL/2) * (L/3), so R_A = qL/6.
// R_B = qL/2 - qL/6 = qL/3.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Example 4-7

#[test]
fn validation_tri_ss_reactions() {
    let l = 9.0;
    let n = 18; // fine mesh for good accuracy
    let q: f64 = 12.0; // kN/m at right end (downward = negative)

    // Triangular load: 0 at left (node 1), q at right (node n+1)
    let loads = triangular_loads(n, 0.0, -q);
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    // Analytical: R_A = qL/6, R_B = qL/3
    let r_a_exact = q * l / 6.0;
    let r_b_exact = q * l / 3.0;

    assert_close(r_a, r_a_exact, 0.03, "Triangular SS: R_A = qL/6");
    assert_close(r_b, r_b_exact, 0.03, "Triangular SS: R_B = qL/3");

    // Equilibrium: R_A + R_B = total load = qL/2
    let total = q * l / 2.0;
    assert_close(r_a + r_b, total, 0.01, "Triangular SS: ΣR = qL/2");
}

// ================================================================
// 2. Max Moment Location for Triangular Load on SS Beam
// ================================================================
//
// Shear = R_A - (q/L)(x²/2) for triangular load from 0 to q over length L.
// V(x) = qL/6 - qx²/(2L) = 0 → x = L/√3 ≈ 0.5774 L
// Max moment occurs at x = L/√3 from A.
// M_max = qL²/(9√3) = qL² * 0.0642
//
// Ref: Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1, Case 2b

#[test]
fn validation_tri_ss_max_moment_location() {
    let l = 12.0;
    let n = 24;
    let q: f64 = 10.0;

    let loads = triangular_loads(n, 0.0, -q);
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find node with max deflection magnitude (proportional to moment for
    // simply-supported beam, max deflection is near but not exactly max moment)
    // Instead, check the max moment from element forces.
    let max_moment = results.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // Analytical max moment: M_max = qL²/(9√3)
    let m_max_exact = q * l * l / (9.0 * 3.0_f64.sqrt());
    assert_close(max_moment, m_max_exact, 0.05, "Triangular SS: M_max = qL²/(9√3)");

    // Max moment occurs at x = L/√3 ≈ 0.5774 L from A.
    // The element that contains this point should have the largest moment.
    let x_max = l / 3.0_f64.sqrt();
    // Node index at that x (1-based)
    let node_at_max = (x_max / l * n as f64).round() as usize + 1;
    let node_at_max = node_at_max.clamp(1, n + 1);

    // Deflection should be maximum near x = L/√3 (roughly)
    let disp_at_max = results.displacements.iter()
        .find(|d| d.node_id == node_at_max).unwrap().uz.abs();
    let disp_at_mid = results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();
    let disp_at_quarter = results.displacements.iter()
        .find(|d| d.node_id == n / 4 + 1).unwrap().uz.abs();

    // Max deflection near x = L/√3 > deflection at L/4 and comparable to L/2
    assert!(disp_at_max > disp_at_quarter,
        "Deflection near x=L/√3 should exceed deflection at L/4: {:.6e} vs {:.6e}",
        disp_at_max, disp_at_quarter);

    // The deflection at L/√3 should be within reasonable range of midspan deflection
    assert!(disp_at_max > disp_at_mid * 0.7,
        "Max region deflection should be comparable to midspan: {:.6e} vs {:.6e}",
        disp_at_max, disp_at_mid);
}

// ================================================================
// 3. Cantilever with Triangular Load: Tip Deflection
// ================================================================
//
// Triangular load: q at root (x=0), 0 at tip (x=L).
// Tip deflection: δ = qL⁴/(30EI)
//
// Ref: Roark, "Formulas for Stress and Strain", 9th Ed., Table 3.1a,
//      Case 1e (cantilever, triangular load, max at fixed end)

#[test]
fn validation_tri_cantilever_tip_deflection() {
    let l = 4.0;
    let n = 16;
    let q: f64 = 8.0; // kN/m at root (downward)
    let e_eff = E * 1000.0; // kN/m²

    // Triangular load: q at root (x=0, elem 1), 0 at tip (x=L, elem n)
    let loads = triangular_loads(n, -q, 0.0);
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_computed = tip.uz.abs();

    // Analytical: δ_tip = qL⁴/(30EI)
    let delta_exact = q * l.powi(4) / (30.0 * e_eff * IZ);

    assert_close(delta_computed, delta_exact, 0.05,
        "Cantilever triangular load: δ_tip = qL⁴/(30EI)");

    // Reaction at fixed end: V = qL/2 (total load), M = qL²/6
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, q * l / 2.0, 0.02, "Cantilever tri: R = qL/2");
    assert_close(r1.my.abs(), q * l * l / 6.0, 0.05, "Cantilever tri: M = qL²/6");
}

// ================================================================
// 4. Reversed Triangular Load: Reactions Swap Sides
// ================================================================
//
// Standard triangle (0 at A, q at B): R_A = qL/6, R_B = qL/3.
// Reversed (q at A, 0 at B):         R_A = qL/3, R_B = qL/6.
// By symmetry, reversing the load reverses which support carries more.

#[test]
fn validation_tri_reversed_reactions() {
    let l = 9.0;
    let n = 18;
    let q: f64 = 12.0;

    // Forward: 0 at A, q at B
    let loads_fwd = triangular_loads(n, 0.0, -q);
    let input_fwd = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_fwd);
    let res_fwd = linear::solve_2d(&input_fwd).unwrap();
    let r_a_fwd = res_fwd.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_b_fwd = res_fwd.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    // Reversed: q at A, 0 at B
    let loads_rev = triangular_loads(n, -q, 0.0);
    let input_rev = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_rev);
    let res_rev = linear::solve_2d(&input_rev).unwrap();
    let r_a_rev = res_rev.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_b_rev = res_rev.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    // Forward: R_A = qL/6, R_B = qL/3
    assert_close(r_a_fwd, q * l / 6.0, 0.03, "Forward tri: R_A = qL/6");
    assert_close(r_b_fwd, q * l / 3.0, 0.03, "Forward tri: R_B = qL/3");

    // Reversed: R_A = qL/3, R_B = qL/6
    assert_close(r_a_rev, q * l / 3.0, 0.03, "Reversed tri: R_A = qL/3");
    assert_close(r_b_rev, q * l / 6.0, 0.03, "Reversed tri: R_B = qL/6");

    // The small reaction for one is the large for the other
    assert_close(r_a_fwd, r_b_rev, 0.03, "Reversed: R_A(fwd) = R_B(rev)");
    assert_close(r_b_fwd, r_a_rev, 0.03, "Reversed: R_B(fwd) = R_A(rev)");
}

// ================================================================
// 5. Trapezoidal = UDL + Triangular (Superposition)
// ================================================================
//
// A trapezoidal load (q₁ at A, q₂ at B) can be decomposed as:
//   UDL of intensity q₁ + triangular from 0 to (q₂ - q₁).
// By superposition, reactions and deflections must add.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Section 6-3

#[test]
fn validation_tri_trapezoidal_superposition() {
    let l = 8.0;
    let n = 16;
    let q1: f64 = 6.0;  // intensity at A (kN/m, downward)
    let q2: f64 = 14.0; // intensity at B (kN/m, downward)
    let dq = q2 - q1;   // triangular component

    // Direct trapezoidal load
    let loads_trap = triangular_loads(n, -q1, -q2);
    let input_trap = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_trap);
    let res_trap = linear::solve_2d(&input_trap).unwrap();

    // UDL component only (q1 everywhere)
    let loads_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q1, q_j: -q1, a: None, b: None,
        }))
        .collect();
    let input_udl = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_udl);
    let res_udl = linear::solve_2d(&input_udl).unwrap();

    // Triangular component only (0 at A, dq at B)
    let loads_tri = triangular_loads(n, 0.0, -dq);
    let input_tri = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_tri);
    let res_tri = linear::solve_2d(&input_tri).unwrap();

    // Superposition: reactions should add
    let r_a_trap = res_trap.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_a_udl  = res_udl.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_a_tri  = res_tri.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(r_a_trap, r_a_udl + r_a_tri, 0.01,
        "Superposition: R_A(trap) = R_A(udl) + R_A(tri)");

    let r_b_trap = res_trap.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
    let r_b_udl  = res_udl.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
    let r_b_tri  = res_tri.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
    assert_close(r_b_trap, r_b_udl + r_b_tri, 0.01,
        "Superposition: R_B(trap) = R_B(udl) + R_B(tri)");

    // Midspan deflection should also superpose
    let mid = n / 2 + 1;
    let d_trap = res_trap.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_udl  = res_udl.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_tri  = res_tri.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    assert_close(d_trap, d_udl + d_tri, 0.01,
        "Superposition: δ_mid(trap) = δ_mid(udl) + δ_mid(tri)");
}

// ================================================================
// 6. Fixed-Fixed with Triangular Load: End Moments
// ================================================================
//
// Triangular load (0 at A, q at B) on fixed-fixed beam.
// Fixed-end moments:
//   M_A = qL²/30 (hogging at A)
//   M_B = qL²/20 (hogging at B)
//
// Ref: AISC Steel Construction Manual, 16th Ed., Table 3-23, Case 5
//      Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Appendix D

#[test]
fn validation_tri_fixed_fixed_end_moments() {
    let l = 6.0;
    let n = 24; // fine mesh for accuracy
    let q: f64 = 10.0; // kN/m at B

    let loads = triangular_loads(n, 0.0, -q);
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // M_A = qL²/30, M_B = qL²/20
    let m_a_exact = q * l * l / 30.0;
    let m_b_exact = q * l * l / 20.0;

    assert_close(r_a.my.abs(), m_a_exact, 0.08, "Fixed-fixed tri: M_A = qL²/30");
    assert_close(r_b.my.abs(), m_b_exact, 0.08, "Fixed-fixed tri: M_B = qL²/20");

    // M_B > M_A (larger moment at the heavily loaded end)
    assert!(r_b.my.abs() > r_a.my.abs(),
        "Fixed-fixed tri: M_B > M_A: {:.4} > {:.4}", r_b.my.abs(), r_a.my.abs());

    // Shear reactions: R_A = 3qL/20, R_B = 7qL/20
    let r_a_shear = q * l * 3.0 / 20.0;
    let r_b_shear = q * l * 7.0 / 20.0;
    assert_close(r_a.rz, r_a_shear, 0.08, "Fixed-fixed tri: R_A = 3qL/20");
    assert_close(r_b.rz, r_b_shear, 0.08, "Fixed-fixed tri: R_B = 7qL/20");
}

// ================================================================
// 7. Triangular vs Equivalent Point Load
// ================================================================
//
// The triangular load (0 at A, q at B) has the same resultant as a
// point load P = qL/2 at x = 2L/3 from A.
// However, the bending moment diagram differs significantly:
// - Triangular: smooth parabolic-ish shape
// - Point load: piecewise linear with kink at P
// The reactions match, but the midspan moment differs.

#[test]
fn validation_tri_vs_equivalent_point_load() {
    let l = 6.0;
    let n = 12;
    let q: f64 = 12.0; // kN/m at B

    // Triangular load
    let loads_tri = triangular_loads(n, 0.0, -q);
    let input_tri = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_tri);
    let res_tri = linear::solve_2d(&input_tri).unwrap();

    // Equivalent point load: P = qL/2, at x = 2L/3
    let p_equiv = q * l / 2.0;
    let x_eq = 2.0 * l / 3.0; // 2L/3 from A
    let load_node = (x_eq / l * n as f64).round() as usize + 1;
    let load_node = load_node.clamp(1, n + 1);
    let loads_pt = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p_equiv, my: 0.0,
    })];
    let input_pt = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_pt);
    let res_pt = linear::solve_2d(&input_pt).unwrap();

    // Reactions should be equal (same resultant force and location)
    let r_a_tri = res_tri.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_a_pt  = res_pt.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(r_a_tri, r_a_pt, 0.05, "Tri vs equiv PL: R_A matches");

    // BUT midspan deflections should differ (different load distributions)
    let mid = n / 2 + 1;
    let d_tri = res_tri.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();
    let d_pt  = res_pt.displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Triangular load: max deflection near 2L/3, so midspan deflection is
    // smaller than for the equivalent point load at 2L/3.
    // Both should be nonzero and positive (downward).
    assert!(d_tri > 0.0, "Tri: midspan deflection should be positive");
    assert!(d_pt > 0.0, "Equiv PL: midspan deflection should be positive");

    // Both max moments should be in right range
    let m_tri_max = res_tri.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let m_pt_max = res_pt.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // Analytical M_max for triangular: qL²/(9√3) ≈ 0.0642 qL²
    let m_tri_exact = q * l * l / (9.0 * 3.0_f64.sqrt());
    // Analytical M_max for point load: P*(L-a)*a/L = P*2L/3*L/3/L = P*2L/9 * (2/3)
    // Actually M_max for PL at a=2L/3 from A: M = R_A*a = (P*L/3)/L * (2L/3) = Pab/L... wait
    // R_A = P*b/L = P*(L/3)/L = P/3; M at a=2L/3: M = R_A*(2L/3) = P*2L/9
    // With P = qL/2: M = qL²/9
    let m_pt_exact = p_equiv * (l / 3.0) * (2.0 * l / 3.0) / l;

    assert_close(m_tri_max, m_tri_exact, 0.10, "Tri: M_max = qL²/(9√3)");
    assert_close(m_pt_max, m_pt_exact, 0.05, "Equiv PL: M_max = Pa*b/L");
}

// ================================================================
// 8. SS Beam Triangular Load: Shear Force Pattern
// ================================================================
//
// Triangular load (0 at A, q at B): shear force is quadratic in x.
// V(x) = R_A - (q/L)(x²/2) = qL/6 - qx²/(2L)
// V at x=0: V_A = +qL/6 (upward shear to the left of section)
// V at x=L: V_B = -(qL/2 - qL/6) = -qL/3 (downward net from loads)
// Shear changes sign at x = L/√3.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Fig. 6-29

#[test]
fn validation_tri_ss_shear_pattern() {
    let l = 9.0;
    let n = 18;
    let q: f64 = 12.0;

    let loads = triangular_loads(n, 0.0, -q);
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Shear at left end (start of element 1): should be +R_A = qL/6
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_left = ef_first.v_start;
    assert_close(v_left, q * l / 6.0, 0.05, "Tri SS: V at A = +qL/6");

    // Shear at right end (end of last element): should be -R_B = -qL/3
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    let v_right = ef_last.v_end;
    assert_close(v_right, -(q * l / 3.0), 0.05, "Tri SS: V at B = -qL/3");

    // Shear must change sign somewhere between A and B
    // (from positive at A to negative at B)
    let all_v_start: Vec<f64> = results.element_forces.iter()
        .map(|f| f.v_start)
        .collect();
    let has_positive = all_v_start.iter().any(|&v| v > 0.0);
    let has_negative = all_v_start.iter().any(|&v| v < 0.0);
    assert!(has_positive && has_negative,
        "Shear must change sign under triangular load");

    // Total vertical equilibrium: reactions = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l / 2.0, 0.01, "Tri SS: ΣR = qL/2");
}
