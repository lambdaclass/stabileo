/// Validation: Finite Element Convergence (Extended) — Solver-Based Tests
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2nd ed. (2014)
///   - Hughes, T.J.R., "The Finite Element Method", Dover (2000)
///   - Zienkiewicz, Taylor & Zhu, "The Finite Element Method", Vol. 1, 7th ed. (2013)
///   - Timoshenko & Gere, "Theory of Elastic Stability", McGraw-Hill (1961)
///   - Ghali & Neville, "Structural Analysis", 7th ed. (2017)
///
/// These tests run the actual 2D solver with varying mesh densities and compare
/// against closed-form analytical solutions to verify convergence behavior.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally)
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4

// ================================================================
// 1. Mesh Convergence for SS Beam with UDL — Coarse vs Fine
// ================================================================
//
// Simply supported beam under uniform distributed load q.
// Exact midspan deflection: delta = 5*q*L^4 / (384*E*I)
//
// Compare coarse (2-element) vs fine (16-element) mesh midspan
// deflection against the analytical result.

#[test]
fn validation_ss_beam_udl_coarse_vs_fine_midspan() {
    let length: f64 = 8.0;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;
    let delta_exact: f64 = 5.0 * q.abs() * length.powi(4) / (384.0 * ei);

    // Coarse mesh: 2 elements, midspan node = 2
    let input_coarse = make_ss_beam_udl(2, length, E, A, IZ, q);
    let res_coarse = linear::solve_2d(&input_coarse).unwrap();
    let d_coarse: f64 = res_coarse
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .uz
        .abs();

    // Fine mesh: 16 elements, midspan node = 9
    let input_fine = make_ss_beam_udl(16, length, E, A, IZ, q);
    let res_fine = linear::solve_2d(&input_fine).unwrap();
    let d_fine: f64 = res_fine
        .displacements
        .iter()
        .find(|d| d.node_id == 9)
        .unwrap()
        .uz
        .abs();

    let err_coarse: f64 = (d_coarse - delta_exact).abs() / delta_exact;
    let err_fine: f64 = (d_fine - delta_exact).abs() / delta_exact;

    // Fine mesh should be at least as accurate as coarse
    assert!(
        err_fine <= err_coarse + 1e-6,
        "Fine mesh error ({:.6e}) should be <= coarse mesh error ({:.6e})",
        err_fine,
        err_coarse
    );

    // Fine mesh should be within 1% of exact
    assert!(
        err_fine < 0.01,
        "Fine mesh midspan deflection error {:.4}% should be < 1%",
        err_fine * 100.0
    );

    // Both should be in the right ballpark (within 5%)
    assert_close(d_coarse, delta_exact, 0.05, "coarse midspan deflection");
    assert_close(d_fine, delta_exact, 0.01, "fine midspan deflection");
}

// ================================================================
// 2. Mesh Convergence for Cantilever Point Load — Tip Deflection
// ================================================================
//
// Cantilever beam with point load P at free end.
// Exact tip deflection: delta = P*L^3 / (3*E*I)
//
// With increasing mesh density (1, 2, 4, 8 elements), the tip
// deflection should converge to the exact value.

#[test]
fn validation_cantilever_point_load_mesh_convergence() {
    let length: f64 = 5.0;
    let p: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;
    let delta_exact: f64 = p.abs() * length.powi(3) / (3.0 * ei);

    let mesh_sizes = [1, 2, 4, 8];
    let mut errors: Vec<f64> = Vec::new();
    let mut deflections: Vec<f64> = Vec::new();

    for &n in &mesh_sizes {
        let tip_node = n + 1;
        let input = make_beam(
            n,
            length,
            E,
            A,
            IZ,
            "fixed",
            None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip_node,
                fx: 0.0,
                fz: p,
                my: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();
        let d_tip: f64 = results
            .displacements
            .iter()
            .find(|d| d.node_id == tip_node)
            .unwrap()
            .uz
            .abs();
        let err: f64 = (d_tip - delta_exact).abs() / delta_exact;
        deflections.push(d_tip);
        errors.push(err);
    }

    // For cubic Hermite elements with nodal point load, even a single
    // element should give the exact solution. Errors should be tiny.
    for (i, &n) in mesh_sizes.iter().enumerate() {
        assert!(
            errors[i] < 0.01,
            "Cantilever n={}: error={:.6e}, should be < 1%",
            n,
            errors[i]
        );
    }

    // Finest mesh should be very close to exact
    assert_close(
        *deflections.last().unwrap(),
        delta_exact,
        0.001,
        "finest mesh tip deflection",
    );
}

// ================================================================
// 3. Fixed-Fixed Beam UDL Convergence
// ================================================================
//
// Both ends fixed, uniform distributed load q.
// Exact midspan deflection: delta = q*L^4 / (384*E*I)
//
// Test with 2, 4, 8, 16 elements and verify convergence.

#[test]
fn validation_fixed_fixed_beam_udl_convergence() {
    let length: f64 = 6.0;
    let q: f64 = -8.0;
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;
    let delta_exact: f64 = q.abs() * length.powi(4) / (384.0 * ei);

    let mesh_sizes: [usize; 4] = [2, 4, 8, 16];
    let mut errors: Vec<f64> = Vec::new();
    let mut deflections: Vec<f64> = Vec::new();

    for &n in &mesh_sizes {
        // Build fixed-fixed beam with UDL
        let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("fixed"), vec![]);
        for i in 1..=n {
            input
                .loads
                .push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i,
                    q_i: q,
                    q_j: q,
                    a: None,
                    b: None,
                }));
        }

        let results = linear::solve_2d(&input).unwrap();
        let mid_node = n / 2 + 1;
        let d_mid: f64 = results
            .displacements
            .iter()
            .find(|d| d.node_id == mid_node)
            .unwrap()
            .uz
            .abs();

        let err: f64 = (d_mid - delta_exact).abs() / delta_exact;
        deflections.push(d_mid);
        errors.push(err);
    }

    // Errors should decrease (or stay small) with refinement
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "Fixed-fixed convergence: err[n={}]={:.6e} should be <= err[n={}]={:.6e}",
                mesh_sizes[i],
                errors[i],
                mesh_sizes[i - 1],
                errors[i - 1]
            );
        }
    }

    // Finest mesh should match exact within 2%
    assert!(
        errors.last().unwrap() < &0.02,
        "Fixed-fixed finest mesh error {:.4}% should be < 2%",
        errors.last().unwrap() * 100.0
    );

    // Check the actual deflection magnitude is reasonable
    assert!(
        delta_exact > 0.0,
        "delta_exact should be positive: {:.6e}",
        delta_exact
    );
    assert_close(
        *deflections.last().unwrap(),
        delta_exact,
        0.02,
        "fixed-fixed midspan deflection (finest)",
    );
}

// ================================================================
// 4. Convergence of Reaction Forces with Mesh Refinement
// ================================================================
//
// SS beam with UDL: each support reaction R = qL/2.
// Verify that reactions converge to the exact value with refinement.

#[test]
fn validation_reaction_force_convergence() {
    let length: f64 = 10.0;
    let q: f64 = -6.0;
    let r_exact: f64 = q.abs() * length / 2.0;

    let mesh_sizes: [usize; 4] = [2, 4, 8, 16];
    let mut errors_left: Vec<f64> = Vec::new();
    let mut errors_right: Vec<f64> = Vec::new();

    for &n in &mesh_sizes {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();

        let r_left: f64 = results
            .reactions
            .iter()
            .find(|r| r.node_id == 1)
            .unwrap()
            .rz;
        let r_right: f64 = results
            .reactions
            .iter()
            .find(|r| r.node_id == n + 1)
            .unwrap()
            .rz;

        let err_l: f64 = (r_left - r_exact).abs() / r_exact;
        let err_r: f64 = (r_right - r_exact).abs() / r_exact;
        errors_left.push(err_l);
        errors_right.push(err_r);
    }

    // Finest mesh reactions should be very close to exact
    assert!(
        errors_left.last().unwrap() < &0.01,
        "Left reaction error {:.4}% should be < 1%",
        errors_left.last().unwrap() * 100.0
    );
    assert!(
        errors_right.last().unwrap() < &0.01,
        "Right reaction error {:.4}% should be < 1%",
        errors_right.last().unwrap() * 100.0
    );

    // Symmetry: left and right reactions should be equal at every mesh level
    for (_i, &n) in mesh_sizes.iter().enumerate() {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();

        let r_left: f64 = results
            .reactions
            .iter()
            .find(|r| r.node_id == 1)
            .unwrap()
            .rz;
        let r_right: f64 = results
            .reactions
            .iter()
            .find(|r| r.node_id == n + 1)
            .unwrap()
            .rz;

        assert_close(
            r_left,
            r_right,
            0.01,
            &format!("symmetry of reactions (n={})", n),
        );
    }

    // Check that errors are monotonically non-increasing (or staying small)
    for i in 1..errors_left.len() {
        if errors_left[i - 1] > 1e-10 {
            assert!(
                errors_left[i] <= errors_left[i - 1] * 1.1 + 1e-10,
                "Left reaction convergence: n={} err={:.6e} > n={} err={:.6e}",
                mesh_sizes[i],
                errors_left[i],
                mesh_sizes[i - 1],
                errors_left[i - 1]
            );
        }
    }
}

// ================================================================
// 5. Convergence of Bending Moment at Midspan
// ================================================================
//
// SS beam with UDL: midspan moment M = qL^2/8.
// Extract from element forces and verify convergence.

#[test]
fn validation_bending_moment_midspan_convergence() {
    let length: f64 = 8.0;
    let q: f64 = -12.0;
    let m_exact: f64 = q.abs() * length * length / 8.0;

    let mesh_sizes: [usize; 4] = [2, 4, 8, 16];
    let mut errors: Vec<f64> = Vec::new();

    for &n in &mesh_sizes {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();

        // The midspan is at the junction of elements n/2 and n/2+1.
        // m_end of element n/2 should give the midspan moment.
        let mid_elem = n / 2;
        let ef = results
            .element_forces
            .iter()
            .find(|e| e.element_id == mid_elem)
            .unwrap();

        // m_end is the moment at the end of the element (midspan node).
        // The sign convention: sagging moment is positive or negative
        // depending on convention. We take absolute value for comparison.
        let m_mid: f64 = ef.m_end.abs();

        let err: f64 = (m_mid - m_exact).abs() / m_exact;
        errors.push(err);
    }

    // Errors should generally decrease with refinement
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.2 + 1e-6,
                "Moment convergence: err[n={}]={:.6e} should decrease from err[n={}]={:.6e}",
                mesh_sizes[i],
                errors[i],
                mesh_sizes[i - 1],
                errors[i - 1]
            );
        }
    }

    // Finest mesh moment should be within 2% of exact
    assert!(
        errors.last().unwrap() < &0.02,
        "Midspan moment error {:.4}% should be < 2%",
        errors.last().unwrap() * 100.0
    );
}

// ================================================================
// 6. Element Force Smoothness Check
// ================================================================
//
// For a SS beam with UDL and fine mesh, the bending moment at the
// shared node between two adjacent elements should be the same
// (m_end of element i == m_start of element i+1 in magnitude).
// This checks inter-element force compatibility.

#[test]
fn validation_element_force_smoothness() {
    let length: f64 = 6.0;
    let q: f64 = -10.0;

    // Use a fine mesh (16 elements) so we have many interior junctions
    let n: usize = 16;
    let input = make_ss_beam_udl(n, length, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    // Check moment continuity at each interior node.
    // m_end of element i should match m_start of element i+1.
    let mut max_moment_jump: f64 = 0.0;
    let mut max_shear_jump: f64 = 0.0;

    for i in 1..n {
        let ef_left = results
            .element_forces
            .iter()
            .find(|e| e.element_id == i)
            .unwrap();
        let ef_right = results
            .element_forces
            .iter()
            .find(|e| e.element_id == i + 1)
            .unwrap();

        // Moment at the shared node: m_end of left element vs m_start of right.
        // The solver convention stores internal forces with the same sign at
        // shared nodes, so continuity means m_end(left) == m_start(right).
        let moment_jump: f64 = (ef_left.m_end - ef_right.m_start).abs();
        let shear_jump: f64 = (ef_left.v_end - ef_right.v_start).abs();

        if moment_jump > max_moment_jump {
            max_moment_jump = moment_jump;
        }
        if shear_jump > max_shear_jump {
            max_shear_jump = shear_jump;
        }
    }

    // Moment should be continuous (jump should be near zero)
    // The total midspan moment is qL^2/8 = 10*36/8 = 45 kN-m
    let m_ref: f64 = q.abs() * length * length / 8.0;
    let moment_jump_ratio: f64 = max_moment_jump / m_ref;

    assert!(
        moment_jump_ratio < 0.01,
        "Moment discontinuity ratio {:.6e} should be < 1% of midspan moment",
        moment_jump_ratio
    );

    // Shear should also be reasonably smooth (small jumps due to distributed load)
    // For UDL, the shear difference across an element is q*L_elem
    let l_elem: f64 = length / n as f64;
    let shear_step: f64 = q.abs() * l_elem;
    // The jump at a node should be close to zero (element forces already include
    // the distributed load effect), so check it is small relative to total shear
    let v_max: f64 = q.abs() * length / 2.0;
    let shear_jump_ratio: f64 = max_shear_jump / v_max;

    assert!(
        shear_jump_ratio < 0.05,
        "Shear discontinuity ratio {:.6e} should be < 5% of max shear (step={:.4})",
        shear_jump_ratio,
        shear_step
    );
}

// ================================================================
// 7. Portal Frame Convergence — Lateral Sway
// ================================================================
//
// Portal frame (fixed base) with lateral load at beam level.
// With increasing mesh refinement of each member, the lateral sway
// at the beam level should converge.
//
// For a portal frame with columns height h, beam span w, all members
// same EI, lateral load F at top:
//   Sway ~ F*h^3 / (24*EI) (approximate for stiff beam)
//
// We test that refining the mesh improves accuracy.

#[test]
fn validation_portal_frame_sway_convergence() {
    let h: f64 = 4.0; // column height
    let w: f64 = 6.0; // beam span
    let f_lat: f64 = 20.0; // lateral load

    // Build portal frames with increasing mesh refinement.
    // n_per_member: number of elements per member (2 columns + 1 beam).
    let refinements: [usize; 4] = [1, 2, 4, 8];
    let mut sway_values: Vec<f64> = Vec::new();

    for &n_per in &refinements {
        let n_col = n_per;
        let n_beam = n_per;
        let total_nodes = n_col + n_beam + n_col + 1;
        let total_elems = n_col + n_beam + n_col;

        // Build nodes: left column (bottom to top), beam (left to right), right column (top to bottom)
        let mut nodes: Vec<(usize, f64, f64)> = Vec::new();
        let mut node_id: usize = 1;

        // Left column nodes: (0, 0) to (0, h)
        for i in 0..=n_col {
            nodes.push((node_id, 0.0, i as f64 * h / n_col as f64));
            node_id += 1;
        }
        let top_left_node = node_id - 1;

        // Beam interior nodes: (dx, h) to (w-dx, h), skip first (already placed)
        for i in 1..=n_beam {
            nodes.push((node_id, i as f64 * w / n_beam as f64, h));
            node_id += 1;
        }
        let top_right_node = node_id - 1;

        // Right column interior nodes: (w, h-dh) down to (w, 0), skip first (already placed)
        for i in 1..=n_col {
            nodes.push((node_id, w, h - i as f64 * h / n_col as f64));
            node_id += 1;
        }
        let bottom_right_node = node_id - 1;

        assert_eq!(node_id - 1, total_nodes, "node count");

        // Build elements
        let mut elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
        let mut elem_id: usize = 1;

        // Left column elements
        for i in 0..n_col {
            elems.push((elem_id, "frame", i + 1, i + 2, 1, 1, false, false));
            elem_id += 1;
        }
        // Beam elements
        let beam_start_node = top_left_node;
        for i in 0..n_beam {
            let ni = beam_start_node + i;
            let nj = beam_start_node + i + 1;
            elems.push((elem_id, "frame", ni, nj, 1, 1, false, false));
            elem_id += 1;
        }
        // Right column elements
        let right_col_start = top_right_node;
        for i in 0..n_col {
            let ni = right_col_start + i;
            let nj = right_col_start + i + 1;
            elems.push((elem_id, "frame", ni, nj, 1, 1, false, false));
            elem_id += 1;
        }

        assert_eq!(elem_id - 1, total_elems, "element count");

        // Supports: fixed at bottom-left (node 1) and bottom-right
        let sups = vec![
            (1, 1_usize, "fixed"),
            (2, bottom_right_node, "fixed"),
        ];

        // Lateral load at top-left node
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: top_left_node,
            fx: f_lat,
            fz: 0.0,
            my: 0.0,
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

        // Sway = horizontal displacement at top-left node
        let d_top: f64 = results
            .displacements
            .iter()
            .find(|d| d.node_id == top_left_node)
            .unwrap()
            .ux
            .abs();
        sway_values.push(d_top);
    }

    // Sway should converge: successive values should get closer together
    let mut diffs: Vec<f64> = Vec::new();
    for i in 1..sway_values.len() {
        let diff: f64 = (sway_values[i] - sway_values[i - 1]).abs();
        diffs.push(diff);
    }

    // Differences should decrease (convergence)
    for i in 1..diffs.len() {
        assert!(
            diffs[i] <= diffs[i - 1] * 1.5 + 1e-10,
            "Portal sway convergence: diff[{}]={:.6e} should be <= diff[{}]={:.6e}",
            i,
            diffs[i],
            i - 1,
            diffs[i - 1]
        );
    }

    // Finest mesh sway should be close to the second-finest (converged)
    let converged_sway = sway_values.last().unwrap();
    let second_finest = sway_values[sway_values.len() - 2];
    let convergence_err: f64 =
        (converged_sway - second_finest).abs() / converged_sway;

    assert!(
        convergence_err < 0.02,
        "Portal sway convergence error {:.4}% between finest meshes should be < 2%",
        convergence_err * 100.0
    );

    // Sway should be positive (frame displaces in direction of load)
    assert!(
        *converged_sway > 0.0,
        "Portal sway should be positive: {:.6e}",
        converged_sway
    );
}

// ================================================================
// 8. Two-Span Continuous Beam — Interior Support Reaction
// ================================================================
//
// Two equal spans L with UDL q on both spans.
// By the three-moment equation, the interior support reaction is:
//   R_B = 10*q*L / 8  (= 1.25*q*L)
// End reactions: R_A = R_C = 3*q*L / 8
//
// Verify convergence of the interior reaction with mesh refinement.

#[test]
fn validation_two_span_continuous_beam_interior_reaction() {
    let span: f64 = 6.0;
    let q: f64 = -10.0;
    let r_interior_exact: f64 = 10.0 * q.abs() * span / 8.0;
    let r_end_exact: f64 = 3.0 * q.abs() * span / 8.0;

    let mesh_sizes: [usize; 4] = [2, 4, 8, 16];
    let mut errors_interior: Vec<f64> = Vec::new();

    for &n_per_span in &mesh_sizes {
        let total_elems = 2 * n_per_span;

        // Build distributed loads on all elements
        let mut loads: Vec<SolverLoad> = Vec::new();
        for i in 1..=total_elems {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            }));
        }

        let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
        let results = linear::solve_2d(&input).unwrap();

        // Interior support node is at position n_per_span + 1
        let interior_node = n_per_span + 1;
        let r_int: f64 = results
            .reactions
            .iter()
            .find(|r| r.node_id == interior_node)
            .unwrap()
            .rz;

        let err: f64 = (r_int - r_interior_exact).abs() / r_interior_exact;
        errors_interior.push(err);

        // Also check end reactions for the finest mesh
        if n_per_span == *mesh_sizes.last().unwrap() {
            let r_a: f64 = results
                .reactions
                .iter()
                .find(|r| r.node_id == 1)
                .unwrap()
                .rz;
            let end_node = 2 * n_per_span + 1;
            let r_c: f64 = results
                .reactions
                .iter()
                .find(|r| r.node_id == end_node)
                .unwrap()
                .rz;

            assert_close(
                r_a,
                r_end_exact,
                0.02,
                "end reaction R_A (finest mesh)",
            );
            assert_close(
                r_c,
                r_end_exact,
                0.02,
                "end reaction R_C (finest mesh)",
            );

            // Global equilibrium: R_A + R_B + R_C = q * 2L
            let total_load: f64 = q.abs() * 2.0 * span;
            let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
            assert_close(sum_ry, total_load, 0.01, "global vertical equilibrium");
        }
    }

    // Interior reaction should converge
    for i in 1..errors_interior.len() {
        if errors_interior[i - 1] > 1e-10 {
            assert!(
                errors_interior[i] <= errors_interior[i - 1] * 1.1 + 1e-8,
                "Interior reaction convergence: err[n={}]={:.6e} should be <= err[n={}]={:.6e}",
                mesh_sizes[i],
                errors_interior[i],
                mesh_sizes[i - 1],
                errors_interior[i - 1]
            );
        }
    }

    // Finest mesh interior reaction should be within 1%
    assert!(
        errors_interior.last().unwrap() < &0.01,
        "Interior reaction error {:.4}% should be < 1% (R_B exact = {:.4})",
        errors_interior.last().unwrap() * 100.0,
        r_interior_exact
    );
}
