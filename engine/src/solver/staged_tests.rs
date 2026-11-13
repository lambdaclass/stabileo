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
                json!({"reactions":recovered.reactions_2d(&dofs,&crate::solver::reaction_recovery::GlobalDisplacements::from_global(&u),&[]).unwrap(),"constraintForces":recovered.constraint_forces})
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
                json!({"reactions":recovered.reactions_3d(&dofs,&crate::solver::reaction_recovery::GlobalDisplacements::from_global(&u),&[]).unwrap(),"constraintForces":recovered.constraint_forces})
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
                .reactions_2d(&dof, &crate::solver::reaction_recovery::GlobalDisplacements::from_global(&u), &[])
                .unwrap())
        } else {
            json!(recovered
                .reactions_3d(&dof, &crate::solver::reaction_recovery::GlobalDisplacements::from_global(&u), &[])
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

fn r17_recovery(dim: usize, empty: bool) {
    for sign in [-1.0, 0.0, 1.0] {
        for tied in [false, true] {
            let mut m: Value = serde_json::from_str(if dim == 2 {
                include_str!("../../tests/fixtures/reaction-recovery-2d.json")
            } else {
                include_str!("../../tests/fixtures/reaction-recovery-3d.json")
            }).unwrap();
            m["elements"]["1"][if dim == 2 { "hingeEnd" } else { "releaseMyEnd" }] = json!(true);
            m["loads"][0]["data"]["fz"] = json!(0.0);
            m["loads"][0]["data"]["my"] = json!(sign * 2.0);
            if empty { m["elements"] = json!({}); }
            if tied {
                m["constraints"] = json!([{"type":"equalDOF","masterNode":0,"slaveNode":1,"dofs":(0..if dim == 2 {3} else {6}).collect::<Vec<_>>()}]);
            }
            m["stages"] = json!([{"name":"recovery","elementsAdded":[1],"supportsAdded":[0],"loadIndices":[0]}]);
            let result = if dim == 2 {
                let input: StagedInput = serde_json::from_value(m).unwrap();
                let model = staged_to_full_solver_input(&input);
                let dofs = DofNumbering::build_2d(&model);
                let cs = FreeConstraintSystem::build_2d(&model, &dofs).unwrap();
                let u = vec![0.0; dofs.n_total];
                let residual = physical_recovery::recover(physical_recovery::StageModel::Plane(&model, &input.stages[0]), &dofs, &u);
                json!(build_results_from_u(&SolverDisplacements::new(&u), &dofs, &model, &residual, cs.as_ref(), &mut StageRecoveryHistory::default(), &[]).unwrap())
            } else {
                let input: StagedInput3D = serde_json::from_value(m).unwrap();
                let model = staged_to_full_solver_input_3d(&input);
                let dofs = DofNumbering::build_3d(&model);
                let cs = FreeConstraintSystem::build_3d(&model, &dofs).unwrap();
                let u = vec![0.0; dofs.n_total];
                let residual = physical_recovery::recover(physical_recovery::StageModel::Space(&model), &dofs, &u);
                json!(build_results_from_u_3d(&SolverDisplacements::new(&u), &dofs, &model, &residual, cs.as_ref(), &mut StageRecoveryHistory::default()).unwrap())
            };
            let unavailable = empty || (!tied && sign != 0.0);
            let warned = result["structuredDiagnostics"].as_array().into_iter().flatten().any(|d| d["code"] == "result_quantity_unavailable");
            assert_eq!(warned, unavailable, "{dim}D empty={empty} tied={tied} sign={sign}: {result}");
            if unavailable {
                for field in ["reactions", "elementForces", "constraintForces", "plateStresses", "quadStresses", "quadNodalStresses"] {
                    assert!(result[field].as_array().is_none_or(Vec::is_empty), "{field}: {result}");
                }
            } else {
                assert!(!result["reactions"].as_array().unwrap().is_empty());
            }
        }
    }
}

#[test]
fn r17_loaded_released_rotation_recovery_2d() { r17_recovery(2, false); }
#[test]
fn r17_loaded_released_rotation_recovery_3d() { r17_recovery(3, false); }
#[test]
fn r17_stiffness_free_quantities_2d() { r17_recovery(2, true); }
#[test]
fn r17_stiffness_free_quantities_3d() { r17_recovery(3, true); }

fn r17_residual_boundary(dim: usize) {
    for relative in [0.0, 0.5e-6, 2.0e-6] {
        let m: Value = serde_json::from_str(if dim == 2 {
            include_str!("../../tests/fixtures/reaction-recovery-2d.json")
        } else {
            include_str!("../../tests/fixtures/reaction-recovery-3d.json")
        }).unwrap();
        let result = if dim == 2 {
            let model: SolverInput = serde_json::from_value(m).unwrap();
            let dofs = DofNumbering::build_2d(&model);
            let solved = super::super::linear::solve_2d(&model).unwrap();
            let mut u = vec![0.0; dofs.n_total];
            for d in solved.displacements {
                for (k,v) in [d.ux,d.uz,d.ry].into_iter().enumerate() {
                    u[dofs.global_dof(d.node_id,k).unwrap()] = v * (1.0 + relative);
                }
            }
            let stage = serde_json::from_value(json!({"name":"boundary"})).unwrap();
            let residual = physical_recovery::recover(physical_recovery::StageModel::Plane(&model,&stage), &dofs, &u);
            json!(build_results_from_u(&SolverDisplacements::new(&u),&dofs,&model,&residual,None,&mut StageRecoveryHistory::default(),&[]).unwrap())
        } else {
            let model = serde_json::from_value::<crate::types::units::ElasticInput3D>(m).unwrap().into_legacy();
            let dofs = DofNumbering::build_3d(&model);
            let solved = super::super::linear::solve_3d(&model).unwrap();
            let mut u = dofs.displacement_vector_3d(&solved.displacements);
            for v in &mut u { *v *= 1.0 + relative; }
            let residual = physical_recovery::recover(physical_recovery::StageModel::Space(&model), &dofs, &u);
            json!(build_results_from_u_3d(&SolverDisplacements::new(&u),&dofs,&model,&residual,None,&mut StageRecoveryHistory::default()).unwrap())
        };
        let warned = result["structuredDiagnostics"].as_array().into_iter().flatten().any(|d| d["code"] == "result_quantity_unavailable");
        assert_eq!(warned, relative >= 1e-6, "{dim}D relative={relative}: {result}");
        assert_eq!(result["reactions"].as_array().unwrap().is_empty(), warned);
        assert_eq!(result["elementForces"].as_array().unwrap().is_empty(), warned);
    }
}

#[test]
fn r17_residual_boundary_2d() { r17_residual_boundary(2); }
#[test]
fn r17_residual_boundary_3d() { r17_residual_boundary(3); }

#[test]
fn staged_r20_inclined_spring_uses_global_displacements() {
    use serde_json::json;
    for sign in [-1.0, 1.0] {
        for scale in [0.0, 1.0] {
            let model: SolverInput = serde_json::from_value(json!({
                "nodes":{"1":{"id":1,"x":0.0,"z":0.0}},
                "materials":{},"sections":{},"elements":{},
                "supports":{"1":{"id":1,"nodeId":1,"type":"inclinedRoller","angle":sign*std::f64::consts::FRAC_PI_4,"kx":2.0,"ky":6.0}},
                "loads":[{"type":"nodal","data":{"nodeId":1,"fx":2.0*scale,"fz":-sign*2.0*scale,"my":0.0}}]
            })).unwrap();
            let dofs = DofNumbering::build_2d(&model);
            let asm = super::super::assembly::without_artificial_stiffness(|| assemble_2d(&model, &dofs));
            let mut u = vec![0.0; dofs.n_total];
            let it = &asm.inclined_transforms_2d[0];
            u[it.dofs[0]] = (it.r[0][0] * 0.5 + it.r[0][1] * -sign * 0.5) * scale;
            u[it.dofs[1]] = (it.r[1][0] * 0.5 + it.r[1][1] * -sign * 0.5) * scale;
            let stage: ConstructionStage = serde_json::from_value(json!({"name":"inclined","supportsAdded":[1],"loadIndices":[0]})).unwrap();
            let residual = physical_recovery::recover(physical_recovery::StageModel::Plane(&model, &stage), &dofs, &u);
            let result = build_results_from_u(&SolverDisplacements::new(&u), &dofs, &model, &residual, None, &mut StageRecoveryHistory::default(), &asm.inclined_transforms_2d).unwrap();
            assert!(!result.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::ResultQuantityUnavailable), "{:?}", result);
            assert_eq!(result.reactions.len(), 1);
            assert!((result.reactions[0].rx + 2.0 * scale).abs() < 1e-12);
            assert!((result.reactions[0].rz - sign * 2.0 * scale).abs() < 1e-12);
            assert!((result.displacements[0].ux - 0.5 * scale).abs() < 1e-12);
            assert!((result.displacements[0].uz + sign * 0.5 * scale).abs() < 1e-12);
        }
    }
}

#[test]
fn staged_r20_spatial_springs_keep_global_components() {
    use serde_json::json;
    for scale in [-1.0, 0.0, 1.0] {
        let model: SolverInput3D = serde_json::from_value(json!({
            "nodes":{"1":{"id":1,"x":0.0,"y":0.0,"z":0.0}},
            "materials":{},"sections":{},"elements":{},
            "supports":{"1":{"nodeId":1,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":2.0,"ky":4.0,"kz":6.0}},
            "loads":[{"type":"nodal","data":{"nodeId":1,"fx":scale,"fy":4.0*scale,"fz":9.0*scale,"mx":0.0,"my":0.0,"mz":0.0}}]
        })).unwrap();
        let dofs = DofNumbering::build_3d(&model);
        let mut u = vec![0.0; dofs.n_total];
        for (i, value) in [0.5, 1.0, 1.5].into_iter().enumerate() { u[dofs.map[&(1,i)]] = value * scale; }
        let residual = physical_recovery::recover(physical_recovery::StageModel::Space(&model), &dofs, &u);
        let result = build_results_from_u_3d(&SolverDisplacements::new(&u), &dofs, &model, &residual, None, &mut StageRecoveryHistory::default()).unwrap();
        assert!(!result.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::ResultQuantityUnavailable), "{:?}", result);
        assert_eq!(result.reactions.len(), 1);
        assert!((result.reactions[0].fx + scale).abs() < 1e-12);
        assert!((result.reactions[0].fy + 4.0 * scale).abs() < 1e-12);
        assert!((result.reactions[0].fz + 9.0 * scale).abs() < 1e-12);
    }
}

#[test]
fn staged_r20_spatial_inclined_spring_reactions_use_global_displacements() {
    use serde_json::json;
    for scale in [-1.0, 0.0, 1.0] {
        let model: SolverInput3D = serde_json::from_value(json!({
            "nodes":{"1":{"id":1,"x":0.0,"y":0.0,"z":0.0}},
            "materials":{},"sections":{},"elements":{},
            "supports":{"1":{"nodeId":1,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":2.0,"ky":4.0,"kz":8.0,"isInclined":true,"normalX":1.0,"normalY":1.0,"normalZ":0.0}},
            "loads":[{"type":"nodal","data":{"nodeId":1,"fx":1.5*scale,"fy":-1.5*scale,"fz":2.0*scale,"mx":0.0,"my":0.0,"mz":0.0}}]
        })).unwrap();
        let dofs = DofNumbering::build_3d(&model);
        let asm = super::super::assembly::without_artificial_stiffness(|| assemble_3d(&model, &dofs));
        let mut u = vec![0.0; dofs.n_total];
        let it = &asm.inclined_transforms[0];
        for i in 0..3 {
            u[it.dofs[i]] = (it.r[i][0] * 0.5 - it.r[i][1] * 0.5 + it.r[i][2] * 0.25) * scale;
        }
        let residual = physical_recovery::recover(physical_recovery::StageModel::Space(&model), &dofs, &u);
        let recovered = super::super::reaction_recovery::RecoveredForces::from_stage(&residual, &dofs, None);
        let solver_u = SolverDisplacements::new(&u);
        let global_u = solver_u.to_global_3d(&asm.inclined_transforms);
        let reactions = recovered.reactions_3d(&dofs, &global_u, &asm.inclined_transforms).unwrap();
        assert_eq!(reactions.len(), 1);
        for (value, expected) in [reactions[0].fx, reactions[0].fy, reactions[0].fz].into_iter().zip([-1.5,1.5,-2.0]) {
            assert!((value - expected * scale).abs() < 1e-12, "{reactions:?}");
        }
    }
}

#[test]
fn staged_r20_uncertified_state_cannot_certify_unloaded_removal() {
    let assert_refusal = |error: String| {
        let payload: Value = serde_json::from_str(&error).unwrap();
        let diagnostics: Vec<StructuredDiagnostic> =
            serde_json::from_value(payload["structuredDiagnostics"].clone()).unwrap();
        assert_eq!(diagnostics.len(), 1);
        let diagnostic = &diagnostics[0];
        assert_eq!(diagnostic.code, DiagnosticCode::ResultQuantityUnavailable);
        assert_eq!(diagnostic.severity, Severity::Error);
        assert_eq!(diagnostic.phase.as_deref(), Some("stageResults"));
        assert_eq!(diagnostic.element_ids, vec![1]);
    };
    let mut history = StageRecoveryHistory::default();
    history.record_member_forces([(1, false)].into_iter(), true);
    assert!(history.check_member_removal(&[1]).is_ok());
    history.record_member_forces([(1, false)].into_iter(), false);
    let error = history.check_member_removal(&[1]).unwrap_err();
    assert_refusal(error);
    history.unavailable = true;
    history.record_member_forces([(1, false)].into_iter(), true);
    let error = history.check_member_removal(&[1]).unwrap_err();
    assert_refusal(error);
}

#[test]
#[ignore = "known wrong result: #1952"]
fn staged_r23_spatial_inclined_recovery_uses_assembled_frame() {
    use serde_json::json;
    for scale in [-1.0, 0.0, 1.0] {
        let model: SolverInput3D = serde_json::from_value(json!({
            "nodes":{"1":{"id":1,"x":0.0,"y":0.0,"z":0.0}},
            "materials":{},"sections":{},"elements":{},
            "supports":{"1":{"nodeId":1,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":2.0,"ky":4.0,"kz":8.0,"isInclined":true,"normalX":1.0,"normalY":1.0,"normalZ":0.0}},
            "loads":[{"type":"nodal","data":{"nodeId":1,"fx":1.5*scale,"fy":-1.5*scale,"fz":2.0*scale,"mx":0.0,"my":0.0,"mz":0.0}}]
        })).unwrap();
        let dofs = DofNumbering::build_3d(&model);
        let asm = super::super::assembly::without_artificial_stiffness(|| assemble_3d(&model, &dofs));
        let mut u = vec![0.0; dofs.n_total];
        let it = &asm.inclined_transforms[0];
        for i in 0..3 {
            u[it.dofs[i]] = (it.r[i][0] * 0.5 - it.r[i][1] * 0.5 + it.r[i][2] * 0.25) * scale;
        }
        let residual = physical_recovery::recover(physical_recovery::StageModel::Space(&model), &dofs, &u);
        let result = build_results_from_u_3d(&SolverDisplacements::new(&u), &dofs, &model, &residual, None, &mut StageRecoveryHistory::default()).unwrap();
        let displacement = &result.displacements[0];
        for (value, expected) in [displacement.ux, displacement.uy, displacement.uz].into_iter().zip([0.5,-0.5,0.25]) {
            assert!((value - expected * scale).abs() < 1e-12, "{result:?}");
        }
        let reactions = result.reactions;
        assert_eq!(reactions.len(), 1);
        for (value, expected) in [reactions[0].fx, reactions[0].fy, reactions[0].fz].into_iter().zip([-1.5,1.5,-2.0]) {
            assert!((value - expected * scale).abs() < 1e-12, "{reactions:?}");
        }
    }
}


#[test]
#[ignore = "known wrong result: #1952"]
fn staged_r23_determinacy_requires_every_equation_and_prescribed_value() {
    let cases: Vec<Value> = serde_json::from_str(include_str!("../../tests/fixtures/staged-determined-r23.json")).unwrap();
    for base in cases {
        let dim = base["dim"].as_u64().unwrap();
        for partial in [false, true] {
            for corrupt in [false, true] {
                let mut m = base["model"].clone();
                if partial { m["constraints"] = json!([]); }
                let result = if dim == 2 {
                    let input: StagedInput = serde_json::from_value(m).unwrap();
                    let full = staged_to_full_solver_input(&input);
                    let dofs = DofNumbering::build_2d(&full);
                    let model = build_stage_solver_input(&input, &HashSet::new(), &HashSet::from([0]), &input.stages[0]);
                    let cs = FreeConstraintSystem::build_2d(&model, &dofs).unwrap();
                    let mut u = vec![0.0; dofs.n_total];
                    if corrupt { u[dofs.global_dof(1, 0).unwrap()] = 1.0; }
                    let residual = physical_recovery::recover(physical_recovery::StageModel::Plane(&model, &input.stages[0]), &dofs, &u);
                    json!(build_results_from_u(&SolverDisplacements::new(&u), &dofs, &model, &residual, cs.as_ref(), &mut StageRecoveryHistory::default(), &[]).unwrap())
                } else {
                    let input: StagedInput3D = serde_json::from_value(m).unwrap();
                    let full = staged_to_full_solver_input_3d(&input);
                    let dofs = DofNumbering::build_3d(&full);
                    let model = build_stage_solver_input_3d(&input, &HashSet::new(), &HashSet::from([0]), &HashSet::new(), &HashSet::new(), &input.stages[0]);
                    let cs = FreeConstraintSystem::build_3d(&model, &dofs).unwrap();
                    let mut u = vec![0.0; dofs.n_total];
                    if corrupt { u[dofs.global_dof(1, 0).unwrap()] = 1.0; }
                    let residual = physical_recovery::recover(physical_recovery::StageModel::Space(&model), &dofs, &u);
                    json!(build_results_from_u_3d(&SolverDisplacements::new(&u), &dofs, &model, &residual, cs.as_ref(), &mut StageRecoveryHistory::default()).unwrap())
                };
                let unavailable = result["structuredDiagnostics"].as_array().into_iter().flatten().any(|d| d["code"] == "result_quantity_unavailable");
                assert_eq!(unavailable, partial || corrupt, "dim={dim} partial={partial} corrupt={corrupt}: {result}");
            }
        }
    }
}
