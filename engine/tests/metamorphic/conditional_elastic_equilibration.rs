use crate::{ana2, ana3, case::{pad_2d, pad_3d, Case2, Case3}, checks3, tally::Tally};
use dedaliano_engine::metamorphic::units::Units;
use dedaliano_engine::solver::{constraints, stability};
use dedaliano_engine::types::{Constraint, EqualDOFConstraint};
use serde_json::{json, Value};

const UNIT_IMAGES: [(f64, f64); 4] = [(1.0, 1.0), (1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)];
const FIXTURE: &str = include_str!("../fixtures/conditional-elastic-2519.json");

fn archived_case() -> Case3 {
    Case3::new("replay", serde_json::from_str(FIXTURE).unwrap())
}

#[test]
fn issue_2519_conditional_elastic_verdict_is_independent_of_units() {
    let case = archived_case();
    let analysis = ana3::rows().into_iter().find(|row| row.name == "constrained").unwrap();
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed: 2026112405463 },
        &case,
        &[analysis],
        &["units", "rotation", "mirror", "relabel", "reversal", "load order"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    for (length, force) in UNIT_IMAGES {
        let solver = case.units(&Units::froude(length, force)).s;
        let result = constraints::solve_constrained_3d(&constraints::ConstrainedInput3D { solver, constraints: vec![] });
        assert!(result.is_ok(), "{length}/{force}: {:?}", result.err());
    }
}

#[test]
fn conditional_elastic_spatial_entry_points_solve_the_same_unit_images() {
    let case = archived_case();
    let rows = ana3::rows();
    let names = [
        "linear", "linear (load session)", "linear (sparse path)", "linear (PCG)",
        "certified linear", "load combinations", "staged (one stage)", "staged (loads in two stages)",
    ];
    for name in names {
        let analysis = rows.iter().find(|row| row.name == name).unwrap();
        for (length, force) in UNIT_IMAGES {
            let image = case.units(&Units::froude(length, force));
            let result = (analysis.run)(&image);
            assert!(result.is_ok(), "{name} {length}/{force}: {:?}", result.err());
        }
    }
}

fn conditional_planar() -> Case2 {
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../docs/results-changes/1753-loaded-c08-inputs.json"
    )).unwrap();
    Case2::new("loaded #1653", serde_json::from_value(fixtures["issue-1653"]["input"].clone()).unwrap())
}

fn equal_dof(master_node: usize, slave_node: usize, dof: usize) -> Constraint {
    Constraint::EqualDOF(EqualDOFConstraint { master_node, slave_node, dofs: vec![dof] })
}

#[test]
fn conditional_elastic_planar_entry_points_solve_the_same_unit_images() {
    let case = conditional_planar();
    let rows = ana2::rows();
    let names = [
        "linear", "linear (WASM typed path)", "linear (dense reference)",
        "linear (load session)", "linear (sparse path)", "linear (PCG)", "certified linear",
    ];
    for (length, force) in UNIT_IMAGES {
        let image = case.units(&Units::froude(length, force));
        let stable = stability::of_2d(&image.s).unwrap();
        assert!(stable.needs_accuracy_check(), "{length}/{force}: {stable:?}");
        for name in names {
            let analysis = rows.iter().find(|row| row.name == name).unwrap();
            let result = (analysis.run)(&image);
            assert!(result.is_ok(), "{name} {length}/{force}: {:?}", result.err());
        }
    }
}

#[test]
fn conditional_elastic_wasm_cases() {
    let Ok(path) = std::env::var("CONDITIONAL_ELASTIC_WASM_CASES") else { return };
    let planar = conditional_planar();
    let spatial = archived_case();
    let mut cases = Vec::new();
    for (length, force) in UNIT_IMAGES {
        let units = Units::froude(length, force);
        let s = planar.units(&units).s;
        let stage = ana2::stage("all", &s, (0..s.loads.len()).collect(), true);
        cases.push(json!({ "dimension": 2, "input": s, "stage": stage }));
        let s = spatial.units(&units).s;
        let stage = ana3::stage_all(&s, (0..s.loads.len()).collect());
        cases.push(json!({ "dimension": 3, "input": s, "stage": stage }));
    }
    let models: Value = serde_json::from_str(include_str!("../fixtures/released-tip-mechanisms.json")).unwrap();
    let mut s: dedaliano_engine::types::SolverInput = serde_json::from_value(models["2380"].clone()).unwrap();
    s.elements.get_mut("1").unwrap().hinge_start = false;
    let dedaliano_engine::types::SolverLoad::Nodal(load) = &mut s.loads[0] else { unreachable!() };
    load.node_id = 2;
    let stage = ana2::stage("all", &s, vec![0], true);
    cases.push(json!({ "dimension": 2, "input": s, "stage": stage, "control": true }));

    let mut s: dedaliano_engine::types::SolverInput3D =
        crate::common::nightly_solver_from_str(include_str!(
            "../metamorphic_corpus/stability/issue-1090.json"
        ))
        .unwrap();
    s.elements.get_mut("1").unwrap().release_my_end = false;
    let stage = ana3::stage_all(&s, (0..s.loads.len()).collect());
    cases.push(json!({ "dimension": 3, "input": s, "stage": stage, "control": true }));
    std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
}

#[test]
fn conditional_elastic_reduced_and_staged_systems_keep_their_verdict_across_units() {
    let planar = conditional_planar();
    let spatial = archived_case();
    for (length, force) in UNIT_IMAGES {
        let units = Units::froude(length, force);
        let s = planar.units(&units).s;
        let (mut padded, node_ids, member_ids) = pad_2d(&s);
        let master = node_ids.iter().max().unwrap() + 1;
        let first_member = member_ids.iter().max().unwrap() + 1;
        let constraint = equal_dof(master, master + 1, 0);
        padded.constraints.push(constraint.clone());
        let dense = {
            let mut dense = padded.clone();
            dense.nodes.retain(|_, node| node.id <= master + 1);
            dense.elements.retain(|_, element| element.id <= first_member);
            dense
        };
        for (solver, sparse) in [(&dense, false), (&padded, true)] {
            let input = constraints::ConstrainedInput {
                solver: solver.clone(),
                constraints: solver.constraints.clone(),
            };
            let result = if sparse {
                constraints::solve_constrained_2d(&input)
            } else {
                constraints::solve_constrained_2d_dense(&input, &dedaliano_engine::solver::dof::DofNumbering::build_2d(solver))
            };
            assert!(result.is_ok(), "2D constrained {sparse} {length}/{force}: {:?}", result.err());
            let stage = ana2::stage("all", solver, (0..solver.loads.len()).collect(), true);
            let input = ana2::staged_input(solver, vec![stage]).unwrap();
            let result = dedaliano_engine::solver::staged::solve_staged_2d(&input);
            assert!(result.is_ok(), "2D staged {sparse} {length}/{force}: {:?}", result.err());
        }

        let (mut solver, node_ids, _) = pad_3d(&spatial.units(&units).s);
        let master = node_ids.iter().max().unwrap() + 1;
        solver.constraints.push(equal_dof(master, master + 1, 0));
        let input = constraints::ConstrainedInput3D {
            constraints: solver.constraints.clone(),
            solver: solver.clone(),
        };
        let result = constraints::solve_constrained_3d(&input);
        assert!(result.unwrap_err().contains("constraint reduction cancels stiffness contributions"));
        let stage = ana3::stage_all(&solver, (0..solver.loads.len()).collect());
        let result = ana3::staged_3d(&solver, json!([stage]));
        assert!(result.unwrap_err().contains("constraint reduction cancels stiffness contributions"));
    }
}
