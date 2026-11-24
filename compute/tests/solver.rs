use stabileo_compute::{
    fixtures::grid, solver::PreparedPcg, ComputeError, CpuBackend, Precision, PreparedOperator,
    SparseBackend,
};

#[test]
fn cpu_solver_recovers_manufactured_displacements_and_reuses_preparation() {
    pollster::block_on(async {
        for case in stabileo_compute::fixtures::comparison_cases() {
            let mut solver = PreparedPcg::prepare(&mut CpuBackend, case.matrix())
                .await
                .unwrap();
            let result = solver.solve(&case.rhs, 1e-10, 10_000).await.unwrap();
            let baseline = stabileo_compute::solver::PcgProblem::new(case.matrix())
                .unwrap()
                .solve_cpu_reference(&case.rhs, 1e-10, 10_000)
                .unwrap();
            assert_eq!(result.x, baseline.x);
            assert_eq!(result.iterations, baseline.iterations);
            assert_eq!(
                result.true_relative_residual,
                baseline.true_relative_residual
            );
            assert!(result.converged, "{}: {result:?}", case.name);
            let error = result
                .x
                .iter()
                .zip(&case.expected)
                .map(|(a, b)| (a - b).abs())
                .fold(0., f64::max);
            assert!(error < 1e-6, "{}: {error}", case.name);
            let zero = solver
                .solve(&vec![0.; case.n], 1e-10, 10_000)
                .await
                .unwrap();
            assert!(zero.converged);
            assert_eq!(zero.x, vec![0.; case.n]);
        }
    });
}

#[test]
fn options_iteration_limits_and_numerical_extremes_fail_closed() {
    pollster::block_on(async {
        let a = grid(8, 8, 4.);
        let mut solver = PreparedPcg::prepare(&mut CpuBackend, a).await.unwrap();
        let rhs = vec![1.; 64];
        assert!(!solver.solve(&rhs, 1e-12, 1).await.unwrap().converged);
        for tolerance in [0., -1., 1., f64::NAN, f64::INFINITY] {
            assert!(matches!(
                solver.solve(&rhs, tolerance, 10).await,
                Err(ComputeError::InvalidOptions)
            ));
        }
        for rhs in [vec![1e200; 64], vec![1e-200; 64]] {
            assert!(matches!(
                solver.solve(&rhs, 1e-6, 10).await,
                Err(ComputeError::NumericRange)
            ));
        }
        assert!(matches!(
            solver.solve(&[1.], 1e-6, 10).await,
            Err(ComputeError::InvalidBatch)
        ));
        assert!(PreparedPcg::prepare(&mut CpuBackend, grid(2, 1, -1.))
            .await
            .is_err());
        let a = grid(2, 1, 0.5);
        let mut indefinite = PreparedPcg::prepare(&mut CpuBackend, a).await.unwrap();
        assert!(
            !indefinite
                .solve(&[1., 1.], 1e-6, 100)
                .await
                .unwrap()
                .converged
        );
    });
}

struct IncorrectBackend;
struct IncorrectOperator(usize);
impl SparseBackend for IncorrectBackend {
    type Operator = IncorrectOperator;
    async fn prepare(
        &mut self,
        a: dedaliano_engine::linalg::CscMatrix,
        _: usize,
    ) -> Result<Self::Operator, ComputeError> {
        Ok(IncorrectOperator(a.n))
    }
}
impl PreparedOperator for IncorrectOperator {
    fn dimension(&self) -> usize {
        self.0
    }
    fn precision(&self) -> Precision {
        Precision::ExperimentalF32
    }
    async fn apply_batch(&mut self, x: &[f64]) -> Result<Vec<f64>, ComputeError> {
        Ok(x.to_vec())
    }
}

#[test]
fn recursive_convergence_is_not_accepted_without_the_original_f64_residual() {
    pollster::block_on(async {
        let mut solver = PreparedPcg::prepare(&mut IncorrectBackend, grid(3, 1, 4.))
            .await
            .unwrap();
        let result = solver.solve(&[1., 1., 1.], 1e-6, 100).await.unwrap();
        assert!(result.recursive_relative_residual <= 1e-6);
        assert!(result.true_relative_residual > 1e-6);
        assert!(!result.converged);
    });
}

#[test]
fn plate_fixture_is_an_spd_structural_matrix_with_a_known_solution() {
    use dedaliano_engine::linalg::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky};
    use stabileo_compute::solver::true_relative_residual;
    let a = stabileo_compute::fixtures::plate(4);
    assert_eq!(a.n, 6 * 3 * 3);
    let expected: Vec<_> = (0..a.n).map(|i| (i % 13) as f64 * 0.125).collect();
    let rhs = a.sym_mat_vec(&expected);
    let factor = numeric_cholesky(&std::rc::Rc::new(symbolic_cholesky(&a)), &a).unwrap();
    let x = sparse_cholesky_solve(&factor, &rhs);
    assert!(true_relative_residual(&a, &rhs, &x).unwrap() < 1e-12);
    assert!(x.iter().zip(expected).all(|(a, b)| (a - b).abs() < 1e-8));
}
