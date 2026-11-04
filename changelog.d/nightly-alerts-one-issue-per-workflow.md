### Changed
#### Nightly and differential runs: infrastructure failures fixed, one alert issue per workflow (2026-11-03)

A failed scheduled verification run (nightly, differential, mutation testing) now opens or
comments on one `ci-failure` issue per workflow instead of one per job (#739, #717). The OpenSees,
Code_Aster and Frame3DD harnesses and the mutants filter and exit code that made those runs fail
for reasons other than the engine are fixed, and the dashboard commit is signed. No calculation
changes.
