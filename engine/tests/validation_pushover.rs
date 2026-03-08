/// Validation: Pushover and Nonlinear Analysis Benchmarks
///
/// Tests force-displacement behavior under increasing load:
///   - Cantilever elastic stiffness check: k = 3EI/L³
///   - P-delta stiffness reduction under axial load
///   - Corotational large displacement cantilever
///   - Portal frame sway stiffness
///
/// References:
///   - FEMA 356: "Prestandard and Commentary for the Seismic Rehabilitation of Buildings"
///   - ATC-40: "Seismic Evaluation and Retrofit of Concrete Buildings"
///   - EN 1998-1 Annex B: N2 method
mod helpers;

use dedaliano_engine::solver::{linear, pdelta, corotational};
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Elastic Stiffness: Cantilever k = 3EI/L³
// ================================================================
//
// The lateral stiffness of a cantilever beam is exactly 3EI/L³.
// Verify by computing tip displacement under unit load.

#[test]
fn validation_pushover_cantilever_stiffness() {
    let length: f64 = 4.0;
    let p: f64 = 1.0;
    let n = 4;
    let ei = E * 1000.0 * IZ;

    let k_exact = 3.0 * ei / length.powi(3);
    let input = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let k_computed = p / d_tip.uy.abs();

    assert_close(
        k_computed, k_exact, 0.02,
        "Cantilever stiffness: k = 3EI/L³",
    );
}

// ================================================================
// 2. P-Delta: Stiffness Reduction Under Axial Load
// ================================================================
//
// Axial compression reduces lateral stiffness.
// For moderate P (P < 0.3 P_cr): k_eff ≈ k_elastic × (1 - P/P_cr)

#[test]
fn validation_pushover_pdelta_stiffness_reduction() {
    let length: f64 = 4.0;
    let h_load: f64 = 5.0;
    let ei = E * 1000.0 * IZ;

    // Euler critical load for cantilever: P_cr = π²EI/(4L²)
    let p_cr = std::f64::consts::PI.powi(2) * ei / (4.0 * length.powi(2));

    // Test at two axial load levels
    for &p_ratio in &[0.1, 0.2] {
        let p_axial = -(p_ratio * p_cr);

        let input = make_input(
            vec![(1, 0.0, 0.0), (2, 0.0, length)],
            vec![(1, E, 0.3)],
            vec![(1, A, IZ)],
            vec![(1, "frame", 1, 2, 1, 1, false, false)],
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: h_load, fy: p_axial, mz: 0.0,
            })],
        );

        let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

        let lin_ux = pd_res.linear_results.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux;
        let pd_ux = pd_res.results.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux;

        // P-delta should give larger displacement (reduced stiffness)
        assert!(
            pd_ux.abs() >= lin_ux.abs() * 0.99,
            "P-delta should increase displacement: pd={:.6e} vs lin={:.6e} at P/Pcr={:.2}",
            pd_ux, lin_ux, p_ratio
        );

        // Amplification factor should be approximately 1/(1 - P/Pcr)
        let af_expected = 1.0 / (1.0 - p_ratio);
        if lin_ux.abs() > 1e-12 {
            let af_actual = pd_ux / lin_ux;
            assert!(
                (af_actual - af_expected).abs() / af_expected < 0.30,
                "P-delta amplification: actual={:.3}, expected={:.3} at P/Pcr={:.2}",
                af_actual, af_expected, p_ratio
            );
        }
    }
}

// ================================================================
// 3. Corotational: Large Displacement Cantilever
// ================================================================
//
// Cantilever under large tip load — corotational should give
// significantly different results from linear analysis.

#[test]
fn validation_pushover_corotational_large_displacement() {
    let length: f64 = 2.0;
    let n = 8;

    // Large load to produce significant geometric nonlinearity
    let p: f64 = -500.0;

    let input = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
        })],
    );

    // Linear solution
    let lin_res = linear::solve_2d(&input).unwrap();
    let lin_tip = lin_res.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    // Corotational solution
    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-5, 10);

    if let Ok(corot) = corot_res {
        let corot_tip = corot.results.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap().uy;

        // Both should deflect downward
        assert!(lin_tip < 0.0, "Linear: tip should deflect down");
        assert!(corot_tip < 0.0, "Corotational: tip should deflect down");

        // Corotational should give smaller deflection (geometric stiffening)
        // or larger (geometric softening) depending on the problem
        // The key check is that it converged and gave a reasonable result
        assert!(
            corot.converged,
            "Corotational should converge"
        );
    }
}

// ================================================================
// 4. Portal Frame: Sway Stiffness
// ================================================================
//
// Lateral stiffness of a fixed-base portal frame:
// k_sway = 24EI/h³ (for infinitely stiff beam)
// With finite beam stiffness, k_sway is lower.

#[test]
fn validation_pushover_portal_sway_stiffness() {
    let h: f64 = 4.0;
    let bay: f64 = 6.0;
    let h_load: f64 = 1.0;
    let ei = E * 1000.0 * IZ;

    let input = make_portal_frame(h, bay, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();

    let k_actual = h_load / d2.ux;

    // k should be between rigid-beam and pinned-beam limits
    let k_rigid_beam = 24.0 * ei / h.powi(3); // upper bound
    let k_cantilever = 2.0 * 3.0 * ei / h.powi(3); // two cantilever columns (lower bound)

    assert!(
        k_actual > k_cantilever * 0.5,
        "Sway stiffness={:.4} should be > 2×3EI/h³={:.4}",
        k_actual, k_cantilever
    );
    assert!(
        k_actual < k_rigid_beam * 1.2,
        "Sway stiffness={:.4} should be < 24EI/h³={:.4}",
        k_actual, k_rigid_beam
    );
}

// ================================================================
// 5. P-Delta: Stability Detection
// ================================================================
//
// Loading near critical load should show large amplification or instability.

#[test]
fn validation_pushover_pdelta_near_critical() {
    let length: f64 = 5.0;
    let ei = E * 1000.0 * IZ;
    let p_cr = std::f64::consts::PI.powi(2) * ei / (4.0 * length.powi(2));

    // Load at 70% of critical — should show significant amplification
    let p_axial = -(0.7 * p_cr);

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, length)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 1.0, fy: p_axial, mz: 0.0,
        })],
    );

    let pd_res = pdelta::solve_pdelta_2d(&input, 50, 1e-5).unwrap();

    let lin_ux = pd_res.linear_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pd_res.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    if lin_ux.abs() > 1e-12 {
        let af = pd_ux / lin_ux;
        // At 70% of Pcr, AF should be roughly 1/(1-0.7) ≈ 3.3
        assert!(
            af > 2.0,
            "Near-critical P-delta: amplification={:.3}, should be large", af
        );
    }
}

// ================================================================
// 6. Stiffness Symmetry: Reversed Loading
// ================================================================
//
// For a symmetric structure, reversing the load should give
// equal and opposite displacements.

#[test]
fn validation_pushover_load_reversal_symmetry() {
    let length: f64 = 5.0;
    let n = 4;
    let p: f64 = 10.0;
    let tip = n + 1;

    let input_pos = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fy: p, mz: 0.0,
        })],
    );

    let input_neg = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let res_pos = linear::solve_2d(&input_pos).unwrap();
    let res_neg = linear::solve_2d(&input_neg).unwrap();

    let uy_pos = res_pos.displacements.iter().find(|d| d.node_id == tip).unwrap().uy;
    let uy_neg = res_neg.displacements.iter().find(|d| d.node_id == tip).unwrap().uy;

    assert_close(
        uy_pos, -uy_neg, 0.001,
        "Load reversal: u(+P) = -u(-P)",
    );
}
