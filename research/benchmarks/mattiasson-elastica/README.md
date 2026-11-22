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
inextensible analytical model; residual extension contributes at most 0.025%
(`axialExtensionBound`, asserted by `test_elastica.py`).
Each force solve uses 50 Newton iterations, tolerance 1e-8 and 100 increments.
No production engine numerics changed.

Four force references are independently evaluated elliptic integrals, cross-checked
with a SciPy BVP in `engine/tests/research_references/elastica.py`. Nanakorn & Vu
(2006), Table 1, printed p.1245 corroborates them to five decimals; see
`engine/tests/BENCHMARK_REFERENCES.md` for the source link and derivation.
This is not a transcription of Mattiasson's original table.

Both signed tip components must have relative error **strictly below 0.1%**.
The native refinement tests `research_benchmarks::mattiasson_{1,2,5,10}` read
the ceilings 0.0801%, 0.0384%, 0.0281% at 16, 32, 64 elements from
`meshErrorCeilings` in the case file and fail above them; a unit test fails if
any locale states other values. Both components improve on refinement. Separate tests retain A=0.01 and compare it to an extensible-rod BVP,
and check 20 versus 100 load increments. Intermediate loads are response samples.

The moment case retains its original A=0.01 m² and solver settings. M=EI/L=10000
kN·m gives θ=1 rad, u/L=1−sin(1), v/L=cos(1)−1. Native regression asserts signed
rotation and displacement; 16-element errors are below 0.1%. This is a one-radian
arc. Full-circle and frame examples are outside the live page's scope.

## Validation and the published table

`validate.py` reads the fresh native output of this crate (all 21 cases, plus the four
referenced force cases at 16, 32 and 64 elements) and writes `VALIDATION.json`,
`reference-results/published_comparison.json` and `reference-results/MANIFEST.json`; with
`check` it fails when the committed files differ from a fresh run. Its 32 checks: every case
reaches full load; both components of the four force references and the moment case within
0.1% at 16 elements; the 16/32/64-element errors under `meshErrorCeilings` and shrinking with
refinement; RESULTS.json equal to the fresh run.

Mattiasson's own table, PL²/EI = 1…10, u/L and w/L (v/L here) to five decimals, is read from
its reproduction in Nanakorn & Vu (2006), Table 1, p. 1245 (open copy linked above, which
attributes the columns to Mattiasson [23]); `reference-results/mattiasson-table.json` holds the
transcription. The 1981 paper itself was not available to us. Each of the 20 values is a
published row; its tolerance is the 0.1% accuracy target plus half a unit in the fifth decimal
relative to the value, since the table is rounded. All 20 pass at 16 elements; the largest
difference is 0.080% (v/L at PL²/EI = 10). The table gives no tip rotation and no end-moment
results.

The page can rerun all cases live with 16, 32 or 64 elements.

## Measured outcome

All 21 native cases reach full load; all five analytical checks pass. The parity
runner and the unit suite fail unless every case reaches full load and every
analytical check passes, independently of `RESULTS.json`. `RESULTS.json`
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

From the repository root:

```sh
cargo test --locked --release --manifest-path engine/Cargo.toml --test validation mattiasson
cargo test --locked --release --manifest-path engine/Cargo.toml --test validation corotational_benchmarks
cargo run --locked --release --manifest-path research/benchmarks/mattiasson-elastica/Cargo.toml -- "${TMPDIR:-/tmp}/mattiasson-native.json" "${TMPDIR:-/tmp}/mattiasson-mesh.json"
python3 -I research/benchmarks/mattiasson-elastica/validate.py check "${TMPDIR:-/tmp}/mattiasson-native.json" "${TMPDIR:-/tmp}/mattiasson-mesh.json"
node research/benchmarks/mattiasson-elastica/wasm/check.mjs "${TMPDIR:-/tmp}/mattiasson-native.json"
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

## Review round 3 — 2026-10-31

Codex and Grok final review. The page's 16/32/64-element ceilings and the
0.025% extension bound now live in the case file and are read by the native and
SciPy tests; a unit test ties every locale to them. The parity runner and unit
suite require all 21 cases at full load. The slider label keeps the force step
while the moment case is shown, the status line counts accuracy failures, the
evidence link points to this README at the built commit, and E2E covers moment
selection, Stop with seekable computed steps, exported editor settings and pane
overflow. The open questions below stay here, off the live page.

Validation: native Mattiasson filter 9 passed, corotational regressions 13
passed; fresh native/WASM parity all 21 cases at full load, 5/5 checks; SciPy
references passed; unit suite 44 files, 221 tests; TypeScript 247 existing, no
new; Playwright Mattiasson and Research specs 57 passed, Pastrana 4 passed.

## Historical results

The old 1/4 (superseded references) and 3/4 (correct references but A=0.01 and
10 steps) counts are obsolete. Their causes were benchmark model, transcription
and stepping errors, not a demonstrated production solver defect.

## Open questions

- Inspect Mattiasson's original table and establish its exact table/page locator;
  the published rows rest on the Nanakorn & Vu reproduction.
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
