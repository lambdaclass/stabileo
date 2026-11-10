### Fixed

#### Reject unexpected metamorphic failures and validate reported dynamic samples (2026-11-10)

Record passing and failing cells separately in the analysis-accuracy coverage baseline and check the exact retained failure set for each seed, including dynamic mirrors. Check reported time-history translations and rotations against the trace after constraint expansion and inclined-support mapping. Keep harmonic symmetry comparisons available when the optional accuracy estimate is missing, with no additional allowance. Limit moving-load moment recovery allowances to the distance along the response member instead of the full route. These changes affect verification only; engine results and the results-change registry are unchanged. The retained engine findings, including SA-2026-056, remain failures.
