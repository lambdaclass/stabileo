//! Kinematics on a model that fails `validate_input_2d` for a parameter
//! reason — not a dangling id.
//!
//! The analysis cannot run, and the result has to say both that it did not
//! run (so `mechanismModes: 0` is not read as "stable") and why (so the web
//! solve, which stops on this result, can show the validator's message
//! instead of only "the model has invalid data").

use dedaliano_engine::solver::kinematic::analyze_kinematics_2d;
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Cantilever, valid in every respect except the given Poisson ratio.
fn cantilever_with_nu(nu: f64) -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 4.0, z: 0.0 });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
        constraints: vec![],
        connectors: HashMap::new(),
        solver_options: None,
    }
}

/// What the JS side receives (serde camelCase), and whether the specific
/// validation reason survives anywhere in it.
#[test]
fn kinematics_on_invalid_poisson_keeps_the_reason() {
    let input = cantilever_with_nu(0.5);

    let solve_err = solve_2d(&input).err().expect("solve_2d must reject nu = 0.5");
    println!("solve_2d error      : {solve_err}");

    let kin = analyze_kinematics_2d(&input);
    let json = serde_json::to_string_pretty(&kin).unwrap();
    println!("kinematic JSON      :\n{json}");

    // Sanity: the model is otherwise a perfectly stable cantilever.
    assert!(!kin.is_solvable, "PR behaviour: invalid model -> is_solvable=false");
    assert_eq!(kin.mechanism_modes, 0);

    // Correct behaviour: the reason (material id / Poisson) must reach the
    // caller somewhere in the result, since the Basic solve path returns
    // `diagnosis` verbatim and never calls solve_2d when is_solvable=false.
    let carries_reason = json.contains("Poisson") || json.contains("Material 1") || json.contains("ν");
    assert!(
        carries_reason,
        "kinematic result drops the validation reason; UI would show only: {:?} \
         (solve_2d would have said: {:?})",
        kin.diagnosis, solve_err
    );
}

/// Correct behaviour for the report: a result that did not run the rank
/// analysis must be distinguishable from "rank ran, 0 mechanisms". The JSON
/// has no such field, so the TS boundary cannot tell them apart except by
/// matching the diagnosis string.
#[test]
fn kinematics_on_invalid_model_flags_rank_analysis_as_not_run() {
    let kin = analyze_kinematics_2d(&cantilever_with_nu(0.5));
    let v = serde_json::to_value(&kin).unwrap();
    let keys: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
    println!("serialized keys     : {keys:?}");
    let has_flag = keys.iter().any(|k| k.to_lowercase().contains("rank") || k.to_lowercase().contains("valid"));
    assert!(
        has_flag,
        "no field distinguishes 'not analysed' from 'no mechanisms' (mechanismModes={}, isSolvable={})",
        kin.mechanism_modes, kin.is_solvable
    );
}
