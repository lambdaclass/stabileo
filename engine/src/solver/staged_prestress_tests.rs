use super::*;

fn model(angle: Option<f64>) -> SolverInput {
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "z": 3.0}},
        "materials": {"1": {"id": 1, "e": 10000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 0.001}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "2": {"id": 2, "nodeId": 2, "type": if angle.is_some() { "inclinedRoller" } else { "rollerZ" }, "angle": angle}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.25, "fz": -0.5, "my": 0.125}}]
    })).unwrap()
}

fn stage(profile: TendonProfile, force: f64) -> ConstructionStage {
    ConstructionStage {
        name: "prestress".into(),
        elements_added: vec![1],
        elements_removed: vec![],
        supports_added: vec![1, 2],
        supports_removed: vec![],
        load_indices: vec![0],
        prestress_loads: vec![PrestressLoad {
            element_id: 1,
            force,
            eccentricity_i: 0.1,
            eccentricity_j: 0.2,
            profile,
            mu: None,
            kappa: None,
        }],
    }
}

fn equivalent(input: &SolverInput, stage: &ConstructionStage) -> SolverInput {
    let mut expected = input.clone();
    let ps = &stage.prestress_loads[0];
    let shear = match ps.profile {
        TendonProfile::Straight => 0.0,
        TendonProfile::Parabolic { e_mid } => 4.0 * ps.force * (e_mid - 0.15) / 5.0,
        TendonProfile::Harped { e_harp } => 2.0 * ps.force * (e_harp - 0.15) / 5.0,
    };
    let moment = match ps.profile {
        TendonProfile::Straight => 0.0,
        TendonProfile::Parabolic { .. } => shear * 5.0 / 6.0,
        TendonProfile::Harped { .. } => shear * 5.0 / 4.0,
    };
    for (node_id, axial, my) in [
        (1, -ps.force, moment + ps.force * 0.1),
        (2, ps.force, -moment - ps.force * 0.2),
    ] {
        expected.loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id,
            fx: 0.8 * axial - 0.6 * shear,
            fz: 0.6 * axial + 0.8 * shear,
            my,
        }));
    }
    expected
}

fn close(actual: &[f64], expected: &[f64]) {
    assert_eq!(actual.len(), expected.len());
    for (a, b) in actual.iter().zip(expected) {
        assert!(a.is_finite() && b.is_finite());
        assert!(
            (a - b).abs() <= 1e-10 * b.abs().max(1.0),
            "actual={a}, expected={b}"
        );
    }
}

fn check(sparse: bool) {
    for angle in [None, Some(0.0), Some(30.0), Some(-45.0), Some(90.0)] {
        for force in [0.0, 1.0] {
            for profile in [
                TendonProfile::Straight,
                TendonProfile::Parabolic { e_mid: 0.3 },
                TendonProfile::Harped { e_harp: 0.3 },
            ] {
                let input = model(angle);
                let stage = stage(profile, force);
                let expected_input = equivalent(&input, &stage);
                let dof = DofNumbering::build_2d(&input);
                let expected_asm = super::super::assembly::without_artificial_stiffness(|| {
                    assemble_2d(&expected_input, &dof)
                });
                let (k, f) = if sparse {
                    let asm = assemble_staged_2d_triplets(&input, &dof, &stage);
                    (
                        CscMatrix::from_triplets(dof.n_total, &asm.rows, &asm.cols, &asm.vals)
                            .to_dense_symmetric(),
                        asm.f,
                    )
                } else {
                    let asm = assemble_staged_2d(&input, &dof, &stage);
                    (asm.k, asm.f)
                };
                close(&f, &expected_asm.f);
                close(&k, &expected_asm.k);
                let free: Vec<_> = (0..dof.n_free).collect();
                let mut kff = extract_submatrix(&k, dof.n_total, &free, &free);
                let uf = cholesky_solve(&mut kff, &f[..dof.n_free], dof.n_free).unwrap();
                let mut u = vec![0.0; dof.n_total];
                u[..dof.n_free].copy_from_slice(&uf);
                let mut r = mat_vec(&k, &u, dof.n_total);
                for (r, f) in r.iter_mut().zip(&f) {
                    *r -= f;
                }
                for it in &expected_asm.inclined_transforms_2d {
                    super::super::assembly::reverse_inclined_transform_2d(&mut u, &it.dofs, &it.r);
                    super::super::assembly::reverse_inclined_transform_2d(&mut r, &it.dofs, &it.r);
                }
                let expected = super::super::linear::solve_2d(&expected_input).unwrap();
                for d in expected.displacements {
                    close(
                        &[
                            u[dof.map[&(d.node_id, 0)]],
                            u[dof.map[&(d.node_id, 1)]],
                            u[dof.map[&(d.node_id, 2)]],
                        ],
                        &[d.ux, d.uz, d.ry],
                    );
                }
                for reaction in expected.reactions {
                    close(
                        &[
                            r[dof.map[&(reaction.node_id, 0)]],
                            r[dof.map[&(reaction.node_id, 1)]],
                            r[dof.map[&(reaction.node_id, 2)]],
                        ],
                        &[reaction.rx, reaction.rz, reaction.my],
                    );
                }
            }
        }
    }
}

#[test]
fn staged_prestress_inclined_dense_matches_regular_linear_equivalent_loads() {
    check(false);
}

#[test]
fn staged_prestress_inclined_sparse_matches_regular_linear_equivalent_loads() {
    check(true);
}


#[test]
fn staged_review_numeric_nonfinite_solutions_are_refused() {
    let input = model(None);
    let input3: SolverInput3D=serde_json::from_value(serde_json::json!({
        "nodes":{"1":{"id":1,"x":0.0,"y":0.0,"z":0.0},"2":{"id":2,"x":4.0,"y":0.0,"z":0.0}},
        "materials":{"1":{"id":1,"e":10000.0,"nu":0.3}},
        "sections":{"1":{"id":1,"a":0.01,"iy":0.001,"iz":0.002,"j":0.003}},
        "elements":{"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
        "supports":{"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},"loads":[]
    })).unwrap();
    for (two_d, dof, connected) in [
        (
            true,
            DofNumbering::build_2d(&input),
            connected_nodes_2d(&input),
        ),
        (
            false,
            DofNumbering::build_3d(&input3),
            connected_nodes_3d(&input3),
        ),
    ] {
        let nf = dof.n_free;
        for sparse in [false, true] {
            for load in [1.0, f64::NAN, f64::INFINITY, 1e308] {
                let mut dense = vec![0.0; nf * nf];
                for i in 0..nf {
                    dense[i * nf + i] = 1e-8;
                }
                let k = CscMatrix::from_dense_symmetric(&dense, nf);
                let f = vec![load; nf];
                let result = solve_stage_free(
                    &k,
                    &dof,
                    None,
                    two_d,
                    &connected,
                    &[],
                    &super::super::stability::ReleasedRotations::default(),
                    &f,
                    &f,
                    &f,
                    &[],
                    &[],
                    sparse,
                    &mut None,
                    &mut None,
                );
                if load == 1.0 {
                    assert!(result.unwrap().iter().all(|u| u.is_finite()));
                } else {
                    assert!(
                        result.is_err(),
                        "two_d={two_d}, sparse={sparse}, load={load}: {result:?}"
                    );
                }
            }
        }
    }
}

fn round4_reaction_check(prestress_only: bool) {
    for angle in [None, Some(0.0), Some(30.0), Some(-45.0), Some(90.0)] {
        for force in [0.0, 1.0] {
            for profile in [
                TendonProfile::Straight,
                TendonProfile::Parabolic { e_mid: 0.3 },
                TendonProfile::Harped { e_harp: 0.3 },
            ] {
                let mut input = model(angle);
                if prestress_only {
                    input.loads.clear();
                }
                let stage = stage(profile, force);
                let dof = DofNumbering::build_2d(&input);
                let sparse = assemble_staged_2d_triplets(&input, &dof, &stage);
                let dense = assemble_staged_2d(&input, &dof, &stage);
                let k_full =
                    CscMatrix::from_triplets(dof.n_total, &sparse.rows, &sparse.cols, &sparse.vals);
                let free: Vec<_> = (0..dof.n_free).collect();
                let mut kff = extract_submatrix(&dense.k, dof.n_total, &free, &free);
                let uf = cholesky_solve(&mut kff, &dense.f[..dof.n_free], dof.n_free).unwrap();
                let mut u = vec![0.0; dof.n_total];
                u[..dof.n_free].copy_from_slice(&uf);
                let r = sparse.cumulative_reactions(&k_full, &input, &stage, &dof, &u);
                let expected = compute_stage_reactions_vec(
                    &dense,
                    dof.n_total,
                    dof.n_free,
                    dof.n_total - dof.n_free,
                    &u,
                    &vec![0.0; dof.n_total - dof.n_free],
                );
                close(&r, &expected);
                let independent = equivalent(&input, &stage);
                let asm = super::super::assembly::without_artificial_stiffness(|| {
                    assemble_2d(&independent, &dof)
                });
                let mut full_r = mat_vec(&dense.k, &u, dof.n_total);
                for (r, f) in full_r.iter_mut().zip(&dense.f) {
                    *r -= f;
                }
                full_r[dof.n_free..].copy_from_slice(&r);
                for it in &asm.inclined_transforms_2d {
                    super::super::assembly::reverse_inclined_transform_2d(
                        &mut full_r,
                        &it.dofs,
                        &it.r,
                    );
                }
                let mut equilibrium = [0.0; 3];
                for node in input.nodes.values() {
                    let rx = full_r[dof.map[&(node.id, 0)]];
                    let rz = full_r[dof.map[&(node.id, 1)]];
                    equilibrium[0] += rx;
                    equilibrium[1] += rz;
                    equilibrium[2] += full_r[dof.map[&(node.id, 2)]] + node.x * rz - node.z * rx;
                }
                for load in &independent.loads {
                    if let SolverLoad::Nodal(load) = load {
                        let node = &input.nodes[&load.node_id.to_string()];
                        equilibrium[0] += load.fx;
                        equilibrium[1] += load.fz;
                        equilibrium[2] += load.my + node.x * load.fz - node.z * load.fx;
                    }
                }
                close(&equilibrium, &[0.0; 3]);
            }
        }
    }
}

#[test]
fn staged_round4_sparse_cumulative_nodal_reactions_keep_inclined_basis() {
    round4_reaction_check(false);
}

#[test]
fn staged_round4_sparse_cumulative_prestress_reactions_keep_inclined_basis() {
    round4_reaction_check(true);
}

#[cfg(test)]
#[test]
fn staged_final_zero_stiffness_uses_accumulated_load() {
    let mut input = model(None);
    input.supports.get_mut("2").unwrap().support_type = "pinned".into();
    let dof = DofNumbering::build_2d(&input);
    assert_eq!(dof.n_free, 1);
    for sparse in [false, true] {
        for connected in [HashSet::new(), HashSet::from([2])] {
            for stiffness in [0.0, 1e-30, 1.0] {
                let force_scale = 1e30;
                let k = CscMatrix::from_triplets(1, &[0], &[0], &[stiffness * force_scale]);
                let solve = |increment: f64, applied: f64| solve_stage_free(
                    &k, &dof, None, true, &connected, &[],
                    &super::super::stability::ReleasedRotations::default(),
                    &[increment * force_scale], &[increment * force_scale], &[applied * force_scale], &[], &[], sparse, &mut None, &mut None,
                );
                let u = solve(-1.0, 0.0).unwrap();
                close(&u, &[if stiffness == 0.0 { 0.0 } else { -1.0 / stiffness }]);
                if stiffness == 0.0 {
                    for applied in [-f64::EPSILON, f64::EPSILON] {
                        assert!(solve(0.0, applied).unwrap_err().contains("rotation"));
                    }
                } else {
                    close(&solve(0.0, 1.0).unwrap(), &[0.0]);
                }
            }
        }
    }
}

#[test]
fn staged_round8_multiple_null_rotations_keep_supported_loads() {
    let input = serde_json::from_str::<crate::types::units::ElasticInput3D>(include_str!(
        "../../tests/fixtures/staged-round8.json"
    ))
    .unwrap()
    .into_legacy();
    let dof = DofNumbering::build_3d(&input);
    assert_eq!(dof.n_free, 3);
    for sparse in [false, true] {
        for (matrix, increment, expected) in [
            (vec![1.0,-1.0,0.0,-1.0,1.0,0.0,0.0,0.0,2.0], vec![-1.0,-1.0,0.0], vec![0.0,0.0,0.0]),
            (vec![1.0,-1.0,0.0,-1.0,1.0,0.0,0.0,0.0,2.0], vec![0.0,-2.0,2.0], vec![0.5,-0.5,1.0]),
            (vec![1.0,-1.0,0.0,-1.0,1.0,0.0,0.0,0.0,0.0], vec![-1.0,-1.0,1.0], vec![0.0,0.0,0.0]),
            (vec![1.0,-1.0,0.0,-1.0,1.0,0.0,0.0,0.0,0.0], vec![0.0,-2.0,1.0], vec![0.5,-0.5,0.0]),
        ] {
            let k = CscMatrix::from_dense_symmetric_exact(&matrix, 3);
            let applied = k.sym_mat_vec(&expected);
            let u = solve_stage_free(
                &k, &dof, None, false, &HashSet::from([1,2]), &[],
                &super::super::stability::ReleasedRotations::default(),
                &increment, &increment, &applied, &[], &[], sparse, &mut None, &mut None,
            ).unwrap();
            close(&u, &expected);
        }
    }
}

#[cfg(test)]
#[test]
fn staged_round8_projection_preserves_prescribed_drive_and_positive_stiffness() {
    let input = serde_json::from_str::<crate::types::units::ElasticInput3D>(include_str!(
        "../../tests/fixtures/staged-round8.json"
    ))
    .unwrap()
    .into_legacy();
    let dof = DofNumbering::build_3d(&input);
    for sparse in [false, true] {
        let oblique = CscMatrix::from_dense_symmetric_exact(&[1.0,-1.0,0.0,-1.0,1.0,0.0,0.0,0.0,2.0], 3);
        let driven = solve_stage_free(
            &oblique, &dof, None, false, &HashSet::from([1,2]), &[],
            &super::super::stability::ReleasedRotations::default(),
            &[-1.0,-1.0,0.0], &[0.0;3], &[0.0;3], &[], &[], sparse, &mut None, &mut None,
        );
        assert!(driven.unwrap_err().contains("rotation"));
        let tiny = 1e-13;
        let unresolved = CscMatrix::from_dense_symmetric_exact(&[1.0+tiny,-1.0+tiny,0.0,-1.0+tiny,1.0+tiny,0.0,0.0,0.0,1.0], 3);
        let loaded = solve_stage_free(
            &unresolved, &dof, None, false, &HashSet::from([1,2]), &[],
            &super::super::stability::ReleasedRotations::default(),
            &[-1.0,-1.0,0.0], &[-1.0,-1.0,0.0], &[0.0;3], &[], &[], sparse, &mut None, &mut None,
        );
        assert!(loaded.unwrap_err().contains("rotation"));
        for stiffness in [-1e-30, 0.0, 1e-30, 1e-13, 1e-11, 1.0] {
            let force_scale = 1e30;
            let k = CscMatrix::from_triplets(3, &[0,1,2], &[0,1,2], &[stiffness * force_scale;3]);
            let solve = |applied: &[f64]| solve_stage_free(
                &k, &dof, None, false, &HashSet::from([1,2]), &[],
                &super::super::stability::ReleasedRotations::default(),
                &[-force_scale,0.0,0.0], &applied.iter().map(|x| x * force_scale).collect::<Vec<_>>(), &[0.0;3], &[], &[], sparse, &mut None, &mut None,
            );
            if stiffness == 0.0 {
                close(&solve(&[-1.0,0.0,0.0]).unwrap(), &[0.0;3]);
            } else if stiffness < 0.0 {
                for applied in [[-1.0,0.0,0.0], [0.0;3]] {
                    assert!(solve(&applied).unwrap_err().contains("stiffness"));
                }
            } else {
                for applied in [[-1.0,0.0,0.0], [0.0;3]] {
                    close(&solve(&applied).unwrap(), &[-1.0/stiffness,0.0,0.0]);
                }
            }
        }
    }
}

#[test]
fn staged_round8_null_witness_does_not_round_away_positive_stiffness() {
    let large = 2.0_f64.powi(54);
    let k = CscMatrix::from_dense_symmetric_exact(&[large,1.0,-large,1.0,large,-large,-large,-large,2.0*large], 3);
    let direction = super::super::stability::FreeDirection {
        node: 2, kind: super::super::stability::DofKind::Rotation, moves_translation: false,
        dofs: vec![0,1,2], direction: vec![1.0;3], direction_rounding: vec![0.0;3], scale: large, coupling: Vec::new(),
    };
    assert_eq!(k.sym_mat_vec(&direction.direction), vec![0.0;3]);
    assert!(!annihilates_rotation(&k, &direction));
}

fn round7_inclined(pads: usize, angle: f64) -> StagedInput {
    let mut input: StagedInput = serde_json::from_value(
        serde_json::from_str::<serde_json::Value>(include_str!("../../tests/fixtures/staged-round7.json")).unwrap()["inclined"].clone()
    ).unwrap();
    input.supports.get_mut("2").unwrap().angle = Some(angle);
    for i in 0..pads {
        let a = 100 + 2 * i;
        let b = a + 1;
        input.nodes.insert(a.to_string(), SolverNode { id: a, x: 10.0, z: 0.0 });
        input.nodes.insert(b.to_string(), SolverNode { id: b, x: 14.0, z: 0.0 });
        let mut e = input.elements["1"].clone();
        e.id = a; e.node_i = a; e.node_j = b;
        input.elements.insert(a.to_string(), e);
        let mut sup = input.supports["1"].clone();
        sup.id = a; sup.node_id = a;
        input.supports.insert(a.to_string(), sup);
        input.stages[0].elements_added.push(a);
        input.stages[0].supports_added.push(a);
    }
    input
}

fn round7_close(got: f64, expected: f64) {
    assert!(got.is_finite() && expected.is_finite());
    assert!((got - expected).abs() <= 1e-10 * expected.abs().max(1.0), "got={got}, expected={expected}");
}

#[cfg(test)]
#[test]
fn staged_round7_inclined_global_axes_reference() {
    for pads in [0, 20, 21] {
        for angle in [0.0_f64, 0.6, -0.6] {
            let input = round7_inclined(pads, angle);
            assert!(solve_staged_2d(&input).unwrap_err().contains("Inclined supports are not yet supported"));
            let result = solve_staged_2d_contained(&input).unwrap();
            let (sin, cos) = angle.sin_cos();
            let e = input.materials["1"].e * 1000.0;
            let kx = e * input.sections["1"].a / 4.0;
            let kz = 3.0 * e * input.sections["1"].iz / 4.0_f64.powi(3);
            for (index, stage) in result.stages.iter().enumerate() {
                let fz = -(index as f64 + 1.0);
                let tangent_u = fz * sin / (kx * cos * cos + kz * sin * sin);
                let ux = -tangent_u * cos;
                let uz = tangent_u * sin;
                let tip = stage.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
                round7_close(tip.ux, ux);
                round7_close(tip.uz, uz);
                round7_close(tip.ry, 3.0 * uz / 8.0);
                let support = stage.results.reactions.iter().find(|r| r.node_id == 2).unwrap();
                round7_close(support.rx, kx * ux);
                round7_close(support.rz, kz * uz - fz);
                let base = stage.results.reactions.iter().find(|r| r.node_id == 1).unwrap();
                round7_close(base.rx, -kx * ux);
                round7_close(base.rz, -kz * uz);
                round7_close(base.my, -4.0 * kz * uz);
                let force = stage.results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
                round7_close(force.n_start, kx * ux);
                round7_close(force.n_end, kx * ux);
            }
        }
    }
}

#[cfg(test)]
#[test]
fn staged_round7_inclined_disconnected_tangent_load() {
    for pads in [0, 20, 21] {
        for angle in [0.0_f64, 0.6, -0.6] {
            for fz in [-1.0, -f64::EPSILON, 0.0, f64::EPSILON, 1.0] {
                let mut input = round7_inclined(pads, angle);
                input.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz, my: 0.0 })];
                input.stages[0].load_indices.clear();
                input.stages[1].elements_removed = vec![1];
                input.stages[1].load_indices = vec![0];
                let result = solve_staged_2d_contained(&input);
                if angle != 0.0 && fz != 0.0 {
                    let error = result.unwrap_err();
                    assert!(error.contains("translation") || error.contains("mechanism"), "{error}");
                } else {
                    let result = result.unwrap();
                    let r = result.final_results.reactions.iter().find(|r| r.node_id == 2).unwrap();
                    round7_close(r.rx, 0.0);
                    round7_close(r.rz, -fz);
                }
            }
        }
    }
}
