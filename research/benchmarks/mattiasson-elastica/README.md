# Mattiasson elastica: production engine benchmark

Route: `/research/benchmarks/mattiasson-elastica`.

Mattiasson, K. (1981), “Numerical results from large deflection beam and frame
problems analysed by means of elliptic integrals”, IJNME 17, 145–153.
DOI: https://doi.org/10.1002/nme.1620170113.

## Model and reference provenance

The sole live case definition is `engine/tests/benchmarks/mattiasson_elastica.json`.
Twenty independent downward dead-force solves cover q=PL²/EI=0.5…10.
L=2 m, 16 Euler–Bernoulli frame elements, full root clamp, E=200000 MPa,
I=0.0001 m⁴, A=1 m², P=5000q kN. The increased area approximates the
inextensible analytical model; residual extension contributes at most 0.025%.
Each force solve uses 50 Newton iterations, tolerance 1e-8 and 100 increments.
No production engine numerics changed.

Four force references are independently evaluated elliptic integrals, cross-checked
with a SciPy BVP in `engine/tests/research_references/elastica.py`. Nanakorn & Vu
(2006), Table 1, printed p.1245 corroborates them to five decimals; see
`engine/tests/BENCHMARK_REFERENCES.md` for the source link and derivation.
This is not a transcription of Mattiasson's original table.

Both signed tip components must have relative error **strictly below 0.1%**.
The existing same-model native refinement tests now enforce the measured bounds
0.0801%, 0.0384%, 0.0281% at 16, 32, 64 elements. Both components improve on
refinement. Separate tests retain A=0.01 and compare it to an extensible-rod BVP,
and check 20 versus 100 load increments. Intermediate loads are response samples.

The moment case retains its original A=0.01 m² and solver settings. M=EI/L=10000
kN·m gives θ=1 rad, u/L=1−sin(1), v/L=cos(1)−1. Native regression asserts signed
rotation and displacement; 16-element errors are below 0.1%. This is a one-radian
arc. Full-circle and frame examples are outside the live page's scope.

## Measured outcome

All 21 native cases reach full load; all five analytical checks pass. `RESULTS.json`
is regenerated from the current native inputs. The research parity runner compares every stored u/L,
v/L, error, reference, classification and source with a fresh WASM solve, and
compares every nodal displacement and rotation with fresh native output.

| Case | Reference u/L, v/L | Computed u/L, v/L | Errors (%) |
|---|---|---|---|
| force-1 | 0.056433236283, 0.301720773800 | 0.056390264074, 0.301755822611 | 0.076147, 0.011616 |
| force-2 | 0.160641720825, 0.493457480397 | 0.160559370911, 0.493598617081 | 0.051263, 0.028602 |
| force-5 | 0.387628360724, 0.713791523612 | 0.387554506869, 0.714191009969 | 0.019053, 0.055967 |
| force-10 | 0.554995597754, 0.810609024880 | 0.554951581718, 0.811257540585 | 0.007931, 0.080004 |
| moment-1 | 0.158529015192, -0.459697694132 | 0.158392041418, -0.459772523245 | 0.086403, 0.016278 |

## Reproduction

From the repository root (Cargo runs use
`CARGO_TARGET_DIR=/private/tmp/claude-501/rfix-mattiasson-target CARGO_BUILD_JOBS=4`):

```sh
cargo test --locked --release --manifest-path engine/Cargo.toml --test validation mattiasson
cargo test --locked --release --manifest-path engine/Cargo.toml --test validation corotational_benchmarks
cargo run --locked --release --manifest-path research/benchmarks/mattiasson-elastica/Cargo.toml -- /private/tmp/mattiasson-native.json
node research/benchmarks/mattiasson-elastica/wasm/check.mjs /private/tmp/mattiasson-native.json
python3 -I research/tools/catalog.py check --offline
python -m unittest discover -s engine/tests/research_references -p test_elastica.py
```

From `web/`:

```sh
npx vitest run --project unit src/components/research src/lib/i18n/__tests__/hardcoded-text.test.ts
npm run typecheck
```

The browser recomputes results; it does not load RESULTS.json. Stop acts between
synchronous solves; computed steps remain seekable and playable. The editor
receives geometry and loads with self-weight and automatic solve disabled; select
corotational analysis to reproduce the solve.

## Review round 2 — 2026-10-30

Kimi → Codex → Claude consolidated verified findings. Corrected area and stepping,
tightened the comparison, added moment accuracy and input/sign/boundary/evidence
checks, aligned six locales and provenance, repaired playback, compacted the
viewer layout and enlarged targets/text. E2E covers four viewport sizes and all
six locales; Playwright cannot run in this environment.

## Historical results

The old 1/4 (superseded references) and 3/4 (correct references but A=0.01 and
10 steps) counts are obsolete. Their causes were benchmark model, transcription
and stepping errors, not a demonstrated production solver defect.

## Open questions

- Inspect Mattiasson's original table and establish its exact table/page locator
  before claiming a direct transcription. Current comparisons use independent
  analytical references corroborated by the secondary table.
- Full-circle and frame problems would require separate models and evidence.

## Validation of this revision

- Unit suite: 42 files, 198 tests passed, including the hard-coded-text guard.
- Native Mattiasson filter: 9 tests passed (including the benchmark protocol).
- Native corotational regressions: 13 tests passed.
- Fresh native/WASM parity and stored evidence consistency: all 21 cases passed.
- Independent SciPy BVP: all four force references agree within 1e-11; the
  A=1 residual-extension bound and BVP tolerance independence pass.
- TypeScript baseline gate: no new errors (247 existing).
- Catalogue offline check: 48 papers, zero problems. Research isolation passed.
- Svelte check: no diagnostics in the changed components; repository-wide
  existing diagnostics remain. Playwright was not run.
