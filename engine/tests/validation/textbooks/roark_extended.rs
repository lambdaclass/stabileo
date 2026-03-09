/// Validation: Extended Roark's Formulas for Stress and Strain (9th Edition)
///
/// References:
///   - Young, Budynas & Sadegh, "Roark's Formulas for Stress and Strain", 9th Ed.
///   - Table 8.1: Beams; Shear, Moment, and Deflection Formulas
///
/// These tests extend validation_roark_formulas.rs with additional cases and
/// different parameter sets:
///   1. Case 8a: Fixed-fixed beam, center point load (L=6, I=8356e-8, P=30kN)
///   2. Case 8e: Fixed-fixed beam, uniform load (w=10 kN/m)
///   3. Case 3a: Propped cantilever, center point load (P=40kN)
///   4. Case 3e: Propped cantilever, uniform load (w=15 kN/m)
///   5. Case 2d: Cantilever, triangular load (max at free end)
///   6. Case 1d: Simply-supported beam, moment at one end
///   7. Case 2c variant: Cantilever with partial UDL on outer half
///   8. Overhanging beam with point load at overhang tip
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// Common properties
// ================================================================
const E: f64 = 200_000.0; // MPa (will be converted to kN/m^2)
const A: f64 = 0.01; // m^2
const IZ: f64 = 8.356e-5; // 8356e-8 m^4 (IPE 300 approx)

// ================================================================
// 1. Fixed-Fixed Center Load: Roark Table 8.1 Case 8a
//    delta_max = PL^3/(192EI), M_fixed = PL/8, M_center = PL/8
// ================================================================

#[test]
fn validation_roark_ext_1_fixed_fixed_center_load() {
    let l = 6.0;
    let n = 14;
    let p = 30.0; // kN
    let e_eff = E * 1000.0; // kN/m^2

    let mid = n / 2 + 1; // node at midspan
    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: delta = PL^3 / (192 EI)
    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();
    assert_close(d_mid.uy.abs(), delta_exact, 0.02, "Roark ext 8a: delta_max");

    // Fixed-end moment at left: M = PL/8
    let m_exact = p * l / 8.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.mz.abs(), m_exact, 0.02, "Roark ext 8a: M_fixed_left");

    // Fixed-end moment at right: M = PL/8
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_end.mz.abs(), m_exact, 0.02, "Roark ext 8a: M_fixed_right");

    // Reactions: each support takes P/2
    assert_close(r1.ry, p / 2.0, 0.02, "Roark ext 8a: R_left");
    assert_close(r_end.ry, p / 2.0, 0.02, "Roark ext 8a: R_right");
}

// ================================================================
// 2. Fixed-Fixed UDL: Roark Table 8.1 Case 8e
//    delta_max = wL^4/(384EI), M_fixed = wL^2/12, M_center = wL^2/24
// ================================================================

#[test]
fn validation_roark_ext_2_fixed_fixed_udl() {
    let l = 6.0;
    let n = 14;
    let w = 10.0; // kN/m
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w, q_j: -w, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: delta = wL^4 / (384 EI)
    let delta_exact = w * l.powi(4) / (384.0 * e_eff * IZ);
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();
    assert_close(d_mid.uy.abs(), delta_exact, 0.02, "Roark ext 8e: delta_max");

    // Fixed-end moments: M = wL^2/12
    let m_fixed = w * l * l / 12.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.mz.abs(), m_fixed, 0.02, "Roark ext 8e: M_fixed_left");
    assert_close(r_end.mz.abs(), m_fixed, 0.02, "Roark ext 8e: M_fixed_right");

    // Equilibrium: sum of vertical reactions = wL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w * l, 0.01, "Roark ext 8e: equilibrium");
}

// ================================================================
// 3. Propped Cantilever Center Load: Roark Table 8.1 Case 3a
//    R_roller = 5P/16, M_fixed = 3PL/16
//    delta_under_load = 7PL^3/(768EI)
// ================================================================

#[test]
fn validation_roark_ext_3_propped_cantilever_center() {
    let l = 6.0;
    let n = 14;
    let p = 40.0; // kN
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Roller reaction: R_roller = 5P/16
    let r_roller = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_roller_exact = 5.0 * p / 16.0;
    assert_close(r_roller.ry, r_roller_exact, 0.02, "Roark ext 3a: R_roller");

    // Fixed-end moment: M_fixed = 3PL/16
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_fixed_exact = 3.0 * p * l / 16.0;
    assert_close(r_fixed.mz.abs(), m_fixed_exact, 0.02, "Roark ext 3a: M_fixed");

    // Deflection under load: delta = 7PL^3/(768EI)
    let delta_exact = 7.0 * p * l.powi(3) / (768.0 * e_eff * IZ);
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();
    assert_close(d_mid.uy.abs(), delta_exact, 0.02, "Roark ext 3a: delta_under_load");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Roark ext 3a: equilibrium");
}

// ================================================================
// 4. Propped Cantilever UDL: Roark Table 8.1 Case 3e
//    R_roller = 3wL/8, R_fixed = 5wL/8, M_fixed = wL^2/8
//    delta_max = wL^4/(185EI) at x = 0.4215L from fixed end
// ================================================================

#[test]
fn validation_roark_ext_4_propped_cantilever_udl() {
    let l = 6.0;
    let n = 14;
    let w = 15.0; // kN/m

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w, q_j: -w, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Roller reaction: R_roller = 3wL/8
    let r_roller = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_roller_exact = 3.0 * w * l / 8.0;
    assert_close(r_roller.ry, r_roller_exact, 0.02, "Roark ext 3e: R_roller");

    // Fixed reaction: R_fixed = 5wL/8
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_fixed_exact = 5.0 * w * l / 8.0;
    assert_close(r_fixed.ry, r_fixed_exact, 0.02, "Roark ext 3e: R_fixed");

    // Fixed-end moment: M_fixed = wL^2/8
    let m_fixed_exact = w * l * l / 8.0;
    assert_close(r_fixed.mz.abs(), m_fixed_exact, 0.02, "Roark ext 3e: M_fixed");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w * l, 0.01, "Roark ext 3e: equilibrium");
}

// ================================================================
// 5. Cantilever Triangular Load: Roark Table 8.1 Case 2d
//    Load increases from zero at fixed end to w_max at free end:
//      w(x) = w_max * x / L
//    delta_tip = 11 * w_max * L^4 / (120 EI)
//    M_fixed = w_max * L^2 / 3
//    R_fixed = w_max * L / 2
// ================================================================

#[test]
fn validation_roark_ext_5_cantilever_triangular() {
    let l = 6.0;
    let n = 16; // more elements for triangular load accuracy
    let w_max = 20.0; // kN/m at free end
    let e_eff = E * 1000.0;
    let elem_len: f64 = l / n as f64;

    let mut loads = Vec::new();
    for i in 0..n {
        let x_start = i as f64 * elem_len;
        let x_end = (i + 1) as f64 * elem_len;
        // Load increases from 0 at fixed end (x=0) to w_max at free end (x=L)
        let q_start = -w_max * x_start / l;
        let q_end = -w_max * x_end / l;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_start, q_j: q_end, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Tip deflection: delta = 11 * w_max * L^4 / (120 EI)
    let delta_exact = 11.0 * w_max * l.powi(4) / (120.0 * e_eff * IZ);
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uy.abs(), delta_exact, 0.02, "Roark ext 2d: delta_tip");

    // Fixed-end moment: M = w_max * L^2 / 3
    let m_fixed_exact = w_max * l * l / 3.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.mz.abs(), m_fixed_exact, 0.02, "Roark ext 2d: M_fixed");

    // Reaction: R = w_max * L / 2
    let r_exact = w_max * l / 2.0;
    assert_close(r1.ry, r_exact, 0.02, "Roark ext 2d: R_fixed");
}

// ================================================================
// 6. SS Beam with Moment at One End: Roark Table 8.1 Case 1d
//    theta_A = M0*L/(3EI)   (end where moment is applied)
//    theta_B = M0*L/(6EI)   (far end)
//    delta_max = M0*L^2 / (9*sqrt(3)*EI) at x = L/sqrt(3)
// ================================================================

#[test]
fn validation_roark_ext_6_ss_moment_at_end() {
    let l = 6.0;
    let n = 14;
    let m0 = 50.0; // kN-m
    let e_eff = E * 1000.0;

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fy: 0.0, mz: m0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Rotation at A (applied moment end): theta_A = M0*L/(3EI)
    let theta_a_exact = m0 * l / (3.0 * e_eff * IZ);
    let d_a = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    assert_close(d_a.rz.abs(), theta_a_exact, 0.02, "Roark ext 1d: theta_A");

    // Rotation at B (far end): theta_B = M0*L/(6EI)
    let theta_b_exact = m0 * l / (6.0 * e_eff * IZ);
    let d_b = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_b.rz.abs(), theta_b_exact, 0.02, "Roark ext 1d: theta_B");

    // Max deflection: delta_max = M0*L^2 / (9*sqrt(3)*EI)
    let delta_max_exact = m0 * l * l / (9.0 * 3.0_f64.sqrt() * e_eff * IZ);
    // Max deflection occurs at x = L/sqrt(3) ~ 0.577*L
    // Find node closest to this location
    let x_max = l / 3.0_f64.sqrt();
    let elem_len = l / n as f64;
    let closest_node = (x_max / elem_len).round() as usize + 1;
    let d_max = results.displacements.iter()
        .find(|d| d.node_id == closest_node).unwrap();
    assert_close(d_max.uy.abs(), delta_max_exact, 0.02, "Roark ext 1d: delta_max");

    // Reactions: R_A = -M0/L (downward), R_B = M0/L (upward) for positive M0
    // The beam deflects upward for a positive applied moment at A
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.ry.abs(), m0 / l, 0.02, "Roark ext 1d: R_A");
    assert_close(r_b.ry.abs(), m0 / l, 0.02, "Roark ext 1d: R_B");
}

// ================================================================
// 7. Cantilever with UDL on Outer Half: Roark Case 2c variant
//    UDL w applied from x=a to x=L (a = L/2).
//    Fixed at x=0, free at x=L.
//    By virtual work integration:
//      delta_tip = 41*w*L^4/(384*EI)
//    M_fixed = w*(L-a)*((L+a)/2) = 3wL^2/8
//    R_fixed = w*(L-a) = wL/2
// ================================================================

#[test]
fn validation_roark_ext_7_fixed_free_partial_udl() {
    let l = 6.0;
    let n = 14;
    let w = 12.0; // kN/m
    let e_eff = E * 1000.0;

    // Load only from L/2 to L (elements in the outer half)
    let half_elem = n / 2; // first loaded element index
    let mut loads = Vec::new();
    for i in half_elem..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w, q_j: -w, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Tip deflection for cantilever with UDL w from a=L/2 to tip:
    // Using superposition: full-span UDL minus inner UDL on [0, L/2].
    // Full cantilever UDL: delta_tip = wL^4/(8EI) = 48wL^4/(384EI)
    // Inner UDL [0,a]: delta_tip = w*a^3*(4L-a)/(24EI), with a=L/2:
    //   = w*(L/2)^3*(4L-L/2)/(24EI) = 7wL^4/(384EI)
    // Partial tip = (48 - 7)*wL^4/(384EI) = 41wL^4/(384EI)
    let delta_tip_exact = 41.0 * w * l.powi(4) / (384.0 * e_eff * IZ);
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uy.abs(), delta_tip_exact, 0.02, "Roark ext 2c partial: delta_tip");

    // Fixed-end moment: M = w*(L/2)*(3L/4) = 3wL^2/8
    // Actually for cantilever with UDL from L/2 to L:
    // M_fixed = w*(L/2) * (L/2 + L/4) = w*(L/2)*(3L/4) = 3wL^2/8
    let m_fixed_exact = 3.0 * w * l * l / 8.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.mz.abs(), m_fixed_exact, 0.02, "Roark ext 2c partial: M_fixed");

    // Fixed-end reaction: R = w * L/2
    let r_exact = w * l / 2.0;
    assert_close(r1.ry, r_exact, 0.02, "Roark ext 2c partial: R_fixed");

    // Midspan deflection (at L/2, boundary of loaded region)
    // Verify it is positive and less than tip deflection
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.uy.abs() > 0.0, "Midspan should deflect");
    assert!(d_mid.uy.abs() < tip.uy.abs(), "Midspan deflection < tip deflection");
}

// ================================================================
// 8. Overhanging Beam: supports at x=0 and x=L, overhang to x=L+a
//    Point load P at overhang tip.
//    R_B = P*(L+a)/L  (upward at interior support B)
//    R_A = -P*a/L     (downward at end support A)
//    M_B = -P*a        (negative moment at interior support)
//    Tip deflection (overhang): involves both cantilever action and beam rotation
//      delta_tip = P*a^2*(L+a)/(3EI)   (combining rotation and cantilever)
//    Actually the exact formula for tip deflection of overhang:
//      delta_tip = P*a*(a+L)*a / (3EI) is NOT correct.
//    The correct approach: the overhang tip deflection is due to:
//      (1) rotation at B: theta_B = P*a*L/(3EI)  (from the SS span A-B loaded by M=Pa at B)
//          Wait, the SS span sees moment M=Pa at B.
//          For SS beam with moment M at one end: theta_near = ML/(3EI)
//          So theta_B (from main span side) = (P*a)*L/(3EI)
//      (2) cantilever deflection of overhang: delta_cant = P*a^3/(3EI)
//      Total tip deflection = theta_B * a + delta_cant
//                           = P*a^2*L/(3EI) + P*a^3/(3EI)
//                           = P*a^2*(L+a)/(3EI)
// ================================================================

#[test]
fn validation_roark_ext_8_overhanging_beam() {
    let l = 6.0;   // main span
    let a = 2.0;   // overhang length
    let p = 25.0;  // kN at overhang tip
    let e_eff = E * 1000.0;

    // Build a multi-element beam: 12 elements for main span + 4 for overhang = 16 total
    let n_main = 12;
    let n_over = 4;
    let n_total = n_main + n_over;
    let n_nodes = n_total + 1;
    let elem_len_main = l / n_main as f64;
    let elem_len_over = a / n_over as f64;

    let mut nodes = Vec::new();
    // Main span nodes
    for i in 0..=n_main {
        nodes.push((i + 1, i as f64 * elem_len_main, 0.0));
    }
    // Overhang nodes (continuing from end of main span)
    for i in 1..=n_over {
        nodes.push((n_main + 1 + i, l + i as f64 * elem_len_over, 0.0));
    }

    let elems: Vec<_> = (0..n_total)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Supports: pinned at node 1 (x=0), rollerX at node n_main+1 (x=L)
    let support_node_b = n_main + 1;
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, support_node_b, "rollerX"),
    ];

    // Load at overhang tip
    let tip_node = n_nodes;
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reaction at B (interior support): R_B = P*(L+a)/L (upward)
    let r_b = results.reactions.iter().find(|r| r.node_id == support_node_b).unwrap();
    let r_b_exact = p * (l + a) / l;
    assert_close(r_b.ry, r_b_exact, 0.02, "Roark ext overhang: R_B");

    // Reaction at A: R_A = -P*a/L (downward, hence negative)
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_a_exact = -p * a / l;
    assert_close(r_a.ry, r_a_exact, 0.02, "Roark ext overhang: R_A");

    // Equilibrium: R_A + R_B = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Roark ext overhang: equilibrium");

    // Maximum negative moment at interior support B: M = -P*a
    // Check via element forces: the element just to the left of support B
    // should have m_end ~ P*a, and element just to right should have m_start ~ P*a
    // We use the element ending at B (element n_main)
    let ef_at_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_main).unwrap();
    let m_b_exact = p * a;
    assert_close(ef_at_b.m_end.abs(), m_b_exact, 0.02, "Roark ext overhang: M_at_B");

    // Tip deflection: delta_tip = P*a^2*(L+a)/(3EI)
    let delta_tip_exact = p * a * a * (l + a) / (3.0 * e_eff * IZ);
    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    assert_close(d_tip.uy.abs(), delta_tip_exact, 0.02, "Roark ext overhang: delta_tip");
}
