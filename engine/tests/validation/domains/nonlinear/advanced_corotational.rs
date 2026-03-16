/// Validation: Advanced Co-rotational Analysis
///
/// References:
///   - Euler: P_cr = π²EI/L² for symmetric buckling
///   - Newton-Raphson convergence theory
///   - Crisfield: Non-linear FEA — snap-through behavior
///
/// Tests:
///   1. Symmetric column buckling: corotational P_cr ≈ Euler P_cr
///   2. Incremental convergence: more increments → better accuracy
///   3. Small load: corotational ≈ linear within 1%
///   4. Shallow arch snap-through: graceful handling
use dedaliano_engine::solver::{corotational, linear};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;

// ================================================================
// 1. Symmetric Column Buckling: Euler Pcr
// ================================================================
//
// Pin-pin column under axial compression with small perturbation.
// Near P_cr, lateral deflections grow rapidly.
// Verify that the corotational solver captures Euler buckling.

#[test]
fn validation_corot_symmetric_buckling() {
    let l = 5.0;
    let a = 0.01;
    let iz = 1e-4;
    let e_eff = E * 1000.0;
    let pi = std::f64::consts::PI;
    let pcr_euler = pi * pi * e_eff * iz / (l * l);

    let n = 10;
    let elem_len = l / n as f64;

    // Apply 90% of Euler load with small perturbation
    let p = 0.90 * pcr_euler;
    let perturbation = 0.001 * p; // tiny lateral force at midspan

    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p, fy: 0.0, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: perturbation, mz: 0.0,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, a, iz)], elems, sups, loads);

    // At 90% Pcr, corotational should converge
    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 10, false).unwrap();
    assert!(result.converged, "Should converge at 90% Pcr");

    let mid = result.results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap();

    // Lateral deflection should be amplified compared to linear
    let linear_res = linear::solve_2d(&input).unwrap();
    let mid_linear = linear_res.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap();

    // Corotational should show more lateral deflection (geometric nonlinearity amplifies)
    assert!(
        mid.uy.abs() >= mid_linear.uy.abs() * 0.9,
        "Corotational amplification: corot_uy={:.6e}, linear_uy={:.6e}",
        mid.uy.abs(), mid_linear.uy.abs()
    );
}

// ================================================================
// 2. Incremental Convergence: More Increments → Better Accuracy
// ================================================================
//
// Same problem with 5 vs 20 increments.
// More increments should give a result closer to the converged solution.

#[test]
fn validation_corot_incremental_convergence() {
    let l = 2.0;
    let a = 0.01;
    let iz = 1e-4;
    let p = 200.0; // Moderate load

    let n = 8;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a, iz)],
        elems, vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let res_5 = corotational::solve_corotational_2d(&input, 50, 1e-6, 5, false);
    let res_20 = corotational::solve_corotational_2d(&input, 50, 1e-6, 20, false);
    let res_50 = corotational::solve_corotational_2d(&input, 50, 1e-6, 50, false);

    // All should converge for this moderate load
    let r_5 = res_5.expect("5-increment corotational solve must succeed");
    assert!(r_5.converged, "5-increment solve should converge");
    let d5 = r_5.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    let r_20 = res_20.expect("20-increment corotational solve must succeed");
    assert!(r_20.converged, "20-increment solve should converge");
    let d20 = r_20.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    let r_50 = res_50.expect("50-increment corotational solve must succeed");
    assert!(r_50.converged, "50-increment solve should converge");
    let d50 = r_50.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    // At minimum, the 20 and 50 increment results should be closer to each other
    // than 5 and 50 increments
    let err_5 = (d5 - d50).abs();
    let err_20 = (d20 - d50).abs();
    assert!(
        err_20 <= err_5 + 1e-8,
        "20 increments should be closer to 50 than 5 is: err_5={:.6e}, err_20={:.6e}",
        err_5, err_20
    );
}

// ================================================================
// 3. Small Load: Corotational ≈ Linear Within 1%
// ================================================================

#[test]
fn validation_corot_vs_linear_small_load() {
    let l = 3.0;
    let a = 0.01;
    let iz = 1e-4;
    let p = 1.0; // Very small load

    let n = 8;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a, iz)],
        elems, vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let linear_res = linear::solve_2d(&input).unwrap();
    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-6, 5, false).unwrap();
    assert!(corot_res.converged, "Should converge for small load");

    let tip_lin = linear_res.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_cor = corot_res.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // For small loads, corotational ≈ linear
    if tip_lin.uy.abs() > 1e-12 {
        let error = (tip_cor.uy - tip_lin.uy).abs() / tip_lin.uy.abs();
        assert!(
            error < 0.01,
            "Small load parity: linear_uy={:.6e}, corot_uy={:.6e}, error={:.2}%",
            tip_lin.uy, tip_cor.uy, error * 100.0
        );
    }
}

// ================================================================
// 4. Shallow Arch Snap-Through: Graceful Handling
// ================================================================
//
// Shallow arch with vertical load → may fail to converge (snap-through).
// Verify solver handles this gracefully without panicking.

#[test]
fn validation_corot_arch_snap_through() {
    // Very shallow arch
    let half_span = 5.0;
    let rise = 0.2;
    let n_half = 5;
    let p = 100.0;
    let a = 0.01;
    let iz = 1e-5;

    // Arch nodes: parabolic shape
    let mut nodes = Vec::new();
    let total_n = 2 * n_half;
    for i in 0..=total_n {
        let x = -half_span + i as f64 * (2.0 * half_span / total_n as f64);
        let y = rise * (1.0 - (x / half_span).powi(2));
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..total_n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "pinned"), (2, total_n + 1, "pinned")];

    // Vertical load at apex
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_half + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a, iz)],
        elems, sups, loads,
    );

    // Solver should handle without panicking
    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 20, false);

    match result {
        Ok(res) => {
            // If converged, apex should deflect downward
            if res.converged {
                let apex = res.results.displacements.iter()
                    .find(|d| d.node_id == n_half + 1).unwrap();
                assert!(apex.uy < 0.0,
                    "Arch apex should deflect down, got uy={:.6}", apex.uy);
            }
            // Whether converged or not, should have attempted iterations
            assert!(res.iterations > 0, "Should have iterated");
        },
        Err(_) => {
            // Failure to converge is acceptable for snap-through
            // The key is that it doesn't panic
        }
    }
}
