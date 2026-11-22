# Lee frame (1968) — first version, 2 review rounds

Route: `/research/benchmarks/lee-frame-1968`.
Research, not a design tool. Effort: low; impact: visible snap-through using the
existing engine. No research solver, engine numerics changes, or reference code.

Citation checked with `catalog.crossref_block` and `catalog.check_crossref`:
Seng-Lip Lee, Francisco S. Manuel, Edwin C. Rossow (1968),
“Large Deflections and Stability of Elastic Frame”, Journal of the Engineering
Mechanics Division 94(2), DOI https://doi.org/10.1061/JMCEA3.0000966.
The singular title follows Crossref. No abstract-based summary is claimed.

## One example

The model follows de Souza, Vanalli & de Luz (2020), §3.3, Figure 9:
an L-frame (0,0) → (0,120) → (120,120) cm, pinned at both ends, with a downward
point load at (24,120) cm. Twenty elastic Euler–Bernoulli frame elements, rigid
corner, E = 720 kN/cm², A = 6 cm², I = 2 cm⁴.
Engine inputs use m, kN, MPa: E = 7200, A = 0.0006, I = 2e-8.
The engine-owned definition is `engine/tests/benchmarks/lee_frame.json`;
both native tests and the browser worker read it. The web unit test asserts every
node, element, support, the load and the arc-length settings.

The production spherical arc-length solver runs 90 steps, with residual tolerance
1e-8. Each replay frame is the full final displacement field from a prefix run.
The WASM worker repeats exactly that procedure through `initSolver` and
`solveArcLength`, and can be stopped by terminating the worker. This deliberately
trades performance for a small implementation without changing the solver API.
The solver's `controlDisplacement` is not the load-point vertical displacement;
the page measures `-uz` at node 13 from the returned full displacement field.
After about 61 cm (step 73) the load-point displacement turns back: a real
snap-back of the path, so the chart marks the shown step by index, not by x.

## Result

First sampled peak (20 elements, the replay): **1.8657781212 kN** at step 47,
**48.5252446 cm** downward displacement of the load point. Neighbouring steps are
1.8637 / 1.8658 / 1.8652 kN, so this is a sampled local maximum, labelled as such.

Mesh and step study (`lee_frame_first_peak_converges_in_mesh_and_step`, values in
`lee_frame.json` → `convergence`, pinned to 1e-8 kN):

| Elements | Arc-length step | First sampled peak (kN) |
|---------:|----------------:|------------------------:|
| 20 | × 1 | 1.8657781212 |
| 20 | × 1/4 | 1.8658763037 |
| 40 | × 1 | 1.8581495615 |
| 40 | × 1/4 | 1.8582372627 |
| 80 | × 1 | 1.8563049718 |
| 80 | × 1/16 | 1.8563164846 |

The step size changes the peak by less than 1e-4 kN at every mesh. Halving the
element size changes it by 0.0076 then 0.0019 kN (ratio 3.98, asserted in 3–5),
the second-order rate expected for this element, so the 80-element value is within
about 0.001 kN of the mesh limit and the 20-element replay is about 0.5% high.

## What the result is compared with

Lee, Manuel & Rossow (1968) was not available to us. The first peak is compared with
published solutions of the same pinned frame (`reference-results/published-peaks.json`):

- de Souza, Vanalli & de Luz (2020), https://doi.org/10.1155/2020/3613892, Figure 10, plot
  the pinned path next to points of Schweizerhof & Wriggers (1986) and tabulate no value. We
  measured its first peak in pixels on the open PDF and checked the load scale on the
  semirigid (Sr = EI/L₀) peak of the same figure, which Figure 11 states as 2.1474 kN:
  **1.87 kN, reading uncertainty ±0.03 kN** (about three pixels, the marker half-height).
  The earlier by-eye 1.83 kN is superseded. Both the 20-element value and the value
  extrapolated to zero element length are compared within that uncertainty.
- Galvão (2000), point A, as tabulated by Neves (2025), Blucher Physics Proceedings, XV ECFA,
  paper 2025030, Table 1: **1.86 kN** (48.79 cm), printed to 0.01 kN. It is compared with our
  extrapolated value within half that unit, 0.005 kN; Galvão's own discretization is not known,
  so this is the strictest tolerance the printed digits allow.

The chart draws 1.87 kN as a horizontal rule. Figure 11's values are for semirigid supports
and serve only to check the figure's scale.

## Validation in CI

`validate.py` reads a fresh native export (`LEE_REPLAY_OUTPUT`) of the engine test
`lee_frame_limit_load`, which also asserts the mesh and step study values of the case file to
10⁻⁸ kN, and writes `VALIDATION.json`, `reference-results/published_comparison.json` and
`reference-results/MANIFEST.json`. Its checks: all 90 steps converge; the 20-element first
peak against the regression value (a historical bound, not accuracy); the arc-length step
effect at 20, 40 and 80 elements (below 10⁻⁴ kN); the ratio of successive mesh changes within
1 of 4 (second order); the committed replay against the fresh run (10⁻⁹); and the three
published rows. The research workflow runs `validate.py check`, which fails when the
committed files differ from a fresh run.

Status: `numerically-validated`, `reproduced_published_results: false`, because the published
values are later solutions of the frame, not Lee (1968).

## Scope

- The comparison covers the first peak; the later snap-back branches are
  Stabileo's result alone.
- The mesh and step study covers the first peak only.
- Research, not engineering certification.


## Open questions

- A digitized Figure 10 curve (or Schweizerhof & Wriggers 1986 values) would allow a
  whole-path comparison.
- The original Lee, Manuel & Rossow (1968) paper was not available to us; its
  values could replace the second-hand figure reading.

## Reproduce

Inside `nix develop`, run:

```
LEE_REPLAY_OUTPUT=$PWD/fresh.json cargo test -p dedaliano-engine --release --test solver lee_frame -- --nocapture
python3 -I research/benchmarks/lee-frame-1968/validate.py generate fresh.json
```

The page can rerun the path live with 20, 40 or 80 elements, refined in the browser exactly
as `refined()` in the engine test does; it shows the first peak of that run next to the native
study value.

To regenerate the same-solver replay, add
`LEE_REPLAY_OUTPUT=$PWD/research/benchmarks/lee-frame-1968/results/stabileo_results.json`.
The JSON is published solver output allowed by `research/README.md`.

## Review round 2 (Kimi → Codex → Claude, 2026-10-30)

- Reference: the unverified "provisional 1.83 kN" became a stated by-eye reading,
  compared to the nearest percent; the unused `tolerance: 0.02` was removed.
- "First limit load" relabelled "First sampled peak"; mesh and step study added.
- Tests: full model, step 47 / 1.8657781212 kN / 48.5252446 cm through the page's
  `firstPeak` and `point`, the same through a fresh WASM solve, the study values
  and the displayed percentages.
- The old `validation_corotational_ext_lee_frame` (fixed-base cantilever L-frame)
  renamed `validation_corotational_ext_l_frame_cantilever`: it is not Lee's frame.
- Page: verification rows with their own reasons, provenance only in the article,
  legend titled "Displacement magnitude |u| (m)", six locales, localized errors and
  chart label, one-based slider with `aria-valuetext` and a visible readout, the
  shown step marked on the chart by index, reduced motion followed live,
  "Stopped at k/90" for an interrupted run, 44 px targets, viewer first on phones.
- e2e: six locales × 360, 390, 844×390, 810; viewer position, element-level text
  size and target checks, `aria-valuetext`, reduced-motion live run.
