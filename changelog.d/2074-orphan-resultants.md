### Fixed

#### Exact orphan moment resultants and scoped released-load verification

- Sum nodal moments exactly in the orphan-load backstop so opposite moments at truss-only nodes in mixed frame/truss models retain their answer; nonzero unsupported resultants still refuse. Time-history moments cancel only within one record.
- Restrict released-load recheck notices to affected model features and pin the exact native/WASM numerical-refusal cases so new failures break verification (#2074).
