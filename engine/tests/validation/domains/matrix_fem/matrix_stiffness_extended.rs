/// Validation: Matrix Stiffness Method Fundamentals
///
/// Tests verify core properties of the direct stiffness method:
///   1. Single element stiffness coefficients vs analytical formulas
///   2. Assembly of 2 elements: symmetry and bandwidth
///   3. Boundary condition enforcement: pinned vs fixed effect
///   4. Condition number: well-conditioned for simple beam
///   5. Load vector assembly: UDL equivalent nodal forces vs FEF formulas
///   6. Superposition: sum of separate load cases = combined solution
///   7. Static condensation: full DOF vs condensed interior DOFs
///   8. Positive-definiteness: all eigenvalues positive for stable structure
///
/// References:
///   - Przemieniecki, J.S., "Theory of Matrix Structural Analysis", 1968
///   - McGuire, Gallagher, Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - Bathe, K.J., "Finite Element Procedures", 2014
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::assembly::assemble_2d;
use dedaliano_engine::element::frame_local_stiffness_2d;
use dedaliano_engine::element::fef_distributed_2d;
use dedaliano_engine::linalg::{extract_submatrix, condition_estimate, jacobi_eigen};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 -> kN/m^2)
const A: f64 = 0.01;       // m^2
const IZ: f64 = 1e-4;      // m^4
// EI = E * 1000 * IZ = 200_000_000 * 1e-4 = 20_000 kN*m^2 (used in comments)

// ================================================================
// 1. Single Element Stiffness: Verify Coefficients
// ================================================================
//
// For a single Euler-Bernoulli beam element (phi=0):
//   k11 = EA/L         (axial)
//   k22 = 12EI/L^3     (transverse shear)
//   k23 = 6EI/L^2      (shear-rotation coupling)
//   k33 = 4EI/L        (bending)
//   k36 = 2EI/L        (carry-over bending)
//
// Reference: Przemieniecki Ch. 4

#[test]
fn validation_single_element_stiffness_coefficients() {
    let l = 5.0;
    let e_kn = E * 1000.0; // convert to kN/m^2
    let k = frame_local_stiffness_2d(e_kn, A, IZ, l, false, false, 0.0);

    // Expected stiffness coefficients
    let ea_l = e_kn * A / l;
    let ei = e_kn * IZ;
    let c1 = 12.0 * ei / l.powi(3); // 12EI/L^3
    let c2 = 6.0 * ei / l.powi(2);  // 6EI/L^2
    let c3 = 4.0 * ei / l;          // 4EI/L
    let c4 = 2.0 * ei / l;          // 2EI/L

    // k is 6x6 row-major: [u1, v1, theta1, u2, v2, theta2]
    // Axial: k[0,0] = EA/L
    assert_close(k[0 * 6 + 0], ea_l, 1e-10, "k11 = EA/L");
    // Axial coupling: k[0,3] = -EA/L
    assert_close(k[0 * 6 + 3], -ea_l, 1e-10, "k14 = -EA/L");

    // Transverse: k[1,1] = 12EI/L^3
    assert_close(k[1 * 6 + 1], c1, 1e-10, "k22 = 12EI/L^3");
    // Shear-rotation coupling: k[1,2] = 6EI/L^2
    assert_close(k[1 * 6 + 2], c2, 1e-10, "k23 = 6EI/L^2");
    // Bending: k[2,2] = 4EI/L
    assert_close(k[2 * 6 + 2], c3, 1e-10, "k33 = 4EI/L");
    // Carry-over: k[2,5] = 2EI/L
    assert_close(k[2 * 6 + 5], c4, 1e-10, "k36 = 2EI/L");

    // Opposite end transverse: k[4,4] = 12EI/L^3
    assert_close(k[4 * 6 + 4], c1, 1e-10, "k55 = 12EI/L^3");
    // Opposite end bending: k[5,5] = 4EI/L
    assert_close(k[5 * 6 + 5], c3, 1e-10, "k66 = 4EI/L");

    // Anti-symmetry: k[1,4] = -12EI/L^3
    assert_close(k[1 * 6 + 4], -c1, 1e-10, "k25 = -12EI/L^3");
    // k[4,5] = -6EI/L^2
    assert_close(k[4 * 6 + 5], -c2, 1e-10, "k56 = -6EI/L^2");
}

// ================================================================
// 2. Assembly of 2 Elements: Symmetry and Bandwidth
// ================================================================
//
// Two-element beam: nodes 1-2-3.
// The 9x9 global stiffness matrix must be symmetric and banded.
// Bandwidth = 6 (two element DOF sets overlap at interior node).
//
// Reference: McGuire et al., Ch. 3

#[test]
fn validation_two_element_assembly_symmetry_and_bandwidth() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![], // No supports -- we want the full unreduced K
        vec![],
    );

    let dof_num = DofNumbering::build_2d(&input);
    let assembly = assemble_2d(&input, &dof_num);
    let n = dof_num.n_total; // 3 nodes x 3 DOFs = 9
    let k = &assembly.k;

    // (a) Symmetry: K[i,j] == K[j,i]
    let mut max_asym = 0.0_f64;
    for i in 0..n {
        for j in (i + 1)..n {
            let diff = (k[i * n + j] - k[j * n + i]).abs();
            max_asym = max_asym.max(diff);
        }
    }
    assert!(
        max_asym < 1e-10,
        "Global K should be symmetric; max asymmetry = {:.2e}",
        max_asym
    );

    // (b) Bandwidth: for a beam along X with 3 nodes (DOFs per node=3),
    //     elements connect consecutive nodes, so half-bandwidth = 6.
    //     Beyond that, entries should be zero.
    //     DOF ordering: node 1 (DOFs 0,1,2), node 2 (DOFs 3,4,5), node 3 (DOFs 6,7,8)
    //     Element 1 couples DOFs 0-5, Element 2 couples DOFs 3-8.
    //     So DOFs 0,1,2 should have zero coupling with DOFs 6,7,8.
    let mut max_outside_band = 0.0_f64;
    for i in 0..n {
        for j in 0..n {
            if (i as isize - j as isize).unsigned_abs() > 6 {
                max_outside_band = max_outside_band.max(k[i * n + j].abs());
            }
        }
    }
    assert!(
        max_outside_band < 1e-10,
        "Entries outside half-bandwidth of 6 should be zero; max = {:.2e}",
        max_outside_band
    );

    // (c) Diagonal entries should all be positive
    for i in 0..n {
        assert!(
            k[i * n + i] > 0.0,
            "Diagonal K[{},{}] = {} should be positive",
            i, i, k[i * n + i]
        );
    }

    // (d) Interior node gets contributions from both elements:
    //     k[4,4] (v2 transverse) should be sum of two element k22 values.
    //     Each element has L=4, so k22 = 12*EI/(4^3) where EI = E*1000*IZ
    let e_kn = E * 1000.0;
    let l_elem: f64 = 4.0;
    let k22_single = 12.0 * e_kn * IZ / l_elem.powi(3);
    // DOF 4 is the v-dof of node 2 (the interior node)
    // It gets k22 from element 1 (end node) + k22 from element 2 (start node)
    assert_close(k[4 * n + 4], 2.0 * k22_single, 1e-6, "Interior node v-stiffness = 2 * k22");
}

// ================================================================
// 3. Boundary Condition Enforcement: Pinned vs Fixed
// ================================================================
//
// A simply-supported beam (pinned + rollerX) is more flexible than
// a fixed-fixed beam of the same span and section.
// Under the same UDL, the fixed beam should have smaller midspan
// deflection: delta_fixed = delta_ss / 5.
//
// SS UDL: delta = 5qL^4 / (384EI)
// FF UDL: delta = qL^4 / (384EI)

#[test]
fn validation_boundary_condition_pinned_vs_fixed() {
    let l = 8.0;
    let q = -10.0;
    let n = 8;

    // Simply-supported beam
    let input_ss = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results_ss = linear::solve_2d(&input_ss).unwrap();
    let mid_ss = results_ss
        .displacements
        .iter()
        .find(|d| d.node_id == n / 2 + 1)
        .unwrap();

    // Fixed-fixed beam
    let loads_ff: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let results_ff = linear::solve_2d(&input_ff).unwrap();
    let mid_ff = results_ff
        .displacements
        .iter()
        .find(|d| d.node_id == n / 2 + 1)
        .unwrap();

    // Fixed beam should be stiffer
    assert!(
        mid_ff.uz.abs() < mid_ss.uz.abs(),
        "Fixed beam should deflect less: |delta_ff|={:.6} vs |delta_ss|={:.6}",
        mid_ff.uz.abs(),
        mid_ss.uz.abs()
    );

    // The ratio should be approximately 5
    let ratio = mid_ss.uz.abs() / mid_ff.uz.abs();
    assert_close(ratio, 5.0, 0.02, "delta_ss / delta_ff ratio");

    // Check theoretical values
    let ei = E * 1000.0 * IZ;
    let q_abs = q.abs();
    let delta_ss_exact = 5.0 * q_abs * l.powi(4) / (384.0 * ei);
    let delta_ff_exact = q_abs * l.powi(4) / (384.0 * ei);
    assert_close(mid_ss.uz.abs(), delta_ss_exact, 0.01, "SS midspan deflection");
    assert_close(mid_ff.uz.abs(), delta_ff_exact, 0.01, "FF midspan deflection");
}

// ================================================================
// 4. Condition Number: Well-Conditioned System
// ================================================================
//
// A simple beam with reasonable proportions should have a moderate
// condition number. The condition number grows with L/depth ratio
// and element count, but for a standard beam it should stay well
// below 1e12 (ill-conditioning threshold).
//
// Reference: Bathe (2014), Sec. 8.2.4

#[test]
fn validation_condition_number_simple_beam() {
    let l = 6.0;
    let n = 4;

    // Simply supported beam
    let input = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "pinned",
        Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -10.0,
            my: 0.0,
        })],
    );

    let dof_num = DofNumbering::build_2d(&input);
    let assembly = assemble_2d(&input, &dof_num);
    let nf = dof_num.n_free;
    let n_total = dof_num.n_total;

    // Extract the free-free submatrix (the one actually solved)
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&assembly.k, n_total, &free_idx, &free_idx);

    let cond = condition_estimate(&k_ff, nf);

    // For a well-conditioned problem, condition number should be moderate
    // Typically < 1e8 for a standard beam
    assert!(
        cond < 1e10,
        "Condition number {:.2e} is too high for a simple beam",
        cond
    );

    // Also verify the system is solvable (not near-singular)
    assert!(
        cond > 1.0,
        "Condition number {:.2e} should be > 1.0",
        cond
    );

    // Verify we can actually solve it
    let results = linear::solve_2d(&input).unwrap();
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap();
    assert!(d_mid.uz.abs() > 0.0, "Midspan deflection should be nonzero");
}

// ================================================================
// 5. Load Vector Assembly: UDL Equivalent Nodal Forces
// ================================================================
//
// For a uniform distributed load q on a fixed-fixed element of length L:
//   FEF_fy_i = qL/2, FEF_mz_i = qL^2/12
//   FEF_fy_j = qL/2, FEF_mz_j = -qL^2/12
//
// The assembled load vector for a single element should contain
// these values at the appropriate DOF positions.
//
// Reference: Przemieniecki Ch. 5

#[test]
fn validation_load_vector_assembly_udl() {
    let l = 6.0;
    let q = -8.0; // kN/m (downward)

    // Use the FEF function directly
    let fef = fef_distributed_2d(q, q, l);

    // Expected FEF values (for uniform load on fixed-fixed beam):
    let fy_i_expected = q * l / 2.0;           // = -8 * 6 / 2 = -24
    let mz_i_expected = q * l * l / 12.0;      // = -8 * 36 / 12 = -24
    let fy_j_expected = q * l / 2.0;           // = -24
    let mz_j_expected = -q * l * l / 12.0;     // = 24

    // fef = [fx_i, fy_i, mz_i, fx_j, fy_j, mz_j]
    assert_close(fef[0], 0.0, 1e-10, "FEF fx_i = 0");
    assert_close(fef[1], fy_i_expected, 1e-10, "FEF fy_i = qL/2");
    assert_close(fef[2], mz_i_expected, 1e-10, "FEF mz_i = qL^2/12");
    assert_close(fef[3], 0.0, 1e-10, "FEF fx_j = 0");
    assert_close(fef[4], fy_j_expected, 1e-10, "FEF fy_j = qL/2");
    assert_close(fef[5], mz_j_expected, 1e-10, "FEF mz_j = -qL^2/12");

    // Now verify through the full solver: fixed-fixed beam with UDL.
    // Use 4 elements so interior nodes have free DOFs.
    // Reactions should equal the total load: R_total = q * L = -48 kN
    // Each reaction = qL/2 = -24 kN (upward => +24), moments = +/-qL^2/12
    let n_elem = 4;
    let loads_ff: Vec<SolverLoad> = (1..=n_elem)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n_elem, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n_elem + 1).unwrap();

    // Reactions should balance the load (upward = positive)
    let total_ry = r1.rz + r2.rz;
    assert_close(total_ry, q.abs() * l, 0.01, "Total vertical reaction = qL");
    assert_close(r1.rz, q.abs() * l / 2.0, 0.01, "R1_y = qL/2");
    assert_close(r2.rz, q.abs() * l / 2.0, 0.01, "R2_y = qL/2");

    // For fixed-fixed beam, fixed-end moments = qL^2/12
    let m_expected = q.abs() * l * l / 12.0;
    assert_close(r1.my.abs(), m_expected, 0.01, "|M1| = qL^2/12");
    assert_close(r2.my.abs(), m_expected, 0.01, "|M2| = qL^2/12");
}

// ================================================================
// 6. Superposition: Two Load Cases Sum to Combined
// ================================================================
//
// Linear superposition principle: for a linear system,
// the response to loads (A + B) equals response(A) + response(B).
// This is a fundamental property of the direct stiffness method.
//
// Reference: Hibbeler, "Structural Analysis", Ch. 4

#[test]
fn validation_superposition_separate_vs_combined() {
    let l = 10.0;
    let n = 10;
    let p1 = 20.0; // Point load at node 4
    let p2 = 15.0; // Point load at node 8

    // Load case 1: point load at node 4 only
    let input1 = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "pinned",
        Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4,
            fx: 0.0,
            fz: -p1,
            my: 0.0,
        })],
    );
    let res1 = linear::solve_2d(&input1).unwrap();

    // Load case 2: point load at node 8 only
    let input2 = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "pinned",
        Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 8,
            fx: 0.0,
            fz: -p2,
            my: 0.0,
        })],
    );
    let res2 = linear::solve_2d(&input2).unwrap();

    // Combined: both loads
    let input_c = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "pinned",
        Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 4,
                fx: 0.0,
                fz: -p1,
                my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 8,
                fx: 0.0,
                fz: -p2,
                my: 0.0,
            }),
        ],
    );
    let res_c = linear::solve_2d(&input_c).unwrap();

    // Check displacements at several nodes
    for check_node in [3, 5, 6, 8] {
        let d1 = res1
            .displacements
            .iter()
            .find(|d| d.node_id == check_node)
            .unwrap();
        let d2 = res2
            .displacements
            .iter()
            .find(|d| d.node_id == check_node)
            .unwrap();
        let dc = res_c
            .displacements
            .iter()
            .find(|d| d.node_id == check_node)
            .unwrap();

        assert_close(
            dc.uz,
            d1.uz + d2.uz,
            1e-6,
            &format!("Superposition uy at node {}", check_node),
        );
        assert_close(
            dc.ry,
            d1.ry + d2.ry,
            1e-6,
            &format!("Superposition rz at node {}", check_node),
        );
    }

    // Check reactions
    let r1_a = res1.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_b = res2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_c = res_c.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(
        r1_c.rz,
        r1_a.rz + r1_b.rz,
        1e-6,
        "Superposition R1_y",
    );

    // Check element forces
    for elem_id in [3, 5, 7] {
        let ef1 = res1
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();
        let ef2 = res2
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();
        let efc = res_c
            .element_forces
            .iter()
            .find(|e| e.element_id == elem_id)
            .unwrap();

        assert_close(
            efc.m_start,
            ef1.m_start + ef2.m_start,
            1e-4,
            &format!("Superposition m_start elem {}", elem_id),
        );
        assert_close(
            efc.v_start,
            ef1.v_start + ef2.v_start,
            1e-4,
            &format!("Superposition v_start elem {}", elem_id),
        );
    }
}

// ================================================================
// 7. Static Condensation: Full DOF vs Condensed Interior
// ================================================================
//
// For a 3-span continuous beam, solving with fine mesh and coarse
// mesh should give identical reactions and support displacements
// (which are zero), and support moments should converge as mesh
// is refined.
//
// Static condensation: interior DOFs can be eliminated without
// changing the boundary response. Here we verify that solving
// a 2-element beam gives identical support reactions to a
// 10-element beam (since Euler-Bernoulli elements are exact
// for polynomial loads up to cubic).
//
// Reference: Przemieniecki Ch. 6; Bathe (2014) Sec. 4.2.5

#[test]
fn validation_static_condensation_coarse_vs_fine() {
    let l = 12.0;
    let q = -6.0;

    // Coarse: 2 elements per span, 2-span continuous beam
    let loads_coarse: Vec<SolverLoad> = (1..=4)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_coarse = make_continuous_beam(&[l, l], 2, E, A, IZ, loads_coarse);
    let res_coarse = linear::solve_2d(&input_coarse).unwrap();

    // Fine: 8 elements per span
    let loads_fine: Vec<SolverLoad> = (1..=16)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_fine = make_continuous_beam(&[l, l], 8, E, A, IZ, loads_fine);
    let res_fine = linear::solve_2d(&input_fine).unwrap();

    // Support reactions should be identical (UDL on E-B beam is exact for any mesh)
    // Node 1 = left support, last node = right support
    let n_coarse_nodes = 5; // 2 spans * 2 elems + 1
    let n_fine_nodes = 17;  // 2 spans * 8 elems + 1
    let mid_coarse_node = 3; // node at middle support (x = L)
    let mid_fine_node = 9;   // node at middle support (x = L)

    let r1_c = res_coarse.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_f = res_fine.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1_c.rz, r1_f.rz, 0.01, "Left support reaction coarse vs fine");

    let rm_c = res_coarse
        .reactions
        .iter()
        .find(|r| r.node_id == mid_coarse_node)
        .unwrap();
    let rm_f = res_fine
        .reactions
        .iter()
        .find(|r| r.node_id == mid_fine_node)
        .unwrap();
    assert_close(rm_c.rz, rm_f.rz, 0.01, "Middle support reaction coarse vs fine");

    let rr_c = res_coarse
        .reactions
        .iter()
        .find(|r| r.node_id == n_coarse_nodes)
        .unwrap();
    let rr_f = res_fine
        .reactions
        .iter()
        .find(|r| r.node_id == n_fine_nodes)
        .unwrap();
    assert_close(rr_c.rz, rr_f.rz, 0.01, "Right support reaction coarse vs fine");

    // Total load = q * 2L = 6 * 24 = 144 kN
    let total_load = q.abs() * 2.0 * l;
    let total_reaction_c: f64 = res_coarse.reactions.iter().map(|r| r.rz).sum();
    let total_reaction_f: f64 = res_fine.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_reaction_c, total_load, 0.01, "Coarse total reaction = total load");
    assert_close(total_reaction_f, total_load, 0.01, "Fine total reaction = total load");

    // For 2-span continuous beam with UDL:
    // By three-moment equation: R_mid = 5qL/4, R_end = 3qL/8
    let r_end_exact = 3.0 * q.abs() * l / 8.0;
    let r_mid_exact = 5.0 * q.abs() * l / 4.0;
    assert_close(r1_c.rz, r_end_exact, 0.01, "Left support = 3qL/8");
    assert_close(rm_c.rz, r_mid_exact, 0.01, "Middle support = 5qL/4");
}

// ================================================================
// 8. Positive Definiteness: All Eigenvalues Positive
// ================================================================
//
// The reduced stiffness matrix K_ff (free DOFs only) for a
// stable, well-supported structure must be positive definite.
// All eigenvalues must be strictly positive.
//
// Reference: Bathe (2014), Theorem 4.1

#[test]
fn validation_positive_definiteness_stable_structure() {
    // Simply supported beam: 4 elements
    let input = make_beam(
        4,
        8.0,
        E,
        A,
        IZ,
        "pinned",
        Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -10.0,
            my: 0.0,
        })],
    );

    let dof_num = DofNumbering::build_2d(&input);
    let assembly = assemble_2d(&input, &dof_num);
    let nf = dof_num.n_free;
    let n_total = dof_num.n_total;

    // Extract K_ff
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&assembly.k, n_total, &free_idx, &free_idx);

    // Compute eigenvalues using Jacobi
    let eigen = jacobi_eigen(&k_ff, nf, 200);

    // All eigenvalues must be positive
    let min_eigen = eigen
        .values
        .iter()
        .cloned()
        .fold(f64::INFINITY, f64::min);
    let max_eigen = eigen
        .values
        .iter()
        .cloned()
        .fold(f64::NEG_INFINITY, f64::max);

    assert!(
        min_eigen > 0.0,
        "Minimum eigenvalue {:.6e} must be positive for a stable structure",
        min_eigen
    );

    // Verify all are positive individually
    for (i, &ev) in eigen.values.iter().enumerate() {
        assert!(
            ev > 0.0,
            "Eigenvalue {} = {:.6e} must be positive",
            i, ev
        );
    }

    // The ratio max/min eigenvalue is the spectral condition number
    let spectral_cond = max_eigen / min_eigen;
    assert!(
        spectral_cond < 1e12,
        "Spectral condition number {:.2e} should be moderate",
        spectral_cond
    );

    // Also check a fixed-fixed beam (overconstrained, still stable)
    let input_ff = make_beam(
        4,
        8.0,
        E,
        A,
        IZ,
        "fixed",
        Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -10.0,
            my: 0.0,
        })],
    );

    let dof_num_ff = DofNumbering::build_2d(&input_ff);
    let assembly_ff = assemble_2d(&input_ff, &dof_num_ff);
    let nf_ff = dof_num_ff.n_free;
    let n_total_ff = dof_num_ff.n_total;

    let free_idx_ff: Vec<usize> = (0..nf_ff).collect();
    let k_ff_ff = extract_submatrix(&assembly_ff.k, n_total_ff, &free_idx_ff, &free_idx_ff);

    let eigen_ff = jacobi_eigen(&k_ff_ff, nf_ff, 200);
    let min_eigen_ff = eigen_ff
        .values
        .iter()
        .cloned()
        .fold(f64::INFINITY, f64::min);

    assert!(
        min_eigen_ff > 0.0,
        "Fixed-fixed beam min eigenvalue {:.6e} must be positive",
        min_eigen_ff
    );
}
