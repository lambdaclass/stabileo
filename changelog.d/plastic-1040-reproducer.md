### BREAKING (results)
#### Public 3D plastic factors share the exact proof path (2026-11-13)

Both public 3D plastic APIs now return the same rationally checked conservative collapse factor. They refuse missing, non-positive, unordered or insufficiently close bounds instead of returning an incremental history factor. Incremental steps, hinges and mechanism flags remain explicitly uncertified. The 2D refusal stays in place. See the [results change](../docs/results-changes/2026-11-plastic-collapse-shared-proof.md) for corrected values, the narrower supported scope, and native/WASM regressions for #1040.
