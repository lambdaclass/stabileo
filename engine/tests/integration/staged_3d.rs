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
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
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
        constraints: vec![],
        ..Default::default()
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
        prestress_loads: vec![], ..Default::default() });

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
        prestress_loads: vec![], ..Default::default() });

    // Stage 2: add element 2 and apply load at node 3
    input.stages.push(ConstructionStage3D {
        name: "Stage 2 - Second span + load".to_string(),
        elements_added: vec![2],
        elements_removed: vec![],
        load_indices: vec![0],
        supports_added: vec![],
        supports_removed: vec![],
        prestress_loads: vec![], ..Default::default() });

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
        prestress_loads: vec![], ..Default::default() });

    input.stages.push(ConstructionStage3D {
        name: "Stage 2".to_string(),
        elements_added: vec![],
        elements_removed: vec![],
        load_indices: vec![1],
        supports_added: vec![],
        supports_removed: vec![],
        prestress_loads: vec![], ..Default::default() });

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
        prestress_loads: vec![], ..Default::default() });

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
        prestress_loads: vec![], ..Default::default() });

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
        prestress_loads: vec![], ..Default::default() });

    // Stage 2: apply live load
    input.stages.push(ConstructionStage3D {
        name: "Live load".to_string(),
        elements_added: vec![],
        elements_removed: vec![],
        load_indices: vec![0],
        supports_added: vec![],
        supports_removed: vec![],
        prestress_loads: vec![], ..Default::default() });

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
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("3".to_string(), SolverElement3D {
        id: 3, elem_type: "frame".to_string(),
        node_i: 3, node_j: 4,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
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
            prestress_loads: vec![], ..Default::default() },
        ConstructionStage3D {
            name: "Story 2".to_string(),
            elements_added: vec![2],
            elements_removed: vec![],
            load_indices: vec![1],
            supports_added: vec![],
            supports_removed: vec![],
            prestress_loads: vec![], ..Default::default() },
        ConstructionStage3D {
            name: "Story 3".to_string(),
            elements_added: vec![3],
            elements_removed: vec![],
            load_indices: vec![2],
            supports_added: vec![],
            supports_removed: vec![],
            prestress_loads: vec![], ..Default::default() },
    ];

    let input = StagedInput3D {
        nodes, materials, sections, elements, supports, loads, stages,
        constraints: vec![],
        ..Default::default()
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

// ═══════════════════════════════════════════════════════════════
// Shells in a staged analysis
// ═══════════════════════════════════════════════════════════════

/// A staged model's slabs and walls have to reach the analysis.
///
/// `StagedInput3D` had no field for them at all, while the caller sends them —
/// `input3DToWireObject` emits `plates` and `quads` for every 3D payload — so
/// serde dropped them without a word. A building staged with floor slabs and
/// shear walls was analysed as the bare frame, and nothing reported it.
///
/// This asserts the shell CHANGES the answer, which is the only way to tell
/// "carried" from "accepted and ignored": a payload that parses proves nothing.
fn portal_with_slab() -> StagedInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".into(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".into(), SolverNode3D { id: 2, x: 0.0, y: 0.0, z: 3.0 });
    nodes.insert("3".into(), SolverNode3D { id: 3, x: 4.0, y: 0.0, z: 3.0 });
    nodes.insert("4".into(), SolverNode3D { id: 4, x: 4.0, y: 0.0, z: 0.0 });
    // The two nodes the slab needs to span in Y.
    nodes.insert("5".into(), SolverNode3D { id: 5, x: 0.0, y: 4.0, z: 3.0 });
    nodes.insert("6".into(), SolverNode3D { id: 6, x: 4.0, y: 4.0, z: 3.0 });

    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: 30000.0, nu: 0.2 });

    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection3D {
        id: 1, name: None, a: 0.09, iy: 6.75e-4, iz: 6.75e-4, j: 1.14e-3,
        cw: None, as_y: None, as_z: None,
    });

    let frame = |id: usize, i: usize, j: usize| SolverElement3D {
        id, elem_type: "frame".into(), node_i: i, node_j: j,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false,
        release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    };
    let mut elements = HashMap::new();
    elements.insert("1".into(), frame(1, 1, 2));
    elements.insert("2".into(), frame(2, 2, 3));
    elements.insert("3".into(), frame(3, 3, 4));
    elements.insert("4".into(), frame(4, 2, 5));
    elements.insert("5".into(), frame(5, 3, 6));

    let fixed = |node_id: usize| SolverSupport3D {
        node_id,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    };
    let mut supports = HashMap::new();
    supports.insert("1".into(), fixed(1));
    supports.insert("4".into(), fixed(4));
    supports.insert("5".into(), fixed(5));
    supports.insert("6".into(), fixed(6));

    // A 200 mm slab spanning the four roof nodes.
    let mut quads = HashMap::new();
    quads.insert("1".into(), SolverQuadElement {
        id: 1, nodes: [2, 3, 6, 5], material_id: 1, thickness: 0.2,
    });

    StagedInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 50.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
        stages: vec![],
        constraints: vec![],
        quads,
        ..Default::default()
    }
}

/// The stage that owns the slab is stiffer than the stage that does not.
#[test]
fn staged_3d_slab_stiffens_only_the_stage_that_owns_it() {
    let mut input = portal_with_slab();
    let all_elements = vec![1, 2, 3, 4, 5];

    // Stage 1: the frame alone. Stage 2: the same frame plus the slab.
    input.stages.push(ConstructionStage3D {
        name: "frame".into(),
        elements_added: all_elements.clone(),
        load_indices: vec![0],
        supports_added: vec![1, 4, 5, 6],
        ..Default::default()
    });
    input.stages.push(ConstructionStage3D {
        name: "slab cast".into(),
        load_indices: vec![0],
        quads_added: vec![1],
        ..Default::default()
    });

    let res = solve_staged_3d(&input).unwrap();
    assert_eq!(res.stages.len(), 2);

    let drift = |s: &StageResult3D| s.results.displacements.iter()
        .find(|d| d.node_id == 3).map(|d| d.ux.abs()).unwrap_or(0.0);

    // Compared as INCREMENTS, not totals: a staged analysis accumulates, so
    // stage 2's reported displacement contains stage 1's. Both stages apply the
    // same 50 kN, so the honest question is how far each stage's own load moved
    // the structure.
    let after_1 = drift(&res.stages[0]);
    let after_2 = drift(&res.stages[1]);
    let increment_1 = after_1;
    let increment_2 = (after_2 - after_1).abs();

    assert!(increment_1 > 0.0, "the bare frame must actually deflect: {increment_1}");
    // An order of magnitude is not a tolerance argument — it is the difference
    // between a slab that reached the assembler and one that was dropped.
    assert!(
        increment_2 < increment_1 * 0.1,
        "the slab must stiffen its own stage: bare increment={increment_1:.6}, with slab={increment_2:.6}"
    );
}

/// A slab named by no stage is not in the analysis — the counterpart, without
/// which "supported" could mean "always on", which is a different wrong answer.
#[test]
fn staged_3d_a_slab_no_stage_names_stays_out() {
    let mut input = portal_with_slab();
    input.stages.push(ConstructionStage3D {
        name: "frame only".into(),
        elements_added: vec![1, 2, 3, 4, 5],
        load_indices: vec![0],
        supports_added: vec![1, 4, 5, 6],
        ..Default::default()
    });

    let named = {
        let mut i = input.clone();
        i.stages[0].quads_added = vec![1];
        solve_staged_3d(&i).unwrap()
    };
    let unnamed = solve_staged_3d(&input).unwrap();

    let drift = |r: &StagedAnalysisResults3D| r.stages[0].results.displacements.iter()
        .find(|d| d.node_id == 3).map(|d| d.ux.abs()).unwrap_or(0.0);

    assert!(
        drift(&unnamed) > drift(&named),
        "an unnamed slab must not stiffen the stage: unnamed={:.6} named={:.6}",
        drift(&unnamed), drift(&named)
    );
}

/// The same, for `plates`.
///
/// `build_stage_solver_input_3d` filters plates and quads with two separate
/// pieces of code, and only the quad half was exercised. Symmetric code is
/// still untested code, and this change exists because a payload that merely
/// parses proves nothing.
#[test]
fn staged_3d_plates_reach_the_stage_that_owns_them() {
    let mut input = portal_with_slab();
    // Two triangles over the roof panel the quad covered, and no quad.
    input.quads.clear();
    input.plates.insert("1".into(), SolverPlateElement {
        id: 1, nodes: [2, 3, 6], material_id: 1, thickness: 0.2,
    });
    input.plates.insert("2".into(), SolverPlateElement {
        id: 2, nodes: [2, 6, 5], material_id: 1, thickness: 0.2,
    });

    input.stages.push(ConstructionStage3D {
        name: "frame".into(),
        elements_added: vec![1, 2, 3, 4, 5],
        load_indices: vec![0],
        supports_added: vec![1, 4, 5, 6],
        ..Default::default()
    });
    input.stages.push(ConstructionStage3D {
        name: "slab cast".into(),
        load_indices: vec![0],
        plates_added: vec![1, 2],
        ..Default::default()
    });

    let res = solve_staged_3d(&input).unwrap();
    let drift = |s: &StageResult3D| s.results.displacements.iter()
        .find(|d| d.node_id == 3).map(|d| d.ux.abs()).unwrap_or(0.0);

    let increment_1 = drift(&res.stages[0]);
    let increment_2 = (drift(&res.stages[1]) - increment_1).abs();

    assert!(increment_1 > 0.0, "the bare frame must actually deflect: {increment_1}");
    assert!(
        increment_2 < increment_1 * 0.1,
        "the plates must stiffen their own stage: bare={increment_1:.6}, with plates={increment_2:.6}"
    );
}

/// Taking a slab out is a stage too.
///
/// `plates_removed`/`quads_removed` are in the struct and in the solver, and
/// nothing drove either — so "a stage can remove a shell" was an assertion
/// about code nobody had run. Shoring struck after it has done its work is the
/// ordinary reason to need it.
#[test]
fn staged_3d_a_removed_slab_stops_stiffening() {
    let mut input = portal_with_slab();
    input.stages.push(ConstructionStage3D {
        name: "frame".into(),
        elements_added: vec![1, 2, 3, 4, 5],
        load_indices: vec![0],
        supports_added: vec![1, 4, 5, 6],
        quads_added: vec![1],
        ..Default::default()
    });
    input.stages.push(ConstructionStage3D {
        name: "slab struck".into(),
        load_indices: vec![0],
        quads_removed: vec![1],
        ..Default::default()
    });

    let res = solve_staged_3d(&input).unwrap();
    let drift = |s: &StageResult3D| s.results.displacements.iter()
        .find(|d| d.node_id == 3).map(|d| d.ux.abs()).unwrap_or(0.0);

    let with_slab = drift(&res.stages[0]);
    let after_removal = (drift(&res.stages[1]) - with_slab).abs();

    // The same 50 kN, once with the slab and once without it. If
    // `quads_removed` did nothing, the two increments would be equal.
    assert!(
        after_removal > with_slab * 2.0,
        "removing the slab must soften the stage: with={with_slab:.6}, after removal={after_removal:.6}"
    );
}

/// A shell no stage can name is refused, not dropped.
///
/// `ConstructionStage3D` has no list for nine-node shells, because nothing in
/// the application builds one. That left the field on `StagedInput3D` in the
/// state this whole change exists to abolish: accepted by serde, activated by
/// nothing, gone without a word. The guard says so instead.
#[test]
fn staged_3d_rejects_quad9s_it_cannot_activate() {
    let mut input = portal_with_slab();
    input.quads.clear();
    input.quad9s.insert("1".into(), SolverQuad9Element {
        id: 1, nodes: [2, 3, 6, 5, 2, 3, 6, 5, 2], material_id: 1, thickness: 0.2,
    });
    input.stages.push(ConstructionStage3D {
        name: "frame".into(),
        elements_added: vec![1, 2, 3, 4, 5],
        load_indices: vec![0],
        supports_added: vec![1, 4, 5, 6],
        ..Default::default()
    });

    let err = solve_staged_3d(&input).expect_err("a staged input with quad9s must be refused");
    assert!(
        err.contains("Nine-node shell"),
        "the error must name what it refused: {err}"
    );
}
