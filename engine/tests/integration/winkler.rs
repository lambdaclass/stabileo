use dedaliano_engine::types::*;
use dedaliano_engine::solver::winkler::*;
use std::collections::HashMap;

// ==================== Helper Functions ====================

fn support_3d_fixed(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    }
}

fn support_3d_pinned(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    }
}

fn nodal_3d(node_id: usize, fx: f64, fy: f64, fz: f64) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id, fx, fy, fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })
}

fn make_2d_beam_on_foundation(
    length: f64,
    n_elements: usize,
    kf: f64,
    loads: Vec<SolverLoad>,
) -> WinklerInput {
    let mut nodes = HashMap::new();
    let mut elements = HashMap::new();
    let mut supports = HashMap::new();
    let dx = length / n_elements as f64;

    for i in 0..=n_elements {
        nodes.insert(i.to_string(), SolverNode { id: i, x: i as f64 * dx, y: 0.0 });
    }

    for i in 0..n_elements {
        elements.insert(i.to_string(), SolverElement {
            id: i, elem_type: "frame".to_string(),
            node_i: i, node_j: i + 1, material_id: 0, section_id: 0,
            hinge_start: false, hinge_end: false,
        });
    }

    supports.insert("0".to_string(), SolverSupport {
        id: 0, node_id: 0, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: n_elements, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    let mut materials = HashMap::new();
    materials.insert("0".to_string(), SolverMaterial { id: 0, e: 200e9, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("0".to_string(), SolverSection { id: 0, a: 0.01, iz: 1e-4, as_y: None });

    let solver = SolverInput { nodes, materials, sections, elements, supports, loads, constraints: vec![],  connectors: HashMap::new() };

    let foundation_springs: Vec<FoundationSpring> = (0..n_elements)
        .map(|i| FoundationSpring { element_id: i, kf })
        .collect();

    WinklerInput { solver, foundation_springs }
}

fn make_3d_beam_on_foundation(
    length: f64,
    n_elements: usize,
    ky: Option<f64>,
    kz: Option<f64>,
    loads: Vec<SolverLoad3D>,
) -> WinklerInput3D {
    let mut nodes = HashMap::new();
    let mut elements = HashMap::new();
    let mut supports = HashMap::new();
    let dx = length / n_elements as f64;

    for i in 0..=n_elements {
        nodes.insert(i.to_string(), SolverNode3D { id: i, x: i as f64 * dx, y: 0.0, z: 0.0 });
    }

    for i in 0..n_elements {
        elements.insert(i.to_string(), SolverElement3D {
            id: i, elem_type: "frame".to_string(),
            node_i: i, node_j: i + 1, material_id: 0, section_id: 0,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    supports.insert("0".to_string(), support_3d_fixed(0));
    supports.insert("1".to_string(), support_3d_pinned(n_elements));

    let mut materials = HashMap::new();
    materials.insert("0".to_string(), SolverMaterial { id: 0, e: 200e9, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("0".to_string(), SolverSection3D {
        id: 0, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4,
        cw: None, as_y: None, as_z: None,
    });

    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    };

    let foundation_springs: Vec<FoundationSpring3D> = (0..n_elements)
        .map(|i| FoundationSpring3D { element_id: i, ky, kz })
        .collect();

    WinklerInput3D { solver, foundation_springs }
}

// ==================== 2D Tests ====================

/// Foundation stiffness reduces midspan deflection compared to no foundation.
#[test]
fn winkler_2d_uniform_load_reduces_deflection() {
    let l = 10.0;
    let n = 10;
    let q = -10000.0;

    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Without foundation
    let mut input_no = make_2d_beam_on_foundation(l, n, 0.0, loads.clone());
    input_no.foundation_springs.clear();
    let res_no = solve_winkler_2d(&input_no).unwrap();
    let mid = n / 2;
    let defl_no = res_no.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // With Winkler foundation kf = 1e6 N/m/m
    let input_with = make_2d_beam_on_foundation(l, n, 1e6, loads);
    let res_with = solve_winkler_2d(&input_with).unwrap();
    let defl_with = res_with.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    assert!(defl_with.abs() < defl_no.abs(),
        "Foundation should reduce deflection: with={:.6e}, without={:.6e}", defl_with, defl_no);
    assert!(defl_with < 0.0);
    assert!(defl_no < 0.0);
}

/// Point load: support reactions should be less than applied load (foundation carries part).
#[test]
fn winkler_2d_point_load_equilibrium() {
    let l = 6.0;
    let n_elem = 6;
    let p = -50000.0;

    let input = make_2d_beam_on_foundation(l, n_elem, 5e5, vec![
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 2, a: 1.0, p, px: None, mz: None,
        }),
    ]);

    let result = solve_winkler_2d(&input).unwrap();
    let total_ry: f64 = result.reactions.iter().map(|r| r.ry).sum();

    assert!(result.reactions.len() >= 2);
    assert!(total_ry.abs() < p.abs(),
        "Support reactions ({:.2}) should be less than applied load ({:.2})", total_ry, p);
}

/// Very stiff foundation gives nearly zero deflection.
#[test]
fn winkler_2d_stiff_foundation_small_deflection() {
    let input = make_2d_beam_on_foundation(4.0, 4, 1e12, vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10000.0, q_j: -10000.0, a: None, b: None,
        }),
    ]);

    let result = solve_winkler_2d(&input).unwrap();
    for d in &result.displacements {
        assert!(d.uy.abs() < 1e-8,
            "Node {} deflection {:.2e} should be ~0", d.node_id, d.uy);
    }
}

/// Zero foundation modulus gives same results as standard beam.
#[test]
fn winkler_2d_zero_foundation_matches_standard() {
    let n = 8;
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -5000.0, q_j: -5000.0, a: None, b: None,
        }))
        .collect();

    // No springs at all
    let mut input_std = make_2d_beam_on_foundation(8.0, n, 0.0, loads.clone());
    input_std.foundation_springs.clear();
    let res_std = solve_winkler_2d(&input_std).unwrap();

    // With kf=0 springs
    let input_zero = make_2d_beam_on_foundation(8.0, n, 0.0, loads);
    let res_zero = solve_winkler_2d(&input_zero).unwrap();

    for (ds, dz) in res_std.displacements.iter().zip(res_zero.displacements.iter()) {
        assert!((ds.uy - dz.uy).abs() < 1e-10,
            "Node {}: standard={:.6e}, zero_found={:.6e}", ds.node_id, ds.uy, dz.uy);
    }
}

// ==================== 3D Tests ====================

/// 3D beam on Y-direction foundation with vertical load.
#[test]
fn winkler_3d_vertical_load() {
    let n_elem = 6;
    let input = make_3d_beam_on_foundation(6.0, n_elem, Some(1e6), None, vec![
        nodal_3d(3, 0.0, -100000.0, 0.0),
    ]);

    let result = solve_winkler_3d(&input).unwrap();
    let mid = result.displacements.iter().find(|d| d.node_id == 3).unwrap();

    assert!(mid.uy < 0.0, "Midspan should deflect downward: uy={:.6e}", mid.uy);
    assert!(mid.uz.abs() < 1e-10, "No Z displacement expected: uz={:.6e}", mid.uz);
}

/// 3D beam with biaxial foundation: larger Y load produces larger Y deflection.
#[test]
fn winkler_3d_biaxial_foundation() {
    let input = make_3d_beam_on_foundation(8.0, 8, Some(5e5), Some(5e5), vec![
        nodal_3d(4, 0.0, -50000.0, 30000.0),
    ]);

    let result = solve_winkler_3d(&input).unwrap();
    let mid = result.displacements.iter().find(|d| d.node_id == 4).unwrap();

    assert!(mid.uy.abs() > mid.uz.abs(),
        "Larger Y load → larger Y deflection: uy={:.6e}, uz={:.6e}", mid.uy, mid.uz);
    assert!(mid.uy < 0.0, "uy should be negative: {:.6e}", mid.uy);
    assert!(mid.uz > 0.0, "uz should be positive: {:.6e}", mid.uz);
}
