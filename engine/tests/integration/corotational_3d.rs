/// Integration tests for the 3D co-rotational large displacement solver.
///
/// Tests verify:
/// 1. Small load matches linear 3D solution
/// 2. Convergence with load increments
/// 3. 3D truss under axial load
/// 4. 3D cantilever large displacement
/// 5. L-frame in 3D
/// 6. Cable/truss corotational in 3D

use dedaliano_engine::solver::corotational::solve_corotational_3d;
use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Helper: build a 3D cantilever (fixed at node 1, free at node 2).
fn cantilever_3d(
    length: f64,
    fx: f64, fy: f64, fz: f64,
    e_mpa: f64, nu: f64,
    a: f64, iy: f64, iz: f64, j: f64,
) -> SolverInput3D {
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

    SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: Vec::new(),
    }
}

#[test]
fn corotational_3d_small_load_matches_linear() {
    // Very small load → corotational should match linear
    let input = cantilever_3d(3.0, 0.0, 0.0, -0.001, 200.0, 0.3, 0.01, 1e-4, 1e-4, 1e-4);

    let linear = solve_3d(&input).unwrap();
    let corot = solve_corotational_3d(&input, 50, 1e-6, 1).unwrap();

    assert!(corot.converged);

    let lin_d = linear.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let cor_d = corot.results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // uz should match closely
    let rel_err = (lin_d.uz - cor_d.uz).abs() / lin_d.uz.abs().max(1e-15);
    assert!(rel_err < 0.01, "uz mismatch: linear={}, corot={}, rel={}", lin_d.uz, cor_d.uz, rel_err);
}

#[test]
fn corotational_3d_converges_with_increments() {
    // Moderate load with multiple increments
    let input = cantilever_3d(3.0, 0.0, 0.0, -50.0, 200.0, 0.3, 0.01, 1e-4, 1e-4, 1e-4);

    let corot = solve_corotational_3d(&input, 100, 1e-6, 10).unwrap();
    assert!(corot.converged, "Should converge with 10 increments");
    assert!(corot.max_displacement > 0.0);
    assert!(corot.iterations > 0);
}

#[test]
fn corotational_3d_axial_truss() {
    // Axial truss: should give exact N = F regardless of geometry
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 5.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 0.0, iz: 0.0, j: 0.0,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "truss".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });

    let mut supports = HashMap::new();
    // Node 1: fixed (all translations)
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    });
    // Node 2: roller (restrain Y, Z)
    supports.insert("2".to_string(), SolverSupport3D {
        node_id: 2,
        rx: false, ry: true, rz: true, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    });

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: 100.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: Vec::new(),
    };

    let corot = solve_corotational_3d(&input, 50, 1e-8, 1).unwrap();
    assert!(corot.converged);

    let ef = &corot.results.element_forces[0];
    assert!(
        (ef.n_start - 100.0).abs() < 0.1,
        "Axial force should be ~100 kN, got {}", ef.n_start
    );
}

#[test]
fn corotational_3d_l_frame() {
    // L-shaped frame in 3D: column + beam
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
        fx: -5.0, fy: 0.0, fz: -5.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: Vec::new(),
    };

    let corot = solve_corotational_3d(&input, 100, 1e-6, 5).unwrap();
    assert!(corot.converged, "L-frame should converge");
    assert_eq!(corot.results.element_forces.len(), 2);
}

#[test]
fn corotational_3d_geometric_stiffening() {
    // Cantilever with axial tension should be stiffer than without
    // (geometric stiffening effect)
    let input_transverse = cantilever_3d(
        3.0, 0.0, 0.0, -10.0, 200.0, 0.3, 0.01, 1e-4, 1e-4, 1e-4,
    );

    // Same but with additional axial tension
    let input_with_tension = cantilever_3d(
        3.0, 500.0, 0.0, -10.0, 200.0, 0.3, 0.01, 1e-4, 1e-4, 1e-4,
    );

    let result_no_tension = solve_corotational_3d(&input_transverse, 100, 1e-6, 5).unwrap();
    let result_with_tension = solve_corotational_3d(&input_with_tension, 100, 1e-6, 5).unwrap();

    assert!(result_no_tension.converged);
    assert!(result_with_tension.converged);

    let uz_no_t = result_no_tension.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz.abs();
    let uz_with_t = result_with_tension.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uz.abs();

    // Axial tension should make the cantilever stiffer (less deflection)
    assert!(
        uz_with_t < uz_no_t,
        "Tension should stiffen: uz_no_tension={}, uz_with_tension={}",
        uz_no_t, uz_with_t
    );
}

#[test]
fn corotational_3d_no_free_dofs_error() {
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

    let input = SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: Vec::new(),
    };

    let result = solve_corotational_3d(&input, 50, 1e-8, 1);
    assert!(result.is_err());
}
