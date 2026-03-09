/// Validation: Stress Resultant Relationships
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4 (Relationships between load, shear, moment)
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 4
///
/// These tests verify fundamental differential/integral relationships
/// between internal force stress resultants (axial, shear, moment):
///   1. dM/dx = V for unloaded element (moment is linear when shear is constant)
///   2. Shear is constant in unloaded spans
///   3. dV/dx = -q for UDL-loaded elements
///   4. Axial force is zero in transversely-loaded frame
///   5. Element equilibrium: single-element SS beam with UDL
///   6. Moment continuity at internal nodes
///   7. Force balance (shear jump) at loaded node
///   8. Integral of shear over span equals moment change
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const REL_TOL: f64 = 0.05;
const ABS_TOL: f64 = 1e-6;

// ================================================================
// 1. dM/dx = V for Unloaded Element
// ================================================================
//
// SS beam L=8m, 4 elements, point load P=-20kN at midspan (node 3).
// Elements away from the loaded node carry no distributed load,
// so shear is constant and moment is linear within each element.
// Verify: (m_end - m_start) / h ≈ average shear = (v_start + v_end) / 2

#[test]
fn stress_resultants_dm_dx_equals_v_unloaded() {
    let l = 8.0;
    let n = 4;
    let p = -20.0; // downward

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let h = l / n as f64; // 2.0m per element

    // Check all elements: dM/dx should equal -V (solver sign convention)
    // In this solver, the moment-shear relationship is: m_end - m_start = -V_avg * h
    for ef in &results.element_forces {
        let dm_dx = (ef.m_end - ef.m_start) / h;
        let v_avg = (ef.v_start + ef.v_end) / 2.0;
        let diff = (dm_dx + v_avg).abs(); // dM/dx = -V → dM/dx + V = 0
        let denom = v_avg.abs().max(1.0);
        assert!(
            diff < ABS_TOL || diff / denom < REL_TOL,
            "Elem {}: dM/dx={:.6}, -V_avg={:.6}, diff={:.6}",
            ef.element_id, dm_dx, -v_avg, diff
        );
    }
}

// ================================================================
// 2. Shear is Constant in Unloaded Span
// ================================================================
//
// SS beam L=8m, 4 elements, point load P=-20kN at midspan (node 3).
// In elements without distributed load, v_start ≈ v_end (constant shear).
// The shear in the left half differs from the right half by the point load P.

#[test]
fn stress_resultants_constant_shear_unloaded_span() {
    let l = 8.0;
    let n = 4;
    let p = -20.0;

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Elements 1 and 2 are in the left half (before the load at node 3)
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();

    // Elements 3 and 4 are in the right half (after the load at node 3)
    let ef3 = results.element_forces.iter().find(|f| f.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|f| f.element_id == 4).unwrap();

    // Within each element, shear should be constant (v_start ≈ v_end)
    for ef in [ef1, ef2, ef3, ef4] {
        let diff = (ef.v_start - ef.v_end).abs();
        assert!(
            diff < ABS_TOL || diff / ef.v_start.abs().max(1.0) < REL_TOL,
            "Elem {}: v_start={:.6}, v_end={:.6} should be equal (no load)",
            ef.element_id, ef.v_start, ef.v_end
        );
    }

    // Left half shear ≈ same value across elements 1 and 2
    let v_left = ef1.v_start;
    let diff_left = (ef2.v_start - v_left).abs();
    assert!(
        diff_left < ABS_TOL || diff_left / v_left.abs().max(1.0) < REL_TOL,
        "Left half shear not constant: elem1={:.6}, elem2={:.6}", v_left, ef2.v_start
    );

    // Right half shear ≈ same value across elements 3 and 4
    let v_right = ef3.v_start;
    let diff_right = (ef4.v_start - v_right).abs();
    assert!(
        diff_right < ABS_TOL || diff_right / v_right.abs().max(1.0) < REL_TOL,
        "Right half shear not constant: elem3={:.6}, elem4={:.6}", v_right, ef4.v_start
    );

    // The shear jump from left to right should equal the point load magnitude
    // v_end(elem2) and v_start(elem3) are on opposite sides of the loaded node
    let shear_jump = (v_left - v_right).abs();
    let err = (shear_jump - p.abs()).abs() / p.abs();
    assert!(
        err < REL_TOL,
        "Shear jump={:.4}, expected P={:.4}, err={:.4}%",
        shear_jump, p.abs(), err * 100.0
    );
}

// ================================================================
// 3. dV/dx = -q for UDL-loaded Elements
// ================================================================
//
// SS beam L=8m, 4 elements, UDL q=-10kN/m on all elements.
// For each element: the change in shear should match the applied load.
// With downward load q_i = -10, the shear decreases along the element.

#[test]
fn stress_resultants_dv_dx_equals_neg_q() {
    let l = 8.0;
    let n = 4;
    let q = -10.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let h = l / n as f64; // 2.0m

    // For each element, the shear change should relate to the applied load
    // The total load on each element is |q| * h = 20 kN
    // v_start - v_end ≈ |q| * h (shear drops by load on element)
    for ef in &results.element_forces {
        let dv = ef.v_start - ef.v_end;
        let q_on_element = q.abs() * h;
        let err = (dv - q_on_element).abs() / q_on_element;
        assert!(
            err < REL_TOL,
            "Elem {}: dV = v_start - v_end = {:.4}, expected |q|*h = {:.4}, err = {:.4}%",
            ef.element_id, dv, q_on_element, err * 100.0
        );
    }
}

// ================================================================
// 4. Axial Force is Zero in Transversely-Loaded Frame
// ================================================================
//
// Cantilever L=6m, 3 elements, tip load fy=-10kN only.
// No horizontal load → axial force N should be zero in all elements.

#[test]
fn stress_resultants_axial_zero_no_axial_load() {
    let l = 6.0;
    let n = 3;
    let p = -10.0;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    for ef in &results.element_forces {
        assert!(
            ef.n_start.abs() < ABS_TOL,
            "Elem {} n_start={:.8} should be ~0 (no axial load)",
            ef.element_id, ef.n_start
        );
        assert!(
            ef.n_end.abs() < ABS_TOL,
            "Elem {} n_end={:.8} should be ~0 (no axial load)",
            ef.element_id, ef.n_end
        );
    }
}

// ================================================================
// 5. Element Equilibrium: Single-Element SS Beam with UDL
// ================================================================
//
// SS beam L=6m, 1 element, UDL q=-10kN/m.
// Analytical: R_A = R_B = qL/2 = 30 kN (upward).
// v_start should match R_A, and |v_start| + |v_end| should relate to total load.
// Element vertical equilibrium: v_start + v_end (signed) + q*L = 0
// (where v_start is at the left support, v_end at the right support).

#[test]
fn stress_resultants_single_element_equilibrium() {
    let l = 6.0;
    let q = -10.0;

    let input = make_ss_beam_udl(1, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    assert_eq!(results.element_forces.len(), 1);
    let ef = &results.element_forces[0];

    // Reactions: R_A = R_B = |q|*L/2 = 30 kN
    let r_expected = q.abs() * l / 2.0;

    // v_start should equal the left reaction (positive upward)
    let err_start = (ef.v_start.abs() - r_expected).abs() / r_expected;
    assert!(
        err_start < REL_TOL,
        "|v_start|={:.4}, expected R_A={:.4}", ef.v_start.abs(), r_expected
    );

    // v_end should have magnitude equal to the right reaction
    let err_end = (ef.v_end.abs() - r_expected).abs() / r_expected;
    assert!(
        err_end < REL_TOL,
        "|v_end|={:.4}, expected R_B={:.4}", ef.v_end.abs(), r_expected
    );

    // Total load on element = |q| * L = 60 kN
    let total_load = q.abs() * l;
    let shear_sum = (ef.v_start - ef.v_end).abs();
    let err_total = (shear_sum - total_load).abs() / total_load;
    assert!(
        err_total < REL_TOL,
        "|v_start - v_end|={:.4}, expected |q|*L={:.4}", shear_sum, total_load
    );

    // Verify reactions match
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r_a.ry, r_expected, REL_TOL, "R_A");
    assert_close(r_b.ry, r_expected, REL_TOL, "R_B");
}

// ================================================================
// 6. Moment Continuity at Internal Nodes
// ================================================================
//
// Continuous beam: 2 spans of 5m each, 2 elements per span (4 elements total).
// UDL q=-10kN/m on all elements.
// At each internal node, m_end of element i must equal m_start of element i+1.

#[test]
fn stress_resultants_moment_continuity() {
    let q = -10.0;
    let n_per_span = 2;

    // Build UDL loads on all 4 elements
    let total_elements = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[5.0, 5.0], n_per_span, E, A, IZ, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Sort element forces by element_id for ordered traversal
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|f| f.element_id);

    // Check moment continuity at each internal node:
    // m_end of element i should equal m_start of element i+1
    for pair in sorted_forces.windows(2) {
        let ef_left = pair[0];
        let ef_right = pair[1];
        let diff = (ef_left.m_end - ef_right.m_start).abs();
        let scale = ef_left.m_end.abs().max(ef_right.m_start.abs()).max(1.0);
        assert!(
            diff < ABS_TOL || diff / scale < REL_TOL,
            "Moment discontinuity at node between elem {} and {}: m_end={:.6}, m_start={:.6}, diff={:.6}",
            ef_left.element_id, ef_right.element_id, ef_left.m_end, ef_right.m_start, diff
        );
    }
}

// ================================================================
// 7. Force Balance (Shear Jump) at Loaded Node
// ================================================================
//
// SS beam L=8m, 4 elements, point load P=-30kN at node 3 (midspan).
// At the loaded node, the shear must jump by the applied load:
// v_end(element before) - v_start(element after) should equal -P (the load).
// The sign convention: the jump in shear equals the applied transverse force.

#[test]
fn stress_resultants_shear_jump_at_point_load() {
    let l = 8.0;
    let n = 4;
    let p = -30.0; // downward

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Element 2 ends at node 3, element 3 starts at node 3
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|f| f.element_id == 3).unwrap();

    // The shear jump magnitude at the loaded node should equal |P|
    // v_end(elem2) is the shear just left of node 3
    // v_start(elem3) is the shear just right of node 3
    // The jump = |v_end(elem2) - v_start(elem3)| should ≈ |P|
    let shear_jump = (ef2.v_end - ef3.v_start).abs();
    let err = (shear_jump - p.abs()).abs() / p.abs();
    assert!(
        err < REL_TOL,
        "Shear jump at node 3: |v_end(2) - v_start(3)| = {:.4}, expected |P| = {:.4}, err = {:.4}%",
        shear_jump, p.abs(), err * 100.0
    );

    // Also verify: shear is constant within each unloaded element
    for ef in &results.element_forces {
        let diff = (ef.v_start - ef.v_end).abs();
        assert!(
            diff < ABS_TOL || diff / ef.v_start.abs().max(1.0) < REL_TOL,
            "Elem {}: shear not constant in unloaded element: v_start={:.6}, v_end={:.6}",
            ef.element_id, ef.v_start, ef.v_end
        );
    }
}

// ================================================================
// 8. Integral of Shear Equals Moment Change (Moment Area)
// ================================================================
//
// SS beam L=10m, 5 elements, UDL q=-8kN/m.
// The integral of shear V over the full span equals M(L) - M(0).
// For a simply-supported beam: M(0) = 0 and M(L) = 0.
// So: sum of (V_avg * h) for all elements ≈ 0.

#[test]
fn stress_resultants_shear_integral_equals_moment_change() {
    let l = 10.0;
    let n = 5;
    let q = -8.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let h = l / n as f64; // 2.0m

    // Compute the integral of shear using trapezoidal rule on each element.
    // In the solver's sign convention: m_end - m_start = -V_avg * h
    // So: sum of (-V_avg * h) = M(L) - M(0) = 0 for SS beam.
    // Equivalently: sum of (V_avg * h) should ≈ 0.
    let shear_integral: f64 = results.element_forces.iter()
        .map(|ef| (ef.v_start + ef.v_end) / 2.0 * h)
        .sum();

    // For SS beam: M(0) = 0 and M(L) = 0, so integral should be ≈ 0
    // The scale is |q|*L^2/8 (max moment) for meaningful comparison
    let m_max = q.abs() * l * l / 8.0;
    assert!(
        shear_integral.abs() < ABS_TOL || shear_integral.abs() / m_max < REL_TOL,
        "Shear integral = {:.6}, expected ≈ 0 (M(L)-M(0)=0), scale M_max={:.4}",
        shear_integral, m_max
    );

    // Also verify element-by-element: moment change = -V_avg * h (solver convention)
    // For linearly varying shear (UDL), (v_start+v_end)/2 is the exact average.
    for ef in &results.element_forces {
        let dm = ef.m_end - ef.m_start;
        let v_avg = (ef.v_start + ef.v_end) / 2.0;
        let neg_integral = -v_avg * h;
        let diff = (dm - neg_integral).abs();
        let scale = dm.abs().max(1.0);
        assert!(
            diff < ABS_TOL || diff / scale < REL_TOL,
            "Elem {}: M_end - M_start = {:.6}, -V_avg*h = {:.6}, diff = {:.6}",
            ef.element_id, dm, neg_integral, diff
        );
    }
}
