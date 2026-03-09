/// Validation: Extended Force-Displacement Relationships
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Roark's Formulas for Stress and Strain, 8th Ed.
///
/// Tests:
///   1. Superposition — midspan deflection from two independent loads equals combined
///   2. Fixed-fixed beam point load stiffness k = 192EI/L^3
///   3. Propped cantilever tip load: delta = PL^3/(48EI) * 5
///   4. Two-span continuous beam — reaction at interior support via three-moment equation
///   5. Truss bar elongation under axial load (inclined member)
///   6. Cantilever UDL tip rotation: theta = qL^3/(6EI)
///   7. Simply-supported beam end rotation under midspan point load: theta = PL^2/(16EI)
///   8. Portal frame global equilibrium under lateral load

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
// Test 1: Superposition — combined load deflection equals sum of individual
// ---------------------------------------------------------------------------
//
// A simply-supported beam with two different point loads applied separately
// should produce deflections that add up to the combined case.
// This validates the principle of superposition in the linear solver.
#[test]
fn superposition_combined_load_equals_sum_of_individual() {
    let l = 8.0;
    let n_elem = 8;
    let mid_node = n_elem / 2 + 1; // node 5

    let p1 = -12.0; // kN at midspan
    let p2 = -8.0;  // kN at quarter-span (node 3)
    let quarter_node = n_elem / 4 + 1; // node 3

    // Case A: only P1 at midspan
    let input_a = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: p1, mz: 0.0,
        })],
    );
    let res_a = linear::solve_2d(&input_a).unwrap();
    let uy_mid_a = res_a.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Case B: only P2 at quarter span
    let input_b = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: quarter_node, fx: 0.0, fy: p2, mz: 0.0,
        })],
    );
    let res_b = linear::solve_2d(&input_b).unwrap();
    let uy_mid_b = res_b.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Case C: both loads simultaneously
    let input_c = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_node, fx: 0.0, fy: p1, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: quarter_node, fx: 0.0, fy: p2, mz: 0.0,
            }),
        ],
    );
    let res_c = linear::solve_2d(&input_c).unwrap();
    let uy_mid_c = res_c.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Superposition: uy_mid_a + uy_mid_b == uy_mid_c
    let sum = uy_mid_a + uy_mid_b;
    assert_close(uy_mid_c, sum, 0.02, "superposition of midspan deflections");
}

// ---------------------------------------------------------------------------
// Test 2: Fixed-fixed beam center point load stiffness k = 192EI/L^3
// ---------------------------------------------------------------------------
//
// A beam fixed at both ends with a midspan point load has stiffness
// k = P/delta = 192*EI/L^3, which is 4x stiffer than the SS case.
// Reference: Timoshenko, Table of Beam Deflections.
#[test]
fn fixed_fixed_beam_center_point_stiffness() {
    let l = 6.0;
    let n_elem = 8;
    let mid_node = n_elem / 2 + 1;
    let p: f64 = -15.0;

    let input = make_beam(
        n_elem, l, E, A, IZ,
        "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let uy_mid = res.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Analytical: delta = P*L^3 / (192*EI)
    let ei = E_EFF * IZ;
    let delta_analytical = p * l.powi(3) / (192.0 * ei);
    let k_analytical = 192.0 * ei / l.powi(3);
    let k_fem = p / uy_mid;

    assert_close(uy_mid, delta_analytical, 0.02, "fixed-fixed midspan deflection PL^3/(192EI)");
    assert_close(k_fem, k_analytical, 0.02, "fixed-fixed stiffness 192EI/L^3");
}

// ---------------------------------------------------------------------------
// Test 3: Propped cantilever with tip load — delta = 5PL^3/(48EI)
// ---------------------------------------------------------------------------
//
// Fixed at left, roller at right, point load P at the roller end.
// Wait — that would be zero displacement. Instead: propped cantilever
// with point load at midspan.
// Fixed at A, roller at B. Load P at midspan.
// delta_mid = 7PL^3/(768EI). But let's use the simpler case:
//
// Propped cantilever (fixed at A, roller at B) with P at free end (B):
// delta_B = 0 (roller), but max deflection occurs at x ~ 0.4472L.
//
// Better: Cantilever with intermediate support (propped cantilever).
// Fixed at left end, roller at right end, load at center.
// delta_center = 7*P*L^3 / (768*EI)  (from standard tables)
#[test]
fn propped_cantilever_midspan_point_load() {
    let l = 8.0;
    let n_elem = 8;
    let mid_node = n_elem / 2 + 1; // node 5
    let p: f64 = -20.0;

    let input = make_beam(
        n_elem, l, E, A, IZ,
        "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let uy_mid = res.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Analytical: delta_center = 7*P*L^3 / (768*EI)
    // For propped cantilever (fixed-roller) with center point load
    let ei = E_EFF * IZ;
    let delta_analytical = 7.0 * p * l.powi(3) / (768.0 * ei);

    assert_close(uy_mid, delta_analytical, 0.05, "propped cantilever midspan deflection 7PL^3/(768EI)");
}

// ---------------------------------------------------------------------------
// Test 4: Two-span continuous beam — symmetry of reactions under symmetric UDL
// ---------------------------------------------------------------------------
//
// Two equal spans L, each with uniform load q. By symmetry the two end
// reactions must be equal, and the interior reaction is larger.
// Analytical (three-moment equation):
//   R_end = 3qL/8, R_center = 10qL/8 = 5qL/4
// Total = 2*(3qL/8) + 5qL/4 = 3qL/4 + 5qL/4 = 2qL (correct).
#[test]
fn two_span_continuous_beam_symmetric_udl_reactions() {
    let span = 6.0;
    let n_per_span = 4;
    let q = -10.0; // kN/m downward
    let total_elements = n_per_span * 2;

    // Build UDL loads on all elements
    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[span, span],
        n_per_span,
        E, A, IZ,
        loads,
    );
    let res = linear::solve_2d(&input).unwrap();

    // Node 1 = left end, node n_per_span+1 = interior support, node 2*n_per_span+1 = right end
    let left_node = 1;
    let center_node = n_per_span + 1; // node 5
    let right_node = 2 * n_per_span + 1; // node 9

    let ry_left = res.reactions.iter()
        .find(|r| r.node_id == left_node).unwrap().ry;
    let ry_center = res.reactions.iter()
        .find(|r| r.node_id == center_node).unwrap().ry;
    let ry_right = res.reactions.iter()
        .find(|r| r.node_id == right_node).unwrap().ry;

    // q is negative (downward), so reactions are positive (upward)
    // R_end = 3*|q|*L/8
    let r_end_analytical = 3.0 * q.abs() * span / 8.0;
    // R_center = 10*|q|*L/8 = 5*|q|*L/4
    let r_center_analytical = 10.0 * q.abs() * span / 8.0;

    assert_close(ry_left, r_end_analytical, 0.03, "two-span left reaction 3qL/8");
    assert_close(ry_right, r_end_analytical, 0.03, "two-span right reaction 3qL/8");
    assert_close(ry_center, r_center_analytical, 0.03, "two-span center reaction 10qL/8");

    // Symmetry check: left and right reactions should be equal
    assert_close(ry_left, ry_right, 0.02, "two-span reaction symmetry");
}

// ---------------------------------------------------------------------------
// Test 5: Inclined truss bar elongation under axial load
// ---------------------------------------------------------------------------
//
// A single inclined bar at 45 degrees, pinned at base, loaded at top.
// The horizontal and vertical components of displacement relate to the
// axial elongation: delta_axial = F_axial * L / (EA)
// For a 45-degree bar with vertical load P:
//   Axial force = P / sin(45) (but let's just check via F*L/EA)
//   Actually: N = -P*sin(45), delta_axial = N*L/(EA)
//   Vertical disp component: uy = delta_axial * sin(45)
#[test]
fn inclined_truss_bar_elongation() {
    let angle: f64 = std::f64::consts::FRAC_PI_4; // 45 degrees
    let l = 5.0;
    let lx = l * angle.cos();
    let ly = l * angle.sin();
    let p = -20.0; // kN downward at top node

    // Node 1 at origin (pinned), Node 2 at (lx, ly) (rollerX for uy free, but
    // we need both DOFs at the free end. Use pinned at base, free at top
    // with only fy applied.)
    // Actually for a single bar, we need adequate restraints. Use:
    //   Node 1: pinned (ux=0, uy=0)
    //   Node 2: only fy applied, constrained in direction perpendicular to bar
    // Simpler: use two bars forming a simple truss (symmetric inverted V)
    // so the structure is stable.

    // Symmetric truss: Node 1 (0,0) pinned, Node 2 (2*lx, 0) pinned,
    // Node 3 (lx, ly) free with vertical load P
    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 2.0 * lx, 0.0),
            (3, lx, ly),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 3, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();

    let disp3 = res.displacements.iter()
        .find(|d| d.node_id == 3).unwrap();

    // By symmetry, ux at node 3 should be ~0
    assert!(disp3.ux.abs() < 1e-6, "symmetric truss: ux at apex should be ~0, got {}", disp3.ux);

    // Each bar carries half the vertical load: N = P/(2*sin(45))
    // (compression since P is downward and bars go upward)
    // Axial shortening of each bar: delta = |N|*L/(EA) = |P|*L/(2*sin(45)*EA)
    // Vertical displacement: uy = delta / sin(45) = |P|*L/(2*sin^2(45)*EA)
    // sin^2(45) = 0.5, so uy = |P|*L/(2*0.5*EA) = |P|*L/EA
    let ea = E_EFF * A;
    let uy_analytical = p * l / ea; // negative (downward)

    assert_close(disp3.uy, uy_analytical, 0.05, "symmetric truss apex vertical displacement");
}

// ---------------------------------------------------------------------------
// Test 6: Cantilever UDL tip rotation: theta = qL^3/(6EI)
// ---------------------------------------------------------------------------
//
// For a cantilever with uniform distributed load q, the tip rotation is:
//   theta_tip = q*L^3 / (6*EI)
// Reference: Timoshenko, standard beam table.
#[test]
fn cantilever_udl_tip_rotation() {
    let l = 5.0;
    let n_elem = 8;
    let q = -10.0; // kN/m downward
    let tip_node = n_elem + 1;

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n_elem, l, E, A, IZ, "fixed", None, loads);
    let res = linear::solve_2d(&input).unwrap();

    let rz_tip = res.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().rz;

    // Analytical: theta_tip = q*L^3 / (6*EI)
    // q is negative (downward), so rotation is negative (clockwise)
    let ei = E_EFF * IZ;
    let theta_analytical = q * l.powi(3) / (6.0 * ei);

    assert_close(rz_tip, theta_analytical, 0.03, "cantilever UDL tip rotation qL^3/(6EI)");
}

// ---------------------------------------------------------------------------
// Test 7: SS beam end rotation under midspan point load: theta = PL^2/(16EI)
// ---------------------------------------------------------------------------
//
// A simply-supported beam with center point load P has end rotations:
//   theta_A = theta_B = P*L^2 / (16*EI)
// Reference: standard beam tables (Gere & Goodno Table D-2).
#[test]
fn ss_beam_end_rotation_midspan_point_load() {
    let l = 6.0;
    let n_elem = 8;
    let mid_node = n_elem / 2 + 1;
    let p: f64 = -20.0; // kN downward

    let input = make_beam(
        n_elem, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();

    let rz_left = res.displacements.iter()
        .find(|d| d.node_id == 1).unwrap().rz;
    let rz_right = res.displacements.iter()
        .find(|d| d.node_id == n_elem + 1).unwrap().rz;

    // Analytical: theta = P*L^2 / (16*EI)
    // P is negative, so theta_left is negative (slope down to right),
    // theta_right is positive (slope up to left at the right end).
    // Actually: left end slopes downward → negative rotation,
    //           right end slopes back upward → positive rotation.
    // |theta| = |P|*L^2 / (16*EI)
    let ei = E_EFF * IZ;
    let theta_mag = p.abs() * l.powi(2) / (16.0 * ei);

    // By symmetry, magnitudes should be equal
    assert_close(rz_left.abs(), theta_mag, 0.03, "SS beam left end rotation |PL^2/(16EI)|");
    assert_close(rz_right.abs(), theta_mag, 0.03, "SS beam right end rotation |PL^2/(16EI)|");

    // And they should be equal in magnitude (antisymmetric)
    assert_close(rz_left.abs(), rz_right.abs(), 0.02, "SS beam end rotation symmetry");
}

// ---------------------------------------------------------------------------
// Test 8: Portal frame global equilibrium under lateral load
// ---------------------------------------------------------------------------
//
// A portal frame with a lateral load H applied at the beam level:
//   - Sum of horizontal reactions = -H (force equilibrium)
//   - Sum of vertical reactions = 0 (no vertical load)
//   - Sum of moments about node 1 = 0 (moment equilibrium)
//     M = x*Fy - y*Fx convention for each force/reaction
// This test verifies force and moment equilibrium of the full structure.
#[test]
fn portal_frame_global_equilibrium_lateral_load() {
    let h = 5.0; // column height
    let w = 8.0; // beam span
    let h_load = 30.0; // kN lateral at top-left

    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let res = linear::solve_2d(&input).unwrap();

    // Nodes: 1 (0,0), 2 (0,h), 3 (w,h), 4 (w,0)
    // Supports at nodes 1 and 4 (fixed)
    let r1 = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = res.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Horizontal equilibrium: rx1 + rx4 + H = 0
    let sum_rx = r1.rx + r4.rx;
    assert_close(sum_rx, -h_load, 0.02, "portal frame horizontal equilibrium sum_rx = -H");

    // Vertical equilibrium: ry1 + ry4 = 0 (no vertical loads)
    let sum_ry = r1.ry + r4.ry;
    assert!(sum_ry.abs() < 0.01,
        "portal frame vertical equilibrium: sum_ry={:.6}, expected ~0", sum_ry);

    // Moment equilibrium about node 1:
    // External: H * h (lateral load at height h, counterclockwise)
    // Reactions: mz1 + mz4 + r4.rx * 0 (at same height) + r4.ry * w
    // Sum_M_about_1 = H*h + mz1 + mz4 + r4.ry * w = 0
    // (r4.rx acts at (w,0) => moment arm for rx about (0,0) is 0 vertically
    //  and r4.ry at (w,0) => moment arm is w horizontally)
    // Moment about origin: M = x*Fy - y*Fx + Mz
    // External load (H, 0) at (0, h): M_ext = 0*0 - h*H = -H*h
    // Reactions at (0,0): M1 = r1.mz
    // Reactions at (w,0): M4 = w*r4.ry - 0*r4.rx + r4.mz = w*r4.ry + r4.mz
    let sum_m: f64 = -h_load * h + r1.mz + r4.mz + r4.ry * w;
    assert!(sum_m.abs() < 0.5,
        "portal frame moment equilibrium about node 1: sum_M={:.6}, expected ~0", sum_m);

    // Also verify sway is consistent (both top nodes move same horizontal amount)
    let ux2 = res.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux3 = res.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;
    // The beam is axially stiff, so top nodes should have nearly equal horizontal displacement
    let ratio = ux2 / ux3;
    assert_close(ratio, 1.0, 0.05, "portal frame beam-level sway consistency");
}
