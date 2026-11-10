use super::assembly::*;
use super::dof::DofNumbering;
use crate::types::SolverInput3D;

#[test]
fn issue_1753_web_refusals_have_explicit_physical_null_modes() {
    let cases: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/1753-web-mechanisms.json")).unwrap();
    assert_eq!(cases.as_array().unwrap().len(), 32);
    for case in cases.as_array().unwrap() {
        let input: SolverInput3D = serde_json::from_value(case["input"].clone()).unwrap();
        let dof = DofNumbering::build_3d(&input);
        let asm = without_artificial_stiffness(|| assemble_sparse_3d(&input, &dof, true));
        let k = asm.k_full.unwrap();
        let mut u = vec![0.0; dof.n_total];
        for entry in case["mode"].as_array().unwrap() {
            let node = entry[0][0].as_u64().unwrap() as usize;
            let local = entry[0][1].as_u64().unwrap() as usize;
            u[dof.global_dof(node, local).unwrap()] = entry[1].as_f64().unwrap();
        }
        assert!(u[dof.n_free..].iter().all(|&x| x == 0.0), "{}", case["test"]);
        let max = |v: &[f64]| v.iter().fold(0.0f64, |a, b| a.max(b.abs()));
        let residual = max(&k.sym_mat_vec(&u)) / (max(&k.values) * max(&u));
        assert!(residual < 1e-14, "{}: {residual:e}", case["test"]);
        assert!(super::linear::solve_3d(&input).is_err(), "{}", case["test"]);
    }
}

#[test]
#[ignore = "known wrong result: #1753"]
fn issue_1753_generated_models_solve_with_balanced_nodal_loads() {
    let cases: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/1753-generated-stable.json")).unwrap();
    assert_eq!(cases.as_array().unwrap().len(), 28);
    for case in cases.as_array().unwrap() {
        let input: SolverInput3D = serde_json::from_value(case["input"].clone()).unwrap();
        let result = super::linear::solve_3d(&input).unwrap_or_else(|e| panic!("{}: {e}", case["test"]));
        let mut applied = [0.0; 3];
        for load in &input.loads {
            let crate::types::SolverLoad3D::Nodal(load) = load else { panic!("expected nodal load") };
            for (sum, x) in applied.iter_mut().zip([load.fx, load.fy, load.fz]) { *sum += x; }
        }
        let scale = applied.iter().fold(0.0f64, |a, b| a.max(b.abs()));
        for axis in 0..3 {
            let reaction: f64 = result.reactions.iter().map(|r| [r.fx, r.fy, r.fz][axis]).sum();
            assert!((reaction + applied[axis]).abs() <= super::stability::CONDITIONAL_ACCURACY * scale, "{}: axis {axis}", case["test"]);
        }
        assert!(result.displacements.iter().all(|d| [d.ux,d.uy,d.uz,d.rx,d.ry,d.rz].iter().all(|x| x.is_finite())));
    }
}
