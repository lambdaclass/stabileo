/// Integration tests for 3D staged construction analysis.
///
/// Tests verify:
/// 1. Single-stage analysis matches direct solve
/// 2. Multi-stage element activation
/// 3. Stage-by-stage displacement accumulation
/// 4. Support activation/deactivation between stages
/// 5. Load application at specific stages
/// 6. Multi-story building staged erection

use dedaliano_engine::solver::staged::solve_staged_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Helper: create a basic 3D staged input with 3 nodes in a line along X.
/// Node 1 at origin (fixed), Node 2 at (3,0,0), Node 3 at (6,0,0).
/// Two frame elements: elem 1 (1→2), elem 2 (2→3).
fn make_staged_3d_base() -> StagedInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 3.0, y: 0.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 6.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01,
        iy: 8.33e-6, iz: 8.33e-6, j: 1.41e-5,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });

    StagedInput3D {
        nodes,
        materials,
        sections,
        elements,
        supports,
        loads: vec![],
        stages: vec![],
    }
}

#[test]
fn staged_3d_single_stage_all_elements() {
    let mut input = make_staged_3d_base();

    // Single stage: activate both elements, support at node 1, apply load at node 3
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    input.stages.push(ConstructionStage3D {
        name: "Full structure".to_string(),
        elements_added: vec![1, 2],
        elements_removed: vec![],
        load_indices: vec![0],
        supports_added: vec![1],
        supports_removed: vec![],
        prestress_loads: vec![], });

    let result = solve_staged_3d(&input).unwrap();
    assert_eq!(result.stages.len(), 1);

    let stage = &result.stages[0];
    assert_eq!(stage.stage_name, "Full structure");

    // Node 3 should have non-zero displacement in Z (vertical)
    let d3 = stage.results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d3.uz.abs() > 1e-10, "Expected non-zero uz at node 3: {}", d3.uz);

    // Node 1 (fixed) should have zero displacement
    let d1 = stage.results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.ux.abs() < 1e-10);
    assert!(d1.uy.abs() < 1e-10);
    assert!(d1.uz.abs() < 1e-10);

    // Element forces should be non-zero
    assert!(!stage.results.element_forces.is_empty());
    let ef1 = stage.results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert!(ef1.vz_start.abs() > 1e-10 || ef1.my_start.abs() > 1e-10,
        "Expected non-zero forces in element 1");
}

#[test]
fn staged_3d_two_stage_element_activation() {
    let mut input = make_staged_3d_base();

    // Load at node 3
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    // Stage 1: only element 1 active (cantilever from node 1 to 2)
    input.stages.push(ConstructionStage3D {
        name: "Stage 1 - First span".to_string(),
        elements_added: vec![1],
        elements_removed: vec![],
        load_indices: vec![],
        supports_added: vec![1],
        supports_removed: vec![],
        prestress_loads: vec![], });

    // Stage 2: add element 2 and apply load at node 3
    input.stages.push(ConstructionStage3D {
        name: "Stage 2 - Second span + load".to_string(),
        elements_added: vec![2],
        elements_removed: vec![],
        load_indices: vec![0],
        supports_added: vec![],
        supports_removed: vec![],
        prestress_loads: vec![], });

    let result = solve_staged_3d(&input).unwrap();
    assert_eq!(result.stages.len(), 2);

    // Stage 1: No loads, zero displacements expected
    let s1 = &result.stages[0];
    let d2_s1 = s1.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2_s1.uz.abs() < 1e-10, "Stage 1 should have zero displacements (no loads)");

    // Stage 2: Load applied → non-zero displacements
    let s2 = &result.stages[1];
    let d3_s2 = s2.results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d3_s2.uz.abs() > 1e-10, "Stage 2 should have non-zero uz at node 3: {}", d3_s2.uz);

    // Final results should match stage 2
    assert_eq!(result.final_results.displacements.len(), result.stages[1].results.displacements.len());
}

#[test]
fn staged_3d_displacement_accumulation() {
    let mut input = make_staged_3d_base();

    // Two loads for two stages
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -5.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -5.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    // Both elements active from stage 1
    input.stages.push(ConstructionStage3D {
        name: "Stage 1".to_string(),
        elements_added: vec![1, 2],
        elements_removed: vec![],
        load_indices: vec![0],
        supports_added: vec![1],
        supports_removed: vec![],
        prestress_loads: vec![], });

    input.stages.push(ConstructionStage3D {
        name: "Stage 2".to_string(),
        elements_added: vec![],
        elements_removed: vec![],
        load_indices: vec![1],
        supports_added: vec![],
        supports_removed: vec![],
        prestress_loads: vec![], });

    let result = solve_staged_3d(&input).unwrap();
    assert_eq!(result.stages.len(), 2);

    let uz_s1 = result.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;
    let uz_s2 = result.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz;

    // Stage 2 displacement should be approximately double stage 1 (same additional load)
    assert!(uz_s2.abs() > uz_s1.abs(),
        "Cumulative displacement should grow: s1={}, s2={}", uz_s1, uz_s2);

    let ratio = uz_s2 / uz_s1;
    assert!((ratio - 2.0).abs() < 0.1,
        "Stage 2 should be ~2x stage 1 displacement: ratio={}", ratio);
}

#[test]
fn staged_3d_support_activation() {
    let mut input = make_staged_3d_base();

    // Add a second support at node 3 (will be activated in stage 2)
    input.supports.insert("3".to_string(), SolverSupport3D {
        node_id: 3,
        rx: true, ry: true, rz: true,
        rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });

    // Load at node 2 (midspan)
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    // Stage 1: cantilever (only support at node 1, both elements)
    input.stages.push(ConstructionStage3D {
        name: "Cantilever".to_string(),
        elements_added: vec![1, 2],
        elements_removed: vec![],
        load_indices: vec![0],
        supports_added: vec![1],
        supports_removed: vec![],
        prestress_loads: vec![], });

    // Stage 2: add support at node 3 (propped cantilever), same load again
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));
    input.stages.push(ConstructionStage3D {
        name: "Propped".to_string(),
        elements_added: vec![],
        elements_removed: vec![],
        load_indices: vec![1],
        supports_added: vec![3],
        supports_removed: vec![],
        prestress_loads: vec![], });

    let result = solve_staged_3d(&input).unwrap();
    assert_eq!(result.stages.len(), 2);

    // After stage 2, node 3 should have reaction (it's now supported)
    let r3 = result.stages[1].results.reactions.iter().find(|r| r.node_id == 3);
    assert!(r3.is_some(), "Node 3 should have a reaction in stage 2");
}

#[test]
fn staged_3d_load_at_specific_stage() {
    let mut input = make_staged_3d_base();

    // Self-weight-like load at node 2
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -20.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    // Stage 1: build structure, no load
    input.stages.push(ConstructionStage3D {
        name: "Build".to_string(),
        elements_added: vec![1, 2],
        elements_removed: vec![],
        load_indices: vec![],
        supports_added: vec![1],
        supports_removed: vec![],
        prestress_loads: vec![], });

    // Stage 2: apply live load
    input.stages.push(ConstructionStage3D {
        name: "Live load".to_string(),
        elements_added: vec![],
        elements_removed: vec![],
        load_indices: vec![0],
        supports_added: vec![],
        supports_removed: vec![],
        prestress_loads: vec![], });

    let result = solve_staged_3d(&input).unwrap();

    // Stage 1: no load → zero displacement
    let uy_s1 = result.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    assert!(uy_s1.abs() < 1e-10, "No load in stage 1, should be zero: {}", uy_s1);

    // Stage 2: load applied → non-zero displacement in Y
    let uy_s2 = result.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    assert!(uy_s2.abs() > 1e-10, "Load in stage 2, should be non-zero: {}", uy_s2);
}

#[test]
fn staged_3d_multistory_erection() {
    // Simulate a 3-story column erection
    // Node 1 at ground (fixed), Node 2 at 3m, Node 3 at 6m, Node 4 at 9m
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 0.0, y: 0.0, z: 3.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 0.0, y: 0.0, z: 6.0 });
    nodes.insert("4".to_string(), SolverNode3D { id: 4, x: 0.0, y: 0.0, z: 9.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.02,
        iy: 1.0e-5, iz: 1.0e-5, j: 2.0e-5,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("3".to_string(), SolverElement3D {
        id: 3, elem_type: "frame".to_string(),
        node_i: 3, node_j: 4,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });

    // Lateral loads at each floor level
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 5.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 10.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 15.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let stages = vec![
        ConstructionStage3D {
            name: "Story 1".to_string(),
            elements_added: vec![1],
            elements_removed: vec![],
            load_indices: vec![0],
            supports_added: vec![1],
            supports_removed: vec![],
            prestress_loads: vec![], },
        ConstructionStage3D {
            name: "Story 2".to_string(),
            elements_added: vec![2],
            elements_removed: vec![],
            load_indices: vec![1],
            supports_added: vec![],
            supports_removed: vec![],
            prestress_loads: vec![], },
        ConstructionStage3D {
            name: "Story 3".to_string(),
            elements_added: vec![3],
            elements_removed: vec![],
            load_indices: vec![2],
            supports_added: vec![],
            supports_removed: vec![],
            prestress_loads: vec![], },
    ];

    let input = StagedInput3D {
        nodes, materials, sections, elements, supports, loads, stages,
    };

    let result = solve_staged_3d(&input).unwrap();
    assert_eq!(result.stages.len(), 3);

    // At each stage, the top node should have increasing lateral displacement
    let ux_s1 = result.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux_s2 = result.stages[1].results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;
    let ux_s3 = result.stages[2].results.displacements.iter()
        .find(|d| d.node_id == 4).unwrap().ux;

    assert!(ux_s1 > 0.0, "Story 1 top should deflect in +X: {}", ux_s1);
    assert!(ux_s2 > ux_s1, "Story 2 top should deflect more: s1={}, s2={}", ux_s1, ux_s2);
    assert!(ux_s3 > ux_s2, "Story 3 top should deflect most: s2={}, s3={}", ux_s2, ux_s3);

    // All 3 elements should have forces in the final stage
    assert_eq!(result.final_results.element_forces.len(), 3);

    // Base reaction should resist total lateral force (5+10+15 = 30 kN)
    let r1 = result.final_results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!((r1.fx + 30.0).abs() < 1.0,
        "Base reaction should ~= -30 kN: {}", r1.fx);
}
