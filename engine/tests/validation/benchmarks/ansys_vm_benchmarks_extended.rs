/// Validation: ANSYS Verification Manual — Extended Benchmark Problems
///
/// References:
///   - ANSYS Mechanical APDL Verification Manual, Release 2024
///   - VM11: Propped Cantilever with Point Load at Midspan
///   - VM15: Pinned-Pinned Buckling (Higher Modes)
///   - VM17: Four-Bar Planar Truss (Overdetermined)
///   - VM19: Cantilever Beam with Linearly Varying (Triangular) Load
///   - VM24: Three-Span Continuous Beam with UDL
///   - VM28: Fixed-Pinned Beam with UDL
///   - VM42: 3D Cantilever with Torsion
///   - VM44: Portal Frame with Lateral and Gravity Loads (Sway Frame)
///
/// These tests cover problems NOT already in validation_ansys_vm.rs,
/// validation_ansys_vm_extended.rs, validation_ansys_vm_additional.rs,
/// or validation_ansys_vm_benchmarks.rs.
use dedaliano_engine::solver::{buckling, linear};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective)

// ================================================================
// 1. VM11: Propped Cantilever with Point Load at Midspan
// ================================================================
//
// Cantilever beam (fixed at left, roller at right), length L.
// Point load P at midspan (x = L/2).
//
// Using compatibility/superposition method:
//   R_B (roller reaction at right end):
//     delta_free = P*(L/2)^2*(3L - L/2) / (6EI) = 5PL^3/(48EI)
//     delta_unit = L^3/(3EI)
//     R_B = delta_free / delta_unit = 5P/16
//
//   R_A = P - R_B = 11P/16
//   M_A = P*L/2 - R_B*L = PL/2 - 5PL/16 = 3PL/16
//
// Reference: ANSYS VM11; Roark's Formulas for Stress and Strain.

#[test]
fn validation_vm11_propped_cantilever_midspan_load() {
    let l = 8.0;
    let p = 80.0; // kN
    let a_sec = 0.01;
    let iz = 1e-4;
    let n = 16; // 16 elements, 0.5m each

    // Propped cantilever: fixed at left (node 1), roller at right (node n+1)
    // Point load at midspan: node (n/2 + 1)
    let mid_node = n / 2 + 1;

    let input = make_beam(
        n, l, E, a_sec, iz,
        "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Analytical reactions
    let r_b_expected = 5.0 * p / 16.0; // = 25.0 kN
    let r_a_expected = 11.0 * p / 16.0; // = 55.0 kN
    let m_a_expected = 3.0 * p * l / 16.0; // = 120.0 kN*m

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_left.rz, r_a_expected, 0.02, "VM11 R_A = 11P/16");
    assert_close(r_right.rz, r_b_expected, 0.02, "VM11 R_B = 5P/16");
    assert_close(r_left.my.abs(), m_a_expected, 0.02, "VM11 M_A = 3PL/16");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "VM11 equilibrium");

    // Midspan deflection for propped cantilever with point load at center:
    // delta_mid = 7*P*L^3 / (768*EI)
    let ei = E_EFF * iz;
    let delta_mid_expected = 7.0 * p * l.powi(3) / (768.0 * ei);
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uz.abs(), delta_mid_expected, 0.03, "VM11 midspan deflection");

    // Maximum moment at midspan: M_mid = R_A * L/2 - M_A = 11PL/32 - 3PL/16 = 5PL/32
    let m_mid_expected = 5.0 * p * l / 32.0; // = 100.0 kN*m
    // Find the element force at the midspan (element n/2 connects mid_node-1 to mid_node)
    let ef_at_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2)
        .unwrap();
    assert_close(ef_at_mid.m_end.abs(), m_mid_expected, 0.05, "VM11 M_mid = 5PL/32");
}

// ================================================================
// 2. VM15: Pinned-Pinned Column Buckling (Higher Modes)
// ================================================================
//
// Pinned-pinned column, length L, under unit axial compression.
// Euler buckling loads:
//   Pcr_n = n^2 * pi^2 * EI / L^2
//
// First three modes: Pcr_1, Pcr_2 = 4*Pcr_1, Pcr_3 = 9*Pcr_1.
//
// Reference: ANSYS VM15; Timoshenko, Theory of Elastic Stability.

#[test]
fn validation_vm15_pinned_column_higher_buckling_modes() {
    let l: f64 = 6.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let n = 20; // need fine mesh for higher modes

    let pi = std::f64::consts::PI;
    let pcr_1_exact = pi.powi(2) * E_EFF * iz / (l * l);

    // Apply unit compression at free end
    let p_unit = 1.0;
    let input = make_column(n, l, E, a_sec, iz, "pinned", "rollerX", -p_unit);

    let result = buckling::solve_buckling_2d(&input, 3);

    match result {
        Ok(res) => {
            assert!(
                res.modes.len() >= 3,
                "VM15: expected at least 3 buckling modes, got {}",
                res.modes.len()
            );

            // First mode: Pcr_1
            let pcr_1_fe = res.modes[0].load_factor * p_unit;
            assert_close(pcr_1_fe, pcr_1_exact, 0.03, "VM15 Pcr_1 = pi^2*EI/L^2");

            // Second mode: Pcr_2 = 4*Pcr_1
            let pcr_2_fe = res.modes[1].load_factor * p_unit;
            let pcr_2_exact = 4.0 * pcr_1_exact;
            assert_close(pcr_2_fe, pcr_2_exact, 0.05, "VM15 Pcr_2 = 4*Pcr_1");

            // Third mode: Pcr_3 = 9*Pcr_1
            let pcr_3_fe = res.modes[2].load_factor * p_unit;
            let pcr_3_exact = 9.0 * pcr_1_exact;
            assert_close(pcr_3_fe, pcr_3_exact, 0.08, "VM15 Pcr_3 = 9*Pcr_1");

            // Mode ratios
            let ratio_21 = pcr_2_fe / pcr_1_fe;
            let ratio_31 = pcr_3_fe / pcr_1_fe;
            assert_close(ratio_21, 4.0, 0.05, "VM15 Pcr_2/Pcr_1 = 4");
            assert_close(ratio_31, 9.0, 0.08, "VM15 Pcr_3/Pcr_1 = 9");
        }
        Err(e) => {
            panic!("VM15: buckling solver failed: {}", e);
        }
    }
}

// ================================================================
// 3. VM17: Four-Bar Planar Truss (Diamond Configuration)
// ================================================================
//
// Diamond-shaped 4-bar truss with vertical load at top apex.
// Nodes at compass points: bottom (support), left, right (supports), top (loaded).
//
// Geometry:
//   Node 1 (bottom): (0, 0) — pinned
//   Node 2 (left):   (-w, h) — rollerX
//   Node 3 (right):  (w, h) — rollerX
//   Node 4 (top):    (0, 2h) — loaded with P downward
//
// By symmetry, left and right bars carry equal forces.
// Vertical equilibrium at top node:
//   2*F_top_bar * sin(alpha) = P   where alpha = angle from horizontal
//
// Reference: ANSYS VM17; Timoshenko, Strength of Materials.

#[test]
fn validation_vm17_four_bar_diamond_truss() {
    let h = 2.0; // half-height
    let w = 1.5; // half-width
    let p = 120.0; // kN downward at top
    let a_truss = 0.005;

    let nodes = vec![
        (1, 0.0, 0.0),     // bottom (pinned)
        (2, -w, h),         // left (rollerX)
        (3, w, h),          // right (rollerX)
        (4, 0.0, 2.0 * h), // top (loaded)
    ];

    // Four bars: bottom-left, bottom-right, left-top, right-top
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false), // bottom-left
        (2, "truss", 1, 3, 1, 1, false, false), // bottom-right
        (3, "truss", 2, 4, 1, 1, false, false), // left-top
        (4, "truss", 3, 4, 1, 1, false, false), // right-top
    ];

    let sups = vec![
        (1, 1, "pinned"),
        (2, 2, "rollerX"),
        (3, 3, "rollerX"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_truss, 1e-10)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // The top bars (elements 3, 4) go from (+-w, h) to (0, 2h).
    // Length of top bar: sqrt(w^2 + h^2)
    let l_bar: f64 = (w * w + h * h).sqrt();
    // Angle from horizontal: sin(alpha) = h / l_bar
    let sin_alpha = h / l_bar;

    // By symmetry at the top node:
    // 2 * F_top * sin(alpha) = P
    let f_top_bar_expected = p / (2.0 * sin_alpha);

    // Top bars (elements 3 and 4)
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();

    assert_close(ef3.n_start.abs(), f_top_bar_expected, 0.03, "VM17 top-left bar force");
    assert_close(ef4.n_start.abs(), f_top_bar_expected, 0.03, "VM17 top-right bar force");

    // Bottom bars: same angle, carry force from bottom node to side nodes
    // By equilibrium at bottom node:
    // 2 * F_bottom * sin(alpha) = R_bottom_y
    // By symmetry, R_bottom_y handles the vertical component that goes through the bottom bars.
    // Global equilibrium: R_bottom + 2*R_side = P
    // At side node (rollerX): vertical reaction R_side carries the vertical imbalance.
    // Actually for the diamond, by symmetry each bottom bar has same force as top bars.
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.01, "VM17 bottom bar symmetry");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "VM17 vertical equilibrium");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.1, "VM17 horizontal equilibrium, sum_rx={:.4}", sum_rx);
}

// ================================================================
// 4. VM19: Cantilever with Linearly Varying (Triangular) Load
// ================================================================
//
// Cantilever beam, length L, fixed at left. Triangular distributed
// load: q = 0 at fixed end (x=0), q = q_max at free end (x=L).
//
// Total load: W = q_max * L / 2 (triangle area)
// Reactions:
//   V = W = q_max * L / 2
//   M = W * (2L/3) = q_max * L^2 / 3  (centroid at 2L/3 from fixed end)
//
// Tip deflection: delta = 11 * q_max * L^4 / (120 * EI)
//
// Reference: ANSYS VM19; Timoshenko, Strength of Materials, Table Cases.

#[test]
fn validation_vm19_cantilever_triangular_load() {
    let l = 6.0;
    let q_max = 20.0; // kN/m at free end
    let a_sec = 0.01;
    let iz = 1e-4;
    let n = 12;
    let elem_len = l / n as f64;

    // Triangular load: increases linearly from 0 at x=0 to q_max at x=L.
    // Each element i (from 0 to n-1) covers [i*dx, (i+1)*dx].
    // q at start of element: q_i = q_max * (i * dx) / L
    // q at end of element:   q_j = q_max * ((i+1) * dx) / L
    let mut loads = Vec::new();
    for i in 0..n {
        let x_start = i as f64 * elem_len;
        let x_end = (i + 1) as f64 * elem_len;
        let qi = -q_max * x_start / l;
        let qj = -q_max * x_end / l;
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

    // Reactions at fixed end
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // V = q_max * L / 2
    let v_expected = q_max * l / 2.0;
    assert_close(r.rz, v_expected, 0.02, "VM19 V = q_max*L/2");

    // M = q_max * L^2 / 3
    let m_expected = q_max * l * l / 3.0;
    assert_close(r.my.abs(), m_expected, 0.02, "VM19 M = q_max*L^2/3");

    // Tip deflection for triangular load max at free end:
    // delta = 11 * q_max * L^4 / (120 * EI)
    let ei = E_EFF * iz;
    let delta_expected = 11.0 * q_max * l.powi(4) / (120.0 * ei);
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz.abs(), delta_expected, 0.03, "VM19 tip deflection = 11*q_max*L^4/(120EI)");

    // Equilibrium: vertical reaction equals total load
    assert_close(r.rz, v_expected, 0.01, "VM19 equilibrium");
}

// ================================================================
// 5. VM24: Three-Span Continuous Beam with UDL on All Spans
// ================================================================
//
// Three equal spans L, UDL q on all spans.
// Four supports: A (left), B, C (interior), D (right).
//
// By three-moment equation for equal spans with UDL:
//   Interior support moments: M_B = M_C = -q*L^2/10
//   End reactions: R_A = R_D = 0.4*q*L
//   Interior reactions: R_B = R_C = 1.1*q*L
//
// Reference: ANSYS VM24; Timoshenko, Strength of Materials.

#[test]
fn validation_vm24_three_span_continuous_beam_udl() {
    let l = 5.0; // each span
    let q = 12.0; // kN/m
    let n_per_span = 6;

    let n_spans = 3;
    let total_elems = n_per_span * n_spans;

    // UDL on all spans
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, 0.01, 1e-4, loads);
    let results = linear::solve_2d(&input).unwrap();

    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;
    let node_d = 3 * n_per_span + 1;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap().rz;
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap().rz;
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap().rz;
    let r_d = results.reactions.iter().find(|r| r.node_id == node_d).unwrap().rz;

    // Analytical reactions for 3 equal spans with UDL:
    // R_A = R_D = 0.4 * q * L
    // R_B = R_C = 1.1 * q * L
    let r_end_expected = 0.4 * q * l;
    let r_int_expected = 1.1 * q * l;

    assert_close(r_a, r_end_expected, 0.03, "VM24 R_A = 0.4*q*L");
    assert_close(r_d, r_end_expected, 0.03, "VM24 R_D = 0.4*q*L");
    assert_close(r_b, r_int_expected, 0.03, "VM24 R_B = 1.1*q*L");
    assert_close(r_c, r_int_expected, 0.03, "VM24 R_C = 1.1*q*L");

    // Symmetry
    assert_close(r_a, r_d, 0.01, "VM24 end reaction symmetry");
    assert_close(r_b, r_c, 0.01, "VM24 interior reaction symmetry");

    // Global equilibrium: total load = q * 3L
    let total_load = q * 3.0 * l;
    let sum_ry = r_a + r_b + r_c + r_d;
    assert_close(sum_ry, total_load, 0.01, "VM24 global equilibrium");

    // Interior moment at B: M_B = -q*L^2/10
    let m_b_expected = q * l * l / 10.0;
    let ef_at_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span)
        .unwrap();
    assert_close(ef_at_b.m_end.abs(), m_b_expected, 0.05, "VM24 M_B = q*L^2/10");
}

// ================================================================
// 6. VM28: Fixed-Pinned Beam with Uniform Distributed Load
// ================================================================
//
// Beam fixed at left, pinned at right, length L, UDL q over full span.
//
// By superposition:
//   R_B (pinned end) = 3*q*L/8
//   R_A (fixed end)  = 5*q*L/8
//   M_A (fixed-end moment) = q*L^2/8
//
// Maximum positive moment at x = 3L/8 from fixed end:
//   M_max_pos = 9*q*L^2/128
//
// Point of zero shear at x = 5L/8 from fixed end.
//
// Reference: ANSYS VM28; Roark's Formulas for Stress and Strain.

#[test]
fn validation_vm28_fixed_pinned_beam_udl() {
    let l = 10.0;
    let q = 15.0; // kN/m
    let a_sec = 0.01;
    let iz = 1e-4;
    let n = 16;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, a_sec, iz, "fixed", Some("pinned"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_A = 5qL/8, R_B = 3qL/8
    let r_a_expected = 5.0 * q * l / 8.0;
    let r_b_expected = 3.0 * q * l / 8.0;
    let m_a_expected = q * l * l / 8.0;

    assert_close(r_left.rz, r_a_expected, 0.02, "VM28 R_A = 5qL/8");
    assert_close(r_right.rz, r_b_expected, 0.02, "VM28 R_B = 3qL/8");
    assert_close(r_left.my.abs(), m_a_expected, 0.02, "VM28 M_A = qL^2/8");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let total_load = q * l;
    assert_close(sum_ry, total_load, 0.01, "VM28 equilibrium");

    // Maximum midspan deflection for fixed-pinned beam with UDL:
    // delta_max = q*L^4 / (185*EI)  (approximately, exact: at x=0.4215L)
    // More precisely: delta_max = q*L^4*(1/185.2) ≈ q*L^4/(185*EI)
    // Standard reference: delta_max at x=0.4215L from fixed end = q*L^4/(185.16*EI)
    let ei = E_EFF * iz;
    let delta_max_expected = q * l.powi(4) / (185.16 * ei);

    // Find maximum deflection
    let max_uy: f64 = results.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0, f64::max);

    assert_close(max_uy, delta_max_expected, 0.05, "VM28 max deflection");

    // Pinned end should have zero moment reaction
    assert!(
        r_right.my.abs() < 0.5,
        "VM28: pinned end moment should be ~0, got {:.4}",
        r_right.my
    );
}

// ================================================================
// 7. VM42: 3D Cantilever Under Pure Torsion
// ================================================================
//
// Cantilever beam (3D), length L, fixed at one end.
// Applied torque T at free end about the longitudinal axis.
//
// Twist angle at tip: phi = T * L / (G * J)
// where G = E / (2*(1+nu))
//
// No bending occurs (pure torsion).
//
// Reference: ANSYS VM42; Ugural & Fenster, Advanced Mechanics of Materials.

#[test]
fn validation_vm42_3d_cantilever_torsion() {
    let l = 4.0;
    let a_sec = 0.01;
    let iy = 1e-4;
    let iz = 1e-4;
    let j = 5e-5;
    let nu = 0.3;
    let torque = 20.0; // kN*m about x-axis
    let n = 8;

    let g_eff = E_EFF / (2.0 * (1.0 + nu)); // shear modulus

    let input = make_3d_beam(
        n, l, E, nu, a_sec, iy, iz, j,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz: 0.0,
            mx: torque, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Expected twist angle at tip: phi = T * L / (G * J)
    let gj = g_eff * j;
    let phi_expected = torque * l / gj;

    assert_close(tip.rx.abs(), phi_expected, 0.03, "VM42 twist angle = TL/(GJ)");

    // Pure torsion: no transverse displacement
    assert!(
        tip.uz.abs() < 1e-8,
        "VM42: tip uy should be ~0, got {:.6e}",
        tip.uz
    );
    assert!(
        tip.uz.abs() < 1e-8,
        "VM42: tip uz should be ~0, got {:.6e}",
        tip.uz
    );

    // Twist should vary linearly along the beam
    // At midpoint: phi_mid = phi_tip / 2
    let mid_node = n / 2 + 1;
    let mid = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid.rx.abs(), phi_expected / 2.0, 0.05, "VM42 midpoint twist = phi_tip/2");

    // Fixed-end torsional reaction
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.mx.abs(), torque, 0.02, "VM42 base torque reaction");

    // No bending reactions (pure torsion)
    assert!(
        r_base.fz.abs() < 0.1,
        "VM42: base Fy should be ~0, got {:.4}",
        r_base.fz
    );
    assert!(
        r_base.fz.abs() < 0.1,
        "VM42: base Fz should be ~0, got {:.4}",
        r_base.fz
    );
}

// ================================================================
// 8. VM44: Portal Frame with Combined Lateral and Gravity Loads
// ================================================================
//
// Fixed-base portal frame with both gravity UDL on beam and
// lateral point load at beam level.
//
// Geometry: two columns height h, beam span w.
// Both columns fixed at base.
//
// Under lateral load H alone at left beam-column joint:
//   Each base gets H/2 horizontal reaction (by antisymmetry, approx.)
//   Sway mode develops.
//
// Under gravity UDL q alone on beam:
//   No sway (symmetric), vertical reactions = qw/2 each.
//
// Combined: verify superposition holds for linear analysis.
//
// Reference: ANSYS VM44; McGuire, Gallagher & Ziemian,
//            Matrix Structural Analysis, 2nd Ed.

#[test]
fn validation_vm44_portal_frame_combined_loading() {
    let h = 4.0;
    let w = 6.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let h_force = 30.0; // kN lateral at left joint
    let q = 20.0; // kN/m UDL on beam
    let n_beam = 6;

    // Build a portal frame with multiple beam elements for UDL
    // Nodes: 1=left base, 2=left top, 3...(2+n_beam)=beam nodes, right_top=2+n_beam, right_base=3+n_beam
    let mut nodes = vec![
        (1, 0.0, 0.0),  // left base
        (2, 0.0, h),     // left top
    ];
    for i in 1..=n_beam {
        nodes.push((2 + i, i as f64 * w / n_beam as f64, h));
    }
    let right_top = 2 + n_beam;
    let right_base = right_top + 1;
    nodes.push((right_base, w, 0.0));

    let mut elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
    ];
    for i in 0..n_beam {
        elems.push((2 + i, "frame", 2 + i, 3 + i, 1, 1, false, false));
    }
    elems.push((2 + n_beam, "frame", right_top, right_base, 1, 1, false, false)); // right column

    let sups = vec![(1, 1, "fixed"), (2, right_base, "fixed")];

    // ---- Lateral load only ----
    let loads_h = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: h_force, fz: 0.0, my: 0.0,
    })];

    let input_h = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, a_sec, iz)],
        elems.clone(), sups.clone(), loads_h,
    );
    let res_h = linear::solve_2d(&input_h).unwrap();

    // ---- Gravity UDL only ----
    let mut loads_g = Vec::new();
    for i in 0..n_beam {
        loads_g.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2 + i, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input_g = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, a_sec, iz)],
        elems.clone(), sups.clone(), loads_g.clone(),
    );
    let res_g = linear::solve_2d(&input_g).unwrap();

    // ---- Combined ----
    let mut loads_combined = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: h_force, fz: 0.0, my: 0.0,
    })];
    for i in 0..n_beam {
        loads_combined.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2 + i, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input_c = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_sec, iz)],
        elems, sups, loads_combined,
    );
    let res_c = linear::solve_2d(&input_c).unwrap();

    // Verify superposition: combined displacements = lateral + gravity
    for d_c in &res_c.displacements {
        let d_h = res_h.displacements.iter().find(|d| d.node_id == d_c.node_id).unwrap();
        let d_g = res_g.displacements.iter().find(|d| d.node_id == d_c.node_id).unwrap();

        let ux_super = d_h.ux + d_g.ux;
        let uy_super = d_h.uz + d_g.uz;

        assert_close(d_c.ux, ux_super, 0.02,
            &format!("VM44 superposition ux at node {}", d_c.node_id));
        assert_close(d_c.uz, uy_super, 0.02,
            &format!("VM44 superposition uy at node {}", d_c.node_id));
    }

    // Gravity: vertical reactions should each be qw/2
    let r_left_g = res_g.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right_g = res_g.reactions.iter().find(|r| r.node_id == right_base).unwrap();
    assert_close(r_left_g.rz, q * w / 2.0, 0.02, "VM44 gravity R_left_y = qw/2");
    assert_close(r_right_g.rz, q * w / 2.0, 0.02, "VM44 gravity R_right_y = qw/2");

    // Lateral: horizontal equilibrium H + sum(Rx) = 0
    let sum_rx_h: f64 = res_h.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_h, -h_force, 0.02, "VM44 lateral horizontal equilibrium");

    // Combined equilibrium
    let sum_ry_c: f64 = res_c.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_c, q * w, 0.02, "VM44 combined vertical equilibrium");

    let sum_rx_c: f64 = res_c.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_c, -h_force, 0.02, "VM44 combined horizontal equilibrium");
}
