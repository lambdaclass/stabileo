use crate::common::*;
use dedaliano_engine::types::*;
use dedaliano_engine::solver::kinematic::*;
use std::collections::HashMap;

// ==================== 2D Kinematic Tests ====================

#[test]
fn test_isostatic_ss_beam() {
    // Simply supported beam: pinned + rollerX, 1 frame element
    // Static degree = 3*1 + 3 - 3*2 = 0 → isostatic
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 0, "SS beam should be isostatic (degree=0)");
    assert!(result.is_solvable, "SS beam should be solvable");
}

#[test]
fn test_hyperstatic_fixed_fixed_beam() {
    // Fixed-fixed beam: 6 reactions, 1 frame element
    // Static degree = 3*1 + 6 - 3*2 = 3
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert!(result.degree > 0, "Fixed-fixed beam should be hyperstatic, got degree={}", result.degree);
    assert!(result.is_solvable, "Fixed-fixed beam should be solvable");
}

#[test]
fn test_cantilever_isostatic() {
    // Cantilever: 1 fixed support, 1 frame element
    // Static degree = 3*1 + 3 - 3*2 = 0
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 0, "Cantilever should be isostatic");
    assert!(result.is_solvable, "Cantilever should be solvable");
}

#[test]
fn test_beam_with_both_hinges_acts_as_truss() {
    // Beam with hinges at both ends acts like a truss element
    // With pinned + roller: m+r-2n = 1+3-4 = 0 → isostatic (solvable)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, true, true)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert!(result.is_solvable, "Double-hinged beam with pinned+roller should be solvable");
}

#[test]
fn test_mechanism_unsupported() {
    // Beam with only one roller → insufficient support, hypostatic
    // 3*1 + 1 - 3*2 = -2
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "rollerX")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert!(result.degree < 0, "Under-supported beam should be hypostatic, got degree={}", result.degree);
}

#[test]
fn test_truss_isostatic() {
    // Simple triangle truss: 3 bars, pinned+roller = 3 reactions
    // Truss: m + r - 2n = 3 + 3 - 2*3 = 0
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.001, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 1, 3, 1, 1, false, false),
            (3, "truss", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 0, "Triangle truss should be isostatic");
    assert!(result.is_solvable, "Triangle truss should be solvable");
}

#[test]
fn test_portal_frame_hyperstatic() {
    // Portal frame: 2 columns + 1 beam, 2 fixed supports
    // 3*3 + 6 - 3*4 = 3
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 6.0, 4.0), (4, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 3, "Portal frame with 2 fixed supports should have degree=3");
    assert!(result.is_solvable, "Portal frame should be solvable");
}

// ==================== 3D Kinematic Tests ====================

fn make_3d_input(
    nodes: Vec<(usize, f64, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64, f64, f64)>, // (id, A, Iy, Iz, J)
    elems: Vec<(usize, &str, usize, usize, usize, usize)>,
    sups: Vec<(usize, usize, bool, bool, bool, bool, bool, bool)>, // (id, node, rx, ry, rz, rrx, rry, rrz)
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }
    let mut mats_map = HashMap::new();
    for (id, e, nu) in mats {
        mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
    }
    let mut secs_map = HashMap::new();
    for (id, a, iy, iz, j) in secs {
        secs_map.insert(id.to_string(), SolverSection3D { id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in elems {
        elems_map.insert(id.to_string(), SolverElement3D {
            id,
            elem_type: t.to_string(),
            node_i: ni,
            node_j: nj,
            material_id: mi,
            section_id: si,
            hinge_start: false,
            hinge_end: false,
            local_yx: None,
            local_yy: None,
            local_yz: None,
            roll_angle: None,
        });
    }
    let mut sups_map = HashMap::new();
    for (id, nid, rx, ry, rz, rrx, rry, rrz) in sups {
        sups_map.insert(id.to_string(), SolverSupport3D {
            node_id: nid,
            rx, ry, rz, rrx, rry, rrz,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            });
    }
    SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads: vec![],
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),    }
}

#[test]
fn test_3d_cantilever_isostatic() {
    // 3D cantilever: 1 fixed support (6 DOFs restrained), 1 frame element
    // 6*1 + 6 - 6*2 = 0 → isostatic
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001, 0.001, 0.002)],
        vec![(1, "frame", 1, 2, 1, 1)],
        // fixed = all 6 DOFs restrained
        vec![(1, 1, true, true, true, true, true, true)],
    );
    let result = analyze_kinematics_3d(&input);
    assert_eq!(result.degree, 0, "3D cantilever should be isostatic, got {}", result.degree);
    assert!(result.is_solvable, "3D cantilever should be solvable");
}

#[test]
fn test_3d_portal_frame() {
    // 3D portal frame: 2 columns + 1 beam, 2 fixed supports
    let input = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0),
            (2, 0.0, 4.0, 0.0),
            (3, 6.0, 4.0, 0.0),
            (4, 6.0, 0.0, 0.0),
        ],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001, 0.001, 0.002)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
            (3, "frame", 3, 4, 1, 1),
        ],
        vec![
            (1, 1, true, true, true, true, true, true),
            (2, 4, true, true, true, true, true, true),
        ],
    );
    let result = analyze_kinematics_3d(&input);
    assert!(result.degree > 0, "3D portal should be hyperstatic, got {}", result.degree);
    assert!(result.is_solvable, "3D portal should be solvable");
}
