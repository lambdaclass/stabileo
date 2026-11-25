### BREAKING (results)

#### Refuse malformed load records before projection and replay

Analysis identifies unsupported load fields and refuses incomplete spatial force records before Basic projects them. Fixture application refuses unrecognized load kinds and malformed load collections. Basic rechecks identify nodal rows missing both vertical component names. Saved-result rechecks flag non-array load collections in either the current or original stored snapshot. Saved-result rechecks identify affected load records even when a different row fails validation first. A refused Basic solve clears its previous kinematic diagnosis. Saved projects retain generated-load and seismic notices when a load row is missing its type. See [the results change](../docs/results-changes/2026-11-malformed-authored-loads.md).
