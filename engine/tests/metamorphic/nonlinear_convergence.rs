use crate::{ana2, ana3, case::{Case2, Case3}, checks2, checks3, tally::Tally};
use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
use dedaliano_engine::types::SolverInput;

fn fixtures() -> Vec<Case2> {
    [
        ("random-29-input", include_str!("../fixtures/random-29-input.json")),
        ("random-32-input", include_str!("../fixtures/random-32-input.json")),
        ("random-41-input", include_str!("../fixtures/random-41-input.json")),
        ("random-49-input", include_str!("../fixtures/random-49-input.json")),
    ].into_iter().map(|(name, text)| Case2::new(name, serde_json::from_str::<SolverInput>(text).unwrap())).collect()
}

fn support_loads_2d(analysis: &str) {
    let tally = Tally::default();
    let ctx = checks2::Ctx { tally: &tally, rng_seed: 20754 };
    let rows: Vec<_> = ana2::rows().into_iter().filter(|a| a.name == analysis).collect();
    assert_eq!(rows.len(), 1);
    for case in fixtures() {
        (rows[0].run)(&case).unwrap();
        checks2::check_case(&ctx, &case, &rows, &["rotation", "mirror", "units"]);
    }
    assert!(tally.failures().is_empty(), "{}\n{:?}", tally.report(), tally.failures());
}

fn support_loads_3d(analysis: &str) {
    let tally = Tally::default();
    let ctx = checks3::Ctx { tally: &tally, rng_seed: 20754 };
    let rows: Vec<_> = ana3::rows().into_iter().filter(|a| a.name == analysis).collect();
    assert_eq!(rows.len(), 1);
    for case in fixtures() {
        for plane in Plane::ALL {
            let case = Case3::new(format!("{}-{plane:?}", case.name), embed_2d(&case.s, plane).unwrap());
            (rows[0].run)(&case).unwrap();
            checks3::check_case(&ctx, &case, &rows, &["rotation", "mirror", "units"]);
        }
    }
    assert!(tally.failures().is_empty(), "{}\n{:?}", tally.report(), tally.failures());
}

#[test]
#[ignore = "known wrong result: #761"]
fn issue_761_pdelta_support_loads_2d() { support_loads_2d("P-Delta"); }

#[test]
#[ignore = "known wrong result: #761"]
fn issue_761_fiber_support_loads_2d() { support_loads_2d("fiber nonlinear"); }

#[test]
fn issue_761_corotational_support_loads_2d() { support_loads_2d("corotational"); }

#[test]
fn issue_761_linear_support_loads_2d() { support_loads_2d("linear"); }

#[test]
fn issue_761_pdelta_support_loads_3d() { support_loads_3d("P-Delta"); }

#[test]
fn issue_761_fiber_support_loads_3d() { support_loads_3d("fiber nonlinear"); }

#[test]
fn issue_761_corotational_support_loads_3d() { support_loads_3d("corotational"); }

#[test]
fn issue_761_linear_support_loads_3d() { support_loads_3d("linear"); }

use dedaliano_engine::{solver::{pdelta, corotational, fiber_nonlinear as fiber}, types::*};
use dedaliano_engine::metamorphic::{transform::{transform_2d, Iso2}, units::{scale_2d, Units}};

fn fiber_input(s: &SolverInput, max_iter: usize) -> fiber::FiberNonlinearInput {
    let fiber_sections = s.sections.values().map(|x| {
        let (b, h) = ana2::rect(x.a, x.iz);
        (x.id.to_string(), ana2::rect_fibers(b, h, 40, 1, ana2::mat_e(s, x.id)))
    }).collect();
    fiber::FiberNonlinearInput { solver: s.clone(), fiber_sections, n_integration_points: 5, max_iter, tolerance: 1e-10, n_increments: 1, modified_nr: false }
}

fn cantilever() -> SolverInput {
    let mut s = fixtures().remove(0).s;
    s.supports.retain(|_, x| x.node_id == 1);
    s.supports.values_mut().next().unwrap().support_type = "fixed".into();
    s.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: -1.0, fz: -0.25, my: 0.0 })];
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
            assert!(!corotational::solve_corotational_2d(&s, 1, 1e-10, 1, false).unwrap().converged);
            assert!(!fiber::solve_fiber_nonlinear_2d(&fiber_input(&s, 1)).unwrap().converged);
        }
    }
}

#[test]
fn issue_761_resolved_axial_load_keeps_its_answer_and_export_parity() {
    let mut base = cantilever();
    if let SolverLoad::Nodal(l) = &mut base.loads[0] { l.fz = 0.0; }
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
            let exported: serde_json::Value = serde_json::from_str(&dedaliano_engine::solve_pdelta_2d(&text, 100, 1e-12).unwrap()).unwrap();
            assert_eq!(exported["converged"], true);
            let exported: serde_json::Value = serde_json::from_str(&dedaliano_engine::solve_corotational_2d(&text, 100, 1e-10, 1).unwrap()).unwrap();
            assert_eq!(exported["converged"], true);
            let exported: serde_json::Value = serde_json::from_str(&dedaliano_engine::solve_fiber_nonlinear_2d(&serde_json::to_string(&fiber_input(&s, 60)).unwrap()).unwrap()).unwrap();
            assert_eq!(exported["converged"], true);
        }
    }
}
