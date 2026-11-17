### Fixed
#### BREAKING (results): Preserve embedded member load geometry when splitting (2026-11-17)

Restore splits of loaded flat-2D members with saved nonzero offsets by applying the embedding's node-to-node load geometry consistently to the parent and every child. Keep true 3D flexible geometry and strict loaded-cut validation. Preserve the localized plastic-collapse rank diagnosis in every locale, and assert WASM fiber force totals against the original fixture load. See [the results-change record](../docs/results-changes/2026-11-generated-member-cuts.md) (#2223, #2222).
