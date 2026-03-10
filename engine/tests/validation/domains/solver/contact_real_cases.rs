/// Contact real cases: harder gap and friction scenarios.
///
/// Tests:
///   5D. Gap closure and reopening cycle
///   5E. Contact with friction limit
///   5F. Multi-gap mixed state with progressive closure

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

fn make_contact_input(
    solver: SolverInput,
    gaps: Vec<GapElement>,
    behaviors: HashMap<String, String>,
) -> ContactInput {
    ContactInput {
        solver,
        element_behaviors: behaviors,
        gap_elements: gaps,
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: Some(1e-6),
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    }
}

// ── 5D: Gap closure and reopening cycle ────────────────────────────

/// Two-bar system with gap element. Under load, gap closes;
/// when load is removed, gap should reopen.
#[test]
fn contact_real_5d_gap_closure_and_reopening() {
    // Setup: node 1 (fixed) → frame → node 2 → gap(0.002) → node 3 (fixed)
    // Push node 2 rightward: gap closes (displacement >> 0.002)
    let solver_closed = SolverInput {
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
        connectors: HashMap::new(),
    };

    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 0,
        initial_gap: 0.002,
        stiffness: 5000.0,
        friction: None,
        friction_direction: None,
        friction_coefficient: None,
    };

    // Load case 1: large force closes gap
    let input1 = make_contact_input(solver_closed, vec![gap.clone()], HashMap::new());
    let result1 = solve_contact_2d(&input1).unwrap();
    assert!(result1.converged, "Case 1 should converge");
    assert_eq!(result1.gap_status[0].status, "closed", "Gap should be closed under load");
    assert!(result1.gap_status[0].force.abs() > 1.0, "Gap should transmit significant force");

    // Load case 2: very small force — gap should stay open
    let solver_open = SolverInput {
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
            // Tiny force — not enough to close the 2mm gap
            // EA/L = 200*1000*0.01/1.0 = 2000. δ = F/(EA/L) = 0.001/2000 = 5e-7 << 0.002
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.001, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    };

    let gap2 = gap.clone();
    let input2 = make_contact_input(solver_open, vec![gap2], HashMap::new());
    let result2 = solve_contact_2d(&input2).unwrap();
    assert!(result2.converged, "Case 2 should converge");
    assert_eq!(result2.gap_status[0].status, "open", "Gap should be open with tiny load");
    assert!(result2.gap_status[0].force.abs() < 0.01, "Open gap should transmit no force");
}

// ── 5E: Contact with friction ──────────────────────────────────────

/// Gap element with friction: tangential force should be bounded by μ × normal force.
#[test]
fn contact_real_5e_friction_limit() {
    // Vertical beam (1→2) with gap from 2→3 in Y-direction
    // Normal compression closes gap, horizontal force tests friction
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
            // Large upward force to close gap + horizontal force for friction
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 20.0, fy: 500.0, mz: 0.0 }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    };

    let mu = 0.4;
    let gap = GapElement {
        id: 1,
        node_i: 2,
        node_j: 3,
        direction: 1,
        initial_gap: 0.002,
        stiffness: 5000.0,
        friction: Some(mu),
        friction_direction: Some(0),
        friction_coefficient: None,
    };

    let input = make_contact_input(solver, vec![gap], HashMap::new());
    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged, "Should converge");

    if result.gap_status[0].status == "closed" {
        let normal_force = result.gap_status[0].force.abs();
        let friction_force = result.gap_status[0].friction_force.abs();
        let max_friction = mu * normal_force;

        // Coulomb limit: friction ≤ μ × N
        assert!(
            friction_force <= max_friction + 1e-4,
            "Friction {:.4} should be ≤ μ*N = {:.4}",
            friction_force, max_friction
        );

        // Normal force should be non-trivial
        assert!(normal_force > 1.0,
            "Normal force should be significant, got {:.4}", normal_force);
    }
}

// ── 5F: Multi-gap mixed state with progressive closure ─────────────

/// 3 gaps in parallel from a single bar to independent fixed targets.
/// Smallest gap closes first under moderate force; largest stays open.
#[test]
fn contact_real_5f_progressive_gap_closure() {
    // Single bar: node 1 (fixed) → frame → node 2 (loaded)
    // Three gaps from node 2 to independent fixed nodes at different distances:
    //   gap1: 2→3 (gap=0.001), gap2: 2→4 (gap=0.005), gap3: 2→5 (gap=0.05)
    // EA/L = 200*0.01/1.0 = 2.0
    // With F=10, free δ = F/(EA/L) = 5.0 >> all gaps if no gap stiffness
    // With gap1 closed: F = k_frame * δ + k_gap1 * (δ - 0.001)
    //   10 = 2δ + 5000(δ - 0.001) → 5002δ = 15 → δ ≈ 0.003
    //   So gap1 closes (0.003 > 0.001), gap2 stays open (0.003 < 0.005)
    let solver = SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 1.0, 0.0)),
            (3, node(3, 1.001, 0.0)),  // gap = 0.001
            (4, node(4, 1.005, 0.0)),  // gap = 0.005
            (5, node(5, 1.05, 0.0)),   // gap = 0.05
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (3, fixed(3, 3)),
            (4, fixed(4, 4)),
            (5, fixed(5, 5)),
        ]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fy: 0.0, mz: 0.0 }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    };

    let gaps = vec![
        GapElement {
            id: 1, node_i: 2, node_j: 3, direction: 0,
            initial_gap: 0.001, stiffness: 5000.0,
            friction: None, friction_direction: None, friction_coefficient: None,
        },
        GapElement {
            id: 2, node_i: 2, node_j: 4, direction: 0,
            initial_gap: 0.005, stiffness: 5000.0,
            friction: None, friction_direction: None, friction_coefficient: None,
        },
        GapElement {
            id: 3, node_i: 2, node_j: 5, direction: 0,
            initial_gap: 0.05, stiffness: 5000.0,
            friction: None, friction_direction: None, friction_coefficient: None,
        },
    ];

    let input = make_contact_input(solver, gaps, HashMap::new());
    let result = solve_contact_2d(&input).unwrap();
    assert!(result.converged, "Should converge");

    // Gap 1 (smallest, 0.001m) should be closed
    let g1 = result.gap_status.iter().find(|g| g.id == 1).unwrap();
    assert_eq!(g1.status, "closed", "Gap 1 (smallest) should close first");
    assert!(g1.force.abs() > 0.1, "Closed gap should transmit force");

    // Gap 3 (largest, 0.05m) should stay open
    let g3 = result.gap_status.iter().find(|g| g.id == 3).unwrap();
    assert_eq!(g3.status, "open", "Gap 3 (largest) should stay open");
}
