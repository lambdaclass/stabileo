# SA-2026-035: 3D-to-2D cut bent members about the wrong section axis (Y–Z portal 13.5 times too stiff)

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#1238](https://github.com/lambdaclass/stabileo/issues/1238) |
| Fix | PR #1295 (safety/fix-1238-cut-section-axis) |
| Affected versions | every release with the 3D-to-2D switch (slice or projection); not bisected |
| Re-check registry | none: a saved 2D model keeps its numbers; only a new cut changes |

## Affected features

- **App: switching a 3D model to 2D** (slice at a plane, or projection onto it), then solving or
  designing in 2D.

## What was wrong

The cut passed each member's section through unchanged, and the plane solver bends a member with
Iy·cos²α + Iz·sin²α (α the section rotation): the inertia of a member whose in-plane bending is
about local y. In the 3D model the in-plane inertia comes from the member's real local axes. They
agree on X–Z cuts with default axes. They did not agree for columns in a Y–Z cut (local z is the
plane normal there, so they bend about the weak axis), for horizontal members in an X–Y cut, or
for members rolled 90° on any plane.

| IPN 300 portal in the Y–Z plane, 3 m columns, 5 m beam, fixed feet, 10 kN along Y at a column head | Head sway |
|---|---|
| 3D solve | 13.00 mm |
| Y–Z cut, then 2D, before the fix | 0.96 mm (13.5 times too stiff) |
| Y–Z cut, then 2D, after the fix | 13.00 mm |

The 2D model was too stiff, so drift was underestimated, and the moments were shared out by the
wrong stiffnesses, with no warning.

## How to tell if your results are affected

You switched a 3D model to 2D on the Y–Z or X–Y plane with I, H or rectangular members, or on any
plane with members rolled or with sections turned, and used the 2D results.

## Fixed in

The cut gives each member the inertia it bends with in 3D. A member whose section axes line up with
the plane but bends about local z gets its section turned a quarter turn in the 2D model, so
stiffness, plastic modulus, thermal depth and design read the same axis. Cuts the 2D model cannot
represent are refused: section axes skew to the plane (even with equal inertias, e.g. a square rolled 45°, whose corner is farther out; a round tube excepted), or a section that is not doubly symmetric
that would have to be turned, or flipped because its member is rolled half a turn or drawn the other way (a T would hang its flange on the other side of the 2D member). Tests: `web/src/lib/store/__tests__/switch-2d-constraints.test.ts`
(the portal above against 3D; X–Y beams; a rolled column against 3D and PL³/(3EIz)).

## Workaround

Solve in 3D.

## What to do with results you already have

Cut the 3D model again on the fixed version, or solve it in 3D, and compare drifts and member
forces with the results you used.
