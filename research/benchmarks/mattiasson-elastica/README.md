# Mattiasson elastica: production engine benchmark

Route: `/research/benchmarks/mattiasson-elastica`. Status: **proposed**.

Mattiasson, K. (1981), “Numerical results from large deflection beam and frame
problems analysed by means of elliptic integrals”, International Journal for
Numerical Methods in Engineering 17, 145–153.
DOI: https://doi.org/10.1002/nme.1620170113.
Title, author, year and venue verified using `catalog.py show` and the online
catalogue check on 2026-10-29. No paper summary is claimed. Numerical transcription
and table/page provenance have not been verified against the paper text.

## Cases and provenance

`engine/tests/benchmarks/mattiasson_elastica.json` is the sole case definition.
The native end-moment regression test reads its `moment-1` entry; all its original
assertions and solver settings are preserved. The native runner here calls only
`dedaliano_engine::solver::corotational::solve_corotational_2d`. It is an adapter,
not a research solver. The browser calls `wasm-solver.solveCorotational2D`.

The 20 tip-force steps (PL²/EI = 0.5, 1, …, 10) adapt the existing end-moment
cantilever: L = 2 m, 16 frame elements, E = 200000 MPa, A = 0.01 m²,
I = 0.0001 m⁴, full root clamp, downward dead load. This is an extensible frame
model, not an independently evaluated inextensible elliptic-integral solution.
The four reference pairs below are unchanged from `BENCHMARK_REFERENCES.md`,
“Mattiasson Elastica”, which explicitly requires checking the original paper.

| PL²/EI | u/L | v/L |
|---:|---:|---:|
| 1 | 0.0566 | 0.3015 |
| 2 | 0.1632 | 0.4929 |
| 5 | 0.4054 | 0.6647 |
| 10 | 0.5584 | 0.6854 |

The page reports a provisional pass only if **both signed** normalized tip
components have relative error strictly below 2%. This is a new exploratory page
accuracy target, not a change to any existing assertion, tolerance or regression
floor. Missing/nonfinite displacements, nonconvergence and partial load factors
are failures. Steps without references receive no accuracy classification.
The original 5% small-load linear comparison remains a separate native assertion.

The moment case has ML/EI = 1, M = 10000 kN·m. It is a convergence/rotation
regression, with no claimed exact accuracy or full-circle solution.

The browser runs on load and Run again. Playback uses only fresh browser results,
loops on desktop, stops on interaction, pauses offscreen/hidden, runs once on small
screens and stays still under reduced motion. Stop cancels between synchronous
WASM solves. No reference shape or fabricated replay is drawn. Open in Stabileo
uses the existing share/import format with self-weight and automatic solve off;
the user must select corotational analysis in the editor.

## Verification

From `engine/`:

```
nix develop .. -c cargo test --locked --release --test validation corotational_benchmarks
nix develop .. -c cargo test --locked --release --test shells macneal_harder
```

From the repository root:

```
make wasm
nix develop -c cargo run --locked --release --manifest-path research/benchmarks/mattiasson-elastica/Cargo.toml -- /tmp/mattiasson-native.json
nix develop -c node research/benchmarks/mattiasson-elastica/wasm/check.mjs /tmp/mattiasson-native.json
research/tools/check_isolation.sh
python3 -I research/tools/catalog.py check --offline
nix develop -c make typecheck.web
```

From `web/`:

```
nix develop .. -c npx vitest run src/components/research/mattiasson1981/__tests__/cases.test.ts
```

The parity checker compares success/failure, accuracy classifications, both tip
measurements and every nodal displacement/rotation with fresh native output.
`web/e2e/research-mattiasson.spec.ts` covers real results, stopping autoplay and
editor handoff; Chromium was not launched during implementation.

## Open questions

- Obtain the original numerical table, confirm load convention and all four pairs.
- Separate transcription errors, axial extensibility, mesh discretization and
  solver accuracy before diagnosing discrepancies. Record solver-owner triage in
  the test-owned findings ledger; no runtime issue identifier is implied.
- Full-circle moment loading is outside the existing native regression evidence.

## Measured outcome

Fresh native and production WASM agree for all 21 cases. Eighteen reach the
requested load, including the moment case. Force parameters 7.5, 9.5 and 10 fail
to converge. The provisional reference comparison is 1/4 passing. All computed
numbers, sources and classifications are in `RESULTS.json`; the browser does not
load that report. The findings table is in
`engine/tests/benchmarks/KNOWN_ISSUES.md#MATTIASSON-REFERENCE-AND-ACCURACY`.

Native tests: 13 corotational + 2 selected shell tests passed. New Vitest tests:
4 passed. Production WASM/native parity, isolation, viewer rule, online/offline
catalogue checks and `make typecheck.web` passed. Typecheck retains the existing
repository baseline. E2E was written but not executed (no Chromium launch).

## Files

- `engine/tests/benchmarks/mattiasson_elastica.json`: shared inputs and references.
- `engine/tests/benchmarks/KNOWN_ISSUES.md`: accuracy and provenance findings.
- `engine/tests/validation/benchmarks/corotational_benchmarks_extended.rs`: input-only refactor, retaining assertions.
- `research/benchmarks/mattiasson-elastica/{Cargo.toml,Cargo.lock,src/main.rs}`: native production-engine adapter.
- `research/benchmarks/mattiasson-elastica/wasm/check.mjs`: native/WASM parity check.
- `research/benchmarks/mattiasson-elastica/{README.md,RESULTS.json}`: reproduction instructions and computed report.
- `research/{README.md,papers.yaml,papers.json}`: documentation and proposed catalogue entry.
- `web/src/components/research/mattiasson1981/{MattiassonPage.svelte,Curves.svelte,cases.ts,editor.ts,i18n.ts,__tests__/cases.test.ts}`: live page, plots, runner, handoff, locales and tests.
- `web/src/components/research/{ResearchPage.svelte,experiments.ts}`: route and gallery.
- `web/e2e/research-mattiasson.spec.ts`: browser spec, not executed locally.
- `.github/workflows/research.yml`: hosted native/WASM checks.
