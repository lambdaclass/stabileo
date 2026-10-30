### Fixed
#### Verify and enable the Mattiasson elastica benchmarks (2026-10-29)

Replace provisional cantilever references with independently evaluated elliptic
integrals and enable all four load cases, including PL²/EI=10. Separate axial
extension from the inextensible comparison, retain the original finite-area
model against an independent extensible-rod solution, and check mesh refinement
and load-step independence with tighter tolerances. The engine implementation
and results for existing user models are unchanged (#845).
