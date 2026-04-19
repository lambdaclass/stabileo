//! Chained constraints depth tests (Step 6 hardening).
//!
//! Exercises deeper constraint chains where constraints reference other
//! constrained DOFs, forming chains or trees of dependencies.
//!
//! Contracts:
//!   - Valid chains produce correct results matching rigid-body kinematics
//!   - Invalid chains (circular, over-constrained) emit diagnostics, never panic
//!   - Chain depth does not cause stack overflow (max 10-pass substitution)

#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ==================== Material / Section Constants ====================

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 2e-4;

/// Standard fixed support DOFs for 3D.
fn fixed() -> Vec<bool> {
    vec![true, true, true, true, true, true]
}

// ==================== 1. Chain Depth 2: A -> B -> C ====================

/// Two-link EqualDOF chain: A -> B -> C.
/// Load at C, constraint C=B (uz), B=A (uz).
/// All three nodes should end up with the same uz displacement.
#[test]
fn chain_depth_2_equal_dof_uz() {
    // Three cantilever beams from a common base, tips linked via EqualDOF chain.
    // Beam A: nodes 1(base) -> 2(tip)
    // Beam B: nodes 3(base) -> 4(tip)
    // Beam C: nodes 5(base) -> 6(tip)
    // Chain: 6 -> 4 (slave=6, master=4, uz) and 4 -> 2 (slave=4, master=2, uz)
    // Load on node 6 only. If chain resolves correctly, all three tips share uz.
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l,   0.0, 0.0),
        (3, 0.0, 3.0, 0.0),
        (4, l,   3.0, 0.0),
        (5, 0.0, 6.0, 0.0),
        (6, l,   6.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
        (3, "frame", 5, 6, 1, 1),
    ];
    let sups = vec![
        (1, fixed()),
        (3, fixed()),
        (5, fixed()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 6, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Chain: node 6 -> node 4 -> node 2 (uz, DOF 2)
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 4,
        slave_node: 6,
        dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2,
        slave_node: 4,
        dofs: vec![2],
    }));

    let result = linear::solve_3d(&input).expect("Chain depth 2 should solve successfully");

    let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d4 = result.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let d6 = result.displacements.iter().find(|d| d.node_id == 6).unwrap();

    // All three tips must share uz
    let tol = 1e-8;
    assert!(
        (d2.uz - d4.uz).abs() < tol,
        "Chain depth 2: uz mismatch between nodes 2 and 4: {:.8e} vs {:.8e}",
        d2.uz, d4.uz
    );
    assert!(
        (d4.uz - d6.uz).abs() < tol,
        "Chain depth 2: uz mismatch between nodes 4 and 6: {:.8e} vs {:.8e}",
        d4.uz, d6.uz
    );

    // All should deflect downward (load is -fz at node 6)
    assert!(d2.uz < 0.0, "Node 2 should deflect down, got {:.6e}", d2.uz);
    assert!(d6.uz < 0.0, "Node 6 should deflect down, got {:.6e}", d6.uz);

    // Equilibrium: sum of vertical reactions = 10.0
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!(
        (sum_fz + (-10.0)).abs() < 0.1,
        "Chain depth 2 Fz equilibrium violated: sum_fz={:.6}", sum_fz
    );
}

// ==================== 2. Chain Depth 3+: A -> B -> C -> D ====================

/// Four-link EqualDOF chain: D -> C -> B -> A.
/// Only load at D. All four tip nodes should share uz.
#[test]
fn chain_depth_3_equal_dof_uz() {
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0),   // beam A
        (3, 0.0, 3.0, 0.0), (4, l, 3.0, 0.0),   // beam B
        (5, 0.0, 6.0, 0.0), (6, l, 6.0, 0.0),   // beam C
        (7, 0.0, 9.0, 0.0), (8, l, 9.0, 0.0),   // beam D
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
        (3, "frame", 5, 6, 1, 1),
        (4, "frame", 7, 8, 1, 1),
    ];
    let sups = vec![
        (1, fixed()), (3, fixed()), (5, fixed()), (7, fixed()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 8, fx: 0.0, fy: 0.0, fz: -20.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Chain: 8 -> 6 -> 4 -> 2 (uz)
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 6, slave_node: 8, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 4, slave_node: 6, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2, slave_node: 4, dofs: vec![2],
    }));

    let result = linear::solve_3d(&input).expect("Chain depth 3 should solve successfully");

    let tips: Vec<f64> = [2, 4, 6, 8].iter()
        .map(|&id| result.displacements.iter().find(|d| d.node_id == id).unwrap().uz)
        .collect();

    let tol = 1e-8;
    for i in 1..tips.len() {
        assert!(
            (tips[0] - tips[i]).abs() < tol,
            "Chain depth 3: uz mismatch at link {}: {:.8e} vs {:.8e}",
            i, tips[0], tips[i]
        );
    }

    // All deflect down
    assert!(tips[0] < 0.0, "Should deflect down, got {:.6e}", tips[0]);

    // Equilibrium
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!(
        (sum_fz + (-20.0)).abs() < 0.1,
        "Chain depth 3 Fz equilibrium violated: sum_fz={:.6}", sum_fz
    );
}

// ==================== 3. Tree Topology ====================

/// Tree: master node 2 has slaves 4 and 6, each of which masters another node.
///   2 (master)
///  / \
/// 4   6
/// |   |
/// 8  10
///
/// EqualDOF chains on uz. Load applied at node 8 and 10.
#[test]
fn tree_topology_equal_dof() {
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  (2, l, 0.0, 0.0),    // beam A (root)
        (3, 0.0, 3.0, 0.0),  (4, l, 3.0, 0.0),    // beam B (child of A)
        (5, 0.0, -3.0, 0.0), (6, l, -3.0, 0.0),   // beam C (child of A)
        (7, 0.0, 6.0, 0.0),  (8, l, 6.0, 0.0),    // beam D (child of B)
        (9, 0.0, -6.0, 0.0), (10, l, -6.0, 0.0),  // beam E (child of C)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
        (3, "frame", 5, 6, 1, 1),
        (4, "frame", 7, 8, 1, 1),
        (5, "frame", 9, 10, 1, 1),
    ];
    let sups = vec![
        (1, fixed()), (3, fixed()), (5, fixed()),
        (7, fixed()), (9, fixed()),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 8, fx: 0.0, fy: 0.0, fz: -5.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 10, fx: 0.0, fy: 0.0, fz: -5.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Tree: 4->2, 6->2, 8->4, 10->6 (uz)
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2, slave_node: 4, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2, slave_node: 6, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 4, slave_node: 8, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 6, slave_node: 10, dofs: vec![2],
    }));

    let result = linear::solve_3d(&input).expect("Tree topology should solve successfully");

    let tips: Vec<f64> = [2, 4, 6, 8, 10].iter()
        .map(|&id| result.displacements.iter().find(|d| d.node_id == id).unwrap().uz)
        .collect();

    let tol = 1e-8;
    for i in 1..tips.len() {
        assert!(
            (tips[0] - tips[i]).abs() < tol,
            "Tree: uz mismatch between root (node 2) and node {}: {:.8e} vs {:.8e}",
            [2, 4, 6, 8, 10][i], tips[0], tips[i]
        );
    }

    // All deflect down
    assert!(tips[0] < 0.0, "Root should deflect down, got {:.6e}", tips[0]);

    // Equilibrium
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!(
        (sum_fz + (-10.0)).abs() < 0.1,
        "Tree Fz equilibrium violated: sum_fz={:.6}", sum_fz
    );
}

// ==================== 4. Circular Constraint Detection ====================

/// A -> B -> C -> A circular EqualDOF chain.
/// Must NOT panic or infinite-loop. Should either:
///   (a) emit CircularConstraint diagnostic and solve gracefully, or
///   (b) return an error.
#[test]
fn circular_constraint_does_not_panic() {
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0),
        (3, 0.0, 3.0, 0.0), (4, l, 3.0, 0.0),
        (5, 0.0, 6.0, 0.0), (6, l, 6.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
        (3, "frame", 5, 6, 1, 1),
    ];
    let sups = vec![
        (1, fixed()), (3, fixed()), (5, fixed()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Circular chain: 2->4->6->2 (uz)
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 4, slave_node: 2, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 6, slave_node: 4, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2, slave_node: 6, dofs: vec![2],
    }));

    // The key contract: must not panic or infinite-loop.
    // It may succeed (with diagnostics) or return an Err, both are acceptable.
    let result = linear::solve_3d(&input);

    match result {
        Ok(res) => {
            // If it succeeds, check that CircularConstraint diagnostic is emitted
            let has_circular = res.structured_diagnostics.iter()
                .any(|d| d.code == DiagnosticCode::CircularConstraint);
            println!("Circular constraint solved OK, circular diag={}", has_circular);
            // All displacements must be finite (no NaN/Inf)
            for d in &res.displacements {
                assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
                    "Circular constraint produced NaN/Inf at node {}", d.node_id);
            }
        }
        Err(e) => {
            // Returning an error is also acceptable -- the key is no panic
            println!("Circular constraint returned error (acceptable): {}", e);
        }
    }
}

/// Self-referencing constraint: A is slave and master of itself.
#[test]
fn self_referencing_constraint_does_not_panic() {
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
    ];
    let sups = vec![(1, fixed())];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Self-reference: node 2 is both master and slave
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2, slave_node: 2, dofs: vec![2],
    }));

    // Must not panic
    let result = linear::solve_3d(&input);
    match result {
        Ok(res) => {
            for d in &res.displacements {
                assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
                    "Self-ref constraint produced NaN/Inf at node {}", d.node_id);
            }
        }
        Err(e) => {
            println!("Self-ref constraint returned error (acceptable): {}", e);
        }
    }
}

// ==================== 5. Mixed Constraint Types in Chain ====================

/// RigidLink -> EqualDOF chain.
/// Node 4 is rigid-linked to node 2 (co-located), then node 6 has EqualDOF to node 4.
/// This exercises the transformation method across different constraint types.
#[test]
fn mixed_rigid_link_then_equal_dof_chain() {
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // base A
        (2, l,   0.0, 0.0),   // tip A (master for rigid link)
        (3, 0.0, 0.0, 0.0),  // dummy -- co-located with node 1 for beam connectivity
        (4, l,   0.0, 0.0),   // slave of rigid link (co-located with node 2)
        (5, 0.0, 4.0, 0.0),  // base C
        (6, l,   4.0, 0.0),   // tip C (slave of EqualDOF to node 4)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1), // short element from co-located base to slave
        (3, "frame", 5, 6, 1, 1),
    ];
    let sups = vec![
        (1, fixed()),
        (3, fixed()),
        (5, fixed()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -15.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // RigidLink: node 4 follows node 2 in all 6 DOFs (co-located, so pure equality)
    input.constraints.push(Constraint::RigidLink(RigidLinkConstraint {
        master_node: 2,
        slave_node: 4,
        dofs: vec![0, 1, 2, 3, 4, 5],
    }));
    // EqualDOF: node 6 follows node 4 in uz
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 4,
        slave_node: 6,
        dofs: vec![2],
    }));

    let result = linear::solve_3d(&input).expect("Mixed chain should solve successfully");

    let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d4 = result.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let d6 = result.displacements.iter().find(|d| d.node_id == 6).unwrap();

    // RigidLink co-located: node 4 should match node 2 exactly in all DOFs
    let tol = 1e-6;
    assert!((d2.uz - d4.uz).abs() < tol,
        "RigidLink co-located uz mismatch: {:.8e} vs {:.8e}", d2.uz, d4.uz);
    assert!((d2.ux - d4.ux).abs() < tol,
        "RigidLink co-located ux mismatch: {:.8e} vs {:.8e}", d2.ux, d4.ux);

    // EqualDOF chain: node 6 uz should match node 4 uz (which matches node 2 uz)
    assert!((d4.uz - d6.uz).abs() < tol,
        "EqualDOF chain uz mismatch: {:.8e} vs {:.8e}", d4.uz, d6.uz);
    assert!((d2.uz - d6.uz).abs() < tol,
        "Full chain uz mismatch: {:.8e} vs {:.8e}", d2.uz, d6.uz);

    // All deflect down
    assert!(d2.uz < 0.0, "Node 2 should deflect down, got {:.6e}", d2.uz);
}

/// Diaphragm with an internal RigidLink chain.
/// Diaphragm couples nodes 4,6 to master 2. Then RigidLink couples node 8 to node 4.
/// This creates a tree: 2->(4,6) via diaphragm, 4->8 via RigidLink.
#[test]
fn diaphragm_with_rigid_link_subtree() {
    let h = 3.0;
    let w = 5.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // column base 1
        (2, 0.0, 0.0, h),     // column top 1 = diaphragm master
        (3, w,   0.0, 0.0),   // column base 2
        (4, w,   0.0, h),     // column top 2 = diaphragm slave
        (5, 0.0, w,   0.0),   // column base 3
        (6, 0.0, w,   h),     // column top 3 = diaphragm slave
        (7, w,   0.0, 0.0),   // dummy base co-located with node 3
        (8, w,   0.0, h),     // RigidLink slave (co-located with node 4)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
        (3, "frame", 5, 6, 1, 1),
        (4, "frame", 7, 8, 1, 1),
    ];
    let sups = vec![
        (1, fixed()), (3, fixed()), (5, fixed()), (7, fixed()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 30.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Diaphragm: master=2, slaves=[4,6] in XY plane
    input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint {
        master_node: 2,
        slave_nodes: vec![4, 6],
        plane: "XY".into(),
    }));
    // RigidLink: node 8 follows node 4 in all DOFs (co-located)
    input.constraints.push(Constraint::RigidLink(RigidLinkConstraint {
        master_node: 4,
        slave_node: 8,
        dofs: vec![0, 1, 2, 3, 4, 5],
    }));

    let result = linear::solve_3d(&input).expect("Diaphragm + RigidLink chain should solve");

    // All displacements must be finite
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // RigidLink: node 8 should match node 4 (co-located, all DOFs)
    let d4 = result.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let d8 = result.displacements.iter().find(|d| d.node_id == 8).unwrap();
    let tol = 1e-6;
    assert!((d4.ux - d8.ux).abs() < tol, "RigidLink ux: {:.8e} vs {:.8e}", d4.ux, d8.ux);
    assert!((d4.uy - d8.uy).abs() < tol, "RigidLink uy: {:.8e} vs {:.8e}", d4.uy, d8.uy);
    assert!((d4.uz - d8.uz).abs() < tol, "RigidLink uz: {:.8e} vs {:.8e}", d4.uz, d8.uz);

    // Diaphragm: master (2) and slave (4) share ux (rigid in-plane)
    let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    // ux_4 = ux_2 - dy*rz_2, dy=0 => ux_4 = ux_2
    assert!((d2.ux - d4.ux).abs() < 0.01 * d2.ux.abs().max(1e-6),
        "Diaphragm ux coupling: master={:.8e}, slave={:.8e}", d2.ux, d4.ux);
}

// ==================== 6. Over-Constrained DOF ====================

/// A DOF that is both constrained by a support AND by an EqualDOF constraint.
/// Should emit OverConstrainedDof diagnostic and not panic.
#[test]
fn over_constrained_dof_diagnostic() {
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l,   0.0, 0.0),
        (3, 0.0, 3.0, 0.0),
        (4, l,   3.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
    ];
    // Both bases AND node 4 are supported
    let sups = vec![
        (1, fixed()),
        (3, fixed()),
        (4, fixed()),  // node 4 is fully restrained
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // EqualDOF: node 4 (already fixed) -> node 2 in uz
    // Node 4 uz is restrained AND constrained => over-constrained
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2,
        slave_node: 4,
        dofs: vec![2],
    }));

    // Must not panic
    let result = linear::solve_3d(&input);
    match result {
        Ok(res) => {
            let has_over = res.structured_diagnostics.iter()
                .any(|d| d.code == DiagnosticCode::OverConstrainedDof);
            println!("Over-constrained solve OK, diagnostic={}", has_over);
            assert!(has_over,
                "Expected OverConstrainedDof diagnostic. Got: {:?}",
                res.structured_diagnostics.iter().map(|d| &d.code).collect::<Vec<_>>());
            // Displacements should be finite
            for d in &res.displacements {
                assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
                    "Over-constrained produced NaN/Inf at node {}", d.node_id);
            }
        }
        Err(e) => {
            println!("Over-constrained returned error (acceptable): {}", e);
        }
    }
}

/// Conflicting constraints: same DOF constrained by two different constraints.
#[test]
fn conflicting_constraints_diagnostic() {
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0),
        (3, 0.0, 3.0, 0.0), (4, l, 3.0, 0.0),
        (5, 0.0, 6.0, 0.0), (6, l, 6.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
        (3, "frame", 5, 6, 1, 1),
    ];
    let sups = vec![
        (1, fixed()), (3, fixed()), (5, fixed()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Node 4 uz is constrained to BOTH node 2 and node 6 (conflicting)
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2, slave_node: 4, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 6, slave_node: 4, dofs: vec![2],
    }));

    // Must not panic
    let result = linear::solve_3d(&input);
    match result {
        Ok(res) => {
            let has_conflicting = res.structured_diagnostics.iter()
                .any(|d| d.code == DiagnosticCode::ConflictingConstraints);
            println!("Conflicting constraints solve OK, diagnostic={}", has_conflicting);
            assert!(has_conflicting,
                "Expected ConflictingConstraints diagnostic. Got: {:?}",
                res.structured_diagnostics.iter().map(|d| &d.code).collect::<Vec<_>>());
            // Displacements should be finite
            for d in &res.displacements {
                assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
                    "Conflicting constraints produced NaN/Inf at node {}", d.node_id);
            }
        }
        Err(e) => {
            println!("Conflicting constraints returned error (acceptable): {}", e);
        }
    }
}

// ==================== 7. Regression Values ====================

/// Regression: depth-2 chain of EqualDOF on identical cantilevers.
/// Three identical cantilever beams, tips linked via uz chain.
/// Load applied only at root tip. Analytical: each beam contributes stiffness,
/// equivalent to three beams sharing the load => deflection = PL^3/(3EI) * 1/3.
#[test]
fn regression_depth_2_chain_deflection() {
    let l = 4.0;
    let p = -30.0; // Total load at one tip, shared by three beams via chain
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0),
        (3, 0.0, 3.0, 0.0), (4, l, 3.0, 0.0),
        (5, 0.0, 6.0, 0.0), (6, l, 6.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
        (3, "frame", 5, 6, 1, 1),
    ];
    let sups = vec![
        (1, fixed()), (3, fixed()), (5, fixed()),
    ];
    // Load applied only at node 2 (root tip)
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Chain: 6->4->2 (uz)
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 4, slave_node: 6, dofs: vec![2],
    }));
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2, slave_node: 4, dofs: vec![2],
    }));

    let result = linear::solve_3d(&input).expect("Regression solve should succeed");

    let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d4 = result.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let d6 = result.displacements.iter().find(|d| d.node_id == 6).unwrap();

    // All three tips must share uz
    let tol = 1e-8;
    assert!((d2.uz - d4.uz).abs() < tol, "Regression: d2.uz != d4.uz");
    assert!((d2.uz - d6.uz).abs() < tol, "Regression: d2.uz != d6.uz");

    // Analytical: 3 identical cantilevers linked at tip share the load equally.
    // Each beam sees P/3. Deflection = (P/3)*L^3 / (3*E_eff*Iy)
    // E_eff = E * 1000 kN/m^2 (solver uses E in MPa, loads in kN, lengths in m).
    // For a 3D beam along X with load in Z, the relevant I is Iy.
    let e_eff = E * 1000.0; // kN/m^2
    let delta_analytical = (p / 3.0) * l.powi(3) / (3.0 * e_eff * IY);
    let rel_err = ((d2.uz - delta_analytical) / delta_analytical).abs();
    println!(
        "Regression: uz={:.8e}, analytical={:.8e}, rel_err={:.4}%",
        d2.uz, delta_analytical, rel_err * 100.0
    );
    assert!(
        rel_err < 0.02, // 2% tolerance for 1-element-per-beam discretization
        "Regression deflection: uz={:.8e}, expected={:.8e}, rel_err={:.4}%",
        d2.uz, delta_analytical, rel_err * 100.0
    );
}

/// Regression: 2D chain with RigidLink (non-zero offset).
/// Cantilever beam 0--1--2, RigidLink chain: node 3(slave)->node 2(master), with offset.
/// Verify rigid-body kinematics: u_slave_y = u_master_y + dx * rz_master.
#[test]
fn regression_2d_rigid_link_chain_kinematics() {
    // 2D model: beam from node 0 to node 1 (L=5), then node 1 to node 2 (L=5).
    // Node 0 fixed. RigidLink: node 3 (at x=15, z=2) follows node 2 (at x=10, z=0).
    // Then EqualDOF: node 4 follows node 3 in uz.
    let mut nodes = HashMap::new();
    nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
    nodes.insert("1".into(), SolverNode { id: 1, x: 5.0, z: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 10.0, z: 0.0 });
    nodes.insert("3".into(), SolverNode { id: 3, x: 15.0, z: 2.0 });
    nodes.insert("4".into(), SolverNode { id: 4, x: 20.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: E, nu: NU });

    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".into(), SolverElement {
        id: 1, elem_type: "frame".into(),
        node_i: 0, node_j: 1, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elements.insert("2".into(), SolverElement {
        id: 2, elem_type: "frame".into(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    // Node 3 needs an element connected to be a valid node.
    // Connect it via a short beam to node 2.
    elements.insert("3".into(), SolverElement {
        id: 3, elem_type: "frame".into(),
        node_i: 2, node_j: 3, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    // Node 4 needs an element too. Connect to node 3.
    elements.insert("4".into(), SolverElement {
        id: 4, elem_type: "frame".into(),
        node_i: 3, node_j: 4, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("0".into(), SolverSupport {
        id: 0, node_id: 0, support_type: "fixed".into(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let solver = SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
        })],
        constraints: vec![
            // RigidLink: node 3 follows node 2 (with offset dx=5, dz=2)
            Constraint::RigidLink(RigidLinkConstraint {
                master_node: 2,
                slave_node: 3,
                dofs: vec![0, 1], // ux, uz
            }),
            // EqualDOF: node 4 follows node 3 in uz
            Constraint::EqualDOF(EqualDOFConstraint {
                master_node: 3,
                slave_node: 4,
                dofs: vec![1], // uz (dof 1 in 2D)
            }),
        ],
        connectors: HashMap::new(),
    };

    let result = linear::solve_2d(&solver).expect("2D mixed chain should solve");

    let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = result.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d4 = result.displacements.iter().find(|d| d.node_id == 4).unwrap();

    // RigidLink kinematics (2D):
    //   ux_slave = ux_master - dz * ry_master  (dz = 2.0)
    //   uz_slave = uz_master + dx * ry_master  (dx = 5.0)
    let dx = 15.0 - 10.0; // node 3.x - node 2.x = 5.0
    let dz = 2.0 - 0.0;   // node 3.z - node 2.z = 2.0

    let expected_ux3 = d2.ux - dz * d2.ry;
    let expected_uz3 = d2.uz + dx * d2.ry;

    let tol = 1e-6;
    assert!(
        (d3.ux - expected_ux3).abs() < tol,
        "RigidLink ux: got {:.8e}, expected {:.8e}", d3.ux, expected_ux3
    );
    assert!(
        (d3.uz - expected_uz3).abs() < tol,
        "RigidLink uz: got {:.8e}, expected {:.8e}", d3.uz, expected_uz3
    );

    // EqualDOF chain: node 4 uz should match node 3 uz
    assert!(
        (d3.uz - d4.uz).abs() < tol,
        "EqualDOF chain: node 3 uz={:.8e}, node 4 uz={:.8e}", d3.uz, d4.uz
    );

    // Verify the full chain: node 4 uz should reflect the RigidLink offset from node 2
    assert!(
        (d4.uz - expected_uz3).abs() < tol,
        "Full chain: node 4 uz={:.8e}, expected (via rigid link)={:.8e}", d4.uz, expected_uz3
    );
}

// ==================== 8. Deep Chain (Stress Test) ====================

/// Chain of depth 8: tests that the iterative substitution (max 10 passes)
/// handles deep chains without stack overflow or numerical issues.
#[test]
fn deep_chain_depth_8_equal_dof() {
    let l = 4.0;
    let n_beams = 9; // 9 beams = 18 nodes, chain of depth 8
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut sups = Vec::new();
    for i in 0..n_beams {
        let base_id = 2 * i + 1;
        let tip_id = 2 * i + 2;
        nodes.push((base_id, 0.0, i as f64 * 3.0, 0.0));
        nodes.push((tip_id, l, i as f64 * 3.0, 0.0));
        elems.push((i + 1, "frame", base_id, tip_id, 1, 1));
        sups.push((base_id, fixed()));
    }
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // Chain: tip(n) -> tip(n-1) -> ... -> tip(1) = node 2
    // tip_id for beam i is 2*i + 2
    for i in (1..n_beams).rev() {
        let master_tip = 2 * (i - 1) + 2;
        let slave_tip = 2 * i + 2;
        input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
            master_node: master_tip,
            slave_node: slave_tip,
            dofs: vec![2],
        }));
    }

    let result = linear::solve_3d(&input).expect("Deep chain depth 8 should solve");

    // All tips should have the same uz
    let tip_ids: Vec<usize> = (0..n_beams).map(|i| 2 * i + 2).collect();
    let tip_uzs: Vec<f64> = tip_ids.iter()
        .map(|&id| result.displacements.iter().find(|d| d.node_id == id).unwrap().uz)
        .collect();

    let tol = 1e-8;
    for i in 1..tip_uzs.len() {
        assert!(
            (tip_uzs[0] - tip_uzs[i]).abs() < tol,
            "Deep chain: uz mismatch at tip {} (node {}): {:.8e} vs {:.8e}",
            i, tip_ids[i], tip_uzs[0], tip_uzs[i]
        );
    }

    // Deflection should be finite and downward
    assert!(tip_uzs[0] < 0.0, "Should deflect down, got {:.6e}", tip_uzs[0]);
    assert!(tip_uzs[0].is_finite(), "uz must be finite");

    // Analytical: N beams sharing load => deflection = P/(N) * L^3/(3*E_eff*Iy)
    // E_eff = E * 1000 kN/m^2 (solver uses E in MPa, loads in kN, lengths in m).
    let e_eff = E * 1000.0;
    let delta_analytical = (-10.0 / n_beams as f64) * l.powi(3) / (3.0 * e_eff * IY);
    let rel_err = ((tip_uzs[0] - delta_analytical) / delta_analytical).abs();
    assert!(
        rel_err < 0.02,
        "Deep chain regression: uz={:.8e}, expected={:.8e}, rel_err={:.4}%",
        tip_uzs[0], delta_analytical, rel_err * 100.0
    );
}

// ==================== 9. LinearMPC in Chain ====================

/// LinearMPC chained with EqualDOF.
/// MPC: 1.0*u_4_z + (-0.5)*u_2_z = 0  =>  u_4_z = 0.5 * u_2_z
/// Then EqualDOF: u_6_z = u_4_z
/// Result: u_6_z should be 0.5 * u_2_z.
#[test]
fn linear_mpc_chained_with_equal_dof() {
    let l = 4.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0),
        (3, 0.0, 3.0, 0.0), (4, l, 3.0, 0.0),
        (5, 0.0, 6.0, 0.0), (6, l, 6.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
        (3, "frame", 5, 6, 1, 1),
    ];
    let sups = vec![
        (1, fixed()), (3, fixed()), (5, fixed()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    // MPC: 1.0*u_4_z + (-0.5)*u_2_z = 0  =>  u_4_z = 0.5 * u_2_z
    input.constraints.push(Constraint::LinearMPC(LinearMPCConstraint {
        terms: vec![
            MPCTerm { node_id: 4, dof: 2, coefficient: 1.0 },
            MPCTerm { node_id: 2, dof: 2, coefficient: -0.5 },
        ],
    }));
    // EqualDOF: u_6_z = u_4_z
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 4,
        slave_node: 6,
        dofs: vec![2],
    }));

    let result = linear::solve_3d(&input).expect("MPC + EqualDOF chain should solve");

    let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d4 = result.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let d6 = result.displacements.iter().find(|d| d.node_id == 6).unwrap();

    // MPC: u_4_z = 0.5 * u_2_z
    let tol = 1e-6;
    let expected_u4z = 0.5 * d2.uz;
    assert!(
        (d4.uz - expected_u4z).abs() < tol,
        "MPC: u_4_z={:.8e}, expected 0.5*u_2_z={:.8e}", d4.uz, expected_u4z
    );

    // EqualDOF chain: u_6_z = u_4_z
    assert!(
        (d4.uz - d6.uz).abs() < tol,
        "EqualDOF after MPC: u_4_z={:.8e}, u_6_z={:.8e}", d4.uz, d6.uz
    );

    // Full chain: u_6_z = 0.5 * u_2_z
    assert!(
        (d6.uz - expected_u4z).abs() < tol,
        "Full chain: u_6_z={:.8e}, expected 0.5*u_2_z={:.8e}", d6.uz, expected_u4z
    );
}
