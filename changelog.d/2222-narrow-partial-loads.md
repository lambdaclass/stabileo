### BREAKING (results)
#### Sub-limit member load intervals are refused (2026-11-16)

Member load intervals narrower than 1e-10 of the member length, including zero-width intervals, now return a localized refusal in planar and spatial native and WASM analyses and recovery. The error identifies the member and interval. Unsupported loads are never dropped, converted into forces or couples, or snapped to an end. Rerun affected analyses and explicitly revise unsupported load models. Static force-balance checks count the user's applied load independently of assembly. Missing pure couples still rely on the existing assembly-based moment check. See [the results-change record](../docs/results-changes/2026-11-narrow-partial-loads.md) (#2222, #2223).
