/// Validation: Deflection Formulas and Serviceability
///
/// References:
///   - AISC Steel Construction Manual, Table 3-23 (Beam diagrams)
///   - Eurocode 3 (EN 1993), Section 7.2 (Serviceability limit states)
///   - Roark's "Formulas for Stress and Strain", Ch. 8
///
/// Tests verify standard deflection formulas:
///   1. SS beam + UDL: δ = 5qL⁴/(384EI)
///   2. SS beam + center load: δ = PL³/(48EI)
///   3. Cantilever + UDL: δ = qL⁴/(8EI)
///   4. Cantilever + tip load: δ = PL³/(3EI)
///   5. Fixed-fixed + UDL: δ = qL⁴/(384EI)
///   6. Fixed-fixed + center load: δ = PL³/(192EI)
///   7. Propped cantilever + UDL: max deflection
///   8. Deflection ratios: fixed < propped < SS < cantilever
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam + UDL: δ = 5qL⁴/(384EI)
// ================================================================

#[test]
fn validation_deflection_ss_udl() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    let delta_exact = 5.0 * q.abs() * l * l * l * l / (384.0 * e_eff * IZ);
    assert_close(d_mid, delta_exact, 0.02, "SS+UDL: δ = 5qL⁴/(384EI)");
}

// ================================================================
// 2. SS Beam + Center Load: δ = PL³/(48EI)
// ================================================================

#[test]
fn validation_deflection_ss_center() {
    let l = 6.0;
    let n = 6;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    let delta_exact = p * l * l * l / (48.0 * e_eff * IZ);
    assert_close(d_mid, delta_exact, 0.02, "SS+P: δ = PL³/(48EI)");
}

// ================================================================
// 3. Cantilever + UDL: δ = qL⁴/(8EI)
// ================================================================

#[test]
fn validation_deflection_cantilever_udl() {
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

    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    let delta_exact = q.abs() * l * l * l * l / (8.0 * e_eff * IZ);
    assert_close(d_tip, delta_exact, 0.02, "Cantilever+UDL: δ = qL⁴/(8EI)");
}

// ================================================================
// 4. Cantilever + Tip Load: δ = PL³/(3EI)
// ================================================================

#[test]
fn validation_deflection_cantilever_tip() {
    let l = 5.0;
    let n = 5;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    let delta_exact = p * l * l * l / (3.0 * e_eff * IZ);
    assert_close(d_tip, delta_exact, 0.02, "Cantilever+P: δ = PL³/(3EI)");
}

// ================================================================
// 5. Fixed-Fixed + UDL: δ = qL⁴/(384EI)
// ================================================================

#[test]
fn validation_deflection_fixed_udl() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    let delta_exact = q.abs() * l * l * l * l / (384.0 * e_eff * IZ);
    assert_close(d_mid, delta_exact, 0.02, "Fixed+UDL: δ = qL⁴/(384EI)");
}

// ================================================================
// 6. Fixed-Fixed + Center Load: δ = PL³/(192EI)
// ================================================================

#[test]
fn validation_deflection_fixed_center() {
    let l = 6.0;
    let n = 6;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    let delta_exact = p * l * l * l / (192.0 * e_eff * IZ);
    assert_close(d_mid, delta_exact, 0.02, "Fixed+P: δ = PL³/(192EI)");
}

// ================================================================
// 7. Propped Cantilever + UDL
// ================================================================
//
// Max deflection for propped cantilever (fixed-rollerX) with UDL.
// δ_max ≈ qL⁴/(185EI) at x ≈ 0.4215L

#[test]
fn validation_deflection_propped_udl() {
    let l = 8.0;
    let n = 20; // fine mesh for accuracy
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find maximum deflection
    let d_max = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // δ_max ≈ qL⁴/(185EI) (exact value is qL⁴/185.17EI)
    let delta_approx = q.abs() * l * l * l * l / (185.0 * e_eff * IZ);
    assert_close(d_max, delta_approx, 0.05,
        "Propped+UDL: δ_max ≈ qL⁴/(185EI)");
}

// ================================================================
// 8. Deflection Ranking: Fixed < Propped < SS < Cantilever
// ================================================================
//
// Same load, same beam: deflection ranking by support conditions.

#[test]
fn validation_deflection_ranking() {
    let l = 6.0;
    let n = 6;
    let q: f64 = -10.0;

    let get_max_defl = |start: &str, end: Option<&str>| -> f64 {
        let loads: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_beam(n, l, E, A, IZ, start, end, loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter()
            .map(|d| d.uy.abs())
            .fold(0.0_f64, f64::max)
    };

    let d_fixed = get_max_defl("fixed", Some("fixed"));
    let d_propped = get_max_defl("fixed", Some("rollerX"));
    let d_ss = get_max_defl("pinned", Some("rollerX"));
    let d_cantilever = get_max_defl("fixed", None);

    assert!(d_fixed < d_propped,
        "Fixed < Propped: {:.6e} < {:.6e}", d_fixed, d_propped);
    assert!(d_propped < d_ss,
        "Propped < SS: {:.6e} < {:.6e}", d_propped, d_ss);
    assert!(d_ss < d_cantilever,
        "SS < Cantilever: {:.6e} < {:.6e}", d_ss, d_cantilever);
}
