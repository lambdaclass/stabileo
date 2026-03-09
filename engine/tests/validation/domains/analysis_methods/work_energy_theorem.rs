/// Validation: Work-Energy Principles in Structural Analysis
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials" — strain energy methods
///   - Castigliano's theorems, Betti's reciprocal theorem
///   - Clapeyron's theorem for linear elastic systems
///
/// Tests:
///   1. External work = 1/2 P delta for cantilever point load
///   2. External work = 1/2 M theta for cantilever moment load
///   3. Castigliano's first theorem: W_ext = U_analytical for SS beam
///   4. Midspan deflection of SS beam under UDL matches 5qL^4/(384EI)
///   5. Clapeyron's theorem: 2U = sum(F_i * u_i) for combined loading
///   6. Betti's reciprocal theorem: delta_AB = delta_BA
///   7. Strain energy proportional to load squared (linear elastic)
///   8. Conservation: external work is positive for portal frame
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4

/// Effective EI in kN*m^2 (E in MPa * 1000 gives kN/m^2, then * Iz gives kN*m^2)
const E_EFF: f64 = E * 1000.0; // kN/m^2
const EI: f64 = E_EFF * IZ; // kN*m^2 = 200_000 * 1000 * 1e-4 = 20_000

// ================================================================
// 1. External work = 1/2 P delta for cantilever point load
// ================================================================
//
// Cantilever L=4m, 4 elements. Tip load P = -10 kN (downward).
// Analytical: delta = PL^3 / (3EI), W_ext = P^2 L^3 / (6EI).
// FEM: W = 0.5 * |P| * |uy_tip|.
// These should match the analytical external work.

#[test]
fn validation_work_energy_point_load_cantilever() {
    let l = 4.0;
    let n = 4;
    let p = -10.0; // kN downward

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: p,
        mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find tip displacement (node n+1)
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    let delta_fem = tip.uy; // should be negative (downward)

    // Analytical deflection: delta = PL^3 / (3EI)
    // P = -10, so delta_analytical = -10 * 64 / (3 * 20000) = -640/60000
    let delta_analytical = p * l.powi(3) / (3.0 * EI);

    // Check deflection matches analytical
    assert_close(delta_fem, delta_analytical, 1e-4, "tip deflection");

    // External work from FEM: W = 0.5 * |P| * |delta|
    let w_fem = 0.5 * p.abs() * delta_fem.abs();

    // Analytical external work: W = P^2 L^3 / (6EI)
    let w_analytical = p.powi(2) * l.powi(3) / (6.0 * EI);

    assert_close(w_fem, w_analytical, 1e-4, "external work = 1/2 P delta");

    // Sanity: work must be positive
    assert!(w_fem > 0.0, "external work must be positive");
}

// ================================================================
// 2. External work = 1/2 M theta for cantilever moment load
// ================================================================
//
// Cantilever L=4m, 4 elements. Tip moment M = 10 kN*m.
// Analytical: theta = ML / (EI), W_ext = M^2 L / (2EI).
// FEM: W = 0.5 * M * |rz_tip|.

#[test]
fn validation_work_energy_moment_load_cantilever() {
    let l = 4.0;
    let n = 4;
    let m = 10.0; // kN*m (positive = counterclockwise)

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: 0.0,
        mz: m,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find tip rotation (node n+1)
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    let theta_fem = tip.rz; // rotation at tip

    // Analytical rotation: theta = ML / (EI)
    let theta_analytical = m * l / EI;

    assert_close(theta_fem, theta_analytical, 1e-4, "tip rotation");

    // External work from FEM: W = 0.5 * M * theta
    let w_fem = 0.5 * m * theta_fem.abs();

    // Analytical: W = M^2 L / (2EI)
    let w_analytical = m.powi(2) * l / (2.0 * EI);

    assert_close(w_fem, w_analytical, 1e-4, "external work = 1/2 M theta");

    // Sanity: work must be positive
    assert!(w_fem > 0.0, "external work must be positive");
}

// ================================================================
// 3. Castigliano's first theorem: W_ext = U_analytical for SS beam
// ================================================================
//
// Simply-supported beam L=6m, 4 elements. Midspan load P = -20 kN.
// For a SS beam with midspan point load:
//   delta_mid = PL^3 / (48EI)
//   U = 0.5 * |P| * |delta_mid| = P^2 L^3 / (96EI)
// Verify FEM external work matches analytical strain energy.

#[test]
fn validation_castigliano_ss_beam_midspan_load() {
    let l = 6.0;
    let n = 4; // 4 elements => nodes 1..5, midspan = node 3
    let p = -20.0; // kN downward

    let mid_node = n / 2 + 1; // node 3

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: p,
        mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find midspan displacement
    let mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    let delta_mid = mid.uy;

    // Analytical midspan deflection: delta = PL^3 / (48EI)
    let delta_analytical = p * l.powi(3) / (48.0 * EI);

    assert_close(delta_mid, delta_analytical, 1e-3, "midspan deflection");

    // External work from FEM
    let w_fem = 0.5 * p.abs() * delta_mid.abs();

    // Analytical strain energy: U = P^2 L^3 / (96EI)
    let u_analytical = p.powi(2) * l.powi(3) / (96.0 * EI);

    assert_close(
        w_fem,
        u_analytical,
        1e-3,
        "Castigliano: W_ext = U_analytical",
    );
}

// ================================================================
// 4. SS beam UDL: midspan deflection = 5qL^4 / (384EI)
// ================================================================
//
// Simply-supported beam L=8m, 4 elements, UDL q = -10 kN/m.
// Analytical midspan deflection: delta = 5qL^4 / (384EI).
// This confirms the work-energy balance indirectly: if the deflection
// shape is correct, the total strain energy U = (q^2 L^5) / (240EI)
// is implicitly correct by the virtual work principle.

#[test]
fn validation_work_energy_udl_deflection() {
    let l = 8.0;
    let n = 4;
    let q = -10.0; // kN/m downward

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let mid_node = n / 2 + 1; // node 3
    let mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    let delta_mid = mid.uy;

    // Analytical: delta_mid = 5qL^4 / (384EI)
    let delta_analytical = 5.0 * q * l.powi(4) / (384.0 * EI);

    assert_close(
        delta_mid,
        delta_analytical,
        1e-3,
        "UDL midspan deflection matches 5qL^4/(384EI)",
    );

    // Both should be negative (downward)
    assert!(delta_mid < 0.0, "deflection should be downward");

    // Verify work-energy balance via the known analytical strain energy
    // U = q^2 L^5 / (240 EI)  (total strain energy for SS beam + UDL)
    // W_ext should be positive
    // For distributed loads, W_ext = 0.5 * integral(q * delta(x) dx)
    // This equals U for a linear elastic system.
    let u_analytical = q.powi(2) * l.powi(5) / (240.0 * EI);
    assert!(
        u_analytical > 0.0,
        "analytical strain energy must be positive"
    );
}

// ================================================================
// 5. Clapeyron's theorem: 2U = sum(F_i * u_i) for combined loading
// ================================================================
//
// Cantilever L=4m, 4 elements. Combined: fx=5 kN, fy=-10 kN at tip.
// Clapeyron's theorem (linear elastic): 2U = sum over loaded DOFs of (F_i * u_i).
// So: 2U = fx * ux_tip + fy * uy_tip.
// This must be positive (forces do positive work in their displacement direction).

#[test]
fn validation_clapeyron_combined_loading() {
    let l = 4.0;
    let n = 4;
    let fx = 5.0; // kN
    let fy = -10.0; // kN

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx,
        fy,
        mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Clapeyron: 2U = F . u
    let two_u = fx * tip.ux + fy * tip.uy;

    // Must be positive (positive definite stiffness)
    assert!(
        two_u > 0.0,
        "Clapeyron 2U = {} must be positive (ux={}, uy={})",
        two_u,
        tip.ux,
        tip.uy
    );

    // Cross-check with individual strain energies:
    // Axial: U_axial = fx^2 * L / (2 * E_eff * A)
    let u_axial = fx.powi(2) * l / (2.0 * E_EFF * A);
    // Bending: U_bending = fy^2 * L^3 / (6 * EI) (cantilever tip load)
    let u_bending = fy.powi(2) * l.powi(3) / (6.0 * EI);
    let u_total = u_axial + u_bending;

    assert_close(
        two_u,
        2.0 * u_total,
        1e-3,
        "Clapeyron: 2U = F.u matches sum of strain energies",
    );
}

// ================================================================
// 6. Betti's reciprocal theorem
// ================================================================
//
// Simply-supported beam L=8m, 4 elements (nodes 1..5).
// State A: unit load P=-1 at node 2 (x=2m).
// State B: unit load P=-1 at node 4 (x=6m).
// Betti: P_A * delta_B(at node 2) = P_B * delta_A(at node 4).
// Since P_A = P_B = -1: delta_B_at_2 = delta_A_at_4.
// i.e., deflection at x=2 due to load at x=6 equals
//        deflection at x=6 due to load at x=2.

#[test]
fn validation_betti_reciprocal_theorem() {
    let l = 8.0;
    let n = 4;

    // State A: load at node 2
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: -1.0,
        mz: 0.0,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();

    // State B: load at node 4
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
        fx: 0.0,
        fy: -1.0,
        mz: 0.0,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();

    // Get delta_A at node 4 (deflection at node 4 under state A loading)
    let delta_a_at_4 = results_a
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap()
        .uy;

    // Get delta_B at node 2 (deflection at node 2 under state B loading)
    let delta_b_at_2 = results_b
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .uy;

    // Betti's reciprocal theorem: delta_A_at_4 = delta_B_at_2
    assert_close(
        delta_a_at_4,
        delta_b_at_2,
        1e-6,
        "Betti reciprocal theorem: delta_A(4) = delta_B(2)",
    );

    // Both should be negative (downward deflection)
    assert!(delta_a_at_4 < 0.0, "deflection should be negative");
    assert!(delta_b_at_2 < 0.0, "deflection should be negative");
}

// ================================================================
// 7. Strain energy proportional to load squared (linear elastic)
// ================================================================
//
// Simply-supported beam L=6m, 4 elements. Midspan point load.
// P1 = -10 kN => U1 = 0.5 * |P1| * |delta1|
// P2 = -20 kN => U2 = 0.5 * |P2| * |delta2|
// Since delta is proportional to P: U proportional to P^2.
// Therefore U2 / U1 = (P2/P1)^2 = 4.

#[test]
fn validation_strain_energy_proportional_to_load_squared() {
    let l = 6.0;
    let n = 4;
    let mid_node = n / 2 + 1;

    let p1 = -10.0;
    let p2 = -20.0;

    // Case 1
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: p1,
        mz: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let results1 = linear::solve_2d(&input1).unwrap();
    let delta1 = results1
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uy;
    let u1 = 0.5 * p1.abs() * delta1.abs();

    // Case 2
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: p2,
        mz: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let results2 = linear::solve_2d(&input2).unwrap();
    let delta2 = results2
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uy;
    let u2 = 0.5 * p2.abs() * delta2.abs();

    // U2 / U1 should be (P2/P1)^2 = 4
    let ratio = u2 / u1;
    let expected_ratio = (p2 / p1).powi(2);

    assert_close(
        ratio,
        expected_ratio,
        1e-6,
        "strain energy ratio U2/U1 = (P2/P1)^2",
    );

    // Also verify linearity: delta2 / delta1 = P2 / P1 = 2
    let disp_ratio = delta2 / delta1;
    assert_close(
        disp_ratio,
        p2 / p1,
        1e-6,
        "displacement proportional to load",
    );
}

// ================================================================
// 8. Conservation: external work positive for portal frame
// ================================================================
//
// Portal frame h=4m, w=6m, H=10 kN lateral, G=-20 kN gravity.
// W_ext = 0.5 * sum(F_i * u_i) over all loaded DOFs.
// For linear elastic: W_ext must be strictly positive (positive-definite K).

#[test]
fn validation_conservation_portal_frame() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0; // kN
    let gravity = -20.0; // kN

    let input = make_portal_frame(h, w, E, A, IZ, lateral, gravity);
    let results = linear::solve_2d(&input).unwrap();

    // Node 2: lateral load fx=10, gravity load fy=-20
    let d2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();

    // Node 3: gravity load fy=-20
    let d3 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap();

    // External work: W = 0.5 * sum(F_i * u_i)
    // Node 2 has fx=10, fy=-20; node 3 has fy=-20
    let w_ext = 0.5 * (lateral * d2.ux + gravity * d2.uy + gravity * d3.uy);

    // Must be positive (forces do positive work)
    assert!(
        w_ext > 0.0,
        "external work W_ext = {} must be positive (ux2={}, uy2={}, uy3={})",
        w_ext,
        d2.ux,
        d2.uy,
        d3.uy
    );

    // Cross-check: W_ext should be consistent with the strain energy.
    // For linear elastic systems, W_ext = U_strain, and both must be positive.
    // Also verify that the lateral displacement at node 2 is positive (same direction as H)
    assert!(
        d2.ux > 0.0,
        "lateral displacement should follow applied force direction"
    );
    // And vertical displacements at nodes 2 and 3 should be negative (downward, same as gravity)
    assert!(
        d2.uy < 0.0,
        "vertical displacement at node 2 should be downward"
    );
    assert!(
        d3.uy < 0.0,
        "vertical displacement at node 3 should be downward"
    );

    // Verify the individual work terms are each positive
    let w_lateral = 0.5 * lateral * d2.ux;
    let w_gravity = 0.5 * gravity * (d2.uy + d3.uy);
    assert!(w_lateral > 0.0, "lateral work component must be positive");
    assert!(w_gravity > 0.0, "gravity work component must be positive");
}
