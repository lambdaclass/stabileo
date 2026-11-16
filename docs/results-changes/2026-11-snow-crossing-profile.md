# Snow loads retain their ridge-crossing moment

Issue #2176 fixes silent loss of the distributed snow moment. On origin/main
`9d925a78093db05bf8b50eb125aa829fa5dd955d`, a flat 16 by 4 m roof with an entered
20 degree gable slope receives uniform pressure on its ridge-crossing edges.
The independent physical profile is windward zero and leeward
1.5 × 0.7 × (70 − 20) / (70 − 5) = 0.8076923076923077 kPa. At unit tributary
width the 4 m edge has force −1.6153846153846154 kN and ridge moment
−1.6153846153846154 kNm in the first wind direction. Main instead gives
0.40384615384615385 kPa uniformly: the force agrees, the ridge moment is zero.
These witness values are reproduced by `snow-profile-2176.test.ts`, not an
error bound. Earlier introduction and historical release binaries were not assessed.

The roof-surface model now supplies a physical pressure profile with its ridge
boundary and evaluates that profile over each member's actual extent. Projected
and tributary-width loads share member interval construction; panel tributary
integration cuts against the same physical boundary in both directions. The
member-midpoint side map is removed. Connected physical runs still supply
geometry and shaped-roof interpolation; drift and sliding profiles retain their
existing geometric band integration. No tolerance, baseline or assertion is loosened.

The reproducer commit skips the new regressions with `known wrong result: #2176`
and enables them with `RUN_KNOWN_WRONG=2176`, following the TypeScript convention
of #2169. On its parent the moment assertion fails. The fix activates those tests.
The remesh helper additionally integrates distributed force and first moments
per original physical edge, in both plan directions. Coverage includes every
pressure allocation path, selected and detected roofs, rotated geometry,
symmetric and asymmetric remeshing, and both sides of the existing width limit.
Existing mono, gable, curved, multiple and dome remesh controls remain active.

Snow generation is shared TypeScript before 2D/3D, linear/nonlinear and
native/WASM solver selection. This change alters generated loads, not solver
implementations. Regenerate affected saved-project snow loads, then rerun
analyses, combinations and design checks. Re-solving stored loads alone is
insufficient. The saved-project notice selects generated snow in every mode,
including after a new solve. The coordinator reserved
[SA-2026-073](../advisories/SA-2026-073-snow-crossing-moment.md); the Fix row is
pending until a PR number is available. This work does not fix #2172.

The subsequent #2172 class correction extends the same integration to varying
tributary widths: complete physical strips are integrated before member
restriction. See [the panel geometry record](2026-11-snow-panel-geometry.md).

PR #2197 refreshes `snow-subdivided-override`: the leeward triangular edge now
reaches the full ridge-side intensity and the windward half remains unloaded.
The force and first moments follow the pressure discontinuity, rather than a
ramp crossing the ridge. `snow-hip-facets` and `snow-roof-rotation` are also
refreshed with the panel correction; see the
[bounded intensity record](2026-11-snow-quadratic-intensity.md).
