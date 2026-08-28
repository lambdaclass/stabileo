//! Sparse-tangent helpers shared by the nonlinear solvers (corotational,
//! arc-length, contact): a symbolic Cholesky factorization cached across
//! Newton iterations, conversion of the dense free block of the tangent to
//! constraint-reduced CSC form, and an SPD sparse solve with a size-capped
//! dense LU fallback.
//!
//! Hoisted verbatim from `corotational.rs` (the reference implementation);
//! `arc_length.rs` carried near-identical private copies. The only
//! reconciled difference is in `tangent_free_sparse`: corotational's copy
//! took the full dense tangent and extracted the free block internally,
//! while arc-length's took the already-extracted free block (`k_ff`) because
//! its callers hold `k_ff` for the dense path too. The shared version takes
//! `k_ff`; corotational call sites do the same `extract_submatrix` call the
//! old private copy did internally, so the computation is unchanged.

use crate::linalg::*;
use super::constraints::FreeConstraintSystem;
use super::time_integration::MAX_DENSE_FALLBACK_DOFS;

/// Sparse symbolic Cholesky factorization cached across Newton iterations.
/// The tangent's sparsity pattern is constant within a solve call (structure
/// and constraints don't change), so the symbolic phase runs once and only
/// the numeric phase repeats per iteration. `col_ptr`/`row_idx` fingerprint
/// the pattern the symbolic was built from: if a later tangent's pattern
/// differs (an entry crossing exactly zero), the symbolic is rebuilt.
pub(crate) struct SparseSymbolicCache {
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
    sym: std::rc::Rc<SymbolicCholesky>,
}

/// Return the symbolic factorization for `k_s`, building (or rebuilding) it
/// only when the pattern changed since the last call.
pub(crate) fn cached_symbolic<'a>(
    cache: &'a mut Option<SparseSymbolicCache>,
    k_s: &CscMatrix,
) -> &'a std::rc::Rc<SymbolicCholesky> {
    let stale = match cache {
        Some(c) => c.col_ptr != k_s.col_ptr || c.row_idx != k_s.row_idx,
        None => true,
    };
    if stale {
        *cache = Some(SparseSymbolicCache {
            col_ptr: k_s.col_ptr.clone(),
            row_idx: k_s.row_idx.clone(),
            sym: std::rc::Rc::new(symbolic_cholesky(k_s)),
        });
    }
    &cache.as_ref().unwrap().sym
}

/// Convert the dense free block of the tangent to CSC and apply constraint
/// reduction in sparse form (used when ns >= SPARSE_THRESHOLD).
pub(crate) fn tangent_free_sparse(
    k_ff: &[f64],
    nf: usize,
    cs: &Option<FreeConstraintSystem>,
) -> CscMatrix {
    let k_ff_csc = CscMatrix::from_dense_symmetric(k_ff, nf);
    if let Some(ref cs) = cs {
        cs.reduce_matrix_sparse(&k_ff_csc)
    } else {
        k_ff_csc
    }
}

/// Solve K_s * x = r_s with sparse Cholesky, reusing the cached symbolic
/// factorization for the numeric phase. On non-SPD tangents falls back to
/// dense LU, size-capped by `MAX_DENSE_FALLBACK_DOFS` — mirrors
/// `time_integration::solve_spd_sparse_or_dense` /
/// `factor_effective_stiffness`.
pub(crate) fn solve_tangent_sparse(
    k_s: &CscMatrix,
    r_s: &[f64],
    cache: &mut Option<SparseSymbolicCache>,
) -> Result<Vec<f64>, String> {
    let sym = cached_symbolic(cache, k_s);
    if let Some(num) = numeric_cholesky(sym, k_s) {
        return Ok(sparse_cholesky_solve(&num, r_s));
    }
    let n = k_s.n;
    if n > MAX_DENSE_FALLBACK_DOFS {
        return Err(format!(
            "Tangent stiffness is not SPD (sparse Cholesky) and the dense LU fallback would need a {n}×{n} dense matrix ({} MB), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
            8 * n * n / 1_000_000
        ));
    }
    let mut k_work = k_s.to_dense_symmetric();
    let mut r_work = r_s.to_vec();
    lu_solve(&mut k_work, &mut r_work, n).ok_or_else(|| {
        "Singular tangent stiffness — structure may be a mechanism \
         or load increment too large"
            .to_string()
    })
}
