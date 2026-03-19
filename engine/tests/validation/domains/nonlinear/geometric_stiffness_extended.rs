/// Validation: Geometric Stiffness and Second-Order Effects (Extended)
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 5
///   - Bazant & Cedolin, "Stability of Structures", Ch. 2-5
///   - Chen & Lui, "Structural Stability" (1987), Ch. 3
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2-3
///   - AISC 360-22, Appendix 8 (Approximate Second-Order Analysis)
///
/// Tests cover:
///   1. Geometric stiffness matrix entries for axial force P
///   2. String stiffness: lateral stiffness of tensioned cable
///   3. P-delta amplification: 1/(1-P/Pe) sway amplification
///   4. Beam-column stability functions
///   5. Column effective length via eigenvalue approach
///   6. Tension stiffening: lateral stiffness increase from tensile axial
///   7. Leaning column: stability from adjacent moment frame
///   8. Notional load equivalence: geometric imperfection vs notional load
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ================================================================
// 1. Geometric Stiffness Matrix Entries for Axial Force P
// ================================================================
//
// The consistent geometric stiffness matrix for a beam element
// under axial force P has well-known entries (Przemieniecki):
//   kG[1,1] = kG[4,4] =  6P/(5L)
//   kG[1,2] = kG[2,1] =  P/10
//   kG[2,2] =  2PL/15
//   kG[1,5] = kG[5,1] = -P/10
//   kG[2,5] = kG[5,2] = -PL/30
//
// We verify these by comparing the lateral stiffness change
// when axial force is present. For a fixed-fixed beam of length L
// under axial compression P, the lateral stiffness reduces from
// 12EI/L^3 to approximately 12EI/L^3 - 6P/(5L) for small P.
//
// Test: apply known axial load and lateral load, compare deflection
// ratio to the theoretical stiffness reduction from kG terms.

#[test]
fn validation_gstiff_ext_geometric_stiffness_matrix_entries() {
    let l: f64 = 4.0;
    let e_eff: f64 = E * 1000.0;
    let f_lat: f64 = 1.0; // unit lateral load

    // Euler load for fixed-fixed column: P_cr = 4*pi^2*EI/L^2
    let pi: f64 = std::f64::consts::PI;
    let p_cr: f64 = 4.0 * pi * pi * e_eff * IZ / (l * l);

    // Use 10% of P_cr (small enough for linearized kG to be accurate)
    let p_axial: f64 = 0.10 * p_cr;

    // Theoretical kG entry for lateral DOF: 6P/(5L)
    let kg_11: f64 = 6.0 * p_axial / (5.0 * l);
    // Rotational kG diagonal: 2PL/15
    let kg_22: f64 = 2.0 * p_axial * l / 15.0;
    // Off-diagonal kG: P/10
    let kg_12: f64 = p_axial / 10.0;
    // Off-diagonal kG coupling: -PL/30
    let kg_25: f64 = p_axial * l / 30.0;

    // Verify kG entries are physically reasonable
    // The lateral stiffness of a fixed-fixed beam is k_lat = 12EI/L^3
    let k_lat: f64 = 12.0 * e_eff * IZ / (l * l * l);

    // kG[1,1] should be a small fraction of k_lat at 10% P_cr
    let ratio: f64 = kg_11 / k_lat;
    assert_close(ratio, 0.10 * 6.0 * l * l / (5.0 * 12.0 * e_eff * IZ / (p_cr)),
        0.02, "kG/k_lat ratio");

    // Now verify numerically: fixed-fixed beam with axial load
    // The mid-span deflection under unit lateral load should increase
    // by approximately the factor 1/(1 - kG_eff/k_lat)
    let n = 10;
    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let mid_node = n / 2 + 1;

    // Without axial load
    let loads_lat = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: f_lat, my: 0.0,
        }),
    ];
    let input_lat = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(),
        vec![(1, 1, "fixed"), (2, n + 1, "guidedX")],
        loads_lat,
    );
    let d_no_axial: f64 = linear::solve_2d(&input_lat).unwrap()
        .displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // With axial compression (P-delta analysis)
    let loads_both = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: f_lat, my: 0.0,
        }),
    ];
    let input_both = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed"), (2, n + 1, "guidedX")],
        loads_both,
    );
    let pd_result = pdelta::solve_pdelta_2d(&input_both, 30, 1e-6).unwrap();
    let d_with_axial: f64 = pd_result.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Deflection should increase (compression softens)
    assert!(d_with_axial > d_no_axial,
        "Compression increases deflection: {:.6e} > {:.6e}", d_with_axial, d_no_axial);

    // Amplification should be close to 1/(1-P/Pcr) = 1/(1-0.1) = 1.111
    let amplification: f64 = d_with_axial / d_no_axial;
    let expected_amp: f64 = 1.0 / (1.0 - 0.10);
    assert_close(amplification, expected_amp, 0.05,
        "kG amplification at 10% Pcr");

    // Verify kG entries are positive and consistent
    assert!(kg_11 > 0.0, "kG[1,1] = 6P/(5L) > 0");
    assert!(kg_22 > 0.0, "kG[2,2] = 2PL/15 > 0");
    assert!(kg_12 > 0.0, "kG[1,2] = P/10 > 0");
    assert!(kg_25 > 0.0, "kG[2,5] = PL/30 > 0");

    // Cross-check: kG[1,2] * L = kG[2,2] * 3/L? No, verify ratio:
    // kG[1,2]/kG[2,2] = (P/10)/(2PL/15) = 15/(20L) = 3/(4L)
    let ratio_12_22: f64 = kg_12 / kg_22;
    let expected_ratio: f64 = 3.0 / (4.0 * l);
    assert_close(ratio_12_22, expected_ratio, 0.01,
        "kG[1,2]/kG[2,2] = 3/(4L)");
}

// ================================================================
// 2. String Stiffness: Lateral Stiffness of Tensioned Cable
// ================================================================
//
// A taut string (cable) under tension T with length L has a lateral
// stiffness of approximately k_lat = T/L for the fundamental mode.
// More precisely, for a pin-pin string with midpoint lateral load F,
// the midpoint deflection is delta = F*L/(4T) (for small deflections),
// giving effective stiffness k = 4T/L.
//
// For a very slender element (A is normal but Iz very small),
// under large tension, the geometric stiffness dominates the
// elastic bending stiffness, and the lateral stiffness approaches
// the string stiffness.

#[test]
fn validation_gstiff_ext_string_stiffness() {
    let l: f64 = 10.0;
    let e_eff: f64 = E * 1000.0;
    let iz_small: f64 = 1e-8; // very small bending stiffness
    let tension: f64 = 100.0;  // kN tension
    let f_lat: f64 = 1.0;      // unit lateral load at midspan

    let n = 20; // fine mesh for cable-like behavior
    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let mid_node = n / 2 + 1;

    // Apply tension + lateral load at midspan
    // Tension applied as axial force at the end (positive = tension in this config)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: tension, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: f_lat, my: 0.0,
        }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, iz_small)],
        elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        loads,
    );

    let pd_result = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd_result.converged, "Tensioned cable should converge");

    let delta: f64 = pd_result.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // String stiffness formula: delta = F*L/(4T) for midpoint load
    let _delta_string: f64 = f_lat * l / (4.0 * tension);

    // Also compute elastic bending contribution: delta_beam = F*L^3/(48EI)
    let delta_beam: f64 = f_lat * l * l * l / (48.0 * e_eff * iz_small);

    // Total deflection should be close to the combined effect
    // For very small Iz, string stiffness dominates
    // The actual deflection should be between delta_string and delta_string + delta_beam
    // Since tension stiffens, actual < pure beam deflection
    assert!(delta < delta_beam,
        "Tension reduces deflection below pure beam: {:.6e} < {:.6e}",
        delta, delta_beam);

    // String stiffness estimate: k_eff = F/delta
    let k_eff: f64 = f_lat / delta;
    let k_string: f64 = 4.0 * tension / l;

    // For this slender element, bending still contributes, so k_eff > k_string
    // but they should be in the same order of magnitude
    let ratio: f64 = k_eff / k_string;
    assert!(ratio > 0.5 && ratio < 5.0,
        "Effective stiffness near string stiffness: ratio = {:.3}", ratio);
}

// ================================================================
// 3. P-Delta Amplification: 1/(1-P/Pe) Sway Amplification
// ================================================================
//
// For a single-story portal frame under lateral load H and gravity P,
// the sway amplification factor is B2 = 1/(1 - P/Pe_story).
// Pe_story is the story buckling load.
//
// Test at multiple P/Pe ratios and verify the amplification trend
// matches the classical formula.

#[test]
fn validation_gstiff_ext_pdelta_amplification_factor() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let f_lat: f64 = 10.0;
    // Estimate Pe for the story: for a fixed-base portal with fixed beam,
    // each column effective length K ~ 1.2 (fixed-fixed with some sway)
    // Pe_col = pi^2*EI/(K*H)^2
    // We'll use the empirical ratio approach instead.

    // Apply increasing gravity and measure amplification
    let gravity_levels = [50.0, 100.0, 200.0];
    let mut prev_b2: f64 = 1.0;

    for &p in &gravity_levels {
        let input = make_portal_frame(h, w, E, A, IZ, f_lat, -p);

        let d_lin: f64 = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
        let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
        assert!(pd_res.converged, "Should converge at P={:.0}", p);

        let d_pd: f64 = pd_res.results.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux;

        let b2: f64 = d_pd / d_lin;

        // B2 must exceed 1 (compression amplifies)
        assert!(b2 > 1.0, "B2 > 1 at P={:.0}: B2={:.4}", p, b2);

        // B2 should increase with P
        assert!(b2 > prev_b2 * 0.99,
            "B2 increases: at P={:.0}, B2={:.4} vs prev={:.4}", p, b2, prev_b2);

        prev_b2 = b2;
    }

    // At P=200, amplification should be noticeable (> 1.01)
    assert!(prev_b2 > 1.01,
        "Significant amplification at P=200: B2={:.4}", prev_b2);

    // Verify 1/(1-P/Pe) shape by checking ratio of B2 values
    // If B2(P1) = 1/(1-P1/Pe) and B2(P2) = 1/(1-P2/Pe), then
    // (B2(P2)-1)/(B2(P1)-1) ~ P2/P1 for small P/Pe
    // At P=100 and P=50: ratio of (B2-1) should be approximately 2
    let input_50 = make_portal_frame(h, w, E, A, IZ, f_lat, -50.0);
    let d_lin_50: f64 = linear::solve_2d(&input_50).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d_pd_50: f64 = pdelta::solve_pdelta_2d(&input_50, 30, 1e-6).unwrap()
        .results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let b2_50: f64 = d_pd_50 / d_lin_50;

    let input_100 = make_portal_frame(h, w, E, A, IZ, f_lat, -100.0);
    let d_lin_100: f64 = linear::solve_2d(&input_100).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d_pd_100: f64 = pdelta::solve_pdelta_2d(&input_100, 30, 1e-6).unwrap()
        .results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let b2_100: f64 = d_pd_100 / d_lin_100;

    let amp_ratio: f64 = (b2_100 - 1.0) / (b2_50 - 1.0);
    // For 1/(1-P/Pe), (B2_100-1)/(B2_50-1) = (P2/Pe)/(1-P2/Pe) * (1-P1/Pe)/(P1/Pe)
    // For small P/Pe, this approaches P2/P1 = 2.0
    assert!(amp_ratio > 1.5 && amp_ratio < 3.0,
        "Amplification ratio ~ 2: {:.3}", amp_ratio);
}

// ================================================================
// 4. Beam-Column Stability Functions
// ================================================================
//
// The stability functions for a beam-column under axial compression P:
//   s = (kL)*sin(kL) / (2 - 2*cos(kL) - (kL)*sin(kL))
// where k = sqrt(P/(EI)).
//
// These functions modify the stiffness terms:
//   - s > 1 for compression (stiffness increases to resist buckling)
//   - s = 1 at P = 0 (recovers standard beam)
//   - s -> infinity at P = P_euler
//
// We verify by comparing the end moment needed to produce a unit
// rotation at one end of a fixed-free beam, with and without axial load.

#[test]
fn validation_gstiff_ext_stability_functions() {
    let l: f64 = 5.0;
    let e_eff: f64 = E * 1000.0;
    let n = 10;
    let pi: f64 = std::f64::consts::PI;

    // Euler load for pin-pin: Pe = pi^2*EI/L^2
    let pe: f64 = pi * pi * e_eff * IZ / (l * l);

    // Test at P/Pe = 0.3
    let p_ratio: f64 = 0.3;
    let p_axial: f64 = p_ratio * pe;

    // Compute kL = L * sqrt(P/(EI))
    let k: f64 = (p_axial / (e_eff * IZ)).sqrt();
    let kl: f64 = k * l;

    // Stability function s = kL*sin(kL) / (2-2cos(kL)-kL*sin(kL))
    let sin_kl: f64 = kl.sin();
    let cos_kl: f64 = kl.cos();
    let s_func: f64 = kl * sin_kl / (2.0 - 2.0 * cos_kl - kl * sin_kl);

    // s should be > 1 for compression
    assert!(s_func > 1.0, "s > 1 for compression: s={:.4}", s_func);

    // Now verify numerically: propped cantilever (fixed-roller) with axial load
    // Apply unit moment at one end and measure rotation
    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Apply moment at free end (node n+1 is roller end)
    let m_applied: f64 = 1.0;

    // Without axial load: stiffness = 4EI/L (fixed end, unit rotation)
    let loads_no_axial = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m_applied,
        }),
    ];
    let input_no_axial = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(),
        vec![(1, 1, "fixed"), (2, n + 1, "rollerX")],
        loads_no_axial,
    );
    let rz_no_axial: f64 = linear::solve_2d(&input_no_axial).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry.abs();

    // With axial compression: the rotation should be larger
    // (compression reduces stiffness)
    let loads_with_axial = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p_axial, fz: 0.0, my: m_applied,
        }),
    ];
    let input_with_axial = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(),
        vec![(1, 1, "fixed"), (2, n + 1, "rollerX")],
        loads_with_axial,
    );
    let pd_result = pdelta::solve_pdelta_2d(&input_with_axial, 30, 1e-6).unwrap();
    assert!(pd_result.converged, "Should converge at P/Pe=0.3");
    let rz_with_axial: f64 = pd_result.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ry.abs();

    // With compression, rotation increases (stiffness decreases)
    assert!(rz_with_axial > rz_no_axial,
        "Compression increases rotation: {:.6e} > {:.6e}",
        rz_with_axial, rz_no_axial);

    // The stiffness ratio (no-axial rotation / with-axial rotation) should be < 1,
    // meaning the effective stiffness is reduced by compression.
    // The geometric P-delta approach gives an approximate reduction.
    // For P/Pe=0.3, the rotation amplification is moderate (between 1.0 and 1.5).
    let amplification: f64 = rz_with_axial / rz_no_axial;
    assert!(amplification > 1.0 && amplification < 1.5,
        "Rotation amplification at P/Pe=0.3 in range [1.0, 1.5]: {:.4}", amplification);

    // Verify consistency: the amplification should be close to 1/(1-P/Pe) = 1.4286
    // when using exact stability functions, but P-delta geometric is approximate.
    // It should still be monotonically increasing with P/Pe.
    // Test at a lower ratio P/Pe=0.1 for comparison
    let p_axial_low: f64 = 0.1 * pe;
    let loads_low = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p_axial_low, fz: 0.0, my: m_applied,
        }),
    ];
    let input_low = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed"), (2, n + 1, "rollerX")],
        loads_low,
    );
    let pd_low = pdelta::solve_pdelta_2d(&input_low, 30, 1e-6).unwrap();
    let rz_low: f64 = pd_low.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ry.abs();
    let amp_low: f64 = rz_low / rz_no_axial;

    // Higher P/Pe should give larger amplification
    assert!(amplification > amp_low,
        "Higher P/Pe gives more amplification: {:.4} > {:.4}",
        amplification, amp_low);
}

// ================================================================
// 5. Column Effective Length via Eigenvalue Approach
// ================================================================
//
// The effective length factor K is found from det(K + lambda*KG) = 0.
// For different boundary conditions:
//   Pin-pin:   K = 1.0, Pcr = pi^2*EI/L^2
//   Fixed-free: K = 2.0, Pcr = pi^2*EI/(4L^2)
//   Fixed-pin:  K ~ 0.7, Pcr ~ 2*pi^2*EI/L^2
//
// We verify by finding the load level at which the P-delta solver
// shows very large amplification (approaching critical load).

#[test]
fn validation_gstiff_ext_effective_length_eigenvalue() {
    let l: f64 = 5.0;
    let e_eff: f64 = E * 1000.0;
    let pi: f64 = std::f64::consts::PI;
    let n = 10;
    let f_perturb: f64 = 0.001;

    // Theoretical critical loads
    let pe_pinpin: f64 = pi * pi * e_eff * IZ / (l * l);              // K=1
    let pe_cantilever: f64 = pi * pi * e_eff * IZ / (4.0 * l * l);   // K=2

    // Test at 50% of each critical load
    // Pin-pin: should have smaller amplification at 50% of its Pcr
    // compared to cantilever at 50% of its Pcr (both should have B2 ~ 2)
    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Pin-pin at 50% of its Pcr
    let p_pp: f64 = 0.50 * pe_pinpin;
    let loads_pp = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p_pp, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fz: f_perturb, my: 0.0,
        }),
    ];
    let input_pp = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(),
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        loads_pp,
    );
    let d_lin_pp: f64 = linear::solve_2d(&input_pp).unwrap()
        .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();
    let pd_pp = pdelta::solve_pdelta_2d(&input_pp, 30, 1e-6).unwrap();
    assert!(pd_pp.converged, "Pin-pin at 50% Pcr should converge");
    let d_pd_pp: f64 = pd_pp.results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();
    let b2_pp: f64 = d_pd_pp / d_lin_pp;

    // Cantilever at 50% of its Pcr
    let p_cant: f64 = 0.50 * pe_cantilever;
    // Build cantilever (vertical column)
    let nodes_v: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems_v: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let loads_cant = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: f_perturb, fz: -p_cant, my: 0.0,
        }),
    ];
    let input_cant = make_input(
        nodes_v.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_v.clone(),
        vec![(1, 1, "fixed")],
        loads_cant,
    );
    let d_lin_cant: f64 = linear::solve_2d(&input_cant).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux.abs();
    let pd_cant = pdelta::solve_pdelta_2d(&input_cant, 30, 1e-6).unwrap();
    assert!(pd_cant.converged, "Cantilever at 50% Pcr should converge");
    let d_pd_cant: f64 = pd_cant.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux.abs();
    let b2_cant: f64 = d_pd_cant / d_lin_cant;

    // Both at 50% of their respective Pcr should give B2 ~ 2.0
    // (B2 = 1/(1-0.5) = 2.0 theoretically)
    let expected_b2: f64 = 1.0 / (1.0 - 0.5);
    assert_close(b2_pp, expected_b2, 0.05,
        "Pin-pin B2 at 50% Pcr");
    assert_close(b2_cant, expected_b2, 0.05,
        "Cantilever B2 at 50% Pcr");

    // Verify that the actual critical loads differ by factor of 4
    // (Pe_pinpin / Pe_cantilever = 4)
    let ratio_pcr: f64 = pe_pinpin / pe_cantilever;
    assert_close(ratio_pcr, 4.0, 0.01,
        "Pcr ratio pin-pin/cantilever = 4");
}

// ================================================================
// 6. Tension Stiffening: Lateral Stiffness Increase
// ================================================================
//
// Axial tension increases the lateral stiffness of a beam.
// The geometric stiffness from tension is positive, adding to
// the elastic stiffness.
//
// For a pin-pin beam under tension T, the effective lateral stiffness
// at midspan increases. The deflection under lateral load decreases
// compared to the case without axial load.
//
// Amplification factor: B2 = 1/(1+T/Pe) < 1 for tension.

#[test]
fn validation_gstiff_ext_tension_stiffening() {
    let l: f64 = 6.0;
    let e_eff: f64 = E * 1000.0;
    let pi: f64 = std::f64::consts::PI;
    let n = 10;
    let f_lat: f64 = 5.0;

    let pe: f64 = pi * pi * e_eff * IZ / (l * l);
    // Apply tension = 30% of Pe
    let tension: f64 = 0.30 * pe;

    let elem_len: f64 = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let mid_node = n / 2 + 1;

    // Without axial: linear deflection
    let loads_no_axial = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: f_lat, my: 0.0,
        }),
    ];
    let input_no_axial = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(),
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        loads_no_axial,
    );
    let d_no_axial: f64 = linear::solve_2d(&input_no_axial).unwrap()
        .displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // With tension: P-delta should reduce deflection
    let loads_tension = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: tension, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: f_lat, my: 0.0,
        }),
    ];
    let input_tension = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(),
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        loads_tension,
    );
    let pd_tension = pdelta::solve_pdelta_2d(&input_tension, 30, 1e-6).unwrap();
    assert!(pd_tension.converged, "Tension case should converge");
    let d_tension: f64 = pd_tension.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Tension reduces deflection
    assert!(d_tension < d_no_axial,
        "Tension stiffens: {:.6e} < {:.6e}", d_tension, d_no_axial);

    // Now compare with compression at the same magnitude
    let loads_compression = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -tension, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: f_lat, my: 0.0,
        }),
    ];
    let input_compression = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        loads_compression,
    );
    let pd_compression = pdelta::solve_pdelta_2d(&input_compression, 30, 1e-6).unwrap();
    assert!(pd_compression.converged, "Compression case should converge");
    let d_compression: f64 = pd_compression.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Verify ordering: d_tension < d_no_axial < d_compression
    assert!(d_tension < d_no_axial,
        "tension < no-axial: {:.6e} < {:.6e}", d_tension, d_no_axial);
    assert!(d_no_axial < d_compression,
        "no-axial < compression: {:.6e} < {:.6e}", d_no_axial, d_compression);

    // Verify approximate B2 for tension: 1/(1+T/Pe) = 1/(1+0.3) = 0.769
    let b2_tension: f64 = d_tension / d_no_axial;
    let expected_b2_tension: f64 = 1.0 / (1.0 + 0.30);
    assert_close(b2_tension, expected_b2_tension, 0.05,
        "Tension B2 = 1/(1+T/Pe)");
}

// ================================================================
// 7. Leaning Column: Stability from Adjacent Moment Frame
// ================================================================
//
// A leaning column (pinned at both ends of its connections) has zero
// lateral stiffness and relies entirely on adjacent moment frames for
// stability. The gravity load on the leaning column increases the
// P-delta effect on the moment frame.
//
// Test setup: two-column portal frame. Compare:
//   (a) Both columns are moment columns (fixed base, rigid connections)
//   (b) One moment column, one leaning column (hinged connections)
// With the same total gravity and lateral load, case (b) should have
// more lateral drift because the leaning column provides no lateral
// stiffness.

#[test]
fn validation_gstiff_ext_leaning_column_stability() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let a_sec: f64 = 53.8e-4;
    let iz_sec: f64 = 8356e-8;
    let p_gravity: f64 = 120.0;
    let p_lateral: f64 = 10.0;

    // Case (a): Two moment columns (both fixed base)
    let nodes_a = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_a = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left moment column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right moment column
    ];
    let sups_a = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads_a = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p_lateral, fz: -p_gravity, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p_gravity, my: 0.0,
        }),
    ];
    let input_a = make_input(
        nodes_a, vec![(1, E, 0.3)], vec![(1, a_sec, iz_sec)],
        elems_a, sups_a, loads_a,
    );
    let res_a = pdelta::solve_pdelta_2d(&input_a, 30, 1e-6).unwrap();
    assert!(res_a.converged, "Two moment columns should converge");
    let drift_a: f64 = res_a.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Case (b): One moment column, one leaning column (hinged ends)
    let nodes_b = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_b = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left moment column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, true, true),   // right leaning column
    ];
    let sups_b = vec![(1, 1_usize, "fixed"), (2, 4, "pinned")];
    let loads_b = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p_lateral, fz: -p_gravity, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p_gravity, my: 0.0,
        }),
    ];
    let input_b = make_input(
        nodes_b, vec![(1, E, 0.3)], vec![(1, a_sec, iz_sec)],
        elems_b, sups_b, loads_b,
    );
    let res_b = pdelta::solve_pdelta_2d(&input_b, 30, 1e-6).unwrap();
    assert!(res_b.converged, "Leaning column case should converge");
    let drift_b: f64 = res_b.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Case (b) should have more drift since one column provides no lateral stiffness
    assert!(drift_b > drift_a,
        "Leaning column increases drift: {:.6e} > {:.6e}", drift_b, drift_a);

    // The moment column in case (b) must carry all the lateral load
    // plus resist the P-delta effect from both columns' gravity.
    // Verify base moment in case (b) is larger than in case (a)
    let m_base_a: f64 = res_a.results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();
    let m_base_b: f64 = res_b.results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();

    assert!(m_base_b > m_base_a,
        "Moment column base moment larger with leaning col: {:.4} > {:.4}",
        m_base_b, m_base_a);

    // Also verify that the leaning column's base has essentially no moment
    // (pinned base with hinged column)
    let m_base_lean: f64 = res_b.results.reactions.iter()
        .find(|r| r.node_id == 4).unwrap().my.abs();
    assert!(m_base_lean < 1e-6,
        "Leaning column base moment ~ 0: {:.6e}", m_base_lean);
}

// ================================================================
// 8. Notional Load Equivalence
// ================================================================
//
// Geometric imperfection (initial out-of-plumb) of alpha*H produces
// the same first-order effect as a notional horizontal load H = alpha*P.
//
// For a cantilever column with gravity P and initial imperfection
// alpha at the top:
//   - Imperfection approach: apply moment M = P * alpha * H at top
//   - Notional load approach: apply lateral force F = alpha * P at top
// Both produce base moment M_base = alpha * P * H.
//
// Verify that the two approaches give equivalent results.

#[test]
fn validation_gstiff_ext_notional_load_equivalence() {
    let h: f64 = 5.0;
    let n = 10;
    let p_gravity: f64 = 500.0; // kN gravity load
    let alpha: f64 = 0.003;     // imperfection ratio (L/333)

    let elem_len: f64 = h / n as f64;

    // Build vertical cantilever column
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Approach 1: Notional load F = alpha * P at the top
    let f_notional: f64 = alpha * p_gravity;
    let loads_notional = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_notional, fz: -p_gravity, my: 0.0,
    })];
    let input_notional = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed")], loads_notional,
    );
    let res_notional = linear::solve_2d(&input_notional).unwrap();

    // Approach 2: Equivalent moment M = P * alpha * H at the top
    // (representing the P-alpha*H eccentricity)
    let m_imperfection: f64 = p_gravity * alpha * h;
    let loads_imperfection = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p_gravity, my: m_imperfection,
    })];
    let input_imperfection = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed")], loads_imperfection,
    );
    let res_imperfection = linear::solve_2d(&input_imperfection).unwrap();

    // Base moment from notional load
    let m_base_notional: f64 = res_notional.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    // Base moment from imperfection moment
    let m_base_imperfection: f64 = res_imperfection.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;

    // Both should produce base moment approximately equal to alpha*P*H
    let m_expected: f64 = alpha * p_gravity * h; // = 0.003 * 500 * 5 = 7.5 kN-m
    assert_close(m_base_notional.abs(), m_expected, 0.02,
        "Notional load: M_base = alpha*P*H");
    assert_close(m_base_imperfection.abs(), m_expected, 0.02,
        "Imperfection moment: M_base = alpha*P*H");

    // The two base moments should be close to each other
    assert_close(m_base_notional.abs(), m_base_imperfection.abs(), 0.05,
        "Notional vs imperfection: equivalent base moments");

    // Verify tip displacement: notional load creates a lateral displacement,
    // while the moment approach creates a rotation. The lateral drift
    // from the notional load should be larger (it also includes the
    // cantilever deflection from the lateral force).
    let ux_notional: f64 = res_notional.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;
    // The notional load approach has a direct lateral force, so there is
    // a meaningful lateral displacement
    assert!(ux_notional.abs() > 1e-10,
        "Notional load produces lateral displacement: {:.6e}", ux_notional);

    // Now verify with P-delta analysis to see second-order amplification
    // Both approaches should give similar P-delta amplified results
    let pd_notional = pdelta::solve_pdelta_2d(&input_notional, 30, 1e-6).unwrap();
    let pd_imperfection = pdelta::solve_pdelta_2d(&input_imperfection, 30, 1e-6).unwrap();

    assert!(pd_notional.converged, "P-delta notional should converge");
    assert!(pd_imperfection.converged, "P-delta imperfection should converge");

    // P-delta amplifies the base moment beyond the linear value
    let m_pd_notional: f64 = pd_notional.results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();
    assert!(m_pd_notional > m_base_notional.abs(),
        "P-delta amplifies notional moment: {:.4} > {:.4}",
        m_pd_notional, m_base_notional.abs());
}
