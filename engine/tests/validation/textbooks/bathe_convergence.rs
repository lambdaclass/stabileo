/// Validation: FEM Quality and Convergence (Bathe)
///
/// Tests fundamental FEM convergence properties, patch tests, and
/// numerical quality metrics for beam elements:
///   - h-refinement convergence with monotonic error reduction
///   - Richardson extrapolation for accelerated convergence estimates
///   - Stiffness bound theorem (FEM displacement ≤ exact)
///   - Eigenvalue upper-bound property
///   - Axial and bending patch tests (exact stress recovery)
///   - Rigid body mode verification
///   - Condition number sensitivity (slender vs deep beams)
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2nd Ed., 2014, Ch. 4
///   - Hughes, T.J.R., "The Finite Element Method", Dover, 2000
///   - Zienkiewicz, O.C., Taylor, R.L., "The Finite Element Method", 7th Ed.
///   - Cook, R.D., et al., "Concepts and Applications of FEA", 4th Ed.
use dedaliano_engine::solver::{linear, modal};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::assembly::assemble_2d;
use dedaliano_engine::solver::mass_matrix::assemble_mass_matrix_2d;
use dedaliano_engine::linalg::{extract_submatrix, solve_generalized_eigen};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4
const DENSITY: f64 = 7850.0; // kg/m^3

// ================================================================
// 1. h-Refinement Convergence: Cantilever with Tip Load
// ================================================================
//
// Cantilever beam with point load P at free end.
// Exact tip deflection: delta = PL^3 / (3EI).
// With Euler-Bernoulli cubic Hermite elements and a nodal tip load,
// the single-element solution is already exact. For distributed loads,
// refinement improves accuracy. Here we use UDL on a cantilever to
// show genuine h-refinement convergence.
//
// Cantilever under UDL: delta_tip = qL^4 / (8EI)
// Error should decrease monotonically with mesh refinement.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.3

#[test]
fn validation_bathe_1_h_refinement_cantilever() {
    let length: f64 = 5.0;
    let q: f64 = -5.0; // UDL intensity (downward, kN/m)
    let ei = E * 1000.0 * IZ; // E(MPa) -> E(kN/m^2) * I(m^4) = EI(kN*m^2)
    let delta_exact = q.abs() * length.powi(4) / (8.0 * ei);

    let mesh_sizes: [usize; 5] = [2, 4, 8, 16, 32];
    let mut errors = Vec::new();
    let mut deflections = Vec::new();

    for &n in &mesh_sizes {
        // Build cantilever with UDL
        let mut input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            }));
        }

        let results = linear::solve_2d(&input).unwrap();
        let d_tip = results
            .displacements
            .iter()
            .find(|d| d.node_id == n + 1)
            .unwrap();
        let defl = d_tip.uy.abs();
        deflections.push(defl);
        let err = (defl - delta_exact).abs() / delta_exact;
        errors.push(err);
    }

    // Verify monotonic convergence: error should decrease with refinement
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.01,
                "h-refinement: error should decrease, n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i],
                errors[i],
                mesh_sizes[i - 1],
                errors[i - 1]
            );
        }
    }

    // Finest mesh (32 elements) should be very accurate
    assert!(
        *errors.last().unwrap() < 0.01,
        "Finest mesh (n=32) error = {:.6e}, expected < 1%",
        errors.last().unwrap()
    );
}

// ================================================================
// 2. Richardson Extrapolation
// ================================================================
//
// Given solutions from meshes with n, 2n, and 4n elements, Richardson
// extrapolation provides an improved estimate of the converged solution.
//
// For convergence rate p:
//   f_exact ≈ f(h/2) + [f(h/2) - f(h)] / (2^p - 1)
//
// For cubic Hermite beam elements under UDL, convergence is at least
// O(h^2). The extrapolated value should match the analytical solution
// within 0.1%.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.3.4

#[test]
fn validation_bathe_2_richardson_extrapolation() {
    let length: f64 = 6.0;
    let q: f64 = -4.0;
    let ei = E * 1000.0 * IZ; // E(MPa) -> E(kN/m^2)
    // Simply-supported beam under UDL: delta_mid = 5qL^4 / (384EI)
    let delta_exact = 5.0 * q.abs() * length.powi(4) / (384.0 * ei);

    // Three meshes: n=4, 2n=8, 4n=16
    let mesh_ns = [4_usize, 8, 16];
    let mut midspan_deflections = Vec::new();

    for &n in &mesh_ns {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();
        let mid_node = n / 2 + 1;
        let d_mid = results
            .displacements
            .iter()
            .find(|d| d.node_id == mid_node)
            .unwrap()
            .uy
            .abs();
        midspan_deflections.push(d_mid);
    }

    let f_h = midspan_deflections[0]; // n=4 (coarsest)
    let f_h2 = midspan_deflections[1]; // n=8
    let f_h4 = midspan_deflections[2]; // n=16

    // Estimate convergence rate p from three meshes:
    //   p = log2( (f_h - f_h2) / (f_h2 - f_h4) )
    // If f_h2 and f_h4 are very close (near exact), fall back to p=2
    let numer = f_h - f_h2;
    let denom = f_h2 - f_h4;
    let p = if denom.abs() > 1e-14 && numer.abs() > 1e-14 {
        (numer / denom).abs().ln() / 2.0_f64.ln()
    } else {
        2.0 // default assumed rate
    };

    // Richardson extrapolation using finest two meshes and estimated rate
    let ratio = 2.0_f64.powf(p);
    let f_richardson = f_h4 + (f_h4 - f_h2) / (ratio - 1.0);

    let err_f_h4 = (f_h4 - delta_exact).abs() / delta_exact;
    let err_richardson = (f_richardson - delta_exact).abs() / delta_exact;

    // Richardson extrapolation should be within 0.1% of exact
    // (or at least better than the finest mesh alone)
    assert!(
        err_richardson < 0.001 || err_richardson < err_f_h4,
        "Richardson extrapolation: err={:.6e} (exact={:.6}, richardson={:.6}, f16={:.6})",
        err_richardson,
        delta_exact,
        f_richardson,
        f_h4
    );
}

// ================================================================
// 3. Stiffness Bound Theorem
// ================================================================
//
// For compatible (conforming) displacement-based FEM elements, the
// computed displacement is always less than or equal to the exact
// displacement. This is because FEM over-constrains the system by
// limiting deformation to polynomial shape functions.
//
// The FEM solution approaches the exact solution from below
// (under-estimates displacement) as the mesh is refined.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.3.2

#[test]
fn validation_bathe_3_stiffness_bound() {
    let length: f64 = 6.0;
    let q: f64 = -5.0;
    let ei = E * 1000.0 * IZ; // E(MPa) -> E(kN/m^2)
    // SS beam under UDL: exact midspan deflection
    let delta_exact = 5.0 * q.abs() * length.powi(4) / (384.0 * ei);

    let mesh_sizes: [usize; 4] = [2, 4, 8, 16];
    let mut deflections = Vec::new();

    for &n in &mesh_sizes {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();
        let mid_node = n / 2 + 1;
        let d_mid = results
            .displacements
            .iter()
            .find(|d| d.node_id == mid_node)
            .unwrap()
            .uy
            .abs();
        deflections.push(d_mid);
    }

    // Verify that FEM displacement approaches from below (stiffness bound):
    // each refined mesh gets closer to exact, and FEM values should be ≤ exact
    // (within a small tolerance for numerical effects)
    for i in 0..deflections.len() {
        assert!(
            deflections[i] <= delta_exact * 1.001,
            "Stiffness bound violated: n={}, d_fem={:.8}, d_exact={:.8}",
            mesh_sizes[i],
            deflections[i],
            delta_exact
        );
    }

    // Additionally, deflections should be non-decreasing with refinement
    // (more elements = less stiff = more displacement, approaching exact)
    for i in 1..deflections.len() {
        assert!(
            deflections[i] >= deflections[i - 1] * (1.0 - 1e-8),
            "Stiffness bound: displacement should increase with refinement, n={}→{}: {:.8}→{:.8}",
            mesh_sizes[i - 1],
            mesh_sizes[i],
            deflections[i - 1],
            deflections[i]
        );
    }
}

// ================================================================
// 4. Eigenvalue Upper-Bound Property
// ================================================================
//
// For the generalized eigenvalue problem K*phi = omega^2*M*phi,
// FEM eigenvalues are always upper bounds on the exact eigenvalues.
// As the mesh is refined, the computed natural frequencies decrease
// and approach the exact values from above.
//
// For a cantilever beam, the exact first mode frequency is:
//   omega_1 = (1.8751)^2 * sqrt(EI / (rho*A*L^4))
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 11.3

#[test]
fn validation_bathe_4_eigenvalue_bounds() {
    let length: f64 = 3.0;
    let ei = E * 1000.0 * IZ; // E(MPa) -> E(kN/m^2)
    let rho_a = DENSITY * A / 1000.0; // kg/m^3 -> tonne/m^3 (consistent with kN, m, s)

    // Exact first mode (cantilever): beta_1*L = 1.8751
    let beta1l = 1.87510407_f64;
    let omega_exact = beta1l * beta1l / (length * length) * (ei / rho_a).sqrt();

    let mesh_sizes: [usize; 4] = [2, 4, 8, 16];
    let mut frequencies = Vec::new();

    for &n in &mesh_sizes {
        let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), DENSITY);

        let modal_res = modal::solve_modal_2d(&input, &densities, 1).unwrap();
        frequencies.push(modal_res.modes[0].omega);
    }

    // Eigenvalue upper-bound property: FEM frequency >= exact frequency
    // (Allow small numerical tolerance below exact)
    for i in 0..frequencies.len() {
        assert!(
            frequencies[i] >= omega_exact * 0.999,
            "Eigenvalue bound: n={}, omega_fem={:.4}, omega_exact={:.4}, should be >= exact",
            mesh_sizes[i],
            frequencies[i],
            omega_exact
        );
    }

    // Frequencies should decrease (approach exact from above) with refinement
    for i in 1..frequencies.len() {
        assert!(
            frequencies[i] <= frequencies[i - 1] * 1.001,
            "Eigenvalue convergence: omega should decrease with refinement, n={}→{}: {:.4}→{:.4}",
            mesh_sizes[i - 1],
            mesh_sizes[i],
            frequencies[i - 1],
            frequencies[i]
        );
    }

    // Finest mesh should be within 1% of exact
    let err_finest = (frequencies.last().unwrap() - omega_exact).abs() / omega_exact;
    assert!(
        err_finest < 0.01,
        "Finest mesh eigenvalue error = {:.4}%, expected < 1%",
        err_finest * 100.0
    );
}

// ================================================================
// 5. Patch Test: Axial (Constant Stress)
// ================================================================
//
// The patch test verifies completeness of the finite element
// approximation. Under a constant stress state, the FEM must
// recover exact stresses regardless of mesh irregularity.
//
// Test: 3 axial elements of different lengths under uniform
// axial load. All elements should have the same constant axial
// force N = P (applied at the free end).
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.4.1

#[test]
fn validation_bathe_5_patch_test_axial() {
    let p_axial: f64 = 50.0; // kN applied at free end

    // Irregular mesh: 3 elements of different lengths (total L = 5.0)
    let lengths = [1.2, 2.3, 1.5]; // irregular spacing
    let total_l: f64 = lengths.iter().sum();
    let n_nodes = 4;

    // Build nodes at irregular positions
    let mut x = 0.0;
    let mut nodes = vec![(1, 0.0, 0.0)];
    for (i, &l) in lengths.iter().enumerate() {
        x += l;
        nodes.push((i + 2, x, 0.0));
    }

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes,
        fx: p_axial,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // All elements should have constant axial force = P
    for ef in &results.element_forces {
        assert_close(
            ef.n_start.abs(),
            p_axial,
            0.001,
            &format!("Axial patch test elem {}: n_start", ef.element_id),
        );
        assert_close(
            ef.n_end.abs(),
            p_axial,
            0.001,
            &format!("Axial patch test elem {}: n_end", ef.element_id),
        );
    }

    // Verify tip displacement: delta = PL / (EA)
    let delta_exact = p_axial * total_l / (E * 1000.0 * A); // E(MPa) -> E(kN/m^2)
    let d_tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n_nodes)
        .unwrap();
    assert_close(
        d_tip.ux.abs(),
        delta_exact,
        0.001,
        "Axial patch test: tip displacement",
    );
}

// ================================================================
// 6. Patch Test: Bending (Pure Moment)
// ================================================================
//
// Under pure bending (end moments only, no transverse loads), the
// curvature and moment should be constant throughout the beam.
// An irregular mesh of 3 unequal elements must recover exact
// constant moment everywhere.
//
// Test: simply-supported beam with equal and opposite end moments.
// M = M_applied everywhere, V = 0 everywhere.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.4.1

#[test]
fn validation_bathe_6_patch_test_bending() {
    let m_applied: f64 = 10.0; // kN-m

    // Irregular mesh: 3 elements of different lengths
    let lengths = [1.5, 2.0, 1.5];
    let _total_l: f64 = lengths.iter().sum();

    let mut x = 0.0;
    let mut nodes = vec![(1, 0.0, 0.0)];
    for (i, &l) in lengths.iter().enumerate() {
        x += l;
        nodes.push((i + 2, x, 0.0));
    }

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];

    // Pinned at start, roller at end (SS beam)
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];

    // Apply equal and opposite end moments to create pure bending
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: 0.0,
            fy: 0.0,
            mz: m_applied,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4,
            fx: 0.0,
            fy: 0.0,
            mz: -m_applied,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Under pure bending: moment should be constant = M_applied,
    // shear force should be zero throughout
    for ef in &results.element_forces {
        assert_close(
            ef.m_start.abs(),
            m_applied,
            0.01,
            &format!("Bending patch test elem {}: m_start", ef.element_id),
        );
        assert_close(
            ef.m_end.abs(),
            m_applied,
            0.01,
            &format!("Bending patch test elem {}: m_end", ef.element_id),
        );
        // Shear should be zero (pure bending, no transverse load)
        assert!(
            ef.v_start.abs() < 1e-6,
            "Bending patch test elem {}: v_start={:.6e}, expected ~0",
            ef.element_id,
            ef.v_start
        );
        assert!(
            ef.v_end.abs() < 1e-6,
            "Bending patch test elem {}: v_end={:.6e}, expected ~0",
            ef.element_id,
            ef.v_end
        );
    }
}

// ================================================================
// 7. Rigid Body Modes: Free-Free Beam
// ================================================================
//
// A free-free beam in 2D (no supports) has exactly 3 rigid body
// modes corresponding to translation in X, translation in Y, and
// rotation about Z. These modes have zero strain energy and thus
// zero natural frequency (omega = 0).
//
// The stiffness matrix K should have a null space of dimension 3.
// This test assembles K and M directly and solves the generalized
// eigenvalue problem to verify that exactly 3 eigenvalues are
// near zero.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.2.1

#[test]
fn validation_bathe_7_rigid_body_modes() {
    let length: f64 = 4.0;
    let n = 4; // 4 elements, 5 nodes

    // Build a beam with NO supports (free-free)
    let n_nodes = n + 1;
    let elem_len = length / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    // No supports!
    let sups: Vec<(usize, usize, &str)> = vec![];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        vec![],
    );

    // Assemble K and M matrices directly
    let dof_num = DofNumbering::build_2d(&input);
    let nf = dof_num.n_free;

    // With no supports, all DOFs are free: nf == n_total
    assert_eq!(nf, dof_num.n_total, "Free-free beam: all DOFs should be free");
    assert_eq!(nf, n_nodes * 3, "Free-free beam: 3 DOFs per node");

    let asm = assemble_2d(&input, &dof_num);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let m_full = assemble_mass_matrix_2d(&input, &dof_num, &densities);

    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, dof_num.n_total, &free_idx, &free_idx);
    let m_ff = extract_submatrix(&m_full, dof_num.n_total, &free_idx, &free_idx);

    // Solve generalized eigenvalue problem
    let result = solve_generalized_eigen(&k_ff, &m_ff, nf, 200).unwrap();

    // Count near-zero eigenvalues (rigid body modes)
    let zero_threshold = 1e-4; // eigenvalues below this are considered "zero"
    let n_zero = result
        .values
        .iter()
        .filter(|&&v| v.abs() < zero_threshold)
        .count();

    assert_eq!(
        n_zero, 3,
        "Free-free 2D beam should have exactly 3 rigid body modes (ux, uy, rz), found {}. Eigenvalues: {:?}",
        n_zero,
        &result.values[..6.min(result.values.len())]
    );

    // First 3 eigenvalues should be near zero
    for i in 0..3 {
        assert!(
            result.values[i].abs() < zero_threshold,
            "Rigid body mode {}: eigenvalue={:.6e}, expected ~0",
            i,
            result.values[i]
        );
    }

    // 4th eigenvalue (first elastic mode) should be clearly positive
    assert!(
        result.values[3] > 1.0,
        "First elastic mode eigenvalue={:.6e}, should be >> 0",
        result.values[3]
    );
}

// ================================================================
// 8. Condition Number Effect: Deep vs Slender Beams
// ================================================================
//
// Very short/deep beams (L/h ~ 1) have poor conditioning due to
// the large ratio between axial and bending stiffness. Very
// slender beams (L/h ~ 100) are well-conditioned for bending.
// Both should give correct results, but mesh refinement is more
// critical for short deep beams where shear effects and
// conditioning issues dominate.
//
// Test: compare a deep beam (L = 0.5m, I such that L/h ~ 2)
// vs a slender beam (L = 10m, same I => L/h ~ 100) under the
// same normalized loading (P*L^3 / EI = constant).
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 5.4

#[test]
fn validation_bathe_8_condition_number_effect() {
    let iz = 1e-4; // m^4 (constant cross-section)

    // For a rectangular section h x b: I = bh^3/12
    // If h = 0.1m (depth), I = 1e-4 => b = 0.12m
    // "Slender" beam: L = 10.0 => L/h = 100
    // "Deep" beam: L = 0.2 => L/h = 2

    let l_slender: f64 = 10.0;
    let l_deep: f64 = 0.2;
    let p_base: f64 = 10.0;

    let ei = E * 1000.0 * iz; // E(MPa) -> E(kN/m^2)

    // Normalized so that P*L^3/(3*EI) produces a comparable deflection
    // For slender beam:
    let p_slender = p_base;
    let delta_exact_slender = p_slender * l_slender.powi(3) / (3.0 * ei);

    // For deep beam: scale load so deflection is in a reasonable range
    let p_deep = p_base * (l_slender / l_deep).powi(3);
    let delta_exact_deep = p_deep * l_deep.powi(3) / (3.0 * ei);

    // Both should give the same normalized deflection
    assert_close(
        delta_exact_slender,
        delta_exact_deep,
        1e-10,
        "Normalized deflections should match",
    );

    // Test slender beam with increasing mesh refinement
    let mesh_sizes: [usize; 3] = [2, 4, 8];
    let mut errors_slender = Vec::new();
    let mut errors_deep = Vec::new();

    for &n in &mesh_sizes {
        // Slender beam
        let input_slender = make_beam(
            n,
            l_slender,
            E,
            A,
            iz,
            "fixed",
            None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1,
                fx: 0.0,
                fy: -p_slender,
                mz: 0.0,
            })],
        );
        let res_slender = linear::solve_2d(&input_slender).unwrap();
        let d_slender = res_slender
            .displacements
            .iter()
            .find(|d| d.node_id == n + 1)
            .unwrap()
            .uy
            .abs();
        let err_s = (d_slender - delta_exact_slender).abs() / delta_exact_slender;
        errors_slender.push(err_s);

        // Deep beam
        let input_deep = make_beam(
            n,
            l_deep,
            E,
            A,
            iz,
            "fixed",
            None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1,
                fx: 0.0,
                fy: -p_deep,
                mz: 0.0,
            })],
        );
        let res_deep = linear::solve_2d(&input_deep).unwrap();
        let d_deep = res_deep
            .displacements
            .iter()
            .find(|d| d.node_id == n + 1)
            .unwrap()
            .uy
            .abs();
        let err_d = (d_deep - delta_exact_deep).abs() / delta_exact_deep;
        errors_deep.push(err_d);
    }

    // Both beams should converge. For Hermite elements with nodal loads,
    // a single element gives exact results. Both should be very accurate.
    for i in 0..mesh_sizes.len() {
        assert!(
            errors_slender[i] < 0.01,
            "Slender beam n={}: error={:.6e}, expected < 1%",
            mesh_sizes[i],
            errors_slender[i]
        );
        assert!(
            errors_deep[i] < 0.01,
            "Deep beam n={}: error={:.6e}, expected < 1%",
            mesh_sizes[i],
            errors_deep[i]
        );
    }

    // Verify that refinement helps (error non-increasing)
    for i in 1..mesh_sizes.len() {
        assert!(
            errors_slender[i] <= errors_slender[i - 1] + 1e-10,
            "Slender beam: refinement should not increase error, n={}→{}: {:.6e}→{:.6e}",
            mesh_sizes[i - 1],
            mesh_sizes[i],
            errors_slender[i - 1],
            errors_slender[i]
        );
        assert!(
            errors_deep[i] <= errors_deep[i - 1] + 1e-10,
            "Deep beam: refinement should not increase error, n={}→{}: {:.6e}→{:.6e}",
            mesh_sizes[i - 1],
            mesh_sizes[i],
            errors_deep[i - 1],
            errors_deep[i]
        );
    }
}
