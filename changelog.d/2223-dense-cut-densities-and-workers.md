### Fixed
#### BREAKING (results): Preserve member-defined load densities through dense cuts (2026-11-17)

- Splitting a distributed load with no explicit interval endpoints preserves its density on each child's measured geometry. Dense diagonal cuts no longer multiply the load by a ratio obtained by subtracting rounded cumulative stations. Explicit numeric intervals retain their coordinate and density mapping; geometry and interval refusal limits are unchanged (#2223). See [generated member cuts](../docs/results-changes/2026-11-generated-member-cuts.md#member-defined-load-densities-2026-11-17-2223).
- WASM interval kernel registration now lives outside the UI translation dependency graph, restoring solver and example worker builds used by the E2E site and route byte checks. Route budgets are unchanged (#2223).
