//! A solve that blows up numerically must report an error, never hand back
//! `Ok(results)` containing NaN/Inf.
//!
//! 2D has enforced this since `ffbea0686`: after every factorization it checks
//! `u_f.iter().any(|v| v.is_nan() || v.is_infinite())` and converts a
//! "successful" factorization with garbage values into
//! `Err("Singular stiffness matrix — structure is a mechanism")`. The check is
//! needed because `cholesky_decompose` only rejects a pivot `<= 1e-15` — it
//! never inspects the solved values, so a pivot that merely squeaks past the
//! floor can still produce Inf/NaN through the substitutions.
//!
//! The 3D paths never got that check. They reject only the factorization
//! itself returning `None`, so a numerically blown-up but nominally successful
//! solve returns `Ok` with non-finite displacements. These tests pin that both
//! dimensions behave the same way.
//!
//! Why it matters beyond tidiness: nothing downstream re-checks. `wasm-solver.ts`
//! guards solver *input*, not output, and `postprocess/combinations.rs` has no
//! finiteness handling at all — in `compute_envelope` the running max is seeded
//! from `results.first()` and advanced with `>`, and every IEEE-754 comparison
//! against NaN is false, so a NaN in the first case is never replaced and
//! silently poisons that field of the envelope.

use crate::common;

use common::{make_3d_input, make_input};
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;

const E: f64 = 200_000.0;

/// Ordinary fixed-base cantilever; only the load magnitude is pathological.
fn cantilever_3d(load: f64) -> SolverInput3D {
    make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2,
            fx: load,
            fy: load,
            fz: load,
            mx: load,
            my: load,
            mz: load,
            bw: None,
        })],
    )
}

fn cantilever_2d(load: f64) -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: load,
            fz: load,
            my: load,
        })],
    )
}

fn any_non_finite_3d(r: &AnalysisResults3D) -> bool {
    r.displacements.iter().any(|d| {
        !d.ux.is_finite()
            || !d.uy.is_finite()
            || !d.uz.is_finite()
            || !d.rx.is_finite()
            || !d.ry.is_finite()
            || !d.rz.is_finite()
    })
}

fn any_non_finite_2d(r: &AnalysisResults) -> bool {
    r.displacements
        .iter()
        .any(|d| !d.ux.is_finite() || !d.uz.is_finite() || !d.ry.is_finite())
}

#[test]
fn solve_3d_never_returns_non_finite_displacements() {
    // f64::MAX overflows the substitutions on an otherwise ordinary cantilever.
    // It passes input validation because it IS finite — `assertFiniteWire` on the
    // JS side accepts it, so nothing upstream stops it either.
    match linear::solve_3d(&cantilever_3d(f64::MAX)) {
        Err(_) => {} // Reported as an error: correct.
        Ok(res) => assert!(
            !any_non_finite_3d(&res),
            "solve_3d returned Ok with non-finite displacements; it must return Err instead",
        ),
    }
}

#[test]
fn solve_2d_never_returns_non_finite_displacements() {
    // The reference behaviour 3D is being brought in line with.
    match linear::solve_2d(&cantilever_2d(f64::MAX)) {
        Err(_) => {}
        Ok(res) => assert!(
            !any_non_finite_2d(&res),
            "solve_2d returned Ok with non-finite displacements; it must return Err instead",
        ),
    }
}

#[test]
fn ordinary_magnitudes_still_solve_in_both_dimensions() {
    // The guard must not turn large-but-workable models into spurious errors.
    for load in [-10.0, -1e6, 1e100, 1e250, 1e307] {
        let r3 = linear::solve_3d(&cantilever_3d(load));
        assert!(r3.is_ok(), "3D solve failed for a workable load {load:e}");
        assert!(!any_non_finite_3d(&r3.unwrap()), "3D non-finite at {load:e}");

        let r2 = linear::solve_2d(&cantilever_2d(load));
        assert!(r2.is_ok(), "2D solve failed for a workable load {load:e}");
        assert!(!any_non_finite_2d(&r2.unwrap()), "2D non-finite at {load:e}");
    }
}

/// `cholesky_decompose` must not report success on a matrix containing NaN.
///
/// Its guard is `if sum <= 1e-15 { return false }`. Every comparison against NaN is
/// false, so a NaN pivot skips the rejection, `sqrt(NaN)` is stored as the diagonal and
/// the routine returns `true` — "successful (A is SPD)" per its own doc comment, for a
/// matrix that is not a number, let alone symmetric positive definite. `lu_apply` already
/// screens its result for NaN/Inf; this brings the Cholesky path in line.
#[test]
fn cholesky_rejects_non_finite_input() {
    use dedaliano_engine::linalg::cholesky::{cholesky_decompose, cholesky_solve};

    let mut diag_nan = vec![f64::NAN, 0.0, 0.0, 1.0];
    assert!(
        !cholesky_decompose(&mut diag_nan, 2),
        "a NaN on the diagonal must be rejected, not reported as SPD",
    );

    let mut off_diag_nan = vec![1.0, f64::NAN, f64::NAN, 1.0];
    assert!(
        !cholesky_decompose(&mut off_diag_nan, 2),
        "a NaN off the diagonal must be rejected once it reaches a pivot",
    );

    let mut solve_nan = vec![f64::NAN, 0.0, 0.0, 1.0];
    assert!(
        cholesky_solve(&mut solve_nan, &[1.0, 1.0], 2).is_none(),
        "cholesky_solve must return None rather than Some([NaN, ..])",
    );

    // A genuinely SPD matrix still factorizes.
    let mut spd = vec![4.0, 1.0, 1.0, 3.0];
    assert!(cholesky_decompose(&mut spd, 2), "SPD matrix must still succeed");
}
