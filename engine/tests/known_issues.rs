//! Containment of the known issues (src/known_issues.rs): a result the issue can make wrong
//! carries a `KnownIssue` warning naming it, and a result it cannot affect carries none.

use crate::common;
use common::{make_3d_beam, make_beam};
use dedaliano_engine::known_issues::{for_3d, Analysis};
use dedaliano_engine::solver::linear::{prepare_static_2d, solve_2d};
use dedaliano_engine::solver::constraints::{solve_constrained_2d, ConstrainedInput};
use dedaliano_engine::solver::ssi::{solve_ssi_2d, SSIInput, SoilSpring};
use dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d;
use dedaliano_engine::solver::soil_curves::SoilCurve;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;

fn ids(d: &[StructuredDiagnostic]) -> Vec<String> {
    d.iter().filter(|x| x.code == DiagnosticCode::KnownIssue).map(|x| x.phase.clone().unwrap_or_default()).collect()
}

/// The thermal defaults a result was solved with (#407 fixed FR-4: a load states α and depth).
fn assumed(d: &[StructuredDiagnostic]) -> Vec<String> {
    d.iter().filter(|x| x.code == DiagnosticCode::ThermalDefaultAssumed).map(|x| x.phase.clone().unwrap_or_default()).collect()
}

fn tip(fz: f64) -> Vec<SolverLoad> {
    vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz, my: 0.0 })]
}

#[test]
fn a_plain_frame_carries_no_known_issue() {
    let r = solve_2d(&make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, tip(-10.0))).unwrap();
    assert!(ids(&r.structured_diagnostics).is_empty(), "{:?}", ids(&r.structured_diagnostics));
}

#[test]
fn a_frame_temperature_load_is_no_known_issue_but_an_unstated_alpha_is_named() {
    let mut loads = tip(-10.0);
    loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: 2, dt_uniform: 20.0, dt_gradient: 0.0, alpha: None, depth: None }));
    let r = solve_2d(&make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, loads)).unwrap();
    assert!(!ids(&r.structured_diagnostics).contains(&"FR-4".to_string()), "FR-4 is fixed (#407)");
    let d = r.structured_diagnostics.iter().find(|x| x.code == DiagnosticCode::ThermalDefaultAssumed).expect("alpha assumed");
    assert_eq!((d.severity, d.phase.as_deref(), d.element_ids.clone()), (Severity::Warning, Some("alpha"), vec![2]));
    // Stated: nothing assumed.
    let mut loads = tip(-10.0);
    loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: 2, dt_uniform: 20.0, dt_gradient: 5.0, alpha: Some(1e-5), depth: Some(0.3) }));
    let r = solve_2d(&make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, loads)).unwrap();
    assert!(assumed(&r.structured_diagnostics).is_empty());
}

#[test]
fn material_nonlinear_results_are_flagged() {
    let input = NonlinearMaterialInput {
        solver: make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, tip(-100.0)),
        material_models: HashMap::from([("1".into(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: 250.0, alpha: Some(0.01) })]),
        section_capacities: HashMap::from([("1".into(), SectionCapacity { np: 11_250.0, mp: 843.75, zp: None })]),
        max_iter: 50,
        tolerance: 1e-8,
        n_increments: 5,
    };
    let r = solve_nonlinear_material_2d(&input).unwrap();
    assert!(ids(&r.results.structured_diagnostics).contains(&"NL-5".to_string()));
}

fn beam3d() -> SolverInput3D {
    make_3d_beam(4, 4.0, E, 0.3, 0.01, 1e-4, 1e-4, 1e-5, vec![true; 6], None, vec![])
}

#[test]
fn curved_shells_and_warped_mitc9_and_arches_are_flagged_only_when_present() {
    let base = beam3d();
    assert!(ids(&for_3d(&base, Analysis::Linear)).is_empty());

    // A curved shell is not flagged, heated or not: its moments are recovered and its
    // stresses subtract the free thermal strain (SH-6, #410, fixed).
    let mut s = base.clone();
    s.curved_shells.insert("7".into(), SolverCurvedShellElement { id: 7, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2, normals: None });
    assert!(ids(&for_3d(&s, Analysis::Linear)).is_empty());
    let d = dedaliano_engine::known_issues::loads_3d(&[SolverLoad3D::CurvedShellThermal(SolverPlateThermalLoad { element_id: 7, dt_uniform: 0.0, dt_gradient: 10.0, alpha: None })]);
    assert!(d.is_empty(), "{d:?}");

    // MITC9: warped geometry is no longer flagged (SH-7 fixed, #411).
    let add_nodes = |s: &mut SolverInput3D, pts: &[[f64; 3]]| {
        for (k, p) in pts.iter().enumerate() {
            let id = 100 + k;
            s.nodes.insert(id.to_string(), SolverNode3D { id, x: p[0], y: p[1], z: p[2] });
        }
    };
    let mut warped = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0], [0.5, 0.0, 0.0], [1.0, 0.5, 0.0], [0.5, 1.0, 0.0], [0.0, 0.5, 0.0], [0.5, 0.5, 0.0]];
    warped[8][2] = 0.2;
    let mut s = base.clone();
    add_nodes(&mut s, &warped);
    s.quad9s.insert("9".into(), SolverQuad9Element { id: 9, nodes: [100, 101, 102, 103, 104, 105, 106, 107, 108], material_id: 1, thickness: 0.1 });
    assert!(!ids(&for_3d(&s, Analysis::Linear)).contains(&"SH-7".to_string()), "a warped MITC9 is no longer flagged");

    // Arches are no longer flagged (SP-15, #418, fixed).
    let mut s = base;
    s.nodes.insert("200".into(), SolverNode3D { id: 200, x: 2.0, y: 0.0, z: 1.0 });
    s.curved_beams.push(CurvedBeamInput { node_start: 1, node_mid: 200, node_end: 5, material_id: 1, section_id: 1, num_segments: 4, hinge_start: false, hinge_end: false });
    assert!(!ids(&for_3d(&s, Analysis::Linear)).contains(&"SP-15".to_string()));
}

#[test]
fn cable_analysis_is_no_longer_flagged() {
    // SP-12 (#416) is fixed: the cable solve iterates on the chord law itself.
    assert!(!ids(&for_3d(&beam3d(), Analysis::Cable)).contains(&"SP-12".to_string()));
}

#[test]
fn a_load_case_solve_carries_the_warnings_of_its_load_set() {
    // Load-case analyses and WASM load sessions solve through the prepared path.
    let input = make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, vec![]);
    let prepared = prepare_static_2d(&input).unwrap();
    let thermal = vec![SolverLoad::Thermal(SolverThermalLoad { element_id: 3, dt_uniform: 10.0, dt_gradient: 0.0, alpha: None, depth: None })];
    let r = prepared.solve_loads(&thermal).unwrap();
    assert!(assumed(&r.structured_diagnostics).contains(&"alpha".to_string()));
    let r = prepared.solve_loads(&tip(-1.0)).unwrap();
    assert!(ids(&r.structured_diagnostics).is_empty() && assumed(&r.structured_diagnostics).is_empty(), "a mechanical load set carries none");
}

#[test]
fn ssi_results_carry_structural_warnings_once() {
    let mut loads = tip(-10.0);
    loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: 1, dt_uniform: 10.0, dt_gradient: 0.0, alpha: None, depth: None }));
    let input = SSIInput {
        solver: make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, loads),
        soil_springs: vec![SoilSpring { node_id: 3, direction: 0, curve: SoilCurve::Tz { t_ult: 40.0, z_ult: 0.005, perimeter: Some(1.885) }, tributary_length: 1.0 }],
        max_iter: 50,
        tolerance: 1e-8,
    };
    let r = solve_ssi_2d(&input).unwrap();
    let found = ids(&r.results.structured_diagnostics);
    // FR-4 (#407) and the soil curves AC-12/13/16 (SA-2026-017) are fixed: no known issue, and the
    // structural thermal default is attached once.
    assert!(found.is_empty(), "{found:?}");
    assert_eq!(assumed(&r.results.structured_diagnostics), vec!["alpha".to_string()], "attached once");
}

#[test]
fn a_direct_constrained_solve_carries_its_warnings_once() {
    let mut loads = tip(-10.0);
    loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: 1, dt_uniform: 10.0, dt_gradient: 0.0, alpha: None, depth: None }));
    let solver = make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, loads);
    let tie = Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 3, dofs: vec![1] });
    let ci = ConstrainedInput { solver: solver.clone(), constraints: vec![tie.clone()] };
    let dense = dedaliano_engine::solver::constraints::solve_constrained_2d_dense(&ci, &dedaliano_engine::solver::dof::DofNumbering::build_2d(&solver)).unwrap();
    assert!(ids(&dense.structured_diagnostics).contains(&"AC-PLANE-MAPPING".into()));
    let r = solve_constrained_2d(&ci).unwrap();
    assert!(ids(&r.structured_diagnostics).contains(&"AC-PLANE-MAPPING".into()));
    assert_eq!(assumed(&r.structured_diagnostics), vec!["alpha".to_string()]);
    // Through solve_2d (which delegates to the constrained solver): still once.
    let mut with = solver;
    with.constraints = vec![tie];
    let r = solve_2d(&with).unwrap();
    assert_eq!(assumed(&r.structured_diagnostics), vec!["alpha".to_string()]);
}

#[test]
fn constrained_2d_entry_points_refuse_a_withheld_result() {
    use dedaliano_engine::solver::constraints::contain_constrained_2d;
    let solver = make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, tip(-10.0));
    let tie = Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 3, dofs: vec![1] });
    let ci = ConstrainedInput { solver: solver.clone(), constraints: vec![tie] };
    let dofs = dedaliano_engine::solver::dof::DofNumbering::build_2d(&solver);
    for clean in [solve_constrained_2d(&ci).unwrap(), dedaliano_engine::solver::constraints::solve_constrained_2d_dense(&ci, &dofs).unwrap()] {
        assert_eq!(ids(&clean.structured_diagnostics), vec!["AC-PLANE-MAPPING".to_string()]);
        let again = contain_constrained_2d(&ci, clean.clone()).unwrap();
        assert_eq!(serde_json::to_value(&again).unwrap(), serde_json::to_value(&clean).unwrap());
        let mut withheld = clean;
        withheld.structured_diagnostics.push(dedaliano_engine::known_issues::diagnostic("PL-2D-INVARIANCE"));
        common::assert_containment(contain_constrained_2d(&ci, withheld), "PL-2D-INVARIANCE");
    }
}

#[test]
fn invariance_reported_seeds_are_flagged_or_refused() {
    for seed in [20800,20833,20865,20795,20756,20824,20840,20806] {
        let (mut input, _) = crate::fuzz_models::random_2d_model_rich(seed);
        if (seed - 20754) % 3 == 2 { crate::fuzz_models::add_random_constraints_2d(&mut input, seed); }
        if seed == 20806 {
            assert_eq!(solve_2d(&input).unwrap_err(), "Singular stiffness matrix — structure is a mechanism");
            continue;
        }
        match solve_2d(&input) {
            Ok(r) => {
                eprintln!("#762 2D/{seed}: {:?}", r.structured_diagnostics);
                assert!(ids(&r.structured_diagnostics).contains(&"NUM-INVARIANCE".into()), "2D/{seed}");
            }
            Err(e) => panic!("#762 2D/{seed}: expected NUM-INVARIANCE warning, got {e}"),
        }
    }
    for seed in [20761,20788] {
        let (mut input, _) = crate::fuzz_models::random_3d_model_rich(seed);
        if (seed - 20754) % 3 == 2 { crate::fuzz_models::add_random_constraints_3d(&mut input, seed); }
        if seed == 20761 {
            assert_eq!(dedaliano_engine::solver::linear::solve_3d(&input).unwrap_err(), "Singular stiffness matrix — structure is a mechanism");
            continue;
        }
        match dedaliano_engine::solver::linear::solve_3d(&input) {
            Ok(r) => {
                eprintln!("#762 3D/{seed}: {:?}", r.structured_diagnostics);
                assert!(ids(&r.structured_diagnostics).contains(&"NUM-INVARIANCE".into()), "3D/{seed}");
            }
            Err(e) => panic!("#762 3D/{seed}: expected NUM-INVARIANCE warning, got {e}"),
        }
    }
}

#[test]
fn mitc4_macneal_harder_contains_membrane_bending_only() {
    for shape in ["regular", "trapezoidal", "parallelogram"] {
        for direction in [0, 1, 2] {
            let mut input = beam3d();
            input.nodes.clear(); input.elements.clear(); input.supports.clear(); input.loads.clear();
            input.materials.get_mut("1").unwrap().e = 10000.0;
            input.materials.get_mut("1").unwrap().nu = 0.3;
            for i in 0..=6 {
                for j in 0..2 {
                    let shift = if i == 0 || i == 6 { 0.0 } else {
                        match shape {
                            "trapezoidal" => (if i % 2 == 1 { 0.1 } else { -0.1 }) * (if j == 0 { -1.0 } else { 1.0 }),
                            "parallelogram" => if j == 0 { -0.1 } else { 0.1 },
                            _ => 0.0,
                        }
                    };
                    let id = 1 + 2*i+j;
                    input.nodes.insert(id.to_string(), SolverNode3D { id, x: i as f64+shift, y: 0.2*j as f64, z: 0.0 });
                }
            }
            for i in 0..6 {
                let id = i+1;
                input.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [2*i+1,2*i+3,2*i+4,2*i+2], material_id:1, thickness:0.1 });
            }
            for id in [1,2] {
                input.supports.insert(id.to_string(), serde_json::from_value(serde_json::json!({"nodeId":id,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true})).unwrap());
            }
            for id in [13,14] {
                input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id:id, fx: if direction==0 {0.5} else {0.0}, fy:if direction==1 {0.5} else {0.0}, fz:if direction==2 {0.5} else {0.0}, mx:0.0,my:0.0,mz:0.0,bw:None }));
            }
            // A real cable between the restrained nodes forces the cable assembly path
            // without changing the shell's response.
            let mut cable = input.clone();
            let mut member = beam3d().elements["1"].clone();
            member.node_i = 1; member.node_j = 2; member.elem_type = "cable".into();
            cable.elements.insert("1".into(), member);
            let cable_result = dedaliano_engine::solver::cable::solve_cable_3d(&cable, &HashMap::new(), 20, 1e-6);
            if shape != "regular" && direction != 2 {
                common::assert_containment(cable_result, "SH-MITC4-DISTORTION");
                let plastic: PlasticInput3D = serde_json::from_value(serde_json::json!({"solver":input,"sections":{},"materials":{}})).unwrap();
                common::assert_containment(dedaliano_engine::solver::plastic::solve_plastic_3d(&plastic), "SH-MITC4-DISTORTION");
                common::assert_containment(dedaliano_engine::certify::plastic_3d::certify_plastic_3d(&plastic), "SH-MITC4-DISTORTION");
                common::assert_containment(dedaliano_engine::certify::plastic_bundle::export_plastic_bundle_3d(&plastic), "SH-MITC4-DISTORTION");
            } else {
                let cable_result = cable_result.unwrap();
                assert_warning(&cable_result.results.structured_diagnostics, "SH-MITC4-CONVERGENCE", 810.0);
                assert_eq!(ids(&cable_result.results.structured_diagnostics).contains(&"SH-MITC4-DISTORTION".into()), shape != "regular");
            }
            let result = dedaliano_engine::solver::linear::solve_3d(&input);
            if shape != "regular" && direction != 2 {
                common::assert_containment(result, "SH-MITC4-DISTORTION");
                use dedaliano_engine::solver::{constraints::{solve_constrained_3d, ConstrainedInput3D}, linear::prepare_static_3d, load_cases::{solve_multi_case_3d, MultiCaseInput3D, LoadCase3D, CombinationDef}};
                let tie: Constraint = serde_json::from_value(serde_json::json!({"type":"equalDOF","masterNode":13,"slaveNode":14,"dofs":[2]})).unwrap();
                let mut constrained = input.clone();
                constrained.constraints = vec![tie.clone()];
                let direct = ConstrainedInput3D { solver: input.clone(), constraints: vec![tie] };
                for (entry, result) in [
                    ("prepared", prepare_static_3d(&input).unwrap().solve_loads(&input.loads)),
                    ("pdelta", dedaliano_engine::solver::pdelta::solve_pdelta_3d(&input, 10, 1e-6).map(|r| r.results)),
                    ("winkler", dedaliano_engine::solver::winkler::solve_winkler_3d(&dedaliano_engine::solver::winkler::WinklerInput3D { solver: input.clone(), foundation_springs: vec![] })),
                    ("ssi", dedaliano_engine::solver::ssi::solve_ssi_3d(&dedaliano_engine::solver::ssi::SSIInput3D { solver: input.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-6 }).map(|r| r.results)),
                    ("contact", dedaliano_engine::solver::contact::solve_contact_3d(&serde_json::from_value(serde_json::json!({"solver": input})).unwrap()).map(|r| r.results)),
                    ("constrained direct", solve_constrained_3d(&direct)),
                    ("constrained dispatch", dedaliano_engine::solver::linear::solve_3d(&constrained)),
                ] {
                    eprintln!("{entry}: {shape} direction {direction}");
                    common::assert_containment(result, "SH-MITC4-DISTORTION");
                }
                if direction == 0 { continue; }
                for solver in [input.clone(), constrained] {
                    let cases = [(10000.0, 0.0), (-10000.0, 0.0), (0.0, 10000.0), (0.0, -10000.0)].into_iter().enumerate().map(|(i, (fx, fz))| {
                        let mut loads = input.loads.clone();
                        for load in &mut loads {
                            if let SolverLoad3D::Nodal(n) = load { n.fx = fx; n.fz = fz; }
                        }
                        LoadCase3D { name: i.to_string(), loads }
                    }).collect();
                    let multi = MultiCaseInput3D { solver, load_cases: cases, combinations: vec![CombinationDef { name: "cancel extension".into(), factors: [("0".into(), 1.0), ("1".into(), 1.0)].into() }] };
                    for case in &multi.load_cases {
                        let mut single = multi.solver.clone();
                        single.loads = case.loads.clone();
                        common::assert_containment(dedaliano_engine::solver::linear::solve_3d(&single), "SH-MITC4-DISTORTION");
                    }
                    common::assert_containment(solve_multi_case_3d(&multi), "SH-MITC4-DISTORTION");
                }

                // Influence ordinates must not turn a per-load refusal into zero,
                // with either a prepared matrix or direct constraint dispatch.
                for constraints in [vec![], constrained_constraints()] {
                    let mut traversed = input.clone();
                    let mut member = beam3d().elements["1"].clone();
                    member.node_i = 11; member.node_j = 13;
                    traversed.elements.insert("1".into(), member);
                    let section = traversed.sections.get_mut("1").unwrap();
                    section.a = 1e-9; section.iy = 1e-12; section.iz = 1e-12; section.j = 1e-12;
                    traversed.constraints = constraints;
                    let influence = serde_json::from_value(serde_json::json!({"solver":traversed,"quantity":"Fy","targetNodeId":1,"gravityDirection":"y","nPointsPerElement":2})).unwrap();
                    common::assert_containment(dedaliano_engine::postprocess::influence::compute_influence_line_3d(&influence), "SH-MITC4-DISTORTION");
                }

                // #798 pre-fix tip values: trapezoidal 0.0084, parallelogram 0.0104;
                // reference 0.1081. Retained for the eventual membrane formulation fix.
            } else {
                let result = result.unwrap_or_else(|e| panic!("{shape} direction {direction}: {e}"));
                assert_eq!(ids(&result.structured_diagnostics).contains(&"SH-MITC4-DISTORTION".into()), shape != "regular");
                assert!(result.structured_diagnostics.iter().all(|d| d.severity != Severity::Error));
                let single = dedaliano_engine::postprocess::combinations::compute_envelope_3d(std::slice::from_ref(&result)).unwrap().unwrap().max_abs_results_3d;
                let signs = |v: Vec<f64>| v.iter().any(|x| *x > 0.0) && v.iter().any(|x| *x < 0.0);
                assert!(shape == "regular" || signs(result.displacements.iter().flat_map(|d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]).collect()), "{shape}: a field with both signs");
                for (enveloped, solved) in [
                    (serde_json::to_value(&single.displacements), serde_json::to_value(&result.displacements)),
                    (serde_json::to_value(&single.reactions), serde_json::to_value(&result.reactions)),
                    (serde_json::to_value(&single.element_forces), serde_json::to_value(&result.element_forces)),
                ] {
                    assert_eq!(enveloped.unwrap(), solved.unwrap(), "{shape}: one result's envelope is that result, signs kept");
                }
                assert!(single.quad_stresses.is_empty() && single.plate_stresses.is_empty(), "no shell field is enveloped");
                let pair = dedaliano_engine::postprocess::combinations::compute_envelope_3d(&[result.clone(), result.clone()]);
                if shape == "regular" { assert!(pair.is_ok()); } else { common::assert_containment(pair, "SH-MITC4-DISTORTION"); }
                assert_warning(&result.structured_diagnostics, "SH-MITC4-CONVERGENCE", 810.0);
                let tip = result.displacements.iter().find(|d| d.node_id == 13).unwrap();
                let (published, reference) = [(tip.ux, 3.0e-5), (tip.uy, 0.1081), (tip.uz, 0.4321)][direction];
                assert!((published / reference - 1.0).abs() < 0.04, "{shape} direction {direction}: {published} vs {reference}");
                if direction == 2 {
                    let convergence = dedaliano_engine::postprocess::discretization::convergence::convergence_study_3d(
                        &input, &Default::default()).unwrap();
                    assert_eq!(ids(&convergence.structured_diagnostics).contains(&"SH-MITC4-DISTORTION".into()), shape != "regular");
                    let tip = result.displacements.iter().find(|d| d.node_id == 13).unwrap().uz;
                    assert!((tip / 0.4321 - 1.0).abs() < 0.04, "{shape}: {tip}");
                }
            }
        }
    }
}

#[test]
fn fiber_warning_is_only_on_unconverged_results() {
    use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_2d, FiberNonlinearInput};
    for max_iter in [0, 30] {
        let input = FiberNonlinearInput {
            solver: make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, tip(-10.0)),
            fiber_sections: HashMap::new(), n_integration_points: 5,
            max_iter, tolerance: 1e-10, n_increments: 1, modified_nr: false,
        };
        let r = solve_fiber_nonlinear_2d(&input).unwrap();
        assert_eq!(r.converged, max_iter != 0);
        let warning = r.results.structured_diagnostics.iter().find(|d| d.phase.as_deref() == Some("NL-17"));
        if r.converged { assert!(warning.is_none()); }
        else { assert_eq!(serde_json::to_value(warning.unwrap()).unwrap(), serde_json::to_value(dedaliano_engine::known_issues::diagnostic("NL-17")).unwrap()); }
    }
}

#[test]
fn combinations_and_envelopes_keep_known_issue_warnings() {
    use dedaliano_engine::postprocess::combinations::*;
    let mut r = dedaliano_engine::solver::linear::solve_3d(&beam3d()).unwrap();
    let warning = dedaliano_engine::known_issues::diagnostic("MD-ORTHOGONALITY");
    r.structured_diagnostics.push(warning.clone());
    let combined = combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 2.0 }], &[(1, &r)]).unwrap().unwrap();
    let check = |ds: &[StructuredDiagnostic]| {
        let d = ds.iter().find(|d| d.phase.as_deref() == Some("MD-ORTHOGONALITY")).expect("specific warning survives");
        assert_eq!(serde_json::to_value(d).unwrap(), serde_json::to_value(&warning).unwrap());
    };
    check(&combined.structured_diagnostics);
    check(&compute_envelope_3d(&[combined]).unwrap().unwrap().max_abs_results_3d.structured_diagnostics);
    let mut distorted = dedaliano_engine::known_issues::diagnostic("SH-MITC4-DISTORTION");
    distorted.severity = Severity::Warning;
    r.structured_diagnostics.push(distorted);
    let single = compute_envelope_3d(&[r.clone()]).unwrap().unwrap().max_abs_results_3d;
    assert!(single.displacements.iter().zip(&r.displacements).all(|(e, d)| e.uz == d.uz));
    assert!(single.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION") && d.severity == Severity::Warning));
    common::assert_containment(compute_envelope_3d(&[r.clone(), r.clone()]), "SH-MITC4-DISTORTION");
    let half = combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: -0.5 }], &[(1, &r)]).unwrap().unwrap();
    assert!(half.displacements.iter().zip(&r.displacements).all(|(h, d)| h.uz == -0.5 * d.uz));
    assert!(half.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION") && d.severity == Severity::Warning));
    let split = combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 0.6 }, CombinationFactor { case_id: 2, factor: -0.4 }], &[(1, &r), (2, &r)]).unwrap().unwrap();
    assert!(split.displacements.iter().zip(&r.displacements).all(|(h, d)| (h.uz - 0.2 * d.uz).abs() <= 1e-15 * d.uz.abs()));
    common::assert_containment(combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 0.6 }, CombinationFactor { case_id: 2, factor: 0.6 }], &[(1, &r), (2, &r)]), "SH-MITC4-DISTORTION");
    common::assert_containment(combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: f64::NAN }], &[(1, &r)]), "SH-MITC4-DISTORTION");
    let same = combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }], &[(1, &r)]).unwrap().unwrap();
    assert!(same.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION") && d.severity == Severity::Warning));
    assert!(same.displacements.iter().zip(&r.displacements).all(|(s, d)| s.uz == d.uz));
    common::assert_containment(combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 1.2 }], &[(1, &r)]), "SH-MITC4-DISTORTION");
    common::assert_containment(combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }, CombinationFactor { case_id: 1, factor: 1.0 }], &[(1, &r)]), "SH-MITC4-DISTORTION");
    common::assert_containment(combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }, CombinationFactor { case_id: 2, factor: 1.0 }], &[(1, &r), (2, &r)]), "SH-MITC4-DISTORTION");
    r.structured_diagnostics.last_mut().unwrap().severity = Severity::Error;
    common::assert_containment(compute_envelope_3d(&[r.clone()]), "SH-MITC4-DISTORTION");
    common::assert_containment(combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }], &[(1, &r)]), "SH-MITC4-DISTORTION");
}

#[test]
fn combinations_and_envelopes_2d_refuse_withheld_cases() {
    use dedaliano_engine::postprocess::combinations::*;
    let clean = solve_2d(&make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, tip(-10.0))).unwrap();
    let mut withheld = clean.clone();
    withheld.structured_diagnostics.push(dedaliano_engine::known_issues::diagnostic("PL-2D-INVARIANCE"));
    let input = |factor: f64| CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: 1.5 }, CombinationFactor { case_id: 2, factor }],
        cases: vec![CaseEntry { case_id: 1, results: clean.clone() }, CaseEntry { case_id: 2, results: withheld.clone() }],
    };
    common::assert_containment(combine_results_checked(&input(1.0)), "PL-2D-INVARIANCE");
    let combined = combine_results_checked(&input(0.0)).unwrap().unwrap();
    let reference = clean.displacements.iter().map(|d| 1.5 * d.uz);
    for (d, expected) in combined.displacements.iter().zip(reference) { assert_eq!(d.uz, expected); }
    common::assert_containment(compute_envelope_checked(&[clean.clone(), withheld.clone()]), "PL-2D-INVARIANCE");
    assert!(combine_results(&input(1.0)).is_none());
    assert!(combine_results_refs(&input(1.0).factors, &[(1, &clean), (2, &withheld)]).is_none());
    assert!(combine_results(&input(0.0)).is_some());
    assert!(compute_envelope(&[clean.clone(), withheld.clone()]).is_none());
    let mut warned = clean.clone();
    warned.structured_diagnostics.push(dedaliano_engine::known_issues::diagnostic("NL-DYNAMIC-GAPS"));
    let envelope = compute_envelope_checked(&[clean.clone(), warned]).unwrap().unwrap();
    assert!(envelope.max_abs_results.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("NL-DYNAMIC-GAPS")));
}

fn constrained_constraints() -> Vec<Constraint> {
    vec![serde_json::from_value(serde_json::json!({"type":"equalDOF","masterNode":13,"slaveNode":14,"dofs":[2]})).unwrap()]
}

#[test]
fn optional_solver_fallback_preserves_diagnostics() {
    use dedaliano_engine::known_issues::{optional_solve, refuse, diagnostic};
    let refusal = refuse(&[diagnostic("BU-BOUND")]).unwrap_err();
    assert_eq!(optional_solve::<()>(Err(refusal.clone())).unwrap_err(), refusal);
    assert!(optional_solve::<()>(Err("Singular stiffness matrix".into())).unwrap().is_none());
    assert_eq!(optional_solve(Ok(42)).unwrap(), Some(42));
}

#[test]
fn sampled_analyses_keep_solver_warnings() {
    use dedaliano_engine::postprocess::influence::{compute_influence_line, compute_influence_line_3d};
    use dedaliano_engine::solver::moving_loads::{solve_moving_loads_2d, solve_moving_loads_3d};
    let mut space = beam3d();
    space.materials.get_mut("1").unwrap().e = 1e-8;

    let mut plane = make_beam(2, 4.0, 1e-8, 0.01, 1e-5, "fixed", None, vec![]);
    plane.loads.clear();
    for (solver, dim) in [(serde_json::to_value(plane).unwrap(), 2), (serde_json::to_value(space).unwrap(), 3)] {
        let influence = serde_json::json!({"solver":solver,"quantity":if dim == 2 {"Rz"} else {"Fz"},"targetNodeId":1,"nPointsPerElement":2});
        let moving = serde_json::json!({"solver":solver,"train":{"name":"unit","axles":[{"offset":0.0,"weight":1.0}]},"step":1.0});
        let (i, m) = if dim == 2 {
            (compute_influence_line(&serde_json::from_value(influence).unwrap()).unwrap().structured_diagnostics,
             solve_moving_loads_2d(&serde_json::from_value(moving).unwrap()).unwrap().structured_diagnostics)
        } else {
            (compute_influence_line_3d(&serde_json::from_value(influence).unwrap()).unwrap().structured_diagnostics,
             solve_moving_loads_3d(&serde_json::from_value(moving).unwrap()).unwrap().structured_diagnostics)
        };
        assert!(ids(&i).contains(&"NUM-INVARIANCE".into()), "influence {dim}: {i:?}");
        assert!(ids(&m).contains(&"NUM-INVARIANCE".into()), "moving {dim}: {m:?}");
    }
}

fn assert_warning(ds: &[StructuredDiagnostic], id: &str, issue: f64) {
    let found: Vec<_> = ds.iter().filter(|d| d.phase.as_deref() == Some(id)).collect();
    assert_eq!(found.len(), 1, "{id}: {ds:?}");
    assert_eq!((found[0].code, found[0].severity, found[0].value),
        (DiagnosticCode::KnownIssue, Severity::Warning, Some(issue)));
}

#[test]
fn advanced_conditioning_uses_actual_matrices() {
    use dedaliano_engine::solver::{modal::*, harmonic::*, reduction::*, time_integration::*};
    for affected in [false, true] {
        let iz = if affected { 1e-12 } else { 1e-4 };
        let solver = make_beam(4, 4.0, E, 0.01, iz, "fixed", None, tip(-1.0));
        let densities = HashMap::from([("1".into(), 7850.0)]);
        let modal = solve_modal_2d(&solver, &densities, 2).unwrap();
        assert!(modal.modes[0].frequency > 0.0);
        let harmonic = solve_harmonic_2d(&HarmonicInput { solver: solver.clone(), densities: densities.clone(),
            frequencies: vec![0.1, 1.0], damping_ratio: 0.05, response_node_id: 5, response_dof: "y".into() }).unwrap();
        let guyan = guyan_reduce_2d(&GuyanInput { solver: solver.clone(), boundary_nodes: vec![5] }).unwrap();
        let cb = craig_bampton_2d(&CraigBamptonInput { solver: solver.clone(), densities: densities.clone(), boundary_nodes: vec![5], n_modes: 2 }).unwrap();
        let th: TimeHistoryInput = serde_json::from_value(serde_json::json!({
            "solver": solver, "densities": densities, "timeStep": 0.01, "nSteps": 2
        })).unwrap();
        let time = solve_time_history_2d(&th).unwrap();
        for ds in [&modal.structured_diagnostics, &harmonic.structured_diagnostics, &guyan.structured_diagnostics, &cb.structured_diagnostics, &time.structured_diagnostics] {
            if affected { assert_warning(ds, "NUM-INVARIANCE", 762.0); }
            else { assert!(!ids(ds).contains(&"NUM-INVARIANCE".into()), "{ds:?}"); }
        }
    }
}

#[test]
fn reported_seeds_advanced_modal_and_time_history_are_contained() {
    use dedaliano_engine::solver::{modal::*, time_integration::*};
    for seed in [20800, 20833, 20865, 20795, 20756, 20824, 20840] {
        let (mut solver, mut densities) = crate::fuzz_models::random_2d_model_rich(seed);
        for id in solver.materials.keys() { densities.insert(id.clone(), 7850.0); }
        if (seed - 20754) % 3 == 2 { crate::fuzz_models::add_random_constraints_2d(&mut solver, seed); }
        match solve_modal_2d(&solver, &densities, 2) {
            Ok(r) => assert_warning(&r.structured_diagnostics, "NUM-INVARIANCE", 762.0),
            Err(error) => assert_eq!(error, if seed == 20824 { "Eigenvalue decomposition failed" } else { "No valid modes found" }, "seed {seed}"),
        }
        let th: TimeHistoryInput = serde_json::from_value(serde_json::json!({
            "solver": solver, "densities": densities, "timeStep": 0.01, "nSteps": 2
        })).unwrap();
        assert_warning(&solve_time_history_2d(&th).unwrap().structured_diagnostics, "NUM-INVARIANCE", 762.0);
    }
    let (solver, densities) = crate::fuzz_models::random_3d_model_rich(20788);
    match solve_modal_3d(&solver, &densities, 2) {
        Ok(r) => assert_warning(&r.structured_diagnostics, "NUM-INVARIANCE", 762.0),
        Err(error) => assert_eq!(error, "Eigenvalue decomposition failed"),
    }
    let th: TimeHistoryInput3D = serde_json::from_value(serde_json::json!({
        "solver": solver, "densities": densities, "timeStep": 0.01, "nSteps": 2
    })).unwrap();
    assert_warning(&solve_time_history_3d(&th).unwrap().structured_diagnostics, "NUM-INVARIANCE", 762.0);
}

#[test]
fn creep_preserves_step_only_diagnostics_and_values() {
    use dedaliano_engine::solver::creep_shrinkage::*;
    for moment in [0.0, 1.0] {
        let mut solver = make_beam(1, 4.0, E, 0.01, 1e-4, "fixed", None, vec![]);
        solver.elements.get_mut("1").unwrap().hinge_end = true;
        solver.connectors.insert("1".into(), serde_json::from_value(serde_json::json!({
            "id": 1, "nodeI": 1, "nodeJ": 2, "kAxial": 0.0, "kShear": 0.0, "kMoment": 1.0
        })).unwrap());
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -1.0, my: moment })];
        let input = CreepShrinkageInput { solver: solver.clone(), creep_params: HashMap::new(),
            time_steps: vec![TimeStep { t_days: 28.0, additional_loads: loads.clone() }], aging_coefficient: 0.8 };
        assert!(!ids(&solve_2d(&solver).unwrap().structured_diagnostics).contains(&"CERT-MECHANISM".into()));
        let result = solve_creep_shrinkage_2d(&input).unwrap();
        solver.loads = loads;
        let direct = solve_2d(&solver).unwrap();
        assert_eq!(serde_json::to_value(&result.steps[0].displacements).unwrap(), serde_json::to_value(&direct.displacements).unwrap());
        let bundle = dedaliano_engine::certify::bundle::export_linear_bundle_2d(&solver).unwrap();
        assert_eq!(ids(&bundle.structured_diagnostics), ids(&direct.structured_diagnostics));

        assert!(!ids(&result.structured_diagnostics).contains(&"CERT-MECHANISM".into()));
    }
}

#[test]
fn buckling_and_certificate_exports_preserve_warnings() {
    use dedaliano_engine::solver::buckling::*;
    use dedaliano_engine::certify::{buckling::*, bundle::*, combination_bundle::*};
    use dedaliano_engine::solver::load_cases::*;
    for affected in [false, true] {
        let solver = make_beam(4, 4.0, E, 0.01, if affected { 1e-12 } else { 1e-4 }, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: -1.0, fz: 0.0, my: 0.0 })]);
        let plain = solve_buckling_2d(&solver, 1).unwrap();
        let certified = certify_buckling_2d(&solver, 1).unwrap();
        assert_eq!(plain.modes[0].load_factor.to_bits(), certified.results.modes[0].load_factor.to_bits());
        let linear = export_linear_bundle_2d(&solver).unwrap();
        let multi = MultiCaseInput { solver: solver.clone(), load_cases: vec![LoadCase { name: "A".into(), loads: solver.loads.clone() }],
            combinations: vec![CombinationDef { name: "C".into(), factors: HashMap::from([("A".into(), 1.0)]) }] };
        let combination = export_combination_bundle_2d(&multi).unwrap();
        for ds in [&plain.structured_diagnostics, &certified.results.structured_diagnostics, &linear.structured_diagnostics, &combination.structured_diagnostics] {
            if affected { assert_warning(ds, "NUM-INVARIANCE", 762.0); }
            else { assert!(!ids(ds).contains(&"NUM-INVARIANCE".into())); }
        }
        assert_eq!(LinearBundle::from_json(&linear.to_json()).unwrap().structured_diagnostics, linear.structured_diagnostics);
        assert_eq!(CombinationBundle::from_json(&combination.to_json()).unwrap().structured_diagnostics, combination.structured_diagnostics);
    }
}

#[test]
fn advanced_3d_and_bundles_keep_conditioning() {
    use dedaliano_engine::solver::{modal::*, harmonic::*, reduction::*, buckling::*, creep_shrinkage::*, time_integration::*};
    use dedaliano_engine::certify::{buckling::*, bundle::*, combination_bundle::*};
    use dedaliano_engine::solver::load_cases::*;
    for affected in [false, true] {
        let inertia = if affected { 1e-12 } else { 1e-4 };
        let solver = make_3d_beam(4, 4.0, E, 0.3, 0.01, inertia, inertia, inertia, vec![true; 6], None,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx: -1.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })]);
        let densities = HashMap::from([("1".into(), 7850.0)]);
        let modal = solve_modal_3d(&solver, &densities, 2).unwrap();
        let harmonic = solve_harmonic_3d(&HarmonicInput3D { solver: solver.clone(), densities: densities.clone(),
            frequencies: vec![0.1, 1.0], damping_ratio: 0.05, response_node_id: 5, response_dof: "x".into() }).unwrap();
        assert_eq!(ids(&harmonic.structured_diagnostics).contains(&"MD-ORTHOGONALITY".into()), harmonic.method.starts_with("modal"));
        let guyan = guyan_reduce_3d(&GuyanInput3D { solver: solver.clone(), boundary_nodes: vec![5] }).unwrap();
        let cb = craig_bampton_3d(&CraigBamptonInput3D { solver: solver.clone(), densities: densities.clone(), boundary_nodes: vec![5], n_modes: 2 }).unwrap();
        let th: TimeHistoryInput3D = serde_json::from_value(serde_json::json!({
            "solver": solver, "densities": densities, "timeStep": 0.01, "nSteps": 2
        })).unwrap();
        let time = solve_time_history_3d(&th).unwrap();
        let creep: CreepShrinkageInput3D = serde_json::from_value(serde_json::json!({
            "solver": solver, "creepParams": {}, "timeSteps": [{"tDays": 28.0}]
        })).unwrap();
        let creep = solve_creep_shrinkage_3d(&creep).unwrap();
        let plain = solve_buckling_3d(&solver, 1).unwrap();
        let certified = certify_buckling_3d(&solver, 1).unwrap();
        assert_eq!(plain.modes[0].load_factor.to_bits(), certified.results.modes[0].load_factor.to_bits());
        let linear = export_linear_bundle_3d(&solver).unwrap();
        let multi = MultiCaseInput3D { solver: solver.clone(), load_cases: vec![LoadCase3D { name: "A".into(), loads: solver.loads.clone() }],
            combinations: vec![CombinationDef { name: "C".into(), factors: HashMap::from([("A".into(), 1.0)]) }] };
        let combination = export_combination_bundle_3d(&multi).unwrap();
        for ds in [&modal.structured_diagnostics, &harmonic.structured_diagnostics, &guyan.structured_diagnostics,
            &cb.structured_diagnostics, &time.structured_diagnostics, &creep.structured_diagnostics,
            &plain.structured_diagnostics, &certified.results.structured_diagnostics, &linear.structured_diagnostics,
            &combination.structured_diagnostics] {
            if affected { assert_warning(ds, "NUM-INVARIANCE", 762.0); }
            else { assert!(!ids(ds).contains(&"NUM-INVARIANCE".into()), "{ds:?}"); }
        }
    }
}

#[test]
fn conditioning_detects_roundoff_pivots_without_changing_matrices() {
    use dedaliano_engine::{known_issues::*, linalg::CscMatrix};
    for coupling in [0.5, 1.0 - 1e-12, 1.0] {
        let dense = vec![1.0, coupling, coupling, 1.0];
        let sparse = CscMatrix::from_triplets(2, &[0, 1, 1], &[0, 0, 1], &[1.0, coupling, 1.0]);
        let original = sparse.values.clone();
        assert!(dense_conditioning(&dense, 2).is_none());
        assert!(sparse_conditioning(&sparse).is_none());
        for d in [dense_stiffness_conditioning(&dense, 2), sparse_stiffness_conditioning(&sparse)] {
            if coupling > 0.5 { assert_warning(&[d.unwrap()], "NUM-INVARIANCE", 762.0); }
            else { assert!(d.is_none()); }
        }
        assert_eq!(sparse.values, original);
        assert_eq!(dense, vec![1.0, coupling, coupling, 1.0]);
    }
}

#[test]
fn reported_buckling_741_818_plain_and_certified() {
    use dedaliano_engine::solver::buckling::solve_buckling_3d;
    use dedaliano_engine::certify::buckling::certify_buckling_3d;
    let input: SolverInput3D = serde_json::from_str(include_str!("fixtures/buckling-741.json")).unwrap();
    let result = solve_buckling_3d(&input, 1).unwrap();
    assert!((result.modes[0].load_factor - 4691.397553909858).abs() < 1e-6);
    assert_warning(&result.structured_diagnostics, "BU-ACCURACY", 818.0);
    let error = certify_buckling_3d(&input, 1).unwrap_err();
    assert!(error.contains("BU-BOUND"), "{error}");
}

#[test]
fn spectral_conditioning_survives_certification() {
    use dedaliano_engine::solver::{modal::solve_modal_2d, spectral::solve_spectral_2d};
    use dedaliano_engine::certify::spectral::certify_spectral_2d;
    for affected in [false, true] {
        let solver = make_beam(4, 4.0, E, 0.01, if affected { 1e-12 } else { 1e-4 }, "fixed", None, tip(-1.0));
        let densities = HashMap::from([("1".into(), 7850.0)]);
        let modal = solve_modal_2d(&solver, &densities, 2).unwrap();
        let input: SpectralInput = serde_json::from_value(serde_json::json!({
            "solver": solver, "densities": densities, "modes": modal.modes,
            "spectrum": { "name": "constant", "inG": false, "points": [{"period": 0.0, "sa": 1.0}, {"period": 1e9, "sa": 1.0}] },
            "direction": "X"
        })).unwrap();
        let plain = solve_spectral_2d(&input).unwrap();
        let certified = certify_spectral_2d(&input).unwrap();
        for ds in [&modal.structured_diagnostics, &plain.structured_diagnostics, &certified.results.structured_diagnostics] {
            assert_eq!(ids(ds).contains(&"NUM-INVARIANCE".into()), affected, "{ds:?}");
        }
        assert_eq!(plain.base_shear, certified.results.base_shear);
    }
}

#[test]
fn spectral_3d_conditioning_survives_certification() {
    use dedaliano_engine::solver::{modal::solve_modal_3d, spectral::solve_spectral_3d};
    use dedaliano_engine::certify::spectral::certify_spectral_3d;
    for affected in [false, true] {
        let inertia = if affected { 1e-12 } else { 1e-4 };
        let solver = make_3d_beam(4, 4.0, E, 0.3, 0.01, inertia, inertia, inertia, vec![true; 6], None, vec![]);
        let densities = HashMap::from([("1".into(), 7850.0)]);
        let modal = solve_modal_3d(&solver, &densities, 2).unwrap();
        let input: SpectralInput3D = serde_json::from_value(serde_json::json!({
            "solver": solver, "densities": densities, "modes": modal.modes,
            "spectrum": { "name": "constant", "inG": false, "points": [{"period": 0.0, "sa": 1.0}, {"period": 1e9, "sa": 1.0}] },
            "direction": "X"
        })).unwrap();
        let plain = solve_spectral_3d(&input).unwrap();
        let certified = certify_spectral_3d(&input).unwrap();
        for ds in [&modal.structured_diagnostics, &plain.structured_diagnostics, &certified.results.structured_diagnostics] {
            assert_eq!(ids(ds).contains(&"NUM-INVARIANCE".into()), affected, "{ds:?}");
        }
        assert_eq!(plain.base_shear, certified.results.base_shear);
    }
}

#[test]
fn rotation_demand_large_sweep() {
    use dedaliano_engine::known_issues::RotationDemand2D;
    for size in [1_000, 10_000] {
        let mut solver = make_beam(size, size as f64, E, 0.01, 1e-4, "fixed", None, vec![]);
        for e in solver.elements.values_mut() { e.hinge_start = true; e.hinge_end = true; }
        let start = std::time::Instant::now();
        let prepared = RotationDemand2D::new(&solver);
        for node in 2..=size {
            assert!(!prepared.demanded(&[]));
            assert!(prepared.demanded(&[SolverLoad::Nodal(SolverNodalLoad { node_id: node, fx: 0.0, fz: 0.0, my: 1.0 })]));
        }
        eprintln!("rotation demand {size} members and positions: {:?}", start.elapsed());
    }
}

#[test]
fn curved_only_dynamic_solvers_warn() {
    use dedaliano_engine::solver::{harmonic::*, reduction::*, time_integration::*};
    let mut solver = beam3d();
    solver.elements.clear();
    solver.nodes.retain(|_, n| n.id == 1 || n.id == 5);
    solver.nodes.insert("200".into(), SolverNode3D { id: 200, x: 2.0, y: 0.0, z: 1.0 });
    solver.curved_beams.push(CurvedBeamInput { node_start: 1, node_mid: 200, node_end: 5, material_id: 1, section_id: 1, num_segments: 4, hinge_start: false, hinge_end: false });
    let densities = HashMap::from([("1".into(), 7850.0)]);
    let harmonic_input = HarmonicInput3D { solver: solver.clone(), densities: densities.clone(), frequencies: vec![0.1, 1.0], damping_ratio: 0.05, response_node_id: 5, response_dof: "z".into() };
    let harmonic = solve_harmonic_3d(&harmonic_input).unwrap();
    assert_eq!(ids(&harmonic.structured_diagnostics).contains(&"MD-ORTHOGONALITY".into()), harmonic.method.starts_with("modal"));
    let cb = craig_bampton_3d(&CraigBamptonInput3D { solver: solver.clone(), densities: densities.clone(), boundary_nodes: vec![5], n_modes: 2 }).unwrap();
    let time = solve_time_history_3d(&serde_json::from_value(serde_json::json!({ "solver": solver, "densities": densities, "timeStep": 0.01, "nSteps": 2 })).unwrap()).unwrap();
    for ds in [&harmonic.structured_diagnostics, &cb.structured_diagnostics, &time.structured_diagnostics] {
        assert_warning(ds, "NL-DYNAMIC-GAPS", 370.0);
    }
    let mut truss = beam3d();
    for e in truss.elements.values_mut() { e.elem_type = "truss".into(); }
    for analysis in [Analysis::Modal, Analysis::Harmonic, Analysis::TimeHistory] {
        assert!(!ids(&for_3d(&truss, analysis)).contains(&"NL-DYNAMIC-GAPS".into()));
    }
}

#[test]
fn winkler_and_stages_check_the_solved_matrix() {
    use dedaliano_engine::solver::{winkler::*, staged::*};
    for affected in [false, true] {
        let inertia = if affected { 1e-12 } else { 1e-4 };
        let solver = make_beam(4, 4.0, E, 0.01, inertia, "fixed", None, tip(-1.0));
        let ordinary = solve_2d(&solver).unwrap();
        let winkler = solve_winkler_2d(&WinklerInput { solver: solver.clone(), foundation_springs: vec![] }).unwrap();
        let mut staged = serde_json::to_value(&solver).unwrap();
        staged["stages"] = serde_json::json!([{ "name": "all", "elementsAdded": [1,2,3,4], "supportsAdded": [1], "loadIndices": [0] }]);
        let staged = solve_staged_2d(&serde_json::from_value(staged).unwrap()).unwrap();
        for ds in [&ordinary.structured_diagnostics, &winkler.structured_diagnostics, &staged.final_results.structured_diagnostics, &staged.stages[0].results.structured_diagnostics] {
            assert_eq!(ids(ds).contains(&"NUM-INVARIANCE".into()), affected);
        }
        let mut solver = beam3d();
        for section in solver.sections.values_mut() { section.iy = inertia; section.iz = inertia; section.j = inertia; }
        let winkler = solve_winkler_3d(&WinklerInput3D { solver: solver.clone(), foundation_springs: vec![] }).unwrap();
        let mut staged = serde_json::to_value(&solver).unwrap();
        staged["stages"] = serde_json::json!([{ "name": "all", "elementsAdded": [1,2,3,4], "supportsAdded": [1] }]);
        let staged = solve_staged_3d(&serde_json::from_value(staged).unwrap()).unwrap();
        for ds in [&winkler.structured_diagnostics, &staged.final_results.structured_diagnostics, &staged.stages[0].results.structured_diagnostics] {
            assert_eq!(ids(ds).contains(&"NUM-INVARIANCE".into()), affected);
        }
    }
}

#[test]
fn distorted_mesh_guard_scales_and_allows_uniform_extension() {
    use dedaliano_engine::known_issues::MembraneBendingGuard;
    let mut input = beam3d();
    input.nodes.clear(); input.elements.clear(); input.supports.clear();
    for i in 0..10000 {
        let first = i * 4 + 1;
        for (j, (x, y)) in [(0.0,0.0),(1.0,0.0),(1.2,1.0),(0.0,1.0)].into_iter().enumerate() {
            let id = first + j;
            input.nodes.insert(id.to_string(), SolverNode3D { id, x, y, z: 0.0 });
        }
        input.quads.insert(i.to_string(), SolverQuadElement { id: i, nodes: [first,first+1,first+2,first+3], material_id: 1, thickness: 0.1 });
    }
    let mut result = dedaliano_engine::solver::linear::solve_3d(&beam3d()).unwrap();
    result.displacements = input.nodes.values().map(|n| Displacement3D { node_id: n.id, ux: n.x * 1e-6, uy: 0.0, uz: 0.0, rx: 0.0, ry: 0.0, rz: 0.0, warping: None }).collect();
    let start = std::time::Instant::now();
    let guard = MembraneBendingGuard::new(&input);
    for _ in 0..4 { guard.check(&[], &result).unwrap(); }
    assert!(start.elapsed().as_secs_f64() < 5.0, "guard must index mesh data once per solve");
    assert!(ids(&for_3d(&input, Analysis::Linear)).contains(&"SH-MITC4-DISTORTION".into()));
}

#[test]
fn reported_modal_model_harmonic_and_certificate_warn() {
    use dedaliano_engine::solver::harmonic::*;
    let solver: SolverInput3D = serde_json::from_str(include_str!("metamorphic_corpus/differential/modal3d-5.json")).unwrap();
    let densities = solver.materials.keys().map(|id| (id.clone(), 7850.0)).collect();
    let input = HarmonicInput3D { solver, densities, frequencies: vec![0.1, 1000.0], damping_ratio: 0.05, response_node_id: 6, response_dof: "x".into() };
    let plain = solve_harmonic_3d(&input).unwrap();
    assert!(plain.method.starts_with("modal"), "{}", plain.method);
    assert_warning(&plain.structured_diagnostics, "MD-ORTHOGONALITY", 759.0);
    let certified = dedaliano_engine::certify::harmonic::certify_harmonic_3d(&input).unwrap();
    assert_warning(&certified.results.structured_diagnostics, "MD-ORTHOGONALITY", 759.0);
    assert_eq!(serde_json::to_value(&plain.response_points).unwrap(), serde_json::to_value(&certified.results.response_points).unwrap());
}


#[test]
fn reused_conditioning_factors_match_standalone_checks() {
    use dedaliano_engine::{known_issues::*, linalg::*};
    for k in [vec![2.0, 1.0, 1.0, 2.0], vec![1.0, 1.0, 1.0, 1.0 + 1e-12], vec![1.0, 1.0, 1.0, 0.5], vec![1.0, 0.0, 0.0, 1e10]] {
        let mut l = k.clone();
        let success = cholesky_decompose(&mut l, 2);
        assert_eq!(ids(&dense_factor_conditioning(&k, 2, success.then_some(l.as_slice())).into_iter().collect::<Vec<_>>()),
            ids(&dense_stiffness_conditioning(&k, 2).into_iter().collect::<Vec<_>>()));
        let sparse = CscMatrix::from_dense_symmetric(&k, 2);
        let sym = std::rc::Rc::new(symbolic_cholesky(&sparse));
        let factor = numeric_cholesky(&sym, &sparse);
        assert_eq!(ids(&sparse_factor_conditioning(&sparse, factor.as_ref()).into_iter().collect::<Vec<_>>()),
            ids(&sparse_stiffness_conditioning(&sparse).into_iter().collect::<Vec<_>>()));
    }
}

#[test]
#[ignore]
fn conditioning_cost_large_frame() {
    use dedaliano_engine::{known_issues::*, linalg::*, solver::{dof::DofNumbering, sparse_assembly::assemble_stiffness_sparse_2d}};
    use std::time::Instant;
    let bays = 50;
    let stories = 40;
    let node_id = |x: usize, z: usize| z * (bays + 1) + x + 1;
    let nodes = (0..=stories).flat_map(|z| (0..=bays).map(move |x| (node_id(x, z), x as f64 * 5.0, z as f64 * 3.0))).collect();
    let mut elements = Vec::new();
    for z in 1..=stories {
        for x in 0..=bays {
            elements.push((elements.len() + 1, "frame", node_id(x, z - 1), node_id(x, z), 1, 1, false, false));
            if x < bays { elements.push((elements.len() + 1, "frame", node_id(x, z), node_id(x + 1, z), 1, 1, false, false)); }
        }
    }
    let supports = (0..=bays).map(|x| (x + 1, node_id(x, 0), "fixed")).collect();
    let input = common::make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.045, 3.375e-4)], elements, supports, vec![]);
    let dofs = DofNumbering::build_2d(&input);
    let k = assemble_stiffness_sparse_2d(&input, &dofs).k_ff;
    let sym = std::rc::Rc::new(symbolic_cholesky(&k));
    let factor = numeric_cholesky(&sym, &k).unwrap();
    let start = Instant::now();
    for _ in 0..100 { std::hint::black_box(sparse_stiffness_conditioning(&k)); }
    let standalone = start.elapsed();
    let start = Instant::now();
    for _ in 0..100 { std::hint::black_box(sparse_factor_conditioning(&k, Some(&factor))); }
    let reused = start.elapsed();
    let symbolic_bytes = (sym.perm.len() + sym.iperm.len() + sym.l_col_ptr.len() + sym.l_row_idx.len() + sym.parent.len()
        + sym.snode_start.len() + sym.snode_upd.iter().map(Vec::len).sum::<usize>() + sym.pa_col_ptr.len() + sym.pa_row_idx.len()
        + sym.pa_src.len()) * std::mem::size_of::<usize>() + sym.snode_upd.len() * std::mem::size_of::<Vec<usize>>();
    eprintln!("frame: {} DOFs, {} matrix entries; 100 checks: standalone {:?}, reused {:?}; numeric factor {} bytes, symbolic arrays {} bytes, reused check scratch {} bytes",
        k.n, k.values.len(), standalone, reused, factor.l_values.len() * 8, symbolic_bytes, k.n * 8);
}

fn arch3d() -> SolverInput3D {
    let mut s = beam3d();
    s.elements.clear();
    for id in [2, 3, 4] { s.nodes.remove(&id.to_string()); }
    s.nodes.insert("200".into(), SolverNode3D { id: 200, x: 2.0, y: 0.0, z: 1.0 });
    s.curved_beams.push(CurvedBeamInput { node_start: 1, node_mid: 200, node_end: 5, material_id: 1, section_id: 1, num_segments: 8, hinge_start: false, hinge_end: false });
    s
}

#[test]
fn arch_only_dynamic_models_carry_the_issues_of_the_model_as_given() {
    use dedaliano_engine::solver::{harmonic::*, modal::*, reduction::*};
    let densities: HashMap<String, f64> = [("1".to_string(), 7850.0)].into();
    let arch = arch3d();
    let modal = solve_modal_3d(&arch, &densities, 2).unwrap();
    assert_warning(&modal.structured_diagnostics, "NL-DYNAMIC-GAPS", 370.0);
    assert_warning(&modal.structured_diagnostics, "MD-ORTHOGONALITY", 759.0);
    let harmonic: HarmonicInput3D = serde_json::from_value(serde_json::json!({
        "solver": arch, "densities": densities, "frequencies": [1.0, 2.0], "responseNodeId": 5
    })).unwrap();
    assert_warning(&solve_harmonic_3d(&harmonic).unwrap().structured_diagnostics, "NL-DYNAMIC-GAPS", 370.0);
    let cb = craig_bampton_3d(&CraigBamptonInput3D { solver: arch.clone(), boundary_nodes: vec![5], n_modes: 2, densities: densities.clone() }).unwrap();
    assert_warning(&cb.structured_diagnostics, "NL-DYNAMIC-GAPS", 370.0);
    assert_warning(&cb.structured_diagnostics, "MD-ORTHOGONALITY", 759.0);
    let guyan = guyan_reduce_3d(&GuyanInput3D { solver: arch, boundary_nodes: vec![5] }).unwrap();
    assert!(!ids(&guyan.structured_diagnostics).contains(&"NL-DYNAMIC-GAPS".to_string()), "{:?}", guyan.structured_diagnostics);

    let mut truss = beam3d();
    for e in truss.elements.values_mut() { e.elem_type = "truss".into(); }
    assert!(!ids(&for_3d(&truss, Analysis::Modal)).contains(&"NL-DYNAMIC-GAPS".to_string()));
}

#[test]
fn distorted_mesh_guard_refuses_what_it_cannot_evaluate() {
    use dedaliano_engine::known_issues::MembraneBendingGuard;
    let mut input = beam3d();
    input.nodes.clear(); input.elements.clear(); input.supports.clear();
    for (j, (x, y)) in [(0.0,0.0),(1.0,0.0),(1.2,1.0),(0.0,1.0)].into_iter().enumerate() {
        input.nodes.insert((j + 1).to_string(), SolverNode3D { id: j + 1, x, y, z: 0.0 });
    }
    input.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.1 });
    let mut result = dedaliano_engine::solver::linear::solve_3d(&beam3d()).unwrap();
    let extension = |n: &SolverNode3D| Displacement3D { node_id: n.id, ux: n.x * 1e-6, uy: 0.0, uz: 0.0, rx: 0.0, ry: 0.0, rz: 0.0, warping: None };
    result.displacements = input.nodes.values().map(extension).collect();
    let guard = MembraneBendingGuard::new(&input);
    guard.check(&[], &result).unwrap();

    let mut missing = result.clone();
    missing.displacements.retain(|d| d.node_id != 3);
    assert!(guard.check(&[], &missing).unwrap_err().contains("SH-MITC4-DISTORTION"));
    for bad in [f64::NAN, f64::INFINITY] {
        let mut nonfinite = result.clone();
        nonfinite.displacements.iter_mut().find(|d| d.node_id == 3).unwrap().ux = bad;
        assert!(guard.check(&[], &nonfinite).unwrap_err().contains("SH-MITC4-DISTORTION"), "{bad}");
    }
}

#[test]
fn a_negligible_rotational_spring_at_an_all_hinged_node_still_warns() {
    let moment = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 1, fx: 0.0, fz: 0.0, my: 1.0 })];
    for (kz, warns) in [(1e-12, true), (1e9, false)] {
        let mut input = make_beam(1, 4.0, E, 0.045, 3.375e-4, "pinned", Some("rollerX"), moment.clone());
        input.elements.get_mut("1").unwrap().hinge_start = true;
        let support = input.supports.get_mut("1").unwrap();
        support.support_type = "spring".into();
        support.kx = Some(1e9);
        support.ky = Some(1e9);
        support.kz = Some(kz);
        let found = match solve_2d(&input) {
            Ok(r) => ids(&r.structured_diagnostics),
            Err(e) => panic!("kz {kz}: {e}"),
        };
        eprintln!("kz {kz}: {found:?}");
        assert_eq!(found.contains(&"NUM-INVARIANCE".into()) || found.contains(&"CERT-MECHANISM".into()), warns, "kz {kz}: {found:?}");
    }
}

#[test]
fn kinematic_classification_is_not_refused_by_a_result_known_issue() {
    use dedaliano_engine::solver::kinematic::analyze_kinematics_3d;
    let mut input = beam3d();
    input.nodes.clear(); input.elements.clear(); input.supports.clear(); input.loads.clear();
    for (id, x, y) in [(1, 0.0, 0.0), (2, 1.0, 0.0), (3, 1.5, 1.0), (4, 0.0, 1.0)] {
        input.nodes.insert(id.to_string(), SolverNode3D { id, x, y, z: 0.0 });
    }
    input.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.1 });
    for id in [1, 4] {
        input.supports.insert(id.to_string(), serde_json::from_value(serde_json::json!({"nodeId":id,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true})).unwrap());
    }
    assert!(ids(&for_3d(&input, Analysis::Linear)).contains(&"SH-MITC4-DISTORTION".into()));
    let k = analyze_kinematics_3d(&input);
    assert!(k.invalid_input.is_none(), "{:?}", k.invalid_input);
}

fn macneal_strip(distorted: bool, direction: usize) -> SolverInput3D {
    let mut input = beam3d();
    input.nodes.clear(); input.elements.clear(); input.supports.clear(); input.loads.clear();
    input.materials.get_mut("1").unwrap().e = 10000.0;
    for i in 0..=6 {
        for j in 0..2 {
            let shift = if !distorted || i == 0 || i == 6 { 0.0 } else { (if i % 2 == 1 { 0.1 } else { -0.1 }) * (if j == 0 { -1.0 } else { 1.0 }) };
            let id = 1 + 2 * i + j;
            input.nodes.insert(id.to_string(), SolverNode3D { id, x: i as f64 + shift, y: 0.2 * j as f64, z: 0.0 });
        }
    }
    for i in 0..6 {
        let id = i + 1;
        input.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [2 * i + 1, 2 * i + 3, 2 * i + 4, 2 * i + 2], material_id: 1, thickness: 0.1 });
    }
    for id in [1, 2] {
        input.supports.insert(id.to_string(), serde_json::from_value(serde_json::json!({"nodeId":id,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true})).unwrap());
    }
    for id in [13, 14] {
        let mut f = [0.0; 3];
        f[direction] = 0.5;
        input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: id, fx: f[0], fy: f[1], fz: f[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    }
    input
}

#[test]
fn nonlinear_and_dynamic_shell_paths_run_the_membrane_guard() {
    use dedaliano_engine::solver::{material_nonlinear::solve_nonlinear_material_3d, modal::solve_modal_3d, spectral::solve_spectral_3d, time_integration::solve_time_history_3d};
    let densities = HashMap::from([("1".to_string(), 7850.0)]);
    for distorted in [false, true] {
        for direction in [1, 2] {
            let refused = distorted && direction == 1;
            let solver = macneal_strip(distorted, direction);
            let nonlinear: NonlinearMaterialInput3D = serde_json::from_value(serde_json::json!({"solver": solver, "materialModels": {}, "sectionCapacities": {}})).unwrap();
            let accel = if direction == 1 { "groundAccelY" } else { "groundAccelZ" };
            let th: TimeHistoryInput3D = serde_json::from_value(serde_json::json!({"solver": solver, "densities": densities, "timeStep": 0.01, "nSteps": 20, accel: vec![1.0; 21]})).unwrap();
            let unsupported = solve_nonlinear_material_3d(&nonlinear).map(|_| ()).unwrap_err();
            assert!(unsupported.contains("does not support shell elements"), "{unsupported}");
            let harmonic = |frequencies: Vec<f64>| dedaliano_engine::solver::harmonic::solve_harmonic_3d(&dedaliano_engine::solver::harmonic::HarmonicInput3D {
                solver: solver.clone(), densities: densities.clone(), frequencies, damping_ratio: 0.05, response_node_id: 13, response_dof: if direction == 1 { "y".into() } else { "z".into() } });
            let static_refused = dedaliano_engine::solver::linear::solve_3d(&solver).is_err();
            assert_eq!(static_refused, refused, "static distorted={distorted} direction={direction}");
            for frequencies in [vec![1e-3], vec![1e-3, 1.0, 10.0]] {
                let outcome = harmonic(frequencies).map(|r| r.structured_diagnostics);
                if distorted {
                    common::assert_containment(outcome, "SH-MITC4-DISTORTION");
                } else {
                    assert!(!ids(&outcome.unwrap()).contains(&"SH-MITC4-DISTORTION".into()));
                }
            }
            for (name, outcome) in [("time history", solve_time_history_3d(&th).map(|r| r.structured_diagnostics))] {
                if refused {
                    common::assert_containment(outcome, "SH-MITC4-DISTORTION");
                } else {
                    let ds = outcome.unwrap_or_else(|e| panic!("{name} distorted={distorted} direction={direction}: {e}"));
                    assert!(ds.iter().all(|d| d.severity != Severity::Error), "{name}: {ds:?}");
                    assert_eq!(ids(&ds).contains(&"SH-MITC4-DISTORTION".into()), distorted, "{name}");
                }
            }
        }
        let solver = macneal_strip(distorted, 1);
        let bending = solve_modal_3d(&solver, &densities, 1).unwrap();
        assert!(bending.modes[0].displacements.iter().all(|d| d.ux.abs() + d.uy.abs() < 1e-9 * d.uz.abs().max(1e-300) || d.uz == 0.0), "the first mode bends out of plane");
        assert_eq!(ids(&bending.structured_diagnostics).contains(&"SH-MITC4-DISTORTION".into()), distorted, "modal: {:?}", ids(&bending.structured_diagnostics));
        let all = solve_modal_3d(&solver, &densities, 4);
        let modes = if distorted {
            common::assert_containment(all.map(|m| m.structured_diagnostics), "SH-MITC4-DISTORTION");
            solve_modal_3d(&macneal_strip(false, 1), &densities, 4).unwrap()
        } else {
            all.unwrap()
        };
        assert!(modes.modes.iter().any(|m| m.displacements.iter().any(|d| d.uy.abs() > 0.1)), "an in-plane mode is among the four");
        let spectral: SpectralInput3D = serde_json::from_value(serde_json::json!({
            "solver": solver, "densities": densities, "modes": modes.modes,
            "spectrum": {"name": "constant", "inG": false, "points": [{"period": 0.0, "sa": 1.0}, {"period": 1e9, "sa": 1.0}]},
            "direction": "Y"
        })).unwrap();
        let response = solve_spectral_3d(&spectral);
        if distorted { common::assert_containment(response, "SH-MITC4-DISTORTION"); }
        else { assert!(response.unwrap().base_shear > 0.0); }
    }
}

fn transverse_loaded_bar() -> SolverInput {
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": -53.39259906210398, "z": -85.39605063257972}, "2": {"id": 2, "x": -28.598050853224024, "z": -52.92016340104717}},
        "materials": {"1": {"id": 1, "e": 10530.127602377152, "nu": 0.2681219095578359}},
        "sections": {"1": {"id": 1, "a": 0.01819587776383571, "iz": 0.00011849462806740683}},
        "elements": {"1": {"id": 1, "type": "truss", "nodeI": 2, "nodeJ": 1, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "distributed", "data": {"elementId": 1, "qI": -24.880367155551312, "qJ": -13.982488394650844}}]
    })).unwrap()
}

#[test]
fn contact_ssi_and_corotational_solves_of_a_mechanism_are_flagged() {
    let check = |input: &SolverInput, flagged: bool| {
        let contact: dedaliano_engine::solver::contact::ContactInput = serde_json::from_value(serde_json::json!({ "solver": input })).unwrap();
        let contact = dedaliano_engine::solver::contact::solve_contact_2d(&contact).unwrap();
        let ssi = solve_ssi_2d(&SSIInput { solver: input.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-10 }).unwrap();
        let corotational = dedaliano_engine::solver::corotational::solve_corotational_2d(input, 100, 1e-10, 4, false).unwrap();
        for (name, d) in [("contact", &contact.results.structured_diagnostics), ("SSI", &ssi.results.structured_diagnostics), ("corotational", &corotational.results.structured_diagnostics)] {
            assert_eq!(ids(d).contains(&"NUM-INVARIANCE".to_string()), flagged, "{name}: {:?}", ids(d));
        }
    };
    check(&transverse_loaded_bar(), true);
    check(&make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, tip(-10.0)), false);
}

#[test]
fn a_prepared_3d_solve_reports_the_thermal_defaults_of_the_loads_it_solves() {
    let heat = |alpha: Option<f64>| SolverLoad3D::Thermal(SolverThermalLoad3D { element_id: 1, dt_uniform: 20.0, dt_gradient_y: 0.0, dt_gradient_z: 0.0, alpha, depth_y: None, depth_z: None });
    let defaulted = |r: &AnalysisResults3D| r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::ThermalDefaultAssumed);
    let mut input = beam3d();
    input.loads = vec![heat(None)];
    let prepared = dedaliano_engine::solver::linear::prepare_static_3d(&input).unwrap();
    assert!(defaulted(&prepared.solve_loads(&input.loads).unwrap()));
    assert!(!defaulted(&prepared.solve_loads(&[heat(Some(1.2e-5))]).unwrap()));
    assert!(!defaulted(&prepared.solve_loads(&[]).unwrap()));
}

#[test]
fn fiber_solves_of_a_mechanism_are_flagged() {
    use dedaliano_engine::element::fiber_beam::{Fiber, FiberMaterial, FiberSectionDef};
    use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_2d, solve_fiber_nonlinear_3d, FiberNonlinearInput, FiberNonlinearInput3D};
    let sections = |a: f64, i: f64, e: f64, nz: usize| {
        let h = (12.0 * i / a).sqrt();
        let b = a / h;
        let at = |k: usize, n: usize, w: f64| -w / 2.0 + (k as f64 + 0.5) * w / n as f64;
        let fibers = (0..20).flat_map(|k| (0..nz).map(move |m| Fiber { y: at(k, 20, h), z: at(m, nz, b), area: a / (20 * nz) as f64, material_idx: 0 })).collect();
        HashMap::from([("1".to_string(), FiberSectionDef { fibers, materials: vec![FiberMaterial::Elastic { e }] })])
    };
    for modified_nr in [false, true] {
        let check_2d = |solver: SolverInput, flagged: bool| {
            let fiber_sections = sections(solver.sections["1"].a, solver.sections["1"].iz, solver.materials["1"].e, 1);
            let r = solve_fiber_nonlinear_2d(&FiberNonlinearInput { solver, fiber_sections, n_integration_points: 5, max_iter: 50, tolerance: 1e-10, n_increments: 1, modified_nr }).unwrap();
            assert_eq!(ids(&r.results.structured_diagnostics).contains(&"NUM-INVARIANCE".to_string()), flagged, "2D modified {modified_nr}: {:?}", ids(&r.results.structured_diagnostics));
        };
        check_2d(transverse_loaded_bar(), true);
        check_2d(make_beam(4, 4.0, E, 0.045, 3.375e-4, "fixed", None, tip(-10.0)), false);
        let check_3d = |solver: SolverInput3D, flagged: bool| {
            let fiber_sections = sections(0.01, 1e-4, E, 20);
            let r = solve_fiber_nonlinear_3d(&FiberNonlinearInput3D { solver, fiber_sections, n_integration_points: 5, max_iter: 50, tolerance: 1e-10, n_increments: 1, modified_nr }).unwrap();
            assert_eq!(ids(&r.results.structured_diagnostics).contains(&"NUM-INVARIANCE".to_string()), flagged, "3D modified {modified_nr}: {:?}", ids(&r.results.structured_diagnostics));
        };
        let load = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
        let fixed = make_3d_beam(4, 4.0, E, 0.3, 0.01, 1e-4, 1e-4, 1e-5, vec![true; 6], None, load.clone());
        let mut pinned = make_3d_beam(4, 4.0, E, 0.3, 0.01, 1e-4, 1e-4, 1e-5, vec![true, true, true, false, false, false], None, load);
        let support = pinned.supports.values_mut().next().unwrap();
        (support.krx, support.kry, support.krz) = (Some(1e-6), Some(1e-6), Some(1e-6));
        check_3d(pinned, true);
        check_3d(fixed, false);
    }
}

#[test]
fn a_fiber_solve_keeps_its_warning_after_the_stiff_member_yields() {
    use dedaliano_engine::element::fiber_beam::{Fiber, FiberMaterial, FiberSectionDef};
    use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_2d, FiberNonlinearInput};
    let fibers = (0..20).map(|k| Fiber { y: -0.05 + (k as f64 + 0.5) * 0.005, z: 0.0, area: 0.0005, material_idx: 0 }).collect();
    let steel = FiberSectionDef { fibers, materials: vec![FiberMaterial::SteelBilinear { e: E, fy: 250.0, hardening_ratio: 1e-6 }] };
    for (copies, modified_nr) in [(1usize, false), (1, true), (12, false), (12, true)] {
        let mut nodes = Vec::new();
        let mut elems = Vec::new();
        let mut sups = Vec::new();
        let mut loads = Vec::new();
        for c in 0..copies {
            let n = 3 * c;
            for k in 0..3 { nodes.push((n + k + 1, k as f64, 2.0 * c as f64)); }
            elems.push((2 * c + 1, "frame", n + 1, n + 2, 1, 1, false, false));
            elems.push((2 * c + 2, "frame", n + 2, n + 3, 1, 2, false, false));
            sups.push((c + 1, n + 1, "fixed"));
            loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: n + 3, fx: 3000.0, fz: 0.0, my: 0.0 }));
        }
        let solver = common::make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 8.33e-6), (2, 1e-6, 1e-14)], elems, sups, loads);
        let r = solve_fiber_nonlinear_2d(&FiberNonlinearInput {
            solver, fiber_sections: HashMap::from([("1".to_string(), steel.clone())]),
            n_integration_points: 5, max_iter: 50, tolerance: 1e-10, n_increments: 4, modified_nr,
        }).unwrap();
        let label = format!("{copies} copies, modified {modified_nr}");
        assert!((modified_nr || r.converged) && r.fiber_status.iter().filter(|s| s.yielded).count() == copies, "{label}: {:?}", r.fiber_status);
        assert!(ids(&r.results.structured_diagnostics).contains(&"NUM-INVARIANCE".to_string()), "{label}: {:?}", ids(&r.results.structured_diagnostics));
    }
}

#[test]
fn a_mechanism_solve_keeps_its_warning_after_a_later_stable_iteration() {
    let mut input = transverse_loaded_bar();
    input.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })];
    input.nodes.insert("3".into(), SolverNode { id: 3, x: -28.598050853224024, z: -53.92016340104717 });
    input.supports.insert("3".into(), serde_json::from_value(serde_json::json!({"id": 3, "nodeId": 3, "type": "fixed"})).unwrap());
    let contact: dedaliano_engine::solver::contact::ContactInput = serde_json::from_value(serde_json::json!({ "solver": input,
        "gapElements": [{"id": 1, "nodeI": 3, "nodeJ": 2, "direction": 1, "initialGap": 0.0, "stiffness": 1.0e6}] })).unwrap();
    let r = dedaliano_engine::solver::contact::solve_contact_2d(&contact).unwrap();
    assert!(r.converged && r.iterations >= 2, "{} iterations", r.iterations);
    assert!(r.gap_status[0].status == "closed", "{:?}", r.gap_status);
    assert!(ids(&r.results.structured_diagnostics).contains(&"NUM-INVARIANCE".to_string()), "{:?}", ids(&r.results.structured_diagnostics));
}

#[test]
fn an_influence_line_of_a_mechanism_is_an_error_not_zeros() {
    use dedaliano_engine::postprocess::influence::compute_influence_line;
    let mut model = make_beam(2, 4.0, E, 0.045, 3.375e-4, "fixed", None, vec![]);
    model.supports.get_mut("1").unwrap().support_type = "rollerX".into();
    model.constraints = vec![serde_json::from_value(serde_json::json!({"type":"equalDOF","masterNode":1,"slaveNode":3,"dofs":[0]})).unwrap()];
    assert!(solve_2d(&model).is_err());
    let influence = serde_json::json!({"solver": model, "quantity": "Rz", "targetNodeId": 1, "nPointsPerElement": 2});
    let error = compute_influence_line(&serde_json::from_value(influence).unwrap()).expect_err("no influence line for a mechanism");
    assert!(error.starts_with("Influence line: the unit load on element 1 at t = 0 could not be solved: "), "{error}");
}

fn warped_id(quad9: bool) -> &'static str {
    if quad9 { "SH-WARPED-MITC9" } else { "SH-WARPED-MITC4" }
}

fn warped_findings(ds: &[StructuredDiagnostic]) -> Vec<&StructuredDiagnostic> {
    ds.iter().filter(|d| d.phase.as_deref().is_some_and(|p| p.starts_with("SH-WARPED-"))).collect()
}

/// MacNeal–Harder twisted cantilever (L 12, width 1.1, E 29000, ν 0.22), clamped at the root,
/// with the tip load at the mid-width node.
fn twisted_strip(quad9: bool, nx: usize, ny: usize, degrees: f64, t: f64, load: [f64; 3]) -> (SolverInput3D, usize) {
    let (l, w) = (12.0, 1.1);
    let mut input = beam3d();
    input.nodes.clear(); input.elements.clear(); input.supports.clear(); input.loads.clear();
    *input.materials.get_mut("1").unwrap() = SolverMaterial { id: 1, e: 29_000.0, nu: 0.22 };
    let order = if quad9 { 2 } else { 1 };
    let (rows, cols) = (order * nx + 1, order * ny + 1);
    let node = |i: usize, j: usize| 1 + i * cols + j;
    for i in 0..rows {
        for j in 0..cols {
            let x = i as f64 / (rows - 1) as f64 * l;
            let s = j as f64 / (cols - 1) as f64 * w - w / 2.0;
            let a = x / l * degrees.to_radians();
            input.nodes.insert(node(i, j).to_string(), SolverNode3D { id: node(i, j), x, y: s * a.cos(), z: s * a.sin() });
        }
    }
    let mut id = 1;
    for i in 0..nx {
        for j in 0..ny {
            if quad9 {
                let (i, j) = (2 * i, 2 * j);
                let nodes = [node(i, j), node(i + 2, j), node(i + 2, j + 2), node(i, j + 2), node(i + 1, j), node(i + 2, j + 1), node(i + 1, j + 2), node(i, j + 1), node(i + 1, j + 1)];
                input.quad9s.insert(id.to_string(), SolverQuad9Element { id, nodes, material_id: 1, thickness: t });
            } else {
                input.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], material_id: 1, thickness: t });
            }
            id += 1;
        }
    }
    for j in 0..cols {
        input.supports.insert(j.to_string(), serde_json::from_value(serde_json::json!({"nodeId":node(0, j),"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true})).unwrap());
    }
    let tip = node(rows - 1, cols / 2);
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: tip, fx: load[0], fy: load[1], fz: load[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    (input, tip)
}

#[test]
fn warped_mitc_shells_on_the_twisted_beam_are_withheld() {
    // #1057: ratio to the reference 0.005424 (load A), mesh-independent, ×1.30-1.32 (MITC4)
    // and ×1.7-2.5 (MITC9); the twist curvature × thickness is (π/2)/12 × 0.32 = 0.042.
    for (quad9, meshes) in [(false, vec![(6, 2), (12, 4), (24, 8)]), (true, vec![(3, 1), (6, 2), (12, 4)])] {
        for (nx, ny) in meshes {
            let (input, _) = twisted_strip(quad9, nx, ny, 90.0, 0.32, [0.0, 0.0, 1.0]);
            let found = for_3d(&input, Analysis::Linear);
            let found = warped_findings(&found);
            assert_eq!(found.len(), 1, "{quad9} {nx}x{ny}");
            assert_eq!(found[0].phase.as_deref(), Some(warped_id(quad9)));
            assert_eq!((found[0].severity, found[0].value), (Severity::Error, Some(1057.0)));
            assert_eq!(found[0].element_kind, Some(if quad9 { ElementKind::Quad9 } else { ElementKind::Quad }));
            assert_eq!(found[0].element_ids, (1..=nx * ny).collect::<Vec<_>>(), "{quad9} {nx}x{ny}");
            common::assert_containment(dedaliano_engine::solver::linear::solve_3d(&input), warped_id(quad9));
        }
    }
}

#[test]
fn warped_mitc_twist_measure_is_the_helicoid_twist() {
    let kappa = std::f64::consts::FRAC_PI_2 / 12.0;
    for (quad9, nx, ny) in [(false, 24, 8), (true, 12, 4)] {
        {
            let (input, _) = twisted_strip(quad9, nx, ny, 90.0, 0.32, [0.0, 0.0, 1.0]);
            let points = |nodes: &[usize]| nodes.iter().map(|n| { let n = &input.nodes[&n.to_string()]; [n.x, n.y, n.z] }).collect::<Vec<_>>();
            let twists: Vec<f64> = if quad9 {
                input.quad9s.values().map(|q| { let p = points(&q.nodes); dedaliano_engine::element::quad9::quad9_twist_curvature(&std::array::from_fn(|i| p[i])) }).collect()
            } else {
                input.quads.values().map(|q| { let p = points(&q.nodes); dedaliano_engine::element::quad::quad_twist_curvature(&[p[0], p[1], p[2], p[3]]) }).collect()
            };
            let (lo, hi) = twists.iter().fold((f64::INFINITY, 0.0f64), |(lo, hi), &k| (lo.min(k), hi.max(k)));
            let edge = kappa / (1.0 + (0.55 * kappa).powi(2));
            assert!(hi <= kappa * (1.0 + 1e-3) && lo >= edge * (1.0 - 1e-3), "{quad9}: {lo} {hi} vs helicoid {edge}..{kappa}");
        }
    }
}

#[test]
fn warped_mitc_untwisted_flat_and_planar_curved_shells_are_not_flagged() {
    use dedaliano_engine::element::{quad::quad_twist_curvature, quad9::quad9_twist_curvature};
    for quad9 in [false, true] {
        let (strip, tip) = twisted_strip(quad9, 12, 4, 0.0, 0.32, [0.0, 0.0, 1.0]);
        let r = dedaliano_engine::solver::linear::solve_3d(&strip).unwrap();
        assert!(warped_findings(&r.structured_diagnostics).is_empty(), "{quad9}");
        let uz = r.displacements.iter().find(|d| d.node_id == tip).unwrap().uz;
        let beam = 12.0f64.powi(3) / (3.0 * 29.0e6 * 1.1 * 0.32f64.powi(3) / 12.0);
        assert!((uz / beam - 1.0).abs() < 0.01, "{quad9}: untwisted tip {uz} vs beam theory {beam}");
    }

    let twist = |f: &dyn Fn(f64, f64) -> [f64; 3], n: usize, quad9: bool| -> f64 {
        let order = if quad9 { 2 } else { 1 };
        let m = order * n;
        let p = |i: usize, j: usize| f(i as f64 / m as f64, j as f64 / m as f64);
        let mut worst = 0.0f64;
        for i in 0..n {
            for j in 0..n {
                let k = if quad9 {
                    let (i, j) = (2 * i, 2 * j);
                    quad9_twist_curvature(&[p(i, j), p(i + 2, j), p(i + 2, j + 2), p(i, j + 2), p(i + 1, j), p(i + 2, j + 1), p(i + 1, j + 2), p(i, j + 1), p(i + 1, j + 1)])
                } else {
                    quad_twist_curvature(&[p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)])
                };
                worst = worst.max(k);
            }
        }
        worst
    };
    let flat = |u: f64, v: f64| [3.0 * u, 2.0 * v + 0.3 * u, 0.0];
    let (r, angle) = (25.0, 40f64.to_radians());
    let scordelis = |u: f64, v: f64| { let a = (v - 0.5) * 2.0 * angle; [50.0 * u, r * a.sin(), r * a.cos()] };
    let cylinder_panel = |u: f64, v: f64| { let a = v * std::f64::consts::FRAC_PI_2; [4.0 * u, a.cos(), a.sin()] };
    let sphere = |u: f64, v: f64| { let (lat, lon) = (0.2 + 1.2 * u, 1.5 * v); [10.0 * lat.cos() * lon.cos(), 10.0 * lat.cos() * lon.sin(), 10.0 * lat.sin()] };
    for quad9 in [false, true] {
        for (name, f, tol) in [("flat", &flat as &dyn Fn(f64, f64) -> [f64; 3], 1e-12), ("Scordelis-Lo", &scordelis, 1e-12), ("cylinder", &cylinder_panel, 1e-12), ("sphere", &sphere, if quad9 { 1e-3 } else { 1e-12 })] {
            for n in [4, 16] {
                let k = twist(f, n, quad9);
                assert!(k < tol, "{name} quad9={quad9} {n}: twist {k}");
            }
        }
    }

    let mut cylinder = beam3d();
    cylinder.nodes.clear(); cylinder.elements.clear(); cylinder.supports.clear(); cylinder.loads.clear();
    let (nx, nc) = (8, 6);
    let node = |i: usize, j: usize| 1 + i * (nc + 1) + j;
    for i in 0..=nx {
        for j in 0..=nc {
            let p = cylinder_panel(i as f64 / nx as f64, j as f64 / nc as f64);
            cylinder.nodes.insert(node(i, j).to_string(), SolverNode3D { id: node(i, j), x: p[0], y: p[1], z: p[2] });
        }
    }
    for i in 0..nx {
        for j in 0..nc {
            let id = 1 + i * nc + j;
            cylinder.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], material_id: 1, thickness: 0.3 });
        }
    }
    for j in 0..=nc {
        cylinder.supports.insert(j.to_string(), serde_json::from_value(serde_json::json!({"nodeId":node(0, j),"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true})).unwrap());
    }
    cylinder.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: node(nx, nc / 2), fx: 0.0, fy: -1.0, fz: -1.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    let r = dedaliano_engine::solver::linear::solve_3d(&cylinder).unwrap();
    assert!(warped_findings(&r.structured_diagnostics).is_empty());
    let mut collapsed = cylinder.clone();
    collapsed.quads.retain(|_, e| e.id == 1);
    collapsed.quads.get_mut("1").unwrap().nodes = [1, 2, 2, 1];
    assert!(warped_findings(&for_3d(&collapsed, Analysis::Linear)).is_empty(), "a collapsed quad is the collapse gate's to refuse");
    assert!(r.displacements.iter().any(|d| d.uz.abs() > 0.0));
}

#[test]
fn warped_mitc_thresholds_are_the_measured_bands() {
    use dedaliano_engine::known_issues::{WARPED_MITC4_TWIST, WARPED_MITC9_TWIST};
    use dedaliano_engine::element::{quad::quad_twist_curvature, quad9::quad9_twist_curvature};
    let c = 0.3;
    let corners = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, c], [0.0, 1.0, 0.0]];
    let mut nine = [[0.0; 3]; 9];
    for (k, (u, v)) in [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.5, 0.0), (1.0, 0.5), (0.5, 1.0), (0.0, 0.5), (0.5, 0.5)].into_iter().enumerate() {
        nine[k] = [u, v, c * u * v];
    }
    assert_eq!((WARPED_MITC4_TWIST, WARPED_MITC9_TWIST), ((0.009, 0.016), (0.0035, 0.0065)), "the bands measured in CONTAINMENT.md (#1057)");
    for (quad9, (warn, refuse)) in [(false, (0.009, 0.016)), (true, (0.0035, 0.0065))] {
        let kappa = if quad9 { quad9_twist_curvature(&nine) } else { quad_twist_curvature(&corners) };
        assert!((kappa / c - 1.0).abs() < 0.1, "{quad9}: {kappa}");
        for (kt, expected) in [(0.999 * warn, None), (1.001 * warn, Some(Severity::Warning)), (0.999 * refuse, Some(Severity::Warning)), (1.001 * refuse, Some(Severity::Error)), (f64::NAN, None)] {
            let mut input = beam3d();
            input.nodes.clear(); input.elements.clear(); input.supports.clear(); input.loads.clear();
            let points: &[[f64; 3]] = if quad9 { &nine } else { &corners };
            for (k, p) in points.iter().enumerate() {
                input.nodes.insert((k + 1).to_string(), SolverNode3D { id: k + 1, x: p[0], y: p[1], z: p[2] });
            }
            if quad9 {
                input.quad9s.insert("3".into(), SolverQuad9Element { id: 3, nodes: std::array::from_fn(|i| i + 1), material_id: 1, thickness: kt / kappa });
            } else {
                input.quads.insert("3".into(), SolverQuadElement { id: 3, nodes: [1, 2, 3, 4], material_id: 1, thickness: kt / kappa });
            }
            let ds = for_3d(&input, Analysis::Linear);
            let found = warped_findings(&ds);
            assert_eq!(found.iter().map(|d| d.severity).next(), expected, "{quad9} {kt}");
            if let Some(d) = found.first() {
                assert_eq!((d.phase.as_deref(), d.element_ids.clone(), d.value), (Some(warped_id(quad9)), vec![3], Some(1057.0)));
                let refused = dedaliano_engine::known_issues::refuse(&ds);
                assert_eq!(refused.is_err(), expected == Some(Severity::Error));
                if expected == Some(Severity::Warning) {
                    assert!(d.message.contains("1.5 to 5 %") && d.message.ends_with(&format!("(known issue #1057, {})", warped_id(quad9))), "{}", d.message);
                }
            }
        }
    }
}

#[test]
fn warped_mitc_refusal_reaches_every_3d_entry_point() {
    use dedaliano_engine::solver::{buckling::*, cable::*, constraints::*, contact::*, creep_shrinkage::*, harmonic::*, linear::*, load_cases::*, modal::*, moving_loads::*, pdelta::*, reduction::*, spectral::*, ssi::*, staged::*, time_integration::*, winkler::*};
    use dedaliano_engine::certify;
    fn withheld<T>(result: Result<T, String>, id: &str) -> bool {
        result.err().and_then(|e| serde_json::from_str::<serde_json::Value>(&e).ok())
            .is_some_and(|v| v["structuredDiagnostics"].as_array().is_some_and(|ds| ds.iter().any(|d| d["phase"] == id && d["severity"] == "error")))
    }
    let densities = HashMap::from([("1".to_string(), 7.85)]);
    for (quad9, nx, ny) in [(false, 12, 4), (true, 3, 1)] {
        let id = warped_id(quad9);
        let (mut input, tip) = twisted_strip(quad9, nx, ny, 90.0, 0.32, [0.0, 0.0, 1.0]);
        let mut member = beam3d().elements["1"].clone();
        member.node_i = tip - 1; member.node_j = tip;
        input.elements.insert("1".into(), member);
        let section = input.sections.get_mut("1").unwrap();
        section.a = 1e-9; section.iy = 1e-12; section.iz = 1e-12; section.j = 1e-12;
        let (flat, _) = twisted_strip(quad9, nx, ny, 0.0, 0.32, [0.0, 0.0, 1.0]);
        let modes = solve_modal_3d(&flat, &densities, 2).unwrap().modes;
        let tie: Constraint = serde_json::from_value(serde_json::json!({"type":"equalDOF","masterNode":tip,"slaveNode":tip - 1,"dofs":[2]})).unwrap();
        let mut constrained = input.clone();
        constrained.constraints = vec![tie.clone()];
        let multi = MultiCaseInput3D { solver: input.clone(), load_cases: vec![LoadCase3D { name: "A".into(), loads: input.loads.clone() }],
            combinations: vec![CombinationDef { name: "C".into(), factors: HashMap::from([("A".into(), 1.0)]) }] };
        let harmonic = HarmonicInput3D { solver: input.clone(), densities: densities.clone(), frequencies: vec![0.1, 1.0], damping_ratio: 0.05, response_node_id: tip, response_dof: "z".into() };
        let th: TimeHistoryInput3D = serde_json::from_value(serde_json::json!({"solver": input, "densities": densities, "timeStep": 0.01, "nSteps": 2, "groundAccelZ": [1.0, 1.0, 1.0]})).unwrap();
        let spectral: SpectralInput3D = serde_json::from_value(serde_json::json!({
            "solver": input, "densities": densities, "modes": modes,
            "spectrum": {"name": "constant", "inG": false, "points": [{"period": 0.0, "sa": 1.0}, {"period": 1e9, "sa": 1.0}]}, "direction": "Z"})).unwrap();
        let plastic: PlasticInput3D = serde_json::from_value(serde_json::json!({"solver": input, "sections": {}, "materials": {}})).unwrap();
        let creep: CreepShrinkageInput3D = serde_json::from_value(serde_json::json!({"solver": input, "creepParams": {}, "timeSteps": [{"tDays": 28.0}]})).unwrap();
        let mut staged = serde_json::to_value(&input).unwrap();
        staged["stages"] = serde_json::json!([{ "name": "all", "elementsAdded": [1], "supportsAdded": input.supports.keys().map(|k| k.parse::<usize>().unwrap()).collect::<Vec<_>>(), "loadIndices": [0] }]);
        let influence = serde_json::from_value(serde_json::json!({"solver": input, "quantity": "Fz", "targetNodeId": 1, "gravityDirection": "z", "nPointsPerElement": 2})).unwrap();
        let moving: MovingLoadInput3D = serde_json::from_value(serde_json::json!({"solver": input, "train": {"name": "unit", "axles": [{"offset": 0.0, "weight": 1.0}]}, "step": 0.5})).unwrap();
        let outcomes: Vec<(&str, bool)> = vec![
            ("linear", withheld(solve_3d(&input), id)),
            ("prepared", withheld(prepare_static_3d(&input).and_then(|p| p.solve_loads(&input.loads)), id)),
            ("constrained direct", withheld(solve_constrained_3d(&ConstrainedInput3D { solver: input.clone(), constraints: vec![tie] }), id)),
            ("constrained dispatch", withheld(solve_3d(&constrained), id)),
            ("multi-case", withheld(solve_multi_case_3d(&multi), id)),
            ("pdelta", withheld(solve_pdelta_3d(&input, 10, 1e-6), id)),
            ("winkler", withheld(solve_winkler_3d(&WinklerInput3D { solver: input.clone(), foundation_springs: vec![] }), id)),
            ("ssi", withheld(solve_ssi_3d(&SSIInput3D { solver: input.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-6 }), id)),
            ("contact", withheld(solve_contact_3d(&serde_json::from_value(serde_json::json!({"solver": input})).unwrap()), id)),
            ("cable", withheld(solve_cable_3d(&input, &HashMap::new(), 20, 1e-6), id)),
            ("modal", withheld(solve_modal_3d(&input, &densities, 2), id)),
            ("spectral", withheld(solve_spectral_3d(&spectral), id)),
            ("time history", withheld(solve_time_history_3d(&th), id)),
            ("harmonic", withheld(solve_harmonic_3d(&harmonic), id)),
            ("guyan", withheld(guyan_reduce_3d(&GuyanInput3D { solver: input.clone(), boundary_nodes: vec![tip] }), id)),
            ("craig-bampton", withheld(craig_bampton_3d(&CraigBamptonInput3D { solver: input.clone(), densities: densities.clone(), boundary_nodes: vec![tip], n_modes: 2 }), id)),
            ("buckling", withheld(solve_buckling_3d(&input, 1), id)),
            ("creep", withheld(solve_creep_shrinkage_3d(&creep), id)),
            ("staged", match solve_staged_3d(&serde_json::from_value(staged).unwrap()) {
                Err(e) if quad9 => e.starts_with("Nine-node shell elements are not yet supported in staged construction"),
                outcome => withheld(outcome, id),
            }),
            ("plastic", withheld(dedaliano_engine::solver::plastic::solve_plastic_3d(&plastic), id)),
            ("influence", withheld(dedaliano_engine::postprocess::influence::compute_influence_line_3d(&influence), id)),
            ("moving loads", withheld(solve_moving_loads_3d(&moving), id)),
            ("convergence study", withheld(dedaliano_engine::postprocess::discretization::convergence::convergence_study_3d(&input, &Default::default()), id)),
            ("discretization estimate", withheld(dedaliano_engine::postprocess::discretization::solve_and_estimate_3d(&input), id)),
            ("certified linear", withheld(certify::solver::certify_linear_3d_full(&input), id)),
            ("certified pdelta", withheld(certify::pdelta::certify_pdelta_3d(&input, 10, 1e-6), id)),
            ("certified modal", withheld(certify::modal::certify_modal_3d(&input, &densities, 2), id)),
            ("certified spectral", withheld(certify::spectral::certify_spectral_3d(&spectral), id)),
            ("certified harmonic", withheld(certify::harmonic::certify_harmonic_3d(&harmonic), id)),
            ("certified buckling", withheld(certify::buckling::certify_buckling_3d(&input, 1), id)),
            ("certified plastic", withheld(certify::plastic_3d::certify_plastic_3d(&plastic), id)),
            ("linear bundle", withheld(certify::bundle::export_linear_bundle_3d(&input), id)),
            ("combination bundle", withheld(certify::combination_bundle::export_combination_bundle_3d(&multi), id)),
            ("plastic bundle", withheld(certify::plastic_bundle::export_plastic_bundle_3d(&plastic), id)),
        ];
        let missed: Vec<_> = outcomes.iter().filter(|(_, refused)| !refused).map(|(name, _)| *name).collect();
        assert!(missed.is_empty(), "{id} not withheld by: {missed:?}");
        let kinematics = dedaliano_engine::solver::kinematic::analyze_kinematics_3d(&input);
        assert!(kinematics.invalid_input.is_none(), "{:?}", kinematics.invalid_input);
    }
}

/// Ratio to Euler–Bernoulli of the twisted strip (#1057), the reference that MacNeal–Harder's
/// 0.005424 / 0.001754 match at 90°.
fn twisted_beam_theory(degrees: f64, t: f64, load_a: bool) -> f64 {
    let (l, w, e) = (12.0f64, 1.1f64, 29.0e6);
    let (weak, strong) = (w * t.powi(3) / 12.0, t * w.powi(3) / 12.0);
    let n = 4000;
    let sum: f64 = (0..n).map(|k| {
        let u = (k as f64 + 0.5) / n as f64;
        let (c2, s2) = ((u * degrees.to_radians()).cos().powi(2), (u * degrees.to_radians()).sin().powi(2));
        (1.0 - u).powi(2) * if load_a { c2 / weak + s2 / strong } else { s2 / weak + c2 / strong } / n as f64
    }).sum();
    l.powi(3) * sum / e
}

#[test]
fn warped_mitc_bands_bound_the_measured_twisted_beam_error() {
    let kappa = std::f64::consts::FRAC_PI_2 / 12.0;
    for (quad9, nx, ny, warn, refuse) in [(false, 24, 8, 0.009, 0.016), (true, 24, 8, 0.0035, 0.0065)] {
        let excess = |kt: f64| -> (f64, Vec<StructuredDiagnostic>) {
            let t = kt / kappa;
            let mut worst = 0.0f64;
            let mut diagnostics = vec![];
            for (load_a, load) in [(true, [0.0, 0.0, 1.0]), (false, [0.0, 1.0, 0.0])] {
                let ratio = |degrees: f64| {
                    let (input, tip) = twisted_strip(quad9, nx, ny, degrees, t, load);
                    let r = dedaliano_engine::solver::linear::solve_3d(&input).unwrap_or_else(|e| panic!("{quad9} κt {kt}: {e}"));
                    let d = r.displacements.iter().find(|d| d.node_id == tip).unwrap();
                    (if load_a { d.uz } else { d.uy } / twisted_beam_theory(degrees, t, load_a), r.structured_diagnostics)
                };
                let (twisted, ds) = ratio(90.0);
                let (flat, _) = ratio(0.0);
                assert!((flat - 1.0).abs() < 0.01, "{quad9} load {load_a}: the untwisted mesh is {flat} of beam theory");
                worst = worst.max((twisted / flat - 1.0).abs());
                diagnostics = ds;
            }
            (worst, diagnostics)
        };
        let (below_warn, ds) = excess(0.95 * warn);
        assert!(warped_findings(&ds).is_empty(), "{quad9}");
        assert!(below_warn < 0.015, "{quad9}: {below_warn} unflagged, over the 1.5 % warning band");
        let (below_refuse, ds) = excess(0.95 * refuse);
        assert_eq!(warped_findings(&ds).iter().map(|d| d.severity).collect::<Vec<_>>(), vec![Severity::Warning], "{quad9}");
        assert!(below_refuse > below_warn && below_refuse < 0.05, "{quad9}: {below_refuse} only warned, over the 5 % refusal band");
    }
}

#[test]
fn a_direct_constrained_3d_solve_checks_the_constraints_it_solves_with() {
    let mut solver = beam3d();
    solver.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    let tie = Constraint::EqualDOF(EqualDOFConstraint { master_node: 3, slave_node: 4, dofs: vec![2] });
    solver.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 999, dofs: vec![0] })];
    let ci = dedaliano_engine::solver::constraints::ConstrainedInput3D { solver: solver.clone(), constraints: vec![tie.clone()] };
    let direct = dedaliano_engine::solver::constraints::solve_constrained_3d(&ci).unwrap();
    solver.constraints = vec![tie];
    let through = dedaliano_engine::solver::linear::solve_3d(&solver).unwrap();
    assert_eq!(ids(&direct.structured_diagnostics), ids(&through.structured_diagnostics));
    assert_eq!(direct.displacements.len(), through.displacements.len());
    for (a, b) in direct.displacements.iter().zip(&through.displacements) {
        assert!((a.uz - b.uz).abs() <= 1e-12 * (1.0 + b.uz.abs()), "{} vs {}", a.uz, b.uz);
    }
}

#[test]
fn round_off_compression_beside_a_compressed_column_adds_no_buckling_mode() {
    use common::make_input;
    use dedaliano_engine::solver::buckling::solve_buckling_2d;
    let column_nodes = vec![(1, 0.0, 0.0), (2, 0.0, 1.0), (3, 0.0, 2.0), (4, 0.0, 3.0), (5, 0.0, 4.0)];
    let column_elems = vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false), (3, "frame", 3, 4, 1, 1, false, false), (4, "frame", 4, 5, 1, 1, false, false)];
    let push = SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -100.0, my: 0.0 });
    let column = make_input(column_nodes.clone(), vec![(1, E, 0.3)], vec![(1, 0.01, 1e-5)], column_elems.clone(), vec![(1, 1, "fixed")], vec![push.clone()]);
    let mut nodes = column_nodes;
    let (c, sn) = (0.3f64.cos(), 0.3f64.sin());
    nodes.extend([0.0, 1.3, 2.7, 4.0].iter().enumerate().map(|(i, &t)| (11 + i, 10.0 + t * c, t * sn)));
    let mut elems = column_elems;
    elems.extend([(11, "frame", 11, 12, 1, 1, false, false), (12, "frame", 12, 13, 1, 1, false, false), (13, "frame", 13, 14, 1, 1, false, false)]);
    let loads = vec![push, SolverLoad::Nodal(SolverNodalLoad { node_id: 12, fx: -37.3 * sn, fz: 37.3 * c, my: 0.0 }), SolverLoad::Nodal(SolverNodalLoad { node_id: 13, fx: -51.9 * sn, fz: 51.9 * c, my: 0.0 })];
    let mixed = make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 1e-5)], elems, vec![(1, 1, "fixed"), (2, 11, "pinned"), (3, 14, "pinned")], loads);
    let n = dedaliano_engine::solver::buckling::buckling_system_2d(&mixed).unwrap().mean_n;
    assert!([11, 12, 13].iter().any(|id| n[id] < 0.0 && n[id] > -1e-9), "{n:?}");
    let alone = solve_buckling_2d(&column, 3).unwrap();
    let both = solve_buckling_2d(&mixed, 3).unwrap();
    assert_eq!(alone.modes.len(), 3);
    assert_eq!(both.modes.len(), 3);
    for (a, b) in alone.modes.iter().zip(&both.modes) {
        assert!((a.load_factor - b.load_factor).abs() <= 1e-9 * a.load_factor, "{} vs {}", a.load_factor, b.load_factor);
    }
}
