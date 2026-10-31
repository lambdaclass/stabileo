# SRSS versus CQC (1981)

Stage: **first-version**. Review rounds: 2 (round 1 Codex and Kimi; round 2 Kimi, Codex and Claude, 2026-10-30). Research, not a design tool.
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
production WASM wrapper. The browser test checks replay/live agreement in all six locales.
The Stabileo scalar-field viewer shows an explicitly labelled axonometric
projection of the actual 3D nodes and bars. Animation scales the displacement
envelope; it is not a mode oscillation or a time history. Stop cancels replay
and pending result publication; this tiny synchronous WASM solve cannot be
interrupted midway. Restart restores the precomputed replay.

## Scope

- The comparison is with the closed form of this two-coordinate example. The
  paper's own building and its numerical tables are not reproduced, and the page
  says so instead of comparing with them.
- No time history: neither rule is measured against a ground-motion record.
- One storey, no torsional response, no parameter sweeps. Not a design check.

The correlation coefficient is the equal-damping form of Wilson, Der Kiureghian
& Bayo (1981), Eq. (14), p. 191; p. 190 explains why cross terms keep their
sign. It assumes equal modal damping, ground motion long compared with the
modal periods, and a broad, smooth spectrum. The reference values are
closed-form results for this example, not data from the paper's Table I.

The 1e-8 relative tolerance is a regression bound for this small,
well-conditioned two-coordinate problem (observed maximum 6.42e-15), not an
accuracy target. Solver agreement with the closed form is not physical accuracy.

The gallery thumbnail is a chart rendered from the replay's base shears, not a
viewer screenshot or a paper figure.

## Open questions

None recorded.

## Review round 2, 2026-10-30

Kimi, Codex and Claude reviewed the live page. What changed:

- Verification block: the reference row shows the 9 of 9 closed-form checks
  from `VALIDATION.json` under "Against the closed form"; the published row says
  in words that the paper's building and tables are not used.
- Citation says "method illustration based on", not "reproduction of".
- The stage label is built from `papers.yaml` `stage` and its review rounds.
- The ρ formula is cited with its assumptions; the tolerance is described as a
  regression bound.
- The modal correlation shown is the engine's own, recovered from its results
  as ρ = (V_CQC² − V_SRSS²)/(2V₁V₂), and tested against the closed form.
- Frequencies, effective masses (equal to the modal base shears for Sa = 1),
  implied ρ, base shears and both roof displacements are asserted at 1e-8 for
  both the replay and the live production WASM run; the SRSS deficit is pinned
  to −18.0183 ± 1e-4. `reference.py` runs in `.github/workflows/research.yml`.
- Roof displacements of nodes 5 and 6 are shown in a table next to the closed form.
- Page, shell strings and route metadata in en, es, pt, de, fr and tr.
- 44 px slider, table text at least 12 px, `role="status"` on the result source,
  Restart respects reduced motion, the duplicated disclaimer and the unused
  `cached` string are removed.
- e2e: 360×900, 390×900, 844×390 and 810×1080, all six locales, viewer inside
  the first viewport, overflow of the document and the app pane, 44 px targets,
  12 px text and keyboard use.
