### Fixed
#### Weld reference tests reject missing and nonfinite results (2026-11-16)

Require every evaluated WASM weld reference value to be a finite number before comparing its magnitude. Unloaded zero references now reject null, including a nonfinite unity ratio serialized as null, and other values that JavaScript arithmetic can coerce to zero. Add regression checks for invalid values, finite numeric boundaries and an incorrect finite result without changing the reference tolerance. Engine calculations and results are unchanged by this test-only follow-up to #2258.
