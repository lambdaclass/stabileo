# Staged construction checks physical stiffness and solution accuracy (2026-11-11)

PR #1943, issue #1846. Results-change entry `staged-free-stiffness`.

Staged construction in 2D and 3D now separates physical stiffness from inactive
solve pins. A reduced free DOF is dormant only when its stiffness column and
both incremental and directly applied reduced loads are zero, and no nonzero
constraint coefficient maps it to an active member or shell node. Dormant DOFs
are excluded from stability checks and assigned a solve diagonal scaled to active stiffness afterward.
The physical matrix used for reactions is never modified by this treatment.
Unloaded future stories and partial constraints solve. Nonzero reduced loads
on free inactive DOFs are refused; this is not complete stage-load validation.
Member loads applied before erection and constrained nodal loads that reduce
to zero remain pre-existing limitations outside this round’s repair scope. An unconnected settled support has zero stiffness reaction.
Real springs retain their physical response.

Stage solves require SPD Cholesky, use the regular linear refinement routines
and reject nonfinite solved increments. Sparse stages consume the assembler’s
free matrix directly. Dense matrices retain exact nonzeros; sparse matrices
retain the regular assembler’s entry filtering. The 3D dispatch follows regular
linear’s total-DOF boundary, including when the free count is 63 or 64.

These checks can change solve availability, translations, reactions and member
actions in unreleased models too. Since saved analysis stamps do not identify
construction histories separately, the registry conservatively selects models
with members, shells, constraints, springs or settlements. Re-run construction
histories and review demands derived from old results. This entry also covers
review changes on the unmerged branch and does not claim every selected model
previously returned an incorrect result.

Targeted native regressions cover two-stage erection, each constraint kind,
partial coupling, premature forces and moments, one-direction springs in unit
copies, inactive settlements, finite solution checks, and dense/sparse refusal
parity. Exact archived #1085, #1011 and #1846 comment models check translations,
rotations and member actions across units and one- and two-stage load histories.
Public WASM tests cover the affected staged paths and the shared kinematic and
support-spring checks; the WASM CI job now runs them. No tolerance or baseline
was loosened. The broader original rotational-stiffness failure and its retained
silent main evidence remain in the existing
[SA-2026-060 draft](../advisories/SA-2026-060-staged-orphan-rotations.md).
