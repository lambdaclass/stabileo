/// Validation: Moment Area Method (Mohr's Theorems)
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 8 (Deflections using moment-area)
///   - Ghali & Neville, "Structural Analysis", Ch. 7
///   - Timoshenko, "Strength of Materials", Vol. 1
///
/// Tests verify slopes and deflections via moment-area theorems:
///   1. SS beam + center load: end slope = PL²/(16EI)
///   2. Cantilever + tip load: tip slope = PL²/(2EI)
///   3. Cantilever + UDL: tip slope = qL³/(6EI)
///   4. SS beam + UDL: end slope = qL³/(24EI)
///   5. Fixed-pinned beam: slope at pinned end
///   6. Tangential deviation relationship
///   7. Overhang beam deflection at free end
///   8. Slope symmetry under symmetric loading
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam + Center Load: End Slope = PL²/(16EI)
// ================================================================

#[test]
fn validation_moment_area_ss_center_slope() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();

    // End slope θ = PL²/(16EI)
    let theta_exact = p * l * l / (16.0 * e_eff * IZ);
    assert_close(d1.rz.abs(), theta_exact, 0.02,
        "Moment area: SS center load end slope = PL²/(16EI)");
}

// ================================================================
// 2. Cantilever + Tip Load: Tip Slope = PL²/(2EI)
// ================================================================

#[test]
fn validation_moment_area_cantilever_tip_slope() {
    let l = 5.0;
    let n = 10;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Tip slope θ = PL²/(2EI)
    let theta_exact = p * l * l / (2.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Moment area: cantilever tip slope = PL²/(2EI)");
}

// ================================================================
// 3. Cantilever + UDL: Tip Slope = qL³/(6EI)
// ================================================================

#[test]
fn validation_moment_area_cantilever_udl_slope() {
    let l = 5.0;
    let n = 10;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Tip slope θ = qL³/(6EI)
    let theta_exact = q.abs() * l * l * l / (6.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Moment area: cantilever UDL tip slope = qL³/(6EI)");
}

// ================================================================
// 4. SS Beam + UDL: End Slope = qL³/(24EI)
// ================================================================

#[test]
fn validation_moment_area_ss_udl_slope() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();

    // End slope θ = qL³/(24EI)
    let theta_exact = q.abs() * l * l * l / (24.0 * e_eff * IZ);
    assert_close(d1.rz.abs(), theta_exact, 0.02,
        "Moment area: SS UDL end slope = qL³/(24EI)");
}

// ================================================================
// 5. Fixed-Pinned Beam + UDL: Slope at Pinned End
// ================================================================
//
// Propped cantilever with UDL: θ at roller = qL³/(48EI)

#[test]
fn validation_moment_area_propped_slope() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // θ at roller = qL³/(48EI) for propped cantilever
    let theta_exact = q.abs() * l * l * l / (48.0 * e_eff * IZ);
    assert_close(d_end.rz.abs(), theta_exact, 0.05,
        "Moment area: propped cantilever slope at roller = qL³/(48EI)");
}

// ================================================================
// 6. Tangential Deviation: Cantilever Tip Load
// ================================================================
//
// The tangential deviation of A from B equals the deflection for a cantilever.
// δ = PL³/(3EI) and θ_tip = PL²/(2EI). Check δ = θ_tip × L - correction.
// Actually: for cantilever δ_tip = M₁·x̄₁/(EI) where M₁ = area of M/EI diagram,
// x̄₁ = centroid from tip.

#[test]
fn validation_moment_area_tangential_deviation() {
    let l = 5.0;
    let n = 10;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ = PL³/(3EI)
    let delta_exact = p * l * l * l / (3.0 * e_eff * IZ);
    // θ = PL²/(2EI)
    let theta_exact = p * l * l / (2.0 * e_eff * IZ);

    assert_close(tip.uy.abs(), delta_exact, 0.02, "Tangential deviation: δ");
    assert_close(tip.rz.abs(), theta_exact, 0.02, "Tangential deviation: θ");

    // Consistency: δ/θ = 2L/3 for triangular moment diagram
    let ratio = tip.uy.abs() / tip.rz.abs();
    assert_close(ratio, 2.0 * l / 3.0, 0.02, "Tangential deviation: δ/θ = 2L/3");
}

// ================================================================
// 7. Overhang Beam: Deflection at Free End
// ================================================================
//
// Beam with span L pinned-roller, overhang a, tip load P at free end.
// Deflection at free end = Pa²(L+a)/(3EI)

#[test]
fn validation_moment_area_overhang() {
    let span = 6.0;
    let overhang = 2.0;
    let l_total = span + overhang;
    let n = 8;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let elem_len = l_total / n as f64;
    // Node positions: 1..=n+1
    // Pinned at node 1, roller at node (span/elem_len)+1
    let roller_node = (span / elem_len).round() as usize + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l_total, E, A, IZ, "pinned", None, loads);

    // Add roller support at the span end
    let mut input = input;
    let sup_id = input.supports.len() + 1;
    input.supports.insert(sup_id.to_string(), SolverSupport {
        id: sup_id, node_id: roller_node,
        support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // For overhang with tip load:
    // δ_tip = Pa²(L+a)/(3EI) — this is an approximation; exact is more complex.
    // Actually: δ_tip = Pa²/(3EI) × (a + L) is not exact. The correct formula:
    // θ at roller = PaL/(6EI) (from main span M/EI diagram)
    // δ_free = θ × a + Pa³/(3EI) = PaL/(6EI)×a + Pa³/(3EI) = Pa²L/(6EI) + Pa³/(3EI)
    // = Pa²/(6EI) × (L + 2a)
    let delta_exact = p * overhang * overhang / (6.0 * e_eff * IZ) * (span + 2.0 * overhang);
    assert_close(tip.uy.abs(), delta_exact, 0.05,
        "Overhang: δ_tip = Pa²(L+2a)/(6EI)");
}

// ================================================================
// 8. Slope Symmetry Under Symmetric Loading
// ================================================================
//
// SS beam with symmetric UDL: end slopes are equal and opposite.

#[test]
fn validation_moment_area_slope_symmetry() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Slopes are equal magnitude, opposite sign
    assert_close(d1.rz.abs(), d_end.rz.abs(), 0.01,
        "Slope symmetry: |θ_left| = |θ_right|");
    // Opposite sign (left rotates clockwise, right counterclockwise or vice versa)
    assert!(d1.rz * d_end.rz < 0.0,
        "Slope symmetry: opposite signs: {:.6e} vs {:.6e}", d1.rz, d_end.rz);

    // Midspan slope = 0 (by symmetry)
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.rz.abs() < 1e-10,
        "Slope symmetry: θ_mid ≈ 0: {:.6e}", d_mid.rz);
}
