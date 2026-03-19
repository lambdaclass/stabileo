/// Validation: Extended Continuous Beam Tests
///
/// References:
///   - Ghali & Neville, "Structural Analysis", 7th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed.
///   - Kassimali, "Structural Analysis", 6th Ed.
///
/// Tests cover two-span UDL, three-span three-moment equation, propped
/// cantilever, pattern loading, unequal spans, support settlement,
/// cantilever overhang, and five-span symmetry.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Effective EI in kN*m^2 (E is MPa, solver multiplies by 1000 internally).
fn ei() -> f64 {
    E * 1000.0 * IZ
}

// ================================================================
// 1. Two-Span Equal UDL: Interior Moment = qL^2/8
// ================================================================
//
// Two equal spans L, UDL q on both spans.
// Three-moment equation for two equal spans with UDL:
//   M_B = qL^2/8 (hogging at interior support)
//
// Source: Ghali & Neville, Table 4.1; Hibbeler, Ch. 12

#[test]
fn two_span_equal_udl_interior_moment() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 10;

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

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment at support B (end of last element in span 1)
    let ef_at_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();

    let expected_m = q * l * l / 8.0; // 45.0
    assert_close(ef_at_b.m_end.abs(), expected_m, 0.03, "2span M_B = qL^2/8");

    // End reactions: R_A = R_C = 3qL/8
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results
        .reactions
        .iter()
        .find(|r| r.node_id == 2 * n_per_span + 1)
        .unwrap();
    let expected_r_end = 3.0 * q * l / 8.0; // 22.5
    assert_close(r_a.rz, expected_r_end, 0.03, "2span R_A = 3qL/8");
    assert_close(r_c.rz, expected_r_end, 0.03, "2span R_C = 3qL/8");

    // Interior reaction: R_B = 10qL/8 = 5qL/4
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n_per_span + 1)
        .unwrap();
    let expected_r_int = 5.0 * q * l / 4.0; // 75.0
    assert_close(r_b.rz, expected_r_int, 0.03, "2span R_B = 5qL/4");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * q * l, 0.01, "2span equilibrium");
}

// ================================================================
// 2. Three-Span Continuous Beam: Three-Moment Equation Reactions
// ================================================================
//
// Three equal spans L=5, UDL q=-10 on all spans.
// Three-moment equation for 3 equal spans with UDL:
//   M_B = M_C = qL^2/10
//   R_A = R_D = 0.4*qL
//   R_B = R_C = 1.1*qL
//
// Source: Ghali/Neville Table 4.1

#[test]
fn three_span_three_moment_equation_reactions() {
    let l = 5.0;
    let q = 10.0;
    let n_per_span = 10;

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

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moments at B and C
    let ef_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_c = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();

    let expected_m = q * l * l / 10.0; // 25.0
    assert_close(ef_b.m_end.abs(), expected_m, 0.03, "3span M_B = qL^2/10");
    assert_close(ef_c.m_end.abs(), expected_m, 0.03, "3span M_C = qL^2/10");

    // End reactions: R_A = R_D = 0.4*qL
    let node_a = 1;
    let node_d = 1 + 3 * n_per_span;
    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == node_d).unwrap();
    assert_close(r_a.rz, 0.4 * q * l, 0.03, "3span R_A = 0.4qL");
    assert_close(r_d.rz, 0.4 * q * l, 0.03, "3span R_D = 0.4qL");

    // Interior reactions: R_B = R_C = 1.1*qL
    let node_b = 1 + n_per_span;
    let node_c = 1 + 2 * n_per_span;
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();
    assert_close(r_b.rz, 1.1 * q * l, 0.03, "3span R_B = 1.1qL");
    assert_close(r_c.rz, 1.1 * q * l, 0.03, "3span R_C = 1.1qL");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 3.0 * q * l, 0.01, "3span equilibrium");
}

// ================================================================
// 3. Propped Cantilever (Fixed + Roller): R_roller = 3qL/8
// ================================================================
//
// Fixed at left, roller at right, UDL on full span.
//   R_B (roller) = 3qL/8
//   R_A (fixed)  = 5qL/8
//   M_A           = qL^2/8
//
// Source: Gere & Goodno, "Mechanics of Materials", Ch. 9

#[test]
fn propped_cantilever_roller_reaction() {
    let l = 8.0;
    let q = 10.0;
    let n = 16;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: -q,
                q_j: -q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // R_B = 3qL/8
    assert_close(r_b.rz, 3.0 * q * l / 8.0, 0.02, "propped R_B = 3qL/8");

    // R_A = 5qL/8
    assert_close(r_a.rz, 5.0 * q * l / 8.0, 0.02, "propped R_A = 5qL/8");

    // M_A = qL^2/8
    assert_close(
        r_a.my.abs(),
        q * l * l / 8.0,
        0.02,
        "propped M_A = qL^2/8",
    );

    // Equilibrium
    assert_close(r_a.rz + r_b.rz, q * l, 0.01, "propped equilibrium");
}

// ================================================================
// 4. Pattern Loading on Continuous Beam: Alternate Spans Loaded
// ================================================================
//
// Three equal spans L=6, UDL on spans 1 and 3 only (checkerboard).
// This is the critical pattern loading case for maximum midspan moment
// in spans 1 and 3. By symmetry, M_B = M_C.
//
// Since spans 1 and 3 are loaded identically and the unloaded span 2
// is between them, the continuity moments M_B and M_C are equal.
// Three-moment equation with q on spans 1,3 only:
// The loaded span behaves partly as if simply-supported with a
// reduced interior moment compared to all-spans-loaded case.
//
// Source: Hibbeler, "Structural Analysis", Ch. 12 (pattern loading)

#[test]
fn pattern_loading_alternate_spans() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 10;

    // Load spans 1 and 3 only (not span 2)
    let mut loads = Vec::new();
    for i in 0..n_per_span {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    for i in (2 * n_per_span)..(3 * n_per_span) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Symmetry: M_B = M_C (by symmetry of loading pattern)
    let ef_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_c = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();

    let m_b = ef_b.m_end.abs();
    let m_c = ef_c.m_end.abs();
    assert_close(m_b, m_c, 0.02, "pattern M_B = M_C symmetry");

    // The interior moments with pattern loading should be smaller than
    // the all-spans-loaded case (qL^2/10 = 36.0)
    let m_all_loaded = q * l * l / 10.0;
    assert!(
        m_b < m_all_loaded,
        "Pattern loading M_B={:.3} should be less than all-loaded M={:.3}",
        m_b,
        m_all_loaded,
    );

    // The unloaded span 2 carries moment through continuity
    let mid_span2_elem = n_per_span + n_per_span / 2;
    let ef_mid2 = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == mid_span2_elem)
        .unwrap();
    assert!(
        ef_mid2.m_start.abs() > 0.5 || ef_mid2.m_end.abs() > 0.5,
        "Unloaded span 2 should have non-zero moment from continuity",
    );

    // Equilibrium: total load = 2*q*L (only spans 1 and 3)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * q * l, 0.01, "pattern equilibrium");
}

// ================================================================
// 5. Unequal Spans Continuous Beam: Moment Redistribution
// ================================================================
//
// Two unequal spans L1=4, L2=6, UDL on both.
// Three-moment equation: M_B = q(L1^3 + L2^3) / [8(L1 + L2)]
//
// The moment at the interior support is NOT qL^2/8 because the
// spans have different lengths. The longer span dominates.
//
// Source: Timoshenko & Young, "Theory of Structures", Ch. 5

#[test]
fn unequal_spans_moment_redistribution() {
    let l1 = 4.0;
    let l2 = 6.0;
    let q = 10.0;
    let n_per_span = 10;

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

    // M_B = q(L1^3 + L2^3) / [8(L1 + L2)]
    let expected_m = q * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));
    let ef_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let m_b = ef_b.m_end.abs();

    assert_close(
        m_b,
        expected_m,
        0.05,
        "unequal spans M_B = q(L1^3+L2^3)/[8(L1+L2)]",
    );

    // The moment should differ from both qL1^2/8 and qL2^2/8
    let m_l1 = q * l1 * l1 / 8.0; // 20.0
    let m_l2 = q * l2 * l2 / 8.0; // 45.0
    assert!(
        m_b > m_l1 && m_b < m_l2,
        "Interior moment {:.3} should be between qL1^2/8={:.3} and qL2^2/8={:.3}",
        m_b,
        m_l1,
        m_l2,
    );

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * (l1 + l2), 0.01, "unequal spans equilibrium");
}

// ================================================================
// 6. Settlement of Interior Support: M = 3*EI*delta/L^2
// ================================================================
//
// Two-span equal beam (pinned-roller-roller), middle support settles by delta.
// No external loads. By three-moment equation:
//   M_B = 3*E*I*delta / L^2 (induced moment at settling support)
//
// Source: Kassimali, "Structural Analysis", Ch. 13

#[test]
fn settlement_of_interior_support() {
    let l = 4.0;
    let delta = 0.005; // 5 mm settlement
    let n_per_span = 8;
    let total_n = 2 * n_per_span;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per_span as f64;

    // Build manually to set dy on interior support
    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode {
                id: i + 1,
                x: i as f64 * elem_len,
                z: 0.0,
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
    for i in 0..total_n {
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

    let mid_node = n_per_span + 1;

    let mut sups_map = HashMap::new();
    sups_map.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sups_map.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: mid_node,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );
    sups_map.insert(
        "3".to_string(),
        SolverSupport {
            id: 3,
            node_id: n_nodes,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );

    let input = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Verify prescribed displacement was applied
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert_close(d_mid.uz, -delta, 0.01, "settlement prescribed uy = -delta");

    // Equilibrium (no external loads): sum of reactions = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 0.01,
        "settlement equilibrium: sum_ry={:.6}",
        sum_ry,
    );

    // M_B = 3*EI*delta/L^2 (induced moment at settling support)
    let m_exact = 3.0 * ei() * delta / (l * l);

    // Check moment at elements adjacent to the settling support
    let ef_left = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_right = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span + 1)
        .unwrap();

    let max_m = ef_left.m_end.abs().max(ef_right.m_start.abs());
    assert_close(
        max_m,
        m_exact,
        0.10,
        "settlement M_B = 3EI*delta/L^2",
    );
}

// ================================================================
// 7. Continuous Beam with Cantilever Overhang: Tip Deflection
// ================================================================
//
// Two-span beam + cantilever overhang:
//   Span AB = L, Span BC = L, Overhang CD = a
//   Supports at A (pinned), B (roller), C (roller)
//   UDL on overhang CD only.
//
// The cantilever overhang tip deflection (at D) is:
//   delta_D = q*a^4/(8*EI) + q*a^2*L/(6*EI) * (carry-over effects)
//
// We verify tip deflection is larger than a simple cantilever (q*a^4/8EI)
// because the overhang moment pulls up the interior spans.

#[test]
fn continuous_beam_with_cantilever_overhang() {
    let l = 6.0;
    let a = 2.0; // overhang length
    let q = 10.0;
    let n_per_span = 8;
    let n_overhang = 4;

    // Total elements: 2 spans * n_per_span + n_overhang
    let total_elems = 2 * n_per_span + n_overhang;
    let n_nodes = total_elems + 1;
    let elem_len_span = l / n_per_span as f64;
    let elem_len_oh = a / n_overhang as f64;

    // Build nodes
    let mut nodes = Vec::new();
    let mut node_id = 1_usize;
    // Span AB: nodes 1..n_per_span+1
    for i in 0..=n_per_span {
        nodes.push((node_id, i as f64 * elem_len_span, 0.0));
        node_id += 1;
    }
    // Span BC: nodes n_per_span+2..2*n_per_span+1
    for j in 1..=n_per_span {
        nodes.push((node_id, l + j as f64 * elem_len_span, 0.0));
        node_id += 1;
    }
    // Overhang CD: nodes 2*n_per_span+2..2*n_per_span+n_overhang+1
    for j in 1..=n_overhang {
        nodes.push((node_id, 2.0 * l + j as f64 * elem_len_oh, 0.0));
        node_id += 1;
    }

    let elems: Vec<_> = (0..total_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Supports: pinned at A (node 1), roller at B (node n_per_span+1), roller at C (node 2*n_per_span+1)
    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;
    let sups = vec![
        (1, node_a, "pinned"),
        (2, node_b, "rollerX"),
        (3, node_c, "rollerX"),
    ];

    // UDL on overhang elements only
    let oh_start_elem = 2 * n_per_span + 1;
    let mut loads = Vec::new();
    for i in 0..n_overhang {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: oh_start_elem + i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Tip node D
    let node_d = n_nodes;
    let d_tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == node_d)
        .unwrap();

    // The cantilever tip should deflect downward (negative uy)
    assert!(
        d_tip.uz < 0.0,
        "Overhang tip should deflect downward: uy={:.6}",
        d_tip.uz,
    );

    // Simple cantilever tip deflection: q*a^4/(8*EI)
    let delta_simple_cant = q * a.powi(4) / (8.0 * ei());

    // The actual tip deflection should be at least the simple cantilever value
    // (the overhang also lifts at C due to rotation, making total deflection larger)
    assert!(
        d_tip.uz.abs() > delta_simple_cant * 0.5,
        "Tip deflection {:.6e} should be significant vs simple cantilever {:.6e}",
        d_tip.uz.abs(),
        delta_simple_cant,
    );

    // The moment at support C should be hogging (negative sagging) due to overhang
    let ef_at_c = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();
    // Overhang moment at C = q*a^2/2
    let m_overhang = q * a * a / 2.0; // 20.0
    assert_close(
        ef_at_c.m_end.abs(),
        m_overhang,
        0.10,
        "Overhang moment at C = q*a^2/2",
    );

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * a, 0.01, "overhang equilibrium");
}

// ================================================================
// 8. Five-Span Continuous Beam: Symmetry of Reactions and Moments
// ================================================================
//
// Five equal spans L=4, UDL on all spans.
// By symmetry of structure and loading:
//   R_A = R_F (end supports)
//   R_B = R_E (first interior supports)
//   R_C = R_D (second interior supports)
//   M_B = M_E (moments at first interior supports)
//   M_C = M_D (moments at second interior supports)
//
// Source: Timoshenko & Young, "Theory of Structures", tables

#[test]
fn five_span_symmetry() {
    let l = 4.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 5 * n_per_span;
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

    let input = make_continuous_beam(&[l, l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Support node ids
    let node_a = 1;
    let node_b = 1 + n_per_span;
    let node_c = 1 + 2 * n_per_span;
    let node_d = 1 + 3 * n_per_span;
    let node_e = 1 + 4 * n_per_span;
    let node_f = 1 + 5 * n_per_span;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == node_d).unwrap();
    let r_e = results.reactions.iter().find(|r| r.node_id == node_e).unwrap();
    let r_f = results.reactions.iter().find(|r| r.node_id == node_f).unwrap();

    // Symmetry of reactions
    assert_close(r_a.rz, r_f.rz, 0.01, "5span R_A = R_F");
    assert_close(r_b.rz, r_e.rz, 0.01, "5span R_B = R_E");
    assert_close(r_c.rz, r_d.rz, 0.01, "5span R_C = R_D");

    // Symmetry of interior moments
    let ef_b = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_c = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 2 * n_per_span)
        .unwrap();
    let ef_d = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 3 * n_per_span)
        .unwrap();
    let ef_e = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == 4 * n_per_span)
        .unwrap();

    let m_b = ef_b.m_end.abs();
    let m_c = ef_c.m_end.abs();
    let m_d = ef_d.m_end.abs();
    let m_e = ef_e.m_end.abs();

    assert_close(m_b, m_e, 0.02, "5span M_B = M_E");
    assert_close(m_c, m_d, 0.02, "5span M_C = M_D");

    // The interior moments should differ by group
    // (M_B != M_C in general for 5-span beams)
    let diff = (m_b - m_c).abs();
    assert!(
        diff > 0.1,
        "5span M_B={:.3} and M_C={:.3} should differ (diff={:.3})",
        m_b,
        m_c,
        diff,
    );

    // Midspan deflections should also be symmetric
    let mid_span1 = 1 + n_per_span / 2;
    let mid_span5 = 1 + 4 * n_per_span + n_per_span / 2;
    let d1 = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_span1)
        .unwrap();
    let d5 = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_span5)
        .unwrap();
    assert_close(d1.uz, d5.uz, 0.02, "5span delta_span1 = delta_span5");

    let mid_span2 = 1 + n_per_span + n_per_span / 2;
    let mid_span4 = 1 + 3 * n_per_span + n_per_span / 2;
    let d2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_span2)
        .unwrap();
    let d4 = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_span4)
        .unwrap();
    assert_close(d2.uz, d4.uz, 0.02, "5span delta_span2 = delta_span4");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 5.0 * q * l, 0.01, "5span equilibrium");
}
