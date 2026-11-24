# Certify planar nonlinear trial and recovery states (2026-11-24)

PR #2539, following issue #2510. Re-run planar arc-length analyses with
prescribed support motion or displacement ties, and planar co-rotational
warm starts that reported a partial load factor.

Arc length now rebuilds dependent displacements from the absolute independent
coordinates and the prescribed support positions before assembling the tangent
or checking equilibrium and the radius. In the warm-start regression, the
previous implementation reported a master displacement of \(2^{54} + 4\) and
a tied slave displacement of \(2^{54}\) in the same accepted step. The solver
now preserves the tie at each accepted state. If a predictor's displacement
increment rounds away at a warm start, an equilibrium trial at the same
displacement can reach the requested radius through its load coordinate.
The trial still has to pass both acceptance checks.

A singular trial tangent can trigger a smaller-radius retry from the exact
accepted checkpoint. If the radius floor prevents another retry, the result
reports nonconvergence and retains the accepted history. The initial radius
must lie within the configured finite positive bounds, and the convergence
tolerance must be finite and positive.

Both planar co-rotational drivers assemble and recover the same weighted load
pattern at partial warm-start increments. In the warm-start regression the correct half-load force on a unit
spring is 1. The previous solver returned a displacement of 0 while recovery
used the weighted load. At the half-load checkpoint the displacement is now
1 and the fixed reaction in the same loading direction is −1.

The Riks–Crisfield evidence was regenerated from the corrected production
driver. Both cases retain all accepted steps. The von Mises upper-limit
bracket changes from 1253 to 1262, and the apex displacement relative error
changes from 0.0001026254819899245 to 0.000011491338515220323. The independent
equilibrium and limit checks use their existing references and tolerances,
and the browser WASM result is checked against the native path.
