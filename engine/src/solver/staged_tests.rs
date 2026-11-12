use super::*;
use serde_json::{json, Value};

fn settled_slave_residual(dim: usize) {
    let mut failures = Vec::new();
    for sparse in [false, true] {
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
                let residual = crate::solver::assembly::without_artificial_stiffness(|| {
                    if sparse {
                        let a = assemble_staged_2d_triplets(
                            &stage,
                            &dofs,
                            &input.stages[0],
                        );
                        let k = CscMatrix::from_triplets(dofs.n_total, &a.rows, &a.cols, &a.vals);
                        compute_stage_reactions_sparse(
                            &k,
                            &a.f,
                            dofs.n_free,
                            dofs.n_total - dofs.n_free,
                            &u,
                        )
                    } else {
                        let a = assemble_staged_2d(
                            &stage,
                            &dofs,
                            &input.stages[0],
                        );
                        compute_stage_reactions_vec(
                            &a,
                            dofs.n_total,
                            dofs.n_free,
                            dofs.n_total - dofs.n_free,
                            &u,
                            &u[dofs.n_free..],
                        )
                    }
                });
                let recovered = crate::solver::reaction_recovery::RecoveredForces::from_stage(
                    &PhysicalStageResidual(residual),
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
                let residual = crate::solver::assembly::without_artificial_stiffness(|| {
                    if sparse {
                        let a = assemble_staged_3d_triplets(&stage, &dofs);
                        let k = CscMatrix::from_triplets(dofs.n_total, &a.rows, &a.cols, &a.vals);
                        compute_stage_reactions_sparse(
                            &k,
                            &a.f,
                            dofs.n_free,
                            dofs.n_total - dofs.n_free,
                            &u,
                        )
                    } else {
                        let a = assemble_3d(&stage, &dofs);
                        compute_stage_reactions_vec(
                            &a,
                            dofs.n_total,
                            dofs.n_free,
                            dofs.n_total - dofs.n_free,
                            &u,
                            &u[dofs.n_free..],
                        )
                    }
                });
                let recovered = crate::solver::reaction_recovery::RecoveredForces::from_stage(
                    &PhysicalStageResidual(residual),
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
                failures.push(format!("{dim}D sparse={sparse} motion={motion}: {r}"));
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
