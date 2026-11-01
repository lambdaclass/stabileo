> Reference correction (#852): the shallow-toggle input here is a rigid-jointed frame with pinned bases, not a pin-jointed truss. At its default geometry it has no limit point over inversion. The web page now compares its native/live path against the derivative of U = EA(L−L0)²/L0 + 3EIβ²/L0, β = atan(y/a)−atan(h/a), giving P = 2EA(1−L/L0)y/L − 6EI a β/(L0 L²). See `fix/846-shallow-toggle:engine/tests/BENCHMARK_REFERENCES.md`. The native comparison code, committed validation files and table below preserve the original axial-only comparison as historical evidence; their shallow-toggle failures must not be interpreted as engine defects or frame limit-point checks. The axial-only formula describes a pin-jointed truss.

# Riks/Crisfield production arc-length evidence

This directory shares two complete production `ArcLengthInput` models between the native engine
validation tests, a native evidence harness, and the browser WASM checker. It contains no second
solver. Both cases use pinned-base, two-member corotational frame models and the production
`dedaliano_engine::solver::arc_length::solve_arc_length` implementation.

## Shared case schema

`reference-results/arc_length_snap_through.json` is browser-consumable JSON with:

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

### Reproduction platform and PR #857 evidence refresh

The committed evidence is generated with Rust 1.99.1 on **x86_64 Linux** (the CI
platform). The exact JSON comparison is platform-specific: it is not a portable
floating-point parity test. Use that platform for `generate` and `check`; use the
unchanged tolerances in the WASM parity checker for browser/native agreement.

The previous evidence from `7508e0fe6` reproduces exactly on aarch64 macOS with
Rust 1.99.1, but fails the exact comparison on x86_64 Linux. Reproduction with the
same source and locked dependencies on both platforms isolated the cause to
platform floating-point rounding. There is **no intervening engine numerical
commit or PR**: `git diff 7508e0fe6 b46891eb5 -- engine/src` is empty. The wave-two
reference correction (#852) changed only this README within this paper's
directory; it did not change the native harness, case input or validation schema.

The Linux refresh changes 1,434 numeric leaves in `native-results.json`: 723
rotations (`ry`), 699 horizontal displacements (`ux`), and 12 control displacements.
The largest absolute change is 5.551115123125783e-17. Some relative changes are
larger only in symmetry residuals near zero (for example an apex rotation around
6.5e-22 changes by 1.34e-23). All load factors, loads, step counts, iterations,
convergence flags, prefix checks, limit points, and validation verdicts are
unchanged. `VALIDATION.json` changes only the von Mises maximum normalized path
error and its repeated check value, from 0.000022874501192424383 to
0.00002287450119172802 (absolute change 6.963627265967054e-16). `MANIFEST.json`
updates the two corresponding hashes; the shared input hash is unchanged.
The regenerated files pass exact checks on both Debian bookworm and Ubuntu 24.04
x86_64 Linux. No solver code, input, comparison rule or tolerance was changed.
The historical shallow-toggle axial-reference failure remains visible.

For each case, native output records overall convergence, total iterations, final load factor, all
step records, final nodal displacements, and a displacement frame for every step. Frame `k` comes
from an independent production rerun with `maxSteps=k`; all `k` step records must exactly equal the
corresponding prefix of the full path before the frame is accepted. These prefix checks are recorded
in the output.

Current committed measurements:

| Case | Steps | Limit reached | Measured limit load | Limit-load error | Limit-displacement error | Max normalized path error |
|---|---:|---|---:|---:|---:|---:|
| shallow-toggle | 100 | no | 48.749999866981085 kN | 0.4921084021 | not checked | 0.3842314882 |
| von-mises-truss | 700 | yes, step 626 | 15649.999940493539 kN | 0.0014511217 | 0.0391861286 | 0.0000228745 |

The unchanged shallow-toggle run ends before the analytical limit. Its limit-load and path checks
therefore remain failing and `VALIDATION.json` has `allPassed: false`. Its measured peak apex
displacement is 0.0024736193991736002 m, but no limit-displacement check is emitted because no limit
was reached. The von Mises case passes all its checks. No solver setting, canonical case 1 input, or
tolerance was changed to conceal the case 1 failure.

## WASM parity

After building the engine's browser bundle:

```sh
node research/numerical-methods/riks-crisfield/wasm/check.mjs \
  <engine-wasm-bundle-dir> \
  research/numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json \
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

### Evidence comparison across machines

The committed native results and VALIDATION.json are compared with a fresh run number by number to 1e-12 relative (every other field exactly): CI runners and the machine that generated the evidence can differ in the last bits of a float (observed: at most 5.6e-17 absolute). Inside one run, each recorded step is still reproduced bit for bit before its frame is stored.
