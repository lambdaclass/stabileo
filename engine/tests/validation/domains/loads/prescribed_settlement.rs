/// Validation: Prescribed Settlements and Support Movements
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 4 (Support Settlement)
///   - Kassimali, "Structural Analysis", Ch. 10
///   - Hibbeler, "Structural Analysis", Ch. 10
///
/// Support settlement (prescribed displacement) in indeterminate
/// structures induces internal forces without external loads.
/// These tests verify the solver's handling of prescribed displacements.
///
/// Tests verify:
///   1. Fixed-fixed beam: settlement at one end induces moments
///   2. Propped cantilever: settlement at roller
///   3. Two-span: differential settlement at interior support
///   4. Settlement-induced moments: M = 6EIδ/L²
///   5. Equal settlement: no induced forces (rigid body motion)
///   6. Rotation prescribed: fixed end rotation
///   7. Combined loading + settlement: superposition
///   8. Settlement magnitude effect: linearity
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam: Settlement at One End
// ================================================================
//
// Fixed-fixed beam with settlement δ at right end.
// M_A = -M_B = 6EIδ/L²
// V = 12EIδ/L³

#[test]
fn validation_settlement_fixed_fixed() {
    let l = 8.0;
    let n = 16;
    let delta = -0.01; // 10mm downward settlement
    let e_eff = E * 1000.0;

    // Build manually with prescribed displacement at right end
    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..=n {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * l / n as f64, z: 0.0 },
        );
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
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
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: Some(delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Settlement-induced moments: M = 6EIδ/L²
    let m_exact = 6.0 * e_eff * IZ * delta.abs() / (l * l);
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.my.abs(), m_exact, 0.05,
        "Settlement: |M_A| = 6EIδ/L²");
    assert_close(r2.my.abs(), m_exact, 0.05,
        "Settlement: |M_B| = 6EIδ/L²");

    // Settlement-induced shear: V = 12EIδ/L³
    let v_exact = 12.0 * e_eff * IZ * delta.abs() / (l * l * l);
    assert_close(r1.rz.abs(), v_exact, 0.05,
        "Settlement: |V| = 12EIδ/L³");
}

// ================================================================
// 2. Propped Cantilever: Settlement at Roller
// ================================================================
//
// Fixed at left, roller at right. Settlement δ at roller.
// R_roller = 3EIδ/L³

#[test]
fn validation_settlement_propped() {
    let l = 6.0;
    let n = 12;
    let delta = -0.005;
    let e_eff = E * 1000.0;

    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..=n {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * l / n as f64, z: 0.0 },
        );
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
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
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: Some(delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let r_roller = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().rz;
    let r_exact = 3.0 * e_eff * IZ * delta.abs() / (l * l * l);

    assert_close(r_roller.abs(), r_exact, 0.05,
        "Propped settlement: R = 3EIδ/L³");
}

// ================================================================
// 3. Two-Span: Differential Settlement at Interior Support
// ================================================================
//
// Two-span beam with settlement at interior support.
// The settlement induces moments and redistributes reactions.

#[test]
fn validation_settlement_two_span() {
    let span = 6.0;
    let n = 12;
    let delta = -0.01;

    // Build continuous beam with settlement at interior support
    let total_n = 2 * n;
    let total_nodes = total_n + 1;
    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..total_nodes {
        let x = if i <= n {
            i as f64 * span / n as f64
        } else {
            span + (i - n) as f64 * span / n as f64
        };
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x, z: 0.0 },
        );
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..total_n {
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
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: Some(delta), dry: None, angle: None,
    });
    sups.insert("3".to_string(), SolverSupport {
        id: 3, node_id: total_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: ΣRy = 0 (no external loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.01, "Settlement: ΣRy ≈ 0: {:.6}", sum_ry);

    // Interior support should have a reaction (settlement induces forces)
    let r_int = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().rz;
    assert!(r_int.abs() > 0.0, "Settlement: interior reaction exists");
}

// ================================================================
// 4. Settlement-Induced Moment Formula Verification
// ================================================================
//
// For a fixed-fixed beam with settlement δ at B:
// M_A = 6EIδ/L², M_B = -6EIδ/L² (equal and opposite)

#[test]
fn validation_settlement_moment_formula() {
    let e_eff = E * 1000.0;

    // Test with different L values
    for &l in &[4.0, 8.0, 12.0] {
        let n = 16;
        let delta = -0.005;

        let mut nodes_map = std::collections::HashMap::new();
        for i in 0..=n {
            nodes_map.insert(
                (i + 1).to_string(),
                SolverNode { id: i + 1, x: i as f64 * l / n as f64, z: 0.0 },
            );
        }
        let mut mats = std::collections::HashMap::new();
        mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
        let mut secs = std::collections::HashMap::new();
        secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
        let mut elems = std::collections::HashMap::new();
        for i in 0..n {
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
        let mut sups = std::collections::HashMap::new();
        sups.insert("1".to_string(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        });
        sups.insert("2".to_string(), SolverSupport {
            id: 2, node_id: n + 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: Some(delta), dry: None, angle: None,
        });

        let input = SolverInput {
            nodes: nodes_map, materials: mats, sections: secs,
            elements: elems, supports: sups, loads: vec![], constraints: vec![],
            connectors: std::collections::HashMap::new(), };
        let results = linear::solve_2d(&input).unwrap();

        let m_exact = 6.0 * e_eff * IZ * delta.abs() / (l * l);
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        assert_close(r1.my.abs(), m_exact, 0.05,
            &format!("M formula L={}: |M| = 6EIδ/L²", l));
    }
}

// ================================================================
// 5. Equal Settlement: No Induced Forces
// ================================================================
//
// If both supports settle equally, it's a rigid body translation.
// No internal forces should be induced.

#[test]
fn validation_settlement_equal() {
    let l = 8.0;
    let n = 16;
    let delta = -0.02;

    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..=n {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * l / n as f64, z: 0.0 },
        );
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
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
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: Some(delta), dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: Some(delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // All internal forces should be zero (rigid body motion)
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 1e-6, "Equal settlement: M=0 at elem {}", ef.element_id);
        assert!(ef.v_start.abs() < 1e-6, "Equal settlement: V=0 at elem {}", ef.element_id);
    }

    // All nodes should have the same settlement
    for d in &results.displacements {
        assert_close(d.uz, delta, 0.001,
            &format!("Equal settlement: all nodes at δ, node {}", d.node_id));
    }
}

// ================================================================
// 6. Prescribed Rotation: Fixed End
// ================================================================
//
// Fixed-fixed beam with prescribed rotation at right end.
// M_B = 4EIθ/L, M_A = 2EIθ/L (carry-over factor = 0.5)

#[test]
fn validation_settlement_rotation() {
    let l = 8.0;
    let n = 16;
    let theta = 0.001; // small rotation
    let e_eff = E * 1000.0;

    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..=n {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * l / n as f64, z: 0.0 },
        );
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
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
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: Some(theta), angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Near end (B): M = 4EIθ/L
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let m_near = 4.0 * e_eff * IZ * theta / l;
    assert_close(r2.my.abs(), m_near, 0.05,
        "Rotation: M_near = 4EIθ/L");

    // Far end (A): M = 2EIθ/L (carry-over factor = 0.5)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_far = 2.0 * e_eff * IZ * theta / l;
    assert_close(r1.my.abs(), m_far, 0.05,
        "Rotation: M_far = 2EIθ/L (COF=0.5)");
}

// ================================================================
// 7. Combined Loading + Settlement: Superposition
// ================================================================
//
// Response under load + settlement = response under load + response under settlement.

#[test]
fn validation_settlement_superposition() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let delta = -0.005;
    let mid = n / 2 + 1;

    // Helper to build fixed-fixed beam with optional settlement
    let build = |dy_right: Option<f64>, loads: Vec<SolverLoad>| {
        let mut nodes_map = std::collections::HashMap::new();
        for i in 0..=n {
            nodes_map.insert(
                (i + 1).to_string(),
                SolverNode { id: i + 1, x: i as f64 * l / n as f64, z: 0.0 },
            );
        }
        let mut mats = std::collections::HashMap::new();
        mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
        let mut secs = std::collections::HashMap::new();
        secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
        let mut elems = std::collections::HashMap::new();
        for i in 0..n {
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
        let mut sups = std::collections::HashMap::new();
        sups.insert("1".to_string(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        });
        sups.insert("2".to_string(), SolverSupport {
            id: 2, node_id: n + 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: dy_right, dry: None, angle: None,
        });
        SolverInput { nodes: nodes_map, materials: mats, sections: secs, elements: elems, supports: sups, loads, constraints: vec![],  connectors: std::collections::HashMap::new() }
    };

    let udl = |q_val: f64| -> Vec<SolverLoad> {
        (1..=n).map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_val, q_j: q_val, a: None, b: None,
        })).collect()
    };

    // Load only
    let d_load = linear::solve_2d(&build(None, udl(q))).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Settlement only
    let d_settle = linear::solve_2d(&build(Some(delta), vec![])).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Combined
    let d_combined = linear::solve_2d(&build(Some(delta), udl(q))).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    assert_close(d_combined, d_load + d_settle, 0.01,
        "Superposition: δ_combined = δ_load + δ_settle");
}

// ================================================================
// 8. Settlement Magnitude: Linear Response
// ================================================================
//
// Doubling the settlement doubles all responses.

#[test]
fn validation_settlement_linearity() {
    let l = 8.0;
    let n = 16;

    let build = |dz: f64| {
        let mut nodes_map = std::collections::HashMap::new();
        for i in 0..=n {
            nodes_map.insert(
                (i + 1).to_string(),
                SolverNode { id: i + 1, x: i as f64 * l / n as f64, z: 0.0 },
            );
        }
        let mut mats = std::collections::HashMap::new();
        mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
        let mut secs = std::collections::HashMap::new();
        secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
        let mut elems = std::collections::HashMap::new();
        for i in 0..n {
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
        let mut sups = std::collections::HashMap::new();
        sups.insert("1".to_string(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        });
        sups.insert("2".to_string(), SolverSupport {
            id: 2, node_id: n + 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: Some(dz), dry: None, angle: None,
        });
        SolverInput { nodes: nodes_map, materials: mats, sections: secs, elements: elems, supports: sups, loads: vec![], constraints: vec![],  connectors: std::collections::HashMap::new() }
    };

    let r1 = linear::solve_2d(&build(-0.005)).unwrap();
    let m1 = r1.reactions.iter().find(|r| r.node_id == 1).unwrap().my;

    let r2 = linear::solve_2d(&build(-0.010)).unwrap();
    let m2 = r2.reactions.iter().find(|r| r.node_id == 1).unwrap().my;

    assert_close(m2 / m1, 2.0, 0.01, "Settlement linearity: 2δ → 2M");
}
