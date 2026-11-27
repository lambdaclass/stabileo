### BREAKING (results)

#### Refuse malformed structural analysis input

Model import and analysis name malformed fields before they can disappear in constraint migration, plane projection, or solver defaults. Native and WASM analysis inputs reject unknown fields in the shared solver model, options, and audited nested records. See [the results change](../docs/results-changes/2026-11-malformed-structural-input.md).
