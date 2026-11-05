# Newmark (1959): first version

Stage: `first-version`. Review rounds: **2** (round 1: Codex, Kimi; round 2: Kimi, Codex, Claude). Research, not a design tool.

Nathan M. Newmark, “A Method of Computation for Structural Dynamics”, Journal of
the Engineering Mechanics Division 85(EM3), 67–94 (1959).
DOI: https://doi.org/10.1061/JMCEA3.0000098. Bibliography fetched and verified with
`research/tools/catalog.py` against Crossref. The publisher abstract describes
a structural dynamics computation procedure; no paper figures or code were copied.

Effort/impact: low effort (existing solver and viewer), high explanatory impact
(the phase lag is immediately visible). One example only: a synthetic axial frame
member, L=1 m, A=0.01 m², E=10 MPa, density=300000 kg/m³. Node 1 is fixed;
node 2 has only X translation free. The consistent axial mass reduces to
m=ρAL/(3×1000)=1 tonne; k=1000EA/L=100 kN/m. This is an exact SDOF **discrete
finite-element model**, not an exact continuum bar. F=1 kN from t=0, u(0)=v(0)=0,
no damping. The solver initializes acceleration from equilibrium.

The shared case is `engine/tests/benchmarks/newmark_1959.json`; the engine test
reads it directly and the web imports the same file. No engine/src changes.
Production `solve_time_history_3d`, β=1/4, γ=1/2, runs natively for replay and
through `initSolver` / `solveTimeHistory3D` for browser recomputation.

## Reference and checks

ω=√(k/m)=10 rad/s, T=2π/ω, u(t)=(F/k)(1−cos ωt).

The discrete prediction follows from the method itself. For an undamped SDOF the
β=¼, γ=½ recurrence advances z=u−F/k by an amplification matrix whose
eigenvalues are e^{±iθ} with cos θ=(1−(ωΔt/2)²)/(1+(ωΔt/2)²), that is
θ=2 atan(ωΔt/2). With u(0)=v(0)=0 and the starting acceleration F/m this gives
u_n=(F/k)(1−cos nθ), and the discrete period is T_n=2πΔt/θ=πΔt/atan(ωΔt/2).
Period elongation of average acceleration is also discussed in Chopra,
*Dynamics of Structures*, ch. 5. These expressions are reference formulas, not a
second solver.

Because |cos a − cos b| ≤ |a − b|, the difference from the continuous solution
after N steps is bounded by the phase lag:
max|u_n − u(t_n)| ≤ (F/k)·min(2, N(ωΔt − θ)). At Δt/T=0.025 over four periods
this is (F/k)·8π(1 − atan(π/40)/(π/40)) = 0.515 mm.

Periods are measured from upward crossings of the equilibrium displacement,
using linear interpolation and averaging over the available full periods.

Four steps: Δt/T=0.025, 0.05, 0.1, 0.2 over four exact periods. Thirteen checks,
written to `VALIDATION.json` by the engine test itself:

- every computed sample matches u_n within 1e-10 m (per step);
- the measured period matches T_n within 0.5% (per step);
- the maximum difference from the continuous solution is below the phase-lag
  bound above, plus the 1e-10 m discrete tolerance (per step);
- the finest run stays within 0.5 mm of the continuous solution (kept from the
  first version; the bound above is the derived limit).

The test also derives L from the node coordinates, checks k=1000EA/L and
m=ρAL/3000 against the case's reference values, the supports, the single 1 kN
step load at node 2, β, γ and the absence of damping. The page builds its model
description from the same JSON, and recomputes the thirteen checks from the
histories it shows, so the badge follows a live recompute. A Vitest test
(`web/src/components/research/newmark1959/__tests__/benchmark.test.ts`)
recomputes every check from the replay and compares it with `VALIDATION.json`.
Increasing phase error with coarser steps is intentional, not a failed or relaxed
tolerance. These are analytical verification checks, not certification.

Regenerate the replay and the evidence (test-only opt-in export):

```sh
make research.newmark.replay
```

The page uses the shared Stabileo scalar-field viewer, a deformed axial member
(scale ×10), replay controls, and a displacement chart. The replay is identified
as native production output; live values replace only the selected run. Stop
cancels a pending result and playback; the tiny synchronous WASM solve itself
cannot be interrupted midway. Playback is tied to physical time: every time
step plays 2.5 times slower than real time, so the coarse run's longer period is
visible as a longer cycle. Catalogue status remains conservatively `proposed`;
runnable does not imply reviewed.

What the page is compared with: the exact step response and the closed-form
discrete solution above. No number printed in the 1959 paper is compared, and
the page says so plainly; it cites this page as a "benchmark after" the paper,
not a reproduction.

## Native results

| Δt/T | Exact T (s) | Discrete T_n (s) | Stabileo T (s) | Elongation (%) | Max displacement difference (mm) | Phase-lag bound (mm) |
|---|---|---|---|---|---|---|
| 0.025 | 0.628318531 | 0.629608341 | 0.629609884 | 0.205525 | 0.482500 | 0.514867 |
| 0.05 | 0.628318531 | 0.633452674 | 0.633443883 | 0.815725 | 1.898113 | 2.037012 |
| 0.1 | 0.628318531 | 0.648471791 | 0.648495262 | 3.211227 | 7.239456 | 7.810774 |
| 0.2 | 0.628318531 | 0.703737543 | 0.704207520 | 12.078108 | 19.012563 | 20.000000 |

## Not yet

- Published paper figures or numerical examples.
- Damping, harmonic loading, nonlinear response or multi-DOF frames.
- Engineering certification.
- Page text in German, French and Turkish (research pages are English, Spanish
  and Portuguese for now; those locales fall back to English).

## Local verification of this first version (historical)

- Native shared-case test: passed; all five new Vitest tests passed, including
  actual WASM/native replay agreement.
- Catalogue tests, Crossref citation verification, offline catalogue check,
  research isolation, and `make typecheck.web`: passed. Existing repository
  TypeScript errors remain at the baseline of 247.
- The full web unit suite completed: 1286 files passed, 7 failed, 2 skipped;
  15855 tests passed, 8 failed, 14 skipped, plus one worker RPC timeout. All seven
  failed files subsequently passed unchanged with two workers. That retry was
  stopped after those failures cleared; this is **not** a claim of one green
  full-suite run. No timeout, tolerance or expected value was changed.
- The browser bundle built. Playwright execution was blocked by macOS sandbox
  denial of Chromium's MachPortRendezvousServer. Browser-host access was
  unavailable and native Brave access was not approved. The 360/390/810 px
  smoke spec is included; visual/device verification remains pending.
- The requested `origin/research/engine-benchmarks-macneal-harder` ref was absent,
  so its read-only pattern could not be inspected. No Git write commands were run.

## Round 2 review fixes (2026-10-30)

Round 2 (Kimi, Codex, Claude) found no engine bug. Fixed: the verification label
now reads "Against closed form and native engine" and the paper row states what
the page is compared with; the citation says "benchmark after"; the engine test
checks L, k, m, supports, load, β, γ and damping and writes `VALIDATION.json`;
the badge is recomputed from the histories shown; playback follows physical time;
the chart's aria label is descriptive and its text scales to at least 12 px; the
slider is 44 px with a localized `aria-valuetext`; the viewer status text is
12 px; the viewer sits above the fold at 360×800, 390×844, 844×390 and 810×1080
(asserted in `web/e2e/research-newmark.spec.ts`, with 44 px targets, 12 px
text, no overflow, keyboard use, provenance wording and es/pt pages); the
table shows the discrete prediction T_n and the phase-lag bound; the catalogue
entry names its benchmarks and implementation; regeneration is a `make` target.

Verified locally: `make research.newmark.replay` (replay byte-identical, 13/13
checks), the research Vitest suite, the hard-coded-text and e2e-policy tests,
`npm run typecheck` (247, the baseline), `catalog.py check --offline`, and the
Playwright smoke specs `research-newmark.spec.ts` and `research.spec.ts`.

