### Fixed
#### BREAKING (results): Solve rounded member partitions without changing load integrals (2026-11-16)

Measure source cuts from generated geometry so ordinary translated and rotated member subdivisions remain available. Map load coordinates and densities together to conserve resultant and first moment, while refusing inconsistent geometry and retaining interval limits. Plastic collapse now propagates invalid released states unless the engine identified an orphan rotation and every nodal moment is finite. See [the results-change record](../docs/results-changes/2026-11-generated-member-cuts.md) (#2223, #2222).
