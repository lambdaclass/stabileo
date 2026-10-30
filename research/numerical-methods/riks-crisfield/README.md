# Riks/Crisfield method benchmarks

These are production-solver method benchmarks against analytical equilibrium and native/WASM
parity, not reproductions of numerical examples in Riks (1979) or Crisfield (1981). The page
states this comparison directly; it has no pending paper-comparison badge or author questions.
The derivations are in [BENCHMARK_REFERENCES.md](../../../engine/tests/BENCHMARK_REFERENCES.md).

## Models and references

Both cases use pinned-base corotational **frame** elements with a rigid apex. The historical
shallow-toggle input is not the current `test_arc_length_detects_limit_point` truss test.
Its `reference.upperLimit` is explicitly an axial-truss normalization scale, not a frame limit.
The von Mises case uses the geometry from `nonlinear_extended.rs`. Bending is small but nonzero;
the engine test bounds its contribution and the page's axial-reference residual includes it.
Neither case is represented as a numerical model taken from the method papers.

For half-span a, initial rise h, downward displacement v, y=h−v,
L₀=√(a²+h²), L=√(a²+y²), and E=1000 E_MPa in kN/m²:

- Axial truss: P=2EA(1−L/L₀)y/L. Its upper stationary point satisfies L³=a²L₀.
- Rigid frame: U=EA(L−L₀)²/L₀+3EIβ²/L₀, β=atan(y/a)−atan(h/a).
  Its derivative is P_frame=P−6EI a β/(L₀L²). At the default shallow geometry this
  reference has no limit through inversion. Only its equilibrium residual is checked here.

The shared JSON input, native-results.json, VALIDATION.json and MANIFEST.json under
`reference-results/` are the published data consumed by the browser. No research solver or
production engine numerical change is involved.

## Upper-limit sampling and accuracy budgets

The von Mises replay uses Δs=12.5, maxSteps=1400. In the spherical constraint
‖Δu‖²+Δλ²‖f_ref‖²=Δs², ‖f_ref‖=1000 kN, so |Δλ|≤0.0125 (12.5 kN per step).
This bounds the load grid, not the displacement error at a stationary point. A limit requires
adjacent converged frames with a positive load followed by a lower load. A quadratic through
that frame and its two neighbors estimates the peak; its vertex must lie inside the bracket
and the quadratic must be concave. Otherwise the measured reversal point is used. Truncated
and failed paths do not pass a limit check. Unavailable limits have null evidence values and
are displayed as “not evaluated”; they are excluded from the worst-error calculation.

Each tolerance has a separate budget, tightened from the original 5%:

| Metric | Tolerance | Basis |
|---|---:|---|
| von Mises peak load | 0.001 relative | Below the old 25 kN load-grid fraction; interpolation reduces sampling error |
| von Mises peak displacement | 0.005 relative | Sub-percent interpolation target, independently checked against the exact stationary point |
| von Mises path residual / axial peak | 0.00005 | Includes the small frame/truss bending difference, bounded in the engine test |
| shallow frame residual / axial peak scale | 0.00001 | Independent frame-energy derivative; solver tolerance remains unchanged |

Current native measurements (the machine-readable report is authoritative):

| Case | Steps | Upper limit | Peak load (kN) | Peak displacement (m) | Maximum normalized residual |
|---|---:|---|---:|---:|---:|
| shallow-toggle | 100 | not applicable to this reference | — | — | 4.39562048e-6 |
| von-mises-truss | 1400 | crossed | 15673.05172945 | 0.916750023010 | 2.28177564e-5 |

The von Mises peak load error is 1.96986485e-5 and displacement error 1.02625482e-4.
The replay crosses only the upper limit; it does not demonstrate the lower limit or full inversion.
The native and browser tests compare every displayed path coordinate, sign, load factor,
iteration count, convergence flag, peak and residual against the committed evidence.

## Reproduce and verify

```sh
CARGO_TARGET_DIR=/private/tmp/claude-501/rfix-riks-crisfield-target CARGO_BUILD_JOBS=4 \
  cargo run --release --manifest-path research/numerical-methods/riks-crisfield/native/Cargo.toml -- generate
CARGO_TARGET_DIR=/private/tmp/claude-501/rfix-riks-crisfield-target CARGO_BUILD_JOBS=4 \
  cargo run --release --manifest-path research/numerical-methods/riks-crisfield/native/Cargo.toml -- check
CARGO_TARGET_DIR=/private/tmp/claude-501/rfix-riks-crisfield-target CARGO_BUILD_JOBS=4 \
  cargo test --release --manifest-path research/numerical-methods/riks-crisfield/native/Cargo.toml
node research/numerical-methods/riks-crisfield/wasm/check.mjs web/src/lib/wasm \
  research/numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json \
  research/numerical-methods/riks-crisfield/reference-results/native-results.json
```

`generate` writes the evidence and SHA-256 manifest. `check` reruns the production solves and
compares without rewriting. Across machines, numeric leaves satisfy
`abs(a-b) <= 1e-12 * max(abs(a), abs(b), 1)`; all other fields match exactly.
Within each run every step record in every independent maxSteps=k prefix must match exactly.
The browser rejects missing/nonfinite displacements and mismatches anywhere in the prefix.
The WASM parity rule remains `abs(wasm-native) <= 1e-10 + 1e-9*abs(native)`; integer counts
and convergence flags match exactly. No tolerance was loosened.

## Review record

Round 2: kimi, codex, claude, 2026-10-30. Confirmed findings addressed in the page, research
harness, native evidence, component tests and browser specification. Rejected findings remain
rejected. Playwright specifications require execution in a browser-capable environment.

## Open questions

No author questions were present on this page. Published example reproduction is outside the
claim: the actual references are the analytical equilibria above and production native output.
