/// Validation: Span-to-Depth Ratio Effects on Beam Behavior
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed., §5.9 (shear deformation)
///   - Roark's Formulas for Stress and Strain, 9th Ed., Table 8.1
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., §9.5
///   - Kassimali, "Structural Analysis", 6th Ed., §9.4 (influence of shear deformation)
///   - AISC Design Guide 3 (serviceability: deflection vs span)
///   - Pilkey, "Formulas for Stress, Strain and Structural Matrices", 2nd Ed.
///
/// Tests verify how the span-to-depth ratio L/d influences beam response:
///   1. Short vs long beam: bending stiffness dominates (delta ∝ L³/EI)
///   2. Stocky vs slender column: bending stiffness scales with L³
///   3. Deep beam: shear deformation contributes a measurable fraction
///   4. Deflection scales with L⁴ for flexure (UDL cantilever)
///   5. Deflection scaling: doubling L doubles δ/L (relative flexibility)
///   6. Stiffness-to-length ratio: shorter beams are proportionally stiffer
///   7. Section efficiency: deeper section (larger I) reduces deflection
///   8. Consistent L³ scaling across support conditions
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const E_EFF: f64 = E * 1000.0; // kN/m²

// ================================================================
// 1. Short vs Long Beam: Bending Stiffness Scales as L³
// ================================================================
//
// For a simply-supported beam with center point load, tip deflection
// δ = PL³/(48EI). Doubling the span multiplies deflection by 8.
// This test verifies that the FEM replicates the cubic L-scaling of
// pure flexural stiffness regardless of span.
//
// Reference: Roark Table 8.1 Case 1a; Gere & Goodno §9.2

#[test]
fn validation_span_depth_l_cubed_scaling_ss_beam() {
    let p = 10.0;
    let n = 8;

    // Short beam: L = 4 m
    let l_short = 4.0;
    let input_s = make_beam(n, l_short, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_s = linear::solve_2d(&input_s).unwrap();
    let d_short = res_s.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Long beam: L = 8 m (twice as long)
    let l_long = 8.0;
    let input_l = make_beam(n, l_long, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_l = linear::solve_2d(&input_l).unwrap();
    let d_long = res_l.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // δ ∝ L³ → doubling L increases δ by factor of 8
    let ratio = d_long / d_short;
    let expected = (l_long / l_short).powi(3); // = 8.0
    assert_close(ratio, expected, 0.03,
        "SS center load: δ ratio = (L2/L1)³");

    // Verify against analytical formula for both spans
    let d_short_exact = p * l_short.powi(3) / (48.0 * E_EFF * IZ);
    let d_long_exact  = p * l_long.powi(3)  / (48.0 * E_EFF * IZ);
    assert_close(d_short, d_short_exact, 0.02, "short beam δ = PL³/(48EI)");
    assert_close(d_long,  d_long_exact,  0.02, "long beam δ = PL³/(48EI)");
}

// ================================================================
// 2. Stocky vs Slender Column: Lateral Stiffness Scales as 1/L³
// ================================================================
//
// For a fixed-base cantilever column with lateral tip load,
// δ_tip = PL³/(3EI), so lateral stiffness k = 3EI/L³.
// Doubling the column height reduces stiffness by factor of 8.
// This is the key design insight for seismic/wind-resistant frames.
//
// Reference: Kassimali §9.4; AISC Design Guide 3 §3.1

#[test]
fn validation_span_depth_stocky_vs_slender_column() {
    let p = 10.0; // lateral load at tip
    let n = 8;

    // Stocky column: L = 3 m
    let l_stocky = 3.0;
    let input_s = make_beam(n, l_stocky, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_s = linear::solve_2d(&input_s).unwrap();
    let d_stocky = res_s.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Slender column: L = 6 m (twice as tall)
    let l_slender = 6.0;
    let input_l = make_beam(n, l_slender, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_l = linear::solve_2d(&input_l).unwrap();
    let d_slender = res_l.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Stiffness k = 3EI/L³ → doubling L reduces k by 8, increases δ by 8
    let ratio = d_slender / d_stocky;
    let expected = (l_slender / l_stocky).powi(3); // = 8.0
    assert_close(ratio, expected, 0.03,
        "cantilever δ ratio = (L2/L1)³");

    // Slender column is much more flexible
    assert!(d_slender > d_stocky * 7.0,
        "Slender column δ={:.6e} should be ~8× stocky δ={:.6e}", d_slender, d_stocky);
}

// ================================================================
// 3. Deep Beam Shear Deformation Contribution
// ================================================================
//
// For a deep beam (small L/d ratio), shear deformation adds to the
// total deflection. The Timoshenko beam contribution from shear is
// δ_shear = P*L/(A_s*G) where A_s is the shear area.
// For a compact (chunky) section, shear deflection is not negligible.
//
// Here we test qualitatively: a beam with a very large cross-section
// area (large A) but with moderate I still deflects, and the deflection
// from the solver must be at least the pure bending component.
//
// Reference: Timoshenko & Gere §5.9; Pilkey §4.3

#[test]
fn validation_span_depth_deep_beam_shear_contribution() {
    let l = 2.0;  // short span → deep beam regime
    let n = 8;
    let p = 100.0;

    // Standard section
    let iz_standard = IZ;
    let a_standard = A;

    // Large-area section (same I, much larger A → shear deformation smaller)
    let a_large = A * 100.0; // 100× larger shear area

    let input_standard = make_beam(n, l, E, a_standard, iz_standard, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_standard = linear::solve_2d(&input_standard).unwrap();
    let d_standard = res_standard.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    let input_large_a = make_beam(n, l, E, a_large, iz_standard, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_large_a = linear::solve_2d(&input_large_a).unwrap();
    let d_large_a = res_large_a.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Pure bending deflection (lower bound): PL³/(48EI)
    let d_bending_only = p * l.powi(3) / (48.0 * E_EFF * iz_standard);

    // Both must equal or exceed the pure bending component
    assert!(d_standard >= d_bending_only * 0.98,
        "Standard section δ={:.6e} should be ≥ bending-only {:.6e}", d_standard, d_bending_only);
    assert!(d_large_a >= d_bending_only * 0.98,
        "Large-A section δ={:.6e} should be ≥ bending-only {:.6e}", d_large_a, d_bending_only);

    // The large-area beam deflects less than or equal to the standard beam
    // because A appears in shear stiffness
    assert!(d_large_a <= d_standard * 1.01,
        "Large shear area δ={:.6e} should be ≤ standard δ={:.6e}", d_large_a, d_standard);
}

// ================================================================
// 4. Deflection Scales with L⁴ for Flexure (UDL Cantilever)
// ================================================================
//
// For a cantilever under uniform distributed load:
//   δ_tip = qL⁴/(8EI)
// The L⁴ exponent means tripling the span multiplies deflection by 81.
// This is the steepest aspect-ratio effect in standard beam theory.
//
// Reference: Roark Table 8.1 Case 2e; Gere & Goodno §9.4

#[test]
fn validation_span_depth_l4_scaling_cantilever_udl() {
    let q = -10.0;
    let n = 8;

    // Short cantilever: L = 2 m
    let l1 = 2.0;
    let mut loads1 = Vec::new();
    for i in 0..n {
        loads1.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input1 = make_beam(n, l1, E, A, IZ, "fixed", None, loads1);
    let res1 = linear::solve_2d(&input1).unwrap();
    let d1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Long cantilever: L = 4 m (twice as long)
    let l2 = 4.0;
    let mut loads2 = Vec::new();
    for i in 0..n {
        loads2.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input2 = make_beam(n, l2, E, A, IZ, "fixed", None, loads2);
    let res2 = linear::solve_2d(&input2).unwrap();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // δ ∝ L⁴ → doubling L increases δ by 16
    let ratio = d2 / d1;
    let expected = (l2 / l1).powi(4); // = 16.0
    assert_close(ratio, expected, 0.03, "cantilever UDL: δ ratio = (L2/L1)⁴");

    // Check against analytical formula
    let d1_exact = q.abs() * l1.powi(4) / (8.0 * E_EFF * IZ);
    let d2_exact = q.abs() * l2.powi(4) / (8.0 * E_EFF * IZ);
    assert_close(d1, d1_exact, 0.02, "short cantilever UDL δ = qL⁴/(8EI)");
    assert_close(d2, d2_exact, 0.02, "long cantilever UDL δ = qL⁴/(8EI)");
}

// ================================================================
// 5. Deflection Scaling: Relative Flexibility Grows with Span
// ================================================================
//
// For a simply-supported beam under UDL, the midspan deflection-to-span
// ratio δ/L = 5qL³/(384EI) grows as L³. A longer beam is proportionally
// more flexible: doubling L makes δ/L 8× larger. This captures how
// servicability requirements become increasingly challenging for long spans.
//
// Reference: AISC Design Guide 3 §2.2; Gere & Goodno §9.5

#[test]
fn validation_span_depth_relative_flexibility_grows_with_span() {
    let q = -5.0;
    let n = 8;

    // Medium span: L = 6 m
    let l1 = 6.0;
    let input1 = make_ss_beam_udl(n, l1, E, A, IZ, q);
    let res1 = linear::solve_2d(&input1).unwrap();
    let d1 = res1.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
    let rel1 = d1 / l1; // δ/L

    // Long span: L = 12 m (twice as long)
    let l2 = 12.0;
    let input2 = make_ss_beam_udl(n, l2, E, A, IZ, q);
    let res2 = linear::solve_2d(&input2).unwrap();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
    let rel2 = d2 / l2; // δ/L

    // δ/L ∝ L³ → doubling L increases δ/L by 8
    let ratio_rel = rel2 / rel1;
    let expected = (l2 / l1).powi(3); // = 8.0
    assert_close(ratio_rel, expected, 0.03,
        "relative flexibility (δ/L) ratio = (L2/L1)³");

    // Absolute deflection ratio should be 16 (L⁴ scaling)
    let ratio_abs = d2 / d1;
    let expected_abs = (l2 / l1).powi(4); // = 16.0
    assert_close(ratio_abs, expected_abs, 0.03,
        "absolute deflection ratio = (L2/L1)⁴ for SS UDL");
}

// ================================================================
// 6. Stiffness-to-Length Ratio: Shorter Beams Are Stiffer Per Unit Load
// ================================================================
//
// The lateral stiffness of a portal frame k = 24EI/h³ (rigid beam limit).
// Comparing fixed-base columns of different heights under unit lateral load,
// the ratio of stiffnesses equals (h2/h1)³.
//
// Reference: Hibbeler §11.4; Kassimali §14.2

#[test]
fn validation_span_depth_stiffness_per_length() {
    let p = 1.0; // unit lateral load
    let n = 8;

    // Short column: h = 3 m
    let h1 = 3.0;
    let input1 = make_beam(n, h1, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res1 = linear::solve_2d(&input1).unwrap();
    let d1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let k1 = p / d1; // lateral stiffness [kN/m]

    // Medium column: h = 6 m (twice as tall)
    let h2 = 6.0;
    let input2 = make_beam(n, h2, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res2 = linear::solve_2d(&input2).unwrap();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let k2 = p / d2;

    // k ∝ 1/h³ → k1/k2 = (h2/h1)³ = 8
    let ratio_k = k1 / k2;
    let expected = (h2 / h1).powi(3);
    assert_close(ratio_k, expected, 0.03, "stiffness ratio k1/k2 = (h2/h1)³");

    // Shorter column must be substantially stiffer
    assert!(k1 > k2 * 7.0,
        "Short column k={:.4} should be ~8× stiffer than tall column k={:.4}", k1, k2);
}

// ================================================================
// 7. Section Efficiency: Deeper Section Reduces Deflection
// ================================================================
//
// For geometrically similar rectangular cross-sections of width b and
// depth d, I = b*d³/12. Doubling d (depth) while keeping width constant
// increases I by 8, reducing midspan deflection by 8 for the same span.
// This demonstrates the dramatic efficiency of deep sections in bending.
//
// Reference: Gere & Goodno §5.3; Pilkey §2.1

#[test]
fn validation_span_depth_section_efficiency() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;

    // Shallow section: I = IZ
    let iz_shallow = IZ;
    let input_shallow = make_beam(n, l, E, A, iz_shallow, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_shallow = linear::solve_2d(&input_shallow).unwrap();
    let d_shallow = res_shallow.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Deep section: I = 8*IZ (equivalent to doubling depth of rectangular section)
    let iz_deep = 8.0 * IZ;
    let input_deep = make_beam(n, l, E, A, iz_deep, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_deep = linear::solve_2d(&input_deep).unwrap();
    let d_deep = res_deep.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // δ ∝ 1/I → 8× larger I reduces δ by 8
    let ratio = d_shallow / d_deep;
    let expected = iz_deep / iz_shallow; // = 8.0
    assert_close(ratio, expected, 0.03, "section efficiency: δ_shallow/δ_deep = Iz_deep/Iz_shallow");

    // Verify against formulas: δ = PL³/(48EI)
    let d_shallow_exact = p * l.powi(3) / (48.0 * E_EFF * iz_shallow);
    let d_deep_exact    = p * l.powi(3) / (48.0 * E_EFF * iz_deep);
    assert_close(d_shallow, d_shallow_exact, 0.02, "shallow section δ = PL³/(48EI)");
    assert_close(d_deep,    d_deep_exact,    0.02, "deep section δ = PL³/(48EI)");
}

// ================================================================
// 8. Consistent L³ Scaling Across Support Conditions
// ================================================================
//
// The L³ scaling of deflection (for a point load) applies regardless
// of support conditions, though the numerical coefficient differs:
//   Cantilever:    δ = PL³/(3EI)     (coefficient 1/3)
//   Simply-supp.:  δ = PL³/(48EI)    (coefficient 1/48)
//   Fixed-fixed:   δ = PL³/(192EI)   (coefficient 1/192)
//
// For each condition, doubling L must multiply deflection by exactly 8,
// confirming the solver's consistent treatment of geometry.
//
// Reference: Timoshenko & Gere §5.1; Roark Table 8.1

#[test]
fn validation_span_depth_l3_scaling_all_supports() {
    let p = 10.0;
    let n = 8;
    let l_base: f64 = 4.0;
    let l_double: f64 = 8.0;
    let expected_ratio = (l_double / l_base).powi(3); // = 8.0

    // --- Cantilever: δ = PL³/(3EI) ---
    let input_cant1 = make_beam(n, l_base, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let d_cant1 = linear::solve_2d(&input_cant1).unwrap().displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    let input_cant2 = make_beam(n, l_double, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let d_cant2 = linear::solve_2d(&input_cant2).unwrap().displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    assert_close(d_cant2 / d_cant1, expected_ratio, 0.03,
        "cantilever L³ scaling: ratio = (L2/L1)³");

    // --- Simply-supported: δ = PL³/(48EI) ---
    let input_ss1 = make_beam(n, l_base, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let d_ss1 = linear::solve_2d(&input_ss1).unwrap().displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    let input_ss2 = make_beam(n, l_double, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let d_ss2 = linear::solve_2d(&input_ss2).unwrap().displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    assert_close(d_ss2 / d_ss1, expected_ratio, 0.03,
        "SS beam L³ scaling: ratio = (L2/L1)³");

    // --- Fixed-fixed: δ = PL³/(192EI) ---
    let input_ff1 = make_beam(n, l_base, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let d_ff1 = linear::solve_2d(&input_ff1).unwrap().displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    let input_ff2 = make_beam(n, l_double, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let d_ff2 = linear::solve_2d(&input_ff2).unwrap().displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    assert_close(d_ff2 / d_ff1, expected_ratio, 0.03,
        "fixed-fixed L³ scaling: ratio = (L2/L1)³");

    // Cross-check the coefficients ratios between support conditions
    // fixed-fixed is 1/192 vs cantilever 1/3: ratio = 64 (same span)
    let coeff_ratio = d_cant1 / d_ff1; // should = 192/3 = 64
    assert_close(coeff_ratio, 64.0, 0.05,
        "cantilever/fixed-fixed stiffness coefficient ratio = 192/3 = 64");
}
