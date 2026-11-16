### BREAKING (results)
#### Gravity loads conserve the physical loaded region (2026-11-16)

Gravity loads now use exact panel regions after subtracting the union of shell
footprints. Floor loads retain the eccentric member loading of their tributary regions,
and seismic plan area follows physical polygons instead of global extents
(#2199, #2200, #2201, #2210). Regenerate affected loads and seismic weights,
refresh floor definitions, and rerun analyses, combinations and design checks.
See [the results-change record](../docs/results-changes/2026-11-gravity-physical-regions.md).
