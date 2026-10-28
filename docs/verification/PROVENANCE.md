# Re-check prompt, provenance and reproducibility

Roadmap: "Trust and verification backlog", items 8 and 9 (`docs/roadmap/PRODUCT_ROADMAP.md`).

## Registry of result-affecting changes

`web/src/lib/provenance/result-changes.json` lists every change that makes the same saved model
give different numbers. Each entry has:

| field | meaning |
|---|---|
| `id` | stable identifier |
| `resultsVersion` | the results version that introduced it (an integer, not the app version) |
| `date`, `prs` | when it reached main, and the pull requests |
| `area` | `analysis`, `design` or `loads` |
| `when` | which models it concerns, in feature ids (`any`: one of; `all`: each of; `allOf`: groups that must all hold) |
| `title`, `explanation` | what to tell the engineer, in `en`, `es` and `pt` |
| `changelog` | a file and one of its headings (checked by `registry.test.ts`) |

Feature ids are defined in `web/src/lib/provenance/model-features.ts`, read from the saved
snapshot. When in doubt a feature counts as present: a false "present" shows one notice too many,
a false "absent" hides a change that moved the engineer's numbers. In particular, a steel code
not bound to another code counts as CIRSOC 301, an unbound concrete code as CIRSOC 201, and
analyses a project does not record count as run.

**Adding a change**: add an entry with `resultsVersion` one above the current
`currentResultsVersion` and bump `currentResultsVersion`; changes merged together share the new
version. Never add an entry to a version already on main: every merge to main is deployed and
stamps what it solves with that version, so an entry added to it later is never shown to those
projects. `results-version.test.ts` pins each version's entries and fails on such an addition
(add the new version's set there), and the committed `.ded` fixture's stamp must follow the
bump. `registry.test.ts` fails on unknown features, missing translations or a heading that does
not exist.

The registry is seeded with every behaviour change of the October 2026 safety wave
(`docs/MERGE_PLAN_SAFETY_WAVE.md` section 3) and the earlier BREAKING entries of `CHANGELOG.md`,
all at results version 1 (#328, 2026-10-21). Version 2 holds the fixes merged with 0.3.0 after
that (SA-2026-013 to 017 and 019) and the first entries taken under the rule above (the free-roof
wind minimum and the earth-pressure dead load, #581 and #593); version 3, the column moment sign
(SA-2026-023) and design on unfactored results (SA-2026-024), merged together (#590, #588);
version 4, the design chain (`docs/results-changes/2026-10-design-chain.md`): #460 and #461
reached main without entries and their builds stamped 3, so their changes are told at 4 with
those of #462–#475, which entered with the design switch (#624) in one merge.

## Results snapshot gate

A pull request that changes any result must say so (#716; #461 changed steel verdicts and no
check noticed). A reference corpus (`web/src/lib/results-snapshot/corpus.ts`, 39 cases) is solved
on every pull request and in the merge queue, and compared with its committed snapshots in
`web/results-snapshots/` (one file per case).

**What a case runs.** The project is opened as the app opens it (`modelStore.loadExample`, or a
`.ded` through `deserializeProject`) in its workspace (Basic 2D, Basic 3D or PRO) and solved by
`solveNow` (`actions/solve.ts`), the entry point Calcular, Enter and the ribbon land on, so the
numbers are those after the TypeScript finishing path (`solve-finish.ts`, `solver-service.ts`,
self-weight and combination rules, the results-store publish), not the engine's raw output. With
PRO's design on it then runs the CIRSOC 201 code check (`designRunStore.runCodeCheck`), the
CIRSOC 301 steel check (`runSteelCheck`) and the footing run, and records each member's verdict as
the design table reads it (`verificationStore.memberVerdict`, `getDisplayRatio`); with advanced
analyses, P-Δ, modal, spectral and buckling with the Advanced tab's inputs. Recorded: displacements,
reactions, member forces, shell stresses, per case and per combination; equilibrium flags and the
warning/error diagnostic codes; design verdicts, holds, ratios, required steel, steel limit
states, footing checks; and every refusal with its reason (in English).

**Corpus.** Basic 2D: beams, frames, trusses, hinges, an arch, springs, thermal load, settlement,
CIRSOC load cases and combinations, a seismic case, and a mechanism that must be refused. Basic
3D: frame, space truss, torsion, grillage, braced tower, hinged arch, a building with combinations,
a 2D example in 3D. PRO: membrane shells, slab and wall shells, a mat, P-Δ/modal/spectral/buckling
on two frames. Design: CIRSOC 201 on five RC models (shear row 2, a seismic case, 12
combinations), CIRSOC 301 on three steel models, and an isolated footing on a soil profile. Left
out: the large showcase models (stadiums, towers, bridges, CAD imports, the 408-member flagship),
which run the same paths at a size that would make the snapshot megabytes and the job minutes; the
Basic 2D advanced toolbar; moving loads, time history and the nonlinear analyses; auto-design (a
search with a wall-clock cap, whose answer depends on the machine). The whole corpus runs in about
10 s.

**Tolerance.** Two numbers of one quantity are the same result when
`|a − b| ≤ 1e-6·max(|a|, |b|) + 1e-7·peak`, `peak` being the largest magnitude of that quantity
in the case. One part per million is a thousand times tighter than any engineering difference
(a code's rounding, a 0.1 % load factor); 1e-7 of the peak absorbs values that should be zero and
come out as round-off. The WASM build is bit-for-bit deterministic, so the same build reproduces
the snapshot exactly; what the tolerance absorbs is a refactor that reorders floating-point
operations, whose error is about κ·ε ≈ 1e-8 of the peak on these models (κ up to ~1e8). Strings
and booleans (verdicts, refusals) compare exactly. Not recorded: timings, the build that ran,
residual magnitudes (their pass/fail flags are), the id at which an extreme occurs (a tie on a
symmetric model), mode shapes and participation factors (arbitrary sign), and the worked
explanation text of the checks (their numbers are recorded as numbers). The rule is in
`web/scripts/results-snapshot/compare.mjs`, shared by the test and the gate.

**The gate.** Two steps of the `Results Snapshot` job, required through CI OK:

1. `make test.web.results`: the corpus must give the committed snapshots; a difference fails
   with each moved value, before → after, and the percentage.
2. `make check.results-snapshot-gate BASE=<base>` (pull requests and the merge queue): if the
   pull request changes or deletes a committed snapshot (beyond the tolerance), it must also add
   an entry to `result-changes.json` (a change id the base does not have) and a `changelog.d/`
   fragment under `### BREAKING (results)`. A new case or a new recorded quantity is not a change.

**A deliberate change**: `make snapshots-update` (or `cd web && npm run snapshots:update`)
rewrites the snapshots, keeping every value still within the tolerance as committed so the diff
is only what moved; then add the registry entry ("Adding a change" above) and the fragment.
Adding a case: add it to `corpus.ts` and run the same command.

The negative case (#451) is `results-snapshot/__tests__/negative.test.ts`: a 1 % change to a
corpus case is reported value by value, and the gate fails it without a registry entry, with only
a fragment, or with a fragment in another section, and passes it with both.
`web/scripts/__tests__/results-snapshot.test.ts` covers the tolerance and the decision.

In Node the worker pool is not available and the combinations are solved by the sequential
fallback (`solveCombinations3DParallel`), on the same WASM bytes as the workers.

## Solve stamps and the re-check prompt

Every project snapshot carries `solvedWith` (`provenance/solve-stamp.ts`): results version,
results schema version, app version, web commit, engine version, WASM hash, solve time and the
analyses run. It rides on the snapshot, so `.ded`, session files, autosave and tabs all carry it.
It is adopted on open (never by undo) and replaced by every solve. A new project gets the current
version. A project without a stamp (saved before stamps existed) reads as version 0.

On opening a project (`.ded`, tab, autosave, share link: `onProjectOpened` in `store/file.ts`),
`store/recheck.svelte.ts` lists the registered changes after its version that concern its features.
If there are any:

- a notice lists them (title, explanation in the reader's language, link to the write-up). It has
  no close button, ignores Escape and outside clicks, and is dismissed only by ticking
  "I have read these changes" and choosing "Continue" or "Re-run analysis and design";
- the results are **stale** until the model is solved again in this build: a banner says so, and
  every report, workbook and CSV prints a STALE warning in its provenance;
- "Re-run analysis and design" runs the manual solve, then (PRO) the RC code check over the
  provided reinforcement. It does not auto-design, which would overwrite reinforcement the
  engineer chose.

Acknowledgement is per stamp and per session: reopening the file in a new session asks again.
A project solved with a newer version than the build opening it is flagged as `newer`.

## Provenance of results and reports

`provenance/result-provenance.ts` (pure) and `store/result-provenance.ts` (gathered from the live
stores) build the record printed by the calc report, the PRO report, the workbook cover and the
CSV export:

| field | |
|---|---|
| `appVersion`, `commit` | web build (`vite.config.ts`) |
| `engineVersion`, `engineCommit` | the engine's `engine_build_info()` |
| `wasmHash` | SHA-256 of the WASM bytes the app initialised (the worker pool runs the same bytes) |
| `resultsVersion`, `resultsSchemaVersion` | registry version |
| `modelHash` | SHA-256 of the exact canonical JSON of the model, without what cannot move a number (name, title block, notes, views, grid, export record, stamps, revision counters, detailing drawings) |
| `settings`, `settingsHash` | workspace, self-weight and its case, axis convention, drawing plane |
| `scope`, `resultsHash`, `baseResultsHash` | the result shown and the base solve, timings excluded |
| `baseSolveMethod` | `direct` for an all-loads solve, `case-superposition` for a base result assembled from case solves; reproduction preserves this arithmetic |
| `analysisInputHash` | independent analysis inputs, where present; a moving-load sweep includes its unloaded solver model, paths, trains and position step |
| `engineInputSha256`, `engineResultsSha256` | the engine's own hashes of the base linear solve (`engine/src/reproduce.rs`), computed as a worker job once per base solve and cached (`ensureEngineHashes`); building a record never solves, exports await the job. With combinations, live calc puts the base result together from the case solves; the engine hashes are then of a direct single solve of the same model (`linearSolveInput3D`), which is what the CLI reproduces |
| `certificates` | status and hash of the certificate of the result the record names (base solve, case, combination or envelope: `certificateStore.forScope`), where certified |
| `stale`, `solvedWith` | see above |

Hashes are SHA-256 of canonical JSON that keeps every bit (`provenance/exact-hash.ts`): keys sorted,
numbers in their shortest round-trip form, `-0`, `NaN` and infinities spelled out.

An async export (calc report, PRO report, workbook, CSV zip) captures what it is taken from
when it starts (model version and content hash, results on screen, base solve, scope, solve
stamp) and checks it again after the engine hashes are awaited (`provenanceForExport`). If the
project moved meanwhile (an edit, another project, another solve or view), nothing is exported
and the reader is told to export again: a report never carries one state's numbers under
another state's provenance.

The moving-load panel captures its model and settings before the sweep, then hashes the resulting
envelope. Its CSV uses that record, with `scopeRef: { kind: "other", label: "moving-load envelope" }`,
no static base-result hash, engine hashes, certificates or solve stamp. A project or settings edit
marks the export STALE while preserving the model and settings actually used. Static reproduction
cannot replay a sweep and reports an incomplete comparison.

The HTML reports embed the record as `<script type="application/json" id="stabileo-provenance">`.

## Reproducing a report

- **App**: Project → "Reproduce from provenance…" (Básico project panel, PRO Project tab). Paste
  the report's block or load the saved report. The open project is solved again and its model,
  settings and results hashes are compared; a differing build is named, since a difference may be
  a registered change rather than a defect. The record names the result the report showed
  (`scopeRef`: base solve, case, combination, envelope, or `other` for an advanced analysis on
  screen), and the re-run recomputes exactly that result, whatever the screen now shows. The
  verdict is `reproduced` only when every hash the report claims was recomputed and matches;
  `differs` when one does not; `incomplete` when one could not be recomputed (a named envelope not
  on screen, an advanced analysis, a combination or case that does not exist, a record written
  before scopes were recorded). Incomplete is never shown as success.
  Every hash the record claims is compared, not a fixed list: model, settings, base and shown
  results, the engine's input and result hashes, each certificate (one still being computed
  counts as missing), and any other `…Hash` / `…Sha256` field, so a field added later cannot be
  silently ignored. Only `wasmHash` names the build rather than the answer: a different build is
  reported beside the verdict, not counted as a difference.
  For records carrying `baseSolveMethod`, the re-run uses the original direct or case-summed
  computation. This matters even for linear models: the two paths can differ in their last bits
  and result diagnostics. Older records without that field retain the global solve's default.

Every export opens its provenance with a status line (`provenanceTextLines`): STALE when the
project's results predate registered changes, else current. The calc and PRO reports (HTML, and
so their print/PDF view), the CSV and the workbook cover all print it. "Download solver input" saves the base solve's engine
  input.
- **CLI**: `cargo run --release --example reproduce -- solver-input-3d.json --expect-input <engineInputSha256> --expect-results <engineResultsSha256>`
  solves twice natively, checks the run is deterministic and that both hashes match; exit 1 otherwise.

## Determinism

The same model solved twice, and on the worker vs the main thread, must give bit-identical
results. Tests: `engine/tests/determinism.rs` (random 2D/3D models, with constraints, and modal,
buckling and P-Delta: each JSON parsed six times and solved, results compared as text),
`web/src/lib/store/__tests__/result-provenance.test.ts` (two solves in the app, engine hashes),
`web/e2e/recheck-provenance.spec.ts` (worker vs main thread, reproduce dialog).

Findings (all fixed on this branch; before the fix two solves of the same model in one app session
could differ):

- **Solver inputs iterated in random order.** Inputs keep nodes, elements, supports, plates, …
  in `HashMap<String, _>`, and every `HashMap` gets its own random hash keys, so the same JSON
  parsed twice iterates in two orders. The 3D dense/sparse assemblers already sorted elements by id,
  but the 2D assemblers, the load and support loops and most other analyses did not: 2D
  displacements differed in the last bits from one solve to the next, and 3D plate stresses came
  out in a different order. Every loop over an input map now goes through
  `crate::ordered::values` (key order), 587 sites engine-wide.
- **Equilibrium sums** (`equilibrium.appliedForceSum`, `reactionForceSum`) iterated
  `DofNumbering::map`, a `HashMap`; they now use `DofNumbering::entries_by_dof()`.
- **Inclined-support triplets** were emitted from `HashMap`s of cross terms; the sparse CSC
  conversion sums duplicate triplets in emission order, so models with inclined supports solved
  differently in the last bits. Now emitted in key order (`crate::ordered::entries`).
- **Diagnostic order**: truss-only node warnings, conflicting-constraint warnings and the
  rigid-body-mode warnings came out in hash order; now in id order.

Rule: a loop over a `HashMap`/`HashSet` whose order reaches a floating-point sum, a triplet list
or an output list must iterate `crate::ordered::{values, entries, members}`.
`tests/determinism.rs` catches a regression on random models.

- Parallel assembly (`rayon`, the `parallel` feature) is not compiled into the WASM build, so the
  app has no parallel reductions; the worker and the main thread run the same single-threaded
  binary.
- Native vs WASM: on the braced 3D frame of `result-provenance.test.ts`, the native CLI reproduced
  the browser's engine input and result hashes bit for bit. Transcendental functions come from the
  platform's math library natively and from Rust's own in WASM, so a model whose assembly uses them
  in a way the two libraries round differently could still differ in the last bit between the CLI
  and the browser; the in-app reproduce compares WASM against WASM.
