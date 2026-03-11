/// Validation: 3D Contact Solver
///
/// Tests for the iterative contact/gap solver in 3 dimensions.
/// Covers tension-only elements, compression-only elements, gap closure,
/// friction, oscillation damping, augmented Lagrangian, and convergence.
///
/// References:
///   - Wriggers, "Computational Contact Mechanics", 2nd Ed., Springer, Ch. 2-5
///   - Kikuchi & Oden, "Contact Problems in Elasticity", SIAM, Ch. 3-4
///   - Simo & Laursen, "An Augmented Lagrangian Treatment of Contact
///     Problems Involving Friction", Computers & Structures 42(1), 1992
///
/// Tests:
///   1. 3D tension-only element goes slack under compression
///   2. 3D gap element closes under load in Z direction
///   3. 3D compression-only element deactivates in tension
///   4. 3D gap with friction in Y, gap in Z
///   5. 3D multiple gaps: one closes, one stays open
///   6. 3D oscillation damping stabilizes chattering
///   7. 3D augmented Lagrangian reduces penetration
///   8. 3D convergence for stable problem
use dedaliano_engine::solver::contact::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// Material and section constants
const E: f64 = 200.0;     // MPa (200 GPa = 200_000 MPa, but here kN/mm² units: 200 MPa means light material)
const E_STEEL: f64 = 200_000.0; // MPa (steel)
const NU: f64 = 0.3;
const A: f64 = 0.01;      // m² (100 cm²)
const IY: f64 = 1e-4;     // m⁴
const IZ: f64 = 2e-4;     // m⁴
const J: f64 = 8e-5;      // m⁴

/// Helper: build a ContactInput3D from a SolverInput3D and contact parameters.
fn make_contact_input_3d(
    solver: SolverInput3D,
    element_behaviors: HashMap<String, String>,
    gap_elements: Vec<GapElement>,
    uplift_supports: Vec<usize>,
    max_iter: Option<usize>,
    tolerance: Option<f64>,
    augmented_lagrangian: Option<f64>,
    max_flips: Option<usize>,
) -> ContactInput3D {
    ContactInput3D {
        solver,
        element_behaviors,
        gap_elements,
        uplift_supports,
        max_iter,
        tolerance,
        augmented_lagrangian,
        max_flips,
        damping_coefficient: None,
        al_max_iter: None,
    }
}

/// Helper: build a 3D SolverInput3D directly (avoiding the helpers module for
/// cases where we need truss elements mixed with frames).
fn build_solver_input_3d(
    nodes: Vec<(usize, f64, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64, f64, f64)>,
    elems: Vec<(usize, &str, usize, usize, usize, usize)>,
    sups: Vec<(usize, Vec<bool>)>,
    loads: Vec<SolverLoad3D>,
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
        secs_map.insert(id.to_string(), SolverSection3D {
            id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None,
        });
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
    for (i, (nid, dofs)) in sups.iter().enumerate() {
        sups_map.insert((i + 1).to_string(), SolverSupport3D {
            node_id: *nid,
            rx: dofs[0], ry: dofs[1], rz: dofs[2],
            rrx: dofs[3], rry: dofs[4], rrz: dofs[5],
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            rw: None, kw: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None,
        });
    }
    SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

fn fixed_dofs() -> Vec<bool> {
    vec![true, true, true, true, true, true]
}

// ================================================================
// 1. 3D Tension-Only Element Goes Slack Under Compression
// ================================================================
//
// A vertical truss (cable) element connects two nodes along Z.
// The top node is pushed downward (compression), so a tension-only
// element should go slack (inactive). The frame column beside it
// carries all load.
//
// Structure:
//   Node 1 (0,0,0) fixed base
//   Node 2 (2,0,0) fixed base
//   Node 3 (0,0,3) free top
//   Node 4 (2,0,3) free top
//   Elem 1: frame column 1->3
//   Elem 2: frame column 2->4
//   Elem 3: truss brace 3->4 (tension_only) along X
//   Load: push node 3 toward node 4 in +X (puts brace in compression)
//
// Expected: Element 3 goes inactive (slack).
//
// Reference: Wriggers, "Computational Contact Mechanics", Ch. 2.

#[test]
fn validation_3d_tension_only_slack_under_compression() {
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 2.0, 0.0, 0.0),
        (3, 0.0, 0.0, 3.0),
        (4, 2.0, 0.0, 3.0),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1),  // column
        (2, "frame", 2, 4, 1, 1),  // column
        (3, "truss", 3, 4, 1, 1),  // brace (tension_only)
    ];
    let sups = vec![
        (1, fixed_dofs()),
        (2, fixed_dofs()),
    ];
    // Push node 3 toward node 4 -- compresses the brace
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 10.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let solver = build_solver_input_3d(
        nodes, vec![(1, E_STEEL, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    let mut behaviors = HashMap::new();
    behaviors.insert("3".to_string(), "tension_only".to_string());

    let input = make_contact_input_3d(
        solver, behaviors, vec![], vec![],
        Some(20), None, None, None,
    );

    let result = solve_contact_3d(&input).unwrap();

    assert!(result.converged, "Should converge for tension-only slack case");
    assert!(result.iterations <= 10, "Should converge quickly, got {} iterations", result.iterations);

    // Element 3 should be inactive (slack under compression)
    let elem3_status = result.element_status.iter()
        .find(|e| e.element_id == 3)
        .expect("Element 3 should be in status list");
    assert_eq!(elem3_status.status, "inactive",
        "Tension-only element under compression should be inactive");
    assert_eq!(elem3_status.behavior, "tension_only");
}

// ================================================================
// 2. 3D Gap Element Closes Under Load in Z Direction
// ================================================================
//
// Two stacked nodes with a gap in the Z direction. A frame column
// sits above the gap. When a downward load (-Z) is applied, the gap
// closes and the contact force is nonzero.
//
// Structure:
//   Node 1 (0,0,0) fixed base
//   Node 2 (0,0,1) free, bottom of gap
//   Node 3 (0,0,1.005) free, top of gap (5mm gap)
//   Node 4 (0,0,4) free, top of column
//   Elem 1: frame 1->2 (lower column)
//   Elem 2: frame 3->4 (upper column)
//   Gap: between nodes 2 and 3, direction Z, initial gap 0.005 m
//   Load: -50 kN at node 4 in Z
//
// With EA/L = 200000*1000*0.01/1 = 2,000,000 kN/m for columns,
// the displacement under 50 kN is tiny (~25e-6 m), but the gap is 5mm.
// We need a large enough load to close a 5mm gap. Using softer material
// or larger gap.
//
// Simplified: use gap=0.001 m (1mm), load=-100 kN downward. Column
// shortening = PL/(EA) with L=1, EA = 200000*1000*0.01 = 2e6 kN.
// Delta = 100/2e6 = 0.05mm. Still much less than 1mm.
//
// Instead, use a very small gap (0.0001 m = 0.1mm) or a softer material.
// Using E=200 MPa (soft) and gap=0.0001 m:
// EA = 200*1000*0.01 = 2000 kN. Column shortening = 100/2000 = 0.05 m.
// That's 50mm, easily closes a 0.1mm gap.
//
// Reference: Kikuchi & Oden, "Contact Problems in Elasticity", Ch. 3.

#[test]
fn validation_3d_gap_closes_under_z_load() {
    let gap_size = 0.001; // 1 mm gap
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, 1.0),
        (3, 0.0, 0.0, 1.0 + gap_size),
        (4, 0.0, 0.0, 4.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // lower column
        (2, "frame", 3, 4, 1, 1), // upper column
    ];
    let sups = vec![
        (1, fixed_dofs()),
        (4, fixed_dofs()),
    ];
    // Downward load at node 2 pushes it down; upward load at node 3 pushes it up
    // Actually, we fix both ends and let the gap be between the two columns.
    // Load applied to close the gap: push node 2 upward or node 3 downward.
    // With fixed ends, applying opposing forces:
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: 5.0,  // push node 2 up toward gap
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -5.0, // push node 3 down toward gap
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let solver = build_solver_input_3d(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Gap stiffness ~ EA/L = 200*1000*0.01/1 = 2000 kN/m, use 3000
    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 2, // Z
        initial_gap: gap_size,
        stiffness: 3000.0,
        friction: None,
        friction_direction: None,
        friction_coefficient: None,
    };

    let input = make_contact_input_3d(
        solver, HashMap::new(), vec![gap], vec![],
        Some(30), None, None, None,
    );

    let result = solve_contact_3d(&input).unwrap();

    assert!(result.converged, "Gap closure problem should converge");

    let gap_info = &result.gap_status[0];
    assert_eq!(gap_info.status, "closed",
        "Gap should be closed under opposing loads pushing nodes together, got status={}",
        gap_info.status);
    assert!(gap_info.force.abs() > 0.0,
        "Closed gap should have nonzero contact force, got {}", gap_info.force);
}

// ================================================================
// 3. 3D Compression-Only Element Deactivates in Tension
// ================================================================
//
// A horizontal truss strut is marked as compression_only. It connects
// two free top nodes of a portal frame. When the top is pushed apart
// (lateral loads in opposite X directions), the strut goes into
// tension and should deactivate.
//
// Structure:
//   Node 1 (0,0,0) fixed base
//   Node 2 (4,0,0) fixed base
//   Node 3 (0,0,3) free top left
//   Node 4 (4,0,3) free top right
//   Elem 1: frame column 1->3
//   Elem 2: frame column 2->4
//   Elem 3: truss 3->4 (compression_only)
//   Load: push node 3 in -X and node 4 in +X (pulls strut in tension)
//
// Expected: Element 3 goes inactive (cannot resist tension).
//
// Reference: Wriggers, "Computational Contact Mechanics", Ch. 2.

#[test]
fn validation_3d_compression_only_deactivates_in_tension() {
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 4.0, 0.0, 0.0),
        (3, 0.0, 0.0, 3.0),
        (4, 4.0, 0.0, 3.0),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1),  // left column
        (2, "frame", 2, 4, 1, 1),  // right column
        (3, "truss", 3, 4, 1, 1),  // top strut (compression_only)
    ];
    let sups = vec![
        (1, fixed_dofs()),
        (2, fixed_dofs()),
    ];
    // Push top nodes apart to put strut in tension
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: -10.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 10.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let solver = build_solver_input_3d(
        nodes, vec![(1, E_STEEL, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    let mut behaviors = HashMap::new();
    behaviors.insert("3".to_string(), "compression_only".to_string());

    let input = make_contact_input_3d(
        solver, behaviors, vec![], vec![],
        Some(20), None, None, None,
    );

    let result = solve_contact_3d(&input).unwrap();

    assert!(result.converged, "Should converge for compression-only case");

    let elem3_status = result.element_status.iter()
        .find(|e| e.element_id == 3)
        .expect("Element 3 should be in status list");
    assert_eq!(elem3_status.status, "inactive",
        "Compression-only element under tension should be inactive, got '{}'",
        elem3_status.status);
    assert_eq!(elem3_status.behavior, "compression_only");
}

// ================================================================
// 4. 3D Gap with Friction in Y, Gap in Z
// ================================================================
//
// A gap element in the Z direction with Coulomb friction in the Y
// direction. When the gap closes and there is a tangential (Y)
// displacement, friction force should develop.
//
// Structure:
//   Node 1 (0,0,0) fixed
//   Node 2 (0,0,1) free, bottom of gap
//   Node 3 (0,0,1.0005) free, top of gap
//   Node 4 (0,0,4) fixed
//   Frame columns: 1->2 and 3->4
//   Gap between 2 and 3 in Z, friction in Y direction
//   Load: push nodes together in Z + lateral Y force
//
// Expected: gap closes, friction_force is nonzero and bounded by mu * normal_force.
//
// Reference: Simo & Laursen, "Augmented Lagrangian Treatment of Contact
//   Problems Involving Friction", Computers & Structures 42(1), 1992.

#[test]
fn validation_3d_gap_with_friction() {
    let gap_size = 0.0005; // 0.5 mm
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, 1.0),
        (3, 0.0, 0.0, 1.0 + gap_size),
        (4, 0.0, 0.0, 4.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, fixed_dofs()),
        (4, fixed_dofs()),
    ];
    // Push gap closed and apply lateral Y force
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: 5.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -5.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        // Lateral Y forces to create tangential displacement at gap
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 2.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -2.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let solver = build_solver_input_3d(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    let mu = 0.3;
    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 2,            // Z (normal)
        initial_gap: gap_size,
        stiffness: 4000.0,       // ~ 2x EA/L
        friction: Some(mu),
        friction_direction: Some(1), // Y (tangential)
        friction_coefficient: None,
    };

    let input = make_contact_input_3d(
        solver, HashMap::new(), vec![gap], vec![],
        Some(30), None, None, None,
    );

    let result = solve_contact_3d(&input).unwrap();

    assert!(result.converged, "Friction gap problem should converge");

    let gap_info = &result.gap_status[0];
    assert_eq!(gap_info.status, "closed",
        "Gap should be closed, got '{}'", gap_info.status);

    // Friction force should be nonzero when gap is closed and there's tangential load
    // The friction force is bounded by mu * |normal_force|
    let max_friction = mu * gap_info.force.abs();
    assert!(gap_info.friction_force.abs() <= max_friction + 1e-6,
        "Friction force {:.6} should be bounded by mu*N = {:.6}",
        gap_info.friction_force.abs(), max_friction);

    // With tangential loading, some friction should develop
    if gap_info.force.abs() > 1e-6 {
        // If the gap has a nonzero normal force, friction should also be nonzero
        // given the lateral loading
        assert!(gap_info.friction_force.abs() > 1e-10 || max_friction < 1e-10,
            "With lateral loading and closed gap, friction force should be nonzero");
    }
}

// ================================================================
// 5. 3D Multiple Gaps: One Closes, One Stays Open
// ================================================================
//
// Two parallel column pairs, each with a gap between the top of a
// lower column and the bottom of an upper column. Gap A is small
// (closes under load) and gap B is large (stays open).
//
// Each column pair is independently supported, so there is no
// singularity when gaps are open.
//
// Structure (pair A, small gap):
//   Node 1 (0,0,0) fixed, Node 2 (0,0,1) free
//   Node 3 (0,0,1+gapA) free, Node 4 (0,0,3) fixed
//   Columns: 1->2 and 3->4
//   Gap A between 2 and 3
//
// Structure (pair B, large gap):
//   Node 5 (3,0,0) fixed, Node 6 (3,0,1) free
//   Node 7 (3,0,1+gapB) free, Node 8 (3,0,3) fixed
//   Columns: 5->6 and 7->8
//   Gap B between 6 and 7
//
// Load: push pair A together (closes gap A), no load on pair B.
//
// Reference: Kikuchi & Oden, "Contact Problems in Elasticity", Ch. 4.

#[test]
fn validation_3d_multiple_gaps_selective_closure() {
    let gap_a = 0.0005;  // 0.5 mm -- will close
    let gap_b = 0.050;   // 50 mm -- stays open

    let nodes = vec![
        // Pair A
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, 1.0),
        (3, 0.0, 0.0, 1.0 + gap_a),
        (4, 0.0, 0.0, 3.0),
        // Pair B
        (5, 3.0, 0.0, 0.0),
        (6, 3.0, 0.0, 1.0),
        (7, 3.0, 0.0, 1.0 + gap_b),
        (8, 3.0, 0.0, 3.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),  // pair A lower
        (2, "frame", 3, 4, 1, 1),  // pair A upper
        (3, "frame", 5, 6, 1, 1),  // pair B lower
        (4, "frame", 7, 8, 1, 1),  // pair B upper
    ];
    let sups = vec![
        (1, fixed_dofs()),
        (4, fixed_dofs()),
        (5, fixed_dofs()),
        (8, fixed_dofs()),
    ];
    // Push pair A together (closes gap A)
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: 5.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -5.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let solver = build_solver_input_3d(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    let gap_elems = vec![
        GapElement {
            id: 1,
            node_i: 2,
            node_j: 3,
            direction: 2,
            initial_gap: gap_a,
            stiffness: 4000.0,
            friction: None,
            friction_direction: None,
            friction_coefficient: None,
        },
        GapElement {
            id: 2,
            node_i: 6,
            node_j: 7,
            direction: 2,
            initial_gap: gap_b,
            stiffness: 4000.0,
            friction: None,
            friction_direction: None,
            friction_coefficient: None,
        },
    ];

    let input = make_contact_input_3d(
        solver, HashMap::new(), gap_elems, vec![],
        Some(30), None, None, None,
    );

    let result = solve_contact_3d(&input).unwrap();

    assert!(result.converged, "Multi-gap problem should converge");
    assert_eq!(result.gap_status.len(), 2, "Should have 2 gap statuses");

    let gap_a_info = result.gap_status.iter().find(|g| g.id == 1).unwrap();
    let gap_b_info = result.gap_status.iter().find(|g| g.id == 2).unwrap();

    assert_eq!(gap_a_info.status, "closed",
        "Small gap A should be closed, got '{}'", gap_a_info.status);
    assert_eq!(gap_b_info.status, "open",
        "Large gap B should remain open, got '{}'", gap_b_info.status);

    // Gap A should have contact force; gap B should not
    assert!(gap_a_info.force.abs() > 1e-10,
        "Closed gap A should have nonzero force");
    assert!(gap_b_info.force.abs() < 1e-10,
        "Open gap B should have zero force, got {}", gap_b_info.force);
}

// ================================================================
// 6. 3D Oscillation Damping Stabilizes Chattering
// ================================================================
//
// A gap element at the boundary of closure (marginal load) can cause
// oscillation: open->closed->open->closed... The max_flips parameter
// should stabilize this by forcing the element to keep its status
// after too many flips.
//
// We set max_flips=2 so after 2 status changes the element is locked.
// The solver should converge (or at least terminate) without infinite
// oscillation.
//
// Structure: same as test 2 but with a load that is right at the
// boundary of closing the gap, adjusted to provoke oscillation.
//
// Reference: Wriggers, "Computational Contact Mechanics", Ch. 5 (iteration strategies).

#[test]
fn validation_3d_oscillation_damping() {
    // Use a gap where the load is marginal -- just at closure boundary.
    // With EA/L = 200*1000*0.01/1 = 2000 kN/m, a load of 1 kN gives
    // displacement of 0.5mm (1/2000). Use gap of exactly 0.0005 m.
    let gap_size = 0.0005;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, 1.0),
        (3, 0.0, 0.0, 1.0 + gap_size),
        (4, 0.0, 0.0, 4.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, fixed_dofs()),
        (4, fixed_dofs()),
    ];
    // Marginal load: just enough to approach the gap boundary
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: 1.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -1.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let solver = build_solver_input_3d(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 2,
        initial_gap: gap_size,
        stiffness: 3000.0,
        friction: None,
        friction_direction: None,
        friction_coefficient: None,
    };

    let max_flips = 2;
    let max_iter = 20;
    let input = make_contact_input_3d(
        solver, HashMap::new(), vec![gap], vec![],
        Some(max_iter), None, None, Some(max_flips),
    );

    let result = solve_contact_3d(&input).unwrap();

    // The key check: the solver should terminate within max_iter iterations.
    // Without oscillation damping, it could cycle indefinitely.
    assert!(result.iterations <= max_iter,
        "Solver should terminate within {} iterations, took {}",
        max_iter, result.iterations);

    // The gap status should be deterministic (either open or closed, not flipping)
    let gap_info = &result.gap_status[0];
    assert!(gap_info.status == "open" || gap_info.status == "closed",
        "Gap should have a definite status, got '{}'", gap_info.status);
}

// ================================================================
// 7. 3D Augmented Lagrangian Reduces Penetration
// ================================================================
//
// With pure penalty, closed gaps have some penetration (displacement
// beyond the gap boundary). The augmented Lagrangian method iteratively
// updates a Lagrange multiplier to reduce this penetration.
//
// We run the same problem twice: once with pure penalty (AL=0) and
// once with augmented Lagrangian (AL>0). The AL result should have
// less penetration.
//
// Reference: Simo & Laursen, "Augmented Lagrangian Treatment of Contact
//   Problems Involving Friction", Computers & Structures 42(1), 1992.

#[test]
fn validation_3d_augmented_lagrangian_reduces_penetration() {
    let gap_size = 0.0005;
    let make_problem = |al_factor: f64| -> ContactInput3D {
        let nodes = vec![
            (1, 0.0, 0.0, 0.0),
            (2, 0.0, 0.0, 1.0),
            (3, 0.0, 0.0, 1.0 + gap_size),
            (4, 0.0, 0.0, 4.0),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 3, 4, 1, 1),
        ];
        let sups = vec![
            (1, fixed_dofs()),
            (4, fixed_dofs()),
        ];
        // Use a strong load to ensure clear gap closure even with AL correction
        let loads = vec![
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2, fx: 0.0, fy: 0.0, fz: 20.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }),
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 3, fx: 0.0, fy: 0.0, fz: -20.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }),
        ];

        let solver = build_solver_input_3d(
            nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
            elems, sups, loads,
        );

        let gap = GapElement {
            id: 1,
            node_i: 2,
            node_j: 3,
            direction: 2,
            initial_gap: gap_size,
            stiffness: 3000.0, // moderate penalty
            friction: None,
            friction_direction: None,
            friction_coefficient: None,
        };

        let al = if al_factor > 0.0 { Some(al_factor) } else { None };
        make_contact_input_3d(
            solver, HashMap::new(), vec![gap], vec![],
            Some(30), None, al, None,
        )
    };

    // Pure penalty
    let result_penalty = solve_contact_3d(&make_problem(0.0)).unwrap();
    // Augmented Lagrangian with a moderate factor
    let result_al = solve_contact_3d(&make_problem(0.1)).unwrap();

    // Both should complete within iteration limit
    assert!(result_penalty.iterations <= 30,
        "Penalty method should complete");
    assert!(result_al.iterations <= 30,
        "AL method should complete");

    let pen_penalty = result_penalty.gap_status[0].penetration;
    let pen_al = result_al.gap_status[0].penetration;

    // Both gaps should be closed
    assert_eq!(result_penalty.gap_status[0].status, "closed",
        "Penalty gap should be closed");
    assert_eq!(result_al.gap_status[0].status, "closed",
        "AL gap should be closed");

    // AL should have less or equal penetration compared to pure penalty.
    // Allow a small tolerance for numerical noise.
    assert!(pen_al <= pen_penalty + 1e-8,
        "AL penetration ({:.6e}) should be <= penalty penetration ({:.6e})",
        pen_al, pen_penalty);
}

// ================================================================
// 8. 3D Convergence for Stable Problem
// ================================================================
//
// A well-posed 3D contact problem with clear gap closure should
// converge in a small number of iterations. This tests that the
// iterative scheme is efficient.
//
// Structure: two columns pressing together via a gap element.
// A strong load clearly closes the gap, so the solver should
// converge in 2-3 iterations (first iteration detects gap closure,
// second confirms no further status changes).
//
// Reference: Wriggers, "Computational Contact Mechanics", Ch. 2.

#[test]
fn validation_3d_convergence_stable_problem() {
    let gap_size = 0.001; // 1 mm gap
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // base of lower column
        (2, 0.0, 0.0, 2.0),  // top of lower column
        (3, 0.0, 0.0, 2.0 + gap_size), // bottom of upper column
        (4, 0.0, 0.0, 5.0),  // top of upper column
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // lower column
        (2, "frame", 3, 4, 1, 1), // upper column
    ];
    let sups = vec![
        (1, fixed_dofs()),
        (4, fixed_dofs()),
    ];
    // Strong opposing loads that clearly close the gap
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: 15.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -15.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let solver = build_solver_input_3d(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 2, // Z
        initial_gap: gap_size,
        stiffness: 4000.0,
        friction: None,
        friction_direction: None,
        friction_coefficient: None,
    };

    let input = make_contact_input_3d(
        solver, HashMap::new(), vec![gap], vec![],
        Some(30), None, None, None,
    );

    let result = solve_contact_3d(&input).unwrap();

    assert!(result.converged, "Stable problem should converge");

    // For a clear-cut problem, convergence should be fast
    assert!(result.iterations <= 5,
        "Stable contact problem should converge in few iterations, got {}",
        result.iterations);

    // Gap should be closed
    let gap_info = &result.gap_status[0];
    assert_eq!(gap_info.status, "closed",
        "Gap should be closed under strong opposing loads, got '{}'", gap_info.status);

    // Verify results are physically sensible: node 2 should displace in +Z
    let d2 = result.results.displacements.iter()
        .find(|d| d.node_id == 2)
        .expect("Node 2 should have displacements");
    assert!(d2.uz > 0.0,
        "Node 2 should displace in +Z under upward load, got uz={}", d2.uz);
}
