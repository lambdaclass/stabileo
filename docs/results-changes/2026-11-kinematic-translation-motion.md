# Kinematic checks distinguish rigid-arm mechanisms from elastic refusals (2026-11-11)

PR #1943, issue #1846. Results-change entry `kinematic-translation-motion`.

A free master rotation can move a slave translation through a rigid link,
eccentric connection or diaphragm. The shared stability result now records
that motion on the free direction. Every solve-pin consumer excludes those
directions, and both kinematic analyses include them in mechanism metadata.
Previously the rank calculation could pin the rotation and describe a refused
mechanism as stable, with no mechanism nodes or unconstrained DOFs.

Kinematic solvability distinguishes geometric mechanisms from numerical
elastic refusals. A zero-mode `ConstraintRounding` or `CoupledSoftDirection`
result in the initial elastic model now reaches the regular linear solver,
which retains its refusal.
This prevents the unmerged branch's plastic 3D path from accepting an
unverified elastic state through its soft-spring mechanism fallback. Rigid-
plastic limit analysis can normalize elastic stiffness before solving, as on
main. No elastic conditioning limit or rank tolerance changed.

Dormant staged solve diagonals now use the largest active diagonal, with a
unit fallback only for an entirely zero matrix. This keeps inactive DOFs from
creating unit-dependent conditioning warnings. Physical stiffness, member
forces and reaction recovery do not receive these solve pins.

Re-run constrained models whose kinematic metadata or plastic solve status
was used, and staged histories whose conditioning warnings informed review.
The registry selects members, constraints and springs conservatively because
saved stamps do not identify these paths separately. This entry covers
changes on the unmerged branch as well as corrected kinematic metadata;
it does not claim every selected model returned an incorrect answer.

Native and public WASM regressions cover 2D and 3D, rigid-link/eccentric/
diaphragm mechanisms and held controls, elastic refusal and resolvable
controls, plastic entry points, dense/sparse stage solves and stiffness
scales. Result-comparison tests reject empty, missing, extra and duplicate
nodes on both sides and run in the required CI scripts job.

Pre-existing construction load validation, cumulative 2D prestress reactions
and the web 2D rotational-support mirror are outside this round's repair
scope. This change does not claim to correct them.

Final review limits the elastic refusal policy to the initial 3D plastic state.
Later hinge states again use main's existing mechanism classification: ordinary
linear failures caused by yielded rotations or hinge-induced soft/ill-conditioned
stiffness can signal collapse, while structured containment refusals still
propagate. Raw and certified plastic entry points share this state-aware carry
path. The portal loaded by a joint moment and a propped-beam equivalent now
collapse as on main instead of aborting after the first hinges. Native and WASM
regressions cover these mechanisms, hinge-induced conditioning and coupled-soft
states, resolvable controls, and the unchanged initial elastic refusals. No
refusal threshold or tolerance changed.

## Saved-model applicability and numerical scope

The notice remains conservative for members, constraints and springs, and also includes eccentricities and saved construction phases. Numerical declarations name staged result collections, kinematic metadata and plastic history outputs, plus solve status. They do not explain changes to ordinary base linear forces, reactions or displacements. This preserves the legacy-model judge’s ability to reject fabricated values even when a notice applies.
