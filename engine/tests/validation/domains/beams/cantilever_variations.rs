/// Validation: Cantilever Variations
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed., Ch. 9
///   - Roark's Formulas for Stress and Strain, 9th Ed., Table 8
///   - Beer & Johnston, "Mechanics of Materials", 8th Ed., Ch. 9
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 8
///
/// Tests verify deflections and reactions for various cantilever configurations:
///   1. Cantilever with intermediate load: deflection at tip and load point
///   2. Cantilever with two point loads: superposition
///   3. Short vs long cantilever: stiffness ratio ∝ 1/L³
///   4. Cantilever with UDL on partial span
///   5. Cantilever with end moment: parabolic deflection
///   6. Double cantilever (fixed at center, free both ends)
///   7. Cantilever deflection proportional to load P
///   8. Cantilever with triangular load from zero at fixed end to max at tip
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Cantilever with Intermediate Point Load: Tip and Load Deflections
// ================================================================
//
// Fixed cantilever of length L. Point load P at distance a from fixed end (a < L).
// Deflection at load point (x=a): δ_a = Pa³/(3EI)
// Deflection at tip (x=L): δ_L = Pa²(3L − a)/(6EI)
//
// Source: Roark's Formulas for Stress and Strain, 9th Ed., Table 8, Case 2.

#[test]
fn validation_cantilever_intermediate_load_deflections() {
    let l = 6.0;
    let n = 12; // 0.5m elements
    let a_frac = 2.0 / 3.0; // load at 2/3 of span
    let a = l * a_frac;
    let p = -20.0; // kN downward
    let e_eff = E * 1000.0;

    let load_node = (a_frac * n as f64).round() as usize + 1;

    let input = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node,
            fx: 0.0,
            fz: p,
            my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Deflection at load point: δ_a = |P|·a³/(3EI)
    let delta_a_exact = p.abs() * a.powi(3) / (3.0 * e_eff * IZ);
    let d_a = results.displacements.iter().find(|d| d.node_id == load_node).unwrap();
    let err_a = (d_a.uz.abs() - delta_a_exact).abs() / delta_a_exact;
    assert!(
        err_a < 0.02,
        "Load-point deflection: δ_a={:.6e}, exact Pa³/(3EI)={:.6e}, err={:.1}%",
        d_a.uz.abs(),
        delta_a_exact,
        err_a * 100.0
    );

    // Deflection at tip: δ_L = |P|·a²·(3L−a)/(6EI)
    let delta_l_exact = p.abs() * a * a * (3.0 * l - a) / (6.0 * e_eff * IZ);
    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let err_l = (d_tip.uz.abs() - delta_l_exact).abs() / delta_l_exact;
    assert!(
        err_l < 0.02,
        "Tip deflection: δ_L={:.6e}, exact Pa²(3L−a)/(6EI)={:.6e}, err={:.1}%",
        d_tip.uz.abs(),
        delta_l_exact,
        err_l * 100.0
    );
}

// ================================================================
// 2. Cantilever with Two Point Loads: Superposition
// ================================================================
//
// Two downward point loads P1 at a1 and P2 at a2 on a fixed cantilever.
// By superposition: δ_tip = P1·a1²·(3L−a1)/(6EI) + P2·a2²·(3L−a2)/(6EI)
//
// Source: Timoshenko & Gere, "Mechanics of Materials", 4th Ed., §9.3.

#[test]
fn validation_cantilever_two_loads_superposition() {
    let l = 8.0;
    let n = 8;
    let p1 = -10.0;
    let p2 = -15.0;
    let a1 = l * 0.5; // midspan
    let a2 = l * 0.75;
    let e_eff = E * 1000.0;

    let node1 = n / 2 + 1; // node at L/2
    let node2 = 3 * n / 4 + 1; // node at 3L/4

    // Combined load case
    let input_combined = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "fixed",
        None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node1,
                fx: 0.0,
                fz: p1,
                my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node2,
                fx: 0.0,
                fz: p2,
                my: 0.0,
            }),
        ],
    );
    let results_combined = linear::solve_2d(&input_combined).unwrap();
    let tip_combined = results_combined
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap()
        .uz;

    // Analytical tip deflection by superposition
    let d1 = p1.abs() * a1 * a1 * (3.0 * l - a1) / (6.0 * e_eff * IZ);
    let d2 = p2.abs() * a2 * a2 * (3.0 * l - a2) / (6.0 * e_eff * IZ);
    let delta_exact = d1 + d2;

    let err = (tip_combined.abs() - delta_exact).abs() / delta_exact;
    assert!(
        err < 0.02,
        "Two-load superposition: δ_tip={:.6e}, exact={:.6e}, err={:.1}%",
        tip_combined.abs(),
        delta_exact,
        err * 100.0
    );
}

// ================================================================
// 3. Short vs Long Cantilever: Stiffness Scales as 1/L³
// ================================================================
//
// For a cantilever with tip point load: δ = PL³/(3EI).
// Doubling L increases deflection by factor 8.
// Stiffness k = 3EI/L³ halves with each doubling.
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., §8.2.

#[test]
fn validation_cantilever_length_stiffness_ratio() {
    let l1 = 3.0;
    let l2 = 6.0; // double length
    let n = 6;
    let p = -10.0;

    let make_tip = |l: f64| -> f64 {
        let input = make_beam(
            n,
            l,
            E,
            A,
            IZ,
            "fixed",
            None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1,
                fx: 0.0,
                fz: p,
                my: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();
        results
            .displacements
            .iter()
            .find(|d| d.node_id == n + 1)
            .unwrap()
            .uz
            .abs()
    };

    let d1 = make_tip(l1);
    let d2 = make_tip(l2);

    // δ ∝ L³ → d2/d1 = (L2/L1)³ = 8
    let ratio = d2 / d1;
    let expected_ratio = (l2 / l1).powi(3);
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(
        err < 0.01,
        "Stiffness ratio: d2/d1={:.4}, expected (L2/L1)³={:.1}, err={:.1}%",
        ratio,
        expected_ratio,
        err * 100.0
    );
}

// ================================================================
// 4. Cantilever with UDL on Partial Span
// ================================================================
//
// Fixed cantilever of length L. UDL q over distance a from the fixed end.
// Tip deflection: δ_tip = q·a³·(4L − a)/(24EI)
//
// Source: Roark's Formulas for Stress and Strain, 9th Ed., Table 8, Case 4.

#[test]
fn validation_cantilever_partial_udl() {
    let l = 6.0;
    let n = 12;
    let q = -10.0; // kN/m
    let a_frac = 2.0 / 3.0;
    let a = l * a_frac;
    let e_eff = E * 1000.0;

    // Load only the first 2/3 of elements (from fixed end)
    let n_loaded = (a_frac * n as f64).round() as usize;
    let mut loads = Vec::new();
    for i in 0..n_loaded {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ_tip = q·a³·(4L − a) / (24EI)
    let delta_exact = q.abs() * a.powi(3) * (4.0 * l - a) / (24.0 * e_eff * IZ);
    let err = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        err < 0.03,
        "Partial UDL tip deflection: δ={:.6e}, exact={:.6e}, err={:.1}%",
        tip.uz.abs(),
        delta_exact,
        err * 100.0
    );
}

// ================================================================
// 5. Cantilever with End Moment: Parabolic Deflection
// ================================================================
//
// Fixed cantilever, moment M applied at free end.
// δ_tip = M·L²/(2EI), θ_tip = M·L/(EI)
// Deflection at x: δ(x) = M·x²/(2EI)   (parabolic)
//
// Source: Timoshenko & Gere, "Mechanics of Materials", 4th Ed., §9.3.

#[test]
fn validation_cantilever_end_moment() {
    let l = 5.0;
    let n = 10;
    let m = 50.0; // kN·m
    let e_eff = E * 1000.0;

    let input = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fz: 0.0,
            my: m,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ_tip = M·L²/(2EI)
    let delta_exact = m * l * l / (2.0 * e_eff * IZ);
    let err_d = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        err_d < 0.02,
        "End moment tip deflection: δ={:.6e}, exact ML²/(2EI)={:.6e}, err={:.1}%",
        tip.uz.abs(),
        delta_exact,
        err_d * 100.0
    );

    // θ_tip = M·L/(EI)
    let theta_exact = m * l / (e_eff * IZ);
    let err_t = (tip.ry.abs() - theta_exact).abs() / theta_exact;
    assert!(
        err_t < 0.02,
        "End moment tip rotation: θ={:.6e}, exact ML/(EI)={:.6e}, err={:.1}%",
        tip.ry.abs(),
        theta_exact,
        err_t * 100.0
    );

    // Midspan deflection should match parabolic profile: δ(L/2) = M·(L/2)²/(2EI)
    let mid = n / 2 + 1;
    let x_mid = l / 2.0;
    let delta_mid_exact = m * x_mid * x_mid / (2.0 * e_eff * IZ);
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let err_m = (d_mid.uz.abs() - delta_mid_exact).abs() / delta_mid_exact;
    assert!(
        err_m < 0.02,
        "End moment midspan: δ={:.6e}, exact Mx²/(2EI)={:.6e}, err={:.1}%",
        d_mid.uz.abs(),
        delta_mid_exact,
        err_m * 100.0
    );
}

// ================================================================
// 6. Double Cantilever: Fixed at Center, Free Both Ends
// ================================================================
//
// Beam of total length 2L, fixed at midpoint, free at both ends.
// Equal downward loads P at each tip. By symmetry, the fixed support
// carries 2P vertical and the bending moment at the fixed end = P·L.
//
// Tip deflection = PL³/(3EI) (each half is an independent cantilever).
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., §8.4.

#[test]
fn validation_double_cantilever_symmetric() {
    let l = 4.0; // half-length
    let n_half = 4;
    let n_total = 2 * n_half;
    let p = -10.0;
    let e_eff = E * 1000.0;

    // Build: nodes 1..n_total+1 along X, fixed at midpoint node n_half+1
    let total_len = 2.0 * l;
    let elem_len = total_len / n_total as f64;
    let nodes: Vec<_> = (0..=n_total)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_total)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mid_node = n_half + 1;
    let sups = vec![(1, mid_node, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: 0.0,
            fz: p,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_total + 1,
            fx: 0.0,
            fz: p,
            my: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Tip deflections: each tip deflects like independent cantilever of length L
    let delta_exact = p.abs() * l.powi(3) / (3.0 * e_eff * IZ);

    let d_left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_right = results
        .displacements
        .iter()
        .find(|d| d.node_id == n_total + 1)
        .unwrap();

    let err_left = (d_left.uz.abs() - delta_exact).abs() / delta_exact;
    let err_right = (d_right.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        err_left < 0.02,
        "Double cantilever left tip: δ={:.6e}, exact PL³/(3EI)={:.6e}, err={:.1}%",
        d_left.uz.abs(),
        delta_exact,
        err_left * 100.0
    );
    assert!(
        err_right < 0.02,
        "Double cantilever right tip: δ={:.6e}, exact PL³/(3EI)={:.6e}, err={:.1}%",
        d_right.uz.abs(),
        delta_exact,
        err_right * 100.0
    );

    // Vertical reaction at center = 2P (upward)
    let r_center = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let ry_expected = -2.0 * p; // upward = positive when loads are downward (negative)
    let err_ry = (r_center.rz - ry_expected).abs() / ry_expected.abs();
    assert!(
        err_ry < 0.01,
        "Double cantilever center reaction: Ry={:.4}, expected={:.4}",
        r_center.rz,
        ry_expected
    );
}

// ================================================================
// 7. Cantilever Deflection Proportional to Load P
// ================================================================
//
// For linear elastic cantilever: δ_tip ∝ P (linearity/proportionality).
// Doubling P should double deflection.
//
// Source: Beer & Johnston, "Mechanics of Materials", 8th Ed., §9.2.

#[test]
fn validation_cantilever_linear_proportionality() {
    let l = 5.0;
    let n = 5;
    let p_base = -10.0;
    let p_double = -20.0;

    let make_tip = |p: f64| -> f64 {
        let input = make_beam(
            n,
            l,
            E,
            A,
            IZ,
            "fixed",
            None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1,
                fx: 0.0,
                fz: p,
                my: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();
        results
            .displacements
            .iter()
            .find(|d| d.node_id == n + 1)
            .unwrap()
            .uz
    };

    let d1 = make_tip(p_base);
    let d2 = make_tip(p_double);

    // d2/d1 must equal p_double/p_base = 2.0
    let ratio = d2 / d1;
    let expected = p_double / p_base;
    let err = (ratio - expected).abs() / expected.abs();
    assert!(
        err < 1e-10,
        "Proportionality: d2/d1={:.8}, expected P2/P1={:.1}", ratio, expected
    );
}

// ================================================================
// 8. Cantilever with Triangular Load: Zero at Fixed End, Max at Tip
// ================================================================
//
// Load linearly varying from 0 at fixed end to q_max at free tip.
// Tip deflection: δ_tip = 11·q_max·L⁴/(120EI)
//
// Source: Roark's Formulas for Stress and Strain, 9th Ed., Table 8, Case 3e.

#[test]
fn validation_cantilever_triangular_load_increasing() {
    let l = 6.0;
    let n = 12;
    let q_max = -10.0;
    let e_eff = E * 1000.0;

    // Triangular load: 0 at fixed end (i=0), q_max at free tip (i=n)
    let mut loads = Vec::new();
    for i in 0..n {
        let xi = i as f64 / n as f64;
        let xj = (i + 1) as f64 / n as f64;
        let qi = q_max * xi;
        let qj = q_max * xj;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ_tip = 11·q_max·L⁴/(120EI)
    let delta_exact = 11.0 * q_max.abs() * l.powi(4) / (120.0 * e_eff * IZ);
    let err = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        err < 0.03,
        "Increasing triangular: tip={:.6e}, exact 11qL⁴/(120EI)={:.6e}, err={:.1}%",
        tip.uz.abs(),
        delta_exact,
        err * 100.0
    );
}
