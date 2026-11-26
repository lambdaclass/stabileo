#![cfg(all(feature = "hardware-tests", any(feature = "webgpu", feature = "metal")))]
use dedaliano_engine::linalg::CscMatrix;
use stabileo_compute::{
    gpu::WgpuBackend, ComputeError, CpuBackend, Precision, PreparedOperator, SparseBackend,
};

fn assert_same_solve(
    a: &stabileo_compute::solver::SolveReport,
    b: &stabileo_compute::solver::SolveReport,
) {
    assert_eq!(
        a.x.iter().map(|x| x.to_bits()).collect::<Vec<_>>(),
        b.x.iter().map(|x| x.to_bits()).collect::<Vec<_>>()
    );
    assert_eq!(a.iterations, b.iterations);
    assert_eq!(a.converged, b.converged);
    assert_eq!(
        a.recursive_relative_residual.to_bits(),
        b.recursive_relative_residual.to_bits()
    );
    assert_eq!(
        a.true_relative_residual.to_bits(),
        b.true_relative_residual.to_bits()
    );
}

#[test]
fn resident_updates_match_fresh_solvers_and_reject_without_stale_state() {
    use stabileo_compute::fixtures::grid;
    pollster::block_on(async {
        let mut backend = WgpuBackend::new().await.unwrap();
        for n in [3, 33, 257] {
            let original = grid(n, 1, 4.);
            let mut reused = backend
                .prepare_resident_pcg(original.clone())
                .await
                .unwrap();
            let mut independent = backend
                .prepare_resident_pcg(original.clone())
                .await
                .unwrap();
            let expected: Vec<_> = (0..n).map(|i| (i % 17) as f64 * 0.125 - 1.).collect();
            let initial_rhs = original.sym_mat_vec(&expected);
            let initial = independent.solve(&initial_rhs, 1e-6, 2000).await.unwrap();
            for round in 0..3 {
                let mut changed = original.clone();
                for col in 0..n {
                    for k in changed.col_ptr[col]..changed.col_ptr[col + 1] {
                        changed.values[k] = if changed.row_idx[k] == col {
                            5. + (col % 3) as f64 + round as f64
                        } else if round == 1 {
                            0.
                        } else {
                            -0.75
                        };
                    }
                }
                let rhs = changed.sym_mat_vec(&expected);
                let upload = reused.update_values(changed.values.clone()).await.unwrap();
                assert!(upload.uploaded_bytes > 0);
                assert_eq!(upload.readbacks, 0);
                assert_eq!(upload.downloaded_bytes, 0);
                let mut fresh = backend.prepare_resident_pcg(changed.clone()).await.unwrap();
                let reference = fresh.solve(&rhs, 1e-6, 2000).await.unwrap();
                let actual = reused.solve(&rhs, 1e-6, 2000).await.unwrap();
                assert!(actual.solve.converged);
                assert_same_solve(&actual.solve, &reference.solve);
                for value in [0., -1., f64::NAN, f64::INFINITY, f64::MAX, 1e-300] {
                    let mut invalid = changed.values.clone();
                    invalid[0] = value;
                    assert!(reused.update_values(invalid).await.is_err());
                    assert_same_solve(
                        &reused.solve(&rhs, 1e-6, 2000).await.unwrap().solve,
                        &reference.solve,
                    );
                }
                assert!(reused
                    .update_values(vec![1.; changed.values.len() + 1])
                    .await
                    .is_err());
                assert_same_solve(
                    &independent
                        .solve(&initial_rhs, 1e-6, 2000)
                        .await
                        .unwrap()
                        .solve,
                    &initial.solve,
                );
                assert_eq!(
                    reused
                        .solve(&vec![0.; n], 1e-6, 2000)
                        .await
                        .unwrap()
                        .solve
                        .x,
                    vec![0.; n]
                );
            }
        }
        let mut one = backend.prepare_resident_pcg(grid(1, 1, 1.)).await.unwrap();
        one.update_values(vec![1e-10]).await.unwrap();
        assert!(matches!(
            one.solve(&[1e30], 1e-6, 10).await,
            Err(ComputeError::NumericRange)
        ));
        // If the device's error-scope future yields, dropping it must block solve.
        // If it completes immediately, there is no suspension point to cancel.
        use std::{
            future::{poll_fn, Future},
            task::Poll,
        };
        let completed = {
            let mut pending = Box::pin(one.update_values(vec![2.]));
            poll_fn(|cx| {
                Poll::Ready(match pending.as_mut().poll(cx) {
                    Poll::Pending => false,
                    Poll::Ready(result) => {
                        result.unwrap();
                        true
                    }
                })
            })
            .await
        };
        if !completed {
            assert!(matches!(
                one.solve(&[1.], 1e-6, 10).await,
                Err(ComputeError::Device(_))
            ));
        }
        one.update_values(vec![4.]).await.unwrap();
        drop(backend); // Cached pipelines outlive the context through their operators.
        assert_eq!(
            one.solve(&[1.], 1e-6, 10).await.unwrap().solve.x,
            vec![0.25]
        );
        let mut backend = WgpuBackend::new().await.unwrap();
        let mut one = backend.prepare_resident_pcg(grid(1, 1, 1.)).await.unwrap();
        backend.shutdown();
        assert!(matches!(
            one.update_values(vec![2.]).await,
            Err(ComputeError::Device(_))
        ));
    });
}

#[test]
fn gpu_batches_match_cpu_and_reuse_buffers_without_stale_values() {
    pollster::block_on(async {
        let mut gpu = WgpuBackend::new()
            .await
            .expect("GPU adapter required for this test");
        for n in [1, 3, 65, 257] {
            let mut row = Vec::new();
            let mut col = Vec::new();
            let mut value = Vec::new();
            for i in 0..n {
                row.push(i);
                col.push(i);
                value.push(4.);
                if i + 1 < n {
                    row.push(i + 1);
                    col.push(i);
                    value.push(-1.);
                }
            }
            let matrix = CscMatrix::from_triplets(n, &row, &col, &value);
            let mut reference = CpuBackend.prepare(matrix.clone(), 3).await.unwrap();
            let mut op = gpu.prepare(matrix, 3).await.unwrap();
            assert_eq!(op.precision(), Precision::ExperimentalF32);
            for count in [3, 1, 2, 3] {
                let x: Vec<_> = (0..n * count)
                    .map(|i| ((i % 17) as f64 - 8.) * 0.125)
                    .collect();
                assert_eq!(
                    op.apply_batch(&x).await.unwrap(),
                    reference.apply_batch(&x).await.unwrap()
                );
            }
            assert_eq!(op.apply_batch(&vec![0.; n]).await.unwrap(), vec![0.; n]);
            assert_eq!(
                op.apply_batch(&vec![f64::MAX; n]).await,
                Err(ComputeError::NumericRange)
            );
            assert_eq!(
                op.apply_batch(&vec![f32::MAX as f64; n]).await,
                Err(ComputeError::NumericRange)
            );
            assert_eq!(
                op.apply_batch(&vec![f64::NAN; n]).await,
                Err(ComputeError::NonFinite)
            );
            assert_eq!(
                op.apply_batch(&vec![1.; n * 4]).await,
                Err(ComputeError::InvalidBatch)
            );
        }
        let empty = CscMatrix {
            n: 3,
            col_ptr: vec![0; 4],
            row_idx: vec![],
            values: vec![],
        };
        assert_eq!(
            gpu.prepare(empty, 1)
                .await
                .unwrap()
                .apply_batch(&[1., 2., 3.])
                .await
                .unwrap(),
            vec![0.; 3]
        );

        let diagonal = CscMatrix::from_triplets(1, &[0], &[0], &[1.]);
        assert!(matches!(
            gpu.prepare(diagonal.clone(), usize::MAX).await,
            Err(ComputeError::ResourceLimit)
        ));
        let mut op = gpu.prepare(diagonal, 1).await.unwrap();
        gpu.shutdown();
        assert!(matches!(
            op.apply_batch(&[1.]).await,
            Err(ComputeError::Device(_))
        ));
    });
}

#[test]
fn gpu_pcg_solves_spd_systems_and_refuses_precision_loss() {
    use stabileo_compute::{fixtures::grid, solver::PreparedPcg};
    pollster::block_on(async {
        let mut backend = WgpuBackend::new().await.unwrap();
        for n in [3, 65, 257] {
            let a = grid(n, 1, 4.);
            let expected: Vec<_> = (0..n).map(|i| ((i % 11) as f64 - 5.) * 0.125).collect();
            let rhs = a.sym_mat_vec(&expected);
            let mut solver = PreparedPcg::prepare(&mut backend, a).await.unwrap();
            let result = solver.solve(&rhs, 1e-6, 1000).await.unwrap();
            assert!(result.converged, "{result:?}");
            assert!(result
                .x
                .iter()
                .zip(&expected)
                .all(|(a, b)| (a - b).abs() < 1e-5));
            let zero = solver.solve(&vec![0.; n], 1e-6, 1000).await.unwrap();
            assert!(zero.converged);
            assert_eq!(zero.x, vec![0.; n]);
        }
        let a = grid(2, 1, 1. + 1e-8);
        let mut solver = PreparedPcg::prepare(&mut backend, a).await.unwrap();
        assert!(!solver.solve(&[1., 1.], 1e-6, 100).await.unwrap().converged);
        backend.shutdown();
        assert!(matches!(
            solver.solve(&[1., 1.], 1e-6, 100).await,
            Err(ComputeError::Device(_))
        ));
    });
}

#[test]
fn resident_pcg_reuses_vectors_reduces_transfer_bytes_and_refuses_unsafe_inputs() {
    use stabileo_compute::fixtures::grid;
    pollster::block_on(async {
        let mut backend = WgpuBackend::new().await.unwrap();
        for n in [3, 31, 32, 33, 255, 256, 257, 4096] {
            let matrix = grid(n, 1, 4.);
            let expected: Vec<_> = (0..n).map(|i| (i % 13) as f64 * 0.125).collect();
            let rhs = matrix.sym_mat_vec(&expected);
            let cpu = stabileo_compute::solver::PcgProblem::new(matrix.clone())
                .unwrap()
                .solve_cpu_reference(&rhs, 1e-6, 2000)
                .unwrap();
            let mut solver = backend.prepare_resident_pcg(matrix).await.unwrap();
            for _ in 0..2 {
                let r = solver.solve(&rhs, 1e-6, 2000).await.unwrap();
                assert!(r.solve.converged, "{r:?}");
                assert!(r.solve.true_relative_residual <= 1e-6);
                // Gershgorin gives kappa_2 <= 3 for this tridiagonal SPD matrix.
                // A fixed componentwise bound is not implied by a relative L2 residual.
                let error = r
                    .solve
                    .x
                    .iter()
                    .zip(&expected)
                    .map(|(a, b)| (a - b) * (a - b))
                    .sum::<f64>()
                    .sqrt();
                let scale = expected.iter().map(|v| v * v).sum::<f64>().sqrt();
                assert!(error <= 3e-6 * scale);
                assert!(r
                    .solve
                    .x
                    .iter()
                    .zip(&cpu.x)
                    .all(|(a, b)| (a - b).abs() < 1e-6));
                if n == 4096 {
                    let hybrid_bytes = (n as u64 * 8 + 16) * r.solve.iterations as u64;
                    assert!(
                        r.transfers.uploaded_bytes + r.transfers.downloaded_bytes
                            < hybrid_bytes / 4
                    );
                }
                let zero = solver.solve(&vec![0.; n], 1e-6, 2000).await.unwrap();
                assert_eq!(zero.solve.x, vec![0.; n]);
                assert_eq!(zero.transfers.readbacks, 0);
            }
        }
        let mut ill = backend
            .prepare_resident_pcg(grid(2, 1, 1. + 1e-8))
            .await
            .unwrap();
        assert!(
            !ill.solve(&[1., 1.], 1e-6, 100)
                .await
                .unwrap()
                .solve
                .converged
        );
        let a = CscMatrix::from_triplets(1, &[0], &[0], &[1e-10]);
        let mut overflow = backend.prepare_resident_pcg(a).await.unwrap();
        assert!(matches!(
            overflow.solve(&[1e30], 1e-6, 100).await,
            Err(ComputeError::NumericRange)
        ));
        for rhs in [vec![f64::NAN; 2], vec![1e-300; 2], vec![f64::MAX; 2]] {
            assert!(ill.solve(&rhs, 1e-6, 100).await.is_err());
        }
        backend.shutdown();
        assert!(matches!(
            ill.solve(&[1., 1.], 1e-6, 100).await,
            Err(ComputeError::Device(_))
        ));
    });
}
