# SA-2026-051: 3D moving loads missed interior force peaks and lost the axial component of axle weight

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-08; fix in this branch, not yet released |
| Issue | [#1782](https://github.com/lambdaclass/stabileo/issues/1782) |
| Fix | PR [#1783](https://github.com/lambdaclass/stabileo/pull/1783) |
| Affected versions | 0.2.0, 0.3.0, 0.4.0 and 0.5.0, and desktop-v0.1.0-alpha.1 through alpha.3. Builds containing 3D moving loads from commit `4c4d86155` (2026-03-07) until this fix |
| Re-check registry | results-change entry `moving-loads-3d` |

## Affected features

3D moving-load envelopes, with gravity along either global −Z or global −Y, and design or
sizing decisions made from those envelopes. Both horizontal and inclined paths are affected
by missing interior peaks. The lost axial weight affects members with a slope along gravity.
Permanent member loads in a moving-load model can also govern an interior force station.

## What was wrong

The 3D envelope used only member end forces at each train position. A concentrated axle can
produce its largest bending moment under the axle, between the ends. A simply supported
single-member span can therefore have nearly zero reported bending demand even when its
interior moment is substantial. This was unconservative and returned without a warning.

The axle weight was also projected only onto the member's local y and z axes. Its local x
component was dropped, because the 3D point-on-member load had no axial field. Reactions and
member forces on an inclined path were computed under only part of the weight. The error can
affect the whole structure, not just the loaded member, and can understate design demand.

In the midpoint regression, one 100 kN axle on an 8 m simply supported span gives equal
50 kN reactions by equilibrium and an absolute midpoint moment of 50 × 4 = 200 kN·m. The old
3D envelope gave zero up to round-off. In the inclined regression (8 m horizontally, 6 m rise),
the member length is √(8² + 6²) = 10 m and the axle positions are 0, 5 and 10 m. Loads at
0 and 10 m go directly to the supports and produce no internal axial force. At 5 m, vertical
reactions are 100/2 = 50 kN, giving axial extrema ±50 × (6/10) = ±30 kN on the two sides of
the axle. The endpoint-corrected 2D envelope and all three 3D plane embeddings give these
extrema; the old 3D implementation that dropped axial axle weight gave zero. The tests check
these analytical values as well as 2D/3D agreement. See also the
[endpoint correction](SA-2026-053-moving-load-endpoint-forces.md).

## How to tell if your results are affected

Re-check any 3D moving-load envelope computed by an affected build. A load lying between
member ends can govern the moment even on a horizontal deck. An inclined member additionally
loses the component of gravity along its axis. The re-check registry flags 3D member models with
saved moving-load position cases
(load-case alternatives groups beginning with `move:`). Standalone sweeps are transient and
leave no saved marker; re-check those runs even if opening the project shows no notice.

## Fixed in

This branch, after 0.5.0; not yet released or deployed by this work.

The envelope now includes interior diagram stations and shares its sampling and range logic
with 2D. Axle gravity is projected onto all three local axes. The new axial point-load field
is carried through fixed-end forces, dense and sparse assembly, force recovery, diagrams and
combinations. Existing inputs that omit the field read it as zero.

Regression tests `issue_1782_midspan_moving_moment_matches_embedded_2d` and
`issue_1782_inclined_moving_axial_matches_embedded_2d` compare the same model in 2D and in each
coordinate-plane embedding. Additional tests cover non-grid axle positions, reversed and
descending members, axial jumps and frame, warping, mixed and truss assembly paths.
See [the results-change write-up](../results-changes/2026-11-moving-loads-3d.md).

## Workaround

For a planar model, use the equivalent 2D moving-load analysis with matching geometry,
supports, loads and travel step. For a spatial model, independently verify axle-position
forces including interior peaks and the full gravity vector until using a corrected build.
Reducing the travel step alone does not fix either defect.

## What to do with results you already have

Re-run affected 3D moving-load analyses on a corrected build. Compare all force envelopes and
re-check member designs and sizing decisions based on them. Do not rely on a small or zero
old bending or axial envelope as evidence that the demand was small.
