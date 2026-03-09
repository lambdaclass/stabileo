/// Validation: Fundamental Force-Displacement Relationships
///
/// Tests:
///   1. Linear proportionality — double load doubles displacement (SS beam)
///   2. Linear proportionality — double load doubles reactions (SS beam)
///   3. Cantilever bending stiffness k = 3EI/L³
///   4. Axial spring stiffness k = EA/L
///   5. Rotational stiffness at fixed end: k_rot = EI/L
///   6. Flexibility matrix symmetry (Maxwell's reciprocal theorem)
///   7. Unit load theorem — UDL midspan deflection vs analytical
///   8. Portal frame lateral stiffness linearity

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Effective E for analytical formulas (solver uses kN, m units internally
/// with E in MPa, so E_eff = E * 1000).
const E_EFF: f64 = E * 1000.0;

// ---------------------------------------------------------------------------
// Test 1: Linear proportionality — double load doubles displacement
// ---------------------------------------------------------------------------
#[test]
fn linear_proportionality_double_load_doubles_displacement() {
    let l = 6.0;
    let n_elem = 4;
    // Midspan node is node 3 (nodes: 1,2,3,4,5 for 4 elements on L=6)
    let mid_node = n_elem / 2 + 1; // node 3

    // Case 1: P = -10 kN at midspan
    let input1 = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );
    let res1 = linear::solve_2d(&input1).unwrap();
    let uy1 = res1.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Case 2: P = -20 kN at midspan
    let input2 = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -20.0, mz: 0.0,
        })],
    );
    let res2 = linear::solve_2d(&input2).unwrap();
    let uy2 = res2.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    let ratio = uy2 / uy1;
    assert_close(ratio, 2.0, 0.02, "displacement ratio (2x load)");
}

// ---------------------------------------------------------------------------
// Test 2: Linear proportionality — double load doubles reactions
// ---------------------------------------------------------------------------
#[test]
fn linear_proportionality_double_load_doubles_reactions() {
    let l = 6.0;
    let n_elem = 4;
    let mid_node = n_elem / 2 + 1;

    // Case 1: P = -10 kN
    let input1 = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );
    let res1 = linear::solve_2d(&input1).unwrap();
    let ry_a1 = res1.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;

    // Case 2: P = -20 kN
    let input2 = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -20.0, mz: 0.0,
        })],
    );
    let res2 = linear::solve_2d(&input2).unwrap();
    let ry_a2 = res2.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;

    let ratio = ry_a2 / ry_a1;
    assert_close(ratio, 2.0, 0.02, "reaction ratio (2x load)");
}

// ---------------------------------------------------------------------------
// Test 3: Cantilever bending stiffness k = 3EI/L³
// ---------------------------------------------------------------------------
#[test]
fn cantilever_bending_stiffness() {
    let l = 4.0;
    let n_elem = 4;
    let tip_node = n_elem + 1; // node 5
    let p = -10.0; // kN downward

    let input = make_beam(
        n_elem, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let uy_tip = res.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy;

    // Analytical: delta = P*L^3 / (3*E*I)
    let ei = E_EFF * IZ;
    let delta_analytical = p * l.powi(3) / (3.0 * ei);

    // k_analytical = 3*EI / L^3
    let k_analytical = 3.0 * ei / l.powi(3);
    let k_fem = p / uy_tip;

    assert_close(uy_tip, delta_analytical, 0.02, "cantilever tip deflection");
    assert_close(k_fem, k_analytical, 0.02, "cantilever bending stiffness k=3EI/L^3");
}

// ---------------------------------------------------------------------------
// Test 4: Axial spring stiffness k = EA/L
// ---------------------------------------------------------------------------
#[test]
fn axial_spring_stiffness() {
    let l = 5.0;
    let fx_applied = 100.0; // kN tension

    // Two nodes along X-axis, one frame element
    // Node 1: pinned (ux, uy restrained)
    // Node 2: rollerX (uy restrained, ux free)
    // Apply fx at node 2
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: fx_applied, fy: 0.0, mz: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let ux_tip = res.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Analytical: delta = P*L / (E*A)
    let ea = E_EFF * A;
    let delta_analytical = fx_applied * l / ea;

    assert_close(ux_tip, delta_analytical, 0.02, "axial displacement PL/(EA)");

    // Verify stiffness: k = EA/L
    let k_analytical = ea / l;
    let k_fem = fx_applied / ux_tip;
    assert_close(k_fem, k_analytical, 0.02, "axial stiffness EA/L");
}

// ---------------------------------------------------------------------------
// Test 5: Rotational stiffness at fixed end — k_rot = EI/L
// ---------------------------------------------------------------------------
#[test]
fn rotational_stiffness_cantilever_tip_moment() {
    let l = 4.0;
    let n_elem = 4;
    let tip_node = n_elem + 1;
    let m_applied = 10.0; // kN·m at tip

    let input = make_beam(
        n_elem, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: 0.0, mz: m_applied,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let rz_tip = res.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().rz;

    // Analytical: theta_tip = M*L / (EI)
    let ei = E_EFF * IZ;
    let theta_analytical = m_applied * l / ei;

    assert_close(rz_tip, theta_analytical, 0.02, "cantilever tip rotation ML/(EI)");

    // k_rot = M / theta = EI / L
    let k_rot_analytical = ei / l;
    let k_rot_fem = m_applied / rz_tip;
    assert_close(k_rot_fem, k_rot_analytical, 0.02, "rotational stiffness EI/L");
}

// ---------------------------------------------------------------------------
// Test 6: Flexibility matrix symmetry (Maxwell's reciprocal theorem)
// ---------------------------------------------------------------------------
#[test]
fn flexibility_matrix_symmetry_maxwell() {
    let l = 8.0;
    let n_elem = 4;
    // Nodes: 1(0), 2(2), 3(4), 4(6), 5(8)
    // Apply unit load at node 2, measure delta at node 4 -> f_24
    // Apply unit load at node 4, measure delta at node 2 -> f_42
    let p = 1.0; // unit load

    // Case A: load at node 2
    let input_a = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_a = linear::solve_2d(&input_a).unwrap();
    let f_24 = res_a.displacements.iter()
        .find(|d| d.node_id == 4).unwrap().uy;

    // Case B: load at node 4
    let input_b = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_b = linear::solve_2d(&input_b).unwrap();
    let f_42 = res_b.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    // Maxwell's theorem: f_24 == f_42
    assert_close(f_24, f_42, 0.02, "Maxwell reciprocal theorem f_24 = f_42");
}

// ---------------------------------------------------------------------------
// Test 7: Unit load theorem — UDL midspan deflection vs analytical
// ---------------------------------------------------------------------------
#[test]
fn udl_midspan_deflection_analytical() {
    let l = 6.0;
    let n_elem = 4;
    let q = -10.0; // kN/m downward
    let mid_node = n_elem / 2 + 1; // node 3

    let input = make_ss_beam_udl(n_elem, l, E, A, IZ, q);
    let res = linear::solve_2d(&input).unwrap();
    let uy_mid = res.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Analytical: delta = 5*q*L^4 / (384*EI)
    let ei = E_EFF * IZ;
    let delta_analytical = 5.0 * q * l.powi(4) / (384.0 * ei);

    assert_close(uy_mid, delta_analytical, 0.05, "UDL midspan deflection 5qL^4/(384EI)");
}

// ---------------------------------------------------------------------------
// Test 8: Portal frame lateral stiffness linearity
// ---------------------------------------------------------------------------
#[test]
fn portal_frame_lateral_stiffness_linearity() {
    let h = 4.0;
    let w = 6.0;

    // Case 1: H = 10 kN lateral
    let input1 = make_portal_frame(h, w, E, A, IZ, 10.0, 0.0);
    let res1 = linear::solve_2d(&input1).unwrap();
    // Sway = ux at top of left column (node 2)
    let ux1 = res1.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let k1 = 10.0 / ux1;

    // Case 2: H = 20 kN lateral
    let input2 = make_portal_frame(h, w, E, A, IZ, 20.0, 0.0);
    let res2 = linear::solve_2d(&input2).unwrap();
    let ux2 = res2.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let k2 = 20.0 / ux2;

    // Linear elastic => k1 == k2
    assert_close(k1, k2, 0.02, "portal frame lateral stiffness k1 = k2");

    // Also verify displacement doubles
    let ratio = ux2 / ux1;
    assert_close(ratio, 2.0, 0.02, "portal frame sway ratio (2x load)");
}
