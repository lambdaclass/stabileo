/// Validation: Thermal loads and prescribed displacement (settlement) solutions.
///
/// Reference: Ghali/Neville *Structural Analysis*, Timoshenko *Strength of Materials*
///
/// α = 12e-6 /°C (hardcoded steel in engine)
/// Section height h = √(12·Iz/A) for standard constants
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const EI: f64 = 20_000.0;
const L: f64 = 5.0;
const ALPHA: f64 = 12e-6;

// Section height derived same as engine: h = √(12·Iz/A)
const H_SEC: f64 = 0.3464; // √(12 * 1e-4 / 0.01) = √0.12

// EA in kN: E(MPa) * 1000(kN/m² per MPa) * A(m²) = 2,000,000 kN
const EA_KN: f64 = E * 1000.0 * A;

// ═══════════════════════════════════════════════════════════════
// 1. Simply-Supported, Uniform ΔT = 50°C
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_thermal_ss_uniform_free_expansion() {
    // SS beam: free to expand axially → N=0, δ_end = αΔTL = 12e-6 * 50 * 5 = 0.003m
    let dt = 50.0;
    let input = make_beam(8, L, E, A, IZ, "pinned", Some("rollerX"),
        (0..8).map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1, dt_uniform: dt, dt_gradient: 0.0,
        })).collect());
    let results = linear::solve_2d(&input).unwrap();

    // End node displacement: δ = αΔTL
    let end_node = 9;
    let d_end = results.displacements.iter().find(|d| d.node_id == end_node).unwrap();
    let expected_delta = ALPHA * dt * L;
    assert!(
        (d_end.ux.abs() - expected_delta).abs() < expected_delta * 0.05,
        "SS thermal δ_end={:.6}, expected={:.6}", d_end.ux, expected_delta
    );

    // No axial force (free expansion)
    for ef in &results.element_forces {
        assert!(
            ef.n_start.abs() < 1.0,
            "SS thermal: N should be ~0, got {:.4} on elem {}", ef.n_start, ef.element_id
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-Fixed, Uniform ΔT = 50°C
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_thermal_fixed_fixed_uniform() {
    // Fixed-fixed: no expansion → N = -EAαΔT = -2e6 * 12e-6 * 50 = -1200 kN
    let dt = 50.0;
    let input = make_beam(8, L, E, A, IZ, "fixed", Some("fixed"),
        (0..8).map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1, dt_uniform: dt, dt_gradient: 0.0,
        })).collect());
    let results = linear::solve_2d(&input).unwrap();

    // Zero displacement at all interior nodes (fully restrained)
    for d in &results.displacements {
        assert!(d.ux.abs() < 1e-6, "FF thermal: ux should be 0 at node {}", d.node_id);
    }

    // Axial force: N = -EAαΔT = -1200 kN (compression)
    let expected_n = EA_KN * ALPHA * dt;
    for ef in &results.element_forces {
        assert!(
            (ef.n_start.abs() - expected_n).abs() < expected_n * 0.02,
            "FF thermal: N={:.2}, expected ±{:.2}", ef.n_start, expected_n
        );
    }

    // Equilibrium: ΣRx = 0 (equal and opposite axial reactions)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 1.0, "FF thermal: ΣRx={:.4}, should be ~0", sum_rx);
}

// ═══════════════════════════════════════════════════════════════
// 3. Simply-Supported, Gradient ΔT = 30°C
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_thermal_ss_gradient() {
    // SS beam, thermal gradient: curvature κ = α·ΔT/h
    // δ_mid = κ·L²/8 = α·ΔT·L²/(8h)
    let dt_grad = 30.0;
    let input = make_beam(8, L, E, A, IZ, "pinned", Some("rollerX"),
        (0..8).map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1, dt_uniform: 0.0, dt_gradient: dt_grad,
        })).collect());
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection
    let d_mid = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let expected_delta = ALPHA * dt_grad * L * L / (8.0 * H_SEC);
    // Allow 10% tolerance (h approximation and mesh discretization)
    assert!(
        (d_mid.uy.abs() - expected_delta).abs() < expected_delta * 0.10,
        "SS gradient δ_mid={:.6}, expected={:.6}", d_mid.uy.abs(), expected_delta
    );

    // No moment (free curvature, isostatic)
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 2.0,
            "SS gradient: M should be ~0 (free curvature), got {:.4}", ef.m_start
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. Cantilever, Gradient ΔT = 30°C
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_thermal_cantilever_gradient() {
    // Cantilever, gradient: δ_tip = α·ΔT·L²/(2h)
    let dt_grad = 30.0;
    let input = make_beam(8, L, E, A, IZ, "fixed", None,
        (0..8).map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1, dt_uniform: 0.0, dt_gradient: dt_grad,
        })).collect());
    let results = linear::solve_2d(&input).unwrap();

    let d_tip = results.displacements.iter().find(|d| d.node_id == 9).unwrap();
    let expected_delta = ALPHA * dt_grad * L * L / (2.0 * H_SEC);
    assert!(
        (d_tip.uy.abs() - expected_delta).abs() < expected_delta * 0.10,
        "cantilever gradient δ_tip={:.6}, expected={:.6}", d_tip.uy.abs(), expected_delta
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Fixed-Fixed, Gradient ΔT = 30°C
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_thermal_fixed_fixed_gradient() {
    // Fixed-fixed, gradient: M_end = EI·α·ΔT/h
    let dt_grad = 30.0;
    let input = make_beam(8, L, E, A, IZ, "fixed", Some("fixed"),
        (0..8).map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1, dt_uniform: 0.0, dt_gradient: dt_grad,
        })).collect());
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let expected_m = EI * ALPHA * dt_grad / H_SEC;
    assert!(
        (r1.mz.abs() - expected_m).abs() < expected_m * 0.10,
        "FF gradient M={:.4}, expected={:.4}", r1.mz.abs(), expected_m
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Settlement: SS Beam — Roller Settlement
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_settlement_ss_roller() {
    // SS beam: roller settlement δ₀=0.01m
    // Isostatic → zero moments, rigid body tilt only
    let delta0 = 0.01;

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta0), drz: None, angle: None,
    });

    let mut nodes_map = HashMap::new();
    nodes_map.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes_map.insert("2".to_string(), SolverNode { id: 2, x: L, y: 0.0 });

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    elems_map.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Isostatic: zero internal forces
    let ef = &results.element_forces[0];
    assert!(ef.m_start.abs() < 0.5, "SS settlement: M_start should be ~0");
    assert!(ef.m_end.abs() < 0.5, "SS settlement: M_end should be ~0");
    assert!(ef.v_start.abs() < 0.5, "SS settlement: V should be ~0");
}

// ═══════════════════════════════════════════════════════════════
// 7. Settlement: Propped Cantilever
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_settlement_propped_cantilever() {
    // Propped cantilever, roller settlement δ₀=0.01
    // M_fixed = 3EIδ/(2L²) = 3*20000*0.01/(2*25) = 12.0 kN·m
    // R_roller = 3EIδ/L³ = 3*20000*0.01/125 = 4.8 kN
    let delta0 = 0.01;

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta0), drz: None, angle: None,
    });

    let mut nodes_map = HashMap::new();
    nodes_map.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes_map.insert("2".to_string(), SolverNode { id: 2, x: L, y: 0.0 });

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    elems_map.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let expected_m = 3.0 * EI * delta0 / (L * L);
    assert_close(r1.mz.abs(), expected_m, 0.05, "propped settlement M_fixed");

    let expected_r = 3.0 * EI * delta0 / (L.powi(3));
    assert_close(r1.ry.abs(), expected_r, 0.05, "propped settlement R_fixed");
}

// ═══════════════════════════════════════════════════════════════
// 8. Settlement: Fixed-Fixed
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_settlement_fixed_fixed() {
    // Fixed-fixed, end settlement δ₀=0.01
    // M = 6EIδ/L² = 6*20000*0.01/25 = 48.0 kN·m
    // V = 12EIδ/L³ = 12*20000*0.01/125 = 19.2 kN
    let l = 5.0;
    let n = 4_usize;
    let delta0 = 0.01;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..=n {
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, y: 0.0,
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
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta0), drz: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let expected_m = 6.0 * EI * delta0 / (l * l);
    let expected_v = 12.0 * EI * delta0 / (l.powi(3));
    assert_close(r1.mz.abs(), expected_m, 0.05, "FF settlement M");
    assert_close(r1.ry.abs(), expected_v, 0.05, "FF settlement V");
}

// ═══════════════════════════════════════════════════════════════
// 9. Thermal Equilibrium
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_thermal_equilibrium() {
    // Fixed-fixed with thermal: ΣR = 0 (self-equilibrating)
    let dt = 50.0;
    let input = make_beam(8, L, E, A, IZ, "fixed", Some("fixed"),
        (0..8).map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1, dt_uniform: dt, dt_gradient: 20.0,
        })).collect());
    let results = linear::solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_rx.abs() < 1.0, "thermal eq: ΣRx={:.4}", sum_rx);
    assert!(sum_ry.abs() < 1.0, "thermal eq: ΣRy={:.4}", sum_ry);
}

// ═══════════════════════════════════════════════════════════════
// 10. Superposition
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_thermal_settlement_superposition() {
    // Verify superposition: thermal + settlement = sum of individual
    // Fixed-fixed beam with both thermal and settlement applied together
    // vs. solving each separately and summing

    let l = 5.0;
    let n = 4_usize;
    let dt = 30.0;
    let delta0 = 0.005;
    let elem_len = l / n as f64;

    // Helper to build fixed-fixed multi-element beam input
    let build = |thermal: bool, settlement: bool| -> SolverInput {
        let loads: Vec<SolverLoad> = if thermal {
            (0..n).map(|i| SolverLoad::Thermal(SolverThermalLoad {
                element_id: i + 1, dt_uniform: dt, dt_gradient: 0.0,
            })).collect()
        } else {
            vec![]
        };

        let dy = if settlement { Some(-delta0) } else { None };

        let mut nodes_map = HashMap::new();
        for i in 0..=n {
            nodes_map.insert((i + 1).to_string(), SolverNode {
                id: i + 1, x: i as f64 * elem_len, y: 0.0,
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
            dx: None, dy: None, drz: None, angle: None,
        });
        sups_map.insert("2".to_string(), SolverSupport {
            id: 2, node_id: n + 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy, drz: None, angle: None,
        });

        SolverInput { nodes: nodes_map, materials: mats_map, sections: secs_map,
                       elements: elems_map, supports: sups_map, loads, constraints: vec![],
                       connectors: HashMap::new(), }
    };

    let r_thermal = linear::solve_2d(&build(true, false)).unwrap();
    let r_settle = linear::solve_2d(&build(false, true)).unwrap();
    let r_both = linear::solve_2d(&build(true, true)).unwrap();

    // Superposition: reactions should sum
    let rx1_t = r_thermal.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rx1_s = r_settle.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rx1_b = r_both.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert!(
        (rx1_b.rx - (rx1_t.rx + rx1_s.rx)).abs() < 1.0,
        "superposition Rx: combined={:.2}, sum={:.2}", rx1_b.rx, rx1_t.rx + rx1_s.rx
    );
    assert!(
        (rx1_b.mz - (rx1_t.mz + rx1_s.mz)).abs() < 1.0,
        "superposition Mz: combined={:.2}, sum={:.2}", rx1_b.mz, rx1_t.mz + rx1_s.mz
    );
}
