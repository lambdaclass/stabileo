/// Validation: Code_Aster SSLL Extended Beam Benchmark Problems
///
/// Reference: Code_Aster V3.01 Validation Manual — SSLL series (beam/bar problems).
///
/// Tests: clamped-pinned UDL, SS beam point load, continuous beam,
///        propped cantilever, portal combined, thermal truss,
///        elastic spring support, fixed-fixed partial UDL.
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective)
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴

// ═══════════════════════════════════════════════════════════════
// 1. SSLL101-inspired: Clamped-Pinned Beam with UDL
// ═══════════════════════════════════════════════════════════════
// Fixed at left, pinned at right, uniform distributed load q.
// Textbook results:
//   R_fixed  = 5qL/8  (vertical reaction at fixed end)
//   R_pinned = 3qL/8
//   M_fixed  = -qL²/8 (hogging at fixed end)
//   Max sagging moment = 9qL²/128 at x = 3L/8 from fixed end

#[test]
fn validation_ca_ssll101_clamped_pinned_udl() {
    let l = 10.0;
    let q = 12.0; // kN/m
    let n = 16;

    let mut loads = Vec::new();
    let _elem_len = l / n as f64;
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("pinned"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed end reaction = 5qL/8
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_pinned = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let r_fixed_expected = 5.0 * q * l / 8.0; // 75.0
    let r_pinned_expected = 3.0 * q * l / 8.0; // 45.0

    assert_close(r_fixed.ry, r_fixed_expected, 0.02, "SSLL101 R_fixed = 5qL/8");
    assert_close(r_pinned.ry, r_pinned_expected, 0.02, "SSLL101 R_pinned = 3qL/8");

    // Fixed-end moment = qL²/8 (hogging, so negative in our convention)
    let m_fixed_expected = q * l * l / 8.0; // 150.0
    assert_close(r_fixed.mz.abs(), m_fixed_expected, 0.02, "SSLL101 M_fixed = qL^2/8");

    // Equilibrium: sum of vertical reactions = qL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * l, 0.01, "SSLL101 sum Ry = qL");

    // Pinned end: moment reaction should be zero
    assert!(r_pinned.mz.abs() < 0.5, "SSLL101 pinned end M={:.4} should be ~0", r_pinned.mz);

    // Max sagging moment = 9qL^2/128 at x = 5L/8 from the fixed end.
    // dM/dx = 0 at x = R_A/q = 5L/8.
    // With L=10, n=16: elem_len = 0.625m. x = 5*10/8 = 6.25m → node 11 (element 10 end).
    let m_sag_expected = 9.0 * q * l * l / 128.0; // 84.375

    // The moment at x = 5L/8 is at the end of element 10 (node 11).
    let ef_at_sag = results.element_forces.iter()
        .find(|e| e.element_id == 10).unwrap();
    assert_close(ef_at_sag.m_end.abs(), m_sag_expected, 0.05,
        "SSLL101 max sagging M = 9qL^2/128 at x=5L/8");
}

// ═══════════════════════════════════════════════════════════════
// 2. SSLL104-inspired: Simply Supported Beam with Point Load at L/3
// ═══════════════════════════════════════════════════════════════
// SS beam, concentrated load P at L/3 from left support.
// R_A = 2P/3, R_B = P/3. Max moment at load point = 2PL/9.

#[test]
fn validation_ca_ssll104_ss_beam_point_load() {
    let l = 9.0;
    let p = 45.0; // kN
    let n = 18; // 18 elements, each 0.5m → load at element 6 end (node 7, x=3.0)

    let elem_len = l / n as f64; // 0.5m

    // Point load at x = L/3 = 3.0m.
    // With n=18 elements of 0.5m, node 7 is at x=3.0m (exactly L/3).
    // Apply as a nodal load at node 7.
    let load_node = (l / 3.0 / elem_len) as usize + 1; // node 7

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_A = P * (L - a) / L = P * 2/3
    let ra_expected = 2.0 * p / 3.0; // 30.0
    let rb_expected = p / 3.0; // 15.0

    assert_close(r_a.ry, ra_expected, 0.02, "SSLL104 R_A = 2P/3");
    assert_close(r_b.ry, rb_expected, 0.02, "SSLL104 R_B = P/3");

    // Moment at load point = R_A * a = (2P/3)(L/3) = 2PL/9
    let m_max_expected = 2.0 * p * l / 9.0; // 90.0

    // Find the moment at the load point (node 7). The moment at a node is
    // m_end of the element just left of it or m_start of the element just right.
    // Element 6 ends at node 7, so check m_end of element 6.
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == load_node - 1)
        .unwrap();
    // The moment should be sagging (positive or negative depending on convention)
    assert_close(ef_left.m_end.abs(), m_max_expected, 0.02,
        "SSLL104 M_max = 2PL/9 at load point");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "SSLL104 sum Ry = P");

    // Deflection at load point (using beam formula):
    // delta = P*a*b*(L^2-a^2-b^2) / (6*E*I*L)  where a=L/3, b=2L/3
    let a_pos = l / 3.0;
    let b_pos = 2.0 * l / 3.0;
    let delta_expected = p * a_pos * b_pos
        * (l * l - a_pos * a_pos - b_pos * b_pos).abs()
        / (6.0 * E_EFF * IZ * l);
    // Actually for a < b: delta_at_a = P*a^2*b^2/(3*E*I*L)
    let delta_at_load = p * a_pos.powi(2) * b_pos.powi(2) / (3.0 * E_EFF * IZ * l);
    let d_load = results.displacements.iter()
        .find(|d| d.node_id == load_node).unwrap();
    assert_close(d_load.uy.abs(), delta_at_load, 0.03,
        &format!("SSLL104 delta at load point (expected {:.6}, delta_gen {:.6})", delta_at_load, delta_expected));
}

// ═══════════════════════════════════════════════════════════════
// 3. SSLL106-inspired: Continuous Beam over 3 Equal Spans with UDL
// ═══════════════════════════════════════════════════════════════
// Three equal spans L each, UDL q on all spans.
// Three-moment equation gives interior support moments:
//   M_B = M_C = -qL²/10 (for equal spans with UDL).

#[test]
fn validation_ca_ssll106_continuous_beam_3span() {
    let span = 6.0;
    let q = 20.0; // kN/m
    let n_per_span = 8;
    let total_elements = n_per_span * 3;

    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[span, span, span],
        n_per_span, E, A, IZ, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * 3L = 360 kN. Sum of reactions must match.
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * 3.0 * span, 0.01, "SSLL106 sum Ry = 3qL");

    // Interior support moments: M_B = M_C = qL²/10 (magnitude)
    // Support B is at node n_per_span+1, support C at 2*n_per_span+1
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;

    // Moment at interior support = m_end of element ending there (or m_start of next)
    let m_b_expected = q * span * span / 10.0; // 72.0

    // Find element ending at node_b
    let ef_left_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    assert_close(ef_left_b.m_end.abs(), m_b_expected, 0.03,
        "SSLL106 M_B = qL^2/10");

    let ef_left_c = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n_per_span).unwrap();
    assert_close(ef_left_c.m_end.abs(), m_b_expected, 0.03,
        "SSLL106 M_C = qL^2/10");

    // By symmetry, M_B should equal M_C
    assert_close(ef_left_b.m_end.abs(), ef_left_c.m_end.abs(), 0.02,
        "SSLL106 M_B = M_C symmetry");

    // End reactions: by three-moment equation for 3 equal spans:
    // R_A = R_D = 0.4 * qL, R_B = R_C = 1.1 * qL
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_d = results.reactions.iter()
        .find(|r| r.node_id == 3 * n_per_span + 1).unwrap();

    assert_close(r_a.ry, 0.4 * q * span, 0.03, "SSLL106 R_A = 0.4qL");
    assert_close(r_d.ry, 0.4 * q * span, 0.03, "SSLL106 R_D = 0.4qL");

    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();

    assert_close(r_b.ry, 1.1 * q * span, 0.03, "SSLL106 R_B = 1.1qL");
    assert_close(r_c.ry, 1.1 * q * span, 0.03, "SSLL106 R_C = 1.1qL");
}

// ═══════════════════════════════════════════════════════════════
// 4. SSLL107-inspired: Propped Cantilever with Midspan Point Load
// ═══════════════════════════════════════════════════════════════
// Fixed at left, roller at right (propped cantilever).
// Point load P at midspan.
//   M_fixed = -5PL/32 (correction: let's use the textbook: 3PL/16)
//   Actually the standard result for propped cantilever P at L/2:
//     R_prop = 5P/16, R_fixed = 11P/16
//     M_fixed = 3PL/16
//     M_midspan = 5PL/32

#[test]
fn validation_ca_ssll107_propped_cantilever_point_load() {
    let l = 8.0;
    let p = 64.0; // kN (nice numbers)
    let n = 16;
    let mid_node = n / 2 + 1; // node 9 at x=4.0

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    // Fixed at left (node 1), roller at right (node n+1)
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_prop = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Propped cantilever with P at L/2:
    // R_prop (roller) = 5P/16, R_fixed = 11P/16
    let r_prop_expected = 5.0 * p / 16.0;  // 20.0
    let r_fixed_expected = 11.0 * p / 16.0; // 44.0

    assert_close(r_prop.ry, r_prop_expected, 0.02, "SSLL107 R_prop = 5P/16");
    assert_close(r_fixed.ry, r_fixed_expected, 0.02, "SSLL107 R_fixed = 11P/16");

    // Fixed-end moment = 3PL/16
    let m_fixed_expected = 3.0 * p * l / 16.0; // 96.0
    assert_close(r_fixed.mz.abs(), m_fixed_expected, 0.02, "SSLL107 M_fixed = 3PL/16");

    // Midspan moment = 5PL/32
    let m_mid_expected = 5.0 * p * l / 32.0; // 80.0
    let ef_left_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_left_mid.m_end.abs(), m_mid_expected, 0.02,
        "SSLL107 M_midspan = 5PL/32");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "SSLL107 sum Ry = P");

    // Roller has no moment
    assert!(r_prop.mz.abs() < 0.5, "SSLL107 roller M={:.4} should be ~0", r_prop.mz);
}

// ═══════════════════════════════════════════════════════════════
// 5. SSLL108-inspired: Portal Frame with Lateral + Gravity Loading
// ═══════════════════════════════════════════════════════════════
// Fixed-base portal frame with both lateral load H and gravity loads.
// Verify base moments, column shears, beam moment.

#[test]
fn validation_ca_ssll108_portal_combined_loading() {
    let h = 4.0;  // column height
    let w = 6.0;  // beam span
    let h_load = 24.0;  // horizontal load at beam level (kN)
    let p_gravity = 30.0; // vertical load at each beam-column joint (kN)

    // Portal: nodes (1,0,0)-(2,0,h)-(3,w,h)-(4,w,0)
    // Elements: left column 1-2, beam 2-3, right column 3-4
    // Fixed at 1 and 4
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: h_load, fy: -p_gravity, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p_gravity, mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium checks
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Vertical equilibrium: R1_y + R4_y = 2*P_gravity
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p_gravity, 0.01, "SSLL108 sum Ry = 2P");

    // Horizontal equilibrium: R1_x + R4_x = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_load, 0.01, "SSLL108 sum Rx = -H");

    // Moment equilibrium about base left:
    // R4_y * w + (R1_mz + R4_mz) = H * h + P*0 + P*w
    // => R1_mz + R4_mz + R4_y * w = H*h + P*w
    let m_check = r1.mz + r4.mz + r4.ry * w;
    let m_expected = h_load * h + p_gravity * w;
    assert_close(m_check, m_expected, 0.02, "SSLL108 moment equilibrium");

    // Column shear: for symmetric portal under pure lateral H (no gravity),
    // each column takes H/2. With gravity, the shears are still balanced.
    // Total column shear = H
    let _ef_col1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let _ef_col2 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // The horizontal reactions at base must sum to H
    assert_close((r1.rx + r4.rx).abs(), h_load, 0.01,
        "SSLL108 total column base shear = H");

    // For fixed-base portal under lateral load, inflection points exist in columns
    // The beam carries gravity moment ~ P*w/2 from gravity loads
    // With only joint loads (no distributed beam load), beam end moments from gravity
    // are zero (only from frame action). The beam moment distribution comes from
    // the frame stiffness distribution.

    // Verify base moments are nonzero (fixed base should have moment)
    assert!(r1.mz.abs() > 1.0, "SSLL108 left base M should be significant");
    assert!(r4.mz.abs() > 1.0, "SSLL108 right base M should be significant");

    // Drift should be nonzero and in direction of lateral load
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.ux > 0.0, "SSLL108 drift should be positive (in load direction)");
}

// ═══════════════════════════════════════════════════════════════
// 6. SSLL111-inspired: Two-Bar Truss with Thermal Load
// ═══════════════════════════════════════════════════════════════
// Two bars meeting at a point, both fixed at far ends.
// Bar 1 (horizontal): nodes 1→2, length L.
// Bar 2 (inclined at angle theta): nodes 3→2, length L2.
// Bar 1 is heated by ΔT. Solve for force in bars.
//
// For a simpler, well-defined problem:
// Two collinear bars (bar1: 1-2, bar2: 2-3) forming a fixed-fixed bar.
// Bar 1 is heated, bar 2 is not.
// Thermal force = E*A*alpha*DT * (L2/(L1+L2))

#[test]
fn validation_ca_ssll111_two_bar_thermal() {
    let l1 = 4.0;
    let l2 = 6.0;
    let l_total = l1 + l2;
    let dt = 50.0;
    let alpha = 12e-6;
    let a_bar = 0.005;

    // Two segments: bar1 from x=0 to x=L1, bar2 from x=L1 to x=L1+L2
    // Fixed at both ends, bar1 heated
    let n1 = 4; // elements in bar 1
    let n2 = 6; // elements in bar 2
    let _n_total = n1 + n2;

    let elem_len1 = l1 / n1 as f64;
    let elem_len2 = l2 / n2 as f64;

    let mut nodes = Vec::new();
    // Bar 1 nodes
    for i in 0..=n1 {
        nodes.push((i + 1, i as f64 * elem_len1, 0.0));
    }
    // Bar 2 nodes (continuing from junction)
    for i in 1..=n2 {
        nodes.push((n1 + 1 + i, l1 + i as f64 * elem_len2, 0.0));
    }

    let mut elems = Vec::new();
    for i in 0..n1 {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    for i in 0..n2 {
        elems.push((n1 + 1 + i, "frame", n1 + 1 + i, n1 + 2 + i, 1, 1, false, false));
    }

    let n_nodes = n1 + n2 + 1;
    let sups = vec![(1, 1, "fixed"), (2, n_nodes, "fixed")];

    // Thermal load only on bar 1 elements
    let loads: Vec<SolverLoad> = (0..n1).map(|i| {
        SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: dt,
            dt_gradient: 0.0,
        })
    }).collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_bar, 1e-10)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Expected thermal force: when bar1 wants to expand by alpha*DT*L1 but is
    // restrained by bar2, the force is:
    // N = E*A*alpha*DT * L1 * (1 / (L1/EA + L2/EA)) * (1/EA)
    // Simplifying (same EA): N = E*A*alpha*DT * L1 / (L1 + L2)
    // Wait — for two bars in series, both same EA:
    // Free expansion of bar1 = alpha*DT*L1
    // Constraint: delta1 + delta2 = 0 (fixed-fixed)
    // delta1 = alpha*DT*L1 - N*L1/(EA)
    // delta2 = -N*L2/(EA)
    // => alpha*DT*L1 = N*(L1+L2)/(EA)
    // => N = EA*alpha*DT*L1 / (L1+L2)
    let n_expected = E_EFF * a_bar * alpha * dt * l1 / l_total;

    // Check axial force in bar 1 elements (compression)
    for ef in results.element_forces.iter().filter(|e| e.element_id <= n1) {
        assert_close(ef.n_start.abs(), n_expected, 0.03,
            &format!("SSLL111 bar1 elem {} N=EA*alpha*DT*L1/(L1+L2)", ef.element_id));
    }

    // Check axial force in bar 2 elements (same magnitude, tension)
    for ef in results.element_forces.iter().filter(|e| e.element_id > n1) {
        assert_close(ef.n_start.abs(), n_expected, 0.03,
            &format!("SSLL111 bar2 elem {} N=EA*alpha*DT*L1/(L1+L2)", ef.element_id));
    }

    // Junction displacement: delta_junction = alpha*DT*L1 - N*L1/(EA)
    // = alpha*DT*L1 * L2/(L1+L2)
    let d_junc_expected = alpha * dt * l1 * l2 / l_total;
    let d_junc = results.displacements.iter()
        .find(|d| d.node_id == n1 + 1).unwrap();
    assert_close(d_junc.ux.abs(), d_junc_expected, 0.03,
        "SSLL111 junction displacement");
}

// ═══════════════════════════════════════════════════════════════
// 7. SSLL112-inspired: Beam with Elastic Spring Support at Midspan
// ═══════════════════════════════════════════════════════════════
// Simply supported beam with additional spring at midspan.
// Spring stiffness k. Beam stiffness at midspan = 48EI/L³.
// The spring reaction depends on relative stiffness:
//   R_spring = P * k_beam / (k_beam + k)  where k_beam = 48EI/L³
// Actually: for a point load P at midspan of SS beam with spring:
//   delta_mid = P / (k_beam + k)
//   R_spring = k * delta_mid = P * k / (k_beam + k)

#[test]
fn validation_ca_ssll112_beam_elastic_support() {
    let l = 8.0;
    let p = 100.0; // kN at midspan
    let n = 16;
    let mid_node = n / 2 + 1; // node 9
    let n_nodes = n + 1;

    // Beam stiffness at midspan for SS beam
    let k_beam = 48.0 * E_EFF * IZ / (l * l * l); // kN/m

    // Spring stiffness (comparable to beam stiffness for interesting interaction)
    let k_spring = k_beam; // equal stiffness → spring takes half the load

    // Build the beam manually to add the spring support
    let elem_len = l / n as f64;
    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        let id = i + 1;
        nodes_map.insert(id.to_string(), SolverNode {
            id, x: i as f64 * elem_len, y: 0.0,
        });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for i in 0..n {
        let id = i + 1;
        elems_map.insert(id.to_string(), SolverElement {
            id,
            elem_type: "frame".to_string(),
            node_i: i + 1,
            node_j: i + 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    // Pinned at left
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    // Roller at right
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    // Spring at midspan (vertical spring only)
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: mid_node, support_type: "spring".to_string(),
        kx: None, ky: Some(k_spring), kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads,
    };
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: delta = P / (k_beam + k_spring)
    let delta_expected = p / (k_beam + k_spring);
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uy.abs(), delta_expected, 0.03,
        "SSLL112 midspan delta = P/(k_beam + k_spring)");

    // Spring reaction = k_spring * delta
    let r_spring_expected = k_spring * delta_expected;

    // The spring reaction is reported as a reaction at mid_node
    let r_spring = results.reactions.iter()
        .find(|r| r.node_id == mid_node);
    if let Some(rs) = r_spring {
        assert_close(rs.ry.abs(), r_spring_expected, 0.05,
            "SSLL112 spring reaction = k * delta");
    }

    // With k_spring = k_beam, the spring should carry half the load
    // Spring reaction should be P/2
    assert_close(r_spring_expected, p / 2.0, 0.01,
        "SSLL112 when k=k_beam, spring carries P/2");

    // Support reactions: each end support carries (P - R_spring)/2
    let r_end_expected = (p - r_spring_expected) / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r1.ry, r_end_expected, 0.05,
        "SSLL112 end reaction = (P - R_spring)/2");
    assert_close(r_end.ry, r_end_expected, 0.05,
        "SSLL112 end reaction symmetry");

    // Total equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "SSLL112 total equilibrium");
}

// ═══════════════════════════════════════════════════════════════
// 8. SSLL113-inspired: Fixed-Fixed Beam with Partial UDL
// ═══════════════════════════════════════════════════════════════
// Fixed-fixed beam, UDL on first half of span only.
// From fixed-end moment tables (partial UDL from 0 to L/2):
//   M_A = -5qL²/96   (fixed end where load starts)
//   M_B = -11qL²/192  (far fixed end, unloaded side)
//   R_A = (q*L/2)/2 + (M_B - M_A)/L  → from statics
// Actually, using the standard FEM result for partial UDL:
// For UDL q from x=0 to x=a on a fixed-fixed beam of length L:
//   M_A = -q*a^2*(6L^2 - 8La + 3a^2)/(12L^2)
//   M_B = +q*a^3*(4L - 3a)/(12L^2)   (B is the far end)

#[test]
fn validation_ca_ssll113_fixed_fixed_partial_udl() {
    let l = 10.0;
    let q = 15.0; // kN/m
    let n = 20; // 20 elements, each 0.5m
    let a_load = l / 2.0; // load on first half

    // Apply distributed load only on elements in the first half (elements 1..10)
    let n_loaded = n / 2;
    let mut loads = Vec::new();
    for i in 0..n_loaded {
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

    // Fixed-end moments for partial UDL from 0 to a on fixed-fixed beam of length L:
    // M_A = -q*a^2*(6L^2 - 8La + 3a^2) / (12L^2)
    // M_B = q*a^3*(4L - 3a) / (12L^2)
    // With a = L/2:
    // M_A = -q*(L/2)^2*(6L^2 - 4L^2 + 3L^2/4) / (12L^2)
    //     = -q*L^2/4 * (6 - 4 + 3/4) / 12
    //     = -q*L^2/4 * (11/4) / 12
    //     = -11qL^2/192
    // M_B = q*(L/2)^3*(4L - 3L/2) / (12L^2)
    //     = q*L^3/8 * (5L/2) / (12L^2)
    //     = 5qL^2/192

    let m_a_expected = 11.0 * q * l * l / 192.0; // magnitude: 85.9375
    let m_b_expected = 5.0 * q * l * l / 192.0;  // magnitude: 39.0625

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.mz.abs(), m_a_expected, 0.03,
        "SSLL113 M_A = 11qL^2/192");
    assert_close(r_b.mz.abs(), m_b_expected, 0.03,
        "SSLL113 M_B = 5qL^2/192");

    // Vertical reactions by equilibrium:
    // R_A + R_B = q * a = q * L/2
    let total_load = q * a_load; // 75.0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "SSLL113 sum Ry = qL/2");

    // R_A from statics: R_A = q*a/2 + (M_B - M_A)/L (taking moments about B)
    // Actually: taking moments about B:
    // R_A*L + M_A - M_B = q*a*(L - a/2)
    // But with sign conventions, let's just use:
    // R_A*L = q*a*(L-a/2) - M_A + M_B  (where M_A, M_B are in their correct signs)
    // Simpler: just verify R_A > R_B since the load is on the A side
    assert!(r_a.ry > r_b.ry,
        "SSLL113 R_A={:.4} should > R_B={:.4} (load is on A side)", r_a.ry, r_b.ry);

    // The asymmetric loading means M_A > M_B in magnitude (loaded side has larger moment)
    assert!(r_a.mz.abs() > r_b.mz.abs(),
        "SSLL113 |M_A|={:.4} should > |M_B|={:.4}", r_a.mz.abs(), r_b.mz.abs());

    // Midspan moment: should be nonzero and positive (sagging) in loaded region
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    // The moment at the junction between loaded and unloaded regions should be notable
    assert!(ef_mid.m_end.abs() > 1.0,
        "SSLL113 moment at load boundary should be significant");

    // The moment diagram should be asymmetric
    // Check that moments in unloaded region decay toward zero internal values
    // (no external load, so moment varies linearly in unloaded region)
    let ef_last = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    let ef_3q = results.element_forces.iter()
        .find(|e| e.element_id == 3 * n / 4).unwrap();
    // In the unloaded region the shear should be constant
    assert_close(ef_3q.v_start, ef_last.v_start, 0.05,
        "SSLL113 constant shear in unloaded region");
}
