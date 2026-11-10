# Engine wrong result: raw 3D plastic factor above a sound exact interval

Confirmed locally on 2026-11-10. This is a separate engine numerical finding
within the checked-factor investigation tracked here under #1760; it is not a
resource-budget skip. No advisory or remote issue update is made.

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
`issue_1760_unconservative_roundoff_remains_refused`; the test also asserts the
strict direction of the discrepancy. This is an unconservative engine wrong
result even though its magnitude is roundoff. It must not be excused by adding a
tolerance to the checked boundary.

The raw plastic solver files are unchanged from the main baseline c420169e8:
`git diff c420169e8 -- engine/src/solver/plastic.rs engine/src/solver/plastic_3d.rs`
is empty. That baseline's combined function solved, certified and returned
`Ok(CertifiedPlastic3D { results, certificate })` without checking the mismatch.
Thus the reachable raw above-interval factor was also returned by that main
baseline. The earlier local commit 5c0ca25b3 already contained it via blanket
mismatch refusal; the follow-up preserves that refusal while accepting the
conservative cases. The separate raw API remains approximate and unchanged.

## Existing portal control

The existing in-plane portal regression is also above its exact upper bound:
raw factor **133.3333333362207**, certified interval
**[133.3333333292618, 133.33333333333334]**. These values were measured under the
pinned Rust 1.99.1 by `issue_1760_portal_above_certificate_is_refused`, which
constructs the existing `portal` fixture, asserts the strict above-interval
comparison, and requires the checked refusal. The original raw numerical and
serialization assertions remain. This is a second reachable main-baseline engine
wrong result, distinct from the thirteen conservative artifacts; no tolerance is
used to accept it.

## Targeted regression

```sh
make shell
cargo test --locked --release --manifest-path engine/fuzz/Cargo.toml --lib plastic::tests::issue_1760_unconservative_roundoff_remains_refused -- --exact
```

The repository Nix shell supplies the pinned Rust 1.99.1. The test
requires the above-interval raw result and checks that the combined API returns
`PL-3D-CERTIFICATE-MISMATCH`. The targeted actual-WASM check uses the same input:

```sh
make test.engine.plastic-wasm
```

The lower-bound selection must never convert an above-interval raw factor into
a successful checked answer. Conservative roundoff is covered separately by
`issue_1760_conservative_roundoff_returns_certified_lower`, which requires exact
equality to the certified lower bound and preservation of the raw mismatch.
