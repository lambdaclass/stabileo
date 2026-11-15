### BREAKING (results)
#### Snow ridges and slopes follow physical roof geometry (2026-11-15)

Unequal subdivision of roof edges could move the inferred snow ridge and change
snow loads without warning, including on flat models with an entered roof slope.
The shared roof-surface path now derives ridges, slopes, side classifications and
shaped-roof profiles from complete physical runs, so inserting nodes does not
change them (#2144). Regenerate affected snow loads, then rerun analyses,
combinations and design checks; re-solving stored generated loads is insufficient.
See [the results-change record](../docs/results-changes/2026-11-snow-ridge-mesh.md).
See [SA-2026-072](../docs/advisories/SA-2026-072-snow-ridge-subdivision.md), pending merge and release.
