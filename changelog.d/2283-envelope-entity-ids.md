### Fixed
#### Match combination envelope rows by entity ID (2026-11-17)

Combination envelopes match displacement and reaction rows by node ID and member forces by element ID. Reordered rows retain their entity's results. Envelopes and 3D superposition refuse missing, unexpected or duplicate IDs. See [the results change](docs/results-changes/2026-11-envelope-entity-ids.md).
