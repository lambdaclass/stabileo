### Fixed

#### Reject self-certified buckling and time-history comparison allowances (2026-11-10)

Buckling comparison budgets check the matching reciprocal interval and zero crossings independently of the returned factor. Time-history defects must satisfy an independent load-based accuracy ceiling. Betti checks reject invalid projected bounds directly, and an absent zero-load item contributes zero error. The 3D harmonic and forced time-history mirror checks now compare representable models and record refusals and unrepresentable transforms for the rest. The retained dynamic wrong-result advisory is SA-2026-056 and appears as a pending draft in all six blog languages. No engine results or fixed comparison tolerances change.
