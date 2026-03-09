/// Validation: Extended Triangular Load Tests
///
/// References:
///   - Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Appendix D
///   - Timoshenko & Gere, "Theory of Elastic Stability", beam deflection tables
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4, 6, 12
///   - AISC Steel Construction Manual, 16th Ed., Table 3-23
///
/// Tests verify extended triangular (linearly varying) load scenarios:
///   1. Propped cantilever with triangular load: fixed-end moment and reactions
///   2. Cantilever with reversed triangular load (0 at root, q at tip): tip deflection = qL^4/(120EI)? No -- 11qL^4/(120EI)
///   3. SS beam triangular load: midspan deflection formula
///   4. Two-span continuous beam with triangular load: interior reaction
///   5. Antisymmetric triangular load on SS beam: zero midspan deflection
///   6. Fixed-fixed beam with reversed triangular load: end moments swap
///   7. Cantilever with full triangular load: rotation at tip
///   8. SS beam triangular load: moment at quarter-span vs analytical
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
// 1. Propped Cantilever with Triangular Load (0 at fixed, q at roller)
// ================================================================
//
// Fixed at A (node 1), roller at B (node n+1).
// Triangular load: 0 at A, q at B (downward).
// Total load W = qL/2 at centroid 2L/3 from A.
//
// For a propped cantilever (fixed at A, rollerY at B) with triangular
// load (0 at A, q at B):
//   R_B = (1/(2L^3)) * integral_0^L [q*x/L * x^2*(3L - x)/2] dx
//       = qL * 1/3 - correction from compatibility
// Using the standard result:
//   R_B = qL(33/280) (upward)  -- Nope, let me use a simpler check.
//
// We verify global equilibrium: R_A + R_B = qL/2
// and that the fixed-end moment M_A is nonzero while M_B = 0 (roller).
//
// Ref: Roark, Table 8.1

#[test]
fn validation_tri_ext_propped_cantilever_equilibrium() {
    let l = 6.0;
    let n = 24;
    let q: f64 = 10.0;

    // Triangular load: 0 at A (fixed), q at B (roller)
    let loads = triangular_loads(n, 0.0, -q);
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Global equilibrium: R_A_y + R_B_y = qL/2 (total load)
    let total_load = q * l / 2.0;
    assert_close(r_a.ry + r_b.ry, total_load, 0.01,
        "Propped cantilever tri: sum Ry = qL/2");

    // Fixed end has a moment reaction, roller does not
    assert!(r_a.mz.abs() > 0.1,
        "Propped cantilever tri: fixed end should have moment, got {:.6}", r_a.mz);

    // The fixed end takes more load than the roller since load is
    // heavier near B but the fixed end provides moment restraint.
    // Both reactions should be positive (upward).
    assert!(r_a.ry > 0.0, "R_A should be upward: {:.6}", r_a.ry);
    assert!(r_b.ry > 0.0, "R_B should be upward: {:.6}", r_b.ry);

    // More of the load goes to the roller end since the load is heavier
    // near B. But with fixed support, R_A still gets a significant share.
    // Just check both are reasonable fractions of total load.
    assert!(r_a.ry > 0.05 * total_load, "R_A should be at least 5% of total");
    assert!(r_b.ry > 0.05 * total_load, "R_B should be at least 5% of total");
}

// ================================================================
// 2. Cantilever with Triangular Load (0 at root, q at tip)
// ================================================================
//
// Fixed at A (node 1), free at B (node n+1).
// Triangular load: 0 at A (x=0), q at B (x=L) (downward).
// Total load = qL/2 at centroid 2L/3 from A.
//
// Tip deflection: delta = 11*q*L^4 / (120*E*I)
// Fixed-end reaction: R_A = qL/2, M_A = qL^2/3
//
// Ref: Roark, Table 8.1, Case for cantilever with linearly
//      increasing load (zero at fixed end, q at free end)

#[test]
fn validation_tri_ext_cantilever_zero_at_root() {
    let l = 5.0;
    let n = 20;
    let q: f64 = 6.0;
    let e_eff: f64 = E * 1000.0; // kN/m^2

    // Triangular load: 0 at root (node 1), -q at tip (node n+1)
    let loads = triangular_loads(n, 0.0, -q);
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_computed: f64 = tip.uy.abs();

    // Analytical: delta_tip = 11*q*L^4 / (120*E*I)
    let delta_exact: f64 = 11.0 * q * l.powi(4) / (120.0 * e_eff * IZ);

    assert_close(delta_computed, delta_exact, 0.05,
        "Cantilever tri (0 at root): delta_tip = 11qL^4/(120EI)");

    // Reactions: R_y = qL/2, M_A = qL^2/3 (about centroid at 2L/3)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, q * l / 2.0, 0.02,
        "Cantilever tri (0 at root): R = qL/2");

    // Moment at fixed end: M = qL^2/3
    // (integral of q*x/L * x dx from 0 to L = qL^2/3)
    assert_close(r1.mz.abs(), q * l * l / 3.0, 0.05,
        "Cantilever tri (0 at root): M = qL^2/3");
}

// ================================================================
// 3. SS Beam Triangular Load: Midspan Deflection
// ================================================================
//
// Simply supported beam with triangular load: 0 at A, q at B.
// Midspan deflection (x = L/2):
//   delta_mid = 5*q*L^4 / (768*E*I)  -- Nope, that's UDL.
//
// For triangular load (0 at A, q at B) on SS beam:
//   delta_max = 0.01304 * q*L^4 / (E*I)  at x ~= 0.5193L
//   delta(L/2) = q*L^4 * (5/768) * correction...
//
// Simpler: compare to the known max deflection formula.
// delta_max = q*L^4 / (76.68*E*I) = 0.01304*q*L^4/(E*I)
//   at x = 0.5193*L
//
// Ref: Roark, Table 8.1, Case 2b

#[test]
fn validation_tri_ext_ss_max_deflection() {
    let l = 10.0;
    let n = 40; // fine mesh
    let q: f64 = 8.0;
    let e_eff: f64 = E * 1000.0;

    let loads = triangular_loads(n, 0.0, -q);
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find maximum deflection across all nodes
    let max_disp: f64 = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // Analytical max deflection: delta_max = 0.01304 * qL^4/(EI)
    let delta_max_exact: f64 = 0.01304 * q * l.powi(4) / (e_eff * IZ);

    assert_close(max_disp, delta_max_exact, 0.05,
        "Tri SS: max deflection = 0.01304*qL^4/(EI)");

    // Max deflection occurs near x = 0.5193*L
    // Find the node with the largest deflection
    let max_node = results.displacements.iter()
        .max_by(|a, b| a.uy.abs().partial_cmp(&b.uy.abs()).unwrap())
        .unwrap();
    let x_max_computed: f64 = (max_node.node_id as f64 - 1.0) * l / n as f64;
    let x_max_exact: f64 = 0.5193 * l;

    // Allow some tolerance since mesh discretization limits precision of location
    let x_err: f64 = (x_max_computed - x_max_exact).abs() / l;
    assert!(x_err < 0.05,
        "Max deflection location: computed x={:.4}, expected x={:.4}, err={:.4}",
        x_max_computed, x_max_exact, x_err);
}

// ================================================================
// 4. Two-Span Continuous Beam with Triangular Load on Span 1
// ================================================================
//
// Two equal spans L, supports at A(pinned), B(roller), C(roller).
// Triangular load on span 1 only: 0 at A, q at B.
// By three-moment equation or compatibility, we can verify:
//   - Interior support reaction R_B > qL/3 (due to continuity)
//   - R_A + R_B + R_C = qL/2 (total load)
//   - R_C has a small uplift (negative) or downward reaction
//     due to continuity over B pulling span 2.
//
// Ref: Ghali, Neville & Brown, Ch. 6

#[test]
fn validation_tri_ext_two_span_continuous() {
    let l = 6.0;
    let n_per_span = 12;
    let n_total = n_per_span * 2;
    let q: f64 = 10.0;

    // Only load on span 1 (elements 1..n_per_span)
    let loads: Vec<SolverLoad> = (0..n_per_span)
        .map(|i| {
            let t_i: f64 = i as f64 / n_per_span as f64;
            let t_j: f64 = (i + 1) as f64 / n_per_span as f64;
            let qi = -q * t_i;
            let qj = -q * t_j;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: qi,
                q_j: qj,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_continuous_beam(
        &[l, l], n_per_span, E, A, IZ, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = n_total + 1;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap().ry;
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap().ry;

    // Global equilibrium: R_A + R_B + R_C = qL/2
    let total_load: f64 = q * l / 2.0;
    assert_close(r_a + r_b + r_c, total_load, 0.01,
        "Two-span tri: sum R = qL/2");

    // Interior support B should carry the most load since the
    // triangular load peaks at B
    assert!(r_b > r_a,
        "Two-span tri: R_B > R_A: {:.4} vs {:.4}", r_b, r_a);

    // Span 2 is unloaded, but continuity causes a small reaction at C.
    // Due to the negative moment at B from span 1 loading, C gets pulled
    // upward slightly (negative reaction meaning the beam wants to lift off).
    // The magnitude should be small compared to total load.
    assert!(r_c.abs() < 0.3 * total_load,
        "Two-span tri: R_C should be small: {:.4} vs total {:.4}", r_c, total_load);
}

// ================================================================
// 5. Antisymmetric Triangular Load on SS Beam
// ================================================================
//
// SS beam with antisymmetric load: +q at A, 0 at midspan, -q at B.
// This means the load is q*(1 - 2x/L) which is positive on the left
// half and negative on the right half.
//
// By antisymmetry about midspan:
//   - Midspan deflection = 0
//   - R_A = R_B (equal reactions, both upward for net load = 0)
//   - Actually net load = integral of q*(1-2x/L) dx from 0 to L = 0
//     So R_A + R_B = 0 by equilibrium if load is self-balanced.
//     Wait: R_A = -R_B by antisymmetry if load has zero resultant.
//     Actually moments about B: R_A*L = integral_0^L q(1-2x/L)*x dx
//     = q * integral_0^L (x - 2x^2/L) dx = q*(L^2/2 - 2L^2/3) = q*(-L^2/6)
//     so R_A = -qL/6, R_B = qL/6.
//
// We can model this as a linear load from +q to -q across the beam.
// Total load = (+q + (-q))/2 * L = 0. Resultant force is zero.
// But the moment about midspan is nonzero.

#[test]
fn validation_tri_ext_antisymmetric_load() {
    let l = 8.0;
    let n = 32;
    let q: f64 = 10.0;

    // Linear load from +q at A to -q at B
    let loads = triangular_loads(n, -q, q);
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Net load is zero, so R_A + R_B = 0
    assert_close(r_a + r_b, 0.0, 0.01,
        "Antisymmetric tri: sum R = 0");

    // R_A = qL/6 (upward, to resist the downward load on the left half)
    // Load is -q at left (downward), +q at right (upward)
    // Moment about B: R_A*L = integral_0^L w(x)*x dx
    //   where w(x) = -q + 2qx/L  (goes from -q at x=0 to +q at x=L)
    //   integral = integral_0^L (-qx + 2qx^2/L) dx = -qL^2/2 + 2qL^2/3 = qL^2/6
    //   R_A = qL/6
    assert_close(r_a, q * l / 6.0, 0.03,
        "Antisymmetric tri: R_A = qL/6");
    assert_close(r_b, -(q * l / 6.0), 0.03,
        "Antisymmetric tri: R_B = -qL/6");

    // By antisymmetry, midspan deflection should be zero
    let mid_node = n / 2 + 1;
    let d_mid: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    // Should be exactly zero by antisymmetry (within numerical tolerance)
    assert!(d_mid < 1e-10,
        "Antisymmetric tri: midspan deflection should be ~0, got {:.6e}", d_mid);
}

// ================================================================
// 6. Fixed-Fixed Beam: Reversed Triangle End Moments Swap
// ================================================================
//
// Standard triangle (0 at A, q at B) on fixed-fixed beam:
//   M_A = qL^2/30, M_B = qL^2/20
// Reversed triangle (q at A, 0 at B):
//   M_A = qL^2/20, M_B = qL^2/30
// The moments simply swap sides.
//
// Ref: AISC Table 3-23, Case 5

#[test]
fn validation_tri_ext_fixed_fixed_reversed_moments() {
    let l = 6.0;
    let n = 24;
    let q: f64 = 10.0;

    // Forward: 0 at A, q at B
    let loads_fwd = triangular_loads(n, 0.0, -q);
    let input_fwd = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_fwd);
    let res_fwd = linear::solve_2d(&input_fwd).unwrap();

    let m_a_fwd: f64 = res_fwd.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    let m_b_fwd: f64 = res_fwd.reactions.iter().find(|r| r.node_id == n + 1).unwrap().mz;

    // Reversed: q at A, 0 at B
    let loads_rev = triangular_loads(n, -q, 0.0);
    let input_rev = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_rev);
    let res_rev = linear::solve_2d(&input_rev).unwrap();

    let m_a_rev: f64 = res_rev.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    let m_b_rev: f64 = res_rev.reactions.iter().find(|r| r.node_id == n + 1).unwrap().mz;

    // Forward: |M_A| = qL^2/30, |M_B| = qL^2/20
    let m_small: f64 = q * l * l / 30.0;
    let m_large: f64 = q * l * l / 20.0;

    assert_close(m_a_fwd.abs(), m_small, 0.08, "Fwd tri: |M_A| = qL^2/30");
    assert_close(m_b_fwd.abs(), m_large, 0.08, "Fwd tri: |M_B| = qL^2/20");

    // Reversed: swap
    assert_close(m_a_rev.abs(), m_large, 0.08, "Rev tri: |M_A| = qL^2/20");
    assert_close(m_b_rev.abs(), m_small, 0.08, "Rev tri: |M_B| = qL^2/30");

    // The forward M_A should equal the reversed M_B (magnitudes)
    assert_close(m_a_fwd.abs(), m_b_rev.abs(), 0.05,
        "Symmetry: |M_A(fwd)| = |M_B(rev)|");
    assert_close(m_b_fwd.abs(), m_a_rev.abs(), 0.05,
        "Symmetry: |M_B(fwd)| = |M_A(rev)|");
}

// ================================================================
// 7. Cantilever with Triangular Load (q at root, 0 at tip): Tip Rotation
// ================================================================
//
// Fixed at A (node 1), free tip at B (node n+1).
// Triangular load: q at A (x=0), 0 at B (x=L) (downward).
// Load intensity: w(x) = q*(1 - x/L)
//
// Tip rotation:
//   theta_tip = q*L^3 / (24*E*I)
//
// Ref: Roark, Table 8.1 (cantilever, triangular load max at fixed end)

#[test]
fn validation_tri_ext_cantilever_tip_rotation() {
    let l = 4.0;
    let n = 16;
    let q: f64 = 8.0;
    let e_eff: f64 = E * 1000.0;

    // Triangular load: q at root (node 1), 0 at tip (node n+1)
    let loads = triangular_loads(n, -q, 0.0);
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_computed: f64 = tip.rz.abs();

    // Analytical: theta_tip = qL^3 / (24EI)
    let theta_exact: f64 = q * l.powi(3) / (24.0 * e_eff * IZ);

    assert_close(theta_computed, theta_exact, 0.05,
        "Cantilever tri (q at root): theta_tip = qL^3/(24EI)");

    // Also verify tip deflection: delta = qL^4/(30EI)
    let delta_computed: f64 = tip.uy.abs();
    let delta_exact: f64 = q * l.powi(4) / (30.0 * e_eff * IZ);
    assert_close(delta_computed, delta_exact, 0.05,
        "Cantilever tri (q at root): delta_tip = qL^4/(30EI)");
}

// ================================================================
// 8. SS Beam Triangular Load: Moment at Quarter-Span
// ================================================================
//
// SS beam with triangular load: 0 at A (x=0), q at B (x=L).
// Shear: V(x) = qL/6 - q*x^2/(2L)
// Moment: M(x) = qL*x/6 - q*x^3/(6L)
//
// At x = L/4:
//   M(L/4) = qL*(L/4)/6 - q*(L/4)^3/(6L)
//           = qL^2/24 - qL^2/384
//           = qL^2 * (16/384 - 1/384)
//           = 15*qL^2/384
//           = 5*qL^2/128
//
// At x = 3L/4:
//   M(3L/4) = qL*(3L/4)/6 - q*(3L/4)^3/(6L)
//           = 3qL^2/24 - 27qL^2/384
//           = qL^2 * (48/384 - 27/384)
//           = 21*qL^2/384
//           = 7*qL^2/128
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., shear-moment diagrams

#[test]
fn validation_tri_ext_ss_moment_at_quarter_spans() {
    let l = 12.0;
    let n = 48; // fine mesh so node at L/4 and 3L/4 are well-represented
    let q: f64 = 10.0;

    let loads = triangular_loads(n, 0.0, -q);
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Node at L/4: node index = n/4 + 1
    let node_quarter = n / 4; // element ending at L/4
    // Moment at L/4: use m_end of element at L/4 position
    // Element node_quarter ends at node (n/4 + 1) which is at x = L/4
    let ef_quarter = results.element_forces.iter()
        .find(|f| f.element_id == node_quarter).unwrap();
    let m_at_quarter: f64 = ef_quarter.m_end.abs();

    // Analytical: M(L/4) = 5*qL^2/128
    let m_quarter_exact: f64 = 5.0 * q * l * l / 128.0;
    assert_close(m_at_quarter, m_quarter_exact, 0.05,
        "Tri SS: M(L/4) = 5qL^2/128");

    // Node at 3L/4: element index 3n/4
    let node_3quarter = 3 * n / 4;
    let ef_3quarter = results.element_forces.iter()
        .find(|f| f.element_id == node_3quarter).unwrap();
    let m_at_3quarter: f64 = ef_3quarter.m_end.abs();

    // Analytical: M(3L/4) = 7*qL^2/128
    let m_3quarter_exact: f64 = 7.0 * q * l * l / 128.0;
    assert_close(m_at_3quarter, m_3quarter_exact, 0.05,
        "Tri SS: M(3L/4) = 7qL^2/128");

    // Moment at 3L/4 > moment at L/4 (more load on the right side)
    assert!(m_at_3quarter > m_at_quarter,
        "M(3L/4) > M(L/4): {:.4} vs {:.4}", m_at_3quarter, m_at_quarter);
}
