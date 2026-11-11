//! Gate: a model with constraints AND curved beams must actually analyze the
//! curved members. `solve_3d` used to delegate to the constrained solver
//! before `prepare_static_3d` — the only place curved beams were expanded —
//! so a constrained model silently analyzed without the curved members
//! (they live in a separate list, not in `elements`, so the model had no
//! members at all → spurious mechanism/singularity).

use crate::common;

use common::make_3d_input;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 2e-4;

fn fixed() -> Vec<bool> {
    vec![true, true, true, true, true, true]
}

/// Semicircular arch, fixed at both springing nodes, downward load at the
/// crown — modeled as ONE curved beam, plus a trivial EqualDOF constraint so
/// the solve takes the constrained path.
fn arch_with_constraint() -> SolverInput3D {
    let mut input = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0),
            (2, 5.0, 0.0, 5.0),
            (3, 10.0, 0.0, 0.0),
            (4, 0.0, 5.0, 0.0), // free node for the constraint
        ],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1)],
        vec![(1, fixed()), (3, fixed())],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    // Replace the two straight chords with the single curved beam definition.
    input.elements.clear();
    input.curved_beams = vec![CurvedBeamInput {
        node_start: 1, node_mid: 2, node_end: 3,
        material_id: 1, section_id: 1,
        num_segments: 10, hinge_start: false, hinge_end: false,
    }];
    // Any constraint forces the constrained path. Tie ALL DOFs so the free node
    // inherits full stiffness through the link (a partial tie would leave its
    // untied DOFs without stiffness — singular, and not what is being tested).
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2, slave_node: 4, dofs: vec![0, 1, 2, 3, 4, 5],
    }));
    input
}

#[test]
fn constrained_solve_expands_curved_beams() {
    let res = linear::solve_3d(&arch_with_constraint())
        .expect("constrained solve with a curved beam must succeed");
    // The crown (node 2, snapped into the expanded chain) deflects downward.
    let crown = res.displacements.iter().find(|d| d.node_id == 2).expect("crown displacement");
    assert!(crown.uz < 0.0, "crown must deflect downward, got {}", crown.uz);
    assert!(crown.uz.is_finite(), "crown displacement must be finite");
    // Reactions equilibrate the applied 10 kN.
    let sum_fz: f64 = res.reactions.iter().map(|r| r.fz).sum();
    assert!((sum_fz - 10.0).abs() < 1e-6, "sumFz={sum_fz}");
}

#[test]
fn buckling_818_curved_constraint_certificates_expand_the_same_model() {
    use dedaliano_engine::certify::buckling::*;
    use dedaliano_engine::solver::buckling::solve_buckling_3d;
    for generated_master in [false,true] {
        let mut input = arch_with_constraint();
        input.supports.insert("4".into(),serde_json::from_value(serde_json::json!({"nodeId":4,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":1000,"ky":1000,"kz":1000})).unwrap());
        input.constraints = vec![Constraint::RigidLink(RigidLinkConstraint {
            master_node: if generated_master { 5 } else { 2 }, slave_node: 4, dofs: (0..6).collect(),
        })];
        let expanded = linear::expand_curved_beams_3d(&input);
        let raw = solve_buckling_3d(&input,1).unwrap();
        let reference = certify_buckling_result_3d(&expanded,raw.clone()).unwrap();
        assert!(reference.certificate.is_certified(),"{:?}",reference.certificate);
        let supplied = certify_buckling_result_3d(&input,raw.clone()).unwrap();
        assert!(supplied.certificate.is_certified(),"{:?}",supplied.certificate);
        assert_eq!(serde_json::to_value(&supplied).unwrap(),serde_json::to_value(&reference).unwrap());
        assert!(certify_buckling_3d(&input,1).unwrap().certificate.is_certified());
        assert!(buckling_certificate_3d(&input,1).unwrap().is_certified());
        let json = serde_json::to_string(&input).unwrap();
        let out: serde_json::Value = serde_json::from_str(&dedaliano_engine::certify_buckling_3d(&json,1).unwrap()).unwrap();
        assert_eq!(out["certificate"]["status"],"certified");
        let supplied_json = dedaliano_engine::certify_buckling_result_3d(&json,&serde_json::to_string(&raw).unwrap()).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&supplied_json).unwrap(),out);
    }
}
