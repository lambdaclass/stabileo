# SA-2026-129: Moving loads could misstate shear and axial force

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-26 |
| Issue | [#2101](https://github.com/lambdaclass/stabileo/issues/2101), [#2104](https://github.com/lambdaclass/stabileo/issues/2104) |
| Fix | PR [#2582](https://github.com/lambdaclass/stabileo/pull/2582), merged as `727942f2a` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | The browser's single-cut planar shear envelope and spatial axle end-force conversion are present from 0.2.0 (`b93ada5b8`, `98d23e331`). Saved vehicle positions shipped in 0.2.0 (`73817e293`) and used the same end-force reduction on spatial trusses (`91e083038`). Planar browser sweeps have carried concentrated axial axle loads since 0.6.3 (`76fd3124c`). The reported native shear errors are confirmed from 0.6.0, which shipped exact point-load limits (`c365d1cb8`), through 0.6.4, which revised the member-local joint rule (`ccbfd6f4a`). |
| Re-check registry | [`moving-axle-joints`](../../web/src/lib/provenance/result-changes/moving-axle-joints.json) |

## Affected features

Planar and spatial moving-load sweeps, including the native and WASM
sweeps, and spatial truss analyses using saved vehicle position cases
with an axle inside a member.

## What was wrong

An axle at a path joint could be treated as a span load just short of
the joint. An equivalent rotation or reflection could therefore change
the reported shear. Sweeps could also omit a governing cut on one
side of an axle at a sampled joint or support. The native sweeps could
miss the cut between coincident moving and permanent loads inside a
member. The planar browser envelope could keep only one of the two
section forces at an interior axle, and the spatial browser sweep
could replace the interior axial axle force with end-node forces.

In #2101, the original model returned a minimum shear of about
−47.85 kN where compatibility and equilibrium, including the limit at
the support, give −56.68 kN. In #2104, the original model returned
about −0.87 kN where the corresponding joint limit is −1.70 kN.
The rotated and mirrored models happened to include the governing
cut. An inclined planar browser regression with a 100 kN axle returned
an axial envelope of [−40, 0] kN at midspan. The two equilibrium cuts
give [−40, +40] kN.

The static load preparation for a saved vehicle case on a spatial
truss could preserve the applied force and the support reactions while
losing the jump in axial force at the axle. The saved vertical truss
replay in 0.6.4 reported zero on both cuts where equilibrium gives
−75 and +25 kN. These incorrect results could be returned without a
warning.

[Results-change record](../results-changes/2026-11-moving-axle-joints.md).

## How to tell if your model is affected

Check sweeps in which an axle can reach a path joint, support or
permanent point load at a sampled position. Check both sides of axles
inside planar members and the axial forces of inclined or vertical
members in spatial sweeps. For saved vehicle positions, inspect axles
inside spatial truss members and verify the axial force on both sides
of each axle. Correct support reactions can coexist with an incorrect
member-force diagram.

## Fixed in

The next release after 0.6.4. PR
[#2582](https://github.com/lambdaclass/stabileo/pull/2582) resolves
sampled joints before computing within-member distances and recovers
the force cuts on both sides of the relevant axles. Saved spatial
truss cases retain the interior axle force for force recovery.

## Workaround

Use an independently verified moving-load analysis that checks both
sides of each relevant axle, including the one-sided limits at
sampled joints and supports. For saved spatial truss cases, verify
the member forces using a model that retains each axle at its applied
position.

## What to do with results you already have

Rerun affected moving-load sweeps. Regenerate affected saved vehicle
position cases and rerun the analyses and combinations that use them.
Use the moving-load sweep to recover one-sided joint and support
limits. Saved cases represent the exact sampled positions. Review
the governing shear and axial forces, then repeat dependent design
checks and update reports.

## Credits and references

See [issue #2101](https://github.com/lambdaclass/stabileo/issues/2101),
[issue #2104](https://github.com/lambdaclass/stabileo/issues/2104),
[PR #2582](https://github.com/lambdaclass/stabileo/pull/2582), the
[native sweep regressions](https://github.com/lambdaclass/stabileo/blob/727942f2a/engine/tests/metamorphic/moving_shear.rs),
the [browser sweep regressions](https://github.com/lambdaclass/stabileo/blob/727942f2a/web/src/lib/engine/__tests__/moving-shear.test.ts)
and the [saved vehicle regressions](https://github.com/lambdaclass/stabileo/blob/727942f2a/web/src/lib/engine/__tests__/vehicles-positions.test.ts).
