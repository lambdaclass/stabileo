/// Validation: Differential Settlement and Support Movement Effects
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 5
///   - Hibbeler, "Structural Analysis", Ch. 10
///   - Norris & Wilbur, "Elementary Structural Analysis", Ch. 8
///
/// Tests verify structural response to prescribed support displacements:
///   1. Fixed-fixed beam: settlement at one end
///   2. Propped cantilever: settlement at roller
///   3. Continuous beam: interior support settlement
///   4. Settlement-only: no external loads, only reactions
///   5. Equal settlement: no internal forces (rigid body)
///   6. Relative settlement: forces proportional to δ
///   7. Settlement + load combination
///   8. Rotation at support
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam: Settlement at Right End
// ================================================================
//
// M = 6EIδ/L², R = 12EIδ/L³ for one end settling by δ

#[test]
fn validation_settlement_fixed_fixed() {
    let l = 6.0;
    let n = 6;
    let delta = 0.01; // 10mm settlement
    let e_eff = E * 1000.0;

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

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // M = 6EIδ/L²
    let m_exact = 6.0 * e_eff * IZ * delta / (l * l);
    assert_close(r1.mz.abs(), m_exact, 0.05,
        "Settlement FF: M = 6EIδ/L²");

    // R = 12EIδ/L³
    let r_exact = 12.0 * e_eff * IZ * delta / (l * l * l);
    assert_close(r1.ry.abs(), r_exact, 0.05,
        "Settlement FF: R = 12EIδ/L³");
}

// ================================================================
// 2. Propped Cantilever: Settlement at Roller
// ================================================================
//
// Fixed at left, roller at right with settlement δ.
// R_B = 3EIδ/L³

#[test]
fn validation_settlement_propped() {
    let l = 8.0;
    let n = 8;
    let delta = 0.005;
    let e_eff = E * 1000.0;

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
        support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = 3EIδ/L³ for propped cantilever settlement
    let r_exact = 3.0 * e_eff * IZ * delta / (l * l * l);
    assert_close(r_end.ry.abs(), r_exact, 0.05,
        "Settlement propped: R_B = 3EIδ/L³");
}

// ================================================================
// 3. Continuous Beam: Interior Settlement
// ================================================================

#[test]
fn validation_settlement_continuous() {
    let span = 6.0;
    let n = 12;
    let delta = 0.01;

    // 2-span beam with settlement at interior support
    let total_n = 2 * n;
    let mut nodes = std::collections::HashMap::new();
    for i in 0..=total_n {
        nodes.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * span / n as f64, y: 0.0,
        });
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..total_n {
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1,
        support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1,
        support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });
    sups.insert("3".to_string(), SolverSupport {
        id: 3, node_id: total_n + 1,
        support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    // Settlement produces reactions (equilibrium maintained)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.1,
        "Settlement continuous: ΣRy ≈ 0: {:.6e}", sum_ry);
}

// ================================================================
// 4. Settlement Only: No External Loads
// ================================================================

#[test]
fn validation_settlement_no_external_loads() {
    let l = 6.0;
    let n = 6;
    let delta = 0.01;

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

    // Internal forces should be non-zero (settlement induces stresses)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef1.m_start.abs() > 0.0,
        "Settlement only: non-zero moments");

    // Right end should have prescribed displacement
    let d_end = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_end.uy, -delta, 0.02,
        "Settlement only: prescribed displacement achieved");
}

// ================================================================
// 5. Equal Settlement: No Internal Forces (Rigid Body)
// ================================================================

#[test]
fn validation_settlement_equal() {
    let l = 6.0;
    let n = 6;
    let delta = 0.01;

    // SS beam with equal settlement at both ends → rigid body motion → no moments
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
        support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1,
        support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    // Equal settlement → no bending → moments should be zero
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 0.01,
            "Equal settlement: M ≈ 0 in elem {}: {:.6e}", ef.element_id, ef.m_start);
        assert!(ef.v_start.abs() < 0.01,
            "Equal settlement: V ≈ 0 in elem {}: {:.6e}", ef.element_id, ef.v_start);
    }
}

// ================================================================
// 6. Relative Settlement: Forces Proportional to δ
// ================================================================

#[test]
fn validation_settlement_proportional() {
    let l = 6.0;
    let n = 6;
    let delta1 = 0.005;
    let delta2 = 0.010;
    // Fixed-fixed beam: double the settlement → double the forces
    let make_ff_settlement = |delta: f64| -> f64 {
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
        linear::solve_2d(&input).unwrap()
            .reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs()
    };

    let m1 = make_ff_settlement(delta1);
    let m2 = make_ff_settlement(delta2);

    // Linear: M ∝ δ → M2/M1 = δ2/δ1 = 2.0
    assert_close(m2 / m1, delta2 / delta1, 0.02,
        "Settlement proportional: M ∝ δ");
}

// ================================================================
// 7. Settlement + Load Combination
// ================================================================

#[test]
fn validation_settlement_plus_load() {
    let l = 6.0;
    let n = 6;
    let p = 10.0;
    let delta = 0.005;

    // Fixed-fixed beam with UDL + settlement at right end
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

    let loads: Vec<SolverLoad> = (1..=n as usize)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -p as f64, q_j: -p as f64, a: None, b: None,
        }))
        .collect();

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    // Reactions should balance applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p * l, 0.02,
        "Settlement+load: ΣRy = qL");
}

// ================================================================
// 8. Rotation at Support
// ================================================================

#[test]
fn validation_settlement_rotation() {
    let l = 6.0;
    let n = 6;
    let theta = 0.01; // prescribed rotation (radians)
    let e_eff = E * 1000.0;

    // Fixed-fixed beam with prescribed rotation at right end
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
        dx: None, dy: None, drz: Some(theta), angle: None,
    });

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    // Prescribed rotation should produce moments
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.mz.abs() > 0.0,
        "Settlement rotation: non-zero moment at left: {:.6e}", r1.mz);

    // Right end should have the prescribed rotation
    let d_end = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_end.rz, theta, 0.02,
        "Settlement rotation: prescribed θ achieved");

    // For fixed-fixed beam with end rotation θ:
    // M_near = 4EIθ/L, M_far = 2EIθ/L
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let m_near = 4.0 * e_eff * IZ * theta / l;
    assert_close(r_end.mz.abs(), m_near, 0.05,
        "Settlement rotation: M_near = 4EIθ/L");
}
