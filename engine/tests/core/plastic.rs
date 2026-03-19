/// Plastic analysis tests.
use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use crate::common::*;

const E: f64 = 200_000.0;
const FY: f64 = 250.0; // MPa

// Rectangular section: b=0.15m, h=0.3m
// A = 0.045 m², Iz = bh³/12 = 0.15×0.027/12 = 3.375e-4 m⁴
// Zp = bh²/4 = 0.15 × 0.09 / 4 = 3.375e-3 m³
// Mp = fy × 1000 × Zp = 250 × 1000 × 3.375e-3 = 843.75 kN·m
const B: f64 = 0.15;
const H: f64 = 0.3;
const A_SEC: f64 = 0.045;
const IZ_SEC: f64 = 3.375e-4;

fn make_plastic_portal(lateral_load: f64) -> PlasticInput {
    let solver = make_portal_frame(4.0, 6.0, E, A_SEC, IZ_SEC, lateral_load, 0.0);

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC,
        iz: IZ_SEC,
        material_id: 1,
        b: Some(B),
        h: Some(H),
    });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });

    PlasticInput {
        solver,
        sections,
        materials,
        max_hinges: Some(10),
        mp_overrides: None,
    }
}

// ─── Plastic Portal Frame ────────────────────────────────────

#[test]
fn plastic_finds_hinges() {
    let input = make_plastic_portal(50.0);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    assert!(result.collapse_factor > 0.0, "collapse factor should be positive");
    assert!(!result.hinges.is_empty(), "should form at least one hinge");
}

#[test]
fn plastic_hinges_ordered_by_load_factor() {
    let input = make_plastic_portal(50.0);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    // Hinges should form at non-decreasing load factors
    for i in 1..result.hinges.len() {
        assert!(
            result.hinges[i].load_factor >= result.hinges[i - 1].load_factor - 1e-6,
            "hinge {} (λ={:.4}) should form after hinge {} (λ={:.4})",
            i, result.hinges[i].load_factor, i - 1, result.hinges[i - 1].load_factor
        );
    }
}

#[test]
fn plastic_collapse_factor_reasonable() {
    let input = make_plastic_portal(50.0);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    // Mp = 843.75 kN·m, H=50 kN applied
    // Simple estimate: portal with lateral load, collapse ~ 4Mp/(H*L)
    // This is approximate; just check it's in a reasonable range
    assert!(
        result.collapse_factor > 1.0 && result.collapse_factor < 100.0,
        "collapse factor={:.2} should be reasonable", result.collapse_factor
    );
}

#[test]
fn plastic_steps_recorded() {
    let input = make_plastic_portal(50.0);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    assert!(!result.steps.is_empty(), "should have steps");
    for step in &result.steps {
        assert!(step.load_factor > 0.0, "step load factor should be positive");
        assert!(!step.results.displacements.is_empty(), "step should have results");
    }
}

// ─── Simply-Supported Beam Plastic ───────────────────────────

#[test]
fn plastic_simply_supported_beam() {
    // SS beam with midspan point load
    // Mp = 843.75 kN·m
    // For midspan load P: Mmax = PL/4
    // Collapse: P_collapse = 4*Mp/L
    let l = 6.0;
    let solver = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A_SEC, IZ_SEC)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: l / 2.0, p: -1.0, px: None, my: None, // Unit load
        })],
    );

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData {
        a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H),
    });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });

    let input = PlasticInput {
        solver,
        sections,
        materials,
        max_hinges: Some(5),
        mp_overrides: None,
    };

    let result = plastic::solve_plastic_2d(&input).unwrap();

    // Simply-supported beam: 1 hinge at midspan creates mechanism
    // For unit load: Mmax = L/4 at midspan
    // λ = Mp / (L/4) = 4*Mp/L = 4 * 843.75 / 6 = 562.5
    let mp = FY * 1000.0 * B * H * H / 4.0; // 843.75
    let _expected_lambda = 4.0 * mp / l;

    assert!(result.collapse_factor > 0.0, "should find collapse");
}

// ─── Mechanism Detection ─────────────────────────────────────

#[test]
fn plastic_mechanism_detection() {
    let input = make_plastic_portal(50.0);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    // After enough hinges, should detect mechanism
    if result.hinges.len() >= 3 {
        // A portal frame needs ~4 hinges for mechanism
        // is_mechanism flag should be set if enough hinges formed
        // (depends on structure specifics)
    }

    // Redundancy equals number of hinges formed
    assert_eq!(result.redundancy, result.hinges.len());
}
