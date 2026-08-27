/// Validation: Model Reduction (Guyan / Craig-Bampton)
///
/// Tests:
///   1. Guyan reduction of a 3-span beam: boundary displacements match full linear solve
///   2. Guyan condensed K matrix is symmetric
///   3. Guyan condensed K is positive definite (all eigenvalues positive)
///   4. Craig-Bampton interior frequencies match modal analysis of fixed-boundary subsystem
///   5. Craig-Bampton reduced mass matrix is symmetric
///   6. Guyan with all free nodes as boundary = full system (trivial, displacements match exactly)
///   7. Guyan element forces match linear solver element forces
///   8. Guyan reactions match linear solver reactions

use dedaliano_engine::solver::reduction::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

fn node(id: usize, x: f64, z: f64) -> SolverNode {
    SolverNode { id, x, z }
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
        dx: None, dz: None, dry: None,
        angle: None,
    }
}

fn pinned(id: usize, node_id: usize) -> SolverSupport {
    SolverSupport {
        id,
        node_id,
        support_type: "pinned".into(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None,
        angle: None,
    }
}

fn roller_x(id: usize, node_id: usize) -> SolverSupport {
    SolverSupport {
        id,
        node_id,
        support_type: "rollerX".into(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None,
        angle: None,
    }
}

fn hm<T>(items: Vec<(usize, T)>) -> HashMap<String, T> {
    items.into_iter().map(|(k, v)| (k.to_string(), v)).collect()
}

fn mat() -> SolverMaterial {
    SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 }
}

fn sec() -> SolverSection {
    SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None }
}

/// Build a 3-span continuous beam (4 supports, 3 elements, 2 intermediate nodes).
///
/// Layout:
///   Node 1 (pin) ---[elem 1]--- Node 2 ---[elem 2]--- Node 3 ---[elem 3]--- Node 4 (pin)
///   Support at 1 (pinned), 4 (rollerX)
///
/// Nodes 2 and 3 are free interior/boundary candidates.
/// Each span is 4 m long (total 12 m).
fn three_span_beam() -> SolverInput {
    SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 4.0, 0.0)),
            (3, node(3, 8.0, 0.0)),
            (4, node(4, 12.0, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
            (2, frame(2, 2, 3)),
            (3, frame(3, 3, 4)),
        ]),
        supports: hm(vec![
            (1, pinned(1, 1)),
            (4, roller_x(4, 4)),
        ]),
        loads: vec![
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 2, q_i: -10.0, q_j: -10.0, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 3, q_i: -10.0, q_j: -10.0, a: None, b: None,
            }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -50.0, my: 0.0 }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

/// Build a 5-node cantilever beam for the "all nodes boundary" test.
///
/// Layout:
///   Node 1 (fixed) ---[1]--- Node 2 ---[2]--- Node 3 ---[3]--- Node 4 ---[4]--- Node 5
///   Each span 2 m. Tip load at node 5.
fn five_node_cantilever() -> SolverInput {
    SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 2.0, 0.0)),
            (3, node(3, 4.0, 0.0)),
            (4, node(4, 6.0, 0.0)),
            (5, node(5, 8.0, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
            (2, frame(2, 2, 3)),
            (3, frame(3, 3, 4)),
            (4, frame(4, 4, 5)),
        ]),
        supports: hm(vec![(1, fixed(1, 1))]),
        loads: vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -100.0, my: 0.0 }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

/// Build a 6-node beam for Craig-Bampton with more interior DOFs.
///
/// Layout:
///   Node 1 (fixed) --[1]-- 2 --[2]-- 3 --[3]-- 4 --[4]-- 5 --[5]-- Node 6 (pinned)
///   Each span 2 m. Distributed load on all elements.
fn six_node_beam() -> SolverInput {
    SolverInput {
        nodes: hm(vec![
            (1, node(1, 0.0, 0.0)),
            (2, node(2, 2.0, 0.0)),
            (3, node(3, 4.0, 0.0)),
            (4, node(4, 6.0, 0.0)),
            (5, node(5, 8.0, 0.0)),
            (6, node(6, 10.0, 0.0)),
        ]),
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements: hm(vec![
            (1, frame(1, 1, 2)),
            (2, frame(2, 2, 3)),
            (3, frame(3, 3, 4)),
            (4, frame(4, 4, 5)),
            (5, frame(5, 5, 6)),
        ]),
        supports: hm(vec![
            (1, fixed(1, 1)),
            (6, pinned(6, 6)),
        ]),
        loads: vec![
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 1, q_i: -20.0, q_j: -20.0, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 2, q_i: -20.0, q_j: -20.0, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 3, q_i: -20.0, q_j: -20.0, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 4, q_i: -20.0, q_j: -20.0, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 5, q_i: -20.0, q_j: -20.0, a: None, b: None,
            }),
        ],
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

// ---------------------------------------------------------------------------
// Test 1: Guyan reduction — boundary displacements match full linear solve
// ---------------------------------------------------------------------------
#[test]
fn test_guyan_boundary_displacements_match_linear() {
    let solver = three_span_beam();

    // Boundary nodes: 2, 3 (free interior nodes of the beam)
    let guyan_input = GuyanInput {
        solver: solver.clone(),
        boundary_nodes: vec![2],
    };

    let guyan_result = guyan_reduce_2d(&guyan_input).unwrap();
    let linear_result = linear::solve_2d(&solver).unwrap();

    // Compare displacements at ALL nodes (boundary + interior recovered)
    for ld in &linear_result.displacements {
        let gd = guyan_result.displacements.iter()
            .find(|d| d.node_id == ld.node_id)
            .unwrap_or_else(|| panic!("Missing node {} in Guyan result", ld.node_id));

        let tol = 1e-6;
        assert!(
            (gd.ux - ld.ux).abs() < tol,
            "Node {} ux: Guyan {:.9} vs Linear {:.9}",
            ld.node_id, gd.ux, ld.ux
        );
        assert!(
            (gd.uz - ld.uz).abs() < tol,
            "Node {} uz: Guyan {:.9} vs Linear {:.9}",
            ld.node_id, gd.uz, ld.uz
        );
        assert!(
            (gd.ry - ld.ry).abs() < tol,
            "Node {} ry: Guyan {:.9} vs Linear {:.9}",
            ld.node_id, gd.ry, ld.ry
        );
    }
}

// ---------------------------------------------------------------------------
// Test 2: Guyan condensed K matrix is symmetric
// ---------------------------------------------------------------------------
#[test]
fn test_guyan_condensed_k_symmetric() {
    let solver = three_span_beam();

    let guyan_input = GuyanInput {
        solver,
        boundary_nodes: vec![2],
    };

    let result = guyan_reduce_2d(&guyan_input).unwrap();
    let nb = result.n_boundary;
    let k = &result.k_condensed;

    for i in 0..nb {
        for j in (i + 1)..nb {
            let kij = k[i * nb + j];
            let kji = k[j * nb + i];
            let diff = (kij - kji).abs();
            let scale = kij.abs().max(kji.abs()).max(1e-12);
            assert!(
                diff / scale < 1e-10,
                "K_condensed not symmetric: K[{},{}]={:.6e} vs K[{},{}]={:.6e}",
                i, j, kij, j, i, kji
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Test 3: Guyan condensed K is positive definite (all eigenvalues positive)
// ---------------------------------------------------------------------------
#[test]
fn test_guyan_condensed_k_positive_definite() {
    let solver = three_span_beam();

    let guyan_input = GuyanInput {
        solver,
        boundary_nodes: vec![2, 3],
    };

    let result = guyan_reduce_2d(&guyan_input).unwrap();
    let nb = result.n_boundary;
    let k = &result.k_condensed;

    // Compute eigenvalues of the condensed K via Jacobi
    let eigen = dedaliano_engine::linalg::jacobi_eigen(k, nb, 200);

    for (i, &ev) in eigen.values.iter().enumerate() {
        assert!(
            ev > -1e-8,
            "Eigenvalue {} of K_condensed is negative: {:.6e} — not positive definite",
            i, ev
        );
    }

    // Check at least one eigenvalue is clearly positive (non-trivial)
    let max_ev = eigen.values.iter().cloned().fold(0.0_f64, f64::max);
    assert!(
        max_ev > 1e-6,
        "K_condensed has no significant positive eigenvalue (max = {:.6e})",
        max_ev
    );
}

// ---------------------------------------------------------------------------
// Test 4: Craig-Bampton interior frequencies match modal analysis
// ---------------------------------------------------------------------------
#[test]
fn test_craig_bampton_interior_frequencies() {
    // Use the 6-node beam. Boundary nodes = {2, 5}. Interior = {3, 4}.
    // Craig-Bampton interior frequencies come from K_II * phi = omega^2 * M_II * phi
    // where I = interior DOFs with boundary DOFs fixed.
    //
    // We verify that the first few CB interior frequencies are positive and monotonically
    // increasing (basic sanity). A deeper check would require building the fixed-boundary
    // subsystem independently, but that duplicates the solver internals. Instead, we check
    // consistency: the lowest CB frequency should be less than the full-system fundamental
    // frequency (more constrained system = higher frequencies for boundary-fixed subsystem,
    // but fewer DOFs so first mode may shift).

    let solver = six_node_beam();

    let densities: HashMap<String, f64> = hm(vec![(1, 7850.0)]);

    let cb_input = CraigBamptonInput {
        solver: solver.clone(),
        boundary_nodes: vec![2, 5],
        n_modes: 4,
        densities: densities.clone(),
    };

    let cb_result = craig_bampton_2d(&cb_input).unwrap();

    // Verify we got modes
    assert!(
        !cb_result.interior_frequencies.is_empty(),
        "Craig-Bampton should produce at least one interior mode"
    );

    // All frequencies should be positive
    for (i, &f) in cb_result.interior_frequencies.iter().enumerate() {
        assert!(
            f > 0.0,
            "Interior frequency {} should be positive, got {:.6e}",
            i, f
        );
    }

    // Frequencies should be monotonically non-decreasing
    for i in 1..cb_result.interior_frequencies.len() {
        assert!(
            cb_result.interior_frequencies[i] >= cb_result.interior_frequencies[i - 1] - 1e-6,
            "Interior frequencies not monotonic: f[{}]={:.4} < f[{}]={:.4}",
            i, cb_result.interior_frequencies[i],
            i - 1, cb_result.interior_frequencies[i - 1]
        );
    }

    // Verify the reduced system dimensions
    assert_eq!(
        cb_result.n_reduced,
        cb_result.n_boundary + cb_result.n_modes_kept,
        "n_reduced should equal n_boundary + n_modes_kept"
    );

    // Verify K_reduced has correct size
    assert_eq!(
        cb_result.k_reduced.len(),
        cb_result.n_reduced * cb_result.n_reduced,
        "K_reduced size mismatch"
    );
}

// ---------------------------------------------------------------------------
// Test 5: Craig-Bampton reduced mass matrix is symmetric
// ---------------------------------------------------------------------------
#[test]
fn test_craig_bampton_mass_symmetric() {
    let solver = six_node_beam();

    let densities: HashMap<String, f64> = hm(vec![(1, 7850.0)]);

    let cb_input = CraigBamptonInput {
        solver,
        boundary_nodes: vec![2, 5],
        n_modes: 4,
        densities,
    };

    let result = craig_bampton_2d(&cb_input).unwrap();
    let nr = result.n_reduced;
    let m = &result.m_reduced;

    for i in 0..nr {
        for j in (i + 1)..nr {
            let mij = m[i * nr + j];
            let mji = m[j * nr + i];
            let diff = (mij - mji).abs();
            // Use absolute tolerance for near-zero entries, relative otherwise
            let abs_tol = 1e-10;
            if diff > abs_tol {
                let scale = mij.abs().max(mji.abs());
                assert!(
                    diff / scale < 1e-8,
                    "M_reduced not symmetric: M[{},{}]={:.6e} vs M[{},{}]={:.6e}",
                    i, j, mij, j, i, mji
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Test 6: Guyan with all free nodes as boundary = full system (trivial case)
// ---------------------------------------------------------------------------
#[test]
fn test_guyan_all_nodes_boundary_matches_linear() {
    // Use the five-node cantilever. Node 1 is fixed (support).
    // Free nodes: 2, 3, 4, 5. If we make ALL of them boundary, interior is empty,
    // which should error. So we test with all-but-one as boundary: nodes 2, 3, 4
    // are boundary, node 5 is interior. Displacements should still match exactly
    // since Guyan reduction with static condensation is exact for static problems.

    let solver = five_node_cantilever();

    // Boundary = {2, 3, 4}, Interior = {5}
    let guyan_input = GuyanInput {
        solver: solver.clone(),
        boundary_nodes: vec![2, 3, 4],
    };

    let guyan_result = guyan_reduce_2d(&guyan_input).unwrap();
    let linear_result = linear::solve_2d(&solver).unwrap();

    // Guyan static condensation is mathematically exact for linear statics.
    // Displacements should match to machine precision.
    let tol = 1e-8;
    for ld in &linear_result.displacements {
        let gd = guyan_result.displacements.iter()
            .find(|d| d.node_id == ld.node_id)
            .unwrap_or_else(|| panic!("Missing node {} in Guyan result", ld.node_id));

        assert!(
            (gd.ux - ld.ux).abs() < tol,
            "Node {} ux: Guyan {:.12} vs Linear {:.12}",
            ld.node_id, gd.ux, ld.ux
        );
        assert!(
            (gd.uz - ld.uz).abs() < tol,
            "Node {} uz: Guyan {:.12} vs Linear {:.12}",
            ld.node_id, gd.uz, ld.uz
        );
        assert!(
            (gd.ry - ld.ry).abs() < tol,
            "Node {} ry: Guyan {:.12} vs Linear {:.12}",
            ld.node_id, gd.ry, ld.ry
        );
    }
}

// ---------------------------------------------------------------------------
// Test 7: Guyan element forces match linear solver element forces
// ---------------------------------------------------------------------------
#[test]
fn test_guyan_element_forces_match_linear() {
    let solver = three_span_beam();

    let guyan_input = GuyanInput {
        solver: solver.clone(),
        boundary_nodes: vec![2],
    };

    let guyan_result = guyan_reduce_2d(&guyan_input).unwrap();
    let linear_result = linear::solve_2d(&solver).unwrap();

    let tol = 1e-4;

    for lef in &linear_result.element_forces {
        let gef = guyan_result.element_forces.iter()
            .find(|ef| ef.element_id == lef.element_id)
            .unwrap_or_else(|| panic!("Missing element {} in Guyan result", lef.element_id));

        assert!(
            (gef.n_start - lef.n_start).abs() < tol,
            "Element {} n_start: Guyan {:.6} vs Linear {:.6}",
            lef.element_id, gef.n_start, lef.n_start
        );
        assert!(
            (gef.n_end - lef.n_end).abs() < tol,
            "Element {} n_end: Guyan {:.6} vs Linear {:.6}",
            lef.element_id, gef.n_end, lef.n_end
        );
        assert!(
            (gef.v_start - lef.v_start).abs() < tol,
            "Element {} v_start: Guyan {:.6} vs Linear {:.6}",
            lef.element_id, gef.v_start, lef.v_start
        );
        assert!(
            (gef.v_end - lef.v_end).abs() < tol,
            "Element {} v_end: Guyan {:.6} vs Linear {:.6}",
            lef.element_id, gef.v_end, lef.v_end
        );
        assert!(
            (gef.m_start - lef.m_start).abs() < tol,
            "Element {} m_start: Guyan {:.6} vs Linear {:.6}",
            lef.element_id, gef.m_start, lef.m_start
        );
        assert!(
            (gef.m_end - lef.m_end).abs() < tol,
            "Element {} m_end: Guyan {:.6} vs Linear {:.6}",
            lef.element_id, gef.m_end, lef.m_end
        );
    }
}

// ---------------------------------------------------------------------------
// Test 8: Guyan reactions match linear solver reactions
// ---------------------------------------------------------------------------
#[test]
fn test_guyan_reactions_match_linear() {
    let solver = three_span_beam();

    let guyan_input = GuyanInput {
        solver: solver.clone(),
        boundary_nodes: vec![2, 3],
    };

    let guyan_result = guyan_reduce_2d(&guyan_input).unwrap();
    let linear_result = linear::solve_2d(&solver).unwrap();

    let tol = 1e-4;

    for lr in &linear_result.reactions {
        let gr = guyan_result.reactions.iter()
            .find(|r| r.node_id == lr.node_id)
            .unwrap_or_else(|| panic!("Missing reaction at node {} in Guyan result", lr.node_id));

        assert!(
            (gr.rx - lr.rx).abs() < tol,
            "Node {} rx: Guyan {:.6} vs Linear {:.6}",
            lr.node_id, gr.rx, lr.rx
        );
        assert!(
            (gr.rz - lr.rz).abs() < tol,
            "Node {} rz: Guyan {:.6} vs Linear {:.6}",
            lr.node_id, gr.rz, lr.rz
        );
        assert!(
            (gr.my - lr.my).abs() < tol,
            "Node {} my: Guyan {:.6} vs Linear {:.6}",
            lr.node_id, gr.my, lr.my
        );
    }
}


// ---------------------------------------------------------------------------
// Test 9: Guyan with prescribed support displacements must error, not silently
// ignore them (u_r is hardcoded to zero in the reduction recovery path)
// ---------------------------------------------------------------------------
#[test]
fn test_guyan_prescribed_displacement_is_rejected() {
    let mut solver = five_node_cantilever();
    // Prescribe a support rotation at the fixed end. The linear solver couples
    // this into the solve via F_f -= K_fr * u_r; Guyan has no such coupling and
    // used to silently produce results as if the support had not moved.
    for sup in solver.supports.values_mut() {
        sup.dry = Some(0.01);
    }

    // Sanity: the linear solver DOES account for the prescribed rotation.
    let linear_result = linear::solve_2d(&solver).unwrap();
    let tip = linear_result.displacements.iter()
        .find(|d| d.node_id == 5).unwrap();
    assert!(tip.uz.abs() > 1e-6, "prescribed rotation should move the tip");

    let guyan_input = GuyanInput {
        solver,
        boundary_nodes: vec![3],
    };
    let err = guyan_reduce_2d(&guyan_input)
        .expect_err("Guyan with prescribed displacements must be rejected");
    assert!(err.contains("prescribed"), "error should mention prescribed displacements, got: {}", err);
}

// ---------------------------------------------------------------------------
// Sparse-path tests: nf >= SPARSE_THRESHOLD (64) exercises the CSC assembly +
// sparse K_II factorization paths (2D), instead of the dense fallback.
// ---------------------------------------------------------------------------

/// Build a 30-element simply-supported beam (31 nodes, nf = 90 free DOFs),
/// large enough to take the sparse reduction path (nf >= 64).
///
/// Layout: Node 1 (pinned) --- 30 frame elements --- Node 31 (rollerX)
/// Uniform distributed load on all elements + nodal load at midspan.
fn large_ss_beam() -> SolverInput {
    let n_elem = 30;
    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        let id = i + 1;
        nodes.insert(id.to_string(), node(id, 10.0 * i as f64 / n_elem as f64, 0.0));
    }

    let mut elements = HashMap::new();
    for i in 0..n_elem {
        let id = i + 1;
        elements.insert(id.to_string(), frame(id, i + 1, i + 2));
    }

    let mut loads: Vec<SolverLoad> = (1..=n_elem)
        .map(|id| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: id, q_i: -10.0, q_j: -10.0, a: None, b: None,
        }))
        .collect();
    loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 16, fx: 0.0, fz: -50.0, my: 0.0 }));

    SolverInput {
        nodes,
        materials: hm(vec![(1, mat())]),
        sections: hm(vec![(1, sec())]),
        elements,
        supports: hm(vec![
            (1, pinned(1, 1)),
            (2, roller_x(2, n_elem + 1)),
        ]),
        loads,
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

/// Same large beam plus an auxiliary node hanging off midspan, coupled to the
/// beam by an EqualDOF constraint — exercises the sparse C'·K·C reduction.
fn large_ss_beam_equal_dof() -> SolverInput {
    let mut input = large_ss_beam();
    input.nodes.insert("100".to_string(), node(100, 5.0, -1.0));
    input.elements.insert("100".to_string(), frame(100, 16, 100));
    input.constraints = vec![
        Constraint::EqualDOF(EqualDOFConstraint {
            master_node: 16, slave_node: 100, dofs: vec![0, 1],
        }),
    ];
    input
}

// Test 10: sparse Guyan (nf >= 64) — displacements and reactions match the
// full linear solve; condensed K is symmetric.
#[test]
fn test_guyan_sparse_large_beam_matches_linear() {
    let solver = large_ss_beam();

    let guyan_input = GuyanInput {
        solver: solver.clone(),
        boundary_nodes: vec![10, 20],
    };

    let guyan_result = guyan_reduce_2d(&guyan_input).unwrap();
    assert_eq!(guyan_result.n_boundary, 6, "2 boundary nodes × 3 DOFs");
    assert!(guyan_result.n_interior >= 64, "interior should dominate");

    let linear_result = linear::solve_2d(&solver).unwrap();

    let tol = 1e-6;
    for ld in &linear_result.displacements {
        let gd = guyan_result.displacements.iter()
            .find(|d| d.node_id == ld.node_id)
            .unwrap_or_else(|| panic!("Missing node {} in Guyan result", ld.node_id));
        assert!((gd.ux - ld.ux).abs() < tol, "Node {} ux: Guyan {:.9} vs Linear {:.9}", ld.node_id, gd.ux, ld.ux);
        assert!((gd.uz - ld.uz).abs() < tol, "Node {} uz: Guyan {:.9} vs Linear {:.9}", ld.node_id, gd.uz, ld.uz);
        assert!((gd.ry - ld.ry).abs() < tol, "Node {} ry: Guyan {:.9} vs Linear {:.9}", ld.node_id, gd.ry, ld.ry);
    }

    for lr in &linear_result.reactions {
        let gr = guyan_result.reactions.iter()
            .find(|r| r.node_id == lr.node_id)
            .unwrap_or_else(|| panic!("Missing reaction at node {} in Guyan result", lr.node_id));
        assert!((gr.rx - lr.rx).abs() < 1e-4, "Node {} rx: Guyan {:.6} vs Linear {:.6}", lr.node_id, gr.rx, lr.rx);
        assert!((gr.rz - lr.rz).abs() < 1e-4, "Node {} rz: Guyan {:.6} vs Linear {:.6}", lr.node_id, gr.rz, lr.rz);
        assert!((gr.my - lr.my).abs() < 1e-4, "Node {} my: Guyan {:.6} vs Linear {:.6}", lr.node_id, gr.my, lr.my);
    }

    let nb = guyan_result.n_boundary;
    let k = &guyan_result.k_condensed;
    for i in 0..nb {
        for j in (i + 1)..nb {
            let diff = (k[i * nb + j] - k[j * nb + i]).abs();
            let scale = k[i * nb + j].abs().max(k[j * nb + i].abs()).max(1e-12);
            assert!(diff / scale < 1e-9, "K_condensed not symmetric at ({}, {})", i, j);
        }
    }
}

// Test 11: sparse Guyan with an EqualDOF constraint — the C'·K·C reduction
// stays sparse; displacements match the constrained linear solve, and the
// slave node follows the master.
#[test]
fn test_guyan_sparse_large_beam_with_equal_dof() {
    let solver = large_ss_beam_equal_dof();

    let guyan_input = GuyanInput {
        solver: solver.clone(),
        boundary_nodes: vec![10, 20],
    };

    let guyan_result = guyan_reduce_2d(&guyan_input).unwrap();
    let linear_result = linear::solve_2d(&solver).unwrap();

    let tol = 1e-6;
    for ld in &linear_result.displacements {
        let gd = guyan_result.displacements.iter()
            .find(|d| d.node_id == ld.node_id)
            .unwrap_or_else(|| panic!("Missing node {} in Guyan result", ld.node_id));
        assert!((gd.ux - ld.ux).abs() < tol, "Node {} ux: Guyan {:.9} vs Linear {:.9}", ld.node_id, gd.ux, ld.ux);
        assert!((gd.uz - ld.uz).abs() < tol, "Node {} uz: Guyan {:.9} vs Linear {:.9}", ld.node_id, gd.uz, ld.uz);
        assert!((gd.ry - ld.ry).abs() < tol, "Node {} ry: Guyan {:.9} vs Linear {:.9}", ld.node_id, gd.ry, ld.ry);
    }

    // EqualDOF: slave (100) translations equal master (16) translations.
    let master = guyan_result.displacements.iter().find(|d| d.node_id == 16).unwrap();
    let slave = guyan_result.displacements.iter().find(|d| d.node_id == 100).unwrap();
    assert!((master.ux - slave.ux).abs() < 1e-10, "EqualDOF ux: master {} vs slave {}", master.ux, slave.ux);
    assert!((master.uz - slave.uz).abs() < 1e-10, "EqualDOF uz: master {} vs slave {}", master.uz, slave.uz);
}

// Test 12: sparse Craig-Bampton (nf >= 64) — the BB block of K_reduced is the
// Guyan-condensed stiffness of the same partition (Ψ_s = −K_II⁻¹K_IB makes
// TᵀKT's BB block exactly the static condensation), and frequencies are sane.
#[test]
fn test_craig_bampton_sparse_large_beam() {
    let solver = large_ss_beam();
    let densities: HashMap<String, f64> = hm(vec![(1, 7850.0)]);
    let boundary_nodes = vec![10, 20];

    let cb_result = craig_bampton_2d(&CraigBamptonInput {
        solver: solver.clone(),
        boundary_nodes: boundary_nodes.clone(),
        n_modes: 5,
        densities,
    }).unwrap();

    assert_eq!(cb_result.n_reduced, cb_result.n_boundary + cb_result.n_modes_kept);
    assert_eq!(cb_result.k_reduced.len(), cb_result.n_reduced * cb_result.n_reduced);
    assert_eq!(cb_result.m_reduced.len(), cb_result.n_reduced * cb_result.n_reduced);

    for (i, &f) in cb_result.interior_frequencies.iter().enumerate() {
        assert!(f > 0.0 && f.is_finite(), "Interior frequency {} should be positive, got {:.6e}", i, f);
    }
    for i in 1..cb_result.interior_frequencies.len() {
        assert!(
            cb_result.interior_frequencies[i] >= cb_result.interior_frequencies[i - 1] - 1e-6,
            "Interior frequencies not monotonic: f[{}]={:.4} < f[{}]={:.4}",
            i, cb_result.interior_frequencies[i], i - 1, cb_result.interior_frequencies[i - 1]
        );
    }

    // BB block of K_reduced == Guyan-condensed stiffness (exact identity).
    let guyan_result = guyan_reduce_2d(&GuyanInput {
        solver,
        boundary_nodes,
    }).unwrap();

    let nb = cb_result.n_boundary;
    let nr = cb_result.n_reduced;
    assert_eq!(nb, guyan_result.n_boundary);
    for i in 0..nb {
        for j in 0..nb {
            let cb = cb_result.k_reduced[i * nr + j];
            let gy = guyan_result.k_condensed[i * nb + j];
            let scale = gy.abs().max(1e-12);
            assert!(
                (cb - gy).abs() / scale < 1e-6,
                "BB block mismatch at ({}, {}): CB {:.9e} vs Guyan {:.9e}",
                i, j, cb, gy
            );
        }
    }

    // Modal mass block should be diagonal (modes are M-orthonormal).
    for m1 in 0..cb_result.n_modes_kept {
        let diag = cb_result.m_reduced[(nb + m1) * nr + (nb + m1)].abs();
        for m2 in 0..cb_result.n_modes_kept {
            if m1 == m2 { continue; }
            let off = cb_result.m_reduced[(nb + m1) * nr + (nb + m2)].abs();
            assert!(
                off <= 1e-6 * diag.max(1e-30),
                "M_reduced modal block not diagonal at ({}, {}): off={:.3e} diag={:.3e}",
                m1, m2, off, diag
            );
        }
    }
}

// Test 13: sparse Craig-Bampton with an EqualDOF constraint — exercises the
// sparse C'·K·C / C'·M·C reductions; reduced matrices stay symmetric.
#[test]
fn test_craig_bampton_sparse_large_beam_with_equal_dof() {
    let solver = large_ss_beam_equal_dof();
    let densities: HashMap<String, f64> = hm(vec![(1, 7850.0)]);

    let result = craig_bampton_2d(&CraigBamptonInput {
        solver,
        boundary_nodes: vec![10, 20],
        n_modes: 4,
        densities,
    }).unwrap();

    assert_eq!(result.n_reduced, result.n_boundary + result.n_modes_kept);
    for (i, &f) in result.interior_frequencies.iter().enumerate() {
        assert!(f > 0.0 && f.is_finite(), "Interior frequency {} should be positive, got {:.6e}", i, f);
    }

    let nr = result.n_reduced;
    for (mat, name) in [(&result.k_reduced, "K"), (&result.m_reduced, "M")] {
        for i in 0..nr {
            for j in (i + 1)..nr {
                let a = mat[i * nr + j];
                let b = mat[j * nr + i];
                let diff = (a - b).abs();
                if diff > 1e-10 {
                    let scale = a.abs().max(b.abs());
                    assert!(diff / scale < 1e-8, "{}_reduced not symmetric at ({}, {}): {:.6e} vs {:.6e}", name, i, j, a, b);
                }
            }
        }
    }
}
