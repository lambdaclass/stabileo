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
fn issue_1636_linear_dense() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Linear, false);
}

#[test]
fn issue_1636_linear_sparse() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Linear, true);
}

#[test]
fn issue_1636_prepared_dense() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1636_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Prepared, true);
}

#[test]
fn issue_1636_constrained_dense() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1636_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Constrained, true);
}

#[test]
fn issue_1636_typed() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Typed, false);
}

#[test]
fn issue_1636_certified() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Certified, false);
}

#[test]
fn issue_1636_load_session() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Session, false);
}

#[test]
fn issue_1636_modal() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Modal, false);
}

#[test]
fn issue_1636_buckling() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::Buckling, false);
}

#[test]
fn issue_1636_pdelta() {
    check(include_str!("support_rule_models/issue_1636.json"), Path::PDelta, false);
}

#[test]
fn issue_1637_linear_dense() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Linear, false);
}

#[test]
fn issue_1637_linear_sparse() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Linear, true);
}

#[test]
fn issue_1637_prepared_dense() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1637_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Prepared, true);
}

#[test]
fn issue_1637_constrained_dense() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1637_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Constrained, true);
}

#[test]
fn issue_1637_typed() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Typed, false);
}

#[test]
fn issue_1637_certified() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Certified, false);
}

#[test]
fn issue_1637_load_session() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Session, false);
}

#[test]
fn issue_1637_modal() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Modal, false);
}

#[test]
fn issue_1637_buckling() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::Buckling, false);
}

#[test]
fn issue_1637_pdelta() {
    check(include_str!("support_rule_models/issue_1637.json"), Path::PDelta, false);
}

#[test]
fn issue_1638_linear_dense() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Linear, false);
}

#[test]
fn issue_1638_linear_sparse() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Linear, true);
}

#[test]
fn issue_1638_prepared_dense() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1638_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Prepared, true);
}

#[test]
fn issue_1638_constrained_dense() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1638_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Constrained, true);
}

#[test]
fn issue_1638_typed() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Typed, false);
}

#[test]
fn issue_1638_certified() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Certified, false);
}

#[test]
fn issue_1638_load_session() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Session, false);
}

#[test]
fn issue_1638_modal() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Modal, false);
}

#[test]
fn issue_1638_buckling() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::Buckling, false);
}

#[test]
fn issue_1638_pdelta() {
    check(include_str!("support_rule_models/issue_1638.json"), Path::PDelta, false);
}

#[test]
fn issue_1639_linear_dense() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Linear, false);
}

#[test]
fn issue_1639_linear_sparse() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Linear, true);
}

#[test]
fn issue_1639_prepared_dense() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1639_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Prepared, true);
}

#[test]
fn issue_1639_constrained_dense() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1639_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Constrained, true);
}

#[test]
fn issue_1639_typed() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Typed, false);
}

#[test]
fn issue_1639_certified() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Certified, false);
}

#[test]
fn issue_1639_load_session() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Session, false);
}

#[test]
fn issue_1639_modal() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Modal, false);
}

#[test]
fn issue_1639_buckling() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::Buckling, false);
}

#[test]
fn issue_1639_pdelta() {
    check(include_str!("support_rule_models/issue_1639.json"), Path::PDelta, false);
}

#[test]
fn issue_1640_linear_dense() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Linear, false);
}

#[test]
fn issue_1640_linear_sparse() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Linear, true);
}

#[test]
fn issue_1640_prepared_dense() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1640_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Prepared, true);
}

#[test]
fn issue_1640_constrained_dense() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1640_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Constrained, true);
}

#[test]
fn issue_1640_typed() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Typed, false);
}

#[test]
fn issue_1640_certified() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Certified, false);
}

#[test]
fn issue_1640_load_session() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Session, false);
}

#[test]
fn issue_1640_modal() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Modal, false);
}

#[test]
fn issue_1640_buckling() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::Buckling, false);
}

#[test]
fn issue_1640_pdelta() {
    check(include_str!("support_rule_models/issue_1640.json"), Path::PDelta, false);
}

#[test]
fn issue_1641_linear_dense() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Linear, false);
}

#[test]
fn issue_1641_linear_sparse() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Linear, true);
}

#[test]
fn issue_1641_prepared_dense() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1641_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Prepared, true);
}

#[test]
fn issue_1641_constrained_dense() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1641_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Constrained, true);
}

#[test]
fn issue_1641_typed() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Typed, false);
}

#[test]
fn issue_1641_certified() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Certified, false);
}

#[test]
fn issue_1641_load_session() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Session, false);
}

#[test]
fn issue_1641_modal() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Modal, false);
}

#[test]
fn issue_1641_buckling() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::Buckling, false);
}

#[test]
fn issue_1641_pdelta() {
    check(include_str!("support_rule_models/issue_1641.json"), Path::PDelta, false);
}

#[test]
fn issue_1642_linear_dense() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Linear, false);
}

#[test]
fn issue_1642_linear_sparse() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Linear, true);
}

#[test]
fn issue_1642_prepared_dense() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1642_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Prepared, true);
}

#[test]
fn issue_1642_constrained_dense() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1642_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Constrained, true);
}

#[test]
fn issue_1642_typed() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Typed, false);
}

#[test]
fn issue_1642_certified() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Certified, false);
}

#[test]
fn issue_1642_load_session() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Session, false);
}

#[test]
fn issue_1642_modal() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Modal, false);
}

#[test]
fn issue_1642_buckling() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::Buckling, false);
}

#[test]
fn issue_1642_pdelta() {
    check(include_str!("support_rule_models/issue_1642.json"), Path::PDelta, false);
}

#[test]
fn issue_1643_linear_dense() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Linear, false);
}

#[test]
fn issue_1643_linear_sparse() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Linear, true);
}

#[test]
fn issue_1643_prepared_dense() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1643_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Prepared, true);
}

#[test]
fn issue_1643_constrained_dense() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1643_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Constrained, true);
}

#[test]
fn issue_1643_typed() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Typed, false);
}

#[test]
fn issue_1643_certified() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Certified, false);
}

#[test]
fn issue_1643_load_session() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Session, false);
}

#[test]
fn issue_1643_modal() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Modal, false);
}

#[test]
fn issue_1643_buckling() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::Buckling, false);
}

#[test]
fn issue_1643_pdelta() {
    check(include_str!("support_rule_models/issue_1643.json"), Path::PDelta, false);
}

#[test]
fn issue_1644_linear_dense() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Linear, false);
}

#[test]
fn issue_1644_linear_sparse() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Linear, true);
}

#[test]
fn issue_1644_prepared_dense() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1644_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Prepared, true);
}

#[test]
fn issue_1644_constrained_dense() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1644_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Constrained, true);
}

#[test]
fn issue_1644_typed() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Typed, false);
}

#[test]
fn issue_1644_certified() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Certified, false);
}

#[test]
fn issue_1644_load_session() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Session, false);
}

#[test]
fn issue_1644_modal() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Modal, false);
}

#[test]
fn issue_1644_buckling() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::Buckling, false);
}

#[test]
fn issue_1644_pdelta() {
    check(include_str!("support_rule_models/issue_1644.json"), Path::PDelta, false);
}

#[test]
fn issue_1645_linear_dense() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Linear, false);
}

#[test]
fn issue_1645_linear_sparse() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Linear, true);
}

#[test]
fn issue_1645_prepared_dense() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1645_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Prepared, true);
}

#[test]
fn issue_1645_constrained_dense() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1645_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Constrained, true);
}

#[test]
fn issue_1645_typed() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Typed, false);
}

#[test]
fn issue_1645_certified() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Certified, false);
}

#[test]
fn issue_1645_load_session() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Session, false);
}

#[test]
fn issue_1645_modal() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Modal, false);
}

#[test]
fn issue_1645_buckling() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::Buckling, false);
}

#[test]
fn issue_1645_pdelta() {
    check(include_str!("support_rule_models/issue_1645.json"), Path::PDelta, false);
}

#[test]
fn issue_1646_linear_dense() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Linear, false);
}

#[test]
fn issue_1646_linear_sparse() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Linear, true);
}

#[test]
fn issue_1646_prepared_dense() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::PreparedDense, false);
}

#[test]
fn issue_1646_prepared_sparse() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Prepared, true);
}

#[test]
fn issue_1646_constrained_dense() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::ConstrainedDense, false);
}

#[test]
fn issue_1646_constrained_sparse() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Constrained, true);
}

#[test]
fn issue_1646_typed() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Typed, false);
}

#[test]
fn issue_1646_certified() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Certified, false);
}

#[test]
fn issue_1646_load_session() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Session, false);
}

#[test]
fn issue_1646_modal() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Modal, false);
}

#[test]
fn issue_1646_buckling() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::Buckling, false);
}

#[test]
fn issue_1646_pdelta() {
    check(include_str!("support_rule_models/issue_1646.json"), Path::PDelta, false);
}


#[test]
fn free_rotation_spring_and_zero_stiffness_on_restraint_keep_plane_parity() {
    use dedaliano_engine::metamorphic::planes::pull_static;
    let mut s: SolverInput = serde_json::from_str(include_str!("support_rule_models/issue_1637.json")).unwrap();
    let support = s.supports.get_mut("2").unwrap();
    support.kz = support.kx.take();
    support.kx = Some(0.0);
    let mut without = s.clone();
    without.supports.get_mut("2").unwrap().kz = None;
    let degree = dedaliano_engine::solver::kinematic::analyze_kinematics_2d;
    assert_eq!(degree(&s).degree, degree(&without).degree + 1);
    let r = linear::solve_2d(&s).unwrap();
    let tip = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_ne!(tip.ry, 0.0);
    assert_eq!(tip.ux, 0.0);
    let reaction = r.reactions.iter().find(|d| d.node_id == 2).unwrap();
    assert!((reaction.my + s.supports["2"].kz.unwrap() * tip.ry).abs() < 1e-9);
    for plane in Plane::ALL {
        let s3 = embed_2d(&s, plane).unwrap();
        let without3 = embed_2d(&without, plane).unwrap();
        let degree3 = dedaliano_engine::solver::kinematic::analyze_kinematics_3d;
        assert_eq!(degree3(&s3).degree, degree3(&without3).degree + 1);
        let r3 = linear::solve_3d(&s3).unwrap();
        let pulled = pull_static(&s, plane, &r3).unwrap();
        for (node, ux, uz, ry) in pulled.displacements {
            let d = r.displacements.iter().find(|d| d.node_id == node).unwrap();
            for (a, b) in [(ux, d.ux), (uz, d.uz), (ry, d.ry)] {
                assert!((a - b).abs() <= 1e-9 * b.abs().max(1.0), "{plane:?}: {a} vs {b}");
            }
        }
        for (node, rx, rz, my) in pulled.reactions {
            let d = r.reactions.iter().find(|d| d.node_id == node).unwrap();
            for (a, b) in [(rx, d.rx), (rz, d.rz), (my, d.my)] {
                assert!((a - b).abs() <= 1e-9 * b.abs().max(1.0), "{plane:?}: {a} vs {b}");
            }
        }
    }
}

#[test]
fn every_3d_restraint_and_warping_conflict_is_named_and_stays_restrained_in_numbering() {
    let s: SolverInput = serde_json::from_str(include_str!("support_rule_models/issue_1637.json")).unwrap();
    let clean = embed_2d(&s, Plane::XZ).unwrap();
    for (i, name) in ["kx", "ky", "kz", "krx", "kry", "krz", "kw"].iter().enumerate() {
        let mut value = serde_json::to_value(&clean).unwrap();
        value["supports"]["2"]["kx"] = Value::Null;
        value["supports"]["1"][name] = serde_json::json!(1.0);
        value["supports"]["1"]["rw"] = serde_json::json!(true);
        value["sections"]["1"]["cw"] = serde_json::json!(1e-6);
        let s3: SolverInput3D = serde_json::from_value(value).unwrap();
        let dof = DofNumbering::build_3d(&s3);
        assert!(dof.map[&(1, i)] >= dof.n_free);
        let error = linear::solve_3d(&s3).unwrap_err();
        let refusal: Value = serde_json::from_str(&error).unwrap();
        assert_eq!(refusal["structuredDiagnostics"][0]["code"], "conflicting_support_spring");
        assert_eq!(refusal["structuredDiagnostics"][0]["nodeIds"], serde_json::json!([1]));
        assert_eq!(refusal["structuredDiagnostics"][0]["dofIndices"], serde_json::json!([i]));
        assert!(refusal["message"].as_str().unwrap().contains(name));
    }
}

#[test]
fn truss_only_support_conflict_is_refused_in_both_dimensions() {
    let mut value: Value = serde_json::from_str(include_str!("support_rule_models/issue_1637.json")).unwrap();
    for e in value["elements"].as_object_mut().unwrap().values_mut() {
        e["type"] = serde_json::json!("truss");
    }
    let s: SolverInput = serde_json::from_value(value).unwrap();
    assert_eq!(DofNumbering::build_2d(&s).dofs_per_node, 2);
    let s3 = embed_2d(&s, Plane::XZ).unwrap();
    assert_eq!(DofNumbering::build_3d(&s3).dofs_per_node, 3);
    assert_eq!(refused(linear::solve_2d(&s).map(|_| ())), refused(linear::solve_3d(&s3).map(|_| ())));
}

fn inclined_positive_ky(angle: Option<f64>) -> SolverInput {
    let mut s: SolverInput = serde_json::from_str(include_str!("support_rule_models/issue_1637.json")).unwrap();
    let support = s.supports.get_mut("2").unwrap();
    support.support_type = "inclinedRoller".into();
    support.ky = support.kx.take();
    support.angle = angle;
    s
}

#[test]
fn issue_1780_inclined_positive_ky_without_angle_matches_zero_linear() {
    let explicit = linear::solve_2d(&inclined_positive_ky(Some(0.0))).unwrap();
    let implicit = linear::solve_2d(&inclined_positive_ky(None)).unwrap();
    assert_eq!(serde_json::to_value(implicit).unwrap(), serde_json::to_value(explicit).unwrap());
}

#[test]
fn issue_1780_inclined_positive_ky_without_angle_matches_zero_pdelta() {
    let explicit = pdelta::solve_pdelta_2d(&inclined_positive_ky(Some(0.0)), 100, 1e-12).unwrap();
    assert!(explicit.converged);
    let implicit = pdelta::solve_pdelta_2d(&inclined_positive_ky(None), 100, 1e-12).unwrap();
    assert!(implicit.converged);
    assert_eq!(serde_json::to_value(implicit).unwrap(), serde_json::to_value(explicit).unwrap());
}

#[test]
fn inclined_positive_ky_without_angle_matches_zero_sparse_pdelta_with_settlement() {
    let solve = |angle| {
        let mut s = inclined_positive_ky(angle);
        s.supports.get_mut("2").unwrap().dz = s.supports["1"].dz;
        let dofs = DofNumbering::build_2d(&s);
        let cs = constraints::FreeConstraintSystem::build_2d(&s, &dofs).unwrap();
        let r = pdelta::solve_pdelta_2d_on(&s, &dofs, cs, true, 100, 1e-12).unwrap();
        assert!(r.converged);
        serde_json::to_value(r).unwrap()
    };
    assert_eq!(solve(None), solve(Some(0.0)));
}

#[test]
fn inclined_positive_ky_without_angle_matches_zero_constrained_with_settlement() {
    let solve = |angle| {
        let mut s = inclined_positive_ky(angle);
        s.supports.get_mut("2").unwrap().dz = s.supports["1"].dz;
        let constraint = serde_json::from_value(serde_json::json!({
            "type": "equalDOF", "masterNode": 1, "slaveNode": 2, "dofs": [0]
        })).unwrap();
        let c = constraints::ConstrainedInput { solver: s, constraints: vec![constraint] };
        serde_json::to_value(constraints::solve_constrained_2d(&c).unwrap()).unwrap()
    };
    assert_eq!(solve(None), solve(Some(0.0)));
}

#[test]
fn issue_1780_absurd_angle_with_ky_refuses_counter_assembly_rank_disagreement() {
    use dedaliano_engine::solver::{assembly::inclined_rotation_matrix_2d, kinematic::analyze_kinematics_2d};
    let angle = std::f64::consts::TAU * 2.0_f64.powi(52);
    let s = inclined_positive_ky(Some(angle));
    let normal = inclined_rotation_matrix_2d(angle)[1];
    let spring_direction = [0.0, 1.0];
    let determinant = normal[0] * spring_direction[1] - normal[1] * spring_direction[0];
    let assembly_rank = 1 + i32::from(determinant.abs() > 8.0 * f64::EPSILON);
    let kin = analyze_kinematics_2d(&s);
    let base = analyze_kinematics_2d(&inclined_positive_ky(Some(0.0)));
    eprintln!("prepared normal={normal:?}, assembly support rank={assembly_rank}, diagnostic added restraints={}", kin.degree - base.degree);
    assert!(kin.invalid_input.is_some(), "absurd angle was accepted with degree {} and assembly support rank {assembly_rank}", kin.degree);
    assert!(!kin.is_solvable);
    let error = linear::solve_2d(&s).unwrap_err();
    let value: Value = serde_json::from_str(&error).unwrap();
    assert_eq!(value["structuredDiagnostics"][0]["code"], "invalid_support_angle");
    assert_eq!(value["structuredDiagnostics"][0]["nodeIds"], serde_json::json!([2]));
    assert_eq!(value["structuredDiagnostics"][0]["phase"], "input");
    assert!(value["message"].as_str().unwrap().contains("within one turn"));
}

#[test]
fn issue_1780_multi_turn_support_matches_reduced_angle_exactly() {
    use dedaliano_engine::solver::kinematic::analyze_kinematics_2d;
    for kind in ["inclinedRoller", "spring"] {
        for angle in [20.0 * std::f64::consts::PI, -20.0 * std::f64::consts::PI, 20.0 * std::f64::consts::PI + 0.3, -0.3, -f64::EPSILON / 4.0] {
            let mut multi = inclined_positive_ky(Some(angle));
            multi.supports.get_mut("2").unwrap().support_type = kind.into();
            if kind == "inclinedRoller" {
                multi.supports.get_mut("2").unwrap().dz = multi.supports["1"].dz;
            }
            let mut reduced = multi.clone();
            reduced.supports.get_mut("2").unwrap().angle = Some(angle.rem_euclid(std::f64::consts::TAU));
            assert_eq!(serde_json::to_value(analyze_kinematics_2d(&multi)).unwrap(), serde_json::to_value(analyze_kinematics_2d(&reduced)).unwrap());
            assert_eq!(serde_json::to_value(linear::solve_2d(&multi).unwrap()).unwrap(), serde_json::to_value(linear::solve_2d(&reduced).unwrap()).unwrap(), "{kind}, {angle}");
            let dense = |s: &SolverInput| {
                let p = linear::prepare_static_2d_dense_reference(s).unwrap();
                serde_json::to_value(p.solve_loads(&s.loads).unwrap()).unwrap()
            };
            assert_eq!(dense(&multi), dense(&reduced), "dense {kind}, {angle}");
            let sparse = |s: &SolverInput| {
                let dofs = DofNumbering::build_2d(s);
                dedaliano_engine::solver::assembly::assemble_sparse_2d(s, &dofs).k_ff.to_dense_symmetric()
            };
            assert_eq!(sparse(&multi), sparse(&reduced), "sparse {kind}, {angle}");
            assert_eq!(serde_json::to_value(pdelta::solve_pdelta_2d(&multi, 100, 1e-12).unwrap()).unwrap(), serde_json::to_value(pdelta::solve_pdelta_2d(&reduced, 100, 1e-12).unwrap()).unwrap(), "pdelta {kind}, {angle}");
            let constrained = |s: &SolverInput, sparse| {
                let constraint = serde_json::from_value(serde_json::json!({
                    "type": "equalDOF", "masterNode": 1, "slaveNode": 2, "dofs": [0]
                })).unwrap();
                let mut solver = s.clone();
                if sparse {
                    for id in 4..26 {
                        solver.nodes.insert(id.to_string(), SolverNode { id, x: solver.nodes["1"].x + id as f64, z: solver.nodes["1"].z });
                        let mut element = solver.elements["1"].clone();
                        element.id = id;
                        element.node_i = 1;
                        element.node_j = id;
                        solver.elements.insert(id.to_string(), element);
                    }
                }
                let dofs = DofNumbering::build_2d(&solver);
                if sparse { assert!(dofs.n_free >= 64); }
                let c = constraints::ConstrainedInput { solver, constraints: vec![constraint] };
                let result = if sparse { constraints::solve_constrained_2d(&c) } else { constraints::solve_constrained_2d_dense(&c, &dofs) };
                serde_json::to_value(result.unwrap()).unwrap()
            };
            for sparse in [false, true] {
                assert_eq!(constrained(&multi, sparse), constrained(&reduced, sparse), "constrained {kind}, {angle}, sparse={sparse}");
            }
        }
    }
}

#[test]
fn support_orientation_angle_bound_and_non_finite_refusals() {
    use dedaliano_engine::solver::kinematic::{analyze_kinematics_2d, analyze_kinematics_3d};
    for kind in ["inclinedRoller", "spring", "rollerX"] {
        for angle in [1_000_000.0_f64.next_up(), -1_000_000.0_f64.next_up(), f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let mut s = inclined_positive_ky(Some(angle));
            let support = s.supports.get_mut("2").unwrap();
            support.support_type = kind.into();
            if kind == "rollerX" { support.ky = None; }
            let kin = analyze_kinematics_2d(&s);
            assert!(!kin.is_solvable);
            let error = linear::solve_2d(&s).unwrap_err();
            assert_eq!(kin.invalid_input.as_deref(), Some(error.as_str()));
            let value: Value = serde_json::from_str(&error).unwrap();
            assert_eq!(value["structuredDiagnostics"][0]["code"], "invalid_support_angle");
            assert_eq!(value["structuredDiagnostics"][0]["severity"], "error");
            assert!(value["message"].as_str().unwrap().contains("within one turn"));
        }
    }
    for angle in [-1_000_000.0, 1_000_000.0] {
        let mut s = inclined_positive_ky(Some(angle));
        let mut reduced = s.clone();
        reduced.supports.get_mut("2").unwrap().angle = Some(angle.rem_euclid(std::f64::consts::TAU));
        assert_eq!(serde_json::to_value(linear::solve_2d(&s).unwrap()).unwrap(), serde_json::to_value(linear::solve_2d(&reduced).unwrap()).unwrap());
        s.supports.get_mut("2").unwrap().angle = None;
        s.supports.get_mut("2").unwrap().ky = None;
        s.supports.get_mut("2").unwrap().support_type = "rollerX".into();
        for normal in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            for component in ["normalX", "normalY", "normalZ"] {
                let mut s3 = embed_2d(&s, Plane::XZ).unwrap();
                let support = s3.supports.get_mut("2").unwrap();
                support.is_inclined = Some(true);
                support.normal_x = Some(0.0);
                support.normal_y = Some(0.0);
                support.normal_z = Some(1.0);
                match component {
                    "normalX" => support.normal_x = Some(normal),
                    "normalY" => support.normal_y = Some(normal),
                    _ => support.normal_z = Some(normal),
                }
                let error = linear::solve_3d(&s3).unwrap_err();
                assert!(error.contains("must be finite"), "{error}");
                let kin = analyze_kinematics_3d(&s3);
                assert!(!kin.is_solvable);
                assert_eq!(kin.invalid_input.as_deref(), Some(error.as_str()));
            }
        }
    }
}
