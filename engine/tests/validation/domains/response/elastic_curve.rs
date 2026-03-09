/// Validation: Elastic Curve Properties and Deflection Shapes
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", Ch. 9
///   - Hibbeler, "Mechanics of Materials", Ch. 12
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9
///
/// The elastic curve y(x) is governed by EI*y'' = M(x).
/// These tests verify specific properties of the deflected shape:
/// curvature, slope, deflection, and their relationships.
///
/// Tests verify:
///   1. SS beam UDL: max deflection at midspan (5wL⁴/384EI)
///   2. SS beam point load: δ_max at L/2 (PL³/48EI)
///   3. Cantilever slope: θ_tip = PL²/(2EI)
///   4. Cantilever UDL: slope and deflection relationship
///   5. Deflection shape symmetry: symmetric structure and load
///   6. Beam with overhang: deflection changes sign
///   7. Relative stiffness: stiffer section → less deflection
///   8. Concentrated couple: antisymmetric deflection
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: Max Deflection at Midspan
// ================================================================

#[test]
fn validation_elastic_curve_ss_udl() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -8.0;
    let e_eff = E * 1000.0;
    let mid = n / 2 + 1;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid, d_exact, 0.02, "SS UDL: δ = 5wL⁴/(384EI)");

    // Midspan deflection is the maximum (check it's larger than quarter-point)
    let d_quarter = results.displacements.iter()
        .find(|d| d.node_id == n / 4 + 1).unwrap().uy.abs();
    assert!(d_mid > d_quarter, "SS UDL: midspan > quarter-point");
}

// ================================================================
// 2. SS Beam Point Load: δ_max at Midspan
// ================================================================

#[test]
fn validation_elastic_curve_ss_point() {
    let l = 8.0;
    let n = 16;
    let p = 12.0;
    let e_eff = E * 1000.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_exact = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_mid, d_exact, 0.02, "SS point: δ = PL³/(48EI)");
}

// ================================================================
// 3. Cantilever Slope: θ_tip = PL²/(2EI)
// ================================================================

#[test]
fn validation_elastic_curve_cantilever_slope() {
    let l = 4.0;
    let n = 16;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let theta_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().rz.abs();
    let theta_exact = p * l * l / (2.0 * e_eff * IZ);
    assert_close(theta_tip, theta_exact, 0.02, "Cantilever: θ = PL²/(2EI)");
}

// ================================================================
// 4. Cantilever UDL: Slope-Deflection Consistency
// ================================================================
//
// For cantilever with UDL:
//   δ_tip = qL⁴/(8EI)
//   θ_tip = qL³/(6EI)
//   Ratio: δ/θ = 3L/4

#[test]
fn validation_elastic_curve_cantilever_udl() {
    let l = 5.0;
    let n = 20;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let delta_tip = tip.uy.abs();
    let theta_tip = tip.rz.abs();

    let delta_exact = q.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    let theta_exact = q.abs() * l.powi(3) / (6.0 * e_eff * IZ);

    assert_close(delta_tip, delta_exact, 0.02, "Cantilever UDL: δ = qL⁴/(8EI)");
    assert_close(theta_tip, theta_exact, 0.02, "Cantilever UDL: θ = qL³/(6EI)");

    // Ratio check
    assert_close(delta_tip / theta_tip, 3.0 * l / 4.0, 0.02,
        "Cantilever UDL: δ/θ = 3L/4");
}

// ================================================================
// 5. Deflection Shape Symmetry
// ================================================================
//
// Symmetric structure + symmetric load → symmetric deflection.

#[test]
fn validation_elastic_curve_symmetry() {
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

    // Deflection at x and L-x should be equal
    for k in 1..n {
        let d_left = results.displacements.iter()
            .find(|d| d.node_id == k + 1).unwrap().uy;
        let d_right = results.displacements.iter()
            .find(|d| d.node_id == n + 1 - k).unwrap().uy;
        assert!((d_left - d_right).abs() < 1e-10,
            "Symmetry: δ({}) = δ({}): {:.6e} vs {:.6e}",
            k, n - k, d_left, d_right);
    }
}

// ================================================================
// 6. Beam with Overhang: Deflection Sign Change
// ================================================================
//
// SS beam with overhang: support at 0 and L, overhang from L to L+a.
// Under load on overhang, the main span deflects upward while
// overhang deflects downward.

#[test]
fn validation_elastic_curve_overhang() {
    let l_main = 8.0;
    let l_over = 3.0;
    let l_total = l_main + l_over;
    let n_main = 16;
    let n_over = 6;
    let n_total = n_main + n_over;
    let p = 10.0;

    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..=n_total {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * l_total / n_total as f64, y: 0.0 },
        );
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n_total {
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
    // Support at node 1 (pinned) and at node closest to L_main (roller)
    // Support at x = L_main. Node = L_main/(L_total/n_total) + 1
    let support_idx = ((l_main / l_total) * n_total as f64).round() as usize + 1;
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: support_idx, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    // Load at tip of overhang
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_total + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    // Overhang tip deflects downward
    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n_total + 1).unwrap().uy;
    assert!(d_tip < 0.0, "Overhang: tip deflects down: {:.6e}", d_tip);

    // Main span midpoint deflects upward (positive)
    let mid_main = n_main / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid_main).unwrap().uy;
    assert!(d_mid > 0.0, "Overhang: main span deflects up: {:.6e}", d_mid);
}

// ================================================================
// 7. Relative Stiffness: Stiffer Section Less Deflection
// ================================================================

#[test]
fn validation_elastic_curve_stiffness() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let mid = n / 2 + 1;

    // Standard IZ
    let loads1: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // 3x IZ
    let loads2: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input2 = make_beam(n, l, E, A, 3.0 * IZ, "pinned", Some("rollerX"), loads2);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // δ ∝ 1/I → d1/d2 = 3
    assert_close(d1 / d2, 3.0, 0.02, "Stiffness: δ ∝ 1/I");
}

// ================================================================
// 8. Concentrated Couple: Antisymmetric Response
// ================================================================
//
// SS beam with moment M₀ at midspan.
// The deflection shape is antisymmetric about midspan.

#[test]
fn validation_elastic_curve_couple() {
    let l = 10.0;
    let n = 20;
    let m0 = 10.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: 0.0, mz: m0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Antisymmetric: δ(x) = -δ(L-x)
    for k in 1..n / 2 {
        let d_left = results.displacements.iter()
            .find(|d| d.node_id == k + 1).unwrap().uy;
        let d_right = results.displacements.iter()
            .find(|d| d.node_id == n + 1 - k).unwrap().uy;
        assert!((d_left + d_right).abs() < 1e-10,
            "Couple antisymmetry: δ({}) + δ({}) ≈ 0: {:.6e}",
            k, n - k, d_left + d_right);
    }

    // Midspan deflection should be zero (antisymmetric)
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy;
    assert!(d_mid.abs() < 1e-10,
        "Couple: δ_mid ≈ 0: {:.6e}", d_mid);
}
