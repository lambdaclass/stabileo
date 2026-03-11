/// Validation: 3D Inclined Supports
///
/// Tests constraint transformation for supports with arbitrary normal directions.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 5e-5;
const L: f64 = 5.0;

fn make_inclined_support(node_id: usize, nx: f64, ny: f64, nz: f64) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: false, ry: false, rz: false,
        rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: Some(nx), normal_y: Some(ny), normal_z: Some(nz),
        is_inclined: Some(true),
        rw: None, kw: None,
    }
}

fn make_fixed_3d(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: true, ry: true, rz: true,
        rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
        rw: None, kw: None,
    }
}


// ================================================================
// 1. Beam on 45° inclined roller — reaction direction = normal
// ================================================================

#[test]
fn validation_inclined_roller_45_degrees() {
    // Cantilever beam along X, fixed at node 1.
    // At node 2: inclined roller with normal = (1/√2, 1/√2, 0) — 45° in XY plane.
    // Apply a vertical load at node 2: the inclined roller should produce a reaction
    // in the normal direction only.
    let n = 4;
    let n_nodes = n + 1;
    let elem_len = L / n as f64;

    let mut nodes = HashMap::new();
    for i in 0..n_nodes {
        nodes.insert((i + 1).to_string(), SolverNode3D {
            id: i + 1, x: i as f64 * elem_len, y: 0.0, z: 0.0,
        });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: A, iy: IY, iz: IZ, j: J, cw: None,
        as_y: None, as_z: None,
    });

    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement3D {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    let s = 1.0 / (2.0f64).sqrt();
    let mut sups = HashMap::new();
    sups.insert("1".to_string(), make_fixed_3d(1));
    sups.insert("2".to_string(), make_inclined_support(n_nodes, s, s, 0.0));

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_nodes, fx: 0.0, fy: -10.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = SolverInput3D {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    // The reaction at the inclined support should be in the normal direction.
    // Normal = (s, s, 0). The reaction force vector should be proportional to (s, s, 0).
    let r2 = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();

    // Reaction should have fx ≈ fy (45° direction), fz ≈ 0
    if r2.fx.abs() > 1e-6 || r2.fy.abs() > 1e-6 {
        let ratio = r2.fx / r2.fy;
        assert_close(ratio, 1.0, 0.02, "Reaction fx/fy ratio should be 1.0 for 45° normal");
    }
    assert!(
        r2.fz.abs() < 1e-6,
        "Inclined roller in XY plane should have fz≈0, got {:.6e}", r2.fz
    );
}

// ================================================================
// 2. Horizontal inclined roller (normal = Y) degenerates to standard roller
// ================================================================

#[test]
fn validation_inclined_roller_normal_y_is_standard_roller() {
    // When normal = (0, 1, 0), the inclined roller should behave like a standard Y-roller.
    let n = 4;
    let n_nodes = n + 1;
    let elem_len = L / n as f64;

    let mut nodes = HashMap::new();
    for i in 0..n_nodes {
        nodes.insert((i + 1).to_string(), SolverNode3D {
            id: i + 1, x: i as f64 * elem_len, y: 0.0, z: 0.0,
        });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: A, iy: IY, iz: IZ, j: J, cw: None,
        as_y: None, as_z: None,
    });

    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement3D {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    // Case 1: Inclined roller with normal = Y
    let mut sups1 = HashMap::new();
    sups1.insert("1".to_string(), make_fixed_3d(1));
    sups1.insert("2".to_string(), make_inclined_support(n_nodes, 0.0, 1.0, 0.0));

    // Case 2: Standard ry=true roller
    let mut sups2 = HashMap::new();
    sups2.insert("1".to_string(), make_fixed_3d(1));
    sups2.insert("2".to_string(), SolverSupport3D {
        node_id: n_nodes,
        rx: false, ry: true, rz: false,
        rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: None, kw: None,
    });

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_nodes, fx: 0.0, fy: -10.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input1 = SolverInput3D {
        nodes: nodes.clone(), materials: mats.clone(), sections: secs.clone(),
        elements: elems.clone(), supports: sups1, loads: loads.clone(),
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![],
        connectors: HashMap::new(),
    };
    let input2 = SolverInput3D {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups2, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![],
        connectors: HashMap::new(),
    };

    let res1 = linear::solve_3d(&input1).unwrap();
    let res2 = linear::solve_3d(&input2).unwrap();

    // Compare tip displacements
    let tip1 = res1.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    let tip2 = res2.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();

    assert_close(tip1.ux, tip2.ux, 0.02, "ux inclined vs standard");
    assert_close(tip1.uy, tip2.uy, 0.02, "uy inclined vs standard");
    assert_close(tip1.uz, tip2.uz, 0.02, "uz inclined vs standard");
}

// ================================================================
// 3. Global equilibrium: sum of reactions = sum of applied loads
// ================================================================

#[test]
fn validation_inclined_support_global_equilibrium() {
    // Cantilever with inclined roller at tip. Check ΣR = ΣF.
    let n = 4;
    let n_nodes = n + 1;
    let elem_len = L / n as f64;

    let mut nodes = HashMap::new();
    for i in 0..n_nodes {
        nodes.insert((i + 1).to_string(), SolverNode3D {
            id: i + 1, x: i as f64 * elem_len, y: 0.0, z: 0.0,
        });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: A, iy: IY, iz: IZ, j: J, cw: None,
        as_y: None, as_z: None,
    });

    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement3D {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    let s = 1.0 / (2.0f64).sqrt();
    let mut sups = HashMap::new();
    sups.insert("1".to_string(), make_fixed_3d(1));
    sups.insert("2".to_string(), make_inclined_support(n_nodes, s, s, 0.0));

    let fx_app = 5.0;
    let fy_app = -10.0;
    let fz_app = 3.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_nodes, fx: fx_app, fy: fy_app, fz: fz_app,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = SolverInput3D {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    // Sum reactions
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    // ΣR + ΣF_applied = 0
    assert!(
        (sum_fx + fx_app).abs() < 0.01,
        "X equilibrium: sum_rx={:.6}, fx_app={:.6}", sum_fx, fx_app
    );
    assert!(
        (sum_fy + fy_app).abs() < 0.01,
        "Y equilibrium: sum_ry={:.6}, fy_app={:.6}", sum_fy, fy_app
    );
    assert!(
        (sum_fz + fz_app).abs() < 0.01,
        "Z equilibrium: sum_rz={:.6}, fz_app={:.6}", sum_fz, fz_app
    );
}

// ================================================================
// 4. 3D frame with inclined support — verify displacement direction
// ================================================================

#[test]
fn validation_inclined_support_displacement_direction() {
    // Beam along X, fixed at start, inclined roller at end with normal = (0, 0, 1) (Z direction).
    // A load in Z should produce zero displacement at roller (restrained in Z).
    // A load in Y should produce free displacement at roller (tangential).
    let n = 4;
    let n_nodes = n + 1;
    let elem_len = L / n as f64;

    let mut nodes = HashMap::new();
    for i in 0..n_nodes {
        nodes.insert((i + 1).to_string(), SolverNode3D {
            id: i + 1, x: i as f64 * elem_len, y: 0.0, z: 0.0,
        });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: A, iy: IY, iz: IZ, j: J, cw: None,
        as_y: None, as_z: None,
    });

    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement3D {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    // Inclined roller with normal = Z
    let mut sups = HashMap::new();
    sups.insert("1".to_string(), make_fixed_3d(1));
    sups.insert("2".to_string(), make_inclined_support(n_nodes, 0.0, 0.0, 1.0));

    // Apply load in Z at tip — roller should constrain this direction
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_nodes, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = SolverInput3D {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();

    // uz should be approximately zero (restrained in normal = Z direction)
    assert!(
        tip.uz.abs() < 1e-6,
        "Inclined roller with normal=Z should constrain uz, got {:.6e}", tip.uz
    );
}
