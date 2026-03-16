//! Tolerance policy for the Dedaliano engine test suite.
//!
//! # Policy by test type
//!
//! | Tier | Type | Rel Tol | Abs Tol | Rationale |
//! |------|------|---------|---------|-----------|
//! | 1 | Parity (Rust vs TS) | 1e-6 (disp), 1e-4 (force) | 1e-8 | Identical algorithms must match |
//! | 2 | Analytical / NAFEMS / ANSYS VM | 0.01–0.02 | 1e-6 | FE approximation error |
//! | 3 | Domain / physical | 0.02–0.05 | 1e-6 | Complex phenomena |
//! | 4 | Approximate methods | 0.05–0.10 | 1e-3 | Inherently approximate |
//!
//! # Rules
//!
//! - Equilibrium sums (ΣF=0, ΣM=0) use Tier 1 absolute tolerance (1e-6 to 1e-10)
//!   because equilibrium is exact, not subject to FE approximation.
//! - Eigenvalues: 0.02 for fundamental modes, up to 0.08 for higher modes.
//! - Any tolerance > 0.05 must have an inline comment explaining why.
//! - Regression tests should use the tightest tolerance that passes reliably.
//! - Never use tolerance > 0.10 without documenting the physical reason.

/// Tier 1: Parity tests (Rust vs TS solver)
pub mod parity {
    pub const REL_TOL_DISP: f64 = 1e-6;
    pub const REL_TOL_FORCE: f64 = 1e-4;
    pub const ABS_TOL: f64 = 1e-8;
}

/// Tier 2: Analytical benchmarks (closed-form, NAFEMS, ANSYS VM)
pub mod analytical {
    /// Standard result tolerance (displacement, reaction, moment)
    pub const REL_TOL: f64 = 0.02;
    /// Tight result tolerance (well-converged problems)
    pub const REL_TOL_TIGHT: f64 = 0.01;
    /// Looser tolerance for secondary/higher-order results
    pub const REL_TOL_LOOSE: f64 = 0.05;
    /// Absolute tolerance floor
    pub const ABS_TOL: f64 = 1e-6;
    /// Equilibrium sum tolerance (exact conservation law)
    pub const EQUILIBRIUM_ABS: f64 = 1e-6;
}

/// Tier 3: Domain/physical validation tests
pub mod domain {
    pub const REL_TOL: f64 = 0.03;
    pub const REL_TOL_LOOSE: f64 = 0.05;
    pub const ABS_TOL: f64 = 1e-6;
}

/// Tier 4: Approximate methods (portal, moment distribution, etc.)
pub mod approximate {
    pub const REL_TOL: f64 = 0.08;
    pub const REL_TOL_LOOSE: f64 = 0.10;
    pub const ABS_TOL: f64 = 1e-3;
}

/// Eigenvalue tolerances (mode-dependent)
pub mod eigenvalue {
    /// Fundamental mode (first few)
    pub const REL_TOL_FUNDAMENTAL: f64 = 0.02;
    /// Higher modes
    pub const REL_TOL_HIGHER: f64 = 0.05;
    /// Buckling load ratios
    pub const REL_TOL_BUCKLING: f64 = 0.08;
}

/// Assert that `actual` is within `rel_tol` of `expected`, with `abs_tol` floor.
/// Panics with a descriptive message including the label.
#[allow(dead_code)]
pub fn assert_close(actual: f64, expected: f64, rel_tol: f64, abs_tol: f64, label: &str) {
    let diff = (actual - expected).abs();
    let rel = if expected.abs() > abs_tol {
        diff / expected.abs()
    } else {
        diff
    };
    assert!(
        diff < abs_tol || rel < rel_tol,
        "{label}: expected {expected:.6e}, got {actual:.6e} (rel_err={rel:.2e}, tol={rel_tol:.0e})"
    );
}
