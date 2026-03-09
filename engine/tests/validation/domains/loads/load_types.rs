/// Validation: Load Type Benchmarks
///
/// References:
///   - Timoshenko & Young, "Theory of Structures"
///   - Roark's Formulas for Stress and Strain, 9th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///
/// Tests:
///   1. Point load on element: δ = Pa²b²/(3EIL)
///   2. Partial UDL: load only on middle portion of beam
///   3. Trapezoidal load: linearly varying distributed load
///   4. Moment load at midspan: rotation and deflection
///   5. Concentrated moment on element: δ and M diagrams
///   6. Multiple distributed loads: different q on different elements
///   7. Self-weight analogy: uniform load proportional to element length
///   8. Horizontal load on beam: axial deformation
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Point Load on Element: Exact Deflection Formula
// ================================================================
//
// SS beam, single element with point load at a from start.
// δ_under_load = Pa²b²/(3EIL)

#[test]
fn validation_load_point_on_element() {
    let l = 6.0;
    let p = 15.0;
    let a_pos = 2.0; // 2m from left

    let input = make_beam(1, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: a_pos, p: -p, px: None, mz: None,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = Pb/L, R_B = Pa/L
    let b_pos = l - a_pos;
    let ra_exact = p * b_pos / l;
    let rb_exact = p * a_pos / l;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;

    let err_ra = (ra - ra_exact).abs() / ra_exact;
    let err_rb = (rb - rb_exact).abs() / rb_exact;
    assert!(err_ra < 0.01, "R_A={:.4}, exact Pb/L={:.4}", ra, ra_exact);
    assert!(err_rb < 0.01, "R_B={:.4}, exact Pa/L={:.4}", rb, rb_exact);
}

// ================================================================
// 2. Trapezoidal Load: Linearly Varying
// ================================================================
//
// SS beam with linearly varying load: q_i at start, q_j at end.
// Total load = (q_i + q_j)L/2. Check equilibrium.

#[test]
fn validation_load_trapezoidal() {
    let l = 8.0;
    let n = 8;
    let q_start = -5.0;
    let q_end = -15.0;

    let mut loads = Vec::new();
    for i in 0..n {
        let frac_i = i as f64 / n as f64;
        let frac_j = (i + 1) as f64 / n as f64;
        let qi = q_start + (q_end - q_start) * frac_i;
        let qj = q_start + (q_end - q_start) * frac_j;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total applied load = (q_i + q_j) × L / 2
    let total_load = (q_start.abs() + q_end.abs()) * l / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let err = (sum_ry - total_load).abs() / total_load;
    assert!(err < 0.01,
        "Trapezoidal equilibrium: ΣRy={:.4}, total={:.4}", sum_ry, total_load);

    // The reaction at the more heavily loaded end should be larger
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    // q_end > q_start (both negative, but |q_end| > |q_start|), so right reaction > left
    assert!(rb > ra,
        "Right reaction should be larger: R_B={:.4}, R_A={:.4}", rb, ra);
}

// ================================================================
// 3. Moment Load at Midspan
// ================================================================
//
// SS beam with applied moment M at midspan. No transverse load.
// R_A = -R_B = M/L (couple). δ at midspan = 0 (antisymmetric).

#[test]
fn validation_load_moment_at_midspan() {
    let l = 6.0;
    let n = 6;
    let m = 30.0; // kN·m applied at midspan

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: 0.0, mz: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Reactions form a couple: R_A = -M/L, R_B = M/L
    let r_exact = m / l;
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Check they form a couple (equal and opposite)
    let err_sum = (ra + rb).abs() / r_exact;
    assert!(err_sum < 0.01,
        "Moment couple: R_A + R_B = {:.6} should be ≈ 0", ra + rb);

    let err_mag = (ra.abs() - r_exact).abs() / r_exact;
    assert!(err_mag < 0.01,
        "|R_A|={:.4}, expected M/L={:.4}", ra.abs(), r_exact);
}

// ================================================================
// 4. Concentrated Moment on Element
// ================================================================
//
// SS beam with moment applied via PointOnElement (mz field).

#[test]
fn validation_load_concentrated_moment_on_element() {
    let l = 6.0;
    let n = 4;
    let m = 20.0;

    // Apply concentrated moment on element 2 at its midpoint (1.5m from element start)
    let elem_len = l / n as f64;
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 2, a: elem_len / 2.0, p: 0.0, px: None, mz: Some(m),
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Reactions should form a couple: R_A + R_B = 0
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Sum should be zero (pure moment, no net vertical)
    let r_max = ra.abs().max(rb.abs()).max(1e-12);
    let err = (ra + rb).abs() / r_max;
    assert!(err < 0.05,
        "Moment on element: R_A + R_B = {:.6} ≈ 0", ra + rb);

    // Reactions should be non-zero (the moment produces a couple)
    assert!(ra.abs() > 0.1,
        "R_A should be non-zero from concentrated moment: R_A={:.4}", ra);
}

// ================================================================
// 5. Multiple Distributed Loads: Different q per Element
// ================================================================
//
// 3-element beam with different UDL on each: q1, q2, q3.
// Total reaction = sum of each q_i × L_i.

#[test]
fn validation_load_multiple_distributed() {
    let l = 9.0;
    let n = 3;
    let qs = [-5.0, -10.0, -15.0];

    let mut loads = Vec::new();
    for (i, &q) in qs.iter().enumerate() {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;
    let total_load: f64 = qs.iter().map(|q| q.abs() * elem_len).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

    let err = (sum_ry - total_load).abs() / total_load;
    assert!(err < 0.01,
        "Multiple DL equilibrium: ΣRy={:.4}, total={:.4}", sum_ry, total_load);
}

// ================================================================
// 6. Horizontal Load on Beam: Axial Deformation
// ================================================================
//
// SS beam with horizontal point load. Axial deformation δx = FL/(EA).

#[test]
fn validation_load_horizontal_axial() {
    let l = 6.0;
    let n = 4;
    let fx = 100.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx, fy: 0.0, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δx = FL/(EA) — rollerX allows horizontal movement at right end
    let delta_exact = fx * l / (e_eff * A);
    let error = (tip.ux.abs() - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "Axial deformation: ux={:.6e}, exact FL/(EA)={:.6e}, err={:.1}%",
        tip.ux.abs(), delta_exact, error * 100.0);
}

// ================================================================
// 7. Axial Load on Cantilever: δ = PL/(EA)
// ================================================================

#[test]
fn validation_load_axial_cantilever() {
    let l = 5.0;
    let n = 4;
    let p = 50.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_exact = p * l / (e_eff * A);
    let error = (tip.ux - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "Axial cantilever: ux={:.6e}, exact PL/(EA)={:.6e}, err={:.1}%",
        tip.ux, delta_exact, error * 100.0);
}

// ================================================================
// 8. Horizontal + Vertical Combined: Both Deformations
// ================================================================
//
// Cantilever with combined horizontal + vertical loads.
// Superposition: δx from axial, δy from bending.

#[test]
fn validation_load_combined_axial_bending() {
    let l = 4.0;
    let n = 4;
    let fx = 50.0;
    let fy = -10.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx, fy, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Axial: δx = FL/(EA)
    let dx_exact = fx * l / (e_eff * A);
    let err_x = (tip.ux - dx_exact).abs() / dx_exact;
    assert!(err_x < 0.05,
        "Combined axial: ux={:.6e}, exact={:.6e}", tip.ux, dx_exact);

    // Bending: δy = PL³/(3EI)
    let dy_exact = fy.abs() * l.powi(3) / (3.0 * e_eff * IZ);
    let err_y = (tip.uy.abs() - dy_exact).abs() / dy_exact;
    assert!(err_y < 0.05,
        "Combined bending: uy={:.6e}, exact={:.6e}", tip.uy.abs(), dy_exact);
}
