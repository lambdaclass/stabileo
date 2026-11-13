### Fixed

#### Detect repeated prescribed settlement and stalled arc-length regressions

Prescribed-master tests now continue from solved nonzero motion through changed targets and reversals. Native and WASM arc-length checks require motion above the assertion tolerance, preventing a converged zero-progress result from passing (#2009). Engine results are unchanged.
