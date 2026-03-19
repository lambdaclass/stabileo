/// Validation: Unit Load Method for Deflection Calculation (Extended)
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 7–8
///   - Hibbeler, "Structural Analysis", Ch. 8–9
///   - Kassimali, "Structural Analysis", Ch. 7
///
/// The unit load (virtual work) method finds deflections by applying a
/// virtual unit force at the point of interest and computing the work
/// done by internal forces.  In a linear FE solver the same result
/// appears as a flexibility coefficient: apply a unit load, solve, and
/// the displacement at the load point is the flexibility f_ii.  The
/// actual deflection is then delta = f_ii * P_actual.
///
/// Tests verify:
///   1. SS beam midspan deflection from UDL: delta = 5qL^4/(384EI)
///   2. Cantilever tip deflection via unit load flexibility
///   3. Propped cantilever: unit load at midspan flexibility coefficient
///   4. Maxwell's reciprocal theorem: f_AB = f_BA
///   5. SS beam: deflection at quarter span from midspan point load
///   6. Cantilever rotation at tip via unit moment flexibility
///   7. Two-span beam: unit load at midspan of span 1 deflection
///   8. Portal frame: unit lateral load gives lateral flexibility
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Midspan Deflection via Unit Load: delta = 5qL^4/(384EI)
// ================================================================
//
// Apply UDL on a simply-supported beam.  The exact midspan deflection
// is 5qL^4/(384EI).  We verify this by running the full UDL analysis
// and also by running a unit load analysis and confirming the
// flexibility coefficient times the total equivalent load reproduces
// the deflection.

#[test]
fn validation_unit_load_ss_beam_midspan_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0; // kN/m downward
    let e_eff: f64 = E * 1000.0;

    // Full UDL analysis
    let input_udl = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results_udl = linear::solve_2d(&input_udl).unwrap();

    let mid = n / 2 + 1;
    let mid_d = results_udl.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Exact formula: delta = 5qL^4/(384EI) for SS beam with UDL
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);

    assert_close(mid_d.uz.abs(), delta_exact, 0.02,
        "SS beam UDL midspan: 5qL^4/(384EI)");

    // Unit load verification: apply unit load at midspan, get flexibility f
    // Then delta_UDL = integral of q * influence_line = 5qL^4/(384EI)
    let unit_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -1.0, my: 0.0,
    })];
    let input_unit = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), unit_loads);
    let results_unit = linear::solve_2d(&input_unit).unwrap();

    let f_mid: f64 = results_unit.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // For unit point load at midspan: f = PL^3/(48EI) with P=1
    let f_exact: f64 = l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(f_mid, f_exact, 0.02,
        "Unit load flexibility at midspan: L^3/(48EI)");
}

// ================================================================
// 2. Cantilever Tip Deflection via Unit Load Flexibility
// ================================================================
//
// Apply unit load at tip of cantilever.  Flexibility = PL^3/(3EI)
// with P=1.  Then multiply by actual load to get true deflection.

#[test]
fn validation_unit_load_cantilever_tip_flexibility() {
    let l = 6.0;
    let n = 12;
    let p_actual = 25.0; // kN
    let e_eff: f64 = E * 1000.0;

    // Step 1: apply unit load at tip to get flexibility coefficient
    let unit_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -1.0, my: 0.0,
    })];
    let input_unit = make_beam(n, l, E, A, IZ, "fixed", None, unit_loads);
    let results_unit = linear::solve_2d(&input_unit).unwrap();

    let f_tip: f64 = results_unit.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // Flexibility = L^3/(3EI) for unit load at cantilever tip
    let f_exact: f64 = l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(f_tip, f_exact, 0.02,
        "Cantilever unit load flexibility: L^3/(3EI)");

    // Step 2: actual deflection = flexibility * actual load
    let delta_predicted: f64 = f_tip * p_actual;

    // Step 3: verify against direct analysis
    let actual_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p_actual, my: 0.0,
    })];
    let input_actual = make_beam(n, l, E, A, IZ, "fixed", None, actual_loads);
    let results_actual = linear::solve_2d(&input_actual).unwrap();

    let delta_actual: f64 = results_actual.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    assert_close(delta_predicted, delta_actual, 0.001,
        "Cantilever: flexibility * P = direct delta");
}

// ================================================================
// 3. Propped Cantilever: Unit Load at Midspan Flexibility Coefficient
// ================================================================
//
// Fixed at left, roller at right.  Apply unit load at midspan.
// The flexibility coefficient f_mid gives deflection per unit load.
// Exact: delta_mid for unit P at midspan = 7PL^3/(768EI)
// (from beam tables for propped cantilever with midspan point load).

#[test]
fn validation_unit_load_propped_cantilever_midspan() {
    let l = 8.0;
    let n = 16;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;

    // Unit load at midspan
    let unit_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -1.0, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), unit_loads);
    let results = linear::solve_2d(&input).unwrap();

    let f_mid: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Exact deflection at midspan for propped cantilever with unit P at midspan:
    // delta = 7PL^3/(768EI)  (Roark's / beam formula tables)
    let f_exact: f64 = 7.0 * l.powi(3) / (768.0 * e_eff * IZ);

    assert_close(f_mid, f_exact, 0.05,
        "Propped cantilever unit load at midspan: 7L^3/(768EI)");

    // Verify linearity: doubling the load doubles the deflection
    let double_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -2.0, my: 0.0,
    })];
    let input_double = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), double_loads);
    let results_double = linear::solve_2d(&input_double).unwrap();

    let f_double: f64 = results_double.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    assert_close(f_double, 2.0 * f_mid, 0.001,
        "Propped cantilever: linearity (2P gives 2*delta)");
}

// ================================================================
// 4. Maxwell's Reciprocal Theorem: f_AB = f_BA
// ================================================================
//
// For a linear elastic structure, the deflection at point A due to a
// unit load at point B equals the deflection at B due to a unit load
// at A:  f_AB = f_BA.
//
// We test on an SS beam with A at L/3 and B at 2L/3.

#[test]
fn validation_unit_load_maxwell_reciprocal() {
    let l = 9.0;
    let n = 9;

    let node_a = n / 3 + 1;     // node at L/3
    let node_b = 2 * n / 3 + 1; // node at 2L/3

    // Case 1: unit load at A, measure deflection at B
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fz: -1.0, my: 0.0,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();

    let f_ab: f64 = results_a.displacements.iter()
        .find(|d| d.node_id == node_b).unwrap().uz;

    // Case 2: unit load at B, measure deflection at A
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fz: -1.0, my: 0.0,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();

    let f_ba: f64 = results_b.displacements.iter()
        .find(|d| d.node_id == node_a).unwrap().uz;

    // Maxwell: f_AB = f_BA
    assert_close(f_ab, f_ba, 0.001,
        "Maxwell reciprocal: f_AB = f_BA on SS beam");

    // Also verify the exact value:
    // For SS beam, unit load at a from left, deflection at b (b > a):
    // delta(b) = P*a*(L-b)*(L^2 - a^2 - (L-b)^2) / (6*L*EI)
    let e_eff: f64 = E * 1000.0;
    let a_pos = l / 3.0;
    let b_pos = 2.0 * l / 3.0;
    let l_minus_b = l - b_pos;
    let f_exact: f64 = a_pos * l_minus_b * (l * l - a_pos * a_pos - l_minus_b * l_minus_b)
        / (6.0 * l * e_eff * IZ);

    assert_close(f_ab.abs(), f_exact, 0.02,
        "Maxwell: f_AB matches exact beam formula");
}

// ================================================================
// 5. SS Beam: Deflection at Quarter Span from Midspan Point Load
// ================================================================
//
// Point load P at midspan (L/2). Deflection at L/4:
// delta(L/4) = P*a*x*(L^2 - a^2 - x^2)/(6*L*EI) where a=L/2, x=L/4
//            = 11PL^3/(768EI)

#[test]
fn validation_unit_load_quarter_from_midspan_load() {
    let l = 8.0;
    let n = 8;
    let p = 30.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;      // midspan node (load point)
    let quarter = n / 4 + 1;  // quarter span node (measurement point)

    // Direct analysis: apply P at midspan
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let delta_quarter: f64 = results.displacements.iter()
        .find(|d| d.node_id == quarter).unwrap().uz.abs();

    // Exact: for load at a=L/2, deflection at x=L/4 (x < a):
    // delta = P*b*x*(L^2 - b^2 - x^2)/(6*L*EI) where b=L-a=L/2, x=L/4
    let a_load = l / 2.0;
    let b_load = l - a_load;
    let x_meas = l / 4.0;
    let delta_exact: f64 = p * b_load * x_meas * (l * l - b_load * b_load - x_meas * x_meas)
        / (6.0 * l * e_eff * IZ);

    assert_close(delta_quarter, delta_exact, 0.02,
        "SS beam: deflection at L/4 from midspan load");

    // Unit load cross-check: apply unit load at quarter, get deflection at midspan
    // By Maxwell's theorem this should equal delta_quarter / P
    let unit_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: quarter, fx: 0.0, fz: -1.0, my: 0.0,
    })];
    let input_unit = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), unit_loads);
    let results_unit = linear::solve_2d(&input_unit).unwrap();

    let f_mid_from_quarter: f64 = results_unit.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // By Maxwell: f_mid_from_quarter = delta_quarter / P
    assert_close(f_mid_from_quarter, delta_quarter / p, 0.001,
        "Maxwell cross-check: unit load at L/4, deflection at L/2");
}

// ================================================================
// 6. Cantilever Rotation at Tip: Unit Moment Gives Rotational
//    Flexibility
// ================================================================
//
// Apply unit moment at cantilever tip.  The rotation at the tip
// is the rotational flexibility:  theta = ML/(EI) with M=1.
// Multiplying by the actual moment gives the actual rotation.

#[test]
fn validation_unit_load_cantilever_rotational_flexibility() {
    let l = 5.0;
    let n = 10;
    let m_actual = 40.0; // kN*m
    let e_eff: f64 = E * 1000.0;

    // Step 1: apply unit moment at tip
    let unit_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: 0.0, my: 1.0,
    })];
    let input_unit = make_beam(n, l, E, A, IZ, "fixed", None, unit_loads);
    let results_unit = linear::solve_2d(&input_unit).unwrap();

    let f_rot: f64 = results_unit.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ry.abs();

    // Rotational flexibility = L/(EI) for cantilever with unit moment at tip
    let f_rot_exact: f64 = l / (e_eff * IZ);
    assert_close(f_rot, f_rot_exact, 0.02,
        "Cantilever unit moment: rotational flexibility L/(EI)");

    // Step 2: actual rotation = f_rot * M_actual
    let theta_predicted: f64 = f_rot * m_actual;

    // Step 3: verify against direct analysis
    let actual_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: 0.0, my: m_actual,
    })];
    let input_actual = make_beam(n, l, E, A, IZ, "fixed", None, actual_loads);
    let results_actual = linear::solve_2d(&input_actual).unwrap();

    let theta_actual: f64 = results_actual.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ry.abs();

    assert_close(theta_predicted, theta_actual, 0.001,
        "Cantilever: f_rot * M = direct rotation");

    // Also verify translational deflection from unit moment:
    // delta_tip = ML^2/(2EI) with M=1 => f_trans = L^2/(2EI)
    let f_trans: f64 = results_unit.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    let f_trans_exact: f64 = l * l / (2.0 * e_eff * IZ);
    assert_close(f_trans, f_trans_exact, 0.02,
        "Cantilever unit moment: translational flexibility L^2/(2EI)");
}

// ================================================================
// 7. Two-Span Beam: Unit Load at Midspan of Span 1
// ================================================================
//
// Continuous beam with two equal spans L.  Apply unit load at
// midspan of span 1.  The deflection is smaller than for a SS beam
// of span L because of continuity at the interior support.

#[test]
fn validation_unit_load_two_span_midspan() {
    let span = 6.0;
    let n_per_span = 8;
    let e_eff: f64 = E * 1000.0;

    // Midspan of span 1: node at position span/2
    let mid_span1 = n_per_span / 2 + 1;

    // Unit load at midspan of span 1
    let unit_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span1, fx: 0.0, fz: -1.0, my: 0.0,
    })];
    let input = make_continuous_beam(
        &[span, span], n_per_span, E, A, IZ, unit_loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let f_mid: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid_span1).unwrap().uz.abs();

    // For SS beam of span L: f = L^3/(48EI) = 0.02083 L^3/(EI)
    // For two-span continuous beam, midspan deflection is reduced.
    // Exact coefficient for unit load at midspan of one span:
    //   delta = 5PL^3/(768EI) from three-moment equation solution
    // (this is the well-known result for 2-span continuous beam)
    let f_ss: f64 = span.powi(3) / (48.0 * e_eff * IZ);

    // Deflection must be less than SS case (continuity stiffens)
    assert!(f_mid < f_ss,
        "Two-span: midspan deflection ({:.6e}) < SS ({:.6e})",
        f_mid, f_ss);

    // Verify against exact two-span result: 5PL^3/(768EI)
    // The factor 5/768 vs 1/48 = 16/768, so ratio ~ 5/16 = 0.3125
    let f_exact: f64 = 5.0 * span.powi(3) / (768.0 * e_eff * IZ);

    assert_close(f_mid, f_exact, 0.05,
        "Two-span: midspan deflection = 5L^3/(768EI)");

    // Linearity check: 10x the load gives 10x the deflection
    let loads_10 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span1, fx: 0.0, fz: -10.0, my: 0.0,
    })];
    let input_10 = make_continuous_beam(
        &[span, span], n_per_span, E, A, IZ, loads_10,
    );
    let results_10 = linear::solve_2d(&input_10).unwrap();

    let f_mid_10: f64 = results_10.displacements.iter()
        .find(|d| d.node_id == mid_span1).unwrap().uz.abs();

    assert_close(f_mid_10, 10.0 * f_mid, 0.001,
        "Two-span: linearity (10P gives 10*delta)");
}

// ================================================================
// 8. Portal Frame: Unit Lateral Load Gives Lateral Flexibility
// ================================================================
//
// Fixed-base portal frame.  Apply unit lateral load at beam level
// and measure the horizontal deflection (lateral flexibility).
// For a fixed-base portal with rigid beam:
//   f_lateral = h^3/(24EI) (two fixed-fixed columns in parallel)
// For a flexible beam the stiffness is less, so deflection is larger.

#[test]
fn validation_unit_load_portal_lateral_flexibility() {
    let h = 4.0;
    let w = 6.0;
    let e_eff: f64 = E * 1000.0;

    // Unit lateral load at node 2 (top of left column)
    let input_unit = make_portal_frame(h, w, E, A, IZ, 1.0, 0.0);
    let results_unit = linear::solve_2d(&input_unit).unwrap();

    // Lateral flexibility = ux at beam level
    let ux_2: f64 = results_unit.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux_3: f64 = results_unit.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    let f_lateral: f64 = ux_2.abs();

    // Both beam-level nodes should sway together (approximately)
    assert_close(ux_2, ux_3, 0.05,
        "Portal frame: beam-level nodes sway together");

    // Lower bound: rigid beam => f = h^3/(24EI) (two fixed-fixed columns)
    let f_rigid_beam: f64 = h.powi(3) / (24.0 * e_eff * IZ);

    // With flexible beam, deflection is larger than rigid-beam lower bound
    assert!(f_lateral > f_rigid_beam * 0.9,
        "Portal: f_lateral ({:.6e}) >= rigid-beam bound ({:.6e})",
        f_lateral, f_rigid_beam);

    // Verify linearity: apply actual load and compare
    let p_actual = 50.0;
    let input_actual = make_portal_frame(h, w, E, A, IZ, p_actual, 0.0);
    let results_actual = linear::solve_2d(&input_actual).unwrap();

    let delta_actual: f64 = results_actual.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    let delta_predicted: f64 = f_lateral * p_actual;
    assert_close(delta_predicted, delta_actual, 0.001,
        "Portal: f_lateral * P = direct lateral deflection");

    // Verify that the lateral flexibility is positive (load and displacement
    // in the same direction)
    assert!(ux_2 > 0.0,
        "Portal: positive lateral flexibility (ux={:.6e})", ux_2);
}
