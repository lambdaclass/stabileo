# SA-2026-052: Moving-load axial envelopes missed peaks at distributed-load boundaries

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-09 (fixed after 0.5.0; live on stabileo.com since 2026-11-09) |
| Issue | [#1782](https://github.com/lambdaclass/stabileo/issues/1782), additional finding during review |
| Fix | PR [#1783](https://github.com/lambdaclass/stabileo/pull/1783) (merged 2026-11-09 09:27:10 UTC) |
| Fixed release | 0.6.0 (2026-11-13) |
| Affected versions | Engine builds with 2D moving-load axial patch envelopes before this fix, including the station search in `c6e7dd88d` (2026-10-19); the shared 3D path in `d674665d4` is affected too. No released-version boundary is claimed here |
| Re-check registry | results-change entry `moving-axial-patch-boundaries` |

## Affected features

2D and 3D engine moving-load envelopes with permanent partial axial distributed loads.
An extremum at a load-patch boundary between the regular member stations could be missed,
understating axial demand without a warning. Designs and sizing based on that envelope
can consequently be unconservative.

## What was wrong

The range calculation split the member at each distributed axial load's start and end
when finding sign roots of the total load. Those boundaries were never themselves
added to the stations evaluated for the envelope. A jump from positive load to negative
load can govern the axial force without a sign root inside either patch.

For the regression's 8 m cantilever, +100 kN/m on [1.10, 1.15] m and −100 kN/m on
[1.15, 1.20] m have zero net force. At a cut at 1.15 m, equilibrium of the right-hand
segment gives N = −100 × (1.20 − 1.15) = −5 kN. The old envelope read zero up to
round-off. The expected value is computed from the patch resultant in each test,
including reversed load signs and all three coordinate-plane embeddings in 3D.

## How to tell if your results are affected

Check engine moving-load inputs for partial axial distributed loads, especially short
adjacent patches of opposite sign. A zero force at both member ends does not establish
that the interior axial force is zero. The re-check registry identifies saved moving-load
position cases with partial member loads. Transient sweeps leave no saved marker and
must be reviewed independently of whether a project-opening notice appears.

## Fixed in

After 0.5.0; live on stabileo.com since 2026-11-09.

The shared range helper
now evaluates every axial patch start/end boundary as well as the existing sign roots,
so both dimensions include the missing extrema.

The regressions are `issue_1782_axial_patch_boundaries_govern_2d_moving_envelope` and
`issue_1782_axial_patch_boundaries_govern_3d_moving_envelope` in
`engine/tests/integration/moving_loads_3d.rs`. Both were committed ignored first,
explicitly run to establish failure, then enabled by the fix.
See [the results-change write-up](../results-changes/2026-11-moving-axial-patch-boundaries.md).

## Workaround

Independently evaluate axial force at each patch boundary from equilibrium until using
a corrected build. Reducing the train-position step alone cannot recover a missing
member station.

## What to do with results you already have

Re-run affected 2D/3D engine moving-load envelopes and review any member design or sizing
that used their axial maxima or minima. Compare interior forces as well as member ends.
