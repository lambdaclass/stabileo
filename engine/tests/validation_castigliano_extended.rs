/// Validation: Castigliano's Theorems — Extended Tests
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 8
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 9
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 7
///   - Timoshenko, "Strength of Materials", Vol. 1, Ch. 12
///   - Megson, "Structural and Stress Analysis", 3rd Ed., Ch. 15
///
/// Extended tests for Castigliano's second theorem and energy methods:
///   1. Fixed-fixed beam center: delta = PL^3/(192EI)
///   2. Truss (double-hinged frames): virtual work deflection of Warren truss
///   3. Cantilever with triangular load: delta_tip = q*L^4/(30EI)
///   4. Maxwell reciprocal theorem via Castigliano: f_ij = f_ji
///   5. Propped cantilever tip deflection via compatibility
///   6. SS beam with two symmetric loads (third-point loading)
///   7. Cantilever combined load: superposition of tip load + moment
///   8. Multi-panel Howe truss deflection via unit load method
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Effective modulus: E_EFF = E [MPa] * 1000 [kN/m^2 per MPa] = E in kN/m^2
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Fixed-Fixed Beam Center Load: delta = PL^3 / (192EI)
// ================================================================
//
// Castigliano applied to a fixed-fixed beam with center point load.
// The strain energy approach yields:
//   delta_center = PL^3 / (192EI)
// which is 1/4 of the simply-supported result (PL^3/48EI).
//
// Reference: Timoshenko, "Strength of Materials", Table of beam formulas.

#[test]
fn validation_castigliano_ext_fixed_fixed_center() {
    let l = 6.0;
    let n = 16;
    let p = 20.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Castigliano: delta = PL^3 / (192EI) for fixed-fixed beam with center load
    let delta_exact = p * l * l * l / (192.0 * E_EFF * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.02,
        "Castigliano ext: fixed-fixed center delta = PL^3/(192EI)");
}

// ================================================================
// 2. Warren Truss Deflection via Virtual Work (Castigliano)
// ================================================================
//
// Two-panel Warren truss (4 nodes, 5 bars):
//   1(0,0)--2(4,0)--3(8,0)
//           4(4,3)
// Bars: 1-4, 4-2, 2-4(diag), 4-3, 1-2(bottom), 2-3(bottom)
// Actually a simpler layout:
//   1(0,0) pinned, 3(8,0) rollerX, 2(4,0) bottom chord mid,
//   4(2,3) top left, 5(6,3) top right
// Load P at node 2 downward.
//
// Using Castigliano: delta_2 = sum_i (N_i * n_i * L_i / (EA))
// where N_i = real forces, n_i = virtual unit load forces.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Example 7.13

#[test]
fn validation_castigliano_ext_warren_truss_deflection() {
    let p = 50.0;
    let a_truss = 0.002;

    // Nodes: 1(0,0), 2(3,0), 3(6,0), 4(1.5,2.0), 5(4.5,2.0)
    // Simple symmetric Warren truss, load at node 2 (bottom middle)
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 3.0, 0.0),
            (3, 6.0, 0.0),
            (4, 1.5, 2.0),
            (5, 4.5, 2.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, a_truss, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom left
            (2, "frame", 2, 3, 1, 1, true, true), // bottom right
            (3, "frame", 1, 4, 1, 1, true, true), // left diagonal
            (4, "frame", 4, 5, 1, 1, true, true), // top chord
            (5, "frame", 5, 3, 1, 1, true, true), // right diagonal
            (6, "frame", 4, 2, 1, 1, true, true), // left inner diagonal
            (7, "frame", 2, 5, 1, 1, true, true), // right inner diagonal
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // External work = (1/2) * P * delta
    let u_external = 0.5 * p * d2.uy.abs();

    // Internal strain energy = sum N_i^2 * L_i / (2 * EA)
    // Compute from element forces
    let mut u_internal = 0.0;
    for ef in &results.element_forces {
        let axial = ef.n_start.abs(); // axial force magnitude
        // Compute element length from nodes
        let elem = input.elements.values().find(|e| e.id == ef.element_id).unwrap();
        let ni = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let nj = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let length = (dx * dx + dy * dy).sqrt();
        u_internal += axial * axial * length / (2.0 * E_EFF * a_truss);
    }

    // Castigliano: U_external = U_internal
    assert_close(u_external, u_internal, 0.05,
        "Castigliano ext: Warren truss U_ext = U_int");

    // All moments should be zero (truss behavior)
    for ef in &results.element_forces {
        assert_close(ef.m_start, 0.0, 0.01,
            &format!("Warren truss elem {} m_start=0", ef.element_id));
    }
}

// ================================================================
// 3. Cantilever with Triangular Load: delta_tip = qL^4 / (30EI)
// ================================================================
//
// Linearly varying load from q at fixed end to 0 at free end.
// Strain energy U = integral of M^2/(2EI) dx.
// Castigliano gives tip deflection:
//   delta_tip = q * L^4 / (30 * EI)
//
// Reference: Megson, "Structural and Stress Analysis", Table 13.1

#[test]
fn validation_castigliano_ext_cantilever_triangular_load() {
    let l = 5.0;
    let n = 20; // need fine mesh for triangular load
    let q_max = 12.0; // load intensity at fixed end (kN/m)

    let elem_len = l / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        // x_i and x_j positions along beam (0 = fixed end, L = free end)
        let x_i = i as f64 * elem_len;
        let x_j = (i + 1) as f64 * elem_len;
        // Triangular load: q(x) = q_max * (1 - x/L), linearly decreasing
        let q_i = -q_max * (1.0 - x_i / l);
        let q_j = -q_max * (1.0 - x_j / l);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i, q_j, a: None, b: None,
        }));
    }
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Castigliano: delta_tip = q_max * L^4 / (30 * EI)
    let delta_exact = q_max * l.powi(4) / (30.0 * E_EFF * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.03,
        "Castigliano ext: cantilever triangular load delta = qL^4/(30EI)");
}

// ================================================================
// 4. Maxwell's Reciprocal Theorem via Castigliano
// ================================================================
//
// For a simply-supported beam, apply unit load at point A and measure
// deflection at point B; then apply unit load at B and measure at A.
// Maxwell's theorem: f_AB = f_BA
// This is a direct consequence of Castigliano's theorem and the
// symmetry of the flexibility matrix.
//
// Reference: Ghali & Neville, "Structural Analysis", Sec. 8.6

#[test]
fn validation_castigliano_ext_maxwell_reciprocal() {
    let l = 10.0;
    let n = 20;
    let p = 1.0; // unit load

    // Node at L/4 and 3L/4
    let node_a = n / 4 + 1;  // L/4
    let node_b = 3 * n / 4 + 1; // 3L/4

    // Case 1: Load at A, measure deflection at B
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_1);
    let res_1 = linear::solve_2d(&input_1).unwrap();
    let f_ab = res_1.displacements.iter().find(|d| d.node_id == node_b).unwrap().uy.abs();

    // Case 2: Load at B, measure deflection at A
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_2);
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let f_ba = res_2.displacements.iter().find(|d| d.node_id == node_a).unwrap().uy.abs();

    // Maxwell reciprocal theorem: f_AB = f_BA
    assert_close(f_ab, f_ba, 0.001,
        "Castigliano ext: Maxwell reciprocal f_AB = f_BA");
}

// ================================================================
// 5. Propped Cantilever Tip Deflection via Compatibility
// ================================================================
//
// Fixed-roller beam with center point load.
// Propped cantilever (fixed at left, roller at right):
//   delta_center = P * L^3 / (48EI) * (5/2) * ...
// Actually use the known formula:
//   For a propped cantilever (fixed-pinned) with load at center:
//   delta_max occurs at x = L*(1+sqrt(33))/16 from fixed end
//   At the load point (center): delta = 7*P*L^3 / (768*EI)
//
// Reference: Hibbeler, "Structural Analysis", Table B-2

#[test]
fn validation_castigliano_ext_propped_cantilever() {
    let l = 8.0;
    let n = 16;
    let p = 30.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    // Fixed at left, roller (pinned with horizontal freedom) at right
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Propped cantilever with center load:
    // delta_center = 7 * P * L^3 / (768 * EI)
    let delta_exact = 7.0 * p * l.powi(3) / (768.0 * E_EFF * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.03,
        "Castigliano ext: propped cantilever center delta = 7PL^3/(768EI)");

    // Energy check: U = (1/2) * P * delta
    let u_external = 0.5 * p * d_mid.uy.abs();
    assert!(u_external > 0.0, "Propped cantilever: positive strain energy");
}

// ================================================================
// 6. SS Beam Third-Point Loading: delta = 23PL^3 / (648EI)
// ================================================================
//
// Simply-supported beam with two equal point loads at L/3 and 2L/3.
// By superposition and Castigliano:
//   delta_center = 23 * P * L^3 / (648 * EI)
//
// Reference: Timoshenko, "Strength of Materials", beam formula tables

#[test]
fn validation_castigliano_ext_third_point_loading() {
    let l = 9.0;
    let n = 18;
    let p = 15.0;

    let node_a = n / 3 + 1;       // L/3
    let node_b = 2 * n / 3 + 1;   // 2L/3
    let mid = n / 2 + 1;          // L/2

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_a, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_b, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Third-point loading: delta_center = 23 * P * L^3 / (648 * EI)
    let delta_exact = 23.0 * p * l.powi(3) / (648.0 * E_EFF * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.02,
        "Castigliano ext: third-point loading delta = 23PL^3/(648EI)");

    // Reactions should be symmetric: R1 = R2 = P (each support carries both loads equally)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.ry, p, 0.01, "Third-point: R1 = P");
    assert_close(r_end.ry, p, 0.01, "Third-point: R2 = P");
}

// ================================================================
// 7. Cantilever Combined Load: Superposition via Energy
// ================================================================
//
// Cantilever with simultaneous tip load P (downward) and tip moment M (CCW).
// The internal moment at section x from fixed end is M(x) = P(L-x) - M.
// The positive moment M opposes the downward load's bending effect.
//
// Strain energy: U = integral_0^L [P(L-x) - M]^2 / (2EI) dx
//              = [P^2*L^3/3 - P*M*L^2 + M^2*L] / (2EI)
//
// By Castigliano:
//   delta_tip = dU/dP = P*L^3/(3EI) - M*L^2/(2EI)   (downward)
//   theta_tip = dU/dM = -P*L^2/(2EI) + M*L/(EI)       (= M*L/EI - P*L^2/(2EI))
//
// External work: U = (1/2) * [P * |delta| + M * |theta|]
//   when both generalized forces do positive work on their displacements.
//
// Reference: Hibbeler, "Structural Analysis", Sec. 9.8
//            Ghali & Neville, "Structural Analysis", Ch. 8

#[test]
fn validation_castigliano_ext_cantilever_combined() {
    let l = 5.0;
    let n = 12;
    let p = 10.0;
    let m_val = 8.0;

    let tip_node = n + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node, fx: 0.0, fy: -p, mz: m_val,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();

    // Castigliano: delta = dU/dP = PL^3/(3EI) - ML^2/(2EI) (M opposes P)
    let delta_exact = p * l.powi(3) / (3.0 * E_EFF * IZ)
                    - m_val * l * l / (2.0 * E_EFF * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.01,
        "Castigliano ext: cantilever combined delta = PL^3/(3EI) - ML^2/(2EI)");

    // Castigliano: theta = |dU/dM| = |ML/(EI) - PL^2/(2EI)|
    let theta_exact = (p * l * l / (2.0 * E_EFF * IZ)
                     - m_val * l / (E_EFF * IZ)).abs();
    assert_close(tip.rz.abs(), theta_exact, 0.01,
        "Castigliano ext: cantilever combined theta");

    // Strain energy from integral: U = [P^2*L^3/3 - P*M*L^2 + M^2*L] / (2EI)
    let u_exact = (p * p * l.powi(3) / 3.0
                 - p * m_val * l * l
                 + m_val * m_val * l)
                / (2.0 * E_EFF * IZ);

    // External work: U = (1/2) * (F_y * uy + M_z * rz)
    // with sign: F_y = -p, uy = tip.uy; M_z = m_val, rz = tip.rz
    let u_external = 0.5 * ((-p) * tip.uy + m_val * tip.rz);
    assert_close(u_external, u_exact, 0.01,
        "Castigliano ext: cantilever combined energy consistency");
}

// ================================================================
// 8. Howe Truss Deflection via Unit Load Method (Castigliano)
// ================================================================
//
// 4-panel Howe truss:
//   Bottom chord: 1(0,0) - 2(3,0) - 3(6,0) - 4(9,0) - 5(12,0)
//   Top chord:    6(3,4) - 7(6,4) - 8(9,4)
//   Verticals + diagonals connecting them.
//   Supports: node 1 pinned, node 5 rollerX.
//   Load: P at node 3 (bottom center).
//
// Verify: U_ext = (1/2)*P*delta = sum N_i^2*L_i/(2EA) = U_int
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Ch. 7

#[test]
fn validation_castigliano_ext_howe_truss() {
    let p = 100.0;
    let a_truss = 0.003;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 3.0, 0.0),
            (3, 6.0, 0.0),
            (4, 9.0, 0.0),
            (5, 12.0, 0.0),
            (6, 3.0, 4.0),
            (7, 6.0, 4.0),
            (8, 9.0, 4.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, a_truss, IZ)],
        vec![
            // Bottom chord
            (1,  "frame", 1, 2, 1, 1, true, true),
            (2,  "frame", 2, 3, 1, 1, true, true),
            (3,  "frame", 3, 4, 1, 1, true, true),
            (4,  "frame", 4, 5, 1, 1, true, true),
            // Top chord
            (5,  "frame", 6, 7, 1, 1, true, true),
            (6,  "frame", 7, 8, 1, 1, true, true),
            // Verticals (Howe pattern: verticals carry tension)
            (7,  "frame", 2, 6, 1, 1, true, true),
            (8,  "frame", 3, 7, 1, 1, true, true),
            (9,  "frame", 4, 8, 1, 1, true, true),
            // Diagonals (Howe pattern: diagonals from top outer to bottom inner)
            (10, "frame", 1, 6, 1, 1, true, true),
            (11, "frame", 6, 3, 1, 1, true, true),
            (12, "frame", 3, 8, 1, 1, true, true),
            (13, "frame", 8, 5, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // External work
    let u_external = 0.5 * p * d3.uy.abs();

    // Internal strain energy from axial forces
    let mut u_internal = 0.0;
    for ef in &results.element_forces {
        let axial = ef.n_start.abs();
        let elem = input.elements.values().find(|e| e.id == ef.element_id).unwrap();
        let ni = input.nodes.values().find(|nd| nd.id == elem.node_i).unwrap();
        let nj = input.nodes.values().find(|nd| nd.id == elem.node_j).unwrap();
        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let length = (dx * dx + dy * dy).sqrt();
        u_internal += axial * axial * length / (2.0 * E_EFF * a_truss);
    }

    // Castigliano: U_external = U_internal
    assert_close(u_external, u_internal, 0.05,
        "Castigliano ext: Howe truss U_ext = U_int");

    // Equilibrium check: symmetric loading, so R1y = R5y = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "Howe truss: R1y = P/2");
    assert_close(r5.ry, p / 2.0, 0.02, "Howe truss: R5y = P/2");

    // All moments should be zero (truss with double hinges)
    for ef in &results.element_forces {
        assert_close(ef.m_start, 0.0, 0.01,
            &format!("Howe truss elem {} m_start=0", ef.element_id));
    }
}
