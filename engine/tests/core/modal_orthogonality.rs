use dedaliano_engine::{
    linalg::jacobi::solve_generalized_eigen,
    solver::{
        assembly::assemble_sparse_3d, dof::DofNumbering,
        mass_matrix::assemble_mass_matrix_3d_sparse_inclined, modal::solve_modal_3d,
    },
    types::*,
};
use std::collections::HashMap;

#[path = "../fuzz_models/mod.rs"]
mod fuzz_models;

fn check(input: &SolverInput3D, densities: &HashMap<String, f64>, want: usize) -> usize {
    let dof = DofNumbering::build_3d(input);
    let stiff = assemble_sparse_3d(input, &dof, false);
    let mass =
        assemble_mass_matrix_3d_sparse_inclined(input, &dof, densities, &stiff.inclined_transforms);
    let n = dof.n_free;
    let reference = solve_generalized_eigen(
        &stiff.k_ff.to_dense_symmetric(),
        &mass.to_dense_symmetric(),
        n,
        200,
    )
    .unwrap();
    let result = solve_modal_3d(input, densities, want).unwrap();
    let expected: Vec<_> = reference
        .values
        .iter()
        .copied()
        .filter(|x| x.is_finite() && *x > 1e-10)
        .take(want)
        .collect();
    assert_eq!(result.modes.len(), expected.len());
    let mut shapes = Vec::new();
    for mode in &result.modes {
        let mut phi = vec![0.0; n];
        for d in &mode.displacements {
            for (local, value) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz, d.warping.unwrap_or(0.0)]
                .into_iter()
                .enumerate()
            {
                if let Some(i) = dof.global_dof(d.node_id, local).filter(|&i| i < n) {
                    phi[i] = value;
                }
            }
        }
        let mp = mass.sym_mat_vec(&phi);
        let norm = phi.iter().zip(&mp).map(|(a, b)| a * b).sum::<f64>().sqrt();
        assert!(norm.is_finite() && norm > 0.0);
        for x in &mut phi {
            *x /= norm;
        }
        shapes.push(phi);
    }
    let candidates: Vec<_> = result
        .modes
        .iter()
        .zip(&shapes)
        .map(|(mode, phi)| (mode.omega.powi(2), phi.clone()))
        .collect();
    let certificate =
        dedaliano_engine::certify::modal::certify_modes(&stiff.k_ff, &mass, &candidates);
    let mut certified_count = 0;
    if let dedaliano_engine::certify::modal::ModalCertificate::Certified {
        modes,
        complete_modes,
        cutoff_omega2,
        ..
    } = certificate
    {
        for (enclosure, lambda) in modes.iter().zip(&expected) {
            let slack = 1e-8 * lambda;
            assert!(
                enclosure.omega2_lower <= lambda + slack
                    && lambda - slack <= enclosure.omega2_upper
            );
        }
        certified_count = complete_modes;
        if complete_modes > 0 {
            assert_eq!(
                reference
                    .values
                    .iter()
                    .filter(|&&x| x < cutoff_omega2)
                    .count(),
                complete_modes
            );
        }
    }
    for (i, phi) in shapes.iter().enumerate() {
        let mp = mass.sym_mat_vec(phi);
        for (j, other) in shapes.iter().enumerate() {
            let gram: f64 = other.iter().zip(&mp).map(|(a, b)| a * b).sum();
            assert!(
                (gram - if i == j { 1.0 } else { 0.0 }).abs() < 1e-8,
                "modes {i},{j}: mass Gram = {gram:.15e}"
            );
        }
        let lambda = result.modes[i].omega.powi(2);
        assert!(
            (lambda - expected[i]).abs() <= 1e-7 * expected[i],
            "mode {i}: {lambda:e} vs dense {:e}",
            expected[i]
        );
        if i > 0 {
            assert!(result.modes[i - 1].frequency <= result.modes[i].frequency);
        }
    }
    certified_count
}

#[test]
fn issue_759_seed_20754() {
    let (mut input, densities) = fuzz_models::random_3d_model_rich(20754);
    input.loads.clear();
    check(&input, &densities, 12);
}

#[test]
fn issue_759_warping_cantilever() {
    check(&symmetric_cantilevers(1, 0.5, true), &HashMap::from([("1".into(), 7850.0)]), 7);
    let input: SolverInput3D = serde_json::from_str(include_str!(
        "../metamorphic_corpus/feature_matrix/3d-warping-torsion-restrained-cantilever-with.json"
    ))
    .unwrap();
    let densities = input
        .materials
        .keys()
        .map(|id| (id.clone(), 7850.0))
        .collect();
    check(&input, &densities, 12);
}

#[test]
fn issue_759_symmetric_repeated_modes() {
    check(
        &symmetric_cantilevers(16, 0.5, true),
        &HashMap::from([("1".into(), 7850.0)]),
        4,
    );
}

fn symmetric_cantilevers(copies: usize, length: f64, warping: bool) -> SolverInput3D {
    let base: SolverInput3D = serde_json::from_str(include_str!(
        "../metamorphic_corpus/feature_matrix/3d-warping-torsion-restrained-cantilever-with.json"
    ))
    .unwrap();
    let mut input = base.clone();
    input.nodes.clear();
    input.elements.clear();
    input.supports.clear();
    input.loads.clear();
    for section in input.sections.values_mut() {
        if !warping {
            section.cw = None;
        }
    }
    for copy in 0..copies {
        for original in [1, 2] {
            let mut node = base.nodes[&original.to_string()].clone();
            node.id = copy * 2 + original;
            node.y = copy as f64;
            node.x = (original - 1) as f64 * length;
            input.nodes.insert(node.id.to_string(), node);
        }
        let mut element = base.elements["1"].clone();
        element.id = copy + 1;
        element.node_i = copy * 2 + 1;
        element.node_j = copy * 2 + 2;
        input.elements.insert(element.id.to_string(), element);
        let mut support = base.supports["1"].clone();
        support.node_id = copy * 2 + 1;
        input.supports.insert(support.node_id.to_string(), support);
    }
    input
}

proptest::proptest! {
    #![proptest_config(proptest::test_runner::Config {
        cases: 24,
        rng_seed: proptest::test_runner::RngSeed::Fixed(759),
        .. proptest::test_runner::Config::default()
    })]
    #[test]
    fn generated_symmetric_modal_invariants(copies in 12usize..20, length in 0.3f64..8.0, warping in proptest::bool::ANY, want in 2usize..10) {
        let input = symmetric_cantilevers(copies, length, warping);
        check(&input, &HashMap::from([("1".into(), 7850.0)]), want);
    }
}

#[test]
fn connected_symmetric_cantilever_repeated_modes() {
    for segments in [14, 18, 24] {
        let mut input = symmetric_cantilevers(segments, 1.0, true);
        input.nodes.clear();
        input.supports.retain(|_, s| s.node_id == 1);
        for i in 0..=segments {
            input.nodes.insert(
                (i + 1).to_string(),
                SolverNode3D {
                    id: i + 1,
                    x: i as f64 / segments as f64 * 4.0,
                    y: 0.0,
                    z: 0.0,
                },
            );
        }
        for element in input.elements.values_mut() {
            element.node_i = element.id;
            element.node_j = element.id + 1;
        }
        check(&input, &HashMap::from([("1".into(), 7850.0)]), 8);
    }
}

#[test]
fn entire_repeated_cluster_is_certified_complete() {
    let input = symmetric_cantilevers(12, 0.5, true);
    let count = check(&input, &HashMap::from([("1".into(), 7850.0)]), 12);
    assert_eq!(count, 12);
}

#[test]
fn full_search_space_does_not_prove_repeated_mode_completeness() {
    use dedaliano_engine::linalg::{CscMatrix, lanczos_generalized_eigen_sparse};
    for distinct in [40, 60] {
        let n = distinct * 3;
        let indices: Vec<_> = (0..n).collect();
        let stiffness: Vec<_> = (0..n).map(|i| 1.0 / (i / 3 + 1) as f64).collect();
        let k = CscMatrix::from_triplets(n, &indices, &indices, &stiffness);
        let m = CscMatrix::from_triplets(n, &indices, &indices, &vec![1.0; n]);
        let result = lanczos_generalized_eigen_sparse(&k, &m, 2, 0.0).unwrap();
        assert_eq!(result.values.len(), 2);
        for value in &result.values {
            assert!((value - 1.0 / distinct as f64).abs() < 1e-12);
        }
        for i in 0..2 {
            for j in 0..2 {
                let gram: f64 = (0..n).map(|r| result.vectors[r * 2 + i] * result.vectors[r * 2 + j]).sum();
                assert!((gram - if i == j { 1.0 } else { 0.0 }).abs() < 1e-10);
            }
        }
    }
}

#[test]
fn twenty_thousand_dofs_remain_sparse_and_complete() {
    use dedaliano_engine::linalg::{CscMatrix, lanczos_generalized_eigen_sparse};
    let n = 20_000;
    let ids: Vec<_> = (0..n).collect();
    let values: Vec<_> = (0..n).map(|i| (i / 3 + 1) as f64).collect();
    let k = CscMatrix::from_triplets(n,&ids,&ids,&values);
    let m = CscMatrix::from_triplets(n,&ids,&ids,&vec![1.0;n]);
    for shift in [0.0,0.5] {
        let result = lanczos_generalized_eigen_sparse(&k,&m,2,shift).unwrap();
        assert_eq!(result.values.len(),2);
        for v in result.values { assert!((v-1.0).abs() < 1e-9); }
        let gram: f64 = (0..n).map(|i| result.vectors[i*2]*result.vectors[i*2+1]).sum();
        assert!(gram.abs() < 1e-10);
    }
}

#[test]
fn two_and_three_fold_structural_modes_are_mass_orthonormal() {
    for copies in [2, 3] {
        check(&symmetric_cantilevers(copies, 0.5, true),
            &HashMap::from([("1".into(), 7850.0)]), copies * 7);
    }
}

#[test]
fn three_d_model_above_five_thousand_free_dofs_solves() {
    let mut input = symmetric_cantilevers(840, 0.5, false);
    // Three identical longest cantilevers give a repeated lowest frequency;
    // the remaining shorter cantilevers avoid an enormous boundary cluster.
    for copy in 3..840 {
        input.nodes.get_mut(&(copy * 2 + 2).to_string()).unwrap().x =
            0.1 + 0.2 * (copy - 3) as f64 / 837.0;
    }
    let densities = HashMap::from([("1".into(), 7850.0)]);
    let dof = DofNumbering::build_3d(&input);
    assert!(dof.n_free >= 5_000, "{} free DOFs", dof.n_free);
    let result = solve_modal_3d(&input, &densities, 3).unwrap();
    assert_eq!(result.modes.len(), 3);
    let reference = solve_modal_3d(&symmetric_cantilevers(1, 0.5, false), &densities, 1).unwrap();
    for mode in result.modes {
        let relative = (mode.frequency / reference.modes[0].frequency - 1.0).abs();
        assert!(relative < 1e-8, "relative frequency error {relative:e}");
    }
}

#[test]
fn near_zero_modes_must_not_silently_truncate_the_requested_spectrum() {
    for scale in [1e-12, 1e-14, 1e-16, 1e-18, 1e-20] {
        let mut input = symmetric_cantilevers(1, 0.5, true);
        for material in input.materials.values_mut() { material.e *= scale; }
        let result = solve_modal_3d(&input, &HashMap::from([("1".into(), 7850.0)]), 7);
        match result {
            Ok(result) => assert_eq!(result.modes.len(), 7,
                "E scale {scale:e}: silently returned only {} modes; omega² {:?}",
                result.modes.len(), result.modes.iter().map(|m| m.omega.powi(2)).collect::<Vec<_>>()),
            Err(message) => assert!(message.contains("completeness") || message.contains("No valid modes"), "{message}"),
        }
    }
}
