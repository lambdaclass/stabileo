# SA-2026-037: 3D co-rotational analysis differenced rotation vectors (Bathe–Bolourchi bend 1.3 % off)

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-07 (fixed in 0.5.0) |
| Issue | [#426](https://github.com/lambdaclass/stabileo/issues/426) |
| Fix | PR [#1301](https://github.com/lambdaclass/stabileo/pull/1301) (merged 2026-11-05), released in v0.5.0 |
| Affected versions | every release with 3D co-rotational analysis; not bisected |
| Re-check registry | results version entry `corotational-3d-rotations` |

## Affected features

- **App: PRO, Advanced, Nonlinear, Co-rotational** on a 3D model.
- **Engine/WASM: `solve_corotational_3d`.**

## What was wrong

A member's deformational end rotations were formed by subtracting rotation vectors: the nodal
rotation vector projected on the deformed member axes, minus the rigid rotation of the member,
about a frame turned by the average of the two end rotation vectors. Rotation vectors do not add
or subtract like that unless the rotations share one axis, so when a member turned about two axes
at once by a large amount, its bending and torsion were misread.

| Bathe–Bolourchi 45° bend, out-of-plane tip load 600 | Tip displacement (x, y, z) |
|---|---|
| Simo and Vu-Quoc (1986) | (−23.48, −13.50, 53.37) |
| Cardona and Géradin (1988) | (−23.67, −13.74, 53.50) |
| Before the fix, 8 elements | (−23.96, −12.85, 53.38), 1.3 % from Simo and Vu-Quoc |
| Before the fix, 32 elements | (−23.98, −12.90, 53.33): refining did not remove the error |
| After the fix, 8 elements | (−23.55, −13.53, 53.52) |
| After the fix, 32 elements | (−23.56, −13.60, 53.47) |

Planar frames and rotations about one axis were exact while each member's rotations stayed below
half a turn; past that, a whole turn could be read as deformation or lost. The converged answer
always satisfied equilibrium of the misread element, so the error grew with the size of
non-coaxial rotations.

## How to tell if your results are affected

You ran a co-rotational analysis on a 3D model whose members turned by large amounts about more
than one axis (out-of-plane bending of curved or skew members, combined bending and torsion), or
any co-rotational analysis, planar included, where a member turned half a turn or more.

## Fixed in

0.5.0.

Each end rotation is turned into a rotation matrix, the member frame is turned by the proper mean
of the two end rotations, and the deformational rotations are the logarithms of the rotation left
after removing the member's rigid rotation. Tests:
`engine/tests/validation/three_d/three_d_corotational.rs` (the bend above against both references
with 8 and 16 elements; non-coaxial tip-moment helices against the exact solution).

End moments are still applied without the differential of the rotation logarithm, which puts a
member's end forces off by about half its natural rotation. Displacements converge under mesh
refinement, but the NL-3 warning stays on any solve where a member end turns more than 0.02 rad
against its chord: split those members until it clears. A solve whose member ends turn more than
0.9π relative to each other is refused.

## Workaround

None needed after the fix. Before it, keep large-rotation 3D co-rotational results for
comparison only.

## What to do with results you already have

Run the co-rotational analysis again on the fixed version and compare displacements and member
forces with the results you used.
