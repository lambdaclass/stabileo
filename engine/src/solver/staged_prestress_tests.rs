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
