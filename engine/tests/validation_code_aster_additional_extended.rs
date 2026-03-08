/// Validation: Code_Aster Additional Extended Benchmark Problems
///
/// Reference: Code_Aster V3.01 Validation Manual — SSLL series (extended topics).
///
/// Tests: propped cantilever (SSLL108a), asymmetric two-span beam (SSLL109a),
///        triangular distributed load (SSLL111a), two-bar truss (SSLL112a),
///        fixed beam with point load at third-point (SSLL113a),
///        K-truss panel (SSLL114a), portal frame under gravity (SSLL115a),
///        stepped cantilever with partial UDL (SSLL117a).
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver internally multiplies by 1000)
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴

// ═══════════════════════════════════════════════════════════════
// 1. SSLL108a — Propped Cantilever with UDL
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL108 case (a).
// Beam fixed at left, roller at right (propped cantilever), UDL q over full span.
//   Reaction at roller: R_B = 3*q*L/8
//   Reaction at fixed end: R_A = 5*q*L/8
//   Fixed-end moment: M_A = q*L^2/8
//   Max positive moment at x = 3L/8: M_max = 9*q*L^2/128

#[test]
fn validation_ca_ssll108a_propped_cantilever_udl() {
    let l = 8.0; // m
    let q = 12.0; // kN/m
    let n = 16; // elements

    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reaction at roller (right end): R_B = 3*q*L/8 = 36 kN
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let rb_expected = 3.0 * q * l / 8.0;
    assert_close(r_b.ry, rb_expected, 0.02, "SSLL108a R_B = 3qL/8");

    // Reaction at fixed end: R_A = 5*q*L/8 = 60 kN
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let ra_expected = 5.0 * q * l / 8.0;
    assert_close(r_a.ry, ra_expected, 0.02, "SSLL108a R_A = 5qL/8");

    // Fixed-end moment: M_A = q*L^2/8 = 96 kN.m
    let ma_expected = q * l * l / 8.0;
    assert_close(r_a.mz.abs(), ma_expected, 0.02, "SSLL108a M_A = qL^2/8");

    // Equilibrium: sum of vertical reactions = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * l, 0.01, "SSLL108a sum Ry = qL");

    // Max positive moment at x = 3L/8: M_max = 9*q*L^2/128 = 54 kN.m
    // The moment at the fixed end is negative (hogging), and changes sign further along.
    // The max sagging moment occurs around x = 3L/8 = 3.0 m (element ~6 of 16).
    let m_pos_expected = 9.0 * q * l * l / 128.0;
    // The fixed-end moment sign convention: m_start of element 1 is the support moment (hogging).
    // Look for the max positive (sagging) moment in the span, which has the opposite sign
    // to the fixed-end moment. Use the sign of the moment at the roller end as reference
    // for the sagging direction.
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    let sagging_sign = ef_mid.m_start.signum();
    // Collect all moments with the sagging sign and find the max
    let m_span_max: f64 = results.element_forces.iter()
        .flat_map(|e| vec![e.m_start, e.m_end])
        .filter(|&m| m * sagging_sign > 0.0)
        .map(|m| m.abs())
        .fold(0.0, f64::max);
    assert_close(m_span_max, m_pos_expected, 0.05, "SSLL108a M_max = 9qL^2/128");
}

// ═══════════════════════════════════════════════════════════════
// 2. SSLL109a — Asymmetric Two-Span Continuous Beam
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL109 case (a).
// Two-span continuous beam with spans L1=5m and L2=3m, UDL q on both spans.
//   By three-moment equation (single interior support B):
//   M_B = -q*(L1^3 + L2^3) / (8*(L1 + L2))
//   R_A = q*L1/2 - M_B/L1
//   R_C = q*L2/2 - M_B/L2
//   R_B = q*(L1+L2) - R_A - R_C

#[test]
fn validation_ca_ssll109a_asymmetric_two_span() {
    let l1 = 5.0; // m, first span
    let l2 = 3.0; // m, second span
    let q = 10.0; // kN/m
    let n_per_span = 10;

    let total_elements = n_per_span * 2;

    let loads: Vec<SolverLoad> = (0..total_elements)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_continuous_beam(
        &[l1, l2],
        n_per_span,
        E, A, IZ,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total load
    let total_load = q * (l1 + l2);

    // Three-moment equation: M_B = -q*(L1^3 + L2^3) / (8*(L1+L2))
    let mb_expected = q * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));

    // Reactions from statics:
    let ra_expected = q * l1 / 2.0 - mb_expected / l1;
    let rc_expected = q * l2 / 2.0 - mb_expected / l2;
    let rb_expected = total_load - ra_expected - rc_expected;

    // Support node IDs
    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap().ry;
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap().ry;

    assert_close(r_a, ra_expected, 0.03, "SSLL109a R_A");
    assert_close(r_b, rb_expected, 0.03, "SSLL109a R_B");
    assert_close(r_c, rc_expected, 0.03, "SSLL109a R_C");

    // Sum of reactions = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "SSLL109a sum Ry = q(L1+L2)");

    // Interior support moment
    let m_at_b: f64 = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span)
        .map(|e| e.m_end.abs())
        .unwrap_or(0.0);
    assert_close(m_at_b, mb_expected, 0.05, "SSLL109a M_B = q(L1^3+L2^3)/(8(L1+L2))");
}

// ═══════════════════════════════════════════════════════════════
// 3. SSLL111a — Simply Supported Beam with Triangular Load
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL111 case (a).
// Simply supported beam, span L, triangular load from 0 at left to q at right.
//   Total load: W = q*L/2
//   Reactions: R_A = q*L/6, R_B = q*L/3
//   Max moment at x = L/sqrt(3): M_max = q*L^2/(9*sqrt(3))
//   Midspan deflection: delta = q*L^4 * 5*sqrt(5) / (384*E*I) ... complex;
//   use comparison approach instead.

#[test]
fn validation_ca_ssll111a_triangular_load() {
    let l = 6.0; // m
    let q_max = 24.0; // kN/m (peak at right end)
    let n = 24; // elements (fine mesh for linear variation)

    // Apply linearly varying load: q(x) = q_max * x / L
    // On element i (from x_i to x_{i+1}), q_i = q_max * x_i / L, q_j = q_max * x_{i+1} / L
    let dx = l / n as f64;
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let x_i = i as f64 * dx;
            let x_j = (i + 1) as f64 * dx;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: -(q_max * x_i / l),
                q_j: -(q_max * x_j / l),
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total load: W = q_max * L / 2 = 72 kN
    let total_load = q_max * l / 2.0;

    // Reactions: R_A = q*L/6 = 24 kN, R_B = q*L/3 = 48 kN
    let ra_expected = q_max * l / 6.0;
    let rb_expected = q_max * l / 3.0;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.ry, ra_expected, 0.02, "SSLL111a R_A = qL/6");
    assert_close(r_b.ry, rb_expected, 0.02, "SSLL111a R_B = qL/3");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "SSLL111a sum Ry = qL/2");

    // Max moment at x = L/sqrt(3): M_max = q*L^2 / (9*sqrt(3))
    let x_mmax = l / (3.0 as f64).sqrt();
    let m_max_expected = q_max * l * l / (9.0 * (3.0 as f64).sqrt());

    // Find max moment in element forces
    let m_max_actual: f64 = results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert_close(m_max_actual, m_max_expected, 0.05,
        &format!("SSLL111a M_max = qL^2/(9sqrt3) at x={:.2}", x_mmax));

    // Deflection should be less than UDL case: delta_UDL = 5*q*L^4/(384*E*I)
    // For triangular load, max deflection is smaller than for same peak UDL
    let delta_udl = 5.0 * q_max * l.powi(4) / (384.0 * E_EFF * IZ);
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert!(
        d_mid.uy.abs() < delta_udl,
        "SSLL111a triangular deflection {:.6e} < UDL deflection {:.6e}",
        d_mid.uy.abs(), delta_udl
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. SSLL112a — Two-Bar Symmetric Truss
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL112 case (a).
// Two inclined bars meeting at apex, loaded vertically.
//   Nodes: (0,0) pinned, (2*a,0) pinned, (a,h) apex
//   Vertical load P at apex.
//   Bar force: F = P / (2*sin(theta)) where theta = atan(h/a)
//   Vertical deflection: delta = P*L_bar / (2*A*E*sin^2(theta))

#[test]
fn validation_ca_ssll112a_two_bar_truss() {
    let a = 3.0; // half-span, m
    let h = 4.0; // height, m
    let p = 80.0; // kN
    let a_bar = 0.005; // m^2

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0 * a, 0.0),
        (3, a, h),
    ];
    let elems = vec![
        (1, "truss", 1, 3, 1, 1, false, false), // left bar
        (2, "truss", 2, 3, 1, 1, false, false), // right bar
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_bar, 1e-10)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Geometry
    let l_bar = (a * a + h * h).sqrt(); // bar length
    let sin_theta = h / l_bar;

    // Bar force: F = P / (2*sin(theta))
    let f_expected = p / (2.0 * sin_theta);

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start.abs(), f_expected, 0.02, "SSLL112a left bar force = P/(2*sin_theta)");
    assert_close(ef2.n_start.abs(), f_expected, 0.02, "SSLL112a right bar force (symmetry)");

    // Symmetry: both bars carry the same force
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.01, "SSLL112a bar force symmetry");

    // Vertical deflection at apex: delta = P*L / (2*A*E*sin^2(theta))
    let delta_expected = p * l_bar / (2.0 * a_bar * E_EFF * sin_theta * sin_theta);
    let d_apex = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert_close(d_apex.uy.abs(), delta_expected, 0.02, "SSLL112a apex deflection");

    // Reactions: by symmetry R1_y = R2_y = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "SSLL112a R1_y = P/2");
    assert_close(r2.ry, p / 2.0, 0.02, "SSLL112a R2_y = P/2");
}

// ═══════════════════════════════════════════════════════════════
// 5. SSLL113a — Fixed-Fixed Beam with Point Load at Third-Point
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL113 case (a).
// Fixed-fixed beam, span L, point load P at x = L/3.
//   Fixed-end moments (from beam theory):
//   M_A = 4*P*L/27 (at fixed left end)
//   M_B = 2*P*L/27 (at fixed right end)
//   Reactions: R_A = P*(1 - a/L)^2*(1 + 2a/L) where a = L/3
//            = P*(2/3)^2*(1 + 2/3) = P * 4/9 * 5/3 = 20P/27
//   R_B = P - R_A = 7P/27

#[test]
fn validation_ca_ssll113a_fixed_beam_third_point_load() {
    let l = 9.0; // m
    let p = 54.0; // kN (chosen for clean fractions with L/3)
    let n = 18; // elements

    // Place point load at L/3 = 3m from left
    // This falls at node n/3 + 1 = 7
    let load_node = n / 3 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // a = L/3, b = 2L/3
    let a_pos = l / 3.0;
    let b_pos = 2.0 * l / 3.0;

    // Fixed-end reactions for point load at distance a from left end:
    // R_A = P*b^2*(3a + b) / L^3
    // R_B = P*a^2*(a + 3b) / L^3
    let ra_expected = p * b_pos.powi(2) * (3.0 * a_pos + b_pos) / l.powi(3);
    let rb_expected = p * a_pos.powi(2) * (a_pos + 3.0 * b_pos) / l.powi(3);

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.ry, ra_expected, 0.02, "SSLL113a R_A = Pb^2(3a+b)/L^3");
    assert_close(r_b.ry, rb_expected, 0.02, "SSLL113a R_B = Pa^2(a+3b)/L^3");

    // Fixed-end moments:
    // M_A = P*a*b^2 / L^2
    // M_B = P*a^2*b / L^2
    let ma_expected = p * a_pos * b_pos.powi(2) / l.powi(2);
    let mb_expected = p * a_pos.powi(2) * b_pos / l.powi(2);

    assert_close(r_a.mz.abs(), ma_expected, 0.03, "SSLL113a M_A = Pab^2/L^2");
    assert_close(r_b.mz.abs(), mb_expected, 0.03, "SSLL113a M_B = Pa^2b/L^2");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "SSLL113a sum Ry = P");

    // The moment at the load point should equal R_A * a - M_A
    // (from left-hand section free body)
    let m_at_load = ra_expected * a_pos - ma_expected;
    // Find the element forces near the load point
    let ef_at_load = results.element_forces.iter()
        .find(|e| e.element_id == n / 3)
        .unwrap();
    assert_close(ef_at_load.m_end.abs(), m_at_load.abs(), 0.05,
        "SSLL113a moment at load point from statics");
}

// ═══════════════════════════════════════════════════════════════
// 6. SSLL114a — K-Truss Panel Under Vertical Load
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL114 case (a).
// K-truss panel: 2 panels wide, center vertical plus diagonals.
//   Bottom chord: (0,0)-(4,0)-(8,0)
//   Top chord: (0,3)-(4,3)-(8,3)
//   Verticals at x=0,4,8, diagonals in K-pattern
//   Load: P downward at top-center node (4,3)
//
// By method of joints, the center vertical carries P (compression),
// and diagonals carry forces proportional to geometry.

#[test]
fn validation_ca_ssll114a_k_truss_panel() {
    let p = 60.0; // kN
    let a_bar = 0.004; // m^2
    let panel_w = 4.0;
    let panel_h = 3.0;

    // Nodes
    let nodes = vec![
        (1, 0.0, 0.0),            // bottom-left
        (2, panel_w, 0.0),        // bottom-center
        (3, 2.0 * panel_w, 0.0), // bottom-right
        (4, 0.0, panel_h),        // top-left
        (5, panel_w, panel_h),    // top-center
        (6, 2.0 * panel_w, panel_h), // top-right
    ];

    // Elements (all truss): bottom chords, top chords, verticals, diagonals
    let elems = vec![
        // Bottom chord
        (1,  "truss", 1, 2, 1, 1, false, false),
        (2,  "truss", 2, 3, 1, 1, false, false),
        // Top chord
        (3,  "truss", 4, 5, 1, 1, false, false),
        (4,  "truss", 5, 6, 1, 1, false, false),
        // Verticals
        (5,  "truss", 1, 4, 1, 1, false, false),
        (6,  "truss", 2, 5, 1, 1, false, false),
        (7,  "truss", 3, 6, 1, 1, false, false),
        // Diagonals (X-pattern)
        (8,  "truss", 1, 5, 1, 1, false, false),
        (9,  "truss", 2, 4, 1, 1, false, false),
        (10, "truss", 2, 6, 1, 1, false, false),
        (11, "truss", 3, 5, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_bar, 1e-10)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: R1_y = R3_y = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "SSLL114a R1 = P/2");
    assert_close(r3.ry, p / 2.0, 0.02, "SSLL114a R3 = P/2");

    // Center vertical (element 6, node 2->5) carries compression
    let ef_vert = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(ef_vert.n_start < -1.0,
        "SSLL114a center vertical should be in compression, got N={:.4}", ef_vert.n_start);

    // Equilibrium: sum Ry = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "SSLL114a sum Ry = P");

    // By symmetry, bar forces in left panel should mirror right panel
    // Left diagonal (elem 8, 1->5) vs right diagonal (elem 11, 3->5)
    let ef8 = results.element_forces.iter().find(|e| e.element_id == 8).unwrap();
    let ef11 = results.element_forces.iter().find(|e| e.element_id == 11).unwrap();
    assert_close(ef8.n_start.abs(), ef11.n_start.abs(), 0.03, "SSLL114a diagonal symmetry");

    // Top chord forces should also be symmetric
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef3.n_start.abs(), ef4.n_start.abs(), 0.03, "SSLL114a top chord symmetry");
}

// ═══════════════════════════════════════════════════════════════
// 7. SSLL115a — Portal Frame Under Gravity (Beam UDL)
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL115 case (a).
// Fixed-base portal frame, UDL on beam (gravity), no lateral load.
//   Height H, width W, UDL q on beam.
//   Nodes: 1(0,0), 2(0,H), 3(W,H), 4(W,0)
//   Elements: col1(1->2), beam(2->3), col2(4->3)
//   By symmetry: R1_y = R4_y = q*W/2 (vertical)
//   Beam midspan moment < q*W^2/8 (frame action reduces it)

#[test]
fn validation_ca_ssll115a_portal_gravity() {
    let h = 4.0; // column height, m
    let w = 8.0; // beam span, m
    let q = 20.0; // kN/m on beam

    // Use make_portal_frame helper (3 elements: col1, beam, col2)
    // It only supports nodal loads, so we build manually with a multi-element beam.
    // Simpler: 4-node portal, beam is element 2, apply UDL on it.
    let nodes = vec![
        (1, 0.0, 0.0), // left base
        (2, 0.0, h),   // left top
        (3, w, h),      // right top
        (4, w, 0.0),   // right base
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 4, 3, 1, 1, false, false), // right column (bottom to top)
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    // UDL on beam element only (element 2)
    let loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: 2,
        q_i: -q,
        q_j: -q,
        a: None,
        b: None,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * W = 160 kN
    let total_load = q * w;

    // By symmetry, each base carries half the vertical load
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert_close(r_left.ry, total_load / 2.0, 0.03, "SSLL115a R_left = qW/2");
    assert_close(r_right.ry, total_load / 2.0, 0.03, "SSLL115a R_right = qW/2");

    // Base moments should be equal by symmetry
    assert_close(r_left.mz.abs(), r_right.mz.abs(), 0.05, "SSLL115a base moment symmetry");

    // Beam midspan moment should be less than simply-supported value q*W^2/8
    // For a portal frame with fixed bases, the joint moments reduce the midspan moment.
    let m_ss = q * w * w / 8.0;
    let ef_beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let beam_m_max = ef_beam.m_start.abs().max(ef_beam.m_end.abs());
    assert!(
        beam_m_max < m_ss,
        "SSLL115a frame beam moment {:.2} < SS moment {:.2} (continuity reduces midspan moment)",
        beam_m_max, m_ss
    );

    // Beam joint moments should be nonzero (frame action)
    assert!(ef_beam.m_start.abs() > 1.0, "SSLL115a beam start moment nonzero (frame action)");
    assert!(ef_beam.m_end.abs() > 1.0, "SSLL115a beam end moment nonzero (frame action)");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "SSLL115a sum Ry = qW");
}

// ═══════════════════════════════════════════════════════════════
// 8. SSLL117a — Stepped Cantilever with Partial UDL
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL117 case (a).
// Cantilever beam with two sections: stiffer root section (2*I) over first L/2,
// then standard section (I) over second L/2. UDL q only on the outer half.
//   Tip deflection by virtual work:
//   Moment from q on outer half: M(x) for x < L/2 is q*(L-x)^2/2 - q*(L/2)^2/2 + q*(L/2)*(L/2-x)
//   Simplified: use superposition of cantilever results with different EI segments.

#[test]
fn validation_ca_ssll117a_stepped_cantilever_partial_udl() {
    let l = 6.0; // m total
    let q = 15.0; // kN/m (on outer half only)
    let n_per_seg = 6; // elements per half
    let total_n = n_per_seg * 2;
    let dx = l / total_n as f64; // = 0.5 m

    let iz_root = 2.0 * IZ; // stiffer root section
    let iz_tip = IZ; // standard tip section

    let mut nodes = Vec::new();
    for i in 0..=total_n {
        nodes.push((i + 1, i as f64 * dx, 0.0));
    }

    let mut elems = Vec::new();
    // Root segment (first half): section 1 (stiffer)
    for i in 0..n_per_seg {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    // Tip segment (second half): section 2 (standard)
    for i in 0..n_per_seg {
        let eid = n_per_seg + i + 1;
        elems.push((eid, "frame", n_per_seg + i + 1, n_per_seg + i + 2, 1, 2, false, false));
    }

    let sups = vec![(1, 1, "fixed")];
    let tip_node = total_n + 1;

    // UDL only on the outer half (elements n_per_seg+1 to total_n)
    let loads: Vec<SolverLoad> = (n_per_seg..total_n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, iz_root), (2, A, iz_tip)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let l_half = l / 2.0;

    // Base shear = total load on outer half = q * L/2 = 45 kN
    let total_load = q * l_half;
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.ry, total_load, 0.02, "SSLL117a V_base = q*L/2");

    // Base moment: centroid of load is at x = L/2 + L/4 = 3L/4 from left
    // M_base = q*(L/2)*(3L/4) = 3qL^2/8 = 3*15*36/8 = 202.5 kN.m
    let m_base_expected = q * l_half * (l_half + l_half / 2.0);
    assert_close(r_base.mz.abs(), m_base_expected, 0.02, "SSLL117a M_base = q(L/2)(3L/4)");

    // Tip deflection by integration (virtual work with two segments):
    // Segment 1 (root, 0 < x < L/2, I = 2I):
    //   Real moment: M(x) = q*L/2*(3L/4 - x) for 0 <= x <= L/2
    //     (load resultant q*L/2 at centroid 3L/4)
    //   But more precisely: M(x) = total_load*(3L/4) - total_load*x for the resultant
    //     minus the partial moment distribution. Let's use M(x) from statics directly.
    //   For x in root segment: M(x) = q*(L/2)*((L/2 + L/4) - x) = q*L/2*(3L/4 - x)
    //   Virtual: m(x) = 1*(L - x) (unit load at tip)
    //
    // Segment 2 (tip, L/2 < x < L, I = I):
    //   Real: M(x) = q*(L-x)^2/2
    //   Virtual: m(x) = (L-x)
    //
    // delta = integral_0^{L/2} M(x)*m(x)/(E*2I) dx + integral_{L/2}^L M(x)*m(x)/(E*I) dx
    //
    // Integral 2 (tip segment, substituting u = L-x, u from L/2 to 0):
    //   = integral_0^{L/2} (q*u^2/2)*u / (E*I) du = q/(2*E*I) * [u^4/4]_0^{L/2}
    //   = q/(2*E*I) * (L/2)^4/4 = q*L^4/(128*E*I)
    let int2 = q * l.powi(4) / (128.0 * E_EFF * iz_tip);

    // Integral 1 (root segment): integrate M(x)*m(x)/(E*2I) from 0 to L/2
    //   M(x) = q*L_half*(3L/4 - x) - q*(x - L/2)^2/2, but x < L/2 so the partial term is:
    //   Actually for x < L/2, no load exists, so M(x) = R_base_y * x (no, wait... wrong sign)
    //   Let's do it properly:
    //   For the cantilever, M(x) from right: at any x, M = integral of loads to the right.
    //   For x < L/2: all load is to the right, so M(x) = q*(L/2)*((L/2+L/4) - x)
    //     Wait, centroid of load block from x to ... no.
    //   The load extends from L/2 to L with intensity q.
    //   For x < L/2: M(x) = integral_{L/2}^{L} q*(s-x) ds = q*[(s-x)^2/2]_{L/2}^{L}
    //     = q/2*((L-x)^2 - (L/2-x)^2)
    //     = q/2*(L-x+L/2-x)*(L-x-L/2+x) = q/2*(3L/2-2x)*(L/2)
    //     = q*L/4*(3L/2-2x)
    //   Virtual: m(x) = (L - x)
    //   Integral 1 = integral_0^{L/2} q*L/4*(3L/2-2x)*(L-x) / (E*2I) dx
    //
    //   Let's compute numerically:
    //   q*L/(8*E*I) * integral_0^{L/2} (3L/2 - 2x)*(L - x) dx
    //   Expand: (3L/2 - 2x)*(L - x) = 3L^2/2 - 3Lx/2 - 2Lx + 2x^2
    //           = 3L^2/2 - 7Lx/2 + 2x^2
    //   Integrate from 0 to L/2:
    //     = [3L^2x/2 - 7Lx^2/4 + 2x^3/3]_0^{L/2}
    //     = 3L^3/4 - 7L^3/16 + L^3/12
    //     = L^3*(36/48 - 21/48 + 4/48) = L^3*19/48
    let int1 = q * l / (8.0 * E_EFF * iz_root) * l.powi(3) * 19.0 / 48.0;

    let delta_expected = int1 + int2;
    let d_tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();
    assert_close(d_tip.uy.abs(), delta_expected, 0.05, "SSLL117a tip deflection by virtual work");

    // Tip deflection should be larger than if entire beam had root stiffness (2I)
    // and smaller than if entire beam had tip stiffness (I)
    // For uniform cantilever with partial UDL on outer half:
    //   delta_uniform_I = q*L^4 * (7/384) ... actually complex.
    // Just verify it's positive and nonzero.
    assert!(d_tip.uy.abs() > 1e-6, "SSLL117a tip deflection should be nonzero");
}
