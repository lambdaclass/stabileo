# First-version verification — 2026-10-29

Stage: `first-version`. Reviews: 0. No git write commands; no engine/src changes;
no production numerics or tolerance changes.

## Example and numbers

Fixed-base 4 m × 3 m portal, uniform Mp = 100 kN m, proportional H = 1 kN
at the left roof corner and V = 2 kN at midspan. Production 3D plastic-collapse
solver; 2D is not invoked. This is our textbook-style geometry, not a claimed
numbered textbook figure reproduction.

| Mechanism | Hand λ | Stabileo λ | Stabileo − hand |
|---|---:|---:|---:|
| Beam | 100 | 85.71428571427153 | -14.285714285728 |
| Sway | 133.33333333333334 | 85.71428571427153 | -47.619047619062 |
| Combined (governing) | 85.71428571428571 | 85.71428571427153 | -1.4182433005772e-11 |

The other mechanisms are higher upper bounds, so their differences are expected.
Native engine: mechanism true, warnings empty, absolute tolerance 1e-6.

## Checks actually run

- Native integration test reading the shared JSON: passed, including mechanism and warning assertions.
- Production WASM rebuilt from this checkout: passed. Seven new TS tests, including
  the real production WASM wrapper against the replay: passed.
- Hardcoded-text guard: an initial literal publisher label failed; moved to all
  three research dictionaries. Final targeted run: 3 files, 10 tests passed.
- `research/tools/check_isolation.sh`: passed.
- `python3 -I research/tools/test_catalog.py`: passed (temporary venv with PyYAML).
- `catalog.py export` and `catalog.py check --offline`: passed, 23 papers, 0 problems.
- Citation verified online using the catalogue checker's `check_crossref`; stored in citation.json.
- `nix develop -c make typecheck.web` (temporary writable Nix cache; nested Nix
  invocation disabled inside the shell): passed. TypeScript baseline 247 / reported
  247; Svelte guarded paths passed; shared site header passed. Final edited Svelte
  components also compiled directly; only the pre-existing shell actions warning remains.
- Full `make test.web.unit`: completed, **not green**. 17 files failed, 1276 passed,
  2 skipped; 29 tests failed, 15801 passed, 48 skipped; two worker `onTaskUpdate`
  RPC timeouts. One failure was our publisher label and is fixed with a passing
  targeted rerun. The other failing files below are unchanged. No baseline run was
  made to establish whether every remaining failure predates this change.
- Playwright discovers the 360/390/810 px smoke tests. Actual browser verification
  could not run: Chromium exits with macOS MachPortRendezvousServer bootstrap
  permission denied; the browser-control host is unavailable too. No visual or
  responsive pass is claimed.
- `git diff --check`: passed.

## Remaining full-suite failures in unchanged files

- `src/lib/engine/__tests__/advanced-sweep-2d.test.ts`
- `src/lib/engine/__tests__/variable-section-edits.test.ts`
- `src/lib/engine/design/__tests__/autodesign-regression.test.ts`
- `src/lib/engine/detailing/__tests__/beam-emptiness-diagnostic.test.ts`
- `src/lib/engine/detailing/__tests__/beam-reinforcement-audit.test.ts`
- `src/lib/engine/detailing/__tests__/provisional-projections.test.ts`
- `src/lib/engine/detailing/__tests__/top-steel-projections.test.ts`
- `src/lib/engine/detailing/__tests__/torsion-notice.test.ts`
- `src/lib/engine/generators/__tests__/variable-generated.test.ts`
- `src/lib/export/__tests__/design-families-report.test.ts`
- `src/lib/export/__tests__/design-families-same-steel.test.ts`
- `src/lib/export/__tests__/scene-completeness.test.ts`
- `src/lib/model/edit/__tests__/taper.test.ts`
- `src/lib/store/__tests__/detailing-flagship-repair.test.ts`
- `src/lib/store/__tests__/slab-column-footprint-reference.test.ts`
- `src/lib/store/__tests__/steel-optimise-variable-end.test.ts`

## Not yet

- Independent reviews (0).
- Numbered textbook figure or experimental validation.
- Other load ratios, sections, axial interaction, buckling or large displacements.
- 2D plastic collapse while the reported issue #758 containment applies.
- Plastic hinge symbols and curved member deformation.
- Executed browser/responsive verification in an environment that can launch Chromium.

The gallery SVG is drawn from the recorded production nodal displacement increments
(summed, ×10), with the undeformed geometry behind it; it is not a paper figure.

The requested `origin/research/engine-benchmarks-macneal-harder` ref was absent.
Read-only inspection used the existing neighbouring `stabileo-research-benchmarks`
checkout's JSON, Rust and macneal1985 components instead. No fetch or git mutation.

## Files

- `changelog.d/research-plastic-collapse.md`
- `engine/tests/benchmarks/plastic_collapse.json`
- `engine/tests/benchmarks/plastic_collapse.rs`
- `engine/tests/integration/main.rs`
- `research/README.md`
- `research/benchmarks/plastic-collapse/README.md`
- `research/benchmarks/plastic-collapse/VERIFICATION.md`
- `research/benchmarks/plastic-collapse/citation.json`
- `research/benchmarks/plastic-collapse/results/stabileo_results.json`
- `research/papers.json`
- `research/papers.yaml`
- `web/e2e/research-plastic-collapse.spec.ts`
- `web/public/research-thumbs/plastic-collapse.svg`
- `web/src/components/research/Gallery.svelte`
- `web/src/components/research/ResearchPage.svelte`
- `web/src/components/research/experiments.ts`
- `web/src/components/research/plastic-collapse/PlasticPage.svelte`
- `web/src/components/research/plastic-collapse/case.test.ts`
- `web/src/components/research/plastic-collapse/case.ts`
- `web/src/components/research/plastic-collapse/i18n.ts`
- `web/src/components/research/plastic-collapse/live.test.ts`
- `web/src/components/research/shell/ExperimentShell.svelte`
