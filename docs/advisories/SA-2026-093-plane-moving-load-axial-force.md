# SA-2026-093: Plane moving loads smeared axial force jumps at concentrated axles

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-20 |
| Issue | [#2375](https://github.com/lambdaclass/stabileo/issues/2375) |
| Fix | PR [#2381](https://github.com/lambdaclass/stabileo/pull/2381), merged as `46c70bf32` |
| Fixed release | Pending release |
| Affected versions | All releases through 0.6.2 and main deployments before #2381. The plane moving-load code already split axial axle forces at the ends in `b93ada5b8` (2026-03-04) |
| Re-check registry | [`plane-moving-concentrated-axial-forces`](../../web/src/lib/provenance/result-changes/plane-moving-concentrated-axial-forces.json) |

## Affected features

Plane frame moving-load diagrams and envelopes and axial influence lines
in the web app, where a concentrated moving force has a component along a
frame member. [Results-change record](../results-changes/2026-11-plane-moving-axial-jump.md).

## What was wrong

The plane moving-load helper split the axial component of an interior
point load between the two member ends. Those equivalent nodal forces
preserved the joint loading but lost the interior load needed to recover
the axial force jump. A vertical cantilever with a downward 1 kN axle at
midspan reported about −0.5 kN on both sides of the axle. Equilibrium
requires −1 kN between the support and the axle and zero between the axle
and the tip. The same load placement could also omit both extrema of an
axial influence envelope. [Issue #2375](https://github.com/lambdaclass/stabileo/issues/2375),
[results-change record](../results-changes/2026-11-plane-moving-axial-jump.md).

## How to tell if your model is affected

Check plane frame paths with vertical or inclined members under vertical
axle loads, or any axial influence line where the moving unit load acts
partly or wholly along a frame member. Inspect the force immediately to
either side of an axle inside the member and review the extrema used in
design. An earlier diagram can show a smeared or missing jump without a
diagnostic.

## Fixed in

PR [#2381](https://github.com/lambdaclass/stabileo/pull/2381), merged as
`46c70bf32`, places both components of the concentrated force at the
actual position on the frame member. Both moving-load sweep paths and
the influence tools share that placement. The solver can then recover
the axial force on both sides of the load.
[Results-change record](../results-changes/2026-11-plane-moving-axial-jump.md).

## Workaround

Re-run in a build containing #2381. Until that build is available, check
the axial forces and extrema independently using the concentrated loads
at their actual positions.

## What to do with results you already have

Re-run affected plane moving-load sweeps and axial influence lines.
Review both sides of the axle positions, governing axial envelope extrema,
and any design checks, sizing or reports that used the earlier values.

## Credits and references

See [issue #2375](https://github.com/lambdaclass/stabileo/issues/2375),
[PR #2381](https://github.com/lambdaclass/stabileo/pull/2381) and the
[results-change record](../results-changes/2026-11-plane-moving-axial-jump.md)
for the equilibrium examples and correction.
