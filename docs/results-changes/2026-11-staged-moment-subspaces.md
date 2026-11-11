# Staged moment history and kinematic rotation subspaces (2026-11-11)

PR #1943, issue #1846. Results-change entry `staged-moment-subspaces`.

Staged 2D and 3D solves now assemble the accumulated applied load vector before
checking inactive DOFs and unsupported free rotations. Previously those checks
saw only the current increment. Removing the member that restrained an earlier
nodal moment could return the old rotation and an unbalanced later stage without
a diagnostic. Such histories now refuse the unsupported moment. The incremental
solve right-hand side is retained; this change does not redesign construction
history equilibrium or cancellation increments.

A rigid arm can map several free master rotations into the same slave
translation. Checking each basis vector separately counted dependent motions as
independent mechanisms. The shared stability analysis now splits that free
rotation subspace into the translation map's row space and nullspace. Only the
row space contributes moving directions; the nullspace retains harmless solve
pins. For the arm `(0,a,b)` with free master `ry/rz`, the combination `(a,b)` is
harmless and kinematics reports one moving mode when either arm component is
nonzero. This also makes the count independent of the chosen rotation basis.

Kinematic rank now uses equivalent positive spring weights chosen from the
member stiffness scale, with a unit fallback for an entirely zero member
matrix. For positive semidefinite member and spring contributions, changing
positive spring weights preserves the intersection of their nullspaces.
Consequently a positive spring restraining the transverse direction of a
single diagonal truss yields zero mechanism modes regardless of its stiffness.
The original spring weights still reach every elastic solve and its numerical
refusal checks. Positive translational eigenvalues remain stiffness columns,
including their full anisotropy in those checks, instead of becoming free
translations at the local soft-direction cutoff. The reviewed small positive
springs therefore receive a conditioning refusal rather than a claim of free
translation. A zero-mode kinematic result is not a certificate that the
elastic response can be resolved. No rank tolerance, conditioning limit or
accuracy assertion is relaxed.

Re-run staged histories that remove rotational restraints after moments have
been applied, and constrained or spring-supported models whose kinematic mode
count informed review. The registry conservatively selects members, constraints
and springs because saved stamps do not distinguish these paths. The stage
history defect is reproducible on local origin/main; the coordinator decides
whether an advisory is needed. This entry assigns no advisory number.

Targeted native and public WASM regressions cover staged 2D/3D dense/sparse
paths, retained-member and zero-load controls, safe refusal of incompatible
cancellation increments, rigid-link and eccentric arms with zero and nonzero
components, coordinate-swapped arms, held rotations, linear and nonlinear
entry points, positive and zero springs, equivalent unit-scaled spring inputs,
and the kinematic sparse-dispatch boundary. Physical solve refusals and a
resolvable loaded spring control are checked separately from mechanism counts.
