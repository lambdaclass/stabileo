/// Validation: Fundamental stiffness matrix properties verified through indirect observations.
///
/// We cannot inspect K directly, but we can verify its mathematical properties
/// through the solution behavior:
///   - Symmetry (via flexibility matrix reciprocity)
///   - Positive definiteness (positive work under load)
///   - Superposition (linearity)
///   - Scaling with material/geometric parameters
///   - Mesh independence for polynomial solutions
///   - Equilibrium under rotation
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const EI: f64 = 20_000.0; // E * 1000 * IZ (consistent solver units)

// ═══════════════════════════════════════════════════════════════
// 1. Flexibility symmetry (K symmetric <=> f symmetric)
// ═══════════════════════════════════════════════════════════════
//
// Maxwell's reciprocal theorem: f_ij = f_ji.
// Simply-supported beam L=8m, 4 elements (nodes 1..5 at x=0,2,4,6,8).
// Case A: unit load at node 2 (x=2) -> measure delta at node 4 (x=6).
// Case B: unit load at node 4 (x=6) -> measure delta at node 2 (x=2).
// f_24 should equal f_42, proving K is symmetric.

#[test]
fn flexibility_symmetry_proves_k_symmetric() {
    let l = 8.0;
    let n = 4;
    let p = 1.0;

    // Case A: load at node 2, measure at node 4
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();
    let f_24 = res_a.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;

    // Case B: load at node 4, measure at node 2
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();
    let f_42 = res_b.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;

    // Maxwell's reciprocal theorem: f_24 = f_42
    assert_close(f_24, f_42, 1e-10, "flexibility symmetry f_24 == f_42");
}

// ═══════════════════════════════════════════════════════════════
// 2. Positive work: u . F > 0 (positive definiteness)
// ═══════════════════════════════════════════════════════════════
//
// Cantilever L=4m, 4 elements. Tip loads: fy=-10, fx=5.
// Work W = fx*ux + fy*uy at the tip. Must be positive for a
// positive-definite stiffness matrix.

#[test]
fn positive_work_under_load() {
    let l = 4.0;
    let n = 4;
    let fx = 5.0;
    let fy = -10.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx, fy, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let work = fx * tip.ux + fy * tip.uy;

    assert!(
        work > 0.0,
        "Work must be positive (W = {:.6}), ux={:.6}, uy={:.6}",
        work, tip.ux, tip.uy
    );

    // Also verify directions: ux > 0 (fx positive), uy < 0 (fy negative)
    assert!(tip.ux > 0.0, "ux should be positive for positive fx");
    assert!(tip.uy < 0.0, "uy should be negative for negative fy");
}

// ═══════════════════════════════════════════════════════════════
// 3. Superposition: u_C = u_A + u_B
// ═══════════════════════════════════════════════════════════════
//
// Simply-supported beam L=6m, 4 elements (nodes at 0, 1.5, 3, 4.5, 6).
// Case A: P_A = -10 kN at node 2.
// Case B: P_B = -15 kN at node 4.
// Case C: both loads simultaneously.
// Verify u_C = u_A + u_B at every node.

#[test]
fn superposition_of_load_cases() {
    let l = 6.0;
    let n = 4;

    // Case A
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Case B
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fy: -15.0, mz: 0.0,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Case C: both loads
    let loads_c = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -15.0, mz: 0.0,
        }),
    ];
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();

    // Verify at every node: u_C = u_A + u_B
    for node_id in 1..=(n + 1) {
        let da = res_a.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let db = res_b.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let dc = res_c.displacements.iter().find(|d| d.node_id == node_id).unwrap();

        assert_close(
            dc.uy, da.uy + db.uy, 1e-10,
            &format!("superposition uy at node {}", node_id),
        );
        assert_close(
            dc.ux, da.ux + db.ux, 1e-10,
            &format!("superposition ux at node {}", node_id),
        );
        assert_close(
            dc.rz, da.rz + db.rz, 1e-10,
            &format!("superposition rz at node {}", node_id),
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. Stiffness proportional to E
// ═══════════════════════════════════════════════════════════════
//
// Same SS beam, same midspan load P=-10.
// E1 = 200000, E2 = 400000 (double). Deflection should halve.

#[test]
fn stiffness_proportional_to_e() {
    let l = 6.0;
    let n = 4;
    let p = 10.0;
    let e1 = 200_000.0;
    let e2 = 400_000.0;

    let make_case = |e: f64| {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })];
        make_beam(n, l, e, A, IZ, "pinned", Some("rollerX"), loads)
    };

    let res1 = linear::solve_2d(&make_case(e1)).unwrap();
    let res2 = linear::solve_2d(&make_case(e2)).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    let ratio = d2 / d1;
    assert_close(ratio, 0.5, 1e-10, "deflection ratio E2/E1 = 0.5");
}

// ═══════════════════════════════════════════════════════════════
// 5. Stiffness inversely proportional to L^3 for bending
// ═══════════════════════════════════════════════════════════════
//
// Cantilever with tip load P=-10.
// L1=4m, L2=8m. delta = PL^3/(3EI). Ratio = (L2/L1)^3 = 8.

#[test]
fn stiffness_inversely_proportional_to_l_cubed() {
    let p = 10.0;
    let l1 = 4.0;
    let l2 = 8.0;
    let n = 4;

    let make_cantilever = |l: f64| {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })];
        make_beam(n, l, E, A, IZ, "fixed", None, loads)
    };

    let res1 = linear::solve_2d(&make_cantilever(l1)).unwrap();
    let res2 = linear::solve_2d(&make_cantilever(l2)).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    let ratio = d2 / d1;
    let expected = (l2 / l1).powi(3); // 8.0
    assert_close(ratio, expected, 1e-6, "deflection ratio (L2/L1)^3");
}

// ═══════════════════════════════════════════════════════════════
// 6. Mesh independence for polynomial loading
// ═══════════════════════════════════════════════════════════════
//
// Cantilever L=4m with tip load P=-10.
// Case 1: 1 element. Case 2: 4 elements.
// Cubic displacement is exactly represented by Hermite shape functions,
// so tip displacement is mesh-independent.

#[test]
fn mesh_independence_for_tip_load() {
    let l = 4.0;
    let p = 10.0;

    let make_cantilever = |n: usize| {
        let n_nodes = n + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes, fx: 0.0, fy: -p, mz: 0.0,
        })];
        make_beam(n, l, E, A, IZ, "fixed", None, loads)
    };

    let res1 = linear::solve_2d(&make_cantilever(1)).unwrap();
    let res4 = linear::solve_2d(&make_cantilever(4)).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let d4 = res4.displacements.iter().find(|d| d.node_id == 5).unwrap().uy;

    assert_close(d1, d4, 1e-10, "mesh-independent tip displacement");

    // Cross-check with analytical: delta = PL^3/(3EI)
    let expected = -p * l.powi(3) / (3.0 * EI);
    assert_close(d1, expected, 1e-6, "tip vs analytical PL^3/(3EI)");
}

// ═══════════════════════════════════════════════════════════════
// 7. Energy conservation: external work = internal strain energy
// ═══════════════════════════════════════════════════════════════
//
// Cantilever L=4m, 4 elements, tip load P=-10.
// External work W_ext = 0.5 * P * delta_tip (in magnitude).
// Internal strain energy from bending: U = integral M^2/(2EI) dx.
// For a cantilever with tip load: M(x) = -P*(L-x), so
// U = P^2 L^3 / (6EI).
// W_ext = 0.5 * P * PL^3/(3EI) = P^2 L^3 / (6EI) = U. Verified.

#[test]
fn energy_conservation_external_work_equals_strain_energy() {
    let l = 4.0;
    let n = 4;
    let p = 10.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    // External work: W = 0.5 * |F| * |delta| = 0.5 * P * |uy|
    let w_ext = 0.5 * p * tip.uy.abs();

    // Analytical strain energy for cantilever with tip load:
    // U = P^2 * L^3 / (6 * E * I)
    let u_analytical = p * p * l.powi(3) / (6.0 * EI);

    assert!(w_ext > 0.0, "External work must be positive");
    assert_close(w_ext, u_analytical, 1e-6, "W_ext == U_analytical");
}

// ═══════════════════════════════════════════════════════════════
// 8. Stiffness matrix consistent under rotation (angled beam)
// ═══════════════════════════════════════════════════════════════
//
// Cantilever at 45 degrees: node 1 at (0,0), node 2 at (3,3).
// Fixed at node 1, free at node 2. Vertical load fy=-10 at node 2.
// Global equilibrium requires:
//   rx = 0, ry = 10 (vertical equilibrium)
//   mz = -P * x_arm = -10 * 3 = -30 (moment about node 1)

#[test]
fn stiffness_consistent_under_rotation() {
    let p = 10.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 3.0, 3.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false)];
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium at the single support (node 1)
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Horizontal equilibrium: rx + 0 = 0
    assert_close(r.rx, 0.0, 1e-8, "rx equilibrium (no horizontal load)");

    // Vertical equilibrium: ry - P = 0 => ry = P
    assert_close(r.ry, p, 1e-8, "ry equilibrium");

    // Moment about node 1: reaction moment balances applied load moment.
    // P acts downward at x=3, moment arm = 3. Solver convention gives mz = +P*3.
    assert_close(r.mz, p * 3.0, 1e-6, "moment equilibrium at base");

    // The free end should displace
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(tip.uy < 0.0, "tip should deflect downward");
}
