# Staged support spring history containment (2026-11-12)

PR #1952, review round 12.

Staged history detection tracked active members and shells but omitted support
springs. Adding or removing a spring after loading could therefore recover
reactions and member forces from the current stiffness and an obsolete cumulative
displacement without a warning. Changing the effective spring stiffness had the
same problem. The unchanged member set and unchanged restrained DOFs did not
certify that the stiffness history was recoverable.

Both dimensions now compare one shared stiffness fingerprint. Its entries include
active member and shell identities, support identities with rigid restraints or
positive springs, rigid restraint DOFs, and every
nonzero coefficient of the assembled full stiffness matrix, including support
springs and artificial stabilization. Dense and sparse storage feed the same
fingerprint and the same monotone recovery check. Exact coefficient bits are
compared without a tolerance or a collision-prone digest. A new stiffness
contributor cannot bypass history detection by being omitted from an element-ID
list: its assembled coefficients enter the fingerprint automatically.

A stiffness change after earlier loading or motion uses the existing containment:
reactions, member and constraint forces, and spatial shell stresses are empty,
with structured `result_quantity_unavailable` warnings. Retained cumulative
displacements are incremental history, not certified equilibrium results. Later
stages and final results stay unavailable. Unchanged springs and stiffness
changes before loading retain their answers.

The shared fixture `engine/tests/fixtures/staged-springs-r12.json` contains spring
addition, removal, replacement by a different stiffness and unchanged controls in
2D and 3D. Two cantilevers with tied tips give an independently calculable elastic
stiffness. Native and WASM tests compare any returned reaction, member shear and
member moment with that hand calculation before checking containment. They cover
signed loads, tiny nonzero loads, zero load, zero and tiny positive spring
stiffness, changes before loading, later-stage
propagation and dense/sparse boundaries. The changed-stiffness fixture replaces a
weak spring with a stronger spring at the tied tip; staged input has no per-stage
spring-property editing field.

This change does not implement spring reference displacement at activation or
redistribution after removal. Those require a complete staged state formulation,
including member activation and released forces, and remain outside this blocker.
The fingerprint deliberately covers the full assembled matrix before constraint
reduction, so restrained and dependent contributions cannot disappear from it.
No tolerance, baseline or existing engineering assertion changed.

The same fixtures were replayed against local `origin/main` in this worktree.
The untracked round-12 handoff records the revision and complete input/output
evidence for the coordinator's SA-2026-061 decision. No advisory is created or
modified here.
