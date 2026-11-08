use dedaliano_engine::certify::solver::{certify_linear_2d, certify_linear_3d};
use dedaliano_engine::load_session::{LoadSession2D, LoadSession3D};
use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
use dedaliano_engine::solver::{buckling, constraints, dof::DofNumbering, linear, modal, pdelta};
use dedaliano_engine::types::*;
use dedaliano_engine::types::units::{ElasticInput2D, ElasticInput3D};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Copy)]
enum Path {
    Linear,
    Prepared,
    PreparedDense,
    Constrained,
    ConstrainedDense,
    Typed,
    Certified,
    Session,
    Modal,
    Buckling,
    PDelta,
}

fn refused(result: Result<(), String>) -> Value {
    let error = result.expect_err("a rigid restraint and a spring on the same DOF must be refused");
    let value: Value = serde_json::from_str(&error).unwrap_or_else(|_| panic!("refusal must be structured: {error}"));
    let diagnostic = &value["structuredDiagnostics"][0];
    assert_eq!(diagnostic["code"], "conflicting_support_spring", "{error}");
    assert_eq!(diagnostic["severity"], "error");
    let message = value["message"].as_str().unwrap();
    assert!(message.contains("Support") && message.contains("node") && message.contains("k"), "{message}");
    diagnostic["code"].clone()
}

fn check(model: &str, path: Path, sparse: bool) {
    let value: Value = serde_json::from_str(model).unwrap();
    let densities: HashMap<String, f64> = serde_json::from_value(value["_nightly_dens"].clone()).unwrap();
    let mut s: SolverInput = serde_json::from_value(value).unwrap();
    if sparse {
        let first = s.nodes.values().map(|n| n.id).max().unwrap() + 1;
        for id in first..first + 40 {
            s.nodes.insert(id.to_string(), SolverNode { id, x: id as f64, z: 0.0 });
        }
        assert!(DofNumbering::build_2d(&s).n_free >= 64);
    }
    for plane in Plane::ALL {
        let s3 = embed_2d(&s, plane).unwrap();
        if sparse {
            assert!(DofNumbering::build_3d(&s3).n_free >= 64);
        }
        let constraint: Constraint = serde_json::from_value(serde_json::json!({
            "type": "equalDOF", "masterNode": 1, "slaveNode": 2, "dofs": [0]
        })).unwrap();
        let c = constraints::ConstrainedInput { solver: s.clone(), constraints: vec![constraint.clone()] };
        let c3 = constraints::ConstrainedInput3D { solver: s3.clone(), constraints: vec![constraint] };
        let (a, b) = match path {
            Path::Linear => (linear::solve_2d(&s).map(|_| ()), linear::solve_3d(&s3).map(|_| ())),
            Path::Prepared => (linear::prepare_static_2d(&s).map(|_| ()), linear::prepare_static_3d(&s3).map(|_| ())),
            Path::PreparedDense => (linear::prepare_static_2d_dense_reference(&s).map(|_| ()), linear::prepare_static_3d(&s3).map(|_| ())),
            Path::Constrained => (constraints::solve_constrained_2d(&c).map(|_| ()), constraints::solve_constrained_3d(&c3).map(|_| ())),
            Path::ConstrainedDense => (
                constraints::solve_constrained_2d_dense(&c, &DofNumbering::build_2d(&s)).map(|_| ()),
                constraints::solve_constrained_3d(&c3).map(|_| ()),
            ),
            Path::Typed => {
                let typed: ElasticInput2D = serde_json::from_value(serde_json::to_value(&s).unwrap()).unwrap();
                let typed3: ElasticInput3D = serde_json::from_value(serde_json::to_value(&s3).unwrap()).unwrap();
                (linear::solve_2d_typed(&typed).map(|_| ()), linear::solve_3d(&typed3.into_legacy()).map(|_| ()))
            }
            Path::Certified => (certify_linear_2d(&s).map(|_| ()), certify_linear_3d(&s3).map(|_| ())),
            Path::Session => (
                LoadSession2D::from_input(s.clone()).and_then(|p| p.solve_loads(&s.loads)).map(|_| ()),
                LoadSession3D::from_input(s3.clone()).and_then(|p| p.solve_loads(&s3.loads)).map(|_| ()),
            ),
            Path::Modal => (modal::solve_modal_2d(&s, &densities, 6).map(|_| ()), modal::solve_modal_3d(&s3, &densities, 6).map(|_| ())),
            Path::Buckling => (buckling::solve_buckling_2d(&s, 3).map(|_| ()), buckling::solve_buckling_3d(&s3, 3).map(|_| ())),
            Path::PDelta => (pdelta::solve_pdelta_2d(&s, 30, 1e-8).map(|_| ()), pdelta::solve_pdelta_3d(&s3, 30, 1e-8).map(|_| ())),
        };
        assert_eq!(refused(a), refused(b), "{plane:?}");
    }
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_linear_dense() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_linear_sparse() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_prepared_dense() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_constrained_dense() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_typed() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_certified() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_load_session() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_modal() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_buckling() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1636"]
fn issue_1636_pdelta() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_linear_dense() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_linear_sparse() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_prepared_dense() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_constrained_dense() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_typed() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_certified() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_load_session() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_modal() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_buckling() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1637"]
fn issue_1637_pdelta() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_linear_dense() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_linear_sparse() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_prepared_dense() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_constrained_dense() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_typed() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_certified() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_load_session() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_modal() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_buckling() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1638"]
fn issue_1638_pdelta() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_linear_dense() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_linear_sparse() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_prepared_dense() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_constrained_dense() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_typed() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_certified() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_load_session() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_modal() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_buckling() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1639"]
fn issue_1639_pdelta() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_linear_dense() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_linear_sparse() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_prepared_dense() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_constrained_dense() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_typed() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_certified() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_load_session() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_modal() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_buckling() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1640"]
fn issue_1640_pdelta() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_linear_dense() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_linear_sparse() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_prepared_dense() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_constrained_dense() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_typed() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_certified() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_load_session() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_modal() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_buckling() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1641"]
fn issue_1641_pdelta() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_linear_dense() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_linear_sparse() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_prepared_dense() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_constrained_dense() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_typed() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_certified() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_load_session() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_modal() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_buckling() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1642"]
fn issue_1642_pdelta() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_linear_dense() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_linear_sparse() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_prepared_dense() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_constrained_dense() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_typed() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_certified() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_load_session() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_modal() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_buckling() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1643"]
fn issue_1643_pdelta() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_linear_dense() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_linear_sparse() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_prepared_dense() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_constrained_dense() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_typed() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_certified() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_load_session() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_modal() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_buckling() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1644"]
fn issue_1644_pdelta() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_linear_dense() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_linear_sparse() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_prepared_dense() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_constrained_dense() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_typed() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_certified() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_load_session() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_modal() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_buckling() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1645"]
fn issue_1645_pdelta() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::PDelta, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_linear_dense() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Linear, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_linear_sparse() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Linear, true);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_prepared_dense() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::PreparedDense, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Prepared, true);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_constrained_dense() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::ConstrainedDense, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Constrained, true);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_typed() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Typed, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_certified() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Certified, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_load_session() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Session, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_modal() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Modal, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_buckling() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Buckling, false);
}

#[test]
#[ignore = "known wrong result: #1646"]
fn issue_1646_pdelta() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::PDelta, false);
}

