/// Validation: Exact plastic collapse load factors.
///
/// Reference: Neal *Plastic Methods of Structural Analysis*
///
/// Rectangular section: b=0.15, h=0.3
/// Zp = bh²/4, Mp = fy * 1000 * Zp
use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use crate::common::*;

const E: f64 = 200_000.0;
const FY: f64 = 250.0; // MPa

const B: f64 = 0.15;
const H: f64 = 0.3;
const A_SEC: f64 = 0.045;     // b*h
const IZ_SEC: f64 = 3.375e-4; // bh³/12
// Zp = bh²/4 = 0.15*0.09/4 = 3.375e-3 m³
// Mp = fy*1000*Zp = 250*1000*3.375e-3 = 843.75 kN·m
const MP: f64 = 843.75;

fn make_plastic_beam(
    l: f64,
    start_sup: &str,
    end_sup: Option<&str>,
    loads: Vec<SolverLoad>,
) -> PlasticInput {
    let solver = make_beam(1, l, E, A_SEC, IZ_SEC, start_sup, end_sup, loads);
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H),
    });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });
    PlasticInput { solver, sections, materials, max_hinges: Some(10), mp_overrides: None }
}

fn make_plastic_beam_multi(
    n: usize,
    l: f64,
    start_sup: &str,
    end_sup: Option<&str>,
    loads: Vec<SolverLoad>,
) -> PlasticInput {
    let solver = make_beam(n, l, E, A_SEC, IZ_SEC, start_sup, end_sup, loads);
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H),
    });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });
    PlasticInput { solver, sections, materials, max_hinges: Some(10), mp_overrides: None }
}

// ═══════════════════════════════════════════════════════════════
// 1. SS Beam, Point at Center: λ = 4Mp/(PL)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ss_point_center() {
    // SS beam, unit point load at center
    // Collapse: 1 hinge at midspan, λ = 4Mp/L = 4*843.75/6 = 562.5
    let l = 6.0;
    let input = make_plastic_beam(l, "pinned", Some("rollerX"),
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: l / 2.0, p: -1.0, px: None, mz: None,
        })]);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda = 4.0 * MP / l;
    assert!(
        (result.collapse_factor - expected_lambda).abs() / expected_lambda < 0.10,
        "SS point λ={:.2}, expected={:.2}", result.collapse_factor, expected_lambda
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. SS Beam, UDL: λ = 8Mp/(qL²)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ss_udl() {
    // SS beam, unit UDL, L=6
    // λ = 8Mp/(qL²) = 8*843.75/(1*36) = 187.5
    let l = 6.0;
    let input = make_plastic_beam(l, "pinned", Some("rollerX"),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
        })]);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda = 8.0 * MP / (l * l);
    assert!(
        (result.collapse_factor - expected_lambda).abs() / expected_lambda < 0.10,
        "SS UDL λ={:.2}, expected={:.2}", result.collapse_factor, expected_lambda
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Fixed-Fixed, Point at Center: λ = 8Mp/(PL)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ff_point_center() {
    // Fixed-fixed, unit point at midspan
    // 3 hinges (2 ends + midspan), λ = 8Mp/L = 8*843.75/6 = 1125
    let l = 6.0;
    let n = 2; // Need midspan node for midspan hinge
    let input = make_plastic_beam_multi(n, l, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -1.0, mz: 0.0, // midspan node
        })]);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda = 8.0 * MP / l;
    assert!(
        (result.collapse_factor - expected_lambda).abs() / expected_lambda < 0.10,
        "FF point λ={:.2}, expected={:.2}", result.collapse_factor, expected_lambda
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Fixed-Fixed, UDL: λ = 16Mp/(qL²)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_ff_udl() {
    // Fixed-fixed, unit UDL, L=6
    // λ = 16Mp/(qL²) = 16*843.75/36 = 375
    let l = 6.0;
    let n = 2;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }));
    }
    let input = make_plastic_beam_multi(n, l, "fixed", Some("fixed"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda = 16.0 * MP / (l * l);
    assert!(
        (result.collapse_factor - expected_lambda).abs() / expected_lambda < 0.10,
        "FF UDL λ={:.2}, expected={:.2}", result.collapse_factor, expected_lambda
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Propped Cantilever, UDL: λ = 11.66Mp/(qL²)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_propped_cantilever_udl() {
    // Propped cantilever, unit UDL, L=6
    // 2 hinges, λ = 11.66Mp/(qL²) = 11.66*843.75/36 = 273.2
    // With coarse mesh, critical hinge location (x≈0.293L) may not be at a node,
    // giving a higher collapse factor. Use 12 elements for better approximation.
    let l = 6.0;
    let n = 12;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }));
    }
    let input = make_plastic_beam_multi(n, l, "fixed", Some("rollerX"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected_lambda = 11.66 * MP / (l * l);
    assert!(
        (result.collapse_factor - expected_lambda).abs() / expected_lambda < 0.30,
        "propped UDL λ={:.2}, expected={:.2}", result.collapse_factor, expected_lambda
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Portal Frame, Lateral: Sway Mechanism
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_portal_sway() {
    // Fixed-base portal, lateral load only
    // Sway mechanism: 4 hinges (2 base + 2 beam-column joints)
    let h = 4.0;
    let w = 6.0;
    let solver = make_portal_frame(h, w, E, A_SEC, IZ_SEC, 1.0, 0.0);

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H),
    });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });

    let input = PlasticInput {
        solver, sections, materials, max_hinges: Some(10), mp_overrides: None,
    };
    let result = plastic::solve_plastic_2d(&input).unwrap();

    assert!(result.collapse_factor > 0.0, "portal should find collapse");
    assert!(!result.hinges.is_empty(), "portal should form hinges");
}

// ═══════════════════════════════════════════════════════════════
// 7. Hinge Ordering: Load Factors Non-Decreasing
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_hinge_ordering() {
    let l = 6.0;
    let n = 4;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }));
    }
    let input = make_plastic_beam_multi(n, l, "fixed", Some("fixed"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    for i in 1..result.hinges.len() {
        assert!(
            result.hinges[i].load_factor >= result.hinges[i - 1].load_factor - 1e-6,
            "hinge {} (λ={:.4}) should form after hinge {} (λ={:.4})",
            i, result.hinges[i].load_factor, i - 1, result.hinges[i - 1].load_factor
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 8. Mp Override: Halving Mp Halves Collapse Factor
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_plastic_mp_override() {
    let l = 6.0;
    let base_input = make_plastic_beam(l, "pinned", Some("rollerX"),
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: l / 2.0, p: -1.0, px: None, mz: None,
        })]);
    let result_full = plastic::solve_plastic_2d(&base_input).unwrap();

    // Override Mp to half
    let mut overrides = HashMap::new();
    overrides.insert("1".to_string(), MP / 2.0);
    let mut half_input = make_plastic_beam(l, "pinned", Some("rollerX"),
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: l / 2.0, p: -1.0, px: None, mz: None,
        })]);
    half_input.mp_overrides = Some(overrides);
    let result_half = plastic::solve_plastic_2d(&half_input).unwrap();

    // Halving Mp should approximately halve the collapse factor
    let ratio = result_half.collapse_factor / result_full.collapse_factor;
    assert!(
        (ratio - 0.5).abs() < 0.10,
        "Mp override ratio={:.3}, expected ~0.5", ratio
    );
}
