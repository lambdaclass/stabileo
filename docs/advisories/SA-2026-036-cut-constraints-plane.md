# SA-2026-036: 3D-to-2D cut on Y–Z or X–Y read the constraints as if the frame stood in X–Z

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-07 (fixed in 0.5.0) |
| Issue | [#466](https://github.com/lambdaclass/stabileo/issues/466) |
| Fix | PR [#1297](https://github.com/lambdaclass/stabileo/pull/1297) (merged through [#1409](https://github.com/lambdaclass/stabileo/pull/1409), 2026-11-05), released in v0.5.0 |
| Affected versions | every release with constraints and the 3D-to-2D switch; not bisected |
| Re-check registry | `constraint-cut-plane` (results version 25): a 2D model with constraints solved before it opens with a notice to re-cut it from the 3D model or solve in 3D |

## Affected features

- **App: switching a 3D model with constraints (equal DOFs, rigid links, diaphragms, linear MPCs,
  eccentric connections) to 2D** on the Y–Z or X–Y plane, by slice or projection.
- **Engine/WASM:** not affected. The 2D solver's constraints are in its own [ux, uz, θ] DOFs.

## What was wrong

The plane solver's constraint translation reads every constraint as if the model stood in X–Z: 3D
DOF 0 (ux) is the horizontal, 2 (uz) the vertical, 4 (ry) the rotation. On a Y–Z cut the
horizontal is uy and the rotation rx, so an in-plane sway tie on uy was dropped and an
out-of-plane tie on ux was applied as an in-plane sway tie (in the #807 measurement: 2D sway
0.0023 m where 3D gives 0.1001 m and 0). Diaphragms, rigid links, MPCs and eccentric connections
were misread in the same way on Y–Z and X–Y.

## How to tell if your results are affected

You switched a 3D model that has constraints to 2D on the Y–Z or X–Y plane and used the 2D
results. On any plane, X–Z included, you are also affected if a constraint tied a movement in the
plane to one out of it: a linear MPC with terms on both, an eccentric connection offset out of the
plane, a rigid link or diaphragm between nodes at different depths along the plane's normal, or a
constraint from the cut to a node left out of it. The plane model dropped the out-of-plane part
silently.

## Fixed in

0.5.0.

On a cut, the constraints are rewritten as if the frame stood in X–Z, and restored with the 3D
model. The axes are renamed (horizontal → X, vertical → Z, normal → Y), and the in-plane rotation
becomes ry with its sign reversed in linear MPCs. Diaphragm planes, eccentric offsets and releases
are renamed the same way. Tests: `web/src/lib/store/__tests__/switch-2d-constraints.test.ts`
compares every node's in-plane displacements and rotation with the 3D solve, to 1e-9, for ten
constraint kinds on a Y–Z portal and five on X–Y cantilevers. Constraints that couple the plane to
what is out of it are now refused, by a cut and by a solve on a plane alike. So is a projection that
merges a constrained node into another, which would leave the 2D model a link to a node it no longer has.

## Workaround

Solve in 3D. A cut along X–Z is safe only when no constraint couples the plane to what is out of it
(the cases above); the fixed version refuses those.

## What to do with results you already have

Cut the model again on the fixed version, or solve it in 3D, and compare.
