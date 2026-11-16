# Constraint-determined staged equilibrium (2026-11-13)

PR #1952, review round 23. Registry entry `staged-constrained-determinacy`.

A stage without active member, shell or spring stiffness can still be fully
determined by supports and constraints. The previous shared check required zero
numbered free DOFs, so it withheld forces for rigid links and equal-DOF ties to
fixed supports even when no independent free DOF remained.

Both dimensions now share a check requiring exact agreement with prescribed
restrained motion and, for constrained free DOFs, zero independent DOFs and exact
agreement with the constraint-induced motion. The physical residual check and
history containment still apply. Partial constraints and inconsistent states
remain unavailable or refused. No tolerance changes.

The exact `staged-3d-determined` advisory replay now retains its reactions,
constraint forces and displacement state without an unavailable-state warning.
Its historical before fields remain unchanged. Native and WASM regressions cover
that model and its planar equivalent, rigid links and equal-DOF ties, both load
signs, zero load, both prescribed-motion signs, zero motion, dense and sparse
assembly, unchanged later stages and partial-constraint refusals. Internal tests
also reject states inconsistent with their constraint-prescribed displacement.

The 3D staged result builder now converts displacements and maps reactions using
the real inclined transforms retained by the physical residual assembly. Both
operations use the round-20 frame types. The hand oracle uses anisotropic
springs and signed and zero loads. Public 2D/3D staged inclined supports remain
explicitly refused; origin/main also refuses them, so this internal recovery
repair is not a newly discovered silent public result on main. Enabling staged
inclined supports requires a separate review of prescribed motion, constraint
frames and stage histories.
