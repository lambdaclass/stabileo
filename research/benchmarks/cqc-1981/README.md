# SRSS versus CQC (1981)

Stage: **first-version**. **0 reviews**. Research, not a design tool.
Effort/impact: low effort (existing production 3D modal, spectrum and viewer APIs),
high illustrative value (18% base-shear difference for close modes). One example only.

Wilson, E. L., Der Kiureghian, A. & Bayo, E. P. (1981),
“A replacement for the srss method in seismic analysis”,
Earthquake Engineering & Structural Dynamics 9(2), 187–192.
DOI: https://doi.org/10.1002/eqe.4290090207.
Citation checked with `research/tools/catalog.py show` against Crossref on 2026-10-29.
Summary source: publisher abstract, https://onlinelibrary.wiley.com/doi/abs/10.1002/eqe.4290090207.
No paper text, figures or external implementation copied.

## One example

The shared input is `engine/tests/benchmarks/cqc_1981.json`. A 4 × 3 m plan,
3 m high, four fixed-base Euler–Bernoulli columns. E = 200000 MPa,
ν = 0.3; two columns have Iy = Iz = 5.625e-6 m⁴, the other pair
6.80625e-6 m⁴. Roof rotations and Y/Z translations are restrained.
Equal-X constraints tie each transverse pair. Two axial roof ties have
EA/L = 10 kN/m each. Each roof node carries 5 t in X only; member density
is zero. These are idealized shear-building constraints, not a realistic
slab or a design-ready building. There are exactly two dynamic coordinates.

The condensed matrices are M = diag(10,10) t and
K = [[1020,-20],[-20,1230]] kN/m. The closed-form eigenvalues are
(a+d ± sqrt((a-d)²+4b²))/(2m). A corresponding eigenvector is
[1,(mω²-a)/b], normalized to φᵀMφ = 1. Γ = φᵀM[1,1].
The spectrum is Sa = 1 m/s² over 0–10 s, equal damping ξ = 0.05,
X excitation, unit importance and reduction factors. For each mode,
V = Γ²Sa and u = φΓSa/ω². SRSS is sqrt(ΣRi²); CQC is
sqrt(ΣΣρijRiRj), with
ρ = 8ξ²(1+r)r^(3/2)/[(1-r²)² + 4ξ²r(1+r)²], r = ωj/ωi.

`reference.py` evaluates just these closed-form expressions, independently of
engine code. It verifies the constants in the shared case. The Rust test reads
that same case, calls production modal + spectrum analysis, checks frequencies,
100% X mass participation, base shears and both roof translations at 1e-8
relative tolerance, and can export the actual run for replay. No engine
numerics or existing tolerances are modified.

Reference: f = 1.605897989, 1.766467727 Hz; ρ = 0.523274863.
Base shear: SRSS 14.387570614 kN; CQC 17.549731954 kN.
SRSS is 18.0183% below the CQC estimate. This is **not** a measured error
against a ground-motion record; response-spectrum combinations are estimates.


Native production-engine run (all nine checks passed):

| Rule | Closed form (kN) | Stabileo (kN) | Difference (kN) |
|---|---:|---:|---:|
| SRSS | 14.387570614381 | 14.387570614381 | 9.237e-14 |
| CQC | 17.549731954096 | 17.549731954096 | 1.030e-13 |

## Reproduce

```sh
python3 research/benchmarks/cqc-1981/reference.py
CQC_REPLAY_OUTPUT="$PWD/research/benchmarks/cqc-1981/results/stabileo_results.json" \
  nix develop -c cargo test -p dedaliano-engine --test solver cqc_1981 -- --nocapture
nix develop -c make typecheck.web
make test.web.unit
```

The page at `/research/benchmarks/cqc-1981` loads that native-engine replay,
then recomputes via `initSolver`, `solveModal3D` and `solveSpectral3D` in the
production WASM wrapper. The browser test checks replay/live agreement.
The Stabileo scalar-field viewer shows an explicitly labelled axonometric
projection of the actual 3D nodes and bars. Animation scales the displacement
envelope; it is not a mode oscillation or a time history. Stop cancels replay
and pending result publication; this tiny synchronous WASM solve cannot be
interrupted midway. Restart restores the precomputed replay.

## Not yet

- Original paper building and published numerical tables.
- Time-history envelope and record-specific accuracy.
- Torsional response, multi-storey examples, parameter sweeps.
- Independent reviews and design certification.

The requested MacNeal–Harder remote-tracking branch was unavailable in this
checkout; no Git writes or fetch were used to obtain it.

## Local verification, 2026-10-29

- Native benchmark: passed, nine comparisons; maximum relative difference 6.42e-15.
- CQC Vitest: six passed, including the actual production WASM boundary.
- Catalogue citation check, catalogue tests/offline export, isolation, viewer rule,
  test-target registration and `make typecheck.web`: passed. No new TypeScript
  errors; no CQC errors in the full Svelte scan.
- Full web unit suite: 15853 passed, 11 failed, 14 skipped. One CQC literal-label
  failure was fixed with translation keys. Rerunning all affected files plus CQC
  with one worker gave 87 passed, 3 failed, 1 skipped. The remaining failures are
  existing 15-second timeouts in `steel-optimise-variable-end.test.ts`,
  `variable-generated.test.ts` and `taper.test.ts`; no limits were changed.
- The three e2e cases (360/390/810 px) could not launch Chromium: macOS sandbox
  MachPort bootstrap permission denied. The browser-control host was also
  unavailable. Responsive CSS is implemented, but visual and browser-live
  verification remain pending. The gallery thumbnail is a chart rendered from
  the actual replay's base shears, not a viewer screenshot or a paper figure.
