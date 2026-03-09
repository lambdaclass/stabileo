/// Integration tests for the 3D nonlinear material solver.
///
/// Tests verify:
/// 1. Elastic response matches linear solver
/// 2. Yielding reduces stiffness (larger displacement)
/// 3. Biaxial bending interaction
/// 4. Convergence with load increments
/// 5. No free DOFs error
/// 6. Truss elements remain elastic (axial only)

use dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_3d;
use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Helper: build a 3D cantilever with material nonlinear input.
fn cantilever_3d_nl(
    length: f64,
    fx: f64, fy: f64, fz: f64,
    e_mpa: f64, nu: f64,
    a: f64, iy: f64, iz: f64, j: f64,
    np: f64, mpy: f64, mpz: f64,
    n_increments: usize,
) -> NonlinearMaterialInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: length, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: e_mpa, nu });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a, iy, iz, j,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    });

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx, fy, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: Vec::new(),
    };

    let mut material_models = HashMap::new();
    material_models.insert("1".to_string(), MaterialModel {
        model_type: "bilinear".to_string(),
        fy: 250.0,
        alpha: Some(0.01),
    });

    let mut section_capacities = HashMap::new();
    section_capacities.insert("1".to_string(), SectionCapacity3D {
        np, mpy, mpz, mpx: None,
    });

    NonlinearMaterialInput3D {
        solver,
        material_models,
        section_capacities,
        max_iter: 100,
        tolerance: 1e-6,
        n_increments,
    }
}

#[test]
fn nonlinear_material_3d_elastic_matches_linear() {
    // Very small load — should remain elastic and match linear
    let input = cantilever_3d_nl(
        3.0, 0.0, 0.0, -0.001,
        200.0, 0.3,
        0.01, 1e-4, 1e-4, 1e-4,
        1e6, 1e6, 1e6, // Very high capacities — no yielding
        1,
    );

    let nl_result = solve_nonlinear_material_3d(&input).unwrap();
    let lin_result = solve_3d(&input.solver).unwrap();

    assert!(nl_result.converged);

    let lin_d = lin_result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let nl_d = nl_result.results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let rel_err = (lin_d.uz - nl_d.uz).abs() / lin_d.uz.abs().max(1e-15);
    assert!(rel_err < 0.01, "uz mismatch: linear={}, nl={}, rel={}", lin_d.uz, nl_d.uz, rel_err);

    // All elements should be elastic
    for status in &nl_result.element_status {
        assert_eq!(status.state, "elastic");
    }
}

#[test]
fn nonlinear_material_3d_yielding_increases_displacement() {
    // Load that will cause yielding — displacement should be larger than elastic
    let load_z = -50.0; // kN

    // Elastic reference: high capacities
    let input_elastic = cantilever_3d_nl(
        3.0, 0.0, 0.0, load_z,
        200.0, 0.3,
        0.01, 1e-4, 1e-4, 1e-4,
        1e6, 1e6, 1e6,
        10,
    );

    // With yielding: low Mp so element yields
    let input_yield = cantilever_3d_nl(
        3.0, 0.0, 0.0, load_z,
        200.0, 0.3,
        0.01, 1e-4, 1e-4, 1e-4,
        1e6, 5.0, 5.0, // Low Mp — will yield
        10,
    );

    let result_elastic = solve_nonlinear_material_3d(&input_elastic).unwrap();
    let result_yield = solve_nonlinear_material_3d(&input_yield).unwrap();

    assert!(result_elastic.converged);
    assert!(result_yield.converged);

    let uz_elastic = result_elastic.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz.abs();
    let uz_yield = result_yield.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz.abs();

    // Yielded structure should deflect more
    assert!(
        uz_yield > uz_elastic,
        "Yielded should deflect more: elastic={}, yielded={}",
        uz_elastic, uz_yield
    );

    // Check that at least one element is yielded
    let has_yielded = result_yield.element_status.iter()
        .any(|s| s.state != "elastic");
    assert!(has_yielded, "At least one element should yield");
}

#[test]
fn nonlinear_material_3d_biaxial_interaction() {
    // Load in both Y and Z — biaxial interaction should cause yielding
    // even if each axis alone wouldn't yield
    let mpy = 20.0;
    let mpz = 20.0;

    // Single axis load: My alone would be ~15 kN·m at the fixed end (Fz * L = 5 * 3)
    let input_single = cantilever_3d_nl(
        3.0, 0.0, 0.0, -5.0,
        200.0, 0.3,
        0.01, 1e-4, 1e-4, 1e-4,
        1e6, mpy, mpz,
        10,
    );

    // Biaxial load: both Fy and Fz
    let input_biaxial = cantilever_3d_nl(
        3.0, 0.0, -5.0, -5.0,
        200.0, 0.3,
        0.01, 1e-4, 1e-4, 1e-4,
        1e6, mpy, mpz,
        10,
    );

    let result_single = solve_nonlinear_material_3d(&input_single).unwrap();
    let result_biaxial = solve_nonlinear_material_3d(&input_biaxial).unwrap();

    assert!(result_single.converged);
    assert!(result_biaxial.converged);

    // Biaxial utilization should be higher
    let util_single = result_single.element_status[0].utilization;
    let util_biaxial = result_biaxial.element_status[0].utilization;

    assert!(
        util_biaxial > util_single,
        "Biaxial should have higher utilization: single={}, biaxial={}",
        util_single, util_biaxial
    );
}

#[test]
fn nonlinear_material_3d_convergence() {
    let input = cantilever_3d_nl(
        3.0, 0.0, 0.0, -30.0,
        200.0, 0.3,
        0.01, 1e-4, 1e-4, 1e-4,
        1e6, 10.0, 10.0,
        20,
    );

    let result = solve_nonlinear_material_3d(&input).unwrap();
    assert!(result.converged, "Should converge with 20 increments");
    assert!(result.iterations > 0);
    assert!(!result.load_displacement.is_empty());

    // Load-displacement curve should be monotonically increasing
    for window in result.load_displacement.windows(2) {
        assert!(window[1][0] >= window[0][0], "Load factor should increase");
    }
}

#[test]
fn nonlinear_material_3d_no_free_dofs_error() {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 3.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });

    let mut supports = HashMap::new();
    for (key, nid) in [("1", 1), ("2", 2)] {
        supports.insert(key.to_string(), SolverSupport3D {
            node_id: nid,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            rw: None, kw: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        });
    }

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: Vec::new(),
    };

    let input = NonlinearMaterialInput3D {
        solver,
        material_models: HashMap::new(),
        section_capacities: HashMap::new(),
        max_iter: 50,
        tolerance: 1e-6,
        n_increments: 1,
    };

    let result = solve_nonlinear_material_3d(&input);
    assert!(result.is_err());
}

#[test]
fn nonlinear_material_3d_l_frame() {
    // L-shaped frame: column + beam
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 0.0, y: 0.0, z: 3.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 4.0, y: 0.0, z: 3.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    });
    supports.insert("2".to_string(), SolverSupport3D {
        node_id: 3,
        rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    });

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: -10.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: Vec::new(),
    };

    let mut material_models = HashMap::new();
    material_models.insert("1".to_string(), MaterialModel {
        model_type: "bilinear".to_string(),
        fy: 250.0,
        alpha: Some(0.01),
    });

    let mut section_capacities = HashMap::new();
    section_capacities.insert("1".to_string(), SectionCapacity3D {
        np: 2500.0, mpy: 15.0, mpz: 15.0, mpx: None,
    });

    let input = NonlinearMaterialInput3D {
        solver,
        material_models,
        section_capacities,
        max_iter: 100,
        tolerance: 1e-6,
        n_increments: 10,
    };

    let result = solve_nonlinear_material_3d(&input).unwrap();
    assert!(result.converged, "L-frame should converge");
    assert_eq!(result.element_status.len(), 2);
    assert_eq!(result.results.element_forces.len(), 2);
}
