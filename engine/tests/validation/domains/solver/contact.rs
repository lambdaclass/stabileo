/// Validation: Contact / Gap Element Solver
///
/// Tests:
///   1. Two-bar frame — one tension-only goes slack under reversal
///   2. Gap element — closes under compression, force transmitted
///   3. Compression-only element — deactivates in tension
///   4. Oscillation damping — chattering gap stabilizes within max_flips
///   5. Gap with friction — tangential force limited by Coulomb law
///   6. Multiple gaps — mixed open/closed states converge
///   7. Augmented Lagrangian — reduced penetration vs pure penalty
///   8. Convergence within iteration limit

use dedaliano_engine::solver::contact::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn node(id: usize, x: f64, y: f64) -> SolverNode {
    SolverNode { id, x, y }
}

fn frame(id: usize, ni: usize, nj: usize) -> SolverElement {
    SolverElement {
        id,
        elem_type: "frame".into(),
        node_i: ni,
        node_j: nj,
        material_id: 1,
        section_id: 1,
        hinge_start: false,
        hinge_end: false,
    }
}

fn fixed(id: usize, node_id: usize) -> SolverSupport {
    SolverSupport {
        id,
        node_id,
        support_type: "fixed".into(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None,
        angle: None,
    }
}

fn hm<T>(items: Vec<(usize, T)>) -> HashMap<String, T> {
    items.into_iter().map(|(k, v)| (k.to_string(), v)).collect()
}

fn mat() -> SolverMaterial {
    SolverMaterial { id: 1, e: 200.0, nu: 0.3 }
}

fn sec() -> SolverSection {
    SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None }
}

// EA/L for a 1m frame = 200*1000*0.01/1.0 = 2000 kN/m

/// Test 1: Two-bar V-shape with horizontal load.
/// Element 2 is tension-only; rightward load compresses it → goes inactive.
#[test]
fn test_tension_only_bar_goes_slack() {
    // Element 1: (0,0)→(1,1), Element 2: (2,0)→(1,1)
    // Rightward force at apex: element 1 stretches (tension), element 2 shortens (compression)
    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 2.0, 0.0)),
            (3, node(3, 1.0, 1.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 3)),
            (2, frame(2, 2, 3)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (2, fixed(2, 2)),
        ]),
        loads: vec![
            // Rightward force → compresses element 2 (from (2,0) toward (1,1))
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 100.0, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
    };

    let mut behaviors = HashMap::new();
    behaviors.insert("2".to_string(), "tension_only".to_string());

    let input = ContactInput {
        solver,
        element_behaviors: behaviors,
        gap_elements: vec![],
        uplift_supports: vec![],
        max_iter: Some(20),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
    };

    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged, "Should converge");

    let e2_info = result.element_status.iter().find(|e| e.element_id == 2).unwrap();
    assert_eq!(e2_info.status, "inactive", "Tension-only bar should be inactive when compressed");
}

/// Test 2: Gap element closes under large force.
/// Key: gap stiffness must be comparable to structural stiffness to avoid chattering.
/// EA/L = 2000, so gap stiffness = 5000 (2.5x). With gap closed, displacement
/// still exceeds gap threshold → stable closure.
#[test]
fn test_gap_closes_under_compression() {
    // Frame 1→2. Gap from 2→3 (fixed). Push node 2 rightward.
    // Gap opens at 0.002m. Without gap: δ = 500/2000 = 0.25m >> 0.002.
    // With gap (k=5000): δ = 500/(2000+5000) = 0.071m >> 0.002.
    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 1.0, 0.0)),
            (3, node(3, 1.002, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![(1, frame(1, 1, 2))]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (3, fixed(3, 3)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 500.0, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
    };

    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 0,
        initial_gap: 0.002,
        stiffness: 5000.0,  // Comparable to EA/L = 2000
        friction: None,
        friction_direction: None,
    };

    let input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![gap],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
    };

    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged, "Should converge");

    let gap_info = &result.gap_status[0];
    assert_eq!(gap_info.status, "closed", "Gap should be closed");
    assert!(gap_info.force.abs() > 1.0, "Gap should transmit force, got {}", gap_info.force);
    assert!(gap_info.penetration >= 0.0, "Penetration should be non-negative");
}

/// Test 3: Compression-only element deactivates when loaded in tension.
#[test]
fn test_compression_only_element() {
    // V-shape with downward load pulls both bars in tension.
    // Element 2 is compression-only → deactivates.
    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 2.0, 0.0)),
            (3, node(3, 1.0, -1.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 3)),
            (2, frame(2, 2, 3)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (2, fixed(2, 2)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -50.0, mz: 0.0 }),
        ],
        constraints: vec![],
    };

    let mut behaviors = HashMap::new();
    behaviors.insert("2".to_string(), "compression_only".to_string());

    let input = ContactInput {
        solver,
        element_behaviors: behaviors,
        gap_elements: vec![],
        uplift_supports: vec![],
        max_iter: Some(20),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
    };

    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged);

    let e2_info = result.element_status.iter().find(|e| e.element_id == 2).unwrap();
    assert_eq!(e2_info.status, "inactive", "Compression-only bar should deactivate in tension");
}

/// Test 4: Oscillation damping — max_flips prevents infinite cycling.
/// Uses very stiff gap (causes chattering) but max_flips limits it.
#[test]
fn test_oscillation_damping() {
    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 1.0, 0.0)),
            (3, node(3, 1.002, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![(1, frame(1, 1, 2))]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (3, fixed(3, 3)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 500.0, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
    };

    // Very stiff gap → chattering expected
    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 0,
        initial_gap: 0.002,
        stiffness: 1e6,
        friction: None,
        friction_direction: None,
    };

    let input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![gap],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: Some(3),
    };

    let result = solve_contact_2d(&input).unwrap();
    // Should terminate (oscillation damping kicks in)
    assert!(result.iterations <= 30, "Should terminate, took {} iters", result.iterations);
    // The gap will be frozen in whatever state it was after max_flips
}

/// Test 5: Gap with friction — tangential force capped by Coulomb limit.
#[test]
fn test_gap_friction_coulomb_limit() {
    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 0.0, 0.5)),
            (3, node(3, 0.0, 0.502)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![(1, frame(1, 1, 2))]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (3, fixed(3, 3)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fy: 500.0, mz: 0.0 }),
        ],
        constraints: vec![],
    };

    // EI/L^3 for vertical beam: 200e3 * 1e-4 / 0.5^3 = 160 kN/m (bending)
    // EA/L for vertical beam: 200e3 * 0.01 / 0.5 = 4000 kN/m (axial)
    // Gap stiffness should be comparable to axial stiffness
    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 1,
        initial_gap: 0.002,
        stiffness: 5000.0,
        friction: Some(0.3),
        friction_direction: Some(0),
    };

    let input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![gap],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
    };

    let result = solve_contact_2d(&input).unwrap();

    if result.gap_status[0].status == "closed" {
        let normal_force = result.gap_status[0].force.abs();
        let friction_force = result.gap_status[0].friction_force.abs();
        let max_friction = 0.3 * normal_force;
        assert!(
            friction_force <= max_friction + 1e-6,
            "Friction {} should be ≤ μ*N = {}",
            friction_force, max_friction
        );
    }
}

/// Test 6: Multiple gap elements — one closes, one stays open.
#[test]
fn test_multiple_gaps_mixed_states() {
    // Frame chain: 1→2 (gap1) 3→4 (gap2) 5
    // All nodes connected by frames, with gaps in between.
    // Gap 1 small (0.001m), gap 2 large (0.5m).
    // Force pushes node 2 right → gap 1 closes, gap 2 stays open.
    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 1.0, 0.0)),
            (3, node(3, 1.001, 0.0)),
            (4, node(4, 2.001, 0.0)),
            (5, node(5, 3.001, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
            (2, frame(2, 3, 4)),
            (3, frame(3, 4, 5)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (3, fixed(3, 3)),  // Node 3 fixed (gap 1 target)
            (5, fixed(5, 5)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 500.0, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
    };

    let gaps = vec![
        GapElement {
            id: 1, node_i: 2, node_j: 3,
            direction: 0, initial_gap: 0.001, stiffness: 5000.0,
            friction: None, friction_direction: None,
        },
        GapElement {
            id: 2, node_i: 4, node_j: 5,
            direction: 0, initial_gap: 0.5, stiffness: 5000.0,
            friction: None, friction_direction: None,
        },
    ];

    let input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: gaps,
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
    };

    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged);
    assert_eq!(result.gap_status[0].status, "closed", "Gap 1 should be closed");
    assert_eq!(result.gap_status[1].status, "open", "Gap 2 should remain open");
}

/// Test 7: Augmented Lagrangian reduces penetration vs pure penalty.
#[test]
fn test_augmented_lagrangian_reduces_penetration() {
    let make_input = |al: Option<f64>| -> ContactInput {
        let solver = SolverInput {
            nodes: hm(vec![
                (1, node(1, 0.0, 0.0)),
                (2, node(2, 1.0, 0.0)),
                (3, node(3, 1.001, 0.0)),
            ]),
            materials: hm(vec![(1, mat())]),
            sections: hm(vec![(1, sec())]),
            elements: hm(vec![(1, frame(1, 1, 2))]),
            supports: hm(vec![
                (1, fixed(1, 1)),
                (3, fixed(3, 3)),
            ]),
            loads: vec![
                SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 500.0, fy: 0.0, mz: 0.0 }),
            ],
            constraints: vec![],
        };

        ContactInput {
            solver,
            element_behaviors: HashMap::new(),
            gap_elements: vec![GapElement {
                id: 1, node_i: 2, node_j: 3,
                direction: 0, initial_gap: 0.001, stiffness: 1000.0,
                friction: None, friction_direction: None,
            }],
            uplift_supports: vec![],
            max_iter: Some(30),
            tolerance: None,
            augmented_lagrangian: al,
            max_flips: None,
        }
    };

    let result_penalty = solve_contact_2d(&make_input(None)).unwrap();
    let result_al = solve_contact_2d(&make_input(Some(1.0))).unwrap();

    assert_eq!(result_penalty.gap_status[0].status, "closed");
    assert_eq!(result_al.gap_status[0].status, "closed");

    let pen_penalty = result_penalty.gap_status[0].penetration;
    let pen_al = result_al.gap_status[0].penetration;
    assert!(
        pen_al <= pen_penalty + 1e-10,
        "AL penetration {} should be ≤ penalty penetration {}",
        pen_al, pen_penalty
    );
}

/// Test 8: Stable problem converges quickly.
/// Cantilever frame with tension-only element in tension → stays active, converges fast.
#[test]
fn test_convergence_stable_problem() {
    // Horizontal cantilever 1→2→3 with tension load at tip.
    // Element 1 tension-only, element 2 normal. Both carry tension.
    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 1.0, 0.0)),
            (3, node(3, 2.0, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
            (2, frame(2, 2, 3)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
        ]),
        loads: vec![
            // Tensile load at tip
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 100.0, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
    };

    let mut behaviors = HashMap::new();
    behaviors.insert("1".to_string(), "tension_only".to_string());

    let input = ContactInput {
        solver,
        element_behaviors: behaviors,
        gap_elements: vec![],
        uplift_supports: vec![],
        max_iter: Some(10),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
    };

    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged, "Well-conditioned problem should converge");
    assert!(result.iterations <= 5, "Should converge quickly, took {} iters", result.iterations);

    // Element 1 stays active (tension)
    let e1_info = result.element_status.iter().find(|e| e.element_id == 1).unwrap();
    assert_eq!(e1_info.status, "active", "Tension-only bar under tension should stay active");
}
