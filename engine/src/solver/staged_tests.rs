use super::*;
use serde_json::{json, Value};

fn settled_slave_residual(dim: usize) {
    let mut failures = Vec::new();
    for _sparse in [false, true] {
        for motion in [0.0, 0.0013, -0.0013] {
            let mut m: Value = serde_json::from_str(if dim == 2 {
                include_str!("../../tests/fixtures/reaction-recovery-2d.json")
            } else {
                include_str!("../../tests/fixtures/reaction-recovery-3d.json")
            })
            .unwrap();
            m["supports"]["0"]["dx"] = json!(motion);
            m["constraints"] = json!([{"type":"equalDOF","masterNode":0,"slaveNode":1,"dofs":(0..if dim==2 {3} else {6}).collect::<Vec<_>>()}]);
            m["stages"] = json!([{"name":"settled master","supportsAdded":[0]}]);
            m["loads"] = json!([]);
            let r = if dim == 2 {
                let input: StagedInput = serde_json::from_value(m).unwrap();
                let full = staged_to_full_solver_input(&input);
                let dofs = DofNumbering::build_2d(&full);
                let stage = build_stage_solver_input(
                    &input,
                    &HashSet::new(),
                    &HashSet::from([0]),
                    &input.stages[0],
                );
                let cs = FreeConstraintSystem::build_2d(&full, &dofs).unwrap();
                let mut u = vec![0.0; dofs.n_total];
                for id in [0, 1] {
                    u[dofs.global_dof(id, 0).unwrap()] = motion;
                }
                let residual = physical_recovery::recover(
                    physical_recovery::StageModel::Plane(&stage, &input.stages[0]),
                    &dofs,
                    &u,
                );
                let recovered = crate::solver::reaction_recovery::RecoveredForces::from_stage(
                    &residual,
                    &dofs,
                    cs.as_ref(),
                );
                json!({"reactions":recovered.reactions_2d(&stage,&dofs,&u,&[]).unwrap(),"constraintForces":recovered.constraint_forces})
            } else {
                let input: StagedInput3D = serde_json::from_value(m).unwrap();
                let full = staged_to_full_solver_input_3d(&input);
                let dofs = DofNumbering::build_3d(&full);
                let stage = build_stage_solver_input_3d(
                    &input,
                    &HashSet::new(),
                    &HashSet::from([0]),
                    &HashSet::new(),
                    &HashSet::new(),
                    &input.stages[0],
                );
                let cs = FreeConstraintSystem::build_3d(&full, &dofs).unwrap();
                let mut u = vec![0.0; dofs.n_total];
                for id in [0, 1] {
                    u[dofs.global_dof(id, 0).unwrap()] = motion;
                }
                let residual = physical_recovery::recover(
                    physical_recovery::StageModel::Space(&stage),
                    &dofs,
                    &u,
                );
                let recovered = crate::solver::reaction_recovery::RecoveredForces::from_stage(
                    &residual,
                    &dofs,
                    cs.as_ref(),
                );
                json!({"reactions":recovered.reactions_3d(&stage,&dofs,&u,&[]).unwrap(),"constraintForces":recovered.constraint_forces})
            };
            let forces = r["constraintForces"]
                .as_array()
                .unwrap()
                .iter()
                .map(|cf| cf["force"].as_f64().unwrap());
            let reactions = r["reactions"].as_array().unwrap().iter().flat_map(|r| {
                r.as_object()
                    .unwrap()
                    .iter()
                    .filter(|(k, _)| k.as_str() != "nodeId")
                    .map(|(_, v)| v.as_f64().unwrap())
            });
            if forces.chain(reactions).any(|f| f != 0.0) {
                failures.push(format!("{dim}D sparse={_sparse} motion={motion}: {r}"));
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn issue_1952_r7_settled_slave_residual_2d() {
    settled_slave_residual(2);
}

#[test]
fn issue_1952_r7_settled_slave_residual_3d() {
    settled_slave_residual(3);
}

fn r14_cached_stabilization(dim: usize, sparse: bool) {
    let models: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/staged-physical-r14.json"
    ))
    .unwrap();
    for spring in [0.0, 1.0] {
        let mut m = models[dim.to_string()].clone();
        m["supports"]["3"] = if dim == 2 {
            json!({"id":3,"nodeId":1,"type":"spring","kz":spring})
        } else {
            json!({"nodeId":1,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kry":spring})
        };
        let motion = m["supports"]["2"]["dry"].as_f64().unwrap();
        let rotation = if dim == 2 { 2 } else { 4 };
        let (dof, cs, residual) = if dim == 2 {
            let input: StagedInput = serde_json::from_value(m.clone()).unwrap();
            let full = staged_to_full_solver_input(&input);
            let dof = DofNumbering::build_2d(&full);
            let cs = FreeConstraintSystem::build_2d(&full, &dof).unwrap();
            let mut uncoupled = full.clone();
            uncoupled.constraints.clear();
            let mut u = vec![0.0; dof.n_total];
            for node in [1, 2] {
                u[dof.global_dof(node, rotation).unwrap()] = motion;
            }
            let cached = if sparse {
                super::super::sparse_assembly::assemble_stiffness_sparse_2d(&uncoupled, &dof).k_full
            } else {
                CscMatrix::from_dense_symmetric_exact(&assemble_2d(&uncoupled, &dof).k, dof.n_total)
            };
            assert!(cached.sym_mat_vec(&u)[dof.global_dof(1, rotation).unwrap()].abs() > 0.0);
            let mut physical = full.clone();
            physical.loads.clear();
            let residual = physical_recovery::recover(
                physical_recovery::StageModel::Plane(&physical, &input.stages[0]),
                &dof,
                &u,
            );
            (dof, cs, residual)
        } else {
            let input: StagedInput3D = serde_json::from_value(m.clone()).unwrap();
            let full = staged_to_full_solver_input_3d(&input);
            let dof = DofNumbering::build_3d(&full);
            let cs = FreeConstraintSystem::build_3d(&full, &dof).unwrap();
            let mut uncoupled = full.clone();
            uncoupled.constraints.clear();
            let mut u = vec![0.0; dof.n_total];
            for node in [1, 2] {
                u[dof.global_dof(node, rotation).unwrap()] = motion;
            }
            let cached = if sparse {
                super::super::sparse_assembly::assemble_stiffness_sparse_3d_parallel(
                    &uncoupled, &dof, true,
                )
                .k_full
                .unwrap()
            } else {
                CscMatrix::from_dense_symmetric_exact(&assemble_3d(&uncoupled, &dof).k, dof.n_total)
            };
            assert!(cached.sym_mat_vec(&u)[dof.global_dof(1, rotation).unwrap()].abs() > 0.0);
            let mut physical = full.clone();
            physical.loads.clear();
            let residual = physical_recovery::recover(
                physical_recovery::StageModel::Space(&physical),
                &dof,
                &u,
            );
            (dof, cs, residual)
        };
        let recovered = super::super::reaction_recovery::RecoveredForces::from_stage(
            &residual,
            &dof,
            cs.as_ref(),
        );
        for force in &recovered.constraint_forces {
            assert_eq!(
                force.force,
                spring * motion,
                "{dim}D sparse={sparse}: {force:?}"
            );
        }
        assert_eq!(
            residual.as_slice()[dof.global_dof(1, rotation).unwrap()],
            spring * motion
        );
        let mut u = vec![0.0; dof.n_total];
        for node in [1, 2] {
            u[dof.global_dof(node, rotation).unwrap()] = motion;
        }
        let reactions = if dim == 2 {
            json!(recovered
                .reactions_2d(&serde_json::from_value(m).unwrap(), &dof, &u, &[])
                .unwrap())
        } else {
            json!(recovered
                .reactions_3d(&serde_json::from_value(m).unwrap(), &dof, &u, &[])
                .unwrap())
        };
        let master = reactions
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["nodeId"] == 2)
            .unwrap();
        assert_eq!(master["my"].as_f64().unwrap(), spring * motion);
    }
}

#[test]
fn r14_cached_stabilization_dense_2d() {
    r14_cached_stabilization(2, false);
}

#[test]
fn r14_cached_stabilization_sparse_2d() {
    r14_cached_stabilization(2, true);
}

#[test]
fn r14_cached_stabilization_dense_3d() {
    r14_cached_stabilization(3, false);
}

#[test]
fn r14_cached_stabilization_sparse_3d() {
    r14_cached_stabilization(3, true);
}
