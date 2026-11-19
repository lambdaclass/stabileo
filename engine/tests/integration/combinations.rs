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
        loads: vec![], constraints: vec![], connectors: HashMap::new(), solver_options: None, masses: Default::default(),
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
        distributed_loads: Vec::new(), distributed_loads_x: Vec::new(),
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

fn envelope_rows_2d(ids: [usize; 2], values: [f64; 2]) -> AnalysisResults {
    let mut result = results_with(ids.into_iter().zip(values).map(|(id, value)| ef(id, value)).collect());
    for (node_id, value) in ids.into_iter().zip(values) {
        result.displacements.push(Displacement { node_id, ux: value, uz: 0.0, ry: 0.0 });
        result.reactions.push(Reaction { node_id, rx: value, rz: 0.0, my: 0.0 });
    }
    result
}

fn envelope_rows_3d(ids: [usize; 2], values: [f64; 2]) -> AnalysisResults3D {
    let rows: Vec<_> = ids.into_iter().zip(values).collect();
    serde_json::from_value(serde_json::json!({
        "displacements": rows.iter().map(|&(id, value)| serde_json::json!({
            "nodeId": id, "ux": value, "uy": 0, "uz": 0, "rx": 0, "ry": 0, "rz": 0,
        })).collect::<Vec<_>>(),
        "reactions": rows.iter().map(|&(id, value)| serde_json::json!({
            "nodeId": id, "fx": value, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0,
        })).collect::<Vec<_>>(),
        "elementForces": rows.iter().map(|&(id, value)| serde_json::json!({
            "elementId": id, "length": 1, "nStart": value, "nEnd": value,
            "vyStart": 0, "vyEnd": 0, "vzStart": 0, "vzEnd": 0,
            "mxStart": 0, "mxEnd": 0, "myStart": 0, "myEnd": 0, "mzStart": 0, "mzEnd": 0,
            "qYI": 0, "qYJ": 0, "qZI": 0, "qZJ": 0,
            "distributedLoadsY": [], "pointLoadsY": [], "distributedLoadsZ": [], "pointLoadsZ": [],
        })).collect::<Vec<_>>(),
    })).unwrap()
}

#[test]
fn envelope_2d_matches_reordered_nodes_and_members() {
    let first = envelope_rows_2d([1, 2], [1.0, 2.0]);
    let ordered = envelope_rows_2d([1, 2], [-4.0, 3.0]);
    let reordered = envelope_rows_2d([2, 1], [3.0, -4.0]);
    let expected = compute_envelope(&[first.clone(), ordered]).unwrap();
    let actual = compute_envelope(&[first, reordered]).unwrap();
    assert_eq!(serde_json::to_value(actual).unwrap(), serde_json::to_value(&expected).unwrap());
    assert_eq!(expected.max_abs_results.displacements[0].ux, -4.0);
    assert_eq!(expected.max_abs_results.reactions[1].rx, 3.0);
    assert_eq!(expected.max_abs_results.element_forces[0].m_start, -4.0);
}

#[test]
fn envelope_3d_matches_reordered_nodes_and_members() {
    let first = envelope_rows_3d([1, 2], [1.0, 2.0]);
    let ordered = envelope_rows_3d([1, 2], [-4.0, 3.0]);
    let reordered = envelope_rows_3d([2, 1], [3.0, -4.0]);
    let expected = compute_envelope_3d(&[first.clone(), ordered]).unwrap();
    let actual = compute_envelope_3d(&[first, reordered]).unwrap();
    assert_eq!(serde_json::to_value(actual).unwrap(), serde_json::to_value(&expected).unwrap());
    assert_eq!(expected.max_abs_results_3d.displacements[0].ux, -4.0);
    assert_eq!(expected.max_abs_results_3d.reactions[1].fx, 3.0);
    assert_eq!(expected.max_abs_results_3d.element_forces[0].n_start, -4.0);
    assert_eq!(expected.axial.elements[0].element_id, 1);
    assert_eq!(expected.axial.elements[0].neg_values[0], -4.0);
}

fn corrupt_rows<T: Clone>(rows: &mut Vec<T>, shape: &str, id: impl Fn(&mut T) -> &mut usize) {
    match shape {
        "replaced" => *id(&mut rows[1]) = 9,
        "missing" => { rows.pop(); }
        "extra" => {
            let mut extra = rows[1].clone();
            *id(&mut extra) = 9;
            rows.push(extra);
        }
        "duplicate" => *id(&mut rows[1]) = 1,
        _ => unreachable!(),
    }
}

#[test]
fn envelope_2d_refuses_unmatched_rows() {
    for field in ["displacements", "reactions", "element forces"] {
        for shape in ["replaced", "missing", "extra", "duplicate"] {
            let first = envelope_rows_2d([1, 2], [1.0, 2.0]);
            let mut second = envelope_rows_2d([1, 2], [3.0, 4.0]);
            match field {
                "displacements" => corrupt_rows(&mut second.displacements, shape, |r| &mut r.node_id),
                "reactions" => corrupt_rows(&mut second.reactions, shape, |r| &mut r.node_id),
                _ => corrupt_rows(&mut second.element_forces, shape, |r| &mut r.element_id),
            }
            let error = compute_envelope(&[first, second]).expect_err("expected mismatched rows to be refused");
            assert!(error.contains(field) && error.contains("result 1"), "{shape}: {error}");
        }
    }
}

#[test]
fn envelope_and_combinations_3d_refuse_unmatched_rows() {
    for field in ["displacements", "reactions", "element forces"] {
        for shape in ["replaced", "missing", "extra", "duplicate"] {
            let first = envelope_rows_3d([1, 2], [1.0, 2.0]);
            let mut second = envelope_rows_3d([1, 2], [3.0, 4.0]);
            match field {
                "displacements" => corrupt_rows(&mut second.displacements, shape, |r| &mut r.node_id),
                "reactions" => corrupt_rows(&mut second.reactions, shape, |r| &mut r.node_id),
                _ => corrupt_rows(&mut second.element_forces, shape, |r| &mut r.element_id),
            }
            let cases = vec![
                CaseEntry3D { case_id: 1, results: first.clone() },
                CaseEntry3D { case_id: 2, results: second.clone() },
            ];
            let factors = vec![
                CombinationFactor { case_id: 1, factor: 1.0 },
                CombinationFactor { case_id: 2, factor: 1.0 },
            ];
            let errors = [
                compute_envelope_3d(&[first, second]).err(),
                combine_results_3d(&CombinationInput3D {
                    factors: factors.clone(), cases: cases.clone(), plate_thicknesses: vec![],
                }).err(),
                combine_results_batch_3d(&BatchCombinationInput3D {
                    combinations: vec![factors], cases, plate_thicknesses: vec![],
                }).err(),
            ];
            for (entry, error) in ["result 1", "case 2", "case 2"].into_iter().zip(errors) {
                let error = error.unwrap_or_else(|| panic!("{entry} accepted {shape} {field}"));
                assert!(error.contains(field) && error.contains(entry), "{shape}: {error}");
            }
        }
    }
}

#[test]
fn envelope_3d_refuses_duplicate_ids_in_the_first_result() {
    let duplicate = envelope_rows_3d([1, 1], [1.0, 2.0]);
    let error = compute_envelope_3d(&[duplicate]).expect_err("expected duplicate IDs to be refused");
    assert!(error.contains("result 0") && error.contains("duplicate node id 1"), "{error}");
}

#[test]
fn envelope_2d_refuses_unmatched_pdelta_results() {
    let input = serde_json::from_str(include_str!("../fixtures/ex-portal-frame-input.json")).unwrap();
    let solved = dedaliano_engine::solver::pdelta::solve_pdelta_2d(&input, 20, 1e-9).unwrap().results;
    let mut other = solved.clone();
    other.displacements.pop().unwrap();
    assert!(compute_envelope(&[solved.clone(), solved.clone()]).is_ok());
    let error = compute_envelope(&[solved, other]).unwrap_err();
    assert!(error.contains("result 1 displacements are missing node id"), "{error}");
}

#[test]
fn envelope_3d_refuses_unmatched_pdelta_results() {
    let input = serde_json::from_str(include_str!("../fixtures/ex-3d-portal-frame-input.json")).unwrap();
    let solved = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&input, 20, 1e-9).unwrap().results;
    let mut other = solved.clone();
    other.displacements.pop().unwrap();
    assert!(compute_envelope_3d(&[solved.clone(), solved.clone()]).is_ok());
    let error = compute_envelope_3d(&[solved, other]).unwrap_err();
    assert!(error.contains("result 1 displacements are missing node id"), "{error}");
}

fn assert_missing_case_coverage<T: serde::Serialize>(
    expected: &T,
    combine: impl Fn(Vec<CombinationFactor>, bool) -> Result<Option<T>, String>,
) {
    let known = CombinationFactor { case_id: 2, factor: 1.0 };
    let expected = serde_json::to_value(expected).unwrap();
    let answer = combine(vec![known.clone()], true).unwrap().unwrap();
    let answer = serde_json::to_value(answer).unwrap();
    assert_eq!(answer["displacements"], expected["displacements"]);

    for factor in [0.0, -0.0] {
        let missing = CombinationFactor { case_id: 99, factor };
        let combined = combine(vec![missing, known.clone()], true).unwrap().unwrap();
        assert_eq!(serde_json::to_value(combined).unwrap(), answer);
    }
    let refusal = "Cannot combine results: missing result for load case 99";
    for factor in [2.0, f64::from_bits(1), -f64::from_bits(1)] {
        let missing = CombinationFactor { case_id: 99, factor };
        assert_eq!(combine(vec![missing, known.clone()], true).err().as_deref(), Some(refusal));
    }
    let missing = CombinationFactor { case_id: 99, factor: 2.0 };
    assert_eq!(combine(vec![missing], false).err().as_deref(), Some(refusal));
}

#[test]
fn combinations_2d_refuse_missing_factored_cases() {
    let input = serde_json::from_str(include_str!("../fixtures/ex-portal-frame-input.json")).unwrap();
    let linear = solve_2d(&input).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_2d(&input, 20, 1e-9).unwrap().results;
    for result in [linear, nonlinear] {
        assert_missing_case_coverage(&result, |factors, has_result| {
            let cases = if has_result { vec![CaseEntry { case_id: 2, results: result.clone() }] } else { vec![] };
            combine_results_checked(&CombinationInput { factors, cases })
        });
    }
}

#[test]
fn combinations_2d_optional_api_refuses_missing_factored_cases() {
    let results = envelope_rows_2d([1, 2], [1.0, 2.0]);
    let factors = vec![
        CombinationFactor { case_id: 99, factor: 2.0 },
        CombinationFactor { case_id: 2, factor: 1.0 },
    ];
    let input = CombinationInput { factors, cases: vec![CaseEntry { case_id: 2, results: results.clone() }] };
    assert!(combine_results(&input).is_none());
    assert!(combine_results_refs(&input.factors, &[(2, &results)]).is_none());
}

fn assert_missing_case_coverage_3d(combine: impl Fn(CombinationInput3D) -> Result<Option<AnalysisResults3D>, String>) {
    let input = serde_json::from_str(include_str!("../fixtures/ex-3d-portal-frame-input.json")).unwrap();
    let linear = dedaliano_engine::solver::linear::solve_3d(&input).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&input, 20, 1e-9).unwrap().results;
    for result in [linear, nonlinear] {
        assert_missing_case_coverage(&result, |factors, has_result| {
            let cases = if has_result { vec![CaseEntry3D { case_id: 2, results: result.clone() }] } else { vec![] };
            combine(CombinationInput3D { factors, cases, plate_thicknesses: vec![] })
        });
    }
}

#[test]
fn combinations_3d_single_refuses_missing_factored_cases() {
    assert_missing_case_coverage_3d(|input| combine_results_3d(&input));
}

#[test]
fn combinations_3d_batch_refuses_missing_factored_cases() {
    assert_missing_case_coverage_3d(|input| {
        let batch = BatchCombinationInput3D {
            combinations: vec![input.factors],
            cases: input.cases,
            plate_thicknesses: input.plate_thicknesses,
        };
        Ok(combine_results_batch_3d(&batch)?.pop().unwrap())
    });
}

fn assert_repeated_case_screen(
    combine: impl Fn(Vec<CombinationFactor>, f64) -> (Option<f64>, Vec<StructuredDiagnostic>),
) {
    let limit = dedaliano_engine::known_issues::SECOND_ORDER_RATIO;
    let factors = |weights: &[f64]| weights.iter().map(|&factor| CombinationFactor { case_id: 2, factor }).collect();
    for (ratio, warns) in [(limit.next_down(), false), (limit, false), (limit.next_up(), true)] {
        let (screened, diagnostics) = combine(factors(&[1.0]), ratio);
        assert_eq!(screened, Some(ratio));
        assert_eq!(diagnostics.iter().any(|d| d.phase.as_deref() == Some("LIN-SECOND-ORDER")), warns);
        assert_eq!(combine(factors(&[0.5, 0.5]), ratio), (screened, diagnostics.clone()));
        assert_eq!(combine(factors(&[1.5, -0.5]), ratio), (screened, diagnostics));
    }
    let (screened, diagnostics) = combine(factors(&[0.5, -1.5]), limit);
    assert_eq!(screened, Some(limit));
    assert!(diagnostics.iter().any(|d| d.phase.as_deref() == Some("LIN-SECOND-ORDER-UNBOUNDED")));
}

#[test]
fn combinations_2d_screen_repeated_case_once() {
    let input = serde_json::from_str(include_str!("../fixtures/ex-portal-frame-input.json")).unwrap();
    let linear = solve_2d(&input).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_2d(&input, 20, 1e-9).unwrap().results;
    for result in [linear, nonlinear] {
        assert_repeated_case_screen(|factors, ratio| {
            let mut results = result.clone();
            results.result_summary.get_or_insert_with(Default::default).second_order_ratio = Some(ratio);
            results.structured_diagnostics.retain(|d| !d.phase.as_deref().is_some_and(|p| p.starts_with("LIN-SECOND-ORDER")));
            let input = CombinationInput { factors, cases: vec![CaseEntry { case_id: 2, results }] };
            let checked = combine_results_checked(&input).unwrap().unwrap();
            let optional = combine_results(&input).unwrap();
            let borrowed = combine_results_refs(&input.factors, &[(2, &input.cases[0].results)]).unwrap();
            assert_eq!(serde_json::to_value(&optional).unwrap(), serde_json::to_value(&checked).unwrap());
            assert_eq!(serde_json::to_value(&borrowed).unwrap(), serde_json::to_value(&checked).unwrap());
            (checked.result_summary.unwrap().second_order_ratio, checked.structured_diagnostics)
        });
    }
}

#[test]
fn combinations_3d_screen_repeated_case_once() {
    let input = serde_json::from_str(include_str!("../fixtures/ex-3d-portal-frame-input.json")).unwrap();
    let linear = dedaliano_engine::solver::linear::solve_3d(&input).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&input, 20, 1e-9).unwrap().results;
    for result in [linear, nonlinear] {
        assert_repeated_case_screen(|factors, ratio| {
            let mut results = result.clone();
            results.result_summary.get_or_insert_with(Default::default).second_order_ratio = Some(ratio);
            results.structured_diagnostics.retain(|d| !d.phase.as_deref().is_some_and(|p| p.starts_with("LIN-SECOND-ORDER")));
            let input = CombinationInput3D { factors, cases: vec![CaseEntry3D { case_id: 2, results }], plate_thicknesses: vec![] };
            let single = combine_results_3d(&input).unwrap().unwrap();
            let borrowed = combine_results_3d_refs(&input.factors, &[(2, &input.cases[0].results)]).unwrap().unwrap();
            let batch = BatchCombinationInput3D {
                combinations: vec![input.factors], cases: input.cases, plate_thicknesses: input.plate_thicknesses,
            };
            let batched = combine_results_batch_3d(&batch).unwrap().pop().unwrap().unwrap();
            assert_eq!(batched.result_summary.as_ref().unwrap().second_order_ratio, single.result_summary.as_ref().unwrap().second_order_ratio);
            assert_eq!(serde_json::to_value(&batched).unwrap(), serde_json::to_value(&single).unwrap());
            assert_eq!(serde_json::to_value(&borrowed).unwrap(), serde_json::to_value(&single).unwrap());
            (single.result_summary.unwrap().second_order_ratio, single.structured_diagnostics)
        });
    }
}

#[test]
fn combinations_preserve_distorted_quad_under_repeated_case_cancellation() {
    let model = serde_json::from_str(include_str!("../fixtures/distorted-single-quad-combination.json")).unwrap();
    let linear = dedaliano_engine::solver::linear::solve_3d(&model).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&model, 20, 1e-9).unwrap().results;
    for results in [linear, nonlinear] {
        assert_eq!(results.quad_stresses.len(), 1);
        assert!(results.displacements.iter().any(|d| d.uz != 0.0));
        assert!(results.reactions.iter().any(|r| r.fz != 0.0));
        assert!(results.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION")));
        let combine = |weights: &[f64]| {
            let factors: Vec<_> = weights.iter().map(|&factor| CombinationFactor { case_id: 1, factor }).collect();
            let cases = vec![CaseEntry3D { case_id: 1, results: results.clone() }];
            let case_refs = [(1, &results)];
            [
                combine_results_3d(&CombinationInput3D { factors: factors.clone(), cases: cases.clone(), plate_thicknesses: vec![] }),
                combine_results_3d_refs(&factors, &case_refs),
                combine_results_3d_refs_with_thickness(&factors, &case_refs, &PlateThicknesses::new()),
                combine_results_batch_3d(&BatchCombinationInput3D { combinations: vec![factors], cases, plate_thicknesses: vec![] })
                    .map(|mut batch| batch.pop().unwrap()),
            ]
        };
        let big = 2.0_f64.powi(54);
        let below = 1.0 - f64::EPSILON / 2.0;
        let above = 1.0 + f64::EPSILON;
        let cancellation: &[&[f64]] = &[&[big, 1.0, -big], &[f64::MAX, f64::MAX, 1.0, -f64::MAX, -f64::MAX]];
        for weights in cancellation {
            for (actual, control) in combine(weights).into_iter().zip(combine(&[1.0])) {
                let actual = actual.unwrap().unwrap();
                let control = control.unwrap().unwrap();
                assert_eq!(serde_json::to_value(actual).unwrap(), serde_json::to_value(control).unwrap());
            }
        }
        for (actual, control) in combine(&[big, below, -big]).into_iter().zip(combine(&[below])) {
            assert_eq!(serde_json::to_value(actual.unwrap()).unwrap(), serde_json::to_value(control.unwrap()).unwrap());
        }
        for refused in combine(&[big, above, -big]) {
            assert!(refused.unwrap_err().contains("SH-MITC4-DISTORTION"));
        }
    }
}

#[test]
fn combinations_preserve_2d_response_under_repeated_case_cancellation() {
    let model = serde_json::from_str(include_str!("../fixtures/ex-portal-frame-input.json")).unwrap();
    let linear = solve_2d(&model).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_2d(&model, 20, 1e-9).unwrap().results;
    for results in [linear, nonlinear] {
        assert!(results.displacements.iter().any(|d| d.ux != 0.0));
        assert!(results.reactions.iter().any(|r| r.rz != 0.0));
        let combine = |weights: &[f64]| {
            let factors: Vec<_> = weights.iter().map(|&factor| CombinationFactor { case_id: 1, factor }).collect();
            let input = CombinationInput { factors, cases: vec![CaseEntry { case_id: 1, results: results.clone() }] };
            [
                combine_results_checked(&input).unwrap().unwrap(),
                combine_results(&input).unwrap(),
                combine_results_refs(&input.factors, &[(1, &results)]).unwrap(),
            ]
        };
        let big = 2.0_f64.powi(54);
        for (actual, control) in combine(&[big, 1.0, -big]).into_iter().zip(combine(&[1.0])) {
            assert_eq!(serde_json::to_value(actual).unwrap(), serde_json::to_value(control).unwrap());
        }
    }
}

#[test]
fn combinations_report_planar_net_factor_overflow_before_recovery() {
    let input = serde_json::from_str(include_str!("../fixtures/ex-portal-frame-input.json")).unwrap();
    let linear = solve_2d(&input).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_2d(&input, 20, 1e-9).unwrap().results;
    for results in [linear, nonlinear] {
        let combine = |weights: &[f64]| {
            let factors = weights.iter().map(|&factor| CombinationFactor { case_id: 1, factor }).collect();
            let input = CombinationInput { factors, cases: vec![CaseEntry { case_id: 1, results: results.clone() }] };
            let checked = combine_results_checked(&input);
            let owned = combine_results(&input);
            let borrowed = combine_results_refs(&input.factors, &[(1, &results)]);
            (checked, owned, borrowed)
        };
        let control = serde_json::to_value(combine(&[1.0]).0.unwrap().unwrap()).unwrap();
        let (checked, owned, borrowed) = combine(&[0.5, 0.5]);
        for result in [checked.unwrap(), owned, borrowed] {
            assert_eq!(serde_json::to_value(result.unwrap()).unwrap(), control);
        }

        let (checked, owned, borrowed) = combine(&[f64::MAX, f64::MAX]);
        assert!(owned.is_none());
        assert!(borrowed.is_none());
        assert_eq!(
            checked.unwrap_err(),
            "Cannot combine results: load case 1 has a non-finite number at net factor=inf",
        );
    }
}

#[test]
fn combinations_report_spatial_net_factor_overflow_before_recovery() {
    let input = serde_json::from_str(include_str!("../fixtures/ex-3d-portal-frame-input.json")).unwrap();
    let linear = dedaliano_engine::solver::linear::solve_3d(&input).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&input, 20, 1e-9).unwrap().results;
    for results in [linear, nonlinear] {
        let combine = |weights: &[f64]| {
            let factors: Vec<_> = weights.iter().map(|&factor| CombinationFactor { case_id: 1, factor }).collect();
            let cases = vec![CaseEntry3D { case_id: 1, results: results.clone() }];
            let case_refs = [(1, &results)];
            [
                combine_results_3d(&CombinationInput3D { factors: factors.clone(), cases: cases.clone(), plate_thicknesses: vec![] }),
                combine_results_3d_refs(&factors, &case_refs),
                combine_results_3d_refs_with_thickness(&factors, &case_refs, &PlateThicknesses::new()),
                combine_results_batch_3d(&BatchCombinationInput3D { combinations: vec![factors], cases, plate_thicknesses: vec![] })
                    .map(|mut batch| batch.pop().unwrap()),
            ]
        };
        let [control, ..] = combine(&[1.0]);
        let control = serde_json::to_value(control.unwrap().unwrap()).unwrap();
        for result in combine(&[0.5, 0.5]) {
            assert_eq!(serde_json::to_value(result.unwrap().unwrap()).unwrap(), control);
        }
        let errors = combine(&[f64::MAX, f64::MAX]).map(|result| result.unwrap_err());
        assert_eq!(
            errors,
            ["Cannot combine results: load case 1 has a non-finite number at net factor=inf"; 4],
        );
    }
}

#[test]
fn issue_2292_planar_combination_refuses_complete_case_cancellation() {
    let model = serde_json::from_str(include_str!("../fixtures/ex-portal-frame-input.json")).unwrap();
    let linear = solve_2d(&model).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_2d(&model, 20, 1e-9).unwrap().results;
    for results in [linear, nonlinear] {
        let input = |weights: &[f64]| CombinationInput {
            factors: weights.iter().map(|&factor| CombinationFactor { case_id: 1, factor }).collect(),
            cases: vec![CaseEntry { case_id: 1, results: results.clone() }],
        };
        let admitted = combine_results_checked(&input(&[1.0])).unwrap().unwrap();
        assert!(admitted.displacements.iter().any(|d| d.uz != 0.0));
        for residual in [-f64::EPSILON, f64::EPSILON] {
            let split = combine_results_checked(&input(&[1.0, -1.0 + residual])).unwrap().unwrap();
            let single = combine_results_checked(&input(&[residual])).unwrap().unwrap();
            assert_eq!(serde_json::to_value(split).unwrap(), serde_json::to_value(single).unwrap());
        }
        let cancelled = input(&[1.0, -1.0]);
        assert!(combine_results_checked(&cancelled).unwrap_err().contains("cancel to zero"));
        assert!(combine_results(&cancelled).is_none());
        assert!(combine_results_refs(&cancelled.factors, &[(1, &results)]).is_none());
    }
}

#[test]
fn issue_2292_spatial_combination_refuses_complete_case_cancellation() {
    let model = serde_json::from_str(include_str!("../fixtures/distorted-single-quad-combination.json")).unwrap();
    let linear = dedaliano_engine::solver::linear::solve_3d(&model).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&model, 20, 1e-9).unwrap().results;
    for results in [linear, nonlinear] {
        let combine = |weights: &[f64]| {
            let factors: Vec<_> = weights.iter().map(|&factor| CombinationFactor { case_id: 1, factor }).collect();
            let cases = vec![CaseEntry3D { case_id: 1, results: results.clone() }];
            let refs = [(1, &results)];
            [
                combine_results_3d(&CombinationInput3D { factors: factors.clone(), cases: cases.clone(), plate_thicknesses: vec![] }),
                combine_results_3d_refs(&factors, &refs),
                combine_results_3d_refs_with_thickness(&factors, &refs, &PlateThicknesses::new()),
                combine_results_batch_3d(&BatchCombinationInput3D { combinations: vec![factors], cases, plate_thicknesses: vec![] })
                    .map(|mut batch| batch.pop().unwrap()),
            ]
        };
        for control in combine(&[1.0]) {
            assert!(control.unwrap().unwrap().displacements.iter().any(|d| d.uz != 0.0));
        }
        for refused in combine(&[1.0, -1.0]) {
            assert!(refused.unwrap_err().contains("cancel to zero"));
        }
    }
}

fn factors_with_unit_residual() -> [f64; 5] {
    let large = 2.0_f64.powi(110);
    let middle = 2.0_f64.powi(54);
    [large, middle, 1.0, -middle, -large]
}

#[test]
#[ignore = "known wrong result: #2292"]
fn issue_2292_planar_combination_sums_case_factors_exactly() {
    let model = serde_json::from_str(include_str!("../fixtures/ex-portal-frame-input.json")).unwrap();
    let linear = solve_2d(&model).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_2d(&model, 20, 1e-9).unwrap().results;
    for results in [linear, nonlinear] {
        let combine = |weights: &[f64]| {
            let factors = weights.iter().map(|&factor| CombinationFactor { case_id: 1, factor }).collect();
            let input = CombinationInput { factors, cases: vec![CaseEntry { case_id: 1, results: results.clone() }] };
            let checked = combine_results_checked(&input);
            let owned = combine_results(&input);
            let borrowed = combine_results_refs(&input.factors, &[(1, &results)]);
            (checked, owned, borrowed)
        };
        let (checked, owned, borrowed) = combine(&[1.0]);
        assert!(checked.as_ref().unwrap().as_ref().unwrap().displacements.iter().any(|d| d.uz != 0.0));
        let control = serde_json::to_value((checked, owned, borrowed)).unwrap();
        let weights = factors_with_unit_residual();
        let residual = serde_json::to_value(combine(&weights)).unwrap();
        let (refused, owned, borrowed) = combine(&[weights.as_slice(), &[-1.0]].concat());
        assert_eq!(refused.as_ref().err().map(String::as_str), Some("Repeated load case factors cancel to zero in this combination."));
        assert!(owned.is_none());
        assert!(borrowed.is_none());
        assert_eq!(residual, control);
    }
}

#[test]
#[ignore = "known wrong result: #2292"]
fn issue_2292_spatial_combination_sums_case_factors_exactly() {
    let model = serde_json::from_str(include_str!("../fixtures/distorted-single-quad-combination.json")).unwrap();
    let linear = dedaliano_engine::solver::linear::solve_3d(&model).unwrap();
    let nonlinear = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&model, 20, 1e-9).unwrap().results;
    for results in [linear, nonlinear] {
        let combine = |weights: &[f64]| {
            let factors: Vec<_> = weights.iter().map(|&factor| CombinationFactor { case_id: 1, factor }).collect();
            let cases = vec![CaseEntry3D { case_id: 1, results: results.clone() }];
            let refs = [(1, &results)];
            [
                combine_results_3d(&CombinationInput3D { factors: factors.clone(), cases: cases.clone(), plate_thicknesses: vec![] }),
                combine_results_3d_refs(&factors, &refs),
                combine_results_3d_refs_with_thickness(&factors, &refs, &PlateThicknesses::new()),
                combine_results_batch_3d(&BatchCombinationInput3D { combinations: vec![factors], cases, plate_thicknesses: vec![] })
                    .map(|mut batch| batch.pop().unwrap()),
            ]
        };
        let control = combine(&[1.0]);
        assert!(control.iter().all(|r| r.as_ref().unwrap().as_ref().unwrap().displacements.iter().any(|d| d.uz != 0.0)));
        let weights = factors_with_unit_residual();
        let residual = combine(&weights);
        let refused = combine(&[weights.as_slice(), &[-1.0]].concat());
        assert_eq!(
            refused.iter().map(|r| r.as_ref().err().map(String::as_str)).collect::<Vec<_>>(),
            [Some("Repeated load case factors cancel to zero in this combination."); 4],
        );
        assert_eq!(serde_json::to_value(residual).unwrap(), serde_json::to_value(control).unwrap());
    }
}

#[test]
fn issue_2292_native_solvers_validate_optional_support_springs() {
    use dedaliano_engine::solver::{cable, linear, ssi};

    let mut plane: SolverInput = serde_json::from_str(include_str!("../fixtures/ex-portal-frame-input.json")).unwrap();
    let mut space: SolverInput3D = serde_json::from_str(include_str!("../fixtures/ex-3d-portal-frame-input.json")).unwrap();
    for kx in [None, Some(0.0), Some(1.0), Some(f64::NAN), Some(f64::INFINITY), Some(f64::NEG_INFINITY)] {
        let mut plane_spring: SolverSupport = serde_json::from_value(serde_json::json!({
            "id": 2, "nodeId": 2, "type": "spring"
        })).unwrap();
        plane_spring.kx = kx;
        plane.supports.insert("spring".into(), plane_spring);
        let mut space_spring: SolverSupport3D = serde_json::from_value(serde_json::json!({
            "nodeId": 5, "rx": false, "ry": false, "rz": false, "rrx": false, "rry": false, "rrz": false
        })).unwrap();
        space_spring.kx = kx;
        space.supports.insert("spring".into(), space_spring);

        let results = [
            linear::solve_2d(&plane).map(|r| r.displacements.iter().any(|d| d.uz != 0.0)),
            cable::solve_cable_2d(&plane, &HashMap::new(), 50, 1e-6).map(|r| r.results.displacements.iter().any(|d| d.uz != 0.0)),
            ssi::solve_ssi_2d(&ssi::SSIInput { solver: plane.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-4 })
                .map(|r| r.results.displacements.iter().any(|d| d.uz != 0.0)),
            linear::solve_3d(&space).map(|r| r.displacements.iter().any(|d| d.uz != 0.0)),
            cable::solve_cable_3d(&space, &HashMap::new(), 50, 1e-6).map(|r| r.results.displacements.iter().any(|d| d.uz != 0.0)),
            ssi::solve_ssi_3d(&ssi::SSIInput3D { solver: space.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-4 })
                .map(|r| r.results.displacements.iter().any(|d| d.uz != 0.0)),
        ];
        for result in results {
            if kx.is_some_and(|k| !k.is_finite()) {
                assert!(result.unwrap_err().contains("numeric fields must be finite"));
            } else {
                assert!(result.unwrap());
            }
        }
    }
}
