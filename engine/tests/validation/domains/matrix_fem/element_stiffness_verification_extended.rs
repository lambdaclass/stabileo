/// Validation: Element Stiffness Matrix Properties — Extended Suite
///
/// Additional tests verifying stiffness matrix correctness through observable
/// behavior. These complement the original 8 tests by covering:
///   - Superposition of loads
///   - Moment load response
///   - Propped cantilever deflection
///   - Axial-bending independence
///   - Simply-supported beam deflection under UDL
///   - Stiffness scales linearly with A for axial deformation
///   - Antisymmetric loading on fixed-fixed beam
///   - Maxwell's reciprocal theorem via unit loads
///
/// References:
///   - Przemieniecki, J.S., "Theory of Matrix Structural Analysis", 1968
///   - Timoshenko & Gere, "Mechanics of Materials"
///   - Ghali & Neville, "Structural Analysis", 7th Ed.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Superposition: Sum of Two Loads Equals Combined Response
// ================================================================
//
// Linear analysis must satisfy superposition. If load case 1 gives
// delta_1 and load case 2 gives delta_2, then applying both loads
// simultaneously must give delta_1 + delta_2.

#[test]
fn validation_ext_superposition_of_loads() {
    let l = 6.0;
    let p1 = 30.0;
    let p2 = 50.0;

    // Case 1: only p1 at tip
    let input_1 = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p1, mz: 0.0,
        })],
    );
    let res_1 = linear::solve_2d(&input_1).unwrap();
    let tip_1 = res_1.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Case 2: only p2 at tip
    let input_2 = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p2, mz: 0.0,
        })],
    );
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let tip_2 = res_2.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Combined case: p1 + p2 at tip
    let input_c = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -(p1 + p2), mz: 0.0,
        })],
    );
    let res_c = linear::solve_2d(&input_c).unwrap();
    let tip_c = res_c.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Superposition: uy_combined should equal uy_1 + uy_2
    let sum_uy = tip_1.uy + tip_2.uy;
    assert_close(tip_c.uy, sum_uy, 0.02, "superposition uy");

    // Also check rotation
    let sum_rz = tip_1.rz + tip_2.rz;
    assert_close(tip_c.rz, sum_rz, 0.02, "superposition rz");
}

// ================================================================
// 2. Cantilever with End Moment
// ================================================================
//
// A single-element cantilever with a concentrated moment M at the
// free end. The tip deflection is delta = ML^2/(2EI) and the tip
// rotation is theta = ML/(EI).

#[test]
fn validation_ext_cantilever_end_moment() {
    let l = 5.0;
    let m: f64 = 100.0; // kN*m applied moment
    let e_eff = E * 1000.0;

    let input = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: 0.0, mz: m,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // delta = M*L^2/(2*E*I) — upward for positive moment
    let expected_delta: f64 = m * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), expected_delta, 0.02, "cantilever end moment delta");

    // theta = M*L/(E*I)
    let expected_theta: f64 = m * l / (e_eff * IZ);
    assert_close(tip.rz.abs(), expected_theta, 0.02, "cantilever end moment theta");

    // Reaction moment at fixed end: M_fixed = -M (equilibrium)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.mz.abs(), m, 0.02, "cantilever end moment reaction Mz");

    // No vertical reaction (no transverse force applied)
    assert!(r1.ry.abs() < 1e-6, "cantilever end moment: Ry should be zero, got {}", r1.ry);
}

// ================================================================
// 3. Propped Cantilever Tip Load
// ================================================================
//
// Fixed at one end, roller at the other, point load P at the roller
// end. The deflection at the roller is zero (constrained), and the
// reaction at the roller is R_B = 5PL/16... but with load at roller,
// R_B = P (static). Instead, use midspan load on 2 elements.
//
// Fixed at node 1, roller at node 3, load P at midspan node 2.
// delta_mid = 7PL^3/(768EI)  (propped cantilever, midpoint load)

#[test]
fn validation_ext_propped_cantilever_midspan_load() {
    let l = 8.0;
    let p = 60.0;
    let e_eff = E * 1000.0;

    // 2 elements: node 1 fixed, node 3 roller, load at node 2 (midspan)
    let input = make_beam(
        2, l, E, A, IZ,
        "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reaction at roller (node 3): R_B = 5P/16 for midpoint load on propped cantilever
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let expected_rb = 5.0 * p / 16.0;
    assert_close(r3.ry, expected_rb, 0.02, "propped cantilever R_B");

    // Reaction at fixed end: R_A = P - R_B = 11P/16
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let expected_ra = 11.0 * p / 16.0;
    assert_close(r1.ry, expected_ra, 0.02, "propped cantilever R_A");

    // Fixed-end moment: M_A = 3PL/16
    assert_close(r1.mz.abs(), 3.0 * p * l / 16.0, 0.02, "propped cantilever M_A");

    // Midspan deflection: delta_mid = 7PL^3/(768EI)
    let mid = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let expected_delta: f64 = 7.0 * p * l.powi(3) / (768.0 * e_eff * IZ);
    assert_close(mid.uy.abs(), expected_delta, 0.02, "propped cantilever delta_mid");

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "propped cantilever equilibrium");
}

// ================================================================
// 4. Axial-Bending Independence
// ================================================================
//
// For a straight beam element, axial and bending DOFs are uncoupled.
// Applying both an axial force and a transverse force simultaneously
// should produce the same bending deflection as transverse only, and
// the same axial elongation as axial only.

#[test]
fn validation_ext_axial_bending_independence() {
    let l = 6.0;
    let p_axial = 80.0;
    let p_trans = 40.0;

    // Combined load
    let input_both = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p_axial, fy: -p_trans, mz: 0.0,
        })],
    );
    let res_both = linear::solve_2d(&input_both).unwrap();
    let tip_both = res_both.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Axial only
    let input_ax = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p_axial, fy: 0.0, mz: 0.0,
        })],
    );
    let res_ax = linear::solve_2d(&input_ax).unwrap();
    let tip_ax = res_ax.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Transverse only
    let input_tr = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p_trans, mz: 0.0,
        })],
    );
    let res_tr = linear::solve_2d(&input_tr).unwrap();
    let tip_tr = res_tr.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // ux from combined should equal ux from axial-only
    assert_close(tip_both.ux, tip_ax.ux, 0.02, "axial-bending independence: ux");

    // uy from combined should equal uy from transverse-only
    assert_close(tip_both.uy, tip_tr.uy, 0.02, "axial-bending independence: uy");

    // rz from combined should equal rz from transverse-only
    assert_close(tip_both.rz, tip_tr.rz, 0.02, "axial-bending independence: rz");

    // Axial displacement should be independent of IZ value
    assert!(tip_ax.uy.abs() < 1e-10, "axial load should produce no transverse deflection");
}

// ================================================================
// 5. Simply-Supported Beam UDL Midspan Deflection
// ================================================================
//
// For a simply-supported beam with uniform distributed load q,
// the midspan deflection is delta = 5qL^4/(384EI). Using an even
// number of elements places a node at midspan.

#[test]
fn validation_ext_ss_beam_udl_midspan_deflection() {
    let l = 10.0;
    let q = 20.0; // kN/m downward
    let n = 4; // even number -> node at midspan
    let e_eff = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan node is at L/2 = node (n/2 + 1) = node 3
    let mid_node_id = n / 2 + 1;
    let mid = results.displacements.iter().find(|d| d.node_id == mid_node_id).unwrap();

    let expected_delta: f64 = 5.0 * q * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(mid.uy.abs(), expected_delta, 0.02, "SS beam UDL midspan delta");

    // Each reaction should be qL/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.ry, q * l / 2.0, 0.02, "SS beam UDL R_A");
    assert_close(r_end.ry, q * l / 2.0, 0.02, "SS beam UDL R_B");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * l, 0.02, "SS beam UDL equilibrium");
}

// ================================================================
// 6. Stiffness Scales Linearly with A for Axial Deformation
// ================================================================
//
// Doubling the cross-section area A should halve the axial
// displacement delta = PL/(EA). This verifies A enters the axial
// stiffness correctly.

#[test]
fn validation_ext_stiffness_scales_with_a() {
    let l = 5.0;
    let p_axial = 100.0;
    let a1 = 0.01;
    let a2 = 0.02; // doubled

    let make_case = |area: f64| {
        make_beam(
            1, l, E, area, IZ,
            "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: p_axial, fy: 0.0, mz: 0.0,
            })],
        )
    };

    let results_1 = linear::solve_2d(&make_case(a1)).unwrap();
    let results_2 = linear::solve_2d(&make_case(a2)).unwrap();

    let tip_1 = results_1.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let tip_2 = results_2.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // delta_1 / delta_2 should be 2.0 (double A -> half axial displacement)
    let ratio = tip_1.ux.abs() / tip_2.ux.abs();
    assert_close(ratio, 2.0, 0.02, "A scaling: axial delta ratio");

    // Also verify absolute value for case 1
    let e_eff = E * 1000.0;
    let expected: f64 = p_axial * l / (e_eff * a1);
    assert_close(tip_1.ux, expected, 0.02, "A scaling: axial delta absolute");
}

// ================================================================
// 7. Antisymmetric End Moments on Fixed-Fixed Beam
// ================================================================
//
// A fixed-fixed beam with equal and opposite moments applied at the
// two interior nodes creates an antisymmetric deformation pattern.
// For a 3-element fixed-fixed beam with +M at node 2 and -M at node 3,
// the deflections at nodes 2 and 3 should be equal in magnitude and
// opposite in sign by antisymmetry.

#[test]
fn validation_ext_antisymmetric_loading() {
    let l = 12.0;
    let p = 50.0;

    // 4-element fixed-fixed beam: nodes 1-2-3-4-5
    // Apply equal and opposite transverse loads at quarter points
    // node 2 at L/4, node 4 at 3L/4
    let input = make_beam(
        4, l, E, A, IZ,
        "fixed", Some("fixed"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 4, fx: 0.0, fy: p, mz: 0.0,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();

    // Antisymmetry: uy at node 2 and node 4 should be equal in magnitude, opposite in sign
    assert_close(d2.uy.abs(), d4.uy.abs(), 0.02, "antisymmetric uy magnitudes");
    assert!(
        d2.uy * d4.uy < 0.0,
        "antisymmetric uy signs: d2.uy={:.6}, d4.uy={:.6} should have opposite signs",
        d2.uy, d4.uy
    );

    // Midspan node (node 3) should have zero transverse displacement by antisymmetry
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(
        d3.uy.abs() < 1e-6,
        "antisymmetric midspan uy should be ~0, got {:.6e}",
        d3.uy
    );

    // Global vertical equilibrium: reactions must sum to zero (equal and opposite loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        sum_ry.abs() < 1e-6,
        "antisymmetric load equilibrium: sum_ry={:.6e}, expected ~0",
        sum_ry
    );
}

// ================================================================
// 8. Maxwell's Reciprocal Theorem
// ================================================================
//
// Maxwell's theorem states that for a linear elastic structure, the
// displacement at point A due to a unit load at point B equals the
// displacement at point B due to a unit load at point A.
//
// Test with a 3-element simply-supported beam:
//   Case 1: unit load at node 2, measure uy at node 3
//   Case 2: unit load at node 3, measure uy at node 2
// These two displacements must be equal.

#[test]
fn validation_ext_maxwell_reciprocal_theorem() {
    let l = 9.0;
    let p = 1.0; // unit load

    // Case 1: load at node 2 (L/3 from left), measure at node 3 (2L/3 from left)
    let input_1 = make_beam(
        3, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_1 = linear::solve_2d(&input_1).unwrap();
    let d_ab = res_1.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;

    // Case 2: load at node 3 (2L/3 from left), measure at node 2 (L/3 from left)
    let input_2 = make_beam(
        3, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let d_ba = res_2.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;

    // Maxwell's reciprocal theorem: d_ab == d_ba
    assert_close(d_ab, d_ba, 0.02, "Maxwell reciprocal: d_AB vs d_BA");

    // Both should be negative (downward)
    assert!(d_ab < 0.0, "Maxwell: d_AB should be negative (downward), got {:.6e}", d_ab);
    assert!(d_ba < 0.0, "Maxwell: d_BA should be negative (downward), got {:.6e}", d_ba);

    // Verify against analytical formula for SS beam with point load at a from left:
    // delta(x) for x > a: delta = P*a*(L-x)*(2*L*x - x^2 - a^2) / (6*E*I*L)
    // Here a = L/3, x = 2L/3:
    let e_eff = E * 1000.0;
    let a_pos: f64 = l / 3.0;
    let x_pos: f64 = 2.0 * l / 3.0;
    let expected: f64 = p * a_pos * (l - x_pos) * (2.0 * l * x_pos - x_pos.powi(2) - a_pos.powi(2))
        / (6.0 * e_eff * IZ * l);
    assert_close(d_ab.abs(), expected, 0.02, "Maxwell: analytical deflection");
}
