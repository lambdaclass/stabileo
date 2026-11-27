use std::rc::Rc;

use crate::linalg::{
    back_solve, cholesky_decompose, forward_solve, numeric_cholesky, sparse_cholesky_solve,
    CscMatrix,
};
use crate::linalg::sparse_chol::{NumericCholesky, SymbolicCholesky};
use crate::types::StructuredDiagnostic;

use super::{linear::not_positive_definite, stability::Stability};

struct StiffnessScale(Vec<f64>);

impl StiffnessScale {
    fn new(diagonal: impl Iterator<Item = f64>) -> Option<Self> {
        let roots: Vec<_> = diagonal.map(f64::sqrt).collect();
        roots.iter().all(|root| root.is_finite() && *root > 0.0).then_some(Self(roots))
    }

    fn dense(&self, k: &[f64]) -> Vec<f64> {
        let n = self.0.len();
        let mut matrix = k.to_vec();
        for i in 0..n {
            for j in 0..=i {
                let entry = k[i*n+j] / self.0[i] / self.0[j];
                matrix[i*n+j] = entry;
                matrix[j*n+i] = entry;
            }
        }
        matrix
    }

    fn sparse(&self, k: &CscMatrix) -> CscMatrix {
        let mut matrix = k.clone();
        for j in 0..k.n {
            for p in k.col_ptr[j]..k.col_ptr[j+1] {
                matrix.values[p] /= self.0[k.row_idx[p]];
                matrix.values[p] /= self.0[j];
            }
        }
        matrix
    }

    fn divide(&self, mut values: Vec<f64>) -> Vec<f64> {
        for (value, root) in values.iter_mut().zip(&self.0) {
            *value /= root;
        }
        values
    }
}

pub(super) struct ElasticCholesky<F> {
    factor: F,
    scale: Option<StiffnessScale>,
}

pub(super) type DenseCholesky = ElasticCholesky<Vec<f64>>;
pub(super) type SparseCholesky = ElasticCholesky<NumericCholesky>;

impl<F> ElasticCholesky<F> {
    fn apply(&self, rhs: &[f64], solve: impl FnOnce(&F, &[f64]) -> Vec<f64>) -> Vec<f64> {
        match &self.scale {
            Some(scale) => scale.divide(solve(&self.factor, &scale.divide(rhs.to_vec()))),
            None => solve(&self.factor, rhs),
        }
    }
}

impl DenseCholesky {
    pub(super) fn dense(k: &[f64], n: usize, stability: &Stability) -> Result<Self, String> {
        let (mut factor, scale) = if stability.needs_accuracy_check() {
            let scale = StiffnessScale::new((0..n).map(|i| k[i*n+i]))
                .ok_or_else(|| stability.conditioning_refusal())?;
            (scale.dense(k), Some(scale))
        } else {
            (k.to_vec(), None)
        };
        if !cholesky_decompose(&mut factor, n) { return Err(not_positive_definite()); }
        Ok(Self { factor, scale })
    }

    pub(super) fn solve(&self, rhs: &[f64]) -> Vec<f64> {
        self.apply(rhs, |factor, rhs| {
            let n = rhs.len();
            back_solve(factor, &forward_solve(factor, rhs, n), n)
        })
    }

    pub(super) fn conditioning(&self, k: &[f64], n: usize) -> Option<StructuredDiagnostic> {
        if let Some(scale) = &self.scale {
            crate::known_issues::dense_conditioning(k, n).or_else(|| {
                crate::known_issues::dense_factor_conditioning(&scale.dense(k), n, Some(&self.factor))
            })
        } else {
            crate::known_issues::dense_factor_conditioning(k, n, Some(&self.factor))
        }
    }
}

impl SparseCholesky {
    pub(super) fn sparse(
        k: &CscMatrix, symbolic: &Rc<SymbolicCholesky>, stability: &Stability,
    ) -> Result<Self, String> {
        let (factor, scale) = if stability.needs_accuracy_check() {
            let scale = StiffnessScale::new(k.diagonal().into_iter())
                .ok_or_else(|| stability.conditioning_refusal())?;
            (numeric_cholesky(symbolic, &scale.sparse(k)), Some(scale))
        } else {
            (numeric_cholesky(symbolic, k), None)
        };
        Ok(Self { factor: factor.ok_or_else(not_positive_definite)?, scale })
    }

    pub(super) fn solve(&self, rhs: &[f64]) -> Vec<f64> {
        self.apply(rhs, sparse_cholesky_solve)
    }

    pub(super) fn conditioning(&self, k: &CscMatrix) -> Option<StructuredDiagnostic> {
        if let Some(scale) = &self.scale {
            crate::known_issues::sparse_conditioning(k).or_else(|| {
                crate::known_issues::sparse_factor_conditioning(&scale.sparse(k), Some(&self.factor))
            })
        } else {
            crate::known_issues::sparse_factor_conditioning(k, Some(&self.factor))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::symbolic_cholesky;

    #[test]
    fn conditional_dense_and_sparse_pivots_use_the_diagonal_scale() {
        let mut stability = Stability::stable();
        stability.kappa = 1e8;
        stability.anisotropy = 1e5;
        assert!(stability.needs_accuracy_check());
        for [a, b] in [[1.0, 1.0], [2.0_f64.powi(-40), 2.0_f64.powi(30)], [2.0_f64.powi(40), 2.0_f64.powi(-30)]] {
            for (offdiag, passes) in [(1.0, false), (1.0_f64.next_down(), false), (1.0 - 16.0 * f64::EPSILON, true)] {
                let k = [a*a, offdiag*a*b, offdiag*a*b, b*b];
                let sparse = CscMatrix::from_dense_symmetric_exact(&k, 2);
                let symbolic = Rc::new(symbolic_cholesky(&sparse));
                assert_eq!(DenseCholesky::dense(&k, 2, &stability).is_ok(), passes);
                assert_eq!(SparseCholesky::sparse(&sparse, &symbolic, &stability).is_ok(), passes);
            }
        }
    }
}
