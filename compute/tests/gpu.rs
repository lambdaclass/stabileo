#![cfg(all(feature = "hardware-tests", any(feature = "webgpu", feature = "metal")))]
use dedaliano_engine::linalg::CscMatrix;
use stabileo_compute::{
    gpu::WgpuBackend, ComputeError, CpuBackend, Precision, PreparedOperator, SparseBackend,
};

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
