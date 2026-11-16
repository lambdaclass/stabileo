### Performance
#### Transfer 3D case results to WASM once for all combinations (2026-11-16)

The parallel 3D solve now combines load cases in one WASM call, avoiding repeated
conversion of the same case results for each combination. Worker solving, shell
stress recovery, and envelope calculation retain their existing paths. Regression
checks compare batched and individual combination results, including shell stresses
and containment refusals.
