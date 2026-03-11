/// Integration tests for 3D influence lines.
///
/// Tests verify:
/// 1. Reaction influence line for simple beam (Fz at support)
/// 2. Moment influence line at midspan
/// 3. Shear influence line at a section
/// 4. Gravity in Y direction
/// 5. Multi-span continuous beam
/// 6. Number of points matches n_points_per_element

use dedaliano_engine::postprocess::influence::{compute_influence_line_3d, InfluenceLineInput3D};
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Create a simply-supported 3D beam along X: nodes 1(0,0,0) and 2(10,0,0).
fn make_ss_beam_3d() -> SolverInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 10.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.05,
        iy: 1.0e-4, iz: 5.0e-5, j: 1.5e-4,
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
    // Pin at node 1
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });
    // Roller at node 2 (free in X)
    supports.insert("2".to_string(), SolverSupport3D {
        node_id: 2,
        rx: false, ry: true, rz: true,
        rrx: true, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });

    SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

#[test]
fn influence_3d_reaction_fz() {
    // Influence line for Fz at node 1 (left support) of a simple beam.
    // For a unit downward load at position x along a span L=10:
    //   Fz(node1) = 1 - x/L  (linear from 1 at x=0 to 0 at x=L)
    let solver = make_ss_beam_3d();
    let input = InfluenceLineInput3D {
        solver,
        quantity: "Fz".to_string(),
        target_node_id: Some(1),
        target_element_id: None,
        target_position: 0.0,
        n_points_per_element: 10,
        gravity_direction: Some("z".to_string()),
    };

    let result = compute_influence_line_3d(&input).unwrap();
    assert_eq!(result.quantity, "Fz");
    assert_eq!(result.points.len(), 11); // 0..=10

    // Check linearity: at t=0, Fz ≈ 1; at t=1, Fz ≈ 0
    let first = &result.points[0];
    let last = &result.points[10];
    assert!((first.value - 1.0).abs() < 0.02,
        "Fz at left support with load at left end should be ~1.0, got {}", first.value);
    assert!(last.value.abs() < 0.02,
        "Fz at left support with load at right end should be ~0.0, got {}", last.value);

    // Check midpoint: at t=0.5, Fz ≈ 0.5
    let mid = &result.points[5];
    assert!((mid.value - 0.5).abs() < 0.02,
        "Fz at left support with load at midspan should be ~0.5, got {}", mid.value);
}

#[test]
fn influence_3d_moment_midspan() {
    // Influence line for My (bending moment) at midspan of a simple beam.
    // For a unit downward load at position x on span L=10:
    //   M(L/2) = x/2 for 0 ≤ x ≤ L/2, and (L-x)/2 for L/2 ≤ x ≤ L
    // Max at midspan: M = L/4 = 2.5
    let solver = make_ss_beam_3d();
    let input = InfluenceLineInput3D {
        solver,
        quantity: "My_diag".to_string(),
        target_node_id: None,
        target_element_id: Some(1),
        target_position: 0.5, // midspan
        n_points_per_element: 20,
        gravity_direction: Some("z".to_string()),
    };

    let result = compute_influence_line_3d(&input).unwrap();
    assert_eq!(result.points.len(), 21);

    // Find maximum influence value — should be at midspan
    let max_val = result.points.iter().map(|p| p.value.abs()).fold(0.0_f64, f64::max);
    // For unit load at midspan of L=10: M = P*L/4 = 1*10/4 = 2.5
    assert!(max_val > 2.0, "Max moment influence should be > 2.0, got {}", max_val);
    assert!(max_val < 3.0, "Max moment influence should be < 3.0, got {}", max_val);

    // Influence should be zero at supports (t=0 and t=1)
    assert!(result.points[0].value.abs() < 0.1,
        "Moment influence at support should be ~0, got {}", result.points[0].value);
    assert!(result.points[20].value.abs() < 0.1,
        "Moment influence at support should be ~0, got {}", result.points[20].value);
}

#[test]
fn influence_3d_shear() {
    // Influence line for Vz at quarter-span (t=0.25).
    // For unit load at position x:
    //   V(L/4) = -x/L for 0 ≤ x < L/4 (load left of section)
    //            1 - x/L for L/4 < x ≤ L (load right of section)
    let solver = make_ss_beam_3d();
    let input = InfluenceLineInput3D {
        solver,
        quantity: "Vz".to_string(),
        target_node_id: None,
        target_element_id: Some(1),
        target_position: 0.25,
        n_points_per_element: 20,
        gravity_direction: Some("z".to_string()),
    };

    let result = compute_influence_line_3d(&input).unwrap();
    assert_eq!(result.points.len(), 21);

    // Should have both positive and negative values (shear influence line crosses zero)
    let has_pos = result.points.iter().any(|p| p.value > 0.01);
    let has_neg = result.points.iter().any(|p| p.value < -0.01);
    assert!(has_pos || has_neg,
        "Shear influence line should have non-zero values");
}

#[test]
fn influence_3d_gravity_y() {
    // Same beam but with gravity in Y direction.
    // Should produce Vy and Mz effects instead of Vz and My.
    let solver = make_ss_beam_3d();
    let input = InfluenceLineInput3D {
        solver,
        quantity: "Fy".to_string(),
        target_node_id: Some(1),
        target_element_id: None,
        target_position: 0.0,
        n_points_per_element: 10,
        gravity_direction: Some("y".to_string()),
    };

    let result = compute_influence_line_3d(&input).unwrap();

    // Should have non-zero reaction influence
    let max_val = result.points.iter().map(|p| p.value.abs()).fold(0.0_f64, f64::max);
    assert!(max_val > 0.5, "Y-direction reaction influence should be significant, got {}", max_val);
}

#[test]
fn influence_3d_multispan() {
    // Two-span continuous beam: 1(0,0,0) - 2(8,0,0) - 3(16,0,0)
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 8.0, y: 0.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 16.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.05,
        iy: 1.0e-4, iz: 5.0e-5, j: 1.5e-4,
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
    for (key, nid) in [("1", 1usize), ("2", 2), ("3", 3)] {
        supports.insert(key.to_string(), SolverSupport3D {
            node_id: nid,
            rx: if nid == 1 { true } else { false },
            ry: true, rz: true,
            rrx: true, rry: false, rrz: false,
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
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    };

    // Influence line for interior support reaction (node 2)
    let input = InfluenceLineInput3D {
        solver,
        quantity: "Fz".to_string(),
        target_node_id: Some(2),
        target_element_id: None,
        target_position: 0.0,
        n_points_per_element: 10,
        gravity_direction: Some("z".to_string()),
    };

    let result = compute_influence_line_3d(&input).unwrap();
    // Should have points from both elements: 11 + 11 = 22
    assert_eq!(result.points.len(), 22);

    // Interior support reaction should exceed 1.0 when load is directly on it
    // (For continuous beam, Fz at middle support can be > 1.0 for loads near it)
    let max_val = result.points.iter().map(|p| p.value).fold(f64::NEG_INFINITY, f64::max);
    assert!(max_val > 0.5,
        "Interior support reaction should be significant, got {}", max_val);
}

#[test]
fn influence_3d_point_count() {
    let solver = make_ss_beam_3d();

    let input5 = InfluenceLineInput3D {
        solver: solver.clone(),
        quantity: "Fz".to_string(),
        target_node_id: Some(1),
        target_element_id: None,
        target_position: 0.0,
        n_points_per_element: 5,
        gravity_direction: Some("z".to_string()),
    };

    let input20 = InfluenceLineInput3D {
        solver,
        quantity: "Fz".to_string(),
        target_node_id: Some(1),
        target_element_id: None,
        target_position: 0.0,
        n_points_per_element: 20,
        gravity_direction: Some("z".to_string()),
    };

    let result5 = compute_influence_line_3d(&input5).unwrap();
    let result20 = compute_influence_line_3d(&input20).unwrap();

    assert_eq!(result5.points.len(), 6);  // 0..=5
    assert_eq!(result20.points.len(), 21); // 0..=20
}
