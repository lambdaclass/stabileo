/// Validation: Composite and Mixed Structures
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 14 (Beams and Frames)
///   - Kassimali, "Matrix Analysis of Structures", Ch. 8
///   - Salmon & Johnson, "Steel Structures", Ch. 10
///
/// Tests verify structures with mixed element types and properties:
///   1. Truss + frame: combined structure
///   2. Different E materials: steel + aluminum frame
///   3. Variable section: tapered beam approximation
///   4. Mixed hinge/rigid: partial release effects
///   5. Braced frame: diagonal bracing stiffness gain
///   6. Outrigger effect: tall structure with belt truss
///   7. Transfer beam: load redistribution
///   8. Composite action: different sections in same frame
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Truss + Frame Combined Structure
// ================================================================

#[test]
fn validation_composite_truss_frame() {
    let w = 8.0;
    let h = 4.0;
    let p = 20.0;

    // Portal frame with diagonal truss bracing in one bay
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 4, 3, 1, 1, false, false), // right col
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal brace
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];
    // Brace has smaller area
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ), (2, 0.002, 0.0)],
        elems, vec![(1, 1, "fixed"), (2, 4, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Truss+frame: ΣRx = -P");

    // Braced frame should be stiffer than unbraced
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let d_unbraced = linear::solve_2d(&input_unbraced).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_braced = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(d_braced < d_unbraced,
        "Braced < unbraced: {:.6e} < {:.6e}", d_braced, d_unbraced);
}

// ================================================================
// 2. Different E Materials
// ================================================================

#[test]
fn validation_composite_different_materials() {
    let l = 6.0;
    let n = 12;
    let p = 10.0;

    // Cantilever with E = 200 GPa
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "fixed", None, loads1);
    let d_steel = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Cantilever with E = 70 GPa (aluminum)
    let e_al = 70_000.0;
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input2 = make_beam(n, l, e_al, A, IZ, "fixed", None, loads2);
    let d_al = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // δ ∝ 1/E → d_al/d_steel = E_steel/E_al
    assert_close(d_al / d_steel, E / e_al, 0.02,
        "Materials: δ ∝ 1/E");
}

// ================================================================
// 3. Variable Section (Tapered Beam Approximation)
// ================================================================

#[test]
fn validation_composite_tapered_beam() {
    let l = 6.0;
    let n = 12;
    let p = 10.0;

    // Uniform section cantilever
    let loads_u = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_u = make_beam(n, l, E, A, IZ, "fixed", None, loads_u);
    let d_uniform = linear::solve_2d(&input_u).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Tapered: larger section near fixed end, smaller at tip
    // Approximate with 3 different sections
    let mut nodes = std::collections::HashMap::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * l / n as f64, y: 0.0,
        });
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    // 3 sections: large, medium, small
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: 2.0 * IZ, as_y: None }); // near fixed
    secs.insert("2".to_string(), SolverSection { id: 2, a: A, iz: IZ, as_y: None });       // middle
    secs.insert("3".to_string(), SolverSection { id: 3, a: A, iz: 0.5 * IZ, as_y: None }); // near tip
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
        let sec_id = if i < n / 3 { 1 } else if i < 2 * n / 3 { 2 } else { 3 };
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: sec_id,
            hinge_start: false, hinge_end: false,
        });
    }
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1,
        support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    let loads_t = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_t = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: loads_t,
    constraints: vec![],
    connectors: std::collections::HashMap::new(),
    };
    let d_tapered = linear::solve_2d(&input_t).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Tapered beam with larger section at fixed end should be stiffer
    assert!(d_tapered < d_uniform,
        "Tapered < uniform: {:.6e} < {:.6e}", d_tapered, d_uniform);
}

// ================================================================
// 4. Mixed Hinge/Rigid Connections
// ================================================================

#[test]
fn validation_composite_hinge_rigid() {
    let w = 6.0;
    let h = 4.0;
    let p = 10.0;

    // Rigid frame
    let input_rigid = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let d_rigid = linear::solve_2d(&input_rigid).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Frame with pinned beam-column connections (hinges at beam ends)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, true, true), // hinges at both ends of beam
        (3, "frame", 4, 3, 1, 1, false, false),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_hinged = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed"), (2, 4, "fixed")], loads);
    let d_hinged = linear::solve_2d(&input_hinged).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Hinged beam is more flexible
    assert!(d_hinged > d_rigid,
        "Hinged > rigid: {:.6e} > {:.6e}", d_hinged, d_rigid);
}

// ================================================================
// 5. Braced Frame: Diagonal Bracing Stiffness
// ================================================================

#[test]
fn validation_composite_braced_frame() {
    let w = 6.0;
    let h = 4.0;
    let p = 15.0;

    // Unbraced portal
    let input_ub = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let d_unbraced = linear::solve_2d(&input_ub).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // X-braced (both diagonals)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal 1
        (5, "truss", 4, 2, 1, 2, false, false), // diagonal 2
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_xb = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, 0.003, 0.0)],
        elems, vec![(1, 1, "fixed"), (2, 4, "fixed")], loads);
    let d_x_braced = linear::solve_2d(&input_xb).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // X-braced should be much stiffer
    assert!(d_x_braced < d_unbraced * 0.5,
        "X-braced << unbraced: {:.6e} < {:.6e}", d_x_braced, d_unbraced * 0.5);
}

// ================================================================
// 6. Outrigger Effect
// ================================================================

#[test]
fn validation_composite_outrigger() {
    let w = 8.0;
    let h1 = 4.0;
    let h2 = 4.0;
    let p = 10.0;

    // 2-story frame without outrigger (standard portal stacking)
    let nodes1 = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h1), (4, w, h1),
        (5, 0.0, h1 + h2), (6, w, h1 + h2),
    ];
    let elems1 = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input1 = make_input(nodes1, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems1,
        vec![(1, 1, "fixed"), (2, 2, "fixed")], loads1);
    let d_no_out = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 5).unwrap().ux.abs();

    // Same frame with stiff outrigger beam at floor 1 (very large IZ)
    let nodes2 = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h1), (4, w, h1),
        (5, 0.0, h1 + h2), (6, w, h1 + h2),
    ];
    let elems2 = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 2, false, false), // stiff outrigger
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input2 = make_input(nodes2, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, 100.0 * IZ)],
        elems2, vec![(1, 1, "fixed"), (2, 2, "fixed")], loads2);
    let d_with_out = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 5).unwrap().ux.abs();

    // Stiffer outrigger reduces drift
    assert!(d_with_out < d_no_out,
        "Outrigger reduces drift: {:.6e} < {:.6e}", d_with_out, d_no_out);
}

// ================================================================
// 7. Transfer Beam: Load Redistribution
// ================================================================

#[test]
fn validation_composite_transfer_beam() {
    let w = 6.0;
    let h = 4.0;
    let p = 20.0;

    // 2-story: upper columns offset from lower columns
    // Lower: columns at 0 and w
    // Upper: beam at floor 1, columns at w/3 and 2w/3
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),           // base
        (3, 0.0, h), (4, w, h),                 // floor 1
        (5, w / 3.0, h), (6, 2.0 * w / 3.0, h), // upper column bases
        (7, w / 3.0, 2.0 * h), (8, 2.0 * w / 3.0, 2.0 * h), // roof
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // lower left col
        (2, "frame", 2, 4, 1, 1, false, false), // lower right col
        (3, "frame", 3, 5, 1, 1, false, false), // transfer beam left
        (4, "frame", 5, 6, 1, 1, false, false), // transfer beam mid
        (5, "frame", 6, 4, 1, 1, false, false), // transfer beam right
        (6, "frame", 5, 7, 1, 1, false, false), // upper left col
        (7, "frame", 6, 8, 1, 1, false, false), // upper right col
        (8, "frame", 7, 8, 1, 1, false, false), // roof beam
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed"), (2, 2, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction = 2P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p, 0.02,
        "Transfer beam: ΣRy = 2P");

    // Both base columns carry load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    assert!(r1 > 0.0, "Transfer: left col carries load");
    assert!(r2 > 0.0, "Transfer: right col carries load");
}

// ================================================================
// 8. Different Sections in Same Frame
// ================================================================

#[test]
fn validation_composite_different_sections() {
    let w = 6.0;
    let h = 4.0;
    let p = 10.0;

    // Portal frame: stiff columns, flexible beam
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // stiff column
        (2, "frame", 2, 3, 1, 2, false, false), // flexible beam
        (3, "frame", 4, 3, 1, 1, false, false), // stiff column
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_sf = make_input(nodes.clone(), vec![(1, E, 0.3)],
        vec![(1, A, 10.0 * IZ), (2, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed"), (2, 4, "fixed")], loads.clone());
    let d_stiff_col = linear::solve_2d(&input_sf).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Opposite: flexible columns, stiff beam
    let elems2 = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // flexible column
        (2, "frame", 2, 3, 1, 1, false, false), // stiff beam
        (3, "frame", 4, 3, 1, 2, false, false), // flexible column
    ];
    let input_fs = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A, 10.0 * IZ), (2, A, IZ)],
        elems2, vec![(1, 1, "fixed"), (2, 4, "fixed")], loads);
    let d_flex_col = linear::solve_2d(&input_fs).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Frame with flexible columns drifts more
    assert!(d_flex_col > d_stiff_col,
        "Flex columns > stiff columns: {:.6e} > {:.6e}", d_flex_col, d_stiff_col);
}
