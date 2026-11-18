### Fixed
#### Weld regression checks compile and cover invalid geometry (2026-11-16)

Fix the weld-run test diagnostic that failed Web Typecheck without changing its missing-reference guard or the typecheck baseline. Add native and WASM regressions for negative weld sizes and overflowing geometry, plus native nonfinite-coordinate and nonfinite-size cases. Every invalid case requires the explicit invalid-geometry unevaluated result. Engine calculations and results are unchanged by this follow-up to #2258.
