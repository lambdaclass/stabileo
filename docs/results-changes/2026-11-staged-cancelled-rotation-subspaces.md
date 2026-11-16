# Cancelled staged moments in free-rotation subspaces (2026-11-12)

PR [#1943](https://github.com/lambdaclass/stabileo/pull/1943).
Results-change entry `staged-cancelled-rotation-subspaces`.

A stage that removed a moment-carrying member and cancelled its applied moment
could leave a nonzero incremental RHS along an unloaded free rotation. The
previous correction replaced increments only at exactly zero stiffness columns.
An oblique released rotation can span several nonzero columns, so the same
physical cancellation still loaded an artificial pin and could refuse or change
the accumulated rotation.

Both dimensions and both dense and sparse stage dispatches now use one shared
projection along the stability analysis's free-rotation directions. A direction
is eligible only when exact rational arithmetic on the represented binary
matrix and direction proves a zero matrix-vector product, or the existing
release predicate proves every retained member and spring leaves
it free. This preserves numerical refusals for unresolved positive stiffness.
Accumulated applied loads are checked before projection, so unsupported moments
of either sign still refuse. Only the incremental applied-load contribution is
projected; prescribed-displacement contributions remain in the solve RHS and
in the existing artificial-pin check. Supported load components retain their
incremental response. Exactly unloaded disconnected DOFs are excluded using
physical zero columns and cumulative loads. No tolerance or assertion bound was
relaxed.

The retained `engine/tests/fixtures/staged-round8.json` has two parallel members.
The survivor releases end torsion. The first stage applies torque along their
oblique axis; the second removes the torsion-carrying member and cancels that
torque. The expected accumulated end rotation follows directly from GJ/L of
the removed member. Final reactions and member forces vanish. Native and public
WASM checks cover coordinate-plane rotations, both signs of obliquity, the
axis-aligned equivalent, equal-DOF reduction, both sides of the dense/sparse
dispatch boundary, and nonzero residual moments on either side of zero. A
supported transverse moment is checked against an independent single-stage
linear solve. Internal tests also cover two independent null rotations,
prescribed drives, negative stiffness and strictly positive stiffness.

A native replay using frozen `origin/main` engine sources, original manifests
and lockfile at `6db1f14d8ca5b375f50c4b68824a250e3896fd0d` returns a changed final rotation for
this fixture and attaches a `NUM-INVARIANCE` warning for known issue #762.
This observation is a warned result, not evidence of a silently wrong main or
release result. No historical release binary was replayed.

Re-run saved staged histories involving member removal and moment cancellation.
Solve status, accumulated rotations, member forces and reactions can change.
The registry selects saved construction phases. Regular linear and nonlinear
solvers do not call the changed stage function; public native and WASM staged
exports share it. This change introduces no nonlinear staged solver.

The required staged WASM target now also runs the round-seven and round-eight
scripts. The CI script target includes round-seven reaction assertions. The
plastic-conditioning documentation now identifies its supplementary experiment
as an isolated parent plastic-module replay with different engine dependencies,
without claiming a whole-parent observation.
