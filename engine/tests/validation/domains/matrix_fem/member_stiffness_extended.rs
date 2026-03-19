/// Validation: Member Stiffness Concepts
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 2 & 9
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4 & 7
///   - Timoshenko, "Strength of Materials", Part I
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5
///
/// Tests verify fundamental stiffness relationships:
///   1. Axial stiffness: k = EA/L, delta = PL/(EA)
///   2. Bending stiffness comparison: cantilever 3EI/L^3 vs fixed-fixed 192EI/L^3
///   3. Stiffness proportional to I: double I halves deflection
///   4. Stiffness inversely proportional to L^3: double L multiplies deflection by 8
///   5. Stiffness proportional to E: double E halves deflection
///   6. Rotational stiffness: cantilever tip moment, theta = ML/(EI)
///   7. Frame member stiffness: portal frame lateral stiffness with different column sizes
///   8. Combined axial + bending: independence at small displacements
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally)
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4
const E_EFF: f64 = E * 1000.0; // effective modulus after solver scaling

// ================================================================
// 1. Axial Stiffness: k = EA/L, delta = PL/(EA)
// ================================================================
//
// A horizontal bar fixed at one end with an axial load P at the
// free end. The axial elongation should be exactly delta = PL/(EA).
// This is the most fundamental stiffness relationship: k = EA/L.
//
// Reference: Gere & Goodno, Ch. 2, Eq. 2-3.

#[test]
fn validation_axial_stiffness_ea_over_l() {
    let l = 4.0;
    let p = 80.0; // kN axial load
    let n = 1;

    // Fixed at left, free at right (cantilever for axial)
    let input = make_beam(
        n, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p, fz: 0.0, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // delta = PL / (EA)
    let delta_exact = p * l / (E_EFF * A);
    assert_close(tip.ux, delta_exact, 0.01, "axial delta = PL/(EA)");

    // Verify stiffness: k = P / delta = EA / L
    let k_exact = E_EFF * A / l;
    let k_computed: f64 = p / tip.ux;
    assert_close(k_computed, k_exact, 0.01, "axial stiffness k = EA/L");

    // Transverse displacement should be negligible
    assert!(tip.uz.abs() < 1e-8,
        "axial load: uy should be ~0, got {:.6e}", tip.uz);
}

// ================================================================
// 2. Bending Stiffness Comparison: Cantilever vs Fixed-Fixed
// ================================================================
//
// Cantilever with tip load P: k_cant = 3EI/L^3, delta = PL^3/(3EI)
// Fixed-fixed with center load P: k_ff = 192EI/L^3, delta = PL^3/(192EI)
// Ratio: k_ff / k_cant = 64
//
// Reference: Timoshenko, Beam Deflection Tables.

#[test]
fn validation_bending_stiffness_cantilever_vs_fixed_fixed() {
    let l = 6.0;
    let p = 10.0;
    let n = 8;

    // Case 1: Cantilever with tip load
    let input_cant = make_beam(
        n, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res_cant = linear::solve_2d(&input_cant).unwrap();
    let tip_cant = res_cant.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Case 2: Fixed-fixed with center point load
    let mid = n / 2 + 1;
    let input_ff = make_beam(
        n, l, E, A, IZ,
        "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let res_ff = linear::solve_2d(&input_ff).unwrap();
    let mid_ff = res_ff.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Verify individual formulas
    let delta_cant_exact = p * l.powi(3) / (3.0 * E_EFF * IZ);
    let delta_ff_exact = p * l.powi(3) / (192.0 * E_EFF * IZ);

    let err_cant: f64 = (tip_cant.uz.abs() - delta_cant_exact).abs() / delta_cant_exact;
    assert!(err_cant < 0.02,
        "cantilever delta: actual={:.6e}, exact={:.6e}, err={:.2}%",
        tip_cant.uz.abs(), delta_cant_exact, err_cant * 100.0);

    let err_ff: f64 = (mid_ff.uz.abs() - delta_ff_exact).abs() / delta_ff_exact;
    assert!(err_ff < 0.05,
        "fixed-fixed delta: actual={:.6e}, exact={:.6e}, err={:.2}%",
        mid_ff.uz.abs(), delta_ff_exact, err_ff * 100.0);

    // Stiffness ratio: fixed-fixed is 64x stiffer than cantilever
    let ratio: f64 = tip_cant.uz.abs() / mid_ff.uz.abs();
    assert_close(ratio, 64.0, 0.05, "stiffness ratio k_ff/k_cant = 64");
}

// ================================================================
// 3. Stiffness Proportional to I: Double I Halves Deflection
// ================================================================
//
// For a cantilever with tip load, delta = PL^3/(3EI).
// Doubling I should halve the deflection exactly.
//
// Reference: Gere & Goodno, Ch. 9, moment of inertia effects.

#[test]
fn validation_stiffness_proportional_to_i() {
    let l = 5.0;
    let p = 15.0;
    let n = 4;
    let iz1 = 1e-4;
    let iz2 = 2e-4; // double the moment of inertia

    let input1 = make_beam(
        n, l, E, A, iz1,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let input2 = make_beam(
        n, l, E, A, iz2,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // d1 should be exactly 2 * d2 (doubling I halves deflection)
    let ratio: f64 = d1 / d2;
    assert_close(ratio, 2.0, 0.02, "doubling I halves deflection (ratio=2)");

    // Also verify absolute values against PL^3/(3EI)
    let e_eff = E * 1000.0;
    let d1_exact = p * l.powi(3) / (3.0 * e_eff * iz1);
    let d2_exact = p * l.powi(3) / (3.0 * e_eff * iz2);
    assert_close(d1, d1_exact, 0.02, "deflection with I1");
    assert_close(d2, d2_exact, 0.02, "deflection with I2 = 2*I1");
}

// ================================================================
// 4. Stiffness Inversely Proportional to L^3: Double L -> 8x Deflection
// ================================================================
//
// Cantilever tip deflection: delta = PL^3/(3EI).
// Doubling L multiplies deflection by 2^3 = 8.
//
// Reference: Timoshenko, "Strength of Materials", Part I.

#[test]
fn validation_stiffness_inversely_proportional_to_l_cubed() {
    let l1 = 3.0;
    let l2 = 6.0; // double the length
    let p = 10.0;
    let n1 = 4;
    let n2 = 8; // proportional mesh

    let input1 = make_beam(
        n1, l1, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n1 + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let input2 = make_beam(
        n2, l2, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n2 + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == n1 + 1).unwrap().uz.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n2 + 1).unwrap().uz.abs();

    // d2 / d1 should be (L2/L1)^3 = 2^3 = 8
    let ratio: f64 = d2 / d1;
    assert_close(ratio, 8.0, 0.02, "doubling L gives 8x deflection");

    // Verify absolute values
    let d1_exact = p * l1.powi(3) / (3.0 * E_EFF * IZ);
    let d2_exact = p * l2.powi(3) / (3.0 * E_EFF * IZ);
    assert_close(d1, d1_exact, 0.02, "deflection with L1");
    assert_close(d2, d2_exact, 0.02, "deflection with L2 = 2*L1");
}

// ================================================================
// 5. Stiffness Proportional to E: Double E Halves Deflection
// ================================================================
//
// Cantilever tip deflection: delta = PL^3/(3EI).
// Doubling E should halve the deflection.
//
// Reference: Hibbeler, Ch. 7, elastic modulus effects.

#[test]
fn validation_stiffness_proportional_to_e() {
    let l = 5.0;
    let p = 12.0;
    let n = 4;
    let e1 = 200_000.0; // steel, MPa
    let e2 = 400_000.0; // double modulus

    let input1 = make_beam(
        n, l, e1, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let input2 = make_beam(
        n, l, e2, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // d1 should be exactly 2 * d2 (doubling E halves deflection)
    let ratio: f64 = d1 / d2;
    assert_close(ratio, 2.0, 0.02, "doubling E halves deflection (ratio=2)");

    // Verify absolute values
    let e1_eff = e1 * 1000.0;
    let e2_eff = e2 * 1000.0;
    let d1_exact = p * l.powi(3) / (3.0 * e1_eff * IZ);
    let d2_exact = p * l.powi(3) / (3.0 * e2_eff * IZ);
    assert_close(d1, d1_exact, 0.02, "deflection with E1");
    assert_close(d2, d2_exact, 0.02, "deflection with E2 = 2*E1");
}

// ================================================================
// 6. Rotational Stiffness: Cantilever Tip Moment, theta = ML/(EI)
// ================================================================
//
// Apply a concentrated moment M at the free end of a cantilever.
// Tip rotation: theta = ML/(EI).
// Rotational stiffness: k_rot = M/theta = EI/L.
//
// Reference: Gere & Goodno, Table of Beam Deflections, Case 7.

#[test]
fn validation_rotational_stiffness_cantilever_tip_moment() {
    let l = 5.0;
    let m = 30.0; // kN*m applied moment
    let n = 4;

    let input = make_beam(
        n, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // theta = ML / (EI)
    let theta_exact = m * l / (E_EFF * IZ);
    assert_close(tip.ry, theta_exact, 0.02, "tip rotation theta = ML/(EI)");

    // Rotational stiffness: k_rot = M / theta = EI / L
    let k_rot_exact = E_EFF * IZ / l;
    let k_rot_computed: f64 = m / tip.ry;
    assert_close(k_rot_computed, k_rot_exact, 0.02, "rotational stiffness k = EI/L");

    // Also check tip deflection: delta = ML^2/(2EI)
    let delta_exact = m * l * l / (2.0 * E_EFF * IZ);
    assert_close(tip.uz.abs(), delta_exact, 0.02, "tip deflection delta = ML^2/(2EI)");
}

// ================================================================
// 7. Frame Member Stiffness: Portal Frame Lateral Stiffness
// ================================================================
//
// Compare lateral stiffness of two fixed-base portal frames with
// different column moments of inertia. For a fixed-base portal frame
// under lateral load, the stiffness is governed by column flexural
// rigidity. Doubling column Iz should approximately halve the drift.
//
// Reference: Kassimali, "Structural Analysis", Ch. 5, portal frames.

#[test]
fn validation_portal_frame_lateral_stiffness_column_sizes() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0; // lateral load at top
    let iz1 = 1e-4;
    let iz2 = 2e-4; // double column Iz

    // Portal frame 1: smaller columns
    let input1 = make_portal_frame(h, w, E, A, iz1, p, 0.0);
    let res1 = linear::solve_2d(&input1).unwrap();
    let drift1 = res1.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Portal frame 2: stiffer columns (double Iz)
    let input2 = make_portal_frame(h, w, E, A, iz2, p, 0.0);
    let res2 = linear::solve_2d(&input2).unwrap();
    let drift2 = res2.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Stiffer columns should produce less drift
    assert!(drift2 < drift1,
        "stiffer columns should reduce drift: drift1={:.6e}, drift2={:.6e}",
        drift1, drift2);

    // For a fixed-base portal frame with rigid beam, the lateral stiffness
    // is proportional to column EI. The ratio should be close to 2.0 but
    // beam flexibility reduces it slightly. Accept ratio between 1.5 and 2.5.
    let ratio: f64 = drift1 / drift2;
    assert!(ratio > 1.5 && ratio < 2.5,
        "drift ratio should be ~2 for 2x column Iz: ratio={:.4}", ratio);

    // Both frames should be in equilibrium
    let sum_rx_1: f64 = res1.reactions.iter().map(|r| r.rx).sum();
    let sum_rx_2: f64 = res2.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_1, -p, 0.02, "frame1 horizontal equilibrium");
    assert_close(sum_rx_2, -p, 0.02, "frame2 horizontal equilibrium");
}

// ================================================================
// 8. Combined Axial + Bending: Independence at Small Displacements
// ================================================================
//
// In linear analysis, axial and bending deformations are independent
// (uncoupled in the stiffness matrix). Applying both an axial load
// and a transverse load should produce superposable results:
//   - ux matches the pure axial case
//   - uy matches the pure bending case
//
// Reference: Hibbeler, "Structural Analysis", superposition principle.

#[test]
fn validation_combined_axial_bending_independence() {
    let l = 5.0;
    let p_axial = 80.0; // kN
    let p_trans = 10.0; // kN
    let n = 4;

    // Case 1: Pure axial load only
    let input_axial = make_beam(
        n, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0,
        })],
    );
    let res_axial = linear::solve_2d(&input_axial).unwrap();
    let tip_axial = res_axial.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Case 2: Pure transverse load only
    let input_trans = make_beam(
        n, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p_trans, my: 0.0,
        })],
    );
    let res_trans = linear::solve_2d(&input_trans).unwrap();
    let tip_trans = res_trans.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Case 3: Combined axial + transverse
    let input_combined = make_beam(
        n, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p_axial, fz: -p_trans, my: 0.0,
        })],
    );
    let res_combined = linear::solve_2d(&input_combined).unwrap();
    let tip_combined = res_combined.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Axial displacement from combined should match pure axial
    assert_close(tip_combined.ux, tip_axial.ux, 0.02,
        "combined ux matches pure axial ux");

    // Transverse displacement from combined should match pure bending
    assert_close(tip_combined.uz, tip_trans.uz, 0.02,
        "combined uy matches pure bending uy");

    // Rotation from combined should match pure bending
    assert_close(tip_combined.ry, tip_trans.ry, 0.02,
        "combined rz matches pure bending rz");

    // Verify against analytical formulas
    let ux_exact = p_axial * l / (E_EFF * A);
    let uy_exact = -p_trans * l.powi(3) / (3.0 * E_EFF * IZ);
    assert_close(tip_combined.ux, ux_exact, 0.02,
        "combined ux = PL/(EA)");
    assert_close(tip_combined.uz, uy_exact, 0.02,
        "combined uy = PL^3/(3EI)");
}
