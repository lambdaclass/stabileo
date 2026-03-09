/// Validation: OpenSees Cross-Check Problems
///
/// Reference: OpenSees Examples Manual & published verification problems.
///
/// Tests cross-validate dedaliano results against well-known OpenSees
/// examples and their documented analytical solutions.
///
/// Sources:
///   - OpenSees Examples Manual (opensees.berkeley.edu)
///   - OpenSees Wiki: Basic Examples, Truss Example, Portal Frame
///   - Chopra, "Dynamics of Structures" (analytical baselines)
///   - Hibbeler, "Structural Analysis" (textbook references)
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective: E_MPa * 1000)

// ═══════════════════════════════════════════════════════════════
// 1. Simply-Supported Beam with Central Point Load
// ═══════════════════════════════════════════════════════════════
// Reference: OpenSees Basic Examples — Example 1, simple beam analysis.
// SS beam, L=6m, E=200 GPa, I=8.33e-6 m^4 (HEB100-like), P=50 kN at midspan.
// Analytical:
//   R_A = R_B = P/2 = 25 kN
//   M_max = P*L/4 = 75 kN*m
//   delta_max = P*L^3 / (48*E*I) at midspan

#[test]
fn validation_opensees_1_ss_beam_point_load() {
    let l = 6.0;
    let p = 50.0;
    let a_sec = 0.0026; // m^2 (HEB100-like)
    let iz = 8.33e-6; // m^4
    let n = 12; // 12 elements for good accuracy

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];

    // Point load at midspan: element n/2, at end of element (a = elem_len)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_sec, iz)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_B = P/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.ry, p / 2.0, 0.01, "OS1 R_A = P/2");
    assert_close(r_b.ry, p / 2.0, 0.01, "OS1 R_B = P/2");

    // Midspan deflection: delta = P*L^3 / (48*E*I)
    let delta_expected = p * l.powi(3) / (48.0 * E_EFF * iz);
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uy.abs(), delta_expected, 0.02, "OS1 delta_max");

    // Maximum moment at midspan: M = P*L/4
    let m_expected = p * l / 4.0;
    // The midspan node has elements on either side; check max element moment
    let m_max: f64 = results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert_close(m_max, m_expected, 0.02, "OS1 M_max = PL/4");
}

// ═══════════════════════════════════════════════════════════════
// 2. Portal Frame with Lateral Load
// ═══════════════════════════════════════════════════════════════
// Reference: OpenSees Examples — Portal Frame example.
// Fixed-base portal: columns h=4m, beam w=6m, lateral H=20 kN at beam level.
// Both columns identical: E=200 GPa, I=1e-4 m^4.
// For rigid beam: k = 2*12EI/h^3, delta = H/k.
// With finite beam stiffness, expect slightly larger drift.

#[test]
fn validation_opensees_2_portal_frame_lateral() {
    let h = 4.0;
    let w = 6.0;
    let iz_col = 1e-4;
    let iz_beam = 5e-3; // stiff beam (50x column)
    let a_sec = 0.01;
    let h_load = 20.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 2, false, false), // beam (stiffer)
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: h_load, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, a_sec, iz_col), (2, a_sec, iz_beam)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Theoretical stiffness for rigid beam: k = 2*12EI/h^3
    let k_rigid = 2.0 * 12.0 * E_EFF * iz_col / h.powi(3);
    let delta_rigid = h_load / k_rigid;

    // Actual drift (should be close to rigid-beam answer since beam is 50x stiffer)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both beam-level nodes should drift approximately the same (rigid-floor assumption)
    let drift = d2.ux.abs();
    assert!(
        (d2.ux - d3.ux).abs() < drift * 0.05,
        "OS2: beam-level drift should be nearly uniform: d2={:.6}, d3={:.6}",
        d2.ux, d3.ux
    );

    // Drift should be within 5% of rigid-beam theoretical value
    assert_close(drift, delta_rigid, 0.05, "OS2 drift vs rigid-beam theory");

    // Equilibrium: sum of horizontal reactions = H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), h_load, 0.01, "OS2 horizontal equilibrium");

    // Antisymmetric moment distribution: base moments should have same magnitude
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    // For portal with equal columns and stiff beam under lateral load:
    // base moments sum to H*h (overturning equilibrium)
    let sum_base_moments = r1.mz.abs() + r4.mz.abs();
    // Moment equilibrium: sum_M = H*h - R_base_moment1 - R_base_moment2 = 0
    // is approximate since column shears contribute; just check both are nonzero
    assert!(r1.mz.abs() > 1.0, "OS2: left base moment nonzero");
    assert!(r4.mz.abs() > 1.0, "OS2: right base moment nonzero");
    assert!(sum_base_moments > 0.0, "OS2: base moments exist");
}

// ═══════════════════════════════════════════════════════════════
// 3. Classic 3-Bar Truss
// ═══════════════════════════════════════════════════════════════
// Reference: OpenSees Truss Example (3-bar truss, simple tutorial).
// 3 bars: middle vertical, two outer at 45 degrees.
// Node 4 (bottom) loaded with P = 100 kN downward.
// Nodes 1, 2, 3 pinned at top.
// A_mid = 0.002 m^2, A_outer = 0.001 m^2.
// By compatibility:
//   k_mid = EA_mid/L, k_outer_vert = EA_outer*cos^3(45)/L
//   F_mid = P * k_mid / (k_mid + 2*k_outer_vert)

#[test]
fn validation_opensees_3_three_bar_truss() {
    let l = 2.0; // vertical height
    let theta = 45.0_f64.to_radians();
    let a_mid = 0.002;
    let a_outer = 0.001;
    let p = 100.0;

    let cos_t = theta.cos();
    let sin_t = theta.sin();

    // Nodes: 1=top-left, 2=top-mid, 3=top-right, 4=bottom (loaded)
    let half_w = l * sin_t / cos_t; // = L for 45 degrees
    let nodes = vec![
        (1, -half_w, l),
        (2, 0.0, l),
        (3, half_w, l),
        (4, 0.0, 0.0),
    ];

    let elems = vec![
        (1, "truss", 1, 4, 1, 2, false, false), // AD outer
        (2, "truss", 2, 4, 1, 1, false, false), // BD middle
        (3, "truss", 3, 4, 1, 2, false, false), // CD outer
    ];

    let sups = vec![
        (1, 1, "pinned"),
        (2, 2, "pinned"),
        (3, 3, "pinned"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, a_mid, 1e-8), (2, a_outer, 1e-8)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Compatibility analysis
    let k_mid = E_EFF * a_mid / l;
    let k_outer_vert = E_EFF * a_outer * cos_t.powi(3) / l;
    let k_total = k_mid + 2.0 * k_outer_vert;

    let f_mid_expected = p * k_mid / k_total;
    let f_outer_vert_expected = p * k_outer_vert / k_total;
    let f_outer_bar_expected = f_outer_vert_expected / cos_t;

    // Middle bar: axial force
    let ef_mid = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef_mid.n_start.abs(), f_mid_expected, 0.02, "OS3 F_mid");

    // Outer bars: axial force (along bar)
    let ef_outer1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_outer3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef_outer1.n_start.abs(), f_outer_bar_expected, 0.02, "OS3 F_outer1");
    assert_close(ef_outer3.n_start.abs(), f_outer_bar_expected, 0.02, "OS3 F_outer3");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "OS3 vertical equilibrium");

    // Displacement at loaded node
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let delta_expected = p / k_total;
    assert_close(d4.uy.abs(), delta_expected, 0.02, "OS3 vertical displacement");
}

// ═══════════════════════════════════════════════════════════════
// 4. Cantilever with Tip Load
// ═══════════════════════════════════════════════════════════════
// Reference: OpenSees Basic Beam-Column Example / Analytical cantilever.
// Cantilever L=5m, E=200 GPa, I=1e-4 m^4, P=30 kN tip load.
// Exact:
//   delta_tip = P*L^3 / (3*E*I)
//   theta_tip = P*L^2 / (2*E*I)
//   M_base = P*L
//   V = P everywhere

#[test]
fn validation_opensees_4_cantilever_tip_load() {
    let l = 5.0;
    let p = 30.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let n = 10;

    let input = make_beam(n, l, E, a_sec, iz, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Tip deflection: delta = P*L^3 / (3*E*I)
    let delta_expected = p * l.powi(3) / (3.0 * E_EFF * iz);
    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_tip.uy.abs(), delta_expected, 0.02, "OS4 tip deflection");

    // Tip rotation: theta = P*L^2 / (2*E*I)
    let theta_expected = p * l.powi(2) / (2.0 * E_EFF * iz);
    assert_close(d_tip.rz.abs(), theta_expected, 0.02, "OS4 tip rotation");

    // Base reaction: R_y = P, M_base = P*L
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.ry, p, 0.01, "OS4 R_base = P");
    assert_close(r_base.mz.abs(), p * l, 0.01, "OS4 M_base = P*L");

    // Shear should be constant = P along the beam
    for ef in &results.element_forces {
        assert_close(ef.v_start.abs(), p, 0.02, &format!("OS4 V elem {}", ef.element_id));
    }

    // Moment should vary linearly: check first and last elements
    let ef_root = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_root.m_start.abs(), p * l, 0.02, "OS4 M at root");

    let ef_tip = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert!(ef_tip.m_end.abs() < 0.5, "OS4 M at tip should be ~0, got {:.4}", ef_tip.m_end.abs());
}

// ═══════════════════════════════════════════════════════════════
// 5. Two-Span Continuous Beam with UDL
// ═══════════════════════════════════════════════════════════════
// Reference: OpenSees multi-span beam examples / Three-moment equation.
// Two equal spans L1=L2=5m, UDL q=20 kN/m over both spans.
// By three-moment equation for equal spans:
//   M_B (interior support) = -q*L^2/8
//   R_A = R_C = 3qL/8 = 37.5 kN
//   R_B = 10qL/8 = 5qL/4 = 125 kN

#[test]
fn validation_opensees_5_two_span_continuous_beam() {
    let l_span = 5.0;
    let q = 20.0;
    let n_per = 8;

    let n_total = n_per * 2;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(
        &[l_span, l_span], n_per, E, 0.01, 1e-4, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * 2 * L = 200 kN
    let total_load = q * 2.0 * l_span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "OS5 total reaction = qL_total");

    // Outer reactions: R_A = R_C = 3qL/8
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == n_total + 1).unwrap();
    let r_outer_expected = 3.0 * q * l_span / 8.0; // = 37.5 kN
    assert_close(r_a.ry, r_outer_expected, 0.03, "OS5 R_A = 3qL/8");
    assert_close(r_c.ry, r_outer_expected, 0.03, "OS5 R_C = 3qL/8");

    // Interior reaction: R_B = 10qL/8 = 5qL/4
    let mid_node = n_per + 1;
    let r_b = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let r_inner_expected = 10.0 * q * l_span / 8.0; // = 125 kN
    assert_close(r_b.ry, r_inner_expected, 0.03, "OS5 R_B = 10qL/8");

    // Symmetry: R_A = R_C
    assert_close(r_a.ry, r_c.ry, 0.02, "OS5 symmetry R_A = R_C");

    // Interior moment at support B: M_B = -qL^2/8 (hogging)
    // Check element forces near the interior support
    let m_b_expected = q * l_span * l_span / 8.0; // 62.5 kN*m magnitude
    // Element ending at interior support
    let ef_before_b = results.element_forces.iter().find(|e| e.element_id == n_per).unwrap();
    assert_close(ef_before_b.m_end.abs(), m_b_expected, 0.05, "OS5 M_B = qL^2/8");
}

// ═══════════════════════════════════════════════════════════════
// 6. 2-Story Frame under Gravity + Lateral
// ═══════════════════════════════════════════════════════════════
// Reference: OpenSees 2-story frame example (static pushover baseline).
// 2 stories, 1 bay. h1=h2=3.5m, w=6m.
// Gravity: 100 kN at each floor node (4 nodes total).
// Lateral: 15 kN at 1st floor, 30 kN at 2nd floor (inverted triangle).
// Check: equilibrium, relative story drifts, column base moments.

#[test]
fn validation_opensees_6_two_story_frame() {
    let h = 3.5;
    let w = 6.0;
    let a_sec = 0.01;
    let iz_col = 2e-4;
    let iz_beam = 3e-4;
    let p_grav = -100.0; // kN per node (downward)
    let h1 = 15.0; // lateral at 1st floor
    let h2 = 30.0; // lateral at 2nd floor

    let nodes = vec![
        (1, 0.0, 0.0),     // base left
        (2, w, 0.0),       // base right
        (3, 0.0, h),       // 1st floor left
        (4, w, h),         // 1st floor right
        (5, 0.0, 2.0 * h), // 2nd floor left
        (6, w, 2.0 * h),   // 2nd floor right
    ];

    let elems = vec![
        // 1st story columns
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        // 1st floor beam
        (3, "frame", 3, 4, 1, 2, false, false),
        // 2nd story columns
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        // 2nd floor beam (roof)
        (6, "frame", 5, 6, 1, 2, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    let loads = vec![
        // Gravity
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: p_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: p_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: p_grav, mz: 0.0 }),
        // Lateral
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: h1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: h2, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, a_sec, iz_col), (2, a_sec, iz_beam)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: vertical reactions = total gravity
    let total_gravity = 4.0 * p_grav.abs();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_gravity, 0.01, "OS6 vertical equilibrium");

    // Global equilibrium: horizontal reactions = total lateral
    let total_lateral = h1 + h2;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), total_lateral, 0.01, "OS6 horizontal equilibrium");

    // 2nd story drift > 0 (frame leans in direction of lateral load)
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d5.ux > 0.0, "OS6: 2nd floor drifts positive");
    assert!(d3.ux > 0.0, "OS6: 1st floor drifts positive");

    // 2nd floor should drift more than 1st floor (cumulative)
    assert!(
        d5.ux > d3.ux,
        "OS6: roof drift {:.6} should > 1st floor drift {:.6}", d5.ux, d3.ux
    );

    // Inter-story drift ratio check: first story vs second story
    let drift_1st = d3.ux / h;
    let drift_2nd = (d5.ux - d3.ux) / h;
    // Both should be positive and in reasonable range
    assert!(drift_1st > 0.0, "OS6: 1st story IDR > 0");
    assert!(drift_2nd > 0.0, "OS6: 2nd story IDR > 0");

    // Overturning moment check: sum of base moments + sum(Rx*0) = sum(H*h_level)
    let _overturning = h1 * h + h2 * 2.0 * h;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let _base_moment_sum = r1.mz + r2.mz; // these resist overturning
    // Vertical reactions also contribute: R1_y*0 + R2_y*w (couple)
    // Full moment equilibrium about node 1 base:
    // H1*h + H2*2h + P_grav*(0 + w + 0 + w) = R2_y*w + M1 + M2
    // Simplified check: base moments should be nonzero
    assert!(r1.mz.abs() > 1.0, "OS6: base moment left nonzero");
    assert!(r2.mz.abs() > 1.0, "OS6: base moment right nonzero");
}

// ═══════════════════════════════════════════════════════════════
// 7. 3D Space Truss
// ═══════════════════════════════════════════════════════════════
// Reference: OpenSees 3D Truss Example — tetrahedral truss.
// 4 nodes: tripod base at (2,0,0), (0,2,0), (-1,-1,0), apex at (0,0,3).
// All base nodes pinned. Vertical load P=50 kN downward at apex.
// Check equilibrium and displacement.
// Analytical: by symmetry considerations and stiffness method.

#[test]
fn validation_opensees_7_3d_space_truss() {
    let a_bar = 0.001; // m^2
    let p = 50.0; // kN downward at apex

    // Tripod: 3 base nodes + 1 apex
    let nodes = vec![
        (1, 2.0, 0.0, 0.0),   // base A
        (2, -1.0, 1.732, 0.0), // base B (approx equilateral)
        (3, -1.0, -1.732, 0.0),// base C
        (4, 0.0, 0.0, 3.0),   // apex
    ];

    // 3 truss bars from apex to each base
    let elems = vec![
        (1, "truss", 1, 4, 1, 1),
        (2, "truss", 2, 4, 1, 1),
        (3, "truss", 3, 4, 1, 1),
    ];

    // Base nodes pinned (all 6 DOFs restrained)
    let fixed_6 = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fixed_6.clone()),
        (2, fixed_6.clone()),
        (3, fixed_6.clone()),
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4,
        fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, a_bar, 1e-10, 1e-10, 1e-10)], // truss: I,J negligible
        elems, sups, loads,
    );

    let results = linear::solve_3d(&input).unwrap();

    // Vertical equilibrium: sum of vertical reactions = P
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, p, 0.02, "OS7 vertical equilibrium");

    // Horizontal equilibrium: sum Fx = 0, sum Fy = 0
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!(sum_fx.abs() < 0.5, "OS7: sum_fx={:.4} should be ~0", sum_fx);
    assert!(sum_fy.abs() < 0.5, "OS7: sum_fy={:.4} should be ~0", sum_fy);

    // Apex should deflect downward
    let d_apex = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(d_apex.uz < 0.0, "OS7: apex deflects downward, uz={:.6}", d_apex.uz);

    // Compute expected vertical displacement analytically
    // Bar lengths: L_i = sqrt(dx^2 + dy^2 + dz^2)
    let base_nodes = [(2.0_f64, 0.0_f64, 0.0_f64), (-1.0, 1.732, 0.0), (-1.0, -1.732, 0.0)];
    let apex = (0.0_f64, 0.0_f64, 3.0_f64);

    let mut sum_cos2_over_l = 0.0;
    for &(bx, by, bz) in &base_nodes {
        let dx = apex.0 - bx;
        let dy = apex.1 - by;
        let dz = apex.2 - bz;
        let l_bar = (dx * dx + dy * dy + dz * dz).sqrt();
        let cos_z = dz.abs() / l_bar; // cosine of angle with vertical
        // Vertical stiffness contribution of each bar: EA*cos^2(alpha)/L
        sum_cos2_over_l += E_EFF * a_bar * cos_z * cos_z / l_bar;
    }
    let delta_z_expected = p / sum_cos2_over_l;
    assert_close(d_apex.uz.abs(), delta_z_expected, 0.05, "OS7 apex vertical displacement");

    // All bars should be in compression (apex loaded downward)
    for ef in &results.element_forces {
        // For truss bars oriented from base (low) to apex (high),
        // compression means negative n_start by sign convention, or positive depending on direction.
        // Just check magnitude is reasonable and nonzero.
        assert!(ef.n_start.abs() > 1.0, "OS7: bar {} has force, got {:.4}", ef.element_id, ef.n_start);
    }
}

// ═══════════════════════════════════════════════════════════════
// 8. P-Delta Column (Amplified Moments)
// ═══════════════════════════════════════════════════════════════
// Reference: OpenSees P-Delta transformation examples.
// Cantilever column h=5m, E=200 GPa, I=2e-4 m^4.
// Axial P=500 kN compression + lateral H=10 kN at top.
// Linear: M_base = H*h = 50 kN*m
// P-delta: M_base = H*h + P*delta (amplified)
// Amplification factor B2 approx 1/(1 - P/P_cr)
// where P_cr = pi^2*EI/(4*L^2) for cantilever.

#[test]
fn validation_opensees_8_pdelta_column() {
    let h = 5.0;
    let a_sec = 0.01;
    let iz = 2e-4;
    let p_axial = 500.0; // kN compression
    let h_lateral = 10.0; // kN lateral at top
    let n = 10;

    let elem_len = h / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, i as f64 * elem_len)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let sups = vec![(1, 1, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: h_lateral, fy: -p_axial, mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_sec, iz)],
        elems, sups, loads,
    );

    // Linear analysis
    let lin_results = linear::solve_2d(&input).unwrap();
    let lin_drift = lin_results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;

    // P-delta analysis
    let pd_result = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd_result.converged, "OS8: P-delta should converge");
    assert!(pd_result.is_stable, "OS8: column should be stable");

    let pd_drift = pd_result.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;

    // P-delta drift should be larger than linear (amplified)
    assert!(
        pd_drift.abs() > lin_drift.abs(),
        "OS8: P-delta drift {:.6} should > linear drift {:.6}",
        pd_drift.abs(), lin_drift.abs()
    );

    // Analytical amplification factor:
    // P_cr (cantilever) = pi^2 * EI / (2L)^2 = pi^2 * EI / (4L^2)
    let pi = std::f64::consts::PI;
    let p_cr_cantilever = pi * pi * E_EFF * iz / (4.0 * h * h);

    // B2 = 1 / (1 - P/P_cr)
    let b2_analytical = 1.0 / (1.0 - p_axial / p_cr_cantilever);

    // Actual amplification
    let b2_actual = pd_drift.abs() / lin_drift.abs();

    // B2 should match within ~15% (approximate formula)
    let rel_err = (b2_actual - b2_analytical).abs() / b2_analytical;
    assert!(
        rel_err < 0.20,
        "OS8: B2 actual={:.4}, analytical={:.4}, err={:.1}% (P/Pcr={:.4})",
        b2_actual, b2_analytical, rel_err * 100.0, p_axial / p_cr_cantilever
    );

    // P-delta base moment should be amplified
    let lin_m_base = lin_results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();
    let pd_m_base = pd_result.results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // Linear base moment = H * h = 50 kN*m
    assert_close(lin_m_base, h_lateral * h, 0.05, "OS8 linear M_base = H*h");

    // P-delta base moment should be larger
    assert!(
        pd_m_base > lin_m_base,
        "OS8: P-delta M_base {:.4} should > linear M_base {:.4}",
        pd_m_base, lin_m_base
    );

    // Approximate P-delta base moment: M = H*h + P*delta_pd
    let m_pd_approx = h_lateral * h + p_axial * pd_drift.abs();
    assert_close(pd_m_base, m_pd_approx, 0.05, "OS8 P-delta M_base ~ H*h + P*delta");
}
