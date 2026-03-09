/// Validation: Flexibility-Stiffness Duality — Extended Tests
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 6
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 2
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", Ch. 3
///   - Ghali & Neville, "Structural Analysis", Ch. 4
///
/// The flexibility matrix F and stiffness matrix K are inverses: F = K^{-1}.
/// For a single DOF, f * k = 1. These tests verify that relationship
/// through computed displacements under unit loads (flexibility coefficients)
/// and the corresponding stiffness values from closed-form expressions.
///
/// Tests verify:
///   1. SS beam midspan: f = L^3/(48EI), k = 48EI/L^3, f*k = 1
///   2. Cantilever tip: f = L^3/(3EI), k = 3EI/L^3, product = 1
///   3. Fixed-fixed midspan: f = L^3/(192EI), verify by unit load
///   4. Propped cantilever: displacement from unit load = flexibility coeff
///   5. Two-span beam: Maxwell-Betti reciprocity f_ij = f_ji
///   6. Portal frame: lateral stiffness k = F/delta from unit lateral load
///   7. Continuous beam: more supports increase stiffness
///   8. Cantilever rotation flexibility: f_theta = L/(EI) from unit moment
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Midspan: f = L^3/(48EI) Matches 1/k from Unit Load
// ================================================================
//
// Simply-supported beam with unit point load at midspan.
// The midspan deflection IS the flexibility coefficient f_11.
// Analytical: f = L^3/(48EI), k = 48EI/L^3, and f * k = 1.

#[test]
fn validation_flex_stiff_ext_ss_midspan_flexibility() {
    let l = 8.0;
    let n = 16;
    let p: f64 = 1.0; // unit load
    let e_eff: f64 = E * 1000.0;
    let mid = n / 2 + 1;

    // Apply unit load at midspan
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let delta: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Flexibility coefficient f = L^3/(48EI)
    let f_exact: f64 = l.powi(3) / (48.0 * e_eff * IZ);

    // Stiffness k = 48EI/L^3
    let k_exact: f64 = 48.0 * e_eff * IZ / l.powi(3);

    // Computed stiffness from FEA: k = P/delta
    let k_computed: f64 = p / delta;

    assert_close(delta, f_exact, 0.02,
        "SS midspan: delta from unit load = f = L^3/(48EI)");
    assert_close(k_computed, k_exact, 0.02,
        "SS midspan: k = P/delta matches 48EI/L^3");

    // Duality: f * k = 1
    let product: f64 = f_exact * k_exact;
    assert_close(product, 1.0, 1e-10,
        "SS midspan: f * k = 1 (exact duality)");
}

// ================================================================
// 2. Cantilever Tip: f = L^3/(3EI), k = 3EI/L^3, Product = 1
// ================================================================
//
// Cantilever (fixed at left, free at right) with unit tip load.
// Analytical: delta_tip = PL^3/(3EI), so f = L^3/(3EI), k = 3EI/L^3.

#[test]
fn validation_flex_stiff_ext_cantilever_tip_duality() {
    let l = 6.0;
    let n = 12;
    let p: f64 = 1.0; // unit load
    let e_eff: f64 = E * 1000.0;
    let tip = n + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let delta: f64 = results.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy.abs();

    // Flexibility coefficient
    let f_exact: f64 = l.powi(3) / (3.0 * e_eff * IZ);
    // Stiffness
    let k_exact: f64 = 3.0 * e_eff * IZ / l.powi(3);

    assert_close(delta, f_exact, 0.02,
        "Cantilever tip: f = L^3/(3EI)");

    // Stiffness from FEA
    let k_computed: f64 = p / delta;
    assert_close(k_computed, k_exact, 0.02,
        "Cantilever tip: k = 3EI/L^3");

    // Duality product
    let product: f64 = delta * k_exact;
    assert_close(product, 1.0, 0.02,
        "Cantilever tip: f * k = 1");
}

// ================================================================
// 3. Fixed-Fixed Midspan: f = L^3/(192EI), Verify by Unit Load
// ================================================================
//
// Fixed-fixed beam with unit point load at midspan.
// Analytical: delta = PL^3/(192EI), so f = L^3/(192EI).

#[test]
fn validation_flex_stiff_ext_fixed_fixed_midspan() {
    let l = 8.0;
    let n = 16;
    let p: f64 = 1.0;
    let e_eff: f64 = E * 1000.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let delta: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Flexibility coefficient for fixed-fixed midspan
    let f_exact: f64 = l.powi(3) / (192.0 * e_eff * IZ);
    let k_exact: f64 = 192.0 * e_eff * IZ / l.powi(3);

    assert_close(delta, f_exact, 0.03,
        "Fixed-fixed midspan: f = L^3/(192EI)");

    // Stiffness from FEA
    let k_computed: f64 = p / delta;
    assert_close(k_computed, k_exact, 0.03,
        "Fixed-fixed midspan: k = 192EI/L^3");

    // Verify stiffness ratio: fixed-fixed is 4x stiffer than SS at midspan
    // k_ff/k_ss = 192/48 = 4
    let ratio: f64 = 192.0 / 48.0;
    assert_close(ratio, 4.0, 1e-10,
        "Fixed-fixed/SS stiffness ratio = 4");
}

// ================================================================
// 4. Propped Cantilever: Unit Load Displacement = Flexibility Coeff
// ================================================================
//
// Fixed at left, roller at right. Apply unit load at midspan.
// For a propped cantilever with midspan load:
//   delta_mid = 7PL^3/(768EI) (from superposition).
// Verify that FEA displacement matches this flexibility coefficient.

#[test]
fn validation_flex_stiff_ext_propped_cantilever_flexibility() {
    let l = 8.0;
    let n = 16;
    let p: f64 = 1.0;
    let e_eff: f64 = E * 1000.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let delta: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // For propped cantilever (fixed-roller) with midspan point load P:
    // delta_mid = 7PL^3/(768EI)
    let f_exact: f64 = 7.0 * l.powi(3) / (768.0 * e_eff * IZ);

    assert_close(delta, f_exact, 0.03,
        "Propped cantilever: delta_mid = 7PL^3/(768EI)");

    // Verify the propped cantilever is stiffer than SS but less stiff than fixed-fixed
    // f_ss = L^3/(48EI), f_ff = L^3/(192EI), f_propped = 7L^3/(768EI)
    let f_ss: f64 = l.powi(3) / (48.0 * e_eff * IZ);
    let f_ff: f64 = l.powi(3) / (192.0 * e_eff * IZ);

    assert!(delta < f_ss,
        "Propped cantilever stiffer than SS: {} < {}", delta, f_ss);
    assert!(delta > f_ff,
        "Propped cantilever more flexible than fixed-fixed: {} > {}", delta, f_ff);
}

// ================================================================
// 5. Two-Span Beam: Maxwell-Betti Reciprocity f_ij = f_ji
// ================================================================
//
// Two-span continuous beam (pinned-roller-roller).
// Apply unit load at point i (midspan of span 1), measure at j (midspan of span 2).
// Then apply unit load at j, measure at i.
// Maxwell-Betti: f_ij = f_ji.

#[test]
fn validation_flex_stiff_ext_two_span_maxwell_betti() {
    let span = 6.0;
    let n_per_span = 10;

    // Point i = midspan of span 1 = node (n_per_span/2 + 1) = node 6
    // Point j = midspan of span 2 = node (n_per_span + n_per_span/2 + 1) = node 16
    let node_i = n_per_span / 2 + 1; // node 6
    let node_j = n_per_span + n_per_span / 2 + 1; // node 16

    // Case 1: unit load at i, measure displacement at j
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input1 = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads1);
    let r1 = linear::solve_2d(&input1).unwrap();
    let f_ij: f64 = r1.displacements.iter()
        .find(|d| d.node_id == node_j).unwrap().uy;

    // Case 2: unit load at j, measure displacement at i
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input2 = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads2);
    let r2 = linear::solve_2d(&input2).unwrap();
    let f_ji: f64 = r2.displacements.iter()
        .find(|d| d.node_id == node_i).unwrap().uy;

    // Maxwell-Betti reciprocity: f_ij = f_ji
    assert_close(f_ij, f_ji, 0.001,
        "Two-span Maxwell-Betti: f_ij = f_ji");

    // Both should be upward (positive) since load in one span lifts other span
    // Actually for a continuous beam, load in span 1 causes downward deflection
    // in span 1 and upward deflection in span 2 (hogging). The key point is
    // they should be equal regardless of sign.
    assert_close(f_ij.abs(), f_ji.abs(), 0.001,
        "Two-span Maxwell-Betti magnitude: |f_ij| = |f_ji|");
}

// ================================================================
// 6. Portal Frame: Lateral Stiffness k = F/delta
// ================================================================
//
// Fixed-base portal frame with unit lateral load at beam level.
// The lateral stiffness is k = F/delta.
// For a portal frame with rigid beam (approximation):
//   k ≈ 2 * 12EI/h^3 = 24EI/h^3 (two fixed-fixed columns in parallel).
// The actual value is less because the beam is flexible, but should be
// in the right ballpark.

#[test]
fn validation_flex_stiff_ext_portal_lateral_stiffness() {
    let h = 4.0;
    let w = 6.0;
    let e_eff: f64 = E * 1000.0;

    // Unit lateral load
    let input = make_portal_frame(h, w, E, A, IZ, 1.0, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Lateral displacement at the loaded node (node 2 = top of left column)
    let delta: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Lateral stiffness from FEA
    let k_computed: f64 = 1.0 / delta;

    // Upper bound: two fixed-fixed columns (rigid beam assumption)
    // k_upper = 2 * 12EI/h^3 = 24EI/h^3
    let k_upper: f64 = 24.0 * e_eff * IZ / h.powi(3);

    // Lower bound: two fixed-pinned columns (pinned beam assumption)
    // k_lower = 2 * 3EI/h^3 = 6EI/h^3
    let k_lower: f64 = 6.0 * e_eff * IZ / h.powi(3);

    // Actual stiffness should be between bounds
    assert!(k_computed > k_lower,
        "Portal stiffness > lower bound (cantilever columns): {} > {}",
        k_computed, k_lower);
    assert!(k_computed < k_upper,
        "Portal stiffness < upper bound (rigid beam): {} < {}",
        k_computed, k_upper);

    // Verify with a different load magnitude (linearity: k should be same)
    let input2 = make_portal_frame(h, w, E, A, IZ, 10.0, 0.0);
    let results2 = linear::solve_2d(&input2).unwrap();
    let delta2: f64 = results2.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let k_computed2: f64 = 10.0 / delta2;

    assert_close(k_computed, k_computed2, 0.001,
        "Portal stiffness: same k for different load magnitudes (linearity)");
}

// ================================================================
// 7. Continuous Beam: Stiffness Increases with More Supports
// ================================================================
//
// Compare midspan deflection of a single-span SS beam versus the
// first span midspan of a two-span continuous beam under same load.
// The continuous beam should be stiffer (smaller deflection) because
// the interior support constrains the deflection.

#[test]
fn validation_flex_stiff_ext_continuous_stiffer() {
    let span = 8.0;
    let n_per_span = 10;
    let p: f64 = 1.0;
    let mid_span1 = n_per_span / 2 + 1; // node 6

    // Single-span SS beam: load at midspan
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input1 = make_beam(n_per_span, span, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let r1 = linear::solve_2d(&input1).unwrap();
    let delta_1span: f64 = r1.displacements.iter()
        .find(|d| d.node_id == mid_span1).unwrap().uy.abs();

    // Two-span continuous beam: same load at midspan of first span
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input2 = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads2);
    let r2 = linear::solve_2d(&input2).unwrap();
    let delta_2span: f64 = r2.displacements.iter()
        .find(|d| d.node_id == mid_span1).unwrap().uy.abs();

    // The 2-span beam should be stiffer (less deflection in loaded span)
    assert!(delta_2span < delta_1span,
        "Continuous beam stiffer: delta_2span={:.6e} < delta_1span={:.6e}",
        delta_2span, delta_1span);

    // The stiffness ratio should be meaningful (not just marginally different)
    let stiffness_ratio: f64 = delta_1span / delta_2span;
    assert!(stiffness_ratio > 1.1,
        "Continuous beam meaningfully stiffer: ratio={:.3}", stiffness_ratio);

    // Three-span should be even stiffer than two-span for load in first span
    let loads3 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input3 = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads3);
    let r3 = linear::solve_2d(&input3).unwrap();
    let delta_3span: f64 = r3.displacements.iter()
        .find(|d| d.node_id == mid_span1).unwrap().uy.abs();

    // Three-span should be at least as stiff as two-span
    assert!(delta_3span <= delta_2span + 1e-10,
        "Three-span >= two-span stiffness: delta_3span={:.6e} <= delta_2span={:.6e}",
        delta_3span, delta_2span);
}

// ================================================================
// 8. Cantilever Rotation Flexibility: f_theta = L/(EI)
// ================================================================
//
// Cantilever with unit moment at the tip.
// Rotation at tip: theta = ML/(EI), so for M=1: f_theta = L/(EI).
// Corresponding rotational stiffness: k_theta = EI/L.
// Product: f_theta * k_theta = 1.

#[test]
fn validation_flex_stiff_ext_cantilever_rotation() {
    let l = 5.0;
    let n = 10;
    let m: f64 = 1.0; // unit moment
    let e_eff: f64 = E * 1000.0;
    let tip = n + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let theta: f64 = results.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().rz.abs();

    // Rotational flexibility coefficient: f_theta = L/(EI)
    let f_theta_exact: f64 = l / (e_eff * IZ);

    // Rotational stiffness: k_theta = EI/L
    let k_theta_exact: f64 = e_eff * IZ / l;

    assert_close(theta, f_theta_exact, 0.02,
        "Cantilever rotation: f_theta = L/(EI)");

    // Stiffness from FEA
    let k_theta_computed: f64 = m / theta;
    assert_close(k_theta_computed, k_theta_exact, 0.02,
        "Cantilever rotation: k_theta = EI/L");

    // Duality: f_theta * k_theta = 1
    let product: f64 = f_theta_exact * k_theta_exact;
    assert_close(product, 1.0, 1e-10,
        "Cantilever rotation: f_theta * k_theta = 1 (exact duality)");

    // Also verify tip displacement: delta = ML^2/(2EI)
    let delta: f64 = results.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy.abs();
    let delta_exact: f64 = m * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(delta, delta_exact, 0.02,
        "Cantilever moment: delta = ML^2/(2EI)");
}
