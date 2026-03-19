/// Validation: Notional Loads and Geometric Imperfections
///
/// References:
///   - AISC 360-22, Section C2 (Calculation of Required Strengths)
///   - Eurocode 3, EN 1993-1-1, Section 5.3 (Imperfections)
///   - CSA S16-19, Clause 8.4 (Notional Loads)
///
/// Notional loads are small lateral loads (typically 0.2-0.5% of gravity)
/// applied to account for geometric imperfections, residual stresses,
/// and out-of-plumb effects.
///
/// Tests verify:
///   1. Notional load effect: small lateral + large gravity
///   2. Notional load proportionality to gravity
///   3. Column additional moment from notional load
///   4. Multi-story notional loads at each level
///   5. Notional load direction: worst-case analysis
///   6. Imperfection equivalence: notional vs initial bow
///   7. Frame stability: notional load reveals sway
///   8. Combined wind + notional loads
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Notional Load Effect: Small Lateral + Large Gravity
// ================================================================
//
// Column with gravity P and notional load α×P (α = 0.002):
// The notional load creates an additional moment M = αPH

#[test]
fn validation_notional_small_lateral() {
    let h = 5.0;
    let n = 10;
    let p_gravity = 500.0; // large gravity
    let alpha = 0.002; // AISC notional load ratio
    let f_notional = alpha * p_gravity;

    // Cantilever column with gravity + notional
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_notional, fz: -p_gravity, my: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Base moment from notional load = f_notional × H
    let m_notional = f_notional * h;
    assert_close(r.my.abs(), m_notional, 0.02,
        "Notional: M_base = αPH");

    // Base shear from notional
    assert_close(r.rx.abs(), f_notional, 0.01,
        "Notional: V_base = αP");
}

// ================================================================
// 2. Notional Load Proportional to Gravity
// ================================================================
//
// Doubling the gravity should double the notional load effect
// (in linear analysis).

#[test]
fn validation_notional_proportionality() {
    let h = 4.0;
    let w = 6.0;
    let alpha = 0.002;

    let p1 = 100.0;
    let p2 = 200.0;

    // Portal frame with gravity P and notional α×P
    let input1 = make_portal_frame(h, w, E, A, IZ, alpha * p1, -p1);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    let input2 = make_portal_frame(h, w, E, A, IZ, alpha * p2, -p2);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Drift proportional to load level
    assert_close(d2 / d1, 2.0, 0.02,
        "Notional: drift ∝ gravity (2×)");
}

// ================================================================
// 3. Column Additional Moment from Notional Load
// ================================================================
//
// Fixed-base column: notional load adds moment M = F_n × H
// at the base. Compare with gravity-only case.

#[test]
fn validation_notional_column_moment() {
    let h = 5.0;
    let n = 10;
    let p = 300.0;
    let alpha = 0.003;

    // Gravity only
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads_grav = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_grav = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed")], loads_grav);
    let m_grav = linear::solve_2d(&input_grav).unwrap()
        .reactions.iter().find(|r| r.node_id == 1).unwrap().my;

    // Gravity + notional
    let loads_both = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: alpha * p, fz: -p, my: 0.0,
    })];
    let input_both = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed")], loads_both);
    let m_both = linear::solve_2d(&input_both).unwrap()
        .reactions.iter().find(|r| r.node_id == 1).unwrap().my;

    // Gravity-only should have zero base moment (axial only, no eccentricity)
    assert!(m_grav.abs() < 1e-8,
        "Gravity only: M_base ≈ 0: {:.6e}", m_grav);

    // With notional: M_base = α×P×H
    let m_notional_exact = alpha * p * h;
    assert_close(m_both.abs(), m_notional_exact, 0.02,
        "Notional: M_base = αPH");
}

// ================================================================
// 4. Multi-Story Notional Loads at Each Level
// ================================================================
//
// Apply notional loads at each floor level proportional to
// the gravity load at that level. Total base shear = Σ(α×Pi).

#[test]
fn validation_notional_multistory() {
    let w = 6.0;
    let h = 3.5;
    let alpha = 0.002;
    let p_floor = 100.0; // gravity per floor

    // 3-story frame
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut sups = Vec::new();
    let mut eid = 1;

    nodes.push((1, 0.0, 0.0));
    nodes.push((2, w, 0.0));
    sups.push((1, 1, "fixed"));
    sups.push((2, 2, "fixed"));

    let mut loads = Vec::new();

    for story in 1..=3_usize {
        let y = story as f64 * h;
        let left = 2 * story + 1;
        let right = 2 * story + 2;
        nodes.push((left, 0.0, y));
        nodes.push((right, w, y));
        let bl = if story == 1 { 1 } else { 2 * (story - 1) + 1 };
        let br = if story == 1 { 2 } else { 2 * (story - 1) + 2 };
        elems.push((eid, "frame", bl, left, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", br, right, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", left, right, 1, 1, false, false)); eid += 1;

        // Gravity at both nodes
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: left, fx: alpha * p_floor, fz: -p_floor, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: right, fx: 0.0, fz: -p_floor, my: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear = sum of notional loads = 3 × α × P_floor
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let expected_shear = 3.0 * alpha * p_floor;
    assert_close(sum_rx.abs(), expected_shear, 0.01,
        "Multi-story: base shear = Σ(αPi)");

    // Floors drift in direction of notional load
    let d_top = results.displacements.iter()
        .find(|d| d.node_id == 7).unwrap().ux;
    assert!(d_top > 0.0, "Multi-story: positive drift");
}

// ================================================================
// 5. Notional Load Direction: Worst-Case
// ================================================================
//
// Notional load should be applied in the direction that
// produces the worst effect. Compare +αP vs -αP.

#[test]
fn validation_notional_direction() {
    let h = 4.0;
    let w = 6.0;
    let p = 200.0;
    let alpha = 0.002;

    // +αP direction
    let input_pos = make_portal_frame(h, w, E, A, IZ, alpha * p, -p);
    let d_pos = linear::solve_2d(&input_pos).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // -αP direction
    let input_neg = make_portal_frame(h, w, E, A, IZ, -alpha * p, -p);
    let d_neg = linear::solve_2d(&input_neg).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Equal magnitude, opposite direction (linear + symmetric structure)
    assert_close(d_pos.abs(), d_neg.abs(), 0.01,
        "Notional: |δ+| = |δ-|");
    assert!(d_pos * d_neg < 0.0,
        "Notional: opposite drift: {:.6e} vs {:.6e}", d_pos, d_neg);
}

// ================================================================
// 6. Imperfection Equivalence
// ================================================================
//
// Eurocode 3 approach: equivalent bow imperfection e₀ = αL
// gives the same base moment as notional load F = αP.
// For cantilever: M = F×H = αPH = P×e₀ (same moment).

#[test]
fn validation_notional_imperfection_equiv() {
    let h = 5.0;
    let n = 10;
    let p = 300.0;
    let alpha = 0.005; // bow imperfection ratio

    // Method 1: Notional load αP at top
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads_notional = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: alpha * p, fz: -p, my: 0.0,
    })];
    let input_n = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed")], loads_notional);
    let m_notional = linear::solve_2d(&input_n).unwrap()
        .reactions.iter().find(|r| r.node_id == 1).unwrap().my;

    // Method 2: Eccentric load = moment at top = P × e₀ = P × αH
    let e0 = alpha * h;
    let loads_eccentric = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: p * e0,
    })];
    let input_e = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed")], loads_eccentric);
    let m_eccentric = linear::solve_2d(&input_e).unwrap()
        .reactions.iter().find(|r| r.node_id == 1).unwrap().my;

    // Both methods should produce the same base moment (approximately)
    // Not exactly equal because notional load also creates shear,
    // but the moment should be similar
    assert!((m_notional.abs() - m_eccentric.abs()) / m_notional.abs() < 0.20,
        "Imperfection equiv: notional ≈ eccentric: {:.4} vs {:.4}",
        m_notional, m_eccentric);
}

// ================================================================
// 7. Frame Stability: Notional Load Reveals Sway
// ================================================================
//
// A gravity-only symmetric frame has zero sway. Adding notional
// loads reveals the inherent instability tendency.

#[test]
fn validation_notional_reveals_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 200.0;
    let alpha = 0.002;

    // Gravity only: no sway (symmetric)
    let input_grav = make_portal_frame(h, w, E, A, IZ, 0.0, -p);
    let d_grav = linear::solve_2d(&input_grav).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Gravity + notional: sway appears
    let input_notional = make_portal_frame(h, w, E, A, IZ, alpha * p, -p);
    let d_notional = linear::solve_2d(&input_notional).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Gravity-only: zero lateral displacement
    assert!(d_grav.abs() < 1e-8,
        "Gravity only: no sway: {:.6e}", d_grav);

    // With notional: non-zero drift
    assert!(d_notional.abs() > 1e-10,
        "Notional: reveals sway: {:.6e}", d_notional);
}

// ================================================================
// 8. Combined Wind + Notional Loads
// ================================================================
//
// When wind load exceeds notional load, the total drift
// should be the sum of both (superposition).

#[test]
fn validation_notional_plus_wind() {
    let h = 4.0;
    let w = 6.0;
    let p_gravity = 200.0;
    let f_wind = 15.0;
    let alpha = 0.002;
    let f_notional = alpha * p_gravity;

    // Wind only
    let input_w = make_portal_frame(h, w, E, A, IZ, f_wind, 0.0);
    let d_wind = linear::solve_2d(&input_w).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Notional only (with gravity)
    let input_n = make_portal_frame(h, w, E, A, IZ, f_notional, -p_gravity);
    let d_notional = linear::solve_2d(&input_n).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Combined: wind + notional + gravity
    let input_c = make_portal_frame(h, w, E, A, IZ, f_wind + f_notional, -p_gravity);
    let d_combined = linear::solve_2d(&input_c).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Superposition: d_combined ≈ d_wind + d_notional
    // (gravity doesn't affect lateral drift in linear analysis)
    assert_close(d_combined, d_wind + d_notional, 0.02,
        "Wind+notional: superposition");
}
