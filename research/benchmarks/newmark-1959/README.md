# Newmark (1959): first version

Stage: `first-version`. Reviews: **0**. Research, not a design tool.

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
The discrete prediction is u_n=(F/k)(1−cos nθ), θ=2 atan(ωΔt/2),
T_discrete=2πΔt/θ. This expression is a reference formula, not a second solver.
Periods are measured from upward crossings of the equilibrium displacement,
using linear interpolation and averaging over the available full periods.

Four steps: Δt/T=0.025, 0.05, 0.1, 0.2 over four exact periods. Every computed
sample must match the discrete prediction within 1e-10 m. Measured periods must
match the discrete prediction within 0.5%; coarse interpolation explains residual
measurement differences. The finest run must stay within 0.5 mm of the continuous
solution. Increasing phase error with coarser steps is intentional, not a failed
or relaxed tolerance. These are analytical verification checks, not certification.

Regenerate the replay (test-only opt-in export):

```sh
nix develop -c bash -c 'NEWMARK_REPLAY_OUT="$PWD/research/benchmarks/newmark-1959/results/stabileo_results.json" cargo test -p dedaliano-engine --test integration newmark_1959 -- --nocapture'
```

The page uses the shared Stabileo scalar-field viewer, a deformed axial member
(scale ×10), replay controls, and a displacement chart. The replay is identified
as native production output; live values replace only the selected run. Stop
cancels a pending result and playback; the tiny synchronous WASM solve itself
cannot be interrupted midway. Catalogue status remains conservatively `proposed`
until the evidence is reviewed; runnable does not imply reviewed.

## Native results

| Δt/T | Exact T (s) | Stabileo T (s) | Elongation (%) | Max displacement difference (mm) |
|---|---|---|---|---|
| 0.025 | 0.628318531 | 0.629609884 | 0.205525 | 0.482500 |
| 0.05 | 0.628318531 | 0.633443883 | 0.815725 | 1.898113 |
| 0.1 | 0.628318531 | 0.648495262 | 3.211227 | 7.239456 |
| 0.2 | 0.628318531 | 0.704207520 | 12.078108 | 19.012563 |

## Not yet

- Published paper figures or numerical examples.
- Damping, harmonic loading, nonlinear response or multi-DOF frames.
- Independent reviews (0) or engineering certification.

## Local verification of this first version

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
