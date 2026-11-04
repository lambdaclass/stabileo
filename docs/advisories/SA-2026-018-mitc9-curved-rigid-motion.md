# SA-2026-018: MITC9 shells on curved geometry were strained by rigid-body motion

| | |
|---|---|
| Severity | Medium (engine and WASM only; spurious stresses on curved MITC9 meshes, 101 MPa from a 1 mrad rigid rotation; curved meshes too stiff, hemisphere deflection 26 % below the corrected element at 8 × 8) |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#411](https://github.com/lambdaclass/stabileo/issues/411) (SH-7 in the element-derivation review) |
| Fix | PR [#528](https://github.com/lambdaclass/stabileo/pull/528) |
| Affected versions | every version with the MITC9 element (added 2026-03-10), up to 0.2.0 and `main` until the fix |
| Re-check registry | not needed: no app workflow creates MITC9 elements |

## Affected features

The nine-node MITC9 shell (`quad9s` in the 3D solver input) when its nine nodes do not lie on one
plane: any curved MITC9 mesh (cylinders, domes, hemispheres, twisted plates) and any element whose
corners are warped. Every analysis that uses its stiffness or its stresses is affected: linear,
P-Delta, buckling (through the membrane stresses that build K_G) and modal (through the stiffness).
Flat MITC9 elements are not affected and give
the same results as before.

The element is reachable only through the engine and its WASM API. The app's model has 4-node
shells (MITC4, DKT, curved shell) and no 9-node element, so results obtained in the app are not
affected.

## What was wrong

The MITC9 is a flat element: it projects its nine nodes onto the plane normal to the corner
diagonals and is formulated there. When the midside or centre nodes lie off that plane (every curved
nine-node patch) the projection had no rigid-link (warping) correction, unlike the MITC4: a rigid
rotation of the real nodes moved the projected nodes by a non-rigid field, so **the element was
strained by rigid-body motion**. A curved MITC9 mesh resisted the rotations its elements undergo
when the shell bends or moves on flexible supports, and reported stresses for them. The docstring
advertised the element for curved shells (pinched hemisphere, twisted beam).

| Case | Correct | Before the fix | After the fix |
|---|---|---|---|
| Relative K·r residual for a rigid rotation, 2 × 2 m cylindrical patch, sag 0.2 m | 0 | 0.114 | < 1e-10 |
| Same patch, steel, t = 50 mm, rigid rotation of 1 mrad: largest nodal von Mises stress | 0 MPa | 101 MPa | 0 MPa |
| Pinched hemisphere (MacNeal–Harder, quarter), radial displacement / 0.093, 4 × 4 elements | 1 | 0.142 | 0.268 |
| same, 8 × 8 | 1 | 0.504 | 0.681 |
| same, 16 × 16 | 1 | 0.935 | 0.976 |
| Scordelis–Lo roof, midspan free-edge deflection / 0.3024, 16 × 16 | 1 | 1.0045 | 1.0046 |
| Pinched cylinder, deflection under the load / 1.8248e-5, 16 × 16 | 1 | 1.0068 | 1.0068 |

The error is largest where the elements rotate the most (the hemisphere, a shell on flexible
supports) and on coarse curved meshes. It is unconservative for deflections and buckling loads
(the shell is too stiff) and can be either way for stresses (spurious stresses with no warning).

## How to tell if your results are affected

You called the engine or WASM solver with `quad9s` whose nine nodes are not coplanar (a curved
surface, or warped corners). Until the fix such results carried the known-issue warning `SH-7`
naming the elements. Flat MITC9 meshes are not affected.

## Fixed in

`main` (this fix); released in 0.3.0. Each node is tied to its projection on
the element plane (through the mid-surface centroid) by a rigid link, the MITC4 warping correction
applied to all nine nodes: K ← WᵀKW, displacements W·u in stress recovery and Wᵀf for the thermal
load, so the six rigid motions are strain- and stress-free on any geometry. The element stays a flat facet: curvature is represented by the mesh,
and a curved shell needs a mesh fine enough for the facets to follow it (or the curved shell, which
follows the geometry inside each element). Pinned by
`engine/tests/derivation_shells.rs` (`sh7_curved_mitc9_annihilates_rigid_motions`,
`sh7_warped_doubly_curved_mitc9_annihilates_rigid_motions`,
`sh7_curved_mitc9_rigid_motion_is_stress_free`) and
`engine/tests/discretization_error.rs::mitc9_curved_benchmarks_at_16x16`. The `SH-7` known-issue
warning is removed.

Not changed by this fix, and a property of any flat facet: a freely heated curved MITC9 is not
exactly stress-free, because the facet reads the expansion of its off-plane nodes as a deflection
and resists it in transverse shear (12 % of the thermal load unbalanced on the test patch above).
It is the same for a warped MITC4, and is tracked separately.

## Workaround

Use flat MITC9 elements (coplanar nodes), MITC4, or the curved shell for curved geometry.

## What to do with results you already have

Re-run curved MITC9 models on the fixed version, in particular deflections, buckling loads and
stresses of domes and of shells on flexible supports.

## Credits and references

Found by the element-derivation review (SH-7, PR #330) and pinned by
`sh7_curved_mitc9_annihilates_rigid_motions`. Rigid-link warping correction: MacNeal (1978),
"A simple quadrilateral shell element"; Taylor (1987), "Finite element analysis of linear shell
problems".
