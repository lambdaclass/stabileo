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
        for text in results {
            let r: serde_json::Value = serde_json::from_str(&text).unwrap();
            assert_eq!(r["converged"], case["converged"], "{}", case["name"]);
            if let Some(expected) = case["expectedAxialDisplacement"].as_f64() {
                let tip = r["results"]["displacements"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|d| d["nodeId"] == 2)
                    .unwrap();
                let displacement = ["ux", "uy", "uz"]
                    .into_iter()
                    .filter_map(|k| tip[k].as_f64())
                    .fold(0.0f64, |norm, value| norm.hypot(value));
                crate::common::assert_close(
                    displacement,
                    expected,
                    1e-10,
                    "resolved axial beside support load",
                );
            }
        }
    }
    if let Ok(path) = std::env::var("NONLINEAR_CONVERGENCE_CASES") {
        std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
    }
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
