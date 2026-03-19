/// Validation: Detailed force equilibrium conditions.
///
/// Tests verify global and element-level equilibrium for various structures:
///   1. Global vertical equilibrium — SS beam point load
///   2. Global vertical equilibrium — SS beam UDL
///   3. Global moment equilibrium — cantilever point load
///   4. Global moment equilibrium — fixed-fixed beam UDL
///   5. Horizontal equilibrium — portal with lateral load
///   6. Element shear equilibrium — constant shear in point-loaded beam
///   7. Element moment-shear relationship — UDL shear drop
///   8. Joint equilibrium at internal node — continuous beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// E_EFF = E * 1000.0 for analytical formulas (E in MPa, lengths in m => kN/m^2)
#[allow(dead_code)]
const E_EFF: f64 = E * 1000.0;

// ═══════════════════════════════════════════════════════════════
// 1. Global vertical equilibrium — SS beam point load
//    P at midspan. Sum of ry reactions = P.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_global_vertical_ss_point_load() {
    let l = 10.0;
    let p = 80.0;
    let n = 8;

    // Point load at midspan node (node n/2 + 1 = 5)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 1e-6, "SS point load: sum(Ry) = P");

    // Each reaction should be P/2 by symmetry
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.rz, p / 2.0, 1e-6, "SS point load: R_left = P/2");
    assert_close(r_right.rz, p / 2.0, 1e-6, "SS point load: R_right = P/2");

    // Horizontal reactions should be zero (no horizontal loads)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 1e-6, "SS point load: sum(Rx) = 0");
}

// ═══════════════════════════════════════════════════════════════
// 2. Global vertical equilibrium — SS beam UDL
//    q*L total load. Sum of ry reactions = q*L.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_global_vertical_ss_udl() {
    let l = 12.0;
    let q = 15.0;
    let n = 6;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let total_load = q * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 1e-6, "SS UDL: sum(Ry) = q*L");

    // By symmetry each reaction = q*L/2
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.rz, total_load / 2.0, 1e-6, "SS UDL: R_left = qL/2");
    assert_close(r_right.rz, total_load / 2.0, 1e-6, "SS UDL: R_right = qL/2");
}

// ═══════════════════════════════════════════════════════════════
// 3. Global moment equilibrium — cantilever point load
//    Fixed base. P at tip. mz_reaction = P*L, ry_reaction = P.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_global_moment_cantilever_point_load() {
    let l = 8.0;
    let p = 50.0;
    let n = 8;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Only one support at node 1 (fixed)
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical equilibrium: Ry = P
    assert_close(r.rz, p, 1e-6, "Cantilever: Ry = P");

    // Moment equilibrium about the fixed support:
    // Applied load creates moment = -P * L about the support (clockwise)
    // Reaction moment Mz must balance it: Mz = P * L
    // The sign depends on convention; the magnitude must match.
    assert_close(r.my.abs(), p * l, 1e-6, "Cantilever: |Mz| = P*L");

    // Global moment equilibrium about the tip (node n+1):
    // Ry * L + Mz - P * 0 = 0  =>  Ry * L + Mz = 0 (if P acts at the tip)
    // Actually: sum of moments about tip = Ry * (-L) + Mz + 0 = 0
    // i.e., Mz = Ry * L (with consistent signs from the solver)
    // We just verify: |Mz| = |Ry| * L
    assert_close(r.my.abs(), r.rz.abs() * l, 1e-6, "Cantilever: |Mz| = |Ry|*L");
}

// ═══════════════════════════════════════════════════════════════
// 4. Global moment equilibrium — fixed-fixed beam UDL
//    Sum of ry = q*L,
//    moment equilibrium about left support:
//      ry_right*L + mz_left + mz_right - q*L*L/2 = 0
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_global_moment_fixed_fixed_udl() {
    let l = 10.0;
    let q = 12.0;
    let n = 8;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: sum Ry = q*L
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 1e-6, "FF UDL: sum(Ry) = q*L");

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Moment equilibrium about the left support:
    // Positive moment = CCW. The distributed load creates a CW moment about left support.
    // Moment of distributed load about left support = q*L*(L/2) = q*L^2/2 (downward, so CW)
    // Reactions: Ry_right creates CCW moment = Ry_right * L about left support
    // Mz_left (reaction moment) and Mz_right (reaction moment) also contribute.
    //
    // Equilibrium: Ry_right * L + Mz_left + Mz_right - q*L^2/2 = 0
    //
    // Note: the sign convention from the solver has downward loads as negative fy,
    // and reactions as positive ry (upward). Moments follow from there.
    // We check: Ry_right * L + Mz_left + Mz_right = q*L^2/2
    let moment_residual = r_right.rz * l + r_left.my + r_right.my;
    let expected_load_moment = q * l * l / 2.0;
    assert_close(
        moment_residual,
        expected_load_moment,
        1e-4,
        "FF UDL: moment equilibrium about left support",
    );

    // Also verify the known analytical values:
    // Ry_left = Ry_right = q*L/2 = 60
    assert_close(r_left.rz, q * l / 2.0, 1e-4, "FF UDL: Ry_left = qL/2");
    assert_close(r_right.rz, q * l / 2.0, 1e-4, "FF UDL: Ry_right = qL/2");
    // Mz = qL^2/12 = 100 at each end
    assert_close(r_left.my.abs(), q * l * l / 12.0, 0.02, "FF UDL: |Mz_left| = qL^2/12");
    assert_close(r_right.my.abs(), q * l * l / 12.0, 0.02, "FF UDL: |Mz_right| = qL^2/12");
}

// ═══════════════════════════════════════════════════════════════
// 5. Horizontal equilibrium — portal with lateral load
//    Fixed base portal, H at beam level. Sum of rx at bases = H.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_horizontal_portal_lateral_load() {
    let h = 5.0;
    let w = 8.0;
    let lateral = 30.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum(Rx) + H = 0  =>  sum(Rx) = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 1e-6, "Portal lateral: sum(Rx) = -H");

    // Vertical equilibrium: no vertical applied loads => sum(Ry) = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 0.0, 1e-4, "Portal lateral: sum(Ry) = 0");

    // Global moment equilibrium about node 1 (at origin (0,0)):
    // Applied: H in +x at node 2 (0, h). Moment about origin = H * (-h) = -H*h.
    // Reactions at node 1 (0,0): only Mz_1 contributes (Rx_1 and Ry_1 have zero arms).
    // Reactions at node 4 (w,0): Ry_4 * w + Mz_4 (Rx_4 at y=0 has no moment arm).
    // Equilibrium: -H*h + Mz_1 + Mz_4 + Ry_4 * w = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let moment_residual = -lateral * h + r1.my + r4.my + r4.rz * w;
    assert!(
        moment_residual.abs() < 1e-3,
        "Portal lateral: moment equilibrium about node 1, residual = {:.6}",
        moment_residual,
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Element shear equilibrium — constant shear in point-loaded beam
//    SS beam, P at midspan. For elements without distributed load:
//    v_start should equal v_end. Shear jump at load = P.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_element_shear_point_loaded_beam() {
    let l = 10.0;
    let p = 100.0;
    let n = 4; // 4 elements, load at node 3 (midspan)

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, // node 3 at x = 5.0
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // No distributed loads => within each element, shear is constant:
    // v_start = v_end for every element
    for ef in &results.element_forces {
        assert_close(
            ef.v_start,
            ef.v_end,
            1e-6,
            &format!("Elem {}: v_start = v_end (no distributed load)", ef.element_id),
        );
    }

    // Shear jump at the loaded node (node 3):
    // Element 2 ends at node 3, element 3 starts at node 3.
    // v_end of elem 2 (= shear just left of load) and v_start of elem 3 (= shear just right of load)
    // differ by P (the applied load magnitude).
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Shear left of load should be positive (upward reaction at left > 0, shear = +P/2)
    // Shear right of load should jump down by P: v_right = v_left - P
    let shear_jump = ef_left.v_end - ef_right.v_start;
    assert_close(shear_jump.abs(), p, 1e-4, "Shear jump at point load = P");

    // Also verify shear values: left of load = P/2, right of load = -P/2
    assert_close(ef_left.v_start.abs(), p / 2.0, 1e-4, "Shear left of midspan load = P/2");
    assert_close(ef_right.v_start.abs(), p / 2.0, 1e-4, "Shear right of midspan load = P/2");
}

// ═══════════════════════════════════════════════════════════════
// 7. Element moment-shear relationship
//    For a beam element with UDL q:
//    v_start - v_end = q * L_elem (shear drop relationship)
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_element_moment_shear_relationship() {
    let l = 12.0;
    let q = 10.0;
    let n = 6;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;

    for ef in &results.element_forces {
        // Shear drop: v_start - v_end = -q_i * L_elem
        // (q_i is negative for downward load, so -q_i is positive, matching the positive shear drop)
        let shear_drop = ef.v_start - ef.v_end;
        assert_close(
            shear_drop.abs(),
            q * elem_len,
            1e-4,
            &format!("Elem {}: |v_start - v_end| = q*L_elem", ef.element_id),
        );

        // Element moment equilibrium (moment about i-end):
        // m_end - m_start + v_start * L + q_i * L^2/2 = 0
        // where q_i is the actual distributed load value (negative for downward)
        let moment_eq_residual = ef.m_end - ef.m_start + ef.v_start * elem_len
            + ef.q_i * elem_len * elem_len / 2.0;
        assert!(
            moment_eq_residual.abs() < 1e-3,
            "Elem {}: moment equilibrium residual = {:.6}, should be ~0",
            ef.element_id,
            moment_eq_residual,
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 8. Joint equilibrium at internal node — continuous beam
//    Two-span continuous beam. At the middle support (pinned/roller),
//    m_end of left element = m_start of right element
//    (moment continuity: no moment reaction at a pinned internal support).
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_joint_internal_node_continuous_beam() {
    let span = 8.0;
    let q = 10.0;
    let n_per_span = 4;

    // Build a 2-span continuous beam with UDL on all elements
    let n_total = 2 * n_per_span;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // The middle support is at node (n_per_span + 1) = node 5
    // It is a rollerX support (only ry restrained, no moment restraint).
    // Therefore, joint equilibrium requires that the sum of end moments
    // from adjacent elements equals zero (no external moment at the pin).

    // Element n_per_span (elem 4) ends at node 5
    // Element n_per_span+1 (elem 5) starts at node 5
    let ef_left = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n_per_span)
        .unwrap();
    let ef_right = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n_per_span + 1)
        .unwrap();

    // At the internal node, moment continuity requires:
    // m_end(left_element) = m_start(right_element)
    // because the solver uses the beam-theory sign convention (continuous moment),
    // and at a pin/roller support there is no external moment applied.
    let moment_diff = ef_left.m_end - ef_right.m_start;
    assert!(
        moment_diff.abs() < 0.1,
        "Joint equilibrium at internal node: m_end(left) - m_start(right) = {:.6}, should be ~0",
        moment_diff,
    );

    // Verify global vertical equilibrium as well
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * q * span, 1e-4, "Continuous beam: sum(Ry) = 2*q*L");

    // Additionally check moment continuity at every internal node
    // (nodes 2, 3, 4 in span 1 and nodes 6, 7, 8 in span 2 are internal nodes)
    // For those: m_end of element i = m_start of element i+1
    for i in 1..n_total {
        let ef_i = results.element_forces.iter().find(|e| e.element_id == i).unwrap();
        let ef_next = results.element_forces.iter().find(|e| e.element_id == i + 1).unwrap();
        let node_id = i + 1; // internal node between element i and element i+1
        let m_diff = ef_i.m_end - ef_next.m_start;
        assert!(
            m_diff.abs() < 0.5,
            "Moment continuity at node {}: m_end(elem {}) - m_start(elem {}) = {:.6}, should be ~0",
            node_id,
            i,
            i + 1,
            m_diff,
        );
    }
}
