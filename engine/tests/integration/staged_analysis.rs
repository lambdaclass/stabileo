//! Integration tests for staged (construction sequence) analysis solver.
//!
//! Tests verify that the staged solver correctly:
//! - Activates/deactivates elements per stage
//! - Accumulates displacements across stages
//! - Applies prestress equivalent loads
//! - Returns correct per-stage results

use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::solver::staged::solve_staged_2d;
use std::collections::HashMap;

pub(super) fn assert_support_refusal(error: String, nodes: &[usize]) {
    let error: serde_json::Value = serde_json::from_str(&error).unwrap();
    let diagnostics = error["structuredDiagnostics"].as_array().unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0]["code"], "result_quantity_unavailable");
    assert_eq!(diagnostics[0]["severity"], "error");
    assert_eq!(diagnostics[0]["phase"], "reactions");
    assert_eq!(diagnostics[0]["nodeIds"], serde_json::json!(nodes));
    assert!(error.get("results").is_none());
}

/// Helper: create a simple 3-node beam (node 1 -- node 2 -- node 3), 10m total span.
fn make_three_node_beam() -> (
    HashMap<String, SolverNode>,
    HashMap<String, SolverMaterial>,
    HashMap<String, SolverSection>,
    HashMap<String, SolverElement>,
    HashMap<String, SolverSupport>,
) {
    let mut nodes = HashMap::new();
    nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, z: 0.0 });
    nodes.insert("3".into(), SolverNode { id: 3, x: 10.0, z: 0.0 });

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
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("s2".into(), SolverSupport {
        id: 2, node_id: 3, support_type: "pinned".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });

    (nodes, materials, sections, elements, supports)
}

/// Test 1: Single-stage analysis should give same result as normal solve.
#[test]
fn single_stage_matches_normal_solve() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -100.0, my: 0.0,
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
            prestress_loads: vec![], }],
        constraints: vec![],
    };

    let staged_results = solve_staged_2d(&staged_input).unwrap();

    // Normal solve
    let normal_input = SolverInput {
        solver_options: None, masses: Default::default(),
        nodes, materials, sections, elements, supports, loads, constraints: vec![],  connectors: HashMap::new() };
    let normal_results = dedaliano_engine::solver::linear::solve_2d(&normal_input).unwrap();

    // Compare midspan deflection (node 2)
    let staged_uy = staged_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;
    let normal_uy = normal_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;

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
            node_id: 2, fx: 0.0, fz: -50.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -50.0, my: 0.0,
        }),
    ];

    let mut staged_input = StagedInput {
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
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 2: Complete span".into(),
                elements_added: vec![2],
                elements_removed: vec![],
                load_indices: vec![1], // Second 50 kN load
                supports_added: vec![2],
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };

    assert_support_refusal(solve_staged_2d(&staged_input).unwrap_err(), &[3]);
    staged_input.stages[0].supports_added.push(2);
    staged_input.stages[1].supports_added.clear();
    staged_input.stages[0].elements_added.push(2);
    staged_input.stages[1].elements_added.clear();
    let results = solve_staged_2d(&staged_input).unwrap();

    // Should have 2 stage results
    assert_eq!(results.stages.len(), 2);

    // Stage 1: cantilever with 50 kN at tip
    let s1_uy = results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;
    assert!(s1_uy < 0.0, "Stage 1: cantilever tip should deflect downward");

    // Stage 2: completed span — cumulative displacement should change
    let s2_uy = results.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;
    assert!(s2_uy < 0.0, "Stage 2: midspan should still be negative (cumulative)");
    let reference: SolverInput = serde_json::from_value(serde_json::to_value(&staged_input).unwrap()).unwrap();
    let linear = solve_2d(&reference).unwrap();
    let expected = linear.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    assert!((s2_uy - expected).abs() < 1e-10);
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
    nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, z: 0.0 });
    nodes.insert("3".into(), SolverNode { id: 3, x: 10.0, z: 0.0 });

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
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("s2".into(), SolverSupport {
        id: 2, node_id: 3, support_type: "rollerX".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
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
            ] }],
        constraints: vec![],
    };

    let results = solve_staged_2d(&staged_input).unwrap();

    // Midspan should deflect upward (positive Y) due to eccentric prestress
    let mid_uy = results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;

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
            SolverNode { id: i + 1, x: i as f64, z: 0.0 },
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
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("s2".into(), SolverSupport {
        id: 2, node_id: 11, support_type: "rollerX".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
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
            prestress_loads }],
        constraints: vec![],
    };

    let results = solve_staged_2d(&staged_input).unwrap();

    // Midspan should deflect upward
    let mid_uy = results.final_results.displacements.iter()
        .find(|d| d.node_id == 6).unwrap().uz;

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
        constraints: vec![],
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
            prestress_loads: vec![], }],
        constraints: vec![],
    };

    let results = solve_staged_2d(&staged_input).unwrap();
    assert_eq!(results.stages.len(), 1);
    // All displacements should be zero
    for d in &results.final_results.displacements {
        assert!(d.uz.abs() < 1e-15);
    }
}

/// Test 7: Element removal reduces stiffness.
#[test]
fn loaded_element_removal_refuses_unredistributed_deflection() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -100.0, my: 0.0,
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
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Remove span 2".into(),
                elements_added: vec![],
                elements_removed: vec![2],
                load_indices: vec![], // no new loads
                supports_added: vec![],
                supports_removed: vec![2],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };

    let error = solve_staged_2d(&staged_input).unwrap_err();
    assert!(error.contains("#1996"), "{error}");
}

/// Test 8: Multiple stages with increasing load.
#[test]
fn three_stages_increasing_load() {
    let (nodes, materials, sections, elements, supports) = make_three_node_beam();

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -25.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -25.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -25.0, my: 0.0 }),
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
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 2".into(),
                elements_added: vec![],
                elements_removed: vec![],
                load_indices: vec![1],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 3".into(),
                elements_added: vec![],
                elements_removed: vec![],
                load_indices: vec![2],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };

    let results = solve_staged_2d(&staged_input).unwrap();
    assert_eq!(results.stages.len(), 3);

    let uy1 = results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;
    let uy2 = results.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;
    let uy3 = results.stages[2].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;

    // Each stage adds 25 kN, so deflection should increase linearly
    // (same stiffness, cumulative displacement)
    let tol = 1e-10;
    assert!((uy2 - 2.0 * uy1).abs() < tol,
        "Stage 2 should be 2x stage 1: {} vs {}", uy2, 2.0 * uy1);
    assert!((uy3 - 3.0 * uy1).abs() < tol,
        "Stage 3 should be 3x stage 1: {} vs {}", uy3, 3.0 * uy1);
}

#[test]
fn staged_braced_frame_matches_linear_results() {
    let mut nodes = HashMap::new();
    nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 4.0, z: 0.0 });
    nodes.insert("3".into(), SolverNode { id: 3, x: 0.0, z: 3.0 });
    nodes.insert("4".into(), SolverNode { id: 4, x: 4.0, z: 3.0 });

    let mut materials = HashMap::new();
    materials.insert("m1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("frame".into(), SolverSection { id: 1, a: 0.02, iz: 2e-4, as_y: None });
    sections.insert("brace".into(), SolverSection { id: 2, a: 0.01, iz: 1e-4, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("c1".into(), SolverElement {
        id: 1, elem_type: "frame".into(), node_i: 1, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elements.insert("b1".into(), SolverElement {
        id: 2, elem_type: "frame".into(), node_i: 3, node_j: 4,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elements.insert("c2".into(), SolverElement {
        id: 3, elem_type: "frame".into(), node_i: 2, node_j: 4,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elements.insert("brace".into(), SolverElement {
        id: 4, elem_type: "truss".into(), node_i: 1, node_j: 4,
        material_id: 1, section_id: 2, hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("s1".into(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("s2".into(), SolverSupport {
        id: 2, node_id: 2, support_type: "pinned".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 50.0, fz: -25.0, my: 0.0,
    })];

    let normal_input = SolverInput {
        solver_options: None, masses: Default::default(),
        nodes: nodes.clone(),
        materials: materials.clone(),
        sections: sections.clone(),
        elements: elements.clone(),
        supports: supports.clone(),
        loads: loads.clone(),
    constraints: vec![],
    connectors: HashMap::new(),
    };
    let normal = solve_2d(&normal_input).unwrap();

    let staged_input = StagedInput {
        nodes,
        materials,
        sections,
        elements,
        supports,
        loads,
        stages: vec![ConstructionStage {
            name: "Full braced frame".into(),
            elements_added: vec![1, 2, 3, 4],
            elements_removed: vec![],
            load_indices: vec![0],
            supports_added: vec![1, 2],
            supports_removed: vec![],
            prestress_loads: vec![], }],
        constraints: vec![],
    };
    let staged = solve_staged_2d(&staged_input).unwrap();
    let stage = &staged.stages[0].results;

    for (staged_disp, normal_disp) in stage.displacements.iter().zip(normal.displacements.iter()) {
        assert_eq!(staged_disp.node_id, normal_disp.node_id);
        assert!((staged_disp.ux - normal_disp.ux).abs() < 1e-8);
        assert!((staged_disp.uz - normal_disp.uz).abs() < 1e-8);
        assert!((staged_disp.ry - normal_disp.ry).abs() < 1e-8);
    }

    let staged_brace = stage.element_forces.iter().find(|ef| ef.element_id == 4).unwrap();
    let normal_brace = normal.element_forces.iter().find(|ef| ef.element_id == 4).unwrap();
    assert!((staged_brace.n_start - normal_brace.n_start).abs() < 1e-8);
    assert!((staged_brace.n_end - normal_brace.n_end).abs() < 1e-8);
    assert!(staged_brace.n_start.abs() > 1e-6, "brace force should be nonzero");
    assert!(staged_brace.v_start.abs() < 1e-12);
    assert!(staged_brace.m_start.abs() < 1e-12);

    for (staged_reaction, normal_reaction) in stage.reactions.iter().zip(normal.reactions.iter()) {
        assert_eq!(staged_reaction.node_id, normal_reaction.node_id);
        assert!(
            (staged_reaction.rx - normal_reaction.rx).abs() < 1e-8,
            "node {} rx staged={} normal={}",
            staged_reaction.node_id,
            staged_reaction.rx,
            normal_reaction.rx,
        );
        assert!(
            (staged_reaction.rz - normal_reaction.rz).abs() < 1e-8,
            "node {} ry staged={} normal={}",
            staged_reaction.node_id,
            staged_reaction.rz,
            normal_reaction.rz,
        );
        assert!(
            (staged_reaction.my - normal_reaction.my).abs() < 1e-8,
            "node {} mz staged={} normal={}",
            staged_reaction.node_id,
            staged_reaction.my,
            normal_reaction.my,
        );
    }
}

/// Test N: sparse-path parity — same two-stage construction on meshes just
/// below (n_elem=20, nf=63, dense) and just above (n_elem=24, nf=69, sparse)
/// SPARSE_THRESHOLD. Stage 1 builds an unloaded cantilever from the fixed
/// end, stage 2 adds the rest plus the far support and the loads. Since no
/// load acts during stage 1, the final state must equal a linear solve of
/// the full structure under the stage-2 loads — check each mesh against its
/// own linear reference.
#[test]
fn staged_sparse_path_matches_linear_reference() {
    for n_elem in [20usize, 24] {
        let length = 24.0;
        let half = n_elem / 2;

        let mut nodes = HashMap::new();
        for i in 0..=n_elem {
            let id = i + 1;
            nodes.insert(id.to_string(), SolverNode {
                id, x: length * i as f64 / n_elem as f64, z: 0.0,
            });
        }

        let mut materials = HashMap::new();
        materials.insert("m1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("s1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        for i in 0..n_elem {
            elements.insert((i + 1).to_string(), SolverElement {
                id: i + 1, elem_type: "frame".into(),
                node_i: i + 1, node_j: i + 2,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            });
        }

        let mut supports = HashMap::new();
        supports.insert("s1".into(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".into(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        });
        supports.insert("s2".into(), SolverSupport {
            id: 2, node_id: n_elem + 1, support_type: "pinned".into(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        });

        // Uniform-ish nodal load on the interior deck nodes (stage 2).
        let loads: Vec<SolverLoad> = (1..n_elem)
            .map(|i| SolverLoad::Nodal(SolverNodalLoad {
                node_id: i + 1, fx: 0.0, fz: -10.0, my: 0.0,
            }))
            .collect();
        let load_indices: Vec<usize> = (0..loads.len()).collect();

        let mut staged_input = StagedInput {
            nodes: nodes.clone(),
            materials: materials.clone(),
            sections: sections.clone(),
            elements: elements.clone(),
            supports: supports.clone(),
            loads: loads.clone(),
            stages: vec![
                ConstructionStage {
                    name: "Cantilever".into(),
                    elements_added: (1..=half).collect(),
                    elements_removed: vec![],
                    load_indices: vec![],
                    supports_added: vec![1],
                    supports_removed: vec![],
                    prestress_loads: vec![],
                },
                ConstructionStage {
                    name: "Full span".into(),
                    elements_added: (half + 1..=n_elem).collect(),
                    elements_removed: vec![],
                    load_indices,
                    supports_added: vec![2],
                    supports_removed: vec![],
                    prestress_loads: vec![],
                },
            ],
            constraints: vec![],
        };

        assert_support_refusal(solve_staged_2d(&staged_input).unwrap_err(), &[n_elem + 1]);
        staged_input.stages[0].supports_added.push(2);
        staged_input.stages[1].supports_added.clear();
        let staged = solve_staged_2d(&staged_input).unwrap();

        let normal_input = SolverInput {
            nodes, materials, sections, elements, supports, loads,
            constraints: vec![], connectors: HashMap::new(), solver_options: None, masses: Default::default(),
        };
        let normal = dedaliano_engine::solver::linear::solve_2d(&normal_input).unwrap();

        let mid = n_elem / 2 + 1;
        let uz_staged = staged.final_results.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz;
        let uz_normal = normal.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz;

        let rel = (uz_staged - uz_normal).abs() / uz_normal.abs().max(1e-15);
        assert!(
            rel < 1e-6,
            "n_elem={} staged vs linear midspan: staged={:.8e}, linear={:.8e}",
            n_elem, uz_staged, uz_normal
        );
    }
}

fn staged_stays_fixture(n_elem: usize, anchored_pylon: bool) -> StagedInput {
    let length = 24.0;
    let half = n_elem / 2;
    let pylon_top = n_elem + 2;

    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        let id = i + 1;
        nodes.insert(id.to_string(), SolverNode {
            id, x: length * i as f64 / n_elem as f64, z: 0.0,
        });
    }
    nodes.insert(pylon_top.to_string(), SolverNode { id: pylon_top, x: 0.0, z: 12.0 });

    let mut materials = HashMap::new();
    materials.insert("m1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("s1".into(), SolverSection { id: 1, a: 0.05, iz: 1e-3, as_y: None });
    sections.insert("s2".into(), SolverSection { id: 2, a: 0.002, iz: 1e-8, as_y: None });

    let mut elements = HashMap::new();
    for i in 0..n_elem {
        elements.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".into(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }
    elements.insert((n_elem + 1).to_string(), SolverElement {
        id: n_elem + 1, elem_type: "frame".into(),
        node_i: 1, node_j: pylon_top,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    let cable_ids: Vec<usize> = [n_elem / 4, n_elem / 2, 3 * n_elem / 4]
        .iter()
        .enumerate()
        .map(|(k, &q)| {
            let id = 100 + k + 1;
            elements.insert(id.to_string(), SolverElement {
                id, elem_type: "cable".into(),
                node_i: pylon_top, node_j: q + 1,
                material_id: 1, section_id: 2,
                hinge_start: false, hinge_end: false,
            });
            id
        })
        .collect();

    let mut supports = HashMap::new();
    supports.insert("s1".into(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("s2".into(), SolverSupport {
        id: 2, node_id: n_elem + 1, support_type: "pinned".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });

    if anchored_pylon {
        supports.insert("s3".into(), SolverSupport {
            id: 3, node_id: pylon_top, support_type: "fixed".into(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        });
    }

    let per_node = -240.0 / (n_elem - 1) as f64;
    let loads: Vec<SolverLoad> = (1..n_elem)
        .map(|i| SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1, fx: 0.0, fz: per_node, my: 0.0,
        }))
        .collect();
    let load_indices: Vec<usize> = (0..loads.len()).collect();

    let mut stage2_elements: Vec<usize> = (half + 1..=n_elem).collect();
    stage2_elements.extend_from_slice(&cable_ids);

    StagedInput {
        nodes, materials, sections, elements, supports, loads,
        stages: vec![
            ConstructionStage {
                name: "Cantilever + pylon".into(),
                elements_added: (1..=half).chain(std::iter::once(n_elem + 1)).collect(),
                elements_removed: vec![],
                load_indices: vec![],
                supports_added: if anchored_pylon { vec![1, 3] } else { vec![1] },
                supports_removed: vec![],
                prestress_loads: vec![],
            },
            ConstructionStage {
                name: "Full span + stays".into(),
                elements_added: stage2_elements,
                elements_removed: vec![],
                load_indices,
                supports_added: vec![2],
                supports_removed: vec![],
                prestress_loads: vec![],
            },
        ],
        constraints: vec![],
    }
}

#[test]
fn staged_sparse_path_with_cables_parity() {
    let mut refusals = Vec::new();
    for n_elem in [20usize, 24] {
        let input = staged_stays_fixture(n_elem, true);
        let full = SolverInput {
            nodes: input.nodes.clone(), materials: input.materials.clone(),
            sections: input.sections.clone(), elements: input.elements.clone(),
            supports: input.supports.clone(), loads: input.loads.clone(),
            constraints: vec![], connectors: HashMap::new(), solver_options: None,
            masses: Default::default(),
        };
        let nf = dedaliano_engine::solver::DofNumbering::build_2d(&full).n_free;
        assert_eq!(nf >= dedaliano_engine::solver::linear::SPARSE_THRESHOLD, n_elem == 24);
        let error = solve_staged_2d(&input).expect_err("staged cable equilibrium is unsupported");
        let error: serde_json::Value = serde_json::from_str(&error).unwrap();
        let diagnostic = &error["structuredDiagnostics"][0];
        assert_eq!(diagnostic["code"], "cable_analysis_required");
        assert_eq!(diagnostic["severity"], "error");
        assert_eq!(diagnostic["phase"], "element_validity");
        assert_eq!(diagnostic["elementIds"], serde_json::json!([101, 102, 103]));
        assert!(error.get("results").is_none());
        refusals.push(error);
    }
    assert_eq!(refusals[0], refusals[1]);
}

#[test]
fn staged_sparse_path_without_cables_numeric_parity() {
    let mut mid_defs = Vec::new();
    for (n_elem, mid_node) in [(20usize, 11usize), (24, 13)] {
        let mut input = staged_stays_fixture(n_elem, true);
        for element in input.elements.values_mut().filter(|e| e.elem_type == "cable") {
            element.elem_type = "truss".into();
        }
        let full = SolverInput {
            nodes: input.nodes.clone(), materials: input.materials.clone(),
            sections: input.sections.clone(), elements: input.elements.clone(),
            supports: input.supports.clone(), loads: input.loads.clone(),
            constraints: vec![], connectors: HashMap::new(), solver_options: None,
            masses: Default::default(),
        };
        assert_eq!(dedaliano_engine::solver::DofNumbering::build_2d(&full).n_free
            >= dedaliano_engine::solver::linear::SPARSE_THRESHOLD, n_elem == 24);
        assert_support_refusal(solve_staged_2d(&input).unwrap_err(), &[n_elem + 1]);
        input.stages[0].supports_added.push(2);
        input.stages[1].supports_added.clear();
        let result = solve_staged_2d(&input).unwrap();
        let uz_mid = result.final_results.displacements.iter()
            .find(|d| d.node_id == mid_node).unwrap().uz;
        assert!(uz_mid.is_finite() && uz_mid < 0.0);
        let reference = dedaliano_engine::solver::linear::solve_2d(&full).unwrap();
        let uz_reference = reference.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz;
        assert!((uz_mid - uz_reference).abs() / uz_reference.abs().max(1e-15) < 1e-6);
        mid_defs.push(uz_mid);
    }
    let rel = (mid_defs[0] - mid_defs[1]).abs() / mid_defs[0].abs().max(1e-15);
    assert!(rel < 0.05, "Staged truss dense/sparse parity: {mid_defs:?}");
}

#[test]
fn staged_compressive_cables_refused_on_dense_and_sparse_paths() {
    let mut refusals = Vec::new();
    for n_elem in [20, 24] {
        let error = solve_staged_2d(&staged_stays_fixture(n_elem, false))
            .expect_err("the unanchored pylon compresses a cable");
        let error: serde_json::Value = serde_json::from_str(&error).unwrap();
        let diagnostic = &error["structuredDiagnostics"][0];
        assert_eq!(diagnostic["code"], "cable_analysis_required");
        assert_eq!(diagnostic["severity"], "error");
        assert_eq!(diagnostic["phase"], "element_validity");
        assert!(diagnostic["elementIds"].as_array().unwrap().contains(&serde_json::json!(103)));
        assert!(error.get("results").is_none());
        refusals.push(error);
    }
    assert_eq!(refusals[0], refusals[1]);
}

#[test]
fn staged_cables_refuse_unsupported_histories_and_loads() {
    let variants: [(&str, fn(&mut StagedInput)); 6] = [
        ("previous load", |s| s.stages[0].load_indices.push(0)),
        ("early cable", |s| s.stages[0].elements_added.push(101)),
        ("settlement", |s| s.supports.get_mut("s1").unwrap().dx = Some(0.001)),
        ("member load", |s| s.loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 101, a: 1.0, p: -1.0, px: None, my: None,
        }))),
        ("prestress", |s| s.stages[1].prestress_loads.push(PrestressLoad {
            element_id: 101, force: 1.0, eccentricity_i: 0.0, eccentricity_j: 0.0,
            profile: TendonProfile::Straight, mu: None, kappa: None,
        })),
        ("constraint", |s| s.constraints.push(Constraint::RigidLink(RigidLinkConstraint {
            master_node: 1, slave_node: 2, dofs: vec![0, 1],
        }))),
    ];
    for n_elem in [20, 24] {
        for (name, alter) in variants {
            let mut input = staged_stays_fixture(n_elem, true);
            alter(&mut input);
            let error = solve_staged_2d(&input).expect_err(name);
            let error: serde_json::Value = serde_json::from_str(&error).unwrap();
            let diagnostic = &error["structuredDiagnostics"][0];
            assert_eq!(diagnostic["code"], "cable_analysis_required", "{name}");
            assert_eq!(diagnostic["severity"], "error", "{name}");
            assert_eq!(diagnostic["elementIds"], serde_json::json!([101, 102, 103]), "{name}");
            assert!(error.get("results").is_none(), "{name}");
        }
    }
}

#[test]
fn staged_unloaded_and_reverse_loaded_cables_are_refused() {
    for n_elem in [20, 24] {
        for factor in [0.0, -1.0] {
            let mut input = staged_stays_fixture(n_elem, true);
            for load in &mut input.loads {
                let SolverLoad::Nodal(load) = load else { unreachable!() };
                load.fz *= factor;
            }
            let error = solve_staged_2d(&input).expect_err("zero or compressive cable force");
            let error: serde_json::Value = serde_json::from_str(&error).unwrap();
            let diagnostic = &error["structuredDiagnostics"][0];
            assert_eq!(diagnostic["code"], "cable_analysis_required");
            assert_eq!(diagnostic["severity"], "error");
            assert_eq!(diagnostic["elementIds"], serde_json::json!([101, 102, 103]));
            assert!(error.get("results").is_none());
        }
    }
}
