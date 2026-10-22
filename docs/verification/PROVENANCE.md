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
that (SA-2026-013 to 017 and 019); version 3, the column moment sign (SA-2026-021).

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
