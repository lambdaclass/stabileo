# 3D moving loads include interior peaks and axial axle weight (2026-11-08)

Issue [#1782](https://github.com/lambdaclass/stabileo/issues/1782).
Results-change entry `moving-loads-3d`.

The 3D moving-load envelope read each member's end forces only. A moving axle's governing
moment can lie inside the member, so that envelope understated demand. It also projected
axle gravity onto local y and z only: `SolverPointLoad3D` could not carry the local x component.
An inclined member therefore received only part of the axle's weight. Both defects were
uncontained and could give unconservative results.

The envelope now samples all six force diagrams along each member. The 2D and 3D diagrams
share the regular grid and point-load station builder. The envelope range calculation is also
shared, including the stations where the total axial distributed load changes sign. Both dimensions
also evaluate every axial distributed-load start and end boundary;
see [the boundary correction](2026-11-moving-axial-patch-boundaries.md). This change does not make a
finite train-position step a continuous envelope; select a suitably fine travel step.

A backward-compatible `px` field (default zero) was added to the 3D point-on-member load.
Axle gravity is projected onto local x as well as y and z. The equivalent axial nodal loads
use the existing 2D linear axial shape functions. Dense and sparse assembly, 12-DOF frames,
14-DOF warping frames, mixed frames and trusses carry that force. Force recovery records axial
point loads in `pointLoadsX`, and axial diagrams subtract each point force after its station.
Combinations preserve and scale those records. Geometric stiffness includes the varying
axial force due to these point loads. Independent linear reassembly includes the axial load;
the plastic certificate explicitly refuses axial point loads that its own model cannot represent.

## Evidence

`engine/tests/integration/moving_loads_3d.rs` embeds the same planar model in XZ, XY and YZ
with `metamorphic::planes::embed_2d`. This covers both gravity directions and both bending axes.

- `issue_1782_midspan_moving_moment_matches_embedded_2d`: one 100 kN axle on an 8 m simply
  supported span. Equilibrium gives a 50 kN reaction for the midpoint position and an absolute
  moment of 50 × 4 = 200 kN·m. The 2D envelope gives −200 kN·m in its diagram convention.
  Before the fix, 3D gave zero (up to round-off); after it, the envelope equals the 2D result
  projected into each embedding's local axes, including its signs.
- `issue_1782_inclined_moving_axial_matches_embedded_2d`: the span rises 6 m over 8 m horizontally.
  The expected axial envelope is computed by 2D in the test. Its minimum is −60 kN;
  the old 3D result was zero. The corrected 3D result agrees in all three embeddings.
- Additional tests check an axle away from regular diagram stations, descending and reversed
  members, interior axial jumps, load balance and dense/sparse assembly for frame, warping,
  mixed and truss models, permanent axial point-load envelopes, off-grid axial span extrema,
  negative combination factors, independent linear certification and 2D/3D buckling parity
  under an axial point load.
- The prepared/full-solve moving-load parity test retains its comparison tolerances and now
  applies all three gravity components and reads interior stations in its independent reference.

The two issue reproducers were committed ignored first, with `known wrong result: #1782`,
and run explicitly to verify failure. The fix removes both ignores.

## What to re-check

Re-run 3D moving-load sweeps, and review every design check or sizing decision based on their
envelopes. Interior peaks affect horizontal and inclined members; lost axial weight affects
members with a nonzero slope along the selected gravity direction. Permanent member loads can
also govern an interior station. The registry flags 3D member models with saved moving-load
position cases, identified by
load-case alternatives groups beginning with `move:`. Standalone sweeps leave no saved marker;
re-check them even if opening the project shows no notice.
Existing static loads that omit `px` retain a zero axial point component.
