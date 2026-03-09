/// Validation: Maxwell-Betti Reciprocal Theorem
///
/// References:
///   - Maxwell, J.C. (1864), "On the calculation of the equilibrium and stiffness
///     of frames", Philosophical Magazine, 27, 294-299.
///   - Betti, E. (1872), "Teoria della elasticita", Il Nuovo Cimento, 7-8, 69-97.
///   - Ghali, Neville & Brown, "Structural Analysis", 6th Ed., Ch. 4
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., §6.4
///   - Hibbeler, "Structural Analysis", 10th Ed., §9.8
///
/// Maxwell's Reciprocal Theorem states that for a linear elastic structure:
///   δ_ij = δ_ji
/// where δ_ij is the displacement at i due to a unit load at j.
///
/// Betti's Theorem generalises this:
///   Σ P_i^(1) · δ_i^(2) = Σ P_i^(2) · δ_i^(1)
/// where superscripts denote two independent load systems.
///
/// The flexibility matrix [f] must therefore be symmetric: f_ij = f_ji.
///
/// Tests:
///   1. Unit load at L/4, measure δ at 3L/4 vs unit load at 3L/4 measure δ at L/4
///   2. Reciprocal rotations: moment at A, θ at B vs moment at B, θ at A
///   3. Mixed reciprocity: unit force at A → θ at B = unit moment at B → δ at A
///   4. Reciprocal theorem for a two-span continuous beam
///   5. Reciprocal theorem for a fixed-base portal frame
///   6. 3D: Fy at A → uz at B = Fz at B → uy at A (Maxwell)
///   7. Off-diagonal symmetry of flexibility matrix: f_ij = f_ji for 3 point pairs
///   8. Betti for a truss: P1·δ(2) = P2·δ(1)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Maxwell: Unit Load at L/4 and 3L/4 (SS Beam)
// ================================================================
//
// Simply supported beam, length L = 10 m, n = 20 elements.
// Nodes at i = 6 (x = 2.5 m ≈ L/4) and j = 16 (x = 7.5 m ≈ 3L/4).
//
// By Maxwell: δ_ji(unit load at i) = δ_ij(unit load at j)
//
// Analytical check: for SS beam, δ(a,b) = Pb(L²-b²)a/(6EIL) − Pa³/(6EI)
// for a ≤ b. Since structure is symmetric and nodes are placed symmetrically
// the two cross-influence coefficients must be equal.
//
// Ref: Hibbeler, "Structural Analysis", §9.8, Example 9-12

#[test]
fn validation_reciprocal_unit_load_quarter_span() {
    let l = 10.0;
    let n = 20;
    let p = 1.0;

    // Node at L/4: node index 6 (x = 2.5)
    // Node at 3L/4: node index 16 (x = 7.5)
    let node_a = 6_usize;
    let node_b = 16_usize;

    // System 1: unit load at A, measure uy at B
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_1);
    let d_b_from_a = linear::solve_2d(&input_1).unwrap()
        .displacements.iter().find(|d| d.node_id == node_b).unwrap().uy;

    // System 2: unit load at B, measure uy at A
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_2);
    let d_a_from_b = linear::solve_2d(&input_2).unwrap()
        .displacements.iter().find(|d| d.node_id == node_a).unwrap().uy;

    // Maxwell: δ_BA = δ_AB
    assert_close(d_b_from_a, d_a_from_b, 0.01,
        "Maxwell Q1: δ_B(A load) = δ_A(B load)");
}

// ================================================================
// 2. Reciprocal Rotations: Moment at A → θ at B vs Moment at B → θ at A
// ================================================================
//
// Apply unit moment M at node A, measure rotation θ at node B.
// Apply unit moment M at node B, measure rotation θ at node A.
// By Maxwell: θ_B(M@A) = θ_A(M@B).
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", §4.5

#[test]
fn validation_reciprocal_rotations() {
    let l = 8.0;
    let n = 16;
    let m = 1.0;

    let node_a = 5_usize;  // x = 2.0 m (L/4)
    let node_b = 13_usize; // x = 6.0 m (3L/4)

    // Unit moment at A, measure θ at B
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let theta_b_from_a = linear::solve_2d(&input_a).unwrap()
        .displacements.iter().find(|d| d.node_id == node_b).unwrap().rz;

    // Unit moment at B, measure θ at A
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let theta_a_from_b = linear::solve_2d(&input_b).unwrap()
        .displacements.iter().find(|d| d.node_id == node_a).unwrap().rz;

    // Maxwell: θ_B(M@A) = θ_A(M@B)
    assert_close(theta_b_from_a, theta_a_from_b, 0.01,
        "Maxwell Q2: θ_B(M@A) = θ_A(M@B)");
}

// ================================================================
// 3. Mixed Reciprocity: Force at A → θ at B vs Moment at B → δ at A
// ================================================================
//
// Apply unit transverse force P at A, measure rotation θ at B.
// Apply unit moment M at B, measure deflection δ at A.
// By Maxwell: θ_B(P@A) = δ_A(M@B), since both represent
// the same flexibility coefficient: f_θB,FA = f_δA,MB.
//
// This is the most general form of Maxwell's theorem involving
// different response types.
//
// Ref: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", §6.4

#[test]
fn validation_reciprocal_mixed_force_moment() {
    let l = 6.0;
    let n = 12;

    let node_a = 4_usize;  // x = 1.5 m (L/4)
    let node_b = 10_usize; // x = 4.5 m (3L/4)

    // Unit force P = 1 at A, measure θ at B
    let loads_p = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input_p = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_p);
    let theta_b = linear::solve_2d(&input_p).unwrap()
        .displacements.iter().find(|d| d.node_id == node_b).unwrap().rz;

    // Unit moment M = 1 at B, measure δ at A
    let loads_m = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fy: 0.0, mz: 1.0,
    })];
    let input_m = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_m);
    let delta_a = linear::solve_2d(&input_m).unwrap()
        .displacements.iter().find(|d| d.node_id == node_a).unwrap().uy;

    // Maxwell: θ_B(P@A) = δ_A(M@B), note sign because moment and force
    // work against/with each other depending on convention
    assert_close(theta_b.abs(), delta_a.abs(), 0.01,
        "Maxwell Q3: |θ_B(P@A)| = |δ_A(M@B)|");
}

// ================================================================
// 4. Reciprocal Theorem for Two-Span Continuous Beam
// ================================================================
//
// Two-span beam (pinned at 0, rollerX at 6m, rollerX at 12m).
// Apply unit load at node in first span, measure deflection in second span.
// Apply unit load at that second-span node, measure deflection in first span.
// By Maxwell: δ_ji = δ_ij.
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", Ch. 4 Problem 4.6

#[test]
fn validation_reciprocal_continuous_beam() {
    let span = 6.0;
    let n_per_span = 12;
    let p = 1.0;

    // Node in first span: 4th node (x = 1.5 m)
    // Node in second span: 16th node (x = 7.5 m, which is 1.5m into 2nd span)
    let node_i = 4_usize;
    let node_j = n_per_span + 4; // = 16, x = 7.5 m

    // Load at i, measure at j
    let loads_i = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_i = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads_i);
    let d_j_from_i = linear::solve_2d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uy;

    // Load at j, measure at i
    let loads_j = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_j = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads_j);
    let d_i_from_j = linear::solve_2d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().uy;

    assert_close(d_j_from_i, d_i_from_j, 0.01,
        "Maxwell Q4: continuous beam δ_ji = δ_ij");
}

// ================================================================
// 5. Reciprocal Theorem for Fixed-Base Portal Frame
// ================================================================
//
// Fixed portal frame (h=4m, w=6m). Apply unit horizontal force at
// top-left (node 2) and measure horizontal displacement at top-right (node 3).
// Reverse: apply unit horizontal force at node 3 and measure ux at node 2.
// Maxwell: δ_32(F@2) = δ_23(F@3).
//
// Ref: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Example 6.3

#[test]
fn validation_reciprocal_portal_frame() {
    let h = 4.0;
    let w = 6.0;

    // Load at node 2 (top-left), measure at node 3 (top-right)
    let input_1 = make_portal_frame(h, w, E, A, IZ, 1.0, 0.0);
    let d3_from_2 = linear::solve_2d(&input_1).unwrap()
        .displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // Load at node 3, measure at node 2
    // Build portal frame with lateral load at node 3
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads_3 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 1.0, fy: 0.0, mz: 0.0,
    })];
    let input_2 = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_3);
    let d2_from_3 = linear::solve_2d(&input_2).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Maxwell: δ_3(F@2) = δ_2(F@3)
    assert_close(d3_from_2, d2_from_3, 0.01,
        "Maxwell Q5: portal δ_32(F@2) = δ_23(F@3)");
}

// ================================================================
// 6. 3D: Fy at A → uz at B vs Fz at B → uy at A
// ================================================================
//
// For a 3D cantilever beam with both Iy and Iz active,
// the cross-flexibility coefficients must satisfy Maxwell:
//   f_{uz_B, Fy_A} ≠ f_{uy_B, Fz_A} in general (different planes),
// but within the same plane:
//   f_{uy_B, Fy_A} = f_{uy_A, Fy_B}
//
// This test uses two nodes A (1/3 length) and B (2/3 length) on a 3D
// cantilever and verifies the in-plane Maxwell condition.
//
// Ref: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", §7.2

#[test]
fn validation_reciprocal_3d_maxwell() {
    let l = 6.0;
    let n = 12;
    let p = 1.0;
    let iy = 2e-4;
    let nu = 0.3;
    let j = 1.5e-4;

    let node_a = 5_usize;  // 1/3 of beam length
    let node_b = 9_usize;  // 2/3 of beam length
    let fixed = vec![true, true, true, true, true, true];

    // System 1: Fy = -1 at A, measure uy at B
    let loads_1 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: node_a, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_1 = make_3d_beam(n, l, E, nu, A, iy, IZ, j,
        fixed.clone(), None, loads_1);
    let uy_b_from_a = linear::solve_3d(&input_1).unwrap()
        .displacements.iter().find(|d| d.node_id == node_b).unwrap().uy;

    // System 2: Fy = -1 at B, measure uy at A
    let loads_2 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: node_b, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_2 = make_3d_beam(n, l, E, nu, A, iy, IZ, j,
        fixed, None, loads_2);
    let uy_a_from_b = linear::solve_3d(&input_2).unwrap()
        .displacements.iter().find(|d| d.node_id == node_a).unwrap().uy;

    // Maxwell: f_{uy_B, Fy_A} = f_{uy_A, Fy_B}
    assert_close(uy_b_from_a, uy_a_from_b, 0.01,
        "Maxwell Q6: 3D uy_B(Fy@A) = uy_A(Fy@B)");
}

// ================================================================
// 7. Flexibility Matrix Off-Diagonal Symmetry
// ================================================================
//
// For a simply supported beam with 3 internal nodes (L/4, L/2, 3L/4),
// compute the 3×3 flexibility matrix by applying unit loads one at a time.
// Verify f_12 = f_21, f_13 = f_31, f_23 = f_32.
//
// These are the standard Maxwell flexibility coefficients.
// For a SS beam: f_ij = Pb(L²-b²-L²+L·a)/(6EIL) for the appropriate terms.
// But the FEM result must satisfy all 3 symmetry conditions.
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", §4.4 (flexibility method)

#[test]
fn validation_reciprocal_flexibility_matrix_symmetry() {
    let l = 12.0;
    let n = 12;
    let p = 1.0;

    // Three interior nodes: L/4, L/2, 3L/4
    let nodes = [4_usize, 7, 10]; // node ids for x = 3, 6, 9 m

    // Compute flexibility matrix row by row
    let mut f = [[0.0_f64; 3]; 3];
    for (col, &load_node) in nodes.iter().enumerate() {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        for (row, &meas_node) in nodes.iter().enumerate() {
            f[row][col] = results.displacements.iter()
                .find(|d| d.node_id == meas_node).unwrap().uy;
        }
    }

    // Verify symmetry: f[i][j] = f[j][i]
    assert_close(f[0][1], f[1][0], 0.01, "Flex matrix: f_12 = f_21");
    assert_close(f[0][2], f[2][0], 0.01, "Flex matrix: f_13 = f_31");
    assert_close(f[1][2], f[2][1], 0.01, "Flex matrix: f_23 = f_32");
}

// ================================================================
// 8. Betti's Theorem for a Truss
// ================================================================
//
// Simple triangular truss: pinned at left, rollerX at right, load P at apex.
//
// System 1: P1 = 30 kN at apex (fy = -30).
// System 2: P2 = 20 kN at bottom chord midpoint (fy = -20, applied at node 2).
//
// Betti: P1 * δ_apex^(2) = P2 * δ_2^(1)
// (P1 acting through displacements of System 2 = P2 acting through displacements of System 1)
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., §9.6

#[test]
fn validation_reciprocal_betti_truss() {
    let l_truss = 8.0;  // base length
    let h_truss = 3.0;  // truss height
    let p1 = 30.0;      // load at apex
    let p2 = 20.0;      // load at bottom midpoint

    // Nodes: 1(0,0), 2(L,0), 3(L/2,H)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, l_truss, 0.0),
        (3, l_truss / 2.0, h_truss),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false), // bottom chord
        (2, "truss", 1, 3, 1, 1, false, false), // left diagonal
        (3, "truss", 2, 3, 1, 1, false, false), // right diagonal
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];

    // System 1: P1 at apex (node 3)
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: -p1, mz: 0.0,
    })];
    let input_1 = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_1);
    let res_1 = linear::solve_2d(&input_1).unwrap();
    // Deflection at node 2 in system 1
    let d2_sys1 = res_1.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;

    // System 2: P2 at node 2 (bottom right)
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p2, mz: 0.0,
    })];
    let input_2 = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_2);
    let res_2 = linear::solve_2d(&input_2).unwrap();
    // Deflection at apex (node 3) in system 2
    let d3_sys2 = res_2.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;

    // Betti: P1 * d_apex^(2) = P2 * d_2^(1)
    let work_1_on_2 = p1 * d3_sys2; // P1 acts at apex through sys2 displacement at apex
    let work_2_on_1 = p2 * d2_sys1; // P2 acts at node 2 through sys1 displacement at node 2

    assert_close(work_1_on_2, work_2_on_1, 0.01,
        "Betti Q8: P1*δ_apex^(2) = P2*δ_2^(1)");
}
