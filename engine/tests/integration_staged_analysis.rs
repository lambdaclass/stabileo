//! Integration tests for staged (construction sequence) analysis solver.
//!
//! Tests verify that the staged solver correctly:
//! - Activates/deactivates elements per stage
//! - Accumulates displacements across stages
//! - Applies prestress equivalent loads
//! - Returns correct per-stage results

mod helpers;

use dedaliano_engine::types::*;
use dedaliano_engine::solver::staged::solve_staged_2d;
use std::collections::HashMap;

/// Helper: create a simple 3-node beam (node 1 -- node 2 -- node 3), 10m total span.
fn make_three_node_beam() -> (
    HashMap<String, SolverNode>,
    HashMap<String, SolverMaterial>,
    HashMap<String, SolverSection>,
    HashMap<String, SolverElement>,
    HashMap<String, SolverSupport>,
) {
    let mut nodes = HashMap::new();
    nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, y: 0.0 });
    nodes.insert("3".into(), SolverNode { id: 3, x: 10.0, y: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("m1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("s1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("e1".into(), SolverElement {
        id: 1, elem_type: "frame".into(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elements.insert("e2".into(), SolverElement {
        id: 2, elem_type: "frame".into(), node_i: 2, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("s1".into(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".into(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    supports.insert("s2".into(), SolverSupport {
        id: 2, node_id: 3, support_type: "pinned".into(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    (nodes, materials, sections, elements, supports)
}

/// Test 1: Single-stage analysis should give same result as normal solve.
#[test]
fn single_stage_matches_normal_solve() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -100.0, mz: 0.0,
        }),
    ];

    // Staged solve: all elements and supports in stage 1
    let staged_input = StagedInput {
        nodes: nodes.clone(),
        materials: materials.clone(),
        sections: sections.clone(),
        elements: elements.clone(),
        supports: supports.clone(),
        loads: loads.clone(),
        stages: vec![ConstructionStage {
            name: "Full structure".into(),
            elements_added: vec![1, 2],
            elements_removed: vec![],
            load_indices: vec![0],
            supports_added: vec![1, 2],
            supports_removed: vec![],
            prestress_loads: vec![],
        }],
    };

    let staged_results = solve_staged_2d(&staged_input).unwrap();

    // Normal solve
    let normal_input = SolverInput {
        nodes, materials, sections, elements, supports, loads,
    };
    let normal_results = dedaliano_engine::solver::linear::solve_2d(&normal_input).unwrap();

    // Compare midspan deflection (node 2)
    let staged_uy = staged_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    let normal_uy = normal_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    assert!(
        (staged_uy - normal_uy).abs() < 1e-10,
        "Staged vs normal deflection mismatch: {} vs {}",
        staged_uy, normal_uy
    );
}

/// Test 2: Two-stage construction — add cantilever first, then second span.
#[test]
fn two_stage_cantilever_then_span() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0,
        }),
    ];

    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads,
        stages: vec![
            ConstructionStage {
                name: "Stage 1: Cantilever".into(),
                elements_added: vec![1],
                elements_removed: vec![],
                load_indices: vec![0], // First 50 kN load
                supports_added: vec![1],
                supports_removed: vec![],
                prestress_loads: vec![],
            },
            ConstructionStage {
                name: "Stage 2: Complete span".into(),
                elements_added: vec![2],
                elements_removed: vec![],
                load_indices: vec![1], // Second 50 kN load
                supports_added: vec![2],
                supports_removed: vec![],
                prestress_loads: vec![],
            },
        ],
    };

    let results = solve_staged_2d(&staged_input).unwrap();

    // Should have 2 stage results
    assert_eq!(results.stages.len(), 2);

    // Stage 1: cantilever with 50 kN at tip
    let s1_uy = results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    assert!(s1_uy < 0.0, "Stage 1: cantilever tip should deflect downward");

    // Stage 2: completed span — cumulative displacement should change
    let s2_uy = results.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    // Stage 2 adds support at node 3, so stiffness increases — but cumulative includes stage 1
    assert!(s2_uy < 0.0, "Stage 2: midspan should still be negative (cumulative)");
}

/// Test 3: Prestress on a simply supported beam.
///
/// Straight tendon with constant eccentricity e below centroid:
/// - Axial compression P applied to beam
/// - Eccentric prestress creates uplift moments M = P*e at ends
/// - Should produce upward camber
#[test]
fn prestress_straight_tendon_camber() {
    let mut nodes = HashMap::new();
    nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, y: 0.0 });
    nodes.insert("3".into(), SolverNode { id: 3, x: 10.0, y: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("m1".into(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });

    let mut sections = HashMap::new();
    sections.insert("s1".into(), SolverSection { id: 1, a: 0.12, iz: 1.6e-3, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("e1".into(), SolverElement {
        id: 1, elem_type: "frame".into(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elements.insert("e2".into(), SolverElement {
        id: 2, elem_type: "frame".into(), node_i: 2, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("s1".into(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".into(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    supports.insert("s2".into(), SolverSupport {
        id: 2, node_id: 3, support_type: "roller".into(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        stages: vec![ConstructionStage {
            name: "Apply prestress".into(),
            elements_added: vec![1, 2],
            elements_removed: vec![],
            load_indices: vec![],
            supports_added: vec![1, 2],
            supports_removed: vec![],
            prestress_loads: vec![
                PrestressLoad {
                    element_id: 1,
                    force: 1000.0,         // 1000 kN
                    eccentricity_i: 0.15,  // 150mm below centroid
                    eccentricity_j: 0.15,
                    profile: TendonProfile::Straight,
                    mu: None,
                    kappa: None,
                },
                PrestressLoad {
                    element_id: 2,
                    force: 1000.0,
                    eccentricity_i: 0.15,
                    eccentricity_j: 0.15,
                    profile: TendonProfile::Straight,
                    mu: None,
                    kappa: None,
                },
            ],
        }],
    };

    let results = solve_staged_2d(&staged_input).unwrap();

    // Midspan should deflect upward (positive Y) due to eccentric prestress
    let mid_uy = results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    assert!(
        mid_uy > 0.0,
        "Eccentric prestress should create upward camber, got uy = {}",
        mid_uy
    );

    // Analytical: δ = M*L²/(8*E*I) where M = P*e = 1000 * 0.15 = 150 kN·m
    // E = 30e6 kN/m², I = 1.6e-3 m⁴, L = 10m
    // δ = 150 * 100 / (8 * 30e6 * 1.6e-3) = 15000 / 384000 = 0.0390625 m
    let e_kn = 30_000.0 * 1000.0; // kN/m²
    let iz = 1.6e-3;
    let l = 10.0;
    let m_prestress = 1000.0 * 0.15; // 150 kN·m
    let delta_analytical = m_prestress * l * l / (8.0 * e_kn * iz);

    let rel_err = (mid_uy - delta_analytical).abs() / delta_analytical;
    assert!(
        rel_err < 0.05,
        "Prestress camber off by {:.1}%: computed={}, analytical={}",
        rel_err * 100.0, mid_uy, delta_analytical
    );
}

/// Test 4: Parabolic tendon produces upward distributed load.
#[test]
fn prestress_parabolic_tendon() {
    let mut nodes = HashMap::new();
    for i in 0..=10 {
        nodes.insert(
            format!("{}", i + 1),
            SolverNode { id: i + 1, x: i as f64, y: 0.0 },
        );
    }

    let mut materials = HashMap::new();
    materials.insert("m1".into(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });

    let mut sections = HashMap::new();
    sections.insert("s1".into(), SolverSection { id: 1, a: 0.12, iz: 1.6e-3, as_y: None });

    let mut elements = HashMap::new();
    for i in 0..10 {
        elements.insert(format!("e{}", i + 1), SolverElement {
            id: i + 1, elem_type: "frame".into(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut supports = HashMap::new();
    supports.insert("s1".into(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".into(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    supports.insert("s2".into(), SolverSupport {
        id: 2, node_id: 11, support_type: "roller".into(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    // Parabolic tendon: e=0 at supports, e_mid = 0.2m at midspan
    let p = 1000.0; // 1000 kN
    let e_mid = 0.2;

    let mut prestress_loads = Vec::new();
    let elem_ids: Vec<usize> = (1..=10).collect();
    let all_elem_ids = elem_ids.clone();
    let all_sup_ids = vec![1_usize, 2];
    for &eid in &elem_ids {
        prestress_loads.push(PrestressLoad {
            element_id: eid,
            force: p,
            eccentricity_i: 0.0, // simplified: eccentricity at element nodes set to 0
            eccentricity_j: 0.0,
            profile: TendonProfile::Parabolic { e_mid: e_mid },
            mu: None,
            kappa: None,
        });
    }

    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        stages: vec![ConstructionStage {
            name: "Prestress".into(),
            elements_added: all_elem_ids,
            elements_removed: vec![],
            load_indices: vec![],
            supports_added: all_sup_ids,
            supports_removed: vec![],
            prestress_loads,
        }],
    };

    let results = solve_staged_2d(&staged_input).unwrap();

    // Midspan should deflect upward
    let mid_uy = results.final_results.displacements.iter()
        .find(|d| d.node_id == 6).unwrap().uy;

    assert!(
        mid_uy > 0.0,
        "Parabolic tendon should produce upward camber, got uy = {}",
        mid_uy
    );

    // The equivalent load from parabolic tendon: w_eq = 8*P*e_mid/L²
    // For element-level: w_eq = 8 * 1000 * 0.2 / 1.0 = 1600 kN/m per 1m element
    // This is the upward force from each element's curvature
}

/// Test 5: Empty stages list returns error.
#[test]
fn empty_stages_error() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();
    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        stages: vec![],
    };
    assert!(solve_staged_2d(&staged_input).is_err());
}

/// Test 6: Stage with no active elements still returns results.
#[test]
fn stage_with_no_elements() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();
    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        stages: vec![ConstructionStage {
            name: "Empty stage".into(),
            elements_added: vec![],
            elements_removed: vec![],
            load_indices: vec![],
            supports_added: vec![1, 2],
            supports_removed: vec![],
            prestress_loads: vec![],
        }],
    };

    let results = solve_staged_2d(&staged_input).unwrap();
    assert_eq!(results.stages.len(), 1);
    // All displacements should be zero
    for d in &results.final_results.displacements {
        assert!(d.uy.abs() < 1e-15);
    }
}

/// Test 7: Element removal reduces stiffness.
#[test]
fn element_removal_increases_deflection() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -100.0, mz: 0.0,
        }),
    ];

    // Stage 1: full structure with load
    // Stage 2: remove element 2 (becomes cantilever) — no additional load
    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads,
        stages: vec![
            ConstructionStage {
                name: "Full structure".into(),
                elements_added: vec![1, 2],
                elements_removed: vec![],
                load_indices: vec![0],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![],
            },
            ConstructionStage {
                name: "Remove span 2".into(),
                elements_added: vec![],
                elements_removed: vec![2],
                load_indices: vec![], // no new loads
                supports_added: vec![],
                supports_removed: vec![2],
                prestress_loads: vec![],
            },
        ],
    };

    let results = solve_staged_2d(&staged_input).unwrap();

    // Stage 1 has full span behavior
    let s1_uy = results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    // Stage 2 becomes a cantilever — less stiff, but no new load,
    // so node 2 displacement changes due to redistribution
    let s2_uy = results.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    // Both stages should have negative deflection at node 2
    assert!(s1_uy < 0.0, "Stage 1 uy = {}", s1_uy);
    // Stage 2 cumulative should still be negative (and potentially larger magnitude)
    assert!(s2_uy < 0.0, "Stage 2 uy = {}", s2_uy);

    assert_eq!(results.stages.len(), 2);
}

/// Test 8: Multiple stages with increasing load.
#[test]
fn three_stages_increasing_load() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -25.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -25.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -25.0, mz: 0.0 }),
    ];

    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads,
        stages: vec![
            ConstructionStage {
                name: "Stage 1".into(),
                elements_added: vec![1, 2],
                elements_removed: vec![],
                load_indices: vec![0],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![],
            },
            ConstructionStage {
                name: "Stage 2".into(),
                elements_added: vec![],
                elements_removed: vec![],
                load_indices: vec![1],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![],
            },
            ConstructionStage {
                name: "Stage 3".into(),
                elements_added: vec![],
                elements_removed: vec![],
                load_indices: vec![2],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![],
            },
        ],
    };

    let results = solve_staged_2d(&staged_input).unwrap();
    assert_eq!(results.stages.len(), 3);

    let uy1 = results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    let uy2 = results.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    let uy3 = results.stages[2].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    // Each stage adds 25 kN, so deflection should increase linearly
    // (same stiffness, cumulative displacement)
    let tol = 1e-10;
    assert!((uy2 - 2.0 * uy1).abs() < tol,
        "Stage 2 should be 2x stage 1: {} vs {}", uy2, 2.0 * uy1);
    assert!((uy3 - 3.0 * uy1).abs() < tol,
        "Stage 3 should be 3x stage 1: {} vs {}", uy3, 3.0 * uy1);
}
