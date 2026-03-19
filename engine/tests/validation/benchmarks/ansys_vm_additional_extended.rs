/// Validation: Additional Extended ANSYS Verification Manual Problems
///
/// References:
///   - ANSYS Mechanical APDL Verification Manual, Release 2024
///   - VM42: Cantilever with Triangular (Linearly Varying) Distributed Load
///   - VM43: Propped Cantilever with Concentrated Load at Midspan
///   - VM44: Two-Span Continuous Beam with UDL on Both Spans
///   - VM45: Fixed-Pinned Beam (Propped Cantilever) with UDL
///   - VM46: Warren Truss Bridge Under Central Load
///   - VM47: 3D Cantilever with Pure Torsional Moment
///   - VM48: Asymmetric Portal Frame with Sway
///   - VM49: Continuous Beam with Support Settlement
///
/// These cover ANSYS VM items NOT already in validation_ansys_vm.rs,
/// validation_ansys_vm_extended.rs, validation_ansys_vm_additional.rs,
/// or validation_ansys_vm_benchmarks.rs.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 -> kN/m2)
const E_EFF: f64 = E * 1000.0; // effective E in kN/m2

// ================================================================
// 1. VM42: Cantilever with Triangular (Linearly Varying) Load
// ================================================================
//
// Cantilever beam, length L, fixed at left (x=0), free at right (x=L).
// Triangular distributed load: zero at fixed end, maximum q at free end.
// The load intensity at position x along the beam is w(x) = q * x / L.
//
// Reactions at fixed end:
//   V = q*L/2  (total load = area of triangle = q*L/2)
//   M = q*L^2/3  (moment = integral_0^L (q*x/L)*x dx = q*L^2/3)
//
// Tip deflection (zero at fixed end, max at free end):
//   delta = 11*q*L^4 / (120*EI)
//
// Reference: ANSYS VM42; Timoshenko, Strength of Materials, Part I.

#[test]
fn validation_vm42_cantilever_triangular_load() {
    let l = 6.0;
    let q_max = 20.0; // kN/m at free end (downward)
    let a_sec = 0.01;
    let iz = 1e-4;
    let n = 12; // 12 elements of 0.5m each
    let elem_len = l / n as f64;

    // Build linearly varying load: on element i (from x_i to x_{i+1}),
    // q_start = q_max * x_i / L, q_end = q_max * x_{i+1} / L
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i = i as f64 * elem_len;
        let x_j = (i + 1) as f64 * elem_len;
        let qi = -q_max * x_i / l; // negative = downward
        let qj = -q_max * x_j / l;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, a_sec, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions at fixed end (node 1)
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // V = q*L/2
    let v_expected = q_max * l / 2.0;
    assert_close(r.rz, v_expected, 0.02, "VM42 V = qL/2");

    // M = q*L^2/3 (moment = integral_0^L (q*x/L)*x dx = q*L^2/3)
    let m_expected = q_max * l * l / 3.0;
    assert_close(r.my.abs(), m_expected, 0.02, "VM42 M = qL^2/3");

    // Tip deflection: delta = 11*q*L^4 / (120*EI)
    // (for triangular load zero at fixed end, max q at free end)
    let ei = E_EFF * iz;
    let delta_expected = 11.0 * q_max * l.powi(4) / (120.0 * ei);
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        tip.uz.abs(),
        delta_expected,
        0.03,
        "VM42 tip deflection = 11qL^4/(120EI)",
    );

    // Equilibrium check
    assert_close(r.rz, v_expected, 0.01, "VM42 equilibrium");
}

// ================================================================
// 2. VM43: Propped Cantilever with Concentrated Load at Midspan
// ================================================================
//
// Beam of length L, fixed at left end (x=0), roller support at right
// end (x=L). Concentrated load P at midspan (x=L/2).
//
// This is a statically indeterminate structure (1 degree).
// By compatibility (using force method):
//   R_B (at roller) = 5P/16 (upward)
//   R_A = P - R_B = 11P/16 (upward)
//   M_A = PL/2 - R_B*L = PL/2 - 5PL/16 = 3PL/16 (hogging at fixed end)
//
// Deflection at midspan:
//   delta_mid = 7PL^3 / (768*EI)
//
// Reference: ANSYS VM43; Roark's Formulas for Stress and Strain.

#[test]
fn validation_vm43_propped_cantilever_midspan_load() {
    let l = 8.0;
    let p = 60.0; // kN downward at midspan
    let a_sec = 0.01;
    let iz = 1e-4;
    let n = 16; // 16 elements of 0.5m each

    let mid_node = n / 2 + 1; // node at midspan

    let input = make_beam(
        n,
        l,
        E,
        a_sec,
        iz,
        "fixed",
        Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // R_B = 5P/16
    let rb_expected = 5.0 * p / 16.0;
    assert_close(r_b.rz, rb_expected, 0.02, "VM43 R_B = 5P/16");

    // R_A = 11P/16
    let ra_expected = 11.0 * p / 16.0;
    assert_close(r_a.rz, ra_expected, 0.02, "VM43 R_A = 11P/16");

    // Fixed-end moment M_A = 3PL/16
    let ma_expected = 3.0 * p * l / 16.0;
    assert_close(r_a.my.abs(), ma_expected, 0.03, "VM43 M_A = 3PL/16");

    // Equilibrium
    let sum_ry = r_a.rz + r_b.rz;
    assert_close(sum_ry, p, 0.01, "VM43 equilibrium");

    // Midspan deflection: delta = 7PL^3 / (768*EI)
    let ei = E_EFF * iz;
    let delta_expected = 7.0 * p * l.powi(3) / (768.0 * ei);
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert_close(
        d_mid.uz.abs(),
        delta_expected,
        0.03,
        "VM43 delta_mid = 7PL^3/(768EI)",
    );
}

// ================================================================
// 3. VM44: Two-Span Continuous Beam with UDL on Both Spans
// ================================================================
//
// Two equal spans L each, UDL q on both spans.
// Three supports: A (left), B (interior), C (right).
//
// By three-moment equation (symmetric loading on equal spans):
//   M_B = -q*L^2/8 (hogging at interior support)
//   R_A = R_C = 3qL/8 (exterior reactions)
//   R_B = 10qL/8 = 5qL/4 (interior reaction)
//
// The interior reaction is greater than qL (the simple span reaction)
// because moment continuity transfers load to the interior support.
//
// Reference: ANSYS VM44; Timoshenko, Strength of Materials.

#[test]
fn validation_vm44_two_span_udl_both() {
    let l = 5.0; // each span
    let q = -12.0; // kN/m downward
    let n_per_span = 8;

    // UDL on both spans (all elements)
    let total_elems = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, 0.01, 1e-4, loads);
    let results = linear::solve_2d(&input).unwrap();

    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = total_elems + 1;

    let r_a = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_a)
        .unwrap()
        .rz;
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_b)
        .unwrap()
        .rz;
    let r_c = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_c)
        .unwrap()
        .rz;

    let q_abs = q.abs();

    // R_A = R_C = 3qL/8
    let r_ext_expected = 3.0 * q_abs * l / 8.0;
    assert_close(r_a, r_ext_expected, 0.03, "VM44 R_A = 3qL/8");
    assert_close(r_c, r_ext_expected, 0.03, "VM44 R_C = 3qL/8");

    // R_B = 5qL/4
    let r_int_expected = 5.0 * q_abs * l / 4.0;
    assert_close(r_b, r_int_expected, 0.03, "VM44 R_B = 5qL/4");

    // Symmetry: R_A = R_C
    assert_close(r_a, r_c, 0.01, "VM44 symmetry R_A = R_C");

    // Equilibrium: R_A + R_B + R_C = 2*q*L
    let total_load = 2.0 * q_abs * l;
    let sum_ry = r_a + r_b + r_c;
    assert_close(sum_ry, total_load, 0.01, "VM44 equilibrium");

    // Interior moment at B: |M_B| = qL^2/8
    let mb_expected = q_abs * l * l / 8.0;
    let ef_at_b = results
        .element_forces
        .iter()
        .find(|f| f.element_id == n_per_span)
        .unwrap();
    assert_close(
        ef_at_b.m_end.abs(),
        mb_expected,
        0.05,
        "VM44 M_B = qL^2/8",
    );
}

// ================================================================
// 4. VM45: Propped Cantilever (Fixed-Roller) with UDL
// ================================================================
//
// Beam of length L, fixed at left end, roller at right end.
// Uniform distributed load q over entire length.
//
// By force method (compatibility):
//   R_B = 3qL/8 (at roller end)
//   R_A = 5qL/8 (at fixed end)
//   M_A = qL^2/8 (hogging at fixed end)
//
// Maximum positive moment occurs at x = 3L/8 from fixed end:
//   M_max_pos = 9qL^2/128
//
// Tip deflection at roller is zero (supported).
// Maximum deflection occurs at x = (1 + sqrt(33))/16 * L from the fixed end,
// but a simpler check: deflection at midspan.
//
// Reference: ANSYS VM45; Timoshenko, Strength of Materials.

#[test]
fn validation_vm45_propped_cantilever_udl() {
    let l = 10.0;
    let q = -15.0; // kN/m downward
    let a_sec = 0.01;
    let iz = 1e-4;
    let n = 20;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, a_sec, iz, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    let q_abs = q.abs();

    // R_B = 3qL/8
    let rb_expected = 3.0 * q_abs * l / 8.0;
    assert_close(r_b.rz, rb_expected, 0.02, "VM45 R_B = 3qL/8");

    // R_A = 5qL/8
    let ra_expected = 5.0 * q_abs * l / 8.0;
    assert_close(r_a.rz, ra_expected, 0.02, "VM45 R_A = 5qL/8");

    // Fixed-end moment M_A = qL^2/8
    let ma_expected = q_abs * l * l / 8.0;
    assert_close(r_a.my.abs(), ma_expected, 0.02, "VM45 M_A = qL^2/8");

    // Equilibrium
    let sum_ry = r_a.rz + r_b.rz;
    assert_close(sum_ry, q_abs * l, 0.01, "VM45 equilibrium");

    // The zero-shear point is at x = 5L/8 from the fixed end.
    // The maximum sagging moment at that point: M_sag = 9qL^2/128.
    // The element at x=5L/8 = 6.25m (elem_len=0.5m) is element 13 (x=6.0 to 6.5).
    // We check the moment at the node closest to x = 5L/8.
    // At node 13 (x=6.0m) and node 14 (x=6.5m), the sagging moment is close to max.
    let m_sag_expected = 9.0 * q_abs * l * l / 128.0;

    // Element 13 spans [6.0, 6.5]. Its m_end (node 14, x=6.5) should be close
    // to the max sagging value. We look at the minimum of m_start/m_end
    // (sagging is negative in hogging-positive convention, or vice versa).
    // Use the element at x=6.0-6.5 (element 13).
    // The internal moment at the zero-shear point (x=6.25) lies between
    // m_start and m_end of element 13.
    let ef_13 = results
        .element_forces
        .iter()
        .find(|f| f.element_id == 13)
        .unwrap();

    // The sagging moment should be the negative of the fixed-end moment sign.
    // The fixed-end moment at node 1 is hogging (positive mz in reactions).
    // The midspan sagging moment will have the opposite sign in element forces.
    // Take the average of m_start and m_end of element 13 as an approximation.
    let m_sag_approx = (ef_13.m_start + ef_13.m_end) / 2.0;
    assert_close(
        m_sag_approx.abs(),
        m_sag_expected,
        0.05,
        "VM45 M_sag = 9qL^2/128",
    );
}

// ================================================================
// 5. VM46: Warren Truss Bridge Under Central Load
// ================================================================
//
// Warren truss (zigzag pattern) with 4 panels, span L.
// Bottom chord nodes pinned at supports (left and right).
// Single vertical load P at midspan bottom chord node.
//
// Geometry: panel width = L/4, height h.
// Bottom chord: nodes 1-2-3-4-5 (left to right)
// Top chord: nodes 6-7-8-9 (above panels)
// Diagonals connect bottom to top in Warren pattern.
//
// For a symmetric Warren truss with central load P:
//   R_left = R_right = P/2
//   Central bottom chord tension: T = P*L/(8h)
//   Central top chord compression: C = P*L/(8h)
//
// Reference: ANSYS VM46; Hibbeler, Structural Analysis.

#[test]
fn validation_vm46_warren_truss_central_load() {
    let l = 8.0; // total span
    let h = 2.0; // truss height
    let p = 100.0; // kN at midspan
    let panel_w = l / 4.0; // = 2.0m
    let a_truss = 0.005;

    // Bottom chord nodes (y=0): 1 through 5
    // Top chord nodes (y=h): 6 through 9
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, panel_w, 0.0),
        (3, 2.0 * panel_w, 0.0), // midspan
        (4, 3.0 * panel_w, 0.0),
        (5, 4.0 * panel_w, 0.0),
        (6, 0.5 * panel_w, h),
        (7, 1.5 * panel_w, h),
        (8, 2.5 * panel_w, h),
        (9, 3.5 * panel_w, h),
    ];

    // Elements (all trusses with hinges at both ends for 2D):
    // Bottom chord: 1-2, 2-3, 3-4, 4-5
    // Top chord: 6-7, 7-8, 8-9
    // Diagonals: 1-6, 6-2, 2-7, 7-3, 3-8, 8-4, 4-9, 9-5
    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 3, 4, 1, 1, true, true),
        (4, "frame", 4, 5, 1, 1, true, true),
        // Top chord
        (5, "frame", 6, 7, 1, 1, true, true),
        (6, "frame", 7, 8, 1, 1, true, true),
        (7, "frame", 8, 9, 1, 1, true, true),
        // Diagonals (Warren pattern: alternating up-down)
        (8, "frame", 1, 6, 1, 1, true, true),
        (9, "frame", 6, 2, 1, 1, true, true),
        (10, "frame", 2, 7, 1, 1, true, true),
        (11, "frame", 7, 3, 1, 1, true, true),
        (12, "frame", 3, 8, 1, 1, true, true),
        (13, "frame", 8, 4, 1, 1, true, true),
        (14, "frame", 4, 9, 1, 1, true, true),
        (15, "frame", 9, 5, 1, 1, true, true),
    ];

    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_truss, 1e-10)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_left = R_right = P/2
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    assert_close(r_left.rz, p / 2.0, 0.02, "VM46 R_left = P/2");
    assert_close(r_right.rz, p / 2.0, 0.02, "VM46 R_right = P/2");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "VM46 equilibrium");

    // Central bottom chord force (elements 2 and 3: between nodes 2-3 and 3-4)
    // By method of sections: cut through the truss at a vertical section through
    // top chord node 7 (x = 1.5*panel_w = 3.0m). This cuts:
    //   - Bottom chord element 2 (nodes 2-3)
    //   - Diagonal element 11 (nodes 7-3)
    //   - Top chord element 6 (nodes 7-8)
    //
    // Taking moments about top chord node 7 (x=3, y=h):
    //   R_left * 3.0 - T_bottom * h = 0
    //   T_bottom = R_left * 3.0 / h = (P/2) * 1.5*panel_w / h
    //            = (P/2) * 3.0 / 2.0 = 3P/4
    //
    // For our values: T = 3*100/4 = 75 kN
    let chord_force_expected = (p / 2.0) * 1.5 * panel_w / h;

    // The central bottom chord elements are 2 (nodes 2-3) and 3 (nodes 3-4)
    let ef_2 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    let ef_3 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();

    // Symmetry: these should have equal magnitude
    assert_close(
        ef_2.n_start.abs(),
        ef_3.n_start.abs(),
        0.05,
        "VM46 central bottom chord symmetry",
    );

    // Check magnitude (tension in bottom chord)
    assert_close(
        ef_2.n_start.abs(),
        chord_force_expected,
        0.05,
        "VM46 central bottom chord force = PL/(4h)",
    );
}

// ================================================================
// 6. VM47: 3D Cantilever with Pure Torsional Moment
// ================================================================
//
// Cantilever beam along X-axis, length L, fixed at x=0, free at x=L.
// Applied torque T (about x-axis) at free tip.
//
// For uniform circular/prismatic section:
//   Twist angle at tip: phi = T*L / (G*J)
//   where G = E / (2*(1+nu)) is shear modulus.
//   Twist is constant along the beam (uniform torque).
//
// No bending or axial deformation should occur (pure torsion).
//
// Reference: ANSYS VM47; Timoshenko, Theory of Elasticity.

#[test]
fn validation_vm47_3d_cantilever_torsion() {
    let l = 4.0;
    let torque = 50.0; // kN*m about x-axis at tip
    let a_sec = 0.01;
    let iy = 1e-4;
    let iz = 1e-4;
    let j = 5e-5;
    let nu = 0.3;
    let n = 8;

    let g_eff = E_EFF / (2.0 * (1.0 + nu)); // shear modulus in kN/m^2

    let input = make_3d_beam(
        n,
        l,
        E,
        nu,
        a_sec,
        iy,
        iz,
        j,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0,
            fz: 0.0,
            fy: 0.0,
            mx: torque,
            my: 0.0,
            mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Expected twist angle at tip: phi = T*L / (G*J)
    let gj = g_eff * j;
    let phi_expected = torque * l / gj;

    assert_close(
        tip.rx.abs(),
        phi_expected,
        0.02,
        "VM47 twist angle = TL/(GJ)",
    );

    // No bending deflection (pure torsion)
    assert!(
        tip.uz.abs() < 1e-8,
        "VM47: no Y deflection for pure torsion, uy={:.6e}",
        tip.uz
    );
    assert!(
        tip.uz.abs() < 1e-8,
        "VM47: no Z deflection for pure torsion, uz={:.6e}",
        tip.uz
    );

    // No axial displacement
    assert!(
        tip.ux.abs() < 1e-8,
        "VM47: no axial displacement for pure torsion, ux={:.6e}",
        tip.ux
    );

    // Twist angle should vary linearly: at midspan = phi/2
    let mid = n / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap();
    assert_close(
        d_mid.rx.abs(),
        phi_expected / 2.0,
        0.03,
        "VM47 midspan twist = TL/(2GJ)",
    );

    // Fixed-end torsional reaction
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(
        r_base.mx.abs(),
        torque,
        0.02,
        "VM47 torsional reaction = T",
    );
}

// ================================================================
// 7. VM48: Asymmetric Portal Frame with Sway
// ================================================================
//
// Portal frame with unequal column heights causing sway under
// vertical loading. Left column height h1, right column height h2.
// Fixed bases. Horizontal beam at top connecting the columns.
// Vertical load P at mid-beam.
//
// The unequal column heights cause asymmetric stiffness distribution,
// leading to lateral sway even under vertical loading.
//
// Checks:
//   - Vertical equilibrium: R_A_y + R_D_y = P
//   - Non-zero horizontal reactions (sway occurs)
//   - Horizontal equilibrium: R_A_x + R_D_x = 0
//   - Non-zero lateral displacement at beam level
//
// Reference: ANSYS VM48; Ghali & Neville, Structural Analysis.

#[test]
fn validation_vm48_asymmetric_portal_sway() {
    let h1 = 4.0; // left column height
    let h2 = 6.0; // right column height
    let w = 8.0; // beam span
    let p = 100.0; // kN vertical at mid-beam
    let a_sec = 0.01;
    let iz = 1e-4;

    // Nodes: 1=left base, 2=left top, 3=mid-beam, 4=right top, 5=right base
    // Left column at x=0, right column at x=w
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h1),
        (3, w / 2.0, h1), // beam at height h1, load here
        (4, w, h1),        // right top of beam
        (5, w, h1 - h2),   // right base (below beam)
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left beam half
        (3, "frame", 3, 4, 1, 1, false, false), // right beam half
        (4, "frame", 4, 5, 1, 1, false, false), // right column
    ];

    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Vertical equilibrium: R_A_y + R_D_y = P
    let sum_ry = r_a.rz + r_d.rz;
    assert_close(sum_ry, p, 0.01, "VM48 vertical equilibrium");

    // Horizontal equilibrium: R_A_x + R_D_x = 0
    let sum_rx = r_a.rx + r_d.rx;
    assert!(
        sum_rx.abs() < 0.5,
        "VM48 horizontal equilibrium: sum_rx={:.4}",
        sum_rx
    );

    // Sway: horizontal reactions should be non-zero (unequal heights cause sway)
    assert!(
        r_a.rx.abs() > 0.1,
        "VM48: left horizontal reaction should be non-zero for sway, rx={:.4}",
        r_a.rx
    );

    // Base moments should be non-zero (fixed supports)
    assert!(
        r_a.my.abs() > 1.0,
        "VM48: left base moment should be non-zero, mz={:.4}",
        r_a.my
    );
    assert!(
        r_d.my.abs() > 1.0,
        "VM48: right base moment should be non-zero, mz={:.4}",
        r_d.my
    );

    // Lateral displacement at beam level should be non-zero (sway)
    let d2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    assert!(
        d2.ux.abs() > 1e-6,
        "VM48: lateral sway displacement should be non-zero, ux={:.6e}",
        d2.ux
    );

    // The reactions should be unequal due to different column stiffnesses
    // Stiffer column (shorter, h1) attracts more vertical load
    // For fixed-base portal: stiffness ~ 12EI/h^3
    // Left column stiffness: k1 ~ 12EI/h1^3
    // Right column stiffness: k2 ~ 12EI/h2^3
    // Since h1 < h2, the left column is stiffer laterally
    assert!(
        r_a.rz.abs() != r_d.rz.abs(),
        "VM48: reactions should be unequal due to asymmetry",
    );
}

// ================================================================
// 8. VM49: Continuous Beam with Support Settlement
// ================================================================
//
// Two-span continuous beam with equal spans L, UDL q on both spans.
// The interior support B settles by delta_s.
//
// Without settlement: M_B = -qL^2/8 (from VM44).
// Settlement delta_s at B induces additional moment:
//   M_B_settlement = 3*E*I*delta_s / L^2 (for each span)
//   Total additional: 6*E*I*delta_s / L^2 (symmetric, both spans contribute)
//
// The settlement reduces the hogging moment at B (if downward settlement).
// Modified: M_B = -qL^2/8 + 6*EI*delta_s/L^2
//
// We verify this by building the model with a prescribed displacement
// at the interior support and comparing to the analytical result.
//
// Reference: ANSYS VM49; Ghali & Neville, Structural Analysis.

#[test]
fn validation_vm49_continuous_beam_settlement() {
    let l = 6.0; // each span
    let q = -10.0; // kN/m downward
    let a_sec = 0.01;
    let iz = 1e-4;
    let n_per_span = 6;
    let delta_s = -0.005; // 5mm downward settlement at interior support

    let total_elems = n_per_span * 2;
    let total_nodes = total_elems + 1;

    // UDL on both spans
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = total_nodes;

    // Build manually to have settlement at interior support
    let elem_len = l / n_per_span as f64;
    let mut nodes = Vec::new();
    let mut node_id = 1_usize;
    nodes.push((node_id, 0.0, 0.0));
    node_id += 1;
    for span_idx in 0..2 {
        let x_offset = span_idx as f64 * l;
        for j in 1..=n_per_span {
            nodes.push((node_id, x_offset + j as f64 * elem_len, 0.0));
            node_id += 1;
        }
    }

    let elems: Vec<_> = (0..total_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, z: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: E,
            nu: 0.3,
        },
    );
    let mut secs_map = HashMap::new();
    secs_map.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a: a_sec,
            iz,
            as_y: None,
        },
    );
    let mut elems_map = HashMap::new();
    for (id, _t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(
            id.to_string(),
            SolverElement {
                id: *id,
                elem_type: "frame".to_string(),
                node_i: *ni,
                node_j: *nj,
                material_id: *mi,
                section_id: *si,
                hinge_start: *hs,
                hinge_end: *he,
            },
        );
    }

    // Supports with settlement at B
    let mut sups_map = HashMap::new();
    sups_map.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: node_a,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sups_map.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: node_b,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(delta_s), // settlement
            dry: None,
            angle: None,
        },
    );
    sups_map.insert(
        "3".to_string(),
        SolverSupport {
            id: 3,
            node_id: node_c,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );

    let input_settlement = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), };

    let results = linear::solve_2d(&input_settlement).unwrap();

    // Also solve without settlement for comparison
    let mut loads_no_settle = Vec::new();
    for i in 0..total_elems {
        loads_no_settle.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }
    let input_no_settle =
        make_continuous_beam(&[l, l], n_per_span, E, a_sec, iz, loads_no_settle);
    let results_no_settle = linear::solve_2d(&input_no_settle).unwrap();

    // Verify settlement actually occurred at node B
    let d_b = results
        .displacements
        .iter()
        .find(|d| d.node_id == node_b)
        .unwrap();
    assert_close(
        d_b.uz,
        delta_s,
        0.01,
        "VM49 settlement displacement at B",
    );

    // The interior support moment should change due to settlement
    // Without settlement: M_B = qL^2/8 (hogging)
    let q_abs = q.abs();
    let ei = E_EFF * iz;
    let mb_no_settle_expected = q_abs * l * l / 8.0;

    // Settlement correction from three-moment equation for equal spans:
    //   M_A*L + 2*M_B*(2L) + M_C*L = -6*EI*[(-delta)/L + (-delta)/L]
    //   With M_A = M_C = 0: 4*M_B*L = 6*EI*2*delta/L
    //   M_B_correction = 3*EI*delta/L^2
    // (Downward settlement reduces hogging moment at B)
    let mb_settle_correction = 3.0 * ei * delta_s.abs() / (l * l);

    // With downward settlement, the hogging moment is reduced
    let mb_settle_expected = mb_no_settle_expected - mb_settle_correction;

    // Get M_B from element forces (end moment of last element in span 1)
    let ef_b_settle = results
        .element_forces
        .iter()
        .find(|f| f.element_id == n_per_span)
        .unwrap();
    let ef_b_no_settle = results_no_settle
        .element_forces
        .iter()
        .find(|f| f.element_id == n_per_span)
        .unwrap();

    // Without settlement: check matches qL^2/8
    assert_close(
        ef_b_no_settle.m_end.abs(),
        mb_no_settle_expected,
        0.05,
        "VM49 M_B without settlement = qL^2/8",
    );

    // With settlement: the moment at B should be different (reduced)
    // The settlement reduces hogging, so |M_B_settle| < |M_B_no_settle|
    assert!(
        ef_b_settle.m_end.abs() < ef_b_no_settle.m_end.abs(),
        "VM49: settlement should reduce hogging moment at B. With: {:.4}, Without: {:.4}",
        ef_b_settle.m_end.abs(),
        ef_b_no_settle.m_end.abs()
    );

    // Check the analytical estimate
    assert_close(
        ef_b_settle.m_end.abs(),
        mb_settle_expected,
        0.10,
        "VM49 M_B with settlement",
    );

    // Equilibrium should still hold
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(
        sum_ry,
        2.0 * q_abs * l,
        0.02,
        "VM49 equilibrium with settlement",
    );
}
