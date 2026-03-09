/// Validation: Extended detailed force equilibrium conditions.
///
/// Tests verify global and element-level equilibrium for various structures:
///   1. Global equilibrium — three-span continuous beam with UDL
///   2. Moment equilibrium about arbitrary point — SS beam with two point loads
///   3. Axial force continuity in a truss — simple truss triangle
///   4. Portal frame combined loading — vertical + lateral equilibrium
///   5. Element force continuity — propped cantilever with UDL
///   6. Moment equilibrium about midspan — fixed-pinned beam with point load
///   7. Shear-moment consistency in continuous beam — dV/dx = q check
///   8. Global equilibrium — asymmetric two-span continuous beam
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
// 1. Global equilibrium — three-span continuous beam with UDL
//    Three equal spans, uniform load on all spans.
//    Sum of vertical reactions = q * 3L (total load).
//    Sum of horizontal reactions = 0 (no horizontal loads).
//    Moment equilibrium about the left support.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_three_span_continuous_beam_udl() {
    let span = 6.0;
    let q = 20.0;
    let n_per_span = 4;
    let n_total = 3 * n_per_span;

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
    let input = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: sum(Ry) = q * 3 * span
    let total_load = q * 3.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 1e-6, "3-span UDL: sum(Ry) = 3*q*L");

    // Horizontal equilibrium: sum(Rx) = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 1e-6, "3-span UDL: sum(Rx) = 0");

    // Moment equilibrium about the left support (node 1 at x=0):
    // Sum of reaction moments = sum of load moments
    // Each reaction at node_i with x-coordinate x_i contributes Ry_i * x_i
    // The distributed load on each element contributes q * L_elem * x_mid
    let elem_len = span / n_per_span as f64;
    let mut sum_reaction_moment: f64 = 0.0;
    for r in &results.reactions {
        // x-coordinate of reaction node
        let node_x = (r.node_id - 1) as f64 * elem_len;
        sum_reaction_moment += r.ry * node_x;
        // mz reactions also contribute (only present at fixed supports, none here)
        sum_reaction_moment += r.mz;
    }
    // Load moment about left support: integral of q * x dx from 0 to 3L
    // = q * (3L)^2 / 2
    let total_length = 3.0 * span;
    let load_moment = q * total_length * total_length / 2.0;
    assert_close(
        sum_reaction_moment,
        load_moment,
        1e-4,
        "3-span UDL: moment equilibrium about left support",
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Moment equilibrium about arbitrary point — SS beam with two
//    point loads at quarter and three-quarter points.
//    Verify reactions and moment equilibrium about midspan.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_moment_about_midspan_ss_two_point_loads() {
    let l = 12.0;
    let p1 = 40.0; // at L/4
    let p2 = 60.0; // at 3L/4
    let n = 8;
    let elem_len = l / n as f64;

    // Node at L/4 = 3.0 => node index = 3.0 / elem_len + 1 = 3.0/1.5 + 1 = 3
    let node_quarter = (l / 4.0 / elem_len) as usize + 1;
    // Node at 3L/4 = 9.0 => node index = 9.0 / 1.5 + 1 = 7
    let node_three_quarter = (3.0 * l / 4.0 / elem_len) as usize + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_quarter,
            fx: 0.0,
            fy: -p1,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_three_quarter,
            fx: 0.0,
            fy: -p2,
            mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p1 + p2, 1e-6, "SS 2-load: sum(Ry) = P1 + P2");

    // Analytical reactions by statics:
    // R_left = P1 * (3L/4)/L + P2 * (L/4)/L = P1*3/4 + P2/4
    let r_left_expected = p1 * 3.0 / 4.0 + p2 / 4.0;
    // R_right = P1/4 + P2*3/4
    let r_right_expected = p1 / 4.0 + p2 * 3.0 / 4.0;

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.ry, r_left_expected, 1e-6, "SS 2-load: R_left");
    assert_close(r_right.ry, r_right_expected, 1e-6, "SS 2-load: R_right");

    // Moment equilibrium about midspan (x = L/2 = 6.0):
    // Sum of moments about midspan = 0
    // R_left * L/2 + R_right * (-L/2) - P1 * (L/2 - L/4) + P2 * (3L/4 - L/2) = 0
    // => R_left * L/2 - R_right * L/2 - P1 * L/4 + P2 * L/4 = 0
    let x_mid = l / 2.0;
    let moment_about_mid = r_left.ry * x_mid
        - r_right.ry * (l - x_mid)
        - p1 * (x_mid - l / 4.0)
        + p2 * (3.0 * l / 4.0 - x_mid);
    // Note: sign convention - downward loads create CW moment if load is to
    // the right of the point, CCW if to the left. Using consistent approach:
    // moment = sum(Ry_i * (x_i - x_ref)) - sum(P_j * (x_j - x_ref))
    // where Ry are upward reactions and P are downward loads.
    let moment_check = r_left.ry * (0.0 - x_mid)
        + r_right.ry * (l - x_mid)
        - p1 * (l / 4.0 - x_mid)
        - p2 * (3.0 * l / 4.0 - x_mid);
    assert!(
        moment_check.abs() < 1e-4,
        "SS 2-load: moment equilibrium about midspan, residual = {:.6}",
        moment_check,
    );

    // Cross-check: the moment_about_mid should also be near zero
    // (different sign convention, same physics)
    assert!(
        moment_about_mid.abs() < 1e-4,
        "SS 2-load: alternative moment check about midspan, residual = {:.6}",
        moment_about_mid,
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Axial force equilibrium in a truss — simple triangle
//    Three-node triangular truss with a vertical load at the apex.
//    Global equilibrium: sum(Rx)=0, sum(Ry)=P.
//    Element axial force continuity: n_start = -n_end for each
//    truss element (no distributed loads on trusses).
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_truss_triangle_axial_continuity() {
    let w = 6.0;
    let h = 4.0;
    let p = 50.0;

    // Nodes: 1=(0,0), 2=(w,0), 3=(w/2,h)
    // Elements: 1: 1-3, 2: 2-3, 3: 1-2
    // Supports: node 1 pinned, node 2 rollerX
    // Load: P downward at node 3
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, w / 2.0, h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 1, 2, 1, 1, true, true),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, 1e-8)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium: sum(Ry) = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 1e-6, "Truss triangle: sum(Ry) = P");

    // Global horizontal equilibrium: sum(Rx) = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 1e-6, "Truss triangle: sum(Rx) = 0");

    // By symmetry, each support takes P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.ry, p / 2.0, 1e-6, "Truss triangle: Ry_1 = P/2");
    assert_close(r2.ry, p / 2.0, 1e-6, "Truss triangle: Ry_2 = P/2");

    // For each truss element (no distributed load): n_start = n_end
    // (constant axial force along the element)
    for ef in &results.element_forces {
        let axial_residual: f64 = (ef.n_start - ef.n_end).abs();
        assert!(
            axial_residual < 1e-4,
            "Truss elem {}: n_start - n_end = {:.6}, should be ~0",
            ef.element_id,
            ef.n_start - ef.n_end,
        );
    }

    // Analytical check: inclined members have length sqrt((w/2)^2 + h^2)
    let l_inclined: f64 = ((w / 2.0).powi(2) + h.powi(2)).sqrt();
    let sin_theta = h / l_inclined;
    // Vertical equilibrium at node 3: 2 * N_inclined * sin(theta) = P
    // => N_inclined = P / (2 * sin(theta)) (compression)
    let n_inclined_expected = p / (2.0 * sin_theta);
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    // n_start should be negative (compression) for the inclined member
    assert_close(
        ef1.n_start.abs(),
        n_inclined_expected,
        1e-4,
        "Truss triangle: inclined member axial force magnitude",
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Portal frame combined loading — lateral + gravity
//    Fixed base portal with lateral load H at beam level and
//    gravity load W at each beam-column joint.
//    Global: sum(Rx) = -H, sum(Ry) = 2W.
//    Moment equilibrium about an arbitrary point (bottom-right).
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_portal_combined_loading() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 25.0;
    let gravity = -40.0; // downward

    let input = make_portal_frame(h, w, E, A, IZ, lateral, gravity);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum(Rx) = -H (reactions oppose applied load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 1e-6, "Portal combined: sum(Rx) = -H");

    // Vertical equilibrium: sum(Ry) = -2 * gravity = 2|W|
    // gravity is negative (downward), reactions should be positive (upward)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -2.0 * gravity, 1e-4, "Portal combined: sum(Ry) = 2|W|");

    // Moment equilibrium about node 4 (w, 0) — bottom right:
    // Applied loads:
    //   H at node 2 (0, h): moment about (w, 0) = H * h (CCW positive)
    //   W at node 2 (0, h): moment about (w, 0) = W * w (using signed W)
    //        => gravity * (-w) since gravity is -40 and arm is w to the left
    //   W at node 3 (w, h): moment about (w, 0) = W * 0 (directly above)
    // Reactions at node 1 (0, 0):
    //   Rx_1 at (0, 0): moment about (w, 0) = Rx_1 * 0  (same y)
    //   Ry_1 at (0, 0): moment about (w, 0) = -Ry_1 * w (to the left)
    //   Mz_1: direct moment contribution
    // Reactions at node 4 (w, 0):
    //   Rx_4, Ry_4 at (w, 0): zero arms
    //   Mz_4: direct moment contribution
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Total moment about node 4 from applied loads:
    // Using cross product: M = (x - x_ref)*Fy - (y - y_ref)*Fx
    // For H at node 2 (0, h): (0-w)*0 - (h-0)*lateral = -h*lateral
    // For W at node 2 (0, h): (0-w)*gravity - (h-0)*0 = -w*gravity
    // For W at node 3 (w, h): (w-w)*gravity - (h-0)*0 = 0
    let applied_moment_about_4 = -h * lateral - w * gravity;

    // Moment from reactions about node 4:
    // Node 1 (0, 0): (0-w)*Ry_1 - (0-0)*Rx_1 + Mz_1 = -w*Ry_1 + Mz_1
    // Node 4 (w, 0): 0 + Mz_4
    let reaction_moment_about_4 = -r1.ry * w + r1.mz + r4.mz;

    // Equilibrium: applied + reaction = 0
    let residual: f64 = (applied_moment_about_4 + reaction_moment_about_4).abs();
    assert!(
        residual < 1e-3,
        "Portal combined: moment equilibrium about node 4, residual = {:.6}",
        applied_moment_about_4 + reaction_moment_about_4,
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Element force continuity — propped cantilever with UDL
//    Fixed at left, roller at right, UDL on all elements.
//    At every internal node: m_end(elem_i) = m_start(elem_{i+1})
//    and v_end(elem_i) = v_start(elem_{i+1}) (no point loads
//    at internal nodes, so shear and moment must be continuous).
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_propped_cantilever_force_continuity() {
    let l = 10.0;
    let q = 15.0;
    let n = 6;

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
    // Fixed at left (node 1), roller at right (node n+1)
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * l, 1e-4, "Propped cantilever: sum(Ry) = q*L");

    // Analytical reactions for propped cantilever with UDL:
    // R_right (roller) = 3qL/8, R_left (fixed) = 5qL/8
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.ry, 5.0 * q * l / 8.0, 1e-3, "Propped cantilever: R_left = 5qL/8");
    assert_close(r_right.ry, 3.0 * q * l / 8.0, 1e-3, "Propped cantilever: R_right = 3qL/8");

    // Fixed-end moment: M_left = -qL^2/8 (hogging at fixed end)
    assert_close(
        r_left.mz.abs(),
        q * l * l / 8.0,
        1e-2,
        "Propped cantilever: |Mz_left| = qL^2/8",
    );

    // Force continuity at every internal node (no applied point loads there):
    // Both shear and moment must be continuous.
    for i in 1..n {
        let ef_i = results.element_forces.iter().find(|e| e.element_id == i).unwrap();
        let ef_next = results
            .element_forces
            .iter()
            .find(|e| e.element_id == i + 1)
            .unwrap();
        let node_id = i + 1;

        // Moment continuity
        let m_diff: f64 = (ef_i.m_end - ef_next.m_start).abs();
        assert!(
            m_diff < 0.5,
            "Propped cantilever node {}: moment discontinuity = {:.6}",
            node_id,
            m_diff,
        );

        // Shear continuity (no concentrated load at internal nodes)
        let v_diff: f64 = (ef_i.v_end - ef_next.v_start).abs();
        assert!(
            v_diff < 0.5,
            "Propped cantilever node {}: shear discontinuity = {:.6}",
            node_id,
            v_diff,
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. Moment equilibrium about midspan — fixed-pinned beam with
//    point load at midspan.
//    Fixed at left, pinned at right, P at midspan.
//    Verify global equilibrium and moment balance about midspan.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_fixed_pinned_beam_moment_about_midspan() {
    let l = 8.0;
    let p = 60.0;
    let n = 8;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, // midspan node = 5
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    // Fixed at left, pinned at right
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("pinned"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 1e-6, "Fixed-pinned P@mid: sum(Ry) = P");

    // Horizontal equilibrium (no horizontal loads)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 1e-6, "Fixed-pinned P@mid: sum(Rx) = 0");

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Moment equilibrium about the right support (x = L):
    // Using M = (x - x_ref)*Fy - (y - y_ref)*Fx:
    // Applied P at (L/2, 0) about (L, 0): (L/2 - L)*(-P) = P*L/2
    // Reaction at (0,0): (0-L)*Ry_left + Mz_left = -L*Ry_left + Mz_left
    // Reaction at (L,0): Mz_right = 0
    let moment_eq_right = -r_left.ry * l + r_left.mz + p * l / 2.0;
    assert!(
        moment_eq_right.abs() < 1e-3,
        "Fixed-pinned P@mid: moment equilibrium about right support, residual = {:.6}",
        moment_eq_right,
    );

    // Moment equilibrium about midspan (x = L/2):
    // Applied P at (L/2, 0) about (L/2, 0): zero (at reference point)
    // Reaction at (0,0): (0-L/2)*Ry_left + Mz_left
    // Reaction at (L,0): (L-L/2)*Ry_right + Mz_right
    let x_mid = l / 2.0;
    let moment_eq_mid = -r_left.ry * x_mid + r_left.mz + r_right.ry * x_mid + r_right.mz;
    assert!(
        moment_eq_mid.abs() < 1e-3,
        "Fixed-pinned P@mid: moment equilibrium about midspan, residual = {:.6}",
        moment_eq_mid,
    );

    // The pinned support has no moment reaction
    assert_close(r_right.mz, 0.0, 1e-6, "Fixed-pinned P@mid: Mz_right = 0 (pinned)");

    // Analytical results for fixed-pinned beam with P at midspan:
    // R_left = 11P/16, R_right = 5P/16
    assert_close(r_left.ry, 11.0 * p / 16.0, 1e-3, "Fixed-pinned P@mid: R_left = 11P/16");
    assert_close(r_right.ry, 5.0 * p / 16.0, 1e-3, "Fixed-pinned P@mid: R_right = 5P/16");
}

// ═══════════════════════════════════════════════════════════════
// 7. Shear-moment consistency in continuous beam
//    Two-span continuous beam with UDL. For each element:
//    dM/dx = V (approximated by: M_end - M_start = V_avg * L_elem)
//    and V_start - V_end = q * L_elem.
//    Also verify element-level moment equilibrium:
//    m_end - m_start + v_start * L + q * L^2/2 = 0
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_continuous_beam_shear_moment_consistency() {
    let span = 10.0;
    let q = 12.0;
    let n_per_span = 5;
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

    let elem_len = span / n_per_span as f64;

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * q * span, 1e-4, "Cont beam 2-span: sum(Ry) = 2*q*L");

    // The applied distributed load on each element (q_i in load definition)
    let q_applied: f64 = -q; // negative because downward

    for ef in &results.element_forces {
        // Shear drop: |v_start - v_end| = q * L_elem
        let shear_drop: f64 = (ef.v_start - ef.v_end).abs();
        assert_close(
            shear_drop,
            q * elem_len,
            1e-3,
            &format!("Cont beam elem {}: |v_start - v_end| = q*L_elem", ef.element_id),
        );

        // Element moment equilibrium about the i-end:
        // m_end - m_start + v_start * L + q_applied * L^2/2 = 0
        let moment_residual = ef.m_end - ef.m_start + ef.v_start * elem_len
            + q_applied * elem_len * elem_len / 2.0;
        assert!(
            moment_residual.abs() < 1e-2,
            "Cont beam elem {}: moment eq residual = {:.6}",
            ef.element_id,
            moment_residual,
        );

        // dM/dx ≈ -V_avg relationship in this solver's convention:
        // (m_end - m_start)/L = -V_avg
        let dm_dx = (ef.m_end - ef.m_start) / elem_len;
        let v_avg = (ef.v_start + ef.v_end) / 2.0;
        let dm_diff: f64 = (dm_dx + v_avg).abs();
        assert!(
            dm_diff < 1.0,
            "Cont beam elem {}: dM/dx + V_avg diff = {:.6}",
            ef.element_id,
            dm_diff,
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 8. Global equilibrium — asymmetric two-span continuous beam
//    Spans of different length (L1 = 8, L2 = 12) with UDL.
//    Sum(Ry) = q * (L1 + L2). Moment equilibrium about each
//    support verified.
// ═══════════════════════════════════════════════════════════════

#[test]
fn equilibrium_asymmetric_two_span_continuous_beam() {
    let l1 = 8.0;
    let l2 = 12.0;
    let q = 18.0;
    let n_per_span = 4;
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
    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_load = q * (l1 + l2);

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 1e-4, "Asym 2-span: sum(Ry) = q*(L1+L2)");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 1e-6, "Asym 2-span: sum(Rx) = 0");

    // Identify reactions by node position
    // Node 1 at x=0, node (n_per_span+1) at x=L1, node (2*n_per_span+1) at x=L1+L2
    let node_left = 1;
    let node_mid = n_per_span + 1;
    let node_right = 2 * n_per_span + 1;

    let r_left = results.reactions.iter().find(|r| r.node_id == node_left).unwrap();
    let r_mid = results.reactions.iter().find(|r| r.node_id == node_mid).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == node_right).unwrap();

    // Moment equilibrium about the left support (x=0):
    // R_mid * L1 + R_right * (L1 + L2) = q * (L1+L2)^2 / 2
    let moment_left = r_mid.ry * l1 + r_right.ry * (l1 + l2);
    let load_moment_left = q * (l1 + l2).powi(2) / 2.0;
    assert_close(
        moment_left,
        load_moment_left,
        1e-3,
        "Asym 2-span: moment equilibrium about left support",
    );

    // Moment equilibrium about the middle support (x=L1):
    // R_left * (-L1) + R_right * L2 = q*(L1+L2)*((L1+L2)/2 - L1)
    // Using the general formula: sum(R_i * (x_i - x_ref)) = sum(load moments about x_ref)
    let x_ref = l1;
    let reaction_moment_mid = r_left.ry * (0.0 - x_ref) + r_right.ry * ((l1 + l2) - x_ref);
    // Load moment about x_ref: integral of q * (x - x_ref) dx from 0 to L1+L2
    // = q * [(L1+L2)^2/2 - x_ref*(L1+L2)]
    let load_moment_mid = q * ((l1 + l2).powi(2) / 2.0 - x_ref * (l1 + l2));
    assert_close(
        reaction_moment_mid,
        load_moment_mid,
        1e-3,
        "Asym 2-span: moment equilibrium about middle support",
    );

    // Moment equilibrium about the right support (x=L1+L2):
    let x_ref_r = l1 + l2;
    let reaction_moment_right = r_left.ry * (0.0 - x_ref_r) + r_mid.ry * (l1 - x_ref_r);
    // Load moment about right: integral of q * (x - x_ref_r) dx from 0 to L1+L2
    // = q * [(L1+L2)^2/2 - x_ref_r*(L1+L2)] = q * [-(L1+L2)^2/2]
    let load_moment_right = q * ((l1 + l2).powi(2) / 2.0 - x_ref_r * (l1 + l2));
    assert_close(
        reaction_moment_right,
        load_moment_right,
        1e-3,
        "Asym 2-span: moment equilibrium about right support",
    );

    // Verify all three reactions are positive (upward for downward UDL)
    assert!(r_left.ry > 0.0, "Asym 2-span: R_left > 0");
    assert!(r_mid.ry > 0.0, "Asym 2-span: R_mid > 0");
    assert!(r_right.ry > 0.0, "Asym 2-span: R_right > 0");
}
