/// Validation: Advanced Construction Staging Benchmarks
///
/// References:
///   - Ghali & Neville, "Structural Analysis: A Unified Classical and Matrix
///     Approach", Ch. 4 (staged/segmental construction)
///   - Gilbert & Ranzi, "Time-Dependent Behaviour of Concrete Structures"
///   - Menn, "Prestressed Concrete Bridges", Ch. 3 (staged erection)
///
/// These tests extend the basic staged construction validation with
/// advanced benchmarks: two-phase beams, support addition under load,
/// element activation effects, sequential loading, prop removal,
/// frame erection sequences, cumulative displacements, and comparison
/// of staged vs instantaneous solutions.

use crate::common::*;
use dedaliano_engine::solver::staged::solve_staged_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 to get kN/m^2)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ================================================================
// Helper functions (same pattern as validation_staged_construction.rs)
// ================================================================

fn make_nodes(coords: &[(usize, f64, f64)]) -> HashMap<String, SolverNode> {
    let mut map = HashMap::new();
    for &(id, x, y) in coords {
        map.insert(id.to_string(), SolverNode { id, x, y });
    }
    map
}

fn make_material() -> HashMap<String, SolverMaterial> {
    let mut map = HashMap::new();
    map.insert("1".into(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    map
}

fn make_section() -> HashMap<String, SolverSection> {
    let mut map = HashMap::new();
    map.insert("1".into(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    map
}

fn make_elements(elems: &[(usize, usize, usize)]) -> HashMap<String, SolverElement> {
    let mut map = HashMap::new();
    for &(id, ni, nj) in elems {
        map.insert(id.to_string(), SolverElement {
            id, elem_type: "frame".into(), node_i: ni, node_j: nj,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }
    map
}

fn make_supports(sups: &[(usize, usize, &str)]) -> HashMap<String, SolverSupport> {
    let mut map = HashMap::new();
    for &(id, node_id, stype) in sups {
        map.insert(id.to_string(), SolverSupport {
            id, node_id, support_type: stype.into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }
    map
}

// ================================================================
// 1. Two-Phase Beam: cantilever first, then add second span
// ================================================================
//
// Stage 1: Cantilever span (element 1, nodes 1-2), fixed at node 1.
//          Apply UDL q on element 1.
// Stage 2: Add second span (element 2, nodes 2-3), add roller at node 3.
//          Apply UDL q on element 2.
//
// In stage 1, element 1 is a cantilever. The tip (node 2) deflection
// from stage 1 is q*L^4/(8*E*I). This is "locked in" and differs from
// the continuous-beam (fixed-roller) solution.

#[test]
fn validation_staged_ext_1_two_phase_beam() {
    let l = 5.0; // each span
    let q = -10.0; // kN/m downward

    let nodes = make_nodes(&[(1, 0.0, 0.0), (2, l, 0.0), (3, 2.0 * l, 0.0)]);
    let materials = make_material();
    let sections = make_section();
    let elements = make_elements(&[(1, 1, 2), (2, 2, 3)]);
    let supports = make_supports(&[
        (1, 1, "fixed"),
        (2, 3, "rollerX"),
    ]);

    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
    ];

    // --- Staged solve: build left span as cantilever, then add right span ---
    let staged_input = StagedInput {
        nodes: nodes.clone(),
        materials: materials.clone(),
        sections: sections.clone(),
        elements: elements.clone(),
        supports: supports.clone(),
        loads: loads.clone(),
        stages: vec![
            ConstructionStage {
                name: "Stage 1: Cantilever".into(),
                elements_added: vec![1],
                elements_removed: vec![],
                load_indices: vec![0],
                supports_added: vec![1], // fixed at node 1 only
                supports_removed: vec![],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 2: Add second span".into(),
                elements_added: vec![2],
                elements_removed: vec![],
                load_indices: vec![1],
                supports_added: vec![2], // roller at node 3
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };
    let staged_results = solve_staged_2d(&staged_input).unwrap();

    // --- Single-stage solve (all at once) ---
    let single_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads,
        stages: vec![ConstructionStage {
            name: "All at once".into(),
            elements_added: vec![1, 2],
            elements_removed: vec![],
            load_indices: vec![0, 1],
            supports_added: vec![1, 2],
            supports_removed: vec![],
            prestress_loads: vec![], }],
        constraints: vec![],
    };
    let single_results = solve_staged_2d(&single_input).unwrap();

    // The staged and single-stage solutions must differ at node 2,
    // because in staged construction the stage 1 cantilever deflection is locked in.
    let staged_uy2 = staged_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    let single_uy2 = single_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    let diff = (staged_uy2 - single_uy2).abs();
    assert!(
        diff > 1e-6,
        "Staged and single-stage should differ at node 2: staged={:.8}, single={:.8}",
        staged_uy2, single_uy2
    );

    // Stage 1: cantilever tip deflection = q*L^4/(8*E*I)
    let e_kn = E * 1000.0;
    let cant_deflection = q * l.powi(4) / (8.0 * e_kn * IZ);
    let stage1_uy2 = staged_results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    assert_close(stage1_uy2, cant_deflection, 0.02,
        "Stage 1 cantilever tip deflection");
}

// ================================================================
// 2. Support Addition: beam loaded, then structure extended
// ================================================================
//
// Stage 1: Two-element beam (fixed at 1, roller at 3), apply P at node 2.
// Stage 2: Add element 3 (nodes 3-4), add roller at node 4. Apply P at node 2.
//
// In stage 1, the fixed-roller beam deflects. In stage 2, the extended
// structure has more span but the same load point. The incremental
// deflection from stage 2 should differ from a single-stage solution
// because the stage 1 forces are locked in.
// Verify the final reactions balance: sum(Ry) = -2P.

#[test]
fn validation_staged_ext_2_support_addition() {
    let l = 5.0; // each element
    let p = -60.0; // kN at node 2

    let nodes = make_nodes(&[
        (1, 0.0, 0.0),
        (2, l, 0.0),
        (3, 2.0 * l, 0.0),
        (4, 3.0 * l, 0.0),
    ]);
    let materials = make_material();
    let sections = make_section();
    let elements = make_elements(&[(1, 1, 2), (2, 2, 3), (3, 3, 4)]);
    let supports = make_supports(&[
        (1, 1, "fixed"),
        (2, 3, "rollerX"),
        (3, 4, "rollerX"), // added in stage 2
    ]);

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p, mz: 0.0,
        }),
    ];

    // --- Staged: build 2 elements, then extend ---
    let staged_input = StagedInput {
        nodes: nodes.clone(),
        materials: materials.clone(),
        sections: sections.clone(),
        elements: elements.clone(),
        supports: supports.clone(),
        loads: loads.clone(),
        stages: vec![
            ConstructionStage {
                name: "Stage 1: 2-elem beam with load".into(),
                elements_added: vec![1, 2],
                elements_removed: vec![],
                load_indices: vec![0],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 2: Extend + more load".into(),
                elements_added: vec![3],
                elements_removed: vec![],
                load_indices: vec![1],
                supports_added: vec![3],
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };
    let staged_results = solve_staged_2d(&staged_input).unwrap();

    // --- Single-stage solve with all at once ---
    let single_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fy: 2.0 * p, mz: 0.0,
            }),
        ],
        stages: vec![ConstructionStage {
            name: "All at once".into(),
            elements_added: vec![1, 2, 3],
            elements_removed: vec![],
            load_indices: vec![0],
            supports_added: vec![1, 2, 3],
            supports_removed: vec![],
            prestress_loads: vec![], }],
        constraints: vec![],
    };
    let single_results = solve_staged_2d(&single_input).unwrap();

    // The staged and single-stage solutions must differ because
    // in the staged case, stage 1 load acts on a 2-element structure
    // while in single-stage, both loads act on the 3-element structure.
    let staged_uy2 = staged_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    let single_uy2 = single_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    let diff = (staged_uy2 - single_uy2).abs();
    assert!(
        diff > 1e-6,
        "Staged and single-stage should differ: staged={:.8}, single={:.8}",
        staged_uy2, single_uy2
    );

    // Stage 1: node 2 should deflect downward
    let s1_uy2 = staged_results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    assert!(
        s1_uy2 < -1e-6,
        "Stage 1: node 2 should deflect downward: uy={}", s1_uy2
    );

    // Final reactions: sum(Ry) should balance 2*P
    let sum_ry: f64 = staged_results.final_results.reactions.iter()
        .map(|r| r.ry).sum();
    assert_close(sum_ry, -2.0 * p, 0.05,
        "Final vertical equilibrium");
}

// ================================================================
// 3. Element Activation: brace stiffens frame in stage 2
// ================================================================
//
// Portal frame (columns + beam) with lateral load.
// Stage 1: Columns + beam, apply lateral load. Record drift.
// Stage 2: Add diagonal brace, apply additional lateral load.
//
// The brace should increase stiffness, so the incremental drift
// from stage 2 load is smaller per unit load than stage 1.

#[test]
fn validation_staged_ext_3_element_activation() {
    let h = 4.0;
    let w = 6.0;
    let p1 = 50.0; // kN lateral in stage 1
    let p2 = 50.0; // kN lateral in stage 2

    // Nodes: 1 (BL), 2 (TL), 3 (TR), 4 (BR)
    let nodes = make_nodes(&[
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ]);
    let materials = make_material();
    let sections = make_section();
    // Elements: 1=left col, 2=beam, 3=right col, 4=diagonal brace (truss)
    let mut elements = make_elements(&[
        (1, 1, 2),
        (2, 2, 3),
        (3, 3, 4),
        (4, 1, 3), // diagonal brace
    ]);
    // Make the brace a truss element (axial only)
    elements.get_mut("4").unwrap().elem_type = "truss".into();

    let supports = make_supports(&[
        (1, 1, "fixed"),
        (2, 4, "fixed"),
    ]);

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p1, fy: 0.0, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p2, fy: 0.0, mz: 0.0,
        }),
    ];

    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads,
        stages: vec![
            ConstructionStage {
                name: "Stage 1: Unbraced frame + lateral load".into(),
                elements_added: vec![1, 2, 3],
                elements_removed: vec![],
                load_indices: vec![0],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 2: Add brace + additional lateral load".into(),
                elements_added: vec![4], // brace added
                elements_removed: vec![],
                load_indices: vec![1],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };

    let results = solve_staged_2d(&staged_input).unwrap();

    // Stage 1 drift at node 2
    let s1_ux2 = results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Final drift at node 2 (cumulative)
    let final_ux2 = results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Incremental drift from stage 2 = final - stage 1
    let incr_ux2 = final_ux2 - s1_ux2;

    // The brace makes the structure stiffer, so incremental drift
    // from stage 2 (same load magnitude) should be less than stage 1 drift.
    assert!(
        s1_ux2 > 0.0,
        "Stage 1 should have positive drift: {}", s1_ux2
    );
    assert!(
        incr_ux2 > 0.0,
        "Stage 2 incremental drift should be positive: {}", incr_ux2
    );
    assert!(
        incr_ux2 < s1_ux2,
        "Brace should reduce drift: stage1={:.6}, incr_stage2={:.6}",
        s1_ux2, incr_ux2
    );
}

// ================================================================
// 4. Sequential Loading: dead load then live load
// ================================================================
//
// Fixed-fixed beam.
// Stage 1: Dead load (UDL q_d = -8 kN/m) on both elements.
// Stage 2: Live load (UDL q_l = -12 kN/m) on both elements.
//
// Since the structure does not change, the final result should equal
// the single-stage result with combined load q = -20 kN/m.

#[test]
fn validation_staged_ext_4_sequential_loading() {
    let l = 10.0;
    let q_dead = -8.0;
    let q_live = -12.0;
    let q_total = q_dead + q_live;

    let nodes = make_nodes(&[(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)]);
    let materials = make_material();
    let sections = make_section();
    let elements = make_elements(&[(1, 1, 2), (2, 2, 3)]);
    let supports = make_supports(&[
        (1, 1, "fixed"),
        (2, 3, "fixed"),
    ]);

    let loads_staged = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: q_dead, q_j: q_dead, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q_dead, q_j: q_dead, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: q_live, q_j: q_live, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q_live, q_j: q_live, a: None, b: None,
        }),
    ];

    // --- Staged solve ---
    let staged_input = StagedInput {
        nodes: nodes.clone(),
        materials: materials.clone(),
        sections: sections.clone(),
        elements: elements.clone(),
        supports: supports.clone(),
        loads: loads_staged,
        stages: vec![
            ConstructionStage {
                name: "Dead load".into(),
                elements_added: vec![1, 2],
                elements_removed: vec![],
                load_indices: vec![0, 1],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Live load".into(),
                elements_added: vec![],
                elements_removed: vec![],
                load_indices: vec![2, 3],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };
    let staged_results = solve_staged_2d(&staged_input).unwrap();

    // --- Single-stage with combined load ---
    let loads_combined = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: q_total, q_j: q_total, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q_total, q_j: q_total, a: None, b: None,
        }),
    ];

    let single_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads: loads_combined,
        stages: vec![ConstructionStage {
            name: "Combined".into(),
            elements_added: vec![1, 2],
            elements_removed: vec![],
            load_indices: vec![0, 1],
            supports_added: vec![1, 2],
            supports_removed: vec![],
            prestress_loads: vec![], }],
        constraints: vec![],
    };
    let single_results = solve_staged_2d(&single_input).unwrap();

    // Compare midspan deflection
    let staged_uy2 = staged_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    let single_uy2 = single_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    assert_close(staged_uy2, single_uy2, 0.01,
        "Sequential loading: staged vs single midspan deflection");

    // Compare element forces
    for (sf, ef) in staged_results.final_results.element_forces.iter()
        .zip(single_results.final_results.element_forces.iter())
    {
        assert_close(sf.m_start, ef.m_start, 0.01,
            &format!("Sequential: element {} m_start", sf.element_id));
        assert_close(sf.m_end, ef.m_end, 0.01,
            &format!("Sequential: element {} m_end", sf.element_id));
        assert_close(sf.v_start, ef.v_start, 0.01,
            &format!("Sequential: element {} v_start", sf.element_id));
    }

    // Compare reactions
    for (sr, er) in staged_results.final_results.reactions.iter()
        .zip(single_results.final_results.reactions.iter())
    {
        assert_close(sr.ry, er.ry, 0.01,
            &format!("Sequential: node {} reaction ry", sr.node_id));
    }
}

// ================================================================
// 5. Prop Removal via Element Removal: two-span becomes cantilever
// ================================================================
//
// Stage 1: Fixed at node 1, roller at node 3. Two elements.
//          Apply load P at node 2.
// Stage 2: Remove element 2 (and its contribution). No new load.
// Stage 3: Apply new load P at node 2 on the cantilever.
//
// After element removal, the structure effectively becomes a cantilever.
// The stage 3 incremental deflection (cantilever) should be larger
// than the stage 1 deflection (two-span beam) for the same load.

#[test]
fn validation_staged_ext_5_prop_removal() {
    let l = 5.0;
    let p = -100.0; // kN at node 2

    let nodes = make_nodes(&[
        (1, 0.0, 0.0),
        (2, l, 0.0),
        (3, 2.0 * l, 0.0),
    ]);
    let materials = make_material();
    let sections = make_section();
    let elements = make_elements(&[(1, 1, 2), (2, 2, 3)]);
    let supports = make_supports(&[
        (1, 1, "fixed"),
        (2, 3, "rollerX"),
    ]);

    let loads = vec![
        // Stage 1 load
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p, mz: 0.0,
        }),
        // Stage 3 load (same magnitude, on cantilever)
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p, mz: 0.0,
        }),
    ];

    let staged_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads,
        stages: vec![
            ConstructionStage {
                name: "Stage 1: Two-span beam with load".into(),
                elements_added: vec![1, 2],
                elements_removed: vec![],
                load_indices: vec![0],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 2: Remove element 2".into(),
                elements_added: vec![],
                elements_removed: vec![2],
                load_indices: vec![],
                supports_added: vec![],
                supports_removed: vec![2],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 3: Load on cantilever".into(),
                elements_added: vec![],
                elements_removed: vec![],
                load_indices: vec![1],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };

    let results = solve_staged_2d(&staged_input).unwrap();
    assert_eq!(results.stages.len(), 3);

    // Stage 1: two-span beam. Node 2 deflects.
    let s1_uy2 = results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    assert!(
        s1_uy2 < 0.0,
        "Stage 1: node 2 should deflect downward: uy={}", s1_uy2
    );

    // Stage 1: both elements should have forces
    let s1_ef1 = results.stages[0].results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    let s1_ef2 = results.stages[0].results.element_forces.iter()
        .find(|ef| ef.element_id == 2).unwrap();
    assert!(s1_ef1.v_start.abs() > 1.0, "Stage 1: element 1 should have shear");
    assert!(s1_ef2.v_start.abs() > 1.0, "Stage 1: element 2 should have shear");

    // Stage 2: element 2 removed, no new load. Only element 1 in forces.
    let s2_forces = &results.stages[1].results.element_forces;
    assert!(
        s2_forces.iter().all(|ef| ef.element_id != 2),
        "Stage 2: element 2 should not appear"
    );

    // Stage 3: load on cantilever. Node 2 deflects further.
    let s3_uy2 = results.stages[2].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    assert!(
        s3_uy2 < s1_uy2,
        "Stage 3: cantilever tip should deflect more: s3={:.6}, s1={:.6}",
        s3_uy2, s1_uy2
    );

    // Incremental deflection from stage 3 (cantilever) should be larger
    // in magnitude than stage 1 (two-span beam) for the same load.
    let s2_uy2 = results.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    let incr_stage3 = (s3_uy2 - s2_uy2).abs();
    let incr_stage1 = s1_uy2.abs();

    assert!(
        incr_stage3 > incr_stage1,
        "Cantilever is more flexible: incr_cant={:.6}, incr_beam={:.6}",
        incr_stage3, incr_stage1
    );
}

// ================================================================
// 6. Frame Erection: columns first, then beam
// ================================================================
//
// Stage 1: Build columns (elements 1,3) with fixed bases, apply gravity.
// Stage 2: Add beam (element 2), apply lateral load at node 2.
//
// The gravity load in stage 1 acts on independent columns (no beam).
// The lateral load in stage 2 acts on the complete portal frame.
// Verify: stage 1 has zero lateral displacement (only axial compression),
// and the final state has non-zero lateral drift from stage 2 load.

#[test]
fn validation_staged_ext_6_frame_erection() {
    let h = 5.0;
    let w = 8.0;
    let p_gravity = -20.0; // kN at each column top
    let p_lateral = 40.0;  // kN

    let nodes = make_nodes(&[
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ]);
    let materials = make_material();
    let sections = make_section();
    let elements = make_elements(&[
        (1, 1, 2), // left column
        (2, 2, 3), // beam
        (3, 3, 4), // right column
    ]);
    let supports = make_supports(&[
        (1, 1, "fixed"),
        (2, 4, "fixed"),
    ]);

    let loads = vec![
        // Stage 1: gravity on column tops
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
        // Stage 2: lateral load
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p_lateral, fy: 0.0, mz: 0.0,
        }),
    ];

    let staged_input = StagedInput {
        nodes: nodes.clone(),
        materials: materials.clone(),
        sections: sections.clone(),
        elements: elements.clone(),
        supports: supports.clone(),
        loads: loads.clone(),
        stages: vec![
            ConstructionStage {
                name: "Stage 1: Columns with gravity".into(),
                elements_added: vec![1, 3],
                elements_removed: vec![],
                load_indices: vec![0, 1],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 2: Add beam + lateral load".into(),
                elements_added: vec![2],
                elements_removed: vec![],
                load_indices: vec![2],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };
    let staged_results = solve_staged_2d(&staged_input).unwrap();

    // Stage 1: columns with gravity only. Lateral displacement should be zero.
    // (Gravity on fixed-base column produces axial deformation only, no lateral sway)
    let s1_ux2 = staged_results.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    assert!(
        s1_ux2.abs() < 1e-6,
        "Stage 1: no lateral sway from gravity on columns: ux={}", s1_ux2
    );

    // Stage 1: columns under gravity have only axial force, no bending.
    let s1_ef1 = staged_results.stages[0].results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    assert!(
        s1_ef1.m_start.abs() < 1e-3,
        "Stage 1: column should have no bending: m_start={}", s1_ef1.m_start
    );

    // After stage 2: portal frame with lateral load should develop moments.
    let final_ef1 = staged_results.final_results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    assert!(
        final_ef1.m_start.abs() > 1.0,
        "Final: column should have bending from lateral load: m_start={}", final_ef1.m_start
    );

    // Final lateral displacement at node 2 should be non-zero.
    let final_ux2 = staged_results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    assert!(
        final_ux2.abs() > 1e-6,
        "Final: portal should have lateral drift: ux={}", final_ux2
    );
}

// ================================================================
// 7. Cumulative Displacement: three-stage loading
// ================================================================
//
// Simply-supported beam (pinned at 1, roller at 3).
// Stage 1: P1 = -30 kN at node 2
// Stage 2: P2 = -50 kN at node 2
// Stage 3: P3 = -20 kN at node 2
//
// Structure unchanged across stages, so cumulative displacement
// should equal (P1+P2+P3)*L^3/(48*E*I) for midspan point load on SS beam.
// Also verify that displacements accumulate monotonically.

#[test]
fn validation_staged_ext_7_cumulative_displacement() {
    let l = 6.0; // total length
    let p1 = -30.0;
    let p2 = -50.0;
    let p3 = -20.0;

    let nodes = make_nodes(&[(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)]);
    let materials = make_material();
    let sections = make_section();
    let elements = make_elements(&[(1, 1, 2), (2, 2, 3)]);
    let supports = make_supports(&[
        (1, 1, "pinned"),
        (2, 3, "rollerX"),
    ]);

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p1, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p2, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p3, mz: 0.0,
        }),
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

    // Collect midspan deflections at each stage
    let uy_stages: Vec<f64> = results.stages.iter().map(|s| {
        s.results.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().uy
    }).collect();

    // Displacements should be negative (downward) and increase in magnitude
    for i in 1..uy_stages.len() {
        assert!(
            uy_stages[i] < uy_stages[i - 1],
            "Cumulative deflection should increase: stage {} uy={:.6}, stage {} uy={:.6}",
            i, uy_stages[i - 1], i + 1, uy_stages[i]
        );
    }

    // Analytical midspan deflection for point load P at midspan of SS beam:
    // delta = P*L^3/(48*E*I)
    let e_kn = E * 1000.0;
    let p_total = p1 + p2 + p3;
    let delta_analytical = p_total * l.powi(3) / (48.0 * e_kn * IZ);

    let final_uy2 = results.final_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    assert_close(final_uy2, delta_analytical, 0.05,
        "Final cumulative deflection matches analytical PL^3/(48EI)");

    // Also verify stage 1 deflection alone
    let delta_s1_analytical = p1 * l.powi(3) / (48.0 * e_kn * IZ);
    assert_close(uy_stages[0], delta_s1_analytical, 0.05,
        "Stage 1 deflection matches analytical P1*L^3/(48EI)");
}

// ================================================================
// 8. Staged vs Instantaneous: same total load, same structure
// ================================================================
//
// Fixed-roller beam (fixed at 1, roller at 3).
// Staged: apply nodal load at node 2 in stage 1, then another in stage 2.
//         (structure fully assembled in stage 1)
// Instantaneous: apply both loads at once.
//
// Since the structure does not change between stages, results must match.

#[test]
fn validation_staged_ext_8_staged_vs_instantaneous() {
    let l = 5.0;
    let p1 = -60.0; // kN at node 2 in stage 1
    let p2 = -40.0; // kN at node 2 in stage 2
    let p_total = p1 + p2;

    let nodes = make_nodes(&[
        (1, 0.0, 0.0),
        (2, l, 0.0),
        (3, 2.0 * l, 0.0),
    ]);
    let materials = make_material();
    let sections = make_section();
    let elements = make_elements(&[(1, 1, 2), (2, 2, 3)]);
    let supports = make_supports(&[
        (1, 1, "fixed"),
        (2, 3, "rollerX"),
    ]);

    let loads_staged = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p1, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p2, mz: 0.0,
        }),
    ];

    // --- Staged: structure assembled in stage 1, loads split across stages ---
    let staged_input = StagedInput {
        nodes: nodes.clone(),
        materials: materials.clone(),
        sections: sections.clone(),
        elements: elements.clone(),
        supports: supports.clone(),
        loads: loads_staged,
        stages: vec![
            ConstructionStage {
                name: "Stage 1: Full structure, first load".into(),
                elements_added: vec![1, 2],
                elements_removed: vec![],
                load_indices: vec![0],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![], },
            ConstructionStage {
                name: "Stage 2: second load".into(),
                elements_added: vec![],
                elements_removed: vec![],
                load_indices: vec![1],
                supports_added: vec![],
                supports_removed: vec![],
                prestress_loads: vec![], },
        ],
        constraints: vec![],
    };
    let staged_results = solve_staged_2d(&staged_input).unwrap();

    // --- Instantaneous: all at once ---
    let loads_combined = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_total, mz: 0.0,
        }),
    ];
    let single_input = StagedInput {
        nodes, materials, sections, elements, supports,
        loads: loads_combined,
        stages: vec![ConstructionStage {
            name: "All at once".into(),
            elements_added: vec![1, 2],
            elements_removed: vec![],
            load_indices: vec![0],
            supports_added: vec![1, 2],
            supports_removed: vec![],
            prestress_loads: vec![], }],
        constraints: vec![],
    };
    let single_results = solve_staged_2d(&single_input).unwrap();

    // Compare all displacements
    for (sd, ed) in staged_results.final_results.displacements.iter()
        .zip(single_results.final_results.displacements.iter())
    {
        assert_close(sd.uy, ed.uy, 0.01,
            &format!("Node {} uy: staged vs instantaneous", sd.node_id));
        assert_close(sd.ux, ed.ux, 0.01,
            &format!("Node {} ux: staged vs instantaneous", sd.node_id));
    }

    // Compare all element forces
    for (sf, ef) in staged_results.final_results.element_forces.iter()
        .zip(single_results.final_results.element_forces.iter())
    {
        assert_close(sf.n_start, ef.n_start, 0.01,
            &format!("Element {} n_start", sf.element_id));
        assert_close(sf.v_start, ef.v_start, 0.01,
            &format!("Element {} v_start", sf.element_id));
        assert_close(sf.m_start, ef.m_start, 0.01,
            &format!("Element {} m_start", sf.element_id));
        assert_close(sf.m_end, ef.m_end, 0.01,
            &format!("Element {} m_end", sf.element_id));
    }

    // Compare all reactions
    for (sr, er) in staged_results.final_results.reactions.iter()
        .zip(single_results.final_results.reactions.iter())
    {
        assert_close(sr.rx, er.rx, 0.01,
            &format!("Node {} rx", sr.node_id));
        assert_close(sr.ry, er.ry, 0.01,
            &format!("Node {} ry", sr.node_id));
        assert_close(sr.mz, er.mz, 0.01,
            &format!("Node {} mz", sr.node_id));
    }
}
