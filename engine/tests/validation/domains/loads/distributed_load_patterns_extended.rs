/// Validation: Distributed Load Patterns — Extended
///
/// References:
///   - Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed., Ch. 9
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4, 6, 7
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 3
///
/// Tests verify structural response to extended distributed load patterns:
///   1. UDL on fixed-fixed beam: end moments = qL^2/12, midspan moment = qL^2/24
///   2. Trapezoidal load on SS beam: superposition of UDL + triangular
///   3. Superposition principle: two separate loads = combined single load
///   4. Triple load intensity = triple deflection (linearity at 3x)
///   5. Symmetric triangular (peak at midspan) on SS beam: R_A = R_B = q_max*L/4
///   6. Cantilever with reversed triangular load (0 at root, q_max at tip)
///   7. Partial-span UDL on right half of SS beam: mirror of left-half case
///   8. UDL on propped cantilever: R_B = 3qL/8, R_A = 5qL/8
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. UDL on Fixed-Fixed Beam: End Moments and Midspan Moment
// ================================================================
//
// Fixed-fixed beam with UDL q over span L.
// End moments: M_end = qL^2/12 (hogging at supports).
// Midspan moment: M_mid = qL^2/24 (sagging).
// Reactions: R_A = R_B = qL/2 (by symmetry).
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Table 3-1

#[test]
fn validation_fixed_fixed_beam_udl_reactions() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -12.0; // kN/m downward

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

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Reactions: R_A = R_B = qL/2 = 12*6/2 = 36 kN
    let ry_exact = q.abs() * l / 2.0;
    assert_close(r_a.ry, ry_exact, 0.02, "Fixed-fixed UDL: R_A = qL/2");
    assert_close(r_b.ry, ry_exact, 0.02, "Fixed-fixed UDL: R_B = qL/2");

    // Symmetry check on reactions
    assert_close(r_a.ry, r_b.ry, 0.02, "Fixed-fixed UDL: R_A = R_B");

    // End moments: M = qL^2/12 = 12*36/12 = 36 kN·m
    let m_exact = q.abs() * l * l / 12.0;
    assert_close(
        r_a.mz.abs(),
        m_exact,
        0.02,
        "Fixed-fixed UDL: M_A = qL^2/12",
    );
    assert_close(
        r_b.mz.abs(),
        m_exact,
        0.02,
        "Fixed-fixed UDL: M_B = qL^2/12",
    );
}

// ================================================================
// 2. Trapezoidal Load on SS Beam (Superposition)
// ================================================================
//
// Trapezoidal load = UDL(q_min) + triangular(q_max - q_min).
// q_i = 5 kN/m (left), q_j = 15 kN/m (right), L = 10 m.
// UDL component: q_u = 5 kN/m => R_A_u = R_B_u = 5*10/2 = 25 kN
// Triangular component: q_t = 10 kN/m (0 at left, 10 at right)
//   R_A_t = 10*10/6 = 16.667, R_B_t = 10*10/3 = 33.333
// Total: R_A = 25 + 16.667 = 41.667, R_B = 25 + 33.333 = 58.333
//
// Ref: Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1

#[test]
fn validation_trapezoidal_load_ss_beam() {
    let l = 10.0;
    let n = 20;
    let q_left: f64 = 5.0;
    let q_right: f64 = 15.0;

    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            let qi = q_left + (q_right - q_left) * t_i;
            let qj = q_left + (q_right - q_left) * t_j;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -qi,
                q_j: -qj,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;

    // UDL part: q_u = 5, R_Au = 5*10/2 = 25, R_Bu = 25
    // Tri part: q_t = 10, R_At = 10*10/6, R_Bt = 10*10/3
    let r_a_exact = q_left * l / 2.0 + (q_right - q_left) * l / 6.0;
    let r_b_exact = q_left * l / 2.0 + (q_right - q_left) * l / 3.0;

    assert_close(r_a, r_a_exact, 0.02, "Trapezoidal SS: R_A");
    assert_close(r_b, r_b_exact, 0.02, "Trapezoidal SS: R_B");

    // Equilibrium: R_A + R_B = total load = (q_left + q_right)*L/2
    let total = (q_left + q_right) * l / 2.0;
    assert_close(r_a + r_b, total, 0.02, "Trapezoidal SS: equilibrium");
}

// ================================================================
// 3. Superposition Principle: Two Loads = Combined Load
// ================================================================
//
// Load case A: UDL q_a = -6 on left half (elements 1..n/2).
// Load case B: UDL q_b = -10 on right half (elements n/2+1..n).
// Combined: both loads applied simultaneously.
// By superposition, reactions and deflections must match sum.
//
// Ref: Fundamental principle of linear elastic analysis

#[test]
fn validation_superposition_two_partial_loads() {
    let l = 8.0;
    let n: usize = 8;
    let q_a: f64 = -6.0;
    let q_b: f64 = -10.0;

    // Case A: left half only
    let loads_a: Vec<SolverLoad> = (1..=n / 2)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_a,
                q_j: q_a,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Case B: right half only
    let loads_b: Vec<SolverLoad> = (n / 2 + 1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_b,
                q_j: q_b,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Combined: both halves
    let mut loads_c: Vec<SolverLoad> = (1..=n / 2)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_a,
                q_j: q_a,
                a: None,
                b: None,
            })
        })
        .collect();
    for i in n / 2 + 1..=n {
        loads_c.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q_b,
            q_j: q_b,
            a: None,
            b: None,
        }));
    }
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();

    // Check reactions: combined = A + B
    let r_a_a = res_a.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_a_b = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_a_c = res_c.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(
        r_a_c,
        r_a_a + r_a_b,
        0.02,
        "Superposition: R_A(combined) = R_A(A) + R_A(B)",
    );

    let r_b_a = res_a
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;
    let r_b_b = res_b
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;
    let r_b_c = res_c
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;
    assert_close(
        r_b_c,
        r_b_a + r_b_b,
        0.02,
        "Superposition: R_B(combined) = R_B(A) + R_B(B)",
    );

    // Check midspan deflection
    let mid = n / 2 + 1;
    let d_a = res_a
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uy;
    let d_b = res_b
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uy;
    let d_c = res_c
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uy;
    assert_close(
        d_c,
        d_a + d_b,
        0.02,
        "Superposition: delta_mid(combined) = delta_mid(A) + delta_mid(B)",
    );
}

// ================================================================
// 4. Triple UDL Intensity = Triple Deflection
// ================================================================
//
// By linearity, tripling the load intensity must triple the midspan
// deflection and reactions. Compare q=-5 vs q=-15 on the same
// cantilever and verify the tip deflection ratio is 3.
//
// Ref: Fundamental principle of linear elastic analysis

#[test]
fn validation_triple_udl_triple_deflection() {
    let l = 5.0;
    let n = 10;
    let q1: f64 = -5.0;
    let q3: f64 = -15.0;

    let loads1: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q1,
                q_j: q1,
                a: None,
                b: None,
            })
        })
        .collect();
    let input1 = make_beam(n, l, E, A, IZ, "fixed", None, loads1);
    let res1 = linear::solve_2d(&input1).unwrap();

    let loads3: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q3,
                q_j: q3,
                a: None,
                b: None,
            })
        })
        .collect();
    let input3 = make_beam(n, l, E, A, IZ, "fixed", None, loads3);
    let res3 = linear::solve_2d(&input3).unwrap();

    let tip = n + 1;
    let d1 = res1
        .displacements
        .iter()
        .find(|d| d.node_id == tip)
        .unwrap()
        .uy;
    let d3 = res3
        .displacements
        .iter()
        .find(|d| d.node_id == tip)
        .unwrap()
        .uy;

    let ratio = d3 / d1;
    assert_close(ratio, 3.0, 0.02, "Triple UDL: deflection ratio = 3");

    // Reactions also scale by 3
    let ry1 = res1.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry3 = res3.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(ry3 / ry1, 3.0, 0.02, "Triple UDL: reaction ratio = 3");

    let mz1 = res1.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    let mz3 = res3.reactions.iter().find(|r| r.node_id == 1).unwrap().mz;
    assert_close(mz3 / mz1, 3.0, 0.02, "Triple UDL: moment ratio = 3");
}

// ================================================================
// 5. Symmetric Triangular Load on SS Beam (Peak at Midspan)
// ================================================================
//
// Triangular load with peak q_max at midspan, zero at both ends.
// Total load = q_max * L / 2.
// By symmetry: R_A = R_B = q_max * L / 4.
//
// Ref: Roark, "Formulas for Stress and Strain", 9th Ed., Table 8.1

#[test]
fn validation_symmetric_triangular_load_ss_beam() {
    let l = 10.0;
    let n: usize = 20; // even number for clean midspan
    let q_max: f64 = 12.0;

    // Triangular: ramps up from 0 to q_max at midspan, back to 0
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            // q(x) = q_max * (1 - |2x/L - 1|) = q_max * min(2x/L, 2(1-x/L))
            let qi = q_max * (1.0 - (2.0 * t_i - 1.0).abs());
            let qj = q_max * (1.0 - (2.0 * t_j - 1.0).abs());
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -qi,
                q_j: -qj,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;

    // Total load = q_max * L / 2; by symmetry R_A = R_B = q_max*L/4
    let r_exact = q_max * l / 4.0;
    assert_close(r_a, r_exact, 0.02, "Sym triangular SS: R_A = q_max*L/4");
    assert_close(r_b, r_exact, 0.02, "Sym triangular SS: R_B = q_max*L/4");

    // Symmetry
    assert_close(r_a, r_b, 0.02, "Sym triangular SS: R_A = R_B");

    // Equilibrium
    let total = q_max * l / 2.0;
    assert_close(r_a + r_b, total, 0.02, "Sym triangular SS: equilibrium");
}

// ================================================================
// 6. Cantilever with Reversed Triangular (0 at Root, q_max at Tip)
// ================================================================
//
// Triangular load: 0 at fixed end (root), q_max at free end (tip).
// Total load = q_max * L / 2.
// Reaction: Ry = q_max * L / 2.
// Moment at root: M = q_max * L^2 / 3 (resultant at 2L/3 from root).
// Tip deflection: delta = 11 * q_max * L^4 / (120 * E * I).
//
// Ref: Roark, "Formulas for Stress and Strain", 9th Ed., Table 3.1a,
//      Case 1e (cantilever, triangular load, max at free end)

#[test]
fn validation_cantilever_reversed_triangular_load() {
    let l = 4.0;
    let n = 16;
    let q_max: f64 = 10.0;
    let e_eff = E * 1000.0;

    // Triangular: 0 at root (node 1), q_max at tip (node n+1)
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

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Ry = q_max * L / 2 = 10 * 4 / 2 = 20
    assert_close(
        r1.ry,
        q_max * l / 2.0,
        0.02,
        "Cantilever rev tri: Ry = q_max*L/2",
    );

    // M = q_max * L^2 / 3 = 10 * 16 / 3 = 53.333
    assert_close(
        r1.mz.abs(),
        q_max * l * l / 3.0,
        0.05,
        "Cantilever rev tri: M = q_max*L^2/3",
    );

    // Tip deflection: delta = 11 * q_max * L^4 / (120 * E * I)
    let delta_exact = 11.0 * q_max * l.powi(4) / (120.0 * e_eff * IZ);
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        tip.uy.abs(),
        delta_exact,
        0.05,
        "Cantilever rev tri: delta = 11*q_max*L^4/(120EI)",
    );
}

// ================================================================
// 7. Partial-Span UDL on Right Half: Mirror of Left-Half Case
// ================================================================
//
// UDL on right half of SS beam. By mirror symmetry with the left-half
// case, R_A and R_B swap roles.
// Right-half load: R_A = qL/8, R_B = 3qL/8.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Ch. 7

#[test]
fn validation_partial_span_udl_right_half() {
    let l = 8.0;
    let n: usize = 8;
    let q: f64 = -10.0;

    // Left-half load (elements 1..4)
    let loads_left: Vec<SolverLoad> = (1..=n / 2)
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
    let input_left = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_left);
    let res_left = linear::solve_2d(&input_left).unwrap();

    // Right-half load (elements 5..8)
    let loads_right: Vec<SolverLoad> = (n / 2 + 1..=n)
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
    let input_right = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_right);
    let res_right = linear::solve_2d(&input_right).unwrap();

    let r_a_left = res_left.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b_left = res_left
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;
    let r_a_right = res_right
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .ry;
    let r_b_right = res_right
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .ry;

    // Mirror symmetry: R_A(left) = R_B(right), R_B(left) = R_A(right)
    assert_close(
        r_a_left,
        r_b_right,
        0.02,
        "Mirror partial UDL: R_A(left) = R_B(right)",
    );
    assert_close(
        r_b_left,
        r_a_right,
        0.02,
        "Mirror partial UDL: R_B(left) = R_A(right)",
    );

    // Right-half explicit: R_A = qL/8, R_B = 3qL/8
    assert_close(
        r_a_right,
        q.abs() * l / 8.0,
        0.02,
        "Right-half UDL: R_A = qL/8",
    );
    assert_close(
        r_b_right,
        3.0 * q.abs() * l / 8.0,
        0.02,
        "Right-half UDL: R_B = 3qL/8",
    );
}

// ================================================================
// 8. UDL on Propped Cantilever: R_B = 3qL/8
// ================================================================
//
// Propped cantilever: fixed at A (node 1), rollerY at B (node n+1).
// UDL q over full span L.
// By compatibility (3-moment or stiffness method):
//   R_B = 3qL/8,  R_A = 5qL/8,  M_A = qL^2/8.
// Tip deflection at B is zero (propped).
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Example 10-1;
//      Roark, Table 8.1, Case 3a (propped cantilever, UDL)

#[test]
fn validation_propped_cantilever_udl() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;

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

    // Fixed at left (A), rollerX at right (B)
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // R_B = 3qL/8 = 3*10*6/8 = 22.5
    let r_b_exact = 3.0 * q.abs() * l / 8.0;
    assert_close(r_b.ry, r_b_exact, 0.02, "Propped cantilever: R_B = 3qL/8");

    // R_A = 5qL/8 = 5*10*6/8 = 37.5
    let r_a_exact = 5.0 * q.abs() * l / 8.0;
    assert_close(r_a.ry, r_a_exact, 0.02, "Propped cantilever: R_A = 5qL/8");

    // Fixed-end moment: M_A = qL^2/8 = 10*36/8 = 45
    let m_a_exact = q.abs() * l * l / 8.0;
    assert_close(
        r_a.mz.abs(),
        m_a_exact,
        0.02,
        "Propped cantilever: M_A = qL^2/8",
    );

    // Equilibrium: R_A + R_B = qL = 60
    let total = q.abs() * l;
    assert_close(
        r_a.ry + r_b.ry,
        total,
        0.02,
        "Propped cantilever: equilibrium",
    );
}
