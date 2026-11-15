### BREAKING (results)
#### Snow ridges and slopes follow physical roof geometry (2026-11-15)

Unequal subdivision of roof edges could move the inferred snow ridge and change
snow loads without warning, including on flat models with an entered roof slope.
The shared roof-surface path now derives ridges, slopes and shaped-roof profiles
from complete physical runs, so inserting nodes does not change that geometry
(#2144). Each member segment
uses its own position relative to the stable ridge for side pressure, restoring
the correct force and moment on members split at the ridge. A member that itself
crosses the ridge retains its previous uniform treatment, tracked in #2176.
Highest profile points are grouped with the existing elevation tolerance, preventing tiny corner-height changes from moving the ridge;
points above that tolerance remain distinct. Regenerate affected snow loads,
then rerun analyses, combinations and design checks; re-solving stored generated loads is insufficient.
See [the results-change record](../docs/results-changes/2026-11-snow-ridge-mesh.md).
See [SA-2026-072](../docs/advisories/SA-2026-072-snow-ridge-subdivision.md), pending merge and release.
