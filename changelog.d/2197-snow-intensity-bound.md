### BREAKING (results)
#### Bound snow tributary intensity error and refresh physical roof results (2026-11-16)

Quadratic snow tributary loads now conserve force and both plan moments with
an explicit pointwise intensity bound, instead of distorting the physical
midpoint (#2172, #2176, PR #2197). Overlapping tributary sources are allocated once each. The derivation reports the bound. Refresh
`snow-subdivided-override`, `snow-hip-facets` and `snow-roof-rotation` through
the documented snapshot update procedure. The panel notice now consistently
asks engineers in every locale to regenerate all affected generated area loads,
then rerun analyses, combinations and design checks.
See the [results-change record](../docs/results-changes/2026-11-snow-quadratic-intensity.md).
