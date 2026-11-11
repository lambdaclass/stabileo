use crate::{
    ana2, ana3,
    case::{Case2, Case3},
    checks2, checks3,
    tally::Tally,
};
use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
use dedaliano_engine::types::SolverInput;

fn fixtures() -> Vec<Case2> {
    [
        (
            "random-29-input",
            include_str!("../fixtures/random-29-input.json"),
        ),
        (
            "random-32-input",
            include_str!("../fixtures/random-32-input.json"),
        ),
        (
            "random-41-input",
            include_str!("../fixtures/random-41-input.json"),
        ),
        (
            "random-49-input",
            include_str!("../fixtures/random-49-input.json"),
        ),
    ]
    .into_iter()
    .map(|(name, text)| Case2::new(name, serde_json::from_str::<SolverInput>(text).unwrap()))
    .collect()
}

fn support_loads_2d(analysis: &str) {
    let tally = Tally::default();
    let ctx = checks2::Ctx {
        tally: &tally,
        rng_seed: 20754,
    };
    let rows: Vec<_> = ana2::rows()
        .into_iter()
        .filter(|a| a.name == analysis)
        .collect();
    assert_eq!(rows.len(), 1);
    for case in fixtures() {
        (rows[0].run)(&case).unwrap();
        checks2::check_case(&ctx, &case, &rows, &["rotation", "mirror", "units"]);
    }
    assert!(
        tally.failures().is_empty(),
        "{}\n{:?}",
        tally.report(),
        tally.failures()
    );
}

fn support_loads_3d(analysis: &str) {
    let tally = Tally::default();
    let ctx = checks3::Ctx {
        tally: &tally,
        rng_seed: 20754,
    };
    let rows: Vec<_> = ana3::rows()
        .into_iter()
        .filter(|a| a.name == analysis)
        .collect();
    assert_eq!(rows.len(), 1);
    for case in fixtures() {
        for plane in Plane::ALL {
            let case = Case3::new(
                format!("{}-{plane:?}", case.name),
                embed_2d(&case.s, plane).unwrap(),
            );
            (rows[0].run)(&case).unwrap();
            checks3::check_case(&ctx, &case, &rows, &["rotation", "mirror", "units"]);
        }
    }
    assert!(
        tally.failures().is_empty(),
        "{}\n{:?}",
        tally.report(),
        tally.failures()
    );
}

#[test]
fn issue_761_pdelta_support_loads_2d() {
    support_loads_2d("P-Delta");
}

#[test]
fn issue_761_fiber_support_loads_2d() {
    support_loads_2d("fiber nonlinear");
}

#[test]
fn issue_761_corotational_support_loads_2d() {
    support_loads_2d("corotational");
}

#[test]
fn issue_761_linear_support_loads_2d() {
    support_loads_2d("linear");
}

#[test]
fn issue_761_pdelta_support_loads_3d() {
    support_loads_3d("P-Delta");
}

#[test]
fn issue_761_fiber_support_loads_3d() {
    support_loads_3d("fiber nonlinear");
}

#[test]
fn issue_761_corotational_support_loads_3d() {
    support_loads_3d("corotational");
}

#[test]
fn issue_761_linear_support_loads_3d() {
    support_loads_3d("linear");
}

use dedaliano_engine::metamorphic::{
    transform::{transform_2d, Iso2},
    units::{scale_2d, Units},
};
use dedaliano_engine::{
    solver::{corotational, fiber_nonlinear as fiber, pdelta},
    types::*,
};

fn fiber_input(s: &SolverInput, max_iter: usize) -> fiber::FiberNonlinearInput {
    let fiber_sections = s
        .sections
        .values()
        .map(|x| {
            let (b, h) = ana2::rect(x.a, x.iz);
            (
                x.id.to_string(),
                ana2::rect_fibers(b, h, 40, 1, ana2::mat_e(s, x.id)),
            )
        })
        .collect();
    fiber::FiberNonlinearInput {
        solver: s.clone(),
        fiber_sections,
        n_integration_points: 5,
        max_iter,
        tolerance: 1e-10,
        n_increments: 1,
        modified_nr: false,
    }
}

fn cantilever() -> SolverInput {
    let mut s = fixtures().remove(0).s;
    s.supports.retain(|_, x| x.node_id == 1);
    s.supports.values_mut().next().unwrap().support_type = "fixed".into();
    s.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: -1.0,
        fz: -0.25,
        my: 0.0,
    })];
    s
}

#[test]
fn issue_761_unfinished_iterations_stay_unconverged() {
    let base = cantilever();
    for length in [0.001, 1.0, 1000.0] {
        for force in [1e-12, 1.0, 1e12] {
            let s = scale_2d(&base, &Units::froude(length, force));
            let s = transform_2d(&s, &Iso2::rotation(0.731)).unwrap();
            assert!(!pdelta::solve_pdelta_2d(&s, 1, 1e-12).unwrap().converged);
            assert!(
                !corotational::solve_corotational_2d(&s, 1, 1e-10, 1, false)
                    .unwrap()
                    .converged
            );
            assert!(
                !fiber::solve_fiber_nonlinear_2d(&fiber_input(&s, 1))
                    .unwrap()
                    .converged
            );
        }
    }
}

#[test]
fn issue_761_resolved_axial_load_keeps_its_answer_and_export_parity() {
    let mut base = cantilever();
    if let SolverLoad::Nodal(l) = &mut base.loads[0] {
        l.fz = 0.0;
    }
    let node = &base.nodes["2"];
    let expected = -node.x / (1000.0 * base.materials["1"].e * base.sections["1"].a);
    for length in [0.001, 1.0, 1000.0] {
        for force in [1e-12, 1.0, 1e12] {
            let s = scale_2d(&base, &Units::froude(length, force));
            let text = serde_json::to_string(&s).unwrap();
            let f = fiber_input(&s, 60);
            let p = pdelta::solve_pdelta_2d(&s, 100, 1e-12).unwrap();
            let c = corotational::solve_corotational_2d(&s, 100, 1e-10, 1, false).unwrap();
            let f = fiber::solve_fiber_nonlinear_2d(&f).unwrap();
            assert!(p.converged && c.converged && f.converged);
            for r in [&p.results, &c.results, &f.results] {
                let tip = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
                crate::common::assert_close(tip.ux / length, expected, 1e-10, "axial displacement");
            }
            let exported: serde_json::Value = serde_json::from_str(
                &dedaliano_engine::solve_pdelta_2d(&text, 100, 1e-12).unwrap(),
            )
            .unwrap();
            assert_eq!(exported["converged"], true);
            let exported: serde_json::Value = serde_json::from_str(
                &dedaliano_engine::solve_corotational_2d(&text, 100, 1e-10, 1).unwrap(),
            )
            .unwrap();
            assert_eq!(exported["converged"], true);
            let exported: serde_json::Value = serde_json::from_str(
                &dedaliano_engine::solve_fiber_nonlinear_2d(
                    &serde_json::to_string(&fiber_input(&s, 60)).unwrap(),
                )
                .unwrap(),
            )
            .unwrap();
            assert_eq!(exported["converged"], true);
        }
    }
}

#[test]
fn issue_761_material_support_loads_2d() {
    support_loads_2d("material nonlinear");
}

#[test]
fn issue_761_material_support_loads_3d() {
    support_loads_3d("material nonlinear");
}

fn fiber_input_3d(s: &SolverInput3D, max_iter: usize) -> fiber::FiberNonlinearInput3D {
    let fiber_sections = s
        .sections
        .values()
        .map(|x| {
            use dedaliano_engine::element::fiber_beam::{Fiber, FiberMaterial, FiberSectionDef};
            let mut fibers = Vec::new();
            for y in [-1.0, 1.0] {
                for z in [-1.0, 1.0] {
                    fibers.push(Fiber {
                        y: y * (x.iz / x.a).sqrt(),
                        z: z * (x.iy / x.a).sqrt(),
                        area: x.a / 4.0,
                        material_idx: 0,
                    });
                }
            }
            (
                x.id.to_string(),
                FiberSectionDef {
                    fibers,
                    materials: vec![FiberMaterial::Elastic {
                        e: s.materials["1"].e,
                    }],
                },
            )
        })
        .collect();
    fiber::FiberNonlinearInput3D {
        solver: s.clone(),
        fiber_sections,
        n_integration_points: 5,
        max_iter,
        tolerance: 1e-10,
        n_increments: 1,
        modified_nr: false,
    }
}

#[test]
fn issue_761_unfinished_iterations_stay_unconverged_3d() {
    let base = cantilever();
    for plane in Plane::ALL {
        for units in [Units::froude(0.001, 1e-12), Units::froude(1000.0, 1e12)] {
            let s = embed_2d(&scale_2d(&base, &units), plane).unwrap();
            assert!(!pdelta::solve_pdelta_3d(&s, 1, 1e-12).unwrap().converged);
            assert!(
                !corotational::solve_corotational_3d(&s, 1, 1e-10, 1, false)
                    .unwrap()
                    .converged
            );
            assert!(
                !fiber::solve_fiber_nonlinear_3d(&fiber_input_3d(&s, 1))
                    .unwrap()
                    .converged
            );
        }
    }
}

#[test]
fn issue_761_native_and_wasm_cases() {
    let mut cases = Vec::new();
    for case in fixtures() {
        for iso in [Iso2::rotation(0.731), Iso2::mirror_line(1.293)] {
            let s = transform_2d(&case.s, &iso).unwrap();
            for units in [Units::froude(0.001, 1000.0), Units::froude(1.0, 1.0)] {
                let s = scale_2d(&s, &units);
                cases.push(
                    serde_json::json!({"name":case.name,"dimension":2,"solver":s,"converged":true}),
                );
                for plane in Plane::ALL {
                    let base = scale_2d(&case.s, &units);
                    let mut s = embed_2d(&base, plane).unwrap();
                    for support in s.supports.values_mut() {
                        let fixed = support.node_id == 1;
                        let normal = plane.e2();
                        support.rx = fixed || normal[0] != 0.0;
                        support.ry = fixed || normal[1] != 0.0;
                        support.rz = fixed || normal[2] != 0.0;
                        support.rrx = fixed;
                        support.rry = fixed;
                        support.rrz = fixed;
                    }
                    if iso.det() < 0.0 {
                        let axis = if plane == Plane::YZ { 1 } else { 0 };
                        s = dedaliano_engine::metamorphic::mirror::mirror_3d(&s, axis, [0.0; 3])
                            .unwrap();
                    }
                    let iso3 = dedaliano_engine::metamorphic::transform::Iso3::from_euler(
                        0.731, -0.417, 1.293,
                    );
                    let s =
                        dedaliano_engine::metamorphic::transform::transform_3d(&s, &iso3).unwrap();
                    cases.push(serde_json::json!({"name":case.name,"dimension":3,"solver":s,"converged":true}));
                }
            }
        }
    }
    for unfinished in [false, true] {
        let mut s = cantilever();
        if !unfinished {
            if let SolverLoad::Nodal(l) = &mut s.loads[0] {
                l.fz = 0.0;
            }
        }
        for units in [Units::froude(0.001, 1e-12), Units::froude(1000.0, 1e12)] {
            let s = scale_2d(&s, &units);
            cases.push(serde_json::json!({"name":"loaded cantilever","dimension":2,"solver":s,"converged":!unfinished}));
            for plane in Plane::ALL {
                let s = embed_2d(&s, plane).unwrap();
                cases.push(serde_json::json!({"name":"loaded cantilever","dimension":3,"solver":s,"converged":!unfinished}));
            }
        }
    }
    let mut resolved = fixtures().remove(0).s;
    resolved.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 1.0,
        fz: 1e20,
        my: 0.0,
    })];
    let axial =
        resolved.nodes["2"].x / (1000.0 * resolved.materials["1"].e * resolved.sections["1"].a);
    for plane in Plane::ALL {
        let mut s = embed_2d(&resolved, plane).unwrap();
        for support in s.supports.values_mut() {
            let fixed = support.node_id == 1;
            support.rx = true;
            support.ry = fixed;
            support.rz = fixed;
            support.rrx = fixed;
            support.rry = fixed;
            support.rrz = fixed;
            if !fixed {
                support.is_inclined = Some(true);
                let normal = plane.e2();
                support.normal_x = Some(normal[0]);
                support.normal_y = Some(normal[1]);
                support.normal_z = Some(normal[2]);
            }
        }
        cases.push(serde_json::json!({"name":"resolved axial beside support load","dimension":3,"solver":s,"converged":true,"expectedAxialDisplacement":axial}));
    }
    let support = resolved
        .supports
        .values_mut()
        .find(|s| s.node_id == 2)
        .unwrap();
    support.support_type = "inclinedRoller".into();
    support.angle = Some(0.0);
    cases.push(serde_json::json!({"name":"resolved axial beside support load","dimension":2,"solver":resolved,"converged":true,"expectedAxialDisplacement":axial}));
    cases.extend(rotated_resolved_cases());
    let tiny = spatial_sub_ulp_input();
    let linear = dedaliano_engine::solver::linear::solve_3d(&tiny).unwrap();
    let tip = linear
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    let expected = vec![tip];
    cases.push(serde_json::json!({"name":"sub ULP spatial load","dimension":3,"solver":tiny,"converged":true,"expectedDisplacements":expected}));
    cases.extend(r2::point_cases());
    check_export_cases(cases);
    r2::check_export_calls();
}

fn check_export_cases(cases: Vec<serde_json::Value>) {
    check_export_cases_for(cases, None);
}

fn check_export_cases_for(cases: Vec<serde_json::Value>, analysis: Option<usize>) {
    for case in &cases {
        let max_iter = if case["converged"] == true { 100 } else { 1 };
        let text = case["solver"].to_string();
        let fiber_text;
        let certificate_result = if case["dimension"] == 2 {
            dedaliano_engine::certify_pdelta_2d(&text, max_iter, 1e-12).unwrap()
        } else {
            dedaliano_engine::certify_pdelta_3d(&text, max_iter, 1e-12).unwrap()
        };
        let certificate_result: serde_json::Value =
            serde_json::from_str(&certificate_result).unwrap();
        assert_eq!(
            certificate_result["results"]["converged"],
            case["converged"]
        );
        let results = if case["dimension"] == 2 {
            let s: SolverInput = serde_json::from_str(&text).unwrap();
            fiber_text = serde_json::to_value(fiber_input(&s, max_iter)).unwrap();
            [
                dedaliano_engine::solve_pdelta_2d(&text, max_iter, 1e-12).unwrap(),
                dedaliano_engine::solve_corotational_2d(&text, max_iter, 1e-10, 1).unwrap(),
                dedaliano_engine::solve_fiber_nonlinear_2d(&fiber_text.to_string()).unwrap(),
                dedaliano_engine::solve_nonlinear_material_2d(
                    &serde_json::to_string(&NonlinearMaterialInput {
                        solver: s,
                        material_models: Default::default(),
                        section_capacities: Default::default(),
                        max_iter,
                        tolerance: 1e-10,
                        n_increments: 1,
                    })
                    .unwrap(),
                )
                .unwrap(),
            ]
        } else {
            let s: SolverInput3D = serde_json::from_str(&text).unwrap();
            fiber_text = serde_json::to_value(fiber_input_3d(&s, max_iter)).unwrap();
            [
                dedaliano_engine::solve_pdelta_3d(&text, max_iter, 1e-12).unwrap(),
                dedaliano_engine::solve_corotational_3d(&text, max_iter, 1e-10, 1).unwrap(),
                dedaliano_engine::solve_fiber_nonlinear_3d(&fiber_text.to_string()).unwrap(),
                dedaliano_engine::solve_nonlinear_material_3d(
                    &serde_json::to_string(&NonlinearMaterialInput3D {
                        solver: s,
                        material_models: Default::default(),
                        section_capacities: Default::default(),
                        max_iter,
                        tolerance: 1e-10,
                        n_increments: 1,
                    })
                    .unwrap(),
                )
                .unwrap(),
            ]
        };
        for (index, text) in results.into_iter().enumerate() {
            if analysis.is_some_and(|a| a != index) {
                continue;
            }
            let r: serde_json::Value = serde_json::from_str(&text).unwrap();
            assert_eq!(
                r["converged"], case["converged"],
                "analysis {index}: {case}, result {r}"
            );
            check_axial_displacement(&r, case);
        }
    }
    for case in cases
        .iter()
        .filter(|c| c["expectedAxialDisplacement"].is_number())
    {
        let results = if case["dimension"] == 2 {
            let s: SolverInput = serde_json::from_value(case["solver"].clone()).unwrap();
            let prepared = dedaliano_engine::solver::linear::prepare_static_2d(&s).unwrap();
            let dense =
                dedaliano_engine::solver::linear::prepare_static_2d_dense_reference(&s).unwrap();
            vec![
                serde_json::to_value(dedaliano_engine::solver::linear::solve_2d(&s).unwrap())
                    .unwrap(),
                serde_json::to_value(prepared.solve_loads(&s.loads).unwrap()).unwrap(),
                serde_json::to_value(dense.solve_loads(&s.loads).unwrap()).unwrap(),
            ]
        } else {
            let s: SolverInput3D = serde_json::from_value(case["solver"].clone()).unwrap();
            let prepared = dedaliano_engine::solver::linear::prepare_static_3d(&s).unwrap();
            vec![
                serde_json::to_value(dedaliano_engine::solver::linear::solve_3d(&s).unwrap())
                    .unwrap(),
                serde_json::to_value(prepared.solve_loads(&s.loads).unwrap()).unwrap(),
            ]
        };
        for r in results {
            check_axial_displacement(&serde_json::json!({"results":r}), case);
        }
    }
    if let Ok(path) = std::env::var("NONLINEAR_CONVERGENCE_CASES") {
        std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
    }
}

fn check_axial_displacement(r: &serde_json::Value, case: &serde_json::Value) {
    check_expected_displacements(r, case);
    if let Some(expected) = case["expectedAxialDisplacement"].as_f64() {
        let tip = r["results"]["displacements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["nodeId"] == 2)
            .unwrap();
        let node = &case["solver"]["nodes"]["2"];
        let chord = [
            node["x"].as_f64().unwrap(),
            node["y"].as_f64().unwrap_or(0.0),
            node["z"].as_f64().unwrap(),
        ];
        let length = chord.into_iter().fold(0.0f64, f64::hypot);
        let axis = if let Some(a) = case["expectedAxis"].as_array() {
            std::array::from_fn(|i| a[i].as_f64().unwrap())
        } else {
            chord.map(|v| v / length)
        };
        let u = [
            tip["ux"].as_f64().unwrap(),
            tip["uy"].as_f64().unwrap_or(0.0),
            tip["uz"].as_f64().unwrap(),
        ];
        let axial: f64 = u.iter().zip(axis).map(|(u, a)| u * a).sum();
        crate::common::assert_close(axial, expected, 1e-10, "signed axial displacement");
        let transverse = (0..3).fold(0.0f64, |n, i| n.hypot(u[i] - axial * axis[i]));
        assert!(
            transverse <= expected.abs() * 1e-10,
            "transverse={transverse}, expected axial={expected}"
        );
    }
}

fn check_expected_displacements(result: &serde_json::Value, case: &serde_json::Value) {
    let expected = case["expectedDisplacements"].as_array();
    for keys in [["ux", "uy", "uz"], ["rx", "ry", "rz"]] {
        let scale = expected
            .into_iter()
            .flatten()
            .flat_map(|d| keys.iter().filter_map(move |k| d[*k].as_f64()))
            .fold(0.0f64, |n, v| n.max(v.abs()));
        for e in expected.into_iter().flatten() {
            let actual = result["results"]["displacements"]
                .as_array()
                .unwrap()
                .iter()
                .find(|a| a["nodeId"] == e["nodeId"])
                .unwrap();
            for key in keys {
                if let Some(value) = e[key].as_f64() {
                    let a = actual[key].as_f64().unwrap();
                    let reference = if value == 0.0 { scale } else { value.abs() };
                    assert!(
                        a.is_finite() && (a - value).abs() <= 1e-10 * reference,
                        "{} {key}: {a} != {value}",
                        case["api"]
                    );
                }
            }
        }
    }
    if let Some(target) = case["expectedControl"].as_f64() {
        let tip = result["results"]["displacements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["nodeId"] == 2)
            .unwrap();
        crate::common::assert_close(
            tip["ux"].as_f64().unwrap(),
            target,
            1e-10,
            "signed controlled displacement",
        );
    }
}

#[test]
fn r4_displacement_checks_reject_sign_direction_and_zero_component_errors() {
    let case = serde_json::json!({"solver":{"nodes":{"2":{"x":1.0,"z":0.0}}},"expectedAxialDisplacement":1e-20});
    for (ux, uz) in [(-1e-20, 0.0), (0.0, 1e-20)] {
        let r = serde_json::json!({"results":{"displacements":[{"nodeId":2,"ux":ux,"uz":uz}]}});
        assert!(std::panic::catch_unwind(|| check_axial_displacement(&r, &case)).is_err());
    }
}

#[test]
fn r4_displacement_checks_reject_spurious_expected_zero_components() {
    let case = serde_json::json!({"expectedDisplacements":[{"nodeId":1,"ux":0.0,"uz":0.0},{"nodeId":2,"ux":1e-20,"uz":0.0}]});
    let r = serde_json::json!({"results":{"displacements":[{"nodeId":1,"ux":1e-25,"uz":0.0},{"nodeId":2,"ux":1e-20,"uz":0.0}]}});
    assert!(std::panic::catch_unwind(|| check_expected_displacements(&r, &case)).is_err());
}

#[test]
fn issue_761_path_correctors_keep_relative_equilibrium_under_rescaling() {
    use dedaliano_engine::solver::arc_length::{self, ArcLengthInput, DisplacementControlInput};
    let mut base = cantilever();
    if let SolverLoad::Nodal(l) = &mut base.loads[0] {
        l.fz = 0.0;
    }
    let axial = -base.nodes["2"].x / (1000.0 * base.materials["1"].e * base.sections["1"].a);
    for units in [
        Units::froude(0.001, 1e-16),
        Units::froude(1.0, 1.0),
        Units::froude(1000.0, 1e12),
    ] {
        let s = scale_2d(&base, &units);
        let mut dc = DisplacementControlInput {
            solver: s.clone(),
            control_node: 2,
            control_dof: 0,
            target_displacement: axial * units.length,
            n_steps: 2,
            max_iter: 60,
            tolerance: 1e-10,
        };
        let r = arc_length::solve_displacement_control(&dc).unwrap();
        assert!(r.converged);
        crate::common::assert_close(
            r.final_load_factor,
            1.0,
            1e-10,
            "displacement control load factor",
        );
        dc.max_iter = 1;
        assert!(
            !arc_length::solve_displacement_control(&dc)
                .unwrap()
                .converged
        );
        let ds = units.force.hypot(axial * units.length) / 10.0;
        let arc = ArcLengthInput {
            solver: s,
            max_steps: 1,
            max_iter: 60,
            tolerance: 1e-10,
            initial_ds: ds,
            min_ds: ds,
            max_ds: ds,
            target_iter: 4,
        };
        let r = arc_length::solve_arc_length(&arc).unwrap();
        assert!(r.converged);
        crate::common::assert_close(r.final_load_factor, 0.1, 1e-10, "arc length load factor");
    }
}

fn projected_pair(a: f64, x: f64, b: f64, y: f64) -> f64 {
    let first = a * x;
    let second = b * y;
    (first + second) + (a.mul_add(x, -first) + b.mul_add(y, -second))
}

fn rotated_resolved_cases() -> Vec<serde_json::Value> {
    let mut cases = Vec::new();
    let angle = std::f64::consts::FRAC_PI_4;
    let (sn, cs) = angle.sin_cos();
    for tangential in [-262144.0, -65536.0, 65536.0, 262144.0] {
        let mut s = fixtures().remove(0).s;
        let length = s.nodes["2"].x;
        let fx = -cs * tangential + sn * 1e20;
        let fz = sn * tangential + cs * 1e20;
        let projected = projected_pair(-cs, fx, sn, fz);
        assert!(projected * tangential > 0.0);
        assert!(fx != sn * 1e20 && fz != cs * 1e20);
        let expected = projected * length / (1000.0 * s.materials["1"].e * s.sections["1"].a);
        s.nodes.get_mut("2").unwrap().x = -cs * length;
        s.nodes.get_mut("2").unwrap().z = sn * length;
        s.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx,
            fz,
            my: 0.0,
        })];
        let support = s.supports.values_mut().find(|s| s.node_id == 2).unwrap();
        support.support_type = "inclinedRoller".into();
        support.angle = Some(angle);
        cases.push(serde_json::json!({"name":"rotated resolved axial beside support load","dimension":2,"solver":s,"converged":true,"expectedAxialDisplacement":expected}));
        for plane in Plane::ALL {
            let base = fixtures().remove(0).s;
            let mut s = embed_2d(&base, plane).unwrap();
            let e1 = plane.e1();
            let e2 = plane.e2();
            let normal: [f64; 3] = std::array::from_fn(|i| sn * e1[i] + cs * e2[i]);
            let r = dedaliano_engine::solver::assembly::inclined_rotation_matrix(
                normal[0], normal[1], normal[2],
            );
            let tangent = r[1..]
                .iter()
                .find(|row| row.iter().zip(e1).map(|(a, b)| a * b).sum::<f64>().abs() > 0.5)
                .unwrap();
            let coords: [f64; 3] = std::array::from_fn(|i| tangent[i] * length);
            let force: [f64; 3] = std::array::from_fn(|i| tangent[i] * tangential + r[0][i] * 1e20);
            let active: Vec<_> = (0..3).filter(|&i| tangent[i] != 0.0).collect();
            assert_eq!(active.len(), 2);
            let projected = projected_pair(
                tangent[active[0]],
                force[active[0]],
                tangent[active[1]],
                force[active[1]],
            );
            assert!(projected * tangential > 0.0);
            let expected =
                projected * length / (1000.0 * base.materials["1"].e * base.sections["1"].a);
            let node = s.nodes.get_mut("2").unwrap();
            node.x = coords[0];
            node.y = coords[1];
            node.z = coords[2];
            s.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2,
                fx: force[0],
                fy: force[1],
                fz: force[2],
                mx: 0.0,
                my: 0.0,
                mz: 0.0,
                bw: None,
            })];
            for support in s.supports.values_mut() {
                let fixed = support.node_id == 1;
                support.rx = true;
                support.ry = fixed;
                support.rz = fixed;
                support.rrx = fixed;
                support.rry = fixed;
                support.rrz = fixed;
                if !fixed {
                    support.is_inclined = Some(true);
                    support.normal_x = Some(normal[0]);
                    support.normal_y = Some(normal[1]);
                    support.normal_z = Some(normal[2]);
                }
            }
            cases.push(serde_json::json!({"name":"rotated resolved axial beside support load","dimension":3,"solver":s,"converged":true,"expectedAxialDisplacement":expected}));
        }
    }
    cases
}

macro_rules! rotated_resolved_test {
    ($name:ident, $dimension:expr, $analysis:expr) => {
        #[test]
        fn $name() {
            check_export_cases_for(
                rotated_resolved_cases()
                    .into_iter()
                    .filter(|c| c["dimension"] == $dimension)
                    .collect(),
                Some($analysis),
            );
        }
    };
}

rotated_resolved_test!(issue_761_rotated_resolved_pdelta_2d, 2, 0);
rotated_resolved_test!(issue_761_rotated_resolved_corotational_2d, 2, 1);
rotated_resolved_test!(issue_761_rotated_resolved_fiber_2d, 2, 2);
rotated_resolved_test!(issue_761_rotated_resolved_material_2d, 2, 3);
rotated_resolved_test!(issue_761_rotated_resolved_pdelta_3d, 3, 0);
rotated_resolved_test!(issue_761_rotated_resolved_corotational_3d, 3, 1);
rotated_resolved_test!(issue_761_rotated_resolved_fiber_3d, 3, 2);
rotated_resolved_test!(issue_761_rotated_resolved_material_3d, 3, 3);

#[test]
fn issue_761_spatial_corotational_resolves_sub_ulp_chord_displacements() {
    let s = spatial_sub_ulp_input();
    let reference = dedaliano_engine::solver::linear::solve_3d(&s).unwrap();
    let result = corotational::solve_corotational_3d(&s, 100, 1e-10, 1, false).unwrap();
    assert!(result.converged);
    let expected = reference
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    let actual = result
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    for (a, b) in [
        (actual.ux, expected.ux),
        (actual.uy, expected.uy),
        (actual.uz, expected.uz),
    ] {
        crate::common::assert_close(a, b, 1e-10, "sub ULP spatial axial displacement");
    }
}

fn spatial_sub_ulp_input() -> SolverInput3D {
    let base = cantilever();
    let mut s = embed_2d(&base, Plane::XZ).unwrap();
    s.supports.retain(|_, support| support.node_id == 1);
    let iso = dedaliano_engine::metamorphic::transform::Iso3::from_euler(0.731, -0.417, 1.293);
    let mut s = dedaliano_engine::metamorphic::transform::transform_3d(&s, &iso).unwrap();
    for load in &mut s.loads {
        if let SolverLoad3D::Nodal(load) = load {
            load.fx *= 1e-16;
            load.fy *= 1e-16;
            load.fz *= 1e-16;
        }
    }
    s
}

#[test]
fn issue_761_rotated_resolved_linear_2d() {
    check_export_cases_for(
        rotated_resolved_cases()
            .into_iter()
            .filter(|c| c["dimension"] == 2)
            .collect(),
        Some(4),
    );
}

#[test]
fn issue_761_rotated_resolved_linear_3d() {
    check_export_cases_for(
        rotated_resolved_cases()
            .into_iter()
            .filter(|c| c["dimension"] == 3)
            .collect(),
        Some(4),
    );
}

#[test]
fn issue_761_rotated_resolved_arc_length_and_displacement_control_refusal() {
    use dedaliano_engine::solver::arc_length::{self, ArcLengthInput, DisplacementControlInput};
    for case in rotated_resolved_cases()
        .into_iter()
        .filter(|c| c["dimension"] == 2)
    {
        let solver: SolverInput = serde_json::from_value(case["solver"].clone()).unwrap();
        let expected = case["expectedAxialDisplacement"].as_f64().unwrap();
        let length = solver.nodes["2"].x.hypot(solver.nodes["2"].z);
        let force = expected * 1000.0 * solver.materials["1"].e * solver.sections["1"].a / length;
        let ds = force.hypot(expected) / 10.0;
        let input = ArcLengthInput {
            solver: solver.clone(),
            max_steps: 1,
            max_iter: 100,
            tolerance: 1e-10,
            initial_ds: ds,
            min_ds: ds,
            max_ds: ds,
            target_iter: 4,
        };
        let r = arc_length::solve_arc_length(&input).unwrap();
        assert!(r.converged);
        crate::common::assert_close(
            r.final_load_factor,
            0.1,
            1e-10,
            "inclined arc-length load factor",
        );
        let r: serde_json::Value = serde_json::from_str(
            &dedaliano_engine::solve_arc_length(&serde_json::to_string(&input).unwrap()).unwrap(),
        )
        .unwrap();
        assert_eq!(r["converged"], true);
        crate::common::assert_close(
            r["finalLoadFactor"].as_f64().unwrap(),
            0.1,
            1e-10,
            "exported inclined arc-length load factor",
        );
        let mut expected_case = case;
        expected_case["expectedAxialDisplacement"] = serde_json::json!(expected * 0.1);
        check_axial_displacement(&r, &expected_case);
        let control = DisplacementControlInput {
            solver,
            control_node: 2,
            control_dof: 0,
            target_displacement: expected,
            n_steps: 2,
            max_iter: 100,
            tolerance: 1e-10,
        };
        assert!(arc_length::solve_displacement_control(&control)
            .unwrap_err()
            .to_lowercase()
            .contains("inclined"));
    }
}

mod r2 {
    use super::*;
    use dedaliano_engine::solver::{
        arc_length::{self, ArcLengthInput, DisplacementControlInput},
        linear, material_nonlinear,
        soil_curves::SoilCurve,
        ssi::{self, SSIInput, SSIInput3D, SoilSpring},
    };

    fn material(s: SolverInput, max_iter: usize) -> NonlinearMaterialInput {
        NonlinearMaterialInput {
            solver: s,
            material_models: Default::default(),
            section_capacities: Default::default(),
            max_iter,
            tolerance: 1e-6,
            n_increments: 1,
        }
    }

    fn settlement_model() -> SolverInput {
        let mut base = cantilever();
        base.nodes.get_mut("2").unwrap().x = 5.0;
        base.sections.get_mut("1").unwrap().a = 0.02;
        base.supports.values_mut().next().unwrap().dx = Some(0.01);
        let mut tip = base.supports.values().next().unwrap().clone();
        tip.id = 2;
        tip.node_id = 2;
        tip.support_type = "rollerZ".into();
        tip.dx = None;
        base.supports.insert("2".into(), tip);
        base.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fz: -0.01,
            my: 0.0,
        })];
        base
    }

    #[test]
    fn settlement_cannot_hide_a_transverse_load() {
        let base = settlement_model();
        for force in [1.0, 1e-10, 1e10] {
            let s = scale_2d(&base, &Units::froude(1.0, force));
            let expected = linear::solve_2d(&s).unwrap();
            let input = material(s.clone(), 20);
            let actual = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();
            assert!(actual.converged);
            let e = expected
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .uz;
            let a = actual
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .uz;
            crate::common::assert_close(a, e, 1e-10, "settlement plus transverse load");
            assert!(
                !material_nonlinear::solve_nonlinear_material_2d(&material(s.clone(), 1))
                    .unwrap()
                    .converged
            );
            for plane in Plane::ALL {
                let s = embed_2d(&s, plane).unwrap();
                let input = NonlinearMaterialInput3D {
                    solver: s.clone(),
                    material_models: Default::default(),
                    section_capacities: Default::default(),
                    max_iter: 20,
                    tolerance: 1e-6,
                    n_increments: 1,
                };
                let a = material_nonlinear::solve_nonlinear_material_3d(&input).unwrap();
                assert!(a.converged);
                let e = linear::solve_3d(&s).unwrap();
                let a = a
                    .results
                    .displacements
                    .iter()
                    .find(|d| d.node_id == 2)
                    .unwrap();
                let e = e.displacements.iter().find(|d| d.node_id == 2).unwrap();
                crate::common::assert_close(
                    a.ux.hypot(a.uy).hypot(a.uz),
                    e.ux.hypot(e.uy).hypot(e.uz),
                    1e-10,
                    "spatial settlement plus transverse load",
                );
            }
        }
    }

    pub(super) fn spring_model(connector: bool) -> SolverInput {
        let mut s = cantilever();
        s.elements.clear();
        s.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 1.0,
            fz: 0.0,
            my: 0.0,
        })];
        s.nodes.get_mut("2").unwrap().x = 0.0;
        if connector {
            s.connectors.insert(
                "1".into(),
                ConnectorElement {
                    id: 1,
                    node_i: 1,
                    node_j: 2,
                    k_axial: 100.0,
                    k_shear: 100.0,
                    k_moment: 400.0,
                    k_shear_z: 100.0,
                    k_bend_y: 400.0,
                    k_bend_z: 400.0,
                },
            );
        } else {
            s.nodes.remove("1");
            s.supports.clear();
            s.supports.insert("2".into(), serde_json::from_value(serde_json::json!({"id":2,"nodeId":2,"type":"spring","kx":100.0,"ky":100.0,"kz":400.0})).unwrap());
        }
        s
    }

    fn point_3d(s: &SolverInput) -> SolverInput3D {
        let mut base = s.clone();
        let connectors = std::mem::take(&mut base.connectors);
        let mut s = embed_2d(&base, Plane::XZ).unwrap();
        s.connectors = connectors;
        s
    }

    pub(super) fn point_cases() -> Vec<serde_json::Value> {
        let mut cases = Vec::new();
        for connector in [false, true] {
            let s = spring_model(connector);
            cases.push(serde_json::json!({"name":"point spring","dimension":2,"solver":s,"converged":true,"expectedAxialDisplacement":0.01,"expectedAxis":[1.0,0.0,0.0]}));
            cases.push(serde_json::json!({"name":"point spring","dimension":3,"solver":point_3d(&s),"converged":true,"expectedAxialDisplacement":0.01,"expectedAxis":[1.0,0.0,0.0]}));
        }
        cases
    }

    #[test]
    fn coincident_connectors_and_single_node_springs_keep_their_answers() {
        for connector in [false, true] {
            let s = spring_model(connector);
            let r = linear::solve_2d(&s).unwrap();
            crate::common::assert_close(
                r.displacements.iter().find(|d| d.node_id == 2).unwrap().ux,
                0.01,
                1e-10,
                "linear spring",
            );
            let results = [
                pdelta::solve_pdelta_2d(&s, 20, 1e-10).unwrap().converged,
                corotational::solve_corotational_2d(&s, 20, 1e-10, 1, false)
                    .unwrap()
                    .converged,
                fiber::solve_fiber_nonlinear_2d(&fiber_input(&s, 20))
                    .unwrap()
                    .converged,
                material_nonlinear::solve_nonlinear_material_2d(&material(s.clone(), 20))
                    .unwrap()
                    .converged,
            ];
            assert!(results.into_iter().all(|c| c));
            let start = corotational::CorotationalStart2D {
                input: &s,
                displacements: &r.displacements,
            };
            let continued =
                corotational::solve_corotational_2d_from(&s, Some(&start), 20, 1e-10, 1, false)
                    .unwrap();
            assert!(continued.converged);
            let dc = DisplacementControlInput {
                solver: s.clone(),
                control_node: 2,
                control_dof: 0,
                target_displacement: 0.01,
                n_steps: 1,
                max_iter: 20,
                tolerance: 1e-10,
            };
            assert!(
                arc_length::solve_displacement_control(&dc)
                    .unwrap()
                    .converged
            );
            let ds = 0.1;
            let arc = ArcLengthInput {
                solver: s.clone(),
                max_steps: 1,
                max_iter: 20,
                tolerance: 1e-10,
                initial_ds: ds,
                min_ds: ds,
                max_ds: ds,
                target_iter: 4,
            };
            assert!(arc_length::solve_arc_length(&arc).unwrap().converged);
            let continued = arc_length::solve_arc_length_from(&arc, Some(&start)).unwrap();
            assert!(continued.converged);
            let tip = continued
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap();
            crate::common::assert_close(
                tip.ux,
                0.01 * (1.0 + continued.final_load_factor),
                1e-10,
                "continued point spring path",
            );
            let s = point_3d(&s);
            assert!(pdelta::solve_pdelta_3d(&s, 20, 1e-10).unwrap().converged);
            assert!(
                corotational::solve_corotational_3d(&s, 20, 1e-10, 1, false)
                    .unwrap()
                    .converged
            );
            assert!(
                fiber::solve_fiber_nonlinear_3d(&fiber_input_3d(&s, 20))
                    .unwrap()
                    .converged
            );
            let input = NonlinearMaterialInput3D {
                solver: s,
                material_models: Default::default(),
                section_capacities: Default::default(),
                max_iter: 20,
                tolerance: 1e-10,
                n_increments: 1,
            };
            assert!(
                material_nonlinear::solve_nonlinear_material_3d(&input)
                    .unwrap()
                    .converged
            );
        }
    }

    #[test]
    fn ssi_stiffness_convergence_is_relative_below_one() {
        let base = cantilever();
        for force in [1.0, 1e-10, 1e-12] {
            let units = Units::froude(1.0, force);
            let solver = scale_2d(&base, &units);
            let springs = vec![SoilSpring {
                node_id: 2,
                direction: 1,
                tributary_length: 1.0,
                curve: SoilCurve::Custom {
                    points: vec![[0.0, 0.0], [1e-7, 0.01 * force], [0.01, 0.02 * force]],
                },
            }];
            let input = SSIInput {
                solver: solver.clone(),
                soil_springs: springs.clone(),
                max_iter: 2,
                tolerance: 1e-6,
            };
            let r = ssi::solve_ssi_2d(&input).unwrap();
            assert!(!r.converged, "{force}: {r:?}");
            let mut springs3 = springs;
            springs3[0].direction = 2;
            let input = SSIInput3D {
                solver: embed_2d(&solver, Plane::XZ).unwrap(),
                soil_springs: springs3,
                max_iter: 2,
                tolerance: 1e-6,
            };
            assert!(!ssi::solve_ssi_3d(&input).unwrap().converged);
        }
    }

    #[test]
    fn pdelta_warping_seed_contains_the_seventh_dof() {
        let mut s: SolverInput3D = serde_json::from_str(include_str!("../metamorphic_corpus/feature_matrix/3d-warping-torsion-restrained-cantilever-with.json")).unwrap();
        if let SolverLoad3D::Nodal(l) = &mut s.loads[0] {
            l.fz = 0.0;
        }
        let linear = linear::solve_3d(&s).unwrap();
        assert!(linear
            .displacements
            .iter()
            .any(|d| d.warping.is_some_and(|v| v != 0.0)));
        let r = pdelta::solve_pdelta_3d(&s, 1, 1e-10).unwrap();
        assert!(r.converged);
    }
    #[test]
    fn path_reference_load_must_reach_an_independent_dof() {
        let mut solver = cantilever();
        solver.constraints = serde_json::from_value(
            serde_json::json!([{"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[0]}]),
        )
        .unwrap();
        solver.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 1.0,
            fz: 0.0,
            my: 0.0,
        })];
        let arc = ArcLengthInput {
            solver: solver.clone(),
            max_steps: 1,
            max_iter: 20,
            tolerance: 1e-10,
            initial_ds: 0.1,
            min_ds: 0.1,
            max_ds: 0.1,
            target_iter: 4,
        };
        assert!(arc_length::solve_arc_length(&arc)
            .unwrap_err()
            .contains("Zero reference load"));
        let baseline = linear::solve_2d(&solver).unwrap();
        let start = corotational::CorotationalStart2D {
            input: &solver,
            displacements: &baseline.displacements,
        };
        assert!(arc_length::solve_arc_length_from(&arc, Some(&start))
            .unwrap_err()
            .contains("Zero reference load"));
        let dc = DisplacementControlInput {
            solver,
            control_node: 2,
            control_dof: 1,
            target_displacement: 0.01,
            n_steps: 1,
            max_iter: 20,
            tolerance: 1e-10,
        };
        assert!(arc_length::solve_displacement_control(&dc)
            .unwrap_err()
            .contains("Zero reference load"));
    }

    #[test]
    fn post_step_nonlinearity_is_checked_below_the_old_force_floors() {
        use dedaliano_engine::element::fiber_beam::FiberMaterial;
        let mut base = cantilever();
        if let SolverLoad::Nodal(l) = &mut base.loads[0] {
            l.fx = 0.0;
            l.fz = -1000.0;
        }
        let mut tip = base.supports.values().next().unwrap().clone();
        tip.id = 2;
        tip.node_id = 2;
        tip.support_type = "guidedZ".into();
        base.supports.insert("2".into(), tip);
        for force in [1.0, 1e-25, 1e-40, 1e-50] {
            let s = scale_2d(&base, &Units::froude(1.0, force));
            assert!(!corotational::solve_corotational_2d(&s, 2, 1e-10, 1, false)
                .is_ok_and(|r| r.converged));
            let mut f = fiber_input(&s, 2);
            for section in f.fiber_sections.values_mut() {
                section.materials = vec![FiberMaterial::SteelBilinear {
                    e: s.materials["1"].e,
                    fy: base.materials["1"].e * 1e-5 * force,
                    hardening_ratio: 0.01,
                }];
            }
            assert!(!fiber::solve_fiber_nonlinear_2d(&f).is_ok_and(|r| r.converged));
            let s = embed_2d(&s, Plane::XZ).unwrap();
            assert!(!corotational::solve_corotational_3d(&s, 2, 1e-10, 1, false)
                .is_ok_and(|r| r.converged));
            let mut f = fiber_input_3d(&s, 2);
            for section in f.fiber_sections.values_mut() {
                section.materials = vec![FiberMaterial::SteelBilinear {
                    e: s.materials["1"].e,
                    fy: base.materials["1"].e * 1e-5 * force,
                    hardening_ratio: 0.01,
                }];
            }
            assert!(!fiber::solve_fiber_nonlinear_3d(&f).is_ok_and(|r| r.converged));
        }
    }

    #[test]
    fn yielding_material_is_not_elastic_below_a_force_floor() {
        let mut base = cantilever();
        if let SolverLoad::Nodal(l) = &mut base.loads[0] {
            l.fx = 0.0;
            l.fz = -1000.0;
        }
        let mut tip = base.supports.values().next().unwrap().clone();
        tip.id = 2;
        tip.node_id = 2;
        tip.support_type = "guidedZ".into();
        base.supports.insert("2".into(), tip);
        for force in [1.0, 1e-25, 1e-40, 1e-50] {
            let s = scale_2d(&base, &Units::froude(1.0, force));
            let mut input = material(s.clone(), 2);
            input.tolerance = 1e-10;
            input.material_models.insert(
                "1".into(),
                MaterialModel {
                    model_type: "bilinear".into(),
                    fy: base.materials["1"].e * 1e-5 * force,
                    alpha: Some(0.01),
                },
            );
            let mp = 100.0 * base.nodes["2"].x * force;
            input.section_capacities.insert(
                "1".into(),
                SectionCapacity {
                    np: 100.0 * force,
                    mp,
                    zp: None,
                },
            );
            assert!(
                !material_nonlinear::solve_nonlinear_material_2d(&input).is_ok_and(|r| r.converged),
                "force {force}"
            );
            let input = NonlinearMaterialInput3D {
                solver: embed_2d(&s, Plane::XZ).unwrap(),
                material_models: input.material_models,
                section_capacities: [(
                    "1".into(),
                    SectionCapacity3D {
                        np: 100.0 * force,
                        mpy: mp,
                        mpz: mp,
                        mpx: None,
                    },
                )]
                .into_iter()
                .collect(),
                max_iter: 2,
                tolerance: 1e-10,
                n_increments: 1,
            };
            assert!(
                !material_nonlinear::solve_nonlinear_material_3d(&input).is_ok_and(|r| r.converged),
                "force {force}"
            );
        }
    }

    pub(super) fn call(test: &serde_json::Value) -> Result<String, String> {
        fn encode<T: serde::Serialize>(result: Result<T, String>) -> Result<String, String> {
            result.map(|result| serde_json::to_string(&result).unwrap())
        }
        let value = test["input"].clone();
        let max_iter = test["maxIter"].as_u64().unwrap_or(2) as usize;
        let pdelta_iter = test["maxIter"].as_u64().unwrap_or(1) as usize;
        match test["api"].as_str().unwrap() {
            "solve_nonlinear_material_2d" => {
                encode(material_nonlinear::solve_nonlinear_material_2d(
                    &serde_json::from_value(value).unwrap(),
                ))
            }
            "solve_nonlinear_material_3d" => {
                encode(material_nonlinear::solve_nonlinear_material_3d(
                    &serde_json::from_value(value).unwrap(),
                ))
            }
            "solve_arc_length" => encode(arc_length::solve_arc_length(
                &serde_json::from_value(value).unwrap(),
            )),
            "solve_displacement_control" => encode(arc_length::solve_displacement_control(
                &serde_json::from_value(value).unwrap(),
            )),
            "solve_2d" => encode(
                linear::solve_2d(&serde_json::from_value(value).unwrap())
                    .map(|results| serde_json::json!({"converged":true,"results":results})),
            ),
            "solve_3d" => encode(
                linear::solve_3d(&serde_json::from_value(value).unwrap())
                    .map(|results| serde_json::json!({"converged":true,"results":results})),
            ),
            "solve_constrained_2d" => encode(
                dedaliano_engine::solver::constraints::solve_constrained_2d(
                    &serde_json::from_value(value).unwrap(),
                )
                .map(|results| serde_json::json!({"converged":true,"results":results})),
            ),
            "solve_constrained_3d" => encode(
                dedaliano_engine::solver::constraints::solve_constrained_3d(
                    &serde_json::from_value(value).unwrap(),
                )
                .map(|results| serde_json::json!({"converged":true,"results":results})),
            ),
            "solve_ssi_2d" => encode(ssi::solve_ssi_2d(&serde_json::from_value(value).unwrap())),
            "solve_ssi_3d" => encode(ssi::solve_ssi_3d(&serde_json::from_value(value).unwrap())),
            "solve_corotational_2d" => encode(corotational::solve_corotational_2d(
                &serde_json::from_value(value).unwrap(),
                max_iter,
                1e-10,
                1,
                false,
            )),
            "solve_corotational_3d" => encode(corotational::solve_corotational_3d(
                &serde_json::from_value(value).unwrap(),
                max_iter,
                1e-10,
                1,
                false,
            )),
            "solve_fiber_nonlinear_2d" => encode(fiber::solve_fiber_nonlinear_2d(
                &serde_json::from_value(value).unwrap(),
            )),
            "solve_fiber_nonlinear_3d" => encode(fiber::solve_fiber_nonlinear_3d(
                &serde_json::from_value(value).unwrap(),
            )),
            "solve_pdelta_2d" => encode(pdelta::solve_pdelta_2d(
                &serde_json::from_value(value).unwrap(),
                pdelta_iter,
                1e-10,
            )),
            "solve_pdelta_3d" => encode(pdelta::solve_pdelta_3d(
                &serde_json::from_value(value).unwrap(),
                pdelta_iter,
                1e-10,
            )),
            _ => panic!("unknown API"),
        }
    }

    pub(super) fn check_export_calls() {
        let mut calls = Vec::new();
        let s = settlement_model();
        let expected = linear::solve_2d(&s).unwrap();
        calls.push(serde_json::json!({"api":"solve_nonlinear_material_2d","input":material(s.clone(),20),"converged":true,"expectedDisplacements":expected.displacements}));
        calls.push(serde_json::json!({"api":"solve_nonlinear_material_2d","input":material(s.clone(),1),"converged":false}));
        for plane in Plane::ALL {
            let s = embed_2d(&s, plane).unwrap();
            let expected = linear::solve_3d(&s).unwrap();
            let input = NonlinearMaterialInput3D {
                solver: s,
                material_models: Default::default(),
                section_capacities: Default::default(),
                max_iter: 20,
                tolerance: 1e-6,
                n_increments: 1,
            };
            calls.push(serde_json::json!({"api":"solve_nonlinear_material_3d","input":input,"converged":true,"expectedDisplacements":expected.displacements}));
        }

        let settlement = settlement_model();
        calls.push(serde_json::json!({"api":"solve_pdelta_2d","input":settlement,"maxIter":100,"converged":true,"nonzeroTip":true}));
        calls.push(serde_json::json!({"api":"solve_corotational_2d","input":settlement,"maxIter":100,"converged":true,"nonzeroTip":true}));
        calls.push(serde_json::json!({"api":"solve_arc_length","input":ArcLengthInput { solver:settlement.clone(),max_steps:1,max_iter:100,tolerance:1e-10,initial_ds:0.001,min_ds:0.001,max_ds:0.001,target_iter:4 },"converged":true,"nonzeroTip":true}));
        calls.push(serde_json::json!({"api":"solve_fiber_nonlinear_2d","input":fiber_input(&settlement,100),"error":"prescribed"}));
        calls.push(serde_json::json!({"api":"solve_displacement_control","input":DisplacementControlInput { solver:settlement.clone(),control_node:2,control_dof:1,target_displacement:0.01,n_steps:1,max_iter:100,tolerance:1e-10 },"error":"prescribed"}));
        calls.push(serde_json::json!({"api":"solve_ssi_2d","input":SSIInput { solver:settlement.clone(),soil_springs:vec![],max_iter:100,tolerance:1e-10 },"error":"prescribed"}));
        for plane in Plane::ALL {
            let spatial = embed_2d(&settlement, plane).unwrap();
            calls.push(serde_json::json!({"api":"solve_pdelta_3d","input":spatial,"maxIter":100,"converged":true,"nonzeroTip":true}));
            calls.push(serde_json::json!({"api":"solve_corotational_3d","input":spatial,"error":"prescribed"}));
            calls.push(serde_json::json!({"api":"solve_fiber_nonlinear_3d","input":fiber_input_3d(&spatial,100),"error":"prescribed"}));
            calls.push(serde_json::json!({"api":"solve_ssi_3d","input":SSIInput3D { solver:spatial,soil_springs:vec![],max_iter:100,tolerance:1e-10 },"error":"prescribed"}));
        }
        let mut s = cantilever();
        s.constraints = serde_json::from_value(
            serde_json::json!([{"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[0]}]),
        )
        .unwrap();
        s.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 1.0,
            fz: 0.0,
            my: 0.0,
        })];
        calls.push(serde_json::json!({"api":"solve_arc_length","input":ArcLengthInput { solver:s.clone(), max_steps:1,max_iter:20,tolerance:1e-10,initial_ds:0.1,min_ds:0.1,max_ds:0.1,target_iter:4 },"error":"Zero reference load"}));
        calls.push(serde_json::json!({"api":"solve_displacement_control","input":DisplacementControlInput { solver:s, control_node:2,control_dof:1,target_displacement:0.01,n_steps:1,max_iter:20,tolerance:1e-10 },"error":"Zero reference load"}));
        for case in point_cases().into_iter().filter(|c| c["dimension"] == 2) {
            let solver: SolverInput = serde_json::from_value(case["solver"].clone()).unwrap();
            calls.push(serde_json::json!({"api":"solve_arc_length","input":ArcLengthInput { solver:solver.clone(),max_steps:1,max_iter:20,tolerance:1e-10,initial_ds:0.1,min_ds:0.1,max_ds:0.1,target_iter:4 },"converged":true}));
            calls.push(serde_json::json!({"api":"solve_displacement_control","input":DisplacementControlInput { solver,control_node:2,control_dof:0,target_displacement:0.01,n_steps:1,max_iter:20,tolerance:1e-10 },"converged":true}));
        }
        for force in [1.0, 1e-10, 1e-12] {
            let solver = scale_2d(&cantilever(), &Units::froude(1.0, force));
            let springs = vec![SoilSpring {
                node_id: 2,
                direction: 1,
                tributary_length: 1.0,
                curve: SoilCurve::Custom {
                    points: vec![[0.0, 0.0], [1e-7, 0.01 * force], [0.01, 0.02 * force]],
                },
            }];
            for (iterations, converged) in [(2, false), (100, true)] {
                calls.push(serde_json::json!({"api":"solve_ssi_2d","input":SSIInput { solver:solver.clone(),soil_springs:springs.clone(),max_iter:iterations,tolerance:1e-6 },"converged":converged}));
                let mut springs3 = springs.clone();
                springs3[0].direction = 2;
                calls.push(serde_json::json!({"api":"solve_ssi_3d","input":SSIInput3D { solver:embed_2d(&solver,Plane::XZ).unwrap(),soil_springs:springs3,max_iter:iterations,tolerance:1e-6 },"converged":converged}));
            }
        }
        let mut s: SolverInput3D = serde_json::from_str(include_str!("../metamorphic_corpus/feature_matrix/3d-warping-torsion-restrained-cantilever-with.json")).unwrap();
        if let SolverLoad3D::Nodal(l) = &mut s.loads[0] {
            l.fz = 0.0;
        }
        calls.push(serde_json::json!({"api":"solve_pdelta_3d","input":s,"converged":true}));
        for force in [1.0, 1e-25, 1e-40, 1e-50] {
            let mut base = cantilever();
            if let SolverLoad::Nodal(l) = &mut base.loads[0] {
                l.fx = 0.0;
                l.fz = -1000.0;
            }
            let mut tip = base.supports.values().next().unwrap().clone();
            tip.id = 2;
            tip.node_id = 2;
            tip.support_type = "guidedZ".into();
            base.supports.insert("2".into(), tip);
            let s = scale_2d(&base, &Units::froude(1.0, force));
            calls.push(serde_json::json!({"api":"solve_corotational_2d","input":s,"unconvergedOrError":true}));
            let s3 = embed_2d(&s, Plane::XZ).unwrap();
            calls.push(serde_json::json!({"api":"solve_corotational_3d","input":s3,"unconvergedOrError":true}));
            let mut f = fiber_input(&s, 2);
            let mut f3 = fiber_input_3d(&s3, 2);
            for section in f
                .fiber_sections
                .values_mut()
                .chain(f3.fiber_sections.values_mut())
            {
                section.materials = vec![
                    dedaliano_engine::element::fiber_beam::FiberMaterial::SteelBilinear {
                        e: s.materials["1"].e,
                        fy: base.materials["1"].e * 1e-5 * force,
                        hardening_ratio: 0.01,
                    },
                ];
            }
            calls.push(serde_json::json!({"api":"solve_fiber_nonlinear_2d","input":f,"unconvergedOrError":true}));
            calls.push(serde_json::json!({"api":"solve_fiber_nonlinear_3d","input":f3,"unconvergedOrError":true}));
            let mut m = material(s.clone(), 2);
            m.tolerance = 1e-10;
            m.material_models.insert(
                "1".into(),
                MaterialModel {
                    model_type: "bilinear".into(),
                    fy: base.materials["1"].e * 1e-5 * force,
                    alpha: Some(0.01),
                },
            );
            let mp = 100.0 * base.nodes["2"].x * force;
            m.section_capacities.insert(
                "1".into(),
                SectionCapacity {
                    np: 100.0 * force,
                    mp,
                    zp: None,
                },
            );
            let m3 = NonlinearMaterialInput3D {
                solver: s3,
                material_models: m.material_models.clone(),
                section_capacities: [(
                    "1".into(),
                    SectionCapacity3D {
                        np: 100.0 * force,
                        mpy: mp,
                        mpz: mp,
                        mpx: None,
                    },
                )]
                .into_iter()
                .collect(),
                max_iter: 2,
                tolerance: 1e-10,
                n_increments: 1,
            };
            calls.push(serde_json::json!({"api":"solve_nonlinear_material_2d","input":m,"unconvergedOrError":true}));
            calls.push(serde_json::json!({"api":"solve_nonlinear_material_3d","input":m3,"unconvergedOrError":true}));
        }

        for force in [1.0, 1e-25, 1e-40] {
            let m = super::yielding_force_floor::input(force);
            let mp = m.section_capacities["1"].mp;
            let m3 = NonlinearMaterialInput3D {
                solver: embed_2d(&m.solver, Plane::XZ).unwrap(),
                material_models: m.material_models.clone(),
                section_capacities: [(
                    "1".into(),
                    SectionCapacity3D {
                        np: 100.0 * force,
                        mpy: mp,
                        mpz: mp,
                        mpx: None,
                    },
                )]
                .into_iter()
                .collect(),
                max_iter: 2,
                tolerance: 1e-10,
                n_increments: 1,
            };
            let mut f = fiber_input(&m.solver, 2);
            let mut f3 = fiber_input_3d(&m3.solver, 2);
            for section in f
                .fiber_sections
                .values_mut()
                .chain(f3.fiber_sections.values_mut())
            {
                section.materials = vec![
                    dedaliano_engine::element::fiber_beam::FiberMaterial::SteelBilinear {
                        e: m.solver.materials["1"].e,
                        fy: m.solver.materials["1"].e * 1e-5 * force,
                        hardening_ratio: 0.01,
                    },
                ];
            }
            calls.push(
                serde_json::json!({"api":"solve_fiber_nonlinear_2d","input":f,"converged":false}),
            );
            calls.push(
                serde_json::json!({"api":"solve_fiber_nonlinear_3d","input":f3,"converged":false}),
            );
            calls.push(serde_json::json!({"api":"solve_nonlinear_material_2d","input":m,"converged":false}));
            calls.push(serde_json::json!({"api":"solve_nonlinear_material_3d","input":m3,"converged":false}));
        }
        let symmetric = symmetric_model();
        for iso in [
            Iso2::rotation(0.0),
            Iso2::rotation(0.731),
            Iso2::mirror_line(1.293),
        ] {
            let s = transform_2d(&symmetric, &iso).unwrap();
            calls.push(serde_json::json!({"api":"solve_pdelta_2d","input":s,"converged":true}));
            for plane in Plane::ALL {
                calls.push(serde_json::json!({"api":"solve_pdelta_3d","input":embed_2d(&s,plane).unwrap(),"converged":true}));
            }
        }

        for base in fixtures() {
            for iso in [
                Iso2::rotation(0.0),
                Iso2::rotation(0.731),
                Iso2::mirror_line(1.293),
            ] {
                let solver = transform_2d(&base.s, &iso).unwrap();
                let dofs = dedaliano_engine::solver::dof::DofNumbering::build_2d(&solver);
                let assembly = dedaliano_engine::solver::assembly::assemble_2d(&solver, &dofs);
                let tangent = dofs.global_dof(2, 0).unwrap();
                let normal = dofs.global_dof(2, 1).unwrap();
                let mut axis = vec![0.0; dofs.n_total];
                axis[tangent] = 1.0;
                for it in &assembly.inclined_transforms_2d {
                    dedaliano_engine::solver::assembly::reverse_inclined_transform_2d(
                        &mut axis, &it.dofs, &it.r,
                    );
                }
                let mut case = serde_json::json!({"api":"solve_arc_length","input":ArcLengthInput { solver:solver.clone(),max_steps:1,max_iter:100,tolerance:1e-10,initial_ds:0.1,min_ds:0.1,max_ds:0.1,target_iter:4 },"allowRefusal":true,"arcWitness":{"dx":solver.nodes["2"].x-solver.nodes["1"].x,"dz":solver.nodes["2"].z-solver.nodes["1"].z,"e":solver.materials["1"].e,"a":solver.sections["1"].a,"tx":axis[tangent],"tz":axis[normal],"force":assembly.f[tangent]}});
                if assembly.f[..dofs.n_free].iter().all(|f| *f == 0.0) {
                    case["error"] = serde_json::json!("Zero reference load");
                }
                calls.push(case);
                let inclined = solver
                    .supports
                    .values()
                    .any(|s| s.support_type == "inclinedRoller");
                calls.push(serde_json::json!({"api":"solve_displacement_control","input":DisplacementControlInput { solver,control_node:2,control_dof:0,target_displacement:0.01,n_steps:1,max_iter:20,tolerance:1e-10 },"error":if inclined {"inclined"} else {"Zero reference load"}}));
            }
        }
        calls.extend(super::r3::precision_calls());
        calls.extend(super::r3::soil_calls());
        calls.extend(super::r3::settlement_calls());
        calls.extend(super::r3::summary_calls());
        calls.extend(super::r3::point_calls());
        calls.extend(super::r3::r4_support_calls());
        calls.extend(super::r3::r4_tz_calls());
        for case in &calls {
            let result = call(case);
            if let Some(error) = case["error"].as_str() {
                assert!(result
                    .unwrap_err()
                    .to_lowercase()
                    .contains(&error.to_lowercase()));
                continue;
            }
            if (case["unconvergedOrError"] == true || case["allowRefusal"] == true)
                && result.is_err()
            {
                continue;
            }
            let result: serde_json::Value = serde_json::from_str(&result.unwrap()).unwrap();
            if case["allowRefusal"] == true {
                if result["converged"] == true {
                    check_arc_witness(&result, &case["arcWitness"]);
                }
                continue;
            }
            assert_eq!(
                result["converged"],
                if case["unconvergedOrError"] == true {
                    serde_json::json!(false)
                } else {
                    case["converged"].clone()
                },
                "{case}: {result}"
            );
            if case["nonzeroTip"] == true {
                let tip = result["results"]["displacements"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|d| d["nodeId"] == 2)
                    .unwrap();
                assert!(["ux", "uy", "uz"]
                    .into_iter()
                    .filter_map(|key| tip[key].as_f64())
                    .any(|v| v != 0.0));
            }
            if let Some(expected) = case["expectedAppliedSum"].as_array() {
                for (i, e) in expected.iter().enumerate() {
                    if !e.is_null() {
                        assert_eq!(result["results"]["equilibrium"]["appliedForceSum"][i], *e);
                    }
                }
            }
            check_expected_displacements(&result, &case);
        }
        if let Ok(path) = std::env::var("NONLINEAR_CONVERGENCE_CASES") {
            let mut cases: Vec<serde_json::Value> =
                serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            cases.extend(calls);
            std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
        }
    }

    fn check_arc_witness(result: &serde_json::Value, w: &serde_json::Value) {
        let get = |key: &str| w[key].as_f64().unwrap();
        let d = result["results"]["displacements"].as_array().unwrap();
        let base = d.iter().find(|d| d["nodeId"] == 1).unwrap();
        let tip = d.iter().find(|d| d["nodeId"] == 2).unwrap();
        let ux = tip["ux"].as_f64().unwrap() - base["ux"].as_f64().unwrap();
        let uz = tip["uz"].as_f64().unwrap() - base["uz"].as_f64().unwrap();
        let (dx, dz) = (get("dx"), get("dz"));
        let l0 = dx.hypot(dz);
        let ln = (dx + ux).hypot(dz + uz);
        let axial =
            1000.0 * get("e") * get("a") * (2.0 * dx * ux + 2.0 * dz * uz + ux * ux + uz * uz)
                / (l0 * (ln + l0));
        let projected = axial * ((dx + ux) * get("tx") + (dz + uz) * get("tz")) / ln;
        let factor = result["finalLoadFactor"].as_f64().unwrap();
        assert!(factor.is_finite());
        crate::common::assert_close(
            projected,
            factor * get("force"),
            1e-10,
            "represented arc-length load",
        );
    }

    #[test]
    fn rotated_support_only_paths_cannot_invent_a_free_response() {
        for case in fixtures() {
            for iso in [
                Iso2::rotation(0.0),
                Iso2::rotation(0.731),
                Iso2::mirror_line(1.293),
            ] {
                let solver = transform_2d(&case.s, &iso).unwrap();
                let input = ArcLengthInput {
                    solver: solver.clone(),
                    max_steps: 1,
                    max_iter: 100,
                    tolerance: 1e-10,
                    initial_ds: 0.1,
                    min_ds: 0.1,
                    max_ds: 0.1,
                    target_iter: 4,
                };
                let result = arc_length::solve_arc_length(&input);
                if let Ok(result) = result {
                    if !result.converged {
                        continue;
                    }
                    assert!(result.final_load_factor.is_finite());
                    let base = result
                        .results
                        .displacements
                        .iter()
                        .find(|d| d.node_id == 1)
                        .unwrap();
                    let tip = result
                        .results
                        .displacements
                        .iter()
                        .find(|d| d.node_id == 2)
                        .unwrap();
                    let dx = solver.nodes["2"].x - solver.nodes["1"].x;
                    let dz = solver.nodes["2"].z - solver.nodes["1"].z;
                    let ux = tip.ux - base.ux;
                    let uz = tip.uz - base.uz;
                    let l0 = dx.hypot(dz);
                    let ln = (dx + ux).hypot(dz + uz);
                    let strain =
                        (2.0 * dx * ux + 2.0 * dz * uz + ux * ux + uz * uz) / (l0 * (ln + l0));
                    let axial = 1000.0 * solver.materials["1"].e * solver.sections["1"].a * strain;
                    let dofs = dedaliano_engine::solver::dof::DofNumbering::build_2d(&solver);
                    let assembly = dedaliano_engine::solver::assembly::assemble_2d(&solver, &dofs);
                    let tangent = dofs.global_dof(2, 0).unwrap();
                    let mut axis = vec![0.0; dofs.n_total];
                    axis[tangent] = 1.0;
                    for it in &assembly.inclined_transforms_2d {
                        dedaliano_engine::solver::assembly::reverse_inclined_transform_2d(
                            &mut axis, &it.dofs, &it.r,
                        );
                    }
                    let projected = axial
                        * ((dx + ux) * axis[tangent]
                            + (dz + uz) * axis[dofs.global_dof(2, 1).unwrap()])
                        / ln;
                    crate::common::assert_close(
                        projected,
                        result.final_load_factor * assembly.f[tangent],
                        1e-10,
                        &format!("{}: represented free load", case.name),
                    );
                }
            }
        }
    }

    fn symmetric_model() -> SolverInput {
        let mut s = cantilever();
        s.loads.clear();
        s.nodes.get_mut("2").unwrap().x = 1.0;
        let mut node = s.nodes["2"].clone();
        node.id = 3;
        node.x = 2.0;
        s.nodes.insert("3".into(), node);
        let mut member = s.elements["1"].clone();
        member.id = 2;
        member.node_i = 2;
        member.node_j = 3;
        s.elements.insert("2".into(), member);
        s.supports.values_mut().next().unwrap().dx = Some(1e-5);
        let mut support = s.supports.values().next().unwrap().clone();
        support.id = 3;
        support.node_id = 3;
        support.dx = Some(-1e-5);
        s.supports.insert("3".into(), support);
        s
    }

    #[test]
    fn symmetric_settlements_scale_zero_free_displacement_in_both_dimensions() {
        let s = symmetric_model();
        for iso in [
            Iso2::rotation(0.0),
            Iso2::rotation(0.731),
            Iso2::mirror_line(1.293),
        ] {
            let transformed = transform_2d(&s, &iso).unwrap();
            let result = pdelta::solve_pdelta_2d(&transformed, 1, 1e-10).unwrap();
            assert!(result.converged);
            let center = result
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap();
            assert!(center.ux.hypot(center.uz) < 1e-10 * 1e-5);
            for plane in Plane::ALL {
                let spatial = embed_2d(&transformed, plane).unwrap();
                let result = pdelta::solve_pdelta_3d(&spatial, 1, 1e-10).unwrap();
                assert!(result.converged);
                let center = result
                    .results
                    .displacements
                    .iter()
                    .find(|d| d.node_id == 2)
                    .unwrap();
                assert!(center.ux.hypot(center.uy).hypot(center.uz) < 1e-10 * 1e-5);
            }
        }
    }
}

mod yielding_force_floor {
    use super::*;
    use dedaliano_engine::solver::{linear, material_nonlinear};

    pub(super) fn input(force: f64) -> NonlinearMaterialInput {
        let mut solver = cantilever();
        solver.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fz: -1000.0 * force,
            my: 0.0,
        })];
        let mp = 100.0 * solver.nodes["2"].x * force;
        NonlinearMaterialInput {
            solver,
            material_models: [(
                "1".into(),
                MaterialModel {
                    model_type: "bilinear".into(),
                    fy: force,
                    alpha: Some(0.01),
                },
            )]
            .into_iter()
            .collect(),
            section_capacities: [(
                "1".into(),
                SectionCapacity {
                    np: 100.0 * force,
                    mp,
                    zp: None,
                },
            )]
            .into_iter()
            .collect(),
            max_iter: 2,
            tolerance: 1e-10,
            n_increments: 1,
        }
    }

    #[test]
    fn material_yielding_is_checked_with_stiffness_above_pivot_limits() {
        for force in [1.0, 1e-21, 1e-23, 1e-25, 1e-40] {
            let input = input(force);
            assert!(linear::solve_2d(&input.solver)
                .unwrap()
                .displacements
                .iter()
                .any(|d| d.uz != 0.0));
            let result = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();
            assert!(!result.converged, "{force}: {result:?}");
            let mut elastic_input = input.clone();
            if let SolverLoad::Nodal(l) = &mut elastic_input.solver.loads[0] {
                l.fz /= 20.0;
            }
            let elastic_result =
                material_nonlinear::solve_nonlinear_material_2d(&elastic_input).unwrap();
            assert!(elastic_result.converged);
            let reference = linear::solve_2d(&elastic_input.solver).unwrap();
            let actual = elastic_result
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .uz;
            let expected = reference
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .uz;
            crate::common::assert_close(actual, expected, 1e-10, "elastic material control");
            let mp = input.section_capacities["1"].mp;
            let input = NonlinearMaterialInput3D {
                solver: embed_2d(&input.solver, Plane::XZ).unwrap(),
                material_models: input.material_models,
                section_capacities: [(
                    "1".into(),
                    SectionCapacity3D {
                        np: 100.0 * force,
                        mpy: mp,
                        mpz: mp,
                        mpx: None,
                    },
                )]
                .into_iter()
                .collect(),
                max_iter: 2,
                tolerance: 1e-10,
                n_increments: 1,
            };
            assert!(
                !material_nonlinear::solve_nonlinear_material_3d(&input)
                    .unwrap()
                    .converged
            );
            let mut input = input;
            input.max_iter = 10;
            let result = material_nonlinear::solve_nonlinear_material_3d(&input).unwrap();
            assert!(result.converged);
            let elastic = linear::solve_3d(&input.solver).unwrap();
            let actual = result
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap();
            let expected = elastic
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap();
            crate::common::assert_close(
                actual.ux.hypot(actual.uy).hypot(actual.uz),
                100.0 * expected.ux.hypot(expected.uy).hypot(expected.uz),
                1e-10,
                "yielded secant response",
            );
        }
    }

    #[test]
    fn fiber_yielding_is_checked_with_stiffness_above_pivot_limits() {
        for force in [1.0, 1e-21, 1e-23, 1e-25, 1e-40] {
            let input = input(force);
            let mut f = fiber_input(&input.solver, 2);
            let mut f3 = fiber_input_3d(&embed_2d(&input.solver, Plane::XZ).unwrap(), 2);
            for section in f
                .fiber_sections
                .values_mut()
                .chain(f3.fiber_sections.values_mut())
            {
                section.materials = vec![
                    dedaliano_engine::element::fiber_beam::FiberMaterial::SteelBilinear {
                        e: input.solver.materials["1"].e,
                        fy: input.solver.materials["1"].e * 1e-5 * force,
                        hardening_ratio: 0.01,
                    },
                ];
            }
            assert!(!fiber::solve_fiber_nonlinear_2d(&f).unwrap().converged);
            assert!(!fiber::solve_fiber_nonlinear_3d(&f3).unwrap().converged);
        }
    }
}

mod r3 {
    use super::*;
    use dedaliano_engine::metamorphic::transform::{transform_3d, Iso3};
    use dedaliano_engine::solver::{
        arc_length::{self, ArcLengthInput, DisplacementControlInput},
        linear,
        soil_curves::{evaluate_soil_curve, SoilCurve},
        ssi::{self, SSIInput, SSIInput3D, SoilSpring},
    };

    fn close(a: f64, b: f64, tolerance: f64) {
        assert!(a.is_finite() && b.is_finite());
        assert!((a - b).abs() <= tolerance * b.abs(), "{a} != {b}");
    }

    fn arc(solver: SolverInput, ds: f64) -> ArcLengthInput {
        ArcLengthInput {
            solver,
            max_steps: 1,
            max_iter: 60,
            tolerance: 1e-10,
            initial_ds: ds,
            min_ds: ds,
            max_ds: ds,
            target_iter: 4,
        }
    }

    pub(super) fn precision_calls() -> Vec<serde_json::Value> {
        let mut calls = Vec::new();
        for factor in [1e-16, 3e-11, 1e-10, 1e-6] {
            let mut base = cantilever();
            for load in &mut base.loads {
                if let SolverLoad::Nodal(l) = load {
                    l.fx *= factor;
                    l.fz *= factor;
                }
            }
            for angle in [0.0, 0.731] {
                let s = transform_2d(&base, &Iso2::rotation(angle)).unwrap();
                let reference =
                    corotational::solve_corotational_2d(&base, 60, 1e-10, 1, false).unwrap();
                assert!(reference.converged);
                let expected = dedaliano_engine::metamorphic::transform::map_results_2d(
                    &reference.results,
                    &Iso2::rotation(angle),
                )
                .displacements;
                calls.push(serde_json::json!({"api":"solve_corotational_2d","input":s,"maxIter":60,"converged":true,"expectedDisplacements":expected}));
                let ds = factor * 0.1;
                calls.push(serde_json::json!({"api":"solve_arc_length","input":arc(s.clone(),ds),"converged":true,"nonzeroTip":true}));
                let target = expected.iter().find(|d| d.node_id == 2).unwrap().ux;
                calls.push(serde_json::json!({"api":"solve_displacement_control","input":DisplacementControlInput { solver:s, control_node:2, control_dof:0, target_displacement:target, n_steps:1, max_iter:60, tolerance:1e-10 },"converged":true,"nonzeroTip":true,"expectedControl":target}));
            }
            let mut s = spatial_sub_ulp_input();
            for load in &mut s.loads {
                if let SolverLoad3D::Nodal(l) = load {
                    l.fx *= factor / 1e-16;
                    l.fy *= factor / 1e-16;
                    l.fz *= factor / 1e-16;
                }
            }
            let reference = corotational::solve_corotational_3d(
                &embed_2d(&base, Plane::XZ).unwrap(),
                60,
                1e-10,
                1,
                false,
            )
            .unwrap();
            assert!(reference.converged);
            let expected = dedaliano_engine::metamorphic::transform::map_results_3d(
                &reference.results,
                &dedaliano_engine::metamorphic::transform::Iso3::from_euler(0.731, -0.417, 1.293),
            )
            .displacements;
            let mut mirrored = dedaliano_engine::metamorphic::mirror::mirror_3d(&s, 0, [0.0; 3]).unwrap();
            let reflected: Vec<_> = expected.iter().map(|d| serde_json::json!({"nodeId":d.node_id,"ux":-d.ux,"uy":d.uy,"uz":d.uz,"rx":d.rx,"ry":-d.ry,"rz":-d.rz})).collect();
            calls.push(serde_json::json!({"api":"solve_corotational_3d","input":mirrored,"maxIter":60,"converged":true,"expectedDisplacements":reflected}));
            mirrored.left_hand = Some(true);
            calls.push(serde_json::json!({"api":"solve_corotational_3d","input":mirrored,"maxIter":60,"error":"leftHand"}));
            calls.push(serde_json::json!({"api":"solve_corotational_3d","input":s,"maxIter":60,"converged":true,"expectedDisplacements":expected}));
        }
        calls
    }

    fn invoke(c: &serde_json::Value) -> serde_json::Value {
        let result = super::r2::call(c).unwrap_or_else(|error| panic!("{c}: {error}"));
        serde_json::from_str(&result).unwrap()
    }

    #[test]
    fn rotated_chords_keep_precision_through_all_paths() {
        for c in precision_calls() {
            if let Some(error) = c["error"].as_str() {
                assert!(super::r2::call(&c).unwrap_err().contains(error));
                continue;
            }
            let r = invoke(&c);
            assert_eq!(r["converged"], c["converged"], "{}", c);
            check_expected_displacements(&r, &c);
        }
    }

    #[test]
    fn continuation_releases_settlements_and_external_loads() {
        for prescribed in [false, true] {
            let mut s = cantilever();
            if prescribed {
                s.loads.clear();
                s.nodes.get_mut("2").unwrap().z = 1.0;
                s.supports.values_mut().next().unwrap().dry = Some(0.01);
                s.supports.insert(
                    "2".into(),
                    serde_json::from_value(serde_json::json!({"id":2,"nodeId":2,"type":"rollerX"}))
                        .unwrap(),
                );
            }
            let initial = corotational::solve_corotational_2d(&s, 60, 1e-10, 4, false).unwrap();
            assert!(initial.converged);
            let start = corotational::CorotationalStart2D {
                input: &s,
                displacements: &initial.results.displacements,
            };
            let mut target = s.clone();
            target.loads.clear();
            target.supports.get_mut("1").unwrap().dry = None;
            let released = corotational::solve_corotational_2d_from(
                &target,
                Some(&start),
                60,
                1e-10,
                4,
                false,
            )
            .unwrap();
            assert!(released.converged, "prescribed={prescribed}");
            for d in &released.results.displacements {
                assert!(d.ux.abs().max(d.uz.abs()).max(d.ry.abs()) < 1e-12);
            }
            if prescribed {
                let mut pattern = s.clone();
                pattern.supports.get_mut("1").unwrap().dry = Some(0.001);
                let r =
                    arc_length::solve_arc_length_from(&arc(pattern, 1e-20), Some(&start)).unwrap();
                assert!(r.converged);
            }
        }
    }

    #[test]
    fn r4_tz_initial_segment_is_bounded_and_continuous() {
        use dedaliano_engine::solver::soil_curves::tz_curve;
        let z_ult = 0.01f64;
        let t_ult = 50.0;
        let z0 = 1e-6 * z_ult;
        let k0 = tz_curve(t_ult, z_ult, 0.0).1;
        for sign in [-1.0, 1.0] {
            for z in [
                0.0,
                f64::from_bits(1),
                1e-20,
                0.5e-15,
                1e-15,
                2e-15,
                z0 * 0.5,
                z0,
                z0 * (1.0 + 1e-10),
                z_ult,
                z_ult * 2.0,
            ] {
                let (t, k) = tz_curve(t_ult, z_ult, sign * z);
                assert!(t.is_finite() && k.is_finite());
                if z <= z0 {
                    assert_eq!(k, k0);
                    assert_eq!(t, k0 * (sign * z));
                } else {
                    close(t, sign * t_ult * (z / z_ult).sqrt().min(1.0), 1e-12);
                }
            }
        }
    }

    #[test]
    fn r4_modified_newton_releases_settlement_and_support() {
        let mut s = cantilever();
        s.loads.clear();
        s.nodes.get_mut("2").unwrap().z = 1.0;
        s.supports.get_mut("1").unwrap().dry = Some(0.01);
        s.supports.insert(
            "2".into(),
            serde_json::from_value(serde_json::json!({"id":2,"nodeId":2,"type":"rollerX"})).unwrap(),
        );
        let initial = corotational::solve_corotational_2d(&s, 60, 1e-10, 4, false).unwrap();
        assert!(initial.converged);
        let start = corotational::CorotationalStart2D {
            input: &s,
            displacements: &initial.results.displacements,
        };
        for remove in [false, true] {
            let mut target = s.clone();
            target.supports.get_mut("1").unwrap().dry = None;
            if remove {
                target.supports.remove("2");
            }
            let r = corotational::solve_corotational_2d_from(&target, Some(&start), 20, 1e-10, 1, true)
                .unwrap();
            assert!(r.converged, "remove={remove}");
            for d in r.results.displacements {
                assert!(d.ux.abs().max(d.uz.abs()).max(d.ry.abs()) < 1e-12);
            }
        }
    }

    pub(super) fn r4_support_calls() -> Vec<serde_json::Value> {
        let mut calls = Vec::new();
        for tiny in [0.0, 1e-14, -1e-14] {
            let mut base = cantilever();
            base.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: tiny,
                fz: -500.0,
                my: 0.0,
            })];
            base.supports.get_mut("1").unwrap().dry = Some(1e-5);
            base.supports.get_mut("1").unwrap().dx = Some(1e-5);
            base.supports.insert(
                "2".into(),
                serde_json::from_value(serde_json::json!({"id":2,"nodeId":2,"type":"rollerX"}))
                    .unwrap(),
            );
            for angle in [0.0, 0.37] {
                let solver = transform_2d(&base, &Iso2::rotation(angle)).unwrap();
                for api in [
                    "solve_2d",
                    "solve_pdelta_2d",
                    "solve_corotational_2d",
                    "solve_nonlinear_material_2d",
                ] {
                    let input = if api.contains("material") {
                        serde_json::json!({"solver":solver,"materialModels":{},"sectionCapacities":{},"maxIter":60,"tolerance":1e-10,"nIncrements":1})
                    } else {
                        serde_json::to_value(&solver).unwrap()
                    };
                    calls.push(serde_json::json!({"api":api,"input":input,"maxIter":60,"converged":true,"nonzeroTip":true}));
                }
                calls.push(serde_json::json!({"api":"solve_arc_length","input":arc(solver,1e-6),"converged":true,"nonzeroTip":true}));
            }
            for plane in Plane::ALL {
                let mut spatial = embed_2d(&base, plane).unwrap();
                let normal = plane.e2();
                for sp in spatial.supports.values_mut().filter(|sp| sp.node_id == 2) {
                    sp.rx = normal[0] != 0.0;
                    sp.ry = normal[1] != 0.0;
                    sp.rz = normal[2] != 0.0;
                    sp.rrx = false;
                    sp.rry = false;
                    sp.rrz = false;
                }
                let solver = transform_3d(&spatial, &Iso3::from_euler(0.37, -0.21, 0.13)).unwrap();
                for api in ["solve_3d", "solve_pdelta_3d", "solve_nonlinear_material_3d"] {
                    let input = if api.contains("material") {
                        serde_json::json!({"solver":solver,"materialModels":{},"sectionCapacities":{},"maxIter":60,"tolerance":1e-10,"nIncrements":1})
                    } else {
                        serde_json::to_value(&solver).unwrap()
                    };
                    calls.push(serde_json::json!({"api":api,"input":input,"maxIter":60,"converged":true,"nonzeroTip":true}));
                }
            }
        }
        calls
    }

    #[test]
    fn r4_settlement_reference_handles_tiny_and_rotated_normal_loads() {
        for case in r4_support_calls() {
            let r: serde_json::Value = serde_json::from_str(&super::r2::call(&case).unwrap()).unwrap();
            assert_eq!(r["converged"], true, "{case}: {r}");
            let tip = r["results"]["displacements"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| d["nodeId"] == 2)
                .unwrap();
            assert!(
                tip["ux"]
                    .as_f64()
                    .unwrap()
                    .hypot(tip["uy"].as_f64().unwrap_or(0.0))
                    .hypot(tip["uz"].as_f64().unwrap())
                    > 0.0
            );
        }
    }

    pub(super) fn r4_tz_calls() -> Vec<serde_json::Value> {
        let mut calls = Vec::new();
        let z_ult = 0.01f64;
        let t_ult = 50.0;
        let z0 = 1e-6 * z_ult;
        let k0 = t_ult * (z0 / z_ult).sqrt() / z0;
        for z in [0.0, 1e-20, z0 * 0.5, z0, z0 * (1.0 + 1e-10)] {
            for sign in [-1.0, 1.0] {
                let mut s = cantilever();
                let k = 1000.0 * s.materials["1"].e * s.sections["1"].a / s.nodes["2"].x;
                let t = if z <= z0 {
                    k0 * z
                } else {
                    t_ult * (z / z_ult).sqrt()
                };
                s.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                    node_id: 2,
                    fx: sign * (k * z + t),
                    fz: 0.0,
                    my: 0.0,
                })];
                let spring = SoilSpring {
                    node_id: 2,
                    direction: 0,
                    tributary_length: 1.0,
                    curve: serde_json::from_value(
                        serde_json::json!({"type":"tz","t_ult":t_ult,"z_ult":z_ult,"perimeter":1.0}),
                    )
                    .unwrap(),
                };
                calls.push(serde_json::json!({"api":"solve_ssi_2d","input":SSIInput { solver:s.clone(), soil_springs:vec![spring.clone()], max_iter:60, tolerance:1e-10 },"converged":true,"expectedDisplacements":[{"nodeId":2,"ux":sign*z,"uz":0.0,"ry":0.0}]}));
                for plane in Plane::ALL {
                    let mut spring = spring.clone();
                    let axis = plane.e1();
                    spring.direction = axis.iter().position(|v| *v != 0.0).unwrap();
                    calls.push(serde_json::json!({"api":"solve_ssi_3d","input":SSIInput3D { solver:embed_2d(&s, plane).unwrap(), soil_springs:vec![spring], max_iter:60, tolerance:1e-10 },"converged":true,"expectedDisplacements":[{"nodeId":2,"ux":axis[0]*sign*z,"uy":axis[1]*sign*z,"uz":axis[2]*sign*z,"rx":0.0,"ry":0.0,"rz":0.0}]}));
                }
            }
        }
        calls
    }

    #[test]
    fn r4_tz_small_axial_responses_match_initial_stiffness() {
        for case in r4_tz_calls() {
            let r: serde_json::Value = serde_json::from_str(&super::r2::call(&case).unwrap()).unwrap();
            assert_eq!(r["converged"], true, "{case}: {r}");
            check_expected_displacements(&r, &case);
        }
    }

    fn curves() -> Vec<SoilCurve> {
        [
            serde_json::json!({"type":"py_soft_clay","su":50.0,"gamma_eff":8.0,"d":0.5,"depth":2.0,"eps_50":0.01,"j":0.5}),
            serde_json::json!({"type":"py_stiff_clay","su":50.0,"gamma_eff":8.0,"d":0.5,"depth":2.0,"eps_50":0.01,"j":0.5,"free_water":false}),
            serde_json::json!({"type":"py_sand","phi":30.0,"gamma_eff":8.0,"d":0.5,"depth":2.0,"loading":"static"}),
            serde_json::json!({"type":"tz","t_ult":50.0,"z_ult":0.01,"perimeter":1.0}),
            serde_json::json!({"type":"qz","q_ult":50.0,"d":0.5,"tip_area":1.0}),
            serde_json::json!({"type":"custom","points":[[0.0,0.0],[1e-17,1e-10],[2e-17,1.5e-10]]}),
        ].into_iter().map(|v| serde_json::from_value(v).unwrap()).collect()
    }

    #[test]
    fn curve_reactions_equal_secants_on_both_sides_of_old_floor() {
        for curve in curves() {
            for y in [
                0.0, 1e-20, 1e-17, 1.5e-17, 3e-17, 0.5e-15, 1e-15, 2e-15, 1e-6,
            ] {
                for sign in [-1.0, 1.0] {
                    let (p, k) = evaluate_soil_curve(&curve, sign * y).unwrap();
                    if y == 0.0 {
                        assert_eq!(p, 0.0);
                        assert!(k.is_finite());
                    } else if matches!(curve, SoilCurve::Qz { .. }) && sign > 0.0 {
                        assert_eq!((p, k), (0.0, 0.0));
                    } else {
                        assert_ne!(p, 0.0, "{curve:?} at {y}");
                        close(k * sign * y, p, 1e-12);
                    }
                }
            }
        }
    }

    pub(super) fn point_calls() -> Vec<serde_json::Value> {
        let mut calls = Vec::new();
        for length in [1e-3, 1.0, 1e3] {
            let mut s = scale_2d(&super::r2::spring_model(false), &Units::froude(length, 1.0));
            let sp = s.supports.get_mut("2").unwrap();
            sp.kx = None;
            sp.ky = None;
            let soil_springs: Vec<_> = [0, 1]
                .into_iter()
                .map(|direction| SoilSpring {
                    node_id: 2,
                    direction,
                    curve: SoilCurve::Custom {
                        points: vec![[0.0, 0.0], [length, 100.0]],
                    },
                    tributary_length: 1.0,
                })
                .collect();
            calls.push(serde_json::json!({"api":"solve_ssi_2d","input":SSIInput {solver:s.clone(),soil_springs:soil_springs.clone(),max_iter:30,tolerance:1e-10},"converged":true,"expectedDisplacements":[{"nodeId":2,"ux":0.01*length}]}));
            let mut solver = embed_2d(&s, Plane::XZ).unwrap();
            solver.sections.values_mut().next().unwrap().cw = Some(0.0);
            let sp = solver.supports.get_mut("2").unwrap();
            sp.ry = true;
            sp.rrx = true;
            sp.rrz = true;
            sp.rw = Some(true);
            let soil_springs = soil_springs
                .into_iter()
                .map(|mut s| {
                    if s.direction == 1 {
                        s.direction = 2;
                    }
                    s
                })
                .collect();
            let input = SSIInput3D {
                solver,
                soil_springs,
                max_iter: 30,
                tolerance: 1e-10,
            };
            calls.push(serde_json::json!({"api":"solve_ssi_3d","input":input,"converged":true,"expectedDisplacements":[{"nodeId":2,"ux":0.01*length}]}));
            let mut missing = input;
            missing.soil_springs.clear();
            calls.push(serde_json::json!({"api":"solve_ssi_3d","input":missing,"error":"physical stiffness"}));
        }
        for points in [vec![[0.0, 1.0], [1.0, 2.0]], vec![[0.0, 0.0], [0.0, 1.0]]] {
            for mut c in soil_calls().into_iter().take(2) {
                c["input"]["soilSprings"][0]["curve"] =
                    serde_json::json!({"type":"custom","points":points});
                c["error"] = serde_json::json!("Custom soil curve");
                calls.push(c);
            }
        }
        calls
    }

    pub(super) fn summary_calls() -> Vec<serde_json::Value> {
        let mut calls = Vec::new();
        for huge in [0.0, 1e20] {
            let mut s = cantilever();
            let mut support = s.supports["1"].clone();
            support.id = 2;
            support.node_id = 2;
            support.support_type = "inclinedRoller".into();
            support.angle = Some(std::f64::consts::FRAC_PI_2);
            s.supports.insert("2".into(), support);
            s.loads = vec![
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: 1,
                    fx: 0.0,
                    fz: 1000.0,
                    my: 0.0,
                }),
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: 2,
                    fx: huge,
                    fz: 0.0,
                    my: 0.0,
                }),
            ];
            let c = std::f64::consts::FRAC_PI_2.cos();
            let expected = 1000.0 + c.mul_add(huge, -c * huge);
            calls.push(serde_json::json!({"api":"solve_2d","input":s,"converged":true,"expectedAppliedSum":[null,expected]}));
            for plane in Plane::ALL {
                let mut solver = embed_2d(&cantilever(), plane).unwrap();
                let normal = plane.e2();
                let mut support = solver.supports["1"].clone();
                support.node_id = 2;
                support.rx = true;
                support.ry = false;
                support.rz = false;
                support.rrx = false;
                support.rry = false;
                support.rrz = false;
                support.is_inclined = Some(true);
                support.normal_x = Some(normal[0]);
                support.normal_y = Some(normal[1]);
                support.normal_z = Some(normal[2]);
                solver.supports.insert("2".into(), support);
                solver.loads = vec![
                    SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: 1,
                        fx: 1000.0,
                        fy: 0.0,
                        fz: 0.0,
                        mx: 0.0,
                        my: 0.0,
                        mz: 0.0,
                        bw: None,
                    }),
                    SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: 2,
                        fx: huge * normal[0],
                        fy: huge * normal[1],
                        fz: huge * normal[2],
                        mx: 0.0,
                        my: 0.0,
                        mz: 0.0,
                        bw: None,
                    }),
                ];
                calls.push(serde_json::json!({"api":"solve_3d","input":solver,"converged":true,"expectedAppliedSum":[1000.0]}));
            }
        }
        calls
    }

    #[test]
    fn linear_summaries_preserve_other_node_loads() {
        for c in summary_calls() {
            let r: serde_json::Value = serde_json::from_str(&super::r2::call(&c).unwrap()).unwrap();
            for (i, e) in c["expectedAppliedSum"]
                .as_array()
                .unwrap()
                .iter()
                .enumerate()
            {
                if !e.is_null() {
                    assert_eq!(r["results"]["equilibrium"]["appliedForceSum"][i], *e, "{c}");
                }
            }
        }
    }

    pub(super) fn settlement_calls() -> Vec<serde_json::Value> {
        let mut calls = Vec::new();
        for dy in [0.5e-15, 1e-15, 2e-15] {
            let mut s = cantilever();
            s.loads.clear();
            s.supports.get_mut("1").unwrap().dz = Some(dy);
            let expected = vec![
                serde_json::json!({"nodeId":1,"uz":dy}),
                serde_json::json!({"nodeId":2,"uz":dy}),
            ];
            for api in ["solve_2d", "solve_pdelta_2d", "solve_corotational_2d"] {
                calls.push(serde_json::json!({"api":api,"input":s,"maxIter":60,"converged":true,"expectedDisplacements":expected}));
            }
            calls.push(serde_json::json!({"api":"solve_arc_length","input":arc(s.clone(),dy*2.0f64.sqrt()),"converged":true,"expectedDisplacements":expected}));
            calls.push(serde_json::json!({"api":"solve_nonlinear_material_2d","input":{"solver":s,"materialModels":{},"sectionCapacities":{},"maxIter":30,"tolerance":1e-10,"nIncrements":1},"converged":true,"expectedDisplacements":expected}));
            let constrained = dedaliano_engine::solver::constraints::ConstrainedInput {
                solver: s.clone(),
                constraints: vec![],
            };
            calls.push(serde_json::json!({"api":"solve_constrained_2d","input":constrained,"converged":true,"expectedDisplacements":expected}));
            for plane in Plane::ALL {
                let solver = embed_2d(&s, plane).unwrap();
                let vertical = plane.e2();
                let expected = vec![
                    serde_json::json!({"nodeId":1,"ux":vertical[0]*dy,"uy":vertical[1]*dy,"uz":vertical[2]*dy}),
                    serde_json::json!({"nodeId":2,"ux":vertical[0]*dy,"uy":vertical[1]*dy,"uz":vertical[2]*dy}),
                ];
                for api in ["solve_3d", "solve_pdelta_3d"] {
                    calls.push(serde_json::json!({"api":api,"input":solver,"maxIter":60,"converged":true,"expectedDisplacements":expected}));
                }
                calls.push(serde_json::json!({"api":"solve_nonlinear_material_3d","input":{"solver":solver,"materialModels":{},"sectionCapacities":{},"maxIter":30,"tolerance":1e-10,"nIncrements":1},"converged":true,"expectedDisplacements":expected}));
                let input = dedaliano_engine::solver::constraints::ConstrainedInput3D {
                    solver,
                    constraints: vec![],
                };
                calls.push(serde_json::json!({"api":"solve_constrained_3d","input":input,"converged":true,"expectedDisplacements":expected}));
            }
        }
        calls
    }

    #[test]
    fn tiny_settlements_reach_both_material_entry_points() {
        for c in settlement_calls().into_iter().filter(|c| {
            c["api"]
                .as_str()
                .unwrap()
                .starts_with("solve_nonlinear_material")
        }) {
            let r: serde_json::Value = serde_json::from_str(&super::r2::call(&c).unwrap()).unwrap();
            assert_eq!(r["converged"], true);
            let expected = c["expectedDisplacements"].as_array().unwrap();
            for d in expected {
                let a = r["results"]["displacements"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|a| a["nodeId"] == d["nodeId"])
                    .unwrap();
                for key in ["ux", "uy", "uz"] {
                    if let Some(e) = d[key].as_f64().filter(|e| *e != 0.0) {
                        close(a[key].as_f64().unwrap(), e, 1e-10);
                    }
                }
            }
        }
    }

    pub(super) fn soil_calls() -> Vec<serde_json::Value> {
        let mut calls = Vec::new();
        for curve in curves() {
            for factor in [1e-16, 1e-10, 1.0] {
                let mut s = cantilever();
                if let SolverLoad::Nodal(l) = &mut s.loads[0] {
                    l.fx = 0.0;
                    l.fz *= factor;
                }
                let spring = SoilSpring {
                    node_id: 2,
                    direction: 1,
                    curve: curve.clone(),
                    tributary_length: 1.0,
                };
                let input = SSIInput {
                    solver: s.clone(),
                    soil_springs: vec![spring.clone()],
                    max_iter: 200,
                    tolerance: 1e-10,
                };
                calls.push(serde_json::json!({"api":"solve_ssi_2d","input":input,"converged":true,"soilBalance":-0.25*factor}));
                for plane in Plane::ALL {
                    let direction = match plane {
                        Plane::XZ => 2,
                        Plane::XY => 1,
                        Plane::YZ => 2,
                    };
                    let input = SSIInput3D {
                        solver: embed_2d(&s, plane).unwrap(),
                        soil_springs: vec![SoilSpring {
                            direction,
                            ..spring.clone()
                        }],
                        max_iter: 200,
                        tolerance: 1e-10,
                    };
                    calls.push(serde_json::json!({"api":"solve_ssi_3d","input":input,"converged":true,"soilBalance":-0.25*factor,"balanceDirection":direction}));
                }
            }
        }
        calls
    }

    #[test]
    fn ssi_reported_curve_reactions_balance_structure() {
        for c in soil_calls() {
            let r = invoke(&c);
            assert_eq!(r["converged"], true, "{}", c);
            let direction = c["balanceDirection"].as_u64().unwrap_or(1) as usize;
            let key = if c["api"] == "solve_ssi_2d" {
                "rz"
            } else {
                ["fx", "fy", "fz"][direction]
            };
            let reaction: f64 = r["results"]["reactions"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v[key].as_f64().unwrap())
                .sum();
            let soil: f64 = r["springResults"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v["reaction"].as_f64().unwrap())
                .sum();
            let applied = c["soilBalance"].as_f64().unwrap();
            if ((reaction - soil + applied) / applied).abs() > 1e-10 {
                eprintln!("SSI result: {r}");
            }
            close(reaction - soil, -applied, 1e-10);
        }
    }

    #[test]
    fn custom_offsets_and_duplicate_abscissae_are_refused() {
        for points in [
            vec![[0.0, 1.0], [1.0, 2.0]],
            vec![[0.0, 0.0], [0.0, 1.0]],
            vec![[-1.0, 0.0], [1.0, 1.0]],
        ] {
            let curve = SoilCurve::Custom { points };
            assert!(evaluate_soil_curve(&curve, 0.1).is_err());
            for mut c in soil_calls().into_iter().take(2) {
                c["input"]["soilSprings"][0]["curve"] = serde_json::to_value(&curve).unwrap();
                if c["api"] == "solve_ssi_2d" {
                    assert!(ssi::solve_ssi_2d(
                        &serde_json::from_value(c["input"].clone()).unwrap()
                    )
                    .is_err());
                } else {
                    assert!(ssi::solve_ssi_3d(
                        &serde_json::from_value(c["input"].clone()).unwrap()
                    )
                    .is_err());
                }
            }
        }
        assert!(evaluate_soil_curve(
            &SoilCurve::Custom {
                points: vec![[0.0, 0.0], [1e-20, 1.0]]
            },
            1e-21
        )
        .is_ok());
    }

    #[test]
    fn mixed_point_ssi_uses_soil_stiffness() {
        let mut s = cantilever();
        s.elements.clear();
        s.nodes.remove("1");
        s.supports.clear();
        s.nodes.get_mut("2").unwrap().x = 0.0;
        s.supports.insert(
            "2".into(),
            serde_json::from_value(
                serde_json::json!({"id":2,"nodeId":2,"type":"spring","kz":400.0}),
            )
            .unwrap(),
        );
        for length in [1e-3, 1.0, 1e3] {
            let scaled = scale_2d(&s, &Units::froude(length, 1.0));
            let springs = vec![0, 1]
                .into_iter()
                .map(|direction| SoilSpring {
                    node_id: 2,
                    direction,
                    curve: SoilCurve::Custom {
                        points: vec![[0.0, 0.0], [length, 100.0]],
                    },
                    tributary_length: 1.0,
                })
                .collect();
            let input = SSIInput {
                solver: scaled,
                soil_springs: springs,
                max_iter: 30,
                tolerance: 1e-10,
            };
            let r = ssi::solve_ssi_2d(&input).unwrap();
            assert!(r.converged);
            close(r.results.displacements[0].ux, -0.01 * length, 1e-10);
            let mut solver = embed_2d(&input.solver, Plane::XZ).unwrap();
            let sp = solver.supports.get_mut("2").unwrap();
            sp.rrx = true;
            sp.rrz = true;
            sp.ry = true;
            sp.rw = Some(true);
            sp.kry = Some(400.0 * length);
            solver.sections.values_mut().next().unwrap().cw = Some(0.0);
            let springs = input
                .soil_springs
                .iter()
                .cloned()
                .map(|mut s| {
                    if s.direction == 1 {
                        s.direction = 2;
                    }
                    s
                })
                .collect();
            let r = ssi::solve_ssi_3d(&SSIInput3D {
                solver,
                soil_springs: springs,
                max_iter: 30,
                tolerance: 1e-10,
            })
            .unwrap();
            assert!(r.converged);
            close(r.results.displacements[0].ux, -0.01 * length, 1e-10);
        }
    }

    #[test]
    fn small_prescribed_settlements_are_not_silently_zeroed() {
        let mut s = cantilever();
        s.loads.clear();
        for dy in [0.5e-15, 1e-15, 2e-15] {
            s.supports.values_mut().next().unwrap().dz = Some(dy);
            let r = linear::solve_2d(&s).unwrap();
            close(
                r.displacements.iter().find(|d| d.node_id == 1).unwrap().uz,
                dy,
                1e-12,
            );
            for plane in Plane::ALL {
                let r = linear::solve_3d(&embed_2d(&s, plane).unwrap()).unwrap();
                let d = r.displacements.iter().find(|d| d.node_id == 1).unwrap();
                close(d.ux.hypot(d.uy).hypot(d.uz), dy, 1e-12);
            }
        }
    }
}
