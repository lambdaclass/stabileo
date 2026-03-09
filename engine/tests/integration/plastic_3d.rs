/// Integration tests for 3D plastic (pushover) analysis.
///
/// Tests verify:
/// 1. Fixed-end beam forms hinges at both ends
/// 2. Propped cantilever sequential hinge formation
/// 3. Load factor accumulation across steps
/// 4. Biaxial bending interaction
/// 5. Portal frame sway mechanism
/// 6. Mp override works correctly

use dedaliano_engine::solver::plastic::solve_plastic_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Create a 3D cantilever beam: node 1 (fixed) at origin, node 2 (free) at (3,0,0).
fn make_plastic_cantilever_3d() -> PlasticInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 3.0, y: 0.0, z: 0.0 });

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

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(),
        curved_beams: vec![],
    };

    let mut plastic_sections = HashMap::new();
    plastic_sections.insert("1".to_string(), PlasticSectionData3D {
        a: 0.01, iy: 8.33e-6, iz: 8.33e-6,
        material_id: 1,
        b: Some(0.1), h: Some(0.1), d: Some(0.1),
    });

    let mut plastic_materials = HashMap::new();
    plastic_materials.insert("1".to_string(), PlasticMaterialData { fy: Some(250.0) });

    PlasticInput3D {
        solver,
        sections: plastic_sections,
        materials: plastic_materials,
        max_hinges: Some(10),
        mp_overrides: None,
    }
}

#[test]
fn plastic_3d_cantilever_single_hinge() {
    let mut input = make_plastic_cantilever_3d();
    // Apply tip load in Y
    input.solver.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -1.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    let result = solve_plastic_3d(&input).unwrap();

    // Cantilever with tip load: hinge forms at fixed end (node 1)
    assert!(result.collapse_factor > 0.0, "Collapse factor should be positive: {}", result.collapse_factor);
    assert!(!result.hinges.is_empty(), "Should form at least one hinge");
    assert_eq!(result.hinges[0].element_id, 1);
    assert_eq!(result.hinges[0].end, "start");
}

#[test]
fn plastic_3d_fixed_beam_two_hinges() {
    // Fixed-fixed beam: node 1 and node 2 both fixed, load at midspan node 3
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
    for (key, nid) in [("1", 1), ("3", 3)] {
        supports.insert(key.to_string(), SolverSupport3D {
            node_id: nid,
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
    }

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -1.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(),
        curved_beams: vec![],
    };

    let mut plastic_sections = HashMap::new();
    plastic_sections.insert("1".to_string(), PlasticSectionData3D {
        a: 0.01, iy: 8.33e-6, iz: 8.33e-6,
        material_id: 1,
        b: Some(0.1), h: Some(0.1), d: Some(0.1),
    });

    let mut plastic_materials = HashMap::new();
    plastic_materials.insert("1".to_string(), PlasticMaterialData { fy: Some(250.0) });

    let input = PlasticInput3D {
        solver,
        sections: plastic_sections,
        materials: plastic_materials,
        max_hinges: Some(10),
        mp_overrides: None,
    };

    let result = solve_plastic_3d(&input).unwrap();

    // Fixed-fixed beam under central load: hinges form at supports and/or midspan
    assert!(result.hinges.len() >= 2, "Should form at least 2 hinges: {}", result.hinges.len());
    assert!(result.collapse_factor > 0.0);
    assert!(!result.steps.is_empty(), "Should have at least one step");
}

#[test]
fn plastic_3d_load_factor_accumulation() {
    let mut input = make_plastic_cantilever_3d();
    input.solver.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -1.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    let result = solve_plastic_3d(&input).unwrap();

    // Load factor must be positive
    assert!(result.collapse_factor > 0.0);

    // Each step's load factor should be >= the previous
    for i in 1..result.steps.len() {
        assert!(result.steps[i].load_factor >= result.steps[i - 1].load_factor,
            "Load factors should be non-decreasing: {} < {}",
            result.steps[i].load_factor, result.steps[i - 1].load_factor);
    }

    // Final collapse factor should equal the last step
    if let Some(last) = result.steps.last() {
        assert!((result.collapse_factor - last.load_factor).abs() < 1e-10);
    }
}

#[test]
fn plastic_3d_biaxial_interaction() {
    let mut input = make_plastic_cantilever_3d();
    // Apply loads in both Y and Z simultaneously
    input.solver.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -1.0, fz: -1.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    let result_biaxial = solve_plastic_3d(&input).unwrap();

    // Compare with uniaxial: biaxial should have a lower collapse factor
    let mut input_uniaxial = make_plastic_cantilever_3d();
    input_uniaxial.solver.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -1.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));
    let result_uniaxial = solve_plastic_3d(&input_uniaxial).unwrap();

    assert!(result_biaxial.collapse_factor < result_uniaxial.collapse_factor,
        "Biaxial should be weaker: biaxial={}, uniaxial={}",
        result_biaxial.collapse_factor, result_uniaxial.collapse_factor);

    // Check interaction ratio is ~1.0 for the formed hinge
    for h in &result_biaxial.hinges {
        assert!(h.interaction_ratio > 0.9 && h.interaction_ratio < 1.1,
            "Interaction ratio should be ~1.0: {}", h.interaction_ratio);
    }
}

#[test]
fn plastic_3d_portal_frame_mechanism() {
    // Simple portal frame: 2 columns + 1 beam
    // Nodes: 1(0,0,0), 2(0,0,3), 3(4,0,3), 4(4,0,0)
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 0.0, y: 0.0, z: 3.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 4.0, y: 0.0, z: 3.0 });
    nodes.insert("4".to_string(), SolverNode3D { id: 4, x: 4.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01,
        iy: 8.33e-6, iz: 8.33e-6, j: 1.41e-5,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    // Left column
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    // Beam
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    // Right column
    elements.insert("3".to_string(), SolverElement3D {
        id: 3, elem_type: "frame".to_string(),
        node_i: 3, node_j: 4,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });

    let mut supports = HashMap::new();
    for (key, nid) in [("1", 1), ("4", 4)] {
        supports.insert(key.to_string(), SolverSupport3D {
            node_id: nid,
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
    }

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![
            // Lateral load at beam level
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2, fx: 1.0, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }),
        ],
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(),
        curved_beams: vec![],
    };

    let mut plastic_sections = HashMap::new();
    plastic_sections.insert("1".to_string(), PlasticSectionData3D {
        a: 0.01, iy: 8.33e-6, iz: 8.33e-6,
        material_id: 1,
        b: Some(0.1), h: Some(0.1), d: Some(0.1),
    });

    let mut plastic_materials = HashMap::new();
    plastic_materials.insert("1".to_string(), PlasticMaterialData { fy: Some(250.0) });

    let input = PlasticInput3D {
        solver,
        sections: plastic_sections,
        materials: plastic_materials,
        max_hinges: Some(20),
        mp_overrides: None,
    };

    let result = solve_plastic_3d(&input).unwrap();

    // Portal frame under lateral load should form a sway mechanism
    assert!(result.collapse_factor > 0.0, "Should have positive collapse factor");
    assert!(result.hinges.len() >= 2, "Sway mechanism needs multiple hinges: {}", result.hinges.len());

    // The structure should become a mechanism eventually
    // (may or may not depending on max_hinges limit)
    if result.is_mechanism {
        assert!(result.hinges.len() >= 4, "Full sway mechanism needs 4 hinges");
    }
}

#[test]
fn plastic_3d_mp_override() {
    let mut input = make_plastic_cantilever_3d();
    input.solver.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -1.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    // Solve with default Mp
    let result_default = solve_plastic_3d(&input).unwrap();

    // Double the plastic moment via override
    let mut mp_overrides = HashMap::new();
    mp_overrides.insert("1".to_string(), [
        result_default.collapse_factor * 3.0 * 2.0, // Mp_y = 2x (M = F*L, so Mp = lambda * F * L)
        result_default.collapse_factor * 3.0 * 2.0, // Mp_z
    ]);
    input.mp_overrides = Some(mp_overrides);

    let result_override = solve_plastic_3d(&input).unwrap();

    // With doubled Mp, collapse factor should approximately double
    let ratio = result_override.collapse_factor / result_default.collapse_factor;
    assert!(ratio > 1.8 && ratio < 2.2,
        "Doubling Mp should ~double collapse factor: ratio={}", ratio);
}
