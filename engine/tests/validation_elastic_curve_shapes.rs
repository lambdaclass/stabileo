/// Validation: Elastic Curve Shapes (Deflected Shape)
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", Ch. 9
///   - Hibbeler, "Mechanics of Materials", Ch. 12
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9
///
/// These tests verify the shape of the elastic curve (deflected shape)
/// for standard beam cases against closed-form analytical formulas.
/// Rather than checking a single peak deflection value, each test
/// evaluates the deflection at multiple nodes along the span and
/// compares against the continuous analytical expression.
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: Parabolic-Like Deflection Shape
// ================================================================
//
// For a simply-supported beam with uniform load q (downward):
//   delta(x) = q*x*(L^3 - 2*L*x^2 + x^3) / (24*E*I)
// Verified at quarter-span, midspan, and three-quarter span.

#[test]
fn validation_elastic_curve_shape_ss_udl_parabolic() {
    let l = 10.0;
    let n: usize = 20;
    let q: f64 = -8.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check at quarter-span (node n/4 + 1), midspan (n/2 + 1), three-quarter (3n/4 + 1)
    let check_nodes = vec![
        (n / 4 + 1, l / 4.0, "quarter-span"),
        (n / 2 + 1, l / 2.0, "midspan"),
        (3 * n / 4 + 1, 3.0 * l / 4.0, "three-quarter"),
    ];

    for (node_id, x, label) in check_nodes {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uy;
        // Analytical: delta(x) = q*x*(L^3 - 2*L*x^2 + x^3) / (24*EI)
        // q is negative (downward), so delta is negative (downward).
        let delta_exact =
            q * x * (l.powi(3) - 2.0 * l * x * x + x.powi(3)) / (24.0 * ei);
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.03,
            &format!("SS UDL shape at {}", label),
        );
    }
}

// ================================================================
// 2. Cantilever Tip Load: Cubic Deflection Shape
// ================================================================
//
// For a cantilever (fixed at x=0, free at x=L) with tip load P downward:
//   delta(x) = P/(6*EI) * (3*L*x^2 - x^3)
// Verified at several nodes along the span.

#[test]
fn validation_elastic_curve_shape_cantilever_tip_load_cubic() {
    let l = 6.0;
    let n: usize = 12;
    let p = 15.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check at quarter, half, three-quarter, and tip
    let check_nodes = vec![
        (n / 4 + 1, l / 4.0, "quarter"),
        (n / 2 + 1, l / 2.0, "midspan"),
        (3 * n / 4 + 1, 3.0 * l / 4.0, "three-quarter"),
        (n + 1, l, "tip"),
    ];

    for (node_id, x, label) in check_nodes {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uy;
        // Analytical: delta(x) = P/(6*EI) * (3*L*x^2 - x^3)  (downward positive in formula)
        // Solver returns negative uy for downward deflection.
        let delta_exact = p / (6.0 * ei) * (3.0 * l * x * x - x.powi(3));
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.03,
            &format!("Cantilever tip load shape at {}", label),
        );
    }
}

// ================================================================
// 3. SS Beam Point Load at Midspan: Symmetric Cubic Shape
// ================================================================
//
// For a simply-supported beam with midspan point load P:
//   delta(x) = P*x/(48*EI) * (3*L^2 - 4*x^2)  for x <= L/2
// Verified at quarter-span and midspan.

#[test]
fn validation_elastic_curve_shape_ss_midspan_point_load() {
    let l = 8.0;
    let n: usize = 16;
    let p = 20.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check at quarter-span and midspan (both in left half where x <= L/2)
    let check_nodes = vec![
        (n / 4 + 1, l / 4.0, "quarter-span"),
        (mid, l / 2.0, "midspan"),
    ];

    for (node_id, x, label) in check_nodes {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uy;
        // For x <= L/2: delta(x) = P*x/(48*EI) * (3*L^2 - 4*x^2)
        let delta_exact = p * x / (48.0 * ei) * (3.0 * l * l - 4.0 * x * x);
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.03,
            &format!("SS midspan point load shape at {}", label),
        );
    }
}

// ================================================================
// 4. Fixed-Fixed Beam UDL: Quartic Deflection Shape
// ================================================================
//
// For a fixed-fixed beam with uniform load q:
//   delta(x) = q*x^2*(L-x)^2 / (24*EI)
// Verified at quarter-span and midspan.

#[test]
fn validation_elastic_curve_shape_fixed_fixed_udl_quartic() {
    let l = 8.0;
    let n: usize = 16;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check at quarter-span and midspan
    let check_nodes = vec![
        (n / 4 + 1, l / 4.0, "quarter-span"),
        (n / 2 + 1, l / 2.0, "midspan"),
    ];

    for (node_id, x, label) in check_nodes {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uy;
        // Analytical: delta(x) = q*x^2*(L-x)^2 / (24*EI)
        // q negative means downward, delta negative (downward).
        let delta_exact = q * x * x * (l - x) * (l - x) / (24.0 * ei);
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.05,
            &format!("Fixed-fixed UDL quartic shape at {}", label),
        );
    }
}

// ================================================================
// 5. Cantilever UDL: Quartic Deflection Shape
// ================================================================
//
// For a cantilever (fixed at x=0, free at x=L) with uniform load q:
//   delta(x) = q/(24*EI) * (x^4 - 4*L*x^3 + 6*L^2*x^2)
// Verified at several nodes along the span.

#[test]
fn validation_elastic_curve_shape_cantilever_udl_quartic() {
    let l = 5.0;
    let n: usize = 20;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check at quarter, half, three-quarter, and tip
    let check_nodes = vec![
        (n / 4 + 1, l / 4.0, "quarter"),
        (n / 2 + 1, l / 2.0, "midspan"),
        (3 * n / 4 + 1, 3.0 * l / 4.0, "three-quarter"),
        (n + 1, l, "tip"),
    ];

    for (node_id, x, label) in check_nodes {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uy;
        // Analytical: delta(x) = q/(24*EI) * (x^4 - 4*L*x^3 + 6*L^2*x^2)
        let delta_exact = q / (24.0 * ei)
            * (x.powi(4) - 4.0 * l * x.powi(3) + 6.0 * l * l * x * x);
        assert_close(
            uy.abs(),
            delta_exact.abs(),
            0.03,
            &format!("Cantilever UDL quartic shape at {}", label),
        );
    }
}

// ================================================================
// 6. Maximum Deflection at Midspan for Symmetric SS Beam
// ================================================================
//
// Simply-supported beam with symmetric UDL: the midspan node must
// have the largest |uy| of all nodes.

#[test]
fn validation_elastic_curve_shape_max_at_midspan_symmetric() {
    let l = 10.0;
    let n: usize = 20;
    let q: f64 = -12.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uy
        .abs();

    // Verify midspan has the largest absolute deflection
    for disp in &results.displacements {
        assert!(
            d_mid >= disp.uy.abs() - 1e-12,
            "Symmetric SS UDL: midspan |uy|={:.6e} should be >= node {} |uy|={:.6e}",
            d_mid,
            disp.node_id,
            disp.uy.abs()
        );
    }
}

// ================================================================
// 7. Maximum Cantilever Deflection at Tip
// ================================================================
//
// Cantilever with UDL: the free-end (tip) node must have the
// largest |uy| of all nodes.

#[test]
fn validation_elastic_curve_shape_max_at_tip_cantilever() {
    let l = 6.0;
    let n: usize = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip_node = n + 1;
    let d_tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == tip_node)
        .unwrap()
        .uy
        .abs();

    // Verify tip has the largest absolute deflection
    for disp in &results.displacements {
        assert!(
            d_tip >= disp.uy.abs() - 1e-12,
            "Cantilever UDL: tip |uy|={:.6e} should be >= node {} |uy|={:.6e}",
            d_tip,
            disp.node_id,
            disp.uy.abs()
        );
    }
}

// ================================================================
// 8. Deflection Curve is Smooth (No Kinks)
// ================================================================
//
// 8-element SS beam with UDL: deflections at nodes from support
// to midspan should form a monotonically increasing sequence
// (all downward, growing toward midspan), confirming a smooth curve
// with no numerical kinks.

#[test]
fn validation_elastic_curve_shape_smooth_monotonic() {
    let l = 10.0;
    let n: usize = 8;
    let q: f64 = -10.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    // Collect |uy| for nodes 1 through midspan (n/2 + 1)
    let mid = n / 2 + 1;
    let mut deflections: Vec<(usize, f64)> = Vec::new();
    for node_id in 1..=mid {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uy
            .abs();
        deflections.push((node_id, uy));
    }

    // Verify monotonically non-decreasing from support to midspan
    for i in 1..deflections.len() {
        let (prev_id, prev_uy) = deflections[i - 1];
        let (curr_id, curr_uy) = deflections[i];
        assert!(
            curr_uy >= prev_uy - 1e-12,
            "Smooth curve: |uy| at node {} ({:.6e}) should be >= |uy| at node {} ({:.6e})",
            curr_id,
            curr_uy,
            prev_id,
            prev_uy
        );
    }

    // Also verify symmetry: from midspan to the other support, deflections decrease
    let mut deflections_right: Vec<(usize, f64)> = Vec::new();
    for node_id in mid..=n + 1 {
        let uy = results
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap()
            .uy
            .abs();
        deflections_right.push((node_id, uy));
    }

    for i in 1..deflections_right.len() {
        let (prev_id, prev_uy) = deflections_right[i - 1];
        let (curr_id, curr_uy) = deflections_right[i];
        assert!(
            curr_uy <= prev_uy + 1e-12,
            "Smooth curve (right): |uy| at node {} ({:.6e}) should be <= |uy| at node {} ({:.6e})",
            curr_id,
            curr_uy,
            prev_id,
            prev_uy
        );
    }
}
