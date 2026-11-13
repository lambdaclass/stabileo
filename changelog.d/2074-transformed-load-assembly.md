### Fixed

#### Refuse genuine residual moments after exact load cancellation

- Derive released-load uncertainty from the shared load assembly, including inclined support transforms and single-load 2D fixed-end forces. Exact nodal additions no longer receive a blanket rounding allowance (#2074).
- Reduce nonlinear initial-moment loads over free constraint rows, preserve existing solver behavior for models without member releases, and require completed WASM answers whenever native references completed.
