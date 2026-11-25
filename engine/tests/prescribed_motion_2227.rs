use dedaliano_engine::load_session::{LoadSession2D, LoadSession3D};
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

const OLD_LIMIT: f64 = 1e-15;
const MOTIONS: [f64; 7] = [
    0.0,
    0.0013,
    OLD_LIMIT.next_up(),
    1e-16,
    -1e-16,
    OLD_LIMIT.next_down(),
    OLD_LIMIT,
];

fn axial_model(space: bool, free: usize, pcg: bool, dx: f64) -> Value {
    let mut model: Value =
        serde_json::from_str(include_str!("fixtures/equilibrium-oracle-2109.json")).unwrap();
    model["loads"] = json!([]);
    let last = free + 2;
    model["nodes"] = json!({});
    model["supports"] = json!({});
    model["elements"] = json!({});
    for id in 1..=last {
        let key = id.to_string();
        let restrained = id == 1 || id == last;
        model["nodes"][&key] = if space {
            json!({ "id": id, "x": id - 1, "y": 0, "z": 0 })
        } else {
            json!({ "id": id, "x": id - 1, "z": 0 })
        };
        model["supports"][&key] = if space {
            json!({ "nodeId": id, "rx": restrained, "ry": true, "rz": true,
                "rrx": true, "rry": true, "rrz": true })
        } else {
            json!({ "id": id, "nodeId": id, "type": if restrained { "fixed" } else { "guidedX" } })
        };
        if id < last {
            model["elements"][&key] = json!({ "id": id, "type": "truss", "nodeI": id,
                "nodeJ": id + 1, "materialId": 1, "sectionId": 1 });
        }
    }
    model["supports"][last.to_string()]["dx"] = json!(dx);
    if pcg {
        model["solverOptions"] = json!({ "method": "pcg", "preconditioner": "ic0" });
    }
    model
}

fn assert_force(actual: f64, expected: f64, quantity: &str) {
    if expected == 0.0 {
        assert_eq!(actual, 0.0, "{quantity}");
    } else {
        assert!(
            (actual / expected - 1.0).abs() < 1e-12,
            "{quantity}: {actual:e}, expected {expected:e}"
        );
    }
}

fn check_2d(input: &SolverInput, result: &AnalysisResults, dx: f64, free: usize, path: &str) {
    let meta = result.solver_run_meta.as_ref().unwrap();
    assert_eq!(meta.solver_path, path);
    assert_eq!(meta.n_free_dofs, free);
    let expected = input.materials["1"].e * 1000.0 * input.sections["1"].a * dx / (free + 1) as f64;
    let last = free + 2;
    assert_eq!(
        result
            .displacements
            .iter()
            .find(|d| d.node_id == last)
            .unwrap()
            .ux,
        dx
    );
    assert_eq!(result.element_forces.len(), free + 1);
    for force in &result.element_forces {
        assert_force(force.n_start, expected, "member start axial force");
        assert_force(force.n_end, expected, "member end axial force");
    }
    let left = result.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let right = result.reactions.iter().find(|r| r.node_id == last).unwrap();
    assert_force(-left.rx, expected, "left reaction");
    assert_force(right.rx, expected, "right reaction");
}

fn check_3d(input: &SolverInput3D, result: &AnalysisResults3D, dx: f64, free: usize, path: &str) {
    let meta = result.solver_run_meta.as_ref().unwrap();
    assert_eq!(meta.solver_path, path);
    assert_eq!(meta.n_free_dofs, free);
    let expected = input.materials["1"].e * 1000.0 * input.sections["1"].a * dx / (free + 1) as f64;
    let last = free + 2;
    assert_eq!(
        result
            .displacements
            .iter()
            .find(|d| d.node_id == last)
            .unwrap()
            .ux,
        dx
    );
    assert_eq!(result.element_forces.len(), free + 1);
    for force in &result.element_forces {
        assert_force(force.n_start, expected, "member start axial force");
        assert_force(force.n_end, expected, "member end axial force");
    }
    let left = result.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let right = result.reactions.iter().find(|r| r.node_id == last).unwrap();
    assert_force(-left.fx, expected, "left reaction");
    assert_force(right.fx, expected, "right reaction");
}

fn check_paths_2d(free: usize, pcg: bool, path: &str, dx: f64) {
    let model = axial_model(false, free, pcg, dx);
    let input: SolverInput = serde_json::from_value(model.clone()).unwrap();
    let typed = serde_json::from_value(model).unwrap();
    let prepared = linear::prepare_static_2d(&input).unwrap();
    let session = LoadSession2D::from_input(input.clone()).unwrap();
    for result in [
        linear::solve_2d(&input).unwrap(),
        linear::solve_2d_typed(&typed).unwrap(),
        prepared.solve_loads(&[]).unwrap(),
        session.solve_loads(&[]).unwrap(),
    ] {
        check_2d(&input, &result, dx, free, path);
    }
    let nonlinear = pdelta::solve_pdelta_2d(&input, 20, 1e-10);
    if free == 0 {
        assert!(nonlinear.unwrap_err().contains("no_free_dofs"));
    } else {
        check_2d(&input, &nonlinear.unwrap().linear_results, dx, free, path);
    }
}

fn check_paths_3d(free: usize, pcg: bool, path: &str, dx: f64) {
    let input: SolverInput3D = serde_json::from_value(axial_model(true, free, pcg, dx)).unwrap();
    let prepared = linear::prepare_static_3d(&input).unwrap();
    let session = LoadSession3D::from_input(input.clone()).unwrap();
    for result in [
        linear::solve_3d(&input).unwrap(),
        prepared.solve_loads(&[]).unwrap(),
        session.solve_loads(&[]).unwrap(),
    ] {
        check_3d(&input, &result, dx, free, path);
    }
    let nonlinear = pdelta::solve_pdelta_3d(&input, 20, 1e-10);
    if free == 0 {
        assert!(nonlinear.unwrap_err().contains("no_free_dofs"));
    } else {
        check_3d(&input, &nonlinear.unwrap().linear_results, dx, free, path);
    }
}

#[test]
fn issue_2227_fully_restrained_2d() {
    for dx in MOTIONS {
        check_paths_2d(0, false, "fully_restrained", dx);
    }
}

#[test]
fn issue_2227_fully_restrained_3d() {
    for dx in MOTIONS {
        check_paths_3d(0, false, "fully_restrained", dx);
    }
}

#[test]
fn issue_2227_sparse_2d() {
    for dx in MOTIONS {
        check_paths_2d(linear::SPARSE_THRESHOLD, false, "sparse_cholesky", dx);
    }
}

#[test]
fn issue_2227_sparse_3d() {
    for dx in MOTIONS {
        check_paths_3d(linear::SPARSE_THRESHOLD, false, "sparse_cholesky", dx);
    }
}

#[test]
fn issue_2227_pcg_2d() {
    for dx in MOTIONS {
        check_paths_2d(linear::SPARSE_THRESHOLD, true, "pcg_ic0", dx);
    }
}

#[test]
fn issue_2227_pcg_3d() {
    for dx in MOTIONS {
        check_paths_3d(linear::SPARSE_THRESHOLD, true, "pcg_ic0", dx);
    }
}

#[test]
fn issue_2227_dense_partially_restrained() {
    for dx in MOTIONS {
        check_paths_2d(1, false, "dense_lu", dx);
        check_paths_3d(1, false, "dense_lu", dx);
    }
}
