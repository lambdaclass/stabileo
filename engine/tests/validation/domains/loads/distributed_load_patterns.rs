/// Validation: Distributed Load Patterns
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4 & 6 (beam reactions, shear/moment)
///   - Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1 (beam deflection formulas)
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 3 (fixed-end forces)
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed., Ch. 9 (deflections)
///
/// Tests verify structural response to different distributed load patterns:
///   1. UDL on SS beam: symmetric reactions R = qL/2
///   2. Triangular load on SS beam: R_A = q_max*L/6, R_B = q_max*L/3
///   3. Reversed triangular load: reactions swap compared to test 2
///   4. Partial span UDL: total reaction = q*L/2, R_A > R_B
///   5. UDL gives larger midspan deflection than triangular (same total load)
///   6. Linearly varying load on cantilever: tip deflection = q_max*L^4/(30EI)
///   7. Double UDL intensity = double deflection (linearity check)
///   8. Full span UDL on cantilever: Ry = q*L, M = qL^2/2
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. UDL on SS Beam: Symmetric Reactions
// ================================================================
//
// Simply-supported beam with uniform distributed load q = -10 kN/m,
// span L = 8 m, discretized into 8 elements.
// By symmetry and equilibrium: R_A = R_B = qL/2 = 10*8/2 = 40 kN.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Example 4-1

#[test]
fn validation_udl_ss_beam_symmetric_reactions() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0; // kN/m downward

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    let expected = q.abs() * l / 2.0; // 40.0 kN

    assert_close(r_a, expected, 0.02, "UDL SS beam: R_A = qL/2");
    assert_close(r_b, expected, 0.02, "UDL SS beam: R_B = qL/2");

    // Symmetry: both reactions should be equal
    assert_close(r_a, r_b, 0.02, "UDL SS beam: R_A = R_B (symmetry)");

    // Equilibrium: R_A + R_B = total load = q * L
    let total_load = q.abs() * l;
    assert_close(r_a + r_b, total_load, 0.02, "UDL SS beam: ΣR = qL");
}

// ================================================================
// 2. Triangular Load on SS Beam
// ================================================================
//
// Triangular load: 0 at left (node A), q_max at right (node B).
// Total load = q_max * L / 2.
// Resultant acts at 2L/3 from A.
// Moments about B: R_A * L = (q_max*L/2) * (L/3)  =>  R_A = q_max*L/6.
// R_B = q_max*L/2 - q_max*L/6 = q_max*L/3.
//
// Ref: Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1, Case 2b

#[test]
fn validation_triangular_load_ss_beam_reactions() {
    let l = 8.0;
    let n = 8;
    let q_max: f64 = 10.0; // kN/m at right end (magnitude)

    // Build triangular load: 0 at left, -q_max at right
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -q_max * t_i,
                q_j: -q_max * t_j,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Analytical: R_A = q_max*L/6, R_B = q_max*L/3
    let r_a_exact = q_max * l / 6.0;
    let r_b_exact = q_max * l / 3.0;

    assert_close(r_a, r_a_exact, 0.02, "Triangular SS: R_A = q_max*L/6");
    assert_close(r_b, r_b_exact, 0.02, "Triangular SS: R_B = q_max*L/3");

    // Equilibrium: R_A + R_B = q_max*L/2
    let total = q_max * l / 2.0;
    assert_close(r_a + r_b, total, 0.02, "Triangular SS: ΣR = q_max*L/2");
}

// ================================================================
// 3. Reversed Triangular Load
// ================================================================
//
// Same as test 2 but load varies from q_max at left to 0 at right.
// Reactions swap: R_A = q_max*L/3, R_B = q_max*L/6.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Section 4-4

#[test]
fn validation_reversed_triangular_load_reactions() {
    let l = 8.0;
    let n = 8;
    let q_max: f64 = 10.0;

    // Forward: 0 at left, q_max at right
    let loads_fwd: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -q_max * t_i,
                q_j: -q_max * t_j,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_fwd = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_fwd);
    let res_fwd = linear::solve_2d(&input_fwd).unwrap();

    // Reversed: q_max at left, 0 at right
    let loads_rev: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -q_max * (1.0 - t_i),
                q_j: -q_max * (1.0 - t_j),
                a: None,
                b: None,
            })
        })
        .collect();
    let input_rev = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_rev);
    let res_rev = linear::solve_2d(&input_rev).unwrap();

    let r_a_fwd = res_fwd.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b_fwd = res_fwd.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    let r_a_rev = res_rev.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b_rev = res_rev.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Reversed: R_A = q_max*L/3, R_B = q_max*L/6
    assert_close(r_a_rev, q_max * l / 3.0, 0.02, "Reversed tri: R_A = q_max*L/3");
    assert_close(r_b_rev, q_max * l / 6.0, 0.02, "Reversed tri: R_B = q_max*L/6");

    // Reaction swap: forward R_A = reversed R_B, forward R_B = reversed R_A
    assert_close(r_a_fwd, r_b_rev, 0.02, "Reversed: R_A(fwd) = R_B(rev)");
    assert_close(r_b_fwd, r_a_rev, 0.02, "Reversed: R_B(fwd) = R_A(rev)");
}

// ================================================================
// 4. Partial Span UDL
// ================================================================
//
// UDL only on the first half of the SS beam (elements 1-4 of 8).
// Total load = q * L/2.
// Load centroid is at L/4 from A, so R_A > R_B.
// By moment equilibrium about B: R_A * L = (q*L/2) * (3L/4)
//   => R_A = 3qL/8.
// R_B = qL/2 - 3qL/8 = qL/8.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Ch. 7

#[test]
fn validation_partial_span_udl() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0; // kN/m downward

    // Load only on first 4 elements (left half)
    let loads: Vec<SolverLoad> = (1..=4)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Total load = q * L/2 = 10 * 4 = 40
    let total_load = q.abs() * l / 2.0;
    assert_close(r_a + r_b, total_load, 0.02, "Partial UDL: ΣR = q*L/2");

    // R_A > R_B since load is closer to A
    assert!(
        r_a > r_b,
        "Partial UDL: R_A > R_B: {:.4} > {:.4}",
        r_a,
        r_b
    );

    // Exact: R_A = 3qL/8 = 30, R_B = qL/8 = 10
    assert_close(r_a, 3.0 * q.abs() * l / 8.0, 0.02, "Partial UDL: R_A = 3qL/8");
    assert_close(r_b, q.abs() * l / 8.0, 0.02, "Partial UDL: R_B = qL/8");
}

// ================================================================
// 5. UDL Gives Larger Midspan Deflection Than Triangular
// ================================================================
//
// For the same total load on an SS beam, a UDL puts more load near
// midspan than a triangular distribution, producing a larger midspan
// deflection. We normalize: UDL q_udl such that total = q_udl*L,
// and triangular with q_max such that total = q_max*L/2. Set them
// equal: q_udl*L = q_max*L/2 => q_max = 2*q_udl.
//
// Ref: Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1

#[test]
fn validation_udl_larger_deflection_than_triangular() {
    let l = 8.0;
    let n = 16; // fine mesh for deflection accuracy
    let q_udl: f64 = 10.0; // kN/m
    let q_tri: f64 = 2.0 * q_udl; // so total load = q_udl * L for both

    // UDL case
    let input_udl = make_ss_beam_udl(n, l, E, A, IZ, -q_udl);
    let res_udl = linear::solve_2d(&input_udl).unwrap();

    // Triangular case: 0 at left, q_tri at right
    let loads_tri: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -q_tri * t_i,
                q_j: -q_tri * t_j,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_tri = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_tri);
    let res_tri = linear::solve_2d(&input_tri).unwrap();

    let mid = n / 2 + 1;
    let d_udl = res_udl
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uy
        .abs();
    let d_tri = res_tri
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uy
        .abs();

    // UDL should give larger midspan deflection than triangular for same total load
    assert!(
        d_udl > d_tri,
        "UDL midspan deflection > triangular: {:.6e} > {:.6e}",
        d_udl,
        d_tri
    );

    // Verify both have the same total reactions (same total load)
    let sum_ry_udl: f64 = res_udl.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_tri: f64 = res_tri.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_udl, sum_ry_tri, 0.02, "Same total load: ΣR_udl = ΣR_tri");
}

// ================================================================
// 6. Linearly Varying Load on Cantilever: Tip Deflection
// ================================================================
//
// Cantilever with triangular load: q_max at fixed end, 0 at free tip.
// Analytical tip deflection: delta = q_max * L^4 / (30 * E * I).
//
// Ref: Roark, "Formulas for Stress and Strain", 9th Ed., Table 3.1a,
//      Case 1e (cantilever, triangular load, max at fixed end)

#[test]
fn validation_cantilever_linearly_varying_load() {
    let l = 4.0;
    let n = 16; // fine mesh for accuracy
    let q_max: f64 = 8.0; // kN/m at fixed end
    let e_eff = E * 1000.0; // kN/m^2

    // Triangular load: q_max at root (node 1), 0 at tip (node n+1)
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -q_max * (1.0 - t_i),
                q_j: -q_max * (1.0 - t_j),
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    let delta_computed = tip.uy.abs();

    // Analytical: delta_tip = q_max * L^4 / (30 * E * I)
    let delta_exact = q_max * l.powi(4) / (30.0 * e_eff * IZ);

    assert_close(
        delta_computed,
        delta_exact,
        0.05,
        "Cantilever tri load: delta_tip = q_max*L^4/(30EI)",
    );

    // Also check reactions: Ry = q_max*L/2, M = q_max*L^2/6
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(
        r1.ry,
        q_max * l / 2.0,
        0.02,
        "Cantilever tri load: Ry = q_max*L/2",
    );
    assert_close(
        r1.mz.abs(),
        q_max * l * l / 6.0,
        0.05,
        "Cantilever tri load: M = q_max*L^2/6",
    );
}

// ================================================================
// 7. Double UDL Intensity = Double Deflection
// ================================================================
//
// By linearity of the elastic solution, doubling the load intensity
// must double the deflection. Compare q=-10 vs q=-20 on the same
// SS beam and verify the midspan deflection ratio is 2.
//
// Ref: Fundamental principle of linear elastic analysis

#[test]
fn validation_double_udl_double_deflection() {
    let l = 8.0;
    let n = 8;
    let q1: f64 = -10.0;
    let q2: f64 = -20.0;

    let input1 = make_ss_beam_udl(n, l, E, A, IZ, q1);
    let res1 = linear::solve_2d(&input1).unwrap();

    let input2 = make_ss_beam_udl(n, l, E, A, IZ, q2);
    let res2 = linear::solve_2d(&input2).unwrap();

    let mid = n / 2 + 1;
    let d1 = res1
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uy;
    let d2 = res2
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uy;

    // Deflection ratio should be exactly 2
    let ratio = d2 / d1;
    assert_close(ratio, 2.0, 0.02, "Double UDL: deflection ratio = 2");

    // Also check reactions scale linearly
    let r1_a = res1.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2_a = res2.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let reaction_ratio = r2_a / r1_a;
    assert_close(reaction_ratio, 2.0, 0.02, "Double UDL: reaction ratio = 2");
}

// ================================================================
// 8. Full Span UDL on Cantilever: Equilibrium Check
// ================================================================
//
// Cantilever with 4 elements, UDL q = -15 kN/m over full span L.
// Fixed-end reaction: Ry = q * L (total load).
// Fixed-end moment: M = q * L^2 / 2.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Example 4-5

#[test]
fn validation_cantilever_udl_equilibrium() {
    let l = 4.0;
    let n = 4;
    let q: f64 = -15.0; // kN/m downward

    // Build cantilever with UDL on all elements
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical reaction = total load = |q| * L = 15 * 4 = 60 kN
    let ry_exact = q.abs() * l;
    assert_close(r1.ry, ry_exact, 0.02, "Cantilever UDL: Ry = q*L");

    // Fixed-end moment = |q| * L^2 / 2 = 15 * 16 / 2 = 120 kN·m
    let mz_exact = q.abs() * l * l / 2.0;
    assert_close(
        r1.mz.abs(),
        mz_exact,
        0.02,
        "Cantilever UDL: M = q*L^2/2",
    );

    // Horizontal reaction should be zero (no axial load)
    assert_close(r1.rx, 0.0, 0.02, "Cantilever UDL: Rx = 0");

    // Tip deflection: delta = q*L^4/(8EI) — verify as bonus check
    let e_eff = E * 1000.0;
    let delta_exact = q.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        tip.uy.abs(),
        delta_exact,
        0.05,
        "Cantilever UDL: delta_tip = qL^4/(8EI)",
    );
}
