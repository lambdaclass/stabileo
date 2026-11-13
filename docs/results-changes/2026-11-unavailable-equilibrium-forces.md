# Withhold unavailable equilibrium forces (2026-11-13)

PR #1952, review round 17.

Both staged result builders now check the physical free-DOF residual after
constraint projection. The check uses the existing equilibrium metric with the
static residual criterion (`relative_residual < 1e-6`), cumulative applied loads,
physical support driving, and no artificial stiffness. The physical residual
owns its applied load vector, so the check cannot normalize against a different
stage load. A failed check withholds reactions, member forces, constraint forces
and spatial shell stresses through `result_quantity_unavailable`. Cumulative
displacements remain explicitly uncertified history. Existing no-physical-
stiffness and unavailable-history branches use the same withholding operation.
An inherited unavailable-stage diagnostic also withholds these collections in
later stages.

P-Delta already warned when its physical free residual or global force/moment
balance failed the requested tolerance, but returned reactions alongside that
warning. Both dimensions now return an empty reaction collection in that case.
The equilibrium summary remains available to explain the failure. Member forces,
constraint forces, stresses and displacements retain their existing meanings.

One shared `withhold` operation takes a typed quantity scope, clears its matching
fields and derived summary, and attaches diagnostics for those fields together.
The 2D and 3D result implementations enumerate their collections. Both staged
builders and both P-Delta result builders go through this operation. Dynamic
legacy estimates and unrelated analyses are outside this change.

The reproducer commit contains ignored tests for loaded released-rotation
recovery, no-physical-stiffness field retention, both sides of the static residual
criterion, and P-Delta reactions returned alongside an unavailable diagnostic.
They fail against the preceding implementation. Public staged loaded released
rotations already fail preflight on this branch and on the replayed origin/main;
the supplied-state tests exercise recovery independently of that preflight.
Public native and WASM controls cover signed/zero moments, released/unreleased
members, empty first stages and later diagnostic inheritance. Forced dense/sparse
P-Delta tests cover converged and uniterated states, both equilibrium-only and
residual failures, and correctly equilibrated inputs retaining their answers.

This is containment. It does not implement redistribution after loaded-member
removal (#1996), strain since activation, or finite-displacement P-Delta reactions.
The existing ignored #1996 test remains unchanged. No tolerance or numerical
baseline is relaxed, and no advisory is created here.
