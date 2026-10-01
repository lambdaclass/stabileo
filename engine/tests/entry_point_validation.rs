//! Every public entry point refuses bad input with an `Err`: never a panic,
//! which in WASM aborts the module, and never a silent `Ok` of zeros.
//!
//! `f6`: a curved beam naming a missing node (expanded before validation on
//! most 3D paths). `f7`: influence lines and moving loads, which used to
//! `.ok()` a prepare failure into an all-zero result. `f8`: the 2D nonlinear,
//! Winkler and reduction entry points that went straight to assembly.

#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::types::*;
use serde_json::json;
use std::collections::HashMap;
use std::panic::{catch_unwind, AssertUnwindSafe};

fn outcome<T>(f: impl FnOnce() -> Result<T, String>) -> String {
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(Ok(_)) => "OK".into(),
        Ok(Err(e)) => format!("ERR: {e}"),
        Err(p) => {
            let msg = p
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| p.downcast_ref::<&str>().map(|s| s.to_string()))
                .unwrap_or_default();
            format!("PANIC: {msg}")
        }
    }
}

fn expect_err<T>(what: &str, f: impl FnOnce() -> Result<T, String>) {
    let o = outcome(f);
    println!("[{what}] -> {o}");
    assert!(o.starts_with("ERR"), "{what}: expected clean Err, got {o}");
}

// ---------------------------------------------------------------- models

fn beam_2d() -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 4.0, z: 0.0 });
    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    elements.insert("1".into(), SolverElement {
        id: 1, elem_type: "frame".into(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    let mut supports = HashMap::new();
    supports.insert("1".into(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
        constraints: vec![],
        connectors: HashMap::new(),
    
        solver_options: None,}
}

/// Element 1 ends at node 99, which does not exist.
fn beam_2d_dangling() -> SolverInput {
    let mut s = beam_2d();
    s.elements.get_mut("1").unwrap().node_j = 99;
    s
}

fn beam_3d() -> SolverInput3D {
    make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    )
}

/// A valid 3D beam plus a curved beam whose mid node (77) does not exist.
fn beam_3d_bad_curved() -> SolverInput3D {
    let mut s = beam_3d();
    s.curved_beams.push(CurvedBeamInput {
        node_start: 1, node_mid: 77, node_end: 2,
        material_id: 1, section_id: 1, num_segments: 4,
        hinge_start: false, hinge_end: false,
    });
    s
}

// ================================================================ #6
// Curved-beam expansion indexes `cb_node_map[&id]` before any validation.

#[test]
fn f6_kinematics_3d_bad_curved_beam_no_panic() {
    use dedaliano_engine::solver::kinematic::analyze_kinematics_3d;
    let input = beam_3d_bad_curved();
    let r = catch_unwind(AssertUnwindSafe(|| analyze_kinematics_3d(&input)));
    match &r {
        Ok(k) => println!("[analyze_kinematics_3d] -> is_solvable={} diag={}", k.is_solvable, k.diagnosis),
        Err(_) => println!("[analyze_kinematics_3d] -> PANIC"),
    }
    let k = r.expect("analyze_kinematics_3d panicked on a curved beam with a missing node");
    assert!(!k.is_solvable);
}

#[test]
fn f6_solve_3d_bad_curved_beam() {
    use dedaliano_engine::solver::linear::solve_3d;
    let input = beam_3d_bad_curved();
    expect_err("solve_3d", || solve_3d(&input));
}

#[test]
fn f6_pdelta_3d_bad_curved_beam() {
    use dedaliano_engine::solver::pdelta::solve_pdelta_3d;
    let input = beam_3d_bad_curved();
    expect_err("solve_pdelta_3d", || solve_pdelta_3d(&input, 20, 1e-6));
}

#[test]
fn f6_ssi_3d_bad_curved_beam() {
    // validate_input_3d runs first here, but it does not look at curved beams.
    use dedaliano_engine::solver::ssi::{solve_ssi_3d, SSIInput3D};
    let v = json!({ "solver": serde_json::to_value(beam_3d_bad_curved()).unwrap(), "soilSprings": [] });
    let input: SSIInput3D = serde_json::from_value(v).expect("deserialize SSIInput3D");
    expect_err("solve_ssi_3d", || solve_ssi_3d(&input));
}

#[test]
fn f6_influence_3d_bad_curved_beam() {
    use dedaliano_engine::postprocess::influence::{compute_influence_line_3d, InfluenceLineInput3D};
    let input = InfluenceLineInput3D {
        solver: beam_3d_bad_curved(), quantity: "Fz".into(), target_node_id: Some(1),
        target_element_id: None, target_position: 0.5, n_points_per_element: 4, gravity_direction: None,
    };
    expect_err("compute_influence_line_3d", || compute_influence_line_3d(&input));
}

#[test]
fn f6_moving_loads_3d_bad_curved_beam() {
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_3d;
    let input = MovingLoadInput3D {
        solver: beam_3d_bad_curved(),
        train: LoadTrain { name: "t".into(), axles: vec![Axle { offset: 0.0, weight: 10.0 }] },
        step: Some(1.0), path_element_ids: None, gravity_direction: None,
    };
    expect_err("solve_moving_loads_3d", || solve_moving_loads_3d(&input));
}

// ================================================================ #7
// `prepare_static_*(&base).ok()` turns any refusal into an all-zero line.

fn infl_2d(solver: SolverInput) -> dedaliano_engine::postprocess::influence::InfluenceLineInput {
    dedaliano_engine::postprocess::influence::InfluenceLineInput {
        solver, quantity: "Rz".into(), target_node_id: Some(1),
        target_element_id: None, target_position: 0.5, n_points_per_element: 4,
    }
}

fn infl_3d(solver: SolverInput3D) -> dedaliano_engine::postprocess::influence::InfluenceLineInput3D {
    dedaliano_engine::postprocess::influence::InfluenceLineInput3D {
        solver, quantity: "Fz".into(), target_node_id: Some(1),
        target_element_id: None, target_position: 0.5, n_points_per_element: 4, gravity_direction: None,
    }
}

#[test]
fn f7_control_valid_models_give_nonzero_lines() {
    use dedaliano_engine::postprocess::influence::{compute_influence_line, compute_influence_line_3d};
    let r2 = compute_influence_line(&infl_2d(beam_2d())).unwrap();
    let r3 = compute_influence_line_3d(&infl_3d(beam_3d())).unwrap();
    let v2: Vec<f64> = r2.points.iter().map(|p| p.value).collect();
    let v3: Vec<f64> = r3.points.iter().map(|p| p.value).collect();
    println!("[control 2D] {v2:?}\n[control 3D] {v3:?}");
    assert!(v2.iter().any(|v| v.abs() > 1e-9));
    assert!(v3.iter().any(|v| v.abs() > 1e-9));
}

#[test]
fn f7_influence_2d_nonpositive_e() {
    use dedaliano_engine::postprocess::influence::compute_influence_line;
    let mut s = beam_2d();
    s.materials.get_mut("1").unwrap().e = -1.0;
    let input = infl_2d(s);
    let r = outcome(|| compute_influence_line(&input).map(|r| r.points.iter().map(|p| p.value).collect::<Vec<_>>()));
    if let Ok(pts) = compute_influence_line(&input) {
        println!("[influence_2d E<0] Ok values = {:?}", pts.points.iter().map(|p| p.value).collect::<Vec<_>>());
    }
    println!("[influence_2d E<0] -> {r}");
    assert!(r.starts_with("ERR"), "influence 2D with E<0: expected Err, got {r}");
}

#[test]
fn f7_influence_2d_zero_area() {
    use dedaliano_engine::postprocess::influence::compute_influence_line;
    let mut s = beam_2d();
    s.sections.get_mut("1").unwrap().a = 0.0;
    let input = infl_2d(s);
    if let Ok(pts) = compute_influence_line(&input) {
        println!("[influence_2d A=0] Ok values = {:?}", pts.points.iter().map(|p| p.value).collect::<Vec<_>>());
    }
    expect_err("influence_2d A=0", || compute_influence_line(&input));
}

#[test]
fn f7_influence_3d_nonpositive_e() {
    use dedaliano_engine::postprocess::influence::compute_influence_line_3d;
    let mut s = beam_3d();
    s.materials.get_mut("1").unwrap().e = -1.0;
    let input = infl_3d(s);
    if let Ok(pts) = compute_influence_line_3d(&input) {
        println!("[influence_3d E<0] Ok values = {:?}", pts.points.iter().map(|p| p.value).collect::<Vec<_>>());
    }
    expect_err("influence_3d E<0", || compute_influence_line_3d(&input));
}

/// Passes validate_input_3d, but the new pre-solve gate refuses a collapsed
/// (collinear) plate, so prepare_static_3d returns Err.
fn beam_3d_collapsed_plate() -> SolverInput3D {
    let mut s = beam_3d();
    s.nodes.insert("3".into(), SolverNode3D { id: 3, x: 2.0, y: 0.0, z: 0.0 });
    s.plates.insert("1".into(), SolverPlateElement { id: 1, nodes: [1, 3, 2], material_id: 1, thickness: 0.1 });
    s
}

/// A frame chain stabilizes a folded quad so the geometry refusal, rather
/// than a singular frame system, is what the callers must report.
fn frame_3d_folded_quad() -> SolverInput3D {
    let mut s = make_3d_input(
        vec![(0, 0.0, 0.0, 0.0), (1, 2.0, 0.0, 0.0), (2, 0.0, 2.0, 0.0), (3, 3.0, 2.0, 0.0)],
        vec![(1, 210_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-4)],
        vec![(0, "frame", 0, 1, 1, 1), (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1)],
        vec![(0, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    s.quads.insert("9".into(), SolverQuadElement {
        id: 9, nodes: [0, 1, 2, 3], material_id: 1, thickness: 0.1,
    });
    s
}

fn single_axle_train() -> LoadTrain {
    LoadTrain { name: "t".into(), axles: vec![Axle { offset: 0.0, weight: 10.0 }] }
}

#[test]
fn moving_loads_constrained_folded_quad_returns_geometry_error() {
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_3d;
    let mut solver = frame_3d_folded_quad();
    solver.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 1, slave_node: 2, dofs: vec![0],
    }));
    let input = MovingLoadInput3D {
        solver, train: single_axle_train(), step: Some(1.0),
        path_element_ids: Some(vec![0, 1, 2]), gravity_direction: None,
    };
    let err = solve_moving_loads_3d(&input).expect_err("a refused model must not return a zero envelope");
    assert!(err.contains("Quad 9") && err.contains("folds"), "{err}");

    // Removing only the bad shell leaves a valid constrained frame. Its
    // moving loads must still produce a nonzero envelope.
    let mut valid = input;
    valid.solver.quads.clear();
    let result = solve_moving_loads_3d(&valid).expect("valid constrained frame");
    assert!(result.elements.values().any(|e| e.my_max_pos.abs().max(e.my_max_neg.abs()) > 1.0));
}

#[test]
fn moving_loads_2d_constraint_refusal_is_returned() {
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_2d;
    let mut solver = beam_2d();
    solver.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 1, slave_node: 99, dofs: vec![0],
    }));
    let mut input = MovingLoadInput {
        solver, train: single_axle_train(), step: Some(1.0), path_element_ids: None,
    };
    let err = solve_moving_loads_2d(&input).expect_err("a refused constraint must not return a zero envelope");
    assert!(err.contains("99"), "{err}");

    input.solver.constraints[0] = Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 1, slave_node: 2, dofs: vec![0],
    });
    let result = solve_moving_loads_2d(&input).expect("valid constrained cantilever");
    assert!(result.elements.values().any(|e| e.m_max_pos.abs().max(e.m_max_neg.abs()) > 1.0));
}

fn plastic_3d_input(solver: SolverInput3D) -> PlasticInput3D {
    PlasticInput3D {
        solver,
        sections: HashMap::from([("1".into(), PlasticSectionData3D {
            a: 0.01, iy: 1e-4, iz: 1e-4, material_id: 1,
            b: Some(0.1), h: Some(0.1), d: Some(0.1),
        })]),
        materials: HashMap::new(), max_hinges: Some(1),
        mp_overrides: Some(HashMap::from([("1".into(), [100.0, 100.0])])),
    }
}

#[test]
fn plastic_3d_broken_shell_returns_geometry_error() {
    use dedaliano_engine::solver::plastic::solve_plastic_3d;
    for (solver, element, problem) in [
        (frame_3d_folded_quad(), "Quad 9", "folds"),
        (beam_3d_collapsed_plate(), "Plate 1", "collapsed"),
    ] {
        let err = solve_plastic_3d(&plastic_3d_input(solver))
            .expect_err("invalid geometry must not be reported as zero-load collapse");
        assert!(err.contains(element) && err.contains(problem), "{err}");
    }
}

#[test]
fn plastic_3d_valid_frame_still_forms_a_hinge() {
    use dedaliano_engine::solver::plastic::solve_plastic_3d;
    let result = solve_plastic_3d(&plastic_3d_input(beam_3d())).unwrap();
    assert!(!result.is_mechanism);
    assert!((result.collapse_factor - 2.5).abs() < 1e-8);
    assert_eq!(result.hinges.len(), 1);
}

#[test]
fn plastic_3d_unrestrained_frame_is_still_a_mechanism() {
    use dedaliano_engine::solver::plastic::solve_plastic_3d;
    let mut solver = beam_3d();
    solver.supports.clear();
    let result = solve_plastic_3d(&plastic_3d_input(solver)).unwrap();
    assert!(result.is_mechanism);
    assert_eq!(result.collapse_factor, 0.0);
}

#[test]
fn f7_gate_refusal_control_solve_3d_errs() {
    use dedaliano_engine::solver::linear::solve_3d;
    let input = beam_3d_collapsed_plate();
    expect_err("solve_3d collapsed plate (control)", || solve_3d(&input));
}

#[test]
fn f7_influence_3d_gate_refusal() {
    use dedaliano_engine::postprocess::influence::compute_influence_line_3d;
    let input = infl_3d(beam_3d_collapsed_plate());
    if let Ok(pts) = compute_influence_line_3d(&input) {
        println!("[influence_3d collapsed plate] Ok values = {:?}", pts.points.iter().map(|p| p.value).collect::<Vec<_>>());
    }
    expect_err("influence_3d collapsed plate", || compute_influence_line_3d(&input));
}

#[test]
fn f7_moving_loads_3d_gate_refusal() {
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_3d;
    let input = MovingLoadInput3D {
        solver: beam_3d_collapsed_plate(),
        train: LoadTrain { name: "t".into(), axles: vec![Axle { offset: 0.0, weight: 10.0 }] },
        step: Some(1.0), path_element_ids: None, gravity_direction: None,
    };
    if let Ok(env) = solve_moving_loads_3d(&input) {
        println!("[moving_loads_3d collapsed plate] Ok envelope = {:?}", env.elements);
    }
    expect_err("moving_loads_3d collapsed plate", || solve_moving_loads_3d(&input));
}

#[test]
fn f7_moving_loads_3d_nonpositive_e_is_caught_upfront() {
    // Refutation check: the PR's up-front validate_input_3d covers this.
    use dedaliano_engine::solver::moving_loads::solve_moving_loads_3d;
    let mut s = beam_3d();
    s.materials.get_mut("1").unwrap().e = -1.0;
    let input = MovingLoadInput3D {
        solver: s,
        train: LoadTrain { name: "t".into(), axles: vec![Axle { offset: 0.0, weight: 10.0 }] },
        step: Some(1.0), path_element_ids: None, gravity_direction: None,
    };
    expect_err("moving_loads_3d E<0", || solve_moving_loads_3d(&input));
}

// ================================================================ #8
// 2D entry points that go straight to DofNumbering/assemble_2d.

#[test]
fn f8_arc_length_dangling_node() {
    use dedaliano_engine::solver::arc_length::{solve_arc_length, ArcLengthInput};
    let input: ArcLengthInput =
        serde_json::from_value(json!({ "solver": serde_json::to_value(beam_2d_dangling()).unwrap() })).unwrap();
    expect_err("solve_arc_length", || solve_arc_length(&input));
}

#[test]
fn f8_displacement_control_dangling_node() {
    use dedaliano_engine::solver::arc_length::{solve_displacement_control, DisplacementControlInput};
    let input: DisplacementControlInput = serde_json::from_value(json!({
        "solver": serde_json::to_value(beam_2d_dangling()).unwrap(),
        "controlNode": 2, "controlDof": 1, "targetDisplacement": -0.01
    })).unwrap();
    expect_err("solve_displacement_control", || solve_displacement_control(&input));
}

#[test]
fn f8_nonlinear_material_2d_dangling_node() {
    use dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d;
    let input: NonlinearMaterialInput = serde_json::from_value(json!({
        "solver": serde_json::to_value(beam_2d_dangling()).unwrap(),
        "materialModels": {}, "sectionCapacities": {}
    })).unwrap();
    expect_err("solve_nonlinear_material_2d", || solve_nonlinear_material_2d(&input));
}

#[test]
fn f8_winkler_2d_dangling_node() {
    use dedaliano_engine::solver::winkler::{solve_winkler_2d, WinklerInput};
    let input = WinklerInput { solver: beam_2d_dangling(), foundation_springs: vec![] };
    expect_err("solve_winkler_2d", || solve_winkler_2d(&input));
}

#[test]
fn f8_fiber_nonlinear_2d_dangling_node() {
    use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_2d, FiberNonlinearInput};
    let input: FiberNonlinearInput = serde_json::from_value(json!({
        "solver": serde_json::to_value(beam_2d_dangling()).unwrap(),
        "fiberSections": {}
    })).unwrap();
    expect_err("solve_fiber_nonlinear_2d", || solve_fiber_nonlinear_2d(&input));
}

// Other unvalidated entries found by the sweep.

#[test]
fn f8_guyan_2d_dangling_node() {
    use dedaliano_engine::solver::reduction::{guyan_reduce_2d, GuyanInput};
    let input = GuyanInput { solver: beam_2d_dangling(), boundary_nodes: vec![2] };
    expect_err("guyan_reduce_2d", || guyan_reduce_2d(&input));
}

#[test]
fn f8_craig_bampton_2d_dangling_node() {
    use dedaliano_engine::solver::reduction::{craig_bampton_2d, CraigBamptonInput};
    let input = CraigBamptonInput {
        solver: beam_2d_dangling(), boundary_nodes: vec![2], n_modes: 1,
        densities: HashMap::from([("1".to_string(), 7850.0)]),
    };
    expect_err("craig_bampton_2d", || craig_bampton_2d(&input));
}

#[test]
fn f8_cable_2d_dangling_node() {
    use dedaliano_engine::solver::cable::solve_cable_2d;
    let input = beam_2d_dangling();
    let d = HashMap::from([("1".to_string(), 7850.0)]);
    expect_err("solve_cable_2d", || solve_cable_2d(&input, &d, 20, 1e-6));
}

#[test]
fn f8_pdelta_2d_dangling_node() {
    use dedaliano_engine::solver::pdelta::solve_pdelta_2d;
    let input = beam_2d_dangling();
    expect_err("solve_pdelta_2d", || solve_pdelta_2d(&input, 20, 1e-6));
}

#[test]
fn f8_buckling_2d_dangling_node() {
    use dedaliano_engine::solver::buckling::solve_buckling_2d;
    let input = beam_2d_dangling();
    expect_err("solve_buckling_2d", || solve_buckling_2d(&input, 1));
}

fn beam_3d_dangling() -> SolverInput3D {
    let mut s = beam_3d();
    s.elements.get_mut("1").unwrap().node_j = 99;
    s
}

#[test]
fn f8_guyan_3d_dangling_node() {
    use dedaliano_engine::solver::reduction::{guyan_reduce_3d, GuyanInput3D};
    let input = GuyanInput3D { solver: beam_3d_dangling(), boundary_nodes: vec![2] };
    expect_err("guyan_reduce_3d", || guyan_reduce_3d(&input));
}

#[test]
fn f8_craig_bampton_3d_dangling_node() {
    use dedaliano_engine::solver::reduction::{craig_bampton_3d, CraigBamptonInput3D};
    let input = CraigBamptonInput3D {
        solver: beam_3d_dangling(), boundary_nodes: vec![2], n_modes: 1,
        densities: HashMap::from([("1".to_string(), 7850.0)]),
    };
    expect_err("craig_bampton_3d", || craig_bampton_3d(&input));
}

#[test]
fn f8_cable_3d_dangling_node() {
    use dedaliano_engine::solver::cable::solve_cable_3d;
    let input = beam_3d_dangling();
    let d = HashMap::from([("1".to_string(), 7850.0)]);
    expect_err("solve_cable_3d", || solve_cable_3d(&input, &d, 20, 1e-6));
}

#[test]
fn f8_pdelta_3d_dangling_node() {
    use dedaliano_engine::solver::pdelta::solve_pdelta_3d;
    let input = beam_3d_dangling();
    expect_err("solve_pdelta_3d", || solve_pdelta_3d(&input, 20, 1e-6));
}
