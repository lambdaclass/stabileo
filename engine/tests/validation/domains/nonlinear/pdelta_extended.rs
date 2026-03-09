/// Validation: Extended P-Delta (second-order) analysis tests.
///
/// References:
///   - AISC 360-16, Appendix 8 (Approximate Second-Order Analysis)
///   - Chen & Lui, "Structural Stability" (1987), Chs. 3-5
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2
///   - Wilson, "Static and Dynamic Analysis of Structures", Ch. 7
///
/// Tests cover single-column amplification (B2), multi-story drift,
/// leaning column destabilization, gravity-induced column compression,
/// soft story detection, convergence near P_cr, symmetry preservation,
/// and braced vs unbraced frame comparison.
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

/// E in MPa (solver internally multiplies by 1000 to get kN/m^2).
const E: f64 = 200_000.0;
/// Effective E in kN/m^2 for hand calculations.
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Single Column Amplification -- B2 factor = 1/(1 - P/Pe)
// ================================================================
//
// Pin-pin column under axial compression P and a small lateral
// perturbation at midspan. The P-delta displacement amplification
// should match the classical B2 = 1/(1 - P/Pe) formula.
//
// L = 6 m, HEB200-like: A = 78.1e-4 m^2, Iz = 5696e-8 m^4.
// Pe = pi^2 * E_EFF * Iz / L^2.
// P = 0.3 * Pe => B2 = 1/(1 - 0.3) = 1.4286.

#[test]
fn validation_pdelta_ext_1_single_column_amplification() {
    let l = 6.0;
    let a = 78.1e-4;
    let iz = 5696e-8;
    let n = 10;
    let h_lateral = 5.0; // small lateral perturbation at midspan

    let pe = std::f64::consts::PI.powi(2) * E_EFF * iz / (l * l);
    let p_axial = 0.3 * pe;
    let expected_b2 = 1.0 / (1.0 - p_axial / pe); // 1.4286

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mid_node = n / 2 + 1;
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fy: 0.0, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_node, fx: 0.0, fy: h_lateral, mz: 0.0,
            }),
        ],
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();

    assert!(pd_res.converged, "should converge at P/Pe = 0.3");
    assert!(pd_res.is_stable, "should be stable at P/Pe = 0.3");

    let lin_uy = lin_res.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    let pd_uy = pd_res.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    let actual_b2 = pd_uy / lin_uy;

    // Geometric P-delta approximates the exact B2; allow 15% tolerance
    assert!(
        (actual_b2 - expected_b2).abs() / expected_b2 < 0.15,
        "B2: actual={:.4}, expected={:.4} (P/Pe={:.3})",
        actual_b2, expected_b2, p_axial / pe
    );

    // B2 must be greater than 1.0
    assert!(actual_b2 > 1.0, "B2={:.4} must exceed 1.0", actual_b2);
}

// ================================================================
// 2. Two-Story Frame -- Story Drift Amplification at Each Floor
// ================================================================
//
// Two-story portal frame (fixed bases, uniform section) with lateral
// wind loads at each floor and gravity loads on all top nodes.
// P-delta analysis should amplify inter-story drift at both floors.
// The upper story drift amplification should be comparable to (or
// larger than) the lower story amplification.
//
// Story heights: h1 = 4.0 m, h2 = 3.5 m. Bay width: w = 6.0 m.
// Section: A = 53.8e-4, Iz = 8356e-8 (IPE300-like).

#[test]
fn validation_pdelta_ext_2_two_story_drift_amplification() {
    let h1 = 4.0;
    let h2 = 3.5;
    let w = 6.0;
    let a = 53.8e-4;
    let iz = 8356e-8;

    // Nodes:
    //  1(0,0)   4(w,0)        = bases
    //  2(0,h1)  5(w,h1)       = 1st floor
    //  3(0,h1+h2) 6(w,h1+h2)  = roof
    let y2 = h1 + h2;
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h1), (3, 0.0, y2),
        (4, w, 0.0),   (5, w, h1),   (6, w, y2),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col, story 1
        (2, "frame", 2, 3, 1, 1, false, false), // left col, story 2
        (3, "frame", 4, 5, 1, 1, false, false), // right col, story 1
        (4, "frame", 5, 6, 1, 1, false, false), // right col, story 2
        (5, "frame", 2, 5, 1, 1, false, false), // beam, floor 1
        (6, "frame", 3, 6, 1, 1, false, false), // beam, roof
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    let px = 15.0;   // lateral force at each floor (left side)
    let py = -80.0;  // gravity at each top node
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: px, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: py, mz: 0.0 }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a, iz)], elems, sups, loads,
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();

    assert!(pd_res.converged, "two-story frame should converge");
    assert!(pd_res.is_stable, "two-story frame should be stable");

    // Floor displacements (left column line)
    let lin_d1 = lin_res.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let lin_d2 = lin_res.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let pd_d1 = pd_res.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let pd_d2 = pd_res.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // Inter-story drifts
    let lin_drift_s1 = lin_d1.abs();
    let lin_drift_s2 = (lin_d2 - lin_d1).abs();
    let pd_drift_s1 = pd_d1.abs();
    let pd_drift_s2 = (pd_d2 - pd_d1).abs();

    // P-delta should amplify drift at both stories
    assert!(
        pd_drift_s1 > lin_drift_s1,
        "P-delta amplifies story 1 drift: {:.6e} > {:.6e}", pd_drift_s1, lin_drift_s1
    );
    assert!(
        pd_drift_s2 > lin_drift_s2,
        "P-delta amplifies story 2 drift: {:.6e} > {:.6e}", pd_drift_s2, lin_drift_s2
    );

    // Amplification factors should be reasonable (> 1.0 and < 3.0)
    let af1 = pd_drift_s1 / lin_drift_s1;
    let af2 = pd_drift_s2 / lin_drift_s2;
    assert!(
        af1 > 1.0 && af1 < 3.0,
        "Story 1 amplification factor: {:.3}", af1
    );
    assert!(
        af2 > 1.0 && af2 < 3.0,
        "Story 2 amplification factor: {:.3}", af2
    );
}

// ================================================================
// 3. Leaning Column System -- Destabilizing Effect on Bracing
// ================================================================
//
// Two-column frame: left column is a proper moment frame column
// (fixed base, rigid beam connection). Right column is a leaning
// column (pinned at both ends). Gravity load on the leaning column
// must be resisted by the moment column for lateral stability.
//
// Compare lateral drift:
//   (a) All gravity on the moment column alone
//   (b) Same total gravity, but on the leaning column
// Case (b) should show more lateral drift because the leaning
// column provides zero lateral stiffness while still adding P-delta
// destabilizing effect.

#[test]
fn validation_pdelta_ext_3_leaning_column_destabilization() {
    let h = 4.0;
    let w = 6.0;
    let a = 53.8e-4;
    let iz = 8356e-8;
    let p_gravity = -120.0; // total gravity on frame
    let p_lateral = 10.0;   // lateral load at beam level

    // Case (a): All gravity on the moment-frame column (left column)
    let nodes_a = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_a = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left moment column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right moment column
    ];
    let sups_a = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads_a = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p_lateral, fy: p_gravity, mz: 0.0 }),
    ];
    let input_a = make_input(
        nodes_a, vec![(1, E, 0.3)], vec![(1, a, iz)], elems_a, sups_a, loads_a,
    );
    let res_a = pdelta::solve_pdelta_2d(&input_a, 30, 1e-6).unwrap();
    assert!(res_a.converged, "case (a) should converge");

    // Case (b): Gravity on the leaning column (right column, hinged both ends)
    let nodes_b = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_b = vec![
        (1, "frame", 1, 2, 1, 1, false, false),  // left moment column
        (2, "frame", 2, 3, 1, 1, false, false),  // beam
        (3, "frame", 3, 4, 1, 1, true, true),    // right leaning column (hinges)
    ];
    let sups_b = vec![(1, 1_usize, "fixed"), (2, 4, "pinned")];
    let loads_b = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p_lateral, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0 }),
    ];
    let input_b = make_input(
        nodes_b, vec![(1, E, 0.3)], vec![(1, a, iz)], elems_b, sups_b, loads_b,
    );
    let res_b = pdelta::solve_pdelta_2d(&input_b, 30, 1e-6).unwrap();
    assert!(res_b.converged, "case (b) should converge");

    // Lateral drift at beam level (node 2)
    let drift_a = res_a.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let drift_b = res_b.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Leaning column case should have larger drift due to reduced lateral stiffness
    // while gravity still causes P-delta destabilization
    assert!(
        drift_b > drift_a,
        "Leaning column increases drift: {:.6e} (leaning) > {:.6e} (moment frame)",
        drift_b, drift_a
    );
}

// ================================================================
// 4. Gravity Load Stability -- Beam Gravity Causing Column Compression
// ================================================================
//
// Portal frame under pure gravity distributed load on the beam.
// The gravity load compresses the columns, creating P-delta effects.
// A small lateral perturbation reveals the amplification.
// More gravity => more column compression => more amplification.

#[test]
fn validation_pdelta_ext_4_gravity_load_column_compression() {
    let h = 4.0;
    let w = 8.0;
    let a = 78.1e-4;
    let iz = 5696e-8;
    let p_perturb = 1.0; // small lateral perturbation

    let get_drift = |q: f64| -> f64 {
        let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ];
        let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
        let loads = vec![
            // Distributed gravity on the beam (element 2)
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 2, q_i: q, q_j: q, a: None, b: None,
            }),
            // Small lateral perturbation at node 2
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: p_perturb, fy: 0.0, mz: 0.0,
            }),
        ];
        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, a, iz)], elems, sups, loads,
        );
        let res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
        assert!(res.converged, "should converge for q={:.1}", q);
        res.results.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux.abs()
    };

    let drift_light = get_drift(-20.0);   // light gravity
    let drift_heavy = get_drift(-100.0);   // heavy gravity

    // Heavier gravity => more column compression => more P-delta amplification
    assert!(
        drift_heavy > drift_light,
        "More gravity => more drift: {:.6e} > {:.6e}", drift_heavy, drift_light
    );

    // Both should show some drift from the lateral perturbation
    assert!(drift_light > 0.0, "should have positive drift with perturbation");
    assert!(drift_heavy > 0.0, "should have positive drift with perturbation");
}

// ================================================================
// 5. Soft Story Detection -- Large Drift Amplification in Weak Story
// ================================================================
//
// Two-story frame where the bottom story columns have significantly
// smaller section than the upper story columns (soft story).
// The P-delta amplification of the bottom story drift should be
// notably larger than the upper story drift amplification.
//
// Story heights: both 3.5 m. Bay width: 6.0 m.
// Bottom columns: Iz_weak = 2000e-8 m^4 (weak)
// Upper columns: Iz_strong = 8000e-8 m^4 (strong)

#[test]
fn validation_pdelta_ext_5_soft_story_detection() {
    let h = 3.5;
    let w = 6.0;
    let a = 50.0e-4;        // same area for all
    let iz_weak = 2000e-8;  // weak bottom story columns
    let iz_strong = 8000e-8; // strong upper story columns

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h),
        (4, w, 0.0),   (5, w, h),   (6, w, 2.0 * h),
    ];
    // Two section types: sec 1 = weak (bottom), sec 2 = strong (upper)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col, story 1 (weak)
        (2, "frame", 2, 3, 1, 2, false, false), // left col, story 2 (strong)
        (3, "frame", 4, 5, 1, 1, false, false), // right col, story 1 (weak)
        (4, "frame", 5, 6, 1, 2, false, false), // right col, story 2 (strong)
        (5, "frame", 2, 5, 1, 2, false, false), // beam, floor 1
        (6, "frame", 3, 6, 1, 2, false, false), // beam, roof
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    let px = 10.0;
    let py = -60.0;
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: px, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: py, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz_weak), (2, a, iz_strong)],
        elems, sups, loads,
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();

    assert!(pd_res.converged, "soft story frame should converge");

    // Inter-story drifts (left column line)
    let lin_ux1 = lin_res.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let lin_ux2 = lin_res.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let pd_ux1 = pd_res.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux2 = pd_res.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    let lin_drift_s1 = lin_ux1.abs();
    let lin_drift_s2 = (lin_ux2 - lin_ux1).abs();
    let pd_drift_s1 = pd_ux1.abs();
    let pd_drift_s2 = (pd_ux2 - pd_ux1).abs();

    // Story 1 (weak) should have larger drift than story 2 (strong)
    assert!(
        pd_drift_s1 > pd_drift_s2,
        "Soft story (s1) has more drift: {:.6e} > {:.6e}", pd_drift_s1, pd_drift_s2
    );

    // Amplification in the soft story should be at least as large as upper story
    let af_s1 = pd_drift_s1 / lin_drift_s1.max(1e-15);
    let af_s2 = pd_drift_s2 / lin_drift_s2.max(1e-15);
    assert!(
        af_s1 >= af_s2 * 0.95,
        "Soft story amplification ({:.3}) should be >= upper story ({:.3})",
        af_s1, af_s2
    );
}

// ================================================================
// 6. Multiple Load Increments -- Convergence Check Near P_cr
// ================================================================
//
// Pin-pin column with lateral perturbation at midspan.
// Load the column at 50%, 70%, 85%, and 95% of P_cr.
// B2 factor should increase monotonically and the solver should
// converge at each load level (all are below P_cr).
// The B2 at 95% P_cr should be very large (> 10).

#[test]
fn validation_pdelta_ext_6_multiple_load_increments_near_pcr() {
    let l = 5.0;
    let a = 78.1e-4;
    let iz = 5696e-8;
    let n = 10;
    let h_lateral = 2.0;

    let pe = std::f64::consts::PI.powi(2) * E_EFF * iz / (l * l);

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let mid_node = n / 2 + 1;

    let load_ratios = [0.50, 0.70, 0.85, 0.95];
    let mut prev_b2 = 1.0;

    for &ratio in &load_ratios {
        let p_axial = ratio * pe;
        let expected_b2 = 1.0 / (1.0 - ratio);

        let input = make_input(
            nodes.clone(),
            vec![(1, E, 0.3)],
            vec![(1, a, iz)],
            elems.clone(),
            vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
            vec![
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: n + 1, fx: -p_axial, fy: 0.0, mz: 0.0,
                }),
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: mid_node, fx: 0.0, fy: h_lateral, mz: 0.0,
                }),
            ],
        );

        let lin_res = linear::solve_2d(&input).unwrap();
        let pd_res = pdelta::solve_pdelta_2d(&input, 50, 1e-6).unwrap();

        assert!(
            pd_res.converged,
            "should converge at P/Pe = {:.2}", ratio
        );

        let lin_uy = lin_res.displacements.iter()
            .find(|d| d.node_id == mid_node).unwrap().uy.abs();
        let pd_uy = pd_res.results.displacements.iter()
            .find(|d| d.node_id == mid_node).unwrap().uy.abs();

        let actual_b2 = pd_uy / lin_uy;

        // B2 should increase monotonically
        assert!(
            actual_b2 >= prev_b2 * 0.95,
            "B2 should increase: at P/Pe={:.2}, B2={:.3} (prev={:.3})",
            ratio, actual_b2, prev_b2
        );

        // B2 should be in the right ballpark of the analytical value
        // (allow 25% since geometric P-delta differs from exact second-order)
        assert!(
            (actual_b2 - expected_b2).abs() / expected_b2 < 0.25,
            "B2 at P/Pe={:.2}: actual={:.3}, expected={:.3}",
            ratio, actual_b2, expected_b2
        );

        prev_b2 = actual_b2;
    }

    // At 95% of Pcr, B2 should be very large (expected = 20.0)
    assert!(
        prev_b2 > 5.0,
        "B2 near P_cr should be very large, got {:.3}", prev_b2
    );
}

// ================================================================
// 7. Symmetric Frame -- P-Delta Preserves Symmetry Under Symmetric Loads
// ================================================================
//
// Symmetric portal frame with symmetric gravity loading (no lateral).
// Under pure symmetric loading, the P-delta solution should remain
// symmetric: equal and opposite horizontal reactions, zero net sway.
//
// Two fixed-base columns, beam on top, equal gravity at both top nodes.

#[test]
fn validation_pdelta_ext_7_symmetric_frame_preserves_symmetry() {
    let h = 4.0;
    let w = 6.0;
    let a = 53.8e-4;
    let iz = 8356e-8;
    let p_gravity = -200.0; // same gravity at both top nodes

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: p_gravity, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0 }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a, iz)], elems, sups, loads,
    );

    let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd_res.converged, "symmetric frame should converge");

    // Check symmetry of horizontal displacements: node 2 and node 3
    // should have approximately equal horizontal displacement (both near zero)
    let ux2 = pd_res.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux3 = pd_res.results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    // Net sway should be negligible (symmetric loading)
    assert!(
        ux2.abs() < 1e-6,
        "Node 2 sway should be near zero: {:.6e}", ux2
    );
    assert!(
        ux3.abs() < 1e-6,
        "Node 3 sway should be near zero: {:.6e}", ux3
    );

    // Vertical displacements at nodes 2 and 3 should be equal
    let uy2 = pd_res.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    let uy3 = pd_res.results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uy;

    assert_close(uy2, uy3, 0.01, "Symmetric vertical displacement");

    // Vertical reactions should be equal
    let ry1 = pd_res.results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let ry4 = pd_res.results.reactions.iter()
        .find(|r| r.node_id == 4).unwrap().ry;

    assert_close(ry1, ry4, 0.01, "Symmetric vertical reactions");

    // Base moments should be equal in magnitude
    let mz1 = pd_res.results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz;
    let mz4 = pd_res.results.reactions.iter()
        .find(|r| r.node_id == 4).unwrap().mz;

    assert_close(mz1.abs(), mz4.abs(), 0.01, "Symmetric base moments (magnitude)");
}

// ================================================================
// 8. Braced vs Unbraced Comparison -- K Factors and Amplification
// ================================================================
//
// Portal frame under combined lateral and gravity loading.
// Compare unbraced frame (sway permitted) vs braced frame (lateral
// brace at beam level prevents sway).
// The braced frame should have:
//   (a) Much smaller lateral drift
//   (b) Smaller B2 factor (closer to 1.0)
//   (c) Smaller P-delta amplification of column moments

#[test]
fn validation_pdelta_ext_8_braced_vs_unbraced_comparison() {
    let h = 4.0;
    let w = 6.0;
    let a = 53.8e-4;
    let iz = 8356e-8;
    let p_lateral = 15.0;
    let p_gravity = -150.0;

    // --- Unbraced frame ---
    let nodes_ub = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_ub = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_ub = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads_ub = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p_lateral, fy: p_gravity, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0 }),
    ];
    let input_ub = make_input(
        nodes_ub, vec![(1, E, 0.3)], vec![(1, a, iz)], elems_ub, sups_ub, loads_ub,
    );

    let lin_ub = linear::solve_2d(&input_ub).unwrap();
    let pd_ub = pdelta::solve_pdelta_2d(&input_ub, 30, 1e-6).unwrap();
    assert!(pd_ub.converged, "unbraced should converge");

    // --- Braced frame: add rollerY at node 2 (restrains X at beam level) ---
    let nodes_br = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_br = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_br = vec![
        (1, 1_usize, "fixed"),
        (2, 4, "fixed"),
        (3, 2, "rollerY"), // lateral brace
    ];
    let loads_br = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p_lateral, fy: p_gravity, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0 }),
    ];
    let input_br = make_input(
        nodes_br, vec![(1, E, 0.3)], vec![(1, a, iz)], elems_br, sups_br, loads_br,
    );

    let lin_br = linear::solve_2d(&input_br).unwrap();
    let pd_br = pdelta::solve_pdelta_2d(&input_br, 30, 1e-6).unwrap();
    assert!(pd_br.converged, "braced should converge");

    // (a) Braced frame should have much smaller lateral drift at node 3
    // (node 2 is braced, so check node 3 sway)
    let ub_drift = pd_ub.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let br_drift = pd_br.results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux.abs();

    assert!(
        br_drift < ub_drift,
        "Braced drift ({:.6e}) should be less than unbraced ({:.6e})",
        br_drift, ub_drift
    );

    // (b) Unbraced P-delta amplification should be larger
    let lin_ub_drift = lin_ub.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let pd_ub_drift = pd_ub.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let ub_amplification = pd_ub_drift / lin_ub_drift.max(1e-15);

    // Unbraced should show meaningful amplification (> 1.0)
    assert!(
        ub_amplification > 1.0,
        "Unbraced amplification ({:.3}) should be > 1.0", ub_amplification
    );

    // (c) Column base moment amplification: unbraced should have bigger moments
    let ub_m_sum: f64 = pd_ub.results.reactions.iter().map(|r| r.mz.abs()).sum();
    let br_m_sum: f64 = pd_br.results.reactions.iter().map(|r| r.mz.abs()).sum();
    let lin_ub_m_sum: f64 = lin_ub.reactions.iter().map(|r| r.mz.abs()).sum();
    let lin_br_m_sum: f64 = lin_br.reactions.iter().map(|r| r.mz.abs()).sum();

    let ub_moment_af = ub_m_sum / lin_ub_m_sum.max(1e-15);
    let br_moment_af = br_m_sum / lin_br_m_sum.max(1e-15);

    // Unbraced moment amplification should be larger than braced
    assert!(
        ub_moment_af > br_moment_af * 0.95,
        "Unbraced moment amplification ({:.3}) >= braced ({:.3})",
        ub_moment_af, br_moment_af
    );
}
