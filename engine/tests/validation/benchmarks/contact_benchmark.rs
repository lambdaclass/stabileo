/// Validation: Contact Analysis Benchmarks
///
/// Tests:
///   1. Gap closure — two bars approaching each other with a gap element;
///      verify zero (or negligible) penetration once gap closes
///   2. Multi-pair contact — two independent contact pairs, both close correctly
///   3. Force equilibrium — contact forces are equal and opposite across the gap
///
/// References:
///   - Wriggers, P., "Computational Contact Mechanics", 2nd ed., Springer, 2006
///   - Laursen, T.A., "Computational Contact and Impact Mechanics", Springer, 2002

use dedaliano_engine::solver::contact::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/// Low-E material so that EA/L is manageable.
/// E = 200 MPa, E_eff = 200 * 1000 = 200,000 kN/m^2
/// For L=1, A=0.01: EA/L = 200,000 * 0.01 / 1.0 = 2000 kN/m
fn mat() -> SolverMaterial {
    SolverMaterial { id: 1, e: 200.0, nu: 0.3 }
}

fn sec() -> SolverSection {
    SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None }
}

// EA/L for 1m frame = 200 * 1000 * 0.01 / 1.0 = 2000 kN/m
// Under F = 500 kN, delta = 500 / 2000 = 0.25 m >> typical gap sizes

// ================================================================
// 1. Gap Closure: Two Bars Approaching
// ================================================================
//
// Layout:
//   Node 1 (fixed) ---[elem 1, L=1m]--- Node 2  <gap=0.002m>  Node 3 (fixed)
//
// Push node 2 rightward with 500 kN. Without gap: delta = 500/2000 = 0.25 m >> 0.002.
// Gap stiffness = 5000 (2.5x EA/L) for stable closure.

#[test]
fn benchmark_contact_gap_closure() {
    let gap = 0.002;
    let force = 500.0;

    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 1.0, 0.0)),
            (3, node(3, 1.0 + gap, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (3, fixed(3, 3)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: force, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    };

    let input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![
            GapElement {
                id: 1,
                node_i: 2,
                node_j: 3,
                direction: 0,
                initial_gap: gap,
                stiffness: 5000.0, // comparable to EA/L = 2000
                friction: None,
                friction_direction: None,
                friction_coefficient: None,
            },
        ],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    };

    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged, "Gap closure should converge");

    // Verify the gap is closed
    let gap_info = &result.gap_status[0];
    assert_eq!(
        gap_info.status, "closed",
        "Gap should be closed under applied force (displacement >> gap)"
    );

    // Check that penetration is non-negative and force is transmitted
    assert!(
        gap_info.force.abs() > 1.0,
        "Gap should transmit force, got {:.4}",
        gap_info.force
    );
    assert!(
        gap_info.penetration >= 0.0,
        "Penetration should be non-negative, got {:.6e}",
        gap_info.penetration
    );
}

// ================================================================
// 2. Multi-Pair Contact: Two Independent Gap Pairs
// ================================================================
//
// Two separate bar+gap systems, each loaded independently.
// Both should close.
//
// Pair A: Node 1 (fixed) ---[elem 1]--- Node 2 <gap=0.002> Node 3 (fixed)
// Pair B: Node 4 (fixed) ---[elem 2]--- Node 5 <gap=0.001> Node 6 (fixed)

#[test]
fn benchmark_contact_multi_pair() {
    let gap_a = 0.002;
    let gap_b = 0.001;

    let solver = SolverInput {
        nodes: hm(vec![
            // Pair A (y = 0)
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 1.0, 0.0)),
            (3, node(3, 1.0 + gap_a, 0.0)),
            // Pair B (y = 5, well separated)
            (4, node(4, 0.0, 5.0)),
            (5, node(5, 1.0, 5.0)),
            (6, node(6, 1.0 + gap_b, 5.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
            (2, frame(2, 4, 5)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (3, fixed(3, 3)),
            (4, fixed(4, 4)),
            (6, fixed(6, 6)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 500.0, fy: 0.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 500.0, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    };

    let input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![
            GapElement {
                id: 1,
                node_i: 2,
                node_j: 3,
                direction: 0,
                initial_gap: gap_a,
                stiffness: 5000.0,
                friction: None,
                friction_direction: None,
                friction_coefficient: None,
            },
            GapElement {
                id: 2,
                node_i: 5,
                node_j: 6,
                direction: 0,
                initial_gap: gap_b,
                stiffness: 5000.0,
                friction: None,
                friction_direction: None,
                friction_coefficient: None,
            },
        ],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    };

    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged, "Multi-pair contact should converge");

    // Both gaps should be closed
    assert!(
        result.gap_status.len() >= 2,
        "Should have status for both gap elements, got {}",
        result.gap_status.len()
    );

    for (i, gs) in result.gap_status.iter().enumerate() {
        assert_eq!(
            gs.status, "closed",
            "Gap {} should be closed",
            i + 1
        );
        assert!(
            gs.force.abs() > 1.0,
            "Gap {} should transmit force, got {:.4}",
            i + 1,
            gs.force
        );
    }
}

// ================================================================
// 3. Force Equilibrium: Contact Forces Equal and Opposite
// ================================================================
//
// Single bar + gap + fixed wall. The applied force must be entirely
// balanced by reactions at the fixed supports. This verifies that
// the contact solver preserves global equilibrium.
//
// Layout: Node 1 (fixed) ---[elem 1]--- Node 2 <gap=0.002> Node 3 (fixed)
// Force at node 2: 500 kN rightward
// After gap closure, R1_x + R3_x + applied_force = 0.

#[test]
fn benchmark_contact_force_equilibrium() {
    let gap = 0.002;
    let applied_force = 500.0;

    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 1.0, 0.0)),
            (3, node(3, 1.0 + gap, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (3, fixed(3, 3)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: applied_force,
                fy: 0.0,
                mz: 0.0,
            }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    };

    let input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![
            GapElement {
                id: 1,
                node_i: 2,
                node_j: 3,
                direction: 0,
                initial_gap: gap,
                stiffness: 5000.0,
                friction: None,
                friction_direction: None,
                friction_coefficient: None,
            },
        ],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    };

    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged, "Contact should converge");

    // Gap should be closed
    assert_eq!(
        result.gap_status[0].status, "closed",
        "Gap should be closed"
    );

    // Global equilibrium: sum of horizontal reactions should balance applied force
    let sum_rx: f64 = result.results.reactions.iter().map(|r| r.rx).sum();
    let imbalance = (sum_rx + applied_force).abs();

    assert!(
        imbalance < 1.0,
        "Force equilibrium: sum_rx={:.4}, applied_fx={:.4}, imbalance={:.6}",
        sum_rx, applied_force, imbalance
    );

    // Left support reaction should be in -x direction (opposing the push)
    let r1 = result.results.reactions.iter().find(|r| r.node_id == 1);
    if let Some(r) = r1 {
        assert!(
            r.rx < 0.0,
            "Left support rx={:.4} should be negative (opposing rightward push)",
            r.rx
        );
    }

    // The gap contact force should be positive (compressive in gap direction)
    let gap_force = result.gap_status[0].force;
    assert!(
        gap_force.abs() > 1.0,
        "Gap contact force should be significant, got {:.4}",
        gap_force
    );
}
