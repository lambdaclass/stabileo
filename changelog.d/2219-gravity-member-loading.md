### BREAKING (results)
#### Gravity reaches each carrier as member loading (2026-11-16)

Gravity regions now partition by physical carrier bisectors and transfer their
line forces and eccentric moment densities as member loads. Restrained edge beams
retain their torsion. Force profiles are summed before coalescing, so geometry
subdivision and plan rotation preserve each carrier's loading in the covered
physical carrier partitions. Complete-fixture carrier coverage and remeshing
remain deferred in #2254; the mirrored suspension-bridge first-moment
comparison remains deferred in #2255. Their known-wrong-result tests stay skipped. Orphaned floor
shares retain the correction notice after a current solve. Short gravity force
and moment densities remain distributed on their original member spans. Rotated profiles containing nonzero sub-limit moment fringes also refuse. Unsupported
spans refuse rather than becoming concentrated or nodal loads; the separate raw
engine cutoff defect remains tracked by #2222.

Regenerate all affected generated area loads, refresh floor definitions or replace
orphaned shares, then rerun analyses, combinations and design checks. See the
[results-change record](../docs/results-changes/2026-11-gravity-member-loading.md),
[SA-2026-079](../docs/advisories/SA-2026-079-gravity-shell-coverage.md) and
[SA-2026-080](../docs/advisories/SA-2026-080-floor-zone-eccentricity.md).
