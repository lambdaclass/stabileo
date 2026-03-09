/// Validation: 3D P-Delta Analysis
///
/// Tests geometric nonlinearity (P-Δ effect) in 3D:
///   1. Cantilever column: P-delta amplification ≈ 1/(1-P/Pcr)
///   2. P-delta increases lateral displacement vs linear
///   3. Near-critical load: large amplification factor
///   4. Biaxial P-delta: compression + lateral loads in Y and Z
///   5. Convergence flag and iteration count
///   6. No P-delta effect under pure torsion
///
/// References:
///   - AISC 360 Appendix 8: Second-order analysis
///   - Chen & Lui, "Structural Stability", Ch. 4
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const E_EFF: f64 = E * 1000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;

// ================================================================
// 1. P-Delta Amplification: 1/(1-P/Pcr)
// ================================================================
//
// 3D cantilever column (along X), lateral load Fy + axial compression.
// Euler buckling: Pcr = π²·E·Iz/(4·L²)  [cantilever effective length = 2L]
// P-delta amplification factor AF ≈ 1/(1-P/Pcr) for moderate P/Pcr.

#[test]
fn validation_3d_pdelta_amplification() {
    let l: f64 = 5.0;
    let n = 8;
    let h_load: f64 = 5.0; // lateral load in Y

    let pcr = std::f64::consts::PI.powi(2) * E_EFF * IZ / (4.0 * l.powi(2));

    for &p_ratio in &[0.1, 0.2] {
        let p_axial = -(p_ratio * pcr);

        let input = make_3d_beam(
            n, l, E, NU, A, IY, IZ, J,
            vec![true, true, true, true, true, true], // fixed
            None,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n + 1, fx: p_axial, fy: h_load, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            })],
        );

        let pd_res = pdelta::solve_pdelta_3d(&input, 30, 1e-5).unwrap();

        let lin_uy = pd_res.linear_results.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap().uy;
        let pd_uy = pd_res.results.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap().uy;

        // P-delta should increase displacement
        assert!(
            pd_uy.abs() >= lin_uy.abs() * 0.99,
            "P-delta should increase displacement at P/Pcr={:.2}: pd={:.6e} vs lin={:.6e}",
            p_ratio, pd_uy, lin_uy
        );

        // Amplification factor ≈ 1/(1-P/Pcr)
        let af_expected = 1.0 / (1.0 - p_ratio);
        if lin_uy.abs() > 1e-12 {
            let af_actual = pd_uy / lin_uy;
            assert!(
                (af_actual - af_expected).abs() / af_expected < 0.30,
                "P-delta AF: actual={:.3}, expected={:.3} at P/Pcr={:.2}",
                af_actual, af_expected, p_ratio
            );
        }
    }
}

// ================================================================
// 2. P-Delta vs Linear: Displacement Increase
// ================================================================
//
// Under axial compression, P-delta always gives larger lateral
// displacement than linear analysis.

#[test]
fn validation_3d_pdelta_larger_than_linear() {
    let l: f64 = 4.0;
    let n = 6;
    let pcr = std::f64::consts::PI.powi(2) * E_EFF * IZ / (4.0 * l.powi(2));
    let p_axial = -(0.15 * pcr);
    let h_load = 10.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p_axial, fy: h_load, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let pd_res = pdelta::solve_pdelta_3d(&input, 30, 1e-5).unwrap();

    let lin_uy = pd_res.linear_results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;
    let pd_uy = pd_res.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    assert!(
        pd_uy.abs() > lin_uy.abs() * 1.01,
        "P-delta displacement={:.6e} should be larger than linear={:.6e}",
        pd_uy.abs(), lin_uy.abs()
    );
}

// ================================================================
// 3. Near-Critical Load: Large Amplification
// ================================================================
//
// At P/Pcr = 0.7, AF should be ≈ 3.3

#[test]
fn validation_3d_pdelta_near_critical() {
    let l: f64 = 5.0;
    let n = 8;
    let pcr = std::f64::consts::PI.powi(2) * E_EFF * IZ / (4.0 * l.powi(2));
    let p_axial = -(0.7 * pcr);

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p_axial, fy: 1.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let pd_res = pdelta::solve_pdelta_3d(&input, 50, 1e-5).unwrap();

    let lin_uy = pd_res.linear_results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;
    let pd_uy = pd_res.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    if lin_uy.abs() > 1e-12 {
        let af = pd_uy / lin_uy;
        assert!(
            af > 2.0,
            "Near-critical P-delta: AF={:.3}, should be > 2.0", af
        );
    }
}

// ================================================================
// 4. Biaxial P-Delta: Compression + Y + Z Lateral Loads
// ================================================================
//
// Both Y and Z displacements should be amplified by P-delta.

#[test]
fn validation_3d_pdelta_biaxial() {
    let l: f64 = 5.0;
    let n = 8;
    let pcr_y = std::f64::consts::PI.powi(2) * E_EFF * IZ / (4.0 * l.powi(2));
    let pcr_z = std::f64::consts::PI.powi(2) * E_EFF * IY / (4.0 * l.powi(2));
    let pcr_min = pcr_y.min(pcr_z);
    let p_axial = -(0.15 * pcr_min);

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p_axial, fy: 5.0, fz: 3.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let pd_res = pdelta::solve_pdelta_3d(&input, 30, 1e-5).unwrap();

    let lin_tip = pd_res.linear_results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let pd_tip = pd_res.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Both Y and Z should be amplified
    assert!(
        pd_tip.uy.abs() >= lin_tip.uy.abs() * 0.99,
        "Biaxial P-delta: uy amplified: pd={:.6e} vs lin={:.6e}",
        pd_tip.uy.abs(), lin_tip.uy.abs()
    );
    assert!(
        pd_tip.uz.abs() >= lin_tip.uz.abs() * 0.99,
        "Biaxial P-delta: uz amplified: pd={:.6e} vs lin={:.6e}",
        pd_tip.uz.abs(), lin_tip.uz.abs()
    );
}

// ================================================================
// 5. Convergence and Iteration Tracking
// ================================================================
//
// For moderate load levels, P-delta should converge within few iterations.

#[test]
fn validation_3d_pdelta_convergence() {
    let l: f64 = 5.0;
    let n = 6;
    let pcr = std::f64::consts::PI.powi(2) * E_EFF * IZ / (4.0 * l.powi(2));
    let p_axial = -(0.1 * pcr);

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p_axial, fy: 10.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let pd_res = pdelta::solve_pdelta_3d(&input, 30, 1e-5).unwrap();

    assert!(pd_res.converged, "P-delta should converge at P/Pcr=0.1");
    assert!(pd_res.iterations <= 15, "Should converge in ≤15 iterations, took {}", pd_res.iterations);
    assert!(pd_res.is_stable, "Structure should be stable at P/Pcr=0.1");
}

// ================================================================
// 6. No Amplification Without Axial Load
// ================================================================
//
// Without axial compression, P-delta should give same result as linear.

#[test]
fn validation_3d_pdelta_no_axial_equals_linear() {
    let l: f64 = 5.0;
    let n = 6;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 10.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let lin_res = linear::solve_3d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_3d(&input, 30, 1e-5).unwrap();

    let lin_uy = lin_res.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;
    let pd_uy = pd_res.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    // Without axial load, P-delta = linear
    if lin_uy.abs() > 1e-12 {
        let ratio = pd_uy / lin_uy;
        assert!(
            (ratio - 1.0).abs() < 0.05,
            "No axial: P-delta/linear ratio={:.4}, should be ≈1.0", ratio
        );
    }
}

// ================================================================
// 7. Portal Frame P-Delta: B2 Factor
// ================================================================
//
// 3D portal frame with gravity + lateral load.
// B2 factor should be > 1.0 under gravity compression.

#[test]
fn validation_3d_pdelta_portal_b2_factor() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let gravity = -100.0; // kN per beam node
    let lateral = 10.0;   // kN lateral

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, h, 0.0),
        (3, w, h, 0.0),
        (4, w, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];

    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: lateral, fy: gravity, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: gravity, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    let pd_res = pdelta::solve_pdelta_3d(&input, 30, 1e-5).unwrap();

    assert!(pd_res.converged, "Portal P-delta should converge");
    assert!(pd_res.b2_factor >= 1.0, "B2 factor should be ≥ 1.0, got {:.4}", pd_res.b2_factor);

    // Lateral displacement should be amplified
    let lin_ux = pd_res.linear_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pd_res.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    assert!(
        pd_ux.abs() >= lin_ux.abs() * 0.99,
        "Portal sway amplified: pd={:.6e} vs lin={:.6e}",
        pd_ux.abs(), lin_ux.abs()
    );
}
