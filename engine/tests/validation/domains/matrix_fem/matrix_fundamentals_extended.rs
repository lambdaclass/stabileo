/// Validation: Fundamental Properties of the Stiffness Matrix Method
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 2-4
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 2-3
///   - Bathe, "Finite Element Procedures", Ch. 4 (positive definiteness, symmetry)
///   - Ghali & Neville, "Structural Analysis", Ch. 4 (superposition, reciprocity)
///   - Clough & Penzien, "Dynamics of Structures", Ch. 1 (strain energy)
///
/// The direct stiffness method requires that the global stiffness matrix K
/// satisfies several mathematical and physical properties. These tests
/// verify that the solver preserves these fundamental invariants.
///
/// Tests:
///   1. Stiffness matrix symmetry via Maxwell reciprocal theorem (K_ij = K_ji)
///   2. Linearity: 2x load produces 2x displacement
///   3. Superposition: combined load = sum of individual responses
///   4. Positive definiteness: strain energy > 0 for any nonzero displacement
///   5. Rigid body mode: uniform translation produces zero internal forces
///   6. Equilibrium: sum of element end forces at each free node = applied loads
///   7. Compatibility: displacements are continuous at shared nodes
///   8. Sign convention consistency: reaction = -(sum of element forces) at support
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Stiffness Matrix Symmetry (Maxwell Reciprocal Theorem)
// ================================================================
//
// For a linear elastic structure, the stiffness matrix K is symmetric:
//   K_ij = K_ji
// This means the displacement at DOF i due to a unit load at DOF j
// equals the displacement at DOF j due to a unit load at DOF i.
//
// Test: simply supported beam with nodes at L/3 and 2L/3.
//   System A: unit force Fy at L/3, measure uy at 2L/3.
//   System B: unit force Fy at 2L/3, measure uy at L/3.
//   Verify: uy_B(load_A) == uy_A(load_B).
//
// Ref: Przemieniecki, §2.5 — symmetry of stiffness matrix.

#[test]
fn validation_matrix_symmetry_reciprocal_displacement() {
    let l = 9.0;
    let n = 9;
    let p = 1.0;

    // Node at L/3 = 3.0 m -> node 4 (index = 3.0 / (9.0/9) + 1 = 4)
    // Node at 2L/3 = 6.0 m -> node 7
    let node_i = 4_usize;
    let node_j = 7_usize;

    // System A: unit load at node_i, measure displacement at node_j
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();
    let uy_j_from_i = results_a.displacements.iter()
        .find(|d| d.node_id == node_j).unwrap().uy;

    // System B: unit load at node_j, measure displacement at node_i
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();
    let uy_i_from_j = results_b.displacements.iter()
        .find(|d| d.node_id == node_i).unwrap().uy;

    // Maxwell reciprocal theorem: delta_ij = delta_ji
    assert_close(uy_j_from_i, uy_i_from_j, 0.001,
        "Matrix symmetry: uy_j(load@i) = uy_i(load@j)");

    // Also verify the displacements are nonzero (meaningful test)
    assert!(uy_j_from_i.abs() > 1e-10,
        "Symmetry: displacement must be nonzero, got {:.2e}", uy_j_from_i);
}

// ================================================================
// 2. Linearity: 2x Load Produces 2x Displacement
// ================================================================
//
// For a linear elastic solver, the relationship K*u = F is linear.
// Doubling the applied load must exactly double all displacements.
//
// Test: fixed-free cantilever with tip load P and 2P.
//   Verify: all DOFs scale by factor 2.
//
// Ref: Ghali & Neville, §4.1 — proportionality of loads and displacements.

#[test]
fn validation_matrix_linearity_double_load() {
    let l = 6.0;
    let n = 6;
    let p = 15.0;
    let tip = n + 1;

    // Single load P
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_1 = make_beam(n, l, E, A, IZ, "fixed", None, loads_1);
    let results_1 = linear::solve_2d(&input_1).unwrap();
    let tip_uy_1 = results_1.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy;
    let tip_rz_1 = results_1.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().rz;

    // Double load 2P
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fy: -2.0 * p, mz: 0.0,
    })];
    let input_2 = make_beam(n, l, E, A, IZ, "fixed", None, loads_2);
    let results_2 = linear::solve_2d(&input_2).unwrap();
    let tip_uy_2 = results_2.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy;
    let tip_rz_2 = results_2.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().rz;

    // Triple load 3P
    let loads_3 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fy: -3.0 * p, mz: 0.0,
    })];
    let input_3 = make_beam(n, l, E, A, IZ, "fixed", None, loads_3);
    let results_3 = linear::solve_2d(&input_3).unwrap();
    let tip_uy_3 = results_3.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy;

    // Linearity: 2P -> 2*delta, 3P -> 3*delta
    assert_close(tip_uy_2, 2.0 * tip_uy_1, 0.001,
        "Linearity: 2P produces 2x tip deflection");
    assert_close(tip_rz_2, 2.0 * tip_rz_1, 0.001,
        "Linearity: 2P produces 2x tip rotation");
    assert_close(tip_uy_3, 3.0 * tip_uy_1, 0.001,
        "Linearity: 3P produces 3x tip deflection");

    // Verify the deflection matches the cantilever formula: PL^3/(3EI)
    let e_eff = E * 1000.0;
    let expected: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip_uy_1.abs(), expected, 0.02,
        "Linearity: tip deflection = PL^3/(3EI)");
}

// ================================================================
// 3. Superposition: Combined Load = Sum of Individual Responses
// ================================================================
//
// The principle of superposition holds for linear systems:
//   u(F1 + F2) = u(F1) + u(F2)
//
// Test: propped cantilever (fixed + roller) with:
//   Load A: point load Fy at midspan
//   Load B: moment Mz at midspan
// Combined response at every node must equal the sum of individual responses.
//
// Ref: Hibbeler, "Structural Analysis", Ch. 4.

#[test]
fn validation_matrix_superposition_combined_loads() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;
    let m = 30.0;
    let mid = n / 2 + 1; // node 5

    // Load A: point force at midspan
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();

    // Load B: moment at midspan
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();

    // Combined: both loads simultaneously
    let loads_c = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: 0.0, mz: m,
        }),
    ];
    let input_c = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_c);
    let results_c = linear::solve_2d(&input_c).unwrap();

    // Verify superposition at every interior node (nodes 2..n)
    for node_id in 2..=n {
        let da = results_a.displacements.iter()
            .find(|d| d.node_id == node_id).unwrap();
        let db = results_b.displacements.iter()
            .find(|d| d.node_id == node_id).unwrap();
        let dc = results_c.displacements.iter()
            .find(|d| d.node_id == node_id).unwrap();

        assert_close(dc.uy, da.uy + db.uy, 0.001,
            &format!("Superposition uy at node {}", node_id));
        assert_close(dc.rz, da.rz + db.rz, 0.001,
            &format!("Superposition rz at node {}", node_id));
    }

    // Also verify superposition of reactions
    let sum_ry_a: f64 = results_a.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_b: f64 = results_b.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_c: f64 = results_c.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_c, sum_ry_a + sum_ry_b, 0.001,
        "Superposition: sum of Ry reactions");
}

// ================================================================
// 4. Positive Definiteness: Strain Energy > 0 for Nonzero u
// ================================================================
//
// For a stable, restrained structure, the reduced stiffness matrix K
// is positive definite: u^T * K * u > 0 for any nonzero displacement u.
// Equivalently, the strain energy U = 0.5 * u^T * F = 0.5 * Sigma(Fi * ui)
// must be strictly positive when there is nonzero deformation.
//
// Test: portal frame with lateral load. Compute strain energy as
//   U = 0.5 * sum(applied_load_i * displacement_i).
// This must be strictly positive.
//
// Ref: Bathe, §4.2 — positive definiteness of stiffness matrices.

#[test]
fn validation_matrix_positive_definiteness_strain_energy() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 25.0;
    let f_grav = -10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, f_grav);
    let results = linear::solve_2d(&input).unwrap();

    // Compute strain energy as U = 0.5 * sum(Fi * ui) for applied loads.
    // Portal frame: lateral load fx at node 2, gravity fy at nodes 2 and 3.
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Work done by applied loads:
    //   fx=f_lat at node 2 * ux_2
    //   fy=f_grav at node 2 * uy_2
    //   fy=f_grav at node 3 * uy_3
    let work: f64 = f_lat * d2.ux + f_grav * d2.uy + f_grav * d3.uy;
    let strain_energy: f64 = 0.5 * work;

    assert!(strain_energy > 0.0,
        "Positive definiteness: strain energy must be > 0, got {:.6e}", strain_energy);

    // Also verify with a different load pattern: pure moment at beam midspan
    let input2 = make_beam(4, 8.0, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: 0.0, mz: 50.0,
        })],
    );
    let results2 = linear::solve_2d(&input2).unwrap();
    let d_mid = results2.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let work2: f64 = 50.0 * d_mid.rz;
    let se2: f64 = 0.5 * work2;
    assert!(se2 > 0.0,
        "Positive definiteness (moment load): U = {:.6e} > 0", se2);

    // Verify energy is proportional to load squared (U ~ P^2 for linear)
    let input3 = make_portal_frame(h, w, E, A, IZ, 2.0 * f_lat, 2.0 * f_grav);
    let results3 = linear::solve_2d(&input3).unwrap();
    let d2_3 = results3.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3_3 = results3.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let work3: f64 = 2.0 * f_lat * d2_3.ux + 2.0 * f_grav * d2_3.uy + 2.0 * f_grav * d3_3.uy;
    let se3: f64 = 0.5 * work3;
    // With 2x load, displacements are 2x, so work = 2F * 2u = 4 * F*u
    // Strain energy = 0.5 * 4 * F*u = 4 * U_original
    assert_close(se3, 4.0 * strain_energy, 0.001,
        "Strain energy scales as P^2: U(2P) = 4*U(P)");
}

// ================================================================
// 5. Rigid Body Mode: Uniform Translation -> Zero Internal Forces
// ================================================================
//
// If a structure undergoes a pure rigid body translation (all nodes
// move by the same amount), no strains develop and all internal
// forces must be zero. For a restrained structure, we verify this
// indirectly: a load that would produce pure translation in an
// unrestrained body should produce zero bending moments in the
// axial direction.
//
// Test: cantilever with a purely axial load at the tip.
// The beam deforms axially but no bending occurs. Verify:
//   - Shear forces (v_start, v_end) are zero in all elements.
//   - Bending moments (m_start, m_end) are zero in all elements.
//   - Axial forces (n_start, n_end) are constant throughout.
//
// Ref: Przemieniecki, §2.2 — rigid body modes and null space of K.

#[test]
fn validation_matrix_rigid_body_zero_bending() {
    let l = 10.0;
    let n = 5;
    let f_axial = 100.0;
    let tip = n + 1;

    // Cantilever with pure axial tip load (no transverse component)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: f_axial, fy: 0.0, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // All elements should have zero shear and zero bending moment.
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-6,
            "Rigid body: V_start of elem {} = {:.2e}, should be 0",
            ef.element_id, ef.v_start);
        assert!(ef.v_end.abs() < 1e-6,
            "Rigid body: V_end of elem {} = {:.2e}, should be 0",
            ef.element_id, ef.v_end);
        assert!(ef.m_start.abs() < 1e-6,
            "Rigid body: M_start of elem {} = {:.2e}, should be 0",
            ef.element_id, ef.m_start);
        assert!(ef.m_end.abs() < 1e-6,
            "Rigid body: M_end of elem {} = {:.2e}, should be 0",
            ef.element_id, ef.m_end);
    }

    // Axial force should be constant = f_axial throughout (tension).
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), f_axial, 0.001,
            &format!("Rigid body: N_start of elem {} = P", ef.element_id));
        assert_close(ef.n_end.abs(), f_axial, 0.001,
            &format!("Rigid body: N_end of elem {} = P", ef.element_id));
    }

    // Transverse displacements should be zero everywhere.
    for d in &results.displacements {
        assert!(d.uy.abs() < 1e-10,
            "Rigid body: uy at node {} = {:.2e}, should be 0", d.node_id, d.uy);
        assert!(d.rz.abs() < 1e-10,
            "Rigid body: rz at node {} = {:.2e}, should be 0", d.node_id, d.rz);
    }
}

// ================================================================
// 6. Equilibrium: Sum of Element Forces at Free Nodes = Applied Loads
// ================================================================
//
// At every free (unsupported) node, the sum of element end forces
// from all elements meeting at that node must equal the externally
// applied load. This is the fundamental equilibrium condition:
//   sum(element_forces_at_node) = applied_load_at_node
//
// Test: portal frame with lateral and gravity loads. Check that at
// free nodes (2 and 3), the element forces sum to the applied loads.
// The element end forces include axial (N) mapped through the
// element orientation and shear (V) similarly rotated.
//
// Ref: McGuire et al., §2.3 — nodal equilibrium in assembly.

#[test]
fn validation_matrix_equilibrium_at_free_nodes() {
    let l = 6.0;
    let p = 40.0;

    // Simply supported beam with 3 elements, point load at midspan (node 2).
    // Nodes: 1(0,0), 2(L/3,0), 3(2L/3,0), 4(L,0)
    // Load: Fy = -P at node 3 (midspan-ish)
    // Free nodes: 2 and 3 (no supports)
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, l / 3.0, 0.0),
            (3, 2.0 * l / 3.0, 0.0),
            (4, l, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 4, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // For horizontal elements, shear V maps to global Fy, axial N maps to global Fx.
    // At node 2 (free, no applied load): V_end(elem1) + V_start(elem2) should = 0
    // The sign convention: v_end is the shear at the j-end of an element,
    // v_start is at the i-end. For equilibrium at the node, the sum of
    // forces in the global y-direction must equal the applied load.
    // For horizontal beams: shear V acts in the y-direction.
    // Element end shear at node: v_end points in +y for element ending there,
    // v_start points in +y for element starting there. Equilibrium requires:
    //   -v_end(elem ending at node) - v_start(elem starting at node) = Fy_applied
    // (negative because element forces are internal — acting on the node)

    // Node 2 (free, no load): element 1 ends at node 2, element 2 starts at node 2
    // Equilibrium: v_end(elem1) - v_start(elem2) = 0 (no applied load)
    let fy_node2: f64 = ef1.v_end - ef2.v_start;
    assert!(fy_node2.abs() < 0.5,
        "Equilibrium at node 2: sum Fy = {:.4}, should be ~0 (no applied load)", fy_node2);

    // Node 2 moment equilibrium: m_end(elem1) - m_start(elem2) = 0
    let mz_node2: f64 = ef1.m_end - ef2.m_start;
    assert!(mz_node2.abs() < 0.5,
        "Equilibrium at node 2: sum Mz = {:.4}, should be ~0", mz_node2);

    // Node 3 (load P downward): element 2 ends at node 3, element 3 starts at node 3
    // Equilibrium: v_end(elem2) - v_start(elem3) + Fy = 0, so v_end - v_start = -Fy = P
    let fy_node3: f64 = ef2.v_end - ef3.v_start;
    assert_close(fy_node3, p, 0.02,
        "Equilibrium at node 3: shear jump = P (applied load)");

    // Global equilibrium: sum of reactions = sum of applied loads
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Global equilibrium: sum Ry = P");
}

// ================================================================
// 7. Compatibility: Displacements Continuous at Shared Nodes
// ================================================================
//
// The finite element assembly guarantees that all elements sharing
// a node have the same displacement at that node. This is the
// fundamental compatibility condition — no gaps or overlaps.
//
// Test: multi-element beam (4 elements). For each interior node,
// verify that the displacement from the global solution is
// consistent (single-valued). Also verify that the deformed shape
// is smooth: interior displacements lie between their neighbors
// (for a monotonic loading).
//
// Ref: Przemieniecki, §2.3 — displacement compatibility constraints.

#[test]
fn validation_matrix_compatibility_continuous_displacements() {
    let l = 12.0;
    let n = 4;
    let p = 30.0;
    let tip = n + 1;

    // Cantilever with tip load: nodes 1..5 along X.
    // Deflection curve should be monotonically increasing from root to tip.
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify displacements exist for all nodes (no gaps in assembly).
    for node_id in 1..=tip {
        let d = results.displacements.iter().find(|d| d.node_id == node_id);
        assert!(d.is_some(),
            "Compatibility: displacement for node {} must exist", node_id);
    }

    // For a cantilever with downward tip load, uy should be
    // monotonically decreasing (more negative) from root to tip.
    // Node 1 (fixed): uy = 0. Node 5 (tip): uy = most negative.
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.uy.abs() < 1e-10,
        "Compatibility: fixed end uy = 0, got {:.2e}", d1.uy);

    for i in 2..=tip {
        let d_prev = results.displacements.iter().find(|d| d.node_id == i - 1).unwrap();
        let d_curr = results.displacements.iter().find(|d| d.node_id == i).unwrap();
        assert!(d_curr.uy <= d_prev.uy,
            "Compatibility: uy at node {} ({:.6}) <= uy at node {} ({:.6})",
            i, d_curr.uy, i - 1, d_prev.uy);
    }

    // Verify analytical tip deflection: PL^3/(3EI)
    let e_eff = E * 1000.0;
    let expected: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);
    let d_tip = results.displacements.iter().find(|d| d.node_id == tip).unwrap();
    assert_close(d_tip.uy.abs(), expected, 0.02,
        "Compatibility: tip deflection = PL^3/(3EI)");

    // Verify rotation is also monotonically increasing in magnitude
    // (for cantilever with downward tip load, rotation becomes more negative)
    for i in 2..=tip {
        let d_prev = results.displacements.iter().find(|d| d.node_id == i - 1).unwrap();
        let d_curr = results.displacements.iter().find(|d| d.node_id == i).unwrap();
        assert!(d_curr.rz.abs() >= d_prev.rz.abs() - 1e-10,
            "Compatibility: |rz| at node {} ({:.6}) >= |rz| at node {} ({:.6})",
            i, d_curr.rz.abs(), i - 1, d_prev.rz.abs());
    }
}

// ================================================================
// 8. Sign Convention Consistency: Reaction = -(Sum of Element Forces)
// ================================================================
//
// At a supported node, the reaction force equals the negative of the
// sum of internal element forces acting on that node. This is because
// the reaction is the external force needed to enforce the boundary
// condition, and it must balance all internal forces at that DOF.
//
// Test: propped cantilever (fixed at node 1, roller at end).
//   At the fixed end (node 1), only element 1 starts there.
//   Ry_reaction = -(v_start of element 1)  [for horizontal beam]
//   Mz_reaction = -(m_start of element 1)
//
// At the roller end, only the last element ends there.
//   Ry_reaction = -(v_end of last element)
//
// Ref: McGuire et al., §3.4 — support reactions from assembly.

#[test]
fn validation_matrix_sign_convention_reactions() {
    let l = 10.0;
    let n = 5;
    let p = 50.0;
    let mid = 3; // node at L*2/5

    // Propped cantilever: fixed at node 1, rollerX at node 6.
    // Point load at node 3.
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // At node 1 (fixed support), only element 1 is attached (i-end).
    // Reaction at support absorbs element forces. Check magnitudes match.
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(r1.ry.abs(), ef1.v_start.abs(), 0.01,
        "Sign convention: |Ry(node 1)| = |V_start(elem 1)|");
    assert_close(r1.mz.abs(), ef1.m_start.abs(), 0.01,
        "Sign convention: |Mz(node 1)| = |M_start(elem 1)|");

    // At the roller end (node n+1), only element n is attached (j-end).
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(r_end.ry.abs(), ef_last.v_end.abs(), 0.01,
        "Sign convention: |Ry(end node)| = |V_end(last elem)|");

    // Global equilibrium must hold: sum(Ry) = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Sign convention: global equilibrium sum Ry = P");

    // Moment equilibrium about node 1:
    // r1.mz + r_end.ry * L - P * x_load = 0
    let x_load: f64 = (mid as f64 - 1.0) * l / n as f64;
    let x_end: f64 = l;
    let moment_about_1: f64 = r1.mz + r_end.ry * x_end - p * x_load;
    assert!(moment_about_1.abs() < 1.0,
        "Sign convention: moment equilibrium about node 1, residual = {:.4}", moment_about_1);
}
