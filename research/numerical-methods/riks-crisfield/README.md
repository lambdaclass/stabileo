# Riks/Crisfield production arc-length evidence — first version

This first version reproduces native engine runs and compares their browser WASM results and axial
closed-form references. It does not reproduce any published numerical example, table, figure or
limit load from Riks (1979) or Crisfield (1981).

This directory shares two complete production `ArcLengthInput` models between the native engine
validation tests, a native evidence harness, and the browser WASM checker. It contains no second
solver. Both cases use pinned-base, two-member corotational frame models and the production
`dedaliano_engine::solver::arc_length::solve_arc_length` implementation.

## Shared case schema

`engine/tests/benchmarks/arc_length_snap_through.json` is browser-consumable JSON with:

- units, the production entry point, and the Crisfield spherical constraint;
- the closed-form reference definition, source, sign conventions, unit conversion, and limit
  condition;
- WASM/native parity tolerances;
- for each case, geometry, apex node and displacement convention, reference load, exact upper-limit
  load/displacement/load factor, validation tolerances, and the complete production input.

The shallow-toggle case is exactly the model and control set used by
`test_arc_length_detects_limit_point`. The von Mises case uses the geometry from
`nonlinear_extended.rs`, a 1,000 kN downward reference load, and fixed 25 arc-length increments with
a 700-step budget so that it traces snap-through with adequate limit-point resolution.

## Closed-form reference

For half-span `a`, initial rise `h`, deformed rise `y = h - v`, and downward apex displacement
`v = -uz`:

```text
L0 = sqrt(a^2 + h^2)
L  = sqrt(a^2 + y^2)
P(y) = 2 E A (1 - L/L0) y/L
E  = E_MPa * 1000 kN/m^2
```

The upper stationary point satisfies `L^3 = a^2 L0`. The physical solver load is
`P = loadFactor * referenceLoad`, positive downward. The path check evaluates
`|P_solver - P(y)| / P_upper_limit` at every recorded step. Limit load and limit displacement use
relative errors; all three tolerances are 0.05. Frame bending is absent from this axial reference,
so disagreement is measured rather than hidden.

## Native evidence

From the repository root:

```sh
nix develop -c cargo run --release \
  --manifest-path research/numerical-methods/riks-crisfield/native/Cargo.toml -- generate
nix develop -c cargo run --release \
  --manifest-path research/numerical-methods/riks-crisfield/native/Cargo.toml -- check
```

`generate` explicitly rewrites `native-results.json`, `VALIDATION.json`, and `MANIFEST.json`.
`check` only reads them, reruns all native solves, recomputes validation and SHA-256 hashes, and
compares the results without rewriting files. `check` exits nonzero when the regenerated native
output, validation or manifest differs from the committed evidence; the separately reported
`validationPassed` flag remains false while a benchmark is known to fail.

For each case, native output records overall convergence, total iterations, final load factor, all
step records, final nodal displacements, and a displacement frame for every step. Frame `k` comes
from an independent production rerun with `maxSteps=k`; all `k` step records must exactly equal the
corresponding prefix of the full path before the frame is accepted. These prefix checks are recorded
in the output.

Current committed measurements:

| Case | Steps | Limit reached | Measured limit load | Limit-load error | Limit-displacement error | Max normalized path error |
|---|---:|---|---:|---:|---:|---:|
| shallow-toggle | 100 | no | 48.749999866981085 kN | 0.4921084021 | not reached (failure) | 0.3842314882 |
| von-mises-truss | 700 | yes, step 626 | 15649.999940493539 kN | 0.0014511217 | 0.0391861286 | 0.0000228745 |

The unchanged shallow-toggle run ends before the analytical limit. Its limit-load and path checks
therefore remain failing and `VALIDATION.json` has `allPassed: false`. Its measured peak apex
displacement is 0.0024736193991736002 m, and its limit-displacement check fails because no limit
was reached. The von Mises case passes all its checks. No solver setting, canonical case 1 input, or
tolerance was changed to conceal the case 1 failure.

## WASM parity

After building the engine's browser bundle:

```sh
node research/numerical-methods/riks-crisfield/wasm/check.mjs \
  <engine-wasm-bundle-dir> \
  engine/tests/benchmarks/arc_length_snap_through.json \
  research/numerical-methods/riks-crisfield/reference-results/native-results.json
```

The script initializes `dedaliano_engine.js` with `initSync`, invokes only the production
`solve_arc_length` export, and prints a JSON report. Step numbers, convergence flags, and iteration
counts must be identical. Load factors, control displacements, final load factor, and every final
`ux`/`uz`/`ry` displacement must satisfy
`abs(wasm-native) <= 1e-10 + 1e-9*abs(native)`. Missing, nonfinite, or out-of-tolerance results make
the process exit nonzero.

`MANIFEST.json` records SHA-256 hashes of the shared case, native output, and validation report.
This is code/reference agreement evidence, not experimental validation or an engineering
certification.

## Shallow-toggle triage

`DIAGNOSTICS.json` records the output of `cargo run --release --locked --manifest-path
research/numerical-methods/riks-crisfield/native/Cargo.toml -- diagnose` inside `nix develop`.
These are diagnostic variants, not replacements for the canonical shared case. All tolerances,
iteration limits, arc-step sizes and floors remain unchanged. Only the stated step budget and
section inertia vary; no engine implementation changes are involved.

| Variant | Steps completed | Iz (m⁴) | Final load (kN) | Final downward apex displacement (m) | Load reversal | Converged |
|---|---:|---:|---:|---:|---|---|
| Canonical | 100 | 1e-4 | 48.749999867 | 0.002473619399 | no | true |
| Budget only | 400 | 1e-4 | 198.749999425 | 0.010377419714 | no | true |
| Budget only | 2000 | 1e-4 | 998.749995960 | 0.061287466545 | no | true |
| Axial-like diagnostic | 400 | 1e-8 | -7.249886533 | 0.102969785409 | yes | true |
| Axial-like diagnostic | 2000 | 1e-8 | 615.750120059 | 0.259727914741 | yes | true |

The axial reference peak is 95.985048915 kN at 0.042289000986 m. The canonical run ends
because it completes its 100-step budget, not because the solver exhausts its minimum arc step
or fails convergence (`arc_length.rs` loops while `step < max_steps`; an exhausted retry sets
`converged = false`). Increasing the budget continues the same frame path beyond the reference
peak displacement without a load reversal. Its unreleased apex and finite bending stiffness
make the axial reference a different mechanical model. Reducing bending stiffness in a separate
diagnostic permits continuation through a turning point without changing solver numerics.

The implemented spherical constraint also bounds each load increment: with the single 50 kN
reference force, `|ΔP| = 50 |Δλ| ≤ Δs`. Even 100 steps all at the maximum `Δs = 0.5` can
accumulate at most 50 kN, below the 95.985 kN axial peak. The initial adaptive sequence
`0.05, 0.1, 0.2, 0.4`, followed by 96 steps of `0.5`, gives the observed 48.75 kN ceiling
(up to the displacement contribution and iteration accuracy). This budget cannot test passage
through that reference peak.

Thus this finding is a case-budget and reference-model mismatch, not evidence of a premature
solver abort. These runs do not establish general arc-length solver correctness or validate the
frame path against an independent frame solution. The canonical axial-comparison failures remain
visible, with their original tolerances and input unchanged.
