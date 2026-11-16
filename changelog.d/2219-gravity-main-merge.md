### BREAKING (results)

#### Preserve member envelope extrema after the wind merge

3D combination envelopes retain each member diagram's load boundaries and interior
extrema across combinations, using the shared native station path. Record station
coordinates and complete the audited governing-moment snapshots. Re-run affected
combinations, diagrams and checks. The results helper and exact test inventory now
agree with the runner, and merged wind/gravity notices retain both corrections
([#2219](https://github.com/lambdaclass/stabileo/pull/2219),
[results change](../docs/results-changes/2026-11-gravity-main-merge.md)).
