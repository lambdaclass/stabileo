### BREAKING (results)
#### Bundled models retain their explicit support restraints (#2277)

Every JSON fixture adapter now retains declared support metadata, including 3D masks, even when its creation method accepts only three arguments. Missing stored supports are refused. The braced portal states its embedded-plane roller restraints explicitly; the RC flexure beam keeps its existing bearing mask through every loader. Recompute results previously produced by adapters that dropped support metadata. See [the results-change record](../docs/results-changes/2026-11-bundled-support-metadata.md).
