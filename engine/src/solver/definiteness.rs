//! Warning when the stiffness matrix the solver factored is not positive
//! definite: singular (mechanism, near-mechanism) or indefinite (unstable).
//!
//! The solver still returns results in those cases — through dense LU, a
//! diagonal shift, or a Cholesky factorization whose pivots are round-off —
//! and those results may be meaningless. The diagnostic never changes numeric
//! results; it only reports what the factorization already showed.
//!
//! Numerical singularity on a *successful* Cholesky is judged per pivot: the
//! pivot `d_j = L_jj²` is the Schur complement left of `K_jj` after
//! eliminating the previous DOFs. When `d_j ≤ SINGULAR_PIVOT_RATIO · K_jj`
//! the DOF's remaining stiffness is at the level of the rounding errors of
//! the elimination, so `K` is numerically singular.

use crate::linalg::sparse::CscMatrix;
use crate::linalg::sparse_chol::NumericCholesky;
use crate::types::{DiagnosticCode, Severity, StructuredDiagnostic};

/// Pivot-to-diagonal ratio below which a Cholesky pivot is round-off (64 ε).
pub const SINGULAR_PIVOT_RATIO: f64 = 64.0 * f64::EPSILON;

/// The warning, with `detail` saying how non-definiteness was detected.
pub fn not_positive_definite(detail: &str) -> StructuredDiagnostic {
    StructuredDiagnostic::global(
        DiagnosticCode::StiffnessNotPositiveDefinite,
        Severity::Warning,
        format!(
            "Stiffness matrix is singular or indefinite ({detail}): the structure is a mechanism, \
             nearly one, or unstable, and the results may be meaningless"
        ),
    )
    .with_phase("factorization")
}

/// Warning for a successful dense Cholesky whose smallest pivot ratio is
/// round-off. `l` holds the factor in its lower triangle (row-major n×n),
/// `k` the factored matrix.
pub fn dense_pivot_check(l: &[f64], k: &[f64], n: usize) -> Option<StructuredDiagnostic> {
    let (ratio, dof) = (0..n)
        .map(|j| (l[j * n + j] * l[j * n + j] / k[j * n + j], j))
        .min_by(|a, b| a.0.total_cmp(&b.0))?;
    pivot_warning(ratio, dof)
}

/// As `dense_pivot_check` for a sparse factor of `k` (lower-triangle CSC).
pub fn sparse_pivot_check(num: &NumericCholesky, k: &CscMatrix) -> Option<StructuredDiagnostic> {
    let sym = &num.symbolic;
    let mut diag = vec![0.0f64; k.n];
    for (j, d) in diag.iter_mut().enumerate() {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            if k.row_idx[p] == j {
                *d = k.values[p];
            }
        }
    }
    let (ratio, dof) = (0..sym.n)
        .map(|j| {
            let ljj = num.l_values[sym.l_col_ptr[j]];
            let old = sym.perm[j];
            (ljj * ljj / diag[old], old)
        })
        .min_by(|a, b| a.0.total_cmp(&b.0))?;
    pivot_warning(ratio, dof)
}

fn pivot_warning(ratio: f64, dof: usize) -> Option<StructuredDiagnostic> {
    // NaN (zero diagonal) and non-positive ratios count as singular too.
    if ratio > SINGULAR_PIVOT_RATIO {
        return None;
    }
    Some(
        not_positive_definite(&format!(
            "Cholesky pivot of DOF {dof} is {ratio:.1e} of its diagonal, at round-off level"
        ))
        .with_value(ratio, SINGULAR_PIVOT_RATIO)
        .with_dofs(vec![dof]),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::cholesky_decompose;
    use crate::linalg::sparse_chol::{numeric_cholesky, symbolic_cholesky};
    use std::rc::Rc;

    #[test]
    fn well_conditioned_passes_and_round_off_pivot_is_flagged() {
        // [[2,-1],[-1,2]]: pivots 2 and 1.5, no warning.
        let k = vec![2.0, -1.0, -1.0, 2.0];
        let mut l = k.clone();
        assert!(cholesky_decompose(&mut l, 2));
        assert!(dense_pivot_check(&l, &k, 2).is_none());
        // [[1e6, 1e6], [1e6, 1e6·(1 + 4ε)]]: the second pivot passes Cholesky's
        // absolute threshold but is 4ε of its diagonal — round-off: flagged.
        let k = vec![1e6, 1e6, 1e6, 1e6 * (1.0 + 4.0 * f64::EPSILON)];
        let mut l = k.clone();
        assert!(cholesky_decompose(&mut l, 2));
        let d = dense_pivot_check(&l, &k, 2).expect("round-off pivot flagged");
        assert_eq!(d.code, DiagnosticCode::StiffnessNotPositiveDefinite);
        assert_eq!(d.severity, Severity::Warning);
        assert_eq!(d.dof_indices, vec![1]);
        // Sparse factor agrees.
        let csc = CscMatrix::from_dense_symmetric(&k, 2);
        let num = numeric_cholesky(&Rc::new(symbolic_cholesky(&csc)), &csc).unwrap();
        assert!(sparse_pivot_check(&num, &csc).is_some());
        let k = vec![2.0, -1.0, -1.0, 2.0];
        let csc = CscMatrix::from_dense_symmetric(&k, 2);
        let num = numeric_cholesky(&Rc::new(symbolic_cholesky(&csc)), &csc).unwrap();
        assert!(sparse_pivot_check(&num, &csc).is_none());
    }
}
