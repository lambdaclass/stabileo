# Checked 3D plastic analysis returns the certified lower bound (2026-11-10)

Results-change entry `plastic-3d-certified-lower-bound`.

The combined `certify_plastic_3d` API now reports the sound certified interval's
`lambdaLower` as `results.collapseFactor` whenever a finite, ordered interval
exists. This applies whether the raw incremental factor is below, inside, or
above the interval. The API refuses when no sound certificate is available.
No tolerance, baseline, exact certificate check, or resource limit changes.

The JSON structure remains `{ results, certificate }`. The certificate's
`solverCollapseFactor`, `solverWithinBounds` and `solverDeviation` describe the
raw incremental factor. The existing warning reports that factor and the
certified interval, labels the returned lower bound, and states that incremental
steps and hinges retain their raw values. Factors outside either boundary also
produce a structured warning with phase `PL-3D-CERTIFICATE-MISMATCH`.

All thirteen 3D issue artifacts return exactly their certified lower bounds.
The cantilever and in-plane portal cases in the
[raw-factor boundary report](../verification/PLASTIC_3D_RAW_FACTOR.md) also return
the certified lower bound with a warning; their small above-interval differences
are raw-factor rounding at the certificate boundary.

The separate raw incremental solver and the app's raw pushover and research
paths are unchanged. Only the combined API's returned collapse factor and
interval are certified; its retained raw steps, hinges and mechanism flag are
not certified by that interval. Native and actual-WASM regressions check lower
bound equality, preserved raw comparisons, serialization and warnings.
See [the bounded replay evidence](../verification/plastic-certified-lower-results.json)
and [the resource replay report](../verification/PLASTIC_LP_BUDGET.md).
