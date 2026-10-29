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
            if shape != "regular" && direction == 1 {
                common::assert_containment(cable_result, "SH-MITC4-DISTORTION");
                let plastic: PlasticInput3D = serde_json::from_value(serde_json::json!({"solver":input,"sections":{},"materials":{}})).unwrap();
                common::assert_containment(dedaliano_engine::solver::plastic::solve_plastic_3d(&plastic), "SH-MITC4-DISTORTION");
                common::assert_containment(dedaliano_engine::certify::plastic_3d::certify_plastic_3d(&plastic), "SH-MITC4-DISTORTION");
                common::assert_containment(dedaliano_engine::certify::plastic_bundle::export_plastic_bundle_3d(&plastic), "SH-MITC4-DISTORTION");
            } else {
                let cable_result = cable_result.unwrap();
                assert_eq!(ids(&cable_result.results.structured_diagnostics).contains(&"SH-MITC4-DISTORTION".into()), shape != "regular");
            }
            let result = dedaliano_engine::solver::linear::solve_3d(&input);
            if shape != "regular" && direction == 1 {
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
                    eprintln!("{entry}: {shape}");
                    common::assert_containment(result, "SH-MITC4-DISTORTION");
                }
                for solver in [input.clone(), constrained] {
                    let cases = [10000.0, -10000.0].into_iter().enumerate().map(|(i, fx)| {
                        let mut loads = input.loads.clone();
                        for load in &mut loads {
                            if let SolverLoad3D::Nodal(n) = load { n.fx = fx; }
                        }
                        LoadCase3D { name: i.to_string(), loads }
                    }).collect();
                    let multi = MultiCaseInput3D { solver, load_cases: cases, combinations: vec![CombinationDef { name: "cancel extension".into(), factors: [("0".into(), 1.0), ("1".into(), 1.0)].into() }] };
                    for case in &multi.load_cases {
                        let mut single = multi.solver.clone();
                        single.loads = case.loads.clone();
                        let r = dedaliano_engine::solver::linear::solve_3d(&single).unwrap();
                        assert!(ids(&r.structured_diagnostics).contains(&"SH-MITC4-DISTORTION".into()));
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
    check(&compute_envelope_3d(&[combined]).unwrap().max_abs_results_3d.structured_diagnostics);
    r.structured_diagnostics.push(dedaliano_engine::known_issues::diagnostic("SH-MITC4-DISTORTION"));
    common::assert_containment(combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }], &[(1, &r)]), "SH-MITC4-DISTORTION");
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
