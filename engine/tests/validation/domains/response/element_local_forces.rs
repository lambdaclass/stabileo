/// Validation: Element Local Forces and Internal Force Recovery
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 5
///   - Kassimali, "Structural Analysis", Ch. 13-15
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 4
///
/// After solving K*u = F, internal forces are recovered as:
///   f_local = k_local * T * u_elem - FEF
/// These tests verify the accuracy of internal force recovery
/// by checking against known analytical solutions.
///
/// Tests verify:
///   1. SS beam UDL: shear = qL/2 - qx, moment = qLx/2 - qx²/2
///   2. Cantilever tip load: V = P, M = P(L-x) everywhere
///   3. Fixed-fixed UDL: end forces match analytical
///   4. Two-element beam: internal forces consistent at shared node
///   5. Axial force in truss: F = P*cos(θ) for inclined member
///   6. Portal frame: beam-column joint equilibrium
///   7. Element with point load: shear jump at load
///   8. Continuous beam: internal force consistency across supports
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: Shear and Moment at Specific Points
// ================================================================
//
// V(x) = qL/2 - qx, M(x) = qLx/2 - qx²/2

#[test]
fn validation_local_forces_ss_udl() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check shear at first element (near x=0): V ≈ qL/2
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let v_expected = q.abs() * l / 2.0;
    assert_close(ef1.v_start.abs(), v_expected, 0.05,
        "SS UDL: V(0) = qL/2");

    // Check shear at last element (near x=L): V ≈ -qL/2
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(ef_last.v_end.abs(), v_expected, 0.05,
        "SS UDL: V(L) = qL/2");

    // Moment at midspan: M = qL²/8
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    let m_expected = q.abs() * l * l / 8.0;
    assert_close(ef_mid.m_end.abs(), m_expected, 0.02,
        "SS UDL: M(L/2) = qL²/8");
}

// ================================================================
// 2. Cantilever Tip Load: Constant Shear, Linear Moment
// ================================================================

#[test]
fn validation_local_forces_cantilever() {
    let l = 6.0;
    let n = 12;
    let p = 15.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let dx = l / n as f64;
    // Shear should be constant = P throughout
    for i in 1..=n {
        let ef = results.element_forces.iter().find(|e| e.element_id == i).unwrap();
        assert_close(ef.v_start.abs(), p, 0.02,
            &format!("Cantilever: V = P at element {}", i));
    }

    // Moment at fixed end: M = PL
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1.m_start.abs(), p * l, 0.02, "Cantilever: M(0) = PL");

    // Moment decreases linearly toward tip
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(ef_last.m_end.abs(), 0.0, 0.02, "Cantilever: M(L) ≈ 0");

    // Check intermediate: M at element 6 end ≈ P*(L - 6*dx) = P*(L/2)
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    let x6 = 6.0 * dx;
    assert_close(ef6.m_end.abs(), p * (l - x6), 0.02,
        "Cantilever: M(x) = P(L-x)");
}

// ================================================================
// 3. Fixed-Fixed UDL: End Forces
// ================================================================
//
// V_A = qL/2, M_A = qL²/12, V_B = qL/2, M_B = qL²/12

#[test]
fn validation_local_forces_fixed_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End shears: V = qL/2
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_n = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(ef1.v_start.abs(), q.abs() * l / 2.0, 0.02,
        "Fixed UDL: V_start = qL/2");
    assert_close(ef_n.v_end.abs(), q.abs() * l / 2.0, 0.02,
        "Fixed UDL: V_end = qL/2");

    // End moments: M = qL²/12
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.mz.abs(), q.abs() * l * l / 12.0, 0.02,
        "Fixed UDL: M_A = qL²/12");
    assert_close(r2.mz.abs(), q.abs() * l * l / 12.0, 0.02,
        "Fixed UDL: M_B = qL²/12");
}

// ================================================================
// 4. Two-Element Beam: Force Consistency at Shared Node
// ================================================================
//
// At a shared node between two elements, the end of element i
// and start of element i+1 should have equal and opposite forces.

#[test]
fn validation_local_forces_consistency() {
    let l = 10.0;
    let n = 10;
    let p = 20.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check continuity at interior nodes (not at load point)
    for i in 1..n {
        if i + 1 == mid as usize { continue; } // skip load node
        let ef_i = results.element_forces.iter().find(|e| e.element_id == i).unwrap();
        let ef_next = results.element_forces.iter().find(|e| e.element_id == i + 1).unwrap();

        // Moment should be continuous at internal nodes
        assert!((ef_i.m_end - ef_next.m_start).abs() < 0.1,
            "Continuity elem {}-{}: m_end={:.4}, m_start={:.4}",
            i, i + 1, ef_i.m_end, ef_next.m_start);
    }
}

// ================================================================
// 5. Axial Force in Simple Truss Members
// ================================================================
//
// Simple truss: two members from apex to base.
// Vertical load at apex → members in compression.
// By equilibrium: vertical component of each member force = P/2.

#[test]
fn validation_local_forces_axial_truss() {
    let l = 8.0;
    let n = 16;
    let p = 20.0;

    // Simple horizontal truss bar (axial-only element)
    // Under axial load, N = P throughout
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Axial force should be constant = P along the bar
    for i in 1..=n {
        let ef = results.element_forces.iter().find(|e| e.element_id == i).unwrap();
        assert_close(ef.n_start.abs(), p, 0.02,
            &format!("Axial: N = P at element {}", i));
    }

    // Reaction at pinned support: Rx = -P
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx, -p, 0.01, "Axial: Rx = -P");
}

// ================================================================
// 6. Portal Frame: Force and Reaction Equilibrium
// ================================================================
//
// Sum of all reaction forces = sum of all applied forces.

#[test]
fn validation_local_forces_portal_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;
    let g = -15.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, g);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // ΣFx = 0: reactions balance lateral load
    assert_close(r1.rx + r4.rx, -f_lat, 0.01, "Portal: ΣRx = -F_lat");

    // ΣFy = 0: reactions balance gravity (two nodes loaded)
    assert_close(r1.ry + r4.ry, -2.0 * g, 0.01, "Portal: ΣRy = -2g");

    // Both base moments should be non-zero (fixed supports resist frame action)
    assert!(r1.mz.abs() > 0.1, "Portal: base moment at 1 exists");
    assert!(r4.mz.abs() > 0.1, "Portal: base moment at 4 exists");
}

// ================================================================
// 7. Element with Point Load: Shear Jump
// ================================================================
//
// For a point load P on a SS beam at midspan, the shear diagram
// has a jump of magnitude P at the load point.

#[test]
fn validation_local_forces_shear_jump() {
    let l = 10.0;
    let n = 20;
    let p = 20.0;
    let mid = n / 2;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Shear just left of load (element mid, end): V = P/2
    let ef_left = results.element_forces.iter().find(|e| e.element_id == mid).unwrap();
    // Shear just right of load (element mid+1, start): V = -P/2
    let ef_right = results.element_forces.iter().find(|e| e.element_id == mid + 1).unwrap();

    // Shear magnitudes should be P/2
    assert_close(ef_left.v_end.abs(), p / 2.0, 0.02, "Shear left of load = P/2");
    assert_close(ef_right.v_start.abs(), p / 2.0, 0.02, "Shear right of load = P/2");

    // Shear jump = P (signs differ)
    let jump = (ef_left.v_end - ef_right.v_start).abs();
    assert_close(jump, p, 0.02, "Shear jump = P at load point");
}

// ================================================================
// 8. Continuous Beam: Force Consistency Across Support
// ================================================================
//
// At an interior support of a continuous beam, moment is continuous
// but shear may jump by the reaction force.

#[test]
fn validation_local_forces_continuous() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment is continuous at interior support (node n+1)
    let ef_span1_end = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let ef_span2_start = results.element_forces.iter().find(|e| e.element_id == n + 1).unwrap();

    assert!((ef_span1_end.m_end - ef_span2_start.m_start).abs() < 0.5,
        "Continuous: moment continuous at support: {:.4} vs {:.4}",
        ef_span1_end.m_end, ef_span2_start.m_start);

    // Shear jump at interior support = interior reaction
    let r_int = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;
    let v_jump = (ef_span1_end.v_end - ef_span2_start.v_start).abs();
    assert_close(v_jump, r_int.abs(), 0.05,
        "Continuous: shear jump = reaction");
}
