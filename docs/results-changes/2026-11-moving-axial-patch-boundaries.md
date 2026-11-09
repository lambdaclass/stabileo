# Moving-load axial envelopes evaluate every distributed-load boundary (2026-11-08)

Issue [#1782](https://github.com/lambdaclass/stabileo/issues/1782), found in review of
PR [#1783](https://github.com/lambdaclass/stabileo/pull/1783).
Results-change entry `moving-axial-patch-boundaries`.

The shared 2D/3D moving-load range calculation collected the start and end of each axial
load patch to split the search for roots of the total distributed load. It evaluated the
roots, regular diagram stations and point-load stations, but never the patch boundaries.
An axial-force extremum where the distributed load jumps from positive to negative can
therefore lie between every evaluated station and disappear from the envelope.

The range calculation now evaluates every collected boundary as a normalized station,
alongside the existing sign roots. Both dimensions use this same helper. Force assembly
and the force evaluator are unchanged; the correction includes previously missed values
in the moving-load axial envelope. Train positions remain discrete.

## Analytical evidence

`issue_1782_axial_patch_boundaries_govern_2d_moving_envelope` and
`issue_1782_axial_patch_boundaries_govern_3d_moving_envelope` use an 8 m cantilever with
uniform axial loads +100 kN/m on [1.10, 1.15] m and −100 kN/m on [1.15, 1.20] m.
The net load is zero. A cut at 1.15 m has only the negative patch to its right, so
N = −100 × (1.20 − 1.15) = −5 kN by equilibrium. Both member ends and the regular grid
miss this force. The test computes the expected value from that right-hand resultant,
checks both envelope signs by reversing the loads, and embeds the 3D model in XZ, XY and YZ.
No axle loads are needed to isolate the permanent-load contribution.

Commit A (`65186f50f`) added both tests ignored as `known wrong result: #1782`.
Explicitly running the ignored tests failed in both dimensions: the old peak was zero
up to round-off instead of the expected 5 kN magnitude. Commit B removes the ignores;
both analytical regressions pass without changing their assertions or tolerances.

## What to re-check

Re-run 2D and 3D moving-load envelopes containing partial axial distributed loads,
particularly adjacent patches with opposite signs, and review any designs or sizing
based on their axial extrema. A smaller train-position step does not repair missing
member stations. Standalone static analyses are outside this envelope correction.

The registry uses `members`, `movingLoads` and `pointOrPartialMemberLoads`. The new
`movingLoads` feature reads saved position cases whose alternatives group begins with
`move:`, the marker written by `store/moving-cases.ts`. It is also required by the existing
3D moving-load entry, so ordinary 3D frames no longer receive that notice. A transient
sweep has no saved marker; users must re-check such runs even if no notice appears.
See [SA-2026-052](../advisories/SA-2026-052-moving-axial-patch-boundaries.md).
