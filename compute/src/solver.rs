use crate::{validate_batch, validate_matrix, ComputeError, PreparedOperator, SparseBackend};
use dedaliano_engine::linalg::{
    pcg::{pcg_solve_with_operator, PcgResult},
    preconditioner::JacobiPreconditioner,
    CscMatrix,
};

#[derive(Debug, serde::Serialize)]
pub struct SolveReport {
    pub x: Vec<f64>,
    pub iterations: usize,
    pub recursive_relative_residual: f64,
    pub true_relative_residual: f64,
    pub converged: bool,
}

pub struct PcgProblem {
    matrix: CscMatrix,
    preconditioner: JacobiPreconditioner,
}

pub struct PreparedPcg<O> {
    problem: PcgProblem,
    operator: O,
}

#[cfg(any(feature = "metal", feature = "webgpu"))]
impl PreparedPcg<crate::gpu::WgpuOperator> {
    pub fn transfers(&self) -> crate::gpu::resident::Transfers {
        self.operator.transfers()
    }
    pub fn reset_transfers(&mut self) {
        self.operator.reset_transfers();
    }
}

impl<O: PreparedOperator> PreparedPcg<O> {
    pub async fn prepare(
        backend: &mut impl SparseBackend<Operator = O>,
        matrix: CscMatrix,
    ) -> Result<Self, ComputeError> {
        let problem = PcgProblem::new(matrix)?;
        let operator = backend.prepare(problem.matrix.clone(), 1).await?;
        Ok(Self { problem, operator })
    }

    pub async fn solve(
        &mut self,
        rhs: &[f64],
        tolerance: f64,
        max_iterations: usize,
    ) -> Result<SolveReport, ComputeError> {
        self.problem.validate_rhs(rhs, tolerance, max_iterations)?;
        let result = pcg_solve_with_operator(
            &mut self.operator,
            rhs,
            &self.problem.preconditioner,
            tolerance,
            max_iterations,
        )
        .await?;
        self.problem.report(rhs, tolerance, result)
    }
}

impl PcgProblem {
    pub fn new(matrix: CscMatrix) -> Result<Self, ComputeError> {
        validate_matrix(&matrix)?;
        if matrix.diagonal().iter().any(|v| *v <= 0.) {
            return Err(ComputeError::InvalidMatrix);
        }
        let preconditioner =
            JacobiPreconditioner::new(&matrix).ok_or(ComputeError::InvalidMatrix)?;
        Ok(Self {
            matrix,
            preconditioner,
        })
    }

    pub(crate) fn validate_rhs(
        &self,
        rhs: &[f64],
        tolerance: f64,
        max_iterations: usize,
    ) -> Result<(), ComputeError> {
        validate_batch(self.matrix.n, 1, rhs)?;
        if !tolerance.is_finite()
            || tolerance <= 0.
            || tolerance >= 1.
            || max_iterations == 0
            || max_iterations > 100_000
        {
            return Err(ComputeError::InvalidOptions);
        }
        let squared_norm: f64 = rhs.iter().map(|v| v * v).sum();
        if !squared_norm.is_finite() || (squared_norm == 0. && rhs.iter().any(|v| *v != 0.)) {
            return Err(ComputeError::NumericRange);
        }
        Ok(())
    }

    pub(crate) fn report(
        &self,
        rhs: &[f64],
        tolerance: f64,
        result: PcgResult,
    ) -> Result<SolveReport, ComputeError> {
        if result.x.iter().any(|v| !v.is_finite()) || !result.final_rel_residual.is_finite() {
            return Err(ComputeError::NonFinite);
        }
        let residual = true_relative_residual(&self.matrix, rhs, &result.x)?;
        Ok(SolveReport {
            x: result.x,
            iterations: result.iterations,
            recursive_relative_residual: result.final_rel_residual,
            true_relative_residual: residual,
            converged: result.converged && residual <= tolerance,
        })
    }
}

impl PcgProblem {
    /// Production PCG baseline, with the same input and final-residual validation
    /// as the experiment, but without extra per-product adapter validation.
    pub fn solve_cpu_reference(
        &self,
        rhs: &[f64],
        tolerance: f64,
        max_iterations: usize,
    ) -> Result<SolveReport, ComputeError> {
        self.validate_rhs(rhs, tolerance, max_iterations)?;
        let result = dedaliano_engine::linalg::pcg::pcg_solve(
            &self.matrix,
            rhs,
            &self.preconditioner,
            tolerance,
            max_iterations,
        );
        self.report(rhs, tolerance, result)
    }
}

pub fn true_relative_residual(
    matrix: &CscMatrix,
    rhs: &[f64],
    x: &[f64],
) -> Result<f64, ComputeError> {
    validate_matrix(matrix)?;
    validate_batch(matrix.n, 1, rhs)?;
    validate_batch(matrix.n, 1, x)?;
    let product = matrix.sym_mat_vec(x);
    if product.iter().any(|v| !v.is_finite()) {
        return Err(ComputeError::NonFinite);
    }
    let residual = product
        .iter()
        .zip(rhs)
        .fold(0.0f64, |norm, (a, b)| norm.hypot(b - a));
    let norm = rhs.iter().fold(0.0f64, |norm, x| norm.hypot(*x));
    let relative = if norm == 0. {
        residual
    } else {
        residual / norm
    };
    if !relative.is_finite() {
        return Err(ComputeError::NonFinite);
    }
    Ok(relative)
}
