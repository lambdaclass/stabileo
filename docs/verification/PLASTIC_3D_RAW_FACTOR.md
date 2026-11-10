# Raw 3D plastic factor rounding at the certificate boundary

Confirmed locally on 2026-11-10 during the checked-factor investigation under
#1760. The two above-interval cases below are raw-factor rounding at the
certificate boundary, not engine wrong results. A sound certificate is available
for both, so the combined API returns its lower bound with a warning.

## Reachable reproducer

[unconservative-cantilever.bin](../../engine/fuzz/corpus-regressions/plastic-lp-budget/unconservative-cantilever.bin)
is derived from the existing `good-cantilever.bin` by setting its nodal load's
`fy` to zero and `fz` to -0.1. Its selector is the combined checked 3D API.
No hidden solver-state change or injected fault is involved. The complete model,
section capacities, units and original geometry are in the committed artifact.

The raw engine returns collapse factor **100.00000000000001** while the sound exact
certificate is **[99.99999999999999, 100.0]**, with `solverWithinBounds: false`.
The raw factor is above the certified upper bound by one binary64 rounding step.
These numbers were measured from the input and are asserted exactly in
`issue_1760_above_interval_roundoff_returns_certified_lower`; the test also asserts the
strict direction of the discrepancy. The combined API returns exactly the
certified lower bound and preserves the raw factor and interval in the existing
structured warning. No tolerance is added to the certificate comparison.

The separate raw API remains approximate and unchanged. Whenever a sound finite
ordered certified interval exists, the combined API reports its lower bound,
whichever side of the interval the raw factor falls on. It refuses when no sound
certificate is available.

## Existing portal control

The existing in-plane portal regression is also above its exact upper bound:
raw factor **133.3333333362207**, certified interval
**[133.3333333292618, 133.33333333333334]**. These values were measured under the
pinned Rust 1.99.1 by `issue_1760_portal_above_certificate_returns_certified_lower`, which
constructs the existing `portal` fixture, asserts the strict above-interval
comparison, and requires the certified lower bound with the structured warning.
The relative raw-factor excess is about 3e-11: rounding at the certificate
boundary. The original raw numerical and serialization assertions remain. The
returned factor equals the lower bound exactly; no tolerance is used to accept it.

## Targeted regression

```sh
make shell
cargo test --locked --release --manifest-path engine/fuzz/Cargo.toml --lib plastic::tests::issue_1760_above_interval_roundoff_returns_certified_lower -- --exact
```

The regression runs under the repository’s pinned Rust 1.99.1. The test
requires the above-interval raw result and checks that the combined API returns
the certified lower bound with a `PL-3D-CERTIFICATE-MISMATCH` warning reporting
the raw factor and interval. The targeted actual-WASM check uses the same input:

```sh
make test.engine.plastic-wasm
```

Both above-interval cases return safe certified factors. Below-interval raw
roundoff is covered separately by
`issue_1760_conservative_roundoff_returns_certified_lower`, which requires exact
equality to the certified lower bound and preservation of the raw mismatch.
