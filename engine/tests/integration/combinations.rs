//! Data-fidelity tests for load combination assembly.
//!
//! A combination is a linear superposition of solved load cases. Two properties
//! must hold and are asserted here:
//!
//! 1. **Load metadata survives.** `ElementForces` carries the member loads that
//!    produced it (`point_loads`, `distributed_loads`); the diagram evaluator
//!    needs them to reconstruct interior values between the end forces. A
//!    combination that keeps the end forces but drops the member loads yields
//!    correct values at t=0 and t=1 and wrong values everywhere between.
//! 2. **Contributions land on the element they came from.** Cases are matched
//!    by `element_id` / `node_id`, never by position in the vector.

use dedaliano_engine::postprocess::combinations::*;
use dedaliano_engine::postprocess::diagrams::compute_diagram_value_at;
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ==================== Fixtures ====================

/// Simply supported beam, 6 m span, single element, pinned–roller.
fn simply_supported_beam() -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 6.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e9, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.05, iz: 1.0e-4, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1,
        elem_type: "frame".to_string(),
        node_i: 1,
        node_j: 2,
        material_id: 1,
        section_id: 1,
        hinge_start: false,
        hinge_end: false,
    });

    let sup = |id: usize, node_id: usize, ty: &str| SolverSupport {
        id, node_id, support_type: ty.to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    };

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup(1, 1, "pinned"));
    supports.insert("2".to_string(), sup(2, 2, "rollerX"));

    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![], connectors: HashMap::new(), solver_options: None,
    }
}

fn ef(element_id: usize, m_start: f64) -> ElementForces {
    ElementForces {
        element_id,
        n_start: 0.0, n_end: 0.0,
        v_start: 0.0, v_end: 0.0,
        m_start, m_end: 0.0,
        length: 1.0,
        q_i: 0.0, q_j: 0.0,
        point_loads: Vec::new(),
        distributed_loads: Vec::new(),
        hinge_start: false, hinge_end: false,
    }
}

fn results_with(element_forces: Vec<ElementForces>) -> AnalysisResults {
    AnalysisResults {
        displacements: vec![],
        reactions: vec![],
        element_forces,
        constraint_forces: vec![],
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        result_summary: None,
        solver_run_meta: None,
    }
}

// ==================== Tests ====================

/// A unit-factor combination of a single case must reproduce that case's
/// moment diagram everywhere, not just at the element ends.
///
/// Midspan point load P on a simply supported span: M(L/2) = P·L/4.
/// With P = 12 kN and L = 6 m that is 18 kN·m. The end forces alone imply a
/// linear diagram and would give 0 at midspan.
#[test]
fn combination_preserves_member_point_loads_in_2d_diagram() {
    let mut input = simply_supported_beam();
    input.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1,
        a: 3.0,
        p: -12_000.0,
        px: None,
        my: None,
    })];

    let case = solve_2d(&input).expect("solve_2d failed");
    let case_ef = &case.element_forces[0];
    assert_eq!(case_ef.point_loads.len(), 1, "solver must report the member point load");

    let case_mid = compute_diagram_value_at("moment", 0.5, case_ef);
    assert!(
        (case_mid.abs() - 18_000.0).abs() < 1.0,
        "single-case midspan moment should be P·L/4 = 18000 N·m, got {case_mid:.1}"
    );

    let combined = combine_results(&CombinationInput {
        factors: vec![CombinationFactor { case_id: 0, factor: 1.0 }],
        cases: vec![CaseEntry { case_id: 0, results: case.clone() }],
    })
    .expect("combine_results returned None");

    let combined_ef = &combined.element_forces[0];
    assert_eq!(
        combined_ef.point_loads.len(), 1,
        "combination dropped the member point load"
    );

    let combined_mid = compute_diagram_value_at("moment", 0.5, combined_ef);
    assert!(
        (combined_mid - case_mid).abs() < 1e-6,
        "1.0-factor combination must reproduce the case diagram at midspan: \
         combined {combined_mid:.1} vs case {case_mid:.1}"
    );
}

/// Point load magnitudes must scale with the combination factor.
#[test]
fn combination_scales_member_point_loads_by_factor() {
    let mut input = simply_supported_beam();
    input.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: 3.0, p: -12_000.0, px: None, my: None,
    })];
    let case = solve_2d(&input).expect("solve_2d failed");

    let combined = combine_results(&CombinationInput {
        factors: vec![CombinationFactor { case_id: 0, factor: 1.6 }],
        cases: vec![CaseEntry { case_id: 0, results: case.clone() }],
    })
    .expect("combine_results returned None");

    let pl = &combined.element_forces[0].point_loads;
    assert_eq!(pl.len(), 1, "combination dropped the member point load");
    assert!(
        (pl[0].p - 1.6 * -12_000.0).abs() < 1e-6,
        "point load must scale by the factor: got {}", pl[0].p
    );
    assert!((pl[0].a - 3.0).abs() < 1e-12, "point load position must not scale");

    let mid = compute_diagram_value_at("moment", 0.5, &combined.element_forces[0]);
    assert!(
        (mid.abs() - 1.6 * 18_000.0).abs() < 1.0,
        "1.6·(P·L/4) = 28800 N·m expected, got {mid:.1}"
    );
}

/// Cases may list their element forces in any order. Each case's contribution
/// must be added to the element it belongs to, matched by `element_id`.
#[test]
fn combination_matches_cases_by_element_id_not_position() {
    // Case A lists elements 1,2; case B lists them reversed.
    let case_a = results_with(vec![ef(1, 100.0), ef(2, 200.0)]);
    let case_b = results_with(vec![ef(2, 20.0), ef(1, 10.0)]);

    let combined = combine_results(&CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 0, factor: 1.0 },
            CombinationFactor { case_id: 1, factor: 1.0 },
        ],
        cases: vec![
            CaseEntry { case_id: 0, results: case_a },
            CaseEntry { case_id: 1, results: case_b },
        ],
    })
    .expect("combine_results returned None");

    let m = |id: usize| {
        combined.element_forces.iter()
            .find(|e| e.element_id == id)
            .unwrap_or_else(|| panic!("element {id} missing from combination"))
            .m_start
    };

    assert!((m(1) - 110.0).abs() < 1e-12, "element 1 should be 100+10, got {}", m(1));
    assert!((m(2) - 220.0).abs() < 1e-12, "element 2 should be 200+20, got {}", m(2));
}

/// Same requirement for nodal quantities.
#[test]
fn combination_matches_reactions_by_node_id_not_position() {
    let mk = |entries: Vec<(usize, f64)>| {
        let mut r = results_with(vec![]);
        r.reactions = entries.into_iter()
            .map(|(node_id, rz)| Reaction { node_id, rx: 0.0, rz, my: 0.0 })
            .collect();
        r
    };

    let combined = combine_results(&CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 0, factor: 1.0 },
            CombinationFactor { case_id: 1, factor: 1.0 },
        ],
        cases: vec![
            CaseEntry { case_id: 0, results: mk(vec![(1, 5.0), (2, 7.0)]) },
            CaseEntry { case_id: 1, results: mk(vec![(2, 0.7), (1, 0.5)]) },
        ],
    })
    .expect("combine_results returned None");

    let rz = |id: usize| {
        combined.reactions.iter()
            .find(|r| r.node_id == id)
            .unwrap_or_else(|| panic!("node {id} missing"))
            .rz
    };

    assert!((rz(1) - 5.5).abs() < 1e-12, "node 1 should be 5.0+0.5, got {}", rz(1));
    assert!((rz(2) - 7.7).abs() < 1e-12, "node 2 should be 7.0+0.7, got {}", rz(2));
}
