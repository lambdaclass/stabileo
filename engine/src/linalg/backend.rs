use super::CscMatrix;
use std::{fmt, future::Future};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Precision {
    CpuF64,
    ExperimentalF32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ComputeError {
    InvalidMatrix,
    InvalidBatch,
    NonFinite,
    NumericRange,
    ResourceLimit,
    Unavailable(String),
    Device(String),
}

impl fmt::Display for ComputeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for ComputeError {}

pub trait SparseBackend {
    type Operator: PreparedOperator;
    fn prepare(
        &mut self,
        matrix: CscMatrix,
        max_vectors: usize,
    ) -> impl Future<Output = Result<Self::Operator, ComputeError>>;
}

pub trait PreparedOperator {
    fn precision(&self) -> Precision;
    fn dimension(&self) -> usize;
    fn apply_batch(
        &mut self,
        vectors: &[f64],
    ) -> impl Future<Output = Result<Vec<f64>, ComputeError>>;
}

pub fn validate_matrix(matrix: &CscMatrix) -> Result<(), ComputeError> {
    let n = matrix.n;
    if n == 0
        || n.checked_add(1) != Some(matrix.col_ptr.len())
        || matrix.row_idx.len() != matrix.values.len()
        || matrix.col_ptr.first() != Some(&0)
        || matrix.col_ptr.last() != Some(&matrix.values.len())
    {
        return Err(ComputeError::InvalidMatrix);
    }
    for col in 0..n {
        let start = matrix.col_ptr[col];
        let end = matrix.col_ptr[col + 1];
        if start > end || end > matrix.values.len() {
            return Err(ComputeError::InvalidMatrix);
        }
        let rows = &matrix.row_idx[start..end];
        if rows.iter().any(|&r| r < col || r >= n) || rows.windows(2).any(|r| r[0] >= r[1]) {
            return Err(ComputeError::InvalidMatrix);
        }
    }
    if matrix.values.iter().any(|v| !v.is_finite()) {
        return Err(ComputeError::NonFinite);
    }
    Ok(())
}

pub fn validate_batch(
    n: usize,
    max_vectors: usize,
    vectors: &[f64],
) -> Result<usize, ComputeError> {
    if n == 0
        || max_vectors == 0
        || vectors.is_empty()
        || !vectors.len().is_multiple_of(n)
        || vectors.len() / n > max_vectors
    {
        return Err(ComputeError::InvalidBatch);
    }
    if vectors.iter().any(|v| !v.is_finite()) {
        return Err(ComputeError::NonFinite);
    }
    Ok(vectors.len() / n)
}

pub struct CpuBackend;
pub struct CpuOperator {
    matrix: CscMatrix,
    max_vectors: usize,
}

impl SparseBackend for CpuBackend {
    type Operator = CpuOperator;
    async fn prepare(
        &mut self,
        matrix: CscMatrix,
        max_vectors: usize,
    ) -> Result<CpuOperator, ComputeError> {
        validate_matrix(&matrix)?;
        if max_vectors == 0 {
            return Err(ComputeError::InvalidBatch);
        }
        matrix
            .n
            .checked_mul(max_vectors)
            .ok_or(ComputeError::ResourceLimit)?;
        Ok(CpuOperator {
            matrix,
            max_vectors,
        })
    }
}

impl PreparedOperator for CpuOperator {
    fn precision(&self) -> Precision {
        Precision::CpuF64
    }
    fn dimension(&self) -> usize {
        self.matrix.n
    }
    async fn apply_batch(&mut self, vectors: &[f64]) -> Result<Vec<f64>, ComputeError> {
        validate_batch(self.matrix.n, self.max_vectors, vectors)?;
        let mut result = Vec::with_capacity(vectors.len());
        for rhs in vectors.chunks_exact(self.matrix.n) {
            result.extend(self.matrix.sym_mat_vec(rhs));
        }
        if result.iter().any(|v| !v.is_finite()) {
            return Err(ComputeError::NonFinite);
        }
        Ok(result)
    }
}
