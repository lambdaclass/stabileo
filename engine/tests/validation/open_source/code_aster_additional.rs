/// Validation: Code_Aster SSLL Extended Beam Benchmark Problems
///
/// Reference: Code_Aster V3.01 Validation Manual — SSLL series (linear beam problems).
///
/// Tests: simply supported beam (SSLL101a), cantilever with UDL (SSLL101b),
///        continuous beam (SSLL102a), frame with sway (SSLL105a),
///        truss structure (SSLL106a), beam on Winkler foundation (SSLL107a),
///        thermal loading (SSLL110a), modal analysis (SSLL116a).
use dedaliano_engine::solver::{linear, modal, winkler};
use dedaliano_engine::solver::winkler::{WinklerInput, FoundationSpring};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver internally multiplies by 1000)
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴

// ═══════════════════════════════════════════════════════════════
// 1. SSLL101a — Simply Supported Beam with Central Point Load
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL101 case (a).
// Simply supported beam, span L, point load P at midspan.
//   Reactions: R_A = R_B = P/2
//   Midspan deflection: delta = P*L^3 / (48*E*I)
//   Midspan moment: M_max = P*L / 4

#[test]
fn validation_ca_ssll101a_ss_beam_point_load() {
    let l = 6.0; // m
    let p = 120.0; // kN
    let n = 12; // elements
    let mid_node = n / 2 + 1; // node at midspan

    // Apply point load as nodal load at midspan node
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_B = P/2 = 60 kN
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "SSLL101a R_A = P/2");
    assert_close(r_end.rz, p / 2.0, 0.02, "SSLL101a R_B = P/2");

    // Midspan deflection: delta = P*L^3 / (48*E*I)
    let delta_expected = p * l.powi(3) / (48.0 * E_EFF * IZ);
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uz.abs(), delta_expected, 0.02, "SSLL101a midspan deflection = PL^3/(48EI)");

    // Midspan moment: M_max = P*L/4 = 180 kN.m
    let m_max_expected = p * l / 4.0;
    let m_max: f64 = results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert_close(m_max, m_max_expected, 0.02, "SSLL101a M_max = PL/4");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "SSLL101a sum Ry = P");
}

// ═══════════════════════════════════════════════════════════════
// 2. SSLL101b — Cantilever Beam with Uniform Distributed Load
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL101 case (b).
// Cantilever (fixed-free), length L, UDL q over entire length.
//   Tip deflection: delta = q*L^4 / (8*E*I)
//   Base moment: M_base = q*L^2 / 2
//   Base shear: V_base = q*L

#[test]
fn validation_ca_ssll101b_cantilever_udl() {
    let l = 5.0; // m
    let q = 20.0; // kN/m
    let n = 10; // elements

    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Tip deflection: delta = q*L^4 / (8*E*I)
    let delta_expected = q * l.powi(4) / (8.0 * E_EFF * IZ);
    let tip_node = n + 1;
    let d_tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();
    assert_close(d_tip.uz.abs(), delta_expected, 0.02, "SSLL101b tip deflection = qL^4/(8EI)");

    // Base reactions
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Shear: V_base = q*L = 100 kN
    assert_close(r_base.rz, q * l, 0.02, "SSLL101b V_base = qL");

    // Moment: M_base = q*L^2/2 = 250 kN.m
    let m_base_expected = q * l * l / 2.0;
    assert_close(r_base.my.abs(), m_base_expected, 0.02, "SSLL101b M_base = qL^2/2");
}

// ═══════════════════════════════════════════════════════════════
// 3. SSLL102a — Continuous Beam with 3 Equal Spans, UDL
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL102 case (a).
// Three-span continuous beam (spans L each), UDL q on all spans.
//   By three-moment equation for equal spans with UDL:
//   Interior support reactions: R_int = 1.1*q*L
//   End support reactions: R_end = 0.4*q*L
//   Interior support moment: M_int = q*L^2/10

#[test]
fn validation_ca_ssll102a_continuous_beam_3span() {
    let span = 4.0; // m per span
    let q = 15.0; // kN/m
    let n_per_span = 8; // elements per span
    let total_elements = n_per_span * 3;

    let loads: Vec<SolverLoad> = (0..total_elements)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_continuous_beam(
        &[span, span, span],
        n_per_span,
        E, A, IZ,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let total_load = q * 3.0 * span; // 180 kN

    // Sum of reactions must equal total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02, "SSLL102a sum_R = q*3L");

    // Support node IDs
    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;
    let node_d = 3 * n_per_span + 1;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap().rz;
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap().rz;
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap().rz;
    let r_d = results.reactions.iter().find(|r| r.node_id == node_d).unwrap().rz;

    let r_end_expected = 0.4 * q * span;   // = 24 kN
    let r_int_expected = 1.1 * q * span;   // = 66 kN

    assert_close(r_a, r_end_expected, 0.03, "SSLL102a R_A = 0.4qL");
    assert_close(r_b, r_int_expected, 0.03, "SSLL102a R_B = 1.1qL");
    assert_close(r_c, r_int_expected, 0.03, "SSLL102a R_C = 1.1qL");
    assert_close(r_d, r_end_expected, 0.03, "SSLL102a R_D = 0.4qL");

    // Interior support moment: M_int = q*L^2/10 = 24 kN.m
    let m_int_expected = q * span * span / 10.0;

    // Check moment at first interior support (end of last element in span 1)
    let m_at_b: f64 = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span) // last element of span 1
        .map(|e| e.m_end.abs())
        .unwrap_or(0.0);
    assert_close(m_at_b, m_int_expected, 0.05, "SSLL102a M_B = qL^2/10");

    // By symmetry M_B = M_C
    let m_at_c: f64 = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n_per_span)
        .map(|e| e.m_end.abs())
        .unwrap_or(0.0);
    assert_close(m_at_b, m_at_c, 0.03, "SSLL102a M_B = M_C symmetry");
}

// ═══════════════════════════════════════════════════════════════
// 4. SSLL105a — Portal Frame with Lateral Load (Sway)
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL105 case (a).
// Fixed-base portal frame, height H, width W, lateral load P at beam level.
//   Horizontal reactions: H_A = H_D = P/2 (by antisymmetry for equal columns)
//   Overturning: R_D_y = P*H/W
//   Portal is stiffer than single cantilever column

#[test]
fn validation_ca_ssll105a_portal_sway() {
    let h = 4.0; // column height, m
    let w = 6.0; // beam span, m
    let p = 50.0; // lateral load, kN

    let input = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum of horizontal reactions = P
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), p, 0.02, "SSLL105a sum|Rx| = P");

    // By antisymmetry (equal columns, same EI): H_A = H_D = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rx.abs(), p / 2.0, 0.05, "SSLL105a H_A = P/2");
    assert_close(r4.rx.abs(), p / 2.0, 0.05, "SSLL105a H_D = P/2");

    // Moment equilibrium about left base: R4_y * W + M_A + M_D = P * H
    // For a fixed-base portal, the base moments carry part of the overturning,
    // so R_D_y < P*H/W. Verify equilibrium directly:
    let m_check = r4.rz * w + r1.my + r4.my;
    assert_close(m_check, p * h, 0.03, "SSLL105a moment equilibrium: R4y*W + MA + MD = P*H");

    // Portal drift should be less than single cantilever column drift
    let drift_cant = p * h.powi(3) / (3.0 * E_EFF * IZ);
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(
        d2.ux.abs() < drift_cant,
        "SSLL105a portal drift {:.6} < cantilever drift {:.6}", d2.ux.abs(), drift_cant
    );
    assert!(d2.ux.abs() > 0.0, "SSLL105a drift should be nonzero");

    // Both base moments should be nonzero (fixed base)
    assert!(r1.my.abs() > 1.0, "SSLL105a base moment at A nonzero");
    assert!(r4.my.abs() > 1.0, "SSLL105a base moment at D nonzero");
}

// ═══════════════════════════════════════════════════════════════
// 5. SSLL106a — Triangular Truss Structure
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL106 case (a).
// Symmetric triangular truss: 3 nodes, 3 bars, load at apex.
//   Node 1: (0,0) pinned, Node 2: (4,0) rollerX, Node 3: (2,3) apex
//   Load: P = 100 kN downward at apex
// Analytical (method of joints):
//   Diagonal force: F_diag = P*sqrt(13)/6
//   Bottom chord: F_bc = P/3 (tension)

#[test]
fn validation_ca_ssll106a_truss() {
    let p = 100.0; // kN
    let a_bar = 0.005; // m^2

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 4.0, 0.0),
        (3, 2.0, 3.0),
    ];
    let elems = vec![
        (1, "truss", 1, 3, 1, 1, false, false), // left diagonal
        (2, "truss", 2, 3, 1, 1, false, false), // right diagonal
        (3, "truss", 1, 2, 1, 1, false, false), // bottom chord
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_bar, 1e-10)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: R1_y = R2_y = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "SSLL106a R1_y = P/2");
    assert_close(r2.rz, p / 2.0, 0.02, "SSLL106a R2_y = P/2");

    // Diagonal bar forces by method of joints at apex:
    // Bar 1 (1->3): direction (2,3)/sqrt(13)
    // Bar 2 (2->3): direction (-2,3)/sqrt(13)
    // Vertical equilibrium: 2*F*3/sqrt(13) = P => F = P*sqrt(13)/6
    let len_diag = (4.0_f64 + 9.0).sqrt(); // sqrt(13)
    let f_diag_expected = p * len_diag / (2.0 * 3.0);

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start.abs(), f_diag_expected, 0.03, "SSLL106a F_diag left");
    assert_close(ef2.n_start.abs(), f_diag_expected, 0.03, "SSLL106a F_diag right (symmetry)");

    // Bottom chord tension: horizontal equilibrium at node 1
    // F_bc = F_diag * cos(theta) = F_diag * 2/sqrt(13) = P/3
    let f_bc_expected = p / 3.0;
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef3.n_start.abs(), f_bc_expected, 0.03, "SSLL106a F_bottom = P/3");
}

// ═══════════════════════════════════════════════════════════════
// 6. SSLL107a — Beam on Elastic (Winkler) Foundation
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL107 case (a).
// Simply supported beam on Winkler foundation, central point load P.
// The foundation stiffens the beam, reducing midspan deflection.
// Characteristic length: l_c = (4*E*I / k_f)^(1/4)
// Bare beam midspan deflection: delta_bare = P*L^3 / (48*E*I)
// With foundation: delta_winkler < delta_bare

#[test]
fn validation_ca_ssll107a_beam_on_winkler() {
    let l = 10.0; // m
    let p = 80.0; // kN (midspan)
    let kf = 5000.0; // kN/m/m (foundation modulus)
    let n = 20; // elements
    let dx = l / n as f64;
    let mid_node = n / 2 + 1;

    // Build solver input manually for Winkler
    let mut nodes_map = HashMap::new();
    for i in 0..=n {
        nodes_map.insert((i + 1).to_string(), SolverNode { id: i + 1, x: i as f64 * dx, z: 0.0 });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for i in 0..n {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1,
            elem_type: "frame".to_string(),
            node_i: i + 1,
            node_j: i + 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });
    }
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];

    let solver_input = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), };

    let foundation_springs: Vec<FoundationSpring> = (1..=n)
        .map(|i| FoundationSpring { element_id: i, kf })
        .collect();

    let winkler_input = WinklerInput {
        solver: solver_input,
        foundation_springs,
    };

    // Solve with foundation
    let res_winkler = winkler::solve_winkler_2d(&winkler_input).unwrap();

    // Solve without foundation (bare beam)
    let bare_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_bare = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), bare_loads);
    let res_bare = linear::solve_2d(&input_bare).unwrap();

    let d_winkler = res_winkler.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz;
    let d_bare = res_bare.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz;

    // Foundation should reduce deflection
    assert!(
        d_winkler.abs() < d_bare.abs(),
        "SSLL107a Winkler deflection {:.6e} < bare {:.6e}", d_winkler.abs(), d_bare.abs()
    );

    // Bare beam deflection should match analytical: P*L^3/(48*E*I)
    let delta_bare_expected = p * l.powi(3) / (48.0 * E_EFF * IZ);
    assert_close(d_bare.abs(), delta_bare_expected, 0.02, "SSLL107a bare beam delta = PL^3/(48EI)");

    // Characteristic length: l_c = (4*E*I / k_f)^0.25
    let l_c = (4.0 * E_EFF * IZ / kf).powf(0.25);
    assert!(l_c > 0.5 && l_c < l, "SSLL107a characteristic length {:.3} should be reasonable", l_c);

    // The deflection ratio should show meaningful stiffening (>10% reduction)
    let ratio = d_winkler.abs() / d_bare.abs();
    assert!(
        ratio < 0.9,
        "SSLL107a foundation should reduce deflection by >10%, ratio={:.4}", ratio
    );

    // Symmetry: deflection profile should be symmetric about midspan
    let d_left = res_winkler.displacements.iter()
        .find(|d| d.node_id == n / 4 + 1).unwrap().uz;
    let d_right = res_winkler.displacements.iter()
        .find(|d| d.node_id == 3 * n / 4 + 1).unwrap().uz;
    assert_close(d_left.abs(), d_right.abs(), 0.03, "SSLL107a deflection symmetry");
}

// ═══════════════════════════════════════════════════════════════
// 7. SSLL110a — Thermal Loading on Fixed-Fixed Beam
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL110 case (a).
// Fixed-fixed beam, uniform temperature rise dT.
//   Axial force: N = E*A*alpha*dT (compressive, restrained expansion)
//   No transverse deflection for uniform temperature.
// Also test thermal gradient (dT_grad) causing bending:
//   End moments exist, deflection remains zero for fixed-fixed.

#[test]
fn validation_ca_ssll110a_thermal_fixed_beam() {
    let l = 6.0;
    let n = 8;
    let alpha = 12e-6; // 1/K (steel thermal expansion coefficient)
    let dt = 60.0; // degrees C (uniform temperature rise)
    let dt_grad = 30.0; // degrees C (temperature gradient)

    // Case 1: Uniform temperature rise on fixed-fixed beam
    let loads_uniform: Vec<SolverLoad> = (0..n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }))
        .collect();

    let input1 = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_uniform);
    let res1 = linear::solve_2d(&input1).unwrap();

    // Axial force: N = E_eff * A * alpha * dT throughout
    let n_expected = E_EFF * A * alpha * dt;
    for ef in &res1.element_forces {
        assert_close(ef.n_start.abs(), n_expected, 0.03,
            &format!("SSLL110a uniform N=EAalphadT elem {}", ef.element_id));
    }

    // No transverse deflection for uniform temperature on fixed-fixed
    for d in &res1.displacements {
        assert!(d.uz.abs() < 1e-8,
            "SSLL110a uniform: node {} uy={:.2e} should be ~0", d.node_id, d.uz);
    }

    // Case 2: Thermal gradient on fixed-fixed beam
    let loads_gradient: Vec<SolverLoad> = (0..n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: 0.0,
            dt_gradient: dt_grad,
        }))
        .collect();

    let input2 = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_gradient);
    let res2 = linear::solve_2d(&input2).unwrap();

    // End moments should exist and be equal by symmetry
    let r1 = res2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = res2.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(r1.my.abs() > 1e-6, "SSLL110a gradient: base moment should be nonzero");
    assert_close(r1.my.abs(), r_end.my.abs(), 0.05, "SSLL110a gradient moment symmetry");

    // No axial force from pure gradient
    for ef in &res2.element_forces {
        assert!(ef.n_start.abs() < 1e-3,
            "SSLL110a gradient: N should be ~0, got {:.4} on elem {}", ef.n_start, ef.element_id);
    }
}

// ═══════════════════════════════════════════════════════════════
// 8. SSLL116a — Modal Analysis of Cantilever Beam
// ═══════════════════════════════════════════════════════════════
// Reference: Code_Aster SSLL116 case (a).
// Cantilever beam, natural frequencies.
// Analytical (Euler-Bernoulli):
//   f_n = (beta_n*L)^2 / (2*pi*L^2) * sqrt(E*I/(rho*A))
//   Mode 1: beta_1*L = 1.8751
//   Mode 2: beta_2*L = 4.6941
//   Frequency ratio f2/f1 = (beta_2/beta_1)^2 = 6.267

#[test]
fn validation_ca_ssll116a_modal_cantilever() {
    let l = 4.0; // m
    let rho = 7850.0; // kg/m^3 (steel density)
    let n = 20; // elements (enough for convergence)

    // Build cantilever beam (fixed-free)
    let input = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), rho);

    let modal_res = modal::solve_modal_2d(&input, &densities, 3).unwrap();

    // Analytical frequencies for cantilever (Euler-Bernoulli):
    //   f_n = (beta_n*L)^2 / (2*pi*L^2) * sqrt(E_EFF*I / (rho_eff*A))
    // The solver uses E_EFF = E*1000 (kN/m^2) for stiffness and rho/1000 (tonnes/m^3)
    // for mass. The consistent density in solver units is rho/1000.
    let rho_eff = rho / 1000.0; // tonnes/m^3 (consistent with kN, m, s)
    let coeff = (E_EFF * IZ / (rho_eff * A)).sqrt() / (2.0 * std::f64::consts::PI * l * l);

    // Mode 1: beta_1*L = 1.87510
    let beta1l = 1.87510;
    let f1_expected = beta1l * beta1l * coeff;

    // Mode 2: beta_2*L = 4.69409
    let beta2l = 4.69409;
    let f2_expected = beta2l * beta2l * coeff;

    assert!(modal_res.modes.len() >= 2, "SSLL116a: need at least 2 modes");

    let f1_actual = modal_res.modes[0].frequency;
    let f2_actual = modal_res.modes[1].frequency;

    // Mode 1 frequency (5% tolerance for consistent mass vs analytical)
    assert_close(f1_actual, f1_expected, 0.05,
        &format!("SSLL116a f1: actual={:.4} Hz, expected={:.4} Hz", f1_actual, f1_expected));

    // Mode 2 frequency (6% tolerance for higher modes)
    assert_close(f2_actual, f2_expected, 0.06,
        &format!("SSLL116a f2: actual={:.4} Hz, expected={:.4} Hz", f2_actual, f2_expected));

    // Frequency ratio f2/f1 should match (beta2/beta1)^2 = 6.267
    let ratio_expected = (beta2l / beta1l).powi(2);
    let ratio_actual = f2_actual / f1_actual;
    assert_close(ratio_actual, ratio_expected, 0.05,
        &format!("SSLL116a f2/f1 ratio: actual={:.3}, expected={:.3}", ratio_actual, ratio_expected));

    // Total mass should be rho_eff * A * L (in tonnes, consistent solver units)
    let mass_expected = rho_eff * A * l;
    assert_close(modal_res.total_mass, mass_expected, 0.02, "SSLL116a total mass = rho_eff*A*L");
}
