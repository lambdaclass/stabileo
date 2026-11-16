### BREAKING (results)
#### Snow panels follow physical roof geometry (2026-11-16)

Subdividing sloped rafters no longer turns explicit roof panels into floors
and silently removes eave snow (#2172). Panel classification uses the physical
roof envelope. Generated widths retain full precision and snow tributary
resultants follow complete physical strips. Regenerate saved snow loads, then rerun analyses,
combinations and design checks; re-solving stored loads alone is insufficient.
See the [results-change record](../docs/results-changes/2026-11-snow-panel-geometry.md)
and [SA-2026-074](../docs/advisories/SA-2026-074-snow-panel-subdivision.md). PR #2197; pending merge and release.
