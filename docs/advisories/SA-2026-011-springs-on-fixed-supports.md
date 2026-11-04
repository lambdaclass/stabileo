# SA-2026-011: 3D support switched from spring to fixed (or pinned) was solved as elastic

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-20) |
| Issue | [#488](https://github.com/lambdaclass/stabileo/issues/488) |
| Fix | PR [#491](https://github.com/lambdaclass/stabileo/pull/491) (merged 2026-10-20) |
| Affected versions | every version with 3D supports and per-DOF springs, up to 0.2.0 and `main` until the fix; introduction not yet bisected |
| Re-check registry | to add with the fix |

## Affected features

Supports of models solved in 3D mode (including flat models solved in 3D) whose type was changed
after they had spring constants: in the supports table, the property panel, or by ticking a degree
of freedom in the support panel. Models solved in 2D mode are not affected.

## What was wrong

The engine treats a support DOF that has a positive spring as elastic even when it is marked
restrained. Changing a support's type kept its spring constants, and the 3D export sent them with
the restraint flags, so **the support drawn as fixed was solved as a spring**:

| Beam 0–4–8 m, fixed at 0, 10 kN down at 4 m; support at 8 m | uz at 8 m |
|---|---|
| Support added as fixed | 0 |
| Support added as spring (k = 100) and switched to fixed | −14.4 mm (rotation 0.00166 rad) |

Reactions, member end moments and deflections near such a support are those of a spring support:
typically the moment at the support is too low and the span moment and deflection too high, but
the redistribution can go either way in an indeterminate structure.

## How to tell if your model is affected

The model is solved in 3D mode and a support was first a spring (or had spring constants) and was
then changed to fixed, pinned or a roller, or had a degree of freedom ticked as restrained. The
deflection or rotation at that support is not zero in the results although it is drawn as
restrained.

## Fixed in

`main` (#491, merged and deployed to stabileo.com on 2026-10-20); released in 0.3.0. Every restrained DOF is solved as restrained, including in projects saved before the fix,
and a spring is dropped when its DOF becomes restrained.

## Workaround

Check that restrained supports show zero displacement in the results. Where one does not, delete
the support and add a new one of the type you want (a new support carries no springs).

## What to do with results you already have

Re-check 3D models whose supports were edited from springs to rigid supports: look at the
displacements at the supports, and re-run with recreated supports where they are not zero.

## Credits and references

Found by the metamorphic energy check in the batch-3 integration (a spring on a restrained DOF in a
generated differential model), traced to the store and confirmed through the app path
(model store → `buildSolverInput3D` → WASM).
