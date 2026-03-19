/// Validation: Extended classical beam formulas — cases NOT covered
/// by `validation_beam_formulas.rs`.
///
/// References: Timoshenko *Strength of Materials*, Ghali/Neville *Structural
/// Analysis*, Roark *Formulas for Stress and Strain* (7th ed.).
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const EI: f64 = 20_000.0; // E * 1000 * IZ

// ═══════════════════════════════════════════════════════════════
// 1. Simply-Supported — Two Symmetric Point Loads (Four-Point Bending)
// ═══════════════════════════════════════════════════════════════

/// Two equal loads P at distance a from each support on an SS beam.
/// Roark Table 8.1 case 2e: constant moment Pa between the loads,
/// zero shear in the middle segment.
/// delta_mid = Pa(3L^2 - 4a^2) / (24 EI)
/// R_A = R_B = P
#[test]
fn validation_ss_four_point_bending() {
    let l = 12.0;
    let p = 50.0;
    let n: usize = 12; // 12 elements, elem_len = 1.0
    let a = 3.0; // loads at x=3 and x=9

    let load_node_left = 4;  // x = 3
    let load_node_right = 10; // x = 9

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node_left, fx: 0.0, fz: -p, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node_right, fx: 0.0, fz: -p, my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: each support carries P
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, p, 0.01, "4pt R_A");
    assert_close(r_end.rz, p, 0.01, "4pt R_B");

    // Midspan deflection: Pa(3L^2 - 4a^2) / (24 EI)
    let expected_delta: f64 = p * a * (3.0 * l.powi(2) - 4.0 * a.powi(2)) / (24.0 * EI);
    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid.uz.abs(), expected_delta, 0.01, "4pt delta_mid");

    // Element forces in the constant-moment zone (element between x=5 and x=6):
    // shear should be zero, moment should be P*a = 150
    let mid_elem = results.element_forces.iter().find(|ef| ef.element_id == n / 2).unwrap();
    assert_close(mid_elem.v_start.abs(), 0.0, 0.01, "4pt V_mid ~ 0");
    assert_close(mid_elem.m_start.abs(), p * a, 0.01, "4pt M_mid");
}

// ═══════════════════════════════════════════════════════════════
// 2. Cantilever — Triangular (Linearly Increasing) Load
// ═══════════════════════════════════════════════════════════════

/// Cantilever with load increasing from 0 at the fixed end to q0 at the tip.
/// Total load = q0*L/2
/// Reaction Ry = q0*L/2
/// Fixed moment = q0*L^2/3  (centroid of triangle at 2L/3 from fixed end)
/// Tip deflection = 11*q0*L^4 / (120*EI)  — Roark Table 8.1
/// The deflection formula is obtained by integrating M(x)/EI twice:
///   q(x) = q0*x/L, V(x) = q0*(L^2 - x^2)/(2L),
///   M(x) = q0*(L^2*x/2 - x^3/6)/L - q0*L^2/3  (measuring from fixed end)
///   delta_tip = 11*q0*L^4/(120*EI)
#[test]
fn validation_cantilever_triangular_load() {
    let l = 8.0;
    let q0 = 15.0;
    let n: usize = 16; // fine mesh for accuracy
    let elem_len: f64 = l / n as f64;

    let mut loads = Vec::new();
    for i in 0..n {
        let x_start = i as f64 * elem_len;
        let x_end = (i + 1) as f64 * elem_len;
        let q_start = -q0 * x_start / l;
        let q_end = -q0 * x_end / l;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_start, q_j: q_end, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, q0 * l / 2.0, 0.01, "cant tri Ry");

    // Fixed-end moment: M = q0*L^2/3
    assert_close(r1.my.abs(), q0 * l * l / 3.0, 0.02, "cant tri M_fixed");

    // Tip deflection: 11*q0*L^4/(120*EI)
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let expected_delta: f64 = 11.0 * q0 * l.powi(4) / (120.0 * EI);
    assert_close(tip.uz.abs(), expected_delta, 0.02, "cant tri delta_tip");
}

// ═══════════════════════════════════════════════════════════════
// 3. Fixed-Fixed — Asymmetric Point Load at L/3
// ═══════════════════════════════════════════════════════════════

/// Fixed-fixed beam, P at distance a=L/3 from end A.
/// M_A = P*a*b^2/L^2 = P*(L/3)*(2L/3)^2/L^2 = 4PL/27
/// M_B = P*a^2*b/L^2 = P*(L/3)^2*(2L/3)/L^2 = 2PL/27
/// R_A = P*b^2*(3a+b)/L^3
/// delta at load = P*a^3*b^3/(3*EI*L^3)
#[test]
fn validation_fixed_fixed_asymmetric_point() {
    let l = 9.0;
    let p = 90.0;
    let n: usize = 9; // elem_len = 1.0, node 4 at x = 3 = L/3
    let a = l / 3.0;
    let b = 2.0 * l / 3.0;
    let load_node = 4; // x = 3.0

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed-end moments
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let m_a: f64 = p * a * b.powi(2) / l.powi(2); // 4PL/27
    let m_b: f64 = p * a.powi(2) * b / l.powi(2); // 2PL/27
    assert_close(r1.my.abs(), m_a, 0.02, "FF asym M_A");
    assert_close(r_end.my.abs(), m_b, 0.02, "FF asym M_B");

    // Reactions
    let r_a_expected: f64 = p * b.powi(2) * (3.0 * a + b) / l.powi(3);
    let r_b_expected: f64 = p * a.powi(2) * (a + 3.0 * b) / l.powi(3);
    assert_close(r1.rz, r_a_expected, 0.01, "FF asym R_A");
    assert_close(r_end.rz, r_b_expected, 0.01, "FF asym R_B");

    // Deflection at load point
    let d_load = results.displacements.iter().find(|d| d.node_id == load_node).unwrap();
    let expected_delta: f64 = p * a.powi(3) * b.powi(3) / (3.0 * EI * l.powi(3));
    assert_close(d_load.uz.abs(), expected_delta, 0.02, "FF asym delta_load");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "FF asym sum_Ry");
}

// ═══════════════════════════════════════════════════════════════
// 4. Propped Cantilever — Triangular Load
// ═══════════════════════════════════════════════════════════════

/// Propped cantilever (fixed at A, roller at B) with triangular load
/// increasing from 0 at A to q0 at B.
/// Using compatibility: deflection at B from triangular load on cantilever
/// minus R_B * L^3/(3EI) = 0.
///   delta_B_free = 11*q0*L^4/(120*EI)  (tip deflection of cantilever with 0->q0)
///   R_B * L^3/(3*EI) = 11*q0*L^4/(120*EI)
///   R_B = 11*q0*L/40
/// R_A = q0*L/2 - R_B = q0*L/2 - 11*q0*L/40 = 9*q0*L/40
/// Moment equilibrium about A:
///   M_A + R_B*L = (q0*L/2)*(2L/3) = q0*L^2/3
///   M_A = q0*L^2/3 - 11*q0*L^2/40 = (40 - 33)*q0*L^2/120 = 7*q0*L^2/120
#[test]
fn validation_propped_cantilever_triangular_load() {
    let l = 10.0;
    let q0 = 12.0;
    let n: usize = 20; // fine mesh for triangular load accuracy
    let elem_len: f64 = l / n as f64;

    let mut loads = Vec::new();
    for i in 0..n {
        let x_start = i as f64 * elem_len;
        let x_end = (i + 1) as f64 * elem_len;
        let q_start = -q0 * x_start / l;
        let q_end = -q0 * x_end / l;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_start, q_j: q_end, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = 11*q0*L/40
    let r_b_expected: f64 = 11.0 * q0 * l / 40.0;
    assert_close(r_end.rz, r_b_expected, 0.02, "propped tri R_B");

    // R_A = 9*q0*L/40
    let r_a_expected: f64 = 9.0 * q0 * l / 40.0;
    assert_close(r1.rz, r_a_expected, 0.02, "propped tri R_A");

    // M_A = 7*q0*L^2/120
    let m_a_expected: f64 = 7.0 * q0 * l * l / 120.0;
    assert_close(r1.my.abs(), m_a_expected, 0.02, "propped tri M_A");

    // Equilibrium: total load = q0*L/2 = 60
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q0 * l / 2.0, 0.01, "propped tri sum_Ry");
}

// ═══════════════════════════════════════════════════════════════
// 5. Simply-Supported — Applied End Moments (Pure Bending)
// ═══════════════════════════════════════════════════════════════

/// Equal and opposite moments M applied at both ends of an SS beam
/// produce pure bending: zero shear, uniform curvature.
/// Deflection at midspan: delta = M*L^2 / (8*EI)
/// Rotation at A: theta_A = M*L / (2*EI)  (by symmetry, theta_B = -theta_A)
#[test]
fn validation_ss_pure_bending() {
    let l = 10.0;
    let m = 100.0; // positive at left, negative at right for pure bending
    let n: usize = 10;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fz: 0.0, my: m,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: -m,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: M*L^2/(8*EI)
    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    let expected_delta: f64 = m * l.powi(2) / (8.0 * EI);
    assert_close(mid.uz.abs(), expected_delta, 0.01, "pure bending delta_mid");

    // End rotation: theta = M*L/(2*EI)  — but note: both moments cause rotation
    // in the same direction. For an SS beam with moment M at node A:
    //   theta_A = M*L/(3*EI), theta_B = M*L/(6*EI)
    // With moment -M at node B as well:
    //   theta_A_total = M*L/(3*EI) + M*L/(6*EI) = M*L/(2*EI)
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let expected_theta: f64 = m * l / (2.0 * EI);
    assert_close(d1.ry.abs(), expected_theta, 0.01, "pure bending theta_A");

    // Reactions: in pure bending with equal/opposite moments, vertical reactions = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz.abs(), 0.0, 0.01, "pure bending R_A ~ 0");
    assert_close(r_end.rz.abs(), 0.0, 0.01, "pure bending R_B ~ 0");
}

// ═══════════════════════════════════════════════════════════════
// 6. Two-Span Continuous Beam with UDL
// ═══════════════════════════════════════════════════════════════

/// Two equal spans L, each carrying UDL q.
/// Three-moment equation: 2*M_B*(L+L) = -q*L^3/4 - q*L^3/4
///   4*L*M_B = -q*L^3/2  =>  M_B = -q*L^2/8
/// R_A = R_C = qL/2 - M_B/L = qL/2 - (-qL/8) = qL/2 + qL/8 = ... wait:
///   Wait, R_A from span AB: R_A = qL/2 + M_B/L (with M_B negative hogging)
///   Actually: Taking span A-B with pin at A and moment M_B at B:
///     R_A_span1 = qL/2 - M_B/L
///   M_B = -qL^2/8 (hogging, so signed negative if we define sagging positive)
///     R_A_span1 = qL/2 - (-qL^2/8)/L = qL/2 + qL/8 = 5qL/8 ... no that's wrong.
///   Let me be more careful. For a beam AB simply-supported carrying UDL q with
///   a moment M_B at B:
///     Sum moments about A: R_B*L = qL^2/2 + M_B => R_B = qL/2 + M_B/L
///     R_A = qL - R_B = qL/2 - M_B/L
///   If M_B = -qL^2/8 (hogging):
///     R_A = qL/2 - (-qL/8) = qL/2 + qL/8 = 5qL/8
///     R_B_from_span1 = qL/2 + (-qL/8) = 3qL/8
///   By symmetry R_C = 5qL/8 from span BC, R_B_from_span2 = 3qL/8
///   Total R_B = 3qL/8 + 3qL/8 = 3qL/4 ... wait, that gives 5qL/8+3qL/4+5qL/8 = 2qL. OK.
///   No: total = 5qL/8 + 6qL/8 + 5qL/8 = 16qL/8 = 2qL. Correct (total load = 2*qL).
///
///   Wait, let me redo: R_A = 3qL/8, R_B = 10qL/8, R_C = 3qL/8
///   Actually the standard continuous beam result for two equal spans with UDL:
///   R_A = R_C = 3qL/8, R_B = 10qL/8 = 5qL/4, M_B = qL^2/8
///   Let me verify equilibrium: 3qL/8 + 5qL/4 + 3qL/8 = 3qL/8 + 10qL/8 + 3qL/8 = 16qL/8 = 2qL. Correct!
///
///   Actually: the standard result is R_end = 3qL/8, R_mid = 10qL/8.
///   Moment at middle support = qL^2/8 (hogging).
#[test]
fn validation_two_span_continuous_udl() {
    let l = 10.0; // each span
    let q = 12.0;
    let n_per_span: usize = 8;

    let total_elements = n_per_span * 2;

    // Build distributed loads on all elements
    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Node IDs: 1 (A), n_per_span+1 (B), 2*n_per_span+1 (C)
    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();

    // R_A = R_C = 3qL/8, R_B = 10qL/8
    assert_close(r_a.rz, 3.0 * q * l / 8.0, 0.02, "2-span R_A");
    assert_close(r_c.rz, 3.0 * q * l / 8.0, 0.02, "2-span R_C");
    assert_close(r_b.rz, 10.0 * q * l / 8.0, 0.02, "2-span R_B");

    // Equilibrium: total = 2*q*L = 240
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * q * l, 0.01, "2-span sum_Ry");
}

// ═══════════════════════════════════════════════════════════════
// 7. Simply-Supported — Partial UDL over Middle Third
// ═══════════════════════════════════════════════════════════════

/// SS beam L=12 with UDL q over the middle third (from x=4 to x=8).
/// By symmetry: R_A = R_B = q*c/2 where c = loaded length = L/3 = 4.
/// R_A = R_B = q*4/2 = 2q.
/// Maximum moment at midspan (by symmetry):
///   M_mid = R_A * L/2 - q*(c/2)*(c/4)
///         = 2q * 6 - q*2*1 = 12q - 2q = 10q
///   Wait, let me redo carefully.
///   R_A = q*c/2 = q*4/2 = 2*q (for any q)
///   M at x=6: M = R_A * 6 - q*(6-4)^2/2 = 2q*6 - q*4/2 = 12q - 2q = 10q
///   With q=10: M_mid = 100
///
///   Actually wait: the loaded region is from x=4 to x=8. At x=6 (midspan):
///     The portion of load left of x=6 has length 6-4=2, so the load = q*2
///     Its centroid is at distance 1 from x=6 (at x=5).
///     M(6) = R_A * 6 - q*2*1 = 2q*6 - 2q = 12q - 2q = 10q. Yes.
///   With q=10: R_A = 20, M_mid = 100.
#[test]
fn validation_ss_partial_udl_middle_third() {
    let l = 12.0;
    let q = 10.0;
    let n: usize = 12; // elem_len = 1.0
    let loaded_start_elem = 5; // elements 5,6,7,8 cover x=4 to x=8
    let loaded_end_elem = 8;

    let mut loads = Vec::new();
    for i in loaded_start_elem..=loaded_end_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions by symmetry: R_A = R_B = q*c/2 = 10*4/2 = 20
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, q * 4.0 / 2.0, 0.01, "partial UDL R_A");
    assert_close(r_end.rz, q * 4.0 / 2.0, 0.01, "partial UDL R_B");

    // Equilibrium: total load = q*c = 40
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * 4.0, 0.01, "partial UDL sum_Ry");

    // Element at midspan (element 6, between x=5 and x=6): M_start at x=5
    // M(5) = R_A*5 - q*(5-4)^2/2 = 20*5 - 10*0.5 = 100 - 5 = 95
    // M(6) = R_A*6 - q*(6-4)^2/2 = 20*6 - 10*4/2 = 120 - 20 = 100
    let ef_6 = results.element_forces.iter().find(|ef| ef.element_id == 6).unwrap();
    assert_close(ef_6.m_start.abs(), 95.0, 0.02, "partial UDL M(x=5)");
    let ef_7 = results.element_forces.iter().find(|ef| ef.element_id == 7).unwrap();
    assert_close(ef_7.m_start.abs(), 100.0, 0.02, "partial UDL M(x=6)");
}

// ═══════════════════════════════════════════════════════════════
// 8. Cantilever — Superposition: Tip Load + UDL
// ═══════════════════════════════════════════════════════════════

/// Cantilever with both a tip point load P and a UDL q.
/// By superposition:
///   delta_tip = PL^3/(3EI) + qL^4/(8EI)
///   theta_tip = PL^2/(2EI) + qL^3/(6EI)
///   R = P + qL
///   M_fixed = PL + qL^2/2
#[test]
fn validation_cantilever_superposition() {
    let l = 8.0;
    let p = 40.0;
    let q = 10.0;
    let n: usize = 8;

    let mut loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        }),
    ];
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Tip deflection: PL^3/(3EI) + qL^4/(8EI)
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_point: f64 = p * l.powi(3) / (3.0 * EI);
    let delta_udl: f64 = q * l.powi(4) / (8.0 * EI);
    assert_close(tip.uz.abs(), delta_point + delta_udl, 0.01, "superpos delta_tip");

    // Tip rotation: PL^2/(2EI) + qL^3/(6EI)
    let theta_point: f64 = p * l.powi(2) / (2.0 * EI);
    let theta_udl: f64 = q * l.powi(3) / (6.0 * EI);
    assert_close(tip.ry.abs(), theta_point + theta_udl, 0.01, "superpos theta_tip");

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, p + q * l, 0.01, "superpos Ry");
    assert_close(r1.my.abs(), p * l + q * l * l / 2.0, 0.01, "superpos M_fixed");
}
