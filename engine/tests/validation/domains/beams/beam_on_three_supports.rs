/// Validation tests for beams on exactly 3 supports (2-span continuous, 1 degree indeterminate).
///
/// Reference formulae use the three-moment (Clapeyron) equation and force method.
/// For UDL w on both spans with simply-supported ends (M_A = M_C = 0):
///   2*M_B*(L1 + L2) = -w*L1^3/4 - w*L2^3/4
/// Reactions:
///   R_A = w*L1/2 + M_B/L1
///   R_C = w*L2/2 + M_B/L2
///   R_B = w*(L1+L2) - R_A - R_C

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Helper to build UDL loads on all elements of a continuous beam.
fn udl_loads(n_elements: usize, q: f64) -> Vec<SolverLoad> {
    (0..n_elements)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect()
}

// ─── Test 1: Equal spans UDL — interior reaction = 10wL/8 ──────────────────

#[test]
fn equal_spans_udl_reactions() {
    // 2-span beam, L1=L2=6m, q=-10 kN/m (downward).
    // Three-moment equation for equal spans:
    //   2*M_B*(6+6) = -10*216/4 - 10*216/4 = -1080
    //   M_B = -1080/24 = -45  (hogging)
    // Reactions:
    //   R_A = wL/2 + M_B/L = 30 + (-45)/6 = 22.5
    //   R_C = wL/2 + M_B/L = 30 + (-45)/6 = 22.5
    //   R_B = 120 - 22.5 - 22.5 = 75
    let q = -10.0;
    let l = 6.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;

    let loads = udl_loads(total_elems, q);
    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);

    let total_load = q.abs() * 2.0 * l; // 120
    let sum_ry: f64 = reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 1e-6, "sum_ry = total_load");

    let r_a = reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == 1 + n_per_span)
        .unwrap()
        .ry;
    let r_c = reactions
        .iter()
        .find(|r| r.node_id == 1 + 2 * n_per_span)
        .unwrap()
        .ry;

    assert_close(r_a, 22.5, 1e-4, "R_A");
    assert_close(r_b, 75.0, 1e-4, "R_B");
    assert_close(r_c, 22.5, 1e-4, "R_C");
}

// ─── Test 2: Unequal spans UDL ─────────────────────────────────────────────

#[test]
fn unequal_spans_udl_reactions() {
    // L1=4m, L2=8m, q=-10 kN/m.
    // Three-moment equation:
    //   2*M_B*(4+8) = -10*64/4 - 10*512/4 = -160 - 1280 = -1440
    //   M_B = -1440/24 = -60
    // Reactions:
    //   R_A = w*L1/2 + M_B/L1 = 20 + (-60)/4 = 5
    //   R_C = w*L2/2 + M_B/L2 = 40 + (-60)/8 = 32.5
    //   R_B = 120 - 5 - 32.5 = 82.5
    let q = -10.0;
    let l1 = 4.0;
    let l2 = 8.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;

    let loads = udl_loads(total_elems, q);
    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);

    let total_load = q.abs() * (l1 + l2); // 120
    let sum_ry: f64 = reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 1e-6, "sum_ry = total_load");

    let r_a = reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == 1 + n_per_span)
        .unwrap()
        .ry;
    let r_c = reactions
        .iter()
        .find(|r| r.node_id == 1 + 2 * n_per_span)
        .unwrap()
        .ry;

    assert_close(r_a, 5.0, 1e-3, "R_A (unequal)");
    assert_close(r_b, 82.5, 1e-3, "R_B (unequal)");
    assert_close(r_c, 32.5, 1e-3, "R_C (unequal)");
}

// ─── Test 3: Point load at midspan of one span — equilibrium ────────────────

#[test]
fn point_load_midspan_equilibrium() {
    // 2-span beam, L=6m each, n_per_span=2.
    // Span 1: elements 1,2 (nodes 1,2,3); Span 2: elements 3,4 (nodes 3,4,5).
    // Point load P=-30 at node 2 (midspan of span 1, x=3).
    //
    // Force method (released structure = SS beam A-C, L=12):
    //   delta_B(P) at x=6: P*a*(L-b)/(6*L*EI)*(L^2-a^2-(L-b)^2) with a=3,b=6
    //   f_BB = a_B^2*b_B^2/(3*EI*L) with a_B=6, b_B=6
    //   R_B = 20.625, R_A = 12.1875, R_C = -2.8125
    // Note: R_C < 0 is physical — the far support pulls down.
    let l = 6.0;
    let n_per_span = 2;
    let p = -30.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: p,
        mz: 0.0,
    })];

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);

    // Equilibrium: sum of vertical reactions must equal |P|.
    let sum_ry: f64 = reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p.abs(), 1e-6, "sum_ry = |P|");

    let r_a = reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == 1 + n_per_span)
        .unwrap()
        .ry;
    let r_c = reactions
        .iter()
        .find(|r| r.node_id == 1 + 2 * n_per_span)
        .unwrap()
        .ry;

    // Verify analytical values from force method.
    assert_close(r_a, 12.1875, 1e-3, "R_A (point load)");
    assert_close(r_b, 20.625, 1e-3, "R_B (point load)");
    assert_close(r_c, -2.8125, 1e-3, "R_C (point load)");

    // Moment about A: R_B*6 + R_C*12 - |P|*3 = 0.
    let moment_about_a = r_b * l + r_c * 2.0 * l - p.abs() * (l / 2.0);
    assert_close(moment_about_a, 0.0, 1e-4, "moment about A = 0");
}

// ─── Test 4: Interior support moment from element forces ────────────────────

#[test]
fn interior_support_moment() {
    // Equal spans L=6m, UDL q=-10.
    // Interior moment from three-moment equation: M_B = -45 (hogging).
    //
    // The solver reports element-end moments with a convention where
    // m_end of the last element of span 1 equals m_start of the first
    // element of span 2 at the shared node (joint continuity).
    // |M_B| = 45 kN.m.
    let q = -10.0;
    let l = 6.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;

    let loads = udl_loads(total_elems, q);
    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Element at end of span 1 = element n_per_span.
    // Element at start of span 2 = element n_per_span+1.
    let ef_span1_end = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_span2_start = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span + 1)
        .unwrap();

    let m_b_from_span1 = ef_span1_end.m_end;
    let m_b_from_span2 = ef_span2_start.m_start;

    // Joint continuity: m_end(span1) == m_start(span2) (same sign convention at the node).
    assert_close(
        m_b_from_span1,
        m_b_from_span2,
        1e-4,
        "joint moment continuity at B",
    );

    // Magnitude check: |M_B| = 45.
    assert_close(m_b_from_span1.abs(), 45.0, 1e-3, "|M_B| from span 1 end");
}

// ─── Test 5: Deflection comparison — 3-support vs simply-supported ──────────

#[test]
fn deflection_three_support_vs_simply_supported() {
    // SS beam: L=12m, UDL q=-10.
    // 3-support beam: 2 spans of L=6m each (same total length), same UDL.
    // The midspan deflection of each individual span in the continuous beam
    // should be much less than the midspan deflection of the 12m SS beam.
    let q = -10.0;
    let n_per_span = 4;

    // Simply-supported beam: 12m, 8 elements.
    let input_ss = make_ss_beam_udl(8, 12.0, E, A, IZ, q);
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    // Continuous beam: 2 spans of 6m, 4 elements per span.
    let total_elems = n_per_span * 2;
    let loads = udl_loads(total_elems, q);
    let input_cont = make_continuous_beam(&[6.0, 6.0], n_per_span, E, A, IZ, loads);
    let results_cont = linear::solve_2d(&input_cont).unwrap();

    // SS midspan: node at x=6 (node 5 for 8-element beam).
    let uy_ss_mid = results_ss
        .displacements
        .iter()
        .find(|d| d.node_id == 5)
        .unwrap()
        .uy;

    // Continuous beam: midspan of span 1 at x=3 (node 3 for n_per_span=4).
    let uy_cont_mid = results_cont
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap()
        .uy;

    // Both deflections should be downward (negative).
    assert!(uy_ss_mid < 0.0, "SS midspan deflection should be negative");
    assert!(
        uy_cont_mid < 0.0,
        "Continuous beam midspan deflection should be negative"
    );

    // The continuous beam deflection should be much smaller in magnitude.
    // We check continuous < ss/2 as a conservative bound.
    assert!(
        uy_cont_mid.abs() < uy_ss_mid.abs() / 2.0,
        "Continuous beam deflection ({:.6}) should be much less than SS ({:.6})",
        uy_cont_mid,
        uy_ss_mid
    );
}

// ─── Test 6: Support settlement at interior support ─────────────────────────

#[test]
fn support_settlement_changes_reactions() {
    // Equal spans L=5m, UDL q=-10, interior support settles dy=-0.01m.
    // Built manually since make_input helper does not support dy.
    // Compare reactions to the unsettled case; they must differ.
    let q = -10.0;
    let l = 5.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;
    let n_nodes = total_elems + 1;
    let elem_len = l / n_per_span as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode {
                id: i + 1,
                x: i as f64 * elem_len,
                y: 0.0,
            },
        );
    }

    let mut mats_map = HashMap::new();
    mats_map.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: E,
            nu: 0.3,
        },
    );

    let mut secs_map = HashMap::new();
    secs_map.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a: A,
            iz: IZ,
            as_y: None,
        },
    );

    let mut elems_map = HashMap::new();
    for i in 0..total_elems {
        elems_map.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    let interior_node = 1 + n_per_span;
    let end_node = n_nodes;

    // Supports -- settled case: dy=-0.01 on interior support.
    let mut sups_settled = HashMap::new();
    sups_settled.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dy: None,
            drz: None,
            angle: None,
        },
    );
    sups_settled.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: interior_node,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dy: Some(-0.01),
            drz: None,
            angle: None,
        },
    );
    sups_settled.insert(
        "3".to_string(),
        SolverSupport {
            id: 3,
            node_id: end_node,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dy: None,
            drz: None,
            angle: None,
        },
    );

    // Unsettled case.
    let mut sups_unsettled = sups_settled.clone();
    sups_unsettled.get_mut("2").unwrap().dy = None;

    let loads = udl_loads(total_elems, q);

    let input_settled = SolverInput {
        nodes: nodes_map.clone(),
        materials: mats_map.clone(),
        sections: secs_map.clone(),
        elements: elems_map.clone(),
        supports: sups_settled,
        loads: loads.clone(),
    constraints: vec![],
    };
    let input_unsettled = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_unsettled,
        loads, constraints: vec![], };

    let results_settled = linear::solve_2d(&input_settled).unwrap();
    let results_unsettled = linear::solve_2d(&input_unsettled).unwrap();

    // Both must satisfy equilibrium: sum_ry = total_load.
    let total_load = q.abs() * 2.0 * l; // 100
    let sum_settled: f64 = results_settled.reactions.iter().map(|r| r.ry).sum();
    let sum_unsettled: f64 = results_unsettled.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_settled, total_load, 1e-4, "settled sum_ry");
    assert_close(sum_unsettled, total_load, 1e-4, "unsettled sum_ry");

    // Interior reaction must change due to settlement.
    let rb_settled = results_settled
        .reactions
        .iter()
        .find(|r| r.node_id == interior_node)
        .unwrap()
        .ry;
    let rb_unsettled = results_unsettled
        .reactions
        .iter()
        .find(|r| r.node_id == interior_node)
        .unwrap()
        .ry;

    let diff = (rb_settled - rb_unsettled).abs();
    assert!(
        diff > 0.1,
        "Settlement should change interior reaction: settled={:.4}, unsettled={:.4}, diff={:.6}",
        rb_settled,
        rb_unsettled,
        diff
    );

    // Settlement at B means B sinks, so it picks up less load: R_B(settled) < R_B(unsettled).
    assert!(
        rb_settled < rb_unsettled,
        "Settled interior reaction ({:.4}) should be less than unsettled ({:.4})",
        rb_settled,
        rb_unsettled
    );
}

// ─── Test 7: Interior moment varies with span ratio ─────────────────────────

#[test]
fn interior_moment_varies_with_span_ratio() {
    // Compare M_B for equal spans (6,6) vs unequal spans (4,8).
    // Three-moment equation:
    //   Equal:   M_B = -(10*216+10*216)/(4*24) = -45
    //   Unequal: M_B = -(10*64+10*512)/(4*24) = -60
    let q = -10.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;

    // Equal spans.
    let loads_eq = udl_loads(total_elems, q);
    let input_eq = make_continuous_beam(&[6.0, 6.0], n_per_span, E, A, IZ, loads_eq);
    let results_eq = linear::solve_2d(&input_eq).unwrap();

    // Unequal spans.
    let loads_uneq = udl_loads(total_elems, q);
    let input_uneq = make_continuous_beam(&[4.0, 8.0], n_per_span, E, A, IZ, loads_uneq);
    let results_uneq = linear::solve_2d(&input_uneq).unwrap();

    // Get M_B from m_end of last element of span 1.
    let mb_equal = results_eq
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap()
        .m_end;

    let mb_unequal = results_uneq
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap()
        .m_end;

    // Check analytical values (magnitude).
    assert_close(mb_equal.abs(), 45.0, 1e-3, "|M_B| equal spans");
    assert_close(mb_unequal.abs(), 60.0, 1e-3, "|M_B| unequal spans");

    // They must differ.
    assert!(
        (mb_equal.abs() - mb_unequal.abs()).abs() > 1.0,
        "M_B should differ: equal={:.4}, unequal={:.4}",
        mb_equal,
        mb_unequal
    );
}

// ─── Test 8: Three-support equilibrium — ΣR = total load, ΣM = 0 ───────────

#[test]
fn three_support_full_equilibrium() {
    // 2-span beam, L1=5m, L2=7m, q=-12 kN/m.
    // Verify: ΣR_y = total_load, ΣM about each support = 0.
    let q = -12.0;
    let l1 = 5.0;
    let l2 = 7.0;
    let n_per_span = 4;
    let total_elems = n_per_span * 2;

    let loads = udl_loads(total_elems, q);
    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let mut reactions = results.reactions.clone();
    reactions.sort_by_key(|r| r.node_id);

    let total_load = q.abs() * (l1 + l2); // 144
    let sum_ry: f64 = reactions.iter().map(|r| r.ry).sum();

    // Check 1: sum of vertical reactions = total load.
    assert_close(sum_ry, total_load, 1e-6, "sum Ry = total load");

    // Support positions: A at x=0, B at x=L1, C at x=L1+L2.
    let x_a = 0.0;
    let x_b = l1;
    let x_c = l1 + l2;

    let r_a = reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = reactions
        .iter()
        .find(|r| r.node_id == 1 + n_per_span)
        .unwrap()
        .ry;
    let r_c = reactions
        .iter()
        .find(|r| r.node_id == 1 + 2 * n_per_span)
        .unwrap()
        .ry;

    let total_length = l1 + l2;

    // Check 2: Moment about A.
    // Load moment about A: integral of q_abs * x dx from 0 to L = q_abs * L^2 / 2
    let m_load_about_a = q.abs() * total_length * total_length / 2.0;
    let m_reactions_about_a = r_a * x_a + r_b * x_b + r_c * x_c;
    assert_close(
        m_reactions_about_a,
        m_load_about_a,
        1e-4,
        "moment about A = 0",
    );

    // Check 3: Moment about B.
    let m_load_about_b =
        q.abs() * (total_length * total_length / 2.0 - x_b * total_length);
    let m_reactions_about_b = r_a * (x_a - x_b) + r_c * (x_c - x_b);
    assert_close(
        m_reactions_about_b,
        m_load_about_b,
        1e-4,
        "moment about B = 0",
    );

    // Check 4: Moment about C.
    let m_load_about_c =
        q.abs() * (total_length * total_length / 2.0 - x_c * total_length);
    let m_reactions_about_c = r_a * (x_a - x_c) + r_b * (x_b - x_c);
    assert_close(
        m_reactions_about_c,
        m_load_about_c,
        1e-4,
        "moment about C = 0",
    );
}
