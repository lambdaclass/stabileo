### BREAKING (results)

#### Register P-Delta displacement amplification in the results snapshots (2026-11-10)

Register `b2` alongside the engine's distinct `b2Factor` in the pending #1329 results-change entry, so PR #1895's Results Snapshot gate covers the app's displacement amplification. The axial span-stiffness correction changes portal B₂ from 1.006424741 to 1.006402477 and tower B₂ from 1.000275385 to 1.000273522. A controlled replay with only that stiffness correction disabled reproduces both old values; the corrected response is smaller with identical first-order results. See `docs/results-changes/2026-11-pdelta-span-axial.md`. No additional engine or snapshot changes are introduced by this registration repair.
