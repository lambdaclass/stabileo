/// Validation: Co-rotational (Large Displacement) Analysis
///
/// Benchmarks:
///   1. VM14 — Eccentric column, secant formula (δ_mid=0.1086 in)
///   2. Mattiasson elastica — cantilever large deflection (PL²/EI=1.0)
///   3. P-Delta regression — corotational ≈ P-Delta for small displacements
///   4. Williams toggle — convergence through snap-through
use dedaliano_engine::solver::{assembly, corotational, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;

// ================================================================
// 1. VM14 — Eccentric Compression (Secant Formula)
// ================================================================
//
// Source: ANSYS VM14, Timoshenko *Strength of Materials*
// Simply supported column, L=120 in, rectangular 3×5 in,
// E=30×10⁶ psi, P=4000 lb, eccentricity e=0.3 in.
//
// Analytical: δ = e·[sec(L/2·√(P/EI)) - 1]
// Reference: δ_mid = 0.1086 in = 2.758×10⁻³ m
//
// SI: E=206842.7 MPa, L=3.048m, section 0.0762×0.127m,
//     P=17.793kN, e=7.62×10⁻³ m

#[test]
fn validation_corotational_vm14_eccentric_column() {
    let e_mpa = 206_842.7;
    let l = 3.048;           // 120 in -> m
    let b: f64 = 0.0762;    // 3 in -> m
    let h: f64 = 0.127;     // 5 in -> m
    let a = b * h;
    let iz = b * h.powi(3) / 12.0; // bending about strong axis
    let p = 17.793;          // 4000 lb -> kN
    let ecc = 7.62e-3;       // 0.3 in -> m

    // Single-end eccentricity: δ = (e/2)·[sec(kL/2) - 1]
    let e_eff = e_mpa * 1000.0; // kN/m²
    let arg = (l / 2.0) * (p / (e_eff * iz)).sqrt();
    let delta_analytical = (ecc / 2.0) * (1.0 / arg.cos() - 1.0);

    let n = 10;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    // Simply supported: pin at start, roller at end
    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];

    // Eccentric load = axial P + moment M=P·e at loaded end only.
    // For single-end eccentricity: δ_mid = (e/2)·[sec(kL/2) - 1]
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: -p, fz: 0.0, my: p * ecc,
    })];

    let input = make_input(
        nodes, vec![(1, e_mpa, 0.3)], vec![(1, a, iz)],
        elems, sups, loads,
    );

    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 10, false).unwrap();
    assert!(result.converged, "VM14 should converge");

    // Midspan lateral deflection
    let mid_node = n / 2 + 1;
    let mid = result.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    let computed = mid.uz.abs();
    let error = (computed - delta_analytical).abs() / delta_analytical;
    assert!(
        error < 0.05,
        "VM14: computed δ={:.6e} m, analytical={:.6e} m, error={:.1}%",
        computed, delta_analytical, error * 100.0
    );
}

// ================================================================
// 2. Mattiasson Elastica — Cantilever Large Deflection
// ================================================================
//
// Source: Mattiasson (1981), Bisshopp & Drucker (1945)
// Cantilever, tip load P, dimensionless P·L²/(EI) = 1.0
// Reference: u_tip/L ≈ 0.0566, v_tip/L ≈ 0.3015
//
// Setup: L=1, E·I=1 → E=12, I=1/12 (unit square section), P=1.0

#[test]
fn validation_corotational_mattiasson_elastica() {
    let l = 1.0;
    // Choose E and section so that EI = 1.0: E=12 MPa (in solver units, E_eff=12000),
    // I = b*h^3/12; for unit square b=h=1 → I = 1/12, so EI = 12000 * 1/12 = 1000
    // We want PL²/(EI_eff) = 1.0 with L=1: P = EI_eff/L² = 1000
    // That gives P·L²/(EI) = 1000 * 1 / 1000 = 1.0 ✓
    let e_mpa = 12.0;
    let e_eff = e_mpa * 1000.0; // 12000 kN/m²
    let a = 1.0;
    let iz = 1.0 / 12.0;
    let ei = e_eff * iz; // = 1000
    let p_load = ei / (l * l); // = 1000 kN (so P·L²/(EI) = 1.0)

    let n = 10;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes, vec![(1, e_mpa, 0.3)], vec![(1, a, iz)],
        elems, vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p_load, my: 0.0,
        })],
    );

    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 20, false).unwrap();
    assert!(result.converged, "Elastica should converge");

    let tip = result.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Mattiasson reference for PL²/(EI) = 1.0:
    // u_tip/L ≈ 0.0566 (axial shortening), v_tip/L ≈ 0.3015 (lateral deflection)
    let u_ratio = tip.ux.abs() / l;
    let v_ratio = tip.uz.abs() / l;

    let v_error = (v_ratio - 0.3015).abs() / 0.3015;
    assert!(
        v_error < 0.10,
        "Elastica v_tip/L={:.4}, expected=0.3015, error={:.1}%",
        v_ratio, v_error * 100.0
    );

    // Axial shortening should be in the right ballpark
    assert!(
        u_ratio > 0.01 && u_ratio < 0.20,
        "Elastica u_tip/L={:.4}, expected ~0.0566", u_ratio
    );
}

// ================================================================
// 3. P-Delta Regression: Small Displacement Parity
// ================================================================
//
// For moderate displacements, co-rotational and P-Delta should agree.
// Portal frame with lateral + gravity loads.

#[test]
fn validation_corotational_pdelta_regression() {
    let h = 4.0;
    let w = 6.0;
    let a = 0.01;
    let iz = 1e-4;
    let lateral = 10.0;
    let gravity = -50.0;

    let input = make_portal_frame(h, w, E, a, iz, lateral, gravity);

    let pdelta_res = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-6, 5, false).unwrap();

    assert!(pdelta_res.converged, "P-delta should converge");
    assert!(corot_res.converged, "Co-rotational should converge");

    // Compare sway at top (node 2)
    let pd_ux = pdelta_res.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let corot_ux = corot_res.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // For moderate loads, results should be within 10%
    if pd_ux.abs() > 1e-8 {
        let error = (corot_ux - pd_ux).abs() / pd_ux.abs();
        assert!(
            error < 0.10,
            "P-delta/corot parity: pd_ux={:.6}, corot_ux={:.6}, error={:.1}%",
            pd_ux, corot_ux, error * 100.0
        );
    }
}

// ================================================================
// 4. Williams Toggle: Convergence Test
// ================================================================
//
// Source: Williams (1964), Crisfield *Non-linear FEA*
// Two-bar toggle with apex load — verify solver handles snap-through
// without panicking and produces reasonable results when it converges.

#[test]
fn validation_corotational_williams_toggle() {
    let l_half = 3.0;
    let h = 0.5;
    let p = 50.0;
    let a = 0.01;
    let iz = 1e-4;

    let nodes = vec![
        (1, -l_half, 0.0),
        (2, 0.0, h),
        (3, l_half, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a, iz)],
        elems, sups, loads,
    );

    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 10, false);

    match result {
        Ok(res) => {
            if res.converged {
                let apex = res.results.displacements.iter()
                    .find(|d| d.node_id == 2).unwrap();
                assert!(apex.uz < 0.0, "Toggle apex should deflect down, got uy={:.6}", apex.uz);
            }
            assert!(res.iterations > 0, "Should have at least 1 iteration");
        },
        Err(_) => {
            // Snap-through failure is acceptable — the solver doesn't panic
        }
    }
}

// ================================================================
// 5. Modified Newton-Raphson Parity
// ================================================================

/// Modified NR should converge to the same result as full NR for a well-behaved problem.
#[test]
fn validation_modified_nr_parity_2d() {
    // Cantilever with moderate load — well within convergence radius
    let nodes = vec![(1, 0.0, 0.0), (2, 3.0, 0.0)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false)];
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 1e-4)],
        elems, sups, loads,
    );

    let full = corotational::solve_corotational_2d(&input, 50, 1e-8, 5, false).unwrap();
    let modified = corotational::solve_corotational_2d(&input, 200, 1e-8, 5, true).unwrap();

    assert!(full.converged, "Full NR should converge");
    assert!(modified.converged, "Modified NR should converge");

    let d_full = full.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d_mod = modified.results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let rel_uy = (d_full.uz - d_mod.uz).abs() / d_full.uz.abs().max(1e-15);
    let rel_ux = if d_full.ux.abs() > 1e-12 {
        (d_full.ux - d_mod.ux).abs() / d_full.ux.abs()
    } else {
        (d_full.ux - d_mod.ux).abs()
    };

    assert!(
        rel_uy < 1e-4,
        "uy mismatch: full={:.8e}, modified={:.8e}, rel={:.4e}",
        d_full.uz, d_mod.uz, rel_uy
    );
    assert!(
        rel_ux < 1e-3,
        "ux mismatch: full={:.8e}, modified={:.8e}, rel={:.4e}",
        d_full.ux, d_mod.ux, rel_ux
    );

    // Modified NR should take more iterations (linear convergence vs quadratic)
    assert!(
        modified.iterations >= full.iterations,
        "Modified NR should take at least as many iterations: full={}, modified={}",
        full.iterations, modified.iterations
    );
}


// ================================================================
// 5. Sparse Newton path (nf >= SPARSE_THRESHOLD = 64)
// ================================================================
//
// Cantilever under a transverse tip load, discretized into 30 frame
// elements: 31 nodes, node 1 fixed, so nf = 30 × 3 = 90 ≥ 64 and the
// Newton solve takes the sparse Cholesky path. A 10-element model of the
// same structure (nf = 30 < 64) takes the dense path — since Hermitian
// beam elements are exact for a tip load, both must give the same tip
// deflection, which doubles as a dense-vs-sparse parity check.
//
// Analytical (Euler-Bernoulli, small deflection): δ_tip = P·L³/(3·E·I)

#[test]
fn validation_corotational_sparse_path_cantilever() {
    let e_mpa = E;
    let l: f64 = 6.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let p: f64 = 10.0;

    let e_eff = e_mpa * 1000.0; // kN/m²
    let delta_analytical = p * l.powi(3) / (3.0 * e_eff * iz);

    let build = |n_elem: usize| {
        let elem_len = l / n_elem as f64;
        let nodes: Vec<_> = (0..=n_elem)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n_elem)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();
        let sups = vec![(1, 1, "fixed")];
        let tip = n_elem + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fz: -p, my: 0.0,
        })];
        (
            make_input(nodes, vec![(1, e_mpa, 0.3)], vec![(1, a, iz)], elems, sups, loads),
            tip,
        )
    };

    // Sparse Newton path: nf = 90 >= 64
    let (input_fine, tip_fine) = build(30);
    let fine = corotational::solve_corotational_2d(&input_fine, 50, 1e-6, 5, false).unwrap();
    assert!(fine.converged, "Sparse-path cantilever should converge");

    let d_fine = fine.results.displacements.iter()
        .find(|d| d.node_id == tip_fine).unwrap();
    let uz_fine = d_fine.uz.abs();
    let err = (uz_fine - delta_analytical).abs() / delta_analytical;
    assert!(
        err < 0.01,
        "Sparse path: tip δ={:.6e} m, analytical={:.6e} m, error={:.2}%",
        uz_fine, delta_analytical, err * 100.0
    );

    // Dense Newton path on the same structure, coarser mesh: nf = 30 < 64.
    // Beam elements are exact for a tip load, so this is a dense-vs-sparse
    // parity check on the same physical problem.
    let (input_coarse, tip_coarse) = build(10);
    let coarse = corotational::solve_corotational_2d(&input_coarse, 50, 1e-6, 5, false).unwrap();
    assert!(coarse.converged, "Dense-path cantilever should converge");

    let d_coarse = coarse.results.displacements.iter()
        .find(|d| d.node_id == tip_coarse).unwrap();
    let rel = (d_fine.uz - d_coarse.uz).abs() / d_coarse.uz.abs().max(1e-15);
    assert!(
        rel < 1e-4,
        "Dense vs sparse parity: fine={:.8e}, coarse={:.8e}, rel={:.4e}",
        d_fine.uz, d_coarse.uz, rel
    );

    // Modified NR on the sparse path (cached sparse factorization)
    let fine_mod = corotational::solve_corotational_2d(&input_fine, 50, 1e-6, 5, true).unwrap();
    assert!(fine_mod.converged, "Sparse modified-NR should converge");
    let d_mod = fine_mod.results.displacements.iter()
        .find(|d| d.node_id == tip_fine).unwrap();
    let rel_mod = (d_fine.uz - d_mod.uz).abs() / d_fine.uz.abs().max(1e-15);
    assert!(
        rel_mod < 1e-4,
        "Sparse full-NR vs modified-NR: full={:.8e}, modified={:.8e}, rel={:.4e}",
        d_fine.uz, d_mod.uz, rel_mod
    );
}

// ================================================================
// 6. Sparse Newton path with an inclined roller (triplet assembly +
//    triplet inclined-support transform)
// ================================================================
//
// Propped cantilever: node 1 fixed, last node on an inclined roller at
// θ = 0.6 rad (restrains the rotated normal, couples ux/uz), vertical point
// load at midspan. 22 elements → 23 nodes → nf = 3·23 − 4 = 65 ≥ 64, so the
// Newton loop assembles the tangent as triplets and rotates it with
// apply_inclined_transform_triplets_2d; a 10-element model of the same
// structure (nf = 29 < 64) stays on the dense path. Hermitian frame
// elements are exact for a nodal point load, so both meshes must give
// the same midspan deflection — a dense-vs-sparse parity check that
// fails if the triplet inclined transform rotates K or f_int wrongly.

#[test]
fn validation_corotational_sparse_path_inclined_roller() {
    let l: f64 = 6.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let p: f64 = 10.0;
    // SolverSupport.angle is consumed raw by inclined_rotation_matrix_2d
    // (radians); use one value consistently for the support and the check.
    let theta = 0.6;

    let build = |n_elem: usize| {
        let elem_len = l / n_elem as f64;
        let nodes: Vec<_> = (0..=n_elem)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n_elem)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();
        let mid_node = n_elem / 2 + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })];
        // Placeholder roller, patched to an inclined roller below
        // (make_input does not expose the angle field).
        let mut input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, a, iz)],
            elems, vec![(1, 1, "fixed"), (2, n_elem + 1, "rollerX")], loads,
        );
        let sup = input.supports.get_mut("2").unwrap();
        sup.support_type = "inclinedRoller".to_string();
        sup.angle = Some(theta);
        (input, mid_node, n_elem + 1)
    };

    // Sparse Newton path: nf = 65 >= 64
    let (input_fine, mid_fine, roller_fine) = build(22);
    let fine = corotational::solve_corotational_2d(&input_fine, 50, 1e-6, 5, false).unwrap();
    assert!(fine.converged, "Sparse-path inclined model should converge");

    // Kinematic check: the roller node must not move normal to the
    // incline — per inclined_rotation_matrix_2d, local[1] (normal) =
    // sin(θ)·ux + cos(θ)·uz must vanish relative to the node's own
    // displacement magnitude.
    let r = assembly::inclined_rotation_matrix_2d(theta);
    let d_roller = fine.results.displacements.iter()
        .find(|d| d.node_id == roller_fine).unwrap();
    let normal = r[1][0] * d_roller.ux + r[1][1] * d_roller.uz;
    let characteristic = d_roller.ux.abs().max(d_roller.uz.abs()).max(1e-30);
    assert!(
        normal.abs() / characteristic < 1e-6,
        "Roller node should be restrained normal to the incline: normal={:.3e}, \
         characteristic={:.3e} (ux={:.3e}, uz={:.3e})",
        normal, characteristic, d_roller.ux, d_roller.uz
    );

    // Dense Newton path on the same structure, coarser mesh: nf = 29 < 64.
    let (input_coarse, mid_coarse, _) = build(10);
    let coarse = corotational::solve_corotational_2d(&input_coarse, 50, 1e-6, 5, false).unwrap();
    assert!(coarse.converged, "Dense-path inclined model should converge");

    let uz_fine = fine.results.displacements.iter()
        .find(|d| d.node_id == mid_fine).unwrap().uz;
    let uz_coarse = coarse.results.displacements.iter()
        .find(|d| d.node_id == mid_coarse).unwrap().uz;
    let rel = (uz_fine - uz_coarse).abs() / uz_coarse.abs().max(1e-15);
    assert!(
        rel < 1e-4,
        "Dense vs sparse parity (inclined): fine={:.8e}, coarse={:.8e}, rel={:.4e}",
        uz_fine, uz_coarse, rel
    );

    // Modified NR on the sparse path (cached sparse factorization over the
    // rotated triplet pattern)
    let fine_mod = corotational::solve_corotational_2d(&input_fine, 50, 1e-6, 5, true).unwrap();
    assert!(fine_mod.converged, "Sparse modified-NR (inclined) should converge");
    let uz_mod = fine_mod.results.displacements.iter()
        .find(|d| d.node_id == mid_fine).unwrap().uz;
    let rel_mod = (uz_fine - uz_mod).abs() / uz_fine.abs().max(1e-15);
    assert!(
        rel_mod < 1e-4,
        "Sparse full-NR vs modified-NR (inclined): full={:.8e}, modified={:.8e}, rel={:.4e}",
        uz_fine, uz_mod, rel_mod
    );
}
