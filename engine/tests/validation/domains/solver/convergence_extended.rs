/// Validation: Extended Mesh Convergence Studies
///
/// Additional convergence tests beyond the base validation_convergence.rs:
///   - Propped cantilever UDL deflection convergence
///   - Fixed-fixed beam midspan deflection convergence
///   - Cantilever UDL tip rotation convergence
///   - Simply-supported beam with point load at midspan
///   - Two-span continuous beam symmetry convergence
///   - Cantilever moment diagram convergence at root
///   - Simply-supported beam shear force convergence
///   - Triangular load deflection convergence
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2014, Ch. 4
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed
///   - Hibbeler, "Structural Analysis", 10th Ed

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Propped Cantilever UDL: Tip Deflection Convergence
// ================================================================
//
// Fixed at left, roller at right, UDL q over full span.
// Exact max deflection at x = L(1-1/sqrt(3))/... is complex,
// but reaction at roller: R_B = 3qL/8, so we check reaction convergence.
// Exact reaction at roller (right end): R_B = 3qL/8.

#[test]
fn validation_convergence_propped_cantilever_reaction() {
    let length: f64 = 8.0;
    let q: f64 = -6.0;
    // Propped cantilever: fixed left, rollerX right
    // Exact roller reaction: R_B = 3*|q|*L/8  (upward)
    let r_exact = 3.0 * q.abs() * length / 8.0;

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let n_nodes = n + 1;
        let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("rollerX"), vec![]);
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();
        let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
        let err = (r_right.ry - r_exact).abs() / r_exact;
        errors.push(err);
    }

    // Error should decrease with refinement
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "Propped cantilever reaction convergence: n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    // Finest mesh should be very accurate
    assert!(
        *errors.last().unwrap() < 0.02,
        "Propped cantilever reaction finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 2. Fixed-Fixed Beam UDL: Midspan Deflection Convergence
// ================================================================
//
// Exact midspan deflection: delta_mid = qL^4 / (384*EI)

#[test]
fn validation_convergence_fixed_fixed_midspan_deflection() {
    let length: f64 = 6.0;
    let q: f64 = -5.0;
    let ei: f64 = E * 1000.0 * IZ;
    let delta_exact = q.abs() * length.powi(4) / (384.0 * ei);

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("fixed"), vec![]);
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();
        let mid = n / 2 + 1;
        let d_mid = results.displacements.iter()
            .find(|d| d.node_id == mid).unwrap();
        let err = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
        errors.push(err);
    }

    // Error should decrease with refinement
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "Fixed-fixed midspan convergence: n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    assert!(
        *errors.last().unwrap() < 0.02,
        "Fixed-fixed midspan finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 3. Cantilever UDL: Tip Rotation Convergence
// ================================================================
//
// Cantilever with UDL q. Exact tip rotation: theta = qL^3 / (6*EI)

#[test]
fn validation_convergence_cantilever_tip_rotation() {
    let length: f64 = 5.0;
    let q: f64 = -8.0;
    let ei: f64 = E * 1000.0 * IZ;
    let theta_exact = q.abs() * length.powi(3) / (6.0 * ei);

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let n_nodes = n + 1;
        let mut input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();
        let d_tip = results.displacements.iter()
            .find(|d| d.node_id == n_nodes).unwrap();
        let err = (d_tip.rz.abs() - theta_exact).abs() / theta_exact;
        errors.push(err);
    }

    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "Cantilever tip rotation convergence: n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    assert!(
        *errors.last().unwrap() < 0.02,
        "Cantilever tip rotation finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 4. SS Beam Point Load at Midspan: Deflection Convergence
// ================================================================
//
// Simply-supported beam, point load P at midspan.
// Exact midspan deflection: delta = PL^3 / (48*EI)

#[test]
fn validation_convergence_ss_beam_point_load_midspan() {
    let length: f64 = 6.0;
    let p: f64 = -10.0;
    let ei: f64 = E * 1000.0 * IZ;
    let delta_exact = p.abs() * length.powi(3) / (48.0 * ei);

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let mid = n / 2 + 1;
        let input = make_beam(
            n, length, E, A, IZ, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: p, mz: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();
        let d_mid = results.displacements.iter()
            .find(|d| d.node_id == mid).unwrap();
        let err = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
        errors.push(err);
    }

    // For nodal point load with cubic elements, should be very accurate
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "SS midspan point load convergence: n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    assert!(
        *errors.last().unwrap() < 0.01,
        "SS midspan point load finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 5. Two-Span Continuous Beam: Symmetry Convergence
// ================================================================
//
// Two equal spans with equal UDL. By symmetry, the center reaction
// equals 5qL/4 (for each span L, center reaction = 2 * 5qL/8 = 5qL/4).
// Actually: for two-span continuous beam with UDL,
// center reaction R_B = 10qL/8 = 5qL/4.

#[test]
fn validation_convergence_two_span_center_reaction() {
    let span: f64 = 5.0;
    let q: f64 = -4.0;
    // For a two-span continuous beam with equal spans L and uniform load q:
    // Center reaction R_B = 5*|q|*L/4
    let r_center_exact = 5.0 * q.abs() * span / 4.0;

    let mesh_sizes_per_span = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes_per_span {
        let mut input = make_continuous_beam(
            &[span, span], n, E, A, IZ, vec![],
        );
        let total_elements = 2 * n;
        for i in 1..=total_elements {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();
        // Center support is at node (n+1)
        let center_node = n + 1;
        let r_center = results.reactions.iter().find(|r| r.node_id == center_node).unwrap();
        let err = (r_center.ry - r_center_exact).abs() / r_center_exact;
        errors.push(err);
    }

    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "Two-span center reaction convergence: n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes_per_span[i], errors[i],
                mesh_sizes_per_span[i - 1], errors[i - 1]
            );
        }
    }

    assert!(
        *errors.last().unwrap() < 0.02,
        "Two-span center reaction finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 6. Cantilever UDL: Root Moment Convergence
// ================================================================
//
// Cantilever with UDL q. Exact root moment: M = qL^2/2
// Check that element force m_start at root element converges.

#[test]
fn validation_convergence_cantilever_root_moment() {
    let length: f64 = 5.0;
    let q: f64 = -6.0;
    // Reaction moment at fixed end: M = |q|*L^2/2
    let m_exact = q.abs() * length * length / 2.0;

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let mut input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();
        // Root moment from reactions
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let err = (r1.mz.abs() - m_exact).abs() / m_exact;
        errors.push(err);
    }

    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "Cantilever root moment convergence: n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    assert!(
        *errors.last().unwrap() < 0.02,
        "Cantilever root moment finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 7. SS Beam UDL: End Shear Force Convergence
// ================================================================
//
// Simply-supported beam with UDL q.
// Exact end shear (reaction): V = qL/2

#[test]
fn validation_convergence_ss_shear_force() {
    let length: f64 = 6.0;
    let q: f64 = -5.0;
    let v_exact = q.abs() * length / 2.0;

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();
        // Shear at start of first element should equal the end reaction
        let ef1 = results.element_forces.iter()
            .find(|ef| ef.element_id == 1).unwrap();
        let err = (ef1.v_start.abs() - v_exact).abs() / v_exact;
        errors.push(err);
    }

    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "SS shear convergence: n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    assert!(
        *errors.last().unwrap() < 0.02,
        "SS shear finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 8. SS Beam Triangular Load: Deflection Convergence
// ================================================================
//
// Simply-supported beam with triangular load (0 at left, q at right).
// Exact max deflection: delta_max = q*L^4 / (120*EI * sqrt(3)) at
// x = L/sqrt(3), but for midspan deflection:
// delta_mid = 5*q*L^4 / (768*EI)
// We use the simpler midspan formula.

#[test]
fn validation_convergence_ss_triangular_load() {
    let length: f64 = 6.0;
    let q_max: f64 = -10.0;
    let ei: f64 = E * 1000.0 * IZ;
    // Midspan deflection for triangular load (0 to q):
    // delta_mid = 5*|q|*L^4 / (768*EI)
    let delta_exact = 5.0 * q_max.abs() * length.powi(4) / (768.0 * ei);

    let mesh_sizes = [4, 8, 16, 32];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let n_nodes = n + 1;
        let elem_len = length / n as f64;
        let mut nodes = Vec::new();
        for i in 0..n_nodes {
            nodes.push((i + 1, i as f64 * elem_len, 0.0));
        }
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();
        let sups = vec![(1, 1, "pinned"), (2, n_nodes, "rollerX")];

        // Triangular load: linearly varying from 0 at left to q_max at right
        let mut loads = Vec::new();
        for i in 0..n {
            let x_i = i as f64 * elem_len;
            let x_j = (i + 1) as f64 * elem_len;
            let q_i = q_max * x_i / length;
            let q_j = q_max * x_j / length;
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i, q_j, a: None, b: None,
            }));
        }

        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        let mid = n / 2 + 1;
        let d_mid = results.displacements.iter()
            .find(|d| d.node_id == mid).unwrap();
        let err = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
        errors.push(err);
    }

    // Check convergence: error should decrease
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "Triangular load convergence: n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    assert!(
        *errors.last().unwrap() < 0.05,
        "Triangular load finest mesh error={:.6e}", errors.last().unwrap()
    );
}
