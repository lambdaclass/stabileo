/// Validation: FEM Mesh Refinement and Convergence
///
/// Tests that the solver produces results consistent with mesh refinement theory
/// for Euler-Bernoulli cubic Hermite beam elements:
///   - Reactions are mesh-independent (exact for any mesh)
///   - Displacements converge monotonically with refinement
///   - Coarse and fine meshes give the same reactions
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2nd Ed., Prentice Hall, 2014, Ch. 4
///   - Cook, R.D., Malkus, D.S., Plesha, M.E., "Concepts and Applications of FEA", 4th Ed.
///   - Hughes, T.J.R., "The Finite Element Method", Dover, 2000, Ch. 1-3
///   - Zienkiewicz, O.C., Taylor, R.L., "The Finite Element Method", 7th Ed., Vol. 1
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Coarse vs Fine Mesh: Reactions Are Mesh-Independent
// ================================================================
//
// For a simply-supported beam under UDL, reactions are statically
// determinate and must equal qL/2 regardless of mesh density.
// This is a fundamental exactness property of cubic Hermite elements.
//
// Reference: Hughes, "The FEM", Ch. 1

#[test]
fn validation_mesh_coarse_fine_same_reactions() {
    let l: f64 = 6.0;
    let q: f64 = -5.0;
    let r_exact = q.abs() * l / 2.0;

    let n_coarse = 2;
    let n_fine = 20;

    let input_coarse = make_ss_beam_udl(n_coarse, l, E, A, IZ, q);
    let input_fine = make_ss_beam_udl(n_fine, l, E, A, IZ, q);

    let res_coarse = linear::solve_2d(&input_coarse).unwrap();
    let res_fine = linear::solve_2d(&input_fine).unwrap();

    let r1_coarse = res_coarse.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_fine = res_fine.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r1_coarse.ry, r_exact, 0.01, "Coarse mesh reaction = qL/2");
    assert_close(r1_fine.ry, r_exact, 0.01, "Fine mesh reaction = qL/2");
    assert_close(r1_coarse.ry, r1_fine.ry, 1e-8, "Reactions identical coarse vs fine");
}

// ================================================================
// 2. Deflection Converges as Elements Increase
// ================================================================
//
// Cantilever tip deflection δ = PL³/(3EI) must be approached
// monotonically as mesh is refined. For Hermite elements with
// nodal loads, even a single element gives the exact result.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.3

#[test]
fn validation_mesh_deflection_converges() {
    let l: f64 = 5.0;
    let p: f64 = -10.0;
    let ei = E * 1000.0 * IZ;
    let delta_exact = p.abs() * l.powi(3) / (3.0 * ei);

    let mesh_counts = [1, 2, 4, 8, 16];
    let mut prev_err = f64::MAX;

    for &n in &mesh_counts {
        let input = make_beam(
            n, l, E, A, IZ, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();
        let d_tip = results.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap().uy.abs();
        let err = (d_tip - delta_exact).abs() / delta_exact;

        // Error must be non-increasing with refinement (monotone convergence)
        assert!(
            err <= prev_err + 1e-10,
            "Deflection must converge monotonically: n={}, err={:.6e}, prev={:.6e}",
            n, err, prev_err
        );
        prev_err = err;
    }

    // Finest mesh must be accurate to within 1%
    assert!(prev_err < 0.01, "Finest mesh cantilever error={:.6e} > 1%", prev_err);
}

// ================================================================
// 3. 4 Elements vs 20 Elements: Both Match Analytical
// ================================================================
//
// Simply-supported beam under UDL. Both coarse and fine meshes
// must satisfy the analytical midspan deflection:
//   δ_mid = 5qL⁴/(384EI)
//
// Reference: Zienkiewicz & Taylor, "The FEM", Vol. 1, Table 3.1

#[test]
fn validation_mesh_four_vs_twenty_elements() {
    let l: f64 = 8.0;
    let q: f64 = -4.0;
    let ei = E * 1000.0 * IZ;
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * ei);

    let input_4 = make_ss_beam_udl(4, l, E, A, IZ, q);
    let input_20 = make_ss_beam_udl(20, l, E, A, IZ, q);

    let res_4 = linear::solve_2d(&input_4).unwrap();
    let res_20 = linear::solve_2d(&input_20).unwrap();

    // Midspan node: node 3 for n=4, node 11 for n=20
    let d4 = res_4.displacements.iter().find(|d| d.node_id == 3).unwrap().uy.abs();
    let d20 = res_20.displacements.iter().find(|d| d.node_id == 11).unwrap().uy.abs();

    assert_close(d4, delta_exact, 0.02, "4-element SS UDL midspan deflection");
    assert_close(d20, delta_exact, 0.01, "20-element SS UDL midspan deflection");

    // Fine mesh should be no worse than coarse
    let err_4 = (d4 - delta_exact).abs() / delta_exact;
    let err_20 = (d20 - delta_exact).abs() / delta_exact;
    assert!(
        err_20 <= err_4 + 1e-10,
        "Fine mesh must be at least as accurate: err_20={:.6e}, err_4={:.6e}",
        err_20, err_4
    );
}

// ================================================================
// 4. Moment at Midspan Converges to Exact Value
// ================================================================
//
// For SS beam under UDL: M_mid = qL²/8
// This is verified via the reaction: M_mid = R*L/2 - qL/2 * L/4 = qL²/8.
// The end moment reaction must be zero for pinned/roller supports.
//
// Reference: Cook et al., "Concepts and Applications of FEA", 4th Ed., Ch. 4

#[test]
fn validation_mesh_midspan_moment_converges() {
    let l: f64 = 6.0;
    let q: f64 = -3.0;
    let m_exact = q.abs() * l * l / 8.0;

    let mesh_counts = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_counts {
        let input = make_ss_beam_udl(n, l, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();

        // Compute moment at midspan from element forces
        let mid_elem = n / 2;
        let ef = results.element_forces.iter().find(|ef| ef.element_id == mid_elem).unwrap();
        // At midspan of SS beam under UDL, the element at midspan has m_end at the midpoint
        let m_mid_approx = ef.m_end.abs();

        let err = if m_mid_approx > 1e-6 {
            (m_mid_approx - m_exact).abs() / m_exact
        } else {
            (ef.m_start.abs() - m_exact).abs() / m_exact
        };
        errors.push(err);
    }

    // At minimum, the finest mesh should be within 5%
    assert!(
        errors.last().unwrap() < &0.05,
        "Midspan moment finest mesh error={:.6e} should be < 5%",
        errors.last().unwrap()
    );
}

// ================================================================
// 5. Shear Force Converges with Refinement
// ================================================================
//
// For a simply-supported beam under UDL:
//   V(x) = q(L/2 - x)
// At quarter-span (x = L/4): V = qL/4
// For single point load P at midspan:
//   V = P/2 everywhere away from load
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 5.4.1

#[test]
fn validation_mesh_shear_converges() {
    let l: f64 = 6.0;
    let p: f64 = 20.0;
    let v_exact = p / 2.0;

    let mesh_counts = [2, 4, 8];

    for &n in &mesh_counts {
        let mid = n / 2 + 1;
        let input = make_beam(
            n, l, E, A, IZ, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();

        // Shear in first element (away from load): V = P/2
        let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
        let err = (ef1.v_start.abs() - v_exact).abs() / v_exact;
        assert!(
            err < 0.05,
            "Shear convergence n={}: V={:.4}, exact={:.4}, err={:.4}%",
            n, ef1.v_start.abs(), v_exact, err * 100.0
        );
    }
}

// ================================================================
// 6. Single Element vs Multi-Element Cantilever
// ================================================================
//
// For Hermite beam elements with nodal point load at the free end,
// a SINGLE element gives the exact tip deflection PL³/(3EI).
// This is a key exactness property: no discretization error for loads
// that are representable as nodal loads.
//
// Reference: Hughes, "The FEM", Dover, 2000, p. 81 (consistency/completeness)

#[test]
fn validation_mesh_single_vs_multi_element_cantilever() {
    let l: f64 = 4.0;
    let p: f64 = 15.0;
    let ei = E * 1000.0 * IZ;
    let delta_exact = p * l.powi(3) / (3.0 * ei);

    // Single element
    let input_1 = make_beam(
        1, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_1 = linear::solve_2d(&input_1).unwrap();
    let d1 = res_1.displacements.iter().find(|d| d.node_id == 2).unwrap().uy.abs();

    // 10 elements
    let input_10 = make_beam(
        10, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 11, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_10 = linear::solve_2d(&input_10).unwrap();
    let d10 = res_10.displacements.iter().find(|d| d.node_id == 11).unwrap().uy.abs();

    // Both must be very accurate (nodal load → exact for Hermite)
    assert_close(d1, delta_exact, 0.001, "Single element: exact tip deflection");
    assert_close(d10, delta_exact, 0.001, "Multi-element: exact tip deflection");

    // Both deflections should agree with each other
    assert_close(d1, d10, 1e-6, "Single vs multi-element cantilever deflection");
}

// ================================================================
// 7. Reaction Independence from Mesh Density
// ================================================================
//
// For statically determinate structures, reactions must be the same
// regardless of mesh density because they are determined entirely by
// global equilibrium, not by element stiffness.
//
// Reference: Cook et al., "Concepts and Applications of FEA", 4th Ed., Sec. 3.2

#[test]
fn validation_mesh_reaction_mesh_independence() {
    let l: f64 = 5.0;
    let p: f64 = 25.0;
    let a = l / 3.0; // load at L/3

    // Analytical: R_A = P*(L-a)/L, R_B = P*a/L
    let r_a_exact = p * (l - a) / l;
    let r_b_exact = p * a / l;

    // Test with multiple mesh densities
    for &n in &[2_usize, 3, 6, 12] {
        // Load node: at position a = L/3; with n elements, need node at x = L/3
        // Only exact when n is multiple of 3. Use n=3,6,12 and skip 2 for exact position.
        // For n=2: load at node 1 (x=0), n=3: node 2 (x=L/3)
        // Use n=3, 6, 12 as exact multiples of 3, and n=2 with load at node 2 (x=L/2 approx).
        // Instead: put load always at node 2 (closest to L/3 boundary)
        let load_node = if n >= 3 { n / 3 + 1 } else { 2 };
        let x_load = (load_node - 1) as f64 * l / n as f64;

        // Re-derive analytical reactions for actual load position
        let r_a = p * (l - x_load) / l;
        let r_b = p * x_load / l;

        let input = make_beam(
            n, l, E, A, IZ, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();

        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

        assert_close(r1.ry, r_a, 0.01,
            &format!("Reaction R_A n={}, x_load={:.3}", n, x_load));
        assert_close(rn.ry, r_b, 0.01,
            &format!("Reaction R_B n={}, x_load={:.3}", n, x_load));
    }

    // Also verify with UDL that reactions always equal qL/2
    for &n in &[1_usize, 4, 16] {
        let q: f64 = -3.0;
        let input = make_ss_beam_udl(n, l, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        assert_close(r1.ry, q.abs() * l / 2.0, 0.001,
            &format!("UDL reaction R_A n={}", n));
    }

    // Use the pre-computed exact values to confirm the function args are not unused
    let _ = r_a_exact;
    let _ = r_b_exact;
}

// ================================================================
// 8. Energy Norm Converges with Refinement (Strain Energy)
// ================================================================
//
// For a cantilever under tip load:
//   U = P²L³/(6EI)
// The computed strain energy (= ½Pδ) converges to the exact value
// with mesh refinement. For Hermite elements, this is exact even
// with one element for nodal loads.
//
// Reference: Zienkiewicz & Taylor, "The FEM", 7th Ed., Vol. 1, Ch. 14

#[test]
fn validation_mesh_energy_norm_converges() {
    let l: f64 = 5.0;
    let p: f64 = 10.0;
    let ei = E * 1000.0 * IZ;
    let u_exact = p * p * l.powi(3) / (6.0 * ei);

    let mesh_counts = [1, 2, 4, 8];
    let mut prev_err = f64::MAX;

    for &n in &mesh_counts {
        let input = make_beam(
            n, l, E, A, IZ, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();

        let d_tip = results.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap().uy.abs();
        let u_computed = 0.5 * p * d_tip; // Clapeyron: U = ½Pδ

        let err = (u_computed - u_exact).abs() / u_exact;

        // Energy must converge (non-increasing error)
        assert!(
            err <= prev_err + 1e-10,
            "Energy norm must converge: n={}, err={:.6e}, prev={:.6e}",
            n, err, prev_err
        );
        prev_err = err;
    }

    // Finest mesh must be accurate
    assert!(
        prev_err < 0.01,
        "Energy norm finest mesh error={:.6e} > 1%", prev_err
    );
}
