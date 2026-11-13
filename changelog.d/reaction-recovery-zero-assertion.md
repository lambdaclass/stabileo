### Fixed
#### Released-reaction WASM check accepts either sign of zero (2026-11-13)

The reaction recovery test compares the released rotational slave reaction with exact numeric zero, accepting both `-0` and `0`. Every nonzero value still fails that assertion. No engine results, tolerances or baselines change. Fixes the last signed-zero test failure in #1952.
