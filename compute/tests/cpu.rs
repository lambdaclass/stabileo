use dedaliano_engine::linalg::CscMatrix;
use stabileo_compute::{
    validate_matrix, ComputeError, CpuBackend, Precision, PreparedOperator, SparseBackend,
};

fn matrix() -> CscMatrix {
    CscMatrix {
        n: 3,
        col_ptr: vec![0, 2, 4, 5],
        row_idx: vec![0, 1, 1, 2, 2],
        values: vec![4., -1., 4., -1., 3.],
    }
}

#[test]
fn prepared_cpu_uses_the_existing_kernel_bit_for_bit_for_every_rhs() {
    pollster::block_on(async {
        let a = matrix();
        let mut prepared = CpuBackend.prepare(a.clone(), 2).await.unwrap();
        assert_eq!(prepared.precision(), Precision::CpuF64);
        assert_eq!(prepared.dimension(), 3);
        for x in [vec![1., 2., 3., -0., 1e-100, 1e100], vec![0.; 6]] {
            let actual = prepared.apply_batch(&x).await.unwrap();
            let expected: Vec<_> = x
                .as_chunks::<3>()
                .0
                .iter()
                .flat_map(|x| a.sym_mat_vec(x))
                .collect();
            assert_eq!(
                actual.iter().map(|v| v.to_bits()).collect::<Vec<_>>(),
                expected.iter().map(|v| v.to_bits()).collect::<Vec<_>>()
            );
        }
        assert_eq!(
            prepared.apply_batch(&[1., 2., 3.]).await.unwrap(),
            vec![2., 4., 7.]
        );
    });
}

#[test]
fn malformed_sparse_inputs_are_rejected_before_indexing() {
    let a = matrix();
    let mut bad = Vec::new();
    let mut m = a.clone();
    m.n = usize::MAX;
    bad.push(m);
    let mut m = a.clone();
    m.col_ptr[1] = usize::MAX;
    bad.push(m);
    let mut m = a.clone();
    m.col_ptr[0] = 1;
    bad.push(m);
    let mut m = a.clone();
    m.row_idx[0] = 3;
    bad.push(m);
    let mut m = a.clone();
    m.row_idx[3] = 0;
    bad.push(m);
    let mut m = a.clone();
    m.row_idx[1] = 0;
    bad.push(m);
    let mut m = a.clone();
    m.values.pop();
    bad.push(m);
    for m in bad {
        assert_eq!(validate_matrix(&m), Err(ComputeError::InvalidMatrix));
    }
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut m = a.clone();
        m.values[1] = value;
        assert_eq!(validate_matrix(&m), Err(ComputeError::NonFinite));
    }
}

#[test]
fn invalid_batches_and_nonfinite_products_never_succeed() {
    pollster::block_on(async {
        assert_eq!(
            stabileo_compute::validate_batch(0, 1, &[1.]),
            Err(ComputeError::InvalidBatch)
        );
        assert!(matches!(
            CpuBackend.prepare(matrix(), 0).await,
            Err(ComputeError::InvalidBatch)
        ));
        assert!(matches!(
            CpuBackend.prepare(matrix(), usize::MAX).await,
            Err(ComputeError::ResourceLimit)
        ));
        let mut op = CpuBackend.prepare(matrix(), 2).await.unwrap();
        for x in [vec![], vec![1.], vec![1.; 9]] {
            assert_eq!(op.apply_batch(&x).await, Err(ComputeError::InvalidBatch));
        }
        assert_eq!(
            op.apply_batch(&[f64::NAN, 0., 0.]).await,
            Err(ComputeError::NonFinite)
        );
        assert_eq!(
            op.apply_batch(&[f64::MAX, 0., 0.]).await,
            Err(ComputeError::NonFinite)
        );
    });
}

#[test]
fn shared_shader_is_valid_without_gpu_hardware() {
    for source in [
        include_str!("../src/spmv.wgsl"),
        include_str!("../src/resident.wgsl"),
    ] {
        let module = naga::front::wgsl::parse_str(source).unwrap();
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::empty(),
        )
        .validate(&module)
        .unwrap();
    }
}
