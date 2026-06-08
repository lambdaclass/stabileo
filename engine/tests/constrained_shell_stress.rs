//! Regression: the constrained 3D solver must recover shell stresses.
//!
//! `solve_3d` delegates to `solve_constrained_3d` whenever the model carries
//! constraints (rigid diaphragms, eccentric connections, member/shell offsets).
//! That path used to return empty plate/quad stress arrays, so constrained
//! shell models showed blank contours/tables/reports. These tests pin:
//!   1. a constrained shell model returns NON-EMPTY, finite shell stresses;
//!   2. an inert (zero-offset) constraint yields stresses IDENTICAL to the
//!      unconstrained solve (recovery is consistent, mechanics unchanged);
//!   3. a constrained FRAME-ONLY model still returns EMPTY shell stresses
//!      (no spurious output, no regression).

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Simply-supported MITC4 plate (nx×ny) under uniform pressure, plus optional
/// extra (dangling) nodes and constraints.
fn make_plate(nx: usize, ny: usize, extra_nodes: &[(usize, f64, f64, f64)], constraints: Vec<Constraint>) -> SolverInput3D {
    let (lx, ly, t, e, nu) = (4.0, 4.0, 0.15, 30_000_000.0, 0.2);
    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            let x = (i as f64 / nx as f64) * lx;
            let y = (j as f64 / ny as f64) * ly;
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
            grid[i][j] = nid;
            nid += 1;
        }
    }
    for &(id, x, y, z) in extra_nodes {
        nodes.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(qid.to_string(), SolverQuadElement {
                id: qid,
                nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                material_id: 1,
                thickness: t,
            });
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // Simply-supported boundary (restrain z), pin one corner fully.
    let mk_support = |node_id: usize, full: bool| SolverSupport3D {
        node_id,
        rx: full, ry: full, rz: true,
        rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    };
    let mut supports = HashMap::new();
    let mut boundary = Vec::new();
    for j in 0..=ny { boundary.push(grid[0][j]); boundary.push(grid[nx][j]); }
    for i in 0..=nx { boundary.push(grid[i][0]); boundary.push(grid[i][ny]); }
    boundary.sort(); boundary.dedup();
    let mut sid = 1;
    for &n in &boundary { supports.insert(sid.to_string(), mk_support(n, false)); sid += 1; }
    supports.insert(sid.to_string(), mk_support(grid[0][0], true));

    let loads: Vec<SolverLoad3D> = (1..=quads.len())
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -5.0 }))
        .collect();

    SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(), elements: HashMap::new(),
        supports, loads, constraints, left_hand: None,
        plates: HashMap::new(), quads, quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    }
}

#[test]
fn constrained_shell_model_returns_nonempty_shell_stresses() {
    // 3×3 plate + a real (non-inert) eccentric connection on a free node.
    // Without the fix, quad_stresses would be empty.
    let plate = make_plate(3, 3, &[(1000, 1.3333, 1.3333, 0.0)], vec![
        Constraint::EccentricConnection(EccentricConnectionConstraint {
            master_node: 6, slave_node: 1000, offset_x: 0.0, offset_y: 0.0, offset_z: 0.0,
            releases: vec![false; 6],
        }),
    ]);
    // sanity: constraints present → constrained path is exercised
    assert!(!plate.constraints.is_empty());
    let r = linear::solve_3d(&plate).expect("constrained shell solve failed");
    assert!(!r.quad_stresses.is_empty(), "constrained shell model returned NO quad stresses (the bug)");
    assert_eq!(r.quad_stresses.len(), 9, "expected one stress entry per quad");
    for s in &r.quad_stresses {
        assert!(s.von_mises.is_finite() && s.von_mises >= 0.0, "von Mises must be finite & non-negative");
        assert!(s.sigma_xx.is_finite() && s.mx.is_finite(), "stress/moment components must be finite");
    }
    // a loaded SS plate develops real bending → at least one non-trivial moment
    assert!(r.quad_stresses.iter().any(|s| s.mx.abs() > 1e-6 || s.my.abs() > 1e-6),
        "loaded plate should develop bending moments");
}

#[test]
fn inert_constraint_matches_unconstrained_shell_stresses() {
    // Unconstrained reference.
    let plate_u = make_plate(3, 3, &[], vec![]);
    let ru = linear::solve_3d(&plate_u).expect("unconstrained solve failed");
    assert!(ru.quad_stresses.is_empty() == false);

    // Inert: dangling slave node coincident with node 6, zero-offset rigid link.
    // The slave carries no element/load, so the plate's free DOFs are unchanged →
    // recovered shell stresses must equal the unconstrained ones.
    let n6 = plate_u.nodes.get("6").unwrap();
    let plate_c = make_plate(3, 3, &[(1000, n6.x, n6.y, n6.z)], vec![
        Constraint::EccentricConnection(EccentricConnectionConstraint {
            master_node: 6, slave_node: 1000, offset_x: 0.0, offset_y: 0.0, offset_z: 0.0,
            releases: vec![false; 6],
        }),
    ]);
    let rc = linear::solve_3d(&plate_c).expect("constrained solve failed");

    assert_eq!(ru.quad_stresses.len(), rc.quad_stresses.len(), "quad count changed");
    let by_id = |v: &[QuadStress]| v.iter().map(|s| (s.element_id, s.clone())).collect::<HashMap<_, _>>();
    let um = by_id(&ru.quad_stresses);
    let cm = by_id(&rc.quad_stresses);
    for (id, su) in &um {
        let sc = cm.get(id).expect("missing quad in constrained result");
        assert!((su.von_mises - sc.von_mises).abs() < 1e-6, "vM mismatch q{}: {} vs {}", id, su.von_mises, sc.von_mises);
        assert!((su.sigma_xx - sc.sigma_xx).abs() < 1e-6, "σxx mismatch q{}", id);
        assert!((su.mx - sc.mx).abs() < 1e-6 && (su.my - sc.my).abs() < 1e-6, "moment mismatch q{}", id);
    }
}

#[test]
fn constrained_frame_only_model_has_no_shell_stresses() {
    // Two-frame model with an eccentric connection, NO shells.
    let mut nodes = HashMap::new();
    nodes.insert("1".into(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".into(), SolverNode3D { id: 2, x: 4.0, y: 0.0, z: 0.0 });
    nodes.insert("3".into(), SolverNode3D { id: 3, x: 4.0, y: 0.0, z: 0.5 });
    let mut mats = HashMap::new();
    mats.insert("1".into(), SolverMaterial { id: 1, e: 30_000_000.0, nu: 0.2 });
    let mut secs = HashMap::new();
    secs.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.09, iy: 6.75e-4, iz: 6.75e-4, j: 1.0e-3, cw: None, as_y: None, as_z: None });
    let mut elems = HashMap::new();
    elems.insert("1".into(), SolverElement3D {
        id: 1, elem_type: "frame".into(), node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });
    let mk_fixed = |node_id: usize| SolverSupport3D {
        node_id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    };
    let mut supports = HashMap::new();
    supports.insert("1".into(), mk_fixed(1));
    let input = SolverInput3D {
        nodes, materials: mats, sections: secs, elements: elems, supports,
        loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 3, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        constraints: vec![Constraint::EccentricConnection(EccentricConnectionConstraint {
            master_node: 2, slave_node: 3, offset_x: 0.0, offset_y: 0.0, offset_z: 0.5, releases: vec![false; 6],
        })],
        left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    };
    let r = linear::solve_3d(&input).expect("constrained frame solve failed");
    assert!(r.quad_stresses.is_empty(), "frame-only model must have no quad stresses");
    assert!(r.plate_stresses.is_empty(), "frame-only model must have no plate stresses");
    // mechanics still produced (no regression to the constrained frame path)
    assert!(!r.displacements.is_empty() && !r.element_forces.is_empty());
}
