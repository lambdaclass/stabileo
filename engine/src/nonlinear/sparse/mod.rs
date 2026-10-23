//! Sparse direct factorizations for the nonlinear driver's tangent systems.
//!
//! The tangent of a nonlinear analysis is not always positive definite:
//! past a limit or bifurcation point, under softening, or with compressive
//! geometric stiffness it is indefinite, and there the engine's Cholesky
//! (`linalg::sparse_chol`) refuses it. Two factorizations cover that:
//!
//! - [`ldlt_numeric`]: LDLᵀ without pivoting, simplicial, up-looking (Davis's
//!   LDL, ACM TOMS 31(4), 2005), on a fill-reducing AMD ordering. For
//!   symmetric tangents, definite or not. Its pivots give the inertia
//!   (Sylvester's law), the count of negative eigenvalues the driver uses to
//!   detect limit and bifurcation points. It refuses a pivot too small to
//!   divide by, which an ordering chosen for fill and not for stability can
//!   meet on an indefinite matrix.
//! - [`lu_numeric`]: LU with threshold partial pivoting, left-looking
//!   (Gilbert–Peierls; Davis, *Direct Methods for Sparse Linear Systems*,
//!   SIAM 2006, `cs_lu`). The fallback when LDLᵀ meets a tiny pivot, or when
//!   the tangent is not symmetric. It gives the sign of the determinant, not
//!   the inertia.
//!
//! Both work on a [`SparsePattern`] built once from the element
//! connectivity: the symbolic phase of LDLᵀ is computed once per pattern and
//! reused for every iteration. Everything is deterministic: the same matrix
//! gives bit-identical factors and solutions in every runtime.

mod ldlt;
mod lu;
mod pattern;
mod supervariables;

pub use ldlt::{ldlt_numeric, ldlt_numeric_simplicial, ldlt_numeric_supernodal, ldlt_symbolic, ldlt_symbolic_plain, ldlt_symbolic_with_perm, LdltError, LdltFactor, LdltSymbolic};
pub use lu::{lu_numeric, LuFactor};
pub use pattern::{SparseMatrix, SparsePattern};
pub use supervariables::supervariable_groups;
