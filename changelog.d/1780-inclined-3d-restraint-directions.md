### BREAKING (results)

#### 3D inclined supports count restraints in a common frame (2026-11-08)

The 3D kinematic degree now counts the rank of the inclined normal and positive global-axis spring directions together. PR [#1780](https://github.com/lambdaclass/stabileo/pull/1780) had combined the local normal slot with the global-X spring slot, undercounting independent directions and sometimes counting coincident directions twice. A normal `(0, 0, 1)` and a positive `kx` contribute two translational restraints. The exact reproducer and 48 direction combinations derive their expected counts geometrically. See [the results change](../docs/results-changes/2026-11-inclined-3d-restraint-directions.md). This branch correction is not released or deployed.
