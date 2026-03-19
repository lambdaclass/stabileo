/// Validation: Deflection Serviceability Checks — Extended
///
/// References:
///   - AISC Steel Construction Manual, 15th Ed., Chapter L — Serviceability
///   - IBC 2021, Table 1604.3 — Deflection Limits
///   - Timoshenko & Gere, "Mechanics of Materials"
///   - Hibbeler, "Structural Analysis", 10th Ed.
///
/// Tests verify:
///   1. SS beam midpoint load: delta = PL^3/(48EI)
///   2. SS beam two-point symmetric loads: delta = Pa(3L^2 - 4a^2)/(24EI)
///   3. Cantilever UDL: delta_tip = qL^4/(8EI)
///   4. Fixed-fixed beam midpoint load: delta = PL^3/(192EI)
///   5. L/240 total-load limit for SS beam under UDL
///   6. Propped cantilever midpoint load: delta = PL^3/(48EI) * 7/16 ratio check
///   7. Increasing Iz reduces deflection proportionally (Iz doubling halves delta)
///   8. Three-span continuous beam deflection less than two-span
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Midpoint Load Deflection
// ================================================================
//
// Simply-supported beam with concentrated load P at midspan.
// Exact midspan deflection: delta = PL^3 / (48EI).
// L = 6 m, P = 100 kN, 8 elements.

#[test]
fn validation_ss_beam_midpoint_load_deflection() {
    let l: f64 = 6.0;
    let p: f64 = 100.0;
    let n = 8;
    let e_eff = E * 1000.0;

    let mid_node = n / 2 + 1; // node 5, at midspan x = 3.0

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    // delta = PL^3 / (48EI)
    let delta_exact = p * l.powi(3) / (48.0 * e_eff * IZ);

    assert_close(mid_d.uz.abs(), delta_exact, 0.02, "SS midpoint load: PL^3/(48EI)");
}

// ================================================================
// 2. SS Beam Two-Point Symmetric Loads
// ================================================================
//
// Simply-supported beam with two symmetric loads P at distance a
// from each support.
// Midspan deflection: delta = Pa(3L^2 - 4a^2) / (24EI)
// L = 12 m, a = 4 m (loads at nodes at x=4 and x=8), P = 50 kN,
// 12 elements (elem_len = 1 m).

#[test]
fn validation_ss_beam_two_point_symmetric_loads() {
    let l: f64 = 12.0;
    let p: f64 = 50.0;
    let a: f64 = 4.0;
    let n = 12;
    let e_eff = E * 1000.0;

    // Nodes at x = 0,1,2,...,12. Load at x=4 (node 5) and x=8 (node 9).
    let node_a = 5_usize;
    let node_b = 9_usize;
    let mid_node = n / 2 + 1; // node 7 at x=6

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_a, fx: 0.0, fz: -p, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_b, fx: 0.0, fz: -p, my: 0.0,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    // delta = Pa(3L^2 - 4a^2) / (24EI)
    let delta_exact = p * a * (3.0 * l.powi(2) - 4.0 * a.powi(2)) / (24.0 * e_eff * IZ);

    assert_close(mid_d.uz.abs(), delta_exact, 0.02, "SS two-point symmetric loads");
}

// ================================================================
// 3. Cantilever UDL Tip Deflection
// ================================================================
//
// Cantilever beam under uniform distributed load q.
// Tip deflection: delta = qL^4 / (8EI).
// L = 5 m, q = 20 kN/m, 10 elements.

#[test]
fn validation_cantilever_udl_tip_deflection() {
    let l: f64 = 5.0;
    let q: f64 = 20.0;
    let n = 10;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip_node = n + 1;
    let tip_d = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();

    // delta_tip = qL^4 / (8EI)
    let delta_exact = q * l.powi(4) / (8.0 * e_eff * IZ);

    assert_close(tip_d.uz.abs(), delta_exact, 0.02, "Cantilever UDL tip: qL^4/(8EI)");
}

// ================================================================
// 4. Fixed-Fixed Beam Midpoint Load Deflection
// ================================================================
//
// Fixed-fixed beam with concentrated load P at midspan.
// Midspan deflection: delta = PL^3 / (192EI).
// L = 6 m, P = 100 kN, 8 elements.

#[test]
fn validation_fixed_fixed_midpoint_load_deflection() {
    let l: f64 = 6.0;
    let p: f64 = 100.0;
    let n = 8;
    let e_eff = E * 1000.0;

    let mid_node = n / 2 + 1;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    // delta = PL^3 / (192EI)
    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);

    assert_close(mid_d.uz.abs(), delta_exact, 0.02, "Fixed-fixed midpoint load: PL^3/(192EI)");
}

// ================================================================
// 5. L/240 Total-Load Limit for SS Beam Under UDL
// ================================================================
//
// IBC 2021 Table 1604.3 specifies L/240 for total load (dead+live)
// on floor beams. Compute the required Iz such that the midspan
// deflection of a SS beam under UDL equals exactly L/240.
// Then verify solver result matches L/240.
// L = 10 m, q = 15 kN/m, 10 elements.

#[test]
fn validation_l_over_240_total_load_limit() {
    let l: f64 = 10.0;
    let q: f64 = 15.0;
    let n = 10;
    let e_eff = E * 1000.0;

    // From delta = 5qL^4/(384*E_eff*Iz) = L/240
    // Iz_req = 5*q*L^3*240 / (384*E_eff)
    let iz_req = 5.0 * q * l.powi(3) * 240.0 / (384.0 * e_eff);

    let input = make_ss_beam_udl(n, l, E, A, iz_req, -q);
    let results = linear::solve_2d(&input).unwrap();

    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let actual_delta = mid_d.uz.abs();

    let target_delta = l / 240.0;

    assert_close(actual_delta, target_delta, 0.02, "L/240 total-load limit: delta matches target");

    // Also verify the ratio
    let ratio = l / actual_delta;
    assert_close(ratio, 240.0, 0.02, "L/240 total-load limit: ratio = 240");
}

// ================================================================
// 6. Propped Cantilever Midpoint Load Ratio
// ================================================================
//
// Propped cantilever (fixed at start, roller at end) with
// concentrated load P at midspan.
// Midspan deflection: delta_propped = 7PL^3 / (768EI)
// SS midspan deflection: delta_ss = PL^3 / (48EI)
//
// Ratio: delta_propped / delta_ss = 7/768 * 48 = 7/16 = 0.4375
// The propped cantilever is stiffer due to the fixed-end moment.
// L = 8 m, P = 80 kN, 16 elements (fine mesh for accuracy).

#[test]
fn validation_propped_cantilever_midpoint_load_ratio() {
    let l: f64 = 8.0;
    let p: f64 = 80.0;
    let n = 16;

    let mid_node = n / 2 + 1; // node 9, at x = 4

    // Simply-supported beam with midpoint load
    let input_ss = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    // Propped cantilever (fixed at start, roller at end) with midpoint load
    let input_propped = make_beam(
        n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results_propped = linear::solve_2d(&input_propped).unwrap();

    let delta_ss = results_ss.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // For propped cantilever, max deflection is not necessarily at midspan
    // but we compare the midspan value for the ratio check.
    let delta_propped = results_propped.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Ratio should be 7/16 = 0.4375
    let ratio = delta_propped / delta_ss;
    let expected_ratio: f64 = 7.0 / 16.0;

    assert_close(ratio, expected_ratio, 0.03, "Propped/SS midpoint load ratio = 7/16");

    // Propped must be stiffer than SS
    assert!(ratio < 1.0,
        "Propped cantilever must be stiffer than SS: ratio={:.4}", ratio);
}

// ================================================================
// 7. Doubling Iz Halves Deflection (Proportionality)
// ================================================================
//
// Linear elasticity implies delta is inversely proportional to Iz.
// Verify: a SS beam with 2*Iz has exactly half the midspan deflection
// of the same beam with Iz.
// L = 8 m, q = 10 kN/m, 8 elements.

#[test]
fn validation_doubling_iz_halves_deflection() {
    let l: f64 = 8.0;
    let q: f64 = 10.0;
    let n = 8;

    let mid_node = n / 2 + 1;

    // Beam with original Iz
    let input_1 = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results_1 = linear::solve_2d(&input_1).unwrap();
    let delta_1 = results_1.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Beam with 2 * Iz
    let input_2 = make_ss_beam_udl(n, l, E, A, 2.0 * IZ, -q);
    let results_2 = linear::solve_2d(&input_2).unwrap();
    let delta_2 = results_2.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // delta_1 / delta_2 should be 2.0
    let ratio = delta_1 / delta_2;
    assert_close(ratio, 2.0, 0.02, "Doubling Iz halves deflection: ratio = 2");

    // Both must be positive
    assert!(delta_1 > 0.0, "Original beam must deflect");
    assert!(delta_2 > 0.0, "Doubled-Iz beam must deflect");
}

// ================================================================
// 8. Three-Span Continuous Beam Deflection Less Than Two-Span
// ================================================================
//
// A 3-span continuous beam (each span = L/3) vs a 2-span (each = L/2),
// same total length L, same UDL. More spans = more interior supports
// = smaller maximum deflection, because each span length is shorter
// and deflection scales as span^4.
// L = 12 m, q = 10 kN/m, 6 elements per span.

#[test]
fn validation_three_span_less_than_two_span() {
    let l_total: f64 = 12.0;
    let q: f64 = 10.0;
    let n_per_span = 6;

    // Two-span continuous beam (each span = 6 m)
    let l_2span = l_total / 2.0;
    let n_total_2 = 2 * n_per_span;
    let mut loads_2 = Vec::new();
    for i in 0..n_total_2 {
        loads_2.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    let input_2span = make_continuous_beam(
        &[l_2span, l_2span], n_per_span, E, A, IZ, loads_2,
    );
    let results_2span = linear::solve_2d(&input_2span).unwrap();

    let delta_2span_max = results_2span.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // Three-span continuous beam (each span = 4 m)
    let l_3span = l_total / 3.0;
    let n_total_3 = 3 * n_per_span;
    let mut loads_3 = Vec::new();
    for i in 0..n_total_3 {
        loads_3.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    let input_3span = make_continuous_beam(
        &[l_3span, l_3span, l_3span], n_per_span, E, A, IZ, loads_3,
    );
    let results_3span = linear::solve_2d(&input_3span).unwrap();

    let delta_3span_max = results_3span.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // Three-span max deflection must be less than two-span
    assert!(delta_3span_max < delta_2span_max,
        "3-span ({:.6}) must deflect less than 2-span ({:.6})",
        delta_3span_max, delta_2span_max);

    // Since deflection scales roughly as span^4, ratio ~ (L/3)^4/(L/2)^4 = (2/3)^4 = 16/81 ~ 0.20
    // Continuous beam correction factors shift this, but ratio should be well below 1.0
    let ratio = delta_3span_max / delta_2span_max;
    assert!(ratio < 0.5,
        "3-span/2-span deflection ratio should be < 0.5: got {:.4}", ratio);

    // Both must be positive
    assert!(delta_2span_max > 0.0, "Two-span must deflect");
    assert!(delta_3span_max > 0.0, "Three-span must deflect");
}
