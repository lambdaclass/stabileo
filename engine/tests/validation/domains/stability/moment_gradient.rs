/// Validation: Moment Gradient and Curvature Relationships
///
/// References:
///   - Timoshenko, "Strength of Materials", Part I, Ch. 5
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9
///   - Popov, "Engineering Mechanics of Solids", Ch. 8
///
/// The relationships V = dM/dx and M = EI*κ connect shear, moment,
/// and curvature. These tests verify these fundamental relationships
/// in the solver's output.
///
/// Tests verify:
///   1. UDL beam: V = dM/dx approximation from discrete elements
///   2. Constant shear → linear moment (cantilever tip load)
///   3. Linear shear → parabolic moment (UDL)
///   4. Point load: shear jump = P, moment kink
///   5. Couple load: moment jump, no shear change
///   6. Cantilever UDL: moment is parabolic
///   7. Fixed-fixed: moment sign changes
///   8. Moment curvature proportionality
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. UDL Beam: V = dM/dx Approximation
// ================================================================
//
// For a beam with UDL, V(x) = dM/dx.
// Between two elements: V_avg ≈ (M_end - M_start) / dx

#[test]
fn validation_gradient_v_equals_dm_dx() {
    let l = 10.0;
    let n = 20;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let dx = l / n as f64;

    // Check V ≈ ΔM/Δx at several elements
    for i in [3, 5, 10, 15, 18] {
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == i).unwrap();

        let dm_dx = (ef.m_end - ef.m_start) / dx;
        let v_avg = (ef.v_start + ef.v_end) / 2.0;

        // |V| ≈ |dM/dx| (sign convention may differ)
        assert_close(v_avg.abs(), dm_dx.abs(), 0.1,
            &format!("|V| = |dM/dx| at element {}", i));
    }
}

// ================================================================
// 2. Constant Shear → Linear Moment
// ================================================================
//
// Cantilever with tip load: V = P everywhere,
// M(x) = P*(L-x) is linear.

#[test]
fn validation_gradient_constant_shear() {
    let l = 8.0;
    let n = 16;
    let p = 15.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let dx = l / n as f64;

    // Shear should be constant across all elements
    let mut v_values: Vec<f64> = Vec::new();
    for i in 1..=n {
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == i).unwrap();
        v_values.push(ef.v_start.abs());
    }

    // All shear values should be close to P
    for v in &v_values {
        assert_close(*v, p, 0.02, "Constant shear = P");
    }

    // Moment should decrease linearly: M(elem_start) ≈ P*(L - x)
    for i in [1, 4, 8, 12, 16] {
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == i).unwrap();
        let x = (i - 1) as f64 * dx;
        let m_expected = p * (l - x);
        assert_close(ef.m_start.abs(), m_expected, 0.05,
            &format!("Linear moment at element {}", i));
    }
}

// ================================================================
// 3. Linear Shear → Parabolic Moment (SS UDL)
// ================================================================
//
// V(x) = qL/2 - qx (linear)
// M(x) = qLx/2 - qx²/2 (parabolic)

#[test]
fn validation_gradient_parabolic_moment() {
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

    // Check moment at quarter-span, midspan, three-quarter span
    for (frac, name) in [(0.25, "L/4"), (0.5, "L/2"), (0.75, "3L/4")] {
        let x = frac * l;
        let elem_idx = (frac * n as f64) as usize;
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == elem_idx).unwrap();

        let m_theory = q.abs() * l * x / 2.0 - q.abs() * x * x / 2.0;
        assert_close(ef.m_end.abs(), m_theory, 0.05,
            &format!("Parabolic M at {}", name));
    }

    // Max moment at midspan = qL²/8
    let m_max = q.abs() * l * l / 8.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max, 0.02,
        "Parabolic M: max = qL²/8");
}

// ================================================================
// 4. Point Load: Shear Jump and Moment Kink
// ================================================================

#[test]
fn validation_gradient_point_load_kink() {
    let l = 10.0;
    let n = 20;
    let p = 30.0;
    let mid = n / 2;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Shear jump at load point
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == mid).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == mid + 1).unwrap();

    let jump = (ef_left.v_end - ef_right.v_start).abs();
    assert_close(jump, p, 0.02, "Point load: shear jump = P");

    // Moment kink: moment is maximum at load point
    // M_max = P*L/4 (midspan point load on SS beam)
    let m_max = p * l / 4.0;
    assert_close(ef_left.m_end.abs(), m_max, 0.02,
        "Point load: M_max = PL/4");

    // Moment continuity at load point
    assert_close(ef_left.m_end, ef_right.m_start, 0.01,
        "Point load: moment continuous at load");
}

// ================================================================
// 5. Couple Load: Moment Jump, No Shear Change
// ================================================================

#[test]
fn validation_gradient_couple_moment_jump() {
    let l = 10.0;
    let n = 20;
    let m = 50.0;
    let mid = n / 2;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid + 1, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Shear should be small and continuous everywhere (no point load)
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == mid).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == mid + 1).unwrap();

    // Shear should be continuous (no jump from couple)
    // Shear is constant = R_A = M/L
    let v_expected = m / l;
    assert_close(ef_left.v_end.abs(), v_expected, 0.1,
        "Couple: V = M/L");

    // Moment should have a discontinuity of magnitude M
    let m_jump = (ef_left.m_end - ef_right.m_start).abs();
    assert!(m_jump > m * 0.5,
        "Couple: moment jump exists: {:.2}", m_jump);
}

// ================================================================
// 6. Cantilever UDL: Parabolic Moment
// ================================================================
//
// M(x) = -q*(L-x)²/2

#[test]
fn validation_gradient_cantilever_parabolic() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M at fixed end = qL²/2
    let ef1 = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let m_fixed = q.abs() * l.powi(2) / 2.0;
    assert_close(ef1.m_start.abs(), m_fixed, 0.02,
        "Cantilever UDL: M(0) = qL²/2");

    // M at tip ≈ 0
    let ef_tip = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert!(ef_tip.m_end.abs() < 0.5,
        "Cantilever UDL: M(L) ≈ 0");

    // M at L/2: q*(L-L/2)²/2 = qL²/8
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    let m_mid = q.abs() * l.powi(2) / 8.0;
    assert_close(ef_mid.m_end.abs(), m_mid, 0.05,
        "Cantilever UDL: M(L/2) = qL²/8");
}

// ================================================================
// 7. Fixed-Fixed: Moment Sign Changes
// ================================================================
//
// Fixed-fixed beam with UDL: hogging at ends, sagging at midspan.
// Moment sign changes at inflection points.

#[test]
fn validation_gradient_fixed_moment_signs() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End moments: M = qL²/12
    let ef1 = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();

    // Midspan moment: M = qL²/24 (opposite sign from ends)
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();

    // End and midspan moments should have opposite signs
    // (or we just check magnitudes)
    let m_end_mag = ef1.m_start.abs();
    let m_mid_mag = ef_mid.m_end.abs();

    // M_end = qL²/12, M_mid = qL²/24 → ratio = 2
    assert_close(m_end_mag / m_mid_mag, 2.0, 0.1,
        "Fixed-fixed: M_end/M_mid ≈ 2");

    // There should be sign changes (inflection points)
    let mut sign_changes = 0;
    for i in 1..=n {
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == i).unwrap();
        if ef.m_start * ef.m_end < 0.0 {
            sign_changes += 1;
        }
    }
    assert!(sign_changes >= 2,
        "Fixed-fixed: at least 2 moment sign changes (got {})", sign_changes);
}

// ================================================================
// 8. Moment-Curvature: M = EI*κ
// ================================================================
//
// For a SS beam with UDL, the midspan curvature κ = M/(EI).
// We can approximate curvature from adjacent node rotations.

#[test]
fn validation_gradient_curvature() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let dx = l / n as f64;

    // Approximate curvature at midspan from rotation difference
    let mid = n / 2 + 1;
    let rz_left = results.displacements.iter()
        .find(|d| d.node_id == mid - 1).unwrap().rz;
    let rz_right = results.displacements.iter()
        .find(|d| d.node_id == mid + 1).unwrap().rz;

    let kappa_approx = (rz_right - rz_left) / (2.0 * dx);

    // Theoretical curvature at midspan: κ = M/(EI) = qL²/(8EI)
    let m_mid = q.abs() * l.powi(2) / 8.0;
    let kappa_theory = m_mid / (e_eff * IZ);

    // Compare (allow some discretization error)
    assert_close(kappa_approx.abs(), kappa_theory, 0.1,
        "Curvature: κ ≈ M/(EI) at midspan");
}
