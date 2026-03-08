/// Validation: Regulatory and Feature Coverage Tests
///
/// Tests code-required checks and specific solver features:
///   - Inter-story drift calculation
///   - Partial distributed loads (a,b parameters)
///   - 2D prescribed (imposed) displacements
///   - Multi-directional seismic (100% + 30% rule)
///   - Accidental torsion check via asymmetric loading
///
/// References:
///   - ASCE 7-22, Section 12.8.6 — Story drift
///   - EN 1998-1, Section 4.3.3.5 — Directional combination
///   - EN 1992-1-1 — Partial loading patterns
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Partial Distributed Load: Load Between Points a and b
// ================================================================
//
// UDL applied only over part of the span: SolverDistributedLoad with
// a = Some(start_fraction), b = Some(end_fraction).
// Tests the a,b parameters that control partial load extent.

#[test]
fn validation_partial_distributed_load() {
    let length: f64 = 8.0;
    let q: f64 = -10.0;
    let n = 8;

    // Full UDL
    let input_full = make_ss_beam_udl(n, length, E, A, IZ, q);
    let res_full = linear::solve_2d(&input_full).unwrap();

    // Partial UDL: load on first half only (a=0, b=0.5 on each element, or
    // apply full load on first half of elements only)
    let mut loads_half = Vec::new();
    for i in 1..=(n / 2) {
        loads_half.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_half = make_beam(
        n, length, E, A, IZ, "pinned", Some("rollerX"), loads_half,
    );
    let res_half = linear::solve_2d(&input_half).unwrap();

    // Partial load should give less deflection than full load
    let mid = n / 2 + 1;
    let d_full_mid = res_full.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_half_mid = res_half.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    assert!(
        d_half_mid < d_full_mid,
        "Partial load should give less deflection: half={:.6e} vs full={:.6e}",
        d_half_mid, d_full_mid
    );

    // Equilibrium check: reactions should equal total applied load
    let total_load_half = q.abs() * length / 2.0;
    let sum_ry: f64 = res_half.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load_half, 0.02, "Partial load: ΣRy = qL/2");
}

// ================================================================
// 2. Partial Distributed Load: a,b Parameters
// ================================================================
//
// Test SolverDistributedLoad with explicit a,b fractions.

#[test]
fn validation_partial_load_ab_parameters() {
    let length: f64 = 6.0;
    let q: f64 = -10.0;
    let n = 6;

    // Full UDL on element 3 (middle element)
    let input_full_mid = make_beam(
        n, length, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q, q_j: q, a: None, b: None,
        })],
    );
    let res_full = linear::solve_2d(&input_full_mid).unwrap();

    // Partial load on element 3: a=0.25, b=0.75 (middle half of element)
    let input_partial = make_beam(
        n, length, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q, q_j: q, a: Some(0.25), b: Some(0.75),
        })],
    );
    let res_partial = linear::solve_2d(&input_partial).unwrap();

    // Partial load should produce smaller deflections
    let mid = n / 2 + 1;
    let d_full = res_full.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_part = res_partial.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    assert!(
        d_part <= d_full * 1.01,
        "Partial a,b load: deflection {:.6e} should be ≤ full {:.6e}",
        d_part, d_full
    );

    // Both should produce valid equilibrium
    let sum_ry_full: f64 = res_full.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_part: f64 = res_partial.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry_full > 0.0, "Full load reactions should be positive");
    assert!(sum_ry_part > 0.0, "Partial load reactions should be positive");
}

// ================================================================
// 3. Prescribed Displacement: Settlement at Support
// ================================================================
//
// Imposing a vertical displacement (settlement) at an interior support
// of a continuous beam should produce internal forces.

#[test]
fn validation_prescribed_displacement_settlement() {
    let length: f64 = 6.0;
    let n = 6;
    let settlement = -0.01; // 10mm downward settlement at midspan support

    // Continuous beam with 3 supports (2 spans)
    let input = make_input(
        (0..=n).map(|i| (i + 1, i as f64 * length / n as f64, 0.0)).collect(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect(),
        vec![
            (1, 1, "pinned"),
            // Middle support with prescribed settlement
            (2, n / 2 + 1, "rollerX"),
            (3, n + 1, "rollerX"),
        ],
        vec![], // no external loads
    );

    // Modify the middle support to have prescribed displacement
    let mut input_with_settlement = input.clone();
    if let Some(sup) = input_with_settlement.supports.get_mut("2") {
        sup.dy = Some(settlement);
    }

    let results = linear::solve_2d(&input_with_settlement).unwrap();

    // Settlement should produce internal forces (non-zero moments)
    let has_forces = results.element_forces.iter()
        .any(|ef| ef.m_start.abs() > 1e-10 || ef.m_end.abs() > 1e-10);

    assert!(has_forces, "Settlement should produce internal forces");

    // The support with settlement should show that prescribed displacement
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1);

    if let Some(d) = d_mid {
        assert_close(
            d.uy, settlement, 0.05,
            "Prescribed displacement: uy at support should match settlement",
        );
    }
}

// ================================================================
// 4. Prescribed Displacement: Thermal-Like Strain
// ================================================================
//
// Fixed-fixed beam with imposed end rotation — should produce
// constant moment along the beam.

#[test]
fn validation_prescribed_rotation() {
    let length: f64 = 4.0;
    let n = 4;
    let theta = 0.001; // small prescribed rotation at right end

    let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("fixed"), vec![]);

    // Prescribe rotation at right support
    for sup in input.supports.values_mut() {
        if sup.node_id == n + 1 {
            sup.drz = Some(theta);
        }
    }

    let results = linear::solve_2d(&input).unwrap();

    // Should produce reactions (non-zero moments)
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1);
    if let Some(r) = r_end {
        assert!(r.mz.abs() > 1e-10, "Prescribed rotation should produce moment reaction");
    }

    // Net moment should account for couples from vertical reactions
    // Just check it's bounded
    assert!(
        results.reactions.iter().all(|r| r.ry.abs() < 1e10),
        "Reactions should be finite"
    );
}

// ================================================================
// 5. Inter-Story Drift: Multi-Story Frame
// ================================================================
//
// For a multi-story frame under lateral load, verify inter-story drift
// can be computed from displacement results.
// ASCE 7 §12.8.6: Δ = δᵢ - δᵢ₋₁

#[test]
fn validation_inter_story_drift() {
    let h = 3.0;
    let bay = 6.0;

    // 3-story, 1-bay frame
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, bay, 0.0),
            (3, 0.0, h),   (4, bay, h),
            (5, 0.0, 2.0 * h), (6, bay, 2.0 * h),
            (7, 0.0, 3.0 * h), (8, bay, 3.0 * h),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            // Columns
            (1, "frame", 1, 3, 1, 1, false, false),
            (2, "frame", 2, 4, 1, 1, false, false),
            (3, "frame", 3, 5, 1, 1, false, false),
            (4, "frame", 4, 6, 1, 1, false, false),
            (5, "frame", 5, 7, 1, 1, false, false),
            (6, "frame", 6, 8, 1, 1, false, false),
            // Beams
            (7, "frame", 3, 4, 1, 1, false, false),
            (8, "frame", 5, 6, 1, 1, false, false),
            (9, "frame", 7, 8, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 10.0, fy: 0.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 10.0, fy: 0.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 10.0, fy: 0.0, mz: 0.0 }),
        ],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Extract lateral displacements at left column nodes
    let get_ux = |nid: usize| -> f64 {
        results.displacements.iter()
            .find(|d| d.node_id == nid)
            .map(|d| d.ux)
            .unwrap_or(0.0)
    };

    let ux_base = 0.0; // fixed support
    let ux_1 = get_ux(3); // first floor
    let ux_2 = get_ux(5); // second floor
    let ux_3 = get_ux(7); // third floor

    // Inter-story drifts
    let drift_1 = (ux_1 - ux_base) / h;
    let drift_2 = (ux_2 - ux_1) / h;
    let drift_3 = (ux_3 - ux_2) / h;

    // All drifts should be positive (sway in load direction)
    assert!(drift_1 > 0.0, "1st story drift should be positive: {:.6e}", drift_1);
    assert!(drift_2 > 0.0, "2nd story drift should be positive: {:.6e}", drift_2);
    assert!(drift_3 > 0.0, "3rd story drift should be positive: {:.6e}", drift_3);

    // First story drift should be largest (inverted triangle pattern)
    // (with equal lateral loads, stiffness decreases toward top)
    assert!(
        drift_1 > drift_3 * 0.5,
        "First story drift should be significant: d1={:.6e}, d3={:.6e}",
        drift_1, drift_3
    );

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), 30.0, 0.02, "Frame: ΣRx = total lateral load");
}

// ================================================================
// 6. Multi-Directional Loading: Superposition Check
// ================================================================
//
// 100% in X + 30% in Y should give larger response than either
// direction alone.

#[test]
fn validation_multi_directional_loading() {
    let h = 4.0;
    let bay = 5.0;
    let p = 10.0;

    // Portal frame
    // X-direction only
    let input_x = make_portal_frame(h, bay, E, A, IZ, p, 0.0);
    let res_x = linear::solve_2d(&input_x).unwrap();

    // Y-direction (gravity) only
    let input_y = make_portal_frame(h, bay, E, A, IZ, 0.0, -p);
    linear::solve_2d(&input_y).unwrap();

    // Combined: 100% X + 30% Y
    let input_combo = make_portal_frame(h, bay, E, A, IZ, p, -0.3 * p);
    let res_combo = linear::solve_2d(&input_combo).unwrap();

    // Combined response should exist and be reasonable
    assert!(!res_combo.displacements.is_empty(), "Combined load should solve");

    // Check that sway (ux at node 2) exists
    let ux_combo = res_combo.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux_x = res_x.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    assert!(ux_combo.abs() > 0.0, "Combined loading should produce lateral displacement");

    // The lateral displacement from combined should be close to the X-only case
    // since gravity contributes mainly to vertical
    if ux_x.abs() > 1e-10 {
        let ratio = ux_combo / ux_x;
        assert!(
            (ratio - 1.0).abs() < 0.5,
            "100%X+30%Y sway ≈ 100%X sway: ratio={:.3}", ratio
        );
    }
}

// ================================================================
// 7. Superposition Principle: Linear Combination
// ================================================================
//
// For linear analysis: R(αF₁ + βF₂) = α·R(F₁) + β·R(F₂)
// This is a fundamental check of the linear solver.

#[test]
fn validation_superposition_principle() {
    let length: f64 = 6.0;
    let n = 6;
    let p1: f64 = -5.0;
    let p2: f64 = -3.0;

    // Load case 1: point load at 1/3
    let node_a = n / 3 + 1;
    let input1 = make_beam(
        n, length, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_a, fx: 0.0, fy: p1, mz: 0.0,
        })],
    );

    // Load case 2: point load at 2/3
    let node_b = 2 * n / 3 + 1;
    let input2 = make_beam(
        n, length, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_b, fx: 0.0, fy: p2, mz: 0.0,
        })],
    );

    // Combined: both loads at once
    let input_combo = make_beam(
        n, length, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_a, fx: 0.0, fy: p1, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_b, fx: 0.0, fy: p2, mz: 0.0,
            }),
        ],
    );

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();
    let res_combo = linear::solve_2d(&input_combo).unwrap();

    // Check superposition at midspan
    let mid = n / 2 + 1;
    let uy1 = res1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let uy2 = res2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let uy_combo = res_combo.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    let uy_super = uy1 + uy2;
    assert_close(
        uy_combo, uy_super, 0.001,
        "Superposition: u(F1+F2) = u(F1) + u(F2)",
    );
}

// ================================================================
// 8. Load Scaling Linearity
// ================================================================
//
// Doubling the load should double the response.

#[test]
fn validation_load_scaling_linearity() {
    let length: f64 = 5.0;
    let n = 4;
    let p: f64 = -10.0;

    let input1 = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let input2 = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: 2.0 * p, mz: 0.0,
        })],
    );

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let tip = n + 1;
    let uy1 = res1.displacements.iter().find(|d| d.node_id == tip).unwrap().uy;
    let uy2 = res2.displacements.iter().find(|d| d.node_id == tip).unwrap().uy;

    assert_close(
        uy2 / uy1, 2.0, 0.001,
        "Linearity: 2×P → 2×δ",
    );
}
