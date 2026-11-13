### BREAKING (results)

#### Withhold forces diagnosed unavailable in staged and P-Delta analyses

Staged analyses now check the projected physical residual and return empty force
and stress collections when equilibrium is unavailable. P-Delta now clears
reactions when its existing equilibrium or residual check diagnoses them
unavailable. Both dimensions use one operation that attaches diagnostics and
clears matching fields together. Recheck saved staged forces and P-Delta
reactions; see the [results-change write-up](../docs/results-changes/2026-11-unavailable-equilibrium-forces.md) (#1952).
