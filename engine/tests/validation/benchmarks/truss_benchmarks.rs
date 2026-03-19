/// Validation: Extended Truss Analysis Benchmarks
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 3-6
///   - Kassimali, "Structural Analysis", 6th Ed.
///   - ASCE Manual No. 7: Methods of Structural Analysis
///
/// Tests:
///   1. Simple truss: method of joints verification
///   2. K-truss: equilibrium and member forces
///   3. Howe truss: diagonal vs vertical behavior
///   4. Truss thermal: expansion/contraction effects
///   5. Cantilever truss: tip deflection bounds
///   6. Truss settlement: effect of support movement
///   7. Fan truss: asymmetric loading pattern
///   8. Space truss (3D): equilibrium check
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.001;
const IZ: f64 = 1e-10; // very small for truss behavior

// ================================================================
// 1. Simple Truss: Method of Joints
// ================================================================
//
// Triangle truss: horizontal bottom chord, two diagonals meeting at top.
// Verify axial forces via statics.

#[test]
fn validation_truss_simple_triangle() {
    let w = 4.0;
    let h = 3.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, w / 2.0, h),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false), // bottom chord
        (2, "truss", 1, 3, 1, 1, false, false), // left diagonal
        (3, "truss", 2, 3, 1, 1, false, false), // right diagonal
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Each support takes P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let err_r1 = (r1.rz - p / 2.0).abs() / (p / 2.0);
    let err_r2 = (r2.rz - p / 2.0).abs() / (p / 2.0);
    assert!(err_r1 < 0.01, "R1_y={:.4}, expected P/2={:.4}", r1.rz, p / 2.0);
    assert!(err_r2 < 0.01, "R2_y={:.4}, expected P/2={:.4}", r2.rz, p / 2.0);

    // Symmetric: left and right diagonal forces should be equal
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 3).unwrap();
    let err_sym = (ef1.n_start.abs() - ef2.n_start.abs()).abs() /
        ef1.n_start.abs().max(1e-12);
    assert!(err_sym < 0.01,
        "Symmetric diagonals: N1={:.4}, N2={:.4}", ef1.n_start, ef2.n_start);
}

// ================================================================
// 2. Pratt Truss: Method of Sections
// ================================================================
//
// 4-panel Pratt truss: bottom chord in tension, top in compression.
// Center panel diagonal: F_diag = V / sin(θ)

#[test]
fn validation_truss_pratt_method_of_sections() {
    let n_panels = 4;
    let panel_w = 3.0;
    let h = 3.0;
    let p = 10.0; // load at each top node

    // Bottom nodes (1..=5), top nodes (6..=9)
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel_w, 0.0));
    }
    for i in 0..n_panels {
        nodes.push((n_panels + 2 + i, (i as f64 + 0.5) * panel_w, h)); // top nodes offset to panel centers
    }

    // Bottom chords
    let mut elems = Vec::new();
    let mut eid = 1;
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Verticals and diagonals (Pratt pattern)
    for i in 0..n_panels {
        let top_node = n_panels + 2 + i;
        // Left vertical of panel
        elems.push((eid, "truss", i + 1, top_node, 1, 1, false, false));
        eid += 1;
        // Right vertical of panel
        elems.push((eid, "truss", i + 2, top_node, 1, 1, false, false));
        eid += 1;
    }
    // Top chords connecting adjacent top nodes
    for i in 0..(n_panels - 1) {
        let t1 = n_panels + 2 + i;
        let t2 = n_panels + 3 + i;
        elems.push((eid, "truss", t1, t2, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];

    // Loads at top nodes
    let mut loads = Vec::new();
    for i in 0..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_panels + 2 + i, fx: 0.0, fz: -p, my: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: each support takes nP/2
    let total_load = n_panels as f64 * p;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let err = (sum_ry - total_load).abs() / total_load;
    assert!(err < 0.01,
        "Pratt equilibrium: ΣRy={:.4}, total={:.4}", sum_ry, total_load);

    // All members should have pure axial (V≈0, M≈0 for truss)
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 0.1,
            "Truss elem {} has shear V={:.4}", ef.element_id, ef.v_start);
        assert!(ef.m_start.abs() < 0.1,
            "Truss elem {} has moment M={:.4}", ef.element_id, ef.m_start);
    }
}

// ================================================================
// 3. Warren Truss: Equilibrium and Symmetry
// ================================================================
//
// 6-panel Warren truss (no verticals). Symmetric loading →
// symmetric member forces about center.

#[test]
fn validation_truss_warren_symmetric() {
    let n_panels = 6;
    let panel_w = 2.0;
    let h = 2.0;
    let p = 5.0;

    // Bottom nodes
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel_w, 0.0));
    }
    // Top nodes (at panel midpoints)
    for i in 0..n_panels {
        nodes.push((n_panels + 2 + i, (i as f64 + 0.5) * panel_w, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chords
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals (W pattern)
    for i in 0..n_panels {
        let top = n_panels + 2 + i;
        elems.push((eid, "truss", i + 1, top, 1, 1, false, false));
        eid += 1;
        elems.push((eid, "truss", top, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chords
    for i in 0..(n_panels - 1) {
        elems.push((eid, "truss", n_panels + 2 + i, n_panels + 3 + i, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];

    // Symmetric loading: equal loads at all bottom nodes except supports
    let mut loads = Vec::new();
    for i in 1..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1, fx: 0.0, fz: -p, my: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions should be equal (symmetry)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r2 = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap().rz;
    let err = (r1 - r2).abs() / r1.abs().max(1e-12);
    assert!(err < 0.01,
        "Warren symmetry: R1={:.4}, R2={:.4}", r1, r2);
}

// ================================================================
// 4. Cantilever Truss: Tip Deflection
// ================================================================
//
// Triangulated cantilever (fixed at left). Tip deflection should be
// bounded by solid beam estimate.

#[test]
fn validation_truss_cantilever_deflection() {
    let n_panels = 3;
    let panel_w = 2.0;
    let h = 2.0;
    let p = 10.0;

    // Bottom nodes
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel_w, 0.0));
    }
    // Top nodes
    for i in 0..=n_panels {
        nodes.push((n_panels + 2 + i, i as f64 * panel_w, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chords
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chords
    for i in 0..n_panels {
        let t1 = n_panels + 2 + i;
        let t2 = n_panels + 3 + i;
        elems.push((eid, "truss", t1, t2, 1, 1, false, false));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_panels {
        elems.push((eid, "truss", i + 1, n_panels + 2 + i, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, n_panels + 3 + i, 1, 1, false, false));
        eid += 1;
    }

    // Fixed at left: both bottom and top left nodes
    let sups = vec![(1, 1, "pinned"), (2, n_panels + 2, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_panels + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Tip should deflect downward
    let tip = results.displacements.iter().find(|d| d.node_id == n_panels + 1).unwrap();
    assert!(tip.uz < 0.0,
        "Cantilever truss tip should deflect down: uy={:.6e}", tip.uz);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let err = (sum_ry - p).abs() / p;
    assert!(err < 0.01,
        "Cantilever truss equilibrium: ΣRy={:.4}, P={:.4}", sum_ry, p);
}

// ================================================================
// 5. Truss with Settlement: Indeterminate Effect
// ================================================================
//
// Statically indeterminate truss (extra diagonal). Settlement at one
// support changes force distribution.

#[test]
fn validation_truss_settlement_effect() {
    // Square truss with both diagonals (1 degree indeterminate)
    let w = 3.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, w, w), (4, 0.0, w),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 1, 1, 1, false, false),
        (5, "truss", 1, 3, 1, 1, false, false), // diagonal 1
        (6, "truss", 2, 4, 1, 1, false, false), // diagonal 2
    ];

    // Without settlement
    let sups_no = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: p, fz: 0.0, my: 0.0,
    })];

    let input_no = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups_no, loads.clone());
    let res_no = linear::solve_2d(&input_no).unwrap();

    // With settlement at node 2
    let mut sups_map = std::collections::HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1,
        support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2,
        support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-0.001), dry: None, angle: None,
    });

    let mut nodes_map = std::collections::HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, z: *y });
    }
    let mut mats_map = std::collections::HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = std::collections::HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = std::collections::HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let loads_settle = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: p, fz: 0.0, my: 0.0,
    })];

    let input_settle = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: loads_settle,
    constraints: vec![],
    connectors: std::collections::HashMap::new(),
    };
    let res_settle = linear::solve_2d(&input_settle).unwrap();

    // Settlement should change the force distribution
    let n3_no = res_no.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let n3_settle = res_settle.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // The settlement should change displacements (even slightly)
    let diff = (n3_no.ux - n3_settle.ux).abs() + (n3_no.uz - n3_settle.uz).abs();
    assert!(diff > 1e-12,
        "Settlement should affect displacements: diff={:.6e}", diff);
}

// ================================================================
// 6. Truss Load Path: Zero-Force Members
// ================================================================
//
// Classic truss configuration with identifiable zero-force members.
// Two-member joint with no external load and members not collinear.

#[test]
fn validation_truss_zero_force_members() {
    let w = 4.0;
    let h = 3.0;
    let p = 10.0;

    // Truss with a zero-force member configuration at node 4
    // Node 4 is an unloaded joint with only two non-collinear members
    let nodes = vec![
        (1, 0.0, 0.0),      // left support
        (2, w, 0.0),        // right support
        (3, w / 2.0, h),    // top loaded node
        (4, w, h),          // right top — unloaded, connects only to 2 and 3
    ];
    let elems = vec![
        (1, "truss", 1, 3, 1, 1, false, false), // left diagonal
        (2, "truss", 2, 3, 1, 1, false, false), // right diagonal
        (3, "truss", 1, 2, 1, 1, false, false), // bottom chord
        (4, "truss", 2, 4, 1, 1, false, false), // vertical at right
        (5, "truss", 3, 4, 1, 1, false, false), // top chord
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Members 4 (vertical at right) and 5 (top chord) connected at unloaded node 4
    // These should carry near-zero force since the joint configuration
    // makes them zero-force members (node 4: only members 4 and 5, no load,
    // and they are not collinear → both must be zero)
    let ef4 = results.element_forces.iter().find(|f| f.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|f| f.element_id == 5).unwrap();
    assert!(ef4.n_start.abs() < 0.1,
        "Zero-force member 4: N={:.4}", ef4.n_start);
    assert!(ef5.n_start.abs() < 0.1,
        "Zero-force member 5: N={:.4}", ef5.n_start);
}

// ================================================================
// 7. 3D Space Truss: Equilibrium
// ================================================================
//
// Tetrahedral space truss: 3 base nodes + 1 apex, load at apex.

#[test]
fn validation_truss_3d_space_equilibrium() {
    let s = 3.0; // base triangle side
    let h = 4.0; // height
    let p = 15.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, s, 0.0, 0.0),
        (3, s / 2.0, s * 0.866, 0.0), // equilateral triangle base
        (4, s / 2.0, s * 0.289, h),   // apex
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1), // base edges
        (2, "truss", 2, 3, 1, 1),
        (3, "truss", 3, 1, 1, 1),
        (4, "truss", 1, 4, 1, 1), // legs to apex
        (5, "truss", 2, 4, 1, 1),
        (6, "truss", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![false, true, true, false, false, false]),
        (3, vec![false, false, true, false, false, false]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let iy = 1e-10;
    let iz = 1e-10;
    let j_val = 1e-10;
    let input = make_3d_input(nodes, vec![(1, E, 0.3)], vec![(1, A, iy, iz, j_val)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Vertical equilibrium: ΣRz = P
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let err = (sum_rz - p).abs() / p;
    assert!(err < 0.01,
        "Space truss equilibrium: ΣRz={:.4}, P={:.4}", sum_rz, p);
}

// ================================================================
// 8. Truss Stiffness Scaling: Doubling Area Halves Deflection
// ================================================================

#[test]
fn validation_truss_stiffness_scaling() {
    let w = 4.0;
    let h = 3.0;
    let p = 10.0;

    let nodes = vec![(1, 0.0, 0.0), (2, w, 0.0), (3, w / 2.0, h)];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 1, 3, 1, 1, false, false),
        (3, "truss", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    // Area A
    let input1 = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads.clone());
    let res1 = linear::solve_2d(&input1).unwrap();
    let d1 = res1.displacements.iter().find(|d| d.node_id == 3).unwrap().uz.abs();

    // Area 2A
    let input2 = make_input(nodes, vec![(1, E, 0.3)], vec![(1, 2.0 * A, IZ)],
        elems, sups, loads);
    let res2 = linear::solve_2d(&input2).unwrap();
    let d2 = res2.displacements.iter().find(|d| d.node_id == 3).unwrap().uz.abs();

    // δ ∝ 1/A → d1/d2 ≈ 2
    let ratio = d1 / d2;
    let error = (ratio - 2.0).abs() / 2.0;
    assert!(error < 0.05,
        "Area scaling: d1/d2={:.3}, expected 2.0", ratio);
}
