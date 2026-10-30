# Lee frame (1968) — first version, 0 reviews

Route: `/research/benchmarks/lee-frame-1968`.
Research, not a design tool. Effort: low; impact: visible snap-through using the
existing engine. No research solver, engine numerics changes, or reference code.

Citation checked with `catalog.crossref_block` and `catalog.check_crossref`:
Seng-Lip Lee, Francisco S. Manuel, Edwin C. Rossow (1968),
“Large Deflections and Stability of Elastic Frame”, Journal of the Engineering
Mechanics Division 94(2), DOI https://doi.org/10.1061/JMCEA3.0000966.
The singular title follows Crossref. No abstract-based summary is claimed.

## One example

An L-frame: (0,0) → (0,120) → (120,120) cm, pinned at both ends.
A downward point load at (24,120) cm. Twenty elastic Euler–Bernoulli frame
elements, rigid corner, E = 720 kN/cm², A = 6 cm², I = 2 cm⁴.
Engine inputs use m, kN, MPa: E = 7200, A = 0.0006, I = 2e-8.
The engine-owned definition is `engine/tests/benchmarks/lee_frame.json`;
both native tests and the browser worker read it.

The production spherical arc-length solver runs 90 steps, with residual tolerance
1e-8. Each replay frame is the full final displacement field from a prefix run.
The WASM worker repeats exactly that procedure through `initSolver` and
`solveArcLength`, and can be stopped by terminating the worker. This deliberately
trades performance for a small implementation without changing the solver API.
The solver's `controlDisplacement` is not the load-point vertical displacement;
the page measures `-uz` at node 13 from the returned full displacement field.

## Reference and result

First sampled peak: **1.8657781212114986 kN**, step 47, at **48.5252446 cm**
downward displacement of the load point.
Provisional reference: **approximately 1.83 kN**.
Difference: **+0.0357781212 kN (+1.9551%)**.
The tight 1e-8 kN test pins the production result, not reference accuracy.

Reference location: de Souza, Vanalli & de Luz (2020), “Numerical-Computational
Model for Nonlinear Analysis of Frames with Semirigid Connection”,
https://doi.org/10.1155/2020/3613892, §3.3, Figure 10 (ideally pinned curve),
which compares with Schweizerhof & Wriggers (1986). The exact numerical locator
for 1.83 kN has NOT been verified; it is a provisional target, not a digitized
or author-tabulated value. Figure 11's 2.1474 kN is for semirigid supports and
must not be substituted. The chart shows our computed path and a provisional
horizontal limit-load reference, not an invented published reference curve.

## Not yet

- Verified numerical reference and digitized full reference path.
- Mesh convergence and all later snap-back branches.
- Independent reviews (0), published-figure validation, or engineering certification.

The catalogue status stays `proposed` because its higher evidence statuses require
verified reference evidence; delivery `stage: first-version` is separate.

## Reproduce

Inside `nix develop`, run:

```
cargo test -p dedaliano-engine --release --test solver lee_frame -- --nocapture
```

To regenerate the same-solver replay, add
`LEE_REPLAY_OUTPUT=$PWD/research/benchmarks/lee-frame-1968/results/stabileo_results.json`.
The JSON is published solver output allowed by `research/README.md`.

## Checks in this checkout

- Native shared-case regression and replay generation: passed.
- Catalogue citation check, offline checks, catalogue tests and isolation: passed.
- `nix develop -c make typecheck.web`: passed with no new TypeScript errors.
- Route-size gate against the original branch: passed. Each landing route remains
  2,187,096 bytes (exactly +0); app routes change by +6 bytes, within the existing
  128-byte gate tolerance.
- Full web unit suite: 1,293 files passed, 2 skipped; 15,863 tests passed,
  14 skipped (`npm run test:unit -- --maxWorkers=2` inside the Nix shell).
  The default-concurrency attempt hit timeouts and resource-sensitive detailing
  assertions; the rerun passed without changing timeouts or numerical tolerances.
- Browser e2e spec covers 360, 390 and 810 px, but execution here is blocked before
  tests by Chromium's macOS `bootstrap_check_in` permission denial during prerender.
  Responsive layout and browser execution must still be checked in CI.
