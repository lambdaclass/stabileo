/// Validation: Classic Beam Deflection Benchmarks
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Beer & Johnston, "Mechanics of Materials", 8th Ed.
///
/// Tests verify exact deflection formulas for standard cases:
///   1. Fixed-fixed beam UDL: δ_max = qL⁴/(384EI)
///   2. Fixed-fixed beam center point: δ = PL³/(192EI)
///   3. Cantilever moment at tip: δ = ML²/(2EI), θ = ML/(EI)
///   4. SS beam with two symmetric point loads (4-point bending)
///   5. Propped cantilever UDL: δ_max = qL⁴/(185EI)
///   6. Fixed-free beam (cantilever) with UDL: δ = qL⁴/(8EI)
///   7. SS beam point at quarter span: δ at load point
///   8. Cantilever with linearly varying load (triangular)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam UDL: δ_max = qL⁴/(384EI)
// ================================================================
//
// Source: Timoshenko, Table of Beam Deflections.
// Both ends fully fixed. Midspan deflection is 5× smaller than SS case.

#[test]
fn validation_deflection_fixed_fixed_udl() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // δ_max = qL⁴/(384EI) for fixed-fixed beam
    let delta_exact = q.abs() * l.powi(4) / (384.0 * e_eff * IZ);

    let error = (mid_d.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "Fixed-fixed UDL: midspan={:.6e}, exact qL⁴/(384EI)={:.6e}, err={:.1}%",
        mid_d.uz.abs(), delta_exact, error * 100.0);
}

// ================================================================
// 2. Fixed-Fixed Beam Center Point Load: δ = PL³/(192EI)
// ================================================================

#[test]
fn validation_deflection_fixed_fixed_center_point() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // δ = PL³/(192EI)
    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);

    let error = (mid_d.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "Fixed-fixed center point: δ={:.6e}, exact PL³/(192EI)={:.6e}, err={:.1}%",
        mid_d.uz.abs(), delta_exact, error * 100.0);
}

// ================================================================
// 3. Cantilever with Moment at Tip: δ = ML²/(2EI), θ = ML/(EI)
// ================================================================

#[test]
fn validation_deflection_cantilever_tip_moment() {
    let l = 5.0;
    let n = 4;
    let m = 50.0; // kN·m applied moment at tip
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ_tip = ML²/(2EI)
    let delta_exact = m * l * l / (2.0 * e_eff * IZ);
    let err_d = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(err_d < 0.05,
        "Cantilever moment δ={:.6e}, exact ML²/(2EI)={:.6e}, err={:.1}%",
        tip.uz.abs(), delta_exact, err_d * 100.0);

    // θ_tip = ML/(EI)
    let theta_exact = m * l / (e_eff * IZ);
    let err_t = (tip.ry.abs() - theta_exact).abs() / theta_exact;
    assert!(err_t < 0.05,
        "Cantilever moment θ={:.6e}, exact ML/(EI)={:.6e}, err={:.1}%",
        tip.ry.abs(), theta_exact, err_t * 100.0);
}

// ================================================================
// 4. SS Beam with Two Symmetric Loads (4-Point Bending)
// ================================================================
//
// Loads at L/3 and 2L/3. Midspan δ = 23PL³/(648EI).
// Between loads: pure bending region (constant moment = P·L/3).

#[test]
fn validation_deflection_four_point_bending() {
    let l = 9.0;
    let n = 9; // so nodes at L/3 (node 4) and 2L/3 (node 7) and midspan (node 5.5 → approximate at 5)
    let p = 15.0;
    let e_eff = E * 1000.0;

    let load_node_1 = n / 3 + 1; // L/3
    let load_node_2 = 2 * n / 3 + 1; // 2L/3

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: load_node_1, fx: 0.0, fz: -p, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: load_node_2, fx: 0.0, fz: -p, my: 0.0,
            }),
        ]);

    let results = linear::solve_2d(&input).unwrap();
    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // δ_midspan = 23PL³/(648EI) for two symmetric third-point loads
    let delta_exact = 23.0 * p * l.powi(3) / (648.0 * e_eff * IZ);

    let error = (mid_d.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "4-point bending: midspan δ={:.6e}, exact 23PL³/(648EI)={:.6e}, err={:.1}%",
        mid_d.uz.abs(), delta_exact, error * 100.0);
}

// ================================================================
// 5. Propped Cantilever UDL: δ_max = qL⁴/(185EI)
// ================================================================
//
// Fixed at A, roller at B, UDL q. Max deflection at x = 0.4215L.
// δ_max ≈ qL⁴/(185EI) (approximate, exact coefficient is 1/185.2).

#[test]
fn validation_deflection_propped_cantilever_udl() {
    let l = 8.0;
    let n = 16;
    let q = -10.0;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find maximum deflection among all nodes
    let max_defl = results.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // δ_max = qL⁴/(185.2 EI)
    let delta_exact = q.abs() * l.powi(4) / (185.2 * e_eff * IZ);

    let error = (max_defl - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "Propped cantilever UDL: δ_max={:.6e}, exact qL⁴/(185EI)={:.6e}, err={:.1}%",
        max_defl, delta_exact, error * 100.0);
}

// ================================================================
// 6. Cantilever UDL: δ_tip = qL⁴/(8EI)
// ================================================================

#[test]
fn validation_deflection_cantilever_udl() {
    let l = 5.0;
    let n = 8;
    let q = -10.0;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ_tip = qL⁴/(8EI)
    let delta_exact = q.abs() * l.powi(4) / (8.0 * e_eff * IZ);

    let error = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "Cantilever UDL: tip={:.6e}, exact qL⁴/(8EI)={:.6e}, err={:.1}%",
        tip.uz.abs(), delta_exact, error * 100.0);
}

// ================================================================
// 7. SS Beam Quarter-Point Load: δ at load point
// ================================================================
//
// SS beam with point load at L/4. Deflection under load:
// δ = 3PL³/(256EI)   (from Roark's, load at distance a=L/4)

#[test]
fn validation_deflection_ss_quarter_point() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let load_node = n / 4 + 1; // L/4

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let load_d = results.displacements.iter().find(|d| d.node_id == load_node).unwrap();

    // For load at a = L/4, b = 3L/4:
    // δ_under_load = P·a²·b²/(3·EI·L) = P·(L/4)²·(3L/4)²/(3·EI·L)
    //              = P·L⁴/16·9L²/16/(3·EI·L) = 9PL³/768/(EI) = 3PL³/(256EI)
    let a = l / 4.0;
    let b = 3.0 * l / 4.0;
    let delta_exact = p * a * a * b * b / (3.0 * e_eff * IZ * l);

    let error = (load_d.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "SS quarter-point: δ={:.6e}, exact Pa²b²/(3EIL)={:.6e}, err={:.1}%",
        load_d.uz.abs(), delta_exact, error * 100.0);
}

// ================================================================
// 8. Cantilever Triangular Load: δ_tip = qL⁴/(30EI)
// ================================================================
//
// Load linearly varying from q_max at fixed end to 0 at free end.
// Source: Roark's, Table 3, Case 3d.

#[test]
fn validation_deflection_cantilever_triangular() {
    let l = 6.0;
    let n = 12;
    let q_max = -10.0;
    let e_eff = E * 1000.0;
    // Triangular load: q = q_max at fixed end (x=0), linearly decreasing to 0 at tip
    let mut loads = Vec::new();
    for i in 0..n {
        let xi = i as f64 / n as f64;
        let xj = (i + 1) as f64 / n as f64;
        let qi = q_max * (1.0 - xi); // max at fixed end
        let qj = q_max * (1.0 - xj); // decreases toward tip
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ_tip = q_max·L⁴/(30EI) for load decreasing from max at fixed end to zero at free end
    let delta_exact = q_max.abs() * l.powi(4) / (30.0 * e_eff * IZ);

    let error = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "Cantilever triangular: tip={:.6e}, exact qL⁴/(30EI)={:.6e}, err={:.1}%",
        tip.uz.abs(), delta_exact, error * 100.0);
}
