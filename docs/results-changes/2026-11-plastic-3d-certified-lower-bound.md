# Checked 3D plastic analysis returns the certified lower bound (2026-11-10)

Results-change entry `plastic-3d-certified-lower-bound`.

The combined `certify_plastic_3d` API returns the sound exact certificate's
`lambdaLower` as `results.collapseFactor`. It accepts a raw incremental factor
below the interval because the certified result remains available. It refuses
when no sound finite ordered interval is available, or when the raw factor is
strictly above `lambdaUpper`. No tolerance, baseline, exact check, or resource
limit changes. The separate raw incremental solver is unchanged.

This replaces the unreleased local blanket refusal in commit 5c0ca25b3. All
thirteen 3D issue artifacts were conservative: their raw factors were below the
sound intervals. Each now succeeds and returns exactly its certified lower bound.
For #1760, the raw factor remains 9.345131066713956, the certified interval remains
[11.574222305948126, 11.57476297081718], and the returned factor is
11.574222305948126. These values come from the committed replay evidence.
The unchanged 2D #1261 refusal remains `PL-2D-INVARIANCE`.

The JSON structure remains `{ results, certificate }`. The certificate's
`solverCollapseFactor`, `solverWithinBounds` and `solverDeviation` still describe
the raw incremental factor. In particular, `solverWithinBounds: false` remains
false when that factor is below the interval, even though the returned certified
factor is now its lower bound. The existing `results.warnings` list explicitly
labels that lower bound, reports the raw factor and interval, and states that
incremental steps and hinges retain their raw values. A below-interval mismatch
also appears as a structured warning with phase `PL-3D-CERTIFICATE-MISMATCH`.
An above-interval raw factor still causes an error with that phase.

The app's `solvePlastic3D` wrapper calls the separate raw `solve_plastic_3d` API;
this change does not reroute the pushover or research views. The pushover reads
`collapseFactor`, `isMechanism`, `steps` and `hinges`, and its result disposition
reads structured known-issue diagnostics. Those fields remain compatible.
`PlasticCertificate.svelte` reads the displayed factor against the bounds via
`plasticReading`, rather than treating the raw `solverWithinBounds` flag as the
verdict on the displayed factor. Returning `lambdaLower` therefore reads as
inside while retaining the raw mismatch evidence. Native round-trip and actual
WASM tests check these fields and warnings without flattening the result.

A separate small reachable input produces an unconservative raw factor by
roundoff, and the existing in-plane portal also exceeds its upper bound. These
are reported as [engine wrong results](../verification/PLASTIC_3D_RAW_FACTOR.md)
with a committed input and strict refusal regression. No advisory is added. The
previous local/unreleased advisory for conservative mismatches is removed.

The reproducer commit contains fifteen failing tests marked with their known
wrong issue IDs: thirteen artifacts, conservative roundoff, and unavailable
certification. The fix removes those ignores. Original raw-solver numerical
assertions remain unchanged. Repeated bounded corpus replay checks the exact
returned lower bound, raw mismatch warning and zero retained allocations.
See [the follow-up evidence](../verification/plastic-certified-lower-results.json)
and [the original resource replay report](../verification/PLASTIC_LP_BUDGET.md).
