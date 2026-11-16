### BREAKING (results)
#### Cover separate lower panels at the rafter's local height (2026-11-16)

Correct an unmerged PR #2197 regression that discarded a whole covering rafter
run at its minimum elevation. Identify a panel's own roof by its eave and full
footprint containment; evaluate other runs at their local height. Covered panels
retain floor area loads and receive no snow, independently of subdivision.
Regenerate all affected generated area loads, then rerun analyses, combinations
and design checks. The existing `snow-panel-geometry` registry entry includes
this correction. See the [results-change record](../docs/results-changes/2026-11-snow-panel-geometry.md#local-coverage-correction-in-pr-2197-round-4).
Restore the SA-2026-070 catalog-date assertion from main and identify PR #2197
as pending merge and release for SA-2026-073/074 in all locales.
