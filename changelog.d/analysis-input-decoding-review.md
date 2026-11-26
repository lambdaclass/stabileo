### BREAKING (results)

#### Preserve model keys and refuse ambiguous analysis inputs

Planar JSON requires a named model. WASM object analysis preserves the keys of valid solver table entries and refuses malformed pairs. Analysis reports unknown authored loads and combination fields before applying defaults. See [the structural results change](../docs/results-changes/2026-11-malformed-structural-input.md) and [the load results change](../docs/results-changes/2026-11-authored-load-validation.md).

#### Solve equivalent planar constraints with overflowing coefficients

Planar analysis can solve a homogeneous constraint when a common scale preserves all active coefficients. Saved results are checked in the recorded solve plane.
