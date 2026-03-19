/// Validation: Slope-Deflection Method — Extended Tests
///
/// References:
///   - McCormac & Nelson, "Structural Analysis", Ch. 14 (Slope-Deflection Method)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 11
///   - Ghali & Neville, "Structural Analysis", 5th Ed., Ch. 5
///
/// The slope-deflection equations:
///   M_ij = (2EI/L)(2θ_i + θ_j - 3ψ) + FEM_ij
///   M_ji = (2EI/L)(2θ_j + θ_i - 3ψ) + FEM_ji
///   where ψ = Δ/L (chord rotation from sway)
///
/// Tests:
///   1. Fixed-end beam: slope-deflection yields FEM = qL²/12
///   2. Propped cantilever: modified slope-deflection stiffness 3EI/L
///   3. Two-span continuous beam: simultaneous equations for interior moment
///   4. Portal frame sway: column shear equilibrium with sway DOF
///   5. Fixed-fixed beam with settlement: M = 6EIΔ/L²
///   6. Beam with end moment: carry-over factor = 0.5
///   7. Non-sway frame with unequal spans: distribution proportional to EI/L
///   8. Symmetric frame under symmetric load: antisymmetric sway DOF vanishes
use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 to get kN/m²)
const A: f64 = 0.01;      // m²
const IZ: f64 = 1e-4;     // m⁴

// ================================================================
// 1. Fixed-End Beam: Slope-Deflection Yields FEM = qL²/12
// ================================================================
//
// For a fixed-fixed beam under UDL q, the slope-deflection equations
// give θ_A = θ_B = 0 (both ends fixed) and ψ = 0 (no sway).
// Therefore the end moments are purely the fixed-end moments:
//   M_A = -qL²/12 (hogging at left end)
//   M_B = +qL²/12 (hogging at right end)
// The midspan moment is qL²/24 (sagging).
//
// Ref: Hibbeler, "Structural Analysis", §11.1, Table 11-1

#[test]
fn validation_sde_fixed_end_beam_fem() {
    let l: f64 = 8.0;
    let n = 16;
    let q: f64 = -12.0; // kN/m downward

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // FEM = |q| * L² / 12
    let fem: f64 = q.abs() * l * l / 12.0;

    // Left end moment (element 1, m_start)
    let ef_first = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), fem, 0.02,
        "SDE1: left end moment = qL^2/12");

    // Right end moment (last element, m_end)
    let ef_last = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_last.m_end.abs(), fem, 0.02,
        "SDE1: right end moment = qL^2/12");

    // Midspan moment = qL²/24
    let m_mid_exact: f64 = q.abs() * l * l / 24.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_exact, 0.05,
        "SDE1: midspan moment = qL^2/24");

    // Both end rotations must be zero (fixed supports)
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(d1.ry.abs() < 1e-10, "SDE1: theta_left = 0 (fixed)");
    assert!(d_end.ry.abs() < 1e-10, "SDE1: theta_right = 0 (fixed)");
}

// ================================================================
// 2. Propped Cantilever: Modified Slope-Deflection Stiffness 3EI/L
// ================================================================
//
// For a propped cantilever (fixed at A, roller at B) under UDL q:
//   θ_A = 0 (fixed), M_B = 0 (roller)
//   Using modified slope-deflection with stiffness 3EI/L at the roller:
//     M_A = qL²/8 (the fixed-end moment for propped cantilever)
//     R_A = 5qL/8 (fixed end carries more), R_B = 3qL/8
//     θ_B = qL³/(48EI)
//
// The "modified" slope-deflection equation accounts for the pinned far end
// by using stiffness 3EI/L instead of 4EI/L and eliminating the carry-over.
//
// Ref: McCormac & Nelson, "Structural Analysis", §14.5 (modified stiffness)

#[test]
fn validation_sde_propped_cantilever_modified_stiffness() {
    let l: f64 = 6.0;
    let n = 12;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0; // kN/m²

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed end moment: M_A = qL²/8
    let m_a_exact: f64 = q.abs() * l * l / 8.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.my.abs(), m_a_exact, 0.03,
        "SDE2: M_A = qL^2/8 for propped cantilever");

    // Reactions: R_A = 5qL/8 (fixed end), R_B = 3qL/8 (roller end)
    let ra_exact: f64 = 5.0 * q.abs() * l / 8.0;
    let rb_exact: f64 = 3.0 * q.abs() * l / 8.0;
    assert_close(r1.rz, ra_exact, 0.03,
        "SDE2: R_A = 5qL/8");
    let r_end = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_end.rz, rb_exact, 0.03,
        "SDE2: R_B = 3qL/8");

    // Roller end rotation: θ_B = qL³/(48EI)
    let theta_exact: f64 = q.abs() * l.powi(3) / (48.0 * e_eff * IZ);
    let d_end = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_end.ry.abs(), theta_exact, 0.05,
        "SDE2: theta_B = qL^3/(48EI)");

    // Fixed end rotation must be zero
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.ry.abs() < 1e-10, "SDE2: theta_A = 0 (fixed)");
}

// ================================================================
// 3. Two-Span Continuous Beam: Interior Moment from Simultaneous Equations
// ================================================================
//
// Two-span continuous beam (L1 = L2 = L) with pinned ends and UDL q on both.
// From slope-deflection simultaneous equations:
//   At interior support B: M_BA + M_BC = 0
//   Using FEM_BA = +qL²/12, FEM_BC = -qL²/12 (for pinned far ends):
//   (2EI/L)(2θ_B) + qL²/12 + (2EI/L)(2θ_B) - qL²/12 = 0
//   For equal spans with symmetric loading: θ_B = 0, M_B = qL²/8
//
// The interior moment M_B = qL²/8 is the classic result for a two-span
// continuous beam with equal spans under equal UDL.
//
// Ref: Kassimali, "Structural Analysis", §11.3, Example 11.4

#[test]
fn validation_sde_two_span_interior_moment() {
    let l: f64 = 5.0;
    let n = 10;
    let q: f64 = -15.0;

    let total_elems = 2 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[l, l], n, E, A, IZ, loads);
    let results = solve_2d(&input).expect("solve");

    // Interior moment: M_B = wL²/8
    let w: f64 = q.abs();
    let m_interior_exact: f64 = w * l * l / 8.0;

    // Element n ends at the interior support node
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_left.m_end.abs(), m_interior_exact, 0.05,
        "SDE3: interior moment M_B = wL^2/8");

    // Moment continuity at interior joint
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == n + 1).unwrap();
    assert_close(ef_left.m_end.abs(), ef_right.m_start.abs(), 0.02,
        "SDE3: moment continuity at interior joint");

    // By symmetry: θ_B = 0 at the interior support
    let d_int = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(d_int.ry.abs() < 1e-10,
        "SDE3: theta_B = 0 by symmetry: {:.6e}", d_int.ry);

    // End reactions: R_end = 3wL/8 each, interior R_B = 10wL/8
    let r_end_exact: f64 = 3.0 * w * l / 8.0;
    let r_int_exact: f64 = 10.0 * w * l / 8.0;
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap();
    assert_close(ra.rz, r_end_exact, 0.03,
        "SDE3: R_A = 3wL/8");
    assert_close(rb.rz, r_int_exact, 0.03,
        "SDE3: R_B = 10wL/8");
}

// ================================================================
// 4. Portal Frame Sway: Column Shear Equilibrium with Sway DOF
// ================================================================
//
// Fixed-base portal frame (h=4m, w=6m) under lateral load F at top.
// The slope-deflection method introduces a sway DOF (chord rotation ψ = Δ/h).
// From column shear equilibrium: V_col1 + V_col2 = F
//
// For equal columns with fixed bases and a rigid beam:
//   ψ is the same for both columns (compatibility).
//   Each column has stiffness 12EI/h³, total lateral stiffness = 24EI/h³.
//   Δ = F*h³/(24EI) approximately (exact when beam is infinitely rigid).
//
// Ref: Hibbeler, "Structural Analysis", §11.4

#[test]
fn validation_sde_portal_sway_shear_equilibrium() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let f_lat: f64 = 10.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = solve_2d(&input).expect("solve");

    // Column shear equilibrium: sum of base shears = applied lateral load
    // Reactions at bases: nodes 1 and 4
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let total_rx: f64 = (r1.rx + r4.rx).abs();
    assert_close(total_rx, f_lat, 0.02,
        "SDE4: sum of base shears = F_lateral");

    // Both columns should have the same chord rotation (rigid beam)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let psi_left: f64 = d2.ux / h;
    let psi_right: f64 = d3.ux / h;
    assert_close(psi_left, psi_right, 0.05,
        "SDE4: equal chord rotation in both columns");

    // Sway must be in the direction of the applied force
    assert!(d2.ux > 0.0, "SDE4: sway in direction of lateral force");

    // Approximate sway for rigid beam: Δ ≈ F*h³/(24EI)
    let delta_rigid: f64 = f_lat * h.powi(3) / (24.0 * e_eff * IZ);
    // Actual sway will be larger due to beam flexibility
    assert!(d2.ux > delta_rigid * 0.5,
        "SDE4: actual sway >= 50% of rigid-beam estimate");

    // Base moments should be comparable (symmetric frame under lateral load)
    let m_base_left: f64 = r1.my.abs();
    let m_base_right: f64 = r4.my.abs();
    let ratio: f64 = m_base_left / m_base_right;
    assert!(ratio > 0.5 && ratio < 2.0,
        "SDE4: base moments comparable: left={:.4}, right={:.4}", m_base_left, m_base_right);
}

// ================================================================
// 5. Fixed-Fixed Beam with Settlement: M = 6EIΔ/L²
// ================================================================
//
// When one end of a fixed-fixed beam settles by Δ relative to the other,
// the slope-deflection equations give (with θ_A = θ_B = 0, ψ = Δ/L):
//   M_A = (2EI/L)(0 + 0 - 3Δ/L) = -6EIΔ/L²
//   M_B = (2EI/L)(0 + 0 - 3Δ/L) = -6EIΔ/L²
// Both end moments have magnitude 6EIΔ/L².
// Shear: V = 12EIΔ/L³
//
// Ref: Ghali & Neville, "Structural Analysis", §4.8

#[test]
fn validation_sde_settlement_induced_moments() {
    let l: f64 = 8.0;
    let n = 16;
    let delta: f64 = -0.01; // 10mm downward settlement at right end
    let e_eff: f64 = E * 1000.0;

    // Build fixed-fixed beam with prescribed settlement at right end
    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..=n {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * l / n as f64, z: 0.0 },
        );
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
        elems.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1, elem_type: "frame".to_string(),
                node_i: i + 1, node_j: i + 2,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            },
        );
    }
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: Some(delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = solve_2d(&input).expect("solve");

    // M = 6EIΔ/L²
    let m_exact: f64 = 6.0 * e_eff * IZ * delta.abs() / (l * l);

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.my.abs(), m_exact, 0.05,
        "SDE5: |M_A| = 6EI*delta/L^2");
    assert_close(r2.my.abs(), m_exact, 0.05,
        "SDE5: |M_B| = 6EI*delta/L^2");

    // V = 12EIΔ/L³
    let v_exact: f64 = 12.0 * e_eff * IZ * delta.abs() / l.powi(3);
    assert_close(r1.rz.abs(), v_exact, 0.05,
        "SDE5: |V| = 12EI*delta/L^3");

    // Vertical equilibrium: sum of reactions = 0 (no external loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.01, "SDE5: vertical equilibrium: sum_ry = {:.6}", sum_ry);
}

// ================================================================
// 6. Beam with End Moment: Carry-Over Factor = 0.5
// ================================================================
//
// Fundamental property of prismatic beams from slope-deflection theory:
// When a moment M is applied at the near end of a beam whose far end
// is fixed, the near-end stiffness is 4EI/L and the far-end moment
// is (2EI/L)/(4EI/L) * M = M/2.
// The carry-over factor COF = 0.5.
//
// Test: fixed-roller beam, apply moment M at roller (near end).
// The reaction moment at the fixed end (far end) = M/2.
//
// Ref: McCormac & Nelson, "Structural Analysis", §14.6

#[test]
fn validation_sde_carry_over_factor() {
    let l: f64 = 10.0;
    let n = 20;
    let m_applied: f64 = 24.0;

    // Propped cantilever: fixed at left, roller at right
    // Apply moment at roller end
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: 0.0, my: m_applied,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Far-end (fixed) reaction moment = M_applied / 2 (carry-over factor)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.my.abs(), m_applied / 2.0, 0.05,
        "SDE6: carry-over M_far = M_applied/2");

    // The ratio of far-end to near-end moment is exactly 0.5
    // Near-end moment = M_applied (the applied moment at the roller)
    let cof: f64 = r1.my.abs() / m_applied;
    assert_close(cof, 0.5, 0.05,
        "SDE6: carry-over factor = 0.5");

    // The roller end should have a non-zero rotation
    let d_roller = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(d_roller.ry.abs() > 0.0,
        "SDE6: theta_roller != 0: {:.6e}", d_roller.ry);

    // Verify global vertical equilibrium: sum of vertical reactions = 0
    // (only moment loads, no vertical forces applied)
    let r_roller = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap();
    let sum_ry: f64 = (r1.rz + r_roller.rz).abs();
    assert!(sum_ry < 0.01,
        "SDE6: vertical equilibrium: sum_ry = {:.6}", sum_ry);
}

// ================================================================
// 7. Non-Sway Frame with Unequal Spans: Distribution Proportional to EI/L
// ================================================================
//
// A T-junction frame: two beams meeting at a joint, with fixed far ends
// and different lengths. When a moment is applied at the joint, it
// distributes proportional to the member stiffnesses k = 4EI/L.
//
// Node layout:
//   node 1 (0,0) fixed — beam A (L_A = 3m) — node 2 (3,0) joint
//   node 3 (3,5) fixed — beam B (L_B = 5m) — node 2 (3,0) joint
//
// k_A = 4EI/3, k_B = 4EI/5
// DF_A = k_A/(k_A + k_B) = (4/3)/(4/3 + 4/5) = (4/3)/(32/15) = 20/32 = 5/8
// DF_B = k_B/(k_A + k_B) = (4/5)/(32/15) = 12/32 = 3/8
//
// Applied moment M = 16 at node 2:
//   M_A = 16 * 5/8 = 10, M_B = 16 * 3/8 = 6
//
// Carry-over to fixed far ends:
//   M_1 = 0.5 * 10 = 5 (to node 1)
//   M_3 = 0.5 * 6 = 3 (to node 3)
//
// Ref: Hibbeler, "Structural Analysis", §11.1

#[test]
fn validation_sde_non_sway_unequal_distribution() {
    let nodes = vec![(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 3.0, 5.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // beam A, L=3
        (2, "frame", 2, 3, 1, 1, false, false), // beam B, L=5
    ];
    let sups = vec![(1, 1, "fixed"), (2, 3, "fixed")];
    let m_total: f64 = 16.0;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: 0.0, my: m_total,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Distribution factors
    let l_a: f64 = 3.0;
    let l_b: f64 = 5.0;
    let k_a: f64 = 4.0 / l_a;
    let k_b: f64 = 4.0 / l_b;
    let df_a: f64 = k_a / (k_a + k_b);
    let df_b: f64 = k_b / (k_a + k_b);

    // Element end moments at the joint
    let ef1 = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();

    let m_a_joint: f64 = ef1.m_end.abs();
    let m_b_joint: f64 = ef2.m_start.abs();

    // Check distribution ratio
    let ratio_actual: f64 = m_a_joint / (m_a_joint + m_b_joint);
    assert_close(ratio_actual, df_a, 0.05,
        "SDE7: distribution factor beam A");

    let ratio_b: f64 = m_b_joint / (m_a_joint + m_b_joint);
    assert_close(ratio_b, df_b, 0.05,
        "SDE7: distribution factor beam B");

    // Carry-over moments at fixed far ends
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    let co_a_expected: f64 = 0.5 * m_total * df_a; // = 0.5 * 16 * 5/8 = 5
    let co_b_expected: f64 = 0.5 * m_total * df_b; // = 0.5 * 16 * 3/8 = 3

    assert_close(r1.my.abs(), co_a_expected, 0.05,
        "SDE7: carry-over to node 1 (short beam)");
    assert_close(r3.my.abs(), co_b_expected, 0.05,
        "SDE7: carry-over to node 3 (long beam)");

    // Ratio of carry-over moments = DF_A / DF_B = 5/3
    let co_ratio: f64 = r1.my.abs() / r3.my.abs();
    assert_close(co_ratio, df_a / df_b, 0.05,
        "SDE7: carry-over ratio = DF_A/DF_B");
}

// ================================================================
// 8. Symmetric Frame Under Symmetric Load: Sway DOF Vanishes
// ================================================================
//
// A symmetric portal frame under symmetric gravity loading has no
// lateral sway. The antisymmetric sway degree of freedom vanishes
// because the loading does not excite it.
//
// From slope-deflection theory: when the structure and loading are
// symmetric about the centerline, the chord rotation ψ = 0 for all
// columns, and the lateral displacement Δ = 0 at all nodes.
//
// Test: symmetric portal (h=4, w=8), equal UDL on beam, fixed bases.
// Verify: Δ_x = 0 at all nodes, column moments are equal.
//
// Ref: Kassimali, "Structural Analysis", §11.2

#[test]
fn validation_sde_symmetric_frame_no_sway() {
    let h: f64 = 4.0;
    let w: f64 = 8.0;
    let q: f64 = -20.0; // kN/m gravity load on beam

    // Build portal frame with UDL on beam (element 2, from node 2 to node 3)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: 2, q_i: q, q_j: q, a: None, b: None,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // No lateral sway: ux at top nodes should be negligible.
    // Compare to the beam midspan deflection (5wL^4/(384EI)) as reference scale.
    let e_eff: f64 = E * 1000.0;
    let delta_beam_ref: f64 = 5.0 * q.abs() * w.powi(4) / (384.0 * e_eff * IZ);
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    // Sway should be negligible compared to the beam deflection scale
    assert!(d2.ux.abs() < delta_beam_ref * 0.05,
        "SDE8: no sway at node 2: ux = {:.6e}, ref = {:.6e}", d2.ux, delta_beam_ref);
    assert!(d3.ux.abs() < delta_beam_ref * 0.05,
        "SDE8: no sway at node 3: ux = {:.6e}, ref = {:.6e}", d3.ux, delta_beam_ref);

    // Column base moments should be equal by symmetry
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.my.abs(), r4.my.abs(), 0.02,
        "SDE8: symmetric base moments");

    // Column base vertical reactions should be equal
    assert_close(r1.rz.abs(), r4.rz.abs(), 0.02,
        "SDE8: symmetric vertical reactions");

    // Horizontal reactions at the two bases should be equal and opposite
    // (symmetric frame under symmetric load: no net lateral force)
    let sum_rx: f64 = (r1.rx + r4.rx).abs();
    assert!(sum_rx < 0.01,
        "SDE8: sum of horizontal reactions = 0: sum_rx = {:.6e}", sum_rx);
    // Individual horizontal reactions are equal in magnitude (symmetry)
    assert_close(r1.rx.abs(), r4.rx.abs(), 0.02,
        "SDE8: symmetric horizontal reactions");

    // Total vertical reaction = total load = |q| * w
    let total_load: f64 = q.abs() * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02,
        "SDE8: total vertical reaction = total load");
}
