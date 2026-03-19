/// Validation: Extended Work-Energy Theorem Tests
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials" — strain energy methods
///   - Castigliano's theorems for linear elastic systems
///   - Ghali, Neville & Brown, "Structural Analysis", Ch. 7
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 4
///
/// Tests:
///   1. Cantilever tip load: W = 0.5*P*delta = P²L³/(6EI)
///   2. SS beam midspan point load: W = 0.5*P*delta_mid = P²L³/(96EI)
///   3. SS beam UDL: total external work = integral of q*delta(x) dx
///   4. Cantilever tip moment: W = 0.5*M*theta = M²L/(2EI)
///   5. Fixed-fixed beam point load: W = 0.5*P*delta < SS beam (stiffer)
///   6. Portal frame lateral: W = 0.5*F*sway
///   7. Propped cantilever: W = 0.5*P*delta with delta = 7PL³/(768EI)
///   8. Two forces: W = 0.5*(P1*d1 + P2*d2) by superposition
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m²
const IZ: f64 = 1e-4;     // m⁴

/// Effective E in kN/m² (solver multiplies E_MPa by 1000)
const E_EFF: f64 = E * 1000.0;
const EI: f64 = E_EFF * IZ; // 20_000 kN·m²

// ================================================================
// 1. Cantilever tip load: W = 0.5*P*delta = P²L³/(6EI)
// ================================================================
//
// Cantilever L=5m, 8 elements. Tip load P = -15 kN (downward).
// Analytical deflection: delta = PL³/(3EI)
// Analytical external work: W = P²L³/(6EI)
// Strain energy equals external work for linear elastic systems.

#[test]
fn validation_ext_we_cantilever_tip_load() {
    let l = 5.0;
    let n = 8;
    let p: f64 = -15.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: p,
        my: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Analytical deflection
    let delta_analytical: f64 = p * l.powi(3) / (3.0 * EI);
    assert_close(tip.uz, delta_analytical, 1e-4, "cantilever tip deflection");

    // External work from FEM
    let w_fem: f64 = 0.5 * p.abs() * tip.uz.abs();

    // Analytical strain energy: U = P²L³/(6EI)
    let w_analytical: f64 = p.powi(2) * l.powi(3) / (6.0 * EI);

    assert_close(w_fem, w_analytical, 1e-4, "W = 0.5*P*delta = P²L³/(6EI)");

    // Work must be positive
    assert!(w_fem > 0.0, "external work must be positive, got {}", w_fem);
}

// ================================================================
// 2. SS beam midspan point load: W = 0.5*P*delta_mid = P²L³/(96EI)
// ================================================================
//
// Simply-supported beam L=6m, 8 elements. Midspan load P = -20 kN.
// Analytical delta_mid = PL³/(48EI)
// Analytical W = 0.5*|P|*|delta_mid| = P²L³/(96EI)

#[test]
fn validation_ext_we_ss_beam_midspan_point_load() {
    let l = 6.0;
    let n = 8;
    let p: f64 = -20.0;

    let mid_node = n / 2 + 1; // node 5

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: p,
        my: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();

    // Analytical midspan deflection: delta = PL³/(48EI)
    let delta_analytical: f64 = p * l.powi(3) / (48.0 * EI);
    assert_close(mid.uz, delta_analytical, 1e-3, "SS midspan deflection");

    // External work from FEM: W = 0.5 * |P| * |delta|
    let w_fem: f64 = 0.5 * p.abs() * mid.uz.abs();

    // Analytical: W = P²L³/(96EI)
    let w_analytical: f64 = p.powi(2) * l.powi(3) / (96.0 * EI);

    assert_close(w_fem, w_analytical, 1e-3, "W = P²L³/(96EI) for SS beam");

    // Sanity: work and deflection both positive/downward
    assert!(w_fem > 0.0, "work must be positive");
    assert!(mid.uz < 0.0, "deflection should be downward");
}

// ================================================================
// 3. SS beam UDL: total external work = integral of q*delta(x) dx
// ================================================================
//
// Simply-supported beam L=8m, 16 elements, UDL q = -12 kN/m.
// Analytical strain energy for SS beam + UDL:
//   U = q²L⁵ / (240 EI)
// The external work equals U for linear elastic systems.
// We approximate W_ext = sum over nodes of 0.5 * (q * tributary_length) * uy
// and compare to the analytical strain energy.

#[test]
fn validation_ext_we_ss_beam_udl_integral() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -12.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical strain energy: U = q²L⁵/(240 EI)
    let u_analytical: f64 = q.powi(2) * l.powi(5) / (240.0 * EI);

    // Approximate external work by trapezoidal integration of q*delta(x)
    // For a UDL on each element, the work done is integral of q*delta(x) dx.
    // Using nodal displacements with trapezoidal rule:
    // W_ext = 0.5 * |q| * integral(|delta(x)|) dx
    // integral(delta(x)) dx ≈ sum of trapezoidal contributions
    let dx: f64 = l / n as f64;
    let mut integral_delta: f64 = 0.0;
    for i in 1..=n + 1 {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == i)
            .unwrap()
            .uz;
        let weight = if i == 1 || i == n + 1 { 0.5 } else { 1.0 };
        integral_delta += weight * uy.abs() * dx;
    }

    // W_ext = 0.5 * |q| * integral(|delta(x)|) dx
    let w_fem: f64 = 0.5 * q.abs() * integral_delta;

    // Compare FEM work to analytical strain energy
    assert_close(
        w_fem,
        u_analytical,
        0.02,
        "SS UDL: W_ext ≈ q²L⁵/(240EI)",
    );

    // Both must be positive
    assert!(w_fem > 0.0, "external work must be positive");
    assert!(u_analytical > 0.0, "analytical strain energy must be positive");
}

// ================================================================
// 4. Cantilever tip moment: W = 0.5*M*theta = M²L/(2EI)
// ================================================================
//
// Cantilever L=4m, 8 elements. Tip moment M = 12 kN·m.
// Analytical rotation: theta = ML/(EI)
// Analytical work: W = 0.5*M*theta = M²L/(2EI)

#[test]
fn validation_ext_we_cantilever_tip_moment() {
    let l = 4.0;
    let n = 8;
    let m: f64 = 12.0; // kN·m (positive = counterclockwise)

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: 0.0,
        my: m,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Analytical rotation: theta = ML/(EI)
    let theta_analytical: f64 = m * l / EI;
    assert_close(tip.ry, theta_analytical, 1e-4, "cantilever tip rotation");

    // External work from FEM: W = 0.5 * M * theta
    let w_fem: f64 = 0.5 * m * tip.ry.abs();

    // Analytical: W = M²L/(2EI)
    let w_analytical: f64 = m.powi(2) * l / (2.0 * EI);

    assert_close(w_fem, w_analytical, 1e-4, "W = 0.5*M*theta = M²L/(2EI)");

    // Work must be positive
    assert!(w_fem > 0.0, "work from moment must be positive");

    // Also verify the tip vertical displacement: delta = ML²/(2EI)
    let delta_analytical: f64 = m * l.powi(2) / (2.0 * EI);
    assert_close(
        tip.uz.abs(),
        delta_analytical.abs(),
        1e-4,
        "cantilever tip displacement under moment",
    );
}

// ================================================================
// 5. Fixed-fixed beam midspan load: W < SS beam (stiffer structure)
// ================================================================
//
// Fixed-fixed beam L=6m, 8 elements. Midspan load P = -20 kN.
// Analytical delta_ff = PL³/(192EI) for fixed-fixed.
// Analytical delta_ss = PL³/(48EI) for simply-supported.
// W_ff = P²L³/(384EI) < W_ss = P²L³/(96EI) by factor of 4.
// Fixed-fixed is 4x stiffer than SS for midspan load.

#[test]
fn validation_ext_we_fixed_fixed_vs_ss_stiffness() {
    let l = 6.0;
    let n = 8;
    let p: f64 = -20.0;
    let mid_node = n / 2 + 1;

    // --- Fixed-fixed beam ---
    let loads_ff = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: p,
        my: 0.0,
    })];
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let results_ff = linear::solve_2d(&input_ff).unwrap();

    let mid_ff = results_ff
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();

    let w_ff: f64 = 0.5 * p.abs() * mid_ff.uz.abs();

    // Analytical: delta_ff = PL³/(192EI), W_ff = P²L³/(384EI)
    let delta_ff_analytical: f64 = p * l.powi(3) / (192.0 * EI);
    assert_close(
        mid_ff.uz,
        delta_ff_analytical,
        1e-3,
        "fixed-fixed midspan deflection",
    );

    let w_ff_analytical: f64 = p.powi(2) * l.powi(3) / (384.0 * EI);
    assert_close(w_ff, w_ff_analytical, 1e-3, "W_ff = P²L³/(384EI)");

    // --- Simply-supported beam ---
    let loads_ss = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: p,
        my: 0.0,
    })];
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_ss);
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    let mid_ss = results_ss
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();

    let w_ss: f64 = 0.5 * p.abs() * mid_ss.uz.abs();

    // Fixed-fixed must be stiffer: W_ff < W_ss
    assert!(
        w_ff < w_ss,
        "Fixed-fixed work ({:.6e}) must be less than SS work ({:.6e})",
        w_ff,
        w_ss,
    );

    // The ratio should be 4: W_ss / W_ff = 4
    let ratio: f64 = w_ss / w_ff;
    assert_close(ratio, 4.0, 0.02, "W_ss / W_ff = 4 (stiffness ratio)");
}

// ================================================================
// 6. Portal frame lateral: W = 0.5*F*sway
// ================================================================
//
// Portal frame h=4m, w=6m. Lateral load F = 15 kN at top-left node.
// No gravity. External work W = 0.5 * F * ux_top.
// Both top nodes sway by the same amount (rigid beam assumption approx).
// Verify W > 0 and consistent with Clapeyron's theorem.

#[test]
fn validation_ext_we_portal_frame_lateral_sway() {
    let h = 4.0;
    let w = 6.0;
    let f_lateral: f64 = 15.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 is the top-left corner where the lateral load is applied
    let d2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();

    // Node 3 is the top-right corner
    let d3 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap();

    // External work: W = 0.5 * F * ux (at the loaded DOF)
    let w_ext: f64 = 0.5 * f_lateral * d2.ux;

    // Work must be positive (force and displacement in same direction)
    assert!(
        w_ext > 0.0,
        "portal sway work must be positive, got {} (ux={})",
        w_ext,
        d2.ux,
    );

    // Sway at node 2 must be positive (same direction as F)
    assert!(d2.ux > 0.0, "sway must follow force direction");

    // Both top nodes should sway in the same direction
    assert!(d3.ux > 0.0, "node 3 should also sway positively");

    // Clapeyron's theorem verification: 2U = F * ux
    // For a single load, 2U = F * delta, so U = 0.5 * F * delta = W_ext
    // Verify by checking reactions do zero work (supports are fixed, zero displacement)
    let d1 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 1)
        .unwrap();
    let d4 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap();

    // Support displacements should be zero (fixed supports)
    assert!(
        d1.ux.abs() < 1e-10 && d1.uz.abs() < 1e-10,
        "fixed support node 1 should have zero displacement",
    );
    assert!(
        d4.ux.abs() < 1e-10 && d4.uz.abs() < 1e-10,
        "fixed support node 4 should have zero displacement",
    );
}

// ================================================================
// 7. Propped cantilever midspan P: W = 0.5*P*delta, delta = 7PL³/(768EI)
// ================================================================
//
// Propped cantilever (fixed at left, roller at right), L=8m, 16 elements.
// Midspan point load P = -20 kN.
// Analytical deflection at midspan: delta = 7PL³/(768EI)
// (from compatibility method with one redundant)
// External work: W = 0.5 * |P| * |delta|

#[test]
fn validation_ext_we_propped_cantilever_midspan() {
    let l = 8.0;
    let n = 16;
    let p: f64 = -20.0;

    let mid_node = n / 2 + 1; // node 9

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: p,
        my: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();

    // Analytical deflection at midspan: delta = 7PL³/(768EI)
    // P is negative (downward), so delta is negative
    let delta_analytical: f64 = 7.0 * p * l.powi(3) / (768.0 * EI);
    assert_close(
        mid.uz,
        delta_analytical,
        0.02,
        "propped cantilever midspan deflection = 7PL³/(768EI)",
    );

    // External work from FEM
    let w_fem: f64 = 0.5 * p.abs() * mid.uz.abs();

    // Analytical work: W = 0.5 * |P| * |7PL³/(768EI)|
    let w_analytical: f64 = 0.5 * p.abs() * (7.0 * p.abs() * l.powi(3) / (768.0 * EI));

    assert_close(
        w_fem,
        w_analytical,
        0.02,
        "propped cantilever: W = 0.5*P*delta",
    );

    // Work must be positive
    assert!(w_fem > 0.0, "work must be positive");

    // Compare to SS beam with same load: propped cantilever is stiffer
    let delta_ss: f64 = p * l.powi(3) / (48.0 * EI);
    assert!(
        mid.uz.abs() < delta_ss.abs(),
        "propped cantilever deflection ({:.6e}) < SS deflection ({:.6e})",
        mid.uz.abs(),
        delta_ss.abs(),
    );
}

// ================================================================
// 8. Two forces: W = 0.5*(P1*d1 + P2*d2) by superposition
// ================================================================
//
// Simply-supported beam L=9m, 9 elements (nodes 1..10).
// P1 = -10 kN at node 4 (x = 3m = L/3)
// P2 = -15 kN at node 7 (x = 6m = 2L/3)
// By superposition, the total external work is:
//   W = 0.5 * (|P1|*|d1| + |P2|*|d2|)
// where d1, d2 are the displacements at the respective load points
// under the combined loading.
//
// Verification: solve combined loading and compare W to sum of
// individual strain energies plus cross terms.
// For two-load case: W = U1 + U2 + P1*d1_due_to_P2
// (by Maxwell-Betti, cross terms are equal)

#[test]
fn validation_ext_we_two_forces_superposition() {
    let l = 9.0;
    let n = 9;
    let p1: f64 = -10.0;
    let p2: f64 = -15.0;
    let node_a = 4; // x = 3m
    let node_b = 7; // x = 6m

    // --- Combined loading ---
    let loads_combined = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_a,
            fx: 0.0,
            fz: p1,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_b,
            fx: 0.0,
            fz: p2,
            my: 0.0,
        }),
    ];
    let input_combined = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_combined);
    let results_combined = linear::solve_2d(&input_combined).unwrap();

    let d_a_combined = results_combined
        .displacements
        .iter()
        .find(|d| d.node_id == node_a)
        .unwrap()
        .uz;
    let d_b_combined = results_combined
        .displacements
        .iter()
        .find(|d| d.node_id == node_b)
        .unwrap()
        .uz;

    // Total external work: W = 0.5 * (P1*d1 + P2*d2)
    // Note: P and d have same sign (both negative), so P*d is positive
    let w_combined: f64 = 0.5 * (p1 * d_a_combined + p2 * d_b_combined);

    // Work must be positive (positive-definite stiffness)
    assert!(
        w_combined > 0.0,
        "combined work must be positive, got {} (d_a={}, d_b={})",
        w_combined,
        d_a_combined,
        d_b_combined,
    );

    // --- Individual load cases for cross-validation ---
    // Case 1: only P1 at node_a
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a,
        fx: 0.0,
        fz: p1,
        my: 0.0,
    })];
    let input_1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_1);
    let results_1 = linear::solve_2d(&input_1).unwrap();

    let d_a_case1 = results_1
        .displacements
        .iter()
        .find(|d| d.node_id == node_a)
        .unwrap()
        .uz;
    let d_b_case1 = results_1
        .displacements
        .iter()
        .find(|d| d.node_id == node_b)
        .unwrap()
        .uz;

    // Case 2: only P2 at node_b
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b,
        fx: 0.0,
        fz: p2,
        my: 0.0,
    })];
    let input_2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_2);
    let results_2 = linear::solve_2d(&input_2).unwrap();

    let d_a_case2 = results_2
        .displacements
        .iter()
        .find(|d| d.node_id == node_a)
        .unwrap()
        .uz;
    let d_b_case2 = results_2
        .displacements
        .iter()
        .find(|d| d.node_id == node_b)
        .unwrap()
        .uz;

    // Superposition: displacements under combined loading should equal
    // sum of individual displacements
    assert_close(
        d_a_combined,
        d_a_case1 + d_a_case2,
        1e-4,
        "superposition d_a = d_a1 + d_a2",
    );
    assert_close(
        d_b_combined,
        d_b_case1 + d_b_case2,
        1e-4,
        "superposition d_b = d_b1 + d_b2",
    );

    // Energy decomposition:
    // W_total = U1 + U2 + cross_terms
    // U1 = 0.5 * P1 * d_a_case1  (self-energy of P1)
    // U2 = 0.5 * P2 * d_b_case2  (self-energy of P2)
    // Cross = P1 * d_a_case2 + P2 * d_b_case1
    //       = P1*d_a_due_to_P2 + P2*d_b_due_to_P1
    // But by Betti: P1*d_a_due_to_P2 = P2*d_b_due_to_P1 (when P1=P2),
    // generally: the cross terms sum correctly.
    let u1: f64 = 0.5 * p1 * d_a_case1;
    let u2: f64 = 0.5 * p2 * d_b_case2;
    let cross: f64 = 0.5 * (p1 * d_a_case2 + p2 * d_b_case1);

    let w_from_superposition: f64 = u1 + u2 + cross;

    assert_close(
        w_combined,
        w_from_superposition,
        1e-4,
        "W_combined = U1 + U2 + cross_terms (superposition)",
    );

    // Maxwell-Betti cross check: P1*d_b_case1/(P1) should equal P2*d_a_case2/(P2)
    // i.e., d_b_case1/P1 = d_a_case2/P2 (flexibility coefficients)
    // Or equivalently: P2 * d_b_case1 = P1 * d_a_case2 * (P2/P1)
    // Actually Betti: P1 * d_a_case2 = P2 * d_b_case1
    // (work done by forces of state 1 through displacements of state 2 =
    //  work done by forces of state 2 through displacements of state 1)
    let betti_lhs: f64 = p1 * d_a_case2;
    let betti_rhs: f64 = p2 * d_b_case1;
    assert_close(
        betti_lhs,
        betti_rhs,
        1e-4,
        "Betti: P1*d_a(due to P2) = P2*d_b(due to P1)",
    );
}
