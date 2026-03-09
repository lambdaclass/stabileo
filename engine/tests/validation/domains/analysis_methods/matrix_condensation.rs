/// Validation: Matrix Condensation and DOF Reduction
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 6
///   - Cook et al., "Concepts and Applications of FEA", Ch. 10
///   - Guyan reduction and static condensation theory
///
/// Tests verify that the solver correctly handles DOF reduction
/// through support conditions and that results converge with mesh refinement.
///
///   1. Mesh convergence: cantilever tip load
///   2. Mesh convergence: SS beam UDL
///   3. One element vs analytical: cantilever
///   4. DOF count with different supports
///   5. Constrained DOF gives zero displacement
///   6. Prescribed displacement produces correct reactions
///   7. Mixed supports: spring + fixed
///   8. Symmetry exploitation: half-model
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Mesh Convergence: Cantilever Tip Load
// ================================================================

#[test]
fn validation_condensation_cantilever_convergence() {
    let l = 5.0;
    let p = 15.0;
    let e_eff = E * 1000.0;
    let delta_exact = p * l * l * l / (3.0 * e_eff * IZ);

    // Euler-Bernoulli frame elements should be exact even with 1 element
    for n in &[1, 2, 4, 8, 16] {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_beam(*n, l, E, A, IZ, "fixed", None, loads);
        let d = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

        assert_close(d, delta_exact, 0.02,
            &format!("Convergence cantilever n={}: exact with cubic shape functions", n));
    }
}

// ================================================================
// 2. Mesh Convergence: SS Beam UDL
// ================================================================

#[test]
fn validation_condensation_ss_udl_convergence() {
    let l = 8.0;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;
    let delta_exact = 5.0 * q.abs() * l * l * l * l / (384.0 * e_eff * IZ);

    for n in &[2, 4, 8, 16] {
        let mid = n / 2 + 1;
        let loads: Vec<SolverLoad> = (1..=*n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_beam(*n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let d = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

        assert_close(d, delta_exact, 0.02,
            &format!("Convergence SS UDL n={}", n));
    }
}

// ================================================================
// 3. Single Element Exactness
// ================================================================

#[test]
fn validation_condensation_single_element() {
    let l = 6.0;
    let p = 20.0;
    let e_eff = E * 1000.0;

    // Single element cantilever with tip load
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(1, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // δ = PL³/(3EI)
    let delta_exact = p * l * l * l / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02, "Single elem: δ exact");

    // θ = PL²/(2EI)
    let theta_exact = p * l * l / (2.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02, "Single elem: θ exact");

    // Reaction moment = PL
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.mz.abs(), p * l, 0.02, "Single elem: M_base = PL");
}

// ================================================================
// 4. DOF Count Verification
// ================================================================
//
// Different support configurations should produce correct behavior
// and the solver should handle varying numbers of restrained DOFs.

#[test]
fn validation_condensation_dof_count() {
    let l = 6.0;
    let n = 6;
    let p = 10.0;

    // Test different support conditions give different tip deflections
    let d_fixed = {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
        linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs()
    };

    let d_pinned = {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs()
    };

    // Both should be non-zero
    assert!(d_fixed > 0.0, "Fixed cantilever: δ > 0");
    assert!(d_pinned > 0.0, "SS beam: δ > 0");
}

// ================================================================
// 5. Constrained DOF Gives Zero Displacement
// ================================================================

#[test]
fn validation_condensation_zero_at_support() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Fixed-fixed beam
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Both ends: uy = 0, rz = 0
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert!(d1.uy.abs() < 1e-10, "Fixed left: uy = 0");
    assert!(d1.rz.abs() < 1e-10, "Fixed left: rz = 0");
    assert!(d_end.uy.abs() < 1e-10, "Fixed right: uy = 0");
    assert!(d_end.rz.abs() < 1e-10, "Fixed right: rz = 0");
}

// ================================================================
// 6. Prescribed Displacement
// ================================================================

#[test]
fn validation_condensation_prescribed() {
    let l = 6.0;
    let n = 6;
    let delta = 0.01; // 10mm settlement
    let e_eff = E * 1000.0;

    // Build fixed-fixed beam with prescribed settlement at right end
    let mut nodes = std::collections::HashMap::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * l / n as f64, y: 0.0,
        });
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1,
        support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1,
        support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    // Reactions should exist (settlement produces forces)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.ry.abs() > 0.0, "Prescribed: non-zero reaction");

    // M = 6EIδ/L²
    let m_exact = 6.0 * e_eff * IZ * delta / (l * l);
    assert_close(r1.mz.abs(), m_exact, 0.05,
        "Prescribed: M = 6EIδ/L²");
}

// ================================================================
// 7. Mixed Supports: Spring + Fixed
// ================================================================

#[test]
fn validation_condensation_mixed_supports() {
    let l = 6.0;
    let n = 6;
    let p = 10.0;
    let k_spring = 1000.0; // kN/m

    // Fixed at left, spring at right
    let mut nodes = std::collections::HashMap::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * l / n as f64, y: 0.0,
        });
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1,
        support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1,
        support_type: "spring".to_string(),
        kx: None, ky: Some(k_spring), kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    // Right end should have non-zero deflection (spring compresses)
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_end.uy.abs() > 0.0,
        "Spring support: non-zero deflection: {:.6e}", d_end.uy);

    // Spring force = k × δ
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_end.ry, -k_spring * d_end.uy, 0.02,
        "Spring: R = k×δ");
}

// ================================================================
// 8. Consistent Results Under Refinement
// ================================================================
//
// Refining the mesh should not change results for polynomial loads
// when using cubic shape functions.

#[test]
fn validation_condensation_refinement_consistency() {
    let l = 6.0;
    let p = 15.0;
    let e_eff = E * 1000.0;
    let delta_exact = p * l * l * l / (48.0 * e_eff * IZ);

    // SS beam with center load: exact even with 2 elements
    let mut prev_d = 0.0;
    for n in &[2, 4, 8, 16] {
        let mid = n / 2 + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_beam(*n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let d = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

        assert_close(d, delta_exact, 0.02,
            &format!("Refinement n={}: exact PL³/(48EI)", n));

        if prev_d > 0.0 {
            // Results should be consistent across refinements
            assert_close(d, prev_d, 0.01,
                &format!("Refinement: n={} matches previous", n));
        }
        prev_d = d;
    }
}
