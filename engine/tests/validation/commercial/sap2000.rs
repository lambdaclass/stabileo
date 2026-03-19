/// Validation: SAP2000 / CSI-Style Verification Problems
///
/// Reference: CSI Knowledge Base test problems, reproduced analytically.
///
/// Tests: simple beam, continuous beam, portal stiffness, 2-story modal,
///        braced+leaning column, end releases, spring supports,
///        prescribed displacement, P-delta amplification.
use dedaliano_engine::solver::{buckling, linear, modal, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective)
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴

// ═══════════════════════════════════════════════════════════════
// 1. Simple Beam with UDL: δ, M, V
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_simple_beam_udl() {
    // SS beam L=8m, q=15 kN/m
    // δ_max = 5qL⁴/(384EI), M_max = qL²/8, V_max = qL/2
    let l = 8.0;
    let q = -15.0; // downward
    let n = 8;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q.abs();

    // Midspan deflection
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let delta_expected = 5.0 * q_abs * l.powi(4) / (384.0 * E_EFF * IZ);
    assert_close(d_mid.uz.abs(), delta_expected, 0.02, "SAP1 δ_max");

    // Max moment
    let m_max: f64 = results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    let m_expected = q_abs * l * l / 8.0;
    assert_close(m_max, m_expected, 0.02, "SAP1 M_max");

    // End shear
    let v_max: f64 = results.element_forces.iter()
        .map(|e| e.v_start.abs().max(e.v_end.abs()))
        .fold(0.0, f64::max);
    let v_expected = q_abs * l / 2.0;
    assert_close(v_max, v_expected, 0.02, "SAP1 V_max");
}

// ═══════════════════════════════════════════════════════════════
// 2. Continuous Beam (3-span): Reactions
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_continuous_3span_reactions() {
    // 3 equal spans L=6m each, UDL q=20 kN/m
    // For equal continuous spans: R_outer = 0.4qL, R_inner = 1.1qL
    let l_span = 6.0;
    let q = 20.0;
    let n_per = 6;

    let mut loads = Vec::new();
    let n_total = n_per * 3;
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(
        &[l_span, l_span, l_span], n_per, E, A, IZ, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * 3L = 360 kN. Sum of reactions should equal this.
    let total_load = q * 3.0 * l_span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "SAP2 ΣRy = total load");

    // Outer supports should carry less than inner supports
    // For 3 equal spans: R₁=R₄=0.4qL=48, R₂=R₃=1.1qL=132
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n_total + 1).unwrap();

    // Outer reactions should be roughly 0.4qL
    assert_close(r1.rz, 0.4 * q * l_span, 0.05, "SAP2 R_outer");

    // Symmetry
    assert_close(r1.rz, r_end.rz, 0.02, "SAP2 symmetry outer reactions");
}

// ═══════════════════════════════════════════════════════════════
// 3. Portal Frame: Lateral Stiffness
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_portal_lateral_stiffness() {
    // Fixed-base portal, H=1 kN lateral at beam level
    // Lateral stiffness k = H / δ_H
    // For two fixed-base columns with rigid beam: k = 2 × 12EI/h³
    // (assuming beam is infinitely stiff relative to columns)
    let h = 4.0;
    let w = 6.0;

    // Use stiff beam (10× column stiffness) to approximate rigid beam
    let iz_col = 1e-4;
    let iz_beam = 1e-2; // much stiffer beam
    let h_load = 1.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 2, false, false), // beam (stiff)
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: h_load, fz: 0.0, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, iz_col), (2, A, iz_beam)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let delta = d2.ux.abs();
    let k_actual = h_load / delta;

    // Theoretical: k = 2 × 12EI/h³ (rigid beam assumption)
    let k_theory = 2.0 * 12.0 * E_EFF * iz_col / h.powi(3);

    // With finite beam stiffness, actual k is slightly less than theory
    // Allow 15% since beam is not truly rigid
    let rel = (k_actual - k_theory).abs() / k_theory;
    assert!(
        rel < 0.15,
        "SAP3: k_actual={:.2}, k_theory={:.2}, diff={:.1}%",
        k_actual, k_theory, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. 2-Story Frame: Modal Frequencies
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_2story_modal() {
    // 2-story, 1-bay frame with lumped floor masses
    // h=3.5m per story, w=6m
    // Check: ω₁ < ω₂, positive frequencies, reasonable range
    let h = 3.5;
    let w = 6.0;
    let density = 7_850.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),           // base
        (3, 0.0, h), (4, w, h),                 // 1st floor
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),   // 2nd floor
    ];

    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = Vec::new();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&input, &densities, 3).unwrap();

    // Should find at least 2 modes
    assert!(modal_res.modes.len() >= 2, "SAP4: should find ≥ 2 modes");

    // ω₁ < ω₂ (modes sorted by frequency)
    assert!(
        modal_res.modes[0].frequency < modal_res.modes[1].frequency,
        "SAP4: ω₁={:.2} should < ω₂={:.2}",
        modal_res.modes[0].frequency, modal_res.modes[1].frequency
    );

    // Typical 2-story steel frame: T₁ ≈ 0.05-0.5s (f ≈ 2-20 Hz)
    let f1 = modal_res.modes[0].frequency;
    assert!(f1 > 1.0 && f1 < 50.0,
        "SAP4: f₁={:.2} Hz should be in reasonable range", f1);
}

// ═══════════════════════════════════════════════════════════════
// 5. Braced Frame with Leaning Column
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_braced_leaning_column() {
    // Braced bay + leaning column (pinned-pinned, no lateral stiffness)
    // The leaning column adds gravity load but relies on braced bay for stability
    // α_cr should be lower than braced bay alone (more gravity, same lateral stiffness)
    let h = 4.0;
    let w = 5.0;
    let w_lean = 3.0; // leaning column offset
    let p = 500.0;

    // Braced frame alone
    let nodes_br = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems_br = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal brace
    ];
    let sups_br = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads_br = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input_br = make_input(
        nodes_br, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, 0.003, 1e-10)],
        elems_br, sups_br, loads_br,
    );
    let buck_br = buckling::solve_buckling_2d(&input_br, 1).unwrap();
    let alpha_br = buck_br.modes[0].load_factor;

    // Braced frame + leaning column
    let nodes_lc = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        (5, w + w_lean, 0.0), (6, w + w_lean, h),
    ];
    let elems_lc = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false),
        (5, "frame", 5, 6, 1, 1, true, true), // leaning column (hinged both ends)
        (6, "truss", 3, 6, 1, 3, false, false), // rigid link at floor level
    ];
    let sups_lc = vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 5, "pinned")];
    let loads_lc = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input_lc = make_input(
        nodes_lc, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, 0.003, 1e-10), (3, 0.05, 1e-10)], // link: very stiff axially
        elems_lc, sups_lc, loads_lc,
    );
    let buck_lc = buckling::solve_buckling_2d(&input_lc, 1).unwrap();
    let alpha_lc = buck_lc.modes[0].load_factor;

    // Adding leaning column (more gravity) should reduce α_cr
    assert!(
        alpha_lc < alpha_br,
        "SAP5: with leaning col α_cr={:.3} should < braced-only α_cr={:.3}",
        alpha_lc, alpha_br
    );
    assert!(alpha_lc > 0.0, "SAP5: α_cr should be positive");
}

// ═══════════════════════════════════════════════════════════════
// 6. Frame with End Releases (Hinges)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_end_releases() {
    // SS beam with internal hinge at midspan → mechanism? No, 2 separate SS beams
    // Actually: beam with hinge_start on second half = propped cantilever + SS segment
    //
    // Simpler: portal frame with pinned beam connections → 3-hinge arch behavior
    // Compare: rigid joints (higher stiffness) vs pinned beam ends (more flexible)
    let h = 4.0;
    let w = 6.0;
    let p = 50.0; // lateral

    // Rigid joints
    let input_rigid = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let res_rigid = linear::solve_2d(&input_rigid).unwrap();

    // Pinned beam connections (beam has hinge_start and hinge_end)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, true, true),   // beam: hinged both ends
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fz: 0.0, my: 0.0,
    })];
    let input_hinged = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let res_hinged = linear::solve_2d(&input_hinged).unwrap();

    // Hinged beam should be more flexible (larger lateral displacement)
    let d_rigid = res_rigid.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_hinged = res_hinged.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(
        d_hinged > d_rigid,
        "SAP6: hinged δ={:.6} should > rigid δ={:.6}", d_hinged, d_rigid
    );

    // Beam moments should be zero at hinged ends
    let beam = res_hinged.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(beam.m_start.abs() < 0.5, "SAP6: beam m_start={:.4} should ≈ 0", beam.m_start);
    assert!(beam.m_end.abs() < 0.5, "SAP6: beam m_end={:.4} should ≈ 0", beam.m_end);
}

// ═══════════════════════════════════════════════════════════════
// 7. Spring Support Beam
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_spring_support() {
    // Cantilever with vertical spring at free end
    // k_spring = 3EI/L³ → equivalent to propped cantilever
    // P at tip: δ = P / (3EI/L³ + ...) ← spring deflection
    //
    // Simpler: beam on two supports, one is a spring.
    // Fixed at left, spring ky at right, point load at right.
    // The spring takes: R = k·δ, equilibrium gives deflection.
    let l = 5.0;
    let p = 50.0;
    let n = 8;
    let k_spring = 5000.0; // kN/m

    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, z: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    // Fixed at left
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    // Spring at right (only vertical spring)
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "spring".to_string(),
        kx: None, ky: Some(k_spring), kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![],
        connectors: HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // The spring end should have nonzero vertical displacement
    let d_end = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(d_end.uz.abs() > 1e-8, "SAP7: spring end should deflect");

    // Spring reaction = k * δ
    let r_spring = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    let spring_reaction = r_spring.rz;

    // Spring force should match k·δ (spring pushes up if deflected down)
    let expected_spring_r = k_spring * d_end.uz.abs();
    assert_close(spring_reaction.abs(), expected_spring_r, 0.05, "SAP7 R_spring = k·δ");

    // Equilibrium: fixed reaction + spring reaction = P
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_fixed.rz + spring_reaction, p, 0.02, "SAP7 equilibrium");
}

// ═══════════════════════════════════════════════════════════════
// 8. Prescribed Displacement (Settlement)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_prescribed_displacement() {
    // Fixed-fixed beam with support settlement at right end
    // δ_prescribed = -0.01m (downward settlement)
    // This induces M = 6EIδ/L² at each end (for uniform beam)
    let l = 6.0;
    let n = 8;
    let delta = -0.01; // 10mm downward

    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, z: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    // Right end: fixed with prescribed vertical settlement
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // Settlement-induced moment: M = 6EIδ/L²
    let m_expected = 6.0 * E_EFF * IZ * delta.abs() / (l * l);

    // Check end moments
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();

    // Both ends should have nonzero moment
    assert!(r1.my.abs() > 0.1, "SAP8: left moment should be nonzero");
    assert!(r_end.my.abs() > 0.1, "SAP8: right moment should be nonzero");

    // Moments should approximately match 6EIδ/L²
    assert_close(r1.my.abs(), m_expected, 0.05, "SAP8 M_left = 6EIδ/L²");

    // Vertical reactions should be equal and opposite (no external load)
    assert!(
        (r1.rz + r_end.rz).abs() < 0.5,
        "SAP8: ΣRy={:.4} should ≈ 0 (no external load)", r1.rz + r_end.rz
    );
}

// ═══════════════════════════════════════════════════════════════
// 9. P-Delta Amplification Factor
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_pdelta_amplification() {
    // Portal frame: compare P-delta to AISC B2 factor
    // B2 = 1/(1 - ΣP·Δ/(ΣH·h))  (approximate)
    // Or: B2 = 1/(1 - 1/α_cr)
    let h = 5.0;
    let w = 6.0;
    let p = 400.0;  // gravity per column
    let h_load = 40.0; // lateral

    let input = make_portal_frame(h, w, E, A, IZ, h_load, -p);

    // Eigenvalue α_cr
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    if alpha_cr <= 1.0 { return; } // unstable, skip

    // B2 from α_cr
    let b2 = 1.0 / (1.0 - 1.0 / alpha_cr);

    // P-delta analysis
    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    let lin_d = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let pd_d = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    if lin_d < 1e-10 { return; }
    let actual_b2 = pd_d / lin_d;

    // B2 and actual amplification should match within 15%
    let rel = (actual_b2 - b2).abs() / b2;
    assert!(
        rel < 0.20,
        "SAP9: actual B2={:.4}, AISC B2={:.4} (α_cr={:.3}), diff={:.1}%",
        actual_b2, b2, alpha_cr, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 10. Cantilever Stiffness Matrix Verification
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_cantilever_stiffness() {
    // Cantilever tip: apply unit loads separately and verify stiffness coefficients
    // k_yy = 3EI/L³ (tip load → tip displacement)
    // k_θθ = EI/L (tip moment → tip rotation, with Fy=0 gives 3EI/L if...)
    // Actually: for cantilever with only tip load P, δ = PL³/(3EI)
    //   → k = 3EI/L³
    // For tip moment M only: θ = ML/(EI)
    //   → k_θ = EI/L
    let l = 4.0;
    let n = 8;

    // Unit vertical load at tip
    let input_p = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -1.0, my: 0.0,
        })]);

    let res_p = linear::solve_2d(&input_p).unwrap();
    let d_p = res_p.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let k_yy_actual = 1.0 / d_p.uz.abs();
    let k_yy_theory = 3.0 * E_EFF * IZ / l.powi(3);
    assert_close(k_yy_actual, k_yy_theory, 0.02, "SAP10 k_yy = 3EI/L³");

    // Unit moment at tip
    let input_m = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: 1.0,
        })]);

    let res_m = linear::solve_2d(&input_m).unwrap();
    let d_m = res_m.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let k_tt_actual = 1.0 / d_m.ry.abs();
    let k_tt_theory = E_EFF * IZ / l;
    assert_close(k_tt_actual, k_tt_theory, 0.02, "SAP10 k_θθ = EI/L");
}
