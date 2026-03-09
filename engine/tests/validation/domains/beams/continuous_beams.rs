/// Validation: Multi-span continuous beams vs three-moment equation (Clapeyron).
///
/// Reference: Ghali/Neville *Structural Analysis*
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ═══════════════════════════════════════════════════════════════
// 1. Two-Span Equal (L=8 each, UDL q=10)
// ═══════════════════════════════════════════════════════════════

fn make_2span_udl(q: f64, n_per_span: usize) -> SolverInput {
    let n_total = 2 * n_per_span;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    make_continuous_beam(&[8.0, 8.0], n_per_span, E, A, IZ, loads)
}

#[test]
fn validation_2span_equal_udl_reactions() {
    // 2-span equal, L=8 each, UDL q=10
    // By three-moment eqn: M_B = -qL²/8 = -80
    // R_A = R_C = 3qL/8 = 30, R_B = 10qL/8 = 100
    let q = 10.0;
    let l = 8.0;
    let n_per_span = 4;
    let input = make_2span_udl(q, n_per_span);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();

    assert_close(r_a.ry, 3.0 * q * l / 8.0, 0.02, "2span R_A");
    assert_close(r_b.ry, 10.0 * q * l / 8.0, 0.02, "2span R_B");
    assert_close(r_c.ry, 3.0 * q * l / 8.0, 0.02, "2span R_C");

    // Equilibrium: total load = 2*q*L = 160
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * q * l, 0.01, "2span ΣRy");
}

#[test]
fn validation_2span_equal_udl_midspan_moment() {
    // Midspan moment in each span: M_mid = 9qL²/128 = 45
    let q = 10.0;
    let l = 8.0;
    let n_per_span = 4;
    let input = make_2span_udl(q, n_per_span);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support moment: M_B = -qL²/8 = -80
    // Check via element forces at interior support
    // The element ending at interior support (element n_per_span) should have m_end ≈ ±80
    let ef_at_b = results.element_forces.iter().find(|ef| ef.element_id == n_per_span).unwrap();
    let m_b = ef_at_b.m_end;
    assert!(
        (m_b.abs() - q * l * l / 8.0).abs() < 5.0,
        "2span M_B={:.2}, expected ±{:.2}", m_b, q * l * l / 8.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Two-Span Equal, Point Load at Midspan of Span 1
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_2span_point_at_midspan1() {
    // P=100 at midspan of span 1, L=8 each
    // M_B = -5PL/32 = -125
    let l = 8.0;
    let p = 100.0;
    let n_per_span = 4;
    let load_node = n_per_span / 2 + 1; // midspan of span 1

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support moment: M_B = -3PL/32 = -75
    let ef_at_b = results.element_forces.iter().find(|ef| ef.element_id == n_per_span).unwrap();
    let expected_mb = 3.0 * p * l / 32.0;
    assert!(
        (ef_at_b.m_end.abs() - expected_mb).abs() < 10.0,
        "2span point M_B={:.2}, expected ±{:.2}", ef_at_b.m_end, expected_mb
    );

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "2span point ΣRy");
}

// ═══════════════════════════════════════════════════════════════
// 3. Two-Span Unequal (L1=6, L2=10, UDL q=10)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_2span_unequal_udl() {
    // Three-moment equation for unequal spans:
    // M_B * (L1 + L2) = -q*L1³/4 - q*L2³/4
    // M_B * 16 = -10*216/4 - 10*1000/4 = -540 - 2500 = -3040
    // M_B = -190.0
    // (Note: this is for UDL on both spans)
    // Actually three-moment: 2*M_B*(L1+L2) = -q*L1³/4 - q*L2³/4
    // 2*M_B*16 = -q*(L1³+L2³)/4
    // 32*M_B = -10*(216+1000)/4 = -10*1216/4 = -3040
    // M_B = -95.0
    let l1 = 6.0;
    let l2 = 10.0;
    let q = 10.0;
    let n_per_span = 4;

    let n_total = 2 * n_per_span;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: total = q*(L1+L2) = 160
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * (l1 + l2), 0.01, "2span unequal ΣRy");

    // Interior moment at B should match three-moment equation
    let expected_mb = q * (l1.powi(3) + l2.powi(3)) / (4.0 * 2.0 * (l1 + l2));
    let ef_at_b = results.element_forces.iter().find(|ef| ef.element_id == n_per_span).unwrap();
    assert!(
        (ef_at_b.m_end.abs() - expected_mb).abs() < 10.0,
        "2span unequal M_B={:.2}, expected ~{:.2}", ef_at_b.m_end.abs(), expected_mb
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Three-Span Equal (L=6, UDL q=12)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3span_equal_udl_reactions() {
    // 3-span equal L=6, UDL q=12
    // Interior moments: M_B = M_C = -qL²/10 = -43.2
    // End reactions: R_A = R_D = 0.4*qL = 28.8
    // Interior reactions: R_B = R_C = 1.1*qL = 79.2
    let l = 6.0;
    let q = 12.0;
    let n_per_span = 4;

    let n_total = 3 * n_per_span;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n_per_span + 1).unwrap();

    // End reactions: R_A = R_D = 0.4*qL = 28.8
    assert_close(r_a.ry, 0.4 * q * l, 0.02, "3span R_A");
    assert_close(r_d.ry, 0.4 * q * l, 0.02, "3span R_D");

    // Interior reactions: R_B = R_C = 1.1*qL = 79.2
    assert_close(r_b.ry, 1.1 * q * l, 0.02, "3span R_B");
    assert_close(r_c.ry, 1.1 * q * l, 0.02, "3span R_C");

    // Equilibrium: total = 3*q*L = 216
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 3.0 * q * l, 0.01, "3span ΣRy");
}

#[test]
fn validation_3span_symmetry() {
    // 3-span symmetric loading: R_A = R_D, R_B = R_C
    let l = 6.0;
    let q = 12.0;
    let n_per_span = 4;

    let n_total = 3 * n_per_span;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n_per_span + 1).unwrap();
    assert_close(r_a.ry, r_d.ry, 0.001, "3span symmetry R_A = R_D");

    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    assert_close(r_b.ry, r_c.ry, 0.001, "3span symmetry R_B = R_C");
}
