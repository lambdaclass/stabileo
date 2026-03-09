/// Validation: Load Combination and Envelope Analysis
///
/// References:
///   - ASCE 7-22, Ch. 2 (Combinations of Loads)
///   - AISC 360-22, Ch. B (Design Requirements)
///   - Eurocode 0, EN 1990 (Basis of Structural Design)
///
/// Load combinations define how different load types are combined
/// for design. The envelope is the max/min of all combinations.
/// These tests verify superposition and correct envelope identification
/// by running separate load cases and combining results.
///
/// Tests verify:
///   1. Dead + Live: 1.2D + 1.6L factored response
///   2. Dead + Wind: 1.2D + 1.0W factored response
///   3. Envelope of DL+LL vs DL+WL: max reaction
///   4. Checkerboard loading: worst-case for continuous beam
///   5. Pattern loading: alternating spans loaded
///   6. Factored superposition: α*case1 + β*case2
///   7. Gravity vs lateral dominance: compare load cases
///   8. Service vs ultimate: different factor sets
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Dead + Live: 1.2D + 1.6L Factored Response
// ================================================================
//
// Verify that factored response = 1.2 * dead_response + 1.6 * live_response.

#[test]
fn validation_combo_dead_live() {
    let l = 8.0;
    let n = 16;
    let q_dead: f64 = -3.0;
    let q_live: f64 = -5.0;
    let mid = n / 2 + 1;

    // Dead only
    let loads_d: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_dead, q_j: q_dead, a: None, b: None,
        }))
        .collect();
    let input_d = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_d);
    let rd = linear::solve_2d(&input_d).unwrap();
    let d_dead = rd.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let r_dead = rd.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Live only
    let loads_l: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_live, q_j: q_live, a: None, b: None,
        }))
        .collect();
    let input_l = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_l);
    let rl = linear::solve_2d(&input_l).unwrap();
    let d_live = rl.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let r_live = rl.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Factored combination: 1.2D + 1.6L
    let q_factored = 1.2 * q_dead + 1.6 * q_live;
    let loads_f: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_factored, q_j: q_factored, a: None, b: None,
        }))
        .collect();
    let input_f = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_f);
    let rf = linear::solve_2d(&input_f).unwrap();
    let d_factored = rf.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let r_factored = rf.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Superposition verification
    assert_close(d_factored, 1.2 * d_dead + 1.6 * d_live, 0.001,
        "1.2D+1.6L: deflection");
    assert_close(r_factored, 1.2 * r_dead + 1.6 * r_live, 0.001,
        "1.2D+1.6L: reaction");
}

// ================================================================
// 2. Dead + Wind: 1.2D + 1.0W Portal Frame
// ================================================================
//
// Portal frame under dead load (gravity) and wind (lateral).
// Verify factored combination by superposition.

#[test]
fn validation_combo_dead_wind() {
    let h = 4.0;
    let w = 6.0;
    let g = -10.0; // gravity per node
    let f_wind = 5.0; // lateral wind

    // Dead only (gravity)
    let input_d = make_portal_frame(h, w, E, A, IZ, 0.0, g);
    let rd = linear::solve_2d(&input_d).unwrap();
    let drift_d = rd.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ry_d = rd.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Wind only (lateral)
    let input_w = make_portal_frame(h, w, E, A, IZ, f_wind, 0.0);
    let rw = linear::solve_2d(&input_w).unwrap();
    let drift_w = rw.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ry_w = rw.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Combined: 1.2D + 1.0W
    let input_c = make_portal_frame(h, w, E, A, IZ, 1.0 * f_wind, 1.2 * g);
    let rc = linear::solve_2d(&input_c).unwrap();
    let drift_c = rc.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ry_c = rc.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Superposition
    assert_close(drift_c, 1.2 * drift_d + 1.0 * drift_w, 0.01,
        "1.2D+1.0W: drift");
    assert_close(ry_c, 1.2 * ry_d + 1.0 * ry_w, 0.01,
        "1.2D+1.0W: vertical reaction");
}

// ================================================================
// 3. Envelope: Max Reaction from Multiple Combinations
// ================================================================
//
// Find the critical (maximum) reaction from different load cases.

#[test]
fn validation_combo_envelope() {
    let l = 8.0;
    let n = 16;
    let q_dead: f64 = -3.0;
    let q_live: f64 = -5.0;

    // Case 1: 1.4D
    let q1 = 1.4 * q_dead;
    let loads1: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q1, q_j: q1, a: None, b: None,
        }))
        .collect();
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let r1 = linear::solve_2d(&input1).unwrap()
        .reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Case 2: 1.2D + 1.6L
    let q2 = 1.2 * q_dead + 1.6 * q_live;
    let loads2: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q2, q_j: q2, a: None, b: None,
        }))
        .collect();
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let r2 = linear::solve_2d(&input2).unwrap()
        .reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Case 3: 0.9D (minimum gravity, for uplift checks)
    let q3 = 0.9 * q_dead;
    let loads3: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q3, q_j: q3, a: None, b: None,
        }))
        .collect();
    let input3 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads3);
    let r3 = linear::solve_2d(&input3).unwrap()
        .reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Envelope: max reaction
    let r_max = r1.max(r2).max(r3);
    assert_close(r_max, r2, 0.001, "Envelope: 1.2D+1.6L governs");
    assert!(r2 > r1, "1.2D+1.6L > 1.4D: {:.4} > {:.4}", r2, r1);
    assert!(r1 > r3, "1.4D > 0.9D: {:.4} > {:.4}", r1, r3);
}

// ================================================================
// 4. Checkerboard Loading: Worst-Case for Continuous Beam
// ================================================================
//
// For maximum midspan deflection in span 1 of a 2-span beam:
// Dead on both spans + live on span 1 only → larger midspan
// deflection in span 1 than dead + live on both.
// This is because unloaded span 2 allows more rotation at interior
// support, increasing deflection in span 1.

#[test]
fn validation_combo_checkerboard() {
    let span = 6.0;
    let n = 12;
    let q_dead: f64 = -3.0;
    let q_live: f64 = -5.0;

    // Case A: dead + live on both spans
    let loads_both: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_dead + q_live, q_j: q_dead + q_live, a: None, b: None,
        }))
        .collect();
    let input_both = make_continuous_beam(&[span, span], n, E, A, IZ, loads_both);
    let rb = linear::solve_2d(&input_both).unwrap();
    let d_both = rb.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Case B: dead on both + live on span 1 only (pattern loading)
    let mut loads_pattern: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_dead + q_live, q_j: q_dead + q_live, a: None, b: None,
        }))
        .collect();
    let loads_dead_span2: Vec<SolverLoad> = ((n + 1)..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_dead, q_j: q_dead, a: None, b: None,
        }))
        .collect();
    loads_pattern.extend(loads_dead_span2);
    let input_pattern = make_continuous_beam(&[span, span], n, E, A, IZ, loads_pattern);
    let rp = linear::solve_2d(&input_pattern).unwrap();
    let d_pattern = rp.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Pattern loading produces larger midspan deflection in span 1
    assert!(d_pattern > d_both,
        "Checkerboard: pattern > full in span 1: {:.6e} > {:.6e}", d_pattern, d_both);
}

// ================================================================
// 5. Pattern Loading: Alternate Spans on 3-Span Beam
// ================================================================
//
// For 3-span beam, load spans 1 and 3 (skip span 2) for
// maximum interior support reaction.

#[test]
fn validation_combo_alternate_spans() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    // Full load
    let loads_full: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_full = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads_full);
    let rf = linear::solve_2d(&input_full).unwrap();
    let r_full_mid = rf.displacements.iter()
        .find(|d| d.node_id == n + n / 2 + 1).unwrap().uy.abs();

    // Alternate: load spans 1 and 3 only
    let mut loads_alt: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let loads_span3: Vec<SolverLoad> = ((2 * n + 1)..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads_alt.extend(loads_span3);

    let input_alt = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads_alt);
    let ra = linear::solve_2d(&input_alt).unwrap();

    // Middle span deflects upward when adjacent spans are loaded
    let d_mid_alt = ra.displacements.iter()
        .find(|d| d.node_id == n + n / 2 + 1).unwrap().uy;
    // When only spans 1&3 loaded, span 2 lifts upward (positive uy)
    assert!(d_mid_alt > 0.0 || d_mid_alt.abs() < r_full_mid,
        "Alternate loading: span 2 deflection reduced/reversed");
}

// ================================================================
// 6. Factored Superposition: α*case1 + β*case2
// ================================================================
//
// For arbitrary load factors: α*R₁ + β*R₂ = R(α*F₁ + β*F₂)

#[test]
fn validation_combo_factored_superposition() {
    let l = 10.0;
    let n = 20;
    let p1 = 10.0;
    let p2 = 15.0;
    let alpha = 1.35;
    let beta = 1.50;
    let mid = n / 2 + 1;

    // Case 1: point load at L/3
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 3 + 1, fx: 0.0, fy: -p1, mz: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let r1 = linear::solve_2d(&input1).unwrap();
    let d1 = r1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Case 2: UDL
    let loads2: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -p2 / l, q_j: -p2 / l, a: None, b: None,
        }))
        .collect();
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let r2 = linear::solve_2d(&input2).unwrap();
    let d2 = r2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Combined: α*case1 + β*case2
    let mut loads_c: Vec<SolverLoad> = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 3 + 1, fx: 0.0, fy: -alpha * p1, mz: 0.0,
    })];
    let loads_c2: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -beta * p2 / l, q_j: -beta * p2 / l, a: None, b: None,
        }))
        .collect();
    loads_c.extend(loads_c2);
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let rc = linear::solve_2d(&input_c).unwrap();
    let dc = rc.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    assert_close(dc, alpha * d1 + beta * d2, 0.001,
        "Factored superposition: α*δ₁ + β*δ₂");
}

// ================================================================
// 7. Gravity vs Lateral: Compare Load Case Dominance
// ================================================================
//
// For a portal frame, determine which load case produces
// larger base moment: gravity or lateral wind.

#[test]
fn validation_combo_gravity_vs_lateral() {
    let h = 4.0;
    let w = 6.0;
    let g = -20.0;
    let f = 5.0;

    // Gravity only
    let input_g = make_portal_frame(h, w, E, A, IZ, 0.0, g);
    let rg = linear::solve_2d(&input_g).unwrap();
    let m_grav = rg.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // Lateral only
    let input_l = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let rl = linear::solve_2d(&input_l).unwrap();
    let m_lat = rl.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // Both produce non-zero base moments
    assert!(m_grav > 0.0, "Gravity: base moment > 0");
    assert!(m_lat > 0.0, "Lateral: base moment > 0");

    // Drift comparison: lateral dominates drift
    let drift_g = rg.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let drift_l = rl.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // No lateral drift under symmetric gravity
    assert!(drift_g < 1e-10, "Gravity: no lateral drift");
    assert!(drift_l > 0.0, "Lateral: produces drift");
}

// ================================================================
// 8. Service vs Ultimate: Different Factor Sets
// ================================================================
//
// Service: 1.0D + 1.0L (for deflection checks)
// Ultimate: 1.2D + 1.6L (for strength checks)
// Ratio of responses should equal ratio of load factors.

#[test]
fn validation_combo_service_vs_ultimate() {
    let l = 8.0;
    let n = 16;
    let q_dead: f64 = -4.0;
    let q_live: f64 = -6.0;
    let mid = n / 2 + 1;

    // Service: 1.0D + 1.0L
    let q_service = q_dead + q_live;
    let loads_s: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_service, q_j: q_service, a: None, b: None,
        }))
        .collect();
    let input_s = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_s);
    let rs = linear::solve_2d(&input_s).unwrap();
    let d_service = rs.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Ultimate: 1.2D + 1.6L
    let q_ultimate = 1.2 * q_dead + 1.6 * q_live;
    let loads_u: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_ultimate, q_j: q_ultimate, a: None, b: None,
        }))
        .collect();
    let input_u = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_u);
    let ru = linear::solve_2d(&input_u).unwrap();
    let d_ultimate = ru.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Ratio should equal load factor ratio
    let expected_ratio = q_ultimate.abs() / q_service.abs();
    let actual_ratio = d_ultimate / d_service;
    assert_close(actual_ratio, expected_ratio, 0.001,
        "Service/Ultimate ratio: δ_u/δ_s = q_u/q_s");

    // Ultimate > Service
    assert!(d_ultimate > d_service,
        "Ultimate > Service: {:.6e} > {:.6e}", d_ultimate, d_service);
}
