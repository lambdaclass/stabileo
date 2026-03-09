/// Validation: Extended Column Effective Length via Eigenvalue Buckling
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd ed. (1961)
///   - AISC Steel Construction Manual, 15th ed., Commentary C2
///   - Galambos & Surovek, "Structural Stability of Steel" (2008)
///   - Euler buckling: P_cr = pi^2 * EI / (K*L)^2
///
/// Tests use the eigenvalue buckling solver (solve_buckling_2d) to verify
/// that computed critical load factors produce critical loads consistent
/// with classical Euler column theory for various boundary conditions,
/// lengths, section properties, higher modes, and frame systems.
use dedaliano_engine::solver::buckling;
use dedaliano_engine::types::*;
use crate::common::*;
use std::f64::consts::PI;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Pinned-Pinned Euler Load via Buckling Solver
// ================================================================
//
// P_cr = pi^2 * EI / L^2   (K = 1.0)
// Apply compressive reference load P, solver returns lambda such that
// lambda * P = P_cr.

#[test]
fn validation_ext_eff_len_pinned_pinned_euler() {
    let l: f64 = 6.0;
    let n = 10;
    let p_ref: f64 = 100.0;
    let e_eff: f64 = E * 1000.0;

    let p_euler: f64 = PI * PI * e_eff * IZ / (l * l);

    let input = make_column(n, l, E, A, IZ, "pinned", "rollerX", -p_ref);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_solver: f64 = result.modes[0].load_factor * p_ref;

    assert_close(pcr_solver, p_euler, 0.02,
        "PP Euler load: solver vs analytical");
}

// ================================================================
// 2. Fixed-Fixed Column: K = 0.5, P_cr = 4 * P_euler_PP
// ================================================================
//
// "guidedX" end support = uy + rz fixed, ux free → acts as a
// sliding clamp, modeling fixed-fixed column conditions.

#[test]
fn validation_ext_eff_len_fixed_fixed_euler() {
    let l: f64 = 6.0;
    let n = 10;
    let p_ref: f64 = 100.0;
    let e_eff: f64 = E * 1000.0;

    // Analytical: K = 0.5
    let p_euler_pp: f64 = PI * PI * e_eff * IZ / (l * l);
    let p_euler_ff: f64 = 4.0 * p_euler_pp;

    let input = make_column(n, l, E, A, IZ, "fixed", "guidedX", -p_ref);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_solver: f64 = result.modes[0].load_factor * p_ref;

    assert_close(pcr_solver, p_euler_ff, 0.02,
        "FF Euler load: solver vs 4*PP");
}

// ================================================================
// 3. Fixed-Pinned Column: K ~ 0.6992
// ================================================================
//
// Fixed base, roller (pinned for transverse) at top.
// P_cr = pi^2 * EI / (0.6992 * L)^2

#[test]
fn validation_ext_eff_len_fixed_pinned_euler() {
    let l: f64 = 6.0;
    let n = 10;
    let p_ref: f64 = 100.0;
    let e_eff: f64 = E * 1000.0;

    let k_fp: f64 = 0.6992;
    let le: f64 = k_fp * l;
    let p_euler_fp: f64 = PI * PI * e_eff * IZ / (le * le);

    let input = make_column(n, l, E, A, IZ, "fixed", "rollerX", -p_ref);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_solver: f64 = result.modes[0].load_factor * p_ref;

    assert_close(pcr_solver, p_euler_fp, 0.02,
        "FP Euler load: solver vs K=0.6992 analytical");

    // Also verify: FP capacity between PP and FF
    let p_euler_pp: f64 = PI * PI * e_eff * IZ / (l * l);
    let p_euler_ff: f64 = 4.0 * p_euler_pp;
    assert!(pcr_solver > p_euler_pp,
        "FP Pcr > PP Pcr: {:.1} > {:.1}", pcr_solver, p_euler_pp);
    assert!(pcr_solver < p_euler_ff,
        "FP Pcr < FF Pcr: {:.1} < {:.1}", pcr_solver, p_euler_ff);
}

// ================================================================
// 4. Cantilever Column: K = 2.0, P_cr = 0.25 * P_euler_PP
// ================================================================
//
// Fixed base, free top. The effective length is 2L, giving
// P_cr = pi^2 * EI / (2L)^2 = P_euler_PP / 4.

#[test]
fn validation_ext_eff_len_cantilever_euler() {
    let l: f64 = 6.0;
    let n = 10;
    let p_ref: f64 = 10.0; // smaller load since cantilever buckles easily
    let e_eff: f64 = E * 1000.0;

    let p_euler_pp: f64 = PI * PI * e_eff * IZ / (l * l);
    let p_euler_cf: f64 = p_euler_pp / 4.0;

    let input = make_column(n, l, E, A, IZ, "fixed", "free", -p_ref);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_solver: f64 = result.modes[0].load_factor * p_ref;

    assert_close(pcr_solver, p_euler_cf, 0.03,
        "CF Euler load: solver vs PP/4");
}

// ================================================================
// 5. Higher Buckling Modes: 2nd mode = 4 * 1st mode (PP)
// ================================================================
//
// For pinned-pinned column, the n-th mode has P_cr_n = n^2 * P_cr_1.
// Verify that the second mode critical load is approximately 4x the first.

#[test]
fn validation_ext_eff_len_higher_modes() {
    let l: f64 = 6.0;
    let n = 20; // more elements for mode resolution
    let p_ref: f64 = 50.0;

    let input = make_column(n, l, E, A, IZ, "pinned", "rollerX", -p_ref);
    let result = buckling::solve_buckling_2d(&input, 3).unwrap();

    let lambda_1: f64 = result.modes[0].load_factor;
    let lambda_2: f64 = result.modes[1].load_factor;

    // Second mode load factor should be ~4x the first
    let ratio: f64 = lambda_2 / lambda_1;
    assert_close(ratio, 4.0, 0.05,
        "PP 2nd mode / 1st mode ratio");

    // Third mode should be ~9x first
    if result.modes.len() >= 3 {
        let lambda_3: f64 = result.modes[2].load_factor;
        let ratio_3: f64 = lambda_3 / lambda_1;
        assert_close(ratio_3, 9.0, 0.10,
            "PP 3rd mode / 1st mode ratio");
    }
}

// ================================================================
// 6. Length Scaling: P_cr proportional to 1/L^2
// ================================================================
//
// For the same BC and section, doubling the length reduces P_cr by 4x.

#[test]
fn validation_ext_eff_len_length_scaling() {
    let n = 10;
    let p_ref: f64 = 50.0;

    let lengths: [f64; 3] = [3.0, 5.0, 8.0];
    let mut pcr_values: Vec<f64> = Vec::new();

    for &l in &lengths {
        let input = make_column(n, l, E, A, IZ, "pinned", "rollerX", -p_ref);
        let result = buckling::solve_buckling_2d(&input, 1).unwrap();
        let pcr: f64 = result.modes[0].load_factor * p_ref;
        pcr_values.push(pcr);
    }

    // P_cr(L1) / P_cr(L2) = (L2/L1)^2
    let ratio_1_2: f64 = pcr_values[0] / pcr_values[1];
    let expected_1_2: f64 = (lengths[1] / lengths[0]).powi(2);
    assert_close(ratio_1_2, expected_1_2, 0.02,
        "Pcr ratio L=3/L=5");

    let ratio_1_3: f64 = pcr_values[0] / pcr_values[2];
    let expected_1_3: f64 = (lengths[2] / lengths[0]).powi(2);
    assert_close(ratio_1_3, expected_1_3, 0.02,
        "Pcr ratio L=3/L=8");
}

// ================================================================
// 7. Section Property Scaling: P_cr proportional to I
// ================================================================
//
// Doubling Iz should double the critical load for the same BCs and length.

#[test]
fn validation_ext_eff_len_section_scaling() {
    let l: f64 = 5.0;
    let n = 10;
    let p_ref: f64 = 50.0;

    // IZ = 1e-4
    let input_1 = make_column(n, l, E, A, IZ, "pinned", "rollerX", -p_ref);
    let pcr_1: f64 = buckling::solve_buckling_2d(&input_1, 1)
        .unwrap().modes[0].load_factor * p_ref;

    // IZ = 2e-4
    let input_2 = make_column(n, l, E, A, 2.0 * IZ, "pinned", "rollerX", -p_ref);
    let pcr_2: f64 = buckling::solve_buckling_2d(&input_2, 1)
        .unwrap().modes[0].load_factor * p_ref;

    // IZ = 4e-4
    let input_4 = make_column(n, l, E, A, 4.0 * IZ, "pinned", "rollerX", -p_ref);
    let pcr_4: f64 = buckling::solve_buckling_2d(&input_4, 1)
        .unwrap().modes[0].load_factor * p_ref;

    assert_close(pcr_2 / pcr_1, 2.0, 0.02,
        "Pcr scales linearly with I (2x)");
    assert_close(pcr_4 / pcr_1, 4.0, 0.02,
        "Pcr scales linearly with I (4x)");
}

// ================================================================
// 8. Portal Frame Sway Buckling: K > 1.0 for Unbraced Frame
// ================================================================
//
// For a portal frame with fixed bases and gravity load, the sway
// buckling load should correspond to K > 1.0 for the columns.
// Verify: (a) buckling load factor is finite and positive,
//         (b) K_eff > 1.0 from element_data,
//         (c) adding a diagonal brace raises the buckling capacity.

#[test]
fn validation_ext_eff_len_frame_sway_buckling() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    // --- Unbraced portal frame with gravity ---
    // Build manually: nodes 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 4, 3, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let p_grav: f64 = -200.0;
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_grav, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p_grav, mz: 0.0,
        }),
    ];
    let input_unbraced = make_input(nodes, mats, secs, elems, sups, loads);
    let result_unbraced = buckling::solve_buckling_2d(&input_unbraced, 1).unwrap();

    let lambda_unbraced: f64 = result_unbraced.modes[0].load_factor;
    assert!(lambda_unbraced > 0.0,
        "Unbraced frame lambda > 0: {:.4}", lambda_unbraced);

    // K_eff for columns from element_data should be > 1.0 (sway mode)
    let col_data: Vec<&_> = result_unbraced.element_data.iter()
        .filter(|ed| ed.element_id == 1 || ed.element_id == 3)
        .collect();
    assert!(!col_data.is_empty(), "Should have column buckling data");
    for cd in &col_data {
        assert!(cd.k_effective > 1.0,
            "Sway frame K_eff > 1.0: elem {} K={:.3}", cd.element_id, cd.k_effective);
    }

    // --- Braced portal frame: add diagonal truss ---
    let nodes_b = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let mats_b = vec![(1, E, 0.3)];
    let secs_b = vec![(1, A, IZ)];
    let elems_b = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 1, false, false), // diagonal brace
    ];
    let sups_b = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads_b = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_grav, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p_grav, mz: 0.0,
        }),
    ];
    let input_braced = make_input(nodes_b, mats_b, secs_b, elems_b, sups_b, loads_b);
    let result_braced = buckling::solve_buckling_2d(&input_braced, 1).unwrap();
    let lambda_braced: f64 = result_braced.modes[0].load_factor;

    // Braced frame should have higher buckling capacity
    assert!(lambda_braced > lambda_unbraced,
        "Braced lambda > Unbraced lambda: {:.2} > {:.2}",
        lambda_braced, lambda_unbraced);
}
